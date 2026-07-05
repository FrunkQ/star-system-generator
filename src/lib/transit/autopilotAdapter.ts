// Autopilot adapter (Slice 1, step 2) — wires the pure planner core to live system data and the real
// transit solver, producing the ScheduledJourneyLog chain an engaged ship flies. Kept separate from the
// pure `autopilotPlanner` so the core stays testable; this is the "impure" edge (specs, calculator, ids).
import type { CelestialBody, System, RulePack, ConstructLogEvent } from '$lib/types';
import type { ScheduledJourneyLog, TransitMode } from './types';
import { calculateTransitPlan } from './calculator';
import { calculateFullConstructSpecs } from '$lib/construct-logic';
import { constructTardiness, constructReadiness } from '$lib/constructs/coi';
import { resolveConstructCurrentHostId } from './scheduler';
import { legToStops, walkStops, chooseSource, reorderWaypoints, selectAnyOrder, type AutopilotStop, type StopEvent } from './autopilotPlanner';

const DAY_MS = 86_400_000;
const G0 = 9.81; // matches transit/physics G0 — capacity estimates here must use the same constant as calculateFuelMass

// Autopilot burn profile is a STRAIGHT TIE to the Drive slider (efficiency ↔ speed): a thrifty ship coasts
// long (20/60/20 accel/coast/brake), a fast one burns continuously (50/0/50), with fixed graduations between
// — mirroring the manual planner's profile sliders without exposing a second dial. Fuel is a SECOND limit on
// top: if the preferred tier's leg costs more Δv than is aboard, solveLeg steps DOWN toward the coastiest
// tier until the leg fits (go slower rather than strand); only if even 20/60/20 won't fit does the walker
// raise the stuck flag. The solver itself stays shared with the manual planner — profile choice is the one
// deliberate input difference.
export const AUTOPILOT_PROFILES = [
  { accel: 0.2, brake: 0.2 }, // 20/60/20 — longest coast, thriftiest
  { accel: 0.3, brake: 0.3 }, // 30/40/30
  { accel: 0.4, brake: 0.4 }, // 40/20/40
  { accel: 0.5, brake: 0.5 }  // 50/0/50 — continuous burn, fastest
];
// drive 0..1 → tier index (0.5 rounds up to the speedier middle, matching driveFast = drive >= 0.5).
export const profileIndexForDrive = (drive: number) =>
  Math.min(AUTOPILOT_PROFILES.length - 1, Math.max(0, Math.round((Number.isFinite(drive) ? drive : 0.5) * (AUTOPILOT_PROFILES.length - 1))));

const aAU = (sys: System, id: string) => (sys.nodes.find((n) => n.id === id) as any)?.orbit?.elements?.a_AU ?? 0;
const ELIGIBLE_ROLES = new Set(['planet', 'moon', 'belt', 'ring']);

