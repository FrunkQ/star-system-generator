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
    if (!secondary.orbit || !secondary.parentId) continue;

    const primary = nodesById.get(secondary.parentId);
    if (!primary || primary.kind !== 'body') continue;

    const primaryBody = primary as CelestialBody;
    if (!primaryBody.parentId || !primaryBody.orbit) continue;
    if (primaryBody.parentId === secondary.id) continue;

    const mPrimary = getMass(primaryBody);
    const mSecondary = getMass(secondary);
    if (mPrimary <= 0 || mSecondary <= 0) continue;

    const ratio = Math.min(mPrimary, mSecondary) / Math.max(mPrimary, mSecondary);
    if (ratio < PROMOTE_RATIO) continue;

    const originalHostId = primaryBody.parentId;
    const originalHost = nodesById.get(originalHostId);
    if (!originalHost) continue;

    const pairMass = mPrimary + mSecondary;
    const separationAU = Math.max(secondary.orbit.elements.a_AU || 0, 1e-9);

    const primaryWasHeavier = mPrimary >= mSecondary;
    const heavy = primaryWasHeavier ? primaryBody : secondary;
    const light = primaryWasHeavier ? secondary : primaryBody;
    const mHeavy = getMass(heavy);
    const mLight = getMass(light);

    // Preserve the original host-track orbit (around star/parent), not the local pair orbit.
    const hostTrackOrbit = cloneOrbit(primaryBody.orbit);
    const phaseBase = normalizeAngle(light.orbit?.elements.M0_rad ?? 0);

    const baryId = `bary-auto-${generateId()}`;
    const barycenter: Barycenter = {
      id: baryId,
      kind: 'barycenter',
      name: `${heavy.name}-${light.name} Barycenter`,
      parentId: originalHostId,
      memberIds: [heavy.id, light.id],
      effectiveMassKg: pairMass,
      orbit: {
        ...cloneOrbit(hostTrackOrbit),
        hostId: originalHostId,
        hostMu: G * getMass(originalHost as CelestialBody | Barycenter)
      },
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
      t0: hostTrackOrbit.t0,
      n_rad_per_s: hostTrackOrbit.n_rad_per_s,
      elements: {
        ...hostTrackOrbit.elements,
        a_AU: aHeavy,
        M0_rad: normalizeAngle(phaseBase + Math.PI)
      }
    };

    light.orbit = {
      hostId: baryId,
      hostMu: pairMu,
      t0: light.orbit?.t0 ?? hostTrackOrbit.t0,
      n_rad_per_s: light.orbit?.n_rad_per_s,
      elements: {
        ...(light.orbit?.elements || hostTrackOrbit.elements),
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
    if (!bary.parentId || !bary.orbit) continue;

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
    primary.orbit = cloneOrbit(bary.orbit);

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

export function reconcileBarycenters(system: System): System {
  // Run until stable to handle create/remove chains from one edit.
  for (let i = 0; i < 8; i++) {
    const promoted = promoteMassiveCompanion(system);
    const demoted = demoteWeakBinary(system);
    if (!promoted && !demoted) break;
  }
  return system;
}
