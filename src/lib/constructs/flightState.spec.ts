/**
 * G51 — THE FLIGHT MESSAGE, AND THE PROPERTY THE WHOLE ITEM RESTS ON.
 *
 * The point of splitting a ship's flight situation out of the campaign is that the campaign then
 * STOPS CHANGING while a ship flies, so `sendIfChanged` can dedupe it. That is a property of the
 * payloads, not of the network, so it is testable here: build two player snapshots of one campaign
 * at two different clocks with a ship under way, and require them to be BYTE-IDENTICAL.
 *
 * RUN AGAINST THE OLD CODE THIS GOES RED, which is the only reason to believe it: restore the
 * per-tick vector stamp to `slimNode` and `campaign payload is byte-identical while a ship flies`
 * fails on `vector_position_au`. That check was made before this file was believed.
 */
import { describe, it, expect } from 'vitest';
import { buildFlightUpdate, applyFlightUpdate, isFreeFlying, FLIGHT_NODE_FIELDS } from './flightState';
import { computePlayerStarmapSnapshot } from '$lib/system/utils';
import { getVisibleNodeIds } from '$lib/system/visibleNodes';
import type { Starmap } from '$lib/types';

const T0 = 1_800_000_000_000;   // an arbitrary game-clock ms; the numbers below are relative to it
const HOUR = 3_600_000;

/** A ship with a committed journey whose dense path is what `compactRoute` reduces to knots. */
function shipWithJourney(id: string, startMs: number, endMs: number) {
  const n = 24;
  const pathPoints: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    // A curved arc, so the fitter has something to fit rather than a straight line.
    pathPoints.push({ x: 1 + 3 * f, y: 2 * f * (1 - f), z: 0 });
  }
  return {
    id,
    name: id,
    kind: 'construct',
    parentId: 'star',
    flight_state: 'Transit',
    orbit: { hostId: 'star', hostMu: 1.3e20, t0: T0, elements: { a_AU: 1, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } },
    scheduled_journeys: [{
      status: 'active',
      plans: [{
        segments: [
          { type: 'Accel', startTime: startMs, endTime: startMs + HOUR, deltaV_ms: 4000, thrustDir: { x: 1, y: 0 }, pathPoints: pathPoints.slice(0, 8), startState: { r: pathPoints[0] }, endState: { r: pathPoints[7] } },
          { type: 'Coast', startTime: startMs + HOUR, endTime: endMs - HOUR, pathPoints: pathPoints.slice(7, 18), startState: { r: pathPoints[7] }, endState: { r: pathPoints[17] } },
          { type: 'Brake', startTime: endMs - HOUR, endTime: endMs, deltaV_ms: 4000, thrustDir: { x: -1, y: 0 }, pathPoints: pathPoints.slice(17), startState: { r: pathPoints[17] }, endState: { r: pathPoints[n - 1] } }
        ]
      }]
    }],
    // What the GM's reconcile tick stamps while the ship is under way — the field G51 takes off the
    // campaign payload.
    vector_position_au: { x: 2.5, y: 0.4 },
    vector_velocity_ms: { x: 12_000, y: 900 },
    vector_epoch_ms: startMs + HOUR
  } as any;
}

