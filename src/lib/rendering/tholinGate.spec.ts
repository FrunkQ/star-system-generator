import { describe, it, expect } from 'vitest';
import { deriveAppearance } from './planetAppearance';
import type { CelestialBody } from '$lib/types';

// A tholin haze is organic: methane photolysed in a nitrogen bath (Titan). The gate used to accept
// CH4 + N2 > 0.3, which nitrogen alone satisfies — so EARTH, at 78% N2, was given a Titan haze and
// rendered with a tan organic wash over its blue ocean. These pin the physics that stops it.
const world = (over: Partial<CelestialBody>) => ({
  id: 'w', roleHint: 'planet', radiusKm: 6371, massKg: 5.97e24,
  makeup: { rock: 0.68, metal: 0.32 },
  equilibriumTempK: 288, temperatureK: 288, tags: [],
  apparentColor: { hex: '#4579aa', banding: 0, palette: [] },
  ...over
}) as unknown as CelestialBody;

describe('tholin haze requires organics, not just nitrogen', () => {
  it('Earth (N2 + O2, no methane) gets NO organic haze', () => {
    const earth = world({ atmosphere: { pressure_bar: 1, composition: { N2: 0.78, O2: 0.21 } } as any });
    expect(deriveAppearance(earth).tholin).toBeNull();
  });

  it('Titan (methane in nitrogen, no oxygen) still gets its haze', () => {
    const titan = world({
      radiusKm: 2575, massKg: 1.35e23,
      atmosphere: { pressure_bar: 1.5, composition: { N2: 0.95, CH4: 0.05 } } as any
    });
    const t = deriveAppearance(titan).tholin;
    expect(t).not.toBeNull();
    expect(t!.atmospheric).toBe(true);
  });

  it('an OXIDISING atmosphere destroys the haze even with methane present', () => {
    const oxidised = world({
      atmosphere: { pressure_bar: 1.5, composition: { N2: 0.7, CH4: 0.05, O2: 0.2 } } as any
    });
    expect(deriveAppearance(oxidised).tholin).toBeNull();
  });

  it('a TRACE of methane is not enough (Earth is ~2 ppm; Titan is ~5%)', () => {
    const trace = world({
      atmosphere: { pressure_bar: 1, composition: { N2: 0.78, CH4: 0.0000018 } } as any
    });
    expect(deriveAppearance(trace).tholin).toBeNull();
  });
});
