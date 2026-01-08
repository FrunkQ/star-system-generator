// src/lib/system/utils.ts
import type { System, ID, CelestialBody, Barycenter, BurnPlan, Orbit, RulePack, SystemNode } from '../types';
import { G, AU_KM } from '../constants';
import { propagateState } from '../physics/orbits';
import { recalculateSystemPhysics } from './postprocessing';

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

export function sanitizeSystem(system: System, rulePack: RulePack): System {
    const nodesById = new Map(system.nodes.map(n => [n.id, n]));
    let changed = false;
    
    // 1. Structural Fixes (Constructs, Legacy Rings)
    const newNodes = system.nodes.map(node => {
        let currentNode = { ...node }; // Clone for potential modification
        let modified = false;

        // --- Fix 1: Surface Constructs ---
        if (currentNode.kind === 'construct' && currentNode.placement === 'Surface' && currentNode.parentId && currentNode.orbit) {
            const parent = nodesById.get(currentNode.parentId);
            if (parent && (parent.kind === 'body' || parent.kind === 'barycenter')) {
                const newOrbit = { ...currentNode.orbit };
                let orbitModified = false;
                
                // 1. Fix Host ID if mismatch
                if (newOrbit.hostId !== parent.id) {
                    console.warn(`Fixing hostId for ${currentNode.name}: ${newOrbit.hostId} -> ${parent.id}`);
                    newOrbit.hostId = parent.id;
                    orbitModified = true;
                }
                
                // 2. Fix Host Mu (Gravity) if it doesn't match parent mass
                const mass = (parent as CelestialBody).massKg || (parent as Barycenter).effectiveMassKg || 0;
                const expectedMu = mass * 6.67430e-11;
                // Allow small floating point diffs
                if (expectedMu > 0 && Math.abs(newOrbit.hostMu - expectedMu) > expectedMu * 0.01) {
                     console.warn(`Fixing hostMu for ${currentNode.name}: ${newOrbit.hostMu} -> ${expectedMu}`);
                     newOrbit.hostMu = expectedMu;
                     orbitModified = true;
                }
                
                // 3. Fix Surface Lock Speed (n_rad_per_s)
                const rotationHours = (parent as any).rotation_period_hours || (parent as any).physical_parameters?.rotation_period_hours;
                if (rotationHours) {
                    const periodSeconds = rotationHours * 3600;
                    if (periodSeconds !== 0 && isFinite(periodSeconds)) {
                        const expectedN = (2 * Math.PI) / periodSeconds;
                        if (!newOrbit.n_rad_per_s || Math.abs(newOrbit.n_rad_per_s - expectedN) > 0.000001) {
                             console.warn(`Fixing surface lock for ${currentNode.name}`);
                             newOrbit.n_rad_per_s = expectedN;
                             orbitModified = true;
                        }
                    }
                }
                
                if (orbitModified) {
                    currentNode.orbit = newOrbit;
                    modified = true;
                }
            }
        }

        // --- Fix 2: Legacy Rings (Upgrade to Orbit) ---
        if (currentNode.kind === 'body' && currentNode.roleHint === 'ring' && !currentNode.orbit && currentNode.radiusInnerKm && currentNode.parentId) {
            const parent = nodesById.get(currentNode.parentId);
            if (parent && (parent.kind === 'body' || parent.kind === 'barycenter')) {
                console.warn(`Upgrading Legacy Ring: ${currentNode.name}`);
                const mass = (parent as CelestialBody).massKg || (parent as Barycenter).effectiveMassKg || 0;
                const avgRadiusKm = (currentNode.radiusInnerKm + (currentNode.radiusOuterKm || currentNode.radiusInnerKm)) / 2;
                const a_AU = avgRadiusKm / AU_KM;

                currentNode.orbit = {
                    hostId: parent.id,
                    hostMu: mass * G,
                    t0: Date.now(), // or system.epochT0
                    elements: {
                        a_AU: a_AU,
                        e: 0, // Circular
                        i_deg: 0,
                        omega_deg: 0,
                        Omega_deg: 0,
                        M0_rad: Math.random() * 2 * Math.PI
                    }
                };
                modified = true;
            }
        }

        if (modified) {
            changed = true;
            return currentNode;
        }
        return node;
    });
    
    // 2. Physics Recalculation (Temperature, Radiation, Zones)
    // We run this unconditionally to ensure all loaded saves are consistent with latest logic
    const systemWithStructure = changed ? { ...system, nodes: newNodes, isManuallyEdited: true } : system;
    const fullyUpdatedSystem = recalculateSystemPhysics(systemWithStructure, rulePack);

    // If structure changed OR physics changed something (which recalculateSystemPhysics might not report as 'changed' boolean, but it mutates)
    // Actually recalculateSystemPhysics mutates in place if we pass the object.
    // So we should return the result.
    
    return fullyUpdatedSystem;
}