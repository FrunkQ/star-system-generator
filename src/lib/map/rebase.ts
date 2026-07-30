// WS8 — REBASE a campaign onto an updated bundled base map. Pure planning + application: no Svelte, no
// stores, no I/O, so the whole thing is testable and the UI is only a review screen over `RebasePlan`.
//
// THE PROBLEM, concretely. The bundled Local Neighbourhood was rebuilt from real astrometry: the same 42
// system ids, but positions that MOVE a long way (Sirius went from (240, 200) to (330, 650); Tau Ceti from
// (100, 100) to (846, 518)) and gained real depth. Base systems can simply be replaced, because their ids
// are stable hand-authored literals. The GM's OWN systems cannot: they keep old coordinates that were
// meaningful next to the old base and are meaningless next to the new one.
//
// HOW CUSTOM SYSTEMS MOVE: nearest-base ANCHORING. Each custom system is translated by the displacement of
// the base system nearest to it on the OLD map. Two reasons this is the right call over a global best-fit:
//  1. The old positions were roughly 40-50% of true distance and the ratio varied per star, so there is no
//     single correct transform. Local is the only honest scale.
//  2. It preserves what a GM actually cares about — "my colony sits just off Sirius" stays just off Sirius.
// The offset is TRANSLATED, never rescaled: `pixelsPerUnit` is unchanged between editions, so a colony 2 ly
// from Sirius stays exactly 2 ly from Sirius, which is what the GM authored. The translation is 3D, so a
// custom system inherits its anchor's new depth and travels with it off the plane.
//
// WHAT THIS DELIBERATELY DOES NOT DO: it never mutates the campaign it is given. `applyRebase` returns a
// NEW starmap with a new id, so declining costs nothing and the original stays exactly as it was.

import type { Starmap, StarSystemNode, Route } from '$lib/types';
import { mapSeparation, systemSeparation, zCounts } from './systemDistance';
import { CURRENT_BASE_MAP_VERSION } from './provenance';

/** What happened to one of the campaign's systems. */
export interface SystemOutcome {
  id: string;
  name: string;
  kind: 'base-replaced' | 'custom-moved' | 'custom-unanchored';
  /** For a moved custom system: which base system it was anchored to, and how far it travelled. */
  anchorId?: string;
  anchorName?: string;
  movedBy?: number; // in the campaign's distance unit
  /** GM-authored content on a REPLACED base system, which the replacement does not carry. */
  customisations?: string[];
}

/** A route whose stored distance no longer matches its endpoints after the move. */
export interface RouteOutcome {
  id: string;
  name: string;
  fromName: string;
  toName: string;
  oldDistance: number;
  newDistance: number;
}

export interface RebasePlan {
  /** False when there is nothing to do — the caller should not offer an upgrade at all. */
  applicable: boolean;
  fromEdition: number | null;
  toEdition: number;
  systems: SystemOutcome[];
  routes: RouteOutcome[];
  /** Base systems present in the new base map that this campaign did not have. Pure gain. */
  addedSystemNames: string[];
  /** Base systems the campaign has that the NEW base no longer ships — kept as the GM's own, never dropped. */
  orphanedSystemNames: string[];
  /** Plain-language issues to show BEFORE the GM commits. Ordered most-consequential first. */
  warnings: string[];
}

/** The shipped manifest, reduced to what a rebase needs. */
export interface BaseMapManifestEntry {
  id: string;
  name: string;
  systemIds: string[];
}

function posOf(n: StarSystemNode) {
  return { x: n.position.x, y: n.position.y, z: n.position.z ?? 0 };
}

/**
 * GM-authored content on a base system that a straight replacement would discard.
 *
 * Deliberately limited to signals that are UNAMBIGUOUSLY the GM's work. Body-level differences cannot be
 * told apart from the data corrections the rebuild exists to deliver — without a copy of the old base map
 * to diff against, claiming otherwise would produce confident nonsense. So we report what we are sure of
 * and say nothing about the rest, rather than guessing.
 */
export function customisationsOf(node: StarSystemNode, baseName: string | undefined): string[] {
  const out: string[] = [];
  if (baseName && node.name !== baseName) out.push(`renamed to "${node.name}"`);
  else if (node.isNameUserDefined) out.push('a custom system name');
  const nodes = (node.system as any)?.nodes as any[] | undefined;
  const constructs = nodes?.filter((n) => n?.kind === 'construct') ?? [];
  if (constructs.length) {
    const names = constructs.map((c) => c.name).filter(Boolean);
    out.push(`${constructs.length} construct${constructs.length === 1 ? '' : 's'}${names.length ? ` (${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''})` : ''}`);
  }
  if ((node.system as any)?.gmNotes) out.push('GM notes');
  return out;
}

/**
 * Work out what a rebase would do, WITHOUT doing it. The result is both the offer text and the review
 * report — one description of the change, so what the GM approves is what happens.
 */
