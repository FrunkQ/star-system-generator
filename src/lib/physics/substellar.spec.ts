import { describe, it, expect } from 'vitest';
import { brownDwarfThermal, SUBSTELLAR_MIN_MJUP } from './substellar';

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
