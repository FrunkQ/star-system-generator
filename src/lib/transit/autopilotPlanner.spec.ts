import { describe, it, expect } from 'vitest';
import { walkStops, legToStops, planToStops, type AutopilotStop, type SolveLeg } from './autopilotPlanner';

const DAY_MS = 86_400_000;

// A predictable stub solver: every hop takes `days` and costs `dv` m/s. Lets us assert chaining,
// dwell, horizon and fuel logic without the real physics. `unreachable` ids return invalid.
function stubSolve(days = 10, dv = 1000, unreachable: string[] = []): SolveLeg {
  return (originId, targetId, startMs) => {
    if (unreachable.includes(targetId)) return { plans: [], arriveMs: startMs, deltaV_ms: 0, valid: false };
    const plan: any = { id: `${originId}->${targetId}@${startMs}`, originId, targetId, startTime: startMs, totalTime_days: days, totalDeltaV_ms: dv, isValid: true };
    return { plans: [plan], arriveMs: startMs + days * DAY_MS, deltaV_ms: dv, valid: true };
  };
}

const baseOpts = {
  fromMs: 0,
  startHostId: 'home',
  planningHorizon: 5,
  repeat: true,
  ignoreFuel: true,
  fuelBudget_ms: Infinity,
  fuelCapacity_ms: Infinity,
  solveLeg: stubSolve()
};

const patrol = (id: string, loiter = 0): AutopilotStop => ({ targetId: id, dwellDays: loiter, refuelHere: false, verb: 'patrol' });

describe('autopilot walkStops — in-order chain', () => {
  it('commits a leg per stop, in order, chaining departure→arrival+dwell', () => {
    const stops = [patrol('A', 5), patrol('B', 0), patrol('C', 0)];
    const r = walkStops(stops, { ...baseOpts, planningHorizon: 3 });
    expect(r.plans.map((p) => p.targetId)).toEqual(['A', 'B', 'C']);
    expect(r.endHostId).toBe('C');
    expect(r.attention).toBeNull();
    // home→A (10d) + 5d loiter, then A→B (10d), B→C (10d) = 35 days
    expect(r.finalTimeMs).toBe((10 + 5 + 10 + 10) * DAY_MS);
  });

  it('Planning is the commit horizon — Planning 1 plans only the next hop', () => {
    const stops = [patrol('A'), patrol('B'), patrol('C')];
    const r = walkStops(stops, { ...baseOpts, planningHorizon: 1 });
    expect(r.plans.map((p) => p.targetId)).toEqual(['A']);
    expect(r.done).toBe(false);
  });

  it('repeat loops the route around the horizon', () => {
    const stops = [patrol('A'), patrol('B')];
    const r = walkStops(stops, { ...baseOpts, planningHorizon: 5, repeat: true });
    expect(r.plans.map((p) => p.targetId)).toEqual(['A', 'B', 'A', 'B', 'A']);
  });

  it('run-once stops at the end of the route and flags done', () => {
    const stops = [patrol('A'), patrol('B')];
    const r = walkStops(stops, { ...baseOpts, planningHorizon: 5, repeat: false });
    expect(r.plans.map((p) => p.targetId)).toEqual(['A', 'B']);
    expect(r.done).toBe(true);
  });
});

describe('autopilot walkStops — stuck flags', () => {
  it('flags stuck when a hop has no route', () => {
    const r = walkStops([patrol('A'), patrol('X'), patrol('C')], { ...baseOpts, solveLeg: stubSolve(10, 1000, ['X']) });
    expect(r.attention).toBe('stuck');
    expect(r.plans.map((p) => p.targetId)).toEqual(['A']); // committed up to the blocker
  });

  it('flags stuck when a hop exceeds the max-journey-time cap', () => {
    const r = walkStops([patrol('A')], { ...baseOpts, solveLeg: stubSolve(40, 1000), maxJourneyDays: 30 });
    expect(r.attention).toBe('stuck');
  });

  it('flags stuck when fuel runs out and no top-up is available', () => {
    // budget = 1500, each hop costs 1000 → first hop ok (500 left), second hop short.
    const r = walkStops([patrol('A'), patrol('B'), patrol('C')], {
      ...baseOpts, ignoreFuel: false, fuelBudget_ms: 1500, fuelCapacity_ms: 5000
    });
    expect(r.plans.map((p) => p.targetId)).toEqual(['A']);
    expect(r.attention).toBe('stuck');
    expect(r.stuckReason).toMatch(/fuel/);
  });

  it('harvest/depot refuel at a stop lets the return leg depart fuelled — no stuck', () => {
    // Same tight budget, but stop A tops up (harvested a fuel-compatible cargo).
    const stops: AutopilotStop[] = [
      { targetId: 'A', dwellDays: 0, refuelHere: true, verb: 'load' },
      patrol('B'), patrol('C')
    ];
    const r = walkStops(stops, { ...baseOpts, ignoreFuel: false, fuelBudget_ms: 1500, fuelCapacity_ms: 5000, planningHorizon: 3 });
    expect(r.attention).toBeNull();
    expect(r.plans.map((p) => p.targetId)).toEqual(['A', 'B', 'C']);
  });
});

describe('autopilot legToStops', () => {
  const noFuel = () => false;
  it('patrol → one stop with its loiter time', () => {
    expect(legToStops({ action: 'patrol', placeId: 'A', loiterDays: 12 }, noFuel)).toEqual([
      { targetId: 'A', dwellDays: 12, refuelHere: false, verb: 'patrol' }
    ]);
  });

  it('transport → load + unload stops', () => {
    const s = legToStops({ action: 'transport', placeId: 'mine', resourceKeys: ['resource/ore-belt'], deliverTo: { placeId: 'depot' } }, noFuel);
    expect(s.map((x) => [x.targetId, x.verb])).toEqual([['mine', 'load'], ['depot', 'unload']]);
  });

  it('transport carrying a fuel-compatible cargo refuels at the pickup', () => {
    const isFuel = (k: string) => k === 'resource/water-ice';
    const s = legToStops({ action: 'transport', placeId: 'ice', resourceKeys: ['resource/water-ice'], deliverTo: { placeId: 'port' } }, isFuel);
    expect(s[0].refuelHere).toBe(true);  // self-fuels on the ice it loads
    expect(s[1].refuelHere).toBe(false);
  });

  it('mine/explore/escort yield no stops in slice 1', () => {
    expect(legToStops({ action: 'mine', resourceKeys: ['resource/water-ice'] }, noFuel)).toEqual([]);
    expect(planToStops([{ action: 'patrol', placeId: 'A' }, { action: 'mine', resourceKeys: ['x'] }], noFuel)).toHaveLength(1);
  });
});
