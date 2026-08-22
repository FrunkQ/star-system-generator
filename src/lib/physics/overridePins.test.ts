// THE NEW PINS, AGAINST THE CASE THAT ASKED FOR THEM (G37 phase 3).
//
// The feature exists because a user wanted a moon past the habitable zone at 1100 K — not tidal, not
// a greenhouse, nothing the model can account for — plus "negative albedo" and a 70 tesla
// terrestrial magnetosphere. These are those worlds, built and processed, with the consequences
// followed through rather than the pin merely being read back.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SystemProcessor } from '$lib/core/SystemProcessor';
import { setOverride, clearOverride } from './overrides';
import { meanSurfaceTempK } from './surfaceTemperature';
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

/** A cold outer moon, 5.2 AU out — the shape of world the whole workstream was requested for. */
function coldMoon(extra: Record<string, unknown> = {}): CelestialBody {
  return {
    id: 'p', kind: 'body', name: 'Callisto', roleHint: 'moon', parentId: 'star',
    massKg: EARTH_MASS_KG * 0.025, radiusKm: EARTH_RADIUS_KM * 0.378,
    axial_tilt_deg: 0, rotation_period_hours: 400,
    tags: [], classes: [], makeup: { metal: 0.1, rock: 0.5, carbon: 0, ice: 0.4, gas: 0 },
    orbit: { hostId: 'star', elements: { a_AU: 5.2, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } },
    ...extra
  } as unknown as CelestialBody;
}

function systemWith(body: CelestialBody): System {
  return {
    id: 'sys', name: 'Test', seed: 'seed', epochT0: 0, age_Gyr: 4.6,
    rulePackId: 'test', rulePackVersion: '1', tags: [],
    nodes: [
      { id: 'star', name: 'Star', kind: 'body', parentId: null, roleHint: 'star',
        massKg: 1.989e30, radiusKm: 696340, temperatureK: 5778, radiationOutput: 1,
        classes: ['star/G'], axial_tilt_deg: 0, rotation_period_hours: 600 },
      body
    ]
  } as unknown as System;
}
const run = (b: CelestialBody) => new SystemProcessor().process(systemWith(b), pack).nodes.find((n) => n.id === 'p') as CelestialBody;
const tagKeys = (b: CelestialBody) => (b.tags ?? []).map((t) => t.key);

