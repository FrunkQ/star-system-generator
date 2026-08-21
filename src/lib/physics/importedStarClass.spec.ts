import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { resolveImportedStarClass } from './importedStarClass';
import { starStatTemplate } from '$lib/generation/star';
import type { RulePack } from '$lib/types';
import { SOLAR_RADIUS_KM, SOLAR_MASS_KG } from '$lib/constants';

/**
 * ONE door for every importer's star classification. Owner's rule: stated type wins; a bare letter
 * gets its band inferred from (T, R) when it can be, and defaults to MAIN SEQUENCE when it cannot;
 * nothing ever defaults to G. Pins the fold of every MK band to the pack's three, brown dwarfs and
 * remnants as identity, and that a stated/physics disagreement is recorded rather than resolved.
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
const R = (solar: number) => solar * SOLAR_RADIUS_KM;

describe('resolveImportedStarClass', () => {
  it('a STATED designation with a band is taken as written, folded to the pack band', () => {
    const p = pack();
    expect(resolveImportedStarClass({ stated: 'G2V' }, p)).toMatchObject({ classKey: 'star/G2V', bandKey: 'star/G', band: 'V', bandSource: 'stated' });
    expect(resolveImportedStarClass({ stated: 'K3 III' }, p)).toMatchObject({ classKey: 'star/K3III', bandKey: 'star/K-III', band: 'III', bandSource: 'stated' });
    expect(resolveImportedStarClass({ stated: 'M1.5Iab' }, p)).toMatchObject({ bandKey: 'star/M-I', band: 'I', bandSource: 'stated' });
    // II folds to the supergiant band, IV to the dwarf band — the pack states three, not seven
    expect(resolveImportedStarClass({ stated: 'B2II' }, p).bandKey).toBe('star/B-I');
    expect(resolveImportedStarClass({ stated: 'F5IV' }, p).bandKey).toBe('star/F');
  });

  it('a bare LETTER with temperature and radius gets its band INFERRED — a K giant is a giant', () => {
    const p = pack();
    // K dwarf: 4400 K, 0.66 Rsun; K giant: 4300 K, 25 Rsun. Same letter, 40x the radius.
    const dwarf = resolveImportedStarClass({ stated: 'K', temperatureK: 4400, radiusKm: R(0.66) }, p);
    const giant = resolveImportedStarClass({ stated: 'K', temperatureK: 4300, radiusKm: R(25) }, p);
    expect(dwarf.bandKey).toBe('star/K');
    expect(dwarf.bandSource).toBe('inferred-from-physics');
    expect(giant.bandKey).toBe('star/K-III');
    expect(giant.bandSource).toBe('inferred-from-physics');
  });

  it('a bare letter with NO radius defaults to MAIN SEQUENCE — never a guessed giant', () => {
    const p = pack();
    const g = resolveImportedStarClass({ stated: 'G', temperatureK: 5778 }, p);
    expect(g.band).toBe('V');
    expect(g.bandSource).toBe('default-main-sequence');
    expect(g.bandKey).toBe('star/G');
  });

  it('a stated band that DISAGREES with the physics is kept, and the disagreement is recorded', () => {
    // The file says G V; the star is 20 Rsun. Hand authoring wins; the importer gets a line to show.
    const p = pack();
    const r = resolveImportedStarClass({ stated: 'G2V', temperatureK: 5500, radiusKm: R(20) }, p);
    expect(r.band).toBe('V');
    expect(r.bandSource).toBe('stated');
    expect(r.physicsBand).toBe('III');
    expect(r.disagreement).toMatch(/class III/);
  });

  it('with NO stated type, the letter comes from temperature through the pack — L/T/Y included', () => {
    const p = pack();
    expect(resolveImportedStarClass({ temperatureK: 5778, radiusKm: R(1) }, p).letter).toBe('G');
    expect(resolveImportedStarClass({ temperatureK: 1600, radiusKm: R(0.1) }, p)).toMatchObject({ letter: 'L', bandKey: 'star/L', bandSource: 'brown-dwarf' });
    expect(resolveImportedStarClass({ temperatureK: 400 }, p)).toMatchObject({ letter: 'Y', bandKey: 'star/Y' });
  });

  it('remnant and brown-dwarf tokens are identity, not position (Traveller D / BD / NS / BH)', () => {
    const p = pack();
    expect(resolveImportedStarClass({ stated: 'D' }, p).classKey).toBe('star/WD');
    expect(resolveImportedStarClass({ stated: 'A0 D' }, p).classKey).toBe('star/WD');   // Traveller: former type + D
    expect(resolveImportedStarClass({ stated: 'BD' }, p).classKey).toBe('star/L');
    expect(resolveImportedStarClass({ stated: 'NS' }, p).classKey).toBe('star/NS');
    expect(resolveImportedStarClass({ stated: 'PSR' }, p).classKey).toBe('star/NS');
    expect(resolveImportedStarClass({ stated: 'BH' }, p).classKey).toBe('star/BH');
  });

  it('nothing usable is star/unknown — NEVER a guessed G (the SpaceEngine fault)', () => {
    const p = pack();
    expect(resolveImportedStarClass({}, p).classKey).toBe('star/unknown');
    expect(resolveImportedStarClass({ stated: '???' }, p).classKey).toBe('star/unknown');
  });

  it('every bandKey it can produce resolves to a pack stat template — the generator can build the star', () => {
    const p = pack();
    const cases = [
      { stated: 'G2V' }, { stated: 'K3III' }, { stated: 'M1Iab' }, { stated: 'B2II' }, { stated: 'F5IV' },
      { stated: 'K', temperatureK: 4300, radiusKm: R(25) }, { temperatureK: 1600 }, { temperatureK: 400 },
      { stated: 'D' }, { stated: 'BD' }, { stated: 'NS' },
    ];
    for (const c of cases) {
      const r = resolveImportedStarClass(c, p);
      expect(starStatTemplate(p, r.bandKey), `${JSON.stringify(c)} -> ${r.bandKey}`).toBeDefined();
    }
  });
});
