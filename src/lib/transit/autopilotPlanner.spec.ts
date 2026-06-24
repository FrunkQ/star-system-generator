import { describe, it, expect } from 'vitest';
import { walkStops, legToStops, planToStops, chooseSource, scoreSources, reorderWaypoints, selectAnyOrder, cargoAboardAt, fuelKgAt, computeAutopilotTotals, type AutopilotStop, type SolveLeg, type ReorderOpts } from './autopilotPlanner';

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

describe('autopilot flight log — stop work events + cargo derivation', () => {
  const load = (id: string, t: number): AutopilotStop => ({ targetId: id, dwellDays: 1, refuelHere: false, verb: 'load', resourceKeys: ['resource/water-ice'], tonnes: t });
  const unload = (id: string, t: number): AutopilotStop => ({ targetId: id, dwellDays: 1, refuelHere: false, verb: 'unload', resourceKeys: ['resource/water-ice'], tonnes: t });

  it('emits load/unload events and ramps cargo across the dwell (not a step)', () => {
    const r = walkStops([load('A', 120), unload('B', 120)], { ...baseOpts, planningHorizon: 2, repeat: false });
    expect(r.events.map((e) => e.kind)).toEqual(['load', 'unload']);
    const lo = r.events[0], un = r.events[1];
    const loadAt = Number(lo.atSec), unloadAt = Number(un.atSec);
    expect(cargoAboardAt(r.events as any, loadAt - 1)).toBe(0);                 // before loading
    expect(cargoAboardAt(r.events as any, loadAt + (lo.durationSec! / 2))).toBeCloseTo(60, 1); // half-loaded
    expect(cargoAboardAt(r.events as any, unloadAt - 1)).toBe(120);             // carrying full
    expect(cargoAboardAt(r.events as any, unloadAt + (un.durationSec! / 2))).toBeCloseTo(60, 1); // half-delivered
    expect(cargoAboardAt(r.events as any, unloadAt + un.durationSec!)).toBe(0); // fully delivered
  });

  it('caps a load to the hold and sizes the dwell to what is actually moved', () => {
    const mine: AutopilotStop = { targetId: 'M', dwellDays: 3, refuelHere: false, verb: 'mine', resourceKeys: ['resource/ore'], tonnes: 9999, rate_tpd: 10, abundance: 1 };
    const full = walkStops([mine], { ...baseOpts, planningHorizon: 1, startCargo_t: 100, cargoCapacity_t: 100 });
    const fm = full.events.find((e) => e.kind === 'mine')!;
    expect(fm.tonnes).toBe(0);                  // already full → nothing mined…
    expect(fm.durationSec).toBe(0);             // …and no idle time wasted at the source
    const room = walkStops([mine], { ...baseOpts, planningHorizon: 1, startCargo_t: 30, cargoCapacity_t: 100 });
    const rm = room.events.find((e) => e.kind === 'mine')!;
    expect(rm.tonnes).toBe(70);                 // fills only the free 70 t
    expect(rm.durationSec).toBe(70 / 10 * 86400); // dwell sized to 70 t ÷ 10 t/day = 7 days
  });

  it('mine adds cargo + emits refuel where flagged; a flyby (dwell 0) logs no loiter', () => {
    const mine: AutopilotStop = { targetId: 'M', dwellDays: 3, refuelHere: true, verb: 'mine', resourceKeys: ['resource/ore'], tonnes: 50 };
    const flyby: AutopilotStop = { targetId: 'P', dwellDays: 0, refuelHere: false, verb: 'patrol' };
    const r = walkStops([mine, flyby], { ...baseOpts, planningHorizon: 2, repeat: false });
    const kinds = r.events.map((e) => e.kind);
    expect(kinds).toContain('mine');
    expect(kinds).toContain('refuel');
    expect(kinds).not.toContain('loiter'); // flyby never stops → no loiter event
    expect(cargoAboardAt(r.events as any, Infinity)).toBe(50);
  });

  it('frontier-harvest refuel ramps over the dwell; a port/depot refuel is instant', () => {
    const harvest: AutopilotStop = { targetId: 'M', dwellDays: 4, refuelHere: true, verb: 'mine', resourceKeys: ['resource/ice'] };
    const depot: AutopilotStop = { targetId: 'P', dwellDays: 2, refuelHere: true, verb: 'patrol' };
    const r = walkStops([harvest, depot], { ...baseOpts, planningHorizon: 2, repeat: false });
    const refuels = r.events.filter((e) => e.kind === 'refuel');
    expect(refuels[0].durationSec).toBe(4 * 86400); // harvested over the mining dwell
    expect(refuels[1].durationSec).toBe(0);         // port top-up is instant
  });
});

