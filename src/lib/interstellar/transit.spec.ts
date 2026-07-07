import { describe, it, expect } from 'vitest';
import {
  realisticTransit, masslessTransit, relativisticTransit, jumpTransit,
  distanceToMeters, crewLoad, kineticEnergyJoules, massEnergyEquivalent, fmtFractionC,
} from './transit';
import { LY_M, PC_M, C_MS, JULIAN_YEAR_S } from '../constants';

const FOUR_LY = distanceToMeters(4, 'LY');

describe('interstellar/transit', () => {
  it('converts distance units', () => {
    expect(distanceToMeters(1, 'LY')).toBeCloseTo(LY_M, -10);
    expect(distanceToMeters(1, 'pc')).toBeCloseTo(PC_M, -10);
    expect(distanceToMeters(1, 'AU')).toBeCloseTo(1.496e11, -8);
  });

  it('relativistic: dilation grows with speed; ship time < observer time', () => {
    const slow = relativisticTransit(0.1, FOUR_LY);
    const fast = relativisticTransit(0.99, FOUR_LY);
    expect(slow.status).toBe('green');
    // 4 ly at 0.1c ~ 40 observer-years
    expect(slow.observerSeconds / JULIAN_YEAR_S).toBeCloseTo(40, 0);
    expect(slow.shipSeconds).toBeLessThan(slow.observerSeconds);
    expect(fast.gamma).toBeGreaterThan(7); // gamma(0.99c) ~ 7.09
    expect(fast.shipSeconds).toBeLessThan(fast.observerSeconds);
  });

  it('jump: same time in both frames', () => {
    const r = jumpTransit(30, FOUR_LY);
    expect(r.status).toBe('green');
    expect(r.observerSeconds).toBe(30 * 86400);
    expect(r.shipSeconds).toBe(30 * 86400);
    expect(r.gamma).toBe(1);
  });

  it('massless: constant-g flip-and-burn — no cruise, peak < c, ship time dilated, faster at higher g', () => {
    const oneG = masslessTransit(9.80665, FOUR_LY);
    expect(oneG.status).toBe('green');
    expect(oneG.fractionC).toBeGreaterThan(0.5);   // ~0.95c peak at 1g over 4 ly
    expect(oneG.fractionC).toBeLessThan(1);         // never reaches c
    expect(oneG.shipSeconds).toBeLessThan(oneG.observerSeconds); // dilation
    const tenG = masslessTransit(10 * 9.80665, FOUR_LY);
    expect(tenG.observerSeconds).toBeLessThan(oneG.observerSeconds); // more g → quicker
    expect(tenG.fractionC).toBeGreaterThan(oneG.fractionC);
  });

  it('fmtFractionC never reads 100% c and reveals the gap near light speed', () => {
    expect(fmtFractionC(0.999951)).not.toContain('100');
    expect(fmtFractionC(0.99999999)).not.toContain('100');
    expect(fmtFractionC(0.5)).toBe('50.0% c');
    // The massless peak at high g over interstellar distance must not display as 100% c.
    const r = masslessTransit(10 * 9.80665, distanceToMeters(4, 'LY'));
    expect(fmtFractionC(r.fractionC)).not.toContain('100');
    expect(r.detail).not.toContain('100.0% c');
  });

  it('crewLoad: 2 g green, 2–10 g yellow, >10 g red', () => {
    expect(crewLoad(1 * 9.80665).status).toBe('green');
    expect(crewLoad(5 * 9.80665).status).toBe('yellow');
    expect(crewLoad(20 * 9.80665).status).toBe('red');
  });

  it('kinetic energy + mass-energy equivalent grow with speed', () => {
    const slow = kineticEnergyJoules(1000, 0.1);
    const fast = kineticEnergyJoules(1000, 0.99);
    expect(fast).toBeGreaterThan(slow);
    expect(massEnergyEquivalent(0)).toBe('—');
    // Human-readable: a named unit, and never scientific notation.
    const label = massEnergyEquivalent(fast);
    expect(label).not.toMatch(/e[+-]?\d/i);
    expect(label).toMatch(/(g|kg|tonnes|kilotonnes|megatonnes|gigatonnes|teratonnes|Earth|Jupiter)/);
  });

  it('realistic: RED when the drive cannot escape the star', () => {
    const r = realisticTransit({
      avgIsp_s: 350, dryMassKg: 1000, fuelMassKg: 200, fuelFraction: 1,
      starMassKg: 1.989e30, orbitRadius_m: 1.496e11, distance_m: FOUR_LY,
    });
    expect(r.status).toBe('red');
    expect(r.cruise_ms).toBe(0);
  });

  it('realistic: GREEN when there is escape + braking margin, YELLOW when not', () => {
    // High-Isp, fuel-heavy ship: escapes with plenty of spare.
    const base = { avgIsp_s: 8000, dryMassKg: 1000, fuelMassKg: 9000, starMassKg: 1.989e30, orbitRadius_m: 1.496e11, distance_m: FOUR_LY };
    const balanced = realisticTransit({ ...base, fuelFraction: 0.5 });
    expect(balanced.status).toBe('green');
    expect(balanced.cruise_ms).toBeGreaterThan(0);
    // Dump nearly all fuel into the outbound burn → can't brake → yellow.
    const allOut = realisticTransit({ ...base, fuelFraction: 0.98 });
    expect(allOut.status).toBe('yellow');
    expect(allOut.cruise_ms).toBeGreaterThan(balanced.cruise_ms);
  });
});
