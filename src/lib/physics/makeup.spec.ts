import { describe, it, expect } from 'vitest';
import { bulkDensityFromMakeup, compressedDensityFromMakeup, radiusReFromMassMakeup, compressionFactor, inferMakeupFromDensity, makeupFractions, gasThermalInflationFactor, isFluidGiant, rendersAsGiant } from './makeup';
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

describe('gas-giant thermal inflation', () => {
  const jupiter = { gas: 0.95, ice: 0.05 };

  it('inflation factor: negligible when cold, grows with temperature', () => {
    expect(gasThermalInflationFactor(100)).toBeCloseTo(1, 3);   // cold Jupiter
    expect(gasThermalInflationFactor(1400)).toBeGreaterThan(1.2); // hot Jupiter puffs up
    expect(gasThermalInflationFactor(3000)).toBeCloseTo(1.7, 1);  // saturates near +70%
  });

  it('a hot gas giant is larger and less dense than a cold one at the same mass', () => {
    const cold = radiusReFromMassMakeup(317.8, jupiter, gasThermalInflationFactor(100));
    const hot = radiusReFromMassMakeup(317.8, jupiter, gasThermalInflationFactor(1800));
    expect(hot).toBeGreaterThan(cold * 1.2);
    // same mass in a bigger radius ⇒ lower density
    const rho = (r: number) => 5.513 * 317.8 / r ** 3;
    expect(rho(hot)).toBeLessThan(rho(cold));
  });

  it('inflation does NOT change a rocky body (no thermal expansion of rock/metal)', () => {
    const rocky = { rock: 0.8, metal: 0.2 };
    expect(radiusReFromMassMakeup(1, rocky, 1.7)).toBeCloseTo(radiusReFromMassMakeup(1, rocky, 1), 5);
  });
});

describe('fluid-giant detection (drives the giant render look)', () => {
  const b = (p: Partial<CelestialBody>): CelestialBody => ({ id: 'x', kind: 'body', roleHint: 'planet', ...p } as CelestialBody);

  it('an ice-dominated giant (massive, low density, low gas) is a fluid giant and renders as a giant', () => {
    const iceGiant = b({ makeup: { ice: 0.97, gas: 0.03 }, massKg: 2.92e27, radiusKm: 81549 }); // ~489 M⊕, ρ≈1.29
    expect(isFluidGiant(iceGiant)).toBe(true);
    expect(rendersAsGiant(iceGiant)).toBe(true);
  });

  it('a gas-dominated giant renders as a giant even below the mass threshold', () => {
    expect(rendersAsGiant(b({ makeup: { gas: 0.8, ice: 0.2 }, massKg: 3e25, radiusKm: 30000 }))).toBe(true);
  });

  it('a small icy moon and a rocky super-Earth are NOT giants', () => {
    expect(isFluidGiant(b({ makeup: { ice: 0.6, rock: 0.4 }, massKg: 4.8e22, radiusKm: 1560 }))).toBe(false); // Europa-ish
    expect(rendersAsGiant(b({ makeup: { ice: 0.6, rock: 0.4 }, massKg: 4.8e22, radiusKm: 1560 }))).toBe(false);
    expect(isFluidGiant(b({ makeup: { rock: 0.7, metal: 0.3 }, massKg: 6e25, radiusKm: 12000 }))).toBe(false); // ~10 M⊕, dense
  });
});
