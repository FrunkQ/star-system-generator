import { describe, it, expect } from 'vitest';
import {
  compressRadius,
  toSceneAbsolute,
  toSceneRebased,
  ulp32,
  renderedCameraOffset,
  renderErrorAt,
  shouldRebase,
  REBASE_K,
  type RadialMap,
  type Vec3
} from './floatingOrigin';

// The A19 case, with the numbers taken from the bundled Sol map (static/examples/Sol_2030-System.json)
// and the scene's own constants (GRID_RADIUS 12, R0_AU 0.35).
const AU_KM = 149597870.7;
const TRUE_SCALE: RadialMap = { gridRadius: 12, rMax: 39.5, r0Au: 0.35, compression: 0 };
const READABLE: RadialMap = { ...TRUE_SCALE, compression: 1 };

const PLUTO_BARY_AU = 39.48; // the Pluto-Charon barycentre's semi-major axis
const CHARON_A_AU = 1.1594113620807666e-4; // Charon about that barycentre, as the map states it
const PLUTO_A_AU = 1.405886379192334e-5; // Pluto about it, ditto
const PLUTO_RADIUS_KM = 1188.3;

const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
const auToScene = (au: number) => compressRadius(au, TRUE_SCALE);

describe('floating origin — the radial map', () => {
  it('is exactly linear at true scale, mapping the outermost body to the grid radius', () => {
    expect(compressRadius(39.5, TRUE_SCALE)).toBeCloseTo(12, 12);
    expect(compressRadius(19.75, TRUE_SCALE)).toBeCloseTo(6, 12);
    expect(compressRadius(0, TRUE_SCALE)).toBe(0);
  });

  it('still lands the outermost body on the grid radius at full log compression', () => {
    expect(compressRadius(39.5, READABLE)).toBeCloseTo(12, 12);
    // ...but pushes the inner system outward, which is the whole point of the toytown end.
    expect(compressRadius(1, READABLE)).toBeGreaterThan(compressRadius(1, TRUE_SCALE) * 5);
  });

  it('maps the physics frame onto three\'s ground plane with height on up', () => {
    const out = toSceneAbsolute({ x: 39.5, y: 0, z: 0 }, TRUE_SCALE, v3());
    expect(out).toEqual({ x: 12, y: 0, z: 0 });
    // physics y (in-plane) -> scene z, physics z (out of plane) -> scene y
    const tilted = toSceneAbsolute({ x: 0, y: 39.5, z: 0 }, TRUE_SCALE, v3());
    expect(tilted.z).toBeCloseTo(12, 12);
    expect(tilted.y).toBe(0);
  });

  it('does NOT commute with a translation — so the rebase must come after the compression', () => {
    const m = READABLE; // nonlinear regime, where the difference is gross
    const p = { x: 8, y: 3, z: 0 };
    const focus = { x: 5, y: 0, z: 0 };
    const rebasedAfter = toSceneRebased(p, m, toSceneAbsolute(focus, m, v3()), v3());
    const rebasedBefore = toSceneAbsolute({ x: p.x - focus.x, y: p.y - focus.y, z: p.z - focus.z }, m, v3());
    const apart = Math.hypot(
      rebasedAfter.x - rebasedBefore.x,
      rebasedAfter.y - rebasedBefore.y,
      rebasedAfter.z - rebasedBefore.z
    );
    expect(apart).toBeGreaterThan(1); // scene units — not a rounding difference, a different picture
  });
});

