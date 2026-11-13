// G94 job 2 - the per-body consumers read the body's OWN age, one gate per consumer.
//
// Every gate here is end-to-end through `process()`, because the fault this work exists to fix
// (B150: a brown dwarf whose temperature snapped back) lived in the processor and nowhere else.
// Each carries at least one ABSOLUTE figure, and each was run with its consumer switched back to
// the system's age and seen RED before it was trusted.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
import { setBodyAge, clearBodyAge } from '../physics/bodyAge';
import { ageDriven, ageDrivesSentence, type AgeDriven } from '../physics/ageDrives';
import type { System, RulePack, CelestialBody } from '../types';

function isObject(item: any): boolean { return item && typeof item === 'object' && !Array.isArray(item); }
function deepMerge(target: any, source: any): any {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) output[key] = key in target ? deepMerge(target[key], source[key]) : source[key];
      else output[key] = source[key];
    });
  }
  return output;
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

const SOLAR_MASS_KG = 1.989e30;
const SOLAR_RADIUS_KM = 696340;
const M_JUP_KG = 1.898e27;
const R_E_KM = 6371;
const M_E_KG = 5.972e24;
const EPOCH = Date.UTC(2026, 8, 1, 12);

const orbit = (hostId: string, a_AU: number) =>
  ({ hostId, elements: { a_AU, e: 0.02, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } });

// A G star; THE DWARF FROM THE USER'S REPORT (B150: 0.0352 solar masses, 0.0806 solar radii, a T
// dwarf filed as a star) as its distant companion; the same object filed as a PLANET, with a moon;
// a Jupiter; and an Earth-sized world that erodes its air.
function makeSystem(ageGyr: number): System {
  return {
    id: 'age-test', name: 'Age Test', seed: 'age-test-seed', epochT0: EPOCH, age_Gyr: ageGyr,
    rulePackId: 'starter-sf', rulePackVersion: '1', tags: [],
    nodes: [
      { id: 'star', name: 'Star', kind: 'body', parentId: null, roleHint: 'star', massKg: SOLAR_MASS_KG,
        radiusKm: SOLAR_RADIUS_KM, temperatureK: 5778, radiationOutput: 1, classes: ['star/G'], axial_tilt_deg: 0,
        rotation_period_hours: 600, tags: [] },
      // A red dwarf companion: the kind of star whose flaring is all about how young it is.
      { id: 'red', name: 'Red', kind: 'body', parentId: 'star', roleHint: 'star', classes: ['star/M'],
        massKg: 0.3 * SOLAR_MASS_KG, radiusKm: 0.32 * SOLAR_RADIUS_KM, temperatureK: 3400, radiationOutput: 0.012,
        tags: [], orbit: orbit('star', 900) },
      { id: 'dwarf', name: 'Dwarf', kind: 'body', parentId: 'star', roleHint: 'star', classes: ['star/T'],
        massKg: 0.0352 * SOLAR_MASS_KG, radiusKm: 0.0806 * SOLAR_RADIUS_KM, temperatureK: 914, tags: [],
        orbit: orbit('star', 400) },
      { id: 'planemo', name: 'Planemo', kind: 'body', parentId: 'star', roleHint: 'planet', classes: [],
        massKg: 0.0352 * SOLAR_MASS_KG, radiusKm: 0.0806 * SOLAR_RADIUS_KM, makeup: { gas: 0.95, ice: 0.05 },
        axial_tilt_deg: 0, rotation_period_hours: 10, tags: [], orbit: orbit('star', 40) },
      { id: 'moon', name: 'Moon', kind: 'body', parentId: 'planemo', roleHint: 'moon', classes: [],
        massKg: 0.02 * M_E_KG, radiusKm: 0.35 * R_E_KM, makeup: { rock: 0.6, ice: 0.4 }, axial_tilt_deg: 0,
        rotation_period_hours: 100, tags: [], orbit: orbit('planemo', 0.003) },
      { id: 'jove', name: 'Jove', kind: 'body', parentId: 'star', roleHint: 'planet', classes: [],
        massKg: 1 * M_JUP_KG, radiusKm: 10.97 * R_E_KM, makeup: { gas: 0.95, ice: 0.05 }, axial_tilt_deg: 3,
        atmosphere: { name: 'Hydrogen', pressure_bar: 1, composition: { H2: 0.86, He: 0.13, CH4: 0.01 } },
        rotation_period_hours: 10, tags: [], orbit: orbit('star', 5.2) },
      // A Mars: light enough for the stellar wind to bite, and opted in to losing its air over time.
      { id: 'ares', name: 'Ares', kind: 'body', parentId: 'star', roleHint: 'planet', classes: [],
        massKg: 0.107 * M_E_KG, radiusKm: 0.532 * R_E_KM, makeup: { rock: 0.75, metal: 0.25 }, axial_tilt_deg: 25,
        rotation_period_hours: 24.6, tags: [], evolveAtmosphere: true,
        atmosphere: { name: 'Carbon dioxide', pressure_bar: 1, composition: { CO2: 0.95, N2: 0.05 } },
        orbit: orbit('star', 1.52) }
    ]
  } as any;
}
const node = (s: System, id: string) => s.nodes.find((n) => n.id === id) as CelestialBody;
const aged = (s: System, id: string, ageGyr: number): System => { setBodyAge(node(s, id), ageGyr, s); return s; };

