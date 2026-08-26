// DO PLACED BODIES AND CONSTRUCTS ACTUALLY STAY ON THEIR LAGRANGE POINT?
//
// Owner's question, 2026-08-26: "will constructs and moons placed in those zones reliably track the
// L point or have we 'messed with their orbits' a bit?" The zones themselves are pure rendering and
// touch nothing — but the PLACEMENT path is real, so this is the spec that answers it by measuring
// against the actual bundled maps rather than the synthetic fixtures the other specs use.
//
// It caught one genuine fault: an orbit may PIN `n_rad_per_s` rather than let Kepler set the rate,
// and several bundled bodies do (Pluto, Charon, Oceanus/Khione, Helline, Persephone, the Cerebus
// moons). A Lagrange point co-rotates with its secondary by definition, so it has to turn at the
// secondary's ACTUAL rate; the derivation used to drop the pin and fall back to Kepler, which for
// Oceanus/Khione is a 1.33x rate difference — about 33 degrees of drift per year, and far worse
// elsewhere. `deriveCoOrbitalOrbit` now carries the pin, and this pins that it keeps doing so.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { deriveCoOrbitalOrbits } from './lagrange';
import { propagateState } from './orbits';
import type { System, CelestialBody } from '../types';

const YEAR_MS = 365.25 * 86400e3;
// A decade of campaign time, sampled — drift shows up over time or not at all.
const SAMPLES = [0, YEAR_MS * 0.1, YEAR_MS, YEAR_MS * 5, YEAR_MS * 10];

function loadSystem(name: string): System {
    return JSON.parse(fs.readFileSync(path.resolve(`static/examples/${name}-System.json`), 'utf-8'));
}

/** Attach a rider to `hostName`'s point and return the system, the rider and the secondary. */
function withRider(sys: System, hostName: string, point: 'l1' | 'l2' | 'l3' | 'l4' | 'l5', kind: 'body' | 'construct') {
    const secondary = sys.nodes.find((n) => n.name === hostName) as CelestialBody;
    expect(secondary, `${hostName} should exist`).toBeTruthy();
    (sys.nodes as any[]).push({
        id: 'rider', name: 'Rider', kind, roleHint: kind === 'construct' ? 'construct' : 'moon',
        parentId: secondary.parentId, tags: [], massKg: 1e12, radiusKm: 1,
        coOrbital: { hostId: secondary.id, point }
    });
    deriveCoOrbitalOrbits(sys);
    const rider = sys.nodes.find((n) => n.id === 'rider') as CelestialBody;
    return { rider, secondary };
}

/** Angle between two position vectors, degrees. */
const angleBetween = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dot = a.x * b.x + a.y * b.y;
    const m = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
    return m > 0 ? (Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180) / Math.PI : 0;
};

describe('a rider stays on its point — on bodies whose orbits PIN a mean motion', () => {
    // These are the cases where the pin disagrees with Kepler, so a dropped pin shows immediately.
    const cases: Array<[string, string]> = [
        ['Triple-Alpha_Centauri', 'Oceanus/Khione'],   // pin/Kepler = 1.33
        ['Triple-Alpha_Centauri', 'Persephone '],      // 1.12
        ['Triple-Alpha_Centauri', 'Helline'],          // 1.45
        ['Sol_2030', 'Charon'],                        // 0.84
        ['Uggi_(Traveller_Example)', 'Cerebus Beta']   // 0.99
    ];

    for (const [map, hostName] of cases) {
        it(`${hostName}: an L4 trojan holds the equilateral triangle for a decade`, () => {
            const { rider, secondary } = withRider(loadSystem(map), hostName, 'l4', 'body');
            for (const t of SAMPLES) {
                const s = propagateState(secondary, t);
                const r = propagateState(rider, t);
                // Same distance from the host...
                expect(Math.hypot(r.r.x, r.r.y)).toBeCloseTo(Math.hypot(s.r.x, s.r.y), 9);
                // ...and still exactly 60 degrees away. A dropped mean-motion pin shows up here as
                // tens or thousands of degrees.
                expect(angleBetween(r.r, s.r)).toBeCloseTo(60, 6);
            }
        });
    }
});

describe('every point, body and construct alike, tracks over a decade', () => {
    for (const point of ['l1', 'l2', 'l3', 'l4', 'l5'] as const) {
        for (const kind of ['body', 'construct'] as const) {
            it(`${point.toUpperCase()} holds its geometry for a ${kind}`, () => {
                const { rider, secondary } = withRider(loadSystem('Sol_2030'), 'Charon', point, kind);
                const expectedAngle = point === 'l4' ? 60 : point === 'l5' ? 60 : point === 'l3' ? 180 : 0;
                for (const t of SAMPLES) {
                    const s = propagateState(secondary, t);
                    const r = propagateState(rider, t);
                    expect(angleBetween(r.r, s.r), `${point} at t=${t}`).toBeCloseTo(expectedAngle, 5);
                    if (point === 'l1' || point === 'l2') {
                        // Collinear: same bearing, and inside for L1 / outside for L2.
                        const ratio = Math.hypot(r.r.x, r.r.y) / Math.hypot(s.r.x, s.r.y);
                        expect(point === 'l1' ? ratio < 1 : ratio > 1, `${point} side at t=${t}`).toBe(true);
                    }
                }
            });
        }
    }

    it('the radius ratio of a collinear rider is CONSTANT over the decade', () => {
        const { rider, secondary } = withRider(loadSystem('Sol_2030'), 'Charon', 'l1', 'construct');
        const ratios = SAMPLES.map((t) => {
            const s = propagateState(secondary, t);
            const r = propagateState(rider, t);
            return Math.hypot(r.r.x, r.r.y) / Math.hypot(s.r.x, s.r.y);
        });
        for (const r of ratios) expect(r).toBeCloseTo(ratios[0], 12);
    });
});

describe('the zones are rendering only — placement does not touch anyone else', () => {
    it('adding a rider leaves every other body\'s orbit untouched', () => {
        const before = loadSystem('Sol_2030');
        const after = loadSystem('Sol_2030');
        withRider(after, 'Charon', 'l4', 'construct');
        for (const b of before.nodes) {
            const a = after.nodes.find((n) => n.id === b.id);
            expect(a, `${b.name} should still exist`).toBeTruthy();
            expect(JSON.stringify((a as any).orbit), `${b.name}'s orbit must not move`)
                .toBe(JSON.stringify((b as any).orbit));
        }
    });
});
