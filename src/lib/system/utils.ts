// src/lib/system/utils.ts
import type { System, ID, CelestialBody, Barycenter, BurnPlan, Orbit, RulePack } from '../types';
import { G, AU_KM } from '../constants';

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
  if ((node.kind !== 'body' && node.kind !== 'construct') || !node.orbit) {
    return { x: 0, y: 0 }; // Barycenters or root nodes are at the origin of their frame
  }

  const { elements, hostMu, t0 } = node.orbit;
  const { a_AU, e, M0_rad } = elements;

  if (hostMu === 0) return { x: 0, y: 0 };

  const a_m = a_AU * AU_KM * 1000; // semi-major axis in meters

  // 1. Mean motion (n)
  // Use pre-calculated mean motion for binary stars, otherwise calculate it.
  let n = node.orbit.n_rad_per_s ?? Math.sqrt(hostMu / Math.pow(a_m, 3));
  if (node.orbit.isRetrogradeOrbit) {
    n = -n;
  }

  // 2. Mean anomaly (M) at time t
  const M = M0_rad + n * ((tMs - t0) / 1000);

  // 3. Solve Kepler's Equation for Eccentric Anomaly (E)
  let E: number;
  if (e === 0) {
    E = M; // For a circle, Eccentric Anomaly is the same as Mean Anomaly
  } else {
    E = M; // Initial guess for Newton-Raphson
    for (let i = 0; i < 10; i++) { // Iterate a few times for precision
      const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-6) break;
    }
  }

  // 4. True Anomaly (f)
  let f: number;
  if (e === 0) {
    f = M; // For a circle, True Anomaly is the same as Mean Anomaly
  } else {
    f = 2 * Math.atan2(
        Math.sqrt(1 + e) * Math.sin(E / 2),
        Math.sqrt(1 - e) * Math.cos(E / 2)
    );
  }

  // 5. Distance to central body (r)
  const r = a_m * (1 - e * Math.cos(E));

  // 6. Position in orbital frame (z=0 for 2D projection)
  const x_perifocal = r * Math.cos(f) / AU_KM / 1000; // convert back to AU for visualization scale
  const y_perifocal = r * Math.sin(f) / AU_KM / 1000;

  // Apply 2D rotation based on Argument of Periapsis (omega) to match visualizer
  const omega_rad = (node.orbit.elements.omega_deg || 0) * (Math.PI / 180);
  
  const x = x_perifocal * Math.cos(omega_rad) - y_perifocal * Math.sin(omega_rad);
  const y = x_perifocal * Math.sin(omega_rad) + y_perifocal * Math.cos(omega_rad);

  return { x, y };
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