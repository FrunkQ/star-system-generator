// HOW FAR OUT A SYSTEM REACHES - ONE ANSWER, THREE READERS.
//
// Three numbers used to answer this separately, and a GM met whichever was smallest first:
//   - the Orbit tab clamped every typed distance at a literal 1e6 AU ("the placement limit");
//   - the 2D orrery's widest view was a pixels-per-AU floor, so it depended on the SCREEN: a
//     2,000 px desktop saw exactly 1,000,000 AU either side of centre and a phone a quarter of that
//     ("the visual canvas limit") - which is why 1,000,000 AU was the distance a companion could not
//     be set at: it sat on the edge of the widest view, and one AU further the tab pulled it back;
//   - Settings -> System edge (the root star's galactic Hill limit, ~2 ly for the Sun, or a custom
//     distance) decided where a coasting ship has left the system.
// The owner's ruling (2026-09-09): "I have a 'visual canvas limit' and a 'placement limit' - I need
// to unify them ... perhaps set the scale limit to the Hill sphere (e.g. 2ly for us) ... tie the max
// zoom out and the config item together properly."
//
// So the reach is PHYSICAL: the root's own Hill limit against the galaxy, which grows with the cube
// root of its mass - a central black hole of ten thousand suns holds companions forty light years
// out, and may now be given them. The GM's custom System edge raises it further, because a GM who
// has said "this system extends twenty light years" has answered the question.
//
// IT IS A CEILING ON A TYPING ACCIDENT, NOT A PHYSICS VERDICT (steer, do not stop). The legacy
// 1e6 AU stays as a FLOOR under it, so no system loses reach it had: the Sun's Hill limit is
// 126,000 AU and a companion a GM already placed at 500,000 AU must stay editable. Whether a
// companion that far out is BOUND is the stability tags' sentence to say, not this number's.
import type { System } from '$lib/types';
import { rootStarHillAu } from '$lib/physics/twoBodyCoast';

/** The legacy ceiling, kept as the floor of the reach: ~16 light years, past any pair bound to a
 *  Sun-like star, and the guard that stops a fat-fingered exponent putting a body 1e49 AU out. */
export const PLACEMENT_FLOOR_AU = 1e6;

/** The mass at the system's root: the lone star's, or the root barycentre's total. */
export function rootMassKg(system: Pick<System, 'nodes'> | null | undefined): number {
  const root = system?.nodes?.find((n) => n.parentId == null) as { massKg?: number; effectiveMassKg?: number } | undefined;
  const m = root?.massKg ?? root?.effectiveMassKg ?? 0;
  return Number.isFinite(m) && m > 0 ? m : 0;
}

/** Where a coasting ship has LEFT the system: the GM's custom System edge, else the root's Hill
 *  limit against the galaxy. Infinity when there is no mass to hold anything (nothing ever leaves). */
export function systemEdgeAu(system: Pick<System, 'nodes'> | null | undefined, customEdgeAu?: number | null): number {
  if (customEdgeAu && customEdgeAu > 0 && Number.isFinite(customEdgeAu)) return customEdgeAu;
  const m = rootMassKg(system);
  return m > 0 ? rootStarHillAu(m) : Infinity;
}

/** The furthest a body may be placed from its host in this system, AU: the larger of the root's Hill
 *  limit and the GM's custom System edge, never less than the legacy floor. */
export function placementLimitAu(system: Pick<System, 'nodes'> | null | undefined, customEdgeAu?: number | null): number {
  const hill = rootStarHillAu(rootMassKg(system));
  const custom = customEdgeAu && customEdgeAu > 0 && Number.isFinite(customEdgeAu) ? customEdgeAu : 0;
  return Math.max(PLACEMENT_FLOOR_AU, hill, custom);
}
