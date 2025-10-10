// src/lib/physics/habitability.ts
import type { CelestialBody, Orbit, System } from "../types";
import { G, AU_KM } from '../constants';

const L_SUN = 3.828e26; // Watts

/**
 * Finds a suitable orbit within a host's habitable zone.
 * @param host The body to orbit (a star or a gas giant).
 * @param system The full system for context.
 * @param habitableTempRange The desired temperature range [min, max] in Kelvin.
 * @returns A valid Orbit object or null if no suitable orbit is found.
 */
export function findHabitableOrbit(host: CelestialBody, system: System, habitableTempRange: [number, number]): Orbit | null {
    if (host.kind !== 'body' || host.roleHint !== 'star') return null; // Can only find HZ for stars for now

    // Simplified luminosity calculation based on mass-luminosity relation
    const hostLuminosity = Math.pow((host.massKg || 0) / 1.989e30, 3.5) * L_SUN;

    // Calculate the inner and outer bounds of the habitable zone in AU
    const innerBoundary_AU = Math.sqrt(hostLuminosity / L_SUN / 1.1);
    const outerBoundary_AU = Math.sqrt(hostLuminosity / L_SUN / 0.53);

    let searchRadiusAU = randomFromRange(innerBoundary_AU, outerBoundary_AU); 

    // Check for collisions with existing bodies
    const children = system.nodes.filter(n => n.parentId === host.id && n.kind === 'body') as CelestialBody[];
    let attempts = 0;
    while (attempts < 50) {
        let collision = false;
        for (const child of children) {
            const childApoapsis = (child.orbit?.elements.a_AU || 0) * (1 + (child.orbit?.elements.e || 0));
            const childPeriapsis = (child.orbit?.elements.a_AU || 0) * (1 - (child.orbit?.elements.e || 0));
            if (searchRadiusAU > childPeriapsis && searchRadiusAU < childApoapsis) {
                collision = true;
                break;
            }
        }

        if (!collision) {
            return {
                hostId: host.id,
                hostMu: G * (host.massKg || 0),
                t0: Date.now(),
                elements: { 
                    a_AU: searchRadiusAU, 
                    e: 0.01, // Assume a near-circular orbit for stability
                    i_deg: 0, 
                    omega_deg: 0, 
                    Omega_deg: 0, 
                    M0_rad: Math.random() * 2 * Math.PI
                }
            };
        }

        // If there was a collision, try a different radius within the habitable zone
        searchRadiusAU = randomFromRange(innerBoundary_AU, outerBoundary_AU); 
        attempts++;
    }

    return null; // Failed to find a clear orbit after many attempts
}

// Helper to get a random value from a range
function randomFromRange(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}
