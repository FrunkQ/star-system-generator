// src/lib/physics/habitability.ts
import type { CelestialBody, Orbit, System, ViableOrbitResult } from "../types";
import { G, AU_KM } from '../constants';
import { calculateAllStellarZones } from './zones';

const L_SUN = 3.828e26; // Watts



// Helper to get a random value from a range
function randomFromRange(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

export function findViableHabitableOrbit(host: CelestialBody, system: System, habitabilityTier: 'earth-like' | 'human-habitable' | 'alien-habitable', pack: RulePack): ViableOrbitResult {
    let targetParams: {
        tempRangeK: [number, number];
        maxRadiation: number;
        gravityRangeG: [number, number];
    };

    switch (habitabilityTier) {
        case 'earth-like':
            targetParams = {
                tempRangeK: [278, 318], // 5 to 45 C (accounts for +10K radiogenic)
                maxRadiation: 5,
                gravityRangeG: [0.8, 1.2]
            };
            break;
        case 'human-habitable':
            targetParams = {
                tempRangeK: [265, 325], // -8 to 52 C (accounts for +10K radiogenic)
                maxRadiation: 10,
                gravityRangeG: [0.5, 1.5]
            };
            break;
        case 'alien-habitable':
            targetParams = {
                tempRangeK: [150, 400],
                maxRadiation: 25,
                gravityRangeG: [0.2, 3.0]
            };
            break;
    }

    const allZones = calculateAllStellarZones(host, pack);
    if (allZones.killZone > allZones.goldilocks.outer) {
        return { success: false, reason: 'The star\'s radiation is too high, and its \'Kill Zone\' completely overlaps the habitable zone.' };
    }
    if (allZones.dangerZone > allZones.goldilocks.outer) {
        return { success: false, reason: 'No viable orbit for complex life. The entire habitable zone is within the \'Danger Zone\'.' };
    }

    // Use the calculated Goldilocks zone as the search area
    const tempSearchInner_AU = allZones.goldilocks.inner;
    const tempSearchOuter_AU = allZones.goldilocks.outer;

    if (tempSearchInner_AU <= 0 || tempSearchOuter_AU <= 0 || tempSearchInner_AU >= tempSearchOuter_AU) {
        return { success: false, reason: 'The host star is too cool to support a habitable planet.' };
    }

    const children = system.nodes.filter(n => n.parentId === host.id && n.kind === 'body') as CelestialBody[];
    const stepSize = (tempSearchOuter_AU - tempSearchInner_AU) / 50; // 50 steps
    let collisionFailures = 0;
    let allOrbitsInCollision = true;
    let allOrbitsTooRadiated = true;

    // Systematic search from outer to inner
    for (let i = 0; i < 50; i++) {
        const searchRadiusAU = tempSearchOuter_AU - (i * stepSize);
        if (searchRadiusAU <= 0) continue;

        // 1. Check for collisions
        let collision = false;
        for (const child of children) {
            const childApoapsis = (child.orbit?.elements.a_AU || 0) * (1 + (child.orbit?.elements.e || 0));
            const childPeriapsis = (child.orbit?.elements.a_AU || 0) * (1 - (child.orbit?.elements.e || 0));
            if (searchRadiusAU > childPeriapsis * 0.95 && searchRadiusAU < childApoapsis * 1.05) { // Reduced buffer
                collision = true;
                break;
            }
        }
        if (collision) {
            collisionFailures++;
            continue; // Try next orbit
        }
        allOrbitsInCollision = false;

        // If we are here, the orbit is not in collision and is in the habitable zone.
        // Radiation is handled by the Danger Zone check, so this orbit is viable.
        return {
            success: true,
            orbit: {
                hostId: host.id,
                hostMu: G * (host.massKg || 0),
                t0: Date.now(),
                elements: { 
                    a_AU: searchRadiusAU, 
                    e: 0.01, // Assume near-circular
                    i_deg: 0, 
                    omega_deg: 0, 
                    Omega_deg: 0, 
                    M0_rad: Math.random() * 2 * Math.PI
                }
            }
        };
    }

    // If we finish the loop without finding a spot
    if (allOrbitsInCollision) {
        return { success: false, reason: 'The habitable zone is too crowded. A GM may need to delete a planet to make room.' };
    }

    return { success: false, reason: 'No stable orbit found in the habitable zone.' };
}