describe('the 1100 K moon — the case that asked for this feature', () => {
  it('is cold when nothing is pinned', () => {
    expect(meanSurfaceTempK(run(coldMoon()))).toBeLessThan(150);
  });

  it('reaches the pinned MEAN exactly, and it is the mean that lands there (owner Q5)', () => {
    const b = coldMoon();
    setOverride(b, 'surfaceTempK', 1100);
    const out = run(b);
    expect(meanSurfaceTempK(out)).toBeCloseTo(1100, 0);
  });

  it('and the classifier follows it — the reading it keys on is the mean (surface-temp notes §2)', () => {
    // An Earth-sized world, where the winning fingerprint IS temperature-keyed. (The small moon
    // above stays a mesoplanet however hot it gets, and correctly so: its winning bands are radius
    // and mass. A class that moved there would mean the classifier was reading the wrong thing.)
    const earth = () => coldMoon({
      roleHint: 'planet', massKg: EARTH_MASS_KG, radiusKm: EARTH_RADIUS_KM,
      rotation_period_hours: 24, makeup: { metal: 0.32, rock: 0.68, carbon: 0, ice: 0, gas: 0 },
      orbit: { hostId: 'star', elements: { a_AU: 1, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }
    });
    const b = earth();
    setOverride(b, 'surfaceTempK', 1400);
    const hot = run(b);
    expect(meanSurfaceTempK(hot)).toBeCloseTo(1400, 0);
    expect(hot.classes).toContain('planet/lava');
    expect(run(earth()).classes).not.toContain('planet/lava');
  });

  it('the day and night sides keep their swing about the pin — it is not made isothermal', () => {
    const plain = run(coldMoon());
    const b = coldMoon();
    setOverride(b, 'surfaceTempK', 1100);
    const pinned = run(b);
    const diurnal = (x: CelestialBody) =>
      x.temperatureProfile!.components.find((c) => c.source === 'diurnal')!;
    const before = diurnal(plain), after = diurnal(pinned);
    // A pin that simply returned itself from `compose` would have handed the profile two identical
    // hemispheres and flattened this world. The scale is linear in temperature, so the RATIO of the
    // two sides survives untouched while the mean lands on the pin.
    expect(after.highK).toBeGreaterThan(after.lowK);
    expect(after.highK / after.lowK).toBeCloseTo(before.highK / before.lowK, 1);
    expect(after.lowK).toBeGreaterThan(before.highK);   // the whole swing has moved up
  });

  it('the tags move with it — the pin is physics, not a label', () => {
    const cold = tagKeys(run(coldMoon()));
    const b = coldMoon();
    setOverride(b, 'surfaceTempK', 1100);
    const hot = tagKeys(run(b));
    // Ice cannot exist at 1100 K, and the engine agrees without being told: the icy shell, the
    // sublimation activity and the volatile ices are all gone.
    expect(cold).toContain('structure/icy-shell');
    expect(hot).not.toContain('structure/icy-shell');
    expect(cold).toContain('activity/sublimating');
    expect(hot).not.toContain('activity/sublimating');
  });

  it('resetting hands it straight back to the physics', () => {
    const b = coldMoon();
    setOverride(b, 'surfaceTempK', 1100);
    const hot = run(b);
    clearOverride(hot, 'surfaceTempK');
    expect(meanSurfaceTempK(run(hot))).toBeLessThan(150);
  });

  it('a pin BELOW the physics is an anomalous sink, and is honoured just as readily', () => {
    const warm = coldMoon({ orbit: { hostId: 'star', elements: { a_AU: 1, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } });
    setOverride(warm, 'surfaceTempK', 20);
    expect(meanSurfaceTempK(run(warm))).toBeCloseTo(20, 0);
  });

  it('is IDEMPOTENT: the pin is an input, so a second pass lands on the same figure', () => {
    const b = coldMoon();
    setOverride(b, 'surfaceTempK', 1100);
    const once = run(b);
    const twice = run(once);
    expect(meanSurfaceTempK(twice)).toBeCloseTo(meanSurfaceTempK(once), 6);
    expect(twice.equilibriumTempK).toBeCloseTo(once.equilibriumTempK!, 6);
  });
});

describe('negative albedo — energy amplification, kept and labelled', () => {
  it('was IGNORED before and is honoured now', () => {
    const plain = run(coldMoon());
    const b = coldMoon();
    setOverride(b, 'albedo', -2);
    const amplified = run(b);
    expect(amplified.albedoBreakdown?.albedo).toBe(-2);
    // (1 − A) = 3, so the equilibrium temperature rises by 3^0.25 ≈ 1.316.
    expect(amplified.equilibriumTempK!).toBeGreaterThan(plain.equilibriumTempK!);
    expect(amplified.equilibriumTempK! / plain.equilibriumTempK!).toBeCloseTo(Math.pow(3 / (1 - plain.albedoBreakdown!.albedo), 0.25), 2);
  });

  it('says so on the breakdown the Newton panel reads', () => {
    const b = coldMoon();
    setOverride(b, 'albedo', -2);
    expect(run(b).albedoBreakdown?.note).toMatch(/NEGATIVE/);
  });

  it('a PERFECT MIRROR absorbs nothing and reads 0 K rather than NaN', () => {
    const b = coldMoon();
    setOverride(b, 'albedo', 1.5);
    const out = run(b);
    expect(Number.isFinite(out.equilibriumTempK!)).toBe(true);
    expect(out.equilibriumTempK).toBe(0);
    expect(Number.isFinite(meanSurfaceTempK(out))).toBe(true);
  });
});

describe('a 70 tesla terrestrial — out of class is a STATUS, never a refusal', () => {
  const terrestrial = () => coldMoon({
    id: 'p', roleHint: 'planet', massKg: EARTH_MASS_KG, radiusKm: EARTH_RADIUS_KM,
    rotation_period_hours: 24, makeup: { metal: 0.32, rock: 0.68, carbon: 0, ice: 0, gas: 0 },
    orbit: { hostId: 'star', elements: { a_AU: 1, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }
  });

  it('commits the pinned field verbatim, however absurd', () => {
    const b = terrestrial();
    setOverride(b, 'magneticFieldGauss', 700000);   // 70 T
    expect(run(b).magneticField?.strengthGauss).toBe(700000);
  });

  it('and labels it anomalous rather than claiming the interior made it', () => {
    const b = terrestrial();
    setOverride(b, 'magneticFieldGauss', 700000);
    expect(tagKeys(run(b))).toContain('magnetic/anomalous');
    expect(tagKeys(run(b))).not.toContain('magnetic/dynamo');
  });

  it('but a field the interior COULD make keeps its dynamo tag — the band is the model’s own', () => {
    const b = terrestrial();
    const derived = run(terrestrial()).magnetism!;
    setOverride(b, 'magneticFieldGauss', (derived.estimatedRangeGauss.min + derived.estimatedRangeGauss.max) / 2);
    expect(tagKeys(run(b))).toContain('magnetic/dynamo');
  });

  it('zeroing the field still strips the shielding, as it always did', () => {
    const b = terrestrial();
    setOverride(b, 'magneticFieldGauss', 0);
    expect(tagKeys(run(b))).toContain('magnetic/unshielded');
  });
});

describe('a pinned pressure survives the escape model', () => {
  // An opted-in world whose air the erosion pass would otherwise take away.
  const airyMoon = () => coldMoon({
    evolveAtmosphere: true,
    atmosphere: { pressure_bar: 4, composition: { N2: 0.8, O2: 0.2 } }
  });

  it('erodes without a pin', () => {
    expect(run(airyMoon()).atmosphere!.pressure_bar).toBeLessThan(4);
  });

  it('holds at the pin with one — air this world could never have kept', () => {
    const b = airyMoon();
    setOverride(b, 'pressureBar', 4);
    expect(run(b).atmosphere!.pressure_bar).toBe(4);
  });

  it('and the pin is idempotent across passes', () => {
    const b = airyMoon();
    setOverride(b, 'pressureBar', 40);
    const once = run(b);
    expect(run(once).atmosphere!.pressure_bar).toBe(40);
  });

  it('does nothing to a world with no air at all — the GM must give it some first', () => {
    const b = coldMoon();
    setOverride(b, 'pressureBar', 4);
    expect(run(b).atmosphere).toBeUndefined();
  });
});
