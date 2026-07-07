import { describe, it, expect } from 'vitest';
import { calculateDistanceToStar } from './temperature';
import type { CelestialBody } from '$lib/types';

// Phase 04.1 — eccentric orbits receive a higher time-averaged flux, so the flux-equivalent
// distance used for equilibrium temperature is a·(1−e²)^¼ (< a), not the mean a.
function star(): CelestialBody {
  return { id: 's', kind: 'body', roleHint: 'star' } as unknown as CelestialBody;
}
function planet(e: number): CelestialBody {
  return {
    id: 'p', kind: 'body', roleHint: 'planet', parentId: 's',
    orbit: { elements: { a_AU: 1, e } }
  } as unknown as CelestialBody;
}

describe('calculateDistanceToStar — eccentric rms-flux distance (04.1)', () => {
  it('a circular orbit (e=0) returns the semi-major axis unchanged', () => {
    const p = planet(0);
    expect(calculateDistanceToStar(p, star(), [star(), p])).toBeCloseTo(1, 6);
  });

  it('an eccentric orbit returns a·(1−e²)^¼ (< a → hotter)', () => {
    const p = planet(0.5);
    const expected = 1 * Math.pow(1 - 0.25, 0.25); // 0.9306…
    expect(calculateDistanceToStar(p, star(), [star(), p])).toBeCloseTo(expected, 6);
    expect(calculateDistanceToStar(p, star(), [star(), p])).toBeLessThan(1);
  });

  it('effective distance decreases monotonically with eccentricity', () => {
    const d = [0, 0.2, 0.4, 0.6].map((e) => {
      const p = planet(e);
      return calculateDistanceToStar(p, star(), [star(), p]);
    });
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeLessThan(d[i - 1]);
  });

  it("Earth-like (e≈0.017) barely moves; the correction is sub-percent", () => {
    const p = planet(0.0167);
    const d = calculateDistanceToStar(p, star(), [star(), p]);
    expect(d).toBeGreaterThan(0.9999);
    expect(d).toBeLessThan(1);
  });
});
