// THE PLACEMENT WORDS A CONSTRUCT CAN CARRY ABOUT A WORLD - one spelling each, from here.
//
// `placement` is a stored string, and the middle orbit band had two spellings: the create dialog
// and the mega registry wrote 'Mid Orbit', while the Orbit tab, the drop-on-the-map path, the
// transit planner's arrival stamp and every bundled map said 'Medium Orbit'. A station created at
// 'Mid Orbit' therefore opened its Orbit tab on an EMPTY Zone select - its own placement was not
// among the options offered. One word now ('Medium Orbit': it is what the stored maps and the
// planner already say), and `canonicalPlacement` reads the other for every save written before.
//
// The two things the surfaces also each did for themselves live here for the same reason:
// which bands a host OFFERS, and which band an ALTITUDE falls in. Three files read three fields
// of `OrbitalBoundaries` that nothing has ever produced (`hasSurface`, `surface`,
// `geosynchronousOrbit` - and `lowOrbit`/`mediumOrbit`/`highOrbit` beside them), so their
// branches were dead: `orbitBandAtAltitude` is the live half of what they meant, from the four
// boundaries the processor really stamps. Geostationary is deliberately NOT inferred from an
// altitude - it is a radius, not a band, and both dead branches invented a 1,000 km tolerance to
// make it one. It is offered and chosen by name.
import type { OrbitalBoundaries } from '$lib/physics/orbits';

export const PLACEMENT_SURFACE = 'Surface';
export const PLACEMENT_LOW_ORBIT = 'Low Orbit';
export const PLACEMENT_MEDIUM_ORBIT = 'Medium Orbit';
export const PLACEMENT_HIGH_ORBIT = 'High Orbit';
export const PLACEMENT_GEOSTATIONARY = 'Geostationary Orbit';

/** The four orbital placements about a world, low to high then the geostationary radius. */
export const ORBIT_BAND_PLACEMENTS = [
  PLACEMENT_LOW_ORBIT, PLACEMENT_MEDIUM_ORBIT, PLACEMENT_HIGH_ORBIT, PLACEMENT_GEOSTATIONARY
] as const;

/** Spellings older saves carry, onto the one word. Add here, never at a call site. */
const LEGACY_PLACEMENT: Readonly<Record<string, string>> = { 'Mid Orbit': PLACEMENT_MEDIUM_ORBIT };

/** A stored placement as the app spells it today. Anything not a known old spelling - a Lagrange
 *  point, 'Earth - Mars', 'Docked: ...', a GM's own word - passes through untouched. */
export function canonicalPlacement<T extends string | null | undefined>(placement: T): T | string {
  return placement && LEGACY_PLACEMENT[placement] ? LEGACY_PLACEMENT[placement] : placement;
}

/** A REAL geostationary radius - never the fallback figure the boundary maths substitutes. */
export function hasRealGeostationary(b: OrbitalBoundaries | null | undefined): boolean {
  return !!b && !!b.geoStationaryKm && !b.isGeoFallback;
}

/**
 * The orbital placements a host offers, in order. Low orbit always (a host with no stamped
 * boundaries still has one); a band only when it has width; geostationary only when it is real.
 */
export function hostOrbitBands(b: OrbitalBoundaries | null | undefined): string[] {
  const out: string[] = [PLACEMENT_LOW_ORBIT];
  if (!b) return out;
  if (b.leoMoeBoundaryKm < b.meoHeoBoundaryKm) out.push(PLACEMENT_MEDIUM_ORBIT);
  if (b.meoHeoBoundaryKm < b.heoUpperBoundaryKm) out.push(PLACEMENT_HIGH_ORBIT);
  if (hasRealGeostationary(b)) out.push(PLACEMENT_GEOSTATIONARY);
  return out;
}

/** Which band an altitude above the surface falls in. Never 'Surface' and never geostationary:
 *  those are stated, not inferred. */
export function orbitBandAtAltitude(b: OrbitalBoundaries, altitudeKm: number): string {
  if (altitudeKm <= b.leoMoeBoundaryKm) return PLACEMENT_LOW_ORBIT;
  if (altitudeKm <= b.meoHeoBoundaryKm) return PLACEMENT_MEDIUM_ORBIT;
  return PLACEMENT_HIGH_ORBIT;
}
