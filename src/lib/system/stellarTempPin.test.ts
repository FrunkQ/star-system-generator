// G96 - a star's direct temperature is an OVERRIDE: "direct temp control is now in overrides", and
// "the physics just uses the actual values - even if they don't make a huge amount of sense".
//
// The pin is exercised the way a SAVE delivers it - a key already sitting in `overrides` when the
// system is processed - as well as through the Overrides tab's own `setOverride`, because the two
// are one function called from two places and a gate that only walked one would not see the other
// stop working. Every block was run with the processor's call removed and seen RED.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
import { overrideDefsFor, overrideDef, overrideStatus, setOverride, clearOverride, activeOverrides } from '../physics/overrides';
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

const SUN_KG = 1.989e30;
const SUN_KM = 696340;
const M_JUP = 1.898e27;
const star = (extra: Record<string, unknown> = {}): any => ({
  id: 'star', name: 'Star', kind: 'body', parentId: null, roleHint: 'star', massKg: SUN_KG, radiusKm: SUN_KM,
  temperatureK: 5778, radiationOutput: 1, classes: ['star/G'], axial_tilt_deg: 0, rotation_period_hours: 600, tags: [], ...extra
});
const world = (): any => ({
  id: 'world', name: 'World', kind: 'body', parentId: 'star', roleHint: 'planet', classes: [], massKg: 5.972e24,
  radiusKm: 6371, makeup: { rock: 0.68, metal: 0.32 }, axial_tilt_deg: 0, rotation_period_hours: 24, tags: [],
  orbit: { hostId: 'star', elements: { a_AU: 1, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }
});
const makeSystem = (s: any): System => ({
  id: 'pin', name: 'Pin', seed: 'pin-seed', epochT0: Date.UTC(2026, 8, 1, 12), age_Gyr: 4.6,
  rulePackId: 'starter-sf', rulePackVersion: '1', tags: [], nodes: [s, world()]
} as any);
const node = (s: System, id: string) => s.nodes.find((n) => n.id === id) as CelestialBody;
const keysFor = (b: any) => overrideDefsFor(b as CelestialBody).map((d) => d.key);

describe('G96 - who is offered a stellar temperature pin', () => {
  it('a fusing star and a white dwarf are', () => {
    expect(keysFor(star())).toContain('effectiveTempK');
    expect(keysFor(star({ classes: ['star/M'], massKg: 0.1 * SUN_KG, radiusKm: 85000, temperatureK: 2900 }))).toContain('effectiveTempK');
    expect(keysFor(star({ classes: ['star/WD'], massKg: 0.6 * SUN_KG, radiusKm: 8000, temperatureK: 12000 }))).toContain('effectiveTempK');
  });

  it('a BROWN DWARF is not, at either edge of the window or in the middle of it - its handle is its age', () => {
    for (const mjup of [8, 36.9, 79]) {
      expect(keysFor(star({ classes: ['star/T'], massKg: mjup * M_JUP, radiusKm: 56000, temperatureK: 1172 })), `${mjup} M_jup`)
        .not.toContain('effectiveTempK');
    }
    // ...and it keeps the other two star overrides, so the tab is not emptied.
    expect(keysFor(star({ classes: ['star/T'], massKg: 36.9 * M_JUP, radiusKm: 56000 }))).toEqual(['flareActivity', 'lineOfSightExtinction']);
  });

  it('a black hole, a neutron star and a magnetar are not: there is no photosphere to pin', () => {
    for (const cls of ['star/BH', 'star/BH_active', 'star/NS', 'star/magnetar']) {
      expect(keysFor(star({ classes: [cls], massKg: 5 * SUN_KG, radiusKm: 15 })), cls).not.toContain('effectiveTempK');
    }
  });

  it('a planet never is - a planet-filed brown dwarf included - and the planet pin is not offered to a star', () => {
    expect(keysFor(world())).not.toContain('effectiveTempK');
    expect(keysFor({ ...world(), massKg: 36.9 * M_JUP, radiusKm: 56000 })).not.toContain('effectiveTempK');
    expect(keysFor(star())).not.toContain('surfaceTempK');
  });
});

describe('G96 - the physics uses the pinned temperature', () => {
  const pack = loadRulePack();

  it('a pin arriving in a save sets the star\'s temperature and its brightness by the one law', () => {
    const s = systemProcessor.process(makeSystem(star({ overrides: { effectiveTempK: 4000 } })), pack);
    expect(node(s, 'star').temperatureK).toBe(4000);
    expect(node(s, 'star').radiationOutput).toBe(0.23);              // (4000 / 5778)^4 = 0.2297, to three figures
    expect(node(s, 'star').temperature0K).toBe(5778);                // what it displaced, kept for the reset
    expect(node(s, 'star').radiationOutput0).toBe(1);
  });

  it('...and the world it lights cools with it: 271.6 K of equilibrium at 5778 K becomes 188.0 K at 4000 K', () => {
    const plain = node(systemProcessor.process(makeSystem(star()), pack), 'world').equilibriumTempK as number;
    const pinned = node(systemProcessor.process(makeSystem(star({ overrides: { effectiveTempK: 4000 } })), pack), 'world').equilibriumTempK as number;
    expect(plain).toBeCloseTo(271.58, 1);
    expect(pinned).toBeCloseTo(188.01, 1);
    expect(pinned / plain).toBeCloseTo(4000 / 5778, 6);              // equilibrium temperature is linear in the star's
  });

  it('three more passes change nothing on the star or the world', () => {
    const s0 = makeSystem(star({ overrides: { effectiveTempK: 4000 } }));
    const p1 = JSON.stringify(systemProcessor.process(s0, pack).nodes);
    const p2 = JSON.stringify(systemProcessor.process({ ...s0, nodes: JSON.parse(p1) }, pack).nodes);
    const p3 = JSON.stringify(systemProcessor.process({ ...s0, nodes: JSON.parse(p2) }, pack).nodes);
    expect(p2).toBe(p1);
    expect(p3).toBe(p2);
  });

  it('a star with NO pin is not touched: no stored figure moves and nothing is added to it', () => {
    const s = systemProcessor.process(makeSystem(star()), pack);
    expect(node(s, 'star').temperatureK).toBe(5778);
    expect(node(s, 'star').radiationOutput).toBe(1);
    expect('temperature0K' in node(s, 'star')).toBe(false);
    expect('radiationOutput0' in node(s, 'star')).toBe(false);
  });

  it('it is flagged as an override like any other, with the star\'s own figure beside it', () => {
    const s = systemProcessor.process(makeSystem(star({ overrides: { effectiveTempK: 4000 } })), pack);
    const active = activeOverrides(node(s, 'star'));
    expect(active.map((a) => a.def.key)).toEqual(['effectiveTempK']);
    expect(active[0].value).toBe(4000);
    expect(active[0].derived).toBe(5778);
    expect(active[0].warning).toBeNull();                            // 4000 K is an ordinary star
  });
});

describe('G96 - the Overrides tab\'s own path: pin, drag, reset', () => {
  const pack = loadRulePack();

  it('pinning shows at once, before any recalculation, and reset hands the star back exactly as it was', () => {
    const b = star({ radiationOutput: 1.02 }) as CelestialBody;     // an imported star whose stored output is its own
    setOverride(b, 'effectiveTempK', 9000);
    expect(b.temperatureK).toBe(9000);
    expect(b.radiationOutput).toBeCloseTo(5.89, 2);                  // (9000 / 5778)^4
    setOverride(b, 'effectiveTempK', 3000);                          // a drag: the displaced figure does not move
    expect(b.temperatureK).toBe(3000);
    expect(b.temperature0K).toBe(5778);
    clearOverride(b, 'effectiveTempK');
    expect(b.temperatureK).toBe(5778);
    expect(b.radiationOutput).toBe(1.02);
    expect(b.overrides).toBeUndefined();
    expect('temperature0K' in b).toBe(false);
    expect('radiationOutput0' in b).toBe(false);
  });

  it('...and a reset that reaches the processor first comes back the same way', () => {
    const s0 = systemProcessor.process(makeSystem(star({ overrides: { effectiveTempK: 4000 } })), pack);
    delete (node(s0, 'star') as any).overrides;                      // the key removed by hand, as an edited save would
    const s1 = systemProcessor.process(s0, pack);
    expect(node(s1, 'star').temperatureK).toBe(5778);
    expect(node(s1, 'star').radiationOutput).toBe(1);
    expect('temperature0K' in node(s1, 'star')).toBe(false);
  });
});

describe('G96 - warn, never stop', () => {
  const pack = loadRulePack();
  const def = overrideDef('effectiveTempK')!;

  it('500 K on a fusing star is KEPT - the pin outranks the ignition floor - and is called implausible', () => {
    const m = star({ classes: ['star/M'], massKg: 0.1 * SUN_KG, radiusKm: 85000, temperatureK: 2900, radiationOutput: 0.001, overrides: { effectiveTempK: 500 } });
    const s = systemProcessor.process(makeSystem(m), pack);
    expect(node(s, 'star').temperatureK).toBe(500);
    const status = overrideStatus(node(s, 'star'), def);
    expect(status.severity).toBe('implausible');
    expect(status.warning).toMatch(/500 K is below the plausible range \(1900 K to 50000 K\)/);
    expect(status.warning).toMatch(/The engine uses the figure all the same/);
  });

  it('the floor itself is unchanged for a star with no pin: 500 K is still raised to 1900 K', () => {
    const m = star({ classes: ['star/M'], massKg: 0.1 * SUN_KG, radiusKm: 85000, temperatureK: 500, radiationOutput: 0.001 });
    expect(node(systemProcessor.process(makeSystem(m), pack), 'star').temperatureK).toBe(1900);
  });

  it('a negative temperature is IMPOSSIBLE and says so; a typed figure is bounded only by the absurd pair', () => {
    const b = star() as CelestialBody;
    expect(def.hard).toEqual([0, 1e9]);
    setOverride(b, 'effectiveTempK', 2e6);
    expect(b.temperatureK).toBe(2e6);                                // far past the slider, kept
    expect(overrideStatus(b, def).severity).toBe('implausible');
    expect(def.possible!(b)![0]).toBe(0);
    expect(def.breaks).toMatch(/absolute zero/);
  });

  it('a white dwarf is given no band, so nothing is claimed about a remnant\'s temperature', () => {
    const wd = star({ classes: ['star/WD'], massKg: 0.6 * SUN_KG, radiusKm: 8000, temperatureK: 12000 }) as CelestialBody;
    setOverride(wd, 'effectiveTempK', 120000);
    expect(overrideStatus(wd, def).warning).toBeNull();
  });

  it('a pin key left on a BROWN DWARF by a hand-edited save is ignored: the cooling track still decides', () => {
    const bd = star({ classes: ['star/T'], massKg: 0.0352 * SUN_KG, radiusKm: 0.0806 * SUN_KM, temperatureK: 914, overrides: { effectiveTempK: 914 } });
    const s = systemProcessor.process({ ...makeSystem(bd), age_Gyr: 9 } as System, pack);
    expect(node(s, 'star').temperatureK).toBeCloseTo(989.70, 1);
    expect('temperature0K' in node(s, 'star')).toBe(false);
  });
});
