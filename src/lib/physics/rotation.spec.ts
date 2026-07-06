import { describe, it, expect } from 'vitest';
import { breakupPeriodHours, spinFraction, oblateness, rotationalDeform } from './rotation';

describe('rotational deformation', () => {
  it('breakup period depends only on density — denser worlds can spin faster', () => {
    // Earth (5.51 g/cc) breaks up around a ~1.4 h day; a low-density gas giant lets go much sooner.
    expect(breakupPeriodHours(5.51)).toBeCloseTo(1.4, 1);
    expect(breakupPeriodHours(0.69)).toBeGreaterThan(breakupPeriodHours(5.51)); // Saturn-density < denser
  });

  it('real planets sit well inside the limit: Earth spherical, Jupiter/Saturn oblate', () => {
    expect(rotationalDeform(24, 5.51).shape).toBe('spherical');   // Earth
    expect(rotationalDeform(9.9, 1.33).shape).toBe('oblate');     // Jupiter (r≈0.29)
    expect(rotationalDeform(10.7, 0.69).shape).toBe('oblate');    // Saturn (r≈0.37)
    expect(rotationalDeform(24, 5.51).oblateness).toBeLessThan(0.01);
    expect(rotationalDeform(9.9, 1.33).oblateness).toBeGreaterThan(0.05); // visibly flattened
  });

  it('spinning a body toward its breakup period escalates the shape', () => {
    const rho = 3;
    const Tb = breakupPeriodHours(rho);
    expect(rotationalDeform(Tb / 0.3, rho).shape).toBe('oblate');       // fraction 0.3
    expect(rotationalDeform(Tb / 0.6, rho).shape).toBe('ellipsoid');    // fraction 0.6
    expect(rotationalDeform(Tb / 0.9, rho).shape).toBe('near-breakup'); // fraction 0.9
    expect(rotationalDeform(Tb * 0.9, rho).shape).toBe('unstable');     // faster than breakup ⇒ flies apart
  });

  it('spin fraction is 1 exactly at the breakup period and >1 beyond it', () => {
    const rho = 4, Tb = breakupPeriodHours(rho);
    expect(spinFraction(Tb, rho)).toBeCloseTo(1, 5);
    expect(spinFraction(Tb / 2, rho)).toBeCloseTo(2, 5); // twice the breakup spin
    expect(spinFraction(0, rho)).toBe(0);                // not spinning
  });

  it('a slow rotator is spherical regardless of density', () => {
    expect(rotationalDeform(5832, 5.24).shape).toBe('spherical'); // Venus — 5832 h day
    expect(oblateness(5832, 5.24)).toBeLessThan(1e-4);
  });
});
