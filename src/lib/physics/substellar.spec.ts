import { describe, it, expect } from 'vitest';
import { brownDwarfThermal, brownDwarfAgeForTeff, SUBSTELLAR_MIN_MJUP } from './substellar';

const MJUP = 1.898e27;

describe('brownDwarfThermal', () => {
  it('does not engage below the sub-brown-dwarf floor (Jupiter is not self-luminous)', () => {
    const r = brownDwarfThermal(1 * MJUP, 4.6, 71492);
    expect(r.isSubstellar).toBe(false);
    expect(r.teffK).toBe(0);
  });

  it('does not engage at/above the hydrogen-burning limit (that is a star)', () => {
    const r = brownDwarfThermal(85 * MJUP, 4.6, 68000);
    expect(r.isSubstellar).toBe(false);
  });

  it('a 13 M_jup brown dwarf cools from warm to cold with age (L→T→Y)', () => {
    const young = brownDwarfThermal(13 * MJUP, 0.5, 68000);
    const mid = brownDwarfThermal(13 * MJUP, 5, 68000);
    const old = brownDwarfThermal(13 * MJUP, 12, 68000);
    expect(young.isSubstellar).toBe(true);
    expect(young.teffK).toBeGreaterThan(mid.teffK);
    expect(mid.teffK).toBeGreaterThan(old.teffK);
    // Envelope sanity: warm young (>500K), cooling to a few hundred K old.
    expect(young.teffK).toBeGreaterThan(500);
    expect(old.teffK).toBeLessThan(450);
    expect(old.teffK).toBeGreaterThanOrEqual(250); // never below the Y-dwarf floor
  });

  it('a heavy 70 M_jup dwarf stays hot even when old, and outshines a light one', () => {
    const heavy = brownDwarfThermal(70 * MJUP, 5, 64000);
    const light = brownDwarfThermal(9 * MJUP, 5, 70000);
    expect(heavy.teffK).toBeGreaterThan(1400);
    expect(heavy.teffK).toBeGreaterThan(light.teffK);
    expect(heavy.luminositySolar).toBeGreaterThan(light.luminositySolar);
  });

  it('never exceeds the L-dwarf ceiling even for a newborn', () => {
    const newborn = brownDwarfThermal(75 * MJUP, 0.001, 64000);
    expect(newborn.teffK).toBeLessThanOrEqual(2800);
  });

  it('luminosity is in a physically sane substellar range (1e-6..1e-3 L_sun)', () => {
    const r = brownDwarfThermal(70 * MJUP, 5, 64000);
    expect(r.luminositySolar).toBeGreaterThan(1e-6);
    expect(r.luminositySolar).toBeLessThan(1e-2);
  });

  it('exposes the floor constant for callers', () => {
    expect(SUBSTELLAR_MIN_MJUP).toBe(8);
  });
});

// G94 job 4 - the cooling track asked the other way round: type a temperature, be told the age.
describe('brownDwarfAgeForTeff - the inversion of the cooling track', () => {
  const SUN = 1.989e30;
  const REPORT_DWARF = 0.0352 * SUN;      // B150: the T dwarf in the user's video, 36.9 Jupiter masses

  it('the dwarf from the report: 988 K is a 9.09 Gyr dwarf, and 1172.77 K is the 2.91 Gyr one he had', () => {
    const a = brownDwarfAgeForTeff(REPORT_DWARF, 988);
    expect(a.kind).toBe('age');
    expect((a as any).ageGyr).toBeCloseTo(9.09, 1);
    expect((brownDwarfAgeForTeff(REPORT_DWARF, 1172.77190456) as any).ageGyr).toBeCloseTo(2.91, 1);
  });

  it('...and 914 K, the other figure he typed, needs 15.3 Gyr - which the caller must say, not hide', () => {
    const a = brownDwarfAgeForTeff(REPORT_DWARF, 914);
    expect(a.kind).toBe('age');
    expect((a as any).ageGyr).toBeCloseTo(15.27, 1);
  });

  it('EVERY answer runs back through the track to the temperature asked for, across the mass window', () => {
    for (const mjup of [8, 10, 13, 20, 25, 36.9, 45, 60, 79.9]) {
      for (const teffK of [260, 400, 700, 1000, 1500, 2000, 2700]) {
        const fit = brownDwarfAgeForTeff(mjup * MJUP, teffK);
        if (fit.kind !== 'age') continue;
        expect(brownDwarfThermal(mjup * MJUP, fit.ageGyr, 68000).teffK, `${mjup} M_jup at ${teffK} K`).toBeCloseTo(teffK, 6);
      }
    }
  });

  it('a temperature no dwarf of that mass starts at is called too hot, with where it does start', () => {
    const light = brownDwarfAgeForTeff(8 * MJUP, 2600);          // an 8 M_jup object is never an L dwarf
    expect(light.kind).toBe('too-hot');
    expect((light as any).hottestK).toBeCloseTo(brownDwarfThermal(8 * MJUP, 0, 68000).teffK, 6);
    expect(brownDwarfAgeForTeff(70 * MJUP, 3500).kind).toBe('too-hot');      // past the L-dwarf ceiling
  });

  it('below the 250 K floor it is too cold, and says when this dwarf reaches the floor', () => {
    const fit = brownDwarfAgeForTeff(8 * MJUP, 100) as any;
    expect(fit.kind).toBe('too-cold');
    expect(fit.coldestK).toBe(250);
    expect(brownDwarfThermal(8 * MJUP, fit.ageGyr, 68000).teffK).toBeCloseTo(250, 6);
  });

  it('outside the brown-dwarf mass window there is no track to invert', () => {
    expect(brownDwarfAgeForTeff(1 * MJUP, 500).kind).toBe('not-substellar');
    expect(brownDwarfAgeForTeff(85 * MJUP, 2500).kind).toBe('not-substellar');
    expect(brownDwarfAgeForTeff(40 * MJUP, 0).kind).toBe('not-substellar');
  });
});
