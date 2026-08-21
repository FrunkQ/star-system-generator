import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { evaporatedVapourFraction, calculateGreenhouseEffect } from './atmosphere';
import { systemProcessor } from '../core/SystemProcessor';
import type { System, RulePack, CelestialBody, Atmosphere } from '../types';

/**
 * Water vapour over an ocean is DERIVED, not authored (inbox D6).
 *
 * The fault this pins: the term used to switch on at exactly 273 K, which put a ~10 K STEP in the
 * thermal fixed point. A world a hair below freezing lost its whole vapour greenhouse, which is what
 * kept it below freezing — a snowball reached by a branch closing rather than by physics. Measured
 * before the fix on a Traveller "Standard - Earth-like" world swept outwards from a G2 V: 0.05 AU
 * took it from +11.0 C to -0.2 C and killed its clouds outright.
 */
function isObject(x: any) { return x && typeof x === 'object' && !Array.isArray(x); }
function deepMerge(t: any, s: any): any {
  const o = { ...t };
  if (isObject(t) && isObject(s)) Object.keys(s).forEach((k) => { o[k] = isObject(s[k]) && k in t ? deepMerge(t[k], s[k]) : s[k]; });
  return o;
}
function loadRulePack(): RulePack {
  const base = path.resolve('static/rulepacks/starter-sf');
  let pack = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8')) as RulePack;
  for (const f of ['liquids.json', 'classification.json', 'atmospheres.json']) {
    const p = path.join(base, f);
    if (fs.existsSync(p)) pack = deepMerge(pack, JSON.parse(fs.readFileSync(p, 'utf-8')));
  }
  return pack;
}
const pack = loadRulePack();
const packGreenhouse = () => (pack.climateModel!.greenhouse!) as any;
const cfg = () => ({
  cryoNoPenaltyAboveK: 200, cryoBaseK: 200, cryoExponent: 3, cryoMinFactor: 0.03,
  responseScale: 205, responseK: 0.03, denseCo2BoostStartBar: 1,
  denseCo2BoostDenominator: 40, denseCo2BoostMax: 1,
  vapourColumnMeanHumidity: packGreenhouse().vapourColumnMeanHumidity,
  vapourColumnMaxFraction: packGreenhouse().vapourColumnMaxFraction
});
const wet = (tempK: number, coverage = 0.71) => ({
  hydrosphere: { composition: 'water', coverage }, temperatureK: tempK
} as unknown as CelestialBody);
const air = (composition: Record<string, number> = {}) =>
  ({ pressure_bar: 1, composition } as unknown as Atmosphere);
// The derivation returns { gas, fraction } or null when the body has no surface liquid at all.
const frac = (body: CelestialBody, atm: Atmosphere, p: number, model: any): number =>
  evaporatedVapourFraction(body, atm, p, model, pack)?.fraction ?? 0;
const gasOf = (body: CelestialBody, atm: Atmosphere, p: number, model: any): string | null =>
  evaporatedVapourFraction(body, atm, p, model, pack)?.gas ?? null;

describe('derived ocean water vapour (D6)', () => {
  it('reproduces Earth: 288 K, 1 bar, 71% ocean gives the ~0.4% Earth actually carries', () => {
    const f = frac(wet(288), air(), 1, cfg());
    expect(f).toBeGreaterThan(0.0035);
    expect(f).toBeLessThan(0.0045);
  });

  it('is CONTINUOUS across freezing — the 273 K step is gone', () => {
    const c = cfg();
    const below = frac(wet(272.5), air(), 1, c);
    const at = frac(wet(273.15), air(), 1, c);
    const above = frac(wet(273.8), air(), 1, c);
    expect(below).toBeGreaterThan(0);                     // not switched off
    expect(at).toBeGreaterThan(below);                    // monotonic
    expect(above).toBeGreaterThan(at);
    expect(Math.abs(at - below) / at).toBeLessThan(0.06); // and SMOOTH: no cliff at the boundary
  });

  it('falls to nothing on a cryogenic world rather than to a threshold', () => {
    expect(frac(wet(150), air(), 1, cfg())).toBeLessThan(1e-6);
    expect(frac(wet(90), air(), 1, cfg())).toBeLessThan(1e-9);
  });

  it('scales with how much of the surface is actually ocean', () => {
    const c = cfg();
    const puddle = frac(wet(288, 0.02), air(), 1, c);
    const ocean = frac(wet(288, 1.0), air(), 1, c);
    expect(puddle).toBeLessThan(ocean);
    expect(puddle / ocean).toBeCloseTo(0.02, 3);
  });

  it('a dry world gets nothing derived', () => {
    expect(frac(wet(288, 0), air(), 1, cfg())).toBe(0);
    const noSea = { hydrosphere: { composition: 'none', coverage: 1 }, temperatureK: 288 } as unknown as CelestialBody;
    expect(frac(noSea, air(), 1, cfg())).toBe(0);
  });

  it('IS NOT WATER-SPECIFIC — a methane sea evaporates methane into its own greenhouse', () => {
    const c = cfg();
    const titan = { hydrosphere: { composition: 'methane', coverage: 0.05 }, temperatureK: 94 } as unknown as CelestialBody;
    expect(gasOf(titan, air(), 1.45, c)).toBe('CH4');
    expect(frac(titan, air(), 1.45, c)).toBeGreaterThan(0);
    // ...and it is the SOLVENT that decides, not the body: the same rock with a water sea gives H2O.
    expect(gasOf(wet(288), air(), 1, c)).toBe('H2O');
  });

  it('an AUTHORED H2O is a floor, never a ceiling and never an off-switch', () => {
    const c = cfg();
    // Cold world, generous authored value: the author's number stands.
    expect(frac(wet(250), air({ H2O: 0.01 }), 1, c)).toBe(0.01);
    // Hot world: evaporation exceeds it and wins.
    expect(frac(wet(330), air({ H2O: 0.01 }), 1, c)).toBeGreaterThan(0.01);
    // No ocean at all: the authored value is all there is.
    const dry = { hydrosphere: { composition: 'water', coverage: 0 }, temperatureK: 288 } as unknown as CelestialBody;
    expect(frac(dry, air({ H2O: 0.004 }), 1, c)).toBe(0.004);
  });

  it('is bounded — a boiling ocean does not run the fraction away', () => {
    const c = cfg();
    const boiling = frac(wet(450, 1), air(), 1, c);
    expect(boiling).toBeLessThanOrEqual(c.vapourColumnMaxFraction);
    expect(boiling).toBeGreaterThan(c.vapourColumnMaxFraction * 0.9);
  });

  it('feeds the greenhouse: an ocean world with no authored vapour is warmer than a dry twin', () => {
    const base = {
      atmosphere: { pressure_bar: 1, composition: { N2: 0.78, O2: 0.21, CO2: 0.0004 } },
      equilibriumTempK: 280, temperatureK: 280
    } as unknown as CelestialBody;
    const dryGh = calculateGreenhouseEffect({ ...base, hydrosphere: { composition: 'water', coverage: 0 } } as any, pack);
    const wetGh = calculateGreenhouseEffect({ ...base, hydrosphere: { composition: 'water', coverage: 0.7 } } as any, pack);
    expect(wetGh).toBeGreaterThan(dryGh);
  });
});

