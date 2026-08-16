import { describe, it, expect } from 'vitest';
import {
  lightOperator, relightImage, colourUnderOperator, confusability, homeDaylight, brightnessVs
} from './imageUnderLight';
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

describe('a light that has almost nothing left in one channel', () => {
  // VENUS. 92 bar of CO2 leaves the S cones about half a percent of the short-wavelength light they
  // get at home, and unbounded von Kries answered that by asking for a 134-fold gain — which does not
  // recover the colour, it recovers the noise. A white card came back pink and a blue wire came back
  // violet, so the whole world went pink. A starved channel must be left dark, not amplified.
  const starved = lightOperator(GRID_NM.map((nm) => Math.exp(-Math.pow((700 - nm) / 130, 2)) * 40));

  it('does not amplify a starved channel into a cast of its own', () => {
    const [r, g, b] = ch(colourUnderOperator(rgb('#ffffff'), starved, true));
    // Warm, because the light is: red the strongest. What must NOT happen is blue climbing back past
    // green, which is the signature of the amplification and is what "pink" looked like numerically.
    expect(r).toBeGreaterThan(g);
    expect(b).toBeLessThanOrEqual(g);
  });

  it('takes a blue surface toward dark neutral rather than toward violet', () => {
    const home = ch('#2a5fb0');
    const [r, , b] = ch(colourUnderOperator(rgb('#2a5fb0'), starved, true));
    // At home this swatch is emphatically blue: b beats r by 134. Under a light with nothing at the
    // short end that difference has nowhere to come from, so it must collapse — the old maths
    // manufactured it back and produced a violet wire.
    expect(home[2] - home[0]).toBeGreaterThan(100);
    expect(Math.abs(b - r)).toBeLessThan(20);
    // …and it must land DARK, because a blue surface reflects very little of a red light. Darkness is
    // the only thing left to tell it by, which is exactly why blue and black stop being separable.
    const luma = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const white = ch(colourUnderOperator(rgb('#ffffff'), starved, true));
    expect(luma([r, ch(colourUnderOperator(rgb('#2a5fb0'), starved, true))[1], b]))
      .toBeLessThan(luma(white) * 0.6);
  });

  it('still discounts an ordinary cast, so nothing else regresses', () => {
    // The rolloff is only allowed to bite when a channel is genuinely starved. Under a 3000 K dwarf
    // every cone still has plenty of light, so adaptation must work as it always did.
    const [r, , b] = ch(colourUnderOperator(rgb('#e8e8e8'), DWARF, true));
    expect(r - b).toBeLessThan(ch(colourUnderOperator(rgb('#e8e8e8'), DWARF, false))[0]
                             - ch(colourUnderOperator(rgb('#e8e8e8'), DWARF, false))[2]);
  });
});

describe('how bright it is, as opposed to what colour', () => {
  it('reads Earth as 1, because home is measured the same way as everywhere else', () => {
    expect(brightnessVs(homeDaylight(), homeDaylight())).toBeCloseTo(1, 6);
  });

  it('dims the image when asked for the real light level, and drains colour only in the dark', () => {
    const at = (level: number) => {
      const px = new Uint8ClampedArray([47, 143, 58, 255]);
      relightImage(px, SUN, true, level);
      return [px[0], px[1], px[2]];
    };
    const full = at(1), dusk = at(0.02), night = at(1e-6);
    expect(dusk[1]).toBeLessThan(full[1]);                       // dimmer
    expect(Math.abs(dusk[1] - dusk[0])).toBeGreaterThan(10);     // …but still green
    // Rods carry no colour, which is why a moonlit field is grey however long you look at it.
    expect(Math.abs(night[1] - night[0])).toBeLessThan(4);
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

  it('fades as the light fails, because rods carry no colour', () => {
    // A world reading "a night under a full moon" reported two colours as "as distinguishable as at
    // home", which is a claim nobody would believe. The spectral SHAPE said they were separable and
    // nothing was asking how much light there was.
    const dim = lightOperator(light(5778).map((v) => v * 1e-5));
    const bright = confusability(rgb('#2a5fb0'), rgb('#2f8f3a'), SUN, SUN);
    const faint = confusability(rgb('#2a5fb0'), rgb('#2f8f3a'), dim, SUN);
    expect(bright).toBeGreaterThan(0.9);
    expect(faint).toBeLessThan(0.35);
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
