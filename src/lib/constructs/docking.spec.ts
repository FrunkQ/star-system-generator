import { describe, it, expect } from 'vitest';
import type { CelestialBody } from '$lib/types';
import { AU_KM } from '$lib/constants';
import {
  ladderPorts, ladderLevelRadiusKm, anchorLocalDir, hostSpinAngleRad, hostFrameDir,
  attachedOffsetAu, nearestAttachment, dockSpeedMs, dockMatchSpeedMs, structureSpinRadPerSec, dockingOf
} from './docking';
import { megaTypeDef, instanceMegaParams } from './megaTypes';

const AU_M = AU_KM * 1000;
const earth = (over: Partial<CelestialBody> = {}): CelestialBody =>
  ({
    id: 'earth', name: 'Earth', parentId: 'sol', tags: [], kind: 'body', roleHint: 'planet',
    massKg: 5.972e24, radiusKm: 6371, rotation_period_hours: 23.934, axial_tilt_deg: 0,
    orbitalBoundaries: {
      minLeoKm: 200, leoMoeBoundaryKm: 2000, meoHeoBoundaryKm: 50000,
      heoUpperBoundaryKm: 1.47e6, geoStationaryKm: 35786, isGeoFallback: false
    },
    ...over
  }) as CelestialBody;
const sol = (): CelestialBody =>
  ({ id: 'sol', name: 'Sol', parentId: null, tags: [], kind: 'body', roleHint: 'star', massKg: 1.989e30, radiusKm: 695700, temperatureK: 5772 }) as CelestialBody;
const elevator = (over: any = {}): CelestialBody =>
  ({ id: 'sea-1', name: 'Space Elevator', kind: 'construct', parentId: 'earth', megaType: 'space-elevator', placement: 'Surface',
     physical_parameters: { dimensionsM: [45e6, 30, 30] }, tags: [], ...over }) as any;
const ring = (over: any = {}): CelestialBody =>
  ({ id: 'ring-1', name: 'Ringworld', kind: 'construct', parentId: 'sol', megaType: 'ringworld',
     orbit: { hostId: 'sol', elements: { a_AU: 1, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0 } }, tags: [], ...over }) as any;
const deathStar = (): CelestialBody =>
  ({ id: 'ds-1', name: 'Death Star', kind: 'construct', parentId: 'earth', megaType: 'death-star', tags: [] }) as any;
const P_EARTH_MS = 23.934 * 3600 * 1000;

describe('the ladder - the elevator\'s rungs are RADII from the host centre', () => {
  it('anchor = the surface, geo = the dock the shape publishes, counterweight = the authored top; lo/mo between', () => {
    const ports = ladderPorts(elevator(), earth());
    const ids = ports.map((p) => p.id);
    expect(ids[0]).toBe('anchor');
    expect(ids[ids.length - 1]).toBe('counterweight');
    expect(ids).toContain('geo');
    expect(ladderLevelRadiusKm('anchor', elevator(), earth())).toBe(6371);
    expect(ladderLevelRadiusKm('geo', elevator(), earth())).toBeCloseTo(6371 + 35786, 6);
    expect(ladderLevelRadiusKm('counterweight', elevator(), earth())).toBeCloseTo(6371 + 45000, 6);
    for (let k = 1; k < ports.length; k++) expect(ports[k].radiusKm).toBeGreaterThan(ports[k - 1].radiusKm);
  });
  it('a host with no real geostationary has no ladder', () => {
    const noGeo = earth({ orbitalBoundaries: { ...(earth().orbitalBoundaries as any), isGeoFallback: true } });
    expect(ladderPorts(elevator(), noGeo)).toEqual([]);
  });
});