export function planRebase(
  campaign: Starmap,
  newBase: Starmap,
  manifest: BaseMapManifestEntry,
  fromEdition: number | null
): RebasePlan {
  const baseIds = new Set(manifest.systemIds);
  const newById = new Map(newBase.systems.map((s) => [s.id, s]));
  const campaignById = new Map(campaign.systems.map((s) => [s.id, s]));
  const perUnit = campaign.scale?.pixelsPerUnit ?? newBase.scale?.pixelsPerUnit ?? 0;
  const ignoreZ = !zCounts(campaign);

  // The base systems this campaign actually holds, and the displacement each one undergoes. These are the
  // anchors; a campaign with none of them cannot be rebased at all.
  const anchors: { id: string; name: string; from: { x: number; y: number; z: number }; dx: number; dy: number; dz: number }[] = [];
  for (const node of campaign.systems) {
    if (!baseIds.has(node.id)) continue;
    const replacement = newById.get(node.id);
    if (!replacement) continue;
    const from = posOf(node), to = posOf(replacement);
    anchors.push({ id: node.id, name: replacement.name, from, dx: to.x - from.x, dy: to.y - from.y, dz: to.z - from.z });
  }

  const systems: SystemOutcome[] = [];
  const customisedBase: SystemOutcome[] = [];
  // Where each system ENDS UP, so route distances can be recomputed against the same numbers the GM reviews.
  const finalPos = new Map<string, { x: number; y: number; z: number }>();

  for (const node of campaign.systems) {
    if (baseIds.has(node.id) && newById.has(node.id)) {
      const replacement = newById.get(node.id)!;
      const customisations = customisationsOf(node, replacement.name);
      const outcome: SystemOutcome = {
        id: node.id, name: replacement.name, kind: 'base-replaced',
        ...(customisations.length ? { customisations } : {})
      };
      systems.push(outcome);
      if (customisations.length) customisedBase.push(outcome);
      finalPos.set(node.id, posOf(replacement));
      continue;
    }
    if (baseIds.has(node.id)) {
      // A base id the new edition no longer ships. Keep it as the GM's own content — deleting a system
      // because we stopped shipping it would be data loss, and it may well be load-bearing for their game.
      systems.push({ id: node.id, name: node.name, kind: 'custom-unanchored' });
      finalPos.set(node.id, posOf(node));
      continue;
    }
    // The GM's own system: anchor it to the nearest base system on the OLD map.
    const here = posOf(node);
    let best: (typeof anchors)[number] | null = null;
    let bestD = Infinity;
    for (const a of anchors) {
      const d = mapSeparation(here, a.from, ignoreZ);
      if (d < bestD) { bestD = d; best = a; }
    }
    if (!best) {
      systems.push({ id: node.id, name: node.name, kind: 'custom-unanchored' });
      finalPos.set(node.id, here);
      continue;
    }
    const moved = { x: here.x + best.dx, y: here.y + best.dy, z: here.z + best.dz };
    finalPos.set(node.id, moved);
    systems.push({
      id: node.id, name: node.name, kind: 'custom-moved',
      anchorId: best.id, anchorName: best.name,
      movedBy: perUnit > 0 ? Math.hypot(best.dx, best.dy, best.dz) / perUnit : 0
    });
  }

  // Routes: every stored distance is measured against the OLD positions, so any route with a moved endpoint
  // is now wrong. Report each change; applyRebase recomputes them.
  const routes: RouteOutcome[] = [];
  for (const r of campaign.routes ?? []) {
    const a = finalPos.get(r.sourceSystemId), b = finalPos.get(r.targetSystemId);
    if (!a || !b || perUnit <= 0) continue;
    const next = systemSeparation(a, b, perUnit, ignoreZ);
    if (Math.abs(next - (r.distance ?? 0)) < 0.005) continue;
    routes.push({
      id: r.id, name: r.name || '',
      fromName: campaignById.get(r.sourceSystemId)?.name ?? '?',
      toName: campaignById.get(r.targetSystemId)?.name ?? '?',
      oldDistance: r.distance ?? 0, newDistance: next
    });
  }

  const addedSystemNames = newBase.systems.filter((s) => !campaignById.has(s.id)).map((s) => s.name);
  const orphanedSystemNames = systems.filter((s) => s.kind === 'custom-unanchored' && baseIds.has(s.id)).map((s) => s.name);

  // WARNINGS — the "possible issues" the GM must see before committing, worst first.
  const warnings: string[] = [];
  const moved = systems.filter((s) => s.kind === 'custom-moved');
  const unanchored = systems.filter((s) => s.kind === 'custom-unanchored' && !baseIds.has(s.id));
  if (moved.length) {
    const worst = moved.reduce((m, s) => Math.max(m, s.movedBy ?? 0), 0);
    warnings.push(
      `${moved.length} of your own system${moved.length === 1 ? '' : 's'} will move, each following the base system nearest to it (the furthest travels about ${worst < 10 ? worst.toFixed(1) : Math.round(worst)} ${campaign.scale?.unit ?? 'ly'}). Distances to that neighbour are preserved; distances to anything else may change.`
    );
  }
  if (customisedBase.length) {
    warnings.push(
      `${customisedBase.length} base system${customisedBase.length === 1 ? '' : 's'} you had changed will be replaced, and those changes will not carry over: ${customisedBase.map((s) => `${s.name} (${(s.customisations ?? []).join(', ')})`).join('; ')}. Note them down first if you want to re-apply them.`
    );
  }
  if (routes.length) {
    warnings.push(`${routes.length} link${routes.length === 1 ? '' : 's'} will be re-measured, so journeys along them will take a different amount of time.`);
  }
  if (unanchored.length) {
    warnings.push(`${unanchored.length} system${unanchored.length === 1 ? '' : 's'} could not be anchored to anything and will stay where they are: ${unanchored.map((s) => s.name).join(', ')}.`);
  }
  if (orphanedSystemNames.length) {
    warnings.push(`${orphanedSystemNames.length} system${orphanedSystemNames.length === 1 ? '' : 's'} came from the old bundled map but are not in the new one; they are kept as your own content: ${orphanedSystemNames.join(', ')}.`);
  }
  warnings.push('Your current map is not touched. The upgrade is built as a separate campaign, so if you do not like the result you can go straight back to this one.');

  return {
    applicable: anchors.length > 0,
    fromEdition,
    toEdition: CURRENT_BASE_MAP_VERSION,
    systems, routes, addedSystemNames, orphanedSystemNames, warnings
  };
}

