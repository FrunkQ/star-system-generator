// Autopilot planner — Slice 1 (docs/autopilot-spec.md §5/§12.8). The DETERMINISTIC CORE: given a
// construct's captured plan + its current position + the clock, walk the legs and emit the journey
// chain the ship would fly. Pure and dependency-injected (the leg solver + fuel-compat predicate are
// passed in) so it unit-tests without the full physics/UI, and production just wires the real
// `calculateTransitPlan` + ship fuel data behind the same interfaces.
//
// Slice 1 scope: traversal 'in-order' + repeat/run-once; PLACE-targeted legs (patrol, transport);
// Planning = commit-horizon; basic fuel stuck-flag with harvest/depot top-up. Deferred: resource
// resolution (mine/explore), best-order/any + reorder, tardiness, cargo accounting, escort/flyby.
import type { CelestialBody, ID, ConstructLogKind, ConstructLogEvent } from '$lib/types';
import type { TransitPlan } from './types';

const DAY_MS = 86_400_000;
const atSecStr = (ms: number) => BigInt(Math.floor(ms / 1000)).toString();

// A leg expands into one or more STOPS (patrol → 1; transport → load + unload). The walker only ever
// sees stops, which keeps the core a clean "go to target, hold, maybe refuel" loop.
export interface AutopilotStop {
  targetId: ID;
  dwellDays: number;        // time held at the target — loiter (patrol) / load / unload
  refuelHere: boolean;      // can top fuel up here (harvest of a fuel-compatible resource, or a depot)
  verb: string;             // 'patrol' | 'load' | 'unload' | 'mine' | 'explore' — the live action read-out + log kind
  resourceKeys?: string[];  // what's gathered/carried at this stop (cargo + harvest-refuel)
  tonnes?: number;          // cargo mass moved at this stop (load/unload/mine) — for the flight log + cargo derivation
  rate_tpd?: number;        // haul fill rate (t/day) — dwell = tonnes / (rate × abundance)
  abundance?: number;       // mine — source richness 0..1; a richer deposit fills faster (load/place = 1)
  action?: string;          // the leg's verb (mine/transport/patrol/explore/escort) — tags the journey for the log
  parkRadiusAu?: number;    // escort — arrival parking radius (the escorted ship's orbit + the km standoff)
}

// A work event the planner emits at a stop (between transit journeys). The adapter finalises these into
// ConstructLogEvents (id + display text with real names); kept structured + name-free here so the core stays pure.
export interface StopEvent {
  atSec: string;
  kind: ConstructLogKind;
  placeId: ID;
  resourceKey?: string;
  tonnes?: number;
  durationSec?: number;     // load/mine/unload happen OVER the dwell, so cargo ramps rather than steps
}

// Map a stop verb to its flight-log kind (the work the journey legs don't already show).
const VERB_KIND: Record<string, ConstructLogKind | undefined> = {
  load: 'load', unload: 'unload', mine: 'mine', patrol: 'loiter', explore: 'loiter'
};

// Cargo aboard at a moment = a starting load plus the running flight-log delta up to that time (load/mine add,
// unload removes), each transfer RAMPING linearly across its dwell rather than stepping. DERIVED, never stored
// — it scrubs with the clock and a regen can't desync it. atSec in seconds; startCargo_t = cargo when the
// ledger began (the ship's current_cargo_tonnes at engage).
export function cargoAboardAt(events: ConstructLogEvent[] | undefined, atSec: number, startCargo_t = 0): number {
  let aboard = startCargo_t;
  for (const e of events ?? []) {
    const start = Number(e.atSec);
    if (start > atSec) continue;
    const dur = e.durationSec || 0;
    const frac = dur > 0 ? Math.min(1, Math.max(0, (atSec - start) / dur)) : 1; // partway through a transfer
    const amt = (e.tonnes || 0) * frac;
    if (e.kind === 'load' || e.kind === 'mine') aboard += amt;
    else if (e.kind === 'unload') aboard -= amt;
  }
  return Math.max(0, aboard);
}

