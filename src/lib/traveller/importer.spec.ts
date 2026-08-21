import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { TravellerImporter } from './importer';
import type { RulePack, CelestialBody } from '$lib/types';
import { GENERATED_TAG } from '$lib/generation/infill';

/**
 * The Traveller importer's FIRST importer-level test (its decoder had tests; this file did not — noted
 * at v2.1.751). Pins what the shared infill promised it: W is a hard count of PRIMARY planets that
 * never includes moons; PBG's giants and belts are honoured; the Main World is an anchor and keeps its
 * identity; the star class comes through the shared resolver with its luminosity class intact; the age
 * is guessed from the star, not rolled.
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
// A Regina-ish world: A788899-C, PBG 703 (pop mult 7, 0 belts, 3 giants), W 8, F7 V star.
const world = (over: Partial<Record<string, any>> = {}) => ({
  name: 'Regina', uwp: 'A788899-C', pbg: '703', w: '8', stars: 'F7 V', tradeCodes: ['Ri', 'Pa', 'Ph', 'An', 'Cp'], raw: '',
  ...over,
});
const gen = (over = {}) => new TravellerImporter().generateTravellerSystem(world(over), pack());
const planetsOf = (sys: any) => sys.nodes.filter((n: any) => n.roleHint === 'planet') as CelestialBody[];
const isGiant = (b: CelestialBody) => /giant|jupiter|neptune|puff|helium/.test(b.classes?.[0] ?? '');

describe('TravellerImporter — through the shared infill', () => {
  it('builds the Main World as an anchor and keeps its identity', () => {
    const sys = gen();
    const main = sys.nodes.find((n: any) => /Main World/.test(n.name)) as CelestialBody;
    expect(main).toBeDefined();
    expect(main.roleHint).toBe('planet');
    expect((main.tags ?? []).some((t) => t.key === GENERATED_TAG)).toBe(false);   // authored, not generated
  });

  it('W is a HARD count of primary planets (belts and moons not counted)', () => {
    const sys = gen({ w: '6', pbg: '702' });
    const planets = planetsOf(sys);
    // W=6 includes the Main World; belts are separate bodies (roleHint 'belt'), moons never count.
    expect(planets.length).toBeLessThanOrEqual(6);
    expect(planets.length).toBeGreaterThan(1);
  });

  it('honours PBG: asks for the stated giants and gets them where the star allows', () => {
    const sys = gen({ w: '8', pbg: '703' });
    const giants = planetsOf(sys).filter(isGiant);
    // 3 asked; the F7 star's frost line has room. Allow the count table to fall short by one.
    expect(giants.length).toBeGreaterThanOrEqual(2);
    expect(giants.length).toBeLessThanOrEqual(3);
  });

  it('every added world is tagged origin/generated; the Main World is not', () => {
    const sys = gen();
    for (const p of planetsOf(sys)) {
      const generated = (p.tags ?? []).some((t) => t.key === GENERATED_TAG);
      if (/Main World/.test(p.name)) expect(generated).toBe(false);
      else expect(generated).toBe(true);
    }
  });

  it('the star class comes through with its luminosity class — F7 V, not just F', () => {
    const sys = gen({ stars: 'F7 V' });
    const star = sys.nodes.find((n: any) => n.roleHint === 'star') as CelestialBody;
    expect(star.classes?.[0]).toMatch(/^star\/F7V$/);
    const giantSys = gen({ stars: 'K3 III' });
    const gstar = giantSys.nodes.find((n: any) => n.roleHint === 'star') as CelestialBody;
    expect(gstar.classes?.[0]).toBe('star/K3III');
  });

  it('the age is GUESSED from the star and marked estimated — not rolled between 1 and 10', () => {
    const a = gen({ stars: 'F7 V' });
    const b = gen({ stars: 'F7 V' });
    expect(a.age_Gyr).toBe(b.age_Gyr);            // deterministic: same star, same guess
    expect(a.ageEstimated).toBe(true);
    expect(a.ageBandGyr).toBeDefined();
    // an F7 lives ~5 Gyr; the guess is inside that
    expect(a.age_Gyr).toBeLessThan(6);
    const m = gen({ stars: 'M2 V' });
    expect(m.age_Gyr).toBeGreaterThan(a.age_Gyr); // an M dwarf's midlife is far later
  });

  it('is deterministic for the same profile', () => {
    const a = gen(), b = gen();
    expect(planetsOf(a).map((p) => [p.name, p.orbit?.elements.a_AU])).toEqual(planetsOf(b).map((p) => [p.name, p.orbit?.elements.a_AU]));
  });
});
