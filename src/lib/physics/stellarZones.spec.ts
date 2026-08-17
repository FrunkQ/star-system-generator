import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { calculateAllStellarZones, calculateRocheLimit } from './zones';
import type { RulePack, CelestialBody } from '$lib/types';
import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '../constants';

/**
 * DO THE ZONES WORK WIDER THAN THE SOLAR SYSTEM?
 *
 * Every condensation line comes from one place — `getDistanceForTemperature`, which inverts the
 * equilibrium-temperature relation to `a = R_star (T_star / T_eq)^2 / 2`. That is luminosity-correct
 * (R^2 T^4 is L, and a goes as sqrt(L)), so the lines scale properly by construction. What this file
 * pins is that they STAY correct and ordered across the whole catalogue, because the engine places
 * planets around O supergiants and Y dwarfs, not just around Sol — a range of about ten orders of
 * magnitude in luminosity.
 *
 * Written after [[B80]], where a frost line derived from stellar MASS looked right for the Sun and
 * was 43x wrong for an L dwarf. The lesson recorded here as a test: CHECK THE ENDS, NOT THE MIDDLE.
 */

function deepMerge(t: any, s: any): any {
  if (typeof t !== 'object' || t === null || Array.isArray(t)) return s;
  const out = { ...t };
  for (const k of Object.keys(s || {})) out[k] = (k in out) ? deepMerge(out[k], s[k]) : s[k];
  return out;
}
function pack(): RulePack {
  const base = path.resolve('static/rulepacks/starter-sf');
  let p: any = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8'));
  for (const f of ['stars.json', 'planets.json', 'generation.json', 'orbital_constants.json',
    'classification.json', 'atmospheres.json', 'liquids.json']) {
    const fp = path.join(base, f); if (fs.existsSync(fp)) p = deepMerge(p, JSON.parse(fs.readFileSync(fp, 'utf-8')));
  }
  return p as RulePack;
}

// The catalogue's real span, ends included. [name, M/Msun, T_eff K, R/Rsun, class]
const STARS: Array<[string, number, number, number, string]> = [
  ['O5V', 40, 42000, 12, 'star/O'],
  ['B2V', 10, 21000, 5.2, 'star/B'],
  ['A0V', 2.4, 9600, 1.8, 'star/A'],
  ['F5V', 1.3, 6600, 1.3, 'star/F'],
  ['Sol G2V', 1.0, 5778, 1.0, 'star/G'],
  ['K5V', 0.68, 4400, 0.66, 'star/K'],
  ['M2V', 0.44, 3500, 0.44, 'star/M'],
  ['M8V (TRAPPIST-1)', 0.0898, 2566, 0.1192, 'star/M'],
  ['L5 dwarf', 0.075, 1600, 0.10, 'star/L'],
  ['T5 dwarf', 0.045, 1100, 0.095, 'star/T'],
  ['Y1 dwarf', 0.020, 400, 0.09, 'star/Y'],
  ['white dwarf', 0.6, 12000, 0.013, 'star/WD'],
  ['neutron star', 1.4, 600000, 1.7e-5, 'star/NS'],
  ['K-III giant', 1.2, 4300, 25, 'star/K-III'],
  ['M-I supergiant', 15, 3500, 900, 'star/M-I'],
];

const mk = ([, m, t, r, cls]: any): CelestialBody => ({
  id: 's', name: 's', kind: 'body', roleHint: 'star', classes: [cls],
  massKg: m * SOLAR_MASS_KG, radiusKm: r * SOLAR_RADIUS_KM, temperatureK: t,
} as unknown as CelestialBody);

