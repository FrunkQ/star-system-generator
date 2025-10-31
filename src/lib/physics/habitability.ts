// src/lib/physics/habitability.ts
import type { CelestialBody, Orbit, System, ViableOrbitResult } from "../types";
import { G, AU_KM } from '../constants';

const L_SUN = 3.828e26; // Watts



// Helper to get a random value from a range
function randomFromRange(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

export function findViableHabitableOrbit(host: CelestialBody, system: System, habitabilityTier: 'earth-like' | 'human-habitable' | 'alien-habitable'): ViableOrbitResult {
    let targetParams: {
        tempRangeK: [number, number];
        maxRadiation: number;
        gravityRangeG: [number, number];
    };

    switch (habitabilityTier) {
        case 'earth-like':
            targetParams = {
                tempRangeK: [273, 313],
                maxRadiation: 5,
                gravityRangeG: [0.8, 1.2]
            };
            break;
        case 'human-habitable':
            targetParams = {
                tempRangeK: [260, 320],
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

    // Simplified luminosity calculation
    const hostLuminosity = Math.pow((host.massKg || 0) / 1.989e30, 3.5) * L_SUN;
    if (hostLuminosity === 0) return { success: false, reason: 'Host star has no luminosity.' };

    // Estimate the orbital distance range where the temperature might be right
    // This is a wide net, assuming a range of possible greenhouse effects.
    const tempSearchInner_AU = Math.sqrt(hostLuminosity / L_SUN / 2.0); // Widened range
    const tempSearchOuter_AU = Math.sqrt(hostLuminosity / L_SUN / 0.25); // Widened range

    const children = system.nodes.filter(n => n.parentId === host.id && n.kind === 'body') as CelestialBody[];
    const stepSize = (tempSearchOuter_AU - tempSearchInner_AU) / 50; // 50 steps

    // Systematic search from outer to inner
    for (let i = 0; i < 50; i++) {
        const searchRadiusAU = tempSearchOuter_AU - (i * stepSize);
        if (searchRadiusAU <= 0) continue;

        // 1. Check for collisions
        let collision = false;
        for (const child of children) {
            const childApoapsis = (child.orbit?.elements.a_AU || 0) * (1 + (child.orbit?.elements.e || 0));
            const childPeriapsis = (child.orbit?.elements.a_AU || 0) * (1 - (child.orbit?.elements.e || 0));
            if (searchRadiusAU > childPeriapsis * 0.9 && searchRadiusAU < childApoapsis * 1.1) { // Refined buffer
                collision = true;
                break;
            }
        }
        if (collision) continue; // Try next orbit

        // 2. Check radiation
        const radiation = (host.radiationOutput || 1) / (searchRadiusAU * searchRadiusAU);
        if (radiation > targetParams.maxRadiation) {
            continue; // Too much radiation, try next orbit (likely further out)
        }

        // 3. Check temperature
        const equilibriumTempK = Math.pow(hostLuminosity * (1 - 0.3) / (16 * Math.PI * 5.67e-8 * Math.pow(searchRadiusAU * AU_KM * 1000, 2)), 0.25);
        // Assume a best-case greenhouse effect for this check
        const bestCaseGreenhouseK = equilibriumTempK * (Math.pow(1 + (1.5 * 0.18), 0.25) - 1);
        const potentialSurfaceTempK = equilibriumTempK + bestCaseGreenhouseK;

        if (potentialSurfaceTempK >= targetParams.tempRangeK[0] && potentialSurfaceTempK <= targetParams.tempRangeK[1]) {
            // This orbit is viable!
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
    }

    // If we finish the loop without finding a spot
    if (hostLuminosity / L_SUN < 0.01) return { success: false, reason: 'The host star is too cool to support a habitable planet.' };
    if (host.radiationOutput && host.radiationOutput > 100) return { success: false, reason: 'Radiation levels around this star are too high.' };

    return { success: false, reason: 'No stable orbit found in the habitable zone.' };
}