/**
 * Build the rebased campaign. Returns a NEW starmap — the input is never mutated.
 *
 * `newId`/`newName` are supplied by the caller so ids stay the caller's business (and so tests are
 * deterministic without a clock).
 */
export function applyRebase(
  campaign: Starmap,
  newBase: Starmap,
  manifest: BaseMapManifestEntry,
  plan: RebasePlan,
  newId: string,
  newName: string
): Starmap {
  const baseIds = new Set(manifest.systemIds);
  const newById = new Map(newBase.systems.map((s) => [s.id, s]));
  const outcomeById = new Map(plan.systems.map((s) => [s.id, s]));
  const anchorById = new Map(
    plan.systems.filter((s) => s.kind === 'custom-moved' && s.anchorId).map((s) => [s.id, s.anchorId!])
  );
  const delta = new Map<string, { dx: number; dy: number; dz: number }>();
  for (const node of campaign.systems) {
    if (!baseIds.has(node.id)) continue;
    const rep = newById.get(node.id);
    if (!rep) continue;
    delta.set(node.id, {
      dx: rep.position.x - node.position.x,
      dy: rep.position.y - node.position.y,
      dz: (rep.position.z ?? 0) - (node.position.z ?? 0)
    });
  }

  const systems: StarSystemNode[] = campaign.systems.map((node) => {
    const outcome = outcomeById.get(node.id);
    if (outcome?.kind === 'base-replaced') {
      // Take the new edition's system WHOLESALE — its bodies, composition and atmospheres are the point of
      // the upgrade. Carry across only what is unambiguously the GM's: their viewport and their clock.
      const rep = newById.get(node.id)!;
      return {
        ...rep,
        ...(node.viewport ? { viewport: node.viewport } : {}),
        ...(node.time ? { time: node.time } : {})
      };
    }
    const d = outcome?.kind === 'custom-moved' ? delta.get(anchorById.get(node.id) ?? '') : undefined;
    if (!d) return node;
    return { ...node, position: { x: node.position.x + d.dx, y: node.position.y + d.dy, z: (node.position.z ?? 0) + d.dz } };
  });

  // Any base system the campaign never had is pure gain — add it.
  const haveIds = new Set(systems.map((s) => s.id));
  for (const s of newBase.systems) if (!haveIds.has(s.id)) systems.push(s);

  // Re-measure every route against the final positions, using the SAME numbers the GM reviewed.
  const byId = new Map(systems.map((s) => [s.id, s]));
  const perUnit = campaign.scale?.pixelsPerUnit ?? newBase.scale?.pixelsPerUnit ?? 0;
  const ignoreZ = !zCounts(campaign);
  const routes: Route[] = (campaign.routes ?? []).map((r) => {
    const a = byId.get(r.sourceSystemId), b = byId.get(r.targetSystemId);
    if (!a || !b || perUnit <= 0) return r;
    return { ...r, distance: systemSeparation(a.position, b.position, perUnit, ignoreZ) };
  });

  return {
    ...campaign,
    id: newId,
    name: newName,
    systems,
    routes,
    // The rebased campaign descends from the NEW edition — otherwise it would be offered this same upgrade
    // again on every load.
    baseMapVersion: plan.toEdition,
    // Inherit the new edition's scale and depth conventions: the positions are now its positions.
    scale: newBase.scale ?? campaign.scale,
    mapMode: newBase.mapMode ?? campaign.mapMode
  };
}
