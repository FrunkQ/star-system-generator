// Autopilot adapter (Slice 1, step 2) — wires the pure planner core to live system data and the real
// transit solver, producing the ScheduledJourneyLog chain an engaged ship flies. Kept separate from the
// pure `autopilotPlanner` so the core stays testable; this is the "impure" edge (specs, calculator, ids).
import type { CelestialBody, System, RulePack, ConstructLogEvent } from '$lib/types';
import type { ScheduledJourneyLog, TransitMode } from './types';
import { calculateTransitPlan } from './calculator';
import { calculateFullConstructSpecs } from '$lib/construct-logic';
import { constructTardiness } from '$lib/constructs/coi';
import { resolveConstructCurrentHostId } from './scheduler';
import { legToStops, walkStops, chooseSource, reorderWaypoints, selectAnyOrder, type AutopilotStop, type StopEvent } from './autopilotPlanner';

const DAY_MS = 86_400_000;
const G0 = 9.80665;

const aAU = (sys: System, id: string) => (sys.nodes.find((n) => n.id === id) as any)?.orbit?.elements?.a_AU ?? 0;
const ELIGIBLE_ROLES = new Set(['planet', 'moon', 'belt', 'ring']);

// Candidate bodies that can satisfy a resource-targeted leg — NATURAL BODIES ONLY (mine-bodies-only,
// spec §12.16; never a ship). travelCost is a cheap orbital-distance proxy from the ship's current host;
// abundance from the tag value; refuels = the body also carries a fuel-source the ship can use.
export function gatherResourceCandidates(
  sys: System,
  resourceKeys: string[],
  fromHostId: string,
  refuelKeys: Set<string>
) {
  const want = new Set(resourceKeys);
  const anyResource = want.size === 0; // explore "any" → any body carrying a resource
  const fromA = aAU(sys, fromHostId);
  const out: { id: string; travelCost: number; abundance: number; refuels: boolean }[] = [];
  for (const n of sys.nodes as any[]) {
    if (n.kind !== 'body' || !ELIGIBLE_ROLES.has(n.roleHint)) continue;
    if (n.id === fromHostId) continue;
    const tags: any[] = n.tags ?? [];
    const matched = tags.filter((t) => (anyResource ? String(t.key).startsWith('resource/') : want.has(t.key)));
    if (!matched.length) continue;
    const abundance = Math.min(1, Math.max(...matched.map((t) => Number(t.value) || 0.5)));
    const refuels = tags.some((t) => refuelKeys.has(t.key));
    out.push({ id: n.id, travelCost: Math.abs(aAU(sys, n.id) - fromA) + 0.001, abundance, refuels });
  }
  return out;
}

// Resolve a mine/explore leg from the ship's current host into concrete stops (the chosen source + any
// deliver-to). Returns [] when nothing in the system carries the resource (the leg is skipped).
export function resolveResourceStops(
  leg: any,
  fromHostId: string,
  sys: System,
  isFuelCompatible: (k: string) => boolean,
  refuelKeys: Set<string>,
  needsFuel: boolean
): AutopilotStop[] {
  const cands = gatherResourceCandidates(sys, leg.resourceKeys ?? [], fromHostId, refuelKeys);
  const best = chooseSource(cands, { needsFuel });
  if (!best) return [];
  if (leg.action === 'explore') {
    return [{ targetId: best.id, dwellDays: leg.loiterDays ?? 30, refuelHere: best.refuels, verb: 'explore', resourceKeys: leg.resourceKeys }];
  }
  // mine: dwell is finalised later from tonnes / (rate × abundance) once the haul amount is known; carry the
  // rate + the chosen source's richness so a richer deposit fills faster. Self-fuel if the body refuels or the
  // ore is fuel-grade. (Provisional dwell here is overwritten in generateAutopilotChain.)
  const dwell = leg.fillAmount_t && leg.rate_tpd ? leg.fillAmount_t / (leg.rate_tpd * Math.max(0.05, best.abundance)) : 5;
  const stops: AutopilotStop[] = [{
    targetId: best.id, dwellDays: dwell,
    refuelHere: best.refuels || (leg.resourceKeys ?? []).some(isFuelCompatible),
    verb: 'mine', resourceKeys: leg.resourceKeys, tonnes: leg.fillAmount_t, rate_tpd: leg.rate_tpd, abundance: best.abundance
  }];
  if (leg.deliverTo?.placeId) stops.push({ targetId: leg.deliverTo.placeId, dwellDays: 1, refuelHere: false, verb: 'unload', resourceKeys: leg.resourceKeys, tonnes: leg.fillAmount_t });
  return stops;
}

