import { describe, it, expect } from 'vitest';
import {
  newPerfGuard, perfGuardSample, perfGuardStandDown,
  SHED_FPS, SHED_WINDOWS, WARMUP_MS, PERF_SHED_MESSAGE
} from './perfGuard';

// The guard turns off something the user chose. That is a big enough intervention that every rule
// here is about NOT doing it: not while the scene is still warming up, not on one bad window, not
// twice, and not at all once they have said otherwise. Each of those is a way the obvious version of
// this feature would be worse than no feature.

const AFTER_WARMUP = WARMUP_MS + 1;
const SLOW = SHED_FPS - 5;
const FINE = SHED_FPS + 20;

describe('the frame-rate guard', () => {
  it('sheds after a RUN of bad windows, and reports it exactly once', () => {
    const g = newPerfGuard();
    for (let i = 0; i < SHED_WINDOWS - 1; i++) {
      expect(perfGuardSample(g, SLOW, AFTER_WARMUP)).toBe('watching');
    }
    expect(perfGuardSample(g, SLOW, AFTER_WARMUP)).toBe('shed');
    // ...and never again, however bad it gets. Taking something away twice is a fight.
    expect(perfGuardSample(g, 1, AFTER_WARMUP)).toBe('stood-down');
    expect(perfGuardSample(g, 1, AFTER_WARMUP)).toBe('stood-down');
  });

  it('does NOT shed on a single bad window', () => {
    // One window can be ruined by a garbage collection, a tab losing focus, or a window being
    // dragged between screens. None of those is the renderer's fault.
    const g = newPerfGuard();
    expect(perfGuardSample(g, SLOW, AFTER_WARMUP)).toBe('watching');
    expect(g.bad).toBe(1);
  });

  it('forgets the run as soon as a good window arrives', () => {
    const g = newPerfGuard();
    perfGuardSample(g, SLOW, AFTER_WARMUP);
    expect(perfGuardSample(g, FINE, AFTER_WARMUP)).toBe('watching');
    expect(g.bad).toBe(0);
    // So one bad window on either side of a good one is not a run.
    expect(perfGuardSample(g, SLOW, AFTER_WARMUP)).toBe('watching');
  });

  it('ignores everything during the WARM-UP, however bad it looks', () => {
    // The seconds after a build are the slowest a scene ever is — textures painting, geometry
    // uploading — and they are not what the map will feel like. A guard that watched them would
    // strip the atmospheres off every system on arrival.
    const g = newPerfGuard();
    for (let i = 0; i < SHED_WINDOWS + 3; i++) {
      expect(perfGuardSample(g, 1, WARMUP_MS - 1)).toBe('warming-up');
    }
    expect(g.bad).toBe(0);
  });

  it('lets a warm-up window neither COUNT toward a run nor CLEAR one', () => {
    // A rebuild in the middle of a genuinely slow spell resets the clock, not the evidence: if a
    // warm-up sample cleared the run the guard would never reach two windows on a struggling map.
    const g = newPerfGuard();
    perfGuardSample(g, SLOW, AFTER_WARMUP);        // one bad window banked
    perfGuardSample(g, 1, WARMUP_MS - 1);          // a rebuild happens
    expect(g.bad).toBe(1);
    expect(perfGuardSample(g, SLOW, AFTER_WARMUP)).toBe('shed');
  });

  it('stands down for good the moment the user disagrees', () => {
    const g = newPerfGuard();
    perfGuardStandDown(g);
    for (let i = 0; i < 10; i++) expect(perfGuardSample(g, 1, AFTER_WARMUP)).toBe('stood-down');
  });

  it('treats a zero or nonsense frame rate as no evidence rather than as catastrophe', () => {
    // A window with no frames at all is a hidden tab, not a slow map.
    const g = newPerfGuard();
    expect(perfGuardSample(g, 0, AFTER_WARMUP)).toBe('watching');
    expect(perfGuardSample(g, NaN, AFTER_WARMUP)).toBe('watching');
    expect(g.bad).toBe(0);
  });

  it('has thresholds a human would recognise as "bad" rather than as "not perfect"', () => {
    // The number matters: shedding at 50 fps would strip a map that was working fine.
    expect(SHED_FPS).toBeLessThanOrEqual(24);
    expect(SHED_FPS).toBeGreaterThan(5);
    expect(SHED_WINDOWS).toBeGreaterThan(1);
    // `perfTrace` reports every 5 s, so the warm-up must skip at least the build window and one more.
    expect(WARMUP_MS).toBeGreaterThanOrEqual(10000);
  });

  it('says what it did, why, and that it will not do it again', () => {
    expect(PERF_SHED_MESSAGE).toContain('Atmospheres');
    expect(PERF_SHED_MESSAGE).toContain(String(SHED_FPS));
    expect(PERF_SHED_MESSAGE.toLowerCase()).toContain('back on');
    expect(PERF_SHED_MESSAGE.toLowerCase()).toContain('not happen again');
  });
});