// Candidate bodies that can satisfy a resource-targeted leg — NATURAL BODIES ONLY (mine-bodies-only,
// spec §12.16; never a ship). travelCost is a cheap orbital-distance proxy from the ship's current host;
// abundance from the tag value; refuels = the body also carries a fuel-source the ship can use.
// `exclude` filters AUTO-CHOSEN destinations only (Avoid-list places + explore's already-visited log) — an
// explicitly-picked place leg always wins over its own avoid list.
export function gatherResourceCandidates(
  sys: System,
  resourceKeys: string[],
  fromHostId: string,
  refuelKeys: Set<string>,
  exclude?: Set<string>
) {
  const want = new Set(resourceKeys);
  const anyResource = want.size === 0; // explore "any" → any body carrying a resource
  const fromA = aAU(sys, fromHostId);
  const out: { id: string; travelCost: number; abundance: number; refuels: boolean }[] = [];
  for (const n of sys.nodes as any[]) {
    if (n.kind !== 'body' || !ELIGIBLE_ROLES.has(n.roleHint)) continue;
    if (n.id === fromHostId) continue;
    if (exclude?.has(n.id)) continue;
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
  needsFuel: boolean,
  exclude?: Set<string>
): AutopilotStop[] {
  const cands = gatherResourceCandidates(sys, leg.resourceKeys ?? [], fromHostId, refuelKeys, exclude);
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
  needsFuel: boolean,
  fromTimeMs = 0,
  avoid?: Set<string>,   // Avoid list — auto-chosen sources never land here (explicit place legs still win)
  visited?: Set<string>  // places already in the ship's log — explore's noRevisit skips them, pushing outward
): AutopilotStop[] {
  let fromHost = startHostId;
  const stops: AutopilotStop[] = [];
  for (const leg of legs) {
    // Escort/pursuit = rendezvous with a MOVING construct, then hold. The escort targets the CONSTRUCT
    // ITSELF — the transit solver handles construct targets (same as the manual planner), the arrival is a
    // velocity-matched rendezvous, and the post-arrival sampler is genuine FORMATION FLYING: the escort
    // mirrors its charge's motion tick by tick through everything it subsequently does, offset by the km
    // standoff (samplePostJourneyState). So an escort can catch a ship in open space, not just at a port.
    // Caveat: a charge that is mid-BURN at solve time is aimed at via linear projection of its current
    // vector — intercepting coasting/parked charges is accurate; a long chase of an accelerating target
    // closes with a visible correction at arrival (journey-aware aiming is the banked refinement).
    if (leg.action === 'escort') {
      const target = (sys.nodes as any[]).find((n) => n.id === leg.placeId && n.kind === 'construct');
      if (target) {
        stops.push({ targetId: target.id, dwellDays: leg.loiterDays ?? 5, refuelHere: false, verb: 'patrol', action: 'escort', escortKm: Math.max(0, leg.escortKm ?? 0) });
        fromHost = target.id;
      }
      continue;
    }
    const exclude = (avoid?.size || (leg.action === 'explore' && leg.noRevisit && visited?.size))
      ? new Set<string>([...(avoid ?? []), ...((leg.action === 'explore' && leg.noRevisit ? visited : undefined) ?? [])])
      : undefined;
    const s = (leg.action === 'mine' || leg.action === 'explore')
      ? resolveResourceStops(leg, fromHost, sys, isFuelCompatible, refuelKeys, needsFuel, exclude)
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

  // Readiness (0..1, the worst Status blocker): a wreck/impounded/dormant ship (0) can't be sent anywhere; a
  // damaged or under-construction ship (e.g. 0.5) limps along at reduced thrust. Applied to maxG below.
  const readiness = constructReadiness(construct);
  if (readiness <= 0) return { logs: [], flightLog: [], attention: 'stuck', stuckReason: 'not operational — its status prevents movement (repair/release it first)', done: false };

  const startHostId = resolveConstructCurrentHostId(construct, fromTimeMs) || construct.parentId || '';
  if (!startHostId) return { logs: [], flightLog: [], attention: 'stuck', stuckReason: 'no host to depart from', done: false };

  const nodeName = (id: string) => (system.nodes.find((n) => n.id === id) as any)?.name || id;
  const resLabel = (k?: string) => (k ? k.replace(/^resource\//, '').replace(/-/g, ' ') : '');

  const repeat = ap.repeat !== false;
  const driveFast = (ap.drive ?? 0.5) >= 0.5;
  const mode: TransitMode = 'Economy';
  const maxGFull = ap.maxAccelG && ap.maxAccelG > 0 ? Math.min(ap.maxAccelG, specs.maxVacuumG || ap.maxAccelG) : (specs.maxVacuumG || 1);
  const maxG = maxGFull * readiness; // a damaged ship limps along at reduced thrust (readiness 0..1)

  // THE one transfer model — used to both cost the reorder AND commit the legs, so they can't disagree.
  // `light` selects the quote tier (Efficient Now + Direct Burn only, no delayed-window sweep / assist / path)
  // for the many-call reorder search; committed legs run the full solver.
  // Burn profile: starts at the Drive-preferred tier; if `dvAvailable_ms` is given and the chosen leg costs
  // more than that, steps DOWN through coastier tiers until it fits (slower but affordable). If even the
  // coastiest won't fit, returns that cheapest attempt so the walker's stuck flag carries real numbers.
  // The reorder search costs at the preferred tier only — the downgrade is an emergency brake, not a mode.
  const preferredTier = profileIndexForDrive(ap.drive ?? 0.5);
  const solveLeg = (originId: string, targetId: string, startMs: number, light = false, dvAvailable_ms?: number) => {
    let fallback: { plans: any[]; arriveMs: number; deltaV_ms: number; valid: boolean } | null = null;
    for (let tier = preferredTier; tier >= 0; tier--) {
      const prof = AUTOPILOT_PROFILES[tier];
      const params: any = {
        maxG, accelRatio: prof.accel, brakeRatio: prof.brake, interceptSpeed_ms: 0,
        shipMass_kg: (specs.totalMass_tonnes || 0) * 1000,
        shipDryMass_kg: dryKg,
        shipIsp: Isp || undefined,
        brakeAtArrival: true,
        quote: light
      };
      const all = calculateTransitPlan(system, originId, targetId, startMs, mode, params);
      const valid = all.filter((p) => p.isValid && !p.hiddenReason);
      if (!valid.length) continue; // a coastier profile may still be solvable
      // Max time per leg counts the WHOLE leg — a delayed launch window PLUS the transit. A cheap plan that
      // waits 300 days for alignment busts a 250-day cap even if it only flies 200; when the capped set is
      // non-empty, choose from it (a faster family wins over waiting), and only when NOTHING fits keep the
      // uncapped best so the walker's over-cap stuck flag reports real numbers.
      const elapsedDays = (p: any) => ((Number.isFinite(p.startTime) ? p.startTime : startMs) - startMs) / DAY_MS + (p.totalTime_days || 0);
      let pool = valid;
      if (ap.maxJourneyDays && ap.maxJourneyDays > 0) {
        const within = valid.filter((p) => elapsedDays(p) <= ap.maxJourneyDays);
        if (within.length) pool = within;
      }
      // Drive: fast → least time; thrifty → least Δv/fuel.
      pool.sort((a: any, b: any) => (driveFast ? a.totalTime_days - b.totalTime_days : a.totalDeltaV_ms - b.totalDeltaV_ms));
      const chosen = pool[0];
      // Arrival = the plan's OWN departure + transit: the Most Efficient family can commit a DELAYED launch
      // window (startTime = now + up to ~1000 days — this IS the "wait for alignment" behaviour, thrifty
      // ships pick it by Δv), so anchoring arrival on the requested startMs understated every delayed leg
      // and stacked the following legs on top of the wait.
      const departMs = Number.isFinite(chosen.startTime) ? chosen.startTime : startMs;
      const res = { plans: [chosen], arriveMs: departMs + (chosen.totalTime_days || 0) * DAY_MS, deltaV_ms: chosen.totalDeltaV_ms || 0, valid: true };
      if (dvAvailable_ms === undefined || res.deltaV_ms <= dvAvailable_ms) return res;
      fallback = res; // over budget — remember the cheapest so far, try a longer coast
    }
    return fallback ?? { plans: [], arriveMs: startMs, deltaV_ms: 0, valid: false };
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
  const allPlace = ap.legs.every((l: any) => l.placeId && l.action !== 'escort'); // escort = a MOVING target, never reordered as a fixed place
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
  // Avoid list: auto-chosen resource sources never land at these (an explicit place leg still wins — the GM
  // said go there). Visited: places already in the ship's log — explore legs with noRevisit skip them, so
  // each top-up pushes the survey outward instead of circling the nearest source.
  const avoid = new Set<string>((ap.avoidPlaceIds ?? []).filter(Boolean));
  const visited = new Set<string>(((construct as any).flight_log ?? []).map((e: any) => e.placeId).filter(Boolean));
  const stops = buildAdapterStops(plannedLegs, startHostId, system, isFuelCompatible, refuelKeys, needsFuel, fromTimeMs, avoid, visited);
  if (!stops.length) return { logs: [], flightLog: [], attention: 'intervention', done: false }; // no resolvable stops (e.g. resource not present)
  // Size each pinned-amount haul's dwell from tonnes / (rate × abundance). Unpinned hauls ("fill the hold")
  // are sized inside walkStops once it knows the real free space after any deliver-first unload.
  for (const s of stops) {
    if ((s.verb === 'load' || s.verb === 'mine') && s.rate_tpd && s.rate_tpd > 0 && s.tonnes) {
      s.dwellDays = s.tonnes / (s.rate_tpd * Math.max(0.05, s.abundance ?? 1));
    }
  }

  // Precedence: a ship that BEGINS with cargo aboard should deliver it before gathering more (Alex: "if already
  // full, the first port of call may be home to unload"). If the route opens on a load/mine but has a drop-off,
  // prepend an unload of the existing cargo at that drop-off so it clears the hold first.
  const startCargo_t = Math.max(0, construct.current_cargo_tonnes || 0);
  if (startCargo_t > 0) {
    const firstWork = stops.find((s) => s.verb === 'load' || s.verb === 'mine' || s.verb === 'unload');
    const firstDrop = stops.find((s) => s.verb === 'unload');
    if (firstWork && firstDrop && firstWork.verb !== 'unload') {
      stops.unshift({ targetId: firstDrop.targetId, dwellDays: 1, refuelHere: false, verb: 'unload', resourceKeys: firstDrop.resourceKeys, tonnes: startCargo_t });
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
    // The walker's 4th arg is dvAvailable (its running fuel state) — pin `light` to false so committed legs
    // always run the full solver, with the fuel-aware profile step-down live.
    solveLeg: (o: string, tgt: string, t: number, dv?: number) => solveLeg(o, tgt, t, false, dv),
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
