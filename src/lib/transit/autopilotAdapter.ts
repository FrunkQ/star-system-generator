// Autopilot adapter (Slice 1, step 2) — wires the pure planner core to live system data and the real
// transit solver, producing the ScheduledJourneyLog chain an engaged ship flies. Kept separate from the
// pure `autopilotPlanner` so the core stays testable; this is the "impure" edge (specs, calculator, ids).
import type { CelestialBody, System, RulePack } from '$lib/types';
import type { ScheduledJourneyLog, TransitMode } from './types';
import { calculateTransitPlan } from './calculator';
import { calculateFullConstructSpecs } from '$lib/construct-logic';
import { resolveConstructCurrentHostId } from './scheduler';
import { legToStops, walkStops, chooseSource, reorderWaypoints, type AutopilotStop } from './autopilotPlanner';

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
  // mine: dwell from fill ÷ rate (else a default); self-fuel if the body refuels or the ore is fuel-grade.
  const dwell = leg.fillAmount_t && leg.rate_tpd ? leg.fillAmount_t / leg.rate_tpd : 5;
  const stops: AutopilotStop[] = [{
    targetId: best.id, dwellDays: dwell,
    refuelHere: best.refuels || (leg.resourceKeys ?? []).some(isFuelCompatible),
    verb: 'mine', resourceKeys: leg.resourceKeys
  }];
  if (leg.deliverTo?.placeId) stops.push({ targetId: leg.deliverTo.placeId, dwellDays: 1, refuelHere: false, verb: 'unload', resourceKeys: leg.resourceKeys });
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
  fromTimeMs: number
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
  if (!startHostId) return { logs: [], attention: 'stuck', stuckReason: 'no host to depart from', done: false };

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

  // best-order: reorder the legs (gated to fixed-place plans for now) to minimise total cost over the
  // next `planning` stops, using the real solver's cost. Other traversals fly as listed (in-order).
  let plannedLegs = ap.legs;
  if (ap.traversal === 'best-order' && (ap.planning ?? 0) > 0 && ap.legs.every((l: any) => l.placeId)) {
    const wps = ap.legs.map((leg: any, i: number) => ({ id: String(i), targetId: leg.placeId as string, dwellMs: (leg.loiterDays ?? 1) * DAY_MS }));
    const ordered = reorderWaypoints(wps, {
      startHostId, fromMs: fromTimeMs, planning: ap.planning,
      objective: driveFast ? 'time' : 'fuel', legCost,
      maxLegMs: ap.maxJourneyDays ? ap.maxJourneyDays * DAY_MS : undefined
    });
    plannedLegs = ordered.map((w) => ap.legs[Number(w.id)]);
  }

  const needsFuel = !ap.ignoreFuel && budget < capacity * 0.5; // low on fuel → prefer self-fuelling sources
  const stops = buildAdapterStops(plannedLegs, startHostId, system, isFuelCompatible, refuelKeys, needsFuel);
  if (!stops.length) return { logs: [], attention: 'intervention', done: false }; // no resolvable stops (e.g. resource not present)

  // Commit horizon. Planning is the eventual incremental depth; until the clock-advance top-up exists,
  // commit at least one full circuit so a fired-up ship visibly flies its route (capped to avoid huge chains).
  const planning = Math.max(1, Math.floor(ap.planning ?? 2));
  const horizon = repeat ? Math.min(Math.max(planning, stops.length), 24) : Math.max(stops.length, 1);

  const res = walkStops(stops, {
    fromMs: fromTimeMs,
    startHostId,
    planningHorizon: horizon,
    repeat,
    ignoreFuel: !!ap.ignoreFuel,
    fuelBudget_ms: budget,
    fuelCapacity_ms: capacity,
    solveLeg,
    maxJourneyDays: ap.maxJourneyDays
  });

  const createdAtSec = BigInt(Math.floor(fromTimeMs / 1000)).toString();
  const logs: ScheduledJourneyLog[] = res.plans.map((p, i) => ({
    id: `ap-${createdAtSec}-${i}`,
    createdAtSec,
    plans: [JSON.parse(JSON.stringify(p))],
    status: 'scheduled' as const,
    autopilot: true
  }));

  return { logs, attention: res.attention, stuckReason: res.stuckReason, done: res.done };
}
