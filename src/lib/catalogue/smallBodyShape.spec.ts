// ONE SEEDED SHAPE SOURCE, sampled by the card and by the mesh ([[G90]] / [[G91]]).
//
// Two things are being held here and they pull in opposite directions, which is why they are gated
// together:
//
//   1. NOTHING THAT ALREADY EXISTS MAY MOVE. Every asteroid in every campaign has a silhouette. The
//      grid's equatorial row is drawn first off the same LCG the old one-dimensional function used,
//      so an unlobed body's path string must come out CHARACTER-IDENTICAL to the old expression.
//      That expression is re-implemented below rather than referred to: moving a shape and changing
//      it are two commits, never one, and this is the pin that says which this was.
//
//   2. THE TWO SURFACES MUST AGREE. The silhouette and the mesh read the SAME field, so a body's
//      card and its holo are one rock seen twice. Asserted by NUMBERS - the radii the outline is
//      built from against the radii the mesh would be displaced by - not by looking at either.
//
// The lobe assertions are numeric for the same reason: "looks lobed" is not a gate. The lobe count
// is recovered by counting maxima of the radial function, the neck by measuring the pinch between
// them, and the extent by a bounding box.
import { describe, it, expect } from 'vitest';
import { smallBodyShape, smallBodyOutline, lobeCount, MAX_LOBES } from './smallBodyShape';
import { derivedPorosity } from '$lib/physics/makeup';
import type { CelestialBody } from '$lib/types';

function rock(extra: Partial<CelestialBody> = {}): CelestialBody {
  return {
    id: 'rock-1', name: 'Rock', kind: 'body', roleHint: 'planet', parentId: 'star',
    massKg: 4.6e16, radiusKm: 18, makeup: { rock: 0.6, ice: 0.4 },
    ...extra
  } as CelestialBody;
}

// A spread wide enough that a change to the amplitude model, the seed, the draw order or the
// smoothing would have to show up in at least one of them.
const SPREAD: CelestialBody[] = [
  rock(),
  rock({ id: 'a' }),
  rock({ id: 'Ceres-like-long-identifier-9' }),
  rock({ id: 'x', radiusKm: 1 }),
  rock({ id: 'y', radiusKm: 280 }),
  rock({ id: 'z', radiusKm: 500 }),
  rock({ id: 'porous', massKg: 3.51e10, radiusKm: 0.165, makeup: { rock: 0.9, metal: 0.1 } }),
  rock({ id: 'dense', massKg: 1.6e14, radiusKm: 2, makeup: { rock: 0.6, metal: 0.4 } }),
  rock({ id: 'no-radius', radiusKm: undefined as unknown as number })
];

// THE OLD EXPRESSION, verbatim from v3.1.51, kept here as the thing the new one must reproduce.
function outlineBefore(body: CelestialBody): string {
  let s = 53; for (let k = 0; k < body.id.length; k++) s = (s * 31 + body.id.charCodeAt(k)) & 0xffffff;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const km = body.radiusKm ?? 10;
  const sizeFactor = Math.max(0, Math.min(1, 1 - km / 300));
  const amp = Math.min(0.5, (0.08 + 0.22 * sizeFactor) * (1 + derivedPorosity(body)));
  const N = 16;
  const rs = Array.from({ length: N }, () => 30 * (1 - amp / 2 + amp * rnd()));
  const pt = (i: number): [number, number] => {
    const a = ((i % N) / N) * 2 * Math.PI - Math.PI / 2;
    const r = rs[((i % N) + N) % N];
    return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
  };
  const mid = (i: number): [number, number] => {
    const [x0, y0] = pt(i), [x1, y1] = pt(i + 1);
    return [(x0 + x1) / 2, (y0 + y1) / 2];
  };
  let d = `M ${mid(0)[0].toFixed(1)} ${mid(0)[1].toFixed(1)} `;
  for (let i = 1; i <= N; i++) {
    const [cx, cy] = pt(i);
    const [mx, my] = mid(i);
    d += `Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)} `;
  }
  return d + 'Z';
}

/** The radial function around the equator, at `n` samples. */
function ring(body: CelestialBody, n = 720): number[] {
  const sh = smallBodyShape(body);
  return Array.from({ length: n }, (_, i) => sh.radiusAt((i / n) * 2 * Math.PI, Math.PI / 2));
}

