// G43 P4 — ARRIVING AT A LAGRANGE POINT WITH ITS VELOCITY CANCELLED.
//
// This replaces the phase-0 probe, which MEASURED the fault rather than asserting against it: the
// solver braked to zero relative velocity against a phantom built by shifting the target's mean
// anomaly, while the post-journey sampler parked the ship on the target's ellipse rigidly rotated.
// Two different places, so an eccentric arrival teleported at the instant of completion —
// Jupiter L4 measured 0.31-0.48 AU (up to 71 million km) with a 0.6-13.3 km/s velocity step, and a
// panel-driven Mars L1 plan terminated 0.007 AU from the SUN because a planet-centric parking
// distance was read as a heliocentric semi-major axis.
//
// The assertions below are those measurements turned into gates. They use the Sol fixture and the
// same solver entry point the app calls, so they fail if either side of the convention drifts again.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { calculateTransitPlan } from './calculator.js';
import { getGlobalState } from './physics';
import { deriveCoOrbitalOrbit } from '../physics/lagrange';
import type { LagrangePointId } from '../types';

const AU_M = 1.495978707e11;
const AU_KM = 1.495978707e8;

const solPath = path.resolve('static/examples/Sol_Expanse-System.json');
const baseSystem = JSON.parse(fs.readFileSync(solPath, 'utf-8'));

function systemWithShip() {
    const system = JSON.parse(JSON.stringify(baseSystem));
    const i = system.nodes.findIndex((n: any) => n.name === 'Rocinante (Tachi)');
    system.nodes[i] = {
        id: 'ship-expanse-rocinante',
        parentId: 'solar-system-sun',
        name: 'Rocinante (Tachi)',
        kind: 'construct',
        orbit: {
            hostId: 'solar-system-sun',
            hostMu: 132751826999999990000,
            t0: 1763640079144,
            elements: { a_AU: 3.0, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 1.0 }
        }
    };
    return system;
}

const SHIP = 'ship-expanse-rocinante';
const START = 1767250575000;

/** The point's true state at time t — the one convention, which is also what the scheduler parks on. */
function pointState(system: any, targetName: string, point: LagrangePointId, tMs: number) {
    const target = system.nodes.find((n: any) => n.name === targetName);
    const host = system.nodes.find((n: any) => n.id === target.parentId);
    const hostMassKg = (host.kind === 'barycenter' ? host.effectiveMassKg : host.massKg) || 0;
    const orbit = deriveCoOrbitalOrbit(target, hostMassKg, point)!;
    return getGlobalState(system, { id: 'pt', kind: 'body', parentId: target.parentId, orbit } as any, tMs);
}

function plansTo(system: any, targetName: string, point: LagrangePointId) {
    const target = system.nodes.find((n: any) => n.name === targetName);
    return calculateTransitPlan(system, SHIP, target.id, START, 'Economy', {
        maxG: 0.3,
        accelRatio: 0.1,
        brakeRatio: 0.1,
        interceptSpeed_ms: 0,
        shipMass_kg: 1441575,
        shipIsp: 1100000,
        brakeAtArrival: true,
        arrivalPlacement: point,
        aerobrake: { allowed: false, limit_kms: 0 }
    }).filter((p) => p.isValid);
}

// EVERY family that claims a braked rendezvous must deliver one — gravity assists included. They
// were excluded here until B86 was fixed: the assist solver charged for the arrival brake and
// declared `arrivalVelocity_ms: 0` while publishing the pre-brake velocity as its terminal state.
// Only a genuine flyby (an intercept speed, or a Flyby warning) is exempt, because that one is not
// claiming to stop.
const isRendezvous = (p: any) =>
    (p.interceptSpeed_ms || 0) === 0 && !(p.segments ?? []).some((s: any) => (s.warnings || []).includes('Flyby'));

describe('G43 P4: a plan to an L-point ends AT the point, moving WITH it', () => {
    for (const [targetName, point] of [['Jupiter', 'l4'], ['Mars', 'l5'], ['Mars', 'l1']] as const) {
        it(`${targetName} ${point.toUpperCase()}: terminal state matches the co-rotating point`, () => {
            const system = systemWithShip();
            const plans = plansTo(system, targetName, point).filter(isRendezvous);
            expect(plans.length).toBeGreaterThan(0);

            for (const plan of plans) {
                const lastSeg = plan.segments[plan.segments.length - 1];
                const end = lastSeg.endState;
                const lp = pointState(system, targetName, point, lastSeg.endTime);

                const posErrAu = Math.hypot(end.r.x - lp.r.x, end.r.y - lp.r.y);
                const velErrMs = Math.hypot(
                    (end.v.x - lp.v.x) * AU_M,
                    (end.v.y - lp.v.y) * AU_M
                );

                // Before P4 these were 0.14-0.48 AU and 0.6-13.3 km/s. The solver's own tolerance is
                // a fraction of a light-second in position and a few m/s in matched velocity.
                expect(posErrAu, `${plan.name}: position gap`).toBeLessThan(0.01);
                expect(velErrMs, `${plan.name}: velocity gap`).toBeLessThan(400);
            }
        });
    }

    it('an L1 plan flies to the PLANET, not to the star (the parking-radius bug)', () => {
        const system = systemWithShip();
        const mars = system.nodes.find((n: any) => n.name === 'Mars');
        for (const plan of plansTo(system, 'Mars', 'l1')) {
            const lastSeg = plan.segments[plan.segments.length - 1];
            const end = lastSeg.endState;
            const rSun = Math.hypot(end.r.x, end.r.y);
            const marsState = getGlobalState(system, mars, lastSeg.endTime);
            const distToMars = Math.hypot(end.r.x - marsState.r.x, end.r.y - marsState.r.y);
            // The old code terminated at ~0.007 AU from the Sun and ~1.4 AU from Mars.
            expect(rSun, `${plan.name}: should be out at Mars's orbit, not in the corona`).toBeGreaterThan(1.0);
            expect(distToMars, `${plan.name}: should arrive near Mars`).toBeLessThan(0.05);
        }
    });

    it('L1 sits sunward of the planet and L2 anti-sunward, both about a Hill radius off', () => {
        const system = systemWithShip();
        const t = START;
        const mars = system.nodes.find((n: any) => n.name === 'Mars');
        const marsState = getGlobalState(system, mars, t);
        const rMars = Math.hypot(marsState.r.x, marsState.r.y);
        const l1 = pointState(system, 'Mars', 'l1', t);
        const l2 = pointState(system, 'Mars', 'l2', t);
        expect(Math.hypot(l1.r.x, l1.r.y)).toBeLessThan(rMars);
        expect(Math.hypot(l2.r.x, l2.r.y)).toBeGreaterThan(rMars);
        // Mars's Hill radius is ~1.08 million km; both points sit within a factor of ~2 of it.
        const dL1 = Math.hypot(l1.r.x - marsState.r.x, l1.r.y - marsState.r.y) * AU_KM;
        expect(dL1).toBeGreaterThan(3e5);
        expect(dL1).toBeLessThan(3e6);
    });
});