// Build the full stop list, resolving resource legs against the system as we chain (each "nearest source"
// is relative to where the ship is when it gets there).
export function buildAdapterStops(
  legs: any[],
  startHostId: string,
  sys: System,
  isFuelCompatible: (k: string) => boolean,
  refuelKeys: Set<string>,
  needsFuel: boolean
): AutopilotStop[] {
  let fromHost = startHostId;
  const stops: AutopilotStop[] = [];
  for (const leg of legs) {
    const s = (leg.action === 'mine' || leg.action === 'explore')
      ? resolveResourceStops(leg, fromHost, sys, isFuelCompatible, refuelKeys, needsFuel)
      : legToStops(leg, isFuelCompatible);
    if (s.length) { stops.push(...s); fromHost = s[s.length - 1].targetId; }
  }
  return stops;
}

export interface AutopilotGenResult {
  logs: ScheduledJourneyLog[];
  flightLog: ConstructLogEvent[];   // work events at the stops (load/unload/mine/refuel/loiter) for the ship's log
  attention: 'stuck' | 'intervention' | null;
  stuckReason?: string;
  done: boolean;
}

// Generate the journey chain for an engaged construct from its current position + the clock. Returns
// the logs to append to `scheduled_journeys` (each hop is its own single-plan log, matching the manual
// planner; the scheduler chains them). null when there's nothing to plan / no classifier data.
export function generateAutopilotChain(
  construct: CelestialBody,
  system: System,
  rulePack: RulePack,
  fromTimeMs: number,
  maxLegs?: number   // how many legs to commit this call; defaults to Planning. Top-up passes the shortfall.
): AutopilotGenResult | null {
  const ap: any = (construct as any).autopilot;
  if (!ap?.enabled || !Array.isArray(ap.legs) || !ap.legs.length) return null;
  if (!rulePack.engineDefinitions || !rulePack.fuelDefinitions) return null;

  const specs = calculateFullConstructSpecs(construct, rulePack.engineDefinitions.entries, rulePack.fuelDefinitions.entries, null);

  // Fuel-compat: a cargo/resource is self-fuel when it's in the union of the ship's fuels' refuel_tags.
  const refuelKeys = new Set<string>();
  for (const tank of construct.fuel_tanks ?? []) {
    const def = rulePack.fuelDefinitions.entries.find((f) => f.id === tank.fuel_type_id);
    for (const t of def?.refuel_tags ?? []) refuelKeys.add(t);
  }
  const isFuelCompatible = (k: string) => refuelKeys.has(k);

  // Δv now (current fuel) and when full (Tsiolkovsky) — for the stuck-flag + harvest top-up.
  const Isp = specs.avgVacIsp || 0;
  const dryKg = (specs.dryMass_tonnes || 0) * 1000;
  const wetFullKg = dryKg + (specs.fuelCapacity_tonnes || 0) * 1000;
  const budget = specs.totalVacuumDeltaV_ms || 0;
  const capacity = Isp > 0 && dryKg > 0 && wetFullKg > dryKg ? Isp * G0 * Math.log(wetFullKg / dryKg) : budget;

  const startHostId = resolveConstructCurrentHostId(construct, fromTimeMs) || construct.parentId || '';
  if (!startHostId) return { logs: [], flightLog: [], attention: 'stuck', stuckReason: 'no host to depart from', done: false };

  // Free cargo space — the default haul amount when a leg doesn't pin fillAmount_t.
  const freeCargo_t = Math.max(0, ((specs as any).cargoCapacity_tonnes || 0) - (construct.current_cargo_tonnes || 0));
  const nodeName = (id: string) => (system.nodes.find((n) => n.id === id) as any)?.name || id;
  const resLabel = (k?: string) => (k ? k.replace(/^resource\//, '').replace(/-/g, ' ') : '');

  const repeat = ap.repeat !== false;
  const driveFast = (ap.drive ?? 0.5) >= 0.5;
  const mode: TransitMode = 'Economy';
  const maxG = ap.maxAccelG && ap.maxAccelG > 0 ? Math.min(ap.maxAccelG, specs.maxVacuumG || ap.maxAccelG) : (specs.maxVacuumG || 1);

  // THE one transfer model — used to both cost the reorder AND commit the legs, so they can't disagree.
  // `light` selects the quote tier (Efficient Now + Direct Burn only, no delayed-window sweep / assist / path)
  // for the many-call reorder search; committed legs run the full solver.
  const solveLeg = (originId: string, targetId: string, startMs: number, light = false) => {
    const params: any = {
      maxG, accelRatio: 0.3, brakeRatio: 0.3, interceptSpeed_ms: 0,
      shipMass_kg: (specs.totalMass_tonnes || 0) * 1000,
      shipDryMass_kg: dryKg,
      shipIsp: Isp || undefined,
      brakeAtArrival: true,
      quote: light
    };
    const all = calculateTransitPlan(system, originId, targetId, startMs, mode, params);
    const valid = all.filter((p) => p.isValid && !p.hiddenReason);
    if (!valid.length) return { plans: [], arriveMs: startMs, deltaV_ms: 0, valid: false };
    // Drive: fast → least time; thrifty → least Δv/fuel.
    valid.sort((a, b) => (driveFast ? a.totalTime_days - b.totalTime_days : a.totalDeltaV_ms - b.totalDeltaV_ms));
    const chosen = valid[0];
    return { plans: [chosen], arriveMs: startMs + (chosen.totalTime_days || 0) * DAY_MS, deltaV_ms: chosen.totalDeltaV_ms || 0, valid: true };
  };
  // Reorder cost = the SAME solveLeg, cached by (from,to,day) so the permutation search stays affordable
  // without ever inventing a parallel cost model.
  const costCache = new Map<string, { timeMs: number; dvMs: number }>();
  const legCost = (originId: string, targetId: string, departMs: number) => {
    const key = `${originId}|${targetId}|${Math.round(departMs / DAY_MS)}`;
    let c = costCache.get(key);
    if (!c) {
      const s = solveLeg(originId, targetId, departMs, true); // quote tier — light cost-only estimate
      c = s.valid ? { timeMs: s.arriveMs - departMs, dvMs: s.deltaV_ms } : { timeMs: Infinity, dvMs: Infinity };
      costCache.set(key, c);
    }
    return c;
  };

  // Traversal (both gated to fixed-place plans for now; resource/escort legs fly as listed):
  //  • best-order — reorder the next `planning` legs to minimise total cost (visit ALL).
  //  • any        — greedily commit the best next stop, re-picking with a freshness bias (visit WHICHEVER).
  // Both cost candidates with the same quote-backed legCost the legs are committed with.
  let plannedLegs = ap.legs;
  let anyOrder = false;
  const allPlace = ap.legs.every((l: any) => l.placeId);
  if (ap.traversal === 'best-order' && (ap.planning ?? 0) > 0 && allPlace) {
    const wps = ap.legs.map((leg: any, i: number) => ({ id: String(i), targetId: leg.placeId as string, dwellMs: (leg.loiterDays ?? 1) * DAY_MS }));
    const ordered = reorderWaypoints(wps, {
      startHostId, fromMs: fromTimeMs, planning: ap.planning,
      objective: driveFast ? 'time' : 'fuel', legCost,
      maxLegMs: ap.maxJourneyDays ? ap.maxJourneyDays * DAY_MS : undefined
    });
    plannedLegs = ordered.map((w) => ap.legs[Number(w.id)]);
  } else if (ap.traversal === 'any' && ap.legs.length > 1 && allPlace) {
    anyOrder = true;
    const steps = Math.max(1, Math.floor(maxLegs ?? ap.planning ?? 2)); // commit Planning picks ahead
    const wps = ap.legs.map((leg: any, i: number) => ({ id: String(i), targetId: leg.placeId as string, dwellMs: (leg.loiterDays ?? 1) * DAY_MS }));
    const seq = selectAnyOrder(wps, {
      startHostId, fromMs: fromTimeMs, steps,
      objective: driveFast ? 'time' : 'fuel', legCost, freshnessWeight: 0.8,
      maxLegMs: ap.maxJourneyDays ? ap.maxJourneyDays * DAY_MS : undefined
    });
    plannedLegs = seq.map((w) => ap.legs[Number(w.id)]);
  }

  const needsFuel = !ap.ignoreFuel && budget < capacity * 0.5; // low on fuel → prefer self-fuelling sources
  const stops = buildAdapterStops(plannedLegs, startHostId, system, isFuelCompatible, refuelKeys, needsFuel);
  if (!stops.length) return { logs: [], flightLog: [], attention: 'intervention', done: false }; // no resolvable stops (e.g. resource not present)
  // Default any haul that didn't pin an amount to the ship's free cargo space, then size the dwell from
  // tonnes / (rate × abundance) — a richer source (or a faster loader) fills in fewer days.
  for (const s of stops) {
    if (s.tonnes == null && (s.verb === 'load' || s.verb === 'unload' || s.verb === 'mine') && freeCargo_t > 0) s.tonnes = freeCargo_t;
    if ((s.verb === 'load' || s.verb === 'mine') && s.rate_tpd && s.rate_tpd > 0 && s.tonnes) {
      s.dwellDays = s.tonnes / (s.rate_tpd * Math.max(0.05, s.abundance ?? 1));
    }
  }

  // Commit horizon = Planning legs ahead (what the slider literally promises). The clock top-up keeps Planning
  // legs committed ahead of the display clock as time advances. For 'any', the greedy selection IS the
  // commitment (walk exactly those stops). A run-once route commits its whole length (it deliberately ends).
  const legsToCommit = Math.max(1, Math.floor(maxLegs ?? ap.planning ?? 2));
  const horizon = anyOrder ? Math.max(1, stops.length)
    : repeat ? legsToCommit : Math.max(stops.length, 1);

  // Discipline: explicit slider wins, else inherit from the Owner CoI (military 0 … owner-operator 1).
  const tardiness = ap.tardiness ?? constructTardiness(construct) ?? 0;

  const res = walkStops(stops, {
    fromMs: fromTimeMs,
    startHostId,
    planningHorizon: horizon,
    repeat,
    ignoreFuel: !!ap.ignoreFuel,
    fuelBudget_ms: budget,
    fuelCapacity_ms: capacity,
    solveLeg,
    maxJourneyDays: ap.maxJourneyDays,
    tardiness,
    slackSeed: construct.id,
    startCargo_t: Math.max(0, construct.current_cargo_tonnes || 0), // a full hauler delivers before it mines more
    cargoCapacity_t: (specs as any).cargoCapacity_tonnes || 0
  });

  const createdAtSec = BigInt(Math.floor(fromTimeMs / 1000)).toString();
  const logs: ScheduledJourneyLog[] = res.plans.map((p, i) => ({
    id: `ap-${createdAtSec}-${i}`,
    createdAtSec,
    plans: [JSON.parse(JSON.stringify(p))],
    status: 'scheduled' as const,
    autopilot: true
  }));

  const flightLog: ConstructLogEvent[] = res.events.map((e, i) => finalizeEvent(e, i, nodeName, resLabel));

  return { logs, flightLog, attention: res.attention, stuckReason: res.stuckReason, done: res.done };
}

// Turn a name-free StopEvent from the pure core into a display-ready flight-log entry (id + human text).
function finalizeEvent(e: StopEvent, i: number, nodeName: (id: string) => string, resLabel: (k?: string) => string): ConstructLogEvent {
  const place = nodeName(e.placeId);
  const res = resLabel(e.resourceKey);
  const amt = e.tonnes ? `${Math.round(e.tonnes)} t ` : '';
  let text: string;
  switch (e.kind) {
    case 'load':   text = `Loaded ${amt}${res || 'cargo'} at ${place}`; break;
    case 'unload': text = `Unloaded ${amt}${res || 'cargo'} at ${place}`; break;
    case 'mine':   text = `Mined ${amt}${res || 'ore'} at ${place}`; break;
    case 'refuel': {
      const days = e.durationSec ? Math.round(e.durationSec / 86400) : 0;
      text = days > 0 ? `Refuelled${res ? ` (${res})` : ''} at ${place} over ${days} ${days === 1 ? 'day' : 'days'}` : `Refuelled${res ? ` (${res})` : ''} at ${place}`;
      break;
    }
    case 'loiter': text = `Held station at ${place}`; break;
    default:       text = `${e.kind} at ${place}`;
  }
  return { id: `ev-${e.atSec}-${i}`, atSec: e.atSec, kind: e.kind, text, placeId: e.placeId, resourceKey: e.resourceKey, tonnes: e.tonnes, durationSec: e.durationSec };
}
