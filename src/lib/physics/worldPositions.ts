// Single source of truth for per-frame world positions. The 2D orrery and the 3D holo view both
// walk the orbital hierarchy the same way — accumulate each node's propagated offset onto its
// parent — differing ONLY in the propagator: propagateState (flat, ω-only, what the orrery draws)
// vs propagateState3D (full i/Ω rotation, what the holo view needs). Keeping one walk here means
// the two views can never drift in how they place bodies. See docs/dev/v2.2-3d-design.md.
//
// C9: the 3D walk also puts every satellite in the frame its elements are actually quoted in — see
// `../system/satelliteFrame.ts`. That correction used to live in the RENDERER alone, so the
// propagator and the holo view answered "where is this moon" differently, by the parent's axial
// tilt (25.19 deg for Mars, 97.77 for Uranus), and anything else reading positions — the eclipse
// search first — got the wrong plane. It belongs here, once, at the source.
import { propagateState, propagateState3D } from './orbits';
import { satelliteTiltRad, toParentEquator } from '../system/satelliteFrame';
import type { System } from '../types';

export interface Vec2 { x: number; y: number; }
export interface Vec3 { x: number; y: number; z: number; }

// Per-frame construct kinematics sampler (transit path / gravity coast / post-arrival parking
// orbit) — returns an ABSOLUTE in-plane position in AU, or null to fall back to hierarchy placement.
// Injected rather than imported so this module depends only on the propagator, not on transit code.
export type ConstructSampler = (
  system: System,
  node: any,
  timeMs: number
) => { position_au: { x: number; y: number } } | null;

interface WalkOps<V> {
  zero: V;
  add: (a: V, b: V) => V;
  lift: (p: { x: number; y: number }) => V; // absolute 2D construct position -> V
  propagate: (node: any, timeMs: number) => V | null;
  // Carry a node's parent-relative offset out of the system frame and into the frame its elements
  // are quoted in. 3D ONLY, and deliberately absent from the flat walk: the orrery propagates
  // omega-only in the reference plane, so there is no out-of-plane axis for an equatorial rotation
  // to tilt into — 2D is the plan view, and a satellite's plan position is its projection.
  frame?: (node: any, parent: any, relative: V) => V;
}

// Generic hierarchy walk, memoised per node. Faithfully mirrors the orrery's original
// calculateWorldPositions: constructs with a live schedule are placed absolutely by their journey
// kinematics (or a stored vector), everything else is parent + propagated orbital offset.
function walkPositions<V>(
  system: System | null,
  timeMs: number,
  ops: WalkOps<V>,
  sampleConstruct?: ConstructSampler
): Map<string, V> {
  const out = new Map<string, V>();
  if (!system) return out;
  const nodesById = new Map(system.nodes.map((n) => [n.id, n]));

  function resolve(nodeId: string): V {
    const cached = out.get(nodeId);
    if (cached !== undefined) return cached;
    const node = nodesById.get(nodeId) as any;
    if (!node) return ops.zero;

    // Constructs mid-journey are positioned absolutely by their kinematics, not the hierarchy.
    if (node.kind === 'construct') {
      // The sampler is consulted when the node carries EITHER description of its course: the GM's
      // journeys, or the compact `route` a player snapshot gets instead (`slimNode` strips the
      // journeys, so on a player the old journeys-only gate starved the sampler of the very nodes
      // it exists for). Which sampler runs is the CALLER'S policy: the orrery passes the full
      // journey kinematics, a followed player view passes the route sampler, and a free-scrubbing
      // player view passes none at all - a scrubbing player is looking around, not tracking live
      // traffic, so a transiting ship holds its GM-stamped truth rather than replaying its course
      // against a clock the GM does not control (the owner's rule, 2026-08-08).
      if ((node.scheduled_journeys || []).length || (node.route?.p?.length ?? 0) >= 2) {
        const s = sampleConstruct?.(system, node, timeMs);
        if (s) {
          const v = ops.lift(s.position_au);
          out.set(nodeId, v);
          return v;
        }
      }
      // A STAMPED VECTOR STANDS ON ITS OWN, and gating it on the journeys was a redaction fault
      // wearing a physics costume. `slimNode` deletes `scheduled_journeys` from every player
      // snapshot, so on a player this guard could never be entered - a ship under way fell straight
      // through to parent-plus-orbit and drew at its PARKED position, back at the host it left,
      // while the GM showed it out in space. The vector is the GM's own answer, stamped by
      // SystemView's reconcile tick and re-sent with each snapshot; the ship therefore steps with
      // the GM's clock rather than running one of its own, which is the intended boundary (transit
      // is GM land). `visibleNodes` already treats a stamped vector as "this construct is placed",
      // so this makes the position agree with the visibility that was always keyed off it.
      // Self-cleaning: the reconcile tick clears the field when a ship parks, and deliberately
      // KEEPS it for a Deep Space drifter - where using it is also the right answer, since an
      // adrift ship must not snap back to the orbit it abandoned.
      if (node.vector_position_au) {
        const v = ops.lift(node.vector_position_au);
        out.set(nodeId, v);
        return v;
      }
    }

    if (node.parentId === null) {
      out.set(nodeId, ops.zero);
      return ops.zero;
    }

    const parentPos = resolve(node.parentId);
    let relative = ops.zero;
    if ((node.kind === 'body' || node.kind === 'construct' || node.kind === 'barycenter') && node.orbit) {
      // A stationary (massless) construct sits at its epoch position, not the live clock.
      const isStationary = node.kind === 'construct' && (node.physical_parameters?.massKg || 0) === 0;
      const timeToPropagate = isStationary ? node.orbit.t0 : timeMs;
      const p = ops.propagate(node, timeToPropagate);
      // Parent before child is guaranteed by the recursion (resolve(parentId) above), which is what
      // lets a moon's framed offset be added onto its parent's already-framed position.
      if (p) relative = ops.frame ? ops.frame(node, nodesById.get(node.parentId), p) : p;
    }
    const abs = ops.add(parentPos, relative);
    out.set(nodeId, abs);
    return abs;
  }

  for (const node of system.nodes) resolve(node.id);
  return out;
}