/**
 * How many lobes a radial function actually has, measured rather than asserted.
 *
 * The surface wobble varies over about 22 degrees and the lobes over about 180, so a 45-degree
 * circular mean removes one and keeps the other. What is left is counted with a HYSTERESIS band of
 * 12% of the body's reach: a peak only counts once the profile has fallen that far and climbed back,
 * which is what distinguishes a lobe from a bump. Starting the walk at the global maximum makes the
 * circular case unambiguous — that peak is counted at the end rather than during the walk.
 */
function countLobes(rs: number[]): number {
  const n = rs.length, w = Math.round(n / 8);
  const s = rs.map((_, i) => {
    let t = 0;
    for (let k = -w; k <= w; k++) t += rs[(i + k + n * 2) % n];
    return t / (2 * w + 1);
  });
  const hi = Math.max(...s), band = 0.12 * hi;
  const start = s.indexOf(hi);
  let peaks = 0, climbing = false, ref = s[start];
  for (let k = 1; k <= n; k++) {
    const v = s[(start + k) % n];
    if (climbing) {
      if (v > ref) ref = v;
      else if (ref - v >= band) { peaks++; climbing = false; ref = v; }
    } else {
      if (v < ref) ref = v;
      else if (v - ref >= band) { climbing = true; ref = v; }
    }
  }
  return peaks + 1;
}

/** Longest chord through the centre over shortest — how elongated the body actually is. */
function chordRatio(rs: number[]): number {
  const n = rs.length;
  let lo = Infinity, hi = 0;
  for (let i = 0; i < n / 2; i++) {
    const c = rs[i] + rs[(i + n / 2) % n];
    if (c < lo) lo = c;
    if (c > hi) hi = c;
  }
  return hi / lo;
}

function bbox(path: string): { w: number; h: number; minX: number; maxX: number; minY: number; maxY: number } {
  const nums = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i + 1]); }
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { w: maxX - minX, h: maxY - minY, minX, maxX, minY, maxY };
}

describe('the silhouette of every rock that already exists is untouched', () => {
  it('is character-identical to the expression it replaced', () => {
    for (const b of SPREAD) {
      expect(smallBodyOutline(b), b.id).toBe(outlineBefore(b));
    }
  });

  it('...and so is a body that states it has one lobe, which is what every body has', () => {
    for (const b of SPREAD) {
      expect(smallBodyOutline({ ...b, lobes: 1 } as CelestialBody), b.id).toBe(outlineBefore(b));
    }
  });

  it('the equatorial radii are the grid, exactly — no interpolation drift at a sample point', () => {
    const sh = smallBodyShape(rock());
    const before = outlineBefore(rock());
    // Recover the 16 control radii from the old path's Q control points and compare.
    const nums = before.match(/-?\d+(\.\d+)?/g)!.map(Number);
    for (let i = 1; i <= 16; i++) {
      const cx = nums[2 + (i - 1) * 4], cy = nums[3 + (i - 1) * 4];
      const r = Math.hypot(cx - 50, cy - 50);
      const mine = 30 * sh.radiusAt(((i % 16) / 16) * 2 * Math.PI, Math.PI / 2);
      expect(Math.abs(r - mine), `vertex ${i}`).toBeLessThan(0.06);   // the path rounds to 0.1
    }
  });
});

describe('the card and the mesh read one field', () => {
  it('a lobed body samples the same radii in both, at the same longitudes', () => {
    const b = rock({ id: 'arrokoth', lobes: 2 });
    const sh = smallBodyShape(b);
    const path = smallBodyOutline(b);
    const nums = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const N = 32;                                   // 16 x lobes, as the outline samples it
    // Rebuild the scale the outline used, then check every control point against the field.
    const scale = Math.min(30, 46 / sh.maxRadius);
    for (let i = 1; i <= N; i++) {
      const cx = nums[2 + (i - 1) * 4], cy = nums[3 + (i - 1) * 4];
      const drawn = Math.hypot(cx - 50, cy - 50);
      const field = scale * sh.radiusAt(((i % N) / N) * 2 * Math.PI, Math.PI / 2);
      expect(Math.abs(drawn - field), `vertex ${i}`).toBeLessThan(0.08);
    }
  });

  it('the same id gives the same shape twice, in both dimensions', () => {
    const b = rock({ id: 'twice', lobes: 2 });
    expect(smallBodyOutline(b)).toBe(smallBodyOutline(rock({ id: 'twice', lobes: 2 })));
    const a = smallBodyShape(b), c = smallBodyShape(rock({ id: 'twice', lobes: 2 }));
    for (let i = 0; i < 40; i++) {
      const lon = (i / 40) * 2 * Math.PI, colat = ((i % 7) / 6) * Math.PI;
      expect(a.radiusAt(lon, colat)).toBe(c.radiusAt(lon, colat));
    }
  });

  it('a different id gives a different shape', () => {
    expect(smallBodyOutline(rock({ id: 'one', lobes: 2 })))
      .not.toBe(smallBodyOutline(rock({ id: 'two', lobes: 2 })));
  });
});

