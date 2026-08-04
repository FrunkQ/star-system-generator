// The plume's burn detection. Written BECAUSE the first implementation could never have worked
// and nothing caught it: no bundled construct carries a journey, so "does a ship in transit show
// a plume" had no fixture anywhere. These are that fixture.
import { describe, it, expect } from 'vitest';
import { shipBurnAt } from './shipBurn';

const AU_S = 1 / 1.495978707e11; // 1 m/s expressed in AU/s - segment states are in AU

/** A one-segment journey: `dvMs` m/s of delta-v over `durSec`, from an initial +x velocity. */
function ship(type: string, dvMs: { x: number; y: number }, durSec: number, v0 = { x: 1000, y: 0 }) {
  return {
    scheduled_journeys: [{
      id: 'j', plans: [{ segments: [{
        type,
        startTime: 1000, endTime: 1000 + durSec * 1000,
        startState: { v: { x: v0.x * AU_S, y: v0.y * AU_S } },
        endState: { v: { x: (v0.x + dvMs.x) * AU_S, y: (v0.y + dvMs.y) * AU_S } }
      }] }]
    }]
  };
}

describe('shipBurnAt', () => {
  it('reports an Accel segment as thrusting, prograde, at dv/duration', () => {
    const b = shipBurnAt(ship('Accel', { x: 600, y: 0 }, 60), 30_000);
    expect(b.thrusting).toBe(true);
    expect(b.braking).toBe(false);
    expect(b.accelMs2).toBeCloseTo(10, 6); // 600 m/s over 60 s
  });

  it('reports a Brake segment as thrusting and RETROGRADE - the flip the label decides', () => {
    const b = shipBurnAt(ship('Brake', { x: -300, y: 0 }, 60), 30_000);
    expect(b.thrusting).toBe(true);
    expect(b.braking).toBe(true);
    expect(b.accelMs2).toBeCloseTo(5, 6);
  });

  it('reports Coast as no burn at all', () => {
    const b = shipBurnAt(ship('Coast', { x: 600, y: 0 }, 60), 30_000);
    expect(b).toEqual({ thrusting: false, braking: false, accelMs2: 0 });
  });

  it('decides a Correction by geometry, since its label does not say which way', () => {
    const retro = shipBurnAt(ship('Correction', { x: -50, y: 0 }, 60), 30_000);
    expect(retro.thrusting).toBe(true);
    expect(retro.braking).toBe(true);
    const pro = shipBurnAt(ship('Correction', { x: 50, y: 0 }, 60), 30_000);
    expect(pro.braking).toBe(false);
  });

  it('is silent outside the segment, and after a mid-flight cancellation (the ship is adrift)', () => {
    const s = ship('Accel', { x: 600, y: 0 }, 60);
    expect(shipBurnAt(s, 500).thrusting).toBe(false);      // before
    expect(shipBurnAt(s, 900_000).thrusting).toBe(false);  // after
    const cancelled: any = { ...s, scheduled_journeys: [{ ...s.scheduled_journeys[0], cancelledAtSec: 20 }] };
    expect(shipBurnAt(cancelled, 30_000).thrusting).toBe(false); // cancelled at t=20 s
    expect(shipBurnAt(cancelled, 10_000).thrusting).toBe(true);  // still under way before that
  });

  it('is silent for a ship with no journeys at all (every bundled construct today)', () => {
    expect(shipBurnAt({}, 1).thrusting).toBe(false);
    expect(shipBurnAt(null, 1).thrusting).toBe(false);
  });

  // The regression this whole module exists for: a PIECEWISE-CONSTANT velocity (what the path
  // sampler reports) differences to zero, so any implementation reading sampled velocities
  // instead of segment labels reports "coasting" through a full-power burn.
  it('reports the burn even where a sampled velocity would show no change', () => {
    const s = ship('Accel', { x: 600, y: 0 }, 60);
    // Two instants inside one segment: a velocity sampler would return the same value at both.
    expect(shipBurnAt(s, 10_000).accelMs2).toBeCloseTo(10, 6);
    expect(shipBurnAt(s, 50_000).accelMs2).toBeCloseTo(10, 6);
  });
});
