import type { Barycenter, CelestialBody, Orbit, RulePack, System } from '../types';
import { G, AU_KM } from '../constants';
import { rephasedM0 } from './orbits';
import { autoPairName } from '../system/barycentres';
import { generateId } from '../utils';

// WHEN A LARGE MOON BECOMES A DOUBLE PLANET, and it is a JUDGEMENT rather than a law. There is no
// physical discontinuity at any mass ratio - Pluto-Charon is called a double at 0.12, the Earth-Moon
// system is not at 0.0123, and where between them the line falls is a matter of what a GM wants to
// see on their map. So the standing rule applies straight off: "will a human want to change this
// after using the product?" - obviously yes, so it is DATA, and these two numbers are the DEFAULTS
// rather than the values.
//
// THE HYSTERESIS IS THE PART THAT IS NOT NEGOTIABLE. Demote must sit BELOW promote, and the failure
// without it is worse than it first looks because it is SILENT: promotion and demotion both fire on
// the same pair in the same pass, the reconciler burns its whole eight-pass budget flipping it, and
// because that budget is EVEN the state that survives is the demoted one. So an inverted pack does
// not oscillate visibly - it makes the promote threshold do NOTHING, and no pair ever forms however
// massive the companion. Measured, not assumed. A pack that asks for this is honoured on the promote
// figure and has its demote pulled just under it: the engine choosing for ITSELF, which the
// steer-do-not-stop rule explicitly allows, and nothing a GM authored is touched.
export const DEFAULT_PROMOTE_RATIO = 0.08;
export const DEFAULT_DEMOTE_RATIO = 0.05;

export interface PairThresholds { promote: number; demote: number; }

/**
 * The pair thresholds a pack asks for, with the hysteresis guaranteed. Absent, non-finite or
 * out-of-range values fall back to the defaults rather than producing a system that cannot settle.
 */
export function pairThresholds(pack?: RulePack | null): PairThresholds {
  const g = pack?.generation_parameters ?? {};
  const asked = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1 ? v : fallback;
  const promote = asked(g.barycentre_promote_ratio, DEFAULT_PROMOTE_RATIO);
  let demote = asked(g.barycentre_demote_ratio, DEFAULT_DEMOTE_RATIO);
  // Strictly below, so no ratio can satisfy both tests at once. One step of a double is enough and
  // leaves an honestly-authored band untouched.
  if (demote >= promote) demote = promote - Math.abs(promote) * Number.EPSILON;
  return { promote, demote };
}

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