describe('floating origin — the rebase preserves the drawing exactly', () => {
  it('is a pure translation: every relative offset survives it bit for bit', () => {
    const origin = toSceneAbsolute({ x: PLUTO_BARY_AU, y: 0, z: 0 }, TRUE_SCALE, v3());
    const a = { x: 3.1, y: -2.4, z: 0.7 };
    const b = { x: 12.9, y: 0.02, z: -5 };
    const absA = toSceneAbsolute(a, TRUE_SCALE, v3());
    const absB = toSceneAbsolute(b, TRUE_SCALE, v3());
    const relA = toSceneRebased(a, TRUE_SCALE, origin, v3());
    const relB = toSceneRebased(b, TRUE_SCALE, origin, v3());
    // Not toBeCloseTo: a translation that changed any relative geometry would be a regression, and in
    // float64 at these magnitudes the difference is exact.
    expect(relB.x - relA.x).toBe(absB.x - absA.x);
    expect(relB.y - relA.y).toBe(absB.y - absA.y);
    expect(relB.z - relA.z).toBe(absB.z - absA.z);
  });

  it('is the identity while the origin is at zero — which is where readable scale keeps it', () => {
    const zero = v3();
    for (const m of [TRUE_SCALE, READABLE]) {
      for (const p of [{ x: 1, y: 2, z: 3 }, { x: -30, y: 0.4, z: -0.001 }, { x: 0, y: 0, z: 0 }]) {
        expect(toSceneRebased(p, m, zero, v3())).toEqual(toSceneAbsolute(p, m, v3()));
      }
    }
  });
});

describe('float32 headroom at Pluto (the A19 measurement)', () => {
  const plutoScene = auToScene(PLUTO_BARY_AU);
  const sepScene = auToScene(CHARON_A_AU + PLUTO_A_AU); // the Pluto-Charon separation, in scene units
  const charonOrbitScene = auToScene(CHARON_A_AU); // Charon's own orbit about the barycentre
  const plutoRadiusScene = auToScene(PLUTO_RADIUS_KM / AU_KM);

  it('quantises the pair to a few dozen float32 steps when drawn in absolute coordinates', () => {
    const step = ulp32(plutoScene);
    expect(step).toBeCloseTo(Math.pow(2, -20), 30); // 9.54e-7 scene units at magnitude 12
    // The previous session predicted "42 ULP"; measured, the separation is 41.7 and Charon's own orbit
    // about the barycentre is 36.9. Pluto's RADIUS is inside three steps.
    expect(sepScene / step).toBeGreaterThan(38);
    expect(sepScene / step).toBeLessThan(45);
    expect(charonOrbitScene / step).toBeGreaterThan(33);
    expect(charonOrbitScene / step).toBeLessThan(40);
    expect(plutoRadiusScene / step).toBeLessThan(3);
  });

  it('gives about ten million steps once the origin is rebased onto Pluto', () => {
    const step = ulp32(sepScene);
    expect(sepScene / step).toBeGreaterThan(5e6); // predicted ~1e7; measured 1.09e7
    expect(sepScene / step).toBeLessThan(2e7);
    // Five orders of magnitude better than the absolute frame, which is the whole claim.
    expect(sepScene / step / (sepScene / ulp32(plutoScene))).toBeGreaterThan(1e5);
  });
});

describe('the rebase policy', () => {
  const DEFAULT_MIN_DIST = 0.05; // the holo controls' zoom floor when nothing tiny is framed
  const GRID_RADIUS = 12; // and the furthest anything is ever drawn from the centre

  it('never fires at readable scale, so that end of the dial is left exactly as it was', () => {
    for (let camDist = DEFAULT_MIN_DIST; camDist < GRID_RADIUS * 6; camDist *= 1.3) {
      for (const drift of [0.001, 0.5, 6, GRID_RADIUS, GRID_RADIUS * 1.5]) {
        expect(shouldRebase(drift, camDist)).toBe(false);
      }
    }
  });

  it('fires on the shot that provoked A19 — a true-scale world framed at its moon\'s orbit', () => {
    const charonOrbitScene = auToScene(CHARON_A_AU);
    expect(shouldRebase(auToScene(PLUTO_BARY_AU), charonOrbitScene * 2)).toBe(true);
  });

  it('holds the float32 error to a fraction of a pixel at the drift it tolerates', () => {
    for (let camDist = 1e-7; camDist < DEFAULT_MIN_DIST; camDist *= 2) {
      const maxDrift = camDist * REBASE_K; // the largest drift the policy will sit on
      // Measured 1.46e-4 of the view width at worst — a fifth of a pixel across a 1000 px viewport.
      expect(ulp32(maxDrift) / camDist).toBeLessThan(2e-4);
    }
  });

  it('settles instead of thrashing: one rebase takes the drift to zero', () => {
    const drift = auToScene(PLUTO_BARY_AU);
    const camDist = auToScene(CHARON_A_AU) * 2;
    expect(shouldRebase(drift, camDist)).toBe(true);
    expect(shouldRebase(0, camDist)).toBe(false); // rebasing sets the target to the origin
  });
});

