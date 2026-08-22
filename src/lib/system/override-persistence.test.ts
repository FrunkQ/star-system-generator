// WHAT SURVIVES A SAVE, WHAT IS THROWN AWAY, AND WHAT COMES BACK (G37).
//
// The load path DELIBERATELY DELETES most of what a body carries, so the engine re-derives it —
// that is `importFixup`, and it is why a stale figure in an old file cannot shadow the model
// (DATA-R8). A feature that adds AUTHORED data has to prove two opposite things about that:
//
//   1. every pin, every companion setting and every stated reason SURVIVES, byte for byte;
//   2. everything DERIVED from them is thrown away and rebuilt, so a reload cannot preserve a stale
//      consequence of a pin that has since changed.
//
// And the two together: `process(load(save(process(x))))` must equal `process(x)` on every field.
// That is stronger than the idempotence test, which never leaves memory, and stronger than the
// round-trip test, which checks a handful of named fields.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SystemProcessor } from '$lib/core/SystemProcessor';
import { fixUpImportedSystem, stripSystemForExport } from './importFixup';
import { setOverride } from '$lib/physics/overrides';
import { meanSurfaceTempK } from '$lib/physics/surfaceTemperature';
import { EARTH_MASS_KG, EARTH_RADIUS_KM } from '$lib/constants';
import type { System, CelestialBody, RulePack } from '$lib/types';

