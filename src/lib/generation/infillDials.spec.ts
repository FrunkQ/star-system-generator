import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TravellerImporter, travellerAgeGuess, parseTravellerStarList } from '$lib/traveller/importer';
import { fillOutSystem } from '$lib/import/realsky/fillout';
import { DEFAULT_KNOBS } from '$lib/components/GenerationDials.svelte';
import type { RulePack, CelestialBody, System } from '$lib/types';

/**
 * WHOEVER CALLS `infillSystem` FROM A UI MOUNTS `GenerationDials` AND PASSES ITS KNOBS (inbox G33).
 *
 * The dials were mounted on one import path of three. The file importer had them; the real-sky
 * catalogue called `infillSystem(system, pack, { seed })` with no knobs, and the Traveller path
 * passed none either — while `importer.ts`'s own comment promised "the panel lets them adjust", of a
 * panel that did not exist there.
 *
 * A UI test cannot live here, so this pins the half that can break silently: the knobs REACH the
 * generator and CHANGE what it makes. A wiring that quietly drops them would leave every assertion
 * below identical.
 */
function deepMerge(t: any, s: any): any {
  if (typeof t !== 'object' || t === null || Array.isArray(t)) return s;
  const out = { ...t };
  for (const k of Object.keys(s || {})) out[k] = (k in out) ? deepMerge(out[k], s[k]) : s[k];
  return out;
}
function loadPack(): RulePack {
  const base = path.resolve('static/rulepacks/starter-sf');
  let p: any = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8'));
  for (const f of ['stars.json', 'planets.json', 'generation.json', 'orbital_constants.json',
    'classification.json', 'atmospheres.json', 'liquids.json']) {
    const fp = path.join(base, f);
    if (fs.existsSync(fp)) p = deepMerge(p, JSON.parse(fs.readFileSync(fp, 'utf-8')));
  }
  return p as RulePack;
}
const pack = loadPack();
const planets = (s: System) => s.nodes.filter((n) => (n as CelestialBody).roleHint === 'planet') as CelestialBody[];

const SPARSE = { ...DEFAULT_KNOBS, diskMass: 0.0 };
const RICH = { ...DEFAULT_KNOBS, diskMass: 1.0 };

describe('the Traveller path passes its dials to infill', () => {
  const world = (over: Record<string, unknown> = {}) => ({
    // W = 8: infill only runs at all when W asks for more worlds than the Main World.
    name: 'Dialsworld', uwp: 'A788899-C', pbg: '703', w: '8', stars: 'G2 V', tradeCodes: [], raw: '', ...over
  });
  const gen = (opts: any) => new TravellerImporter().generateTravellerSystem(world() as any, pack, opts) as System;

  it('the dials reach the generator and change the system it builds', () => {
    // W is a HARD count by design, so the dials cannot move the number of planets here — what they
    // move is WHICH worlds fill those slots. Comparing the type list is the honest assertion; a
    // count comparison would pass or fail for reasons that have nothing to do with the wiring.
    const sparse = planets(gen({ knobs: SPARSE })).map((p) => p.classes?.[0]).join(',');
    const rich = planets(gen({ knobs: RICH })).map((p) => p.classes?.[0]).join(',');
    expect(rich).not.toBe(sparse);
  });

  it('no options at all still works — the batch importer and the specs keep their defaults', () => {
    expect(() => new TravellerImporter().generateTravellerSystem(world() as any, pack)).not.toThrow();
  });

  it('the age dial sets the SYSTEM age, not only the generated bodies', () => {
    // The file-import path binds the slider to system.age_Gyr; this one only passed it to infill, so
    // the card would have shown the star's guess while the slider showed the GM's choice.
    expect(gen({ knobs: DEFAULT_KNOBS, ageGyr: 0.5 }).age_Gyr).toBe(0.5);
    expect(gen({ knobs: DEFAULT_KNOBS, ageGyr: 9 }).age_Gyr).toBe(9);
    // Untouched, it is still the guess from the star, still marked estimated.
    const guessed = gen({ knobs: DEFAULT_KNOBS });
    expect(guessed.ageEstimated).toBe(true);
  });

  it('W of 0 or 1 adds nothing, which is why the panel hides there', () => {
    const none = new TravellerImporter().generateTravellerSystem(world({ w: '0' }) as any, pack) as System;
    expect(planets(none).length).toBe(1);      // the Main World alone
  });
});

describe('the real-sky catalogue path passes its dials to infill', () => {
  const sunLike = (): System => ({
    id: 'rs', name: 'RS', seed: 'rs-seed', epochT0: 0, age_Gyr: 4.6,
    nodes: [{
      id: 'star', name: 'RS', kind: 'body', parentId: null, roleHint: 'star', classes: ['star/G2V'],
      massKg: 1.989e30, radiusKm: 696340, temperatureK: 5778, radiationOutput: 1,
      axial_tilt_deg: 0, rotation_period_hours: 600, tags: []
    }]
  } as any);

  it('disk mass reaches the generator and changes what fill-out adds', () => {
    const sparse = sunLike(); fillOutSystem(sparse, pack, { knobs: SPARSE });
    const rich = sunLike(); fillOutSystem(rich, pack, { knobs: RICH });
    expect(planets(rich).length).toBeGreaterThan(planets(sparse).length);
  });

  it('no options at all still works — the bundled map build and the specs keep their defaults', () => {
    const s = sunLike();
    expect(() => fillOutSystem(s, pack)).not.toThrow();
  });

  it('is still DETERMINISTIC per catalogue slug for the same dials', () => {
    const a = sunLike(); fillOutSystem(a, pack, { knobs: RICH });
    const b = sunLike(); fillOutSystem(b, pack, { knobs: RICH });
    expect(planets(a).map((p) => p.name)).toEqual(planets(b).map((p) => p.name));
  });
});

describe('the age guess the Traveller dials panel draws its slider from', () => {
  it('reads the PRIMARY star as typed, and re-scales with it', () => {
    const m = travellerAgeGuess('M4 V', pack);
    const a = travellerAgeGuess('A2 V', pack);
    // An M dwarf's band runs to the age of the galaxy; a hot A star swells long before that.
    expect(m.bandGyr[1]).toBeGreaterThan(a.bandGyr[1]);
    expect(m.ageGyr).toBeGreaterThan(0);
  });

  it('uses the SAME parser the importer uses, luminosity class and all', () => {
    expect(parseTravellerStarList('F7 V M0 V M4 V', pack)).toEqual(['star/F7V', 'star/M0V', 'star/M4V']);
    // A bare letter resolves to its BAND key (DATA-R18) rather than being pushed through as typed.
    expect(parseTravellerStarList('G', pack)[0]).toBe('star/G');
  });

  it('survives an empty star list rather than throwing in a form that re-runs on every keystroke', () => {
    expect(() => travellerAgeGuess('', pack)).not.toThrow();
    expect(() => travellerAgeGuess(undefined, pack)).not.toThrow();
  });
});
