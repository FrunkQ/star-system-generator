import { describe, it, expect } from 'vitest';
import {
  GRID_NM, blackbodySpectrum, gridShare, integrate, photonFlux, peakNm, wienPeakNm,
  spectrumToHex, planckRadiance
} from './spectrum';

describe('spectrum — the grid and Planck', () => {
  it('samples 280–1400 nm inclusive at 10 nm', () => {
    expect(GRID_NM[0]).toBe(280);
    expect(GRID_NM[GRID_NM.length - 1]).toBe(1400);
    expect(GRID_NM.length).toBe(113);
  });

  it('puts the Sun\'s per-wavelength peak near 500 nm — the value the reference charts quote', () => {
    // Wien, per unit WAVELENGTH. The per-FREQUENCY peak of the same curve is ~1.76x longer, which is
    // exactly the ambiguity B53 said had to be stated rather than inherited (see peakNm's comment).
    expect(wienPeakNm(5778)).toBeGreaterThan(495);
    expect(wienPeakNm(5778)).toBeLessThan(505);
    const sun = blackbodySpectrum(5778, 1361 * gridShare(5778));
    expect(peakNm(sun)).toBeGreaterThanOrEqual(490);
    expect(peakNm(sun)).toBeLessThanOrEqual(510);
  });

  it('moves the peak to the far red for an M dwarf and to the blue for an A star', () => {
    expect(wienPeakNm(3000)).toBeGreaterThan(900);
    expect(wienPeakNm(9000)).toBeLessThan(340);
  });

  it('normalises to the total it was handed', () => {
    const s = blackbodySpectrum(5778, 900);
    expect(integrate(s)).toBeCloseTo(900, 3);
  });

  it('gridShare is a fraction, and a cool star keeps far less of its output inside the grid', () => {
    const sun = gridShare(5778), dwarf = gridShare(2800), hot = gridShare(20000);
    for (const v of [sun, dwarf, hot]) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThanOrEqual(1); }
    expect(dwarf).toBeLessThan(sun);
    // A very hot star loses its output off the SHORT end instead, so it also keeps less than the Sun.
    expect(hot).toBeLessThan(sun);
  });

  it('planckRadiance stays finite where the exponential would overflow', () => {
    expect(planckRadiance(280, 3)).toBe(0);
    expect(Number.isFinite(planckRadiance(500, 5778))).toBe(true);
  });
});

describe('spectrum — radiant power and photon count answer DIFFERENT questions', () => {
  it('ranks a cool star higher on photons than on power, at equal in-grid power', () => {
    // Same W/m2 inside the grid; the cooler star delivers it in cheaper (redder) photons, so it
    // hands over MORE of them. Using power where the biology wants count is not a rounding error.
    const cool = blackbodySpectrum(3200, 300);
    const hot = blackbodySpectrum(8000, 300);
    expect(integrate(cool)).toBeCloseTo(integrate(hot), 6);
    expect(photonFlux(cool)).toBeGreaterThan(photonFlux(hot));
  });
});

describe('spectrum — colour matching is the LAST step, and it is human', () => {
  it('reads a Sun-like blackbody as near-white', () => {
    const hex = spectrumToHex(blackbodySpectrum(5778, 1000));
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan
      ? expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(90)
      : null;
  });

  it('reads a cool star as redder than a hot one', () => {
    const cool = spectrumToHex(blackbodySpectrum(3000, 1000));
    const hot = spectrumToHex(blackbodySpectrum(12000, 1000));
    const red = (h: string) => parseInt(h.slice(1, 3), 16) - parseInt(h.slice(5, 7), 16);
    expect(red(cool)).toBeGreaterThan(red(hot));
  });

  it('chromatic adaptation maps a perfect white reflector to white under ANY star', () => {
    for (const t of [3000, 5778, 9000]) {
      const star = blackbodySpectrum(t, 1000);
      expect(spectrumToHex(star, star)).toBe('#ffffff');
    }
  });
});