function isObject(x: unknown) { return !!x && typeof x === 'object' && !Array.isArray(x); }
function deepMerge(t: Record<string, unknown>, s: Record<string, unknown>): Record<string, unknown> {
  const o = { ...t };
  if (isObject(t) && isObject(s)) {
    for (const k of Object.keys(s)) {
      o[k] = isObject(s[k]) && k in t
        ? deepMerge(t[k] as Record<string, unknown>, s[k] as Record<string, unknown>)
        : s[k];
    }
  }
  return o;
}
function loadRulePack(): RulePack {
  const base = path.resolve('static/rulepacks/starter-sf');
  let pack = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8'));
  for (const f of ['liquids.json', 'classification.json', 'atmospheres.json', 'planets.json', 'stars.json']) {
    const p = path.join(base, f);
    if (fs.existsSync(p)) pack = deepMerge(pack, JSON.parse(fs.readFileSync(p, 'utf-8')));
  }
  return pack as RulePack;
}
const pack = loadRulePack();
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** A world with EVERY body-level pin set at once, plus a star with the one that is its own. */
function pinnedSystem(): System {
  const planet = {
    id: 'p', kind: 'body', name: 'Contradiction', roleHint: 'planet', parentId: 'star',
    massKg: EARTH_MASS_KG, radiusKm: EARTH_RADIUS_KM,
    axial_tilt_deg: 20, rotation_period_hours: 24,
    tags: [], classes: [], makeup: { metal: 0.32, rock: 0.68, carbon: 0, ice: 0, gas: 0 },
    evolveAtmosphere: true,
    atmosphere: { pressure_bar: 1, composition: { N2: 0.78, O2: 0.22 } },
    orbit: { hostId: 'star', elements: { a_AU: 1, e: 0.02, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }
  } as unknown as CelestialBody;

  setOverride(planet, 'albedo', -2);
  setOverride(planet, 'radiogenicHeatK', 1100);
  setOverride(planet, 'magneticFieldGauss', 700000);
  setOverride(planet, 'surfaceTempK', 900);
  setOverride(planet, 'pressureBar', 40);
  setOverride(planet, 'gasThermalInflation', 1.4);
  planet.overrides!.densityHold = 'radius';
  setOverride(planet, 'densityGcm3', 0.5);
  planet.overrides!.anomalies = {
    albedo: { tag: 'anomaly/exotic-matter' },
    radiogenicHeatK: { tag: 'anomaly/precursor-engineering', secret: true },
    densityGcm3: { tag: 'anomaly/exotic-matter' }
  };

  const star = {
    id: 'star', kind: 'body', name: 'Star', parentId: null, roleHint: 'star',
    massKg: 1.989e30, radiusKm: 696340, temperatureK: 5778, radiationOutput: 1,
    classes: ['star/G2V'], axial_tilt_deg: 0, rotation_period_hours: 600, tags: []
  } as unknown as CelestialBody;
  setOverride(star, 'flareActivity', 0.9);

  return {
    id: 'sys', name: 'Test', seed: 'seed', epochT0: 0, age_Gyr: 4.6,
    rulePackId: 'test', rulePackVersion: '1', tags: [], nodes: [star, planet]
  } as unknown as System;
}

const bodyOf = (s: System, id: string) => s.nodes.find((n) => n.id === id) as CelestialBody;
const process = (s: System) => new SystemProcessor().process(s, pack);
/** Exactly what the app does between one session and the next. */
const saveAndLoad = (s: System) => fixUpImportedSystem(clone(stripSystemForExport(clone(s), pack)), pack);

describe('every authored pin survives a save', () => {
  const saved = stripSystemForExport(clone(process(pinnedSystem())), pack);

  it('keeps all eight pins, verbatim', () => {
    expect(bodyOf(saved, 'p').overrides).toMatchObject({
      albedo: -2,
      radiogenicHeatK: 1100,
      magneticFieldGauss: 700000,
      surfaceTempK: 900,
      pressureBar: 40,
      gasThermalInflation: 1.4,
      densityGcm3: 0.5
    });
    expect(bodyOf(saved, 'star').overrides).toEqual({ flareActivity: 0.9 });
  });

  it('keeps the density HOLD, which is not a number and could have been dropped by a numeric strip', () => {
    expect(bodyOf(saved, 'p').overrides!.densityHold).toBe('radius');
  });

  it('keeps every stated reason, including the secret flag', () => {
    expect(bodyOf(saved, 'p').overrides!.anomalies).toEqual({
      albedo: { tag: 'anomaly/exotic-matter' },
      radiogenicHeatK: { tag: 'anomaly/precursor-engineering', secret: true },
      densityGcm3: { tag: 'anomaly/exotic-matter' }
    });
  });

  it('keeps the mass and radius a pin MOVED — they are authored once the pin has moved them', () => {
    const p = bodyOf(saved, 'p');
    expect(p.massKg).toBeGreaterThan(0);
    expect(p.radiusKm).toBeGreaterThan(0);
    // The density pin held the radius and took the mass down with it.
    expect(p.massKg!).toBeLessThan(EARTH_MASS_KG / 5);
  });
});

describe('everything DERIVED from a pin is thrown away and rebuilt', () => {
  const saved = stripSystemForExport(clone(process(pinnedSystem())), pack);

  it('drops the anomaly TAGS — they are re-emitted from the assignment map', () => {
    const keys = (bodyOf(saved, 'p').tags ?? []).map((t) => t.key);
    expect(keys.filter((k) => k.startsWith('anomaly/'))).toEqual([]);
  });

  it('drops the committed magnetic field — the pin in `overrides` is the authored half', () => {
    expect(bodyOf(saved, 'p').magneticField).toBeUndefined();
    expect(bodyOf(saved, 'p').overrides!.magneticFieldGauss).toBe(700000);
  });

  it('drops the temperatures, the albedo breakdown and the classification', () => {
    const p = bodyOf(saved, 'p') as unknown as Record<string, unknown>;
    for (const f of ['temperatureK', 'temperatureProfile', 'albedoBreakdown', 'classification',
      'radiogenicHeatK', 'magnetism', 'geoActivity', 'equilibriumTempK']) {
      expect(p[f], `${f} should be stripped`).toBeUndefined();
    }
    expect((bodyOf(saved, 'star') as unknown as Record<string, unknown>).flareActivity).toBeUndefined();
  });
});

describe('and it all comes back identically — process(load(save(process(x)))) === process(x)', () => {
  const first = process(pinnedSystem());
  const second = process(saveAndLoad(first));

  it('reproduces the pinned surface temperature exactly', () => {
    expect(meanSurfaceTempK(bodyOf(second, 'p'))).toBeCloseTo(meanSurfaceTempK(bodyOf(first, 'p')), 6);
    expect(meanSurfaceTempK(bodyOf(second, 'p'))).toBeCloseTo(900, 0);
  });

  it('reproduces every derived consequence of every pin', () => {
    const a = bodyOf(first, 'p'), b = bodyOf(second, 'p');
    expect(b.magneticField!.strengthGauss).toBe(700000);
    expect(b.albedoBreakdown!.albedo).toBe(-2);
    expect(b.atmosphere!.pressure_bar).toBe(40);
    expect(b.equilibriumTempK).toBeCloseTo(a.equilibriumTempK!, 6);
    expect(b.calculatedGravity_ms2).toBeCloseTo(a.calculatedGravity_ms2!, 6);
    expect(b.classes).toEqual(a.classes);
    expect((bodyOf(second, 'star') as unknown as { flareActivity: number }).flareActivity).toBe(0.9);
  });

  it('re-emits the anomaly tags with their values and their secrecy', () => {
    const tags = (bodyOf(second, 'p').tags ?? []).filter((t) => t.key.startsWith('anomaly/'));
    expect(tags.map((t) => t.key).sort()).toEqual(['anomaly/exotic-matter', 'anomaly/precursor-engineering']);
    expect(tags.find((t) => t.key === 'anomaly/exotic-matter')!.value).toBe('Anomalous bond albedo, bulk density');
    expect(tags.find((t) => t.key === 'anomaly/precursor-engineering')!.secret).toBe(true);
  });

  it('leaves NO field anywhere on any body different after the trip', () => {
    // The blunt one, and the point of the file: flatten both trees to leaf paths and diff. Anything
    // the save path loses, or the load path fails to rebuild, shows up here whatever subsystem it is in.
    const flat = (s: System) => {
      const out = new Map<string, unknown>();
      const walk = (v: unknown, prefix: string, depth: number) => {
        if (depth > 8 || v === null || v === undefined) return;
        if (typeof v !== 'object') { out.set(prefix, v); return; }
        if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${prefix}[${i}]`, depth + 1)); return; }
        for (const k of Object.keys(v as object)) walk((v as Record<string, unknown>)[k], `${prefix}.${k}`, depth + 1);
      };
      for (const node of s.nodes) {
        const n = node as unknown as Record<string, unknown>;
        // Tags are a SET, not a sequence — compare them sorted (the idempotence test's own rule).
        const tags = n.tags as { key: string; value?: string }[] | undefined;
        if (Array.isArray(tags)) {
          out.set(`${n.id}.tags`, tags.map((t) => `${t.key}=${t.value ?? ''}`).sort().join('|'));
        }
        walk({ ...n, tags: undefined }, String(n.id), 0);
      }
      return out;
    };
    const a = flat(first), b = flat(second);
    const diffs: string[] = [];
    for (const k of new Set([...a.keys(), ...b.keys()])) {
      const x = a.get(k), y = b.get(k);
      const same = typeof x === 'number' && typeof y === 'number'
        ? Math.abs(x - y) < 1e-9 * Math.max(1, Math.abs(x))
        : x === y;
      if (!same) diffs.push(`${k}: ${JSON.stringify(x)} -> ${JSON.stringify(y)}`);
    }
    expect(diffs).toEqual([]);
  });
});

describe('two ways a pin could quietly destroy authored data on the next pass', () => {
  it('a pinned density does NOT let the giant reconciler rewrite the composition', () => {
    // `reconcileGiantMakeup` fires on mass > 8 M-earth AND density < 2.5 g/cm3, and REWRITES
    // `body.makeup` to a gas envelope — which is written to the body and therefore saved. A GM who
    // hollows out a heavy rocky world is stating exactly that contradiction on purpose, so the
    // reconciler must not "explain" it by turning their rock into gas.
    const sys = pinnedSystem();
    const p = bodyOf(sys, 'p');
    p.massKg = EARTH_MASS_KG * 12;
    p.radiusKm = EARTH_RADIUS_KM * 2;
    p.makeup = { metal: 0.32, rock: 0.68, carbon: 0, ice: 0, gas: 0 };
    p.overrides!.densityHold = 'mass';
    setOverride(p, 'densityGcm3', 0.5);
    const out = bodyOf(process(sys), 'p');
    expect(out.makeup!.gas ?? 0).toBeLessThan(0.1);
    expect(out.makeup!.rock ?? 0).toBeGreaterThan(0.5);
  });

  it('a pinned pressure does NOT become the primordial baseline erosion works from', () => {
    // `atmosphere0` is the PRE-EROSION atmosphere, snapshotted the first time an opted-in world is
    // processed. If the pin lands before that snapshot, the GM's pinned figure is baked in as the
    // world's own history — and resetting the pin then erodes from the pinned pressure for ever,
    // with the authored baseline gone from every save.
    const sys = pinnedSystem();
    const out = bodyOf(process(sys), 'p');
    expect(out.atmosphere0!.pressure_bar).toBe(1);   // the authored baseline, not the 40 bar pin
    expect(out.atmosphere!.pressure_bar).toBe(40);   // and the pin is what the world carries
  });
});