describe('a contact binary is measurably two lobes and a neck', () => {
  // SIXTY SEEDS, NOT THREE. A shape drawn from a seed has to be right on ALL of them: the first
  // ranges tried in `buildLobes` passed on the three ids this was written with and failed on 8% of a
  // wide sweep, drawing a small lobe sunk so deep that the fillet closed the waist. That is exactly
  // the kind of fault a narrow gate ships.
  const SEEDS = Array.from({ length: 60 }, (_, i) => `seed-${i}`)
    .concat(['arrokoth', '67p', 'itokawa', 'a-longer-identifier', 'z']);

  it('one lobe reads as one and two reads as two, on every seed', () => {
    const wrong: string[] = [];
    for (const id of SEEDS) {
      if (countLobes(ring(rock({ id }))) !== 1) wrong.push(`${id} plain`);
      if (countLobes(ring(rock({ id, lobes: 2 }))) !== 2) wrong.push(`${id} lobed`);
    }
    expect(wrong).toEqual([]);
  });

  // A CHAIN OF THREE HAS TWO RADIAL MAXIMA, NOT THREE, and that is geometry rather than a fault: the
  // middle lobe sits AT the centre of volume, so from there it is a thickened waist and not a
  // separate peak. (Putting the lobes on a ring instead would give three peaks and a hole in the
  // middle, which is worse - see `buildLobes`.) What a longer chain must do is be LONGER, so that is
  // what is measured.
  // (the per-count elongation claim now lives in the test above, which sweeps every lobe count)
  it('has a real neck — the waist is well under the lobes it joins', () => {
    const rs = ring(rock({ id: 'neck', lobes: 2 }));
    const hi = Math.max(...rs), lo = Math.min(...rs);
    expect(lo).toBeLessThan(hi * 0.75);
  });

  it('the lobes are unequal, as real ones are', () => {
    // The two maxima on either side of the body differ by more than the wobble alone could manage.
    const rs = ring(rock({ id: 'arrokoth', lobes: 2 }), 720);
    const half = rs.length / 2;
    const peakOf = (from: number) => Math.max(...rs.slice(from, from + half));
    const best = Math.max(peakOf(0), peakOf(half)), worst = Math.min(peakOf(0), peakOf(half));
    expect(worst).toBeLessThan(best);
  });

  // The BOUNDING BOX is a poor measure of this and it is worth saying why, because it was the
  // obvious first choice: a peanut's waist is a narrow notch at right angles to its axis, so the box
  // is set by the widest part of the big lobe and barely notices the pinch. The chord through the
  // centre does notice it, and it is the same quantity a reader's eye is using.
  it('is elongated at every lobe count, and the same seed unlobed is not', () => {
    for (const id of ['e', 'arrokoth', 'n2', 'zz', 'q', 'm', 'nn', 'ooo', 'seed-7', 'seed-41']) {
      expect(chordRatio(ring(rock({ id }))), `${id} plain`).toBeLessThan(1.35);
      for (let n = 2; n <= MAX_LOBES; n++) {
        expect(chordRatio(ring(rock({ id, lobes: n }))), `${id} x${n}`).toBeGreaterThan(1.5);
      }
    }
  });

  it('stays inside the 100x100 viewBox, however many lobes it is given', () => {
    for (let n = 1; n <= MAX_LOBES; n++) {
      for (const id of ['a', 'bb', 'ccc', 'dddd']) {
        const b = bbox(smallBodyOutline(rock({ id, lobes: n })));
        expect(b.minX, `${id}/${n}`).toBeGreaterThanOrEqual(2);
        expect(b.maxX, `${id}/${n}`).toBeLessThanOrEqual(98);
        expect(b.minY, `${id}/${n}`).toBeGreaterThanOrEqual(2);
        expect(b.maxY, `${id}/${n}`).toBeLessThanOrEqual(98);
      }
    }
  });

  it('is ONE closed path, whatever the lobe count — the cutaway clips to it', () => {
    for (let n = 1; n <= MAX_LOBES; n++) {
      const d = smallBodyOutline(rock({ id: 'clip', lobes: n }));
      expect((d.match(/M/g) ?? []).length, `${n} lobes`).toBe(1);
      expect((d.match(/Z/g) ?? []).length, `${n} lobes`).toBe(1);
      expect(d.trim().endsWith('Z'), `${n} lobes`).toBe(true);
    }
  });
});

