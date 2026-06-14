import type { Barycenter, CelestialBody, Orbit, System } from '../types';
import { G } from '../constants';
import { generateId } from '../utils';

const PROMOTE_RATIO = 0.08;
const DEMOTE_RATIO = 0.05;

function getMass(node: CelestialBody | Barycenter | undefined): number {
  if (!node) return 0;
  if (node.kind === 'barycenter') return node.effectiveMassKg || 0;
  return node.massKg || 0;
}

function cloneOrbit(orbit: Orbit): Orbit {
  return JSON.parse(JSON.stringify(orbit));
}

function normalizeAngle(rad: number): number {
  const twoPi = Math.PI * 2;
  let v = rad % twoPi;
  if (v < 0) v += twoPi;
  return v;
}

function isAutoBarycenter(bary: Barycenter): boolean {
  return !!bary.tags?.some((t) => t.key === 'barycenter/auto');
}

function promoteMassiveCompanion(system: System): boolean {
  const nodesById = new Map(system.nodes.map((n) => [n.id, n]));

  for (const node of system.nodes) {
    if (node.kind !== 'body') continue;
    const secondary = node as CelestialBody;
    if (!secondary.orbit || secondary.parentId === undefined) continue;
    // Belts/rings carry massKg only as a debris-density proxy — never a gravitational companion.
    if (secondary.roleHint === 'belt' || secondary.roleHint === 'ring') continue;

    const primary = nodesById.get(secondary.parentId as string);
    if (!primary || primary.kind !== 'body') continue;

    const primaryBody = primary as CelestialBody;
    if (primaryBody.parentId === secondary.id) continue;

    const mPrimary = getMass(primaryBody);
    const mSecondary = getMass(secondary);
    if (mPrimary <= 0 || mSecondary <= 0) continue;

    const ratio = Math.min(mPrimary, mSecondary) / Math.max(mPrimary, mSecondary);
    if (ratio < PROMOTE_RATIO) continue;

    const originalHostId = primaryBody.parentId;
    const originalHost = originalHostId ? nodesById.get(originalHostId) : null;
    if (originalHostId && !originalHost) continue;

    const pairMass = mPrimary + mSecondary;
    const separationAU = Math.max(secondary.orbit.elements.a_AU || 0, 1e-9);

    const primaryWasHeavier = mPrimary >= mSecondary;
    const heavy = primaryWasHeavier ? primaryBody : secondary;
    const light = primaryWasHeavier ? secondary : primaryBody;
    const mHeavy = getMass(heavy);
    const mLight = getMass(light);

    // Preserve the original host-track orbit (around star/parent), not the local pair orbit.
    const hostTrackOrbit = primaryBody.orbit ? cloneOrbit(primaryBody.orbit) : undefined;
    const phaseBase = normalizeAngle(light.orbit?.elements.M0_rad ?? 0);

    const baryId = `bary-auto-${generateId()}`;
    const barycenter: Barycenter = {
      id: baryId,
      kind: 'barycenter',
      name: `${heavy.name}-${light.name} Barycenter`,
      parentId: originalHostId,
      memberIds: [heavy.id, light.id],
      effectiveMassKg: pairMass,
      orbit: (hostTrackOrbit && originalHostId && originalHost) ? {
        ...cloneOrbit(hostTrackOrbit),
        hostId: originalHostId,
        hostMu: G * getMass(originalHost as CelestialBody | Barycenter)
      } : undefined,
      tags: [{ key: 'barycenter/auto' }]
    };

    const aHeavy = separationAU * (mLight / pairMass);
    const aLight = separationAU * (mHeavy / pairMass);
    const pairMu = G * pairMass;

    heavy.parentId = baryId;
    light.parentId = baryId;

    heavy.orbit = {
      hostId: baryId,
      hostMu: pairMu,
      t0: hostTrackOrbit ? hostTrackOrbit.t0 : (light.orbit?.t0 ?? 0),
      n_rad_per_s: hostTrackOrbit?.n_rad_per_s,
      elements: {
        ...(hostTrackOrbit ? hostTrackOrbit.elements : { e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0 }),
        a_AU: aHeavy,
        M0_rad: normalizeAngle(phaseBase + Math.PI)
      }
    };

    light.orbit = {
      hostId: baryId,
      hostMu: pairMu,
      t0: light.orbit?.t0 ?? (hostTrackOrbit?.t0 ?? 0),
      n_rad_per_s: light.orbit?.n_rad_per_s,
      elements: {
        ...(light.orbit?.elements || (hostTrackOrbit ? hostTrackOrbit.elements : { e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0 })),
        a_AU: aLight,
        M0_rad: phaseBase
      }
    };

    system.nodes.push(barycenter);
    return true;
  }

  return false;
}

