// THE SIZE DERIVATION, GATED AGAINST REAL STARS (D29, stream U).
//
// PHY-34 asks for absolute gates seen red first, and this file is where the absolutes live: real
// stars with independently determined radii and masses, and a tolerance on each. Everything here is
// a pure transform of catalogue numbers - NO NETWORK. The catalogue values are the ones captured in
// `skyFixtures.ts` and in the truth table below, both measured from the live services on 2026-09-08.
//
// THE TRUTH COLUMN IS NOT FROM THIS ENGINE. Radii are interferometric where one exists (Sirius,
// Procyon, alf Cen A/B, Arcturus, Pollux, 61 Cyg) and otherwise the accepted determination; masses
// are dynamical for the binaries and evolutionary elsewhere. If a figure here is ever "corrected" to
// match what the code produces, this file has stopped being a gate.
import { describe, it, expect } from 'vitest';
import {
  deriveStarSize,
  radiusRsunFromLT,
  bolometricCorrectionV,
  absoluteMagnitude,
  radiusRsunFromDiameter,
  massMsunFromLuminosity,
  FIGURE_SOURCE
} from './starSize.mjs';
import { luminositySolarFrom } from './stars.mjs';
import { luminositySolarFromRT, SOLAR_TEFF_K } from '$lib/physics/luminosity';
import { SOLAR_RADIUS_KM, SOLAR_TEMPERATURE_K } from './constants.mjs';

/** name, Teff, log g, V, K, parallax(mas), TRUE radius (Rsun), TRUE mass (Msun), MK class */
const TRUTH: [string, number | null, number | null, number | null, number | null, number, number, number, string | null][] = [
  ['Sirius A', 9850, 4.3, -1.46, -1.35, 379.21, 1.711, 2.063, 'V'],
  ['Procyon A', 6456, 3.96, 0.37, -0.65, 284.56, 2.048, 1.499, 'V'],
  ['alf Cen A', 5838, 4.42, 0.01, -2.008, 742.12, 1.2234, 1.0788, 'V'],
  ['tau Cet', 5260, 4.44, 3.5, 1.68, 273.8097, 0.793, 0.783, 'V'],
  ['alf Cen B', 5182, 4.59, 1.33, -0.6, 742.12, 0.8632, 0.9092, 'V'],
  ['eps Eri', 4911, 4.52, 3.73, 1.67, 310.5773, 0.735, 0.82, 'V'],
  ['eps Ind A', 4694, 4.4, 4.69, 2.237, 274.8431, 0.732, 0.754, 'V'],
  ['61 Cyg A', 4398, 4.63, 5.21, 2.68, 285.9949, 0.665, 0.7, 'V'],
  ["Barnard's star", null, null, 9.511, 4.524, 546.9759, 0.187, 0.144, 'V'],
  ['Proxima Centauri', 2756, null, 11.13, 4.384, 768.0665, 0.1542, 0.1221, 'V'],
  ['Arcturus', 4236, 1.63, -0.05, -2.911, 88.83, 25.4, 1.08, 'III'],
  ['Pollux', 4868, 2.82, 1.14, -1.11, 96.54, 8.8, 1.91, 'III']
];

const derive = (row: (typeof TRUTH)[number]) => {
  const [, teffK, logG, magV, magK, plxMas, , , luminosityClass] = row;
  return deriveStarSize({ teffK, logG, magV, magK, plxMas }, { luminosityClass });
};
const errPct = (got: number, want: number) => (100 * (got - want)) / want;

