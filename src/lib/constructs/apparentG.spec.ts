import { describe, it, expect } from 'vitest';
import type { CelestialBody } from '$lib/types';
import { AU_KM, G } from '$lib/constants';
import { apparentGravity } from './apparentG';
import { megaTypeDef, instanceMegaParams } from './megaTypes';

// G58 N2 - THE CREW TAB'S LAST SEAM: apparent gravity comes from the RECORD's wiring, not from
// station-shaped fields. The owner's decision is his own design-spine sentence (2026-08-31): "apparent
// g has THREE honest wirings - station spin section / ring's own rotation / orbit-net-of-host, zero
// at orbital rate - and the record must DECLARE which." 'own-rotation' is therefore NET OF THE HOST:
// omega^2 r - GM/r^2. For a ringworld round a star the host term is a rounding error; for a torus
// round a world it is the whole story.
const AU_M = AU_KM * 1000;
const M_SOL = 1.989e30, M_EARTH = 5.972e24;
const sol = (): CelestialBody => ({ id: 'sol', name: 'Sol', parentId: null, tags: [], kind: 'body', roleHint: 'star', massKg: M_SOL, radiusKm: 695700, temperatureK: 5772 }) as any;
const earth = (): CelestialBody => ({ id: 'earth', name: 'Earth', parentId: 'sol', tags: [], kind: 'body', roleHint: 'planet', massKg: M_EARTH, radiusKm: 6371, rotation_period_hours: 23.934,
  orbitalBoundaries: { minLeoKm: 200, leoMoeBoundaryKm: 2000, meoHeoBoundaryKm: 50000, heoUpperBoundaryKm: 1.47e6, geoStationaryKm: 35786, isGeoFallback: false } }) as any;
const mega = (megaType: string, parentId: string, megaParams?: Record<string, number>): CelestialBody =>
  ({ id: megaType + '-1', name: megaType, kind: 'construct', parentId, megaType, tags: [], megaParams,
     orbit: { hostId: parentId, elements: { a_AU: 1, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0 } } }) as any;

describe('apparentGravity - the record declares the wiring', () => {
  it('a ringworld round Sol: its own rotation, net of the star - one gravity less six thousandths', () => {
    const r = mega('ringworld', 'sol');
    const g = apparentGravity(r, sol())!;
    expect(g.wiring).toBe('own-rotation');
    const def = megaTypeDef('ringworld')!;
    const spin = def.derive(instanceMegaParams(r, def, sol()), sol()).spinGravityMs2!;
    const rM = (instanceMegaParams(r, def, sol()) as any).radiusAU * AU_M;
    expect(g.hostPullMs2).toBeCloseTo((G * M_SOL) / (rM * rM), 9);   // ~0.0059 m/s^2 at 1 AU
    expect(g.ms2).toBeCloseTo(spin - g.hostPullMs2, 9);
    expect(g.ms2).toBeGreaterThan(9.7); expect(g.ms2).toBeLessThan(9.81);
  });
  it('a planetary torus turning at EXACTLY orbital rate reads ZERO - free fall, the number the engine owes', () => {
    const rKm = 7000, rM = rKm * 1000;
    const periodH = (2 * Math.PI * Math.sqrt((rM * rM * rM) / (G * M_EARTH))) / 3600;
    const t = mega('planetary-torus', 'earth', { ringRadiusKm: rKm, rotationPeriodHours: periodH });
    const g = apparentGravity(t, earth())!;
    expect(g.wiring).toBe('own-rotation');
    expect(Math.abs(g.ms2)).toBeLessThan(1e-6);                          // absolute, not a ratio
    expect(g.hostPullMs2).toBeCloseTo((G * M_EARTH) / (rM * rM), 6);
  });
  it('a hull (the Death Star) reads its own surface gravity, and a structure with no honest figure says so', () => {
    const ds = apparentGravity(mega('death-star', 'earth'), earth())!;
    expect(ds.wiring).toBe('surface');
    const def = megaTypeDef('death-star')!;
    expect(ds.ms2).toBe(def.derive(instanceMegaParams(mega('death-star', 'earth'), def, earth()), earth()).surfaceGravityMs2 ?? 0);
    const sea = apparentGravity(mega('space-elevator', 'earth'), earth())!;
    expect(sea.wiring).toBe('none');
  });
  it('an ordinary station is not the record\'s business - null, and the crew tab keeps its spin section', () => {
    const station = { id: 's', name: 'Tycho', kind: 'construct', parentId: 'earth', tags: [], physical_parameters: { spinRadiusM: 200, rotation_period_hours: 0.05 } } as any;
    expect(apparentGravity(station, earth())).toBeNull();
  });
});
