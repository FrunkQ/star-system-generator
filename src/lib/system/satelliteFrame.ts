// WHICH PLANE IS A SATELLITE'S ORBIT IN? One answer, in one place.
//
// C3 settled the physics: a regular satellite's orbital elements are quoted in its PARENT'S
// EQUATORIAL frame, not in the system plane — that is the catalogue convention, and it is what the
// bundled data uses (Saturn's rings are i_deg 0 and its inner moons 0.009-1.57, all of which mean "in
// the ring plane"). C5 then measured the one approximation in it and found the `frame: 'ecliptic'`
// declaration exact for every body in both bundled maps.
//
// THE PROPAGATOR NOW APPLIES IT (C9). `computeWorldPositions3D` calls `satelliteTiltRad` and
// `toParentEquator` on every parent-relative offset it accumulates, so a moon's world position is
// framed at the SOURCE and every consumer gets the same answer. It did not use to: the rotation
// lived only in `holo/scene.ts`, so the renderer and the propagator disagreed about where a moon
// was by the parent's axial tilt — 25.19 deg for Mars, 97.77 for Uranus — and the eclipse search,
// built on the propagator, inherited the wrong plane. There was briefly a `framedWorldPositions3D`
// wrapper here that corrected the propagator's output after the fact; it is gone, because a
// correction applied by some callers and not others is the same fault one layer up.
//
// WHAT STAYS HERE IS THE KNOWLEDGE, NOT A SECOND WALK: the rotation and the gate that decides
// whether it applies. `worldPositions.ts` uses both, and `holo/scene.ts` uses them once more for an
// orbit RING, which is sampled straight off the propagator's parent-relative state rather than read
// out of a world-position map — a different input needing the same frame.
import type { Vec3 } from '$lib/physics/worldPositions';

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
 *
 * THIS IS THE ONLY SPELLING OF THE DECISION. It used to be written three times in `holo/scene.ts` —
 * once at a ring's caller, once inside `buildMoonOrbitRing`, and once bare — and the three did not
 * agree: the bare one skipped the `frame: 'ecliptic'` gate entirely, and the body-placement one
 * gated on the RENDERER's idea of a satellite (anything not one hop from the root), which makes a
 * planet orbiting a binary's SECONDARY star a satellite and rotates it by the star's tilt. It is
 * not one: its inclination is quoted in the system plane like every other planet's.
 */
export function satelliteTiltRad(node: any, parent: any): number {
  if (!node || !parent) return 0;
  // A star is not a satellite's host in this sense — a planet's elements are already system-framed.
  if (parent.kind !== 'body' || parent.roleHint === 'star' || parent.parentId == null) return 0;
  if (String(node.orbit?.frame ?? '').toLowerCase() === 'ecliptic') return 0;
  return ((parent.axial_tilt_deg || 0) * Math.PI) / 180;
}
