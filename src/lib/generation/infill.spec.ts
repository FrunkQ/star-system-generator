import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { infillSystem, GENERATED_TAG } from './infill';
import type { RulePack, System, CelestialBody } from '$lib/types';
import { SOLAR_MASS_KG, SOLAR_RADIUS_KM, EARTH_MASS_KG, EARTH_RADIUS_KM } from '../constants';

/**
 * ONE INFILL for every importer. Pins the three owner rules: imported worlds are truth (never moved,
 * never crowded); the imported star is truth (fed as current state, its generated twin discarded);
 * the same four dials with the same meaning. Plus the Traveller need — a hard count that never
 * counts moons — and multi-star.
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

const star = (id: string, mSolar: number, tempK: number, rSolar: number, cls: string): CelestialBody => ({
  id, name: id, kind: 'body', roleHint: 'star', classes: [cls], tags: [],
  massKg: mSolar * SOLAR_MASS_KG, radiusKm: rSolar * SOLAR_RADIUS_KM, temperatureK: tempK,
  radiationOutput: rSolar * rSolar * Math.pow(tempK / 5778, 4),
} as unknown as CelestialBody);
const planet = (id: string, hostId: string, aAU: number, mEarth: number, name?: string): CelestialBody => ({
  id, name: name ?? id, kind: 'body', roleHint: 'planet', parentId: hostId, classes: ['planet/terrestrial'], tags: [],
  massKg: mEarth * EARTH_MASS_KG, radiusKm: EARTH_RADIUS_KM * Math.cbrt(mEarth),
  orbit: { hostId, hostMu: 1, elements: { a_AU: aAU, e: 0.02, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } },
} as unknown as CelestialBody);
const sys = (nodes: CelestialBody[], age = 4.6): System => ({
  id: 'sys', name: 'Test', seed: 'test-seed', epochT0: 0, age_Gyr: age, nodes: [...nodes],
  rulePackId: '', rulePackVersion: '', tags: [],
} as unknown as System);
const planetsOf = (s: System, hostId?: string) => s.nodes.filter((n: any) => n.roleHint === 'planet' && (!hostId || n.parentId === hostId)) as CelestialBody[];

describe('infillSystem', () => {
  it('adds worlds around a lone star and tags every one of them origin/generated', () => {
    const p = pack();
    const s = sys([star('sun', 1, 5778, 1, 'star/G')]);
    const r = infillSystem(s, p, { knobs: { diskMass: 0.7 } });
    expect(r.noStar).toBe(false);
    expect(r.addedPlanets).toBeGreaterThan(0);
    for (const n of s.nodes) {
      if (n.id === 'sun') continue;
      expect((n as any).tags.some((t: any) => t.key === GENERATED_TAG), `${n.name} untagged`).toBe(true);
    }
  });

  it('IMPORTED WORLDS ARE TRUTH: anchors are untouched, and nothing generated crowds them', () => {
    const p = pack();
    const anchor = planet('earth', 'sun', 1.0, 1.0, 'Test b');
    const before = JSON.stringify(anchor);
    const s = sys([star('sun', 1, 5778, 1, 'star/G'), anchor]);
    const r = infillSystem(s, p, { knobs: { diskMass: 1 } });
    // the anchor is byte-identical
    const after = s.nodes.find((n) => n.id === 'earth');
    expect(JSON.stringify(after)).toBe(before);
    // nothing new sits within the exclusion of it
    const excl = (p as any).generation_parameters.infill_anchor_exclusion_hill_radii;
    for (const g of planetsOf(s, 'sun').filter((x) => x.id !== 'earth')) {
      const a1 = g.orbit!.elements.a_AU, a2 = 1.0;
      const rh = Math.cbrt(((g.massKg ?? 0) + anchor.massKg!) / (3 * SOLAR_MASS_KG)) * ((a1 + a2) / 2);
      expect(Math.abs(a1 - a2)).toBeGreaterThanOrEqual(excl * rh);
    }
    expect(r.addedPlanets + r.droppedNearAnchors).toBeGreaterThan(0);
  });

  it('THE IMPORTED STAR IS TRUTH: new worlds are re-parented onto it, and its generated twin is discarded', () => {
    const p = pack();
    const s = sys([star('sun', 1, 5778, 1, 'star/G')]);
    infillSystem(s, p, {});
    const stars = s.nodes.filter((n: any) => n.roleHint === 'star');
    expect(stars.length).toBe(1);
    expect(stars[0].id).toBe('sun');
    for (const g of planetsOf(s)) { expect(g.parentId).toBe('sun'); expect(g.orbit!.hostId).toBe('sun'); }
  });

  it('is deterministic for a given system seed', () => {
    const p = pack();
    const a = sys([star('sun', 1, 5778, 1, 'star/G')]); infillSystem(a, p, {});
    const b = sys([star('sun', 1, 5778, 1, 'star/G')]); infillSystem(b, p, {});
    expect(planetsOf(a).map((x) => [x.name, x.orbit!.elements.a_AU])).toEqual(planetsOf(b).map((x) => [x.name, x.orbit!.elements.a_AU]));
  });

  it('continues the letter sequence after the imported ones', () => {
    const p = pack();
    const s = sys([star('sun', 1, 5778, 1, 'star/G'), planet('x', 'sun', 0.7, 1, 'Test b'), planet('y', 'sun', 1.5, 1, 'Test c')]);
    infillSystem(s, p, { knobs: { diskMass: 1 } });
    const names = planetsOf(s).filter((x) => x.id !== 'x' && x.id !== 'y').map((x) => x.name);
    for (const n of names) { expect(n).not.toMatch(/ b$/); expect(n).not.toMatch(/ c$/); expect(n).toMatch(/^Test [d-z]$/); }
  });

  it('a HARD planet count stops at the target and NEVER counts moons (Traveller W)', () => {
    const p = pack();
    const s = sys([star('sun', 1, 5778, 1, 'star/G'), planet('main', 'sun', 1.0, 1, 'Test b')]);
    const r = infillSystem(s, p, { knobs: { diskMass: 1 }, targetPlanetCount: 4 });
    expect(planetsOf(s).length).toBeLessThanOrEqual(4);
    // moons may be any number
    expect(r.addedMoons).toBeGreaterThanOrEqual(0);
    if (planetsOf(s).length < 4) expect(r.underTarget).toBe(true);
  });

  it('a target already met adds nothing', () => {
    const p = pack();
    const s = sys([star('sun', 1, 5778, 1, 'star/G'), planet('a', 'sun', 0.5, 1), planet('b', 'sun', 1, 1)]);
    const r = infillSystem(s, p, { targetPlanetCount: 2 });
    expect(r.addedPlanets).toBe(0);
    expect(planetsOf(s).length).toBe(2);
  });

  it('with no luminous star it says so and generates nothing', () => {
    // The Hystrine case: a Universe Sandbox export with no star in it at all.
    const p = pack();
    const s = sys([planet('giant', 'nothing', 5, 300)]);
    const r = infillSystem(s, p, {});
    expect(r.noStar).toBe(true);
    expect(r.addedPlanets).toBe(0);
  });

  it('the dials mean the same as in the wizard: more disk mass, more worlds', () => {
    const p = pack();
    let sparse = 0, massive = 0;
    for (let i = 0; i < 6; i++) {
      const a = sys([star('sun', 1, 5778, 1, 'star/G')]); a.seed = `s-${i}`; sparse += infillSystem(a, p, { knobs: { diskMass: 0 } }).addedPlanets;
      const b = sys([star('sun', 1, 5778, 1, 'star/G')]); b.seed = `s-${i}`; massive += infillSystem(b, p, { knobs: { diskMass: 1 } }).addedPlanets;
    }
    expect(massive).toBeGreaterThan(sparse);
  });

  it('MULTI-STAR: worlds are generated round each star and re-parented onto the RIGHT one by mass, not by order', () => {
    // Imported in the "wrong" order (light star first) to prove the join is by mass. The generator's
    // planner sorts by mass, so a positional join would put the heavy star's worlds on the light one.
    const p = pack();
    const light = star('light', 0.5, 3800, 0.5, 'star/M');
    const heavy = star('heavy', 1.2, 6200, 1.2, 'star/F');
    const s = sys([light, heavy]);
    const r = infillSystem(s, p, { knobs: { diskMass: 1 } });
    expect(r.addedPlanets).toBeGreaterThan(0);
    const stars = s.nodes.filter((n: any) => n.roleHint === 'star');
    expect(stars.length).toBe(2);   // no generated stars leaked in
    const heavyKids = planetsOf(s, 'heavy'), lightKids = planetsOf(s, 'light');
    // the more massive, brighter star's worlds sit FURTHER OUT (its zones are wider); if the join were
    // wrong the light star would carry the wide system.
    if (heavyKids.length && lightKids.length) {
      const med = (xs: CelestialBody[]) => xs.map((x) => x.orbit!.elements.a_AU).sort((a, b) => a - b)[Math.floor(xs.length / 2)];
      expect(med(heavyKids)).toBeGreaterThan(med(lightKids) * 0.8);
    }
  });
});
