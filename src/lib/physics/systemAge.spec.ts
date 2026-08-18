import { describe, it, expect } from 'vitest';
import { guessSystemAge } from './systemAge';
import { SOLAR_MASS_KG } from '$lib/constants';

/**
 * ONE age model for every importer. Pins: a star-aware guess (never a flat 4.6); the band is the
 * star's own life; a stated age wins when it fits and is refused with a note when it cannot; the
 * families that genuinely cannot be dated say so instead of pretending.
 */
const star = (mSolar: number, classKey: string, extra: Partial<Parameters<typeof guessSystemAge>[0] & {}> = {}) =>
  ({ massKg: mSolar * SOLAR_MASS_KG, classes: [classKey], ...extra });

describe('guessSystemAge', () => {
  it('an A star is NOT 4.6 Gyr — the guess is inside its short life', () => {
    // The user's report: an A-type primary imported at 4.6 Gyr. An A5V lives ~1 Gyr; middle-aged is ~0.5.
    const g = guessSystemAge(star(2.0, 'star/A'));
    expect(g.ageGyr).toBeLessThan(1.5);
    expect(g.bandGyr[1]).toBeLessThan(2.5);
    expect(g.estimated).toBe(true);
    expect(g.source).toBe('main-sequence-midlife');
  });

  it('a Sun-like star guesses middle-aged and the band runs to the end of the main sequence', () => {
    const g = guessSystemAge(star(1.0, 'star/G'));
    expect(g.ageGyr).toBeGreaterThan(3);
    expect(g.ageGyr).toBeLessThan(7);
    expect(g.bandGyr[0]).toBeLessThan(0.01);
    expect(g.bandGyr[1]).toBeGreaterThan(8);
  });

  it('an M dwarf outlives the galaxy, so the band is capped at the galaxy\'s age, not its own life', () => {
    const g = guessSystemAge(star(0.3, 'star/M'));
    expect(g.bandGyr[1]).toBeLessThanOrEqual(13.0);
    expect(g.ageGyr).toBeLessThanOrEqual(13.0);
  });

  it('a giant is at the END of its main-sequence life, not the middle', () => {
    const ms = guessSystemAge(star(1.5, 'star/G'));
    const giant = guessSystemAge(star(1.5, 'star/G-III'));
    expect(giant.ageGyr).toBeGreaterThan(ms.ageGyr);
    expect(giant.source).toBe('giant-late-life');
    expect(giant.bandGyr[0]).toBeGreaterThan(ms.ageGyr);
  });

  it('a white dwarf dates by cooling — hotter is younger', () => {
    const hot = guessSystemAge(star(0.6, 'star/WD', { temperatureK: 20000 }));
    const cool = guessSystemAge(star(0.6, 'star/WD', { temperatureK: 6000 }));
    expect(hot.ageGyr).toBeLessThan(cool.ageGyr);
    expect(hot.source).toBe('wd-cooling');
  });

  it('a brown dwarf is honestly undated: median guess, wide band, estimated', () => {
    const g = guessSystemAge(star(0.05, 'star/L'));
    expect(g.source).toBe('brown-dwarf-median');
    expect(g.estimated).toBe(true);
    expect(g.bandGyr[1] - g.bandGyr[0]).toBeGreaterThan(10);
  });

  it('a stated age inside the band wins and is not marked estimated', () => {
    const g = guessSystemAge(star(1.0, 'star/G', { statedAgeGyr: 2.2 }));
    expect(g.ageGyr).toBeCloseTo(2.2, 3);
    expect(g.estimated).toBe(false);
    expect(g.source).toBe('stated');
  });

  it('a stated age the star cannot have is refused, with the reason', () => {
    // An A star stated as 8 Gyr would be a white dwarf by then. Use the guess, say why.
    const g = guessSystemAge(star(2.0, 'star/A', { statedAgeGyr: 8 }));
    expect(g.source).toBe('stated-clamped');
    expect(g.ageGyr).toBeLessThan(2);
    expect(g.note).toMatch(/cannot be that old/);
  });

  it('no star: galactic median, whole range open, and it SAYS a star is needed', () => {
    const g = guessSystemAge(null);
    expect(g.source).toBe('no-star');
    expect(g.note).toMatch(/Supply a star/);
    expect(g.bandGyr[1]).toBeGreaterThan(12);
  });

  it('exposes a flaring marker for a young dwarf, so the UI can show it as an option', () => {
    const g = guessSystemAge(star(0.4, 'star/M'));
    expect(g.flaringBelowGyr).toBeDefined();
    expect(g.flaringBelowGyr!).toBeGreaterThan(0);
  });
});
