// Resolving an in-flight interstellar journey to an end state. Pure Starmap → Starmap transforms so
// they're easy to test and can't half-mutate live data. A journey's construct lives in its origin
// system until it's resolved; these three functions decide where it ends up:
//   - endJourneyAtSource:      cancel — it never left, stays in the origin system.
//   - endJourneyAtDestination: it arrives — relocate the construct into the destination system.
//   - strandJourney:           end mid-flight — pull it out into interstellar space (adrift).
import type { Starmap, ActiveJourney, CelestialBody, AdriftConstruct, ID } from '$lib/types';
import { G, SOLAR_MASS_KG } from '$lib/constants';

// --- Derive-from-clock placement -----------------------------------------------------------------
// Where a construct *appears* at a given game time, derived purely from its interstellar journey
// record + the clock (no mutation). The same evaluator backs rendering, the routes panel, and (later)
// autopilot. Persistent node moves are a separate reconcile step, keyed to ACTUAL time.
export type ConstructPlacement =
  | { kind: 'system'; systemId: ID }
  | { kind: 'transit'; fromSystemId: ID; toSystemId: ID; x: number; y: number; frac: number }
  | { kind: 'adrift'; x: number; y: number; fromSystemId?: ID; toSystemId?: ID };

// The journey's effective end (early GM resolution wins over the natural arrival time), in game seconds.
export function journeyEffectiveEndSec(j: ActiveJourney): number {
  const start = Number(j.startTimeSec || 0);
  const natural = start + (j.durationSec || 0);
  const ended = j.endedAtSec != null ? Number(j.endedAtSec) : natural;
  return Math.min(natural, ended);   // can't "end" after it would have naturally arrived
}
// Progress 0..1 at a given game time (clamped; uses the natural duration as the scale).
function fracAt(j: ActiveJourney, sec: number): number {
  const start = Number(j.startTimeSec || 0);
  const dur = j.durationSec || 0;
  if (dur <= 0) return 1;
  return Math.max(0, Math.min(1, (Math.min(sec, journeyEffectiveEndSec(j)) - start) / dur));
}
const sysPos = (s: Starmap, id?: ID) => s.systems.find((x) => x.id === id)?.position;

// Resolve where a construct is at a display time. Looks at its live journey first, then the adrift
// list, then falls back to whichever system actually holds its node.
export function constructDisplayPlacement(starmap: Starmap, constructId: ID, displaySec: number): ConstructPlacement {
  const j = (starmap.activeJourneys ?? []).find((x) => x.shipId === constructId);
  if (j) {
    const from = sysPos(starmap, j.fromSystemId);
    const to = sysPos(starmap, j.toSystemId);
    const start = Number(j.startTimeSec || 0);
    const endSec = journeyEffectiveEndSec(j);
    if (from && to) {
      if (displaySec < start) return { kind: 'system', systemId: j.fromSystemId };
      if (displaySec < endSec) {
        const f = fracAt(j, displaySec);
        return { kind: 'transit', fromSystemId: j.fromSystemId, toSystemId: j.toSystemId, x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f, frac: f };
      }
      // Ended: outcome decides the resting place.
      const outcome = j.outcome ?? 'arrive';
      if (outcome === 'return') return { kind: 'system', systemId: j.fromSystemId };
      if (outcome === 'strand') {
        const f = fracAt(j, endSec);
        return { kind: 'adrift', x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f, fromSystemId: j.fromSystemId, toSystemId: j.toSystemId };
      }
      return { kind: 'system', systemId: j.toSystemId };   // arrive
    }
  }
  const adrift = (starmap.adriftConstructs ?? []).find((a) => a.construct?.id === constructId);
  if (adrift) return { kind: 'adrift', x: adrift.x, y: adrift.y, fromSystemId: adrift.fromSystemId, toSystemId: adrift.toSystemId };
  const holding = starmap.systems.find((s) => (s.system?.nodes ?? []).some((n) => n.id === constructId));
  return { kind: 'system', systemId: holding?.id ?? '' };
}

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const findJourney = (s: Starmap, id: string) => (s.activeJourneys ?? []).find((j) => j.id === id);
const dropJourney = (s: Starmap, id: string): Starmap => ({ ...s, activeJourneys: (s.activeJourneys ?? []).filter((j) => j.id !== id) });

