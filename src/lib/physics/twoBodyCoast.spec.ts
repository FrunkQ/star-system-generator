import { describe, it, expect } from 'vitest';
import { keplerUniversal } from './twoBodyCoast';

// Normalised units (mu = 1) so the maths is clean: a circular orbit at r=1 has v=1 and period 2π.
const energy = (r: any, v: any, mu = 1) => (v.x * v.x + v.y * v.y) / 2 - mu / Math.hypot(r.x, r.y);

describe('keplerUniversal — deterministic two-body propagation', () => {
  it('advances a circular orbit a quarter then full period', () => {
    const r0 = { x: 1, y: 0 }, v0 = { x: 0, y: 1 }; // circular, mu=1
    const q = keplerUniversal(r0, v0, 1, Math.PI / 2); // quarter period
    expect(q.r.x).toBeCloseTo(0, 4);
    expect(q.r.y).toBeCloseTo(1, 4);
    expect(Math.hypot(q.v.x, q.v.y)).toBeCloseTo(1, 4); // speed unchanged on a circle
    const full = keplerUniversal(r0, v0, 1, 2 * Math.PI);
    expect(full.r.x).toBeCloseTo(1, 3);
    expect(full.r.y).toBeCloseTo(0, 3);
  });

  it('is reversible: forward then backward returns the start (deterministic)', () => {
    const r0 = { x: 1.3, y: -0.4 }, v0 = { x: 0.2, y: 0.9 }; // some elliptical orbit
    const fwd = keplerUniversal(r0, v0, 1, 3.7);
    const back = keplerUniversal(fwd.r, fwd.v, 1, -3.7);
    expect(back.r.x).toBeCloseTo(r0.x, 5);
    expect(back.r.y).toBeCloseTo(r0.y, 5);
    expect(back.v.x).toBeCloseTo(v0.x, 5);
    expect(back.v.y).toBeCloseTo(v0.y, 5);
  });

  it('CONSERVES ENERGY on a bound (elliptical) orbit — no spurious gain', () => {
    const r0 = { x: 1, y: 0 }, v0 = { x: 0, y: 0.7 }; // v < circular → elliptical, dips toward the centre
    const e0 = energy(r0, v0);
    for (const dt of [0.5, 1.5, 3.0, 5.0, 9.0]) {
      const s = keplerUniversal(r0, v0, 1, dt);
      expect(energy(s.r, s.v)).toBeCloseTo(e0, 6); // same orbital energy at every time
    }
  });

  it('CONSERVES ENERGY through a deep perihelion pass (the slingshot case)', () => {
    // Nearly-radial infall: almost no angular momentum, so it whips past the centre at high speed — exactly
    // where the old step-integrator injected energy and flung the ship out. Energy must stay constant.
    const r0 = { x: 5, y: 0 }, v0 = { x: -0.6, y: 0.02 };
    const e0 = energy(r0, v0);
    for (const dt of [2, 4, 6, 8, 12, 20]) {
      const s = keplerUniversal(r0, v0, 1, dt);
      expect(energy(s.r, s.v)).toBeCloseTo(e0, 5);
    }
  });

  it('CONSERVES ENERGY on an unbound (hyperbolic) escape', () => {
    const r0 = { x: 1, y: 0 }, v0 = { x: 0, y: 1.6 }; // v > escape (√2) → hyperbolic
    const e0 = energy(r0, v0);
    expect(e0).toBeGreaterThan(0); // positive energy = unbound
    for (const dt of [1, 3, 7, 15]) {
      const s = keplerUniversal(r0, v0, 1, dt);
      expect(energy(s.r, s.v)).toBeCloseTo(e0, 5);
    }
  });
});