// Fuel aboard (kg) at a moment — DERIVED, like cargo. Fuel drains across each burn SEGMENT (accel/coast/brake)
// over its own window, so a torch ship burns smoothly while a burn-coast-burn spends ~half on the injection
// burn, coasts flat, then ~half on capture — straight from the real segment fuel, no hard-coded split. Refuels
// top the tanks back toward full (instantly at a port, ramped across a frontier harvest's durationSec). Burns
// and refuels never overlap in time (transit vs. dwell), so a single time-ordered walk is exact. Especially
// useful for an ABANDONED ship: its fuel at the cancel moment is just fuelKgAt(…, cancelSec).
export function fuelKgAt(
  journeys: { status?: string; plans?: any[] }[] | undefined,
  flightLog: ConstructLogEvent[] | undefined,
  capacityKg: number,
  startFuelKg: number,
  atSec: number
): number {
  if (!(capacityKg > 0)) return startFuelKg;
  const fe: { start: number; end: number; refuel: boolean; kg: number }[] = [];
  for (const log of journeys ?? []) {
    if (log.status === 'cancelled') continue;
    for (const p of log.plans ?? []) {
      for (const s of p.segments ?? []) {
        const start = (s.startTime ?? 0) / 1000;
        const end = Math.max(start, (s.endTime ?? s.startTime ?? 0) / 1000);
        const kg = s.fuelUsed_kg || 0;
        if (kg > 0) fe.push({ start, end, refuel: false, kg });
      }
    }
  }
  for (const e of flightLog ?? []) {
    if (e.kind !== 'refuel') continue;
    const start = Number(e.atSec);
    fe.push({ start, end: start + (e.durationSec || 0), refuel: true, kg: 0 });
  }
  fe.sort((a, b) => a.start - b.start);
  let fuel = startFuelKg;
  for (const e of fe) {
    if (e.start > atSec) break;
    const frac = e.end > e.start ? Math.min(1, (atSec - e.start) / (e.end - e.start)) : 1;
    if (e.refuel) fuel = fuel + (capacityKg - fuel) * frac;   // ramp toward full
    else fuel = fuel - e.kg * frac;                            // drain across the burn
  }
  return Math.max(0, Math.min(capacityKg, fuel));
}

// Totals / averages, derived PURELY by reducing the flight log up to a moment — no extra stored state (spec
// §7). Cargo by resource (gathered vs delivered), lifetime delivered, the headline tonnes/annum efficiency,
// refuels, stops worked, and the span it's all measured over. In-progress transfers count pro-rata (same ramp
// as the cargo curve), so the figures climb smoothly as you play.
export interface AutopilotTotals {
  delivered: Record<string, number>;   // tonnes delivered (unloaded) by resource
  gathered: Record<string, number>;    // tonnes gathered (loaded/mined) by resource
  deliveredTotal_t: number;
  gatheredTotal_t: number;
  tonnesPerAnnum: number;              // headline efficiency: delivered ÷ years elapsed
  refuels: number;
  stopsWorked: number;
  spanDays: number;
}
export function computeAutopilotTotals(events: ConstructLogEvent[] | undefined, atSec: number): AutopilotTotals {
  const delivered: Record<string, number> = {};
  const gathered: Record<string, number> = {};
  let deliveredTotal = 0, gatheredTotal = 0, refuels = 0, stopsWorked = 0, first = Infinity;
  for (const e of events ?? []) {
    const start = Number(e.atSec);
    if (start > atSec) continue;
    first = Math.min(first, start);
    const dur = e.durationSec || 0;
    const frac = dur > 0 ? Math.min(1, Math.max(0, (atSec - start) / dur)) : 1;
    const res = e.resourceKey ? e.resourceKey.replace(/^resource\//, '') : 'cargo';
    const amt = (e.tonnes || 0) * frac;
    if (e.kind === 'unload') { delivered[res] = (delivered[res] || 0) + amt; deliveredTotal += amt; stopsWorked++; }
    else if (e.kind === 'load' || e.kind === 'mine') { gathered[res] = (gathered[res] || 0) + amt; gatheredTotal += amt; stopsWorked++; }
    else if (e.kind === 'refuel') refuels++;
    else if (e.kind === 'loiter') stopsWorked++;
  }
  const spanDays = Number.isFinite(first) ? Math.max(0, (atSec - first) / 86400) : 0;
  const years = spanDays / 365.25;
  return { delivered, gathered, deliveredTotal_t: deliveredTotal, gatheredTotal_t: gatheredTotal, tonnesPerAnnum: years > 0 ? deliveredTotal / years : 0, refuels, stopsWorked, spanDays };
}

// Solve a single hop origin→target departing at startMs. Production wraps `calculateTransitPlan` +
// ship params; tests stub it. Returns null / valid:false when no route is possible.
// `dvAvailable_ms` = the Δv currently aboard at departure — production uses it to step the burn profile
// down toward a coastier (cheaper) tier when the preferred one wouldn't fit the tanks (go slower, don't
// strand). Optional so stubs can ignore it.
export type SolveLeg = (
  originId: ID,
  targetId: ID,
  startMs: number,
  dvAvailable_ms?: number
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
  tardiness?: number;       // 0..1 Discipline — adds deterministic slack to STOPPED time only (0 = punctual)
  slackSeed?: string;       // reproducible seed (the construct id) so the slack is the same every replay
  startCargo_t?: number;    // cargo already aboard when the route begins (so a full hauler mines nothing)
  cargoCapacity_t?: number; // hold capacity — a load never exceeds it; an unload never drops below empty
}

// Deterministic [0,1) hash — tardiness slack must be reproducible/scrubbable, so no Math.random (which is
// also banned in this codebase). FNV-1a over the seed string.
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}