describe('autopilot tardiness slack', () => {
  const dwellStop = (id: string, d: number): AutopilotStop => ({ targetId: id, dwellDays: d, refuelHere: false, verb: 'patrol' });

  it('extends STOPPED time by a deterministic, seed-stable amount; punctual at tardiness 0', () => {
    const stops = [dwellStop('A', 10)];
    const punctual = walkStops(stops, { ...baseOpts, planningHorizon: 1 });               // tardiness undefined → 0
    const late = walkStops(stops, { ...baseOpts, planningHorizon: 1, tardiness: 1, slackSeed: 'bob' });
    const lateAgain = walkStops(stops, { ...baseOpts, planningHorizon: 1, tardiness: 1, slackSeed: 'bob' });
    // 10d travel + 10d dwell punctually; the late ship lingers longer at the stop.
    expect(punctual.finalTimeMs).toBe((10 + 10) * DAY_MS);
    expect(late.finalTimeMs).toBeGreaterThan(punctual.finalTimeMs);
    expect(lateAgain.finalTimeMs).toBe(late.finalTimeMs); // reproducible (same seed → same slack)
  });

  it('a flyby (dwell 0) is never late — no stopped time to slip', () => {
    const stops = [{ targetId: 'A', dwellDays: 0, refuelHere: false, verb: 'patrol' } as AutopilotStop];
    const r = walkStops(stops, { ...baseOpts, planningHorizon: 1, tardiness: 1, slackSeed: 'bob' });
    expect(r.finalTimeMs).toBe(10 * DAY_MS); // just the travel, no dwell, no slack
  });
});

describe('autopilot totals — computeAutopilotTotals', () => {
  const DAY_S = 86400;
  const ev = (atDay: number, kind: string, res: string, tonnes?: number) =>
    ({ id: `${atDay}`, atSec: String(atDay * DAY_S), kind, text: '', resourceKey: `resource/${res}`, tonnes } as any);

  it('aggregates delivered/gathered by resource + tonnes per annum over the span', () => {
    const events = [
      ev(0, 'mine', 'water-ice', 100),
      ev(10, 'unload', 'water-ice', 100),
      ev(20, 'mine', 'water-ice', 100),
      { id: 'r', atSec: String(12 * DAY_S), kind: 'refuel', text: '' } as any
    ];
    const t = computeAutopilotTotals(events, 365.25 * DAY_S); // one year in
    expect(t.gathered['water-ice']).toBe(200);     // two mining runs
    expect(t.delivered['water-ice']).toBe(100);    // one delivery
    expect(t.deliveredTotal_t).toBe(100);
    expect(t.refuels).toBe(1);
    expect(t.tonnesPerAnnum).toBeCloseTo(100, 0);  // 100 t delivered over ~1 year
  });

  it('ignores events after the query time', () => {
    const events = [ev(0, 'unload', 'ore', 50), ev(100, 'unload', 'ore', 50)];
    expect(computeAutopilotTotals(events, 50 * DAY_S).deliveredTotal_t).toBe(50); // the 2nd hasn't happened yet
  });
});

