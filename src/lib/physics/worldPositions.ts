// Single source of truth for per-frame world positions. The 2D orrery and the 3D holo view both
// walk the orbital hierarchy the same way — accumulate each node's propagated offset onto its
// parent — differing ONLY in the propagator: propagateState (flat, ω-only, what the orrery draws)
// vs propagateState3D (full i/Ω rotation, what the holo view needs). Keeping one walk here means
// the two views can never drift in how they place bodies. See docs/dev/v2.2-3d-design.md.
import { propagateState, propagateState3D } from './orbits';
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
    if (node.kind === 'construct' && (node.scheduled_journeys || []).length) {
      const s = sampleConstruct?.(system, node, timeMs);
      if (s) {
        const v = ops.lift(s.position_au);
        out.set(nodeId, v);
        return v;
      }
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
      if (p) relative = p;
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
      propagate: (node, t) => propagateState3D(node, t).r
    },
    sampleConstruct
  );
}
