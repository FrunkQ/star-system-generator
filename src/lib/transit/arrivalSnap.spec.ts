// DOES THE SHIP SNAP AT THE MOMENT OF ARRIVAL?
//
// Owner, 2026-08-26: "We have seen 'final destination' snap on the visualisation." A snap is a
// DISCONTINUITY AT THE SEAM: while a journey runs the ship is drawn from the plan's path points, and
// the instant it completes it is drawn by the post-arrival sampler instead. If those disagree at the
// changeover the ship jumps, however correct each is alone — the fault G43 P4 fixed for L-points,
// where solver and parking used different geometry and the jump reached 0.48 AU.
//
// The seam is measured directly — last path point versus parked position at the completion instant —
// rather than by sampling either side of it, because the final segment can be short and the path
// points far apart, so a time-sampled difference measures path resolution rather than the seam.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { calculateTransitPlan } from './calculator.js';
import { sampleJourneyKinematicsAtTime } from './scheduler';

const AU_KM = 1.495978707e8;
const base = JSON.parse(fs.readFileSync(path.resolve('static/examples/Sol_Expanse-System.json'), 'utf-8'));

function flownTo(targetName: string, placement: string) {
    const system = JSON.parse(JSON.stringify(base));
    const i = system.nodes.findIndex((n: any) => n.name === 'Rocinante (Tachi)');
    system.nodes[i] = { id: 'ship', parentId: 'solar-system-sun', name: 'Ship', kind: 'construct', tags: [],
        orbit: { hostId: 'solar-system-sun', hostMu: 132751826999999990000, t0: 1763640079144,
                 elements: { a_AU: 3.0, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 1.0 } } };
    const target = system.nodes.find((n: any) => n.name === targetName);
    const plan = calculateTransitPlan(system, 'ship', target.id, 1767250575000, 'Economy', {
        maxG: 0.3, accelRatio: 0.1, brakeRatio: 0.1, interceptSpeed_ms: 0, shipMass_kg: 1441575,
        shipIsp: 1100000, brakeAtArrival: true, arrivalPlacement: placement,
        aerobrake: { allowed: false, limit_kms: 0 }
    }).filter((p: any) => p.isValid && p.planType === 'Efficiency')[0];
    const ship = system.nodes.find((n: any) => n.id === 'ship');
    ship.scheduled_journeys = [{ id: 'j', status: 'active', createdAtSec: '0', plans: [plan] }];
    return { system, ship, plan };
}

/** Distance in km between where the flight ENDS and where the parking BEGINS. */
function seamKm(targetName: string, placement: string) {
    const { system, ship, plan } = flownTo(targetName, placement);
    const seg = plan.segments[plan.segments.length - 1];
    const last = seg.pathPoints[seg.pathPoints.length - 1];
    const parked = sampleJourneyKinematicsAtTime(system, ship, seg.endTime + 1)!;
    return Math.hypot(parked.position_au.x - last.x, parked.position_au.y - last.y) * AU_KM;
}

describe('arriving at a Lagrange point does not snap', () => {
    for (const [targetName, placement] of [
        ['Jupiter', 'l4'], ['Mars', 'l5'], ['Mars', 'l1'], ['Jupiter', 'l2'], ['Jupiter', 'l3']
    ] as const) {
        it(`${targetName} ${placement.toUpperCase()}: flight ends exactly where parking begins`, () => {
            // Exactly zero, not merely small: both sides read the one convention, so the seam closes
            // by construction rather than by tolerance. Before P4 this was tens of millions of km.
            expect(seamKm(targetName, placement)).toBeLessThan(1);
        });
    }
});

describe('the ordinary orbital arrival no longer steps out to its parking orbit (inbox B92 — CLOSED)', () => {
    // B92 WAS: a plan to `lo` aimed at the body's CENTRE while the post-arrival sampler put the ship in
    // a parking orbit one parking-radius away, so the ship reached the planet and then popped sideways
    // into orbit. Measured at 90,884 km at Jupiter. This assertion used to PIN that step between 80,000
    // and 100,000 km, as a tripwire against it growing.
    //
    // It is now zero, and for the same reason the Lagrange arrivals are: both sides read ONE convention
    // instead of two derivations kept in step by hand. Three things had to meet.
    //
    //   THE RADIUS. `physics/orbits.ts` derives it and everything reads that. `transit/scheduler.ts`
    //   had carried its own table of radius multipliers — twice, a Record and a ternary chain ten lines
    //   apart — while the planner offered the derived figures. They disagreed by up to a factor of
    //   ninety-five (Jupiter high orbit: 26,668,664 km derived against 279,644 assumed).
    //
    //   THE BEARING. The sampler phased the orbit off a HASH OF THE JOURNEY'S ID. Deterministic, and
    //   unrelated to where the ship arrived, so the step was a chord of the parking orbit.
    //
    //   THE PLANE. The circle was drawn in the reference plane. Now that arrivals carry height, a ship
    //   that came in from out of plane would have been flattened onto it on arrival.
    //
    // The orbit is now built on the arrival itself: one axis toward the point the flight ended at, the
    // other along the velocity it ended with. Zero is therefore the only correct answer, and a non-zero
    // reading here means one of those three has drifted apart again.
    for (const [targetName, placement] of [
        ['Jupiter', 'lo'], ['Jupiter', 'ho'], ['Mars', 'lo'], ['Mars', 'mo'], ['Earth', 'geo']
    ] as const) {
        it(`${targetName} ${placement.toUpperCase()}: flight ends exactly where parking begins`, () => {
            expect(seamKm(targetName, placement)).toBeLessThan(1);
        });
    }
});
