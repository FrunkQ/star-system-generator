import { describe, it, expect } from 'vitest';
import { drawEccentricity, MAX_DRAW_ECC } from './orbitDraw';

/**
 * C19. A belt with `e > 1` put its label far outside the belt, because the label sits at the
 * apoapsis `a * (1 + e)` and an unbound orbit has no apoapsis. The assertions are ABSOLUTE, in AU
 * against a named belt, not ratios: the label must land on the belt it names.
 */
describe('drawEccentricity', () => {
  it('leaves an ordinary orbit exactly as authored', () => {
    expect(drawEccentricity(0)).toBe(0);
    expect(drawEccentricity(0.5)).toBe(0.5);
    expect(drawEccentricity(0.98)).toBe(0.98);
  });

  it('holds an unbound orbit at the last eccentricity that still closes', () => {
    expect(drawEccentricity(1)).toBe(MAX_DRAW_ECC);
    expect(drawEccentricity(5)).toBe(MAX_DRAW_ECC);
    expect(drawEccentricity(1e6)).toBe(MAX_DRAW_ECC);
  });

  it('reads absent, negative and broken values as circular rather than throwing', () => {
    expect(drawEccentricity(undefined)).toBe(0);
    expect(drawEccentricity(null)).toBe(0);
    expect(drawEccentricity(NaN)).toBe(0);
    expect(drawEccentricity(-0.3)).toBe(0);
    // Infinity is broken data rather than a very unbound orbit, so it reads circular like NaN.
    expect(drawEccentricity(Infinity)).toBe(0);
  });

  it('THE FAULT ITSELF: a belt at 3 AU with e = 5 labels on the belt, not 18 AU away', () => {
    const a = 3;
    const authored = 5;
    expect(a * (1 + authored)).toBe(18);                       // where the label used to go
    const drawn = a * (1 + drawEccentricity(authored));
    expect(drawn).toBeCloseTo(5.97, 2);                        // where it goes now: the belt's outer edge
    expect(drawn).toBeLessThan(2 * a);                         // and never beyond a circular belt's diameter
  });

  it('a semi-minor axis stays a real number for any authored eccentricity', () => {
    for (const e of [0, 0.5, 1, 3, 99]) {
      const b = 3 * Math.sqrt(1 - drawEccentricity(e) ** 2);
      expect(Number.isFinite(b), `e=${e} gives b=${b}`).toBe(true);
      expect(b).toBeGreaterThan(0);
    }
  });
});
