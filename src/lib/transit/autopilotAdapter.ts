// Autopilot adapter (Slice 1, step 2) — wires the pure planner core to live system data and the real
// transit solver, producing the ScheduledJourneyLog chain an engaged ship flies. Kept separate from the
// pure `autopilotPlanner` so the core stays testable; this is the "impure" edge (specs, calculator, ids).
import type { CelestialBody, System, RulePack } from '$lib/types';
import type { ScheduledJourneyLog, TransitMode } from './types';
import { calculateTransitPlan } from './calculator';
import { calculateFullConstructSpecs } from '$lib/construct-logic';
import { resolveConstructCurrentHostId } from './scheduler';
import { planToStops, walkStops } from './autopilotPlanner';

const DAY_MS = 86_400_000;
const G0 = 9.80665;

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

  const stops = planToStops(ap.legs, isFuelCompatible);
  if (!stops.length) return { logs: [], attention: 'intervention', done: false }; // only resource/escort legs (slice 2+)

  const repeat = ap.repeat !== false;
  const driveFast = (ap.drive ?? 0.5) >= 0.5;
  const mode: TransitMode = 'Economy';
  const maxG = ap.maxAccelG && ap.maxAccelG > 0 ? Math.min(ap.maxAccelG, specs.maxVacuumG || ap.maxAccelG) : (specs.maxVacuumG || 1);

  const solveLeg = (originId: string, targetId: string, startMs: number) => {
    const params: any = {
      maxG, accelRatio: 0.3, brakeRatio: 0.3, interceptSpeed_ms: 0,
      shipMass_kg: (specs.totalMass_tonnes || 0) * 1000,
      shipDryMass_kg: dryKg,
      shipIsp: Isp || undefined,
      brakeAtArrival: true
    };
    const all = calculateTransitPlan(system, originId, targetId, startMs, mode, params);
    const valid = all.filter((p) => p.isValid && !p.hiddenReason);
    if (!valid.length) return { plans: [], arriveMs: startMs, deltaV_ms: 0, valid: false };
    // Drive: fast → least time; thrifty → least Δv/fuel.
    valid.sort((a, b) => (driveFast ? a.totalTime_days - b.totalTime_days : a.totalDeltaV_ms - b.totalDeltaV_ms));
    const chosen = valid[0];
    return { plans: [chosen], arriveMs: startMs + (chosen.totalTime_days || 0) * DAY_MS, deltaV_ms: chosen.totalDeltaV_ms || 0, valid: true };
  };

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