describe('autopilot fuel over time — fuelKgAt', () => {
  const DAY_S = 86400;
  // One burn leg draining 400 kg over 10 days, then a refuel 20 days in.
  const journeys = [{ status: 'scheduled', plans: [{ segments: [{ startTime: 0, endTime: 10 * DAY_MS, fuelUsed_kg: 400 }] }] }];

  it('drains fuel across the burn segment and clamps to empty', () => {
    expect(fuelKgAt(journeys, [], 1000, 1000, 5 * DAY_S)).toBeCloseTo(800, 5);   // half the burn done
    expect(fuelKgAt(journeys, [], 1000, 1000, 10 * DAY_S)).toBeCloseTo(600, 5);  // burn complete
    expect(fuelKgAt(journeys, [], 1000, 1000, -1)).toBe(1000);                    // before departure: full
  });

  it('a port refuel restores instantly; a frontier refuel ramps to full', () => {
    const instant = [{ id: 'r', atSec: String(20 * DAY_S), kind: 'refuel', text: '', durationSec: 0 } as any];
    expect(fuelKgAt(journeys, instant, 1000, 1000, 20 * DAY_S)).toBeCloseTo(1000, 5); // 600 → full at once
    const frontier = [{ id: 'r', atSec: String(20 * DAY_S), kind: 'refuel', text: '', durationSec: 4 * DAY_S } as any];
    expect(fuelKgAt(journeys, frontier, 1000, 1000, 22 * DAY_S)).toBeCloseTo(800, 5); // 600 + (1000-600)/2
  });

  it('an abandoned (cancelled) journey burns no fuel', () => {
    const dead = [{ status: 'cancelled', plans: [{ segments: [{ startTime: 0, endTime: 10 * DAY_MS, fuelUsed_kg: 400 }] }] }];
    expect(fuelKgAt(dead, [], 1000, 1000, 10 * DAY_S)).toBe(1000);
  });
});

