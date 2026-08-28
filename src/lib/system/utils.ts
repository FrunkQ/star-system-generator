// src/lib/system/utils.ts
import type { System, ID, CelestialBody, Barycenter, BurnPlan, Orbit, RulePack, SystemNode, Starmap } from '../types';
import { FLIGHT_NODE_FIELDS } from '$lib/constructs/flightState';
import { G, AU_KM } from '../constants';
import { propagateState } from '../physics/orbits';
import { systemProcessor } from '../core/SystemProcessor';
import { get } from 'svelte/store';
import { redactTagsForPlayers } from '../tags/tagLifecycle';
import { tagCategories } from '../tags/tagCategories';
import { stripUndoHistory } from '$lib/undo/historyKey';

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
  const categories = get(tagCategories);
  playerSystem.nodes = playerSystem.nodes.filter((node: any) => !hiddenIds.has(node.id)).map((node: CelestialBody | Barycenter) => {
      // Remove GM-only fields
      delete (node as any).gmNotes;

      // Secret tags, and every tag of a player-hidden category, never leave the GM's screen. Done
      // HERE because every player surface reads this snapshot — doing it per-surface is how one of
      // them ends up leaking.
      if (Array.isArray((node as any).tags)) {
        (node as any).tags = redactTagsForPlayers((node as any).tags, categories);
      }
      // A construct's cargo MANIFEST used to be deleted here (A27). REVERSED by decision, 2026-08-01:
      // it now travels and the "Live readings" toggle governs whether a reader sees it, exactly as it
      // governs the cargo tonnage the manifest describes. A27's reasoning — "a star catalogue would
      // not know what is in the hold" — turned out to be the same statement the toggle makes, so the
      // question was a display one after all rather than a leak.
      // KNOW THE CONSEQUENCE, which is A29's and was accepted on the same terms: the prose crosses the
      // wire whatever the preset says, so anyone reading the raw broadcast has it. If that ever needs
      // to stop being true, the strip belongs back here — but do not reinstate it without being asked.

      // THE ANOMALY ASSIGNMENTS ARE GM BOOKKEEPING AND NEVER TRAVEL (G37). The pinned VALUES do —
      // a world really is 1100 K and the players are looking at the consequences — but the map from
      // override to stated reason is the GM's own note, and a SECRET reason is redacted out of
      // `tags` a few lines above while still being named here. Stripping the whole map rather than
      // the secret entries keeps this one statement instead of two rules that could disagree.
      const ovr = (node as any).overrides;
      if (ovr && ovr.anomalies) {
        delete ovr.anomalies;
        if (Object.keys(ovr).length === 0) delete (node as any).overrides;
      }

      // Handle Description Hiding
      if ((node as any).description_playerhidden) {
          delete (node as any).description;
      }

      return node;
  });

  // Also filter from the top-level system object
  delete (playerSystem as any).gmNotes;
  stripUndoHistory(playerSystem);   // an undo log records what the GM deleted (G28)

  return playerSystem;
}

/**
 * Player-safe snapshot of a WHOLE starmap for the Companion App: every system the players may see,
 * each redacted via computePlayerSnapshot. A system whose primary (main) star is player-hidden is
 * dropped entirely — that's the GM's "hide this system" lever. GM notes (map-level) are stripped,
 * and routes referencing a dropped system are removed.
 */
export function computePlayerStarmapSnapshot(map: Starmap): Starmap {
  const clone: any = JSON.parse(JSON.stringify(map));
  delete clone.gmNotes;
  stripUndoHistory(clone);   // an undo log records what the GM deleted (G28)

  // A system is hidden when its ROOT node is player-hidden: the top barycenter for a multi-star
  // system, or the lone star for a single. Hiding an underlying star just hides that star (handled
  // by computePlayerSnapshot's subtree hiding), not the whole system.
  const rootHidden = (sysNode: any): boolean => {
    const ns = sysNode?.system?.nodes || [];
    const root = ns.find((n: any) => n.kind === 'barycenter' && !n.parentId) || ns.find((n: any) => !n.parentId);
    return !!root && !!root.object_playerhidden;
  };

  // Drop bulky fields the guide never shows — transit logs (with huge pathPoint arrays), classifier
  // debug, drafts, AI context. Keeps the broadcast small enough to cross a WebRTC data channel.
  const slimNode = (n: any) => {
    // A SHIP'S FLIGHT SITUATION NO LONGER RIDES THE CAMPAIGN AT ALL (G51).
    //
    // The drive plume and the current flight plan still cross to players - the owner settled that on
    // 2026-08-06 - but they travel on `SYNC_FLIGHT` now instead of nested in here, and the
    // instantaneous vector travels only when a ship is adrift off any plan. The reason is the whole
    // of G51: those fields changed every tick, so `sendIfChanged` could never dedupe the campaign and
    // a ship under way re-sent ~765 KB to every viewer about twice a second. `constructs/flightState`
    // owns the message, its shape, and the merge that writes these fields back on the receiving side.
    //
    // The strip is UNCONDITIONAL rather than conditional on a ship being under way: a parked ship
    // must not carry a stale route or stamp either, because `applyFlightUpdate` clears exactly these
    // fields for a construct it does not mention, and the two must agree about what "absent" means.
    if (n?.kind === 'construct') {
      for (const f of FLIGHT_NODE_FIELDS) delete n[f];
    }
    delete n.scheduled_journeys;
    delete n.draft_transit_plan;
    delete n.classification;
    delete n.aiContext;
    return n;
  };

  clone.systems = (clone.systems || [])
    .filter((sysNode: any) => !rootHidden(sysNode))
    .map((sysNode: any) => {
      const snap: any = computePlayerSnapshot(sysNode.system);
      snap.nodes = (snap.nodes || []).map(slimNode);
      return { id: sysNode.id, name: sysNode.name, position: sysNode.position, subsectorId: sysNode.subsectorId, system: snap };
    });

  const visibleIds = new Set(clone.systems.map((s: any) => s.id));
  clone.routes = (clone.routes || []).filter((r: any) => visibleIds.has(r.sourceSystemId) && visibleIds.has(r.targetSystemId));
  return clone as Starmap;
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
    
    // 2. Physics Recalculation — the ONE pipeline (same pass as load/generation), run unconditionally
    // so repaired saves are consistent with the latest physics. process() mutates nodes in place and
    // returns the system.
    const systemWithStructure = changed ? { ...system, nodes: newNodes } : system;
    return systemProcessor.process(systemWithStructure, rulePack);
}