describe('D6 end to end: a wet Traveller-style world no longer snowballs at the freezing line', () => {
  const EARTH = 5.972e24, R_E = 6371;
  const worldAt = (a_AU: number): System => ({
    id: 'sys', name: 'Sys', seed: 'd6', epochT0: 0, age_Gyr: 4.6,
    nodes: [
      { id: 'star', name: 'Star', kind: 'body', parentId: null, roleHint: 'star', massKg: 1.989e30,
        radiusKm: 696340, temperatureK: 5778, radiationOutput: 1, classes: ['star/G'],
        axial_tilt_deg: 0, rotation_period_hours: 600 },
      { id: 'p', name: 'Terra', kind: 'body', parentId: 'star', roleHint: 'planet', massKg: EARTH,
        radiusKm: R_E, axial_tilt_deg: 23, rotation_period_hours: 24,
        makeup: { metal: 0.3, rock: 0.7 }, classes: [], tags: [],
        hydrosphere: { composition: 'water', coverage: 0.7 },
        // The Traveller "Standard - Earth-like" mix: N2/O2/Ar/CO2 and no H2O at all.
        atmosphere: { main: 'N2', pressure_bar: 0.98,
          composition: { N2: 0.785, O2: 0.205, Ar: 0.0095, CO2: 0.0005 } },
        orbit: { hostId: 'star', elements: { a_AU, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } }
    ]
  } as any);
  const solve = (a: number) => {
    const s = systemProcessor.process(worldAt(a), pack);
    return s.nodes.find((n) => n.id === 'p') as CelestialBody;
  };
  const sweep = () => {
    const out: CelestialBody[] = [];
    for (let a = 0.90; a <= 1.65001; a += 0.05) out.push(solve(a));
    return out;
  };

  it('the greenhouse does not fall off a cliff as the world crosses freezing', () => {
    // Step outwards in 0.05 AU and watch the biggest single-step drop in the greenhouse term itself,
    // as a FRACTION of where it started — an absolute threshold would only measure the ordinary
    // 1/sqrt(a) falloff, which is several kelvin a step at the warm end and means nothing.
    // Before the fix: 34.3 K -> 24.2 K in one step, a 29% collapse, at whatever distance crossed
    // 273 K. After: the worst step is about 5%, and it is at the warm end where the sun is nearest.
    const gh = sweep().map((b) => b.greenhouseTempK ?? 0);
    let worstFraction = 0;
    for (let i = 1; i < gh.length; i++) worstFraction = Math.max(worstFraction, (gh[i - 1] - gh[i]) / gh[i - 1]);
    expect(worstFraction).toBeLessThan(0.10);
  });

  it('and it stays monotonic — no farther world is warmer than a nearer one', () => {
    // NOTE what this does NOT claim. The CLOUD deck still switches on and off across a threshold
    // (0.67 cover to 0.00 between 1.10 and 1.15 AU here), which moves the albedo in one step; that
    // is the separate bright-condensate bistability, and it is not what D6 was. It happens to warm
    // rather than cool as the world recedes, so the temperature stays monotonic either way.
    let prev = Infinity;
    for (const b of sweep()) {
      expect(b.temperatureK!).toBeLessThan(prev);
      prev = b.temperatureK!;
    }
  });
});