describe('G94 - process() never gives a body an age it was not given', () => {
  const pack = loadRulePack();
  it('no node gains a formation time from being processed, however often', () => {
    let s = systemProcessor.process(makeSystem(4.6), pack);
    s = systemProcessor.process(s, pack);
    for (const n of s.nodes) expect('formationTimeGyr' in n, n.id).toBe(false);
  });
  it('...and one that was given a formation time keeps exactly that', () => {
    const before = aged(makeSystem(4.6), 'dwarf', 9);
    const t = node(before, 'dwarf').formationTimeGyr;
    const after = systemProcessor.process(systemProcessor.process(before, pack), pack);
    expect(node(after, 'dwarf').formationTimeGyr).toBe(t);
  });
});

describe('G94 / B150 - a brown dwarf cools on its OWN age', () => {
  const pack = loadRulePack();
  const teff = (s: System, id = 'dwarf') => node(systemProcessor.process(s, pack), id).temperatureK as number;

  it('with no age of its own it follows the system: the report\'s dwarf at 1 Gyr and at 9 Gyr', () => {
    expect(teff(makeSystem(1))).toBeCloseTo(1376.93, 1);
    expect(teff(makeSystem(9))).toBeCloseTo(989.70, 1);
  });

  it('given its own age it reads THAT age\'s temperature, in kelvin, whatever the system\'s age is', () => {
    expect(teff(aged(makeSystem(1), 'dwarf', 9))).toBeCloseTo(989.70, 1);     // an old dwarf in a young system
    expect(teff(aged(makeSystem(9), 'dwarf', 1))).toBeCloseTo(1376.93, 1);    // a young dwarf in an old one
    expect(teff(aged(makeSystem(4.6), 'dwarf', 9))).toBeCloseTo(989.70, 1);
  });

  it('the temperature STICKS: three more passes change nothing, and the class a GM aimed at stays', () => {
    let s = systemProcessor.process(aged(makeSystem(2.9), 'dwarf', 9), pack);
    const first = node(s, 'dwarf').temperatureK;
    const lum = (node(s, 'dwarf') as any).internalLuminositySolar;
    for (let i = 0; i < 3; i++) s = systemProcessor.process(s, pack);
    expect(node(s, 'dwarf').temperatureK).toBe(first);
    expect((node(s, 'dwarf') as any).internalLuminositySolar).toBe(lum);
    expect(first).toBeCloseTo(989.70, 1);
  });

  it('ageing the SYSTEM afterwards moves the dwarf that inherits and not the one with its own age', () => {
    const s = aged(makeSystem(1), 'dwarf', 9);
    // (process() works on the nodes it is given, so the young figures are read before the second run.)
    const young = systemProcessor.process(s, pack);
    const dwarfYoung = node(young, 'dwarf').temperatureK as number;
    const planemoYoung = (node(young, 'planemo') as any).selfLuminousTeffK as number;
    const old = systemProcessor.process({ ...young, age_Gyr: 9 }, pack);
    expect(node(old, 'dwarf').temperatureK).toBe(dwarfYoung);
    expect(planemoYoung).toBeCloseTo(1376.93, 1);
    expect((node(old, 'planemo') as any).selfLuminousTeffK).toBeCloseTo(989.70, 1);
  });

  it('filed as a planet it is the same object: the same age gives the same photosphere (DATA-R22)', () => {
    const s = systemProcessor.process(aged(aged(makeSystem(2), 'dwarf', 9), 'planemo', 9), pack);
    expect((node(s, 'planemo') as any).selfLuminousTeffK).toBe((node(s, 'dwarf') as any).selfLuminousTeffK);
    expect((node(s, 'planemo') as any).selfLuminousTeffK).toBeCloseTo(989.70, 1);
  });

  it('...and its moon is lit by the dwarf it actually orbits: an older host is a colder sky', () => {
    const young = node(systemProcessor.process(aged(makeSystem(4.6), 'planemo', 0.5), pack), 'moon').temperatureK as number;
    const old = node(systemProcessor.process(aged(makeSystem(4.6), 'planemo', 12), pack), 'moon').temperatureK as number;
    expect(old).toBeLessThan(young - 20);
  });
});

