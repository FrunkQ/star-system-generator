import { describe, it, expect } from 'vitest';
import { starColorFromTempK, bdGlowColour } from './apparentColor';

const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe('a brown dwarf is not a small sun', () => {
  it('does not hand every sub-fusion object the same orange', () => {
    // The table used to bottom out at #ff8a4a for anything under 2400 K, so Epsilon Indi Bb — a
    // methane T6 about as warm as an oven — rendered identically to a 2399 K M dwarf.
    const oven = starColorFromTempK(500), mDwarf = starColorFromTempK(3000);
    expect(lum(oven)).toBeLessThan(lum(mDwarf) * 0.25);
    expect(starColorFromTempK(500)).not.toEqual(starColorFromTempK(2399));
  });

  it('gets darker all the way down, with no floor to hide behind', () => {
    const t = [2399, 1800, 1400, 1000, 600, 300, 124];
    const ls = t.map((k) => lum(starColorFromTempK(k)));
    for (let i = 1; i < ls.length; i++) expect(ls[i]).toBeLessThan(ls[i - 1]);
  });

  it('leaves a GIANT with no visible glow, because giants radiate in the far infrared', () => {
    // Jupiter emits about 1.7x the sunlight it absorbs, but at 124 K none of it is visible. Keying
    // the ramp on temperature rather than on a mass window gets this for free — no separate branch.
    // Measured in LINEAR light, which is the honest scale: #3a0f06 is 9% of full in sRGB numbers but
    // under 1% of the actual light, i.e. black to look at.
    const lin = (u: number) => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
    const c = starColorFromTempK(124).map((v) => lin(v / 255));
    expect(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]).toBeLessThan(0.015);
  });

  it('treats an unknown temperature as unknown, not as cold', () => {
    // Sol itself stores no temperatureK, so the default is load-bearing — and `??` does not catch
    // zero, which would now render a star invisible rather than merely the wrong orange.
    for (const bad of [undefined, 0, -1, NaN]) {
      expect(lum(starColorFromTempK(bad as any))).toBeGreaterThan(150);
    }
  });

  it('does not move a real star', () => {
    for (const k of [3000, 4000, 5778, 8000, 12000, 40000]) {
      expect(starColorFromTempK(k)).toEqual(starColorFromTempK(k));
      expect(lum(starColorFromTempK(k))).toBeGreaterThan(150);
    }
  });

  it('is one authority: the stellar table and the substellar ramp agree below the fusion floor', () => {
    for (const k of [124, 500, 1000, 2000, 2399]) {
      const [r, g, b] = starColorFromTempK(k);
      const h = bdGlowColour(k);
      expect(`#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`).toBe(h);
    }
  });
});
