import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '../constants';

export interface StarSeed {
    id: string;
    temperatureK: number;
    luminositySolar: number;
    massKg: number;
    radiusKm: number;
    spectralClass: string;
    initialPosition: { x: number, y: number, z: number };
    initialVelocity: { vx: number, vy: number, vz: number };
}

export const SOLAR_TEMPERATURE_K = 5778;

/**
 * Maps a point on the H-R diagram (T, L) to physical star properties.
 * Uses standard Main Sequence approximations.
 */
export function deriveStarFromHR(temperatureK: number, luminositySolar: number): StarSeed {
    // Mass-Luminosity relation for Main Sequence: L ~ M^3.5 => M ~ L^(1/3.5) ~ L^0.28
    const massSolar = Math.pow(luminositySolar, 0.28);
    
    // Stefan-Boltzmann Law: L = 4*pi*R^2 * sigma * T^4
    // R/R_sun = sqrt(L/L_sun) / (T/T_sun)^2
    const radiusSolar = Math.sqrt(luminositySolar) / Math.pow(temperatureK / SOLAR_TEMPERATURE_K, 2);

    return {
        id: `star-${Math.random().toString(36).substr(2, 9)}`,
        temperatureK,
        luminositySolar,
        massKg: massSolar * SOLAR_MASS_KG,
        radiusKm: radiusSolar * SOLAR_RADIUS_KM,
        spectralClass: determineSpectralClass(temperatureK),
        initialPosition: { x: 0, y: 0, z: 0 },
        initialVelocity: { vx: 0, vy: 0, vz: 0 }
    };
}

export function determineSpectralClass(tempK: number): string {
    if (tempK >= 30000) return 'O';
    if (tempK >= 10000) return 'B';
    if (tempK >= 7500) return 'A';
    if (tempK >= 6000) return 'F';
    if (tempK >= 5200) return 'G';
    if (tempK >= 3700) return 'K';
    return 'M';
}

/**
 * 4th-order Runge-Kutta N-Body Integrator
 */
export function integrateNBody(bodies: StarSeed[], dt_seconds: number) {
    const G = 6.67430e-11;

    // Implementation of N-body physics goes here
    // This will be used by the EvolutionaryWizard to run the "Stellar Dance"
}
