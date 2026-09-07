import { describe, it, expect } from 'vitest';
import { AU_KM, G } from '$lib/constants';
import { resolveDesiredArrivalRelative } from './calculator';

// G53 PHASE 5 - AT A BEANSTALK HOST, PARK PROGRADE (owner, 2026-09-06): "ALWAYS orbit IN the
// direction of planet spin IF there is a beanstalk so you can transfer with less delta v." The
// parking orbit used to take the sense of the APPROACH, so a ship could arrive retrograde, orbit
// the wrong way, and then be handed to a ribbon moving against it.
const AU_M = AU_KM * 1000;
const M_EARTH = 5.972e24;
const R_AU = 42157 / AU_KM;
const origin = { x: 0, y: 0, z: 0 };
const aim = { x: R_AU, y: 0, z: 0 };
const vCirc = Math.sqrt((G * M_EARTH) / (R_AU * AU_M));   // m/s at geo radius
// Arriving at the aim point moving CLOCKWISE (retrograde for a prograde spin): -y tangential.
const retroApproach = { x: 0, y: -3000 / AU_M, z: 0 };

describe('resolveDesiredArrivalRelative - the parking sense', () => {
  it('legacy (no preference): keeps the approach sense', () => {
    const r = resolveDesiredArrivalRelative(retroApproach, origin, origin, aim, M_EARTH, R_AU, true, 0, 0);
    expect(r.desiredRelVec_au_s.y).toBeLessThan(0);
    expect(Math.hypot(r.desiredRelVec_au_s.x, r.desiredRelVec_au_s.y) * AU_M).toBeCloseTo(vCirc, 3);
  });
  it('prograde preference (+1): turns a retrograde approach to prograde, and PRICES the reversal', () => {
    const r = resolveDesiredArrivalRelative(retroApproach, origin, origin, aim, M_EARTH, R_AU, true, 0, 1);
    expect(r.desiredRelVec_au_s.y).toBeGreaterThan(0);                                             // counterclockwise = with the spin
    expect(Math.hypot(r.desiredRelVec_au_s.x, r.desiredRelVec_au_s.y) * AU_M).toBeCloseTo(vCirc, 3);
    expect(r.dv2Required_ms).toBeCloseTo(3000 + vCirc, 0);                                          // kill the approach, then build prograde
  });
  it('a retrograde-spinning host (-1) parks the other way round', () => {
    const pro = { x: 0, y: 3000 / AU_M, z: 0 };
    const r = resolveDesiredArrivalRelative(pro, origin, origin, aim, M_EARTH, R_AU, true, 0, -1);
    expect(r.desiredRelVec_au_s.y).toBeLessThan(0);
  });
});
