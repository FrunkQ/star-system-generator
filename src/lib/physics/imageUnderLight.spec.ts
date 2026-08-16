import { describe, it, expect } from 'vitest';
import { lightOperator, relightImage, colourUnderOperator, confusability } from './imageUnderLight';
import { blackbodySpectrum, gridShare, GRID_NM } from './spectrum';

const light = (t: number) => blackbodySpectrum(t, 1000 * gridShare(t));
const SUN = lightOperator(light(5778));
const DWARF = lightOperator(light(3000));
const HOT = lightOperator(light(9500));
const rgb = (hex: string): [number, number, number] => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const ch = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe('re-lighting a familiar colour', () => {
  it('leaves it near enough alone under a Sun-like star', () => {
    // Our own daylight is what the reference was authored under, so the round trip has to be close
    // or every comparison against it is measuring the model rather than the star.
    for (const hex of ['#c4262b', '#2f8f3a', '#2a5fb0', '#e8e8e8']) {
      const out = colourUnderOperator(rgb(hex), SUN, true);
      const a = ch(hex), b = ch(out);
      for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i]), `${hex} -> ${out}`).toBeLessThan(60);
    }
  });

  it('drains the blue under a red dwarf and lifts it under a hot star', () => {
    const blue = rgb('#2a5fb0');
    const blueness = (o: ReturnType<typeof lightOperator>) => {
      const [r, , b] = ch(colourUnderOperator(blue, o, false));
      return b - r;
    };
    expect(blueness(DWARF)).toBeLessThan(blueness(SUN));
    expect(blueness(HOT)).toBeGreaterThan(blueness(SUN));
  });

  it('leaves an unadapted view carrying the star\'s cast, and an adapted one much less of it', () => {
    const white = rgb('#e8e8e8');
    const cast = (adapt: boolean) => {
      const [r, , b] = ch(colourUnderOperator(white, DWARF, adapt));
      return r - b;
    };
    expect(cast(false)).toBeGreaterThan(cast(true));
    // …but NOT none of it. Adaptation is never complete — a tungsten-lit room still looks warm after
    // an hour — and modelling it as complete is what made the first version of this useless.
    expect(cast(true)).toBeGreaterThan(0);
  });
});

describe('how confusable two colours become', () => {
  it('is unchanged at home', () => {
    expect(confusability(rgb('#c4262b'), rgb('#7a4a2a'), SUN, SUN)).toBeCloseTo(1, 1);
  });

  it('collapses the pairs a red star cannot separate, and spares the ones it can', () => {
    // Two long-wavelength colours are still told apart under a red star — their difference is mostly
    // luminance and that survives. Pairs whose difference lives in the SHORT wavelengths do not,
    // because there are barely any photons there to carry it.
    const redBrown = confusability(rgb('#c4262b'), rgb('#7a4a2a'), DWARF, SUN);
    const blueGreen = confusability(rgb('#2a5fb0'), rgb('#2f8f3a'), DWARF, SUN);
    const blueBlack = confusability(rgb('#2a5fb0'), rgb('#1a1a1a'), DWARF, SUN);
    expect(blueGreen).toBeLessThan(redBrown);
    expect(blueBlack).toBeLessThan(redBrown);
    expect(blueGreen).toBeLessThan(0.95);
  });

  it('never claims a pair is MORE distinguishable than at home', () => {
    for (const o of [DWARF, HOT]) {
      for (const [a, b] of [['#c4262b', '#d4762f'], ['#2a5fb0', '#2f8f3a'], ['#e0c72a', '#e8e8e8']]) {
        expect(confusability(rgb(a), rgb(b), o, SUN)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('re-lighting an image', () => {
  it('leaves transparent pixels alone and changes the rest', () => {
    const d = new Uint8ClampedArray([200, 40, 40, 255, 200, 40, 40, 0]);
    relightImage(d, DWARF, false);
    expect([d[4], d[5], d[6]]).toEqual([200, 40, 40]);   // untouched: alpha 0
    expect([d[0], d[1], d[2]]).not.toEqual([200, 40, 40]);
  });

  it('is fast enough to wipe a full-size chart without waiting', () => {
    // The whole reason the operator is precomputed: a quarter of a million pixels cannot each afford
    // a spectral integration. If this ever regresses, the slider will be the thing that tells you.
    const px = new Uint8ClampedArray(640 * 400 * 4).fill(128);
    const t0 = performance.now();
    relightImage(px, DWARF, true);
    expect(performance.now() - t0).toBeLessThan(400);
  });
});
