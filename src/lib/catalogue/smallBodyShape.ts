// Seeded irregular SHAPE for SMALL BODIES (asteroids/comets/tiny moons) — ONE source, and since
// [[G91]] it feeds BOTH dimensions: `PlanetDisc` (the rendered potato), `CompositionCrossSection`
// (which must clip its cutaway quarters to the SAME outline so the cut faces align with the body
// edge) and the 3D mesh in `holo/bodyLook.ts`, which reaches the holo, the reference gallery and the
// size comparison at once (engine map RENDER-S53). Deterministic LCG-from-id, so each body keeps its
// own repeatable shape everywhere it appears — and, now, the same shape in 2D and in 3D.
import type { CelestialBody } from '$lib/types';
import { derivedPorosity, rendersAsGiant } from '$lib/physics/makeup';

// Below ~300 km (or any asteroid/* class) a solid body lacks the self-gravity to pull round.
export function isSmallBodyShape(body: CelestialBody): boolean {
  return !rendersAsGiant(body)
    && (body.radiusKm ?? 0) > 0
    && (((body.classes ?? []).some((c) => c.startsWith('asteroid/'))) || (body.radiusKm ?? 0) < 300);
}

/**
 * HOW MANY LOBES THIS BODY IS, read in ONE place because four surfaces ask it: the feature map that
 * feeds the classifier, this module's own outline and radial field, and the 3D mesh. Two spellings
 * of one question is this codebase's most recurring fault, so there is exactly one.
 *
 * 1 (or absent, or nonsense) is an ordinary single body and the shape below is unchanged by it.
 *
 * THE CEILING IS A MESH COST, NOT A PHYSICS JUDGEMENT, and it is deliberately not a refusal: the
 * radial field takes a max over every lobe at every vertex it is asked for, so an authored 1e9 would
 * hang a render rather than draw an interesting rock. Past a handful the lobes are already finer
 * than a 32x24 sphere can show. Nothing is written back to the body — the GM's number stays theirs.
 */
export const MAX_LOBES = 8;
export function lobeCount(body: CelestialBody): number {
  const n = Math.round(body.lobes ?? 1);
  return Number.isFinite(n) ? Math.max(1, Math.min(MAX_LOBES, n)) : 1;
}

// ------------------------------------------------------------------------------------------------
// THE SHAPE SOURCE — one seeded radial field, sampled by every surface that draws this body
// ------------------------------------------------------------------------------------------------
//
// WHY IT IS A FIELD AND NOT TWO DRAWINGS. The 2D silhouette has been a seeded radial function of ONE
// angle since the composition redesign; a lumpy solid is the same idea over TWO. Built separately
// they would be two rocks — a GM's card and the same body in the holo would plainly disagree, which
// is the fault this codebase records more often than any other. So the wobble is drawn ONCE into a
// longitude x latitude grid, and the silhouette is simply that field sliced at the equator.
//
// THE EQUATORIAL ROW IS DRAWN FIRST OFF THE SAME LCG THE OLD FUNCTION USED, and that ordering is
// load-bearing rather than tidy: it is the same sixteen draws in the same sequence, so every rock
// that already exists keeps its exact silhouette, to the byte. `smallBodyShape.spec.ts` pins that
// against the old expression. Moving a shape and changing it are two commits, never one.
const SHAPE_N = 16;                    // longitude divisions — and the unlobed outline's own vertices
const SHAPE_M = 8;                     // latitude bands; row SHAPE_M/2 is the equator
const EQUATOR_ROW = SHAPE_M / 2;
const HALF_PI = Math.PI / 2;
const TWO_PI = Math.PI * 2;