// The construct node + where it sits (its origin system). null if we can't find it.
function locateShip(starmap: Starmap, journey: ActiveJourney) {
  const sysNode = starmap.systems.find((s) => s.id === journey.fromSystemId);
  const nodes = sysNode?.system?.nodes;
  if (!nodes) return null;
  const idx = nodes.findIndex((n) => n.id === journey.shipId);
  return idx < 0 ? null : { sysNode, idx, node: nodes[idx] as CelestialBody };
}

// Cancel: the construct never actually left its origin system, so just drop the journey.
export function endJourneyAtSource(starmap: Starmap, journeyId: string): Starmap {
  return dropJourney(starmap, journeyId);
}

// Arrive: move the construct node into the destination system, re-hosted on the target body (or the
// destination's primary star), then drop the journey.
export function endJourneyAtDestination(starmap: Starmap, journeyId: string): Starmap {
  const journey = findJourney(starmap, journeyId);
  if (!journey) return starmap;
  const loc = locateShip(starmap, journey);
  const destNode = starmap.systems.find((s) => s.id === journey.toSystemId);
  if (!loc || !destNode?.system?.nodes) return dropJourney(starmap, journeyId);
  const dest = destNode.system.nodes as CelestialBody[];
  const host =
    (journey.toBodyId && dest.find((n) => n.id === journey.toBodyId)) ||
    dest.filter((n) => n.roleHint === 'star').sort((a, b) => (b.massKg || 0) - (a.massKg || 0))[0] ||
    dest[0];

  const ship = clone(loc.node);
  if (host) {
    ship.parentId = host.id;
    ship.orbit = {
      ...(ship.orbit || {}),
      hostId: host.id,
      hostMu: G * (host.massKg || SOLAR_MASS_KG),
      t0: ship.orbit?.t0 ?? 0,
      elements: ship.orbit?.elements ?? { a_AU: 0.1, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 }
    } as any;
  }

  const systems = starmap.systems.map((s) => {
    if (s.id === journey.fromSystemId) return { ...s, system: { ...s.system, nodes: s.system.nodes.filter((_, i) => i !== loc.idx) } };
    if (s.id === journey.toSystemId) return { ...s, system: { ...s.system, nodes: [...s.system.nodes, ship] } };
    return s;
  });
  return { ...starmap, systems, activeJourneys: (starmap.activeJourneys ?? []).filter((j) => j.id !== journeyId) };
}

// Strand: pull the construct out of its system and park it adrift at the interstellar point it had
// reached (a lerp of the two systems' positions by frac 0..1), then drop the journey.
export function strandJourney(starmap: Starmap, journeyId: string, frac: number, atSec?: string): Starmap {
  const journey = findJourney(starmap, journeyId);
  if (!journey) return starmap;
  const loc = locateShip(starmap, journey);
  const fromSys = starmap.systems.find((s) => s.id === journey.fromSystemId);
  const toSys = starmap.systems.find((s) => s.id === journey.toSystemId);
  if (!loc || !fromSys || !toSys) return dropJourney(starmap, journeyId);

  const f = Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0.5));
  const adrift: AdriftConstruct = {
    construct: clone(loc.node),
    x: fromSys.position.x + (toSys.position.x - fromSys.position.x) * f,
    y: fromSys.position.y + (toSys.position.y - fromSys.position.y) * f,
    fromSystemId: journey.fromSystemId,
    toSystemId: journey.toSystemId,
    strandedAtSec: atSec
  };
  const systems = starmap.systems.map((s) =>
    s.id === journey.fromSystemId ? { ...s, system: { ...s.system, nodes: s.system.nodes.filter((_, i) => i !== loc.idx) } } : s
  );
  return {
    ...starmap,
    systems,
    adriftConstructs: [...(starmap.adriftConstructs ?? []), adrift],
    activeJourneys: (starmap.activeJourneys ?? []).filter((j) => j.id !== journeyId)
  };
}
