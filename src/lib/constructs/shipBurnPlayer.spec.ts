// A player's snapshot has its journeys stripped (they carry huge path arrays and the ship's
// forward plan, which must not cross), so the player could not tell a ship was under power and
// its drive plume never lit - while the GM's did. The snapshot now carries COMPACT burns in
// their place: when, how hard, which way, nothing else.
import { describe, it, expect } from 'vitest';
import { compactBurns, shipBurnAt } from './shipBurn';
import { computePlayerStarmapSnapshot } from '$lib/system/utils';
import { buildFlightUpdate, applyFlightUpdate } from './flightState';

const AU_S = 1 / 1.495978707e11; // 1 m/s expressed in AU/s
const seg = (type: string, startTime: number, endTime: number, dvMs: number, vx = 1000) => ({
  type, startTime, endTime,
  startState: { v: { x: vx * AU_S, y: 0, z: 0 } },
  endState: { v: { x: (vx + dvMs) * AU_S, y: 0, z: 0 } }
});
const ship = (segments: any[], extra: any = {}) =>
  ({ kind: 'construct', scheduled_journeys: [{ plans: [{ segments }] }], ...extra });

describe('compact burns for the player snapshot', () => {
  it('reduces a burn to when/how hard/which way, and drops coasts', () => {
    const c = ship([seg('Accel', 1000, 11000, 100), seg('Coast', 11000, 20000, 0), seg('Brake', 20000, 30000, -100)]);
    const burns = compactBurns(c);
    expect(burns).toHaveLength(2);                 // the coast carries no plume
    expect(burns[0]).toMatchObject({ s: 1000, e: 11000, b: 0 });
    expect(burns[0].a).toBeCloseTo(10, 6);         // 100 m/s over 10 s
    expect(burns[1].b).toBe(1);                    // braking
  });

  it('gives a player the SAME reading the GM gets, at the same instant', () => {
    const gm = ship([seg('Accel', 0, 10000, 60), seg('Brake', 10000, 20000, -60)]);
    const player: any = { kind: 'construct', driveBurns: compactBurns(gm) }; // journeys stripped
    for (const t of [1, 5000, 9999, 10001, 15000, 19999]) {
      const a = shipBurnAt(gm, t), b = shipBurnAt(player, t);
      expect(b.thrusting).toBe(a.thrusting);
      expect(b.braking).toBe(a.braking);
      expect(b.accelMs2).toBeCloseTo(a.accelMs2, 9);
    }
  });

  it('reads as coasting outside every burn - the plume goes out', () => {
    const player: any = { kind: 'construct', driveBurns: compactBurns(ship([seg('Accel', 1000, 2000, 10)])) };
    expect(shipBurnAt(player, 500).thrusting).toBe(false);
    expect(shipBurnAt(player, 5000).thrusting).toBe(false);
    expect(shipBurnAt(player, 1500).thrusting).toBe(true);
  });

  it('stops a cancelled journey burning past the moment it was cancelled', () => {
    const c = ship([seg('Accel', 0, 10000, 100)]);
    c.scheduled_journeys[0].cancelledAtSec = 5; // 5000 ms
    const burns = compactBurns(c);
    expect(burns[0].e).toBe(5000);
    const player: any = { kind: 'construct', driveBurns: burns };
    expect(shipBurnAt(player, 4000).thrusting).toBe(true);
    expect(shipBurnAt(player, 6000).thrusting).toBe(false);
  });

  it('carries no route, destination or path - only the four numbers a plume needs', () => {
    const burns = compactBurns(ship([seg('Accel', 0, 10000, 100)]));
    expect(Object.keys(burns[0]).sort()).toEqual(['a', 'b', 'e', 's']);
  });
});

// THE PLUMBING, not the unit. Everything above proves compactBurns/shipBurnAt in isolation and
// stayed green while a player's ship showed no plume at all, because nothing asserted that the
// snapshot a player actually RECEIVES carries the burns.
//
// G51 CHANGED THE ROAD, NOT THE DESTINATION, and this describe follows it rather than being relaxed.
// The burns used to ride the campaign snapshot; they now travel on SYNC_FLIGHT, because a field that
// changed every tick inside a multi-megabyte document is what stopped `sendIfChanged` deduping it.
// So "what a player actually receives" is now the campaign snapshot WITH the flight update applied,
// which is exactly what the catalogue does on the wire. The property being guarded is unchanged and
// the guard is no weaker: break the plumbing anywhere along it and these still fail.
describe('the snapshot a player actually receives', () => {
  const mapWith = (construct: any) => ({
    id: 'map', name: 'Map',
    systems: [{ id: 'sys', name: 'Sys', system: { nodes: [
      { id: 'star', name: 'Star', kind: 'body', roleHint: 'star' },
      construct
    ] } }]
  }) as any;

  const playerConstruct = (map: any, atMs = 1) => {
    const snap = computePlayerStarmapSnapshot(map);
    const merged: any = applyFlightUpdate(snap, buildFlightUpdate(map, atMs));   // the second half of the wire
    return merged.systems[0].system.nodes.find((n: any) => n.id === 'ship');
  };

  it('carries the burns through to the player, and lights the same plume the GM sees', () => {
    const gm = ship([seg('Accel', 0, 10000, 60), seg('Brake', 10000, 20000, -60)],
      { id: 'ship', name: 'Ship' });
    const player = playerConstruct(mapWith(gm));

    expect(player.driveBurns).toBeDefined();
    expect(player.driveBurns).toHaveLength(2);
    for (const t of [1, 5000, 9999, 10001, 15000, 19999]) {
      const a = shipBurnAt(gm, t), b = shipBurnAt(player, t);
      expect(b.thrusting).toBe(a.thrusting);
      expect(b.braking).toBe(a.braking);
      expect(b.accelMs2).toBeCloseTo(a.accelMs2, 9);
    }
  });

  it('still strips the journeys themselves - the burns are a REPLACEMENT, not an addition', () => {
    const player = playerConstruct(mapWith(
      ship([seg('Accel', 0, 10000, 60)], { id: 'ship', name: 'Ship', draft_transit_plan: [{ secret: 1 }] })
    ));
    expect(player.scheduled_journeys).toBeUndefined();
    expect(player.draft_transit_plan).toBeUndefined();
  });

  it('leaves a construct with no journeys alone rather than attaching an empty list', () => {
    const player = playerConstruct(mapWith({ id: 'ship', name: 'Ship', kind: 'construct' }));
    expect(player.driveBurns).toBeUndefined();
    expect(shipBurnAt(player, 1000).thrusting).toBe(false);
  });
});
