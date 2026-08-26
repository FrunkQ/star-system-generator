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
    // The result gained a third dimension when transit did (2026-08-26). A caller that supplies no z
    // gets zero back, which is the same answer it always had, now said explicitly.
    const r = driftAt({ t0: 100, x: 5, y: 5, vx: 1, vy: 0 }, zero, 50, 1);
    expect(r).toEqual({ x: 5, y: 5, z: 0, vx: 1, vy: 0, vz: 0 });
  });

  it('carries height and vertical speed when it is given them', () => {
    const r = driftAt({ t0: 0, x: 0, y: 0, z: 3, vx: 0, vy: 0, vz: -2 }, zero, 10, 1);
    expect(r.z).toBeCloseTo(3 - 20, 9);
    expect(r.vz).toBeCloseTo(-2, 9);
  });

  it('falls out of the plane toward a mass that is out of the plane', () => {
    // A purely vertical inverse-square pull: the particle starts level with the origin and is drawn
    // upward. Before this was 3D the z simply never moved.
    const up: AccelField = () => [0, 0, 4];
    const r = driftAt({ t0: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, up, 2, 0.1);
    expect(r.z).toBeCloseTo(0.5 * 4 * 4, 6);
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
