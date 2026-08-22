// THE MANTRA, AS ASSERTIONS. G37's one rule is that a GM may author what they like, the program does
// not STOP them, and it WARNS them it is not right — so the tests that matter here are the ones that
// would fail if someone "helpfully" added a clamp, and the ones that hold the roster to being the
// single description of every override.
import { describe, it, expect } from 'vitest';
import type { CelestialBody } from '$lib/types';
import {
  OVERRIDE_DEFS, overrideDefsFor, overrideStatus, overrideWarning, setOverride, clearOverride,
  formatOverrideValue, overrideDef
} from './overrides';
import { EARTH_MASS_KG, EARTH_RADIUS_KM } from '$lib/constants';

const planet = (extra: Partial<CelestialBody> = {}): CelestialBody => ({
  id: 'p', kind: 'body', name: 'Test', roleHint: 'planet',
  massKg: EARTH_MASS_KG, radiusKm: EARTH_RADIUS_KM,
  equilibriumTempK: 255, tags: [], classes: [],
  makeup: { metal: 0.3, rock: 0.7, carbon: 0, ice: 0, gas: 0 },
  ...extra
} as unknown as CelestialBody);

describe('the roster is the single description of every override', () => {
  it('every record is complete and its bounds contain its slider', () => {
    for (const d of OVERRIDE_DEFS) {
      expect(d.label, d.key).toBeTruthy();
      expect(d.hint, d.key).toBeTruthy();
      expect(d.absurd, d.key).toBeTruthy();
      expect(d.appliesTo.length, d.key).toBeGreaterThan(0);
      expect(d.soft[0], d.key).toBeLessThan(d.soft[1]);
      // The typed range must REACH FURTHER than the slider in both directions or equal it — the
      // slider is the ordinary range, the hard pair is the absurd one.
      expect(d.hard[0], d.key).toBeLessThanOrEqual(d.soft[0]);
      expect(d.hard[1], d.key).toBeGreaterThanOrEqual(d.soft[1]);
      expect(Number.isFinite(d.hard[0]) && Number.isFinite(d.hard[1]), d.key).toBe(true);
    }
  });

  it('keys are unique, so no override can be described twice', () => {
    const keys = OVERRIDE_DEFS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('offers a star its own overrides and a planet its own', () => {
    expect(overrideDefsFor(planet()).map((d) => d.key)).not.toContain('flareActivity');
    expect(overrideDefsFor(planet({ roleHint: 'star' } as Partial<CelestialBody>)).map((d) => d.key))
      .toEqual(['flareActivity']);
    // A belt has nothing to pin, and saying so is a real answer rather than an empty tab by accident.
    expect(overrideDefsFor(planet({ roleHint: 'belt' } as Partial<CelestialBody>))).toEqual([]);
  });
});

describe('WARN, NEVER STOP', () => {
  it('keeps a negative albedo and labels it rather than clamping it', () => {
    const b = planet();
    setOverride(b, 'albedo', -2);
    expect(b.overrides?.albedo).toBe(-2);                     // NOT clamped to 0
    const s = overrideStatus(b, overrideDef('albedo')!);
    expect(s.pinned).toBe(true);
    expect(s.warning).toMatch(/below the plausible range/);
    expect(s.warning).toMatch(/returns more energy than its star delivers/);
  });

  it('keeps a 70 tesla terrestrial magnetosphere — the owner asked for it by name', () => {
    const b = planet({ magnetism: { source: 'iron-core', geometry: 'dipolar', intrinsic: true, estimatedRangeGauss: { min: 0.1, max: 0.7 }, nominalGauss: 0.5, notes: [] } } as Partial<CelestialBody>);
    setOverride(b, 'magneticFieldGauss', 700000);
    expect(b.overrides?.magneticFieldGauss).toBe(700000);
    expect(overrideStatus(b, overrideDef('magneticFieldGauss')!).warning)
      .toMatch(/above the plausible range/);
  });

  it('says nothing at all while a figure sits inside its band', () => {
    const b = planet();
    setOverride(b, 'albedo', 0.3);
    expect(overrideStatus(b, overrideDef('albedo')!).warning).toBeNull();
  });

  it('the ONLY limit is the absurd-but-finite hard pair, so a typo cannot reach infinity', () => {
    const b = planet();
    setOverride(b, 'albedo', -1e9);
    expect(b.overrides?.albedo).toBe(overrideDef('albedo')!.hard[0]);
    setOverride(b, 'albedo', Number.POSITIVE_INFINITY);
    expect(Number.isFinite(b.overrides!.albedo!)).toBe(true);
    setOverride(b, 'albedo', Number.NaN);
    expect(Number.isFinite(b.overrides!.albedo!)).toBe(true);   // NaN is refused, not stored
  });
});

describe('reset hands the quantity back, and takes its stated reason with it', () => {
  it('deletes the key, and the whole object once it is empty', () => {
    const b = planet();
    setOverride(b, 'albedo', 0.9);
    clearOverride(b, 'albedo');
    expect(b.overrides).toBeUndefined();
  });

  it('leaves the other pins alone', () => {
    const b = planet();
    setOverride(b, 'albedo', 0.9);
    setOverride(b, 'radiogenicHeatK', 1100);
    clearOverride(b, 'albedo');
    expect(b.overrides?.albedo).toBeUndefined();
    expect(b.overrides?.radiogenicHeatK).toBe(1100);
  });

  it('a reset takes the anomaly assignment with it — a reason with nothing to explain is clutter', () => {
    const b = planet();
    setOverride(b, 'radiogenicHeatK', 1100);
    b.overrides!.anomalies = { radiogenicHeatK: { tag: 'anomaly/magic' }, albedo: { tag: 'anomaly/magic' } };
    clearOverride(b, 'radiogenicHeatK');
    expect(b.overrides?.anomalies?.radiogenicHeatK).toBeUndefined();
    expect(b.overrides?.anomalies?.albedo).toEqual({ tag: 'anomaly/magic' });  // shared reason, other pin keeps it
  });
});

describe('a pin whose target is AUTHORED input carries its own consequence (OVR-2)', () => {
  const giant = () => planet({
    massKg: EARTH_MASS_KG * 317.8, radiusKm: EARTH_RADIUS_KM * 11.2,
    makeup: { metal: 0, rock: 0, carbon: 0, ice: 0.1, gas: 0.9 }
  } as Partial<CelestialBody>);

  it('pinning thermal inflation moves the radius, because process() never will', () => {
    const b = giant();
    const before = b.radiusKm!;
    setOverride(b, 'gasThermalInflation', 2.2);
    expect(b.radiusKm).not.toBe(before);
    expect(b.radiusKm!).toBeGreaterThan(before * 1.2);
  });

  it('and resetting it puts the radius back on the derived figure', () => {
    const b = giant();
    setOverride(b, 'gasThermalInflation', 2.2);
    const inflated = b.radiusKm!;
    clearOverride(b, 'gasThermalInflation');
    expect(b.radiusKm!).toBeLessThan(inflated);
  });
});

describe('one formatter, so a figure reads the same on the tab, the badge and the trace', () => {
  it('carries the unit and drops trailing zeros', () => {
    expect(formatOverrideValue(overrideDef('radiogenicHeatK')!, 1100)).toBe('1100 K');
    expect(formatOverrideValue(overrideDef('albedo')!, 0.3)).toBe('0.3');
    expect(formatOverrideValue(overrideDef('albedo')!, undefined)).toBe('—');
  });

  it('goes exponential rather than printing a wall of digits', () => {
    expect(formatOverrideValue(overrideDef('magneticFieldGauss')!, 700000)).toBe('7.00e+5 G');
  });
});

describe('a band is a band, never a limit', () => {
  it('produces prose on both sides and nothing inside', () => {
    const def = overrideDef('albedo')!;
    const b = planet();
    expect(overrideWarning(def, b, 0.5)).toBeNull();
    expect(overrideWarning(def, b, -0.1)).toContain('below');
    expect(overrideWarning(def, b, 1.4)).toContain('above');
  });
});
