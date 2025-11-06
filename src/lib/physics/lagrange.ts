import type { CelestialBody } from '../types';

export interface LagrangePoint {
    name: string;
    x: number;
    y: number;
    isRotated: boolean;
}

/**
 * Calculates (x, y) coordinates on an ellipse relative to the focus.
 * @param a Semi-major axis in AU.
 * @param e Eccentricity.
 * @param trueAnomaly True anomaly (angle from periapsis) in radians.
 * @returns {x: number, y: number} Coordinates relative to the focus.
 */
function getPointOnEllipse(a: number, e: number, trueAnomaly: number): { x: number, y: number } {
    const r = a * (1 - e * e) / (1 + e * Math.cos(trueAnomaly));
    return { x: r * Math.cos(trueAnomaly), y: r * Math.sin(trueAnomaly) };
}

/**
 * Calculates the positions of the 5 Lagrange points for a two-body system.
 * @param primary The primary body (e.g., a star).
 * @param secondary The secondary body (e.g., a planet).
 * @returns An array of LagrangePoint objects.
 */
export function calculateLagrangePoints(primary: CelestialBody, secondary: CelestialBody, secondaryPos: { x: number, y: number }): LagrangePoint[] {
    if (!primary.massKg || !secondary.massKg || !secondary.orbit) {
        return [];
    }

    const M1 = primary.massKg;
    const M2 = secondary.massKg;
    const R = Math.sqrt(secondaryPos.x**2 + secondaryPos.y**2); // Use current distance from secondaryPos

    // Simplified calculations for the distances from the secondary body (M2)
    const r_L1 = R * Math.pow(M2 / (3 * M1), 1/3);
    const r_L2 = R * Math.pow(M2 / (3 * M1), 1/3);

    // L1 is between M1 and M2, closer to M2
    const l1 = { name: 'L1', distance: R - r_L1, angle: 0 };

    // L2 is beyond M2
    const l2 = { name: 'L2', distance: R + r_L2, angle: 0 };

    // --- L3, L4, L5 using the orbital ellipse ---
    const secondaryTrueAnomaly = Math.atan2(secondaryPos.y, secondaryPos.x);

    // L3 is on the opposite side of the primary from the secondary
    const l3Point = getPointOnEllipse(secondary.orbit.elements.a_AU, secondary.orbit.elements.e, secondaryTrueAnomaly + Math.PI);

    // L4 and L5 form equilateral triangles
    const l4Point = getPointOnEllipse(secondary.orbit.elements.a_AU, secondary.orbit.elements.e, secondaryTrueAnomaly + Math.PI / 3);
    const l5Point = getPointOnEllipse(secondary.orbit.elements.a_AU, secondary.orbit.elements.e, secondaryTrueAnomaly - Math.PI / 3);

    return [
        { name: 'L1', x: l1.distance, y: 0, isRotated: false },
        { name: 'L2', x: l2.distance, y: 0, isRotated: false },
        { name: 'L3', x: l3Point.x, y: l3Point.y, isRotated: true },
        { name: 'L4', x: l4Point.x, y: l4Point.y, isRotated: true },
        { name: 'L5', x: l5Point.x, y: l5Point.y, isRotated: true },
    ];
}