describe('starSize - the derivation lands on real stars', () => {
  it.each(TRUTH)('%s: radius within 15 per cent of the measured value', (...row) => {
    const [name, , , , , , rTrue] = row;
    const got = derive(row as (typeof TRUTH)[number]).radiusRsun;
    expect(got, `${name}: no radius derived at all`).toBeGreaterThan(0);
    expect(Math.abs(errPct(got!, rTrue)), `${name}: ${got!.toFixed(4)} Rsun against ${rTrue}`).toBeLessThan(15);
  });

  it.each(TRUTH.filter((r) => r[8] === 'V'))('%s: main-sequence mass within 25 per cent', (...row) => {
    const [name, , , , , , , mTrue] = row;
    const got = derive(row as (typeof TRUTH)[number]).massMsun;
    expect(got, `${name}: no mass derived at all`).toBeGreaterThan(0);
    expect(Math.abs(errPct(got!, mTrue)), `${name}: ${got!.toFixed(4)} Msun against ${mTrue}`).toBeLessThan(25);
  });

  // THE OWNER'S OWN GATE, and the sharpest one in the file: an absolute figure, not a ratio.
  it('SIRIUS A comes out near 1.71 solar radii, not the A-band midpoint of 1.6', () => {
    const sirius = derive(TRUTH[0]);
    expect(sirius.radiusRsun).toBeGreaterThan(1.6);
    expect(sirius.radiusRsun).toBeLessThan(1.85);
    expect(sirius.provenance.radiusKm).toBe(FIGURE_SOURCE.DERIVED);
    expect(sirius.temperatureK).toBe(9850);
    expect(sirius.provenance.temperatureK).toBe(FIGURE_SOURCE.MEASURED);
  });

  // PROXIMA IS THE REASON THE RELATIONS HAVE DOMAINS. Through the V-band route it comes out at
  // 0.887 Rsun - 476% out - because Flower's correction is not calibrated below 3162 K. The cool
  // dwarf relation must claim it first, and this test is what proves the precedence is right.
  it('PROXIMA is answered by the cool-dwarf relation, not the bolometric one', () => {
    const proxima = derive(TRUTH.find((r) => r[0] === 'Proxima Centauri')!);
    expect(proxima.radiusRsun).toBeCloseTo(0.154, 2);
    expect(proxima.relations.join(' ')).toMatch(/cool-dwarf/);
    expect(proxima.relations.join(' ')).not.toMatch(/bolometric/);
  });

  it('a GIANT gets a derived radius but NEVER a mass-luminosity mass', () => {
    for (const name of ['Arcturus', 'Pollux']) {
      const g = derive(TRUTH.find((r) => r[0] === name)!);
      expect(g.radiusRsun, name).toBeGreaterThan(1);
      expect(g.massMsun, `${name} must fall back to its class band for mass`).toBeUndefined();
    }
  });
});

describe('starSize - what it refuses to answer', () => {
  const sirius = { teffK: 9850, magV: -1.46, magK: -1.35, plxMas: 379.21 };

  it('DEGENERATE and SUBSTELLAR objects get no derived size at all', () => {
    // Sirius B through the bolometric route is 99% wrong; a brown dwarf's band is honest (DATA-R24).
    const wd = deriveStarSize({ teffK: 10896, magV: 8.44, plxMas: 374.4896 }, { degenerate: true });
    expect(wd.radiusRsun).toBeUndefined();
    expect(wd.massMsun).toBeUndefined();
    // ...but a measured TEMPERATURE is still a measurement, and is still reported.
    expect(wd.temperatureK).toBe(10896);
    expect(wd.provenance.temperatureK).toBe(FIGURE_SOURCE.MEASURED);

    const bd = deriveStarSize({ teffK: 1350, magK: 8.841, plxMas: 501.557 }, { substellar: true });
    expect(bd.radiusRsun).toBeUndefined();
    expect(bd.massMsun).toBeUndefined();
  });

  it('returns nothing rather than a guess when the catalogue is silent', () => {
    expect(deriveStarSize({}).radiusRsun).toBeUndefined();
    expect(deriveStarSize({ plxMas: 100 }).radiusRsun).toBeUndefined();
    // A temperature with no magnitude cannot size anything.
    expect(deriveStarSize({ teffK: 5800, plxMas: 100 }).radiusRsun).toBeUndefined();
  });

  it('the bolometric correction refuses to answer outside its published domain', () => {
    expect(bolometricCorrectionV(2756)).toBeNull(); // Proxima - below 10^3.5
    expect(bolometricCorrectionV(60000)).toBeNull(); // above 10^4.7
    expect(bolometricCorrectionV(5778)).toBeCloseTo(-0.07, 1); // the Sun, about -0.07
  });
});

