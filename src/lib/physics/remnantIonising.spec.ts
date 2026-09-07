// A REMNANT'S IONISING OUTPUT COMES FROM ITS SURFACE, NOT FROM A CORONA IT DOES NOT HAVE ([[B145]]).
//
// Owner's screenshot, 2026-09-07: a neutron star at 600,000 K with a 2.2e14 G field reading
// `Ionising output 1.00e-4 x Sun` and a UV kill zone `within 0.09 AU`. Three quarters of that was
// display and was fixed at v3.0.373; this is the physics half, handed to Stream T because its stellar
// wind scales with the same quantity and would have inherited the same fault.
//
// EVERY NUMBER BELOW IS ABSOLUTE (PHY-34) and comes from Planck rather than from this code: the
// fraction of a blackbody's radiant power above the hydrogen edge is
//     f(>x) = (15/pi^4) SUM_n e^(-n x) (x^3/n + 3x^2/n^2 + 6x/n^3 + 6/n^4),   x = 157803 K / T
// so any of these can be checked with a calculator and none of them was tuned.
import { describe, it, expect } from 'vitest';
import {
  thermalIonisingFraction, isRemnantClass, effectiveIonisingFraction, ionisingOutputSolarOf,
  ionisingFraction, ionisingOutputSolar, HYDROGEN_EDGE_K, IONISING_FRACTION_QUIET
} from './ionisingOutput';

describe('the Planck fraction above the hydrogen edge', () => {
  it('the edge is 13.598 eV expressed as a temperature: 157,803 K', () => {
    expect(HYDROGEN_EDGE_K).toBeCloseTo(157803.3, 0);
  });

  it('lands on the whole range this engine can produce, to three significant figures', () => {
    // ABSOLUTE, from outside this code. The SUN is the one that matters most: 4.8e-9 thermal against
    // a 1e-7 coronal fraction, which is WHY a main-sequence star must keep the coronal model - its
    // EUV really does come from the corona, twenty times over.
    expect(thermalIonisingFraction(5778)).toBeCloseTo(4.830e-9, 12);
    expect(thermalIonisingFraction(3200)).toBeLessThan(1e-16);      // an M dwarf's photosphere: nothing
    expect(thermalIonisingFraction(10000)).toBeCloseTo(1.031e-4, 7);
    expect(thermalIonisingFraction(20000)).toBeCloseTo(4.217e-2, 4);
    expect(thermalIonisingFraction(100000)).toBeCloseTo(0.8933, 3);
    expect(thermalIonisingFraction(600000)).toBeCloseTo(0.99916, 4);
  });

  it('is monotone in temperature and bounded in [0, 1]', () => {
    let prev = -1;
    for (const T of [1000, 3000, 5778, 1e4, 3e4, 1e5, 3e5, 1e6, 1e8]) {
      const f = thermalIonisingFraction(T);
      expect(f).toBeGreaterThan(prev);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
      prev = f;
    }
    expect(thermalIonisingFraction(1e12)).toBeCloseTo(1, 6);
  });

  it('a missing or nonsense temperature is zero, not a guess', () => {
    expect(thermalIonisingFraction(undefined)).toBe(0);
    expect(thermalIonisingFraction(0)).toBe(0);
    expect(thermalIonisingFraction(-100)).toBe(0);
  });
});

describe('a remnant is NAMED, never initialled', () => {
  it('catches every remnant class and no spectral one', () => {
    for (const c of ['star/NS', 'star/WD', 'star/BH', 'star/BH_active', 'star/magnetar', 'NS', 'WD']) {
      expect(isRemnantClass(c), c).toBe(true);
    }
    // 'B' is the initial of "BH" AND a real spectral class - testing the first letter once gave a
    // black hole a B-star's flare rate ([[B44]]). Nor may a class that merely starts with the
    // letters be swallowed.
    for (const c of ['star/B', 'star/B-V', 'star/O', 'star/G2V', 'star/M', 'star/A0', 'planet/rocky', '', undefined]) {
      expect(isRemnantClass(c as any), String(c)).toBe(false);
    }
  });
});

