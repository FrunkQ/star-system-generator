import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
import { fixUpImportedSystem } from './importFixup';
import type { System, RulePack, CelestialBody } from '../types';

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
const EARTH = 5.972e24, R_E = 6371;

// A small, old, rocky world — geologically DEAD by default (low vigor). `over` optionally sets the GM
// radiogenic override.
function makeSystem(over?: number, legacy?: number): System {
  const planet: any = {
    id: 'p', name: 'P', kind: 'body', parentId: 'star', roleHint: 'planet', massKg: 0.1 * EARTH, radiusKm: 0.5 * R_E,
    axial_tilt_deg: 10, rotation_period_hours: 24, makeup: { metal: 0.3, rock: 0.7 }, classes: [],
    orbit: { hostId: 'star', elements: { a_AU: 1.4, e: 0.02, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }
  };
  if (over != null) planet.overrides = { radiogenicHeatK: over };
  if (legacy != null) planet.radiogenicHeatK = legacy; // simulates an OLD save with the editable field
  return {
    id: 'sys', name: 'Sys', seed: 'seed', epochT0: 0, age_Gyr: 8,
    nodes: [
      { id: 'star', name: 'Star', kind: 'body', parentId: null, roleHint: 'star', massKg: 1.989e30, radiusKm: 696340,
        temperatureK: 5778, radiationOutput: 1, classes: ['star/G'], axial_tilt_deg: 0, rotation_period_hours: 600 },
      planet
    ]
  } as any;
}

describe('radiogenic heat is a persistent GM override that drives geology', () => {
  const pack = loadRulePack();
  const geo = (s: System) => ((s.nodes.find((n) => n.id === 'p') as CelestialBody).geoActivity as any)?.regime;
  const rad = (s: System) => (s.nodes.find((n) => n.id === 'p') as CelestialBody).radiogenicHeatK;

  it('no override → dead world; a high override → active geology + the tag changes', () => {
    const base = systemProcessor.process(makeSystem(), pack);
    expect(rad(base)).toBe(0);
    expect(geo(base)).toBe('inactive'); // small + old → geologically dead

    const boosted = systemProcessor.process(makeSystem(30), pack);
    expect(rad(boosted)).toBe(30);
    expect(geo(boosted)).not.toBe('inactive'); // the override woke it up
    const tags = (boosted.nodes.find((n) => n.id === 'p') as CelestialBody).tags?.map((t) => t.key) ?? [];
    expect(tags.some((k) => k.startsWith('geology/') && k !== 'geology/inactive')).toBe(true);
  });

  it('the override SURVIVES a save→load round-trip (no reset to 0)', () => {
    const processed = systemProcessor.process(makeSystem(25), pack);
    // Simulate reload: strip + re-derive (as the app does on every load).
    const reloaded = systemProcessor.process(fixUpImportedSystem(JSON.parse(JSON.stringify(processed)), pack), pack);
    const p = reloaded.nodes.find((n) => n.id === 'p') as CelestialBody;
    expect(p.overrides?.radiogenicHeatK).toBe(25);
    expect(p.radiogenicHeatK).toBe(25);
    expect((p.geoActivity as any).regime).not.toBe('inactive');
  });

  it('MIGRATES a legacy editable radiogenicHeatK (old save) into the override on load', () => {
    // An old file: radiogenicHeatK set directly on the body, no overrides object.
    const oldFile = makeSystem(undefined, 22);
    const reloaded = systemProcessor.process(fixUpImportedSystem(oldFile, pack), pack);
    const p = reloaded.nodes.find((n) => n.id === 'p') as CelestialBody;
    expect(p.overrides?.radiogenicHeatK).toBe(22); // recovered
    expect(p.radiogenicHeatK).toBe(22);
  });
});
