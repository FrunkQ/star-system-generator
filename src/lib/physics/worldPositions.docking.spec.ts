import { describe, it, expect } from 'vitest';
import { AU_KM } from '$lib/constants';
import { computeWorldPositions, computeWorldPositions3D, computeWorldStates3D } from './worldPositions';
import { anchorLocalDir } from '$lib/constructs/docking';
import { megaTypeDef, instanceMegaParams } from '$lib/constructs/megaTypes';

// G53 PHASE 5 - ATTACHMENT IS PROPAGATOR DATA. One walk, three views: the 2D orrery, the holo and
// the player snapshot all read these positions, so a docked ship is on its structure everywhere by
// construction (design 7c). Earth sits at the origin here (no orbit) so every offset is absolute.
const P_EARTH_MS = 23.934 * 3600 * 1000;
const system = (): any => ({
  id: 'sys', name: 'sys',
  nodes: [
    { id: 'sol', name: 'Sol', kind: 'body', roleHint: 'star', parentId: null, massKg: 1.989e30, radiusKm: 695700, temperatureK: 5772, tags: [] },
    { id: 'earth', name: 'Earth', kind: 'body', roleHint: 'planet', parentId: 'sol', massKg: 5.972e24, radiusKm: 6371,
      rotation_period_hours: 23.934, axial_tilt_deg: 0, tags: [],
      orbitalBoundaries: { minLeoKm: 200, leoMoeBoundaryKm: 2000, meoHeoBoundaryKm: 50000, heoUpperBoundaryKm: 1.47e6, geoStationaryKm: 35786, isGeoFallback: false } },
    // The create path gives a surface structure a placeholder orbit at the host's radius: it must be
    // OUTRANKED by the anchor, or the anchor walks round at the 84-minute surface-orbit period.
    { id: 'sea', name: 'Space Elevator', kind: 'construct', parentId: 'earth', megaType: 'space-elevator', placement: 'Surface', tags: [],
      physical_parameters: { dimensionsM: [45e6, 30, 30], massKg: 0 },
      orbit: { hostId: 'earth', t0: 0, elements: { a_AU: 6371 / AU_KM, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 2.0 } } },
    { id: 'lift', name: 'Climber', kind: 'construct', parentId: 'earth', tags: [], attachedTo: { id: 'sea', level: 'geo' } },
    { id: 'ds', name: 'Death Star', kind: 'construct', parentId: 'earth', megaType: 'death-star', tags: [], vector_position_au: { x: 0.001, y: 0.002 } },
    { id: 'pod', name: 'Pod', kind: 'construct', parentId: 'earth', tags: [], attachedTo: { id: 'ds' } },
    { id: 'ring', name: 'Ringworld', kind: 'construct', parentId: 'sol', megaType: 'ringworld', tags: [],
      orbit: { hostId: 'sol', t0: 0, elements: { a_AU: 1, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0 } } },
    { id: 'rider', name: 'Rim Rider', kind: 'construct', parentId: 'sol', tags: [], attachedTo: { id: 'ring', angleRad: 0.5, latRad: 0 } }
  ]
});
const norm = (p: any) => Math.hypot(p.x, p.y, p.z ?? 0);

describe('a ladder structure stands on its anchor ray, not on its placeholder orbit', () => {
  it('2D: the elevator is one host radius out, on the HASHED anchor bearing, not at the orbit\'s M0', () => {
    const sys = system();
    const p = computeWorldPositions(sys, 0).get('sea')!;
    expect(norm(p) * AU_KM).toBeCloseTo(6371, 6);
    const def = megaTypeDef('space-elevator')!;
    const sea = sys.nodes.find((n: any) => n.id === 'sea'), earth = sys.nodes.find((n: any) => n.id === 'earth');
    const a = anchorLocalDir(sea, def.shape(instanceMegaParams(sea, def, earth), earth) as any);
    expect(Math.atan2(p.y, p.x)).toBeCloseTo(Math.atan2(a.y, a.x), 9);
    expect(Math.abs(Math.atan2(p.y, p.x) - 2.0)).toBeGreaterThan(0.05);   // and NOT the orbit's angle
  });
  it('turns with the world: half a rotation later it is on the far side', () => {
    const p0 = computeWorldPositions3D(system(), 0).get('sea')!;
    const p1 = computeWorldPositions3D(system(), P_EARTH_MS / 2).get('sea')!;
    expect(p0.x * p1.x + p0.y * p1.y).toBeCloseTo(-(p0.x * p0.x + p0.y * p0.y), 12);
    expect(p1.z).toBeCloseTo(0, 12);
  });
});

describe('a docked ship rides its structure - one answer for every view', () => {
  it('the climber at the geo dock is 42,157 km out ON the ribbon\'s bearing, in 2D, 3D and the states walk', () => {
    const t = 3600 * 1000 * 5;
    const p2 = computeWorldPositions(system(), t), p3 = computeWorldPositions3D(system(), t), s3 = computeWorldStates3D(system(), t);
    const sea = p2.get('sea')!, lift = p2.get('lift')!;
    expect(norm(lift) * AU_KM).toBeCloseTo(6371 + 35786, 6);
    const cosang = (sea.x * lift.x + sea.y * lift.y) / (norm(sea) * norm(lift));
    expect(cosang).toBeCloseTo(1, 12);
    expect(p3.get('lift')!.x).toBeCloseTo(lift.x, 12);
    expect(p3.get('lift')!.y).toBeCloseTo(lift.y, 12);
    expect(s3.get('lift')!.r.x).toBeCloseTo(lift.x, 12);
  });
  it('a pod docked to a hull sits AT the hull (point docking)', () => {
    const p = computeWorldPositions(system(), 0);
    expect(p.get('pod')).toEqual(p.get('ds'));
  });
  it('a rider on the ring sits on the rim at its stored bearing, 1 AU out', () => {
    const p = computeWorldPositions(system(), 0).get('rider')!;
    expect(norm(p)).toBeCloseTo(1, 9);
    expect(Math.atan2(p.y, p.x)).toBeCloseTo(0.5, 9);
  });
});