describe('G94 - a giant sheds the heat of ITS OWN formation', () => {
  const pack = loadRulePack();
  const heat = (s: System) => node(systemProcessor.process(s, pack), 'jove').internalHeatK as number;

  it('the anchor holds: a Jupiter with no age of its own in a 4.6 Gyr system radiates +52 K', () => {
    expect(heat(makeSystem(4.6))).toBeCloseTo(52, 1);
  });

  it('given its own age it reads that age: twice as old is +37.3 K (the shipped pack cooling exponent), in a system of any age', () => {
    expect(heat(aged(makeSystem(4.6), 'jove', 9.2))).toBeCloseTo(37.28, 1);
    expect(heat(aged(makeSystem(1), 'jove', 9.2))).toBeCloseTo(37.28, 1);
    expect(heat(aged(makeSystem(12), 'jove', 9.2))).toBeCloseTo(37.28, 1);
  });

  it('...and a giant captured young into an old system is still hot', () => {
    expect(heat(aged(makeSystem(9), 'jove', 0.05))).toBeCloseTo(455.6, 0);   // 50 Myr old
    expect(heat(makeSystem(9))).toBeCloseTo(37.7, 0);                       // the same giant, formed here
  });
});

describe('G94 - a world loses its air over ITS OWN lifetime', () => {
  const pack = loadRulePack();
  const bar = (s: System) => node(systemProcessor.process(s, pack), 'ares').atmosphere?.pressure_bar as number;

  it('with no age of its own it erodes over the system\'s: 0.961 bar left at 1 Gyr, 0.649 at 9', () => {
    expect(bar(makeSystem(1))).toBeCloseTo(0.9611, 3);
    expect(bar(makeSystem(4.6))).toBeCloseTo(0.8205, 3);
    expect(bar(makeSystem(9))).toBeCloseTo(0.6487, 3);
  });

  // (Compared to six places rather than exactly: the STAR in the two systems is a different age, so
  //  its wind differs in the ninth decimal. The world's own loss is what is being pinned.)
  it('given its own age it has lost exactly what a world of THAT age has lost', () => {
    expect(bar(aged(makeSystem(9), 'ares', 1))).toBeCloseTo(0.9611, 3);    // captured late into an old system
    expect(bar(aged(makeSystem(1), 'ares', 9))).toBeCloseTo(0.6487, 3);    // an old world round a young star
    expect(bar(aged(makeSystem(4.6), 'ares', 9))).toBeCloseTo(bar(makeSystem(9)), 6);
  });

  it('...and reprocessing does not compound the loss', () => {
    let s = systemProcessor.process(aged(makeSystem(1), 'ares', 9), pack);
    const first = node(s, 'ares').atmosphere?.pressure_bar;
    for (let i = 0; i < 3; i++) s = systemProcessor.process(s, pack);
    expect(node(s, 'ares').atmosphere?.pressure_bar).toBe(first);
  });
});

