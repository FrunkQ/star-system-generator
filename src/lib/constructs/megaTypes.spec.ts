// G53 phase 1: the registry's own integrity, held as a gate. The value of a roster (G37's argument)
// is that every record obeys one contract — so the contract is asserted here, over every record at
// once, and an eighth type that breaks it fails the suite rather than drifting.
import { describe, it, expect } from 'vitest';
import type { CelestialBody } from '$lib/types';
import { MEGA_TYPE_DEFS, megaTypeDef, defaultMegaParams, instanceMegaParams } from './megaTypes';
import { CONSTRUCT_ICON_SHAPES } from './constructIcon';

/** A minimal processed planet-ish host — enough for every seed and derivation to run. */
const host = (over: Partial<CelestialBody> = {}): CelestialBody =>
  ({
    id: 'h', name: 'Testworld', parentId: null, tags: [],
    kind: 'body', roleHint: 'planet',
    massKg: 5.972e24, radiusKm: 6371, rotation_period_hours: 23.934,
    orbitalBoundaries: {
      minLeoKm: 200, leoMoeBoundaryKm: 2000, meoHeoBoundaryKm: 50000,
      heoUpperBoundaryKm: 1.5e6, geoStationaryKm: 35786, isGeoFallback: false
    },
    ...over
  }) as CelestialBody;

const KNOWN_HARD = new Set(['hostKind', 'hasSurface', 'hostIsStar', 'needsGeostationary']);
const KNOWN_STEER = new Set(['geoBelowHillFraction', 'inHabitableZone', 'maxPlacementAU', 'minHostMassKg', 'maxHostMassKg']);

