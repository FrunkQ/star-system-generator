import { describe, it, expect } from 'vitest';
import { AU_KM } from '$lib/constants';
import { reconcileConstructArrival, sampleJourneyKinematicsAtTime } from './scheduler';
import { attachedOffsetAu } from '$lib/constructs/docking';

// G53 PHASE 5 - A JOURNEY THAT ENDS DOCKED. The flight is solved to the HOST at the level's radius;
// at arrival the ship is handed to the STRUCTURE: the sampler parks it on the dock from then on, and
// the reconciler stamps `attachedTo` so the saved node and the propagator agree (design 7c).
const DAY = 86400000;
const system = (): any => ({
  id: 's', name: 's',
  nodes: [
    { id: 'sol', name: 'Sol', kind: 'body', roleHint: 'star', parentId: null, massKg: 1.989e30, radiusKm: 695700, temperatureK: 5772, tags: [] },
    { id: 'earth', name: 'Earth', kind: 'body', roleHint: 'planet', parentId: 'sol', massKg: 5.972e24, radiusKm: 6371,
      rotation_period_hours: 23.934, axial_tilt_deg: 0, tags: [],
      orbitalBoundaries: { minLeoKm: 200, leoMoeBoundaryKm: 2000, meoHeoBoundaryKm: 50000, heoUpperBoundaryKm: 1.47e6, geoStationaryKm: 35786, isGeoFallback: false } },
    { id: 'sea', name: 'Space Elevator', kind: 'construct', parentId: 'earth', megaType: 'space-elevator', placement: 'Surface', tags: [],
      physical_parameters: { dimensionsM: [45e6, 30, 30], massKg: 0 } },
    { id: 'ship', name: 'Lift', kind: 'construct', roleHint: 'ship', parentId: 'sol', tags: [], physical_parameters: { massKg: 1000 },
      orbit: { hostId: 'sol', t0: 0, elements: { a_AU: 1.5, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0 } },
      scheduled_journeys: [{
        id: 'j', status: 'completed',
        plans: [{ id: 'p', originId: 'ship', targetId: 'earth', startTime: 0, mode: 'Economy', arrivalPlacement: 'geo',
                  arrivalDock: { structureId: 'sea', level: 'geo' }, interceptSpeed_ms: 0, totalTime_days: 10, isValid: true, segments: [] }]
      }] }
  ]
});
const shipOf = (sys: any) => sys.nodes.find((n: any) => n.id === 'ship');

describe('the reconciler stamps a DOCKED arrival as an attachment, not an orbit', () => {
  it('after arrival: attachedTo the structure at the level, placement in words, flight_state Docked', () => {
    const sys = system();
    const out = reconcileConstructArrival(sys, shipOf(sys), 11 * DAY) as any;
    expect(out.attachedTo).toEqual({ id: 'sea', level: 'geo' });
    expect(out.placement).toBe('Docked: Space Elevator - Geostationary dock');
    expect(out.flight_state).toBe('Docked');
    expect(out.parentId).toBe('earth');
  });
  it('is idempotent: a ship already stamped comes back untouched (the same object)', () => {
    const sys = system();
    const once = reconcileConstructArrival(sys, shipOf(sys), 11 * DAY);
    const twice = reconcileConstructArrival(sys, once, 12 * DAY);
    expect(twice).toBe(once);
  });
});

describe('the sampler parks a docked ship ON the structure and rides its turn', () => {
  it('state Docked, at exactly the propagator\'s geo-dock offset from the host, at two instants', () => {
    const sys = system();
    const sea = sys.nodes.find((n: any) => n.id === 'sea'), earth = sys.nodes.find((n: any) => n.id === 'earth');
    for (const t of [11 * DAY, 11 * DAY + 3 * 3600 * 1000]) {
      const k = sampleJourneyKinematicsAtTime(sys, shipOf(sys), t)!;
      expect(k.state).toBe('Docked');
      const off = attachedOffsetAu({ id: 'sea', level: 'geo' }, sea, earth, t)!;
      expect(k.position_au.x).toBeCloseTo(off.x, 9);   // Earth sits at the origin in this fixture
      expect(k.position_au.y).toBeCloseTo(off.y, 9);
      expect(Math.hypot(k.position_au.x, k.position_au.y) * AU_KM).toBeCloseTo(6371 + 35786, 3);
    }
  });
});
