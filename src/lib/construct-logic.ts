import type { CelestialBody, EngineDefinition, FuelDefinition, PhysicalParameters, Systems } from './types';

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
}

export function calculateFullConstructSpecs(
  construct: CelestialBody,
  engineDefinitions: EngineDefinition[],
  fuelDefinitions: FuelDefinition[],
  current_cargo_tonnes: number,
  current_fuel_tonnes: number,
  current_crew_count: number,
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
  if (life_support) {
    const consumables = life_support.consumables_current_person_days;
    if (current_crew_count > 0) {
      specs.endurance_days = consumables / current_crew_count;
    } else {
      specs.endurance_days = "Infinite"; // Or consumables, if you prefer
    }
  } else {
    specs.endurance_days = "N/A";
  }

  // ========================================================================
  // --- 2. DYNAMIC SPECS (Calculated from mass and sliders) ---
  // ========================================================================
  
  // --- Calculate Current Mass ---
  const dryMass_kg = physical_parameters.massKg || 0;
  const cargoMass_kg = current_cargo_tonnes * 1000;
  
  let fuelMass_kg = 0;
  if (construct.fuel_tanks) {
    for (const tank of construct.fuel_tanks) {
      const fuelDef = findFuel(fuelDefinitions, tank.fuel_type_id);
      if (fuelDef) {
        fuelMass_kg += tank.current_units * fuelDef.density_kg_per_m3; // Assuming units are volume for now
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
        totalPowerDraw_MW += engineDef.powerDraw_MW * engineSlot.quantity;

        // Get thrust
        const thrust_vac_N = engineDef.thrust_kN * 1000 * engineSlot.quantity;
        const thrust_atmo_N = thrust_vac_N * engineDef.atmo_efficiency;
        
        totalVacThrust_N += thrust_vac_N;
        totalAtmoThrust_N += thrust_atmo_N;
        
        // "Weight" the ISP by its thrust contribution
        weightedVacISP_Sum += engineDef.efficiency_isp * thrust_vac_N;
        weightedAtmoISP_Sum += (engineDef.efficiency_isp * engineDef.atmo_efficiency) * thrust_atmo_N;
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

  // --- 3. RETURN THE COMPLETE SPEC SHEET ---
  return specs as ConstructSpecs;
}