describe('stellar zones hold across the whole catalogue, not just around Sol', () => {
  it('every condensation line is finite and positive for every class', () => {
    const p = pack();
    for (const s of STARS) {
      const z = calculateAllStellarZones(mk(s), p);
      for (const key of ['silicateLine', 'sootLine', 'formationFrostLine', 'currentFrostLine', 'co2IceLine', 'coIceLine', 'systemLimitAu']) {
        expect(Number.isFinite(z[key]), `${s[0]} ${key} = ${z[key]}`).toBe(true);
        expect(z[key], `${s[0]} ${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('the lines stay in temperature order — hotter condensate always closer in', () => {
    // silicate (1400 K) < soot (500) < formation frost (170) < frost (125) < CO2 (70) < CO (30).
    // An inversion anywhere means a line stopped tracking luminosity and started tracking something
    // else, which is exactly how the mass-based frost line went unnoticed.
    const p = pack();
    for (const s of STARS) {
      const z = calculateAllStellarZones(mk(s), p);
      const seq: Array<[string, number]> = [
        ['silicate', z.silicateLine], ['soot', z.sootLine], ['formationFrost', z.formationFrostLine],
        ['frost', z.currentFrostLine], ['co2', z.co2IceLine], ['co', z.coIceLine],
      ];
      for (let i = 1; i < seq.length; i++) {
        expect(seq[i][1], `${s[0]}: ${seq[i][0]} must sit beyond ${seq[i - 1][0]}`).toBeGreaterThan(seq[i - 1][1]);
      }
      expect(z.systemLimitAu).toBeGreaterThan(z.coIceLine);
    }
  });

  it('the habitable zone is ordered and sits inside the system', () => {
    const p = pack();
    for (const s of STARS) {
      const z = calculateAllStellarZones(mk(s), p);
      expect(z.goldilocks.inner, `${s[0]} HZ inner`).toBeGreaterThan(0);
      expect(z.goldilocks.outer, `${s[0]} HZ outer`).toBeGreaterThan(z.goldilocks.inner);
      expect(z.goldilocks.outer, `${s[0]} HZ beyond system limit`).toBeLessThan(z.systemLimitAu);
    }
  });

  it('the lines track LUMINOSITY, so equal-mass stars of different brightness differ', () => {
    // The single assertion that no mass-based formula can pass.
    const p = pack();
    const dwarf = mk(['', 1.0, 5778, 1.0, 'star/G']);
    const giant = mk(['', 1.0, 4500, 20, 'star/K-III']);
    const zd = calculateAllStellarZones(dwarf, p), zg = calculateAllStellarZones(giant, p);
    for (const key of ['silicateLine', 'formationFrostLine', 'currentFrostLine']) {
      expect(zg[key] / zd[key], `${key} must scale with brightness`).toBeGreaterThan(5);
    }
  });

  it('luminosity scaling is the SAME power for every line — sqrt(L)', () => {
    // Doubling the radius quadruples L and so must move every line by exactly 2x. If one line drifts
    // from that, it has picked up a term that is not luminosity.
    const p = pack();
    const a = calculateAllStellarZones(mk(['', 1, 5778, 1, 'star/G']), p);
    const b = calculateAllStellarZones(mk(['', 1, 5778, 2, 'star/G']), p);
    for (const key of ['silicateLine', 'sootLine', 'formationFrostLine', 'currentFrostLine', 'co2IceLine', 'coIceLine']) {
      expect(b[key] / a[key], `${key} scaling`).toBeCloseTo(2, 5);
    }
  });

  it('the Roche limit is a DENSITY question, so a compact remnant differs hugely from 2.44 R', () => {
    // `2.44 * R_star` — the fluid coefficient with the density ratio dropped — was used as a Roche
    // limit in the placement code. It is not one, and the difference is not cosmetic at the ends.
    const ns = mk(['', 1.4, 600000, 1.7e-5, 'star/NS']);
    const sg = mk(['', 15, 3500, 900, 'star/M-I']);
    const naive = (s: CelestialBody) => (s.radiusKm! * 2.44) / 149597870.7;
    expect(calculateRocheLimit(ns) / naive(ns)).toBeGreaterThan(1000);   // measured ~26,000x
    expect(naive(sg) / calculateRocheLimit(sg)).toBeGreaterThan(100);    // measured ~900x
    for (const s of STARS) expect(calculateRocheLimit(mk(s))).toBeGreaterThan(0);
  });
});

describe('the kill zone still reads a STORED value', () => {
  it('killZone and dangerZone move with radiationOutput, which is pack data that has drifted', () => {
    // NOT a fix — a pin, so the coupling cannot be forgotten. Every condensation line derives
    // luminosity from radius and temperature, but calculateKillZone multiplies in the stored
    // `radiationOutput`, which [[B57]] records as having drifted by up to 60,000x from the derived
    // value. So "the zones are all derived" is true of the temperature lines and NOT of this one.
    const p = pack();
    const base = mk(['', 1, 5778, 1, 'star/G']);
    const loud = { ...base, radiationOutput: 1000 } as CelestialBody;
    const z1 = calculateAllStellarZones(base, p), z2 = calculateAllStellarZones(loud, p);
    expect(z2.killZone / z1.killZone).toBeGreaterThan(10);   // measured 31.6x
    expect(z2.dangerZone).toBeGreaterThan(z1.dangerZone);
  });
});
