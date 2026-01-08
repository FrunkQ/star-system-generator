// src/lib/system/postprocessing.ts
import type { System, RulePack, CelestialBody, Barycenter } from '../types';
import { AU_KM, G } from '../constants';
import { calculateOrbitalBoundaries, type PlanetData, calculateDeltaVBudgets } from '../physics/orbits';
import { calculateMolarMass, calculateGreenhouseEffect } from '../physics/atmosphere';
import { calculateHabitabilityScore } from '../physics/habitability';
import { calculateEquilibriumTemperature } from '../physics/temperature';
import { calculateSurfaceRadiation } from '../physics/radiation';

// Re-export for consumers (e.g. BodyTechnicalDetails)
export { calculateMolarMass, calculateGreenhouseEffect, calculateHabitabilityScore, calculateDeltaVBudgets };

/**
 * Recalculates the equilibrium and total surface temperature for a body.
 * Mutates the body object.
 */
export function calculateSurfaceTemperature(body: CelestialBody, allNodes: (CelestialBody | Barycenter)[]) {
    const albedo = body.albedo !== undefined ? body.albedo : 0.3;
    const equilibriumTempK = calculateEquilibriumTemperature(body, allNodes, albedo);
    
    if (equilibriumTempK > 0) {
        body.equilibriumTempK = equilibriumTempK;
        body.temperatureK = equilibriumTempK + (body.greenhouseTempK || 0) + (body.tidalHeatK || 0) + (body.radiogenicHeatK || 0);
    }
}

/**
 * Full system recalculation. Call this after editing a Star or changing system structure.
 * Updates Temperature, Radiation, Orbital Boundaries, and Habitability for all bodies.
 */
export function recalculateSystemPhysics(system: System, rulePack: RulePack): System {
    const nodesById = new Map(system.nodes.map(n => [n.id, n]));

    // Pass 1: Temperature and Radiation (Dependencies for Zones/Habitability)
    for (const body of system.nodes) {
        if (body.kind === 'body' && (body.roleHint === 'planet' || body.roleHint === 'moon')) {
            calculateSurfaceTemperature(body, system.nodes);
            body.surfaceRadiation = calculateSurfaceRadiation(body, system.nodes, rulePack);
        }
    }

    // Pass 2: Derived Physics (Zones, Habitability)
    for (const body of system.nodes) {
        if (body.kind === 'body' && (body.roleHint === 'planet' || body.roleHint === 'moon')) {
            // Re-calculate Gravity/Rotation if mass/radius changed
            if (body.massKg && body.radiusKm) {
                body.calculatedGravity_ms2 = (G * body.massKg) / Math.pow(body.radiusKm * 1000, 2);
            }
            // (Rotation period usually intrinsic unless tidally locked logic changes, but let's leave it)

            // Force Re-calculate Orbital Boundaries
            let immediateHost: CelestialBody | Barycenter | null = null;
            let distanceToHost_au = 0;
            
            if (body.parentId) {
                immediateHost = nodesById.get(body.parentId) || null;
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
                    molarMassKg: body.atmosphere?.molarMassKg ?? 0.028,
                    surfacePressurePa: (body.atmosphere?.pressure_bar ?? 0) * 100000,
                    distanceToHost_km: distanceToHost_au * AU_KM,
                    hostMass_kg: hostMass!,
                };
                body.orbitalBoundaries = calculateOrbitalBoundaries(planetData, rulePack);
            }

            // Re-calculate Delta V
            calculateDeltaVBudgets(body);

            // Re-calculate Habitability
            calculateHabitabilityScore(body);
        }
    }
    return system;
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