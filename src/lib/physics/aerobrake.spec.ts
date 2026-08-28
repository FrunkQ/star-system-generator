// AEROBRAKING — the model, anchored on real missions and on the faults it replaced.
//
// Owner, 2026-08-26: "if the ship is aerobraking capable we don't need to scrub off ALL the final
// velocity as the last can be done by an atmosphere... this was all done a LONG time ago and has
// probably accumulated debt", then "gas giants should be free braking", "arrival high orbit can
// still aerobrake - it would just be a manoeuvre to dip into atmosphere and out and circularise",
// and "we know how far out and how dense the atmo is - so we have more to work with now".
import { describe, it, expect } from 'vitest';
import { aerobrakeSolution, atmosphericBrakingFactor, brakingCorridorKm } from './aerobrake';
import type { CelestialBody } from '../types';

const body = (over: Partial<CelestialBody> & { pressure?: number; scale?: number }): CelestialBody => ({
    id: 'b', name: over.name ?? 'Body', kind: 'body', roleHint: 'planet', parentId: 's', tags: [],
    massKg: over.massKg ?? 5.97e24, radiusKm: over.radiusKm ?? 6371,
    atmosphere: { name: 'air', composition: {}, pressure_bar: over.pressure ?? 1.013, scaleHeightKm: over.scale ?? 8.5 }
} as unknown as CelestialBody);

const EARTH = body({ name: 'Earth' });
const MARS = body({ name: 'Mars', massKg: 6.42e23, radiusKm: 3390, pressure: 0.006, scale: 11.1 });
const JUPITER = body({ name: 'Jupiter', massKg: 1.898e27, radiusKm: 69911, pressure: 1, scale: 27 });
const VENUS = body({ name: 'Venus', massKg: 4.87e24, radiusKm: 6052, pressure: 92, scale: 15.9 });
const LUNA = body({ name: 'Luna', massKg: 7.3e22, radiusKm: 1737, pressure: 0, scale: 0 });

describe('what a sky can deliver', () => {
    it('gas giants are free braking — the shield is the limit, not the air', () => {
        expect(atmosphericBrakingFactor(JUPITER)).toBe(1);
        expect(atmosphericBrakingFactor(VENUS)).toBe(1);
        expect(atmosphericBrakingFactor(EARTH)).toBe(1);
    });
    it('a thin sky delivers far less, and reproduces the real Mars anchor', () => {
        const f = atmosphericBrakingFactor(MARS);
        expect(f).toBeGreaterThan(0.05);
        expect(f).toBeLessThan(0.15);
        // Mars Odyssey aerobraked about 1.2 km/s; a 12 km/s shield here gives ~1.06 km/s per pass.
        expect(f * 12).toBeGreaterThan(0.8);
        expect(f * 12).toBeLessThan(1.5);
    });
    it('an airless body delivers nothing', () => {
        expect(atmosphericBrakingFactor(LUNA)).toBe(0);
    });
});

describe('you have to actually go there', () => {
    it('a Lagrange arrival cannot aerobrake — there is no periapsis to drop', () => {
        const s = aerobrakeSolution({ target: JUPITER, shipLimitKms: 12, dv2Required_ms: 8000,
            parkingRadiusAU: undefined, isOrbitalArrival: false });
        expect(s.applied_ms).toBe(0);
        expect(s.remaining_ms).toBe(8000);   // the engine still owes all of it
    });
    it('an airless target cannot aerobrake however capable the ship', () => {
        const s = aerobrakeSolution({ target: LUNA, shipLimitKms: 30, dv2Required_ms: 3000,
            parkingRadiusAU: 0.00002, isOrbitalArrival: true });
        expect(s.applied_ms).toBe(0);
    });
});

describe('the shield rating is a maximum ENTRY SPEED, not a delta-v allowance', () => {
    it('a torch arrival must burn down to a survivable speed first', () => {
        // Closing at 600 km/s with a 12 km/s shield: 588 must be burnt before the air can help.
        const s = aerobrakeSolution({ target: JUPITER, shipLimitKms: 12, dv2Required_ms: 600000,
            parkingRadiusAU: 0.005, isOrbitalArrival: true });
        expect(s.applied_ms).toBe(12000);
        expect(s.remaining_ms).toBe(588000);
        expect(s.note).toContain('Too fast to enter the air directly');
    });
    it('a slow arrival is taken entirely by the air', () => {
        const s = aerobrakeSolution({ target: EARTH, shipLimitKms: 12, dv2Required_ms: 4000,
            parkingRadiusAU: 0.0005, isOrbitalArrival: true });
        expect(s.applied_ms).toBe(4000);
        expect(s.remaining_ms).toBe(0);
    });
});

describe('the manoeuvre costs time, and height costs propellant', () => {
    it('thin air needs more passes than thick, for the same delta-v', () => {
        const onMars = aerobrakeSolution({ target: MARS, shipLimitKms: 12, dv2Required_ms: 6000,
            parkingRadiusAU: 0.00005, isOrbitalArrival: true });
        const onEarth = aerobrakeSolution({ target: EARTH, shipLimitKms: 12, dv2Required_ms: 6000,
            parkingRadiusAU: 0.00005, isOrbitalArrival: true });
        expect(onMars.passes).toBeGreaterThan(onEarth.passes);
        expect(onEarth.passes).toBe(1);
        expect(onMars.timeSec).toBeGreaterThan(0);
    });

    it('arriving HIGH still aerobrakes, and pays to climb back out', () => {
        const low = aerobrakeSolution({ target: EARTH, shipLimitKms: 12, dv2Required_ms: 5000,
            parkingRadiusAU: (6371 + 300) / 1.495978707e8, isOrbitalArrival: true });
        const high = aerobrakeSolution({ target: EARTH, shipLimitKms: 12, dv2Required_ms: 5000,
            parkingRadiusAU: (6371 * 8) / 1.495978707e8, isOrbitalArrival: true });
        expect(low.applied_ms).toBe(high.applied_ms);          // the air takes the same either way
        expect(high.circularise_ms).toBeGreaterThan(low.circularise_ms);
        expect(high.circularise_ms).toBeGreaterThan(100);      // a real burn, not a rounding artefact
        expect(high.timeSec).toBeGreaterThan(low.timeSec);     // the bigger ellipse takes longer
        expect(high.note).toContain('circularising costs');
    });

    it('the corridor comes from the derived atmosphere, not a constant', () => {
        expect(brakingCorridorKm(MARS)).toBeGreaterThan(0);
        expect(brakingCorridorKm(JUPITER)).toBeGreaterThan(brakingCorridorKm(EARTH));
    });

    it('tells the crew what it is doing, in words a player can read', () => {
        const s = aerobrakeSolution({ target: JUPITER, shipLimitKms: 12, dv2Required_ms: 9000,
            parkingRadiusAU: (69911 * 4) / 1.495978707e8, isOrbitalArrival: true });
        expect(s.note).toContain('Jupiter');
        expect(s.note).toContain('km/s');
        expect(s.note).toMatch(/pass|passes/);
        expect(s.note).toContain('altitude');
    });
});
