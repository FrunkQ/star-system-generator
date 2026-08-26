import { describe, it, expect } from 'vitest';
import { buildPhysicsTrace } from './physicsTrace';
import type { CelestialBody } from '$lib/types';
import { EARTH_MASS_KG, EARTH_RADIUS_KM } from '$lib/constants';

function earthLike(): CelestialBody {
  return {
    id: 'e', kind: 'body', roleHint: 'planet', name: 'Terra',
    massKg: EARTH_MASS_KG, radiusKm: EARTH_RADIUS_KM,
    makeup: { rock: 0.68, metal: 0.32 },
    rotation_period_hours: 24,
    equilibriumTempK: 255, greenhouseTempK: 33, temperatureK: 288,
    temperatureRangeK: { min: 230, max: 320 },
    hydrosphere: { composition: 'water', coverage: 0.7, layers: [{ liquid: 'water', location: 'surface', coverage: 0.7 }] },
    magnetism: { source: 'iron-core', geometry: 'dipolar', intrinsic: true, estimatedRangeGauss: { min: 0.1, max: 0.6 }, notes: ['Molten iron core → dipole.'] },
    geoActivity: { regime: 'plate-tectonics', volcanism: 'arc-effusive', vigor: 1.0, active: true, driver: 'radiogenic + water', tags: ['geology/plate-tectonics'], notes: ['Mobile lid.'] },
    apparentColor: { hex: '#3a6ea5', palette: [{ hex: '#9c7a5a', role: 'surface', weight: 1 }], banding: 0 },
    habitabilityScore: 100,
    tags: [{ key: 'geology/plate-tectonics' }, { key: 'magnetic/dynamo' }, { key: 'habitability/earth-like' }]
  } as CelestialBody;
}

