import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { judgeTypesAt, viableTypesAt, ALL_GATES } from './generateBodyOfType';
import { classifyByFingerprint } from '$lib/system/classification';
import type { Fingerprint, RulePack } from '$lib/types';
import { EARTH_MASS_KG } from '../constants';

/**
 * ONE VIABILITY MODEL — the "add here" picker and the generator judge "what may be born here" from
 * the same function, with the same gates. The picker exposes the gates as toggles; the generator
 * keeps them all on. This file pins three things:
 *   1. every gate is individually switchable, and switching it off widens the menu (the GM's escape hatch);
 *   2. the mass floor keeps asteroids and sub-planetary classes off a primary orbit;
 *   3. formation bands are ONE-WAY: they gate birth and NEVER classification.
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
const fps = () => (pack().classifier?.fingerprints ?? []) as Fingerprint[];
const classes = (v: Fingerprint[]) => v.map((f) => f.class);

describe('the mass floor: a planet slot gets a planet', () => {
  it('keeps asteroids, comets and sub-planetary classes off a primary orbit', () => {
    const v = classes(viableTypesAt(280, 'planet', fps(), 0));
    for (const c of ['asteroid/c-type', 'asteroid/s-type', 'asteroid/m-type', 'asteroid/comet',
      'planet/planetesimal', 'planet/dwarf-planet', 'planet/mesoplanet']) {
      expect(v, `${c} should be off the planet menu`).not.toContain(c);
    }
    expect(v).toContain('planet/terrestrial');
  });

  it('judges on the band MIDPOINT, so a class that only pokes over the floor at its top is out', () => {
    // dwarf-planet is [0.0005, 0.05]: its top edge clears a 0.03 floor, its geometric mid (0.005)
    // does not — and it draws near the bottom, which is how a "planet" came out lighter than Ceres.
    const verdicts = judgeTypesAt({ role: 'planet', teqK: 280 }, fps());
    const dp = verdicts.find((x) => x.fp.class === 'planet/dwarf-planet')!;
    expect(dp.ok).toBe(false);
    expect(dp.failed).toContain('mass');
  });

  it('is the GM\'s to switch off — the same classes come back with the mass gate off', () => {
    const v = classes(viableTypesAt(280, 'planet', fps(), 0, { gates: { ...ALL_GATES, mass: false } }));
    expect(v).toContain('planet/dwarf-planet');
    expect(v).toContain('asteroid/c-type');
  });

  it('is pack data: a lower floor admits smaller worlds', () => {
    const strict = classes(viableTypesAt(280, 'planet', fps(), 0, { planetMassFloorMe: 0.03 }));
    const loose = classes(viableTypesAt(280, 'planet', fps(), 0, { planetMassFloorMe: 0.001 }));
    expect(loose.length).toBeGreaterThan(strict.length);
    expect(loose).toContain('planet/mesoplanet');
  });

  it('does not touch moons — a moon slot may still be small', () => {
    const v = classes(viableTypesAt(120, 'moon', fps(), 300 * EARTH_MASS_KG));
    expect(v.some((c) => /dwarf-planet|mesoplanet|planetesimal/.test(c))).toBe(true);
  });
});

describe('the age gate: late formers and early formers', () => {
  it('a young system offers protoplanets and withholds the late formers', () => {
    const young = classes(viableTypesAt(1500, 'planet', fps(), 0, { ageGyr: 0.02 }));
    expect(young).toContain('planet/protoplanet');
    expect(young).not.toContain('planet/chthonian');
    expect(young).not.toContain('planet/helium');
  });

  it('an old system offers the late formers and withholds protoplanets', () => {
    const old = classes(viableTypesAt(1500, 'planet', fps(), 0, { ageGyr: 4.6 }));
    expect(old).toContain('planet/chthonian');
    expect(old).not.toContain('planet/protoplanet');
  });

  it('with no age supplied, the gate does nothing — the picker keeps working without a system age', () => {
    const v = classes(viableTypesAt(1500, 'planet', fps(), 0));
    expect(v).toContain('planet/protoplanet');
    expect(v).toContain('planet/chthonian');
  });

  it('is switchable off like the others', () => {
    const v = classes(viableTypesAt(1500, 'planet', fps(), 0, { ageGyr: 0.02, gates: { ...ALL_GATES, age: false } }));
    expect(v).toContain('planet/chthonian');
  });
});

describe('formation bands are ONE-WAY: they gate birth, never classification', () => {
  it('no fingerprint carries age_Gyr in its classifier match block', () => {
    // A hand-authored chthonian in a million-year-old system is still a chthonian. The classifier
    // works on what it sees; the formation band only decides what a slot may be GIVEN. So the age
    // band must live under `formation`, which the classifier never reads — never under `match`.
    for (const fp of fps()) {
      expect((fp.match as any)['age_Gyr'], `${fp.class} has age_Gyr in match`).toBeUndefined();
      expect((fp.gate as any)?.['age_Gyr'], `${fp.class} has age_Gyr in gate`).toBeUndefined();
    }
  });

  it('the late formers still DECLARE their birth window under formation', () => {
    const byClass = new Map(fps().map((f) => [f.class, f]));
    expect(byClass.get('planet/chthonian')?.formation?.['age_Gyr']).toBeDefined();
    expect(byClass.get('planet/helium')?.formation?.['age_Gyr']).toBeDefined();
    expect(byClass.get('planet/protoplanet')?.formation?.['age_Gyr']).toBeDefined();
  });

  it('a chthonian in a young system still classifies as a chthonian', () => {
    // The body is what it is: a stripped, dense, roasted core. Its improbability is for tags to say.
    const features = { mass_Me: 10, Teq_K: 2000, density: 8, age_Gyr: 0.001 };
    const result = classifyByFingerprint(features, fps(), 3);
    expect(result).toContain('planet/chthonian');
  });
});
