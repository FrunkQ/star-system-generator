// B86 — A GRAVITY-ASSIST PLAN MUST ARRIVE THE WAY IT SAYS IT DOES.
//
// The assist solver has always CHARGED for its arrival brake: `v_arr = |target.v - leg2.v2|` goes
// into `totalDeltaV_ms` and its fuel into `totalFuel_kg`, and the plan publishes
// `arrivalVelocity_ms: 0` with no Flyby warning — every signal the UI reads for "this is a braked
// rendezvous". But the terminal segment carried `leg2.v2`, the transfer ellipse's arrival velocity:
// the ship BEFORE the burn it had already paid for. Measured on the Sol fixture at the time of the
// fix: 4,788 m/s off on a plain Jupiter low orbit, 13,118 m/s at Jupiter L4, 21,460 m/s at Mars L1.
//
// It was NOT a Lagrange fault — it was found while building the G43 P4 gates and reproduces on
// ordinary destinations, which is why this spec targets a plain orbit first.
//
// Two things read that state and were wrong because of it: leg CHAINING (SystemView takes the next
// leg's initial state from the last segment, so every following leg was planned from a velocity the
// ship would never have) and the arrival telemetry.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { calculateTransitPlan } from './calculator.js';
import { getGlobalState } from './physics';

const AU_M = 1.495978707e11;
const baseSystem = JSON.parse(
    fs.readFileSync(path.resolve('static/examples/Sol_Expanse-System.json'), 'utf-8')
);

function systemWithShip() {
    const system = JSON.parse(JSON.stringify(baseSystem));
    const i = system.nodes.findIndex((n: any) => n.name === 'Rocinante (Tachi)');
    system.nodes[i] = {
        id: 'ship', parentId: 'solar-system-sun', name: 'Ship', kind: 'construct',
        orbit: {
            hostId: 'solar-system-sun', hostMu: 132751826999999990000, t0: 1763640079144,
            elements: { a_AU: 3.0, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 1.0 }
        }
    };
    return system;
}

function plansTo(system: any, targetName: string, placement: string) {
    const target = system.nodes.find((n: any) => n.name === targetName);
    return calculateTransitPlan(system, 'ship', target.id, 1767250575000, 'Economy', {
        maxG: 0.3, accelRatio: 0.1, brakeRatio: 0.1, interceptSpeed_ms: 0,
        shipMass_kg: 1441575, shipIsp: 1100000, brakeAtArrival: true,
        arrivalPlacement: placement, aerobrake: { allowed: false, limit_kms: 0 }
    }).filter((p: any) => p.isValid);
}

describe('B86: an assist plan that claims a braked rendezvous delivers one', () => {
    it('ends at the TARGET\'S velocity on an ordinary low-orbit destination', () => {
        const system = systemWithShip();
        const jupiter = system.nodes.find((n: any) => n.name === 'Jupiter');
        const assists = plansTo(system, 'Jupiter', 'lo').filter((p: any) => p.planType === 'Complex');
        expect(assists.length, 'expected a gravity-assist candidate to Jupiter').toBeGreaterThan(0);

        for (const plan of assists) {
            const seg = plan.segments[plan.segments.length - 1];
            const target = getGlobalState(system, jupiter, seg.endTime);
            const gap = Math.hypot(
                (seg.endState.v.x - target.v.x) * AU_M,
                (seg.endState.v.y - target.v.y) * AU_M
            );
            // Was 4,788 m/s.
            expect(gap, `${plan.name}: terminal velocity vs target`).toBeLessThan(1);
            // And the claim it publishes agrees with the state it publishes.
            expect(plan.arrivalVelocity_ms).toBe(0);
        }
    });

    it('shows the arrival brake as a burn, at the Delta-v it was already charging', () => {
        const system = systemWithShip();
        const assists = plansTo(system, 'Jupiter', 'lo').filter((p: any) => p.planType === 'Complex');
        for (const plan of assists) {
            const arrivalBurns = (plan.burns ?? []).filter((b: any) => b.type === 'Arrival');
            expect(arrivalBurns.length, `${plan.name}: an arrival brake should be visible`).toBe(1);
            expect(arrivalBurns[0].deltaV_ms).toBeGreaterThan(0);
            // The brake is part of the total the plan has always quoted, so it cannot exceed it.
            expect(arrivalBurns[0].deltaV_ms).toBeLessThanOrEqual(plan.totalDeltaV_ms);
        }
    });

    it('chaining a following leg starts from a state the ship will really be in', () => {
        // SystemView builds the next leg's initialState from the last segment's endState. Before the
        // fix that velocity was several km/s wrong, so every chained leg was planned from fiction.
        const system = systemWithShip();
        const jupiter = system.nodes.find((n: any) => n.name === 'Jupiter');
        const assist = plansTo(system, 'Jupiter', 'lo').find((p: any) => p.planType === 'Complex');
        expect(assist).toBeTruthy();
        const seg = assist!.segments[assist!.segments.length - 1];
        const chained = { r: { ...seg.endState.r }, v: { ...seg.endState.v } };
        const target = getGlobalState(system, jupiter, seg.endTime);
        expect(Math.hypot(chained.v.x - target.v.x, chained.v.y - target.v.y) * AU_M).toBeLessThan(1);
    });
});