function promoteMassiveCompanion(system: System, t: PairThresholds): boolean {
  const nodesById = new Map(system.nodes.map((n) => [n.id, n]));

  for (const node of system.nodes) {
    if (node.kind !== 'body') continue;
    const secondary = node as CelestialBody;
    if (!secondary.orbit || secondary.parentId === undefined) continue;
    // Belts/rings carry massKg only as a debris-density proxy — never a gravitational companion.
    if (secondary.roleHint === 'belt' || secondary.roleHint === 'ring') continue;

    // A HIERARCHICAL TRIPLE NEEDS AN OUTER BARYCENTRE, so the parent may be a BARYCENTRE and not
    // only a body. This used to require `kind === 'body'`, which meant a distant companion orbiting
    // an already-promoted pair could never be promoted itself however massive it was — the promotion
    // simply never looked at it.
    //
    // Alpha Centauri is the case, and it is the commonest shape a real triple takes: A and B pair up
    // at ~23 AU, then Proxima orbits THAT pair 400 times further out. Once AB became a barycentre,
    // Proxima was parented to it and stopped being a candidate, so A and B never wobbled in response
    // to the third star. The mass ratio is 17% here, well over the 8% threshold.
    //
    // Nesting terminates by construction: each promotion replaces two siblings with one parent, so
    // the candidate count strictly falls, and the reconciler's own 8-pass ceiling bounds it anyway.
    const primary = nodesById.get(secondary.parentId as string);
    if (!primary || (primary.kind !== 'body' && primary.kind !== 'barycenter')) continue;
    // A barycentre only pairs with something OUTSIDE it. Its own members orbit it by definition and
    // promoting one against its parent would be promoting the pair against half of itself.
    if (primary.kind === 'barycenter' && (primary as Barycenter).memberIds?.includes(secondary.id)) continue;

    const primaryBody = primary as CelestialBody;
    if (primaryBody.parentId === secondary.id) continue;

    const mPrimary = getMass(primaryBody);
    const mSecondary = getMass(secondary);
    if (mPrimary <= 0 || mSecondary <= 0) continue;

    const ratio = Math.min(mPrimary, mSecondary) / Math.max(mPrimary, mSecondary);
    if (ratio < t.promote) continue;

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

    // ONE PAIR, ONE EPOCH - B111. `M(t) = M0 + n*(t - t0)`, so two members carrying the same mean
    // anomaly at DIFFERENT epochs are not opposite each other, they are a fixed `n*dt` apart, for
    // ever. This block used to hand the heavy member the HOST-TRACK epoch and let the light member
    // keep its OWN, which is exactly that: a user's pair came out 240.7 degrees off and chased its
    // partner round instead of orbiting it. The phase is re-expressed at the shared epoch rather
    // than merely copied, so promotion does not move the body that had the orbit.
    const pairT0 = hostTrackOrbit ? hostTrackOrbit.t0 : (light.orbit?.t0 ?? 0);
    const phaseBase = light.orbit ? rephasedM0(light.orbit, pairT0) : 0;

    // AND ONE PERIOD. Both members go round the barycentre in the RELATIVE orbit's time - that is
    // what makes them a pair - so the mean motion is the pair's, not the star-track orbit's that the
    // heavy member used to inherit. `processBarycenters` computes the same number from the same two
    // inputs on the next pass, so nothing churns.
    const separationMeters = separationAU * AU_KM * 1000;
    const pairN = separationMeters > 0 ? Math.sqrt((G * pairMass) / Math.pow(separationMeters, 3)) : undefined;

    const baryId = `bary-auto-${generateId()}`;
    const barycenter: Barycenter = {
      id: baryId,
      kind: 'barycenter',
      // Shared-prefix aware: a companion is usually named FROM its primary, so joining both whole
      // names says one thing twice and produces a caption long enough to crush its own row.
      // UK spelling in UI text; the node KIND stays 'barycenter'.
      name: autoPairName(heavy.name ?? '', light.name ?? ''),
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

    // A CO-ORBITAL PRIMARY HANDS ITS L-POINT TO THE PAIR (B98). Pomona rides Jupiter's L4 and the GM
    // gives it a companion: once promoted it is the PAIR that rides the point, and each member simply
    // orbits the pair. The barycentre has already taken the primary's orbit and host above, so the
    // marker belongs with it for exactly the same reason. Leaving it on a member is what made the
    // L-point derivation and this reconciler tear the pair apart on alternate passes.
    const inheritedCoOrbital = (primaryBody as CelestialBody).coOrbital ?? secondary.coOrbital;
    if (inheritedCoOrbital && inheritedCoOrbital.hostId !== heavy.id && inheritedCoOrbital.hostId !== light.id) {
      barycenter.coOrbital = { ...inheritedCoOrbital };
      delete heavy.coOrbital;
      delete light.coOrbital;
    }

    const aHeavy = separationAU * (mLight / pairMass);
    const aLight = separationAU * (mHeavy / pairMass);
    const pairMu = G * pairMass;

    heavy.parentId = baryId;
    light.parentId = baryId;

    heavy.orbit = {
      hostId: baryId,
      hostMu: pairMu,
      t0: pairT0,
      n_rad_per_s: pairN ?? hostTrackOrbit?.n_rad_per_s,
      elements: {
        ...(hostTrackOrbit ? hostTrackOrbit.elements : { e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0 }),
        a_AU: aHeavy,
        M0_rad: normalizeAngle(phaseBase + Math.PI)
      }
    };

    light.orbit = {
      hostId: baryId,
      hostMu: pairMu,
      t0: pairT0,
      n_rad_per_s: pairN ?? light.orbit?.n_rad_per_s,
      elements: {
        ...(light.orbit?.elements || (hostTrackOrbit ? hostTrackOrbit.elements : { e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0 })),
        a_AU: aLight,
        M0_rad: phaseBase
      }
    };

    // Re-home the members' OTHER children by orbit size. A child whose orbit is LARGER than the pair
    // separation encloses both members, so it must orbit the BARYCENTRE (circumbinary / P-type) — its
    // a/e/angles are kept, only the host changes (the combined mass then sets the correct period on the
    // next process pass). A child inside the separation stays with its own member (circumstellar /
    // S-type: orbits around the star remain physically correct). Without this, a star promoted into a
    // binary left every planet, belt and nested pair "orbiting" a displaced star. Reversal is free:
    // deleting the companion runs dissolveStaleBinary, which re-homes barycentre children onto the
    // survivor; a mass reduction runs demoteWeakBinary, which does the same explicitly.
    for (const n of system.nodes) {
      if (n.parentId !== heavy.id && n.parentId !== light.id) continue;
      if (n.id === heavy.id || n.id === light.id || n.id === baryId) continue;
      const a = n.orbit?.elements?.a_AU ?? 0;
      if (!(a > separationAU)) continue; // inside the pair: stays circumstellar (no orbit → stays put)
      n.parentId = baryId;
      n.orbit = { ...n.orbit!, hostId: baryId, hostMu: pairMu };
    }

    // THE PAIR TAKES THE PRIMARY'S PLACE IN ITS PARENT'S MEMBERSHIP TOO - B111, second fault.
    // The barycentre has already taken the primary's orbit and its host above, and PHY-32 hands the
    // co-orbital marker up for exactly that reason. MEMBERSHIP is the same argument and was missed:
    // an outer pair went on naming a star that had since become half of an inner pair, so its
    // `effectiveMassKg` omitted the new companion entirely and `processBarycenters` coupled the outer
    // star to a body 617 AU from its real partner - the outer pair was 1811x out of balance and did
    // not orbit at all. Nothing repaired it: the reconciler only ever checked that a member EXISTS.
    if (originalHost && originalHost.kind === 'barycenter') {
      const hostBary = originalHost as Barycenter;
      if (Array.isArray(hostBary.memberIds)) {
        const replaced = hostBary.memberIds.map((id) => (id === heavy.id || id === light.id ? baryId : id));
        hostBary.memberIds = replaced.filter((id, i) => replaced.indexOf(id) === i);
      }
    }

    system.nodes.push(barycenter);
    return true;
  }

  return false;
}

// A child body that has become MUCH heavier than its parent body (mass ratio below the barycentre
// threshold, so they're not a co-orbiting pair) is really the primary — the "parent" is now its
// satellite. Swap the hierarchy directly: the heavy child takes the parent's host-track orbit, the
// old parent (and any of its other children) orbit the new primary. This is the case
// promoteMassiveCompanion/demoteWeakBinary miss — those only act through the comparable-mass
// barycentre band, so a mass edit that jumps a child from far-lighter to far-heavier (or back)
// never triggers a swap. Fully symmetric: shrink the new primary again and this fires in reverse.
function swapDominantChild(system: System, t: PairThresholds): boolean {
  const nodesById = new Map(system.nodes.map((n) => [n.id, n]));

  for (const node of system.nodes) {
    if (node.kind !== 'body') continue;
    const child = node as CelestialBody;
    if (!child.orbit || child.parentId == null) continue;
    if (child.roleHint === 'belt' || child.roleHint === 'ring') continue;

    const parent = nodesById.get(child.parentId as string);
    if (!parent || parent.kind !== 'body') continue;
    const parentBody = parent as CelestialBody;
    if (parentBody.roleHint === 'belt' || parentBody.roleHint === 'ring') continue;

    const mChild = getMass(child);
    const mParent = getMass(parentBody);
    if (mChild <= 0 || mParent <= 0) continue;
    if (mChild <= mParent) continue;                         // parent still dominant — correct as-is
    if (mParent / mChild >= t.promote) continue;              // comparable → promoteMassiveCompanion owns it

    const separationAU = Math.max(child.orbit.elements.a_AU || 0, 1e-9);
    const parentHostTrack = parentBody.orbit ? cloneOrbit(parentBody.orbit) : undefined;
    const childT0 = child.orbit.t0 ?? parentBody.orbit?.t0 ?? 0;
    // The demoted parent keeps its own mean anomaly but is about to be quoted at the CHILD's epoch,
    // which moves it by `n*dt` unless the phase is re-expressed. Same fault as B111, different pass.
    const swappedParentM0 = parentBody.orbit ? rephasedM0(parentBody.orbit, childT0) : 0;

    // The child takes the parent's place (same host + orbit around the grandparent). If the parent
    // was the system root (no orbit), the child becomes the root.
    if (parentHostTrack) {
      child.parentId = parentBody.parentId ?? null;
      child.orbit = parentHostTrack;
    } else {
      child.parentId = null;
      delete (child as CelestialBody).orbit;
    }

    // The old parent now orbits the new primary at the former separation.
    parentBody.parentId = child.id;
    parentBody.orbit = {
      hostId: child.id,
      hostMu: G * mChild,
      t0: childT0,
      n_rad_per_s: parentBody.orbit?.n_rad_per_s,
      elements: {
        ...(parentBody.orbit?.elements || { e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0 }),
        a_AU: separationAU,
        M0_rad: swappedParentM0
      }
    };

    // The parent's OTHER children (sibling moons) now orbit the new, dominant primary too.
    for (const n of system.nodes) {
      if (n.parentId !== parentBody.id || n.id === child.id) continue;
      n.parentId = child.id;
      if (n.orbit) { n.orbit.hostId = child.id; n.orbit.hostMu = G * mChild; }
    }

    return true;
  }
  return false;
}

function demoteWeakBinary(system: System, t: PairThresholds): boolean {
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
    if (ratio > t.demote) continue;

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

    // Circumbinary children (planets/belts promoteMassiveCompanion re-homed onto the pair) return to
    // the primary — the inverse of the promotion re-home, keeping a/e/angles; the primary's mass sets
    // their periods on the next process pass. Without this they'd dangle and fall to the system root.
    for (const n of system.nodes) {
      if (n.parentId !== bary.id || n.id === primary.id || n.id === secondary.id) continue;
      n.parentId = primary.id;
      if (n.orbit) n.orbit = { ...n.orbit, hostId: primary.id, hostMu: G * primaryMass };
    }

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
// A BARYCENTRE'S MEMBERSHIP AND ITS MEMBERS' PARENTAGE MUST AGREE, and until B111 nothing checked.
// The reconciler asked only whether a member still EXISTS (dissolveStaleBinary) or had been REMOVED
// (removeGhostBarycenters); a member that was still there but had been promoted into a sub-pair - so
// its `parentId` now names that sub-pair - passed both tests while the outer barycentre went on
// naming it. That is the second half of B111, measured on a user's file: the outer pair's
// `effectiveMassKg` was short by a whole star, and `processBarycenters` coupled the outer star to a
// body 617 AU from its real partner.
//
// The repair follows the SUBTREE, which is the only honest answer available: walk up from the stale
// member until an ancestor is found whose parent IS this barycentre, and name that ancestor instead.
// If the member has left the subtree altogether it is not orbiting this point by any reading, so the
// entry goes and the existing dissolve/ghost passes take it from there. Promotion now hands
// membership up by itself, so this is the heal for files already saved with the fault.
function resyncStaleMembership(system: System): boolean {
  const byId = new Map(system.nodes.map((n) => [n.id, n]));
  let changed = false;
  for (const node of system.nodes) {
    if (node.kind !== 'barycenter') continue;
    const bary = node as Barycenter;
    if (!Array.isArray(bary.memberIds) || !bary.memberIds.length) continue;

    const next: string[] = [];
    for (const id of bary.memberIds) {
      const member = byId.get(id);
      if (!member) { next.push(id); continue; }          // absent: dissolveStaleBinary/ghost own it
      if (member.parentId === bary.id) { next.push(id); continue; }

      // Climb, cycle-guarded: a corrupt file can point a parent chain at itself.
      let cursor: typeof member | undefined = member;
      const seen = new Set<string>([member.id]);
      let standIn: string | undefined;
      while (cursor?.parentId) {
        const parent = byId.get(cursor.parentId as string);
        if (!parent || seen.has(parent.id)) break;
        if (parent.id === bary.id) { standIn = cursor.id; break; }
        seen.add(parent.id);
        cursor = parent;
      }
      if (standIn) { next.push(standIn); changed = true; }
      else changed = true;                                 // left the subtree: drop it
    }

    const deduped = next.filter((id, i) => next.indexOf(id) === i);
    if (deduped.length !== bary.memberIds.length || deduped.some((id, i) => id !== bary.memberIds[i])) {
      bary.memberIds = deduped;
      changed = true;
    }
  }
  return changed;
}

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

// The system root — the node nothing orbits. That's a node with NO parent, OR one whose parentId is
// DANGLING (points at a node that no longer exists — e.g. a hand-edited file that dropped the auto
// barycentre two stars orbited). Treating a dangling-parent node as a root lets reparentDanglingNodes
// re-home the orphans (and promoteMassiveCompanion then rebuilds the missing barycentre). Prefer a
// star/barycentre, then the most massive candidate, so the heavier star anchors the rebuilt pair.
function findRoot(system: System): CelestialBody | Barycenter | undefined {
  const ids = new Set(system.nodes.map((n) => n.id));
  const roots = system.nodes.filter((n) => !n.parentId || !ids.has(n.parentId as string));
  const preferred = roots.filter((n) => n.kind === 'barycenter' || (n as CelestialBody).roleHint === 'star');
  const pool = preferred.length ? preferred : roots;
  return pool.reduce<CelestialBody | Barycenter | undefined>(
    (best, n) => (!best || getMass(n) > getMass(best) ? n : best), undefined);
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

// A binary that LOST a member (its partner was deleted) must DISSOLVE — not leave the survivor orbiting a
// stale one-body barycentre. The surviving member returns to orbiting the barycentre's PARENT (the star)
// on the barycentre's own orbit, so it's back where it started. Any other children (e.g. circumbinary
// planets that orbited the pair) re-home onto the survivor, which now carries the central mass — so on the
// next process pass their periods/physics rebalance around the new host (relevant when a STAR partner is
// deleted: the system's central gravity changes).
function dissolveStaleBinary(system: System): boolean {
  const byId = new Map(system.nodes.map((n) => [n.id, n]));
  for (const node of system.nodes) {
    if (node.kind !== 'barycenter') continue;
    const bary = node as Barycenter;
    const presentMembers = (bary.memberIds ?? []).filter((id) => byId.has(id));
    if (presentMembers.length >= 2) continue;                 // still a real pair — leave it
    const children = system.nodes.filter((n) => n.parentId === bary.id);
    if (!children.length) continue;                            // childless ghost → removeGhostBarycenters
    const survivorId = presentMembers[0]
      ?? children.reduce((best, c) => (getMass(c as any) > getMass(best as any) ? c : best), children[0]).id;
    const parent = bary.parentId ? byId.get(bary.parentId) : undefined;
    const parentMass = getMass(parent as CelestialBody | Barycenter | undefined);
    for (const child of children) {
      const cb = child as CelestialBody;
      if (child.id === survivorId) {
        child.parentId = bary.parentId;
        // Inherit the barycentre's orbit around the star; if the barycentre was the root, the survivor
        // becomes the centre (no orbit).
        cb.orbit = bary.orbit
          ? { ...cloneOrbit(bary.orbit), hostId: bary.parentId as string, hostMu: parentMass > 0 ? G * parentMass : bary.orbit.hostMu }
          : undefined;
      } else {
        // circumbinary / other child now orbits the survivor
        child.parentId = survivorId;
        if (cb.orbit) { cb.orbit.hostId = survivorId; cb.orbit.hostMu = G * getMass(byId.get(survivorId) as any); }
      }
    }
    system.nodes = system.nodes.filter((n) => n.id !== bary.id);
    return true;
  }
  return false;
}

export function reconcileBarycenters(system: System, pack?: RulePack | null): System {
  const t = pairThresholds(pack);
  // Run until stable to handle create/remove chains from one edit.
  for (let i = 0; i < 8; i++) {
    const reparented = reparentDanglingNodes(system);
    const resynced = resyncStaleMembership(system);
    const dissolved = dissolveStaleBinary(system);
    const swapped = swapDominantChild(system, t);
    const promoted = promoteMassiveCompanion(system, t);
    const demoted = demoteWeakBinary(system, t);
    const healed = removeGhostBarycenters(system);
    const repaired = repairDegenerateAutoBary(system);
    if (!reparented && !resynced && !dissolved && !swapped && !promoted && !demoted && !healed && !repaired) break;
  }
  return system;
}
