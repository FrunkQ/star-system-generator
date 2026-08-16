import { describe, it, expect } from 'vitest';
import { deriveVisibility, lampReachM, scaleHeightM, horizonM, distanceWords } from './visibility';
import { EARTH_RADIUS_KM } from '$lib/constants';
import type { CelestialBody } from '$lib/types';

const world = (p: Partial<CelestialBody>): CelestialBody =>
  ({ id: 'w', kind: 'body', roleHint: 'planet', tags: [], radiusKm: EARTH_RADIUS_KM,
     calculatedGravity_ms2: 9.81, temperatureK: 288, ...p }) as CelestialBody;

const EARTH = world({
  atmosphere: { pressure_bar: 1, molarMassKg: 0.02896,
    composition: { N2: 0.78, O2: 0.21, Ar: 0.009, CO2: 0.0004 } } as any });
const VENUS = world({
  radiusKm: 6052, calculatedGravity_ms2: 8.87, temperatureK: 737,
  atmosphere: { pressure_bar: 92, molarMassKg: 0.044, composition: { CO2: 0.965, N2: 0.035 } } as any });
const MOON = world({ radiusKm: 1737, calculatedGravity_ms2: 1.62, temperatureK: 250 });

describe('scale height', () => {
  it('puts Earth near 8.4 km and Venus near 16', () => {
    expect(scaleHeightM(EARTH)).toBeCloseTo(8400, -3);
    expect(scaleHeightM(VENUS) / 1000).toBeGreaterThan(14);
    expect(scaleHeightM(VENUS) / 1000).toBeLessThan(18);
  });
});

describe('the horizon', () => {
  it('is 4.7 km on Earth and much closer on the Moon', () => {
    expect(horizonM(EARTH) / 1000).toBeCloseTo(4.65, 1);
    expect(horizonM(MOON) / 1000).toBeCloseTo(2.43, 1);
  });
});

describe('how far you can see', () => {
  it('gives Earth its clean-air Rayleigh limit — a few hundred kilometres', () => {
    // The known answer for perfectly clean air, and the reason distant mountains go blue instead of
    // vanishing. If this drifts, the optical depth it shares with the surface spectrum has drifted.
    const v = deriveVisibility(EARTH);
    expect(v.rangeM / 1000).toBeGreaterThan(200);
    expect(v.rangeM / 1000).toBeLessThan(500);
    expect(v.band).toBe('clear');
  });

  it('bands the AIR, not the horizon — or every world reads the same', () => {
    // A standing person's horizon is a few kilometres everywhere, so keying the band on how far you
    // can actually see made Earth, Mars, Titan and Venus all come out identical.
    expect(deriveVisibility(EARTH).band).not.toBe(deriveVisibility(VENUS).band);
  });

  it('but you still cannot see past the horizon', () => {
    const v = deriveVisibility(EARTH);
    expect(v.seeM).toBeCloseTo(v.horizonM, 0);
    expect(v.seeM).toBeLessThan(v.rangeM);
  });

  it('makes Venus a few kilometres of murk from sheer air, with no fog involved', () => {
    const v = deriveVisibility(VENUS);
    expect(v.rangeM / 1000).toBeGreaterThan(0.5);
    expect(v.rangeM / 1000).toBeLessThan(20);
    expect(v.fogged).toBe(false);      // its decks are 90 bar over your head, not around your knees
    expect(v.band).toBe('murky');
  });

  it('leaves an airless world limited only by its own curve', () => {
    const v = deriveVisibility(MOON);
    expect(v.extinctionPerM).toBe(0);
    expect(v.band).toBe('airless');
    expect(v.seeM).toBeCloseTo(v.horizonM, 0);
  });
});

describe('how far a lamp reaches', () => {
  it('throws a long way in clear air and is murdered by murk', () => {
    const clear = lampReachM(25_000, 0);
    const thick = lampReachM(25_000, 0.1);      // fog: about 39 m of visibility
    expect(clear).toBeGreaterThan(400);
    expect(thick).toBeLessThan(60);
    // Out AND back: the light is eaten twice, which is why a lamp never reaches as far as you can see.
    expect(thick).toBeLessThan(3.912 / 0.1);
  });

  it('ranks the lamps in the order anyone would expect, on every world', () => {
    for (const w of [EARTH, VENUS, MOON]) {
      const v = deriveVisibility(w);
      expect(v.lampM.torch).toBeLessThan(v.lampM.headlights);
      expect(v.lampM.headlights).toBeLessThan(v.lampM.floodlight);
    }
  });

  it('never claims a lamp shows you something past the horizon', () => {
    const v = deriveVisibility(MOON);
    expect(v.lampM.floodlight).toBeLessThanOrEqual(v.horizonM);
  });
});

describe('saying it at a table', () => {
  it('rounds to something a person can repeat', () => {
    expect(distanceWords(12)).toBe('12 m');
    expect(distanceWords(347)).toBe('350 m');
    expect(distanceWords(4650)).toBe('4.7 km');
    expect(distanceWords(339_000)).toBe('339 km');
  });
});
