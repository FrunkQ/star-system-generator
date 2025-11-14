// ======== FILE: orbits.ts ========

// --- 1. DEFINE UNIVERSAL CONSTANTS ---

// --- Physics Constants ---
const UNIVERSAL_GAS_CONSTANT: number = 8.314;     // J/(mol·K)
const GRAVITATIONAL_CONSTANT_G: number = 6.674e-11; // N·m²/kg²

// --- Simulator "Rules" & Fallbacks (in km) ---
const DEFAULT_NO_ATMOSPHERE_LEO_KM: number = 30.0;    // Your "galactic recognised LO boundary"
const DEFAULT_LEO_MEO_BOUNDARY_KM: number = 2000.0; // Conventional LEO/MEO boundary
const DEFAULT_MEO_HEO_BOUNDARY_KM: number = 50000.0;  // Your "galactic recognised MO/HO boundary"

// --- Thresholds (in Pascals) ---
const TARGET_ORBITAL_PRESSURE_PA: number = 0.0001; // "Negligible" pressure for orbit
const NEGLIGIBLE_ATMOSPHERE_PA: number = 1.0;      // Any pressure below this is "no atmosphere"


// --- 2. DEFINE DATA STRUCTURES ---

// We need more data for each planet now
export interface PlanetData {
  // For LEO (Atmosphere) Calculation
  gravity: number;             // Surface gravity (m/s²)
  surfaceTempKelvin: number;   // Average surface temperature (K)
  molarMassKg: number;         // Molar mass of atmosphere (kg/mol)
  surfacePressurePa: number;   // Surface atmospheric pressure (Pa)

  // For GEO (Orbital) Calculation
  massKg: number;              // Total mass of the planet (kg)
  rotationPeriodSeconds: number; // Sidereal rotation period (s)

  // For HEO (Sphere of Influence) Calculation
  distanceToHost_km: number;   // Body's average distance from its host (km)
  hostMass_kg: number;         // Mass of the host body (kg)
}

// The object our function will return
export interface OrbitalBoundaries {
  minLeoKm: number;           // The "floor" of LEO
  leoMoeBoundaryKm: number; // The LEO/MEO boundary
  meoHeoBoundaryKm: number; // The MEO/HEO boundary
  heoUpperBoundaryKm: number; // The "ceiling" of HEO (Sphere of Influence)
  geoStationaryKm: number | null; // GEO altitude (or null if impossible)
}


// --- 3. DEFINE PLANET DATA MAP ---
// This map is for example usage and will not be used in the final integration.
// The actual planet data will come from the CelestialBody object.
const PLANET_DATA_MAP: Record<string, PlanetData> = {
  
  "Earth": {
    gravity: 9.8,
    surfaceTempKelvin: 288,
    molarMassKg: 0.029,
    surfacePressurePa: 101325,
    massKg: 5.972e24,
    rotationPeriodSeconds: 86164 // Sidereal day
  },

  "Mars": {
    gravity: 3.7,
    surfaceTempKelvin: 210,
    molarMassKg: 0.043,
    surfacePressurePa: 600,
    massKg: 6.417e23,
    rotationPeriodSeconds: 88642 // Sidereal day (a "sol")
  },

  "Venus": {
    gravity: 8.87,
    surfaceTempKelvin: 737,
    molarMassKg: 0.043,
    surfacePressurePa: 9200000,
    massKg: 4.867e24,
    rotationPeriodSeconds: 20997360 // Very slow and retrograde
  },

  "Moon": {
    gravity: 1.62,
    surfaceTempKelvin: 150,  // Wildly variable, but let's use an average
    molarMassKg: 0.0,      // N/A
    surfacePressurePa: 0.0,  // Effectively zero
    massKg: 7.342e22,
    rotationPeriodSeconds: 2358720 // Tidally locked (27.3 days)
  }
};


// --- 4. DEFINE THE MAIN CALCULATION FUNCTION ---

/**
 * Calculates all plausible orbital boundaries for a planet.
 * All return values are in kilometers.
 */
