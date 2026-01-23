import type { System, RulePack, CelestialBody, Barycenter, Orbit } from '../types';
import { SeededRNG } from '../rng';
import { weightedChoice, randomFromRange, toRoman } from '../utils';
import { _generatePlanetaryBody } from './planet';
import { G, AU_KM, SOLAR_MASS_KG } from '../constants';
import { calculateOrbitalSlots } from './placement-strategy';

export function generatePlanets(
    systemRoot: CelestialBody | Barycenter,
    nodes: (CelestialBody | Barycenter)[],
    pack: RulePack,
    rng: SeededRNG,
    systemName: string,
    isBinary: boolean,
    starA: CelestialBody,
    starB?: CelestialBody,
    empty: boolean = false
): void {
    if (empty) return;

    // 1. Determine Planet Count
    const starClass = starA.classes[0].split('/')[1];
    const spectralType = starClass[0];
    let bodyCountTable;
    if (['O', 'B', 'A'].includes(spectralType)) {
        bodyCountTable = pack.distributions['planet_count_massive'];
    } else if (['G', 'K', 'M', 'F'].includes(spectralType) || starClass === 'red-giant') {
        bodyCountTable = pack.distributions['planet_count_main_sequence'];
    } else {
        bodyCountTable = pack.distributions['planet_count_remnant'];
    }
    const numBodies = bodyCountTable ? weightedChoice<number>(rng, bodyCountTable) : rng.nextInt(0, 8);
    const system_age_Gyr = randomFromRange(rng, 0.1, 10.0); // Should be passed in?

    // 2. Generation Loop
    if (!isBinary) {
        // --- Single Star System ---
        const star = systemRoot as CelestialBody;
        const slots = calculateOrbitalSlots(star, pack, rng, numBodies);

        for (let i = 0; i < slots.length; i++) {
            const a_AU = slots[i];
            const maxEccentricity = (system_age_Gyr > 5) ? 0.1 : 0.15;
            const newEccentricity = randomFromRange(rng, 0.01, maxEccentricity);

            const orbit: Orbit = {
                hostId: systemRoot.id,
                hostMu: G * (star.massKg || 0),
                t0: Date.now(),
                elements: { 
                    a_AU: a_AU, 
                    e: newEccentricity, 
                    i_deg: Math.pow(rng.nextFloat(), 3) * 15, 
                    omega_deg: 0, 
                    Omega_deg: 0, 
                    M0_rad: randomFromRange(rng, 0, 2 * Math.PI) 
                }
            };

            if (weightedChoice<boolean>(rng, pack.distributions['retrograde_orbit_chance'])) {
                orbit.isRetrogradeOrbit = true;
            }

            const newNodes = _generatePlanetaryBody(rng, pack, systemRoot.id.split('-')[0], i, systemRoot, orbit, `${systemName} ${String.fromCharCode(98 + i)}`, nodes, system_age_Gyr, undefined, true);
            nodes.push(...newNodes);
        }
    } else {
        // --- Binary Star System ---
        if (!starB) return;
        const barycenter = systemRoot as Barycenter;
        const totalMassKg = (starA.massKg || 0) + (starB.massKg || 0);
        
        const m1 = starA.massKg || 0;
        const m2 = starB.massKg || 0;
        const mu = m2 / (m1 + m2);
        const starSeparationAU = (starA.orbit?.elements.a_AU || 0) + (starB.orbit?.elements.a_AU || 0);
    
        const pTypeCriticalAU = 1.60 * starSeparationAU;
        const sTypeACriticalAU = 0.464 * (1 - mu) * starSeparationAU;
        const sTypeBCriticalAU = 0.464 * mu * starSeparationAU;
    
        let lastApo_p = pTypeCriticalAU * 1.5;

        // Helper for limits
        const getLimits = (s: CelestialBody) => {
             const roche = (s.radiusKm * 2.44) / AU_KM;
             const soot = ((s.radiusKm / 2) * Math.pow(s.temperatureK / 1800, 2)) / AU_KM;
             return Math.max(roche, soot) * 1.2;
        };

        let lastApo_sA = getLimits(starA);
        let lastApo_sB = getLimits(starB);
    
        const placementRules = (pack as any).generation_parameters?.binary_placement_rules;

        for (let i = 0; i < numBodies; i++) {
            let placement: string = 'around_primary'; // Default fallback

            if (placementRules) {
                // Find matching tier
                const tier = placementRules.find((r: any) => starSeparationAU <= r.max_sep_au) || placementRules[placementRules.length - 1];
                
                // Weighted choice from tier.weights
                const weights = tier.weights;
                let totalWeight = 0;
                for (const key in weights) totalWeight += weights[key];
                
                let random = rng.nextFloat() * totalWeight;
                for (const key in weights) {
                    if (random < weights[key]) {
                        placement = key;
                        break;
                    }
                    random -= weights[key];
                }
            } else {
                // Legacy Hardcoded Logic
                if (starSeparationAU < 0.5) {
                    placement = rng.nextFloat() < 0.75 ? 'circumbinary' : (rng.nextFloat() < 0.7 ? 'around_primary' : 'around_secondary');
                } else if (starSeparationAU < 10) {
                    placement = rng.nextFloat() < 0.5 ? 'circumbinary' : (rng.nextFloat() < 0.7 ? 'around_primary' : 'around_secondary');
                } else if (starSeparationAU < 50) {
                    placement = 'none';
                } else {
                    placement = rng.nextFloat() < 0.7 ? 'around_primary' : 'around_secondary';
                }
            }

            if (placement === 'none') continue;
    
            let host: CelestialBody | Barycenter;
            let lastApo: number;
            let maxApo: number | null = null;
            let planetNamePrefix: string;
            let hostMassKg: number;
    
            if (placement === 'circumbinary') {
                host = barycenter;
                lastApo = lastApo_p;
                planetNamePrefix = `${systemName} P`;
                hostMassKg = totalMassKg;
            } else if (placement === 'around_primary') {
                host = starA;
                lastApo = lastApo_sA;
                maxApo = sTypeACriticalAU;
                planetNamePrefix = `${starA.name} `;
                hostMassKg = m1;
            } else { // around_secondary
                host = starB;
                lastApo = lastApo_sB;
                maxApo = sTypeBCriticalAU;
                planetNamePrefix = `${starB.name} `;
                hostMassKg = m2;
            }
    
            const minGap = 0.1 * (host.kind === 'barycenter' ? starSeparationAU : 1);
            const newPeriapsis = lastApo + randomFromRange(rng, minGap, minGap * 3);
            if (maxApo && newPeriapsis > maxApo) continue;
    
            const maxEccentricity = (system_age_Gyr > 5) ? 0.1 : 0.15;
            const newEccentricity = randomFromRange(rng, 0.01, maxEccentricity);
            const newA_AU = newPeriapsis / (1 - newEccentricity);
            const newApoapsis = newA_AU * (1 + newEccentricity);
    
            if (maxApo && newApoapsis > maxApo) continue;
    
            const orbit: Orbit = {
                hostId: host.id,
                hostMu: G * hostMassKg,
                t0: Date.now(),
                elements: { a_AU: newA_AU, e: newEccentricity, i_deg: Math.pow(rng.nextFloat(), 3) * 15, omega_deg: 0, Omega_deg: 0, M0_rad: randomFromRange(rng, 0, 2 * Math.PI) }
            };

            if (weightedChoice<boolean>(rng, pack.distributions['retrograde_orbit_chance'])) {
                orbit.isRetrogradeOrbit = true;
            }

            const newNodes = _generatePlanetaryBody(rng, pack, systemRoot.id.split('-')[0], i, host, orbit, `${planetNamePrefix}${toRoman(i + 1)}`, nodes, system_age_Gyr, undefined, true);
            nodes.push(...newNodes);
    
            if (placement === 'circumbinary') lastApo_p = newApoapsis;
            else if (placement === 'around_primary') lastApo_sA = newApoapsis;
            else lastApo_sB = newApoapsis;
        }
    }
}
