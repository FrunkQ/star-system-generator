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

describe('the kill zone DERIVES, like every other zone (B81)', () => {
  const p = pack();
  const sol = () => mk(['', 1, 5778, 1, 'star/G2V']);

  it('is INDEPENDENT of the stored radiationOutput, which B57 records as drifted 60,000x', () => {
    // This assertion is the reverse of the one it replaces. That pin recorded the coupling as a
    // known fault ("measured 31.6x"); the owner decided DERIVE, so the coupling is gone and this
    // pins its absence. Everything now comes from getLuminosity, which is R^2 T^4.
    const base = sol();
    const loud = { ...base, radiationOutput: 1000 } as CelestialBody;
    const quiet = { ...base, radiationOutput: 0.0001 } as CelestialBody;
    const z1 = calculateAllStellarZones(base, p);
    expect(calculateAllStellarZones(loud, p).killZone).toBeCloseTo(z1.killZone, 10);
    expect(calculateAllStellarZones(quiet, p).killZone).toBeCloseTo(z1.killZone, 10);
    expect(calculateAllStellarZones(loud, p).dangerZone).toBeCloseTo(z1.dangerZone, 10);
  });

  it('DOES move with the computed luminosity — a bigger, hotter star has a bigger kill zone', () => {
    const dim = calculateAllStellarZones(mk(['', 0.5, 4000, 1, 'star/K5V']), p).killZone;
    const sun = calculateAllStellarZones(sol(), p).killZone;
    const hot = calculateAllStellarZones(mk(['', 5, 20000, 1, 'star/B2V']), p).killZone;
    expect(dim).toBeLessThan(sun);
    expect(sun).toBeLessThan(hot);
  });

  it('is not decided by how the class is SPELLED — the dead letter switch is gone', () => {
    // The old uvFactor switch tested classes[0].split('/')[1] against 'O','B','A'... so a modern
    // designation ("M4V") matched nothing and fell to 1.0, while a bare band key ("M") matched and
    // got 0.1. Measured before the fix: the same star, 3.2x apart, on spelling alone.
    const band = calculateAllStellarZones(mk(['', 0.2, 3050, 1, 'star/M']), p).killZone;
    const full = calculateAllStellarZones(mk(['', 0.2, 3050, 1, 'star/M4V']), p).killZone;
    expect(band).toBeCloseTo(full, 10);
  });

  it('gives a brown dwarf and a neutron star their OWN answer, not a Sun-like default', () => {
    // The old default of 1.0 handed L, T and Y dwarfs, white dwarfs and neutron stars a solar UV
    // factor — absurd in both directions at once.
    const y = calculateAllStellarZones(mk(['', 0.02, 400, 1, 'star/Y1']), p).killZone;
    const ns = calculateAllStellarZones(mk(['', 1.4, 600000, 1.7e-5, 'star/NS']), p).killZone;
    const sun = calculateAllStellarZones(sol(), p).killZone;
    expect(y).toBeLessThan(sun / 100);        // a Y dwarf emits no damaging UV worth the name
    expect(ns).toBeGreaterThan(y);            // ...and a 600,000 K remnant is not Sun-like either
  });

  it('a cool ACTIVE dwarf is dangerous by the OTHER route — flares, not photospheric UV', () => {
    // The famous argument about M-dwarf habitability, and the reason one letter could never carry
    // this: the photosphere emits nothing, the corona emits plenty, and which one dominates depends
    // on the star's own dynamo.
    const quietM = mk(['', 0.2, 3050, 1, 'star/M4V']);
    const activeM = { ...quietM, flareActivity: 1 } as CelestialBody;
    expect(calculateAllStellarZones(activeM, p).killZone)
      .toBeGreaterThan(calculateAllStellarZones(quietM, p).killZone * 10);
  });

  it('the band edges are PACK DATA — a pack can move the UV damage edge and the anchor', () => {
    const wide = { ...p, generation_parameters: { ...p.generation_parameters, kill_zone_sol_au: 1.0 } } as any;
    expect(calculateAllStellarZones(sol(), wide).killZone)
      .toBeCloseTo(calculateAllStellarZones(sol(), p).killZone * 10, 6);
  });

  it('the danger zone is still the kill zone times the pack multiplier', () => {
    const z = calculateAllStellarZones(sol(), p);
    const mult = (p.generation_parameters as any)?.danger_zone_multiplier ?? 5;
    expect(z.dangerZone).toBeCloseTo(z.killZone * mult, 10);
  });

  it('every class in the range gets a finite, non-negative kill zone', () => {
    for (const s of STARS) {
      const z = calculateAllStellarZones(mk(s), p).killZone;
      expect(Number.isFinite(z), `${s[4]} gave ${z}`).toBe(true);
      expect(z).toBeGreaterThanOrEqual(0);
    }
  });
});
