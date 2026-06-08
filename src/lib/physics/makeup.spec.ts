import { describe, it, expect } from 'vitest';
import { bulkDensityFromMakeup, compressedDensityFromMakeup, radiusReFromMassMakeup, compressionFactor, inferMakeupFromDensity, makeupFractions } from './makeup';
import { EARTH_MASS_KG, EARTH_RADIUS_KM } from '$lib/constants';
import type { CelestialBody } from '$lib/types';

describe('makeup density + gravitational compression', () => {
  it('uncompressed grain density is composition-only (Earth mix ~3.7)', () => {
    expect(bulkDensityFromMakeup({ rock: 0.8, metal: 0.2 })).toBeCloseTo(3.73, 1);
  });

  it('an Earth-mass rocky world compresses to ~5.5 g/cc → ~1.0 R⊕', () => {
    const rho = compressedDensityFromMakeup(1, { rock: 0.8, metal: 0.2 });
    expect(rho).toBeGreaterThan(5.2);
    expect(rho).toBeLessThan(5.8);
    expect(radiusReFromMassMakeup(1, { rock: 0.8, metal: 0.2 })).toBeCloseTo(1.0, 1);
  });

  it('small bodies are barely compressed; super-Earths markedly more', () => {
    expect(compressionFactor(0.012, { rock: 1 })).toBeLessThan(1.05);  // Moon
    expect(compressionFactor(1, { rock: 1 })).toBeGreaterThan(1.4);     // Earth
    expect(compressionFactor(5, { rock: 1 })).toBeGreaterThan(compressionFactor(1, { rock: 1 }));
  });

  it('gas-dominated bodies are not rock-compressed', () => {
    expect(compressionFactor(50, { gas: 0.9, ice: 0.1 })).toBe(1);
  });

  it('inference inverts the grain blend: a dense uncompressed value is metal-rich', () => {
    const m = inferMakeupFromDensity(5.2);
    expect((m.metal ?? 0)).toBeGreaterThan(0.5);  // ~Mercury
    expect(inferMakeupFromDensity(3.4).rock ?? 0).toBeGreaterThan(0.8); // ~rock
  });

  it('mass-aware: a small dense body (Mercury-like) reads iron, not compressed rock', () => {
    const mercury = { id: 'm', kind: 'body', roleHint: 'planet', massKg: 0.055 * EARTH_MASS_KG, radiusKm: 0.383 * EARTH_RADIUS_KM } as CelestialBody;
    const f = makeupFractions(mercury);
    expect(f.metal).toBeGreaterThan(0.4);
  });

  it('gas giants use the giant mass–radius relation (Jupiter mass → ~11 R⊕, not huge)', () => {
    const r = radiusReFromMassMakeup(317.8, { gas: 0.95, ice: 0.05 });
    expect(r).toBeGreaterThan(9);
    expect(r).toBeLessThan(13);
  });
});
