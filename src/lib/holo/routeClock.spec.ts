/**
 * G51 Q6 — A NON-FOLLOWING PLAYER VIEW READS A SHIP AT ITS OWN CLOCK.
 *
 * The owner answered Q6 YES on 2026-08-27, reversing his ruling of 2026-08-08 that live traffic was
 * the GM's clock to run. The reason it could be reversed is the whole of G51: the route's knots
 * carry TIME, so `routeStateAt` is a complete time-to-position function and a ship in transit is
 * derivable from any clock — which is exactly the condition [[G49]] states for the clock being the
 * viewer's. The old rule was made when the view could not work it out.
 *
 * WHAT IS PINNED HERE is the POLICY, and the thing the owner asked to be watched: a self-scrubbing
 * viewer must see the ship where it would be AT THEIR TIME — not stale, and not at the GM's instant.
 * The scene's own `routeClock()` lives inside `createHoloScene`'s closure and cannot be imported, so
 * the decision is reproduced from the same `routeStateAt` the scene calls, and a DRIFT GUARD at the
 * bottom reads `scene.ts` and fails if the scene stops agreeing with this file.
 *
 * RUN AGAINST THE PRE-Q6 CODE THIS GOES RED: restore `return gmClockMs` and
 * `routeClock` freezes a scrubbing viewer at the GM's instant, which the first two tests below
 * measure as a real distance rather than asserting in the abstract.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { routeOf, routeStateAt } from '$lib/constructs/shipRoute';
import { buildFlightUpdate, applyFlightUpdate } from '$lib/constructs/flightState';
import { computePlayerStarmapSnapshot } from '$lib/system/utils';
import type { Starmap } from '$lib/types';

const T0 = 1_800_000_000_000;
const HOUR = 3_600_000;
const START = T0 + HOUR;
const END = T0 + 11 * HOUR;

/** The scene's decision, reproduced: which instant a route is read at. */
function routeClock(opts: { timeMs: number; gmClockMs: number | null; transitMotion: boolean }): number | null {
  return opts.gmClockMs === null && !opts.transitMotion ? null : opts.timeMs;
}

function campaign(): Starmap {
  const n = 40;
  const pts: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < n; i++) { const f = i / (n - 1); pts.push({ x: 1 + 4 * f, y: 1.6 * f * (1 - f), z: 0 }); }
  const seg = (type: string, a: number, b: number, from: number, to: number, dv?: number) => ({
    type, startTime: a, endTime: b, ...(dv ? { deltaV_ms: dv, thrustDir: { x: 1, y: 0 } } : {}),
    pathPoints: pts.slice(from, to), startState: { r: pts[from] }, endState: { r: pts[to - 1] }
  });
  return {
    id: 'm', name: 'M', distanceUnit: 'ly',
    systems: [{ id: 'sysA', name: 'A', position: { x: 0, y: 0, z: 0 }, system: { id: 'sysA', name: 'A', epochT0: T0, nodes: [
      { id: 'star', name: 'Star', kind: 'body', roleHint: 'star', parentId: null, massKg: 2e30, radiusKm: 700000, tags: [] },
      { id: 'roci', name: 'Rocinante', kind: 'construct', parentId: 'star', flight_state: 'Transit',
        orbit: { hostId: 'star', hostMu: 1.3e20, t0: T0, elements: { a_AU: 1, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } },
        scheduled_journeys: [{ status: 'active', plans: [{ segments: [
          seg('Accel', START, START + HOUR, 0, 12, 5000),
          seg('Coast', START + HOUR, END - HOUR, 11, 30),
          seg('Brake', END - HOUR, END, 29, n, 5000)
        ] }] }] }
    ] } }],
    routes: []
  } as any;
}

/** The node a player window actually holds: campaign snapshot with the flight update merged in. */
function playerShip() {
  const gm = campaign();
  const merged: any = applyFlightUpdate(computePlayerStarmapSnapshot(gm), buildFlightUpdate(gm, START + 2 * HOUR));
  return merged.systems[0].system.nodes.find((n: any) => n.id === 'roci');
}
const placeAt = (node: any, at: number | null) => (at === null ? null : routeStateAt(routeOf(node), at));

describe('G51 Q6 — a scrubbing viewer sees the ship at ITS OWN time', () => {
  const gmInstant = START + 2 * HOUR;      // where the GM's clock is sitting
  const myInstant = START + 7 * HOUR;      // where a scrubbing player has dragged to

  it("THE FLIP: a non-following view reads the route at its own clock, not the GM's instant", () => {
    const at = routeClock({ timeMs: myInstant, gmClockMs: gmInstant, transitMotion: false });
    expect(at).toBe(myInstant);
  });

  it('and that is a REAL distance, not a formality', () => {
    const ship = playerShip();
    const mine = placeAt(ship, routeClock({ timeMs: myInstant, gmClockMs: gmInstant, transitMotion: false }))!;
    const theirs = placeAt(ship, gmInstant)!;
    // Five hours of a hard burn: the two answers are far apart, so freezing at the GM's instant
    // would have been visibly wrong rather than merely inexact.
    expect(Math.hypot(mine.x - theirs.x, mine.y - theirs.y)).toBeGreaterThan(0.5);
  });

  it('NOT STALE: the ship keeps moving as the viewer scrubs, with no message arriving', () => {
    const ship = playerShip();
    let prev = -Infinity;
    for (const t of [START + HOUR, START + 3 * HOUR, START + 6 * HOUR, START + 9 * HOUR]) {
      const p = placeAt(ship, routeClock({ timeMs: t, gmClockMs: gmInstant, transitMotion: false }))!;
      const d = Math.hypot(p.x, p.y);
      expect(d).toBeGreaterThan(prev);
      prev = d;
    }
  });

  it('a FOLLOWING view is unaffected — its clock already is the GM\'s', () => {
    expect(routeClock({ timeMs: gmInstant, gmClockMs: gmInstant, transitMotion: true })).toBe(gmInstant);
    expect(routeClock({ timeMs: gmInstant, gmClockMs: null, transitMotion: true })).toBe(gmInstant);
  });

  it('the GM\'s OWN view still places from its stamp, not from the route', () => {
    // No GM clock is ever received by the GM's own scene, and it is not following anything.
    expect(routeClock({ timeMs: gmInstant, gmClockMs: null, transitMotion: false })).toBeNull();
  });

  it('the viewer agrees with the GM when their clocks agree — the flip is a CLOCK change, not a place change', () => {
    const ship = playerShip();
    const mine = placeAt(ship, routeClock({ timeMs: gmInstant, gmClockMs: gmInstant, transitMotion: false }))!;
    const theirs = placeAt(ship, gmInstant)!;
    expect(mine.x).toBeCloseTo(theirs.x, 12);
    expect(mine.y).toBeCloseTo(theirs.y, 12);
  });

  it('KNOWN LIMIT, pinned so it is not rediscovered as a bug: scrubbing past the plan has no answer', () => {
    // Past `route.e` the plan says nothing and there is no stamp (G51 only stamps a ship that is OFF
    // its route at the GM's time). The arrival re-parenting is a GM event a player cannot derive.
    const ship = playerShip();
    expect(placeAt(ship, END + HOUR)).toBeNull();
    expect(ship.vector_position_au).toBeUndefined();
  });

  it('the scene still decides this the way this file says it does', () => {
    const src = fs.readFileSync(path.resolve('src/lib/holo/scene.ts'), 'utf-8');
    expect(src).toContain('return gmClockMs === null && !transitMotion ? null : timeMs;');
  });
});
