import type { CelestialBody, System, RulePack, Orbit } from '../types';
import { G } from '../constants';
import { calculateAllStellarZones } from './zones';

export function findViableHabitableOrbit(host: CelestialBody, system: System, type: 'earth-like' | 'human-habitable' | 'alien-habitable', pack: RulePack): { success: true, orbit: Orbit } | { success: false, reason: string } {
    if (host.roleHint !== 'star') {
         // TODO: Handle moons (orbiting planet in HZ)
         return { success: false, reason: 'Habitable generation currently only supports stars as hosts.' };
    }

    const zones = calculateAllStellarZones(host, pack, system.nodes);
    let minAU = zones.goldilocks.inner;
    let maxAU = zones.goldilocks.outer;

    // Adjust target based on type
    if (type === 'human-habitable') {
        // Slightly wider?
    } else if (type === 'alien-habitable') {
        // Could be outside standard HZ if tidal/greenhouse heavy?
        // For now keep to HZ.
    }

    // Simple collision check
    // Try 10 random spots in HZ
    for (let i = 0; i < 10; i++) {
        const eccentricity = 0.02; // keep habitable insertions near-circular
        const minAForPeriInZone = minAU / Math.max(1e-6, (1 - eccentricity));
        const maxAForApoInZone = maxAU / Math.max(1e-6, (1 + eccentricity));
        if (maxAForApoInZone <= minAForPeriInZone) {
            continue;
        }
        const targetAU = minAForPeriInZone + Math.random() * (maxAForApoInZone - minAForPeriInZone);
        
        let conflict = false;
        for (const node of system.nodes) {
            if (node.parentId === host.id && node.orbit) {
                const dist = Math.abs(node.orbit.elements.a_AU - targetAU);
                // Hill Sphere approx check or simple spacing (0.1 AU?)
                if (dist < 0.1) { 
                    conflict = true; 
                    break; 
                }
            }
        }

        if (!conflict) {
            return {
                success: true,
                orbit: {
                    hostId: host.id,
                    hostMu: G * (host.massKg || 0),
                    t0: 0,
                    elements: {
                        a_AU: targetAU,
                        e: eccentricity, // Low eccentricity for habitable
                        i_deg: Math.random() * 5, // Low inclination
                        omega_deg: Math.random() * 360,
                        Omega_deg: Math.random() * 360,
                        M0_rad: Math.random() * 2 * Math.PI
                    }
                }
            };
        }
    }

    return { success: false, reason: 'Habitable Zone is crowded.' };
}

// NOTE: the legacy V1 calculateHabitabilityScore that lived here is GONE. Habitability is scored in
// ONE place — SystemProcessor's habitability pass (the full breakdown with geology/magnetism
// modifiers). It diverged from that scorer twice (different weights, then the solvent ramp), because
// every edit path that called it overwrote the processor's score with a different formula. Edits now
// re-run systemProcessor.process() instead.