describe("autopilot 'any' traversal — selectAnyOrder", () => {
  const wps = [
    { id: 'a', targetId: 'A', dwellMs: 0 },
    { id: 'b', targetId: 'B', dwellMs: 0 },
    { id: 'c', targetId: 'C', dwellMs: 0 }
  ];
  // Cost depends only on the destination (a fixed per-stop expense), so "best next" is deterministic.
  const fixedCost = (costs: Record<string, number>) => (_from: string, to: string) => ({ timeMs: (costs[to] ?? 1) * DAY_MS, dvMs: (costs[to] ?? 1) * 100 });

  it('with no freshness it just repeats the single cheapest stop', () => {
    const seq = selectAnyOrder(wps, { startHostId: 'home', fromMs: 0, steps: 4, objective: 'time', legCost: fixedCost({ A: 1, B: 2, C: 3 }), freshnessWeight: 0 });
    expect(seq.map((w) => w.targetId)).toEqual(['A', 'A', 'A', 'A']);
  });

  it('a freshness surcharge spreads coverage so it does not just hammer the cheapest', () => {
    const seq = selectAnyOrder(wps, { startHostId: 'home', fromMs: 0, steps: 6, objective: 'time', legCost: fixedCost({ A: 1, B: 2, C: 3 }), freshnessWeight: 2 });
    expect(seq.map((w) => w.targetId)).toContain('A');
    expect(new Set(seq.map((w) => w.targetId)).size).toBeGreaterThan(1); // not all the same stop
  });

  it('never picks a stop whose hop exceeds the max-leg cap', () => {
    const seq = selectAnyOrder(wps, { startHostId: 'home', fromMs: 0, steps: 3, objective: 'time', legCost: fixedCost({ A: 1, B: 2, C: 50 }), freshnessWeight: 0, maxLegMs: 10 * DAY_MS });
    expect(seq.map((w) => w.targetId)).not.toContain('C');
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

describe('autopilot chooseSource — destination scoring with free-refuel nudge', () => {
  it('prefers richer + closer sources', () => {
    const best = chooseSource([
      { id: 'far-poor', travelCost: 100, abundance: 0.2 },
      { id: 'near-rich', travelCost: 10, abundance: 0.9 }
    ]);
    expect(best?.id).toBe('near-rich');
  });

  it('a free-refuel source wins a close call (mines AND refuels beats mines-only)', () => {
    // Two moons, equal abundance + distance; one also refuels the ship → it should win.
    const best = chooseSource([
      { id: 'mine-only', travelCost: 20, abundance: 0.6, refuels: false },
      { id: 'mine+fuel', travelCost: 20, abundance: 0.6, refuels: true }
    ]);
    expect(best?.id).toBe('mine+fuel');
  });

  it('the nudge is modest — a clearly better mining source still wins when fuel is fine', () => {
    const best = chooseSource([
      { id: 'rich-no-fuel', travelCost: 10, abundance: 0.95, refuels: false },
      { id: 'poor-but-fuel', travelCost: 90, abundance: 0.15, refuels: true }
    ]);
    expect(best?.id).toBe('rich-no-fuel');
  });

  it('when the ship is low on fuel, a self-fuelling source weighs much heavier', () => {
    const cands = [
      { id: 'rich-no-fuel', travelCost: 10, abundance: 0.7, refuels: false },
      { id: 'ok-and-fuel', travelCost: 30, abundance: 0.5, refuels: true }
    ];
    expect(chooseSource(cands)?.id).toBe('rich-no-fuel');                 // fuel fine → richer wins
    expect(chooseSource(cands, { needsFuel: true })?.id).toBe('ok-and-fuel'); // low fuel → self-fueller wins
  });

  it('empty candidate set → null', () => {
    expect(chooseSource([])).toBeNull();
    expect(scoreSources([])).toEqual([]);
  });
});

describe('reorderWaypoints — bounded-lookahead reorder (cost injected)', () => {
  // Stub cost: a symmetric distance map (seconds), Δv = time (so objective doesn't change the order here).
  const D: Record<string, number> = { 'home>A': 1, 'home>B': 10, 'A>B': 1, 'B>A': 1, 'A>home': 1, 'B>home': 10 };
  const legCost = (f: string, t: string) => { const s = (D[`${f}>${t}`] ?? D[`${t}>${f}`] ?? 5) * 1000; return { timeMs: s, dvMs: s }; };
  const base: ReorderOpts = { startHostId: 'home', fromMs: 0, planning: 3, objective: 'time', legCost };
  const wp = (id: string, staleness = 0): any => ({ id, targetId: id.toUpperCase(), dwellMs: 0, staleness });

  it('reorders to the cheaper visiting order (near-first)', () => {
    // listed [B, A]: home→B(10)+B→A(1)=11 ; reordered [A, B]: home→A(1)+A→B(1)=2 → pick [A,B].
    const out = reorderWaypoints([wp('b'), wp('a')], base);
    expect(out.map((w) => w.id)).toEqual(['a', 'b']);
  });

  it('planning 0 = no reorder (fly as listed)', () => {
    const out = reorderWaypoints([wp('b'), wp('a')], { ...base, planning: 0 });
    expect(out.map((w) => w.id)).toEqual(['b', 'a']);
  });

  it('staleness pulls a long-unvisited waypoint earlier (when transit cost ties)', () => {
    // A and B equidistant from home but far apart → transit cost ties; staleness breaks it toward B-first.
    const D2: Record<string, number> = { 'home>A': 1, 'home>B': 1, 'A>B': 10, 'B>A': 10 };
    const lc = (f: string, t: string) => { const s = (D2[`${f}>${t}`] ?? 5) * 1000; return { timeMs: s, dvMs: s }; };
    const out = reorderWaypoints([wp('a'), wp('b', 1)], { startHostId: 'home', fromMs: 0, planning: 3, objective: 'time', legCost: lc, stalenessWeight: 1 });
    expect(out[0].id).toBe('b'); // B's overdue-credit beats the tie
  });

  it('prunes orderings with a hop over the max-leg cap', () => {
    // cap 5 s → the home→B(10 s) hop is illegal, so B can never be first; A-first survives.
    const out = reorderWaypoints([wp('b'), wp('a')], { ...base, maxLegMs: 5000 });
    expect(out[0].id).toBe('a');
  });
});
