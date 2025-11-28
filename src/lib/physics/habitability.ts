import type { CelestialBody, System, RulePack, Orbit } from '../types';
import { G } from '../constants';
import { calculateAllStellarZones } from './zones';

export function findViableHabitableOrbit(host: CelestialBody, system: System, type: 'earth-like' | 'human-habitable' | 'alien-habitable', pack: RulePack): { success: true, orbit: Orbit } | { success: false, reason: string } {
    if (host.roleHint !== 'star') {
         // TODO: Handle moons (orbiting planet in HZ)
         return { success: false, reason: 'Habitable generation currently only supports stars as hosts.' };
    }

    const zones = calculateAllStellarZones(host, pack);
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
        const targetAU = minAU + Math.random() * (maxAU - minAU);
        
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
                        e: 0.02, // Low eccentricity for habitable
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

export function calculateHabitabilityScore(planet: CelestialBody) {
    if (planet.roleHint !== 'planet' && planet.roleHint !== 'moon') return;

    const scoreFromRange = (value: number, optimal: number, range: number) => {
        const diff = Math.abs(value - optimal);
        return Math.max(0, 1 - (diff / range));
    };

    let score = 0;
    let factors = {
        temp: 0,
        pressure: 0,
        solvent: 0,
        radiation: 0,
        gravity: 0
    };

    // Temperature Score (Max 30 points)
    if (planet.temperatureK) {
        if (planet.hydrosphere?.composition === 'water' || !planet.hydrosphere) {
            factors.temp = scoreFromRange(planet.temperatureK, 288, 50); // Optimal 15C, range +/- 50C
        } else if (planet.hydrosphere?.composition === 'methane') {
            factors.temp = scoreFromRange(planet.temperatureK, 111, 30); // Optimal -162C, range +/- 30C
        } else if (planet.hydrosphere?.composition === 'ammonia') {
            factors.temp = scoreFromRange(planet.temperatureK, 218, 30); // Optimal -55C, range +/- 30C
        }
    }
    score += factors.temp * 30;

    // Pressure Score (Max 20 points)
    if (planet.atmosphere?.pressure_bar) {
        factors.pressure = scoreFromRange(planet.atmosphere.pressure_bar, 1, 2);
    }
    score += factors.pressure * 20;

    // Solvent Score (Max 20 points)
    if ((planet.hydrosphere?.coverage || 0) > 0.1) {
        factors.solvent = 1;
        if (planet.hydrosphere?.composition === 'water') {
            score += 5; // Bonus for water
        }
    }
    score += factors.solvent * 15;

    // Radiation Score (Max 15 points)
    factors.radiation = scoreFromRange(planet.surfaceRadiation || 0, 0, 10);
    score += factors.radiation * 15;

    // Gravity Score (Max 15 points)
    const surfaceGravityG = (planet.massKg && planet.radiusKm) ? (G * planet.massKg / ((planet.radiusKm*1000) * (planet.radiusKm*1000))) / 9.81 : 0;
    if (surfaceGravityG > 0) {
        factors.gravity = scoreFromRange(surfaceGravityG, 1, 1.5);
    }
    score += factors.gravity * 15;
    
    planet.habitabilityScore = Math.max(0, Math.min(100, score));

    // Update Tags
    if (!planet.tags) planet.tags = [];
    planet.tags = planet.tags.filter(t => !t.key.startsWith('habitability/'));
    
    const isEarthLike = factors.temp > 0.9 && factors.pressure > 0.8 && factors.solvent === 1 && planet.hydrosphere?.composition === 'water' && factors.radiation > 0.9 && factors.gravity > 0.8 && (planet.atmosphere?.composition?.['O2'] || 0) > 0.1;
    const isHumanHabitable = factors.temp > 0.7 && factors.pressure > 0.6 && factors.solvent === 1 && planet.hydrosphere?.composition === 'water' && factors.radiation > 0.7 && factors.gravity > 0.6;
    const isAlienHabitable = score > 40;

    let tier: string;
    if (isEarthLike) tier = 'habitability/earth-like';
    else if (isHumanHabitable) tier = 'habitability/human';
    else if (isAlienHabitable) tier = 'habitability/alien';
    else tier = 'habitability/none';
    
    planet.tags.push({ key: tier });
}
