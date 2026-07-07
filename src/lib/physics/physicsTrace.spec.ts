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