function demoteWeakBinary(system: System): boolean {
  const nodesById = new Map(system.nodes.map((n) => [n.id, n]));

  for (const node of system.nodes) {
    if (node.kind !== 'barycenter') continue;
    const bary = node as Barycenter;
    if (!isAutoBarycenter(bary)) continue;
    if (!bary.memberIds || bary.memberIds.length !== 2) continue;

    const m0 = nodesById.get(bary.memberIds[0]);
    const m1 = nodesById.get(bary.memberIds[1]);
    if (!m0 || !m1 || m0.kind !== 'body' || m1.kind !== 'body') continue;

    const body0 = m0 as CelestialBody;
    const body1 = m1 as CelestialBody;
    if (!body0.orbit || !body1.orbit) continue;

    const mass0 = getMass(body0);
    const mass1 = getMass(body1);
    if (mass0 <= 0 || mass1 <= 0) continue;

    const ratio = Math.min(mass0, mass1) / Math.max(mass0, mass1);
    if (ratio > DEMOTE_RATIO) continue;

    const primary = mass0 >= mass1 ? body0 : body1;
    const secondary = primary.id === body0.id ? body1 : body0;
    const primaryMass = getMass(primary);
    if (primaryMass <= 0) continue;

    const separationAU = (body0.orbit.elements.a_AU || 0) + (body1.orbit.elements.a_AU || 0);
    const fallbackSeparation = separationAU > 0 ? separationAU : Math.max(secondary.orbit.elements.a_AU || 0, 1e-9);

    primary.parentId = bary.parentId;
    primary.orbit = bary.orbit ? cloneOrbit(bary.orbit) : undefined;

    secondary.parentId = primary.id;
    secondary.orbit = {
      hostId: primary.id,
      hostMu: G * primaryMass,
      t0: secondary.orbit.t0,
      n_rad_per_s: secondary.orbit.n_rad_per_s,
      elements: {
        ...secondary.orbit.elements,
        a_AU: fallbackSeparation
      }
    };

    system.nodes = system.nodes.filter((n) => n.id !== bary.id);
    return true;
  }

  return false;
}

// Remove GHOST barycentres — ones that nothing actually orbits (no node has them as a parent). Demote
// chains and stale saves can leave a barycentre whose members were re-homed elsewhere (e.g. a member
// still points at the star, or at a since-removed nested barycentre). Such a ghost has a dangling
// parentId, so it resolves to the system centre (0,0) and drags anything under it to the middle.
// Since nothing references a ghost, deleting it moves nothing — it just clears the stray centre marker
// and the corrupt reference. Also prunes member-id lists of removed/ghost ids.
function removeGhostBarycenters(system: System): boolean {
  const childCount = new Map<string, number>();
  for (const n of system.nodes) if (n.parentId) childCount.set(n.parentId, (childCount.get(n.parentId) || 0) + 1);
  const ghostIds = new Set(
    system.nodes.filter((n) => n.kind === 'barycenter' && !(childCount.get(n.id) ?? 0)).map((n) => n.id)
  );
  if (!ghostIds.size) return false;
  system.nodes = system.nodes.filter((n) => !ghostIds.has(n.id));
  for (const n of system.nodes) {
    if (n.kind === 'barycenter' && Array.isArray((n as Barycenter).memberIds)) {
      (n as Barycenter).memberIds = (n as Barycenter).memberIds.filter((id) => !ghostIds.has(id));
    }
  }
  return true;
}

