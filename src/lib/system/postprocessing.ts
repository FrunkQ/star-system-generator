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
 * Calculates the delta-v budgets for a celestial body.
 */
function _calculateDeltaVBudgets(body: CelestialBody) {
  // Only calculate surface budgets for planets and moons
  if (body.roleHint !== 'planet' && body.roleHint !== 'moon') {
    body.loDeltaVBudget_ms = -1;
    body.propulsiveLandBudget_ms = -1;
    body.aerobrakeLandBudget_ms = -1;
    return;
  }

  if (!body.calculatedGravity_ms2 || !body.radiusKm) return;

  const g = body.calculatedGravity_ms2;
  const r_meters = body.radiusKm * 1000;
  const pressure_bar = body.atmosphere?.pressure_bar || 0.0;

  // Base Orbital Velocity
  const v_orbit = Math.sqrt(g * r_meters);

  // Takeoff Budget (Surface to LO)
  const v_grav_loss = v_orbit * 0.15;
  const v_drag_loss = 1500 * pressure_bar;
  body.loDeltaVBudget_ms = v_orbit + v_grav_loss + v_drag_loss;

  // Propulsive Landing
  body.propulsiveLandBudget_ms = v_orbit + v_grav_loss;

  // Aerobraking Landing
  if (pressure_bar < 0.001) {
    body.aerobrakeLandBudget_ms = -1;
  } else {
    const v_deorbit = 150;
    const v_final_burn = (1000 * Math.exp(-0.5 * pressure_bar)) + 50;
    body.aerobrakeLandBudget_ms = v_deorbit + v_final_burn;
  }
}

/**
 * Processes a star system's data to add derived values.
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
            _calculateDeltaVBudgets(body);
        }
    }
    return system;
}
