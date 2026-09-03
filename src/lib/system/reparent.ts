// RE-HOMING A BODY WITHOUT MOVING IT (G64).
//
// A GM asks for a moon to orbit a different planet, or a planet a different star. The body is
// wherever the map shows it at this instant, and the honest re-home leaves it exactly there: take
// its world STATE (position and velocity) at the display time, re-express that state as an orbit
// about the new host, and let the engine's passes settle the rest. That is precisely what an import
// does with a state vector, so the conversion is the importer's (`elementsFromState`), not a copy.
//
// THE TRAP THIS EXISTS TO AVOID is DATA-R29 / B111: a re-home that writes a new host and a new
// radius but keeps the old mean anomaly and epoch describes a circle, not an orbit - the body jumps
// to wherever the old phase lands on the new ellipse. Every element here is derived from the state
// at ONE instant, and that instant becomes the orbit's epoch.
//
// STEER, DO NOT STOP. A re-home INTO a physically absurd place (a moon handed to a star it can never
// hold, a giant handed to a rock) is allowed. The stability pass tags what would happen and why; the
// map is the GM's. The one thing refused is a cycle: a body cannot orbit its own descendant, because
// nothing could then say where anything is.
import type { System, CelestialBody, Barycenter, Orbit } from '$lib/types';
import { G, AU_KM } from '$lib/constants';
import { computeWorldStates3D } from '$lib/physics/worldPositions';
import { circularElementsAtState } from '$lib/physics/orbits';
import { elementsFromState, type V3 } from '$lib/import/ubox/kepler';
import { satelliteTiltRad, toParentEquator } from './satelliteFrame';

type Node = CelestialBody | Barycenter;
const AU_M = AU_KM * 1000;
const HOST_ROLES = new Set(['star', 'planet', 'moon']);

/** The mass a host binds with: a body's own, a barycentre's total (summed from its members when the
 *  processor has not yet written `effectiveMassKg`). */
export function hostMassKg(system: System, host: Node, depth = 0): number {
  if (host.kind === 'body') return (host as CelestialBody).massKg || 0;
  const bary = host as Barycenter;
  if (bary.effectiveMassKg && bary.effectiveMassKg > 0) return bary.effectiveMassKg;
  if (depth > 16) return 0;
  return (bary.memberIds || []).reduce((sum, id) => {
    const m = system.nodes.find((n) => n.id === id);
    return sum + (m ? hostMassKg(system, m, depth + 1) : 0);
  }, 0);
}

