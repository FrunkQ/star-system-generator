import type { CelestialBody } from '../types';

export interface LagrangePoint {
    name: string;
    x: number;
    y: number;
}

/**
 * Calculates the positions of the 5 Lagrange points for a two-body system.
 * @param primary The primary body (e.g., a star).
 * @param secondary The secondary body (e.g., a planet).
 * @returns An array of LagrangePoint objects.
 */
export function calculateLagrangePoints(primary: CelestialBody, secondary: CelestialBody, currentDistanceAU: number): LagrangePoint[] {
    if (!primary.massKg || !secondary.massKg || !secondary.orbit) {
        return [];
    }

    const M1 = primary.massKg;
    const M2 = secondary.massKg;
    const R = currentDistanceAU; // Use current distance instead of semi-major axis

    // Simplified calculations for the distances from the secondary body (M2)
    const r_L1 = R * Math.pow(M2 / (3 * M1), 1/3);
    const r_L2 = R * Math.pow(M2 / (3 * M1), 1/3);

    // L1 is between M1 and M2, closer to M2
    const l1 = { name: 'L1', distance: R - r_L1, angle: 0 };

    // L2 is beyond M2
    const l2 = { name: 'L2', distance: R + r_L2, angle: 0 };

    // L3 is beyond M1
    const l3_dist = R * (1 + 5 * M2 / (12 * M1));
    const l3 = { name: 'L3', distance: -l3_dist, angle: 0 }; // Negative distance to indicate it's on the other side of M1

    // L4 and L5 form equilateral triangles
    const l4 = { name: 'L4', distance: R, angle: Math.PI / 3 }; // +60 degrees
    const l5 = { name: 'L5', distance: R, angle: -Math.PI / 3 }; // -60 degrees

    // The positions need to be calculated relative to the primary, in the orbital plane of the secondary.
    // This function will return the offsets, and the visualizer will handle the rotation.
    
    // For now, let's return simplified offsets from the primary in a non-rotated frame.
    // The visualizer will need to apply the rotation based on the secondary's position.
    return [
        { name: 'L1', x: l1.distance, y: 0 },
        { name: 'L2', x: l2.distance, y: 0 },
        { name: 'L3', x: l3.distance, y: 0 },
        { name: 'L4', x: l4.distance * Math.cos(l4.angle), y: l4.distance * Math.sin(l4.angle) },
        { name: 'L5', x: l5.distance * Math.cos(l5.angle), y: l5.distance * Math.sin(l5.angle) },
    ];
}