export interface AutopilotPlanResult {
  plans: TransitPlan[];     // the leg chain to store in a ScheduledJourneyLog
  events: StopEvent[];      // work events at the stops (load/unload/mine/refuel/loiter) for the flight log
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
  const events: StopEvent[] = [];
  let host = opts.startHostId;
  let t = opts.fromMs;
  let budget = opts.ignoreFuel ? Infinity : opts.fuelBudget_ms;
  const capacity = opts.ignoreFuel ? Infinity : opts.fuelCapacity_ms;
  const horizon = Math.max(1, Math.floor(opts.planningHorizon));
  let cargo = Math.max(0, opts.startCargo_t ?? 0);                 // cargo aboard, tracked so loads/unloads are real
  const holdCap = opts.cargoCapacity_t && opts.cargoCapacity_t > 0 ? opts.cargoCapacity_t : Infinity;

  if (!stops.length) return { plans: [], events, endHostId: host, attention: null, done: false, finalTimeMs: t };

  let i = 0;
  let committed = 0;
  while (committed < horizon) {
    const stop = stops[i % stops.length];

    // Travel to the stop (skip if we're already sitting there — a leg that targets the current host).
    if (host !== stop.targetId) {
      const solve = opts.solveLeg(host, stop.targetId, t, Number.isFinite(budget) ? budget : undefined);
      if (!solve || !solve.valid) {
        return { plans: out, events, endHostId: host, attention: 'stuck', stuckReason: `no route to ${stop.targetId}`, done: false, finalTimeMs: t };
      }
      // Whole-leg cap: elapsed from "ready to depart" to arrival — so a delayed launch window (the thrifty
      // wait-for-alignment plan) counts against Max time per leg, not just the transit itself.
      const legDays = (solve.arriveMs - t) / DAY_MS;
      if (opts.maxJourneyDays && legDays > opts.maxJourneyDays) {
        return { plans: out, events, endHostId: host, attention: 'stuck', stuckReason: `hop to ${stop.targetId} exceeds the ${opts.maxJourneyDays}-day cap (${Math.round(legDays)} days incl. any launch-window wait)`, done: false, finalTimeMs: t };
      }
      if (budget < solve.deltaV_ms) {
        // Basic stuck-flag: can't reach the next stop and no top-up was available at this one.
        return { plans: out, events, endHostId: host, attention: 'stuck', stuckReason: `not enough fuel to reach ${stop.targetId}`, done: false, finalTimeMs: t };
      }
      budget -= solve.deltaV_ms;
      for (const p of solve.plans) (p as any).autopilotAction = stop.action ?? stop.verb; // tag the journey's kind
      out.push(...solve.plans);
      t = solve.arriveMs;
      host = stop.targetId;
    }

    // Work event at the stop — the load/unload/mine/loiter the transit journeys don't themselves record. Cargo
    // moves are capped to what's physically possible: a load/mine never overfills the hold (a full ship mines
    // nothing), an unload never delivers more than is aboard. The LOGGED tonnage is the real amount moved, and
    // a load/mine dwell is sized to THAT amount (÷ rate × source abundance) — so a full ship doesn't idle at
    // the source for the full nominal fill time.
    const kind = VERB_KIND[stop.verb];
    let dwellDays = Math.max(0, stop.dwellDays);
    if (kind === 'load' || kind === 'mine') {
      // Undefined tonnes = "fill the hold" → top up to capacity (needs a known hold). A typed amount is a cap.
      const free = holdCap - cargo; // Infinity when no capacity is set
      const want = stop.tonnes ?? (Number.isFinite(free) ? free : 0);
      const moved = Math.max(0, Math.min(want, free));
      if (stop.rate_tpd && stop.rate_tpd > 0) dwellDays = moved / (stop.rate_tpd * Math.max(0.05, stop.abundance ?? 1));
      cargo += moved;
      events.push({ atSec: atSecStr(t), kind, placeId: stop.targetId, resourceKey: stop.resourceKeys?.[0], tonnes: moved, durationSec: dwellDays * 86400 });
    } else if (kind === 'unload') {
      const moved = Math.max(0, Math.min(stop.tonnes ?? cargo, cargo));
      cargo -= moved;
      events.push({ atSec: atSecStr(t), kind, placeId: stop.targetId, resourceKey: stop.resourceKeys?.[0], tonnes: moved, durationSec: dwellDays * 86400 });
    } else if (kind && dwellDays > 0) {
      events.push({ atSec: atSecStr(t), kind, placeId: stop.targetId, resourceKey: stop.resourceKeys?.[0] });
    }

    // Refuel: a port/depot tops the tanks up INSTANTLY, but harvesting fuel on the frontier (gas-skimming,
    // mining fuel-grade ice) fills at a rate — so it ramps over the harvest dwell, like cargo. Emitted at the
    // arrival time with that duration so the fuel curve rises across the stop, not in a step at departure.
    if (stop.refuelHere) {
      const frontierHarvest = kind === 'mine' || kind === 'load';
      events.push({ atSec: atSecStr(t), kind: 'refuel', placeId: stop.targetId, resourceKey: stop.resourceKeys?.[0], durationSec: frontierHarvest ? dwellDays * 86400 : 0 });
    }

    // Hold at the stop (dwell becomes the gap before the next hop → resolver shows "waiting at host").
    // Tardiness adds slack to STOPPED time only — a flyby (dwell 0) never stops, so it's never late.
    const slack = dwellDays > 0 && opts.tardiness ? opts.tardiness * hash01(`${opts.slackSeed ?? ''}:${i}:${atSecStr(t)}`) : 0;
    t += dwellDays * (1 + slack) * DAY_MS;
    if (stop.refuelHere) budget = capacity; // the NEXT hop (e.g. the return leg) departs fuelled


    committed++;
    i++;

    if (!opts.repeat && i >= stops.length) {
      return { plans: out, events, endHostId: host, attention: null, done: true, finalTimeMs: t };
    }
  }

