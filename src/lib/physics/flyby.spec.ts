import { describe, it, expect } from 'vitest';
import { hyperbolicFlyby } from './flyby';

describe('hyperbolicFlyby — analytic gravity assist', () => {
  const mu = 4; // arbitrary self-consistent units

  it('a pass at e=2 turns the velocity by 60°', () => {
    // Choose v∞ and rp so that rp·v∞²/μ = 1 → e = 2 → turn = 2·asin(1/2) = 60°.
    const rp = 1;
    const vinf = Math.sqrt(mu / rp); // rp·v∞²/μ = 1
    const r = hyperbolicFlyby([vinf, 0], rp, mu, 1);
    expect(r.e).toBeCloseTo(2, 6);
    expect(r.turn).toBeCloseTo(Math.PI / 3, 6); // 60°
    // speed is preserved by a flyby
    expect(Math.hypot(r.vOut[0], r.vOut[1])).toBeCloseTo(vinf, 6);
    // rotated +60° from +x
    expect(r.vOut[0]).toBeCloseTo(vinf * Math.cos(Math.PI / 3), 6);
    expect(r.vOut[1]).toBeCloseTo(vinf * Math.sin(Math.PI / 3), 6);
  });

  it('a very fast pass barely bends; a slow close pass bends hard', () => {
    const fast = hyperbolicFlyby([100, 0], 1, mu, 1);
    const slow = hyperbolicFlyby([0.1, 0], 1, mu, 1);
    expect(fast.turn).toBeLessThan(0.05); // nearly straight through
    expect(slow.turn).toBeGreaterThan(Math.PI / 2); // whips around
  });

  it('side flips the bend direction', () => {
    const up = hyperbolicFlyby([1, 0], 1, mu, 1);
    const down = hyperbolicFlyby([1, 0], 1, mu, -1);
    expect(up.vOut[1]).toBeCloseTo(-down.vOut[1], 9);
    expect(up.vOut[0]).toBeCloseTo(down.vOut[0], 9);
  });

  it('degenerate inputs pass the velocity straight through', () => {
    expect(hyperbolicFlyby([0, 0], 1, mu).turn).toBe(0);
    expect(hyperbolicFlyby([1, 0], 0, mu).turn).toBe(0);
    expect(hyperbolicFlyby([1, 0], 1, 0).turn).toBe(0);
  });
});