describe('the orbit line a body has to sit on', () => {
  // The barycentre's heliocentric ring, sampled over the short arc Pluto is currently crossing, seen by a
  // camera framed on the pair — which is the reported shot.
  const origin = toSceneAbsolute({ x: PLUTO_BARY_AU, y: 0, z: 0 }, TRUE_SCALE, v3());
  const ringR = origin.x;
  const charonOrbitScene = auToScene(CHARON_A_AU);
  const cameraAbs = { x: ringR - charonOrbitScene * 1.5, y: charonOrbitScene * 2, z: charonOrbitScene * 0.6 };
  const SAMPLES = 64;
  const arcVertex = (i: number): Vec3 => {
    const th = (i / (SAMPLES - 1) - 0.5) * ((charonOrbitScene * 8) / ringR); // a few moon-orbits of arc
    return { x: ringR * Math.cos(th), y: 0, z: ringR * Math.sin(th) };
  };
  const worstOnArc = (originUsed: Vec3) => {
    let worst = 0;
    for (let i = 0; i < SAMPLES; i++) worst = Math.max(worst, renderErrorAt(arcVertex(i), cameraAbs, originUsed));
    return worst;
  };

  it('is drawn a percent of Charon\'s whole orbit away from where it belongs, in absolute coordinates', () => {
    // Measured 3.8e-7 scene units — 1.1% of Charon's orbit radius, and up to a full ULP (2.7%) in the
    // worst case. That is a moon-sized error on the line the moon is supposed to sit on.
    expect(worstOnArc(v3())).toBeGreaterThan(charonOrbitScene * 0.005);
  });

  it('lands within a millionth of Charon\'s orbit once the scene is rebased on the focus', () => {
    expect(worstOnArc(origin)).toBeLessThan(charonOrbitScene * 1e-6); // measured 2.8e-7 of it
  });

  it('stops vibrating: the rendered vertex tracks a slow camera move instead of stepping', () => {
    // Pan the camera across the pair over 600 frames, each step far below a float32 step at magnitude 12.
    // The vertex is FIXED, so its rendered offset should move by exactly the camera's step every frame.
    // Absolutely it sits still for several frames and then jumps a whole ULP — a staircase, which is what
    // "the orbit line vibrates" looks like from the inside.
    const frames = 600;
    const stepPerFrame = (charonOrbitScene * 4) / frames;
    const vertex = { x: ringR, y: 0, z: 0 };
    const sweep = (originUsed: Vec3) => {
      const seen = new Set<number>();
      let prev: number | null = null;
      let maxJump = 0;
      for (let i = 0; i < frames; i++) {
        const cam = { x: cameraAbs.x + i * stepPerFrame, y: cameraAbs.y, z: cameraAbs.z };
        const got = renderedCameraOffset(
          { x: vertex.x - originUsed.x, y: vertex.y - originUsed.y, z: vertex.z - originUsed.z },
          { x: cam.x - originUsed.x, y: cam.y - originUsed.y, z: cam.z - originUsed.z },
          v3()
        );
        seen.add(got.x);
        if (prev !== null) maxJump = Math.max(maxJump, Math.abs(got.x - prev));
        prev = got.x;
      }
      return { distinct: seen.size, jumpRatio: maxJump / stepPerFrame };
    };
    const absolute = sweep(v3());
    expect(absolute.distinct).toBeLessThan(frames / 3); // measured 148 of 600 — it moves on 1 frame in 4
    expect(absolute.jumpRatio).toBeGreaterThan(3); // and when it moves, it moves a whole ULP at once
    const rebased = sweep(origin);
    expect(rebased.distinct).toBe(frames); // every frame is a distinct position
    expect(rebased.jumpRatio).toBeLessThan(1.05); // and each is one camera-step from the last
  });
});