describe('G94 - a star spins down on ITS OWN age', () => {
  const pack = loadRulePack();
  const red = (s: System) => node(systemProcessor.process(s, pack), 'red');
  const flaring = (b: CelestialBody) => (b.tags ?? []).some((t) => t.key === 'hazard/flaring');

  it('a red dwarf with no age of its own is as quiet as its 4.6 Gyr system makes it', () => {
    const b = red(makeSystem(4.6));
    expect(b.flareActivity).toBeCloseTo(0.1258, 3);       // 0.85 x (0.3 / 4.6)^0.7
    expect(flaring(b)).toBe(false);
  });

  it('given an age of 100 Myr it is a flare star, in a system of any age', () => {
    for (const systemAge of [1, 4.6, 11]) {
      const b = red(aged(makeSystem(systemAge), 'red', 0.1));
      expect(b.flareActivity, `system ${systemAge} Gyr`).toBeCloseTo(0.85, 3);
      expect(flaring(b)).toBe(true);
    }
  });

  it('...and an old companion of a young star is quiet while the young primary is not', () => {
    const s = systemProcessor.process(aged(makeSystem(0.2), 'red', 10), pack);
    expect(node(s, 'red').flareActivity).toBeCloseTo(0.073, 2);    // 0.85 x (0.3 / 10)^0.7
    expect(node(s, 'star').flareActivity).toBeCloseTo(0.35, 2);    // a 200 Myr G star, saturated
  });
});

// The blunt one, in the shape of `idempotence.test.ts`: an age is an INPUT, so a system in which
// EVERY body has been given its own must come out of a second and third pass byte for byte as it
// came out of the first. Any consumer that read an age-derived value out of order shows up here.
describe('G94 - a system full of aged bodies is still idempotent', () => {
  const pack = loadRulePack();
  it('pass 1, pass 2 and pass 3 are identical on every field of every node', () => {
    const s0 = makeSystem(4.6);
    const ages: Record<string, number> = { star: 4.6, red: 0.1, dwarf: 9, planemo: 12, moon: 3, jove: 0.05, ares: 9 };
    for (const [id, a] of Object.entries(ages)) setBodyAge(node(s0, id), a, s0);
    const p1 = JSON.stringify(systemProcessor.process(s0, pack).nodes);
    const p2 = JSON.stringify(systemProcessor.process(JSON.parse(JSON.stringify({ ...s0, nodes: JSON.parse(p1) })), pack).nodes);
    const p3 = JSON.stringify(systemProcessor.process(JSON.parse(JSON.stringify({ ...s0, nodes: JSON.parse(p2) })), pack).nodes);
    expect(p2).toBe(p1);
    expect(p3).toBe(p2);
  });
});

// THE SENTENCE UNDER THE AGE CONTROL IS HELD TO THE PROCESSOR. `ageDriven` says which of a body's
// figures follow its age; this measures which ones actually do, by giving the body two very
// different ages and looking. A claim with nothing behind it fails, and so does a figure that
// moves without being claimed - which is what a newly switched consumer would do.
describe('G94 - what the Age control says it drives is what moves', () => {
  const pack = loadRulePack();
  const measure = (id: string, ageGyr: number) => {
    const b = node(systemProcessor.process(aged(makeSystem(4.6), id, ageGyr), pack), id) as any;
    return {
      'cooling-track': b.selfLuminousTeffK ?? null,
      'internal-heat': b.internalHeatK ?? null,
      'atmospheric-escape': b.atmosphere?.pressure_bar ?? null,
      'flare-activity': b.flareActivity ?? null
    } as Record<AgeDriven, number | null>;
  };

  for (const id of ['star', 'red', 'dwarf', 'planemo', 'moon', 'jove', 'ares']) {
    it(`${id}: the claim and the measurement agree`, () => {
      const young = measure(id, 0.1);
      const old = measure(id, 10);
      const moved = (Object.keys(young) as AgeDriven[]).filter((k) => young[k] !== old[k]).sort();
      const claimed = ageDriven(node(makeSystem(4.6), id), pack).slice().sort();
      expect(claimed).toEqual(moved);
    });
  }

  it('the sentences a GM reads, for the kinds of body that differ', () => {
    const s = makeSystem(4.6);
    expect(ageDrivesSentence(node(s, 'planemo'), pack)).toBe('Drives its temperature and brightness (a brown dwarf does not fuse, so it only cools).');
    expect(ageDrivesSentence(node(s, 'dwarf'), pack)).toBe('Drives its temperature and brightness (a brown dwarf does not fuse, so it only cools) and how hard it flares.');
    expect(ageDrivesSentence(node(s, 'jove'), pack)).toBe('Drives the heat still left over from its formation.');
    expect(ageDrivesSentence(node(s, 'ares'), pack)).toBe('Drives how much of its air it has lost.');
    expect(ageDrivesSentence(node(s, 'moon'), pack)).toMatch(/^Nothing this body shows is worked out from its age yet/);
  });
});

