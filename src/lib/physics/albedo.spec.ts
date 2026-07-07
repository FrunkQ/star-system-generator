import { describe, it, expect } from 'vitest';
import { deriveAlbedo } from './albedo';
import type { CelestialBody } from '$lib/types';
import { EARTH_MASS_KG, EARTH_RADIUS_KM } from '$lib/constants';

const body = (p: Partial<CelestialBody>): CelestialBody =>
  ({ id: 'x', kind: 'body', roleHint: 'planet', massKg: EARTH_MASS_KG, radiusKm: EARTH_RADIUS_KM, ...p }) as CelestialBody;

describe('deriveAlbedo', () => {
  it('Earth: ocean + its own water clouds → ~0.3', () => {
    const a = deriveAlbedo(body({ hydrosphere: { composition: 'water', coverage: 0.7 }, atmosphere: { main: 'N2', pressure_bar: 1, composition: { N2: 0.78, O2: 0.21 } } as any }), 255);
    expect(a.albedo).toBeGreaterThan(0.25);
    expect(a.albedo).toBeLessThan(0.36);
    expect(a.cloudSpecies).toBe('H2O');
  });

  it('a thick CO₂ world (Venus-like) is bright from its cloud deck', () => {
    const a = deriveAlbedo(body({ massKg: 0.8 * EARTH_MASS_KG, atmosphere: { main: 'CO2', pressure_bar: 90, composition: { CO2: 0.96, N2: 0.04 } } as any }), 230);
    expect(a.albedo).toBeGreaterThan(0.6);
    expect(a.cloudSpecies).toBe('CO2');
  });

  it('an airless rock (Moon-like) is dark, cloud-free', () => {
    const a = deriveAlbedo(body({ massKg: 0.012 * EARTH_MASS_KG, makeup: { rock: 0.9, metal: 0.1 } }), 270);
    expect(a.cloudCover).toBe(0);
    expect(a.albedo).toBeLessThan(0.2);
  });

  it('does not snowball: a water world with cold EQUILIBRIUM temp stays an ocean (greenhouse warms it)', () => {
    const a = deriveAlbedo(body({ hydrosphere: { composition: 'water', coverage: 0.7 }, atmosphere: { main: 'N2', pressure_bar: 1, composition: { N2: 0.8 } } as any }), 255);
    expect(a.surfaceAlbedo).toBeLessThan(0.2); // ocean, not 0.6 ice
  });

  it('a manually pinned albedo wins', () => {
    const a = deriveAlbedo(body({ albedo: 0.9 }), 300);
    expect(a.albedo).toBe(0.9);
    expect(a.note).toMatch(/manual/i);
  });

  it('a GM albedo OVERRIDE (overrides.albedo) wins over the derived value', () => {
    // An ocean world would derive ~0.3; the override forces it dark, and that value is what feeds temperature.
    const a = deriveAlbedo(body({
      hydrosphere: { composition: 'water', coverage: 0.7 } as any,
      overrides: { albedo: 0.05 }
    }), 255);
    expect(a.albedo).toBe(0.05);
    expect(a.note).toMatch(/override/i);
  });
});