describe('buildPhysicsTrace', () => {
  it('produces one card per active layer with inputs and outputs', () => {
    const t = buildPhysicsTrace(earthLike(), { ageGyr: 4.6 });
    const ids = t.layers.map((l) => l.id);
    for (const id of ['makeup', 'gravity', 'temperature', 'fluids', 'magnetism', 'geology', 'colour', 'habitability']) {
      expect(ids).toContain(id);
    }
    for (const layer of t.layers) {
      expect(layer.link).toMatch(/^\/physics#/);
      expect(layer.outputs.length).toBeGreaterThan(0);
    }
  });

  it('surfaces the habitability score and tier in the habitability card', () => {
    const t = buildPhysicsTrace(earthLike(), { ageGyr: 4.6 });
    const hab = t.layers.find((l) => l.id === 'habitability')!;
    expect(hab.outputs.some((o) => o.value.includes('100'))).toBe(true);
    expect(hab.outputs.some((o) => o.value === 'Earth-like')).toBe(true);
  });

  it('maps every tag to its producing layer with a friendly label', () => {
    const t = buildPhysicsTrace(earthLike(), { ageGyr: 4.6 });
    const geo = t.tags.find((x) => x.key === 'geology/plate-tectonics')!;
    expect(geo.layer).toBe('Geological activity');
    expect(geo.label).toBe('Plate tectonics');
    expect(geo.description.length).toBeGreaterThan(0);
  });

  it('is robust to a sparse body (no makeup/magnetism/geology)', () => {
    const sparse = { id: 'x', kind: 'body', roleHint: 'planet', name: 'Rock', massKg: 1e23, radiusKm: 2000, tags: [] } as CelestialBody;
    const t = buildPhysicsTrace(sparse);
    expect(t.layers.find((l) => l.id === 'makeup')).toBeTruthy();
    expect(t.layers.find((l) => l.id === 'magnetism')).toBeFalsy();
    expect(t.tags).toEqual([]);
  });
});

// The trace claims to SHOW THE WORKING, so a term that now feeds a figure it explains must be
// present — omitting one does not under-explain the number, it explains it wrongly. These pin the
// layers added when the documentation debt was swept.
describe('the trace shows the working for what the engine now derives', () => {
  it('breaks the albedo into bare ground, deposit and cloud (B5)', () => {
    const mars = {
      ...earthLike(), name: 'Ares', hydrosphere: undefined,
      albedoBreakdown: { albedo: 0.256, surfaceAlbedo: 0.252, bareAlbedo: 0.105, deposit: 'moderate oxide dust', cloudAlbedo: 0.42, cloudCover: 0.02, note: 'x' }
    } as unknown as CelestialBody;
    const alb = buildPhysicsTrace(mars, {}).layers.find((l) => l.id === 'albedo');
    expect(alb, 'no albedo layer').toBeTruthy();
    // The whole point: bare ground and the finished surface are BOTH shown, so the deposit's
    // contribution is visible rather than folded into one number.
    expect(JSON.stringify(alb)).toContain('0.105');
    expect(JSON.stringify(alb)).toContain('moderate oxide dust');
    expect(alb!.outputs.some((o) => o.value.includes('0.256'))).toBe(true);
  });

  it('shows the spin axis and says when it was inferred rather than measured (B10)', () => {
    const gen = { ...earthLike(), axial_tilt_deg: 21.4, tags: [{ key: 'spin/axis-inferred' }] } as unknown as CelestialBody;
    const spin = buildPhysicsTrace(gen, {}).layers.find((l) => l.id === 'spin');
    expect(spin, 'no spin layer').toBeTruthy();
    expect(JSON.stringify(spin)).toContain('inferred, not measured');
    // A measured world must NOT carry the caveat — the mark is only worth anything if its absence
    // means something.
    const measured = { ...earthLike(), axial_tilt_deg: 23.44, tags: [] } as unknown as CelestialBody;
    const spin2 = buildPhysicsTrace(measured, {}).layers.find((l) => l.id === 'spin');
    expect(JSON.stringify(spin2)).not.toContain('inferred, not measured');
  });

  it('says which plane a moon\'s orbit is quoted in (C3c)', () => {
    const moon = {
      ...earthLike(), roleHint: 'moon', axial_tilt_deg: 5,
      orbit: { hostId: 'p', hostMu: 1, t0: 0, frame: 'ecliptic', elements: { a_AU: 0.0026, e: 0.05, i_deg: 5.1, Omega_deg: 0, omega_deg: 0, M0_rad: 0 } }
    } as unknown as CelestialBody;
    const spin = buildPhysicsTrace(moon, {}).layers.find((l) => l.id === 'spin');
    expect(JSON.stringify(spin)).toContain('SYSTEM plane');
  });

  it('names where each radiation figure is quoted (B27)', () => {
    const earth = {
      ...earthLike(), surfaceRadiation: 2.3, orbitalRadiation: 652965, photonRadiation: 1, particleRadiation: 1,
      totalIncidentFlux: 1, starlightFlux: 1, beltInnerEdgeRadii: 1.1982
    } as unknown as CelestialBody;
    const rad = buildPhysicsTrace(earth, {}).layers.find((l) => l.id === 'radiation');
    expect(rad, 'no radiation layer').toBeTruthy();
    // Not "Above the atmosphere" — that read as "where a ship parks", and this figure is the belt.
    expect(JSON.stringify(rad)).toContain('belts');
    expect(JSON.stringify(rad)).not.toContain('Above the atmosphere');
  });
});

// G45 — the panel that claims to show the working must show the CIRCUMBINARY working, and must not
// substitute the pair's own heliocentric orbit for a planet that orbits the pair from outside.
describe('the stability card explains a circumbinary orbit', () => {
  const pair = (annulus: any, parentOrbitAU?: number) => ({
    id: 'bary', kind: 'barycenter', name: 'Test Pair', memberIds: ['a', 'b'],
    effectiveMassKg: 3e30, circumbinary: annulus,
    ...(parentOrbitAU
      ? { orbit: { hostId: 'sun', elements: { a_AU: parentOrbitAU, e: 0 } } }
      : {})
  }) as any;

  const ANNULUS = {
    pairSeparationAU: 1, massRatioMu: 1 / 3, eccentricity: 0,
    criticalRatio: 2.4078, innerAU: 2.4078, fitExtrapolated: false
  };

  const planet = (aAU: number) => ({
    id: 'p', kind: 'body', roleHint: 'planet', name: 'Tatooine',
    massKg: EARTH_MASS_KG, radiusKm: EARTH_RADIUS_KM, parentId: 'bary',
    makeup: { rock: 0.7, metal: 0.3 },
    orbit: { hostId: 'bary', elements: { a_AU: aAU, e: 0 } }, tags: []
  }) as unknown as CelestialBody;

  it('names the mechanism, the limit and where the orbit sits against it', () => {
    const t = buildPhysicsTrace(planet(5), { host: pair(ANNULUS) });
    const stab = t.layers.find((l) => l.id === 'stability')!;
    expect(stab.inputs.some((i) => i.label === 'Circumbinary of')).toBe(true);
    expect(stab.inputs.some((i) => i.label.includes('Inner limit'))).toBe(true);
    expect(stab.inputs.some((i) => i.label.includes('against the inner limit'))).toBe(true);
    expect(stab.notes.join(' ')).toMatch(/turns twice per binary orbit/);
    expect(stab.notes.join(' ')).toMatch(/Holman & Wiegert/);
  });

  it('says out loud when the limit is extrapolated beyond the fit', () => {
    const t = buildPhysicsTrace(planet(5), { host: pair({ ...ANNULUS, fitExtrapolated: true }) });
    const stab = t.layers.find((l) => l.id === 'stability')!;
    expect(stab.notes.join(' ')).toMatch(/EXTRAPOLATION/);
  });

  it("prints the planet own orbit, not the pair heliocentric one", () => {
    // The pair orbits a third star at 39.48 AU; the planet orbits the pair at 5 AU. Before G45 the
    // stability card showed 39.48 for the planet, labelled "as the pair".
    const t = buildPhysicsTrace(planet(5), { host: pair(ANNULUS, 39.48) });
    const stab = t.layers.find((l) => l.id === 'stability')!;
    const orbit = stab.inputs.find((i) => i.label === 'Orbit')!;
    expect(orbit.value).toMatch(/5/);
    expect(orbit.value).not.toMatch(/39/);
    // ...and it must not claim the planet is a member of the pair.
    expect(stab.notes.join(' ')).not.toMatch(/a member of a binary/);
  });

  it('still treats an actual pair MEMBER as a member', () => {
    const member = { ...planet(0.33), id: 'a', name: 'Star A' } as CelestialBody;
    const t = buildPhysicsTrace(member, { host: pair(ANNULUS, 39.48) });
    const stab = t.layers.find((l) => l.id === 'stability')!;
    expect(stab.notes.join(' ')).toMatch(/a member of a binary/);
    expect(stab.inputs.some((i) => i.label === 'Circumbinary of')).toBe(false);
  });
});