function parkedStation(id: string) {
  return {
    id, name: id, kind: 'construct', parentId: 'star', flight_state: 'Orbiting',
    orbit: { hostId: 'star', hostMu: 1.3e20, t0: T0, elements: { a_AU: 1, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }
  } as any;
}

/** A ship adrift off any plan: a stamp and no journeys. The one case still genuinely unpredictable. */
function drifter(id: string, atMs: number) {
  return {
    id, name: id, kind: 'construct', parentId: 'star', flight_state: 'Deep Space',
    vector_position_au: { x: 7.25, y: -1.5 },
    vector_velocity_ms: { x: 3_000, y: -400 },
    vector_epoch_ms: atMs
  } as any;
}

function campaign(extraNodes: any[] = []): Starmap {
  return {
    id: 'map1', name: 'Test', distanceUnit: 'ly',
    systems: [{
      id: 'sysA', name: 'A', position: { x: 0, y: 0, z: 0 },
      system: {
        id: 'sysA', name: 'A', epochT0: T0,
        nodes: [
          { id: 'star', name: 'Star', kind: 'body', roleHint: 'star', parentId: null, massKg: 2e30, radiusKm: 700000, tags: [] },
          { id: 'world', name: 'World', kind: 'body', parentId: 'star', massKg: 6e24, radiusKm: 6371, tags: [],
            orbit: { hostId: 'star', hostMu: 1.3e20, t0: T0, elements: { a_AU: 1, e: 0.2, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } },
          ...extraNodes
        ]
      }
    }],
    routes: []
  } as any;
}

describe('G51 flight message', () => {
  const start = T0 + HOUR;
  const end = T0 + 10 * HOUR;
  const midFlight = T0 + 5 * HOUR;

  it('THE PROPERTY THE ITEM RESTS ON: the campaign payload is byte-identical while a ship flies', () => {
    // Two snapshots of one unchanged campaign, taken as the GM's reconcile tick re-stamps the ship.
    const a = campaign([shipWithJourney('roci', start, end)]);
    const b = campaign([shipWithJourney('roci', start, end)]);
    // The GM has moved the ship on: a different stamp, a different instant, same campaign.
    const bShip = (b.systems[0] as any).system.nodes.find((n: any) => n.id === 'roci');
    bShip.vector_position_au = { x: 3.1, y: 0.31 };
    bShip.vector_velocity_ms = { x: 11_500, y: 700 };
    bShip.vector_epoch_ms = midFlight;

    const snapA = JSON.stringify(computePlayerStarmapSnapshot(a));
    const snapB = JSON.stringify(computePlayerStarmapSnapshot(b));
    expect(snapB).toBe(snapA);
  });

  it('the campaign payload carries no flight field on any construct', () => {
    const snap: any = computePlayerStarmapSnapshot(campaign([
      shipWithJourney('roci', start, end), drifter('adrift', midFlight), parkedStation('tycho')
    ]));
    for (const node of snap.systems[0].system.nodes) {
      if (node.kind !== 'construct') continue;
      for (const f of FLIGHT_NODE_FIELDS) {
        expect(node[f], `${node.id} still carries ${f}`).toBeUndefined();
      }
    }
  });

  it('a ship on its course is described by its plan and NOT by a stamp', () => {
    const u = buildFlightUpdate(campaign([shipWithJourney('roci', start, end)]), midFlight);
    expect(u.ships).toHaveLength(1);
    const ship = u.ships[0];
    expect(ship.id).toBe('roci');
    expect(ship.sys).toBe('sysA');
    expect(ship.route!.p.length).toBeGreaterThanOrEqual(2);
    expect(ship.burns!.length).toBeGreaterThan(0);
    // The stamp is the rival answer to a question the route already answers, so it must not travel.
    expect(ship.r).toBeUndefined();
    expect(ship.v).toBeUndefined();
  });

  it('a ship adrift off any plan IS stamped, because nothing can predict it', () => {
    const u = buildFlightUpdate(campaign([drifter('adrift', midFlight)]), midFlight);
    expect(u.ships).toHaveLength(1);
    expect(u.ships[0].r).toEqual({ x: 7.25, y: -1.5 });
    expect(u.ships[0].v).toEqual({ x: 3_000, y: -400 });
    expect(u.ships[0].e).toBe(midFlight);
    expect(u.ships[0].route).toBeUndefined();
  });

  it('a ship stamped OUTSIDE its route window is stamped too (departure, arrival, abort)', () => {
    const map = campaign([shipWithJourney('roci', start, end)]);
    const after = end + HOUR;   // the journey is over; the reconcile has not parked it yet
    const u = buildFlightUpdate(map, after);
    expect(u.ships[0].r).toBeDefined();
  });

  it('a parked station is omitted entirely — its orbit already describes it', () => {
    const u = buildFlightUpdate(campaign([parkedStation('tycho')]), midFlight);
    expect(u.ships).toHaveLength(0);
  });

  it('the payload is byte-identical across ticks while a ship flies to schedule', () => {
    const map = campaign([shipWithJourney('roci', start, end)]);
    const one = JSON.stringify(buildFlightUpdate(map, midFlight));
    const two = JSON.stringify(buildFlightUpdate(map, midFlight + 60_000));
    expect(two).toBe(one);
  });

  it('ship order is stable, so two builds of one campaign cannot differ by order alone', () => {
    const nodes = [shipWithJourney('zulu', start, end), shipWithJourney('alpha', start, end)];
    const a = JSON.stringify(buildFlightUpdate(campaign(nodes), midFlight));
    const b = JSON.stringify(buildFlightUpdate(campaign([...nodes].reverse()), midFlight));
    expect(b).toBe(a);
  });

  it('build then apply restores the ship to a stripped snapshot', () => {
    const gm = campaign([shipWithJourney('roci', start, end)]);
    const update = buildFlightUpdate(gm, midFlight);
    const snap: any = applyFlightUpdate(computePlayerStarmapSnapshot(gm), update);
    const ship = snap.systems[0].system.nodes.find((n: any) => n.id === 'roci');
    expect(ship.route.p.length).toBeGreaterThanOrEqual(2);
    expect(ship.driveBurns.length).toBeGreaterThan(0);
  });

  it('THE MERGE MUST NOT MUTATE: the scene holds this object, and the B94 gate compares against it', () => {
    const gm = campaign([shipWithJourney('roci', start, end)]);
    const before: any = computePlayerStarmapSnapshot(gm);
    const beforeShip = before.systems[0].system.nodes.find((n: any) => n.id === 'roci');
    const after: any = applyFlightUpdate(before, buildFlightUpdate(gm, midFlight));
    // A new map, a new system, a new node for the ship that changed...
    expect(after).not.toBe(before);
    expect(after.systems[0].system).not.toBe(before.systems[0].system);
    expect(after.systems[0].system.nodes.find((n: any) => n.id === 'roci')).not.toBe(beforeShip);
    // ...and the ORIGINAL is untouched, so a before/after comparison is still possible.
    expect(beforeShip.route).toBeUndefined();
    // Bodies that did not change keep their identity, so the comparison stays cheap.
    expect(after.systems[0].system.nodes[1]).toBe(before.systems[0].system.nodes[1]);
  });

  it('an update that changes nothing returns the SAME map, so nothing downstream re-renders', () => {
    const gm = campaign([shipWithJourney('roci', start, end)]);
    const u = buildFlightUpdate(gm, midFlight);
    const once: any = applyFlightUpdate(computePlayerStarmapSnapshot(gm), u);
    expect(applyFlightUpdate(once, u)).toBe(once);
  });

  it('a ship the update does NOT mention is cleared — silence means PARKED, not unchanged', () => {
    const gm = campaign([shipWithJourney('roci', start, end)]);
    let snap: any = applyFlightUpdate(computePlayerStarmapSnapshot(gm), buildFlightUpdate(gm, midFlight));
    // The ship arrives: the GM's next update has nothing to say about it.
    snap = applyFlightUpdate(snap, { ships: [] });
    const ship = snap.systems[0].system.nodes.find((n: any) => n.id === 'roci');
    for (const f of FLIGHT_NODE_FIELDS) expect(ship[f], `${f} survived the park`).toBeUndefined();
  });

  it('a superseding plan REPLACES the old one rather than merging with it', () => {
    const gm = campaign([shipWithJourney('roci', start, end)]);
    let snap: any = applyFlightUpdate(computePlayerStarmapSnapshot(gm), buildFlightUpdate(gm, midFlight));
    const firstKnots = snap.systems[0].system.nodes.find((n: any) => n.id === 'roci').route.p.length;

    const replanned = campaign([shipWithJourney('roci', midFlight, end + 5 * HOUR)]);
    snap = applyFlightUpdate(snap, buildFlightUpdate(replanned, midFlight + HOUR));
    const ship = snap.systems[0].system.nodes.find((n: any) => n.id === 'roci');
    expect(ship.route.s).toBe(midFlight);
    expect(ship.route.e).toBe(end + 5 * HOUR);
    expect(ship.route.p.length).toBeLessThanOrEqual(Math.max(firstKnots, 16));
  });

  describe('visibility — a transiting ship must not vanish now that it carries no stamp', () => {
    const system = () => {
      const gm = campaign([shipWithJourney('roci', start, end)]);
      const snap: any = applyFlightUpdate(computePlayerStarmapSnapshot(gm), buildFlightUpdate(gm, midFlight));
      return snap.systems[0].system;
    };

    it('is visible mid-flight when the caller knows the clock', () => {
      expect(getVisibleNodeIds(system(), 'world', midFlight).has('roci')).toBe(true);
    });

    it('is NOT free-flying once its window has passed', () => {
      const sys = system();
      const ship = sys.nodes.find((n: any) => n.id === 'roci');
      expect(isFreeFlying(ship, end + HOUR)).toBe(false);
    });

    it('a stamped drifter is free-flying with no clock at all', () => {
      expect(isFreeFlying(drifter('adrift', midFlight))).toBe(true);
    });

    it('a parked station is never free-flying', () => {
      expect(isFreeFlying(parkedStation('tycho'), midFlight)).toBe(false);
    });
  });
});