/** True when `nodeId` sits anywhere beneath `ancestorId` (cycle-guarded, so a corrupt file cannot hang it). */
export function isDescendantOf(system: System, nodeId: string, ancestorId: string): boolean {
  const byId = new Map(system.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  let cur = byId.get(nodeId);
  while (cur?.parentId) {
    if (cur.parentId === ancestorId) return true;
    if (seen.has(cur.parentId)) return false;
    seen.add(cur.parentId);
    cur = byId.get(cur.parentId);
  }
  return false;
}

/**
 * What a body or construct may orbit: stars, planets, moons and barycentres - the one list rule,
 * shared by the construct host picker and the body re-home. For a body, itself and everything
 * beneath it are excluded, which is what rules a cycle out before it can be asked for; the system
 * root therefore has no candidates at all, and the control says so.
 */
export function hostCandidates(system: System, opts: { forBodyId?: string } = {}): Node[] {
  return system.nodes.filter((n) => {
    const eligible = n.kind === 'barycenter' || (n.kind === 'body' && HOST_ROLES.has((n as CelestialBody).roleHint));
    if (!eligible) return false;
    if (opts.forBodyId && (n.id === opts.forBodyId || isDescendantOf(system, n.id, opts.forBodyId))) return false;
    return true;
  }) as Node[];
}

/**
 * The role a body takes under a host: a star is a star wherever it sits; anything else is a planet
 * of a star and a moon of anything smaller, and under a barycentre it takes the role it would have
 * under the pair's heavier member. The ubox importer's `roleUnder` is this rule for placements.
 * Belts and rings keep their own role - they are distributions, not satellites.
 */
export function roleHintUnderHost(system: System, host: Node, body: CelestialBody): CelestialBody['roleHint'] {
  if (body.roleHint === 'star') return 'star';
  if (body.roleHint !== 'planet' && body.roleHint !== 'moon') return body.roleHint;
  let h: Node | undefined = host;
  for (let guard = 0; h && h.kind === 'barycenter' && guard < 16; guard++) {
    const members = ((h as Barycenter).memberIds || []).map((id) => system.nodes.find((n) => n.id === id)).filter((m): m is Node => !!m);
    h = members.reduce<Node | undefined>((best, m) => (!best || hostMassKg(system, m) > hostMassKg(system, best) ? m : best), undefined);
  }
  if (!h || h.kind !== 'body') return 'planet';
  return (h as CelestialBody).roleHint === 'star' ? 'planet' : 'moon';
}

export interface ReparentResult {
  /** 'kepler': the state was bound to the new host and its orbit is the true one. 'circular': the
   *  state was unbound (or the host massless), so the honest fallback is a circle at the current
   *  distance, in the plane the body was moving in. */
  mode: 'kepler' | 'circular';
  hostId: string;
  hostName: string;
}

const rot = (v: V3, tilt: number): V3 => {
  const o = toParentEquator(v[0], v[1], v[2], tilt, { x: 0, y: 0, z: 0 });
  return [o.x, o.y, o.z];
};

/**
 * Re-home `bodyId` under `hostId` so that at `tMs` it is exactly where it was. Mutates the body's
 * `parentId`, `orbit` and `roleHint` in place; returns null when the move is impossible (unknown
 * ids, the body itself, or a host beneath the body). The caller re-processes the system, which
 * settles hosts' masses, pairs (a comparable-mass body under a star PROMOTES to a pair) and the
 * stability tags that say whether the new home can hold it.
 */
export function reparentBody(system: System, bodyId: string, hostId: string, tMs: number): ReparentResult | null {
  const body = system.nodes.find((n) => n.id === bodyId && n.kind === 'body') as CelestialBody | undefined;
  const host = system.nodes.find((n) => n.id === hostId) as Node | undefined;
  if (!body || !host || host.id === body.id) return null;
  if (isDescendantOf(system, host.id, body.id)) return null;

  // The world state of both at the instant, in the SYSTEM frame (the walk has already carried
  // every satellite into its parent's equatorial plane on the way out).
  const states = computeWorldStates3D(system, tMs);
  const sb = states.get(body.id), sh = states.get(host.id);
  if (!sb || !sh) return null;
  let r: V3 = [(sb.r.x - sh.r.x) * AU_M, (sb.r.y - sh.r.y) * AU_M, (sb.r.z - sh.r.z) * AU_M];
  let v: V3 = [(sb.v.x - sh.v.x) * AU_M, (sb.v.y - sh.v.y) * AU_M, (sb.v.z - sh.v.z) * AU_M];

  // DERIVE IN THE FRAME THE ELEMENTS WILL BE READ IN (DATA-R29's blast line). A satellite's
  // inclination is quoted in its parent's equator and `computeWorldPositions3D` rotates its offset
  // by the parent's tilt on the way out - so the state comes back through the inverse rotation
  // first, or a moon handed to Uranus lands 97.8 degrees round its new host.
  const tilt = satelliteTiltRad({ orbit: {} }, host);
  if (tilt) { r = rot(r, -tilt); v = rot(v, -tilt); }

  const mu = G * hostMassKg(system, host);
  const kep = mu > 0 ? elementsFromState(r, v, mu) : { elements: null, unbound: true };
  let elements = kep.elements;
  let mode: ReparentResult['mode'] = 'kepler';
  if (!elements) {
    // Unbound relative to the new host: there is no ellipse through this state, so the honest
    // answer is a circle at the current distance in the plane the body is moving in - it stays
    // put, and the stability pass will say what such an orbit is worth.
    const circ = circularElementsAtState({ x: r[0], y: r[1], z: r[2] }, { x: v[0], y: v[1], z: v[2] });
    const distAU = Math.hypot(r[0], r[1], r[2]) / AU_M;
    if (!circ || !(distAU > 0)) return null;
    elements = { a_AU: distAU, e: 0, ...circ };
    mode = 'circular';
  }

  const orbit: Orbit = { hostId: host.id, hostMu: mu, t0: tMs, elements, lastEditedT0: Date.now() };
  // The importer's convention for a retrograde result, kept for consistency with imported bodies
  // (the 2D orrery reads the flag, the 3D propagator reads the inclination - see the B114 row).
  if (elements.i_deg > 90) orbit.isRetrogradeOrbit = true;

  body.parentId = host.id;
  body.orbit = orbit;
  body.roleHint = roleHintUnderHost(system, host, body);
  // A hand re-home is an independent orbit: a co-orbital marker would have the L-point derivation
  // re-home it straight back (LGR-2), and a construct-style UI parent has no meaning on a body.
  delete body.coOrbital;
  delete (body as { ui_parentId?: unknown }).ui_parentId;
  return { mode, hostId: host.id, hostName: host.name };
}
