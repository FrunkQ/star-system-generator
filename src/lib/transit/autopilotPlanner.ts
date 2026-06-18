// Autopilot planner — Slice 1 (docs/autopilot-spec.md §5/§12.8). The DETERMINISTIC CORE: given a
// construct's captured plan + its current position + the clock, walk the legs and emit the journey
// chain the ship would fly. Pure and dependency-injected (the leg solver + fuel-compat predicate are
// passed in) so it unit-tests without the full physics/UI, and production just wires the real
// `calculateTransitPlan` + ship fuel data behind the same interfaces.
//
// Slice 1 scope: traversal 'in-order' + repeat/run-once; PLACE-targeted legs (patrol, transport);
// Planning = commit-horizon; basic fuel stuck-flag with harvest/depot top-up. Deferred: resource
// resolution (mine/explore), best-order/any + reorder, tardiness, cargo accounting, escort/flyby.
import type { CelestialBody, ID } from '$lib/types';
import type { TransitPlan } from './types';

const DAY_MS = 86_400_000;

// A leg expands into one or more STOPS (patrol → 1; transport → load + unload). The walker only ever
// sees stops, which keeps the core a clean "go to target, hold, maybe refuel" loop.
export interface AutopilotStop {
  targetId: ID;
  dwellDays: number;        // time held at the target — loiter (patrol) / load / unload
  refuelHere: boolean;      // can top fuel up here (harvest of a fuel-compatible resource, or a depot)
  verb: string;             // 'patrol' | 'load' | 'unload' — for the live action read-out
  resourceKeys?: string[];  // what's gathered/carried at this stop (cargo + harvest-refuel)
}

// Solve a single hop origin→target departing at startMs. Production wraps `calculateTransitPlan` +
// ship params; tests stub it. Returns null / valid:false when no route is possible.
export type SolveLeg = (
  originId: ID,
  targetId: ID,
  startMs: number
) => { plans: TransitPlan[]; arriveMs: number; deltaV_ms: number; valid: boolean } | null;

export interface AutopilotPlanOpts {
  fromMs: number;
  startHostId: ID;
  planningHorizon: number;  // Planning slider 0..5 → commit this many stops ahead (min 1)
  repeat: boolean;          // loop the route, or run once then stop
  ignoreFuel: boolean;
  fuelBudget_ms: number;    // Δv currently aboard
  fuelCapacity_ms: number;  // Δv when full (after a top-up)
  solveLeg: SolveLeg;
  maxJourneyDays?: number;  // cap on any single hop's travel time
}

export interface AutopilotPlanResult {
  plans: TransitPlan[];     // the leg chain to store in a ScheduledJourneyLog
  endHostId: ID;            // where the ship ends up within this horizon
  attention: 'stuck' | null;
  stuckReason?: string;
  done: boolean;            // a run-once route finished within this horizon → caller flags green + disengages
  finalTimeMs: number;      // clock at the end of the committed chain (incl. final dwell)
}

// The core walker. Commits up to `planningHorizon` stops from the current position, chaining hops with
// dwell, refuelling where possible, and stopping early for a completed run-once route or a stuck state.
export function walkStops(stops: AutopilotStop[], opts: AutopilotPlanOpts): AutopilotPlanResult {
  const out: TransitPlan[] = [];
  let host = opts.startHostId;
  let t = opts.fromMs;
  let budget = opts.ignoreFuel ? Infinity : opts.fuelBudget_ms;
  const capacity = opts.ignoreFuel ? Infinity : opts.fuelCapacity_ms;
  const horizon = Math.max(1, Math.floor(opts.planningHorizon));

  if (!stops.length) return { plans: [], endHostId: host, attention: null, done: false, finalTimeMs: t };

  let i = 0;
  let committed = 0;
  while (committed < horizon) {
    const stop = stops[i % stops.length];

    // Travel to the stop (skip if we're already sitting there — a leg that targets the current host).
    if (host !== stop.targetId) {
      const solve = opts.solveLeg(host, stop.targetId, t);
      if (!solve || !solve.valid) {
        return { plans: out, endHostId: host, attention: 'stuck', stuckReason: `no route to ${stop.targetId}`, done: false, finalTimeMs: t };
      }
      const legDays = solve.plans.reduce((s, p) => s + (p.totalTime_days || 0), 0);
      if (opts.maxJourneyDays && legDays > opts.maxJourneyDays) {
        return { plans: out, endHostId: host, attention: 'stuck', stuckReason: `hop to ${stop.targetId} exceeds the ${opts.maxJourneyDays}-day cap`, done: false, finalTimeMs: t };
      }
      if (budget < solve.deltaV_ms) {
        // Basic stuck-flag: can't reach the next stop and no top-up was available at this one.
        return { plans: out, endHostId: host, attention: 'stuck', stuckReason: `not enough fuel to reach ${stop.targetId}`, done: false, finalTimeMs: t };
      }
      budget -= solve.deltaV_ms;
      out.push(...solve.plans);
      t = solve.arriveMs;
      host = stop.targetId;
    }

    // Hold at the stop (dwell becomes the gap before the next hop → resolver shows "waiting at host").
    t += Math.max(0, stop.dwellDays) * DAY_MS;
    // Harvest/depot top-up: refuelling here means the NEXT hop (e.g. the return leg) departs fuelled.
    if (stop.refuelHere) budget = capacity;

    committed++;
    i++;

    if (!opts.repeat && i >= stops.length) {
      return { plans: out, endHostId: host, attention: null, done: true, finalTimeMs: t };
    }
  }

  return { plans: out, endHostId: host, attention: null, done: false, finalTimeMs: t };
}

