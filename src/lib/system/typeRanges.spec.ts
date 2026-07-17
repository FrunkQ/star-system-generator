import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { pickableTypes, bestTypeFor, sliderSpan, rangeOf, isPickable, UNKNOWN_CLASS } from './typeRanges';
import type { Fingerprint } from '$lib/types';

const realFps = JSON.parse(
  fs.readFileSync(path.resolve('static/rulepacks/starter-sf/classification.json'), 'utf-8')
).classifier.fingerprints as Fingerprint[];

describe('typeRanges — range metadata over the classifier', () => {
  it('specialist/derived classes are not pickable; physical ones are', () => {
    const byClass = (c: string) => realFps.find((f) => f.class === c)!;
    expect(isPickable(byClass('planet/terrestrial'))).toBe(true);
    expect(isPickable(byClass('asteroid/comet'))).toBe(true);
    expect(isPickable(byClass('planet/swamp'))).toBe(false);      // biosphere-derived
    expect(isPickable(byClass('planet/cold-eyeball'))).toBe(false); // lock-derived
    expect(isPickable(byClass('planet/rogue'))).toBe(false);      // structure-derived
  });

  it('rangeOf prefers the authored range, falls back to match bands', () => {
    const terr = realFps.find((f) => f.class === 'planet/terrestrial')!;
    expect(rangeOf(terr, 'mass_Me')).toEqual([0.1, 2]);           // authored (match has none)
    const eyeball = realFps.find((f) => f.class === 'planet/cold-eyeball')!;
    expect(rangeOf(eyeball, 'Teq_K')).not.toBeNull();             // falls back to match
  });

  it('Earth context offers the terrestrial family, not giants or hot classes', () => {
    const classes = pickableTypes(realFps, { massMe: 1, teqK: 255 }).map((f) => f.class);
    expect(classes).toContain('planet/terrestrial');
    expect(classes).toContain('planet/silicate');
    expect(classes).not.toContain('planet/gas-giant');            // mass-gated out
    expect(classes).not.toContain('planet/lava');                 // Teq-gated out
    expect(classes).not.toContain('planet/swamp');                // specialist — never offered
  });

  it('comet context offers the asteroid family', () => {
    const classes = pickableTypes(realFps, { massMe: 1e-12, teqK: 150 }).map((f) => f.class);
    expect(classes).toContain('asteroid/comet');
    expect(classes).toContain('asteroid/c-type');
    expect(classes).not.toContain('planet/terrestrial');
  });

  it('bestTypeFor lands an Earth-like state on a terrestrial-family class', () => {
    const best = bestTypeFor(realFps, { massMe: 1, radiusRe: 1, density: 5.5, teqK: 255 });
    expect(['planet/terrestrial', 'planet/silicate', 'planet/iron']).toContain(best);
  });

  it('bestTypeFor returns null for nonsense — the caller pins Unknown', () => {
    // Jupiter mass at moon radius: density in the thousands, fits nothing.
    expect(bestTypeFor(realFps, { massMe: 318, radiusRe: 0.1, density: 3e5 })).toBeNull();
    expect(UNKNOWN_CLASS).toBe('planet/unknown');
  });

  it('sliderSpan pads in log space and clamps to the full range', () => {
    const [lo, hi] = sliderSpan([0.1, 2], 1e-12, 1e5);
    expect(lo).toBeLessThan(0.1);
    expect(hi).toBeGreaterThan(2);
    expect(lo).toBeGreaterThan(0.05);                              // ~15% of log-width, not decades
    expect(hi).toBeLessThan(4);
  });

  it('sliderSpan enforces a minimum ×2 window on narrow bands', () => {
    const [lo, hi] = sliderSpan([1.0, 1.05], 1e-12, 1e5);
    expect(hi / lo).toBeGreaterThanOrEqual(2 * 0.999);
  });

  it('sliderSpan with no range is the full span — the Unknown case', () => {
    expect(sliderSpan(null, 1e-12, 1e5)).toEqual([1e-12, 1e5]);
  });
});
