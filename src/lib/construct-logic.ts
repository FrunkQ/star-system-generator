import type { CelestialBody, EngineDefinition, FuelDefinition, PhysicalParameters, Systems } from './types';
import { AU_KM } from './constants';

// Define constants
const g0 = 9.81; // Standard gravity for ISP and G-force calcs

// Helper function to find an engine definition by ID
function findEngine(engineDefinitions: EngineDefinition[], engineId: string): EngineDefinition | undefined {
  return engineDefinitions.find(e => e.id === engineId);
}

// Helper function to find a fuel definition by ID
function findFuel(fuelDefinitions: FuelDefinition[], fuelTypeId: string): FuelDefinition | undefined {
  return fuelDefinitions.find(f => f.id === fuelTypeId);
}

export interface ConstructSpecs {
  simulatedG: number; // Spin gravity
  powerSurplus_MW: number;
  endurance_days: number | string;
  totalMass_tonnes: number;
  maxTakeoffG: number; // Max acceleration in atmosphere
  maxVacuumG: number; // Max acceleration in vacuum
  totalVacuumDeltaV_ms: number;
  totalAtmoDeltaV_ms: number;
  orbit_string: string;
  surfaceTWR: number;
  takeoffFuel_tonnes: number;
  propulsiveLandFuel_tonnes: number;
  aerobrakeLandFuel_tonnes: number;
  roundTripFuel_tonnes: number;
}

