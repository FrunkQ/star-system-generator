import type { System, CelestialBody, Barycenter } from '../types';
import { G } from '../constants';

export function stripAutoBarycenters(system: System) {
  const nodesById = new Map(system.nodes.map(n => [n.id, n]));
  const autoBarys = system.nodes.filter(n => n.kind === 'barycenter' && n.tags?.some(t => t.key === 'barycenter/auto')) as Barycenter[];
  
  for (const bary of autoBarys) {
    if (!bary.memberIds || bary.memberIds.length !== 2) continue;
    const m0 = nodesById.get(bary.memberIds[0]) as CelestialBody;
    const m1 = nodesById.get(bary.memberIds[1]) as CelestialBody;
    if (!m0 || !m1) continue;

    const primary = (m0.massKg || 0) >= (m1.massKg || 0) ? m0 : m1;
    const secondary = primary.id === m0.id ? m1 : m0;

    const separationAU = (m0.orbit?.elements.a_AU || 0) + (m1.orbit?.elements.a_AU || 0);

    primary.parentId = bary.parentId;
    primary.orbit = bary.orbit ? JSON.parse(JSON.stringify(bary.orbit)) : undefined;

    secondary.parentId = primary.id;
    secondary.orbit = {
      hostId: primary.id,
      hostMu: G * (primary.massKg || 0),
      t0: secondary.orbit?.t0 || 0,
      n_rad_per_s: secondary.orbit?.n_rad_per_s,
      elements: {
        ...(secondary.orbit?.elements || { e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0 }),
        a_AU: separationAU > 0 ? separationAU : 1e-9
      }
    };
  }

  system.nodes = system.nodes.filter(n => !(n.kind === 'barycenter' && n.tags?.some(t => t.key === 'barycenter/auto')));
}

export function rebuildSystemHierarchy(system: System): System {
  // 1. Strip all auto-barycenters to get a flat parent-child tree
  stripAutoBarycenters(system);

  const nodesById = new Map(system.nodes.map(n => [n.id, n]));

  // 2. Find the absolute heaviest body
  let heaviest: CelestialBody | null = null;
  let maxMass = -1;

  for (const node of system.nodes) {
    if (node.kind === 'body') {
      const mass = (node as CelestialBody).massKg || 0;
      if (mass > maxMass) {
        maxMass = mass;
        heaviest = node as CelestialBody;
      }
    }
  }

  if (!heaviest || heaviest.parentId === null) {
    return system; // Already the root
  }

  // 3. Trace path from heaviest to root
  const path: CelestialBody[] = [];
  let current: CelestialBody | null = heaviest;
  let limit = 100;
  
  while (current && limit > 0) {
    path.push(current);
    if (!current.parentId) break;
    const parent = nodesById.get(current.parentId) as CelestialBody;
    if (!parent || parent.kind !== 'body') break; // Stop if we hit a manual barycenter
    current = parent;
    limit--;
  }

  // 4. Reverse the parent-child links along the path
  // E.g., if path is [Planet (100 SM), Star (1 SM)]
  for (let i = 0; i < path.length - 1; i++) {
    const child = path[i];
    const parent = path[i + 1];

    const oldChildOrbit = child.orbit ? JSON.parse(JSON.stringify(child.orbit)) : undefined;
    const oldDistance = oldChildOrbit?.elements.a_AU || 1;

    parent.parentId = child.id;
    parent.orbit = {
      hostId: child.id,
      hostMu: G * (child.massKg || 0),
      t0: oldChildOrbit?.t0 || 0,
      n_rad_per_s: oldChildOrbit?.n_rad_per_s,
      elements: {
        ...(oldChildOrbit?.elements || { e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0 }),
        a_AU: oldDistance
      }
    };
  }

  // 5. The heaviest body becomes the new root
  heaviest.parentId = null;
  delete heaviest.orbit;

  return system;
}