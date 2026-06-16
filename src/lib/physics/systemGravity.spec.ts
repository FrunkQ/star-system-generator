import { describe, it, expect } from 'vitest';
import { driftAt } from './driftIntegrator';
import { systemGravityField, G_AU } from './systemGravity';

const SOLAR_MASS = 1.989e30;
const YEAR = 365.25 * 86400;

describe('systemGravity — real-units in-system drift', () => {
  // A solar-mass star fixed at the origin (AU).
  const field = systemGravityField([{ id: 'star', massKg: SOLAR_MASS }], () => [0, 0]);

  it('a ship left stationary at 1 AU falls toward the star', () => {
    const r = driftAt({ t0: 0, x: 1, y: 0, vx: 0, vy: 0 }, field, YEAR * 0.1, 3600);
    expect(r.x).toBeLessThan(1);     // pulled inward
    expect(r.x).toBeGreaterThan(0);  // not yet at the star
    expect(r.vx).toBeLessThan(0);    // moving sunward
  });

  it('circular orbital velocity at 1 AU keeps a ~1 AU radius (≈ Earth, ~1 yr period)', () => {
    const mu = G_AU * SOLAR_MASS;
    const vCirc = Math.sqrt(mu / 1);                 // AU/s for a 1 AU circular orbit
    expect(vCirc * YEAR).toBeCloseTo(2 * Math.PI, 1);  // ~2π AU travelled in a year → ~1 yr period
    const quarter = driftAt({ t0: 0, x: 1, y: 0, vx: 0, vy: vCirc }, field, YEAR / 4, 3600);
    expect(Math.hypot(quarter.x, quarter.y)).toBeCloseTo(1, 1);   // radius preserved
    expect(quarter.y).toBeGreaterThan(0.9);          // swept ~90° round
  });
});
