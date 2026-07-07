import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
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

const M_JUP_KG = 1.898e27;
const R_E_KM = 6371;

// A star + a giant planet at 5 AU + a moon of that planet at 0.003 AU. `giantMjup` sets whether the
// planet is a brown dwarf (self-luminous) or an ordinary gas giant (control).
function makeSystem(giantMjup: number, ageGyr: number): System {
  return {
    id: 'bd-test', name: 'BD Test', seed: 'bd-test-seed', epochT0: 0, age_Gyr: ageGyr,
    nodes: [
      { id: 'star', name: 'Star', kind: 'body', parentId: null, roleHint: 'star', massKg: 1.989e30,
        radiusKm: 696340, temperatureK: 5778, radiationOutput: 1, classes: ['star/G'], axial_tilt_deg: 0,
        rotation_period_hours: 600 } as any,
      { id: 'giant', name: 'Giant', kind: 'body', parentId: 'star', roleHint: 'planet',
        massKg: giantMjup * M_JUP_KG, radiusKm: 10.5 * R_E_KM, axial_tilt_deg: 0, rotation_period_hours: 10,
        makeup: { gas: 0.92, ice: 0.08 }, classes: [],
        orbit: { hostId: 'star', elements: { a_AU: 5, e: 0.02, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } } as any,
      { id: 'moon', name: 'Moon', kind: 'body', parentId: 'giant', roleHint: 'moon',
        massKg: 0.02 * 5.972e24, radiusKm: 0.35 * R_E_KM, axial_tilt_deg: 0, rotation_period_hours: 100,
        makeup: { rock: 0.6, ice: 0.4 }, classes: [],
        orbit: { hostId: 'giant', elements: { a_AU: 0.003, e: 0.01, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } } as any
    ]
  } as any;
}

describe('brown-dwarf self-heating + moon irradiation (end-to-end)', () => {
  const pack = loadRulePack();

  it('a 40 M_jup planet self-heats and irradiates its moon; a 2 M_jup gas giant does not', () => {
    const bd = systemProcessor.process(makeSystem(40, 1), pack);
    const giantBD = bd.nodes.find((n) => n.id === 'giant') as CelestialBody;
    const moonBD = bd.nodes.find((n) => n.id === 'moon') as CelestialBody;

    const gg = systemProcessor.process(makeSystem(2, 1), pack);
    const giantGG = gg.nodes.find((n) => n.id === 'giant') as CelestialBody;
    const moonGG = gg.nodes.find((n) => n.id === 'moon') as CelestialBody;

    console.log('BD  giant Teff/surface:', (giantBD as any).selfLuminousTeffK?.toFixed(0), '/', giantBD.temperatureK?.toFixed(0), 'K  L☉=', (giantBD as any).internalLuminositySolar?.toExponential(2));
    console.log('BD  moon surface/rad:', moonBD.temperatureK?.toFixed(0), 'K /', moonBD.surfaceRadiation?.toFixed(0), 'mSv');
    console.log('GG  giant surface:', giantGG.temperatureK?.toFixed(0), 'K (selfLum=', (giantGG as any).isSelfLuminous, ')');
    console.log('GG  moon surface/rad:', moonGG.temperatureK?.toFixed(0), 'K /', moonGG.surfaceRadiation?.toFixed(0), 'mSv');

    // 1. The brown dwarf is flagged self-luminous with a hot photosphere; the gas giant is not.
    expect((giantBD as any).isSelfLuminous).toBe(true);
    expect((giantGG as any).isSelfLuminous).toBeFalsy();
    expect((giantBD as any).selfLuminousTeffK).toBeGreaterThan(600);

    // 2. The brown dwarf's own SURFACE reads ≈ its Teff (self-heated), not the cold ~120 K it would get
    //    from a G star at 5 AU. The gas giant stays cold.
    expect(giantBD.temperatureK!).toBeGreaterThan(600);
    expect(giantGG.temperatureK!).toBeLessThan(200);

    // 3. The moon of the brown dwarf is WARMED by it (much warmer than the moon of the cold gas giant,
    //    which only sees the distant star).
    expect(moonBD.temperatureK!).toBeGreaterThan(moonGG.temperatureK! + 50);

    // 4. The moon of the brown dwarf is IRRADIATED by it (higher surface dose than the control moon).
    expect(moonBD.surfaceRadiation!).toBeGreaterThan(moonGG.surfaceRadiation!);
  });

  it('an ancient brown dwarf is cooler than a young one (cooling with age)', () => {
    const young = systemProcessor.process(makeSystem(40, 0.5), pack).nodes.find((n) => n.id === 'giant') as CelestialBody;
    const old = systemProcessor.process(makeSystem(40, 10), pack).nodes.find((n) => n.id === 'giant') as CelestialBody;
    expect((young as any).selfLuminousTeffK).toBeGreaterThan((old as any).selfLuminousTeffK);
  });
});