describe('mega-type registry integrity', () => {
  it('keys are unique and lookup finds each record (unknown keys degrade to undefined)', () => {
    const keys = MEGA_TYPE_DEFS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(megaTypeDef(k)?.key).toBe(k);
    expect(megaTypeDef('shkadov-thruster')).toBeUndefined(); // not built yet — degrades, no throw
    expect(megaTypeDef(undefined)).toBeUndefined();
  });

  it('every record carries the display contract: label, one-line hint, a glyph from the ONE vocabulary, an explain', () => {
    for (const d of MEGA_TYPE_DEFS) {
      expect(d.label.length, d.key).toBeGreaterThan(0);
      expect(d.hint.length, d.key).toBeGreaterThan(0);
      expect(CONSTRUCT_ICON_SHAPES, `${d.key} icon must come from constructIcon.ts (A34)`).toContain(d.icon);
      // The grey sentence interpolates the host by name — a reason a GM can read.
      expect(d.explain, d.key).toContain('{host}');
    }
  });

  it('requires uses only the implemented vocabulary, and inHabitableZone is NEVER a hard clause', () => {
    for (const d of MEGA_TYPE_DEFS) {
      for (const k of Object.keys(d.requires.hard ?? {})) expect(KNOWN_HARD.has(k), `${d.key} hard.${k}`).toBe(true);
      for (const k of Object.keys(d.requires.steer ?? {})) expect(KNOWN_STEER.has(k), `${d.key} steer.${k}`).toBe(true);
      // §3.5, the owner's rule: the goldilocks zone is a RECOMMENDATION. A hard inHabitableZone
      // clause would refuse a legitimate cold ring, which is exactly what steer-do-not-stop forbids.
      expect((d.requires.hard as Record<string, unknown> | undefined)?.inHabitableZone, d.key).toBeUndefined();
    }
  });

  it('params are OverrideDef-shaped: unique keys, soft inside hard, sane steps, warnings worded', () => {
    for (const d of MEGA_TYPE_DEFS) {
      const keys = d.params.map((p) => p.key);
      expect(new Set(keys).size, d.key).toBe(keys.length);
      for (const p of d.params) {
        expect(p.soft[0], `${d.key}.${p.key} soft low`).toBeGreaterThanOrEqual(p.hard[0]);
        expect(p.soft[1], `${d.key}.${p.key} soft high`).toBeLessThanOrEqual(p.hard[1]);
        expect(p.step, `${d.key}.${p.key}`).toBeGreaterThan(0);
        expect(p.absurd.length, `${d.key}.${p.key} amber sentence`).toBeGreaterThan(0);
        // The two-tier rule: whoever declares a possible band owes the red sentence too.
        if (p.possible) expect(p.breaks?.length, `${d.key}.${p.key} red sentence`).toBeGreaterThan(0);
      }
    }
  });

  it('seeds are numbers inside their own hard bounds, and derive/shape run clean on the defaults', () => {
    const h = host();
    const star = host({ roleHint: 'star', massKg: 1.989e30, radiusKm: 696340, orbitalBoundaries: undefined });
    for (const d of MEGA_TYPE_DEFS) {
      for (const target of [h, star]) {
        const params = defaultMegaParams(d, target);
        for (const p of d.params) {
          const v = params[p.key];
          expect(Number.isFinite(v), `${d.key}.${p.key} seed`).toBe(true);
          expect(v, `${d.key}.${p.key} seed >= hard floor`).toBeGreaterThanOrEqual(p.hard[0]);
          expect(v, `${d.key}.${p.key} seed <= hard ceiling`).toBeLessThanOrEqual(p.hard[1]);
        }
        expect(() => d.derive(params, target), `${d.key} derive`).not.toThrow();
        expect(() => d.shape(params, target), `${d.key} shape`).not.toThrow();
      }
    }
  });

  it('derive and shape are pure: same inputs give equal outputs and the host is never written', () => {
    for (const d of MEGA_TYPE_DEFS) {
      const h = host();
      const before = JSON.stringify(h);
      const params = defaultMegaParams(d, h);
      const a = d.derive(params, h);
      const b = d.derive(params, h);
      expect(a, d.key).toEqual(b);
      expect(d.shape(params, h), d.key).toEqual(d.shape(params, h));
      // "changes no authored value", enforced at the function level: derive/shape read the host
      // and must never reach into it (steer-do-not-stop one level down).
      expect(JSON.stringify(h), `${d.key} mutated its host`).toBe(before);
    }
  });

  it('every derived figure is finite and carries no NaN into a card', () => {
    const h = host();
    for (const d of MEGA_TYPE_DEFS) {
      const out = d.derive(defaultMegaParams(d, h), h) as Record<string, unknown>;
      for (const [k, v] of Object.entries(out)) {
        if (typeof v === 'number') expect(Number.isFinite(v), `${d.key}.${k}`).toBe(true);
      }
    }
  });
});

describe('instanceMegaParams — the ONE seed/instance merge (G58 knob editor)', () => {
	const d = () => megaTypeDef('ringworld')!;
	const sol = { id: 'sol', kind: 'body', roleHint: 'star', radiusKm: 696340, tags: [] } as any;

	it('no stored params = the seeds, so old saves keep flowing with seed improvements', () => {
		expect(instanceMegaParams({} as any, d(), sol)).toEqual(defaultMegaParams(d(), sol));
	});

	it('stored keys override their seed; everything else stays seeded (sparse overlay)', () => {
		const out = instanceMegaParams({ megaParams: { widthKm: 8e5 } } as any, d(), sol);
		expect(out.widthKm).toBe(8e5);
		expect(out.radiusAU).toBe(defaultMegaParams(d(), sol).radiusAU);
	});

	it('unknown keys are dropped and non-finite values fall back to the seed — a save from a newer build degrades, never poisons', () => {
		const out = instanceMegaParams({ megaParams: { widthKm: Number.POSITIVE_INFINITY, mystery: 3 } } as any, d(), sol);
		expect(out.widthKm).toBe(defaultMegaParams(d(), sol).widthKm);
		expect('mystery' in out).toBe(false);
	});
});