describe('starSize - one luminosity law, two directions', () => {
  // PHY-34. `radiusRsunFromLT` is the inverse of a law this repo writes in two other places, and
  // DATA-R5 stops the import core importing the engine's copy. So the equivalence is GATED: if
  // anyone changes either spelling, or the shared constant, this goes red.
  it('the constant is shared, not copied', () => {
    expect(SOLAR_TEFF_K).toBe(SOLAR_TEMPERATURE_K);
  });

  it('round-trips exactly against the import side, over four decades of luminosity', () => {
    for (const [rSun, teff] of [[0.15, 3000], [1, 5778], [1.711, 9850], [8.8, 4868], [25.4, 4236]]) {
      const lImport = luminositySolarFrom(rSun, teff)!;
      expect(radiusRsunFromLT(lImport, teff)!).toBeCloseTo(rSun, 10);
    }
  });

  // PINS A FAULT RATHER THAN A FEATURE, in the idiom substellarImport.spec.ts uses. THE SUN'S RADIUS
  // IS SPELLED FOUR TIMES IN THIS REPO AND TWO OF THE VALUES DISAGREE: `constants.ts:30` has 696340
  // (the IAU nominal photospheric radius) and `import/realsky/constants.mjs:15` has 695700, with two
  // more hardcoded 696000s in `rendering/scaleLaw.ts:225,231` and `catalogue/galleryExamples.ts:249`.
  // The engine and the importer therefore disagree by 0.09% about how big a solar radius is, and so
  // by 0.18% about how bright any given star is. It is far too small to see and it is the exact shape
  // the DUPLICATED FUNCTIONALITY rule exists to catch, so it is REPORTED rather than fixed here -
  // unifying it changes every bundled starmap's star radii and is not this item's to make.
  // WHEN SOMEBODY DOES UNIFY THEM, THIS TEST GOES RED AND IS THE THING TO DELETE.
  it('records the KNOWN divergence between the engine and the import solar radius', () => {
    expect(SOLAR_RADIUS_KM).toBe(695700);
    const lImport = luminositySolarFrom(1, SOLAR_TEMPERATURE_K)!;
    const lEngine = luminositySolarFromRT(1 * SOLAR_RADIUS_KM, SOLAR_TEMPERATURE_K);
    expect(lImport).toBe(1);
    expect(lEngine).toBeCloseTo(0.9982, 4);
  });
});

describe('starSize - the primitives', () => {
  it('absolute magnitude is the standard parallax form', () => {
    // A star at exactly 10 pc (100 mas) has an absolute magnitude equal to its apparent one.
    expect(absoluteMagnitude(5, 100)).toBeCloseTo(5, 10);
    expect(absoluteMagnitude(-1.46, 379.21)).toBeCloseTo(1.4344, 3);
    expect(absoluteMagnitude(5, 0)).toBeNull();
  });

  it('a DIRECT diameter is read in whichever unit its own row carries', () => {
    // mas: 1.59 mas at 285.9949 mas parallax is 61 Cyg A, about 0.6 Rsun in RADIUS.
    const angular = radiusRsunFromDiameter({ value: 1.59, unit: 'mas' }, 285.9949)!;
    expect(angular).toBeGreaterThan(0.5);
    expect(angular).toBeLessThan(0.7);
    // km: SIMBAD's other convention, and it is a DIAMETER, so half of it.
    expect(radiusRsunFromDiameter({ value: 2 * SOLAR_RADIUS_KM, unit: 'km' }, 100)!).toBeCloseTo(1, 10);
    // An unrecognised unit is never guessed at.
    expect(radiusRsunFromDiameter({ value: 5, unit: 'arcsec' as never }, 100)).toBeNull();
    expect(radiusRsunFromDiameter({ value: 1.59, unit: 'mas' }, 0)).toBeNull();
  });

  it('the mass-luminosity branch is chosen by the mass it produces', () => {
    expect(massMsunFromLuminosity(1)).toBeCloseTo(1, 6); // the Sun sits on the middle branch
    expect(massMsunFromLuminosity(0.01)!).toBeLessThan(0.43); // low branch owns its own answer
    expect(massMsunFromLuminosity(100)!).toBeGreaterThan(2); // high branch likewise
    expect(massMsunFromLuminosity(0)).toBeNull();
  });
});
