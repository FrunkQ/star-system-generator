// G9 is self-checking, and both anchors are famous facts rather than pins on whatever the code printed.
//
//   Sol seen from Alpha Centauri (4.37 ly) is about magnitude 0.5 — a first-magnitude star, and this
//   is the well-known one: our Sun is a bright star in Cassiopeia from there.
//   Sol seen from Tau Ceti (11.9 ly) is about magnitude 2.6, a solid naked-eye star.
//
// If the model reproduces those two it is behaving, because between them they exercise the whole
// chain: map positions, the distance module, the unit conversion, the luminosity field and the
// distance modulus.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { skyStarsFor, absoluteMagnitude, apparentMagnitude, magnitudeLimitFor, SOLAR_ABS_MAG, NAKED_EYE_LIMIT } from './skyStars';
import type { Starmap } from '$lib/types';

const MAP = JSON.parse(readFileSync('static/example-starmaps/Local_Neighbourhood-Starmap.json', 'utf8')) as Starmap;
const idOf = (name: string) => (MAP.systems as any[]).find((s) => s.name === name)!.id;

describe('the magnitude chain', () => {
  it('puts the Sun at its real absolute magnitude', () => {
    expect(absoluteMagnitude(1)).toBeCloseTo(SOLAR_ABS_MAG, 10);
  });

  it('is the distance modulus: 10 pc leaves absolute magnitude untouched', () => {
    expect(apparentMagnitude(4.83, 10)).toBeCloseTo(4.83, 10);
  });

  it('dims by exactly 5 magnitudes per factor of ten in distance', () => {
    expect(apparentMagnitude(0, 100) - apparentMagnitude(0, 10)).toBeCloseTo(5, 10);
  });

  it('brightens by 2.5 magnitudes per factor of ten in luminosity', () => {
    expect(absoluteMagnitude(1) - absoluteMagnitude(10)).toBeCloseTo(2.5, 10);
  });
});

describe('the two anchors, in the bundled map', () => {
  it('Sol from Alpha Centauri is a first-magnitude star, around 0.5', () => {
    const sky = skyStarsFor(MAP, idOf('Alpha Centauri'));
    const sol = sky.find((s) => s.name === 'Sol')!;
    expect(sol).toBeDefined();
    expect(sol.magnitude).toBeGreaterThan(0.2);
    expect(sol.magnitude).toBeLessThan(0.8);
    expect(sol.distanceLy).toBeCloseTo(4.37, 1);
  });

  it('Sol from Tau Ceti is a solid naked-eye star, around 2.6', () => {
    const sky = skyStarsFor(MAP, idOf('Tau Ceti'));
    const sol = sky.find((s) => s.name === 'Sol')!;
    expect(sol.magnitude).toBeGreaterThan(2.3);
    expect(sol.magnitude).toBeLessThan(2.9);
    expect(sol.distanceLy).toBeCloseTo(11.9, 1);
  });

  it('agrees with the real sky from Sol: Sirius is the brightest star there is', () => {
    const sky = skyStarsFor(MAP, idOf('Sol'));
    expect(sky[0].name).toBe('Sirius');           // brightest-first ordering
    expect(sky[0].magnitude).toBeLessThan(-1);    // the real Sirius is -1.46
    expect(sky[0].magnitude).toBeGreaterThan(-2);
  });

  it('puts Alpha Centauri next after Sirius from Sol, as it is in life', () => {
    const sky = skyStarsFor(MAP, idOf('Sol'));
    expect(sky[1].name).toBe('Alpha Centauri');
    expect(sky[1].magnitude).toBeLessThan(0.5);   // real alpha Cen A+B combined is about -0.27
  });

  // The two anchors the item named are the requirement; this is the whole of the rest of the sky
  // agreeing for free. These are the magnitudes anyone can look up, and they are not tunable — the
  // only inputs are the map's positions and each star's `radiationOutput`.
  it('reproduces the five brightest stars of the REAL night sky, from Sol', () => {
    const sky = skyStarsFor(MAP, idOf('Sol'));
    const real: Record<string, number> = {
      Sirius: -1.46, 'Alpha Centauri': -0.27, Vega: 0.03, Procyon: 0.34, Altair: 0.77
    };
    for (const [name, expected] of Object.entries(real)) {
      const s = sky.find((x) => x.name === name);
      expect(s, `${name} should be in Sol's sky`).toBeDefined();
      expect(Math.abs(s!.magnitude - expected), `${name} was ${s!.magnitude.toFixed(2)}, real ${expected}`)
        .toBeLessThan(0.35);
    }
  });
});

