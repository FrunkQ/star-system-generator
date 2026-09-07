import { describe, it, expect } from 'vitest';
import { AU_KM, G } from '$lib/constants';
import { calculateTransitPlan } from './calculator';

// G53 PHASE 5 - THE ORBIT-CHANGE PATH (the one the owner flew, 2026-09-06): a Hohmann keeps the
// sense of the orbit it left, so a ship parked against the spin arrived at the dock against the
// ribbon. At a beanstalk host the final orbit is prograde: the second burn reverses the sense at
// the far end and the reversal is PRICED - stated, tagged, never refused.
const AU_M = AU_KM * 1000;
const M_EARTH = 5.972e24;
const R1_KM = 6771, R2_KM = 42157;
const system = (): any => ({
  id: 's', name: 's',
  nodes: [
    { id: 'sol', name: 'Sol', kind: 'body', roleHint: 'star', parentId: null, massKg: 1.989e30, radiusKm: 695700, temperatureK: 5772, tags: [] },
    { id: 'earth', name: 'Earth', kind: 'body', roleHint: 'planet', parentId: 'sol', massKg: M_EARTH, radiusKm: 6371,
      rotation_period_hours: 23.934, axial_tilt_deg: 0, tags: [],
      orbitalBoundaries: { minLeoKm: 200, leoMoeBoundaryKm: 2000, meoHeoBoundaryKm: 50000, heoUpperBoundaryKm: 1.47e6, geoStationaryKm: 35786, isGeoFallback: false } },
    { id: 'sea', name: 'Space Elevator', kind: 'construct', parentId: 'earth', megaType: 'space-elevator', placement: 'Surface', tags: [],
      physical_parameters: { dimensionsM: [45e6, 30, 30], massKg: 0 } },
    // Parked RETROGRADE (i = 180) in low orbit by some older arrival.
    { id: 'ship', name: 'Lift', kind: 'construct', roleHint: 'ship', parentId: 'earth', tags: [], flight_state: 'Orbiting',
      physical_parameters: { massKg: 50000 },
      orbit: { hostId: 'earth', hostMu: G * M_EARTH, t0: 0, elements: { a_AU: R1_KM / AU_KM, e: 0, i_deg: 180, Omega_deg: 0, omega_deg: 0, M0_rad: 0 } } }
  ]
});
const paramsFor = (sense: number): any => ({
  maxG: 0.3, accelRatio: 0.1, brakeRatio: 0.1, directAccelRatio: 0.1, directBrakeRatio: 0.1,
  interceptSpeed_ms: 0, brakeAtArrival: true, parkingOrbitRadius_au: R2_KM / AU_KM, arrivalPlacement: 'geo',
  arrivalProgradeSense: sense, aerobrake: { allowed: false, limit_kms: 0 }
});
const orbitChangeOf = (sense: number) => {
  const plans = calculateTransitPlan(system(), 'ship', 'earth', 0, 'Economy' as any, paramsFor(sense)) as any[];
  return plans.find((p) => (p.tags || []).includes('ORBIT CHANGE'));
};
const endSense = (plan: any) => {
  const seg = plan.segments[plan.segments.length - 1];
  const r = seg.endState.r, v = seg.endState.v;   // Earth sits at the origin in this fixture
  return r.x * v.y - r.y * v.x;                    // > 0 prograde, < 0 retrograde
};
// The honest price of turning round at the far end: kill the transfer speed, rebuild circular the other way.
const mu = G * M_EARTH, r1 = R1_KM * 1000, r2 = R2_KM * 1000, a = (r1 + r2) / 2;
const v1 = Math.sqrt(mu / r1), v2 = Math.sqrt(mu / r2);
const vT1 = Math.sqrt(mu * (2 / r1 - 1 / a)), vT2 = Math.sqrt(mu * (2 / r2 - 1 / a));

describe('an orbit change to a beanstalk host from a retrograde parking orbit', () => {
  it('legacy (sense 0): the Hohmann keeps the retrograde sense, and costs the textbook figure', () => {
    const p = orbitChangeOf(0);
    expect(p).toBeTruthy();
    expect(endSense(p)).toBeLessThan(0);
    expect(p.tags).not.toContain('REVERSED TO PROGRADE');
    expect(p.totalDeltaV_ms).toBeCloseTo(Math.abs(vT1 - v1) + Math.abs(v2 - vT2), 0);
  });
  it('prograde rule (+1): ends PROGRADE, says so, and prices the reversal', () => {
    const p = orbitChangeOf(1);
    expect(p).toBeTruthy();
    expect(endSense(p)).toBeGreaterThan(0);
    expect(p.tags).toContain('REVERSED TO PROGRADE');
    expect(p.totalDeltaV_ms).toBeCloseTo(Math.abs(vT1 - v1) + vT2 + v2, 0);
    const brake = p.segments[p.segments.length - 1];
    expect(brake.deltaV_ms).toBeCloseTo(vT2 + v2, 0);
  });
});
