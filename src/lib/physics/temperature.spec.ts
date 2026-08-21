import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { calculateDistanceToStar, solveThermalState } from './temperature';
import type { CelestialBody, RulePack } from '$lib/types';
import { LIQUIDS } from '$lib/constants';

// Phase 04.1 — eccentric orbits receive a higher time-averaged flux, so the flux-equivalent
// distance used for equilibrium temperature is a·(1−e²)^¼ (< a), not the mean a.
function star(): CelestialBody {
  return { id: 's', kind: 'body', roleHint: 'star' } as unknown as CelestialBody;
}
function planet(e: number): CelestialBody {
  return {
    id: 'p', kind: 'body', roleHint: 'planet', parentId: 's',
    orbit: { elements: { a_AU: 1, e } }
  } as unknown as CelestialBody;
}

describe('calculateDistanceToStar — eccentric rms-flux distance (04.1)', () => {
  it('a circular orbit (e=0) returns the semi-major axis unchanged', () => {
    const p = planet(0);
    expect(calculateDistanceToStar(p, star(), [star(), p])).toBeCloseTo(1, 6);
  });

  it('an eccentric orbit returns a·(1−e²)^¼ (< a → hotter)', () => {
    const p = planet(0.5);
    const expected = 1 * Math.pow(1 - 0.25, 0.25); // 0.9306…
    expect(calculateDistanceToStar(p, star(), [star(), p])).toBeCloseTo(expected, 6);
    expect(calculateDistanceToStar(p, star(), [star(), p])).toBeLessThan(1);
  });

  it('effective distance decreases monotonically with eccentricity', () => {
    const d = [0, 0.2, 0.4, 0.6].map((e) => {
      const p = planet(e);
      return calculateDistanceToStar(p, star(), [star(), p]);
    });
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeLessThan(d[i - 1]);
  });

  it("Earth-like (e≈0.017) barely moves; the correction is sub-percent", () => {
    const p = planet(0.0167);
    const d = calculateDistanceToStar(p, star(), [star(), p]);
    expect(d).toBeGreaterThan(0.9999);
    expect(d).toBeLessThan(1);
  });
});

// ── The thermal fixed point ──────────────────────────────────────────────────────────────────────
// solveThermalState closes the loop albedo → temperature → clouds → albedo. These pin the two
// things that matter about a fixed point: that it TERMINATES whatever it is handed, and that the
// answer it lands on does not depend on what the body happened to be carrying when it arrived.
describe('solveThermalState — convergence and determinism', () => {
  const gasPhysics = JSON.parse(readFileSync('static/rulepacks/starter-sf/atmospheres.json', 'utf8')).gasPhysics;
  const pack = { gasPhysics, liquids: LIQUIDS } as unknown as RulePack;

  const sun = (): CelestialBody =>
    ({ id: 'sun', kind: 'body', roleHint: 'star', tags: [], radiationOutput: 1, massKg: 1.989e30 }) as unknown as CelestialBody;
  const world = (over: Partial<CelestialBody>): CelestialBody =>
    ({
      id: 'w', kind: 'body', roleHint: 'planet', parentId: 'sun', tags: [],
      massKg: 5.97e24, radiusKm: 6371, orbit: { elements: { a_AU: 1, e: 0 } }, ...over
    }) as unknown as CelestialBody;

  const earthish = () => world({
    atmosphere: { pressure_bar: 1, composition: { N2: 0.78, O2: 0.21, CO2: 0.0004 } } as any,
    hydrosphere: { coverage: 0.71, composition: 'water' } as any
  });

  it('settles on an Earth-like world, well inside the iteration budget', () => {
    const s = solveThermalState(earthish(), [sun(), earthish()], pack);
    expect(s.converged).toBe(true);
    expect(s.iterations).toBeLessThanOrEqual(6);
    expect(s.residual).toBeLessThan(0.002);
    // Earth's own numbers fall out of it: T_eq 254 K, +33 K of greenhouse, a 287 K surface.
    expect(s.equilibriumTempK).toBeGreaterThan(245);
    expect(s.equilibriumTempK).toBeLessThan(270);
    expect(s.decks.map((d) => d.species)).toContain('water');
  });

  it('returns an answer for every body it is handed, converged or not', () => {
    // Deliberately awkward: an airless rock, a runaway greenhouse, a frozen world, a bare giant.
    const cases = [
      world({ makeup: { rock: 0.9, metal: 0.1 } }),
      world({ atmosphere: { pressure_bar: 92, composition: { CO2: 0.965, SO2: 0.00015, H2O: 0.00002 } } as any }),
      world({ orbit: { elements: { a_AU: 30, e: 0 } } as any, hydrosphere: { coverage: 1, composition: 'nitrogen' } as any }),
      world({ makeup: { gas: 0.95 }, atmosphere: { pressure_bar: 1, composition: { H2: 0.9, He: 0.1 } } as any })
    ];
    for (const c of cases) {
      const s = solveThermalState(c, [sun(), c], pack);
      expect(Number.isFinite(s.equilibriumTempK)).toBe(true);
      expect(Number.isFinite(s.surfaceTempK)).toBe(true);
      expect(s.albedoInfo.albedo).toBeGreaterThan(0);
      expect(s.iterations).toBeLessThanOrEqual(12);      // the hard bound, never exceeded
    }
  });

  it('is HISTORY-FREE: a body carrying stale temperatures solves to the same answer as a fresh one', () => {
    // The whole reason the loop builds a probe rather than reading the body: the same file loaded
    // twice used to come out at two different temperatures.
    const fresh = earthish();
    const stale = earthish();
    stale.temperatureK = 900;           // absurd leftovers from a previous run
    stale.equilibriumTempK = 900;
    stale.greenhouseTempK = 400;
    const a = solveThermalState(fresh, [sun(), fresh], pack);
    const b = solveThermalState(stale, [sun(), stale], pack);
    expect(b.equilibriumTempK).toBeCloseTo(a.equilibriumTempK, 9);
    expect(b.surfaceTempK).toBeCloseTo(a.surfaceTempK, 9);
    expect(b.albedoInfo.albedo).toBeCloseTo(a.albedoInfo.albedo, 9);
  });

  it('the albedo it reports and the clouds it reports describe the same sky', () => {
    const w = earthish();
    const s = solveThermalState(w, [sun(), w], pack);
    const top = s.decks[s.decks.length - 1];
    expect(s.albedoInfo.cloudSpecies).toBe(top?.species);
    expect(s.albedoInfo.cloudCover).toBeCloseTo(top?.coverage ?? 0, 2);
  });
});