// G94 job 6 - the `age/` tags, through the processor. The bands themselves are pinned in
// `physics/ageTags.spec.ts`; this is the lifecycle: emitted from the body's own formation time,
// owned and cleared by one pass, and never an anomaly.
describe('G94 - the age/ tag family is emitted, re-derived and cleared', () => {
  const pack = loadRulePack();
  const ageTags = (b: CelestialBody) => (b.tags ?? []).filter((t) => t.key.startsWith('age/')).map((t) => `${t.key}=${t.value}`);

  it('a system in which no body has its own age carries no age/ tag anywhere', () => {
    const s = systemProcessor.process(makeSystem(4.6), pack);
    for (const n of s.nodes) expect(ageTags(n as CelestialBody), n.id).toEqual([]);
  });

  it('each band lands on the body that earned it, with its age as the value', () => {
    const s0 = makeSystem(4.6);
    for (const [id, a] of Object.entries({ ares: 0.5, jove: 5, planemo: 9, dwarf: 13.2, moon: 4.6 })) setBodyAge(node(s0, id), a, s0);
    const s = systemProcessor.process(s0, pack);
    expect(ageTags(node(s, 'ares'))).toEqual(['age/young=500 Myr']);
    expect(ageTags(node(s, 'jove'))).toEqual(['age/old=5 Gyr']);
    expect(ageTags(node(s, 'planemo'))).toEqual(['age/ancient=9 Gyr']);
    expect(ageTags(node(s, 'dwarf'))).toEqual(['age/primordial=13.2 Gyr']);
    expect(ageTags(node(s, 'moon'))).toEqual([]);             // its own age, but the system's: formed with it
    expect(ageTags(node(s, 'star'))).toEqual([]);
  });

  it('it is a TAG and not an anomaly: nothing is pinned and no anomaly is raised', () => {
    const s = systemProcessor.process(aged(makeSystem(4.6), 'planemo', 9), pack);
    const b = node(s, 'planemo');
    expect(b.overrides).toBeUndefined();
    expect((b.tags ?? []).some((t) => t.key.startsWith('anomaly/'))).toBe(false);
  });

  it('the relative band follows the SYSTEM when the system is aged; the body\'s own age does not move', () => {
    const s1 = systemProcessor.process(aged(makeSystem(4.6), 'jove', 5), pack);
    expect(ageTags(node(s1, 'jove'))).toEqual(['age/old=5 Gyr']);
    const s2 = systemProcessor.process({ ...s1, age_Gyr: 6 }, pack);
    expect(ageTags(node(s2, 'jove'))).toEqual(['age/young=5 Gyr']);
  });

  it('handing the age back to the system removes the tag, and exactly one tag is ever present', () => {
    let s = systemProcessor.process(aged(makeSystem(4.6), 'jove', 5), pack);
    setBodyAge(node(s, 'jove'), 9, s);
    s = systemProcessor.process(s, pack);
    expect(ageTags(node(s, 'jove'))).toEqual(['age/ancient=9 Gyr']);
    clearBodyAge(node(s, 'jove'));
    s = systemProcessor.process(s, pack);
    expect(ageTags(node(s, 'jove'))).toEqual([]);
  });

  it('the pack\'s own figures decide: a 3 Gyr generation makes the same 9 Gyr body merely old', () => {
    const slow = { ...pack, deepTime: { generationGyr: 3 } } as RulePack;
    const s = systemProcessor.process(aged(makeSystem(4.6), 'planemo', 9), slow);
    expect(ageTags(node(s, 'planemo'))).toEqual(['age/old=9 Gyr']);
  });
});
