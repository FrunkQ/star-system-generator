import { describe, it, expect } from 'vitest';
import { spaceWeathering } from './cloudDecks';
import type { CelestialBody } from '$lib/types';

const w = (p: any): CelestialBody =>
  ({ id: 'w', kind: 'body', roleHint: 'moon', tags: [], massKg: 7.3e22, radiusKm: 1737, ...p }) as CelestialBody;

describe('space weathering', () => {
  it('is a FLUENCE — the same dose for longer means a more mature surface (B65)', () => {
    // The rate is not the answer; what has accumulated is. Taking the dose alone said a freshly
    // resurfaced world was as weathered as one that had sat there for four billion years, which is
    // backwards from the reason fresh crater rays are bright.
    const fresh = spaceWeathering(w({ irradiationDose: 1.4, geoActivity: { surfaceAgeGyr: 0.05 } }));
    const old = spaceWeathering(w({ irradiationDose: 1.4, geoActivity: { surfaceAgeGyr: 4.6 } }));
    expect(fresh).toBeLessThan(0.1);
    expect(old).toBeGreaterThan(0.9);
  });

  it('saturates rather than running away', () => {
    expect(spaceWeathering(w({ irradiationDose: 900, geoActivity: { surfaceAgeGyr: 9 } })))
      .toBeLessThanOrEqual(0.95);
  });

  it('needs a vacuum — an atmosphere means rust is the process, not weathering', () => {
    const airy = { atmosphere: { pressure_bar: 0.006 }, irradiationDose: 1.4, geoActivity: { surfaceAgeGyr: 4.6 } };
    expect(spaceWeathering(w(airy))).toBe(0);
  });

  it('leaves ice, gas and whole populations alone', () => {
    const mature = { irradiationDose: 5, geoActivity: { surfaceAgeGyr: 4.6 } };
    // An icy crust anneals rather than accumulating iron…
    expect(spaceWeathering(w({ ...mature, massKg: 1.1e20, radiusKm: 250 }))).toBe(0);
    // …and a belt is a population, not a surface. It used to come back a third weathered, from
    // fallback defaults applied to a body that carries neither tag.
    expect(spaceWeathering(w({ ...mature, roleHint: 'belt' }))).toBe(0);
    expect(spaceWeathering(w({ roleHint: 'belt' }))).toBe(0);
  });

  it('does not guess: an unmeasured world is unweathered, not half-weathered', () => {
    expect(spaceWeathering(w({}))).toBe(0);
    expect(spaceWeathering(w({ tags: [{ key: 'surface/age', value: 'ancient' }] }))).toBe(0);
  });
});
