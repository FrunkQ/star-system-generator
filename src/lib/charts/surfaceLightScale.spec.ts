// The viewer re-derives a body's surface spectrum from its stored summary, and used to do it with
// `luminositySolar: 1` — assuming every star is as bright as the Sun. Around Sol that is exactly
// right, which is why it went unnoticed: the owner's screenshots were of a Sol planet and were
// self-consistent. Around anything else the "% of an Earth noon" figure was wrong by the star's
// luminosity.
//
// The summary already carries `totalTopWm2` (which encodes L/d²) and the derivation is LINEAR in the
// incident flux, so rescaling to match is exact. This pins that, because the alternative — storing
// the luminosity a second time — is the duplication this codebase keeps paying for.
import { describe, it, expect } from 'vitest';
import { deriveSurfaceSpectrum } from '$lib/physics/surfaceSpectrum';
import { lightOperator, homeDaylight, brightnessVs } from '$lib/physics/imageUnderLight';
import type { CelestialBody } from '$lib/types';

const world = (): CelestialBody => ({
  id: 'p', kind: 'body', roleHint: 'planet', makeup: { rock: 0.7, metal: 0.3 },
  calculatedGravity_ms2: 9.81, temperatureK: 288, tags: [],
  atmosphere: { pressure_bar: 1, molarMassKg: 0.02896, composition: { N2: 0.78, O2: 0.21 } }
} as unknown as CelestialBody);

/** Exactly what the viewer does: re-derive at L=1, then rescale to the stored top-of-atmosphere flux. */
const rebuilt = (storedTopWm2: number, distanceAU: number) => {
  const r = deriveSurfaceSpectrum(world(), { starTempK: 5778, luminositySolar: 1, distanceAU }, null)!;
  const k = storedTopWm2 / r.summary.totalTopWm2;
  return r.curves.surface.map((v) => v * k);
};

describe('rebuilding a stored surface spectrum', () => {
  const level = (s: number[]) => brightnessVs(lightOperator(s), homeDaylight());

  it('recovers the true light level around a star that is not the Sun', () => {
    for (const [L, au] of [[1, 1], [0.01, 0.1], [10, 3], [0.0004, 0.02]] as [number, number][]) {
      const truth = deriveSurfaceSpectrum(world(), { starTempK: 5778, luminositySolar: L, distanceAU: au }, null)!;
      const got = rebuilt(truth.summary.totalTopWm2, au);
      expect(level(got), `L=${L} at ${au} AU`).toBeCloseTo(level(truth.curves.surface), 6);
    }
  });

  it('would have been out by the luminosity without it — the error it was hiding', () => {
    const truth = deriveSurfaceSpectrum(world(), { starTempK: 5778, luminositySolar: 0.01, distanceAU: 0.1 }, null)!;
    const naive = deriveSurfaceSpectrum(world(), { starTempK: 5778, luminositySolar: 1, distanceAU: 0.1 }, null)!;
    expect(level(naive.curves.surface) / level(truth.curves.surface)).toBeCloseTo(100, 0);
  });

  it('leaves the spectrum SHAPE alone — only the scale was ever wrong', () => {
    // Which is also why moving a planet nearer its own star changes the brightness and not the tint:
    // distance scales the flux, it does not reshape the light.
    const near = deriveSurfaceSpectrum(world(), { starTempK: 5778, luminositySolar: 1, distanceAU: 0.4 }, null)!;
    const far = deriveSurfaceSpectrum(world(), { starTempK: 5778, luminositySolar: 1, distanceAU: 2 }, null)!;
    const norm = (s: number[]) => { const p = Math.max(...s); return s.map((v) => v / p); };
    const a = norm(near.curves.surface), b = norm(far.curves.surface);
    expect(a.length).toBe(b.length);
    // Elementwise with tolerance: the two differ only in the last bit of the division, which is
    // itself the point — the shape is the same curve, scaled.
    for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i], 12);
  });
});