/**
 * Flat (2D) world positions in AU — the projection the orrery draws (ω-only). Byte-for-byte
 * equivalent to the orrery's former inline calculateWorldPositions when given the same sampler.
 */
export function computeWorldPositions(
  system: System | null,
  timeMs: number,
  sampleConstruct?: ConstructSampler
): Map<string, Vec2> {
  return walkPositions<Vec2>(
    system,
    timeMs,
    {
      zero: { x: 0, y: 0 },
      add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
      lift: (p) => ({ x: p.x, y: p.y }),
      propagate: (node, t) => propagateState(node, t).r
    },
    sampleConstruct
  );
}

/**
 * Inclination-aware (3D) world positions in AU (reference plane = z 0) — what the holo view uses.
 * Constructs are lifted to the plane (z=0); coplanar systems match computeWorldPositions exactly.
 *
 * Satellites arrive in their PARENT'S EQUATORIAL frame (C3/C9), because that is the frame their
 * inclinations are quoted in. A construct placed absolutely by the transit sampler is never rotated
 * — its kinematics are already an absolute answer, and it returns above before this runs.
 */
export function computeWorldPositions3D(
  system: System | null,
  timeMs: number,
  sampleConstruct?: ConstructSampler
): Map<string, Vec3> {
  return walkPositions<Vec3>(
    system,
    timeMs,
    {
      zero: { x: 0, y: 0, z: 0 },
      add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
      lift: (p) => ({ x: p.x, y: p.y, z: 0 }),
      propagate: (node, t) => propagateState3D(node, t).r,
      frame: (node, parent, r) => {
        const tilt = satelliteTiltRad(node, parent);
        return tilt ? toParentEquator(r.x, r.y, r.z, tilt, { x: 0, y: 0, z: 0 }) : r;
      }
    },
    sampleConstruct
  );
}

export interface WorldState3 { r: Vec3; v: Vec3; }

/**
 * The same 3D walk carrying VELOCITY beside position (AU and AU/s). A body's world velocity is its
 * parent's plus its own propagated relative velocity, framed exactly as the position is, so this
 * is the position walk with one more operand and not a second walk. A construct placed absolutely
 * by the sampler contributes no velocity (the sampler answers position only).
 *
 * G64: re-homing a body needs its full state at the display instant to re-express its orbit about
 * a different host without moving it - the same conversion an import performs on a state vector.
 */
export function computeWorldStates3D(
  system: System | null,
  timeMs: number,
  sampleConstruct?: ConstructSampler
): Map<string, WorldState3> {
  const zero3 = () => ({ x: 0, y: 0, z: 0 });
  return walkPositions<WorldState3>(
    system,
    timeMs,
    {
      zero: { r: zero3(), v: zero3() },
      add: (a, b) => ({
        r: { x: a.r.x + b.r.x, y: a.r.y + b.r.y, z: a.r.z + b.r.z },
        v: { x: a.v.x + b.v.x, y: a.v.y + b.v.y, z: a.v.z + b.v.z }
      }),
      lift: (p) => ({ r: { x: p.x, y: p.y, z: 0 }, v: zero3() }),
      propagate: (node, t) => propagateState3D(node, t),
      frame: (node, parent, s) => {
        const tilt = satelliteTiltRad(node, parent);
        if (!tilt) return s;
        return {
          r: toParentEquator(s.r.x, s.r.y, s.r.z, tilt, zero3()),
          v: toParentEquator(s.v.x, s.v.y, s.v.z, tilt, zero3())
        };
      }
    },
    sampleConstruct
  );
}
