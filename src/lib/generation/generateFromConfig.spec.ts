import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { generateSystemFromConfig } from './generateFromConfig';
import type { RulePack } from '$lib/types';
import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '../constants';
import type { StarSeed } from '../physics/stellar-evolution';

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
const sun = (): StarSeed => ({ id: 's', temperatureK: 5778, luminositySolar: 1, massKg: SOLAR_MASS_KG, radiusKm: SOLAR_RADIUS_KM, spectralClass: 'G', category: 'Main Sequence', luminosityClass: 'V', isRemnant: false, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } });

describe('generateSystemFromConfig', () => {
  it('a single Sun-like star at 4.6 Gyr produces a G star with planets', () => {
    const sys = generateSystemFromConfig('t1', pack(), { seeds: [sun()], ageGyr: 4.6 });
    const star = sys.nodes.find((n: any) => n.roleHint === 'star') as any;
    expect(star.classes[0]).toBe('star/G');
    expect(sys.nodes.filter((n: any) => n.roleHint === 'planet').length).toBeGreaterThan(0);
    expect(sys.age_Gyr).toBe(4.6);
  });

  it('"stars only" creates the star and no planets', () => {
    const sys = generateSystemFromConfig('t2', pack(), { seeds: [sun()], ageGyr: 4.6, emptyPlanets: true });
    expect(sys.nodes.filter((n: any) => n.roleHint === 'planet').length).toBe(0);
    expect(sys.nodes.some((n: any) => n.roleHint === 'star')).toBe(true);
  });

  it('aging a Sun to 13.5 Gyr yields a white-dwarf host', () => {
    const sys = generateSystemFromConfig('t3', pack(), { seeds: [sun()], ageGyr: 13.5, emptyPlanets: true });
    const star = sys.nodes.find((n: any) => n.roleHint === 'star') as any;
    expect(star.classes[0]).toBe('star/WD');
  });

  it('knobs bias the draw: high disk-mass → more worlds than sparse', () => {
    const many = generateSystemFromConfig('k1', pack(), { seeds: [sun()], ageGyr: 4.6, knobs: { diskMass: 1 } });
    const few = generateSystemFromConfig('k1', pack(), { seeds: [sun()], ageGyr: 4.6, knobs: { diskMass: 0 } });
    const count = (s: any) => s.nodes.filter((n: any) => n.roleHint === 'planet').length;
    expect(count(many)).toBeGreaterThanOrEqual(count(few));
  });

  it('violent dynamical history → eccentric orbits', () => {
    const calm = generateSystemFromConfig('k2-planets', pack(), { seeds: [sun()], ageGyr: 4.6, knobs: { dynamicalHistory: 0, diskMass: 1 } });
    const wild = generateSystemFromConfig('k2-planets', pack(), { seeds: [sun()], ageGyr: 4.6, knobs: { dynamicalHistory: 1, diskMass: 1 } });
    const maxE = (s: any) => Math.max(0, ...s.nodes.filter((n: any) => n.roleHint === 'planet').map((n: any) => n.orbit?.elements?.e ?? 0));
    expect(calm.nodes.filter((n: any) => n.roleHint === 'planet').length).toBeGreaterThan(0); // sanity
    expect(maxE(wild)).toBeGreaterThan(maxE(calm));
  });

  it('two stars produce a binary (barycentre + two stars)', () => {
    const sys = generateSystemFromConfig('t4', pack(), { seeds: [sun(), { ...sun(), id: 'b', massKg: 0.6 * SOLAR_MASS_KG, luminositySolar: 0.1, temperatureK: 4000 }], ageGyr: 4.6, emptyPlanets: true });
    expect(sys.nodes.some((n: any) => n.kind === 'barycenter')).toBe(true);
    expect(sys.nodes.filter((n: any) => n.roleHint === 'star').length).toBe(2);
  });

  it('FOUR stars are all kept and nested into a barycentre hierarchy (no stars dropped)', () => {
    const s = (id: string, m: number) => ({ ...sun(), id, massKg: m * SOLAR_MASS_KG, luminositySolar: m * m * m });
    const sys = generateSystemFromConfig('t5', pack(), { seeds: [s('a', 1), s('b', 0.8), s('c', 0.5), s('d', 0.3)], ageGyr: 4.6, emptyPlanets: true });
    const stars = sys.nodes.filter((n: any) => n.roleHint === 'star');
    const barys = sys.nodes.filter((n: any) => n.kind === 'barycenter');
    expect(stars.length).toBe(4);                         // none dropped (was the bug: 4 → 2)
    expect(barys.length).toBe(3);                         // ((A·B)·(C·D)) → two pairs + a root
    expect(barys.filter((b: any) => !b.parentId).length).toBe(1);   // exactly one root
    expect(barys.filter((b: any) => b.parentId).length).toBe(2);    // two nested under it
    // every star sits under a barycentre, with an orbit
    expect(stars.every((st: any) => st.parentId && st.orbit?.elements?.a_AU > 0)).toBe(true);
  });

  it('a multi-star system gives each star its own planets AND circumbinary planets', () => {
    const s = (id: string, m: number, t: number, l: number) => ({ ...sun(), id, massKg: m * SOLAR_MASS_KG, temperatureK: t, luminositySolar: l });
    const sys = generateSystemFromConfig('t6', pack(), { seeds: [s('a', 1, 5778, 1), s('b', 0.8, 5000, 0.4), s('c', 0.5, 3800, 0.05), s('d', 0.3, 3200, 0.01)], ageGyr: 4.6, knobs: { diskMass: 1 } });
    const byId = new Map(sys.nodes.map((n: any) => [n.id, n]));
    const planets = sys.nodes.filter((n: any) => n.roleHint === 'planet');
    const aroundStar = planets.filter((p: any) => byId.get(p.parentId)?.roleHint === 'star');
    const circumbinary = planets.filter((p: any) => byId.get(p.parentId)?.kind === 'barycenter');
    expect(aroundStar.length).toBeGreaterThan(0);     // S-type: a system per star
    expect(circumbinary.length).toBeGreaterThan(0);   // P-type: distant orbits around a pair
  });
});
