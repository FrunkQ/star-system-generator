import { describe, it, expect } from 'vitest';
import { AU_KM } from '$lib/constants';
import { getGlobalState } from './physics';
import { attachedOffsetAu } from '$lib/constructs/docking';

// G53 PHASE 5 - A DOCKED CONSTRUCT'S STATE IS ITS STRUCTURE'S. The origin of a departure from a
// dock and the moving target of an arrival at one both read getGlobalState, so it must answer
// with the propagator's position AND the structure's own velocity (the ribbon's co-rotation).
const AU_M = AU_KM * 1000;
const system = (): any => ({
  id: 's', name: 's',
  nodes: [
    { id: 'sol', name: 'Sol', kind: 'body', roleHint: 'star', parentId: null, massKg: 1.989e30, radiusKm: 695700, temperatureK: 5772, tags: [] },
    { id: 'earth', name: 'Earth', kind: 'body', roleHint: 'planet', parentId: 'sol', massKg: 5.972e24, radiusKm: 6371,
      rotation_period_hours: 23.934, axial_tilt_deg: 0, tags: [],
      orbitalBoundaries: { minLeoKm: 200, leoMoeBoundaryKm: 2000, meoHeoBoundaryKm: 50000, heoUpperBoundaryKm: 1.47e6, geoStationaryKm: 35786, isGeoFallback: false } },
    { id: 'sea', name: 'Space Elevator', kind: 'construct', parentId: 'earth', megaType: 'space-elevator', placement: 'Surface', tags: [],
      physical_parameters: { dimensionsM: [45e6, 30, 30], massKg: 0 } },
    { id: 'ship', name: 'Lift', kind: 'construct', roleHint: 'ship', parentId: 'earth', tags: [], flight_state: 'Docked',
      attachedTo: { id: 'sea', level: 'geo' },
      orbit: { hostId: 'sol', t0: 0, elements: { a_AU: 1.5, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0 } } }   // a STALE orbit, to be ignored
  ]
});

describe('getGlobalState on a docked construct', () => {
  it('sits where the propagator puts it - on the ribbon at geo - not on its stale orbit', () => {
    const sys = system();
    const ship = sys.nodes.find((n: any) => n.id === 'ship');
    const t = 5 * 3600 * 1000;
    const s = getGlobalState(sys, ship, t);
    const off = attachedOffsetAu({ id: 'sea', level: 'geo' }, sys.nodes[2], sys.nodes[1], t)!;
    expect(s.r.x).toBeCloseTo(off.x, 12);       // Earth sits at the origin in this fixture
    expect(s.r.y).toBeCloseTo(off.y, 12);
    expect(Math.hypot(s.r.x, s.r.y) * AU_KM).toBeCloseTo(6371 + 35786, 3);
  });
  it('moves WITH the ribbon: the co-rotation speed at geo, perpendicular to the radius', () => {
    const sys = system();
    const s = getGlobalState(sys, sys.nodes.find((n: any) => n.id === 'ship'), 0);
    const speedMs = Math.hypot(s.v.x, s.v.y, s.v.z ?? 0) * AU_M;
    expect(speedMs).toBeCloseTo((2 * Math.PI * (6371 + 35786) * 1000) / (23.934 * 3600), 0);   // 3,074.6 m/s
    const rHat = { x: s.r.x, y: s.r.y }; const rn = Math.hypot(rHat.x, rHat.y);
    expect(Math.abs((s.v.x * rHat.x + s.v.y * rHat.y) / rn) * AU_M).toBeLessThan(0.05);         // no radial part
    expect(s.r.x * s.v.y - s.r.y * s.v.x).toBeGreaterThan(0);                                    // prograde
  });
  it('the ladder structure itself answers with its anchor, one host radius out', () => {
    const sys = system();
    const s = getGlobalState(sys, sys.nodes.find((n: any) => n.id === 'sea'), 0);
    expect(Math.hypot(s.r.x, s.r.y) * AU_KM).toBeCloseTo(6371, 6);
  });
});
