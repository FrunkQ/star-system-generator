// THE map frame (WS7b). ONE module owns the mapping between a spherical offset — bearing, elevation,
// distance — and the map's Cartesian (x, y, z), so the "Add System near here" dialogue, its live ghost
// preview and any later editor can never disagree about which way is which.
//
// THE FRAME, stated once:
//  - x grows to the RIGHT on the map.
//  - y grows DOWNWARD in map coordinates (an SVG/canvas convention SSE2 uses throughout), so map-NORTH —
//    straight UP the screen — is NEGATIVE y. Every sign error in placement code comes from forgetting
//    this, which is why it is spelled out here and nowhere else.
//  - z is DEPTH, positive ABOVE the map plane. Same axis the 3D starmap lifts a system along.
//  - BEARING is measured in degrees clockwise from map-north: 0 = up, 90 = right, 180 = down, 270 = left.
//    A compass, in other words, matching what a GM sees on screen once the map is north-up.
//  - ELEVATION is degrees above (+) or below (-) the map plane, -90..+90.
//
// This is deliberately the MAP's own frame and not the sky's. A campaign map need not contain Sol, or
// Earth, or the galactic plane — most will be somewhere invented entirely — so there is no RA/Dec here
// and no galactic reference. What a GM points at on their own map is the whole coordinate system.

import type { MapPos } from './systemDistance';

/** A placement relative to an origin system: which way, how far above the plane, how far away. */
export interface SphericalOffset {
  bearingDeg: number;   // 0..360, clockwise from map-north (up the screen)
  elevationDeg: number; // -90..+90, positive above the map plane
  distance: number;     // in the campaign's DISTANCE unit (ly / pc / abstract)
}

/** Bearing/elevation only — the direction half of an offset, for a compass readout. */
export type Direction = Pick<SphericalOffset, 'bearingDeg' | 'elevationDeg'>;

const DEG = Math.PI / 180;

/** Wrap a bearing into 0..360 (inclusive of 0, exclusive of 360), so -10 reads as 350. */
export function wrapBearing(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const w = deg % 360;
  return w < 0 ? w + 360 : w;
}

/** Clamp an elevation to the poles. Beyond +/-90 the direction would flip, silently mirroring a bearing. */
export function clampElevation(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return Math.max(-90, Math.min(90, deg));
}

/**
 * Place a point in MAP units, `offset` away from `origin`.
 *
 * `pixelsPerUnit` converts the campaign's distance unit into map units, exactly as every other coordinate
 * conversion does. With an unusable scale the offset collapses to the origin rather than flinging the new
 * system to infinity — the caller shows the scale problem, it does not corrupt the map.
 */
export function offsetToMapPos(origin: MapPos, offset: SphericalOffset, pixelsPerUnit: number): MapPos {
  const r = (Number.isFinite(offset.distance) ? Math.max(0, offset.distance) : 0) * (pixelsPerUnit > 0 ? pixelsPerUnit : 0);
  const b = wrapBearing(offset.bearingDeg) * DEG;
  const e = clampElevation(offset.elevationDeg) * DEG;
  const horizontal = r * Math.cos(e); // the part that lies IN the map plane
  return {
    x: origin.x + horizontal * Math.sin(b),
    // Map-north is up the screen and screen y grows downward, so a northerly bearing SUBTRACTS y.
    y: origin.y - horizontal * Math.cos(b),
    z: (origin.z ?? 0) + r * Math.sin(e)
  };
}

/**
 * The inverse: describe where `target` sits relative to `origin`. Used when EDITING an existing placement
 * so the dialogue opens on the system's real direction instead of resetting it to due north.
 *
 * Straight above or below the origin has no meaningful bearing; 0 is returned so a compass points north
 * rather than jittering on floating-point noise.
 */
export function mapPosToOffset(origin: MapPos, target: MapPos, pixelsPerUnit: number): SphericalOffset {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dz = (target.z ?? 0) - (origin.z ?? 0);
  const horizontal = Math.hypot(dx, dy);
  const r = Math.hypot(horizontal, dz);
  return {
    bearingDeg: horizontal < 1e-9 ? 0 : wrapBearing((Math.atan2(dx, -dy) / DEG)),
    elevationDeg: r < 1e-9 ? 0 : clampElevation(Math.atan2(dz, horizontal) / DEG),
    distance: pixelsPerUnit > 0 ? r / pixelsPerUnit : 0
  };
}

/** The 8-point compass name for a bearing — a plain-language check that the numbers mean what a GM expects. */
export function compassName(bearingDeg: number): string {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return names[Math.round(wrapBearing(bearingDeg) / 45) % 8];
}

/** "up 20 degrees" / "level" / "down 5 degrees" — the elevation in words, for the same reason. */
export function elevationName(elevationDeg: number): string {
  const e = clampElevation(elevationDeg);
  if (Math.abs(e) < 0.5) return 'level with the plane';
  return `${e > 0 ? 'above' : 'below'} the plane by ${Math.abs(Math.round(e))}°`;
}
