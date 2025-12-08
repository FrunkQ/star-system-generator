// src/lib/system/utils.ts
import type { System, ID, CelestialBody, Barycenter, BurnPlan, Orbit, RulePack, SystemNode } from '../types';
import { G, AU_KM } from '../constants';
import { propagateState } from '../physics/orbits';

/**
 * Recursively calculates a node's average orbital distance (semi-major axis) from the root star in AU.
 * This is used for consistent sorting in dropdowns, independent of current time.
 */
export function getAbsoluteOrbitalDistanceAU(node: SystemNode, system: System): number {
    let distance = 0;
    let current: SystemNode | undefined = node;
    let loops = 0;

    while (current && loops < 10) { // Max 10 levels deep to prevent infinite loops
        if (current.orbit && current.orbit.elements.a_AU !== undefined) {
            distance += current.orbit.elements.a_AU;
        }
        if (current.parentId) {
            current = system.nodes.find(n => n.id === current.parentId);
        } else {
            current = undefined; // Reached the root
        }
        loops++;
    }
    return distance;
}

export function rerollNode(__sys: System, __nodeId: ID, __pack: RulePack): System {
  // TODO M0: respect lock flags (future), re-generate subtree deterministically
  throw new Error("TODO: implement rerollNode (M0)");
}

export function computePlayerSnapshot(sys: System, _scopeRootId?: ID): System {
  const playerSystem = JSON.parse(JSON.stringify(sys)); // Deep copy to avoid modifying the original

  // 1. Identify hidden nodes and propagate hiding to children
  const hiddenIds = new Set<ID>();
  
  // Initial pass: nodes explicitly marked hidden
  for (const node of playerSystem.nodes) {
      if ((node as any).object_playerhidden) {
          hiddenIds.add(node.id);
      }
  }

  // Build parent->children map for efficient traversal
  const childrenMap = new Map<ID, ID[]>();
  for (const node of playerSystem.nodes) {
      if (node.parentId) {
          if (!childrenMap.has(node.parentId)) childrenMap.set(node.parentId, []);
          childrenMap.get(node.parentId)!.push(node.id);
      }
  }

  // Recursive hiding function
  function hideSubtree(rootId: ID) {
      hiddenIds.add(rootId);
      const children = childrenMap.get(rootId) || [];
      for (const childId of children) {
          hideSubtree(childId); // Recursively hide children
      }
  }

  // Trigger hiding for all explicitly hidden nodes
  const initialHidden = Array.from(hiddenIds);
  for (const id of initialHidden) {
      hideSubtree(id);
  }

  // 2. Filter and Sanitize
  playerSystem.nodes = playerSystem.nodes.filter((node: any) => !hiddenIds.has(node.id)).map((node: CelestialBody | Barycenter) => {
      // Remove GM-only fields
      delete (node as any).gmNotes;

      // Handle Description Hiding
      if ((node as any).description_playerhidden) {
          delete (node as any).description;
      }

      return node;
  });

  // Also filter from the top-level system object
  delete (playerSystem as any).gmNotes;

  return playerSystem;
}

export function propagate(node: CelestialBody | Barycenter, tMs: number): {x: number, y: number} | null {
  const state = propagateState(node as any, tMs);
  return state.r;
}

export function applyImpulsiveBurn(__body: CelestialBody, __burn: BurnPlan, __sys: System): CelestialBody {
  // TODO M6: apply Δv in perifocal frame; recompute elements via Gauss equations
  throw new Error("TODO: implement applyImpulsiveBurn (M6)");
}

export function sanitizeSystem(system: System): System {
    const nodesById = new Map(system.nodes.map(n => [n.id, n]));
    let changed = false;
    
    const newNodes = system.nodes.map(node => {
        if (node.kind === 'construct' && node.placement === 'Surface' && node.parentId && node.orbit) {
            const parent = nodesById.get(node.parentId);
            if (parent && (parent.kind === 'body' || parent.kind === 'barycenter')) {
                let modified = false;
                const newOrbit = { ...node.orbit };
                
                // 1. Fix Host ID if mismatch
                if (newOrbit.hostId !== parent.id) {
                    console.warn(`Fixing hostId for ${node.name}: ${newOrbit.hostId} -> ${parent.id}`);
                    newOrbit.hostId = parent.id;
                    modified = true;
                }
                
                // 2. Fix Host Mu (Gravity) if it doesn't match parent mass
                const mass = (parent as CelestialBody).massKg || (parent as Barycenter).effectiveMassKg || 0;
                const expectedMu = mass * 6.67430e-11;
                // Allow small floating point diffs
                if (expectedMu > 0 && Math.abs(newOrbit.hostMu - expectedMu) > expectedMu * 0.01) {
                     console.warn(`Fixing hostMu for ${node.name}: ${newOrbit.hostMu} -> ${expectedMu}`);
                     newOrbit.hostMu = expectedMu;
                     modified = true;
                }
                
                // 3. Fix Surface Lock Speed (n_rad_per_s)
                // Only fix if missing or drastically wrong
                const rotationHours = (parent as any).rotation_period_hours || (parent as any).physical_parameters?.rotation_period_hours;
                if (rotationHours) {
                    const periodSeconds = rotationHours * 3600;
                    if (periodSeconds !== 0 && isFinite(periodSeconds)) {
                        const expectedN = (2 * Math.PI) / periodSeconds;
                        if (!newOrbit.n_rad_per_s || Math.abs(newOrbit.n_rad_per_s - expectedN) > 0.000001) {
                             console.warn(`Fixing surface lock for ${node.name}`);
                             newOrbit.n_rad_per_s = expectedN;
                             modified = true;
                        }
                    }
                }
                
                if (modified) {
                    changed = true;
                    return { ...node, orbit: newOrbit };
                }
            }
        }
        return node;
    });
    
    if (changed) {
        return { ...system, nodes: newNodes, isManuallyEdited: true };
    }
    return system;
}