import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
import { recalculateSystemPhysics } from './postprocessing';
import type { System, RulePack, CelestialBody } from '../types';

// The heating-model audit (v2.0.320): every path that computes a body's surface temperature must agree,
// and every heat source (greenhouse, tidal, radiogenic, giant-internal, brown-dwarf self-luminous) must
// flow through to the mean surface temp AND onward to the habitability score. These tests lock that in.

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

const EARTH = 5.972e24, R_E = 6371, M_JUP_KG = 1.898e27;

// A temperate water world near the habitable zone, with an optional radiogenic override.
function makeWaterWorld(over?: number): System {
  const planet: any = {
    id: 'p', name: 'P', kind: 'body', parentId: 'star', roleHint: 'planet', massKg: 1.0 * EARTH, radiusKm: 1.0 * R_E,
    axial_tilt_deg: 23, rotation_period_hours: 24, makeup: { metal: 0.3, rock: 0.7 }, classes: [], tags: [],
    hydrosphere: { composition: 'water', coverage: 0.7 },
    atmosphere: { main: 'N2', pressure_bar: 1, composition: { N2: 0.78, O2: 0.21 } },
    orbit: { hostId: 'star', elements: { a_AU: 1.05, e: 0.02, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }
  };
  if (over != null) planet.overrides = { radiogenicHeatK: over };
  return {
    id: 'sys', name: 'Sys', seed: 'seed', epochT0: 0, age_Gyr: 5,
    nodes: [
      { id: 'star', name: 'Star', kind: 'body', parentId: null, roleHint: 'star', massKg: 1.989e30, radiusKm: 696340,
        temperatureK: 5778, radiationOutput: 1, classes: ['star/G'], axial_tilt_deg: 0, rotation_period_hours: 600 },
      planet
    ]
  } as any;
}

// A star + a brown dwarf at 5 AU (self-luminous when massive enough).
function makeBrownDwarf(giantMjup: number): System {
  return {
    id: 'bd', name: 'BD', seed: 'bd', epochT0: 0, age_Gyr: 1,
    nodes: [
      { id: 'star', name: 'Star', kind: 'body', parentId: null, roleHint: 'star', massKg: 1.989e30, radiusKm: 696340,
        temperatureK: 5778, radiationOutput: 1, classes: ['star/G'], axial_tilt_deg: 0, rotation_period_hours: 600 },
      { id: 'giant', name: 'Giant', kind: 'body', parentId: 'star', roleHint: 'planet', massKg: giantMjup * M_JUP_KG,
        radiusKm: 10.5 * R_E, axial_tilt_deg: 0, rotation_period_hours: 10, makeup: { gas: 0.92, ice: 0.08 }, classes: [],
        orbit: { hostId: 'star', elements: { a_AU: 5, e: 0.02, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } }
    ]
  } as any;
}

const planet = (s: System, id = 'p') => s.nodes.find((n) => n.id === id) as CelestialBody;

describe('heating model — one authoritative surface temperature, wired everywhere', () => {
  const pack = loadRulePack();

  it('the habitability Temperature factor reads the SAME mean surface temperature (no disconnect)', () => {
    const s = systemProcessor.process(makeWaterWorld(30), pack);
    const p = planet(s);
    const tempFactor = (p.habitabilityBreakdown as any)?.factors?.find((f: any) => f.label === 'Temperature');
    expect(tempFactor).toBeTruthy();
    // The value the habitability score was computed against IS the composed mean surface temp — not the
    // bare equilibrium temp, and not a separately-recomputed figure that omits radiogenic/internal heat.
    expect(tempFactor.range.value).toBe(Math.round(p.temperatureK ?? 0));
  });

  it('raising radiogenic heat raises the mean surface temp AND the habitability temperature it scores', () => {
    const cold = planet(systemProcessor.process(makeWaterWorld(0), pack));
    const warm = planet(systemProcessor.process(makeWaterWorld(35), pack));
    // Monotonic: MORE internal heat is never LESS surface heat (the "radiogenic lowers temp" bug).
    expect(warm.temperatureK!).toBeGreaterThan(cold.temperatureK!);
    const factor = (b: CelestialBody) => (b.habitabilityBreakdown as any).factors.find((f: any) => f.label === 'Temperature').range.value;
    expect(factor(warm)).toBeGreaterThan(factor(cold));
    expect(factor(warm)).toBe(Math.round(warm.temperatureK!)); // still exactly the composed temp
  });

  it('the postprocessing recompute agrees with the main processor (albedo + equilibrium aligned)', () => {
    const viaProcessor = planet(systemProcessor.process(makeWaterWorld(20), pack));

    const raw = makeWaterWorld(20);
    recalculateSystemPhysics(raw, pack);
    const viaPost = planet(raw);

    expect(viaPost.albedoBreakdown).toBeTruthy(); // now derives clouds like the main pipeline
    // Same albedo model → same equilibrium temp → same mean surface temp (was ~15+ K adrift before).
    expect(Math.abs(viaPost.equilibriumTempK! - viaProcessor.equilibriumTempK!)).toBeLessThan(2);
    expect(Math.abs(viaPost.temperatureK! - viaProcessor.temperatureK!)).toBeLessThan(2);
  });

  it('a brown dwarf keeps its self-luminous heat through a postprocessing recompute (not dropped)', () => {
    const s = systemProcessor.process(makeBrownDwarf(40), pack);
    const before = planet(s, 'giant');
    expect((before as any).selfLuminousTeffK).toBeGreaterThan(600);
    expect(before.temperatureK!).toBeGreaterThan(600);

    // An edit re-runs recalculateSystemPhysics in place — the self-luminous term must survive.
    recalculateSystemPhysics(s, pack);
    const after = planet(s, 'giant');
    expect(after.temperatureK!).toBeGreaterThan(600); // would collapse to the ~120 K stellar value if dropped
  });
});
