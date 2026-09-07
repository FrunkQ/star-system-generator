import { describe, it, expect } from 'vitest';
import { AU_KM } from '$lib/constants';
import { sampleJourneyKinematicsAtTime } from './scheduler';
import { attachedOffsetAu, ladderLevelRadiusKm } from '$lib/constructs/docking';

// G53 PHASE 5 - NO MAGIC SNAP BELOW GEO. A ship that arrives at a ladder level below geostationary
// is in a (prograde) parking orbit at that radius, moving faster than the ribbon; it docks when it
// CATCHES the ribbon's bearing, and until then it visibly orbits. At geo the two co-move and the
// hand-over is at arrival (a phasing gap at most - recorded on the board).
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
        plans: [{ id: 'p', originId: 'ship', targetId: 'earth', startTime: 0, mode: 'Economy', arrivalPlacement: 'lo',
                  arrivalDock: { structureId: 'sea', level: 'lo' }, interceptSpeed_ms: 0, totalTime_days: 10, isValid: true, segments: [] }]
      }] }
  ]
});

describe('a low-level dock: orbit prograde at the level, then dock when the ribbon is caught', () => {
  it('Orbiting at the LO radius first, Docked ON the ribbon within one synodic period, never teleported', () => {
    const sys = system();
    const ship = sys.nodes.find((n: any) => n.id === 'ship');
    const sea = sys.nodes.find((n: any) => n.id === 'sea'), earth = sys.nodes.find((n: any) => n.id === 'earth');
    const loKm = ladderLevelRadiusKm('lo', sea, earth, sys)!;
    expect(loKm).toBeGreaterThan(6371);
    const end = 10 * DAY;
    let firstDocked = -1, lastOrbitingR = 0;
    for (let k = 1; k <= 6 * 120; k++) {                       // 6 hours in 30-second steps, from just after arrival
      const t = end + k * 30 * 1000;
      const s = sampleJourneyKinematicsAtTime(sys, ship, t)!;
      if (s.state === 'Docked') { firstDocked = t; break; }
      expect(s.state).toBe('Orbiting');
      lastOrbitingR = Math.hypot(s.position_au.x, s.position_au.y) * AU_KM;
    }
    expect(firstDocked).toBeGreaterThan(end);                  // it did NOT snap on at arrival...
    expect(lastOrbitingR).toBeCloseTo(loKm, 0);                // ...it orbited at the level's radius...
    const s = sampleJourneyKinematicsAtTime(sys, ship, firstDocked)!;
    const off = attachedOffsetAu({ id: 'sea', level: 'lo' }, sea, earth, firstDocked)!;
    expect(s.position_au.x).toBeCloseTo(off.x, 9);             // ...and docked exactly on the ribbon
    expect(s.position_au.y).toBeCloseTo(off.y, 9);
    // and stays docked, riding round with it
    const later = sampleJourneyKinematicsAtTime(sys, ship, firstDocked + 2 * 3600 * 1000)!;
    expect(later.state).toBe('Docked');
  });
});