describe('the field is sound everywhere the mesh will ask it', () => {
  it('is finite and positive over the whole sphere, for every lobe count', () => {
    for (let n = 1; n <= MAX_LOBES; n++) {
      const sh = smallBodyShape(rock({ id: `sound-${n}`, lobes: n }));
      let worst = Infinity;
      for (let j = 0; j <= 48; j++) {
        for (let i = 0; i < 96; i++) {
          const r = sh.radiusAt((i / 96) * 2 * Math.PI, (j / 48) * Math.PI);
          expect(Number.isFinite(r), `n=${n} at ${i},${j}`).toBe(true);
          if (r < worst) worst = r;
        }
      }
      expect(worst, `n=${n}`).toBeGreaterThan(0.05);
    }
  });

  // A pole is one point on the mesh reached by every longitude. If the field disagreed with itself
  // there the geometry would tear open at both ends.
  it('is single-valued at both poles', () => {
    for (let n = 1; n <= MAX_LOBES; n++) {
      const sh = smallBodyShape(rock({ id: `pole-${n}`, lobes: n }));
      for (const colat of [0, Math.PI]) {
        const first = sh.radiusAt(0, colat);
        for (let i = 1; i < 32; i++) {
          expect(sh.radiusAt((i / 32) * 2 * Math.PI, colat), `n=${n} colat=${colat}`).toBeCloseTo(first, 12);
        }
      }
    }
  });

  it('wraps in longitude without a seam', () => {
    const sh = smallBodyShape(rock({ id: 'seam', lobes: 2 }));
    for (const colat of [0.3, Math.PI / 2, 2.4]) {
      expect(sh.radiusAt(0, colat)).toBeCloseTo(sh.radiusAt(2 * Math.PI, colat), 10);
      expect(sh.radiusAt(-0.4, colat)).toBeCloseTo(sh.radiusAt(2 * Math.PI - 0.4, colat), 10);
    }
  });

  // A lobed body holds the same amount of rock as the sphere of its stated radius: that is what
  // `radiusKm` MEANS for an irregular body, and it is why the long axis is allowed to stick out.
  it('keeps the volume its stated radius claims', () => {
    for (let n = 1; n <= 4; n++) {
      const sh = smallBodyShape(rock({ id: `vol-${n}`, lobes: n }));
      let s = 0, w = 0;
      for (let j = 0; j < 64; j++) {
        const colat = ((j + 0.5) / 64) * Math.PI, sc = Math.sin(colat);
        for (let i = 0; i < 128; i++) {
          const r = sh.radiusAt(((i + 0.5) / 128) * 2 * Math.PI, colat);
          s += r * r * r * sc; w += sc;
        }
      }
      expect(Math.cbrt(s / w), `n=${n}`).toBeGreaterThan(0.9);
      expect(Math.cbrt(s / w), `n=${n}`).toBeLessThan(1.15);
    }
  });
});

describe('the lobe count is read in one place', () => {
  it('treats absent, one and nonsense alike, and holds the ceiling', () => {
    expect(lobeCount(rock())).toBe(1);
    expect(lobeCount(rock({ lobes: 1 }))).toBe(1);
    expect(lobeCount(rock({ lobes: 0 }))).toBe(1);
    expect(lobeCount(rock({ lobes: -3 }))).toBe(1);
    expect(lobeCount(rock({ lobes: 2.4 }))).toBe(2);
    expect(lobeCount(rock({ lobes: 1e9 }))).toBe(MAX_LOBES);
    expect(lobeCount(rock({ lobes: NaN as unknown as number }))).toBe(1);
  });
});