export function calculateOrbitalBoundaries(planet: PlanetData): OrbitalBoundaries {

  // --- 1. CALCULATE MINIMUM LEO ALTITUDE (THE "FLOOR") ---
  let minLeoKm: number;

  if (planet.surfacePressurePa < NEGLIGIBLE_ATMOSPHERE_PA) {
    // ---- NO ATMOSPHERE CASE ----
    minLeoKm = DEFAULT_NO_ATMOSPHERE_LEO_KM;
  } else {
    // ---- ATMOSPHERE CASE ----
    // Use the barometric formula to find where pressure drops to our target
    const scaleHeight_H = (UNIVERSAL_GAS_CONSTANT * planet.surfaceTempKelvin) / 
                          (planet.molarMassKg * planet.gravity);
    
    const pressureRatio = planet.surfacePressurePa / TARGET_ORBITAL_PRESSURE_PA;
    
    // Check for invalid math (e.g., pressure ratio < 1)
    const altitudeMeters = (pressureRatio > 1) ? (scaleHeight_H * Math.log(pressureRatio)) : 0;
    
    minLeoKm = altitudeMeters / 1000;
  }


  // --- 2. CALCULATE LEO/MEO BOUNDARY (THE "CEILING") ---
  let leoMoeBoundaryKm: number;

  // This handles the edge case of a very thick atmosphere (like a gas giant)
  // where the "floor" (minLeoKm) is *already* past the conventional boundary.
  if (minLeoKm >= DEFAULT_LEO_MEO_BOUNDARY_KM) {
    // LEO is a 2000km band *above* the thick atmosphere
    leoMoeBoundaryKm = minLeoKm + DEFAULT_LEO_MEO_BOUNDARY_KM;
  } else {
    // Normal case (like Earth): LEO is from minLeoKm up to the convention
    leoMoeBoundaryKm = DEFAULT_LEO_MEO_BOUNDARY_KM;
  }


  // --- 3. CALCULATE GEOSTATIONARY ORBIT (RAW VALUE) ---
  let calculatedGeoKm: number | null = null;
  
  // We must derive the planet's radius from its mass and gravity (g = GM/r²) -> r = sqrt(GM/g)
  const planetRadiusMeters = Math.sqrt((GRAVITATIONAL_CONSTANT_G * planet.massKg) / planet.gravity);
  const T = Math.abs(planet.rotationPeriodSeconds);

  if (T > 0) {
    // Standard formula for orbital radius: r = cuberoot( G * M * T² / (4 * π²) )
    const M = planet.massKg;
    const G = GRAVITATIONAL_CONSTANT_G;

    const numerator = G * M * (T * T);
    const denominator = 4 * (Math.PI * Math.PI);
    
    const radiusFromCenterMeters = Math.cbrt(numerator / denominator);
    
    // Altitude is radius from center minus the planet's radius
    const altitudeMeters = radiusFromCenterMeters - planetRadiusMeters;
    calculatedGeoKm = altitudeMeters / 1000;
  }


  // --- 4. CALCULATE HEO UPPER BOUNDARY (SPHERE OF INFLUENCE) ---
  let heoUpperBoundaryKm: number;
  if (planet.hostMass_kg > 0) {
    const massRatio = planet.massKg / (3.0 * planet.hostMass_kg);
    const ratioCbrt = Math.cbrt(massRatio);
    heoUpperBoundaryKm = planet.distanceToHost_km * ratioCbrt;
  } else {
    // Fallback for rogue planets or other edge cases
    heoUpperBoundaryKm = planet.distanceToHost_km * 0.01; 
  }


  // --- 5. VALIDATE GEO & SET FINAL BOUNDARIES (THE FIX) ---
  let finalGeoStationaryKm: number | null = calculatedGeoKm;
  let meoHeoBoundaryKm: number;

  // Check for all impossible GEO conditions
  if (calculatedGeoKm === null || // It was never calculated (e.g., T=0)
      calculatedGeoKm < minLeoKm ||  // It's inside the atmosphere
      calculatedGeoKm > heoUpperBoundaryKm) // It's outside the Sphere of Influence
  {
    // This GEO orbit is physically impossible.
    finalGeoStationaryKm = null;
    
    // Use the default "galactic" boundary
    meoHeoBoundaryKm = DEFAULT_MEO_HEO_BOUNDARY_KM;

  } else {
    // The GEO orbit is valid! Use it as the boundary.
    meoHeoBoundaryKm = calculatedGeoKm;
  }

  
  // --- 6. RETURN ALL BOUNDARIES ---
  return {
    minLeoKm: minLeoKm,
    leoMoeBoundaryKm: leoMoeBoundaryKm,
    meoHeoBoundaryKm: meoHeoBoundaryKm,
    heoUpperBoundaryKm: heoUpperBoundaryKm,
    geoStationaryKm: finalGeoStationaryKm // Return the *validated* value
  };
}


// --- 5. EXAMPLE USAGE ---

console.log("--- Calculating Orbital Boundaries ---");

// --- Earth (Normal Case) ---
const earthOrbits = calculateOrbitalBoundaries(PLANET_DATA_MAP["Earth"]);
console.log("Earth Orbits (km):", {
  LEO: `${earthOrbits.minLeoKm.toFixed(0)} to ${earthOrbits.leoMoeBoundaryKm.toFixed(0)}`,
  MEO: `${earthOrbits.leoMoeBoundaryKm.toFixed(0)} to ${earthOrbits.meoHeoBoundaryKm.toFixed(0)}`,
  GEO: earthOrbits.geoStationaryKm?.toFixed(0) ?? 'N/A'
});

// --- Mars (GEO inside atmosphere/planet - Phobos) ---
const marsOrbits = calculateOrbitalBoundaries(PLANET_DATA_MAP["Mars"]);
console.log("Mars Orbits (km):", {
  LEO: `${marsOrbits.minLeoKm.toFixed(0)} to ${marsOrbits.leoMoeBoundaryKm.toFixed(0)}`,
  MEO: `${marsOrbits.leoMoeBoundaryKm.toFixed(0)} to ${marsOrbits.meoHeoBoundaryKm.toFixed(0)}`,
  GEO: marsOrbits.geoStationaryKm?.toFixed(0) ?? 'N/A'
});

// --- Moon (No Atmosphere, No GEO) ---
const moonOrbits = calculateOrbitalBoundaries(PLANET_DATA_MAP["Moon"]);
console.log("Moon Orbits (km):", {
  LEO: `${moonOrbits.minLeoKm.toFixed(0)} to ${moonOrbits.leoMoeBoundaryKm.toFixed(0)}`,
  MEO: `${moonOrbits.leoMoeBoundaryKm.toFixed(0)} to ${moonOrbits.meoHeoBoundaryKm.toFixed(0)}`,
  GEO: moonOrbits.geoStationaryKm?.toFixed(0) ?? 'N/A'
});