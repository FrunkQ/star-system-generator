// src/lib/system/utils.ts
import type { System, ID, CelestialBody, Barycenter, BurnPlan, Orbit, RulePack } from '../types';
import { G, AU_KM } from '../constants';

export function rerollNode(__sys: System, __nodeId: ID, __pack: RulePack): System {
  // TODO M0: respect lock flags (future), re-generate subtree deterministically
  throw new Error("TODO: implement rerollNode (M0)");
}

export function computePlayerSnapshot(sys: System, _scopeRootId?: ID): System {
  const playerSystem = JSON.parse(JSON.stringify(sys)); // Deep copy to avoid modifying the original

  // TODO: Implement scoping by scopeRootId

  playerSystem.nodes = playerSystem.nodes.map((node: CelestialBody | Barycenter) => {
      // Remove GM-only fields
      delete (node as any).gmNotes;

      // Field-level visibility (not yet implemented in generator)
      if ((node as any).visibility?.fields) {
          for (const [field, isVisible] of Object.entries((node as any).visibility.fields)) {
              if (!isVisible) {
                  delete (node as any)[field];
              }
          }
      }
      return node;
  }).filter((node: CelestialBody | Barycenter) => (node as any).visibility?.visibleToPlayers !== false);

  // Also filter from the top-level system object
  delete (playerSystem as any).gmNotes;

  return playerSystem;
}

export function propagate(node: CelestialBody | Barycenter, tMs: number): {x: number, y: number} | null {
  if (node.kind !== 'body' || !node.orbit) {
    return { x: 0, y: 0 }; // Barycenters or root nodes are at the origin of their frame
  }

  const { elements, hostMu, t0 } = node.orbit;
  const { a_AU, e, M0_rad } = elements;

  if (hostMu === 0) return { x: 0, y: 0 };

  const a_m = a_AU * AU_KM * 1000; // semi-major axis in meters

  // 1. Mean motion (n)
  // Use pre-calculated mean motion for binary stars, otherwise calculate it.
  const n = node.orbit.n_rad_per_s ?? Math.sqrt(hostMu / Math.pow(a_m, 3));

  // 2. Mean anomaly (M) at time t
  const M = M0_rad + n * ((tMs - t0) / 1000);

  // 3. Solve Kepler's Equation for Eccentric Anomaly (E) using Newton-Raphson
  let E = M; // Initial guess
  for (let i = 0; i < 10; i++) { // Iterate a few times for precision
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-6) break;
  }

  // 4. True Anomaly (f)
  const f = 2 * Math.atan2(
      Math.sqrt(1 + e) * Math.sin(E / 2),
      Math.sqrt(1 - e) * Math.cos(E / 2)
  );

  // 5. Distance to central body (r)
  const r = a_m * (1 - e * Math.cos(E));

  // 6. Position in orbital frame (z=0 for 2D projection)
  const x = r * Math.cos(f) / AU_KM / 1000; // convert back to AU for visualization scale
  const y = r * Math.sin(f) / AU_KM / 1000;

  // TODO: Apply argument of periapsis and longitude of ascending node rotations for inclined orbits

  return { x, y };
}

export function applyImpulsiveBurn(__body: CelestialBody, __burn: BurnPlan, __sys: System): CelestialBody {
  // TODO M6: apply Δv in perifocal frame; recompute elements via Gauss equations
  throw new Error("TODO: implement applyImpulsiveBurn (M6)");
}
