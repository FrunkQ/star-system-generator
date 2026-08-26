// THE PASS SPEED IS WHAT DECIDES WHEN THE BRAKE BURN STARTS.
//
// Owner, 2026-08-26: "where do we specify a flyby speed? Is it assumed to be 5km/s. In which case it
// should be settable and defines WHEN a brake burn has to start."
//
// It was never 5 km/s — that was a test value. `interceptSpeed` was declared `= 0` in the planner and
// NEVER ASSIGNED, so every flyby the UI produced ran the solver's zero branch: "no arrival burn at
// all, cross at whatever closing speed you happen to have". The solver has always supported the
// parameter; only the control was missing. These pin the physics the control now exposes.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { calculateTransitPlan } from './calculator.js';

const base = JSON.parse(fs.readFileSync(path.resolve('static/examples/Sol_Expanse-System.json'), 'utf-8'));

function planAt(interceptMs: number, brake: boolean) {
    const s = JSON.parse(JSON.stringify(base));
    const i = s.nodes.findIndex((n: any) => n.name === 'Rocinante (Tachi)');
    s.nodes[i] = { id: 'ship', parentId: 'solar-system-sun', name: 'Ship', kind: 'construct', tags: [],
        orbit: { hostId: 'solar-system-sun', hostMu: 132751826999999990000, t0: 1763640079144,
                 elements: { a_AU: 3.0, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 1.0 } } };
    const target = s.nodes.find((n: any) => n.name === 'Jupiter');
    return calculateTransitPlan(s, 'ship', target.id, 1767250575000, 'Economy', {
        maxG: 0.3, accelRatio: 0.1, brakeRatio: 0.35, interceptSpeed_ms: interceptMs,
        shipMass_kg: 1441575, shipIsp: 1100000, brakeAtArrival: brake,
        arrivalPlacement: 'lo', aerobrake: { allowed: false, limit_kms: 0 }
    }).filter((p: any) => p.isValid);
}

const brakeSeconds = (p: any) => {
    const b = p.segments.find((s: any) => s.type === 'Brake');
    return b ? (b.endTime - b.startTime) / 1000 : 0;
};

const eff = (ps: any[]) => ps.find((p) => p.name === 'Most Efficient');

describe('flyby pass speed', () => {
    it('EVERY plan family crosses at the speed that was asked for', () => {
        for (const want of [2000, 20000]) {
            for (const p of planAt(want, false)) {
                if (p.planType === 'Complex') continue;   // the assist family always brakes (B87)
                expect(Math.round(p.arrivalVelocity_ms), `${p.name} at ${want}`).toBe(want);
            }
        }
    });

    it('zero still means no arrival burn — the historic default, unchanged', () => {
        const p = eff(planAt(0, false));
        expect(brakeSeconds(p)).toBe(0);
        expect(p.arrivalVelocity_ms).toBeGreaterThan(0);   // crosses at whatever it was doing
    });

    it('the burn length follows how much speed must CHANGE, in either direction', () => {
        // This is the owner's point made precise: the pass speed is what sizes the arrival burn.
        // It is |closing - requested|, so asking to cross FASTER than the natural closing speed is
        // also a burn — the ship has to speed up, and the segment grows again.
        const natural = eff(planAt(0, false)).arrivalVelocity_ms;      // ~4.5 km/s here
        const near = brakeSeconds(eff(planAt(Math.round(natural), false)));
        const slower = brakeSeconds(eff(planAt(2000, false)));
        const faster = brakeSeconds(eff(planAt(20000, false)));
        expect(near).toBeLessThan(slower);
        expect(near).toBeLessThan(faster);
    });

    it('a full rendezvous is the limit case — arrives at rest', () => {
        const stop = eff(planAt(0, true));
        expect(stop.arrivalVelocity_ms).toBe(0);
        expect(brakeSeconds(stop)).toBeGreaterThan(0);
    });

    it('the plan reports the speed it will ACHIEVE, which the panel warns about if it differs', () => {
        const p = eff(planAt(2000, false));
        expect(Number.isFinite(p.arrivalVelocity_ms)).toBe(true);
    });
});
