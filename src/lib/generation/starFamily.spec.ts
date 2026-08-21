import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { starFamilyOf, planetCountTableKey } from './star';
import { determineSpectralClass } from '../physics/stellar-evolution';
import { generateSystemFromConfig } from './generateFromConfig';
import type { RulePack } from '$lib/types';
import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '../constants';
import type { StarSeed } from '../physics/stellar-evolution';

/**
 * THE STARS GREW ARMS AND LEGS — `G-I`, `G-III`, `M-I`, and the L / T / Y brown dwarfs — and the
 * generation lookups that key on class did not follow. Two faults this pins:
 *
 *   1. `determineSpectralClass` was a hardcoded ladder ending at M, so an L dwarf at 1600 K, a T at
 *      900 K and a Y at 400 K all became `star/M`: the wizard could not generate a brown dwarf from a
 *      seed AT ALL, and every "L dwarf" and "Y dwarf" measurement in B58 was an M dwarf mislabelled.
 *   2. Class-keyed lookups compared the whole string or a fixed letter list. `['A','F','G','K']
 *      .includes('G-III')` is false, so a G giant fell to the low-mass binary odds; and L/T/Y were
 *      in no list, so brown dwarfs took the REMNANT planet-count table — 95% empty.
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
const seed = (m: number, t: number, r: number, sc: string): StarSeed => ({
  id: 's', temperatureK: t, luminositySolar: r * r * Math.pow(t / 5778, 4),
  massKg: m * SOLAR_MASS_KG, radiusKm: r * SOLAR_RADIUS_KM, spectralClass: sc,
  category: 'Main Sequence', luminosityClass: 'V', isRemnant: false,
  pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
} as unknown as StarSeed);

describe('the spectral letter knows every letter the pack carries', () => {
  it('a brown-dwarf temperature yields L, T or Y — not M', () => {
    const p = pack();
    expect(determineSpectralClass(1600, p)).toBe('L');
    expect(determineSpectralClass(900, p)).toBe('T');
    expect(determineSpectralClass(400, p)).toBe('Y');
    expect(determineSpectralClass(3500, p)).toBe('M');   // and M is still M
    expect(determineSpectralClass(5778, p)).toBe('G');
  });

  it('reads the letters from the pack anchors, and the fallback ladder agrees at the seams', () => {
    const p = pack();
    for (const t of [40000, 15000, 8000, 6500, 5500, 4000, 3000, 2000, 1000, 300]) {
      expect(determineSpectralClass(t, p)).toBe(determineSpectralClass(t));
    }
  });

  it('the wizard now GENERATES a brown dwarf from a brown-dwarf seed', () => {
    // Before: an L-dwarf seed came out `star/M`, so every brown-dwarf anchor was measured as an M.
    const p = pack();
    const sys = generateSystemFromConfig('bd', p, { seeds: [seed(0.075, 1600, 0.10, 'L')], ageGyr: 1.0, emptyPlanets: true });
    const star: any = sys.nodes.find((n: any) => n.roleHint === 'star');
    expect(star.classes[0]).toBe('star/L');
    const sysY = generateSystemFromConfig('bdy', p, { seeds: [seed(0.02, 400, 0.09, 'Y')], ageGyr: 1.0, emptyPlanets: true });
    expect((sysY.nodes.find((n: any) => n.roleHint === 'star') as any).classes[0]).toBe('star/Y');
  });
});

describe('class-keyed lookups read the FAMILY, so new suffixes and letters do not fall through', () => {
  it('a giant or supergiant is its letter\'s family', () => {
    expect(starFamilyOf('star/G-III')).toBe('sunlike');
    expect(starFamilyOf('star/G-I')).toBe('sunlike');
    expect(starFamilyOf('star/M-I')).toBe('low_mass');
    expect(starFamilyOf('star/B-III')).toBe('massive');
    expect(starFamilyOf('star/G')).toBe('sunlike');
  });

  it('brown dwarfs are their own family, not remnants', () => {
    for (const c of ['star/L', 'star/T', 'star/Y']) expect(starFamilyOf(c)).toBe('brown_dwarf');
    expect(planetCountTableKey('brown_dwarf')).toBe('planet_count_brown_dwarf');
    expect((pack() as any).distributions.planet_count_brown_dwarf).toBeDefined();
  });

  it('remnants are still remnants', () => {
    for (const c of ['star/WD', 'star/NS', 'star/BH', 'star/BH_active', 'star/magnetar']) {
      expect(starFamilyOf(c)).toBe('remnant');
    }
  });

  it('a brown dwarf now gets planets from its OWN table rather than the 95%-empty remnant one', () => {
    const p = pack();
    let withPlanets = 0;
    for (let i = 0; i < 40; i++) {
      const sys = generateSystemFromConfig(`bdp-${i}`, p, { seeds: [seed(0.075, 1600, 0.10, 'L')], ageGyr: 1.0, knobs: { diskMass: 0.5 } });
      if (sys.nodes.some((n: any) => n.roleHint === 'planet')) withPlanets++;
    }
    // remnant odds would give ~2 of 40; the brown-dwarf table gives most of them a planet
    expect(withPlanets).toBeGreaterThan(20);
  });
});
