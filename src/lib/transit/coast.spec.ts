import { describe, it, expect } from 'vitest';
import { coastUnderGravity, coastPathUnderGravity } from './scheduler';
import type { System } from '$lib/types';

// One Sun-mass star at the system root (sits at the origin). A cut-loose ship then coasts under its real
// gravity — the in-system "adrift" path — so this validates the wiring (ms↔s, m/s↔AU/s, star detection).
const SOLAR = 1.989e30;
const YEAR = 365.25 * 86400;
const G = 6.674e-11, AU_M = 1.495978707e11;
const vCirc = Math.sqrt((G * SOLAR) / AU_M); // ≈ 29.8 km/s, Earth's orbital speed

const sys = {
  id: 's', nodes: [{ id: 'star', kind: 'body', roleHint: 'star', classes: ['star/G'], parentId: null, massKg: SOLAR }]
} as unknown as System;

describe('coastUnderGravity — in-system adrift under real gravity', () => {
  it('a ship at circular speed holds ~1 AU and sweeps round (a slow ellipse, not a straight line)', () => {
    const r = coastUnderGravity(sys, { x: 1, y: 0 }, { x: 0, y: vCirc }, 0, (YEAR / 4) * 1000);
    const radius = Math.hypot(r.position_au.x, r.position_au.y);
    expect(radius).toBeCloseTo(1, 1);          // stays ~1 AU
    expect(r.position_au.y).toBeGreaterThan(0.8); // swept ~90° round the star
    // a straight line would have flown off to (1, ~7.4) — confirm gravity bent it
    expect(r.position_au.x).toBeLessThan(0.6);
  });

  it('a stationary ship falls toward the star', () => {
    const r = coastUnderGravity(sys, { x: 1, y: 0 }, { x: 0, y: 0 }, 0, (YEAR * 0.1) * 1000);
    expect(r.position_au.x).toBeLessThan(1);   // pulled inward
    expect(r.position_au.x).toBeGreaterThan(0);
    expect(r.velocity_ms.x).toBeLessThan(0);   // moving sunward
  });

  it('coastPathUnderGravity forecasts an inward-curving fall from rest', () => {
    const pts = coastPathUnderGravity(sys, { x: 1, y: 0 }, { x: 0, y: 0 }, 0, 40);
    expect(pts.length).toBe(41);                       // 40 steps + the start
    expect(pts[0]).toEqual({ x: 1, y: 0 });            // starts where the ship is
    const r0 = Math.hypot(pts[0].x, pts[0].y);
    const rEnd = Math.hypot(pts[pts.length - 1].x, pts[pts.length - 1].y);
    expect(rEnd).toBeLessThan(r0);                     // has fallen inward
  });

  it('with no star it falls back to a straight line', () => {
    const empty = { id: 's', nodes: [] } as unknown as System;
    const r = coastUnderGravity(empty, { x: 1, y: 0 }, { x: vCirc, y: 0 }, 0, 1000);
    expect(r.position_au.x).toBeCloseTo(1 + (vCirc / AU_M) * 1, 6);
  });
});
