import { describe, it, expect } from 'vitest';
import { bulkDensityFromMakeup, compressedDensityFromMakeup, radiusReFromMassMakeup, compressionFactor } from './makeup';

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
});
