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
