// B73 + B74's ACCEPTANCE TEST, written as the inbox specified it.
//
// "Take a 35-Jupiter-mass object at 1,300 K. File it with roleHint 'star' and file it with roleHint
//  'planet'. The two must agree on every PHYSICAL quantity — temperature, radius, luminosity, the lot
//  — and may differ ONLY in presentation, where one says 'L dwarf' and the other says 'brown dwarf /
//  huge gas giant'. If they disagree on anything derived, the definitions have already diverged."
//
// A brown dwarf is the one object that can legitimately arrive down either path, so it is the case
// that proves whether there is ONE definition of it or two.
import { describe, it, expect } from 'vitest';
import { brownDwarfThermal } from './substellar';
import { luminositySolarFromRT } from './luminosity';
import { spaceWeathering } from './cloudDecks';
import { starImplausibilities } from './starPlausibility';
import { classifyByFingerprint } from '$lib/system/classification';
import starPack from '../../../static/rulepacks/starter-sf/stars.json';
import map from '../../../static/example-starmaps/Local_Neighbourhood-Starmap.json';
import type { CelestialBody } from '$lib/types';

const JUP = 1.898e27, RJ = 71492;

/** The same object, twice, differing only in what it is filed as. */
const object = (role: 'star' | 'planet'): CelestialBody => ({
  id: 'bd-35', kind: 'body', name: 'Thirty-Five', roleHint: role,
  massKg: 35 * JUP, radiusKm: RJ, temperatureK: 1300,
  classes: role === 'star' ? ['star/L4', 'star/L'] : ['planet/brown-dwarf'],
  tags: []
} as unknown as CelestialBody);

describe('a 35 Jupiter-mass object at 1300 K, filed both ways', () => {
  it('derives the same self-luminosity from MASS, whichever role it carries', () => {
    const asStar = brownDwarfThermal(object('star').massKg!, 4.6, RJ);
    const asPlanet = brownDwarfThermal(object('planet').massKg!, 4.6, RJ);
    expect(asStar.isSubstellar).toBe(true);
    expect(asPlanet.isSubstellar).toBe(true);
    expect(asPlanet.teffK).toBe(asStar.teffK);
    expect(asPlanet.luminositySolar).toBe(asStar.luminositySolar);
  });

  it('agrees on luminosity through the ONE Stefan-Boltzmann, not two', () => {
    // The seam this used to have: the substellar track and the star editor each had their own copy.
    const bd = brownDwarfThermal(35 * JUP, 4.6, RJ);
    expect(luminositySolarFromRT(RJ, bd.teffK)).toBeCloseTo(bd.luminositySolar, 12);
  });

  it('weathers the same — role is not the test anywhere in the chain', () => {
    expect(spaceWeathering(object('planet'))).toBe(spaceWeathering(object('star')));
  });

  it('and is called implausible by NEITHER filing', () => {
    // The star filing must not be told it is "a brown dwarf rather than an L4 star" — that was the
    // reported fault. The planet filing is not a star at all, so the star laws do not apply to it.
    expect(starImplausibilities(object('star')).map((i) => i.law)).toEqual([]);
    expect(starImplausibilities(object('planet'))).toEqual([]);
  });
});

describe('the bundled map, which is where this was reported', () => {
  // THE ORIGINAL REPORT: "undermassed brown dwarfs — so they are either defined wrong (likely) or we
  // are tagging wrong." The masses were right and the bands were wrong, so every real brown dwarf in
  // the shipped map was being called an impossible star. These are PUBLISHED values — if this test
  // fails, the pack has stopped describing reality, not the other way round.
  const pack = { statTemplates: (starPack as any).statTemplates } as any;
  const SOL = 1.98847e30;
  const lowMassStars: CelestialBody[] = [];
  const walk = (ns: any) => {
    for (const b of ns || []) {
      if (b && typeof b === 'object') {
        if (b.massKg && b.massKg / SOL < 0.11 && b.roleHint === 'star') lowMassStars.push(b);
        walk(b.nodes);
      }
    }
  };
  for (const s of (map as any).systems) walk((s.system || {}).nodes);

  it('has brown dwarfs in it, or this test is vacuous', () => {
    expect(lowMassStars.length).toBeGreaterThan(8);
    expect(lowMassStars.some((b) => /^star\/[LTY]/.test(b.classes?.[0] ?? ''))).toBe(true);
  });

  it('flags none of them as physically impossible', () => {
    const bad = lowMassStars
      .map((b) => ({ n: b.name, laws: starImplausibilities(b, pack).map((i) => i.law) }))
      .filter((r) => r.laws.length > 0);
    expect(bad, bad.map((r) => `${r.n}: ${r.laws.join(',')}`).join('; ')).toEqual([]);
  });

  it('keeps the two T dwarfs that differ by a factor of two in mass BOTH in the T band', () => {
    // Epsilon Indi Ba at 67 M_Jup and Luhman 16 B at 29 M_Jup are both T dwarfs. That single line is
    // the whole argument for why mass cannot classify a brown dwarf.
    const t = (starPack as any).statTemplates['star/T'].mass_solar;
    const names = ['Epsilon Indi Ba', 'Luhman 16 B'];
    for (const n of names) {
      const b = lowMassStars.find((x) => x.name === n);
      expect(b, n).toBeTruthy();
      const ms = b!.massKg! / SOL;
      expect(ms, `${n} at ${ms.toFixed(4)} Msol vs band ${t}`).toBeGreaterThanOrEqual(t[0]);
      expect(ms).toBeLessThanOrEqual(t[1]);
    }
  });
});

describe('the classifier last resort', () => {
  // An empty fingerprint list forces the last resort, which is the branch under test.
  it('says UNCLASSIFIED when the mass is unknown, not terrestrial', () => {
    // `undefined > 10` is false, so the old expression fell to the rocky branch. A body we know
    // nothing about is not a rocky planet.
    expect(classifyByFingerprint({}, [])).toContain('planet/unclassified');
    expect(classifyByFingerprint({ mass_Me: NaN }, [])).toContain('planet/unclassified');
  });

  it('still guesses when the mass IS known, because then it has something to go on', () => {
    expect(classifyByFingerprint({ mass_Me: 5000 }, [])).toContain('planet/gas-giant');
    expect(classifyByFingerprint({ mass_Me: 1 }, [])).toContain('planet/terrestrial');
  });
});