describe('which fraction a star actually gets', () => {
  it('A MAIN-SEQUENCE STAR IS UNTOUCHED - the Sun above all', () => {
    // The whole change must be invisible to every ordinary star, and this is the assertion that says so.
    for (const a of [0, 0.05, 0.35, 0.85, 1]) {
      expect(effectiveIonisingFraction('star/G2V', 5778, a)).toBe(ionisingFraction(a));
      expect(effectiveIonisingFraction('star/M', 3200, a)).toBe(ionisingFraction(a));
    }
    expect(ionisingOutputSolarOf(1, 'star/G2V', 5778, 0.05)).toBeCloseTo(ionisingOutputSolar(1, 0.05), 12);
  });

  it('A HOT NEUTRON STAR READS ITS SURFACE, and that is the seven decades the owner saw', () => {
    // ABSOLUTE: a quiet remnant's coronal fraction is the floor, 1e-7. Its 600,000 K surface gives
    // 0.99916. The ratio is 9.99e6 - the "low by up to seven decades" on the row, measured.
    const coronal = effectiveIonisingFraction('star/G2V', 600000, 0);
    const thermal = effectiveIonisingFraction('star/NS', 600000, 0);
    expect(coronal).toBeCloseTo(IONISING_FRACTION_QUIET, 12);
    expect(thermal).toBeCloseTo(0.99916, 4);
    expect(thermal / coronal).toBeGreaterThan(9e6);
  });

  it('a cool white dwarf gets a small honest figure rather than a large invented one', () => {
    // ABSOLUTE: 1.03e-4 at 10,000 K. NOTE this is NOT the "few per cent" the brief's anchor named -
    // a few per cent is a 20,000 K white dwarf (4.2%), and the general law is kept over the anchor
    // because Planck is not negotiable. Reported on the row rather than fitted to.
    expect(effectiveIonisingFraction('star/WD', 10000, 0)).toBeCloseTo(1.031e-4, 7);
    expect(effectiveIonisingFraction('star/WD', 20000, 0)).toBeCloseTo(4.217e-2, 4);
  });

  it('THE GREATER OF THE TWO, so an accreting black hole keeps its disc', () => {
    // A hole has NO PHOTOSPHERE - its light is the disc's, which `flareActivity` already reads from
    // `accretionEddington`. Swapping the coronal figure out for a Planck fraction off a meaningless
    // surface temperature would have zeroed the most luminous object in the catalogue. Taking the
    // max keeps both mechanisms, which is also the honest statement: a body has at least the larger.
    expect(effectiveIonisingFraction('star/BH_active', undefined, 0.9)).toBe(ionisingFraction(0.9));
    expect(effectiveIonisingFraction('star/BH', 0, 0)).toBe(ionisingFraction(0));
    expect(effectiveIonisingFraction('star/BH', undefined, 0.9)).toBeGreaterThan(1e-4);
    // A magnetar has BOTH a violent field and a hot surface; the surface wins, and it should.
    expect(effectiveIonisingFraction('star/magnetar', 1e6, 0.9)).toBeCloseTo(0.99981, 4);
    // The result is never less than the coronal figure, for any remnant, at any temperature.
    for (const T of [undefined, 0, 3000, 1e4, 1e6]) {
      for (const a of [0, 0.5, 1]) {
        expect(effectiveIonisingFraction('star/NS', T, a)).toBeGreaterThanOrEqual(ionisingFraction(a) - 1e-18);
      }
    }
  });

  it('the output tracks luminosity, so a dim remnant is not made bright by its fraction alone', () => {
    // ABSOLUTE: a 1e-4 L(sun) neutron star with a 0.99916 fraction reads 1e-4 x 0.99916 / 1e-7 =
    // 999 x the quiet Sun's ionising output. Small star, enormous X-ray source - which is what a
    // cooling neutron star IS, and what the card was under-reporting by seven decades.
    expect(ionisingOutputSolarOf(1e-4, 'star/NS', 600000, 0)).toBeCloseTo(999.16, 1);
    expect(ionisingOutputSolarOf(0, 'star/NS', 600000, 0)).toBe(0);
  });
});