export function calculateFullConstructSpecs(
  construct: CelestialBody,
  engineDefinitions: EngineDefinition[],
  fuelDefinitions: FuelDefinition[],
  hostBody: CelestialBody | null,
): ConstructSpecs {
  const specs: Partial<ConstructSpecs> = {}; // Use Partial for initial assignment

  // ========================================================================
  // --- 1. STATIC SPECS (Calculated from construct's build) ---
  // ========================================================================

  // --- Calculate Spin Gravity ---
  const physical_parameters = construct.physical_parameters || {};
  const radius = physical_parameters.spinRadiusM || 0;
  const period_sec = (physical_parameters.rotation_period_hours || 0) * 3600;
  if (period_sec > 0) {
    const accel = (4 * (Math.PI ** 2) * radius) / (period_sec ** 2);
    specs.simulatedG = accel / g0;
  } else {
    specs.simulatedG = 0;
  }

  // --- Calculate Power Budget ---
  const systems = construct.systems || {};
  let totalPowerOutput_MW = 0;
  if (systems.power_plants) {
    for (const plant of systems.power_plants) {
      totalPowerOutput_MW += plant.output_MW;
    }
  }
  
  let totalPowerDraw_MW = 0; // This will be the "idle" power draw

  // --- Calculate Life Support Endurance ---
  const life_support = systems.life_support;
  const current_crew_count = construct.crew?.current || 0; // Get from construct's crew object
  if (life_support) {
    const consumables = life_support.consumables_current_person_days;
    if (current_crew_count > 0) {
      specs.endurance_days = Math.floor(consumables / current_crew_count);
    } else {
      specs.endurance_days = "Indefinite";
    }
  } else {
    specs.endurance_days = "N/A";
  }

  // --- Determine Orbit String ---
  const hostName = hostBody?.name || 'Unknown';
  let placementDescription = construct.placement || 'Orbit';

  if (hostBody?.roleHint === 'star' && construct.orbit?.elements.a_AU !== undefined) {
      placementDescription = `${construct.orbit.elements.a_AU.toFixed(2)} AU`;
  } else if (construct.placement && construct.placement.endsWith(' Orbit')) {
      placementDescription = construct.placement;
  } else if (construct.placement === 'Surface') {
      placementDescription = 'Surface';
  } else if (construct.placement === 'L4' || construct.placement === 'L5') {
      placementDescription = construct.placement;
  } else if (hostBody && construct.orbit) {
      // Fallback logic to determine zone from altitude if placement is generic 'Orbit'
      if (hostBody.orbitalBoundaries) {
          const altitudeKm = (construct.orbit.elements.a_AU * AU_KM) - (hostBody.radiusKm || 0);
          const boundaries = hostBody.orbitalBoundaries;
          if (boundaries.hasSurface && boundaries.surface && altitudeKm <= boundaries.surface.max) placementDescription = 'Surface';
          else if (boundaries.lowOrbit && altitudeKm <= boundaries.lowOrbit.max) placementDescription = 'Low Orbit';
          else if (boundaries.mediumOrbit && altitudeKm <= boundaries.mediumOrbit.max) placementDescription = 'Medium Orbit';
          else if (boundaries.geosynchronousOrbit && altitudeKm <= boundaries.geosynchronousOrbit.max) placementDescription = 'Geosynchronous';
          else if (boundaries.highOrbit && altitudeKm <= boundaries.highOrbit.max) placementDescription = 'High Orbit';
          else placementDescription = 'Far Orbit';
      } else {
          placementDescription = 'Orbit';
      }
  }

  specs.orbit_string = `${hostName}: ${placementDescription}`;
  
  if (!hostBody) {
    specs.orbit_string = 'N/A';
  }

  // ========================================================================
  // --- 2. DYNAMIC SPECS (Calculated from mass and sliders) ---
  // ========================================================================
  
  // --- Calculate Current Mass ---
  const dryMass_kg = physical_parameters.massKg || 0;
  const cargoMass_kg = (construct.current_cargo_tonnes || 0) * 1000; // Use from construct
  
  let fuelMass_kg = 0;
  if (construct.fuel_tanks) {
    for (const tank of construct.fuel_tanks) {
      const fuelDef = findFuel(fuelDefinitions, tank.fuel_type_id);
      if (fuelDef) {
        fuelMass_kg += tank.current_units * fuelDef.density_kg_per_m3;
      }
    }
  }
  
  const mass_wet = dryMass_kg + cargoMass_kg + fuelMass_kg;
  const mass_dry_of_fuel = dryMass_kg + cargoMass_kg;

  specs.totalMass_tonnes = mass_wet / 1000;

  // --- Calculate Propulsion Specs (Loop through engines) ---
  let totalVacThrust_N = 0;
  let totalAtmoThrust_N = 0;
  let weightedVacISP_Sum = 0;
  let weightedAtmoISP_Sum = 0;

  if (construct.engines) {
    for (const engineSlot of construct.engines) {
      const engineDef = findEngine(engineDefinitions, engineSlot.engine_id);
      
      if (engineDef) {
        // Skip non-main engines (like RCS) for this calc
        if (engineDef.type === "Chemical (Monopropellant)") continue; 
        
        // Add engine's power draw
        totalPowerDraw_MW += (engineDef.powerDraw_MW || 0) * engineSlot.quantity;

        // Get thrust
        const thrust_vac_N = engineDef.thrust_kN * 1000 * engineSlot.quantity;
        const atmoEfficiency = engineDef.atmo_efficiency || 1; // Default to 1 (no loss) if not specified
        const thrust_atmo_N = thrust_vac_N * atmoEfficiency;
        
        totalVacThrust_N += thrust_vac_N;
        totalAtmoThrust_N += thrust_atmo_N;
        
        // "Weight" the ISP by its thrust contribution
        weightedVacISP_Sum += engineDef.efficiency_isp * thrust_vac_N;
        weightedAtmoISP_Sum += (engineDef.efficiency_isp * atmoEfficiency) * thrust_atmo_N;
      }
    }
  }

  // --- Final Dynamic Calcs ---
  
  // Power Surplus
  specs.powerSurplus_MW = totalPowerOutput_MW - totalPowerDraw_MW;

  // TWR (Max Takeoff G) - This is the key "guidance" parameter
  if (mass_wet > 0 && totalAtmoThrust_N > 0) {
    const atmo_accel_ms2 = totalAtmoThrust_N / mass_wet;
    specs.maxTakeoffG = atmo_accel_ms2 / g0;
  } else {
    specs.maxTakeoffG = 0;
  }
  
  // Max Vacuum Acceleration
  if (mass_wet > 0 && totalVacThrust_N > 0) {
    const vac_accel_ms2 = totalVacThrust_N / mass_wet;
    specs.maxVacuumG = vac_accel_ms2 / g0;
  } else {
    specs.maxVacuumG = 0;
  }

  // Total Delta-V (Vacuum)
  if (totalVacThrust_N > 0 && mass_wet > 0 && mass_dry_of_fuel > 0) {
    const avgVacISP = weightedVacISP_Sum / totalVacThrust_N;
    specs.totalVacuumDeltaV_ms = avgVacISP * g0 * Math.log(mass_wet / mass_dry_of_fuel);
  } else {
    specs.totalVacuumDeltaV_ms = 0;
  }
  
  // Total Delta-V (Atmosphere - for takeoff calcs)
  if (totalAtmoThrust_N > 0 && mass_wet > 0 && mass_dry_of_fuel > 0) {
    const avgAtmoISP = weightedAtmoISP_Sum / totalAtmoThrust_N;
    specs.totalAtmoDeltaV_ms = avgAtmoISP * g0 * Math.log(mass_wet / mass_dry_of_fuel);
  } else {
    specs.totalAtmoDeltaV_ms = 0;
  }

  // Surface TWR
  const hostGravity = hostBody?.calculatedGravity_ms2 || 0;
  if (hostGravity > 0) {
    const weightOnSurface = mass_wet * hostGravity;
    specs.surfaceTWR = totalAtmoThrust_N / weightOnSurface;
  } else {
    specs.surfaceTWR = 0;
  }

  // --- 4. FUEL CONSUMPTION CALCS ---
  function calculateFuelForDeltaV(initialMass_kg: number, Isp: number, targetDeltaV_ms: number): number {
    if (Isp <= 0 || targetDeltaV_ms <= 0) return 0;
    const finalMass_kg = initialMass_kg / Math.exp(targetDeltaV_ms / (Isp * g0));
    return initialMass_kg - finalMass_kg;
  }

  // Takeoff Fuel
  const takeoffBudget_ms = (hostBody as any)?.loDeltaVBudget_ms || 0;
  const avgAtmoISP = totalAtmoThrust_N > 0 ? weightedAtmoISP_Sum / totalAtmoThrust_N : 0;
  const fuelForTakeoff_kg = calculateFuelForDeltaV(mass_wet, avgAtmoISP, takeoffBudget_ms);
  specs.takeoffFuel_tonnes = fuelForTakeoff_kg / 1000;

  // Propulsive Landing Fuel
  const propulsiveBudget_ms = (hostBody as any)?.propulsiveLandBudget_ms || 0;
  const avgVacISP = totalVacThrust_N > 0 ? weightedVacISP_Sum / totalVacThrust_N : 0;
  const fuelForPropulsiveLanding_kg = calculateFuelForDeltaV(mass_wet, avgVacISP, propulsiveBudget_ms);
  specs.propulsiveLandFuel_tonnes = fuelForPropulsiveLanding_kg / 1000;

  // Aerobraked Landing Fuel
  const aerobrakeBudget_ms = (hostBody as any)?.aerobrakeLandBudget_ms || 0;
  const fuelForAerobrakeLanding_kg = calculateFuelForDeltaV(mass_wet, avgVacISP, aerobrakeBudget_ms);
  specs.aerobrakeLandFuel_tonnes = fuelForAerobrakeLanding_kg / 1000;

  // Round Trip Fuel (Takeoff + Landing with reduced mass)
  const mass_after_takeoff_kg = mass_wet - fuelForTakeoff_kg;
  
  // Determine the cheaper and *possible* landing method for the return trip
  const canAerobrake = (construct as any).physical_parameters?.can_aerobrake && (hostBody as any)?.aerobrakeLandBudget_ms > 0;
  const canPropulsivelyLand = (hostBody as any)?.propulsiveLandBudget_ms > 0;
  let returnLandingBudget_ms = 0;

  if (canAerobrake && canPropulsivelyLand) {
    returnLandingBudget_ms = Math.min((hostBody as any).aerobrakeLandBudget_ms, (hostBody as any).propulsiveLandBudget_ms);
  } else if (canPropulsivelyLand) {
    returnLandingBudget_ms = (hostBody as any).propulsiveLandBudget_ms;
  } else if (canAerobrake) { // This case is less likely but included for completeness
    returnLandingBudget_ms = (hostBody as any).aerobrakeLandBudget_ms;
  }

  const fuelForReturnLanding_kg = calculateFuelForDeltaV(mass_after_takeoff_kg, avgVacISP, returnLandingBudget_ms);
  specs.roundTripFuel_tonnes = (fuelForTakeoff_kg + fuelForReturnLanding_kg) / 1000;

  // --- 5. RETURN THE COMPLETE SPEC SHEET ---
  return specs as ConstructSpecs;
}