describe('the anchor and the spin - the renderer\'s convention, pinned', () => {
  it('a tether anchor is on the equator whatever the id hash says; an authored site keeps its longitude', () => {
    const spec = megaTypeDef('space-elevator')!.shape(instanceMegaParams(elevator(), megaTypeDef('space-elevator')!, earth()), earth());
    expect(anchorLocalDir(elevator(), spec as any).z).toBe(0);
    const d = anchorLocalDir(elevator({ surface_anchor: { latDeg: 51, lonDeg: 90 } }), spec as any);
    expect(d.x).toBeCloseTo(0, 12); expect(d.y).toBeCloseTo(1, 12); expect(d.z).toBe(0);
  });
  it('spin: a quarter period is a quarter turn, PROGRADE about the pole', () => {
    expect(hostSpinAngleRad(earth(), P_EARTH_MS / 4)).toBeCloseTo(Math.PI / 2, 12);
    const d = hostFrameDir({ x: 1, y: 0, z: 0 }, earth(), P_EARTH_MS / 4);
    expect(d.x).toBeCloseTo(0, 9); expect(d.y).toBeCloseTo(1, 9); expect(d.z).toBeCloseTo(0, 9);
  });
  it('tilt: the pole leans as the renderer leans it - a 90 degree tilt lays local +x onto +z at epoch', () => {
    const d = hostFrameDir({ x: 1, y: 0, z: 0 }, earth({ axial_tilt_deg: 90 }), 0);
    expect(d.x).toBeCloseTo(0, 12); expect(d.y).toBeCloseTo(0, 12); expect(d.z).toBeCloseTo(1, 12);
  });
});

describe('attachedOffsetAu - THE ONE ANSWER', () => {
  it('a ship at the geo dock stands at exactly the geo radius, and rides round with the world', () => {
    const att = { id: 'sea-1', level: 'geo' as const };
    const p0 = attachedOffsetAu(att, elevator(), earth(), 0)!;
    expect(Math.hypot(p0.x, p0.y, p0.z) * AU_KM).toBeCloseTo(6371 + 35786, 6);
    const pHalf = attachedOffsetAu(att, elevator(), earth(), P_EARTH_MS / 2)!;
    const dot = p0.x * pHalf.x + p0.y * pHalf.y + p0.z * pHalf.z;
    expect(dot).toBeCloseTo(-(p0.x * p0.x + p0.y * p0.y + p0.z * p0.z), 12);   // diametrically opposite
  });
  it('a hull docks at the node itself - no offset of its own', () => {
    expect(attachedOffsetAu({ id: 'ds-1' }, deathStar(), earth(), 0)).toBeNull();
    expect(dockingOf(deathStar())).toBe('point');
  });
});

describe('anywhere - ports everywhere on a ring', () => {
  it('the nearest point is under the ship at arrival, and rides the rim afterwards', () => {
    const r = ring(), s = sol();
    const ship = { x: Math.cos(0.5), y: Math.sin(0.5), z: 0 };
    const att = nearestAttachment(r, s, ship, 0)!;
    expect(att.angleRad).toBeCloseTo(0.5, 12);
    expect(att.latRad).toBeCloseTo(0, 9);
    const back = attachedOffsetAu(att, r, s, 0)!;
    expect(back.x).toBeCloseTo(ship.x, 12); expect(back.y).toBeCloseTo(ship.y, 12);
    const w = structureSpinRadPerSec(r, megaTypeDef('ringworld')!, s);
    const later = attachedOffsetAu(att, r, s, 1000 * 1000)!;      // 1000 s on
    expect(Math.atan2(later.y, later.x)).toBeCloseTo(0.5 + w * 1000, 9);
  });
  it('THE RIM SPEED IS ONE GRAVITY\'S WORTH: v = sqrt(g R) at the ring\'s own radius, to 2 percent', () => {
    const r = ring(), s = sol();
    const def = megaTypeDef('ringworld')!;
    const params = instanceMegaParams(r, def, s) as any;
    const Rm = params.radiusAU * AU_M;
    const v = structureSpinRadPerSec(r, def, s) * Rm;
    expect(v / Math.sqrt(9.80665 * Rm)).toBeCloseTo(1, 1.7);
    expect(v).toBeGreaterThan(1e6);                          // a Niven rim: over a thousand km/s
  });
});

describe('what docking COSTS - co-rotation is not orbit', () => {
  it('geo: nothing (the dock IS orbit); anchor: a near-landing; stated, never refused', () => {
    const geo = dockMatchSpeedMs({ id: 'sea-1', level: 'geo' }, elevator(), earth(), 0)!;
    expect(geo).toBeLessThan(20);
    const anchor = dockMatchSpeedMs({ id: 'sea-1', level: 'anchor' }, elevator(), earth(), 0)!;
    expect(anchor).toBeGreaterThan(7000);
    expect(dockSpeedMs({ id: 'sea-1', level: 'anchor' }, elevator(), earth(), 0)).toBeCloseTo((2 * Math.PI * 6371e3) / (23.934 * 3600), 3);
  });
});