// Expand a captured autopilot leg into stops. Slice 1 handles the PLACE-targeted verbs; resource-
// targeted mine/explore (nearest-source) and escort/flyby come later, so they yield no stops for now.
// `isFuelCompatible(resourceKey)` is true when the ship can refuel from that resource (its fuels'
// refuel_tags include the key) — wired from the rulepack fuel definitions in production.
export function legToStops(
  leg: { action: string; placeId?: ID; resourceKeys?: string[]; loiterDays?: number; deliverTo?: { placeId?: ID } },
  isFuelCompatible: (resourceKey: string) => boolean,
  loadDwellDays = 1
): AutopilotStop[] {
  if (leg.action === 'patrol') {
    if (!leg.placeId) return [];
    return [{ targetId: leg.placeId, dwellDays: leg.loiterDays ?? 0, refuelHere: false, verb: 'patrol' }];
  }
  if (leg.action === 'transport') {
    if (!leg.placeId) return [];
    const carry = leg.resourceKeys ?? [];
    const gathersFuel = carry.some(isFuelCompatible); // self-fuel from a compatible cargo (e.g. water-ice)
    const stops: AutopilotStop[] = [
      { targetId: leg.placeId, dwellDays: loadDwellDays, refuelHere: gathersFuel, verb: 'load', resourceKeys: carry }
    ];
    if (leg.deliverTo?.placeId) {
      stops.push({ targetId: leg.deliverTo.placeId, dwellDays: loadDwellDays, refuelHere: false, verb: 'unload', resourceKeys: carry });
    }
    return stops;
  }
  // mine / explore / escort / flyby — Slice 2+/banked.
  return [];
}

// --- Destination scoring (for resource-targeted legs / best-order — Slice 2, building it now) ---
// When several bodies could satisfy a leg (e.g. "nearest source of water-ice"), pick the best by
// abundance + proximity, with a NUDGE for a body that ALSO refuels the ship for free. Mining and
// refuelling are often different bodies (the Canterbury mines the moons but skims Saturn for fuel) —
// so a moon that offers BOTH avoids a refuel detour and should win close calls. The nudge is modest
// by default (it only tips ties), but weighs heavier when the ship is actually low on fuel.
export interface SourceCandidate {
  id: ID;
  travelCost: number;      // cost to reach (days or Δv — lower is better); compared within the candidate set
  abundance?: number;      // 0..1 resource richness (higher mines faster); default 0.5 if unknown
  refuels?: boolean;       // this body is also a compatible fuel top-up for the ship (free refuel)
}

export interface ChooseSourceOpts {
  needsFuel?: boolean;       // ship is low → value a free refuel more
  refuelBonus?: number;      // override the default nudge (score units, abundance/proximity are 0..1)
  abundanceWeight?: number;  // default 0.5
  proximityWeight?: number;  // default 0.5
}

const REFUEL_NUDGE = 0.15;        // "a little higher" than plain mining — tips close calls
const REFUEL_NUDGE_LOW_FUEL = 0.5; // when the ship needs fuel, a self-fuelling source matters much more

export function scoreSources(cands: SourceCandidate[], opts: ChooseSourceOpts = {}): Array<SourceCandidate & { score: number }> {
  if (!cands.length) return [];
  const wA = opts.abundanceWeight ?? 0.5;
  const wP = opts.proximityWeight ?? 0.5;
  const bonus = opts.refuelBonus ?? (opts.needsFuel ? REFUEL_NUDGE_LOW_FUEL : REFUEL_NUDGE);
  // Ratio-based proximity (nearest/cost): scale-invariant and gentle — a body twice as far scores 0.5,
  // not 0, so distance doesn't dominate when there are only a couple of candidates.
  const minCost = Math.max(1e-6, Math.min(...cands.map((c) => c.travelCost)));
  return cands.map((c) => {
    const proximity = Math.min(1, minCost / Math.max(1e-6, c.travelCost)); // nearest = 1
    const abundance = c.abundance ?? 0.5;
    const score = wA * abundance + wP * proximity + (c.refuels ? bonus : 0);
    return { ...c, score: +score.toFixed(4) };
  });
}

// Pick the best candidate. Ties broken by lower travel cost (deterministic).
export function chooseSource(cands: SourceCandidate[], opts: ChooseSourceOpts = {}): SourceCandidate | null {
  const scored = scoreSources(cands, opts);
  if (!scored.length) return null;
  scored.sort((a, b) => (b.score - a.score) || (a.travelCost - b.travelCost) || a.id.localeCompare(b.id));
  const { score, ...best } = scored[0];
  return best;
}

// Build the full stop list for an engaged plan (in-order traversal, Slice 1).
export function planToStops(
  legs: Array<Parameters<typeof legToStops>[0]>,
  isFuelCompatible: (resourceKey: string) => boolean,
  loadDwellDays = 1
): AutopilotStop[] {
  return legs.flatMap((leg) => legToStops(leg, isFuelCompatible, loadDwellDays));
}