  return { plans: out, events, endHostId: host, attention: null, done: false, finalTimeMs: t };
}

// Expand a captured autopilot leg into stops. Slice 1 handles the PLACE-targeted verbs; resource-
// targeted mine/explore (nearest-source) and escort/flyby come later, so they yield no stops for now.
// `isFuelCompatible(resourceKey)` is true when the ship can refuel from that resource (its fuels'
// refuel_tags include the key) — wired from the rulepack fuel definitions in production.
export function legToStops(
  leg: { action: string; placeId?: ID; resourceKeys?: string[]; loiterDays?: number; fillAmount_t?: number; rate_tpd?: number; deliverTo?: { placeId?: ID } },
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
      { targetId: leg.placeId, dwellDays: loadDwellDays, refuelHere: gathersFuel, verb: 'load', resourceKeys: carry, tonnes: leg.fillAmount_t, rate_tpd: leg.rate_tpd }
    ];
    if (leg.deliverTo?.placeId) {
      stops.push({ targetId: leg.deliverTo.placeId, dwellDays: loadDwellDays, refuelHere: false, verb: 'unload', resourceKeys: carry, tonnes: leg.fillAmount_t, rate_tpd: leg.rate_tpd });
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

// --- Bounded-lookahead reorder (Slice 3a) ---
// The reorder is a pure SEARCH; the cost of a hop is INJECTED (`legCost`) so there is exactly one transfer
// model in production — the caller wraps the real `calculateTransitPlan` (cached), NOT a parallel formula.
// That keeps the order the planner optimises and the journeys it commits costed by the same physics.
export interface ReorderWaypoint { id: ID; targetId: ID; dwellMs: number; staleness?: number }
export interface ReorderOpts {
  startHostId: ID;
  fromMs: number;
  planning: number;            // lookahead depth (0 ⇒ no reorder, fly as listed)
  objective: 'time' | 'fuel';  // from Drive: fast → time, thrifty → Δv
  // Cost of one hop, departing at departMs — production wraps the real `calculateTransitPlan` (cached), so
  // the reorder and the committed legs share ONE model; tests stub it. timeMs non-finite ⇒ unreachable.
  legCost: (fromId: ID, toId: ID, departMs: number) => { timeMs: number; dvMs: number };
  maxLegMs?: number;           // Max-time-per-leg: prune any ordering with a hop over the cap
  stalenessWeight?: number;    // fairness credit so a long-unvisited waypoint isn't perpetually deferred
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

function routeCost(order: ReorderWaypoint[], opts: ReorderOpts): number {
  let host = opts.startHostId, t = opts.fromMs, total = 0;
  for (const wp of order) {
    const c = opts.legCost(host, wp.targetId, t);
    if (!Number.isFinite(c.timeMs) || (opts.maxLegMs && c.timeMs > opts.maxLegMs)) return Infinity;
    total += opts.objective === 'time' ? c.timeMs : c.dvMs;
    t += c.timeMs; // arrival at this waypoint
    // Fairness: a stale waypoint reached LATE costs more, so the optimiser visits the overdue ones sooner.
    total += (wp.staleness ?? 0) * (opts.stalenessWeight ?? 0) * (t - opts.fromMs);
    t += Math.max(0, wp.dwellMs);
    host = wp.targetId;
  }
  return total;
}

// Reorder the next `planning` waypoints to minimise total torch cost over PROJECTED positions (the closer
// a body is NOW, the cheaper — and that swings as bodies orbit, so "closest now vs later" genuinely matters).
// planning 0 ⇒ greedy (fly as listed). Brute-force the window (≤6 ⇒ ≤720 perms); the rest keep their order.
export function reorderWaypoints(wps: ReorderWaypoint[], opts: ReorderOpts): ReorderWaypoint[] {
  if ((opts.planning ?? 0) <= 0 || wps.length <= 1) return wps;
  const N = Math.min(wps.length, Math.max(2, Math.floor(opts.planning)), 6);
  const window = wps.slice(0, N), tail = wps.slice(N);
  let best = window, bestCost = Infinity;
  for (const perm of permutations(window)) {
    const c = routeCost(perm, opts);
    if (c < bestCost) { bestCost = c; best = perm; }
  }
  return [...best, ...tail];
}

export interface AnyOrderOpts {
  startHostId: ID;
  fromMs: number;
  steps: number;               // how many picks to commit this generation (the 'any' horizon)
  objective: 'time' | 'fuel';
  legCost: (fromId: ID, toId: ID, departMs: number) => { timeMs: number; dvMs: number };
  freshnessWeight?: number;    // surcharge (×cost) on a just-serviced stop, decaying to 0 over the route length
  maxLegMs?: number;
}

// 'Any · as needed': greedily commit the single best NEXT stop, then re-pick from the ship's new position —
// with a freshness surcharge that decays over the route so a just-serviced stop is unlikely to win twice
// running, and every stop tends to get covered over time (without forcing a fixed circuit). Pure; legCost is
// injected (the SAME quote-backed cost the legs are committed with). Repetition is allowed by design.
export function selectAnyOrder(wps: ReorderWaypoint[], opts: AnyOrderOpts): ReorderWaypoint[] {
  if (!wps.length) return [];
  const out: ReorderWaypoint[] = [];
  let host = opts.startHostId, t = opts.fromMs;
  const window = Math.max(2, wps.length);     // a stop's freshness penalty fades over ~one route's worth of picks
  const lastStep = new Map<string, number>();
  for (let step = 0; step < Math.max(1, opts.steps); step++) {
    let best: ReorderWaypoint | null = null, bestScore = Infinity, bestTimeMs = 0;
    for (const wp of wps) {
      const c = opts.legCost(host, wp.targetId, t);
      if (!Number.isFinite(c.timeMs) || (opts.maxLegMs && c.timeMs > opts.maxLegMs)) continue;
      let score = opts.objective === 'time' ? c.timeMs : c.dvMs;
      const ls = lastStep.get(wp.id);
      if (ls !== undefined) {
        const recency = Math.max(0, 1 - (step - ls) / window); // 1 = just serviced … 0 = long ago
        score += (opts.freshnessWeight ?? 0) * recency * score;
      }
      if (score < bestScore) { bestScore = score; best = wp; bestTimeMs = c.timeMs; }
    }
    if (!best) break;                          // nothing reachable from here
    out.push(best);
    t += bestTimeMs + Math.max(0, best.dwellMs);
    host = best.targetId;
    lastStep.set(best.id, step);
  }
  return out;
}

// Build the full stop list for an engaged plan (in-order traversal, Slice 1).
export function planToStops(
  legs: Array<Parameters<typeof legToStops>[0]>,
  isFuelCompatible: (resourceKey: string) => boolean,
  loadDwellDays = 1
): AutopilotStop[] {
  return legs.flatMap((leg) => legToStops(leg, isFuelCompatible, loadDwellDays));
}
