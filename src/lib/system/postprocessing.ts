// src/lib/system/postprocessing.ts
import type { System, RulePack, CelestialBody, Atmosphere } from '../types';
import { calculateOrbitalBoundaries, type PlanetData } from '../physics/orbits';
import { G, AU_KM } from '../constants';

function calculateMolarMass(atmosphere: Atmosphere, pack: RulePack): number {
    let totalMolarMass = 0;
    if (pack.gasMolarMassesKg) {
        for (const gas in atmosphere.composition) {
            const percentage = atmosphere.composition[gas];
            const molarMass = pack.gasMolarMassesKg[gas] || pack.gasMolarMassesKg['Other Trace'] || 0.028;
            totalMolarMass += percentage * molarMass;
        }
    }
    return totalMolarMass;
}

/**
 * Ensures all derived data is calculated for a system.
 * This can be used to process newly generated systems or update older ones.
 */
export function processSystemData(system: System, rulePack: RulePack): System {
    const nodesById = new Map(system.nodes.map(n => [n.id, n]));

    for (const body of system.nodes) {
        if (body.kind === 'body' && (body.roleHint === 'planet' || body.roleHint === 'moon')) {
            
            // --- Ensure Base Calculated Values Exist ---
            if (body.calculatedGravity_ms2 === undefined && body.massKg && body.radiusKm) {
                body.calculatedGravity_ms2 = (G * body.massKg) / Math.pow(body.radiusKm * 1000, 2);
            }

            // 2. Ensure calculatedRotationPeriod_s exists
            if (body.calculatedRotationPeriod_s === undefined && body.rotation_period_hours !== undefined) {
                body.calculatedRotationPeriod_s = body.rotation_period_hours * 3600;
            }

            // 3. Ensure molarMassKg exists for atmospheres
            if (body.atmosphere && body.atmosphere.molarMassKg === undefined) {
                body.atmosphere.molarMassKg = calculateMolarMass(body.atmosphere, rulePack);
            }

            if (body.orbitalBoundaries === undefined) {
                // --- Gather Data for Sphere of Influence ---
                let immediateHost: CelestialBody | Barycenter | null = null;
                let distanceToHost_au = 0;
                
                // For planets, the host is the star/barycenter. For moons, the host is the planet.
                if (body.parentId) {
                    immediateHost = nodesById.get(body.parentId);
                    distanceToHost_au = body.orbit?.elements.a_AU || 0;
                }

                const hasRequiredData = body.calculatedGravity_ms2 && body.temperatureK && body.massKg && body.calculatedRotationPeriod_s !== undefined && immediateHost && immediateHost.massKg !== undefined;
                
                if (hasRequiredData) {
                    const planetData: PlanetData = {
                        gravity: body.calculatedGravity_ms2!,
                        surfaceTempKelvin: body.temperatureK!,
                        massKg: body.massKg!,
                        rotationPeriodSeconds: body.calculatedRotationPeriod_s!,
                        molarMassKg: body.atmosphere?.molarMassKg ?? 0,
                        surfacePressurePa: (body.atmosphere?.pressure_bar ?? 0) * 100000,
                        distanceToHost_km: distanceToHost_au * AU_KM,
                        hostMass_kg: (immediateHost.kind === 'barycenter' ? immediateHost.effectiveMassKg : immediateHost.massKg)!,
                    };
                    body.orbitalBoundaries = calculateOrbitalBoundaries(planetData);
                }
            }
        }
    }
    return system;
}
