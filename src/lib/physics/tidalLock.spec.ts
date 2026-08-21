import { describe, it, expect } from 'vitest';
import { predictTidalLock, tidalLockTimescaleGyr, lockedSpin } from './tidalLock';

const AU = 149597870.7; // km
const EM = 5.972e24, ER = 6371; // Earth mass kg, radius km
const SUN = 1.989e30, AGE = 4.6;

// Calibration oracle: the heuristic must lock every regular moon + Mercury, and leave the
// AU-distance planets and gas giants free-spinning, over the Solar System's age.
describe('tidal locking timescale', () => {
  it('locks the major moons (small orbit, massive host)', () => {
    // Luna about Earth
    expect(predictTidalLock(384400 / AU, 1737, 7.35e22, EM, AGE)).toBe(true);
    // Io about Jupiter
    expect(predictTidalLock(421800 / AU, 1821.6, 8.93e22, 1.898e27, AGE)).toBe(true);
    // Titan about Saturn
    expect(predictTidalLock(1221870 / AU, 2575, 1.345e23, 5.683e26, AGE)).toBe(true);
    // Iapetus — far Saturnian moon, still locked
    expect(predictTidalLock(3560820 / AU, 735, 1.8e21, 5.683e26, AGE)).toBe(true);
  });

  it('locks Mercury but not the other inner planets', () => {
    expect(predictTidalLock(0.387, 2440, 3.30e23, SUN, AGE)).toBe(true);   // Mercury
    expect(predictTidalLock(1.0, ER, EM, SUN, AGE)).toBe(false);            // Earth
    expect(predictTidalLock(0.723, 6052, 4.87e24, SUN, AGE)).toBe(false);   // Venus
    expect(predictTidalLock(1.524, 3390, 6.42e23, SUN, AGE)).toBe(false);   // Mars
  });

  it('never locks a gas giant at AU distance', () => {
    expect(predictTidalLock(5.2, 69911, 1.898e27, SUN, AGE)).toBe(false);   // Jupiter
  });

  it('a young system has had less time to lock (longer-period bodies stay free)', () => {
    // Iapetus locks over 4.6 Gyr but not in the first megayear.
    expect(predictTidalLock(3560820 / AU, 735, 1.8e21, 5.683e26, 0.001)).toBe(false);
    expect(tidalLockTimescaleGyr(3560820 / AU, 735, 1.8e21, 5.683e26)).toBeGreaterThan(0.001);
  });
});

// A locked body cannot be shown as locked AND given a contradictory day length (inbox B7). The
// answer is its orbital period — EXCEPT where an eccentric orbit has captured the spin into a
// higher-order resonance, which is not a hypothetical: it is Mercury.
describe('locked spin reconciliation', () => {
  const LUNA_ORBIT = 655.7, MERCURY_ORBIT = 2110.94, MERCURY_SPIN = 1407.6;

  it('a locked body with no spin at all takes its orbital period', () => {
    expect(lockedSpin(LUNA_ORBIT, undefined, 0.055)).toEqual({ kind: 'synchronous', rotationHours: LUNA_ORBIT });
  });

  it('an authored spin that already agrees is left where it is', () => {
    const s = lockedSpin(LUNA_ORBIT, 655.7, 0.055);
    expect(s.kind).toBe('synchronous');
    expect(s.rotationHours).toBeCloseTo(655.7, 6);
  });

  it('an authored spin that contradicts the lock loses to it', () => {
    // Pandora: 41.8 h authored against a ~3-day orbit around a gas giant, on a near-circular orbit.
    const s = lockedSpin(74.76, 41.8, 0.0096);
    expect(s.kind).toBe('synchronous');
    expect(s.rotationHours).toBeCloseTo(74.76, 6);
  });

  it('MERCURY keeps its measured 3:2 — the day that is not the year', () => {
    const s = lockedSpin(MERCURY_ORBIT, MERCURY_SPIN, 0.2056);
    expect(s.kind).toBe('resonant');
    expect(s.ratio).toBe('3:2');
    expect(s.rotationHours).toBe(MERCURY_SPIN); // untouched, because it is measured
  });

  it('the same 3:2 ratio on a CIRCULAR orbit is not a resonance — tides would have finished the job', () => {
    expect(lockedSpin(MERCURY_ORBIT, MERCURY_SPIN, 0.01).kind).toBe('synchronous');
  });

  it('a spin SLOWER than the orbit is never called a resonance (not a tidal end state)', () => {
    // Conquestor: 879 h against a 446 h orbit, e = 0.126 — eccentric enough, but sub-synchronous.
    expect(lockedSpin(446.31, 879, 0.126).kind).toBe('synchronous');
  });

  it('a day that merely happens to be eccentric is not promoted to a resonance', () => {
    // Fames: 25 h against a 3581 h orbit at e = 0.29. Nowhere near a half-integer ratio.
    expect(lockedSpin(3581.03, 25.03, 0.29).kind).toBe('synchronous');
  });

  it('a retrograde spin stays retrograde when its period is reconciled', () => {
    // Pluto/Charon: Pluto's spin is stored negative, and reconciling must not flip it.
    const s = lockedSpin(151.58, -153.3, 0.0);
    expect(s.rotationHours).toBeCloseTo(-151.58, 6);
  });
});
