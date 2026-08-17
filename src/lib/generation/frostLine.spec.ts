import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { stellarContextFor, calculateAllStellarZones } from '../physics/zones';
import type { RulePack, CelestialBody, Barycenter } from '$lib/types';
import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '../constants';

/**
 * THE FAULT THIS FILE GUARDS (inbox D12): the generators derived the frost line as
 * `frost_line_base_au * sqrt(M_host / M_sun)` — MASS where the physics wants LUMINOSITY. The real
 * relation is d ∝ sqrt(L), and for main-sequence stars L ∝ M^3.5, so the mass form flattens the
 * curve badly: measured against the luminosity-derived line it was 12.9x too far out for an M8
 * dwarf, 42.6x for an L dwarf, and 10x too CLOSE for a hot B star.
 *
 * It was also asked of the wrong body. For a moon the immediate host is the PLANET, so the old code
 * computed a "frost line" from Jupiter's mass and compared it against the moon's distance from
 * Jupiter — two planetocentric quantities standing in for a heliocentric question.
 */

function deepMerge(t: any, s: any): any {
  if (typeof t !== 'object' || t === null || Array.isArray(t)) return s;
  const out = { ...t };
  for (const k of Object.keys(s || {})) out[k] = (k in out) ? deepMerge(out[k], s[k]) : s[k];
  return out;
}
function pack(): RulePack {
  const base = path.resolve('static/rulepacks/starter-sf');
  let p: any = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8'));
  for (const f of ['stars.json', 'planets.json', 'generation.json', 'orbital_constants.json',
    'classification.json', 'atmospheres.json', 'liquids.json']) {
    const fp = path.join(base, f); if (fs.existsSync(fp)) p = deepMerge(p, JSON.parse(fs.readFileSync(fp, 'utf-8')));
  }
  return p as RulePack;
}

const mkStar = (id: string, massSolar: number, tempK: number, radiusSolar: number): CelestialBody => ({
  id, name: id, kind: 'body', roleHint: 'star', classes: ['star/G'],
  massKg: massSolar * SOLAR_MASS_KG, radiusKm: radiusSolar * SOLAR_RADIUS_KM, temperatureK: tempK,
} as unknown as CelestialBody);

const mkOrbiter = (id: string, parentId: string, aAU: number, role: 'planet' | 'moon'): CelestialBody => ({
  id, name: id, kind: 'body', roleHint: role, parentId, classes: ['planet/terrestrial'],
  massKg: 1e24, radiusKm: 3000, orbit: { hostId: parentId, elements: { a_AU: aAU, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } },
} as unknown as CelestialBody);

describe('the frost line follows LUMINOSITY, not mass', () => {
  it('two stars of the SAME MASS but different luminosity get different frost lines', () => {
    // THE LOAD-BEARING TEST. Under `2.7 * sqrt(M/Msun)` these two are IDENTICAL, because the star's
    // brightness never enters the formula. A main-sequence G star and an evolved giant of the same
    // mass do not share a frost line, and no amount of tuning a constant can fix that.
    const p = pack();
    const dwarf = mkStar('a', 1.0, 5778, 1.0);      // Sun
    const giant = mkStar('b', 1.0, 4500, 20);        // same mass, vastly brighter
    const fDwarf = calculateAllStellarZones(dwarf, p).formationFrostLine;
    const fGiant = calculateAllStellarZones(giant, p).formationFrostLine;
    expect(fGiant / fDwarf).toBeGreaterThan(5);
  });

  it('a dim M dwarf gets a frost line far INSIDE the old mass-based answer', () => {
    const p = pack();
    const t1 = mkStar('m', 0.0898, 2566, 0.1192);   // TRAPPIST-1
    const derived = calculateAllStellarZones(t1, p).formationFrostLine;
    const oldMassBased = 2.7 * Math.sqrt(0.0898);   // ~0.809 AU
    expect(derived).toBeLessThan(oldMassBased / 5);
  });

  it('a hot massive star gets a frost line far OUTSIDE the old mass-based answer', () => {
    const p = pack();
    const b2 = mkStar('h', 10, 21000, 5.2);
    const derived = calculateAllStellarZones(b2, p).formationFrostLine;
    const oldMassBased = 2.7 * Math.sqrt(10);       // ~8.5 AU
    expect(derived).toBeGreaterThan(oldMassBased * 3);
  });
});

describe('stellarContextFor asks the frost-line question of the right body', () => {
  it('a planet: returns its own star and its own orbit', () => {
    const star = mkStar('s', 1, 5778, 1);
    const planet = mkOrbiter('p', 's', 5.2, 'planet');
    const nodes: (CelestialBody | Barycenter)[] = [star, planet];
    const ctx = stellarContextFor(star, 5.2, nodes);
    expect(ctx.star?.id).toBe('s');
    expect(ctx.distanceAU).toBeCloseTo(5.2);
  });

  it('a MOON: returns the STAR and the PLANET\'s heliocentric distance, not the moon\'s', () => {
    // The moon sits 0.003 AU from its planet and 5.2 AU from the star. The frost-line question is
    // about 5.2, and about the STAR — the old code answered it with 0.003 and with Jupiter's mass.
    const star = mkStar('s', 1, 5778, 1);
    const planet = mkOrbiter('p', 's', 5.2, 'planet');
    const moon = mkOrbiter('m', 'p', 0.003, 'moon');
    const nodes: (CelestialBody | Barycenter)[] = [star, planet, moon];
    const ctx = stellarContextFor(planet, 0.003, nodes);
    expect(ctx.star?.id).toBe('s');
    expect(ctx.distanceAU).toBeCloseTo(5.2);
  });

  it('survives a broken parent chain instead of recursing forever', () => {
    const a = mkOrbiter('a', 'b', 1, 'planet');
    const b = mkOrbiter('b', 'a', 1, 'planet');      // cycle
    const ctx = stellarContextFor(a, 1, [a, b]);
    expect(ctx.star).toBeNull();
    expect(Number.isFinite(ctx.distanceAU)).toBe(true);
  });

  it('a missing parent yields no star rather than a wrong one', () => {
    const orphan = mkOrbiter('o', 'nowhere', 2, 'planet');
    const ctx = stellarContextFor(orphan, 0.01, [orphan]);
    expect(ctx.star).toBeNull();
  });
});
