// WHICH PLANE IS A SATELLITE'S ORBIT IN? One answer, in one place.
//
// C3 settled the physics: a regular satellite's orbital elements are quoted in its PARENT'S
// EQUATORIAL frame, not in the system plane — that is the catalogue convention, and it is what the
// bundled data uses (Saturn's rings are i_deg 0 and its inner moons 0.009-1.57, all of which mean "in
// the ring plane"). C5 then measured the one approximation in it and found the `frame: 'ecliptic'`
// declaration exact for every body in both bundled maps.
//
// THE PROPAGATOR DOES NOT KNOW ANY OF THAT. `physics/worldPositions.ts` walks the hierarchy in the
// SYSTEM frame, so `computeWorldPositions3D` returns a moon at its parent-relative offset UNROTATED —
// out of plane by the parent's axial tilt, which is 25.19 deg for Mars and 97.77 for Uranus. Every
// consumer that wants a moon's TRUE position has had to apply the rotation itself, and so far exactly
// one has: `holo/scene.ts`, which does it in two places and decides the `frame: 'ecliptic'` gate in
// two different spellings. This module is that knowledge lifted out, so the next consumer shares it
// instead of writing a third copy.
//
// See the inbox finding filed with G8: the propagator itself is the right long-term home, but moving
// it there changes what the renderer receives and needs its own scoped pass.
import { computeWorldPositions3D, type Vec3 } from '$lib/physics/worldPositions';
import type { System } from '$lib/types';

/**
 * The rotation that carries a PARENT-RELATIVE offset from the system frame into the parent's
 * equatorial plane. Physics axes: the reference plane is z 0, so this is a rotation about y.
 *
 * Scene space is (x, z, y), so this is the same rotation the ring builders apply as a scene-Z
 * rotation ("Ring plane = planet equator") — which is what puts moons and rings in one plane. Keep
 * the two in step if either ever changes.
 */
export function toParentEquator(
  x: number, y: number, z: number, tiltRad: number, out: Vec3
): Vec3 {
  if (!tiltRad) { out.x = x; out.y = y; out.z = z; return out; }
  const c = Math.cos(tiltRad), s = Math.sin(tiltRad);
  out.x = x * c - z * s;
  out.y = y;
  out.z = x * s + z * c;
  return out;
}

/**
 * How far to rotate `node`'s orbit out of the system plane, in radians — the parent's axial tilt, or
 * zero when the orbit declares itself ecliptic-framed.
 *
 * The declaration wins because beyond roughly the Laplace radius the star's tide beats the parent's
 * bulge and the orbit follows the system plane instead: Luna at 60 Earth radii and Phoebe at 222
 * Saturn radii are both quoted to the ecliptic, and both say so in their data.
 *
 * SATELLITES ONLY. A planet's inclination is ecliptic-relative and must never be rotated, so callers
 * pass the parent they actually orbit and this returns 0 for a star parent.
 */
export function satelliteTiltRad(node: any, parent: any): number {
  if (!node || !parent) return 0;
  // A star is not a satellite's host in this sense — a planet's elements are already system-framed.
  if (parent.kind !== 'body' || parent.roleHint === 'star' || parent.parentId == null) return 0;
  if (String(node.orbit?.frame ?? '').toLowerCase() === 'ecliptic') return 0;
  return ((parent.axial_tilt_deg || 0) * Math.PI) / 180;
}

/**
 * World positions in AU with every satellite rotated into its parent's equatorial plane — i.e. where
 * the bodies REALLY are, as against where the bare propagator puts them.
 *
 * Parent before child, by tree depth, because a moon's corrected position is built on its parent's
 * corrected position. That ordering is the same rule the idempotence work landed on for derived
 * quantities and it matters for the same reason.
 */
export function framedWorldPositions3D(system: System | null, timeMs: number): Map<string, Vec3> {
  const raw = computeWorldPositions3D(system, timeMs);
  if (!system) return raw;
  const byId = new Map<string, any>(system.nodes.map((n) => [n.id, n as any]));
  const depthOf = (id: string | null | undefined): number => {
    let d = 0, cur = id ?? null;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) { seen.add(cur); cur = byId.get(cur)?.parentId ?? null; d++; }
    return d;
  };
  const out = new Map<string, Vec3>();
  const tmp: Vec3 = { x: 0, y: 0, z: 0 };
  for (const n of [...system.nodes].sort((a, b) => depthOf(a.id) - depthOf(b.id))) {
    const r = raw.get(n.id);
    if (!r) continue;
    const parent = (n as any).parentId ? byId.get((n as any).parentId) : null;
    const pRaw = parent ? raw.get(parent.id) : null;
    const pOut = parent ? out.get(parent.id) : null;
    if (!parent || !pRaw || !pOut) { out.set(n.id, { x: r.x, y: r.y, z: r.z }); continue; }
    const e = toParentEquator(r.x - pRaw.x, r.y - pRaw.y, r.z - pRaw.z, satelliteTiltRad(n, parent), tmp);
    out.set(n.id, { x: pOut.x + e.x, y: pOut.y + e.y, z: pOut.z + e.z });
  }
  return out;
}