export interface SmallBodyShape {
  /** As `lobeCount` read it: 1 is an ordinary body. */
  readonly lobes: number;
  /** The field's peak. A surface with a box to fit into needs it; a surface in open space does not. */
  readonly maxRadius: number;
  /**
   * Radius in the direction (`lon`, `colat`), normalised so 1 is the body's OWN radius — strictly
   * the radius of the sphere of equal volume, which is what `radiusKm` means for an irregular body.
   * `lon` runs 0..2pi about the polar axis and wraps; `colat` runs 0 (north pole) to pi (south).
   *
   * Longitude 0 is the silhouette's first vertex, drawn straight up on a card, and +X in the mesh.
   */
  radiusAt(lon: number, colat: number): number;
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * Smoothstep rather than linear interpolation, for a reason that is not aesthetic: at a sample point
 * the fractional position can land 2e-16 either side of the grid index because a longitude round-
 * trips through pi. Linear weights would carry that error straight into the answer; smoothstep is
 * flat to second order at both ends, so an epsilon of slack underflows to exactly 0 or 1 and the
 * silhouette comes out bit-identical to the array it was drawn from.
 */
function gridAt(grid: number[][], lon: number, colat: number): number {
  let u = (lon / TWO_PI) * SHAPE_N;
  u = ((u % SHAPE_N) + SHAPE_N) % SHAPE_N;
  const i0 = Math.floor(u), i1 = (i0 + 1) % SHAPE_N, tu = smoothstep(u - i0);
  const v = Math.max(0, Math.min(SHAPE_M, (colat / Math.PI) * SHAPE_M));
  const j0 = Math.min(SHAPE_M - 1, Math.floor(v)), tv = smoothstep(v - j0);
  const a = grid[j0][i0] + (grid[j0][i1] - grid[j0][i0]) * tu;
  const b = grid[j0 + 1][i0] + (grid[j0 + 1][i1] - grid[j0 + 1][i0]) * tu;
  return a + (b - a) * tv;
}

/** One lobe: a sphere, its centre already relative to the body's centre of volume. */
interface Lobe { x: number; z: number; r: number; d2: number }

/** Polynomial smooth maximum. k is the blend width — the neck fillet; 0 is a plain max and a crease. */
function smoothMax(a: number, b: number, k: number): number {
  const m = a > b ? a : b;
  if (k <= 0) return m;
  const h = Math.max(0, k - Math.abs(a - b)) / k;
  return m + h * h * k * 0.25;
}

/**
 * A CONTACT BINARY IS A UNION OF SPHERES, so that is literally what this is: the radius in a
 * direction is the far side of whichever lobe that ray leaves last. Two spheres give a peanut with a
 * real waist rather than a squashed potato, and N spheres cost nothing extra to express — which is
 * the whole reason the body fact is a COUNT.
 *
 * A CHAIN, NOT A RING, and it is not a style choice. Lobes on a ring leave a hole at the centre, so
 * the centre of volume — where every radius is measured from — would sit in empty space and a ray
 * would miss every sphere. Chained, the centroid is always inside a lobe.
 *
 * IN THE EQUATORIAL PLANE, deliberately, because that is the plane the 2D card slices: a GM who
 * makes a contact binary should see two lobes on the card rather than a circle that happens to be
 * one end-on. It is also where a gentle merger leaves them.
 *
 * The lobes are drawn UNEQUAL. Arrokoth's famously are, and identical lobes read as a manufactured
 * dumbbell rather than as two rocks that met.
 */
function buildLobes(n: number, rnd: () => number): { lobes: Lobe[]; neck: number } {
  // EVERY ONE OF THESE RANGES IS BOUNDED BY ONE REQUIREMENT: a contact binary must READ as two
  // lobes on every seed, not on most of them. Measured over seventy-three seeds, the first ranges
  // tried (ratio from 0.45, overlap to 0.22, neck to 0.35) left 8% of them reading as a single lumpy
  // rock — a small lobe, sunk deep, with the fillet then filling what was left of the waist. These
  // are the ranges at which that count is zero while the shapes still differ from each other.
  const radii = [1];
  for (let k = 1; k < n; k++) radii.push(0.55 + 0.4 * rnd());
  const overlap = 0.05 + 0.12 * rnd();     // how deep adjacent lobes sit in one another
  const neck = 0.08 + 0.14 * rnd();        // and how much the join is filleted rather than creased
  const axis = rnd() * TWO_PI;             // which way the chain lies within the equatorial plane
  const ax = Math.cos(axis), az = Math.sin(axis);
  const px = -az, pz = ax;
  const along = [0];
  for (let k = 1; k < n; k++) along.push(along[k - 1] + (radii[k - 1] + radii[k]) * (1 - overlap));
  const lobes: Lobe[] = [];
  let wsum = 0, cx = 0, cz = 0;
  for (let k = 0; k < n; k++) {
    // A small seeded wander off the axis, so a chain of three is not a ruled line of beads.
    const side = k === 0 ? 0 : (rnd() - 0.5) * 0.5 * radii[k];
    const x = along[k] * ax + side * px;
    const z = along[k] * az + side * pz;
    const w = radii[k] * radii[k] * radii[k];
    wsum += w; cx += w * x; cz += w * z;
    lobes.push({ x, z, r: radii[k], d2: 0 });
  }
  cx /= wsum; cz /= wsum;
  for (const L of lobes) { L.x -= cx; L.z -= cz; L.d2 = L.x * L.x + L.z * L.z; }
  return { lobes, neck };
}

/**
 * The union's outer surface along a unit direction. `dy` never appears: every lobe centre lies in the
 * equatorial plane, so the ray's y component enters only through the direction being unit length,
 * which the quadratic already assumes.
 */
function envelopeAt(lobes: Lobe[], neck: number, dx: number, dz: number): number {
  let best = -Infinity;
  for (const L of lobes) {
    const b = dx * L.x + dz * L.z;
    const disc = b * b - L.d2 + L.r * L.r;
    if (disc < 0) continue;
    const t = b + Math.sqrt(disc);
    best = best === -Infinity ? t : smoothMax(best, t, neck);
  }
  // The chain layout puts the centroid inside a lobe, so a direction that hits nothing cannot
  // happen. Guarded anyway: a zero radius would fold the mesh through itself rather than look wrong.
  return best > 0.05 ? best : 0.05;
}

/**
 * What the envelope has to be divided by so that 1 means the body's own radius, and what its peak
 * then is. Volume-equivalent rather than mean, because `radiusKm` on an irregular body IS the radius
 * of the sphere of equal volume — so a lobed body drawn at that radius holds the right amount of
 * rock, and its long axis honestly sticks out past it.
 *
 * The peak is swept finely around the EQUATOR rather than read off the coarse quadrature, because
 * that is where the chain lies and a lobe tip is easy to sample past.
 */
function calibrate(lobes: Lobe[], neck: number): { rEq: number; peak: number } {
  const QI = 24, QJ = 12;
  let s = 0, w = 0;
  for (let j = 0; j < QJ; j++) {
    const colat = ((j + 0.5) / QJ) * Math.PI;
    const sc = Math.sin(colat);
    for (let i = 0; i < QI; i++) {
      const lon = ((i + 0.5) / QI) * TWO_PI;
      const r = envelopeAt(lobes, neck, Math.cos(lon) * sc, Math.sin(lon) * sc);
      s += r * r * r * sc; w += sc;
    }
  }
  const rEq = Math.cbrt(s / w);
  let peak = 0;
  for (let i = 0; i < 256; i++) {
    const lon = (i / 256) * TWO_PI;
    const r = envelopeAt(lobes, neck, Math.cos(lon), Math.sin(lon));
    if (r > peak) peak = r;
  }
  return { rEq, peak: peak / rEq };
}

export function smallBodyShape(body: CelestialBody): SmallBodyShape {
  let s = 53; for (let k = 0; k < body.id.length; k++) s = (s * 31 + body.id.charCodeAt(k)) & 0xffffff;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const km = body.radiusKm ?? 10;
  const sizeFactor = Math.max(0, Math.min(1, 1 - km / 300));      // 300 km → near-round, 1 km → ragged
  const amp = Math.min(0.5, (0.08 + 0.22 * sizeFactor) * (1 + derivedPorosity(body)));
  const w = () => 1 - amp / 2 + amp * rnd();

  const grid: number[][] = new Array(SHAPE_M + 1);
  grid[EQUATOR_ROW] = Array.from({ length: SHAPE_N }, w);          // FIRST — see the note above
  for (let d = 1; d < EQUATOR_ROW; d++) {
    grid[EQUATOR_ROW - d] = Array.from({ length: SHAPE_N }, w);
    grid[EQUATOR_ROW + d] = Array.from({ length: SHAPE_N }, w);
  }
  // A pole is ONE radius shared by every longitude. Give it sixteen and the mesh tears open there,
  // because every one of those vertices is the same point.
  const north = w(), south = w();
  grid[0] = new Array(SHAPE_N).fill(north);
  grid[SHAPE_M] = new Array(SHAPE_N).fill(south);

  let maxWobble = 0;
  for (const row of grid) for (const v of row) if (v > maxWobble) maxWobble = v;

  const lobes = lobeCount(body);
  if (lobes <= 1) {
    return { lobes: 1, maxRadius: maxWobble, radiusAt: (lon, colat) => gridAt(grid, lon, colat) };
  }
  const { lobes: L, neck } = buildLobes(lobes, rnd);
  const { rEq, peak } = calibrate(L, neck);
  return {
    lobes,
    maxRadius: maxWobble * peak,
    radiusAt: (lon, colat) => {
      const sc = Math.sin(colat);
      return gridAt(grid, lon, colat)
        * envelopeAt(L, neck, Math.cos(lon) * sc, Math.sin(lon) * sc) / rEq;
    }
  };
}

// The nominal disc radius in the 100x100 viewBox, and the furthest a silhouette may reach before it
// meets the edge. An ordinary potato peaks near 1.15 and takes the nominal 30 untouched; a lobed
// body is longer than it is wide and is fitted to the box instead. The card is a schematic on which
// every body is drawn at one nominal size, so shrinking the long axis to fit is the honest answer —
// and `Math.min` is what keeps the unlobed case bit-for-bit as it was.
const OUTLINE_R = 30;
const OUTLINE_FIT = 46;

// Smooth closed outline in the 100×100 viewBox (centre 50,50, nominal r=30): quadratics through
// successive midpoints with the vertices as controls. Lumpier when smaller and when porous, and
// two-lobed when the body says it is.
export function smallBodyOutline(body: CelestialBody): string {
  const shape = smallBodyShape(body);
  const scale = Math.min(OUTLINE_R, OUTLINE_FIT / shape.maxRadius);
  // Sixteen points draw a potato; a neck needs more of them. Sampling density is the SURFACE's
  // choice — what must not differ between surfaces is the field underneath, and it does not.
  const N = shape.lobes === 1 ? SHAPE_N : Math.min(96, SHAPE_N * shape.lobes);
  const rs = Array.from({ length: N }, (_, i) => scale * shape.radiusAt((i / N) * TWO_PI, HALF_PI));
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
