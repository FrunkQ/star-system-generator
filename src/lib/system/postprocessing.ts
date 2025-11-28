// src/lib/system/postprocessing.ts
import type { System, RulePack, CelestialBody } from '../types';
import { AU_KM, G } from '../constants';
import { calculateOrbitalBoundaries, type PlanetData, calculateDeltaVBudgets } from '../physics/orbits';
import { calculateMolarMass, calculateGreenhouseEffect } from '../physics/atmosphere';
import { calculateHabitabilityScore } from '../physics/habitability';

// Re-export for consumers (e.g. BodyTechnicalDetails)
export { calculateMolarMass, calculateGreenhouseEffect, calculateHabitabilityScore, calculateDeltaVBudgets };

/**
 * Recalculates the equilibrium and total surface temperature for a body.
 * Mutates the body object.
 */
export function calculateSurfaceTemperature(body: CelestialBody, rootStar: CelestialBody, parentBody: CelestialBody | null) {
    if (!rootStar.temperatureK || !rootStar.radiusKm || !body.orbit) return;

    let distAU = 0;
    // 1. Determine distance to star
    if (parentBody && parentBody.id === rootStar.id) {
        // Orbiting star directly
        distAU = body.orbit.elements.a_AU;
    } else if (parentBody && parentBody.orbit) {
        // Orbiting a planet (moon) - use planet's distance
        distAU = parentBody.orbit.elements.a_AU;
    } else if (body.id === rootStar.id) {
        return; // Star temp is intrinsic
    }

    if (distAU <= 0) return;

    const distM = distAU * AU_KM * 1000;
    const starRadiusM = rootStar.radiusKm * 1000;
    const albedo = body.albedo !== undefined ? body.albedo : 0.3;

    // Stefan-Boltzmann Law: T_eq = T_star * (1 - A)^0.25 * sqrt(R_star / 2D)
    const albedoFactor = Math.pow(1 - albedo, 0.25);
    const distFactor = Math.sqrt(starRadiusM / (2 * distM));
    
    const equilibriumTempK = rootStar.temperatureK * albedoFactor * distFactor;
    
    body.equilibriumTempK = equilibriumTempK;
    body.temperatureK = equilibriumTempK + (body.greenhouseTempK || 0) + (body.tidalHeatK || 0) + (body.radiogenicHeatK || 0);
}

/**
 * Processes a star system's data to add derived values.
 */
export function processSystemData(system: System, rulePack: RulePack): System {
    const nodesById = new Map(system.nodes.map(n => [n.id, n]));

    for (const body of system.nodes) {
        if (body.kind === 'body' && (body.roleHint === 'planet' || body.roleHint === 'moon')) {
            
            // --- Ensure Base Calculated Values Exist ---
            if (body.calculatedGravity_ms2 === undefined && body.massKg && body.radiusKm) {
                body.calculatedGravity_ms2 = (G * body.massKg) / Math.pow(body.radiusKm * 1000, 2);
            }
            if (body.calculatedRotationPeriod_s === undefined && body.rotation_period_hours !== undefined) {
                body.calculatedRotationPeriod_s = body.rotation_period_hours * 3600;
            }
            if (body.atmosphere && body.atmosphere.molarMassKg === undefined) {
                body.atmosphere.molarMassKg = calculateMolarMass(body.atmosphere, rulePack);
            }

            // --- Calculate Orbital Boundaries ---
            if (body.orbitalBoundaries === undefined) {
                let immediateHost: CelestialBody | Barycenter | null = null;
                let distanceToHost_au = 0;
                
                if (body.parentId) {
                    immediateHost = nodesById.get(body.parentId);
                    distanceToHost_au = body.orbit?.elements.a_AU || 0;
                }

                const hostMass = immediateHost ? (immediateHost.kind === 'barycenter' ? immediateHost.effectiveMassKg : immediateHost.massKg) : undefined;
                const hasRequiredData = body.calculatedGravity_ms2 && body.temperatureK && body.massKg && body.calculatedRotationPeriod_s !== undefined && immediateHost && hostMass !== undefined;
                
                if (hasRequiredData) {
                    const planetData: PlanetData = {
                        gravity: body.calculatedGravity_ms2!,
                        surfaceTempKelvin: body.temperatureK!,
                        massKg: body.massKg!,
                        rotationPeriodSeconds: body.calculatedRotationPeriod_s!,
                        molarMassKg: body.atmosphere?.molarMassKg ?? 0,
                        surfacePressurePa: (body.atmosphere?.pressure_bar ?? 0) * 100000,
                        distanceToHost_km: distanceToHost_au * AU_KM,
                        hostMass_kg: hostMass!,
                    };
                    body.orbitalBoundaries = calculateOrbitalBoundaries(planetData, rulePack);
                }
            }

            // --- Calculate Delta-V Budgets ---
            calculateDeltaVBudgets(body);

            // --- Calculate Habitability Score & Tags ---
            calculateHabitabilityScore(body);
        }
    }
    return system;
}