describe('what gets drawn and what does not', () => {
  it('never includes the system you are standing in', () => {
    const sky = skyStarsFor(MAP, idOf('Sol'));
    expect(sky.some((s) => s.id === idOf('Sol'))).toBe(false);
  });

  it('culls below the naked-eye limit by default, and the cut is what lets it in', () => {
    const all = skyStarsFor(MAP, idOf('Sol'), { magnitudeLimit: Infinity });
    const eye = skyStarsFor(MAP, idOf('Sol'));
    expect(eye.length).toBeLessThan(all.length);
    expect(eye.every((s) => s.magnitude <= NAKED_EYE_LIMIT)).toBe(true);
    // A dark-sky eye should still make out a fair share of a neighbourhood this close.
    expect(eye.length).toBeGreaterThan(5);
  });

  it('opens the cut for the MARKED mode, because a spike is an instrument and not an eye', () => {
    const eye = skyStarsFor(MAP, idOf('Sol'), { magnitudeLimit: magnitudeLimitFor('true') });
    const inst = skyStarsFor(MAP, idOf('Sol'), { magnitudeLimit: magnitudeLimitFor('marked') });
    expect(inst.length).toBeGreaterThan(eye.length);
    expect(inst.length).toBe(MAP.systems.length - 1);   // every charted system but your own
    expect(magnitudeLimitFor('true')).toBe(NAKED_EYE_LIMIT);
  });

  it('measures how sparse this actually is, so nobody has to guess', () => {
    // A 45-degree field covers (1 - cos(22.5)) / 2 of the sphere. This is the number behind the
    // recommendation in the inbox: the naked-eye set is not findable on a map this size.
    const frac = (1 - Math.cos((45 * Math.PI) / 360)) / 2;
    const eye = skyStarsFor(MAP, idOf('Sol')).length;
    expect(eye * frac).toBeLessThan(1);          // under one star in view, on average
    const inst = skyStarsFor(MAP, idOf('Sol'), { magnitudeLimit: Infinity }).length;
    expect(inst * frac).toBeGreaterThan(1);      // the marked mode at least clears one
  });

  it('returns unit directions, so the caller only has to choose a radius', () => {
    for (const s of skyStarsFor(MAP, idOf('Sol'))) {
      expect(Math.hypot(s.dir.x, s.dir.y, s.dir.z)).toBeCloseTo(1, 12);
    }
  });

  it('points opposite ways from the two ends of one pair', () => {
    const there = skyStarsFor(MAP, idOf('Sol'), { magnitudeLimit: Infinity }).find((s) => s.name === 'Tau Ceti')!;
    const back = skyStarsFor(MAP, idOf('Tau Ceti'), { magnitudeLimit: Infinity }).find((s) => s.name === 'Sol')!;
    expect(there.dir.x).toBeCloseTo(-back.dir.x, 12);
    expect(there.dir.y).toBeCloseTo(-back.dir.y, 12);
    expect(there.dir.z).toBeCloseTo(-back.dir.z, 12);
    expect(there.distanceLy).toBeCloseTo(back.distanceLy, 10);
  });

  it('takes DEPTH into account — the sky is three-dimensional even where travel is not', () => {
    // Every bundled system carries a real z, so no direction should sit exactly on the map plane.
    const sky = skyStarsFor(MAP, idOf('Sol'), { magnitudeLimit: Infinity });
    expect(sky.some((s) => Math.abs(s.dir.z) > 0.05)).toBe(true);
  });

  it('gives a Sun-like star a warm-white and a red dwarf a redder colour', () => {
    const sky = skyStarsFor(MAP, idOf('Alpha Centauri'), { magnitudeLimit: Infinity });
    const sol = sky.find((s) => s.name === 'Sol')!;
    expect(sol.color).toMatch(/^#[0-9a-f]{6}$/);
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [sr, , sb] = rgb(sol.color);
    const barnard = sky.find((s) => s.name === "Barnard's Star");
    if (barnard) {
      const [br, , bb] = rgb(barnard.color);
      // A cool M dwarf is redder: less blue relative to red than a G star.
      expect(bb / br).toBeLessThan(sb / sr);
    }
  });
});
