import { describe, it, expect } from 'vitest';
import { predictTidalLock, tidalLockTimescaleGyr } from './tidalLock';

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
