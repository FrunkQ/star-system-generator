import type { CelestialBody } from '../types';
import { SOLAR_RADIUS_KM } from '../constants';

const SOLAR_TEMP_K = 5778;
const STEFAN_BOLTZMANN_CONSTANT = 5.670374419e-8;

/**
 * Calculates the luminosity of a star relative to the Sun.
 * @param star The star to calculate the luminosity for.
 * @returns The star's luminosity relative to the Sun.
 */
function getLuminosity(star: CelestialBody): number {
    if (!star.radiusKm || !star.temperatureK) return 1;
    const radius_m = star.radiusKm * 1000;
    const temp_k = star.temperatureK;

    const solar_radius_m = SOLAR_RADIUS_KM * 1000;
    const solar_luminosity = 4 * Math.PI * (solar_radius_m**2) * STEFAN_BOLTZMANN_CONSTANT * (SOLAR_TEMP_K**4);

    const star_luminosity = 4 * Math.PI * (radius_m**2) * STEFAN_BOLTZMANN_CONSTANT * (temp_k**4);

    return star_luminosity / solar_luminosity;
}

/**
 * Calculates the radius of the "Kill Zone" (UV Habitable Zone) around a star.
 * This is a simplified model based on stellar temperature and luminosity.
 * @param star The star to calculate the kill zone for.
 * @returns The radius of the kill zone in AU.
 */
export function calculateKillZone(star: CelestialBody): number {
    if (!star.classes || star.classes.length === 0) return 0;

    const spectralType = star.classes[0].split('/')[1];
    let uvFactor = 1.0;

    // Simplified UV factor based on spectral type
    switch (spectralType) {
        case 'O': uvFactor = 100; break;
        case 'B': uvFactor = 50; break;
        case 'A': uvFactor = 10; break;
        case 'F': uvFactor = 5; break;
        case 'G': uvFactor = 1; break;
        case 'K': uvFactor = 0.5; break;
        case 'M': uvFactor = 0.1; break;
        default: uvFactor = 1; break;
    }

    const luminosity = getLuminosity(star);
    const radiation = star.radiationOutput || 1.0;

    // Combine uvFactor and radiationOutput
    const totalUVFactor = uvFactor * radiation;

    // Base the kill zone on a factor of the star's luminosity, adjusted by the UV factor.
    // The 0.1 is a tunable constant to set a baseline distance.
    const killZoneRadius = 0.1 * Math.sqrt(totalUVFactor * luminosity);

    return killZoneRadius;
}

/**
 * Calculates the Roche Limit for a celestial body.
 * This is the distance within which a celestial body held together only by its own gravity
 * will disintegrate due to a second celestial body's tidal forces.
 * @param primary The primary body (e.g., a planet).
 * @returns The Roche limit in AU.
 */

const AU_KM = 149597870.7;

/**
 * Calculates the distance from a star where a given equilibrium temperature would be found.
 * @param star The star to calculate the distance from.
 * @param tempK The equilibrium temperature in Kelvin.
 * @returns The distance in AU.
 */
function getDistanceForTemperature(star: CelestialBody, tempK: number): number {
    if (!star.temperatureK || !star.radiusKm) return 0;

    // Using the simplified equilibrium temperature formula: a = R_star * (T_star / T_eq)^2 / 2
    const a_km = star.radiusKm * Math.pow(star.temperatureK / tempK, 2) / 2;
    return a_km / AU_KM;
}

export function calculateRocheLimit(primary: CelestialBody): number {
    // Simplified Roche limit for a rigid satellite, D = R * (2 * rho_p / rho_s)^(1/3)
    // We assume the satellite has a density of rock (~3,000 kg/m^3) and the primary is a star.
    const primaryDensity = (primary.massKg || 0) / (4/3 * Math.PI * Math.pow((primary.radiusKm || 1) * 1000, 3));
    const satelliteDensity = 3000;
    const radius_km = (primary.radiusKm || SOLAR_RADIUS_KM);
    return (radius_km * Math.pow(2 * (primaryDensity / satelliteDensity), 1/3)) / AU_KM;
}

export function calculateSilicateLine(star: CelestialBody): number {
    return getDistanceForTemperature(star, 1400);
}

export function calculateSootLine(star: CelestialBody): number {
    return getDistanceForTemperature(star, 500);
}

export function calculateGoldilocksZone(star: CelestialBody): { inner: number; outer: number } {
    // Replace legacy blackbody 373K/273K band with a conservative
    // Kopparapu-style HZ: Runaway Greenhouse (inner) to Maximum Greenhouse (outer).
    // This keeps a single HZ band in the UI/generation while aligning to common literature.
    const teff = star.temperatureK || SOLAR_TEMP_K;
    const luminosity = getLuminosity(star);

    // Valid range in published fits; clamp for stability on exotic stars.
    const tStar = Math.max(2600, Math.min(7200, teff)) - 5780;

    const seff = (s: { seffSun: number; a: number; b: number; c: number; d: number }) =>
        s.seffSun + (s.a * tStar) + (s.b * tStar ** 2) + (s.c * tStar ** 3) + (s.d * tStar ** 4);

    // Kopparapu et al. parameterization (conservative HZ pair).
    const runawayGreenhouse = seff({
        seffSun: 1.107,
        a: 1.332e-4,
        b: 1.58e-8,
        c: -8.308e-12,
        d: -1.931e-15
    });
    const maximumGreenhouse = seff({
        seffSun: 0.356,
        a: 6.171e-5,
        b: 1.698e-9,
        c: -3.198e-12,
        d: -5.575e-16
    });

    const safeInnerSeff = Math.max(1e-6, runawayGreenhouse);
    const safeOuterSeff = Math.max(1e-6, maximumGreenhouse);
    const safeLuminosity = Math.max(1e-6, luminosity);

    const inner = Math.sqrt(safeLuminosity / safeInnerSeff);
    const outer = Math.sqrt(safeLuminosity / safeOuterSeff);

    return {
        inner: Math.min(inner, outer),
        outer: Math.max(inner, outer)
    };
}

export function calculateFrostLine(star: CelestialBody): number {
    return getDistanceForTemperature(star, 170);
}

export function calculateCO2IceLine(star: CelestialBody): number {
    return getDistanceForTemperature(star, 70);
}

export function calculateCOIceLine(star: CelestialBody): number {
    return getDistanceForTemperature(star, 30);
}

export function calculateAllStellarZones(star: CelestialBody, pack?: RulePack): Record<string, any> {
    const killZone = calculateKillZone(star);
    const dangerZoneMultiplier = pack?.generation_parameters?.danger_zone_multiplier || 5;
    const dangerZone = killZone * dangerZoneMultiplier;
    const coIceLine = calculateCOIceLine(star);
    const systemLimitAu = coIceLine * 2;

    return {
        killZone: killZone,
        dangerZone: dangerZone,
        goldilocks: calculateGoldilocksZone(star),
        silicateLine: calculateSilicateLine(star),
        sootLine: calculateSootLine(star),
        frostLine: calculateFrostLine(star),
        co2IceLine: calculateCO2IceLine(star),
        coIceLine: coIceLine,
        systemLimitAu: systemLimitAu,
    };
}
