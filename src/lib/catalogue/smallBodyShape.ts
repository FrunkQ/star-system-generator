// Seeded irregular silhouette for SMALL BODIES (asteroids/comets/tiny moons) — shared by
// PlanetDisc (the rendered potato) and CompositionCrossSection (which must clip its cutaway
// quarters to the SAME outline so the cut faces align with the body edge). Deterministic
// LCG-from-id, so each body keeps its own repeatable shape everywhere it appears.
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

// Smooth closed outline in the 100×100 viewBox (centre 50,50, nominal r=30): quadratics through
// successive midpoints with the vertices as controls. Lumpier when smaller and when porous.
export function smallBodyOutline(body: CelestialBody): string {
  let s = 53; for (let k = 0; k < body.id.length; k++) s = (s * 31 + body.id.charCodeAt(k)) & 0xffffff;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const km = body.radiusKm ?? 10;
  const sizeFactor = Math.max(0, Math.min(1, 1 - km / 300));      // 300 km → near-round, 1 km → ragged
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
