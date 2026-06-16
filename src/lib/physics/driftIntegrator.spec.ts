import { describe, it, expect } from 'vitest';
import { driftAt, inverseSquareField, type AccelField } from './driftIntegrator';

const zero: AccelField = () => [0, 0];

describe('driftAt — deterministic drift integrator', () => {
  it('no field → straight line (matches ballistic drift)', () => {
    const r = driftAt({ t0: 0, x: 0, y: 0, vx: 2, vy: -1 }, zero, 10, 1);
    expect(r.x).toBeCloseTo(20);
    expect(r.y).toBeCloseTo(-10);
    expect(r.vx).toBeCloseTo(2);
  });

  it('before the anchor time → unmoved', () => {
    const r = driftAt({ t0: 100, x: 5, y: 5, vx: 1, vy: 0 }, zero, 50, 1);
    expect(r).toEqual({ x: 5, y: 5, vx: 1, vy: 0 });
  });

  it('constant field → exact kinematics (x = ½at²)', () => {
    const g: AccelField = () => [0, -2];
    const r = driftAt({ t0: 0, x: 0, y: 0, vx: 0, vy: 0 }, g, 10, 0.5);
    expect(r.y).toBeCloseTo(-100);   // 0.5 * -2 * 10²
    expect(r.vy).toBeCloseTo(-20);
  });

  it('is deterministic — same (anchor, t) gives the same point regardless of when asked', () => {
    const g: AccelField = (x, y) => [-0.01 * x, -0.01 * y];
    const a = { t0: 0, x: 10, y: 0, vx: 0, vy: 0 };
    expect(driftAt(a, g, 37, 0.25)).toEqual(driftAt(a, g, 37, 0.25));
  });

  it('inverse-square field: a particle at rest falls toward the mass', () => {
    const field = inverseSquareField([{ mu: 100, posAt: () => [0, 0] }]);
    const r = driftAt({ t0: 0, x: 10, y: 0, vx: 0, vy: 0 }, field, 1, 0.005);   // short fall, before reaching the mass
    expect(r.x).toBeLessThan(10);    // pulled inward
    expect(r.x).toBeGreaterThan(0);  // hasn't reached the mass yet
    expect(r.vx).toBeLessThan(0);    // moving toward the mass
    expect(Math.abs(r.y)).toBeLessThan(1e-6);   // stays on the axis
  });

  it('inverse-square field: a circular-velocity particle keeps ~constant radius', () => {
    const mu = 100, R = 10;
    const field = inverseSquareField([{ mu, posAt: () => [0, 0] }]);
    const vCirc = Math.sqrt(mu / R);
    // quarter orbit
    const r = driftAt({ t0: 0, x: R, y: 0, vx: 0, vy: vCirc }, field, (2 * Math.PI * R / vCirc) / 4, 0.005);
    expect(Math.hypot(r.x, r.y)).toBeCloseTo(R, 0);   // radius preserved (within ~1 unit)
  });
});
