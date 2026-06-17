import { describe, it, expect } from 'vitest';
import { coastUnderGravity, coastPathUnderGravity, sampleJourneyKinematicsAtTime } from './scheduler';
import type { System, CelestialBody } from '$lib/types';

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

  it('coastPathUnderGravity forecasts a fall toward the star from rest', () => {
    const pts = coastPathUnderGravity(sys, { x: 1, y: 0 }, { x: 0, y: 0 }, 0, 40);
    expect(pts.length).toBe(41);                       // 40 steps + the start
    expect(pts[0]).toEqual({ x: 1, y: 0 });            // starts where the ship is
    // The horizon now reaches well into the fall (and a radial plunge can sling back out), so assert that
    // the path gets MUCH closer to the star somewhere along it, not that the endpoint is closer.
    const minR = Math.min(...pts.map((p) => Math.hypot(p.x, p.y)));
    expect(minR).toBeLessThan(0.5);
  });

  it('with no star it falls back to a straight line', () => {
    const empty = { id: 's', nodes: [] } as unknown as System;
    const r = coastUnderGravity(empty, { x: 1, y: 0 }, { x: vCirc, y: 0 }, 0, 1000);
    expect(r.position_au.x).toBeCloseTo(1 + (vCirc / AU_M) * 1, 6);
  });
});

describe('sampleJourneyKinematicsAtTime — a new journey supersedes an old cancelled drift', () => {
  // Regression: a ship stranded (cancelled journey w/ cancelState) and then given a NEW journey was still
  // resolving to the old drift, because the cancelled-drift branch returned immediately on the first
  // (earliest-start) log and the later journey never got to govern — log read right, orrery showed adrift.
  const star = { id: 'star', kind: 'body', roleHint: 'star', classes: ['star/G'], parentId: null, massKg: SOLAR, radiusKm: 696000 };
  const sysWithStar = { id: 's', nodes: [star] } as unknown as System;

  const DAY = 86400 * 1000;
  const seg = (pts: { x: number; y: number }[]) => ({
    id: 'seg', type: 'Coast', startTime: 0, endTime: DAY, startState: { r: pts[0], v: { x: 0, y: 0 } },
    endState: { r: pts[pts.length - 1], v: { x: 0, y: 0 } }, hostId: 'star', pathPoints: pts, warnings: [], fuelUsed_kg: 0
  });

  const ship = {
    id: 'ship', kind: 'construct', name: 'Test', parentId: 'star',
    scheduled_journeys: [
      // 1) Cancelled mid-flight at day 5, left drifting at (5,0) with some velocity.
      {
        id: 'journey-cancelled', status: 'cancelled',
        cancelledAtSec: String(5 * 86400),
        cancelState: { position_au: { x: 5, y: 0 }, velocity_ms: { x: 0, y: 1000 } },
        plans: [{ id: 'p1', originId: 'star', targetId: 'star', startTime: 0, totalTime_days: 10,
                  segments: [seg([{ x: 0, y: 0 }, { x: 5, y: 0 }])], arrivalPlacement: 'lo' }]
      },
      // 2) A NEW journey, planned long after the drift began — completes by day 30.
      {
        id: 'journey-new', status: 'completed',
        plans: [{ id: 'p2', originId: 'star', targetId: 'star', startTime: 20 * DAY, totalTime_days: 10,
                  segments: [seg([{ x: 0, y: 0 }, { x: 1, y: 0 }])], arrivalPlacement: 'lo' }]
      }
    ]
  } as unknown as CelestialBody;

  it('after the new journey completes, the ship is governed by it, not the old drift', () => {
    const res = sampleJourneyKinematicsAtTime(sysWithStar, ship, 40 * DAY);
    expect(res).not.toBeNull();
    expect(res!.journeyId).toBe('journey-new'); // NOT 'journey-cancelled'
    expect(res!.state).toBe('Orbiting');        // parked at the new journey's target, not 'Deep Space' adrift
  });

  it('between the cancel and the new journey, the ship is still adrift', () => {
    const res = sampleJourneyKinematicsAtTime(sysWithStar, ship, 12 * DAY);
    expect(res).not.toBeNull();
    expect(res!.journeyId).toBe('journey-cancelled');
    expect(res!.state).toBe('Deep Space'); // coasting — the new journey hasn't started yet
  });
});
