// THE inter-system distance module (WS7). Every consumer — route distances, the measure tool, journey
// duration/fuel, the transit planner — goes through here, so they can never disagree about whether depth
// counts. Positions are in MAP units (historically "pixels"); `scale.pixelsPerUnit` converts to the
// campaign's distance unit (ly / pc / an abstract diagrammatic unit).
//
// TWO RULES THAT MUST NOT BE BROKEN:
//  1. The 3D view's z-EXAGGERATION is a display multiplier only. It must never reach this module, or
//     dragging a visual slider would change travel times and fuel.
//  2. `ignoreZ` is the campaign's own choice (Starmap.ignoreZForDistances). Default is FALSE — depth
//     counts, because that is the honest answer — but a GM can opt into "visual height only" so an
//     existing map keeps the distances it always had.

export interface MapPos { x: number; y: number; z?: number }

/** Depth of a position, treating an absent z as the reference plane. Keeps old data working untouched. */
export function posZ(p: MapPos | null | undefined): number {
  const z = p?.z;
  return typeof z === 'number' && Number.isFinite(z) ? z : 0;
}

/** True when this campaign counts depth toward distance (the default). */
export function zCounts(starmap: { ignoreZForDistances?: boolean } | null | undefined): boolean {
  return !(starmap?.ignoreZForDistances ?? false);
}

/** Separation in MAP units. `ignoreZ` collapses it to the old planar measure. */
export function mapSeparation(a: MapPos, b: MapPos, ignoreZ = false): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (ignoreZ) return Math.hypot(dx, dy);
  return Math.hypot(dx, dy, posZ(b) - posZ(a));
}

/**
 * Separation in the campaign's DISTANCE unit (ly / pc / abstract). Returns 0 when the scale is unusable,
 * matching the previous behaviour of the call sites this replaced.
 */
export function systemSeparation(
  a: MapPos,
  b: MapPos,
  pixelsPerUnit: number,
  ignoreZ = false
): number {
  if (!(pixelsPerUnit > 0)) return 0;
  return mapSeparation(a, b, ignoreZ) / pixelsPerUnit;
}

// KNOWN LIMITATION (documented deliberately rather than hidden): a STRANDED/adrift construct is parked
// with planar coordinates and a planar velocity (x, y, vx, vy — see transit/interstellar.ts strandJourney).
// Journey DISTANCE and duration are fully 3D via this module, but a stranded ship sits on the z=0 plane
// and coasts in-plane. Giving adrift constructs real depth is a separate, larger change to the construct
// and journey model; until then the two are intentionally inconsistent in that one place.
