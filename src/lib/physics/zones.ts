import type { CelestialBody } from '../types';
import { SOLAR_RADIUS_KM } from '../constants';

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
    const inner = getDistanceForTemperature(star, 373); // 100 C
    const outer = getDistanceForTemperature(star, 273); // 0 C
    return { inner, outer };
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
