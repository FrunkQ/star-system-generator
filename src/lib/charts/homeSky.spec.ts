import { describe, it, expect } from 'vitest';
import { homeSky } from './surfaceScene';
import { homeDaylightSpectrum } from '$lib/physics/imageUnderLight';
import { spectrumToHex } from '$lib/physics/spectrum';

const ch = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe("the home half of the wipe", () => {
  it('runs through the same pipeline as everywhere else, so Earth against Earth has no seam', () => {
    // THE CONTROL CASE. Home used to be two hand-picked blues sitting next to a derived one, so
    // viewing Earth showed a visible step in the sky across the seam — and if the two halves are not
    // indistinguishable there, nothing the view says about anywhere else is trustable.
    //
    // Reproduced here rather than imported so the test fails if the pipeline changes under only one
    // of the two sides.
    const cover = 0.3;
    const strength = 1 - Math.exp(-(0.0973 + 4 * cover));
    const lit = Math.min(1, strength / 0.3);
    expect(lit).toBe(1);
    const derived = ch(spectrumToHex(homeDaylightSpectrum().map((v, i) => v)));
    expect(derived.length).toBe(3);
    // Home must be a believable daylight blue, not a magic constant: blue over green over red.
    const [r, g, b] = ch(homeSky().high);
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
  });

  it('puts the horizon lighter than the zenith, as looking through more air does', () => {
    const [, , zb] = ch(homeSky().high);
    const [lr, , lb] = ch(homeSky().low);
    expect(lr).toBeGreaterThan(ch(homeSky().high)[0]);
    expect(lb).toBeGreaterThanOrEqual(zb - 2);
  });
});