// The system root — the node nothing orbits (parentId null). Prefer a star/bary if several somehow lack a parent.
function findRoot(system: System): CelestialBody | Barycenter | undefined {
  const roots = system.nodes.filter((n) => !n.parentId);
  return roots.find((n) => n.kind === 'barycenter' || (n as CelestialBody).roleHint === 'star') ?? roots[0];
}

// Re-home any node whose parentId points at a node that no longer exists. A dangling parent resolves to
// the system centre (0,0) in the positioner, so the node — and a binary pair under a dangling barycentre —
// collapses to the middle "no matter where it orbits". Reparent it to the root and re-point its orbit at
// the root so it sits at a real distance again. a_AU is preserved (it was a distance from a real host);
// only a missing/zero a_AU is given a sane default so the node isn't left stacked on the centre.
function reparentDanglingNodes(system: System): boolean {
  const ids = new Set(system.nodes.map((n) => n.id));
  const root = findRoot(system);
  if (!root) return false;
  const rootMass = getMass(root);
  let changed = false;
  for (const n of system.nodes) {
    if (!n.parentId || ids.has(n.parentId)) continue;
    if (n.id === root.id) { n.parentId = null; changed = true; continue; }
    n.parentId = root.id;
    const a = n.orbit?.elements.a_AU;
    n.orbit = {
      t0: n.orbit?.t0 ?? 0,
      ...n.orbit,
      hostId: root.id,
      hostMu: G * rootMass,
      elements: {
        e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0,
        ...(n.orbit?.elements ?? {}),
        a_AU: a && a > 0 ? a : 1
      }
    } as Orbit;
    changed = true;
  }
  return changed;
}

// Repair a barycentre that has a valid parent but a degenerate own-orbit (no orbit, zero host mass, or
// zero/absent a_AU). Such a pair sits exactly on its parent — typically the central star — so the binary
// renders dead-centre and editing the members (which only sets the *separation*) never moves it. We can't
// recover the original distance once it's gone, so we restore a valid, non-zero orbit around the parent
// (keeping any surviving a_AU) which both un-sticks it from the centre and makes it editable again.
function repairDegenerateAutoBary(system: System): boolean {
  const nodesById = new Map(system.nodes.map((n) => [n.id, n]));
  let changed = false;
  for (const node of system.nodes) {
    if (node.kind !== 'barycenter') continue;
    const bary = node as Barycenter;
    if (!bary.parentId) continue;                  // root barycentre legitimately sits at the centre
    const parent = nodesById.get(bary.parentId);
    if (!parent) continue;                          // dangling parent is handled by reparentDanglingNodes
    const parentMass = getMass(parent as CelestialBody | Barycenter);
    if (parentMass <= 0) continue;
    const a = bary.orbit?.elements.a_AU ?? 0;
    const degenerate = !bary.orbit || (bary.orbit.hostMu ?? 0) <= 0 || a <= 0;
    if (!degenerate) continue;
    bary.orbit = {
      t0: bary.orbit?.t0 ?? 0,
      ...bary.orbit,
      hostId: bary.parentId,
      hostMu: G * parentMass,
      elements: {
        e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0,
        ...(bary.orbit?.elements ?? {}),
        a_AU: a > 0 ? a : 1
      }
    } as Orbit;
    changed = true;
  }
  return changed;
}

export function reconcileBarycenters(system: System): System {
  // Run until stable to handle create/remove chains from one edit.
  for (let i = 0; i < 8; i++) {
    const reparented = reparentDanglingNodes(system);
    const promoted = promoteMassiveCompanion(system);
    const demoted = demoteWeakBinary(system);
    const healed = removeGhostBarycenters(system);
    const repaired = repairDegenerateAutoBary(system);
    if (!reparented && !promoted && !demoted && !healed && !repaired) break;
  }
  return system;
}
