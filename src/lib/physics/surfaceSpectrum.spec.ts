import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import type { CelestialBody, RulePack } from '$lib/types';
import { deriveSurfaceSpectrum, topOfAtmosphereSpectrum } from './surfaceSpectrum';
import { GRID_NM, integrate, peakNm } from './spectrum';

const pack = JSON.parse(readFileSync('static/rulepacks/starter-sf/atmospheres.json', 'utf8')) as unknown as RulePack;

const mk = (p: Partial<CelestialBody>): CelestialBody => ({
  id: 'b1', kind: 'body', name: 'Test', roleHint: 'planet',
  makeup: { rock: 0.7, metal: 0.3 }, calculatedGravity_ms2: 9.81, ...p
} as CelestialBody);

const earthLike = (over: Partial<CelestialBody> = {}) => mk({
  atmosphere: { pressure_bar: 1, molarMassKg: 0.02896, composition: { N2: 0.78, O2: 0.21, Ar: 0.009, CO2: 0.0004, H2O: 0.004 } },
  ...over
} as Partial<CelestialBody>);

const at = (spec: number[], nm: number) => spec[GRID_NM.indexOf(nm)];
// The derivation returns { summary, curves }: the summary rides on the body, the curves are used in
// the same pass and dropped. Three 113-element arrays per body would be ten thousand lines on the
// Sol fixture and would ride every save and every broadcast.
const derive = (...args: Parameters<typeof deriveSurfaceSpectrum>) => {
  const r = deriveSurfaceSpectrum(...args);
  return r ? { ...r.summary, ...r.curves } : undefined;
};

describe('top-of-atmosphere spectrum', () => {
  it('reproduces the solar constant in the grid share at 1 AU', () => {
    const s = topOfAtmosphereSpectrum(5778, 1, 1);
    const total = integrate(s);
    // 280-1400 nm holds most, not all, of the Sun's output — so under 1361 and well over half of it.
    expect(total).toBeGreaterThan(700);
    expect(total).toBeLessThan(1361);
  });

  it('falls off as the inverse square', () => {
    const one = integrate(topOfAtmosphereSpectrum(5778, 1, 1));
    const two = integrate(topOfAtmosphereSpectrum(5778, 1, 2));
    expect(two).toBeCloseTo(one / 4, 1);
  });
});

describe('the sky takes its cut', () => {
  it('eats the blue end hardest — Rayleigh is the lambda^-4 that makes a sky blue', () => {
    const s = derive(earthLike(), { starTempK: 5778, luminositySolar: 1, distanceAU: 1 }, pack)!;
    expect(s).toBeTruthy();
    expect(at(s.transmission, 400)).toBeLessThan(at(s.transmission, 700));
    expect(at(s.transmission, 700)).toBeLessThan(at(s.transmission, 1000));
  });

  it('leaves NOTCHES where a gas has a band, and they are the interesting part', () => {
    const s = derive(earthLike(), { starTempK: 5778, luminositySolar: 1, distanceAU: 1 }, pack)!;
    // Water's 940 nm band against its neighbours: a hole in an otherwise smooth curve.
    expect(at(s.transmission, 940)).toBeLessThan(at(s.transmission, 870));
    expect(at(s.transmission, 940)).toBeLessThan(at(s.transmission, 1020));
    expect(s.attenuators.length).toBeGreaterThan(0);
  });

  it('scales with COLUMN DENSITY, so a thicker sky transmits less', () => {
    const thin = derive(earthLike({ atmosphere: { pressure_bar: 0.006, molarMassKg: 0.044, composition: { CO2: 0.95, N2: 0.05 } } } as any), { starTempK: 5778, luminositySolar: 1, distanceAU: 1.52 }, pack)!;
    const thick = derive(earthLike({ atmosphere: { pressure_bar: 92, molarMassKg: 0.044, composition: { CO2: 0.96, N2: 0.035 } } } as any), { starTempK: 5778, luminositySolar: 1, distanceAU: 0.72 }, pack)!;
    expect(at(thin.transmission, 450)).toBeGreaterThan(0.9);
    expect(at(thick.transmission, 450)).toBeLessThan(0.01);
  });

  it('names the LEVEL, and calls a gas giant 1 bar rather than a surface', () => {
    const rocky = derive(earthLike(), { starTempK: 5778, luminositySolar: 1, distanceAU: 1 }, pack)!;
    const giant = derive(mk({ makeup: { gas: 0.9, ice: 0.1 } }), { starTempK: 5778, luminositySolar: 1, distanceAU: 5.2 }, pack)!;
    expect(rocky.level).toBe('surface');
    expect(giant.level).toBe('1 bar');
  });

  it('an airless world transmits everything', () => {
    const s = derive(mk({}), { starTempK: 5778, luminositySolar: 1, distanceAU: 1 }, pack)!;
    for (const t of s.transmission) expect(t).toBeCloseTo(1, 6);
    expect(s.totalSurfaceWm2).toBeCloseTo(s.totalTopWm2, 3);
  });

  it('a cloud deck is GREY, and it never takes the ground to pitch black', () => {
    const clouded = derive(
      earthLike({ tags: [{ key: 'structure/cloud-deck', value: 'water:overcast' }] } as any),
      { starTempK: 5778, luminositySolar: 1, distanceAU: 1 }, pack)!;
    const clear = derive(earthLike(), { starTempK: 5778, luminositySolar: 1, distanceAU: 1 }, pack)!;
    expect(clouded.totalSurfaceWm2).toBeLessThan(clear.totalSurfaceWm2);
    expect(clouded.totalSurfaceWm2).toBeGreaterThan(0);
    // Grey: the deck scales every band by the same factor, so the SHAPE is unchanged.
    const r1 = at(clouded.transmission, 450) / at(clear.transmission, 450);
    const r2 = at(clouded.transmission, 900) / at(clear.transmission, 900);
    expect(r1).toBeCloseTo(r2, 6);
  });
});

describe('the peak moves as the light is filtered', () => {
  it('reddens the peak under a thick Rayleigh sky', () => {
    const s = derive(
      earthLike({ atmosphere: { pressure_bar: 20, molarMassKg: 0.028, composition: { N2: 1 } } } as any),
      { starTempK: 5778, luminositySolar: 1, distanceAU: 1 }, pack)!;
    expect(s.peakSurfaceNm).toBeGreaterThan(s.peakTopNm);
  });

  it('reports the star as it is and the ground as it is — two different peaks, both named', () => {
    const s = derive(earthLike(), { starTempK: 3200, luminositySolar: 0.02, distanceAU: 0.1 }, pack)!;
    expect(peakNm(s.topOfAtmosphere)).toBe(s.peakTopNm);
    expect(peakNm(s.surface)).toBe(s.peakSurfaceNm);
  });
});

describe('refuses to answer where it has no inputs', () => {
  it('returns undefined without a star', () => {
    expect(derive(earthLike(), { starTempK: 0, luminositySolar: 1, distanceAU: 1 }, pack)).toBeUndefined();
    expect(derive(earthLike(), { starTempK: 5778, luminositySolar: 0, distanceAU: 1 }, pack)).toBeUndefined();
    expect(derive(earthLike(), { starTempK: 5778, luminositySolar: 1, distanceAU: 0 }, pack)).toBeUndefined();
  });
});
