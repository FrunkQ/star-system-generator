// B87 — a gravity-assist flight must LIGHT ITS DRIVE and FLIP, not coast the whole way.
//
// `constructs/shipBurn.ts` decides whether a ship is thrusting, how hard and which way it points by
// reading the segment LABEL — it skips `Coast` outright. The assist solver used to emit nothing but
// Coast segments, so across an entire multi-year flight the plume never lit and the ship never
// turned retrograde, on the GM map and in player snapshots alike. The burns were always paid for;
// they just were not phases.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { calculateTransitPlan } from './calculator.js';
import { shipBurnAt, compactBurns } from '../constructs/shipBurn';

const base = JSON.parse(fs.readFileSync(path.resolve('static/examples/Sol_Expanse-System.json'), 'utf-8'));
function systemWithShip() {
    const s = JSON.parse(JSON.stringify(base));
    const i = s.nodes.findIndex((n: any) => n.name === 'Rocinante (Tachi)');
    s.nodes[i] = { id: 'ship', parentId: 'solar-system-sun', name: 'Ship', kind: 'construct',
        orbit: { hostId: 'solar-system-sun', hostMu: 132751826999999990000, t0: 1763640079144,
                 elements: { a_AU: 3.0, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 1.0 } } };
    return s;
}
function assistPlan() {
    const system = systemWithShip();
    const jupiter = system.nodes.find((n: any) => n.name === 'Jupiter');
    const plans = calculateTransitPlan(system, 'ship', jupiter.id, 1767250575000, 'Economy', {
        maxG: 0.3, accelRatio: 0.1, brakeRatio: 0.1, interceptSpeed_ms: 0,
        shipMass_kg: 1441575, shipIsp: 1100000, brakeAtArrival: true,
        arrivalPlacement: 'lo', aerobrake: { allowed: false, limit_kms: 0 }
    });
    return plans.find((p: any) => p.isValid && p.planType === 'Complex');
}

describe('B87: an assist flight has real thrust phases', () => {
    it('emits Accel and Brake segments, not only Coast', () => {
        const plan = assistPlan();
        expect(plan, 'expected a gravity-assist candidate').toBeTruthy();
        const types = plan!.segments.map((s: any) => s.type);
        expect(types).toContain('Accel');
        expect(types).toContain('Brake');
    });

    it('the brake is the LAST phase and still ends on the target-matched state (B86 holds)', () => {
        const plan = assistPlan()!;
        const last = plan.segments[plan.segments.length - 1];
        expect(last.type).toBe('Brake');
        expect(plan.arrivalVelocity_ms).toBe(0);
    });

    it('each burn lasts the time the ship\'s own thrust ceiling needs for its Delta-v', () => {
        const plan = assistPlan()!;
        const accel = 0.3 * 9.81;
        for (const seg of plan.segments.filter((s: any) => s.type !== 'Coast')) {
            const durSec = (seg.endTime - seg.startTime) / 1000;
            expect(durSec, `${seg.id} should take real time`).toBeGreaterThan(0);
        }
        // A brake of several km/s at 0.3 g is hours, not an instant.
        const brake = plan.segments.find((s: any) => s.type === 'Brake')!;
        expect((brake.endTime - brake.startTime) / 1000).toBeGreaterThan(1000 / accel);
    });

    it('the plume actually lights: shipBurn reports thrust, and braking, at the right times', () => {
        const plan = assistPlan()!;
        const ship: any = { scheduled_journeys: [{ id: 'j', status: 'active', plans: [plan] }] };
        const brake = plan.segments.find((s: any) => s.type === 'Brake')!;
        const accelSeg = plan.segments.find((s: any) => s.type === 'Accel')!;

        const midBrake = shipBurnAt(ship, (brake.startTime + brake.endTime) / 2);
        expect(midBrake.thrusting).toBe(true);
        expect(midBrake.braking, 'should be pointing retrograde on the brake').toBe(true);
        expect(midBrake.accelMs2).toBeGreaterThan(0);

        const midAccel = shipBurnAt(ship, (accelSeg.startTime + accelSeg.endTime) / 2);
        expect(midAccel.thrusting).toBe(true);
        expect(midAccel.braking).toBe(false);

        // And the compact form a player's device receives carries them too.
        const compact = compactBurns(ship);
        expect(compact.length).toBeGreaterThan(0);
        expect(compact.some((b: any) => b.b === 1), 'a retrograde burn must reach the player').toBe(true);
    });
});
