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
import { setBodyAge } from '../physics/bodyAge';
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
        rotation_period_hours: 10, tags: [], orbit: orbit('star', 5.2) }
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
