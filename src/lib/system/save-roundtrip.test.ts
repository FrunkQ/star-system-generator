import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
import { fixUpImportedSystem, stripStarmapForExport } from './importFixup';
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

const M_JUP_KG = 1.898e27, EARTH = 5.972e24, R_E = 6371;

// A system exercising every AUTHORED-data trap that a naive strip could lose on reload:
//  - a non-Sun star (temperatureK + radiationOutput are authored inputs)
//  - a GM-PINNED class (autoClassify:false) placed where physics would NOT derive it
//  - a MANUAL tidal lock (tidalLockManual)
//  - a GM albedo OVERRIDE (body.overrides.albedo)
//  - hand-authored TAGS (faction/…, plot/…)
//  - a brown dwarf (self-luminous fields are derived and must re-derive, not persist)
function buildStarmap(): { starmap: any; system: System } {
  const system: System = {
    id: 'sys', name: 'Sys', seed: 'seed', epochT0: 0, age_Gyr: 6,
    nodes: [
      { id: 'star', name: 'Star', kind: 'body', parentId: null, roleHint: 'star', massKg: 0.4 * 1.989e30,
        radiusKm: 280000, temperatureK: 3200, radiationOutput: 0.02, classes: ['star/M'], axial_tilt_deg: 0, rotation_period_hours: 800 },
      { id: 'a', name: 'A', kind: 'body', parentId: 'star', roleHint: 'planet', massKg: 1.0 * EARTH, radiusKm: R_E,
        axial_tilt_deg: 23, rotation_period_hours: 24, makeup: { metal: 0.32, rock: 0.68 },
        atmosphere: { name: 'N2', main: 'N2', composition: { N2: 0.78, O2: 0.21, CO2: 0.01 }, pressure_bar: 1 } as any,
        hydrosphere: { composition: 'water', coverage: 0.6 },
        overrides: { albedo: 0.85 } as any, classes: [],
        tags: [{ key: 'faction/red-syndicate' }, { key: 'plot/the-lost-fleet' }],
        orbit: { hostId: 'star', elements: { a_AU: 0.18, e: 0.02, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } } as any,
      { id: 'moon', name: 'Moon', kind: 'body', parentId: 'a', roleHint: 'moon', massKg: 0.01 * EARTH, radiusKm: 0.3 * R_E,
        axial_tilt_deg: 0, rotation_period_hours: 200, tidalLockManual: true, tidallyLocked: true, makeup: { rock: 0.7, ice: 0.3 }, classes: [],
        orbit: { hostId: 'a', elements: { a_AU: 0.002, e: 0.01, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } } as any,
      { id: 'b', name: 'B', kind: 'body', parentId: 'star', roleHint: 'planet', massKg: 1.0 * EARTH, radiusKm: R_E,
        axial_tilt_deg: 0, rotation_period_hours: 24, makeup: { metal: 0.32, rock: 0.68 }, autoClassify: false, classes: ['planet/lava'],
        orbit: { hostId: 'star', elements: { a_AU: 3.0, e: 0.02, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } } as any,
      { id: 'bd', name: 'BD', kind: 'body', parentId: 'star', roleHint: 'planet', massKg: 40 * M_JUP_KG, radiusKm: 10.5 * R_E,
        axial_tilt_deg: 0, rotation_period_hours: 10, makeup: { gas: 0.92, ice: 0.08 }, classes: [],
        orbit: { hostId: 'star', elements: { a_AU: 8, e: 0.02, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } } as any
    ]
  } as any;
  const starmap = { name: 'Map', systems: [{ id: 'node', name: 'Sys', system }] };
  return { starmap, system };
}

describe('save → load round-trip is lossless and lean', () => {
  const pack = loadRulePack();
  const get = (sys: System, id: string) => sys.nodes.find((n) => n.id === id) as CelestialBody;

  it('preserves all authored data, strips derived, and re-derives identically', () => {
    const { starmap } = buildStarmap();
    // Baseline: process as the live app would.
    starmap.systems[0].system = systemProcessor.process(starmap.systems[0].system, pack);
    const base = starmap.systems[0].system as System;
    const baseBD = get(base, 'bd');
    expect((baseBD as any).isSelfLuminous).toBe(true); // sanity: the BD self-heated in the baseline

    // SAVE: strip a clone for export.
    const saved = stripStarmapForExport(starmap, pack);
    const savedSys = saved.systems[0].system as System;

    // --- Authored data MUST survive the strip ---
    expect(get(savedSys, 'star').temperatureK).toBe(3200);          // star temp = authored input
    expect((get(savedSys, 'star') as any).radiationOutput).toBe(0.02); // star luminosity = authored input
    expect(get(savedSys, 'star').classes).toEqual(['star/M']);
    expect(get(savedSys, 'b').classes).toEqual(['planet/lava']);    // GM-pinned class kept
    expect((get(savedSys, 'b') as any).autoClassify).toBe(false);
    expect(get(savedSys, 'moon').tidallyLocked).toBe(true);         // MANUAL tidal lock kept
    expect((get(savedSys, 'moon') as any).tidalLockManual).toBe(true);
    expect((get(savedSys, 'a') as any).overrides?.albedo).toBe(0.85); // GM override kept
    const aTags = (get(savedSys, 'a').tags ?? []).map((t) => t.key);
    expect(aTags).toContain('faction/red-syndicate');              // hand-authored tags kept
    expect(aTags).toContain('plot/the-lost-fleet');

    // --- Derived data MUST be gone from the saved file ---
    const a = get(savedSys, 'a') as any;
    for (const f of ['temperatureK', 'apparentColor', 'classification', 'magnetism', 'stellarRadiation',
      'surfaceRadiation', 'habitabilityBreakdown', 'orbitalBoundaries', 'internalHeatK']) {
      expect(a[f], `derived field ${f} should be stripped`).toBeUndefined();
    }
    expect((get(savedSys, 'bd') as any).isSelfLuminous).toBeUndefined(); // BD self-lum fields stripped
    expect((get(savedSys, 'a').tags ?? []).some((t) => /^(magnetic|thermal|stability|habitability)\//.test(t.key)))
      .toBe(false); // derived tags stripped

    // --- LOAD: fix-up + re-process the saved file, and confirm it reproduces the baseline ---
    const reloaded = systemProcessor.process(fixUpImportedSystem(JSON.parse(JSON.stringify(savedSys)), pack), pack);
    for (const id of ['a', 'moon', 'b', 'bd']) {
      const bt = get(base, id), rt = get(reloaded, id);
      expect(Math.round(rt.temperatureK ?? 0)).toBe(Math.round(bt.temperatureK ?? 0));
      expect(rt.classes?.[0]).toBe(bt.classes?.[0]);
      // No tag DUPLICATION on the round-trip (same tag key never appears twice).
      const keys = (rt.tags ?? []).map((t) => t.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
    expect((get(reloaded, 'moon') as any).tidallyLocked).toBe(true);    // manual lock survived reload
    expect(get(reloaded, 'b').classes).toEqual(['planet/lava']);        // pin survived reload
    expect((get(reloaded, 'bd') as any).isSelfLuminous).toBe(true);     // self-luminosity re-derived

    // --- The saved file is genuinely SMALLER than the full processed one ---
    const fullBytes = JSON.stringify(base).length;
    const leanBytes = JSON.stringify(savedSys).length;
    console.log(`save size: full ${fullBytes} → lean ${leanBytes} bytes (${Math.round((1 - leanBytes / fullBytes) * 100)}% smaller)`);
    expect(leanBytes).toBeLessThan(fullBytes * 0.75);
  });
});
