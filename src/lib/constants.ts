// src/lib/constants.ts
export const APP_VERSION = '1.8.3';
export const APP_DATE = '14-Feb-26';

export const G = 6.67430e-11; // Gravitational constant
export const UNIVERSAL_GAS_CONSTANT = 8.31446; // J/(mol·K)
export const AU_KM = 149597870.7;
export const SOLAR_MASS_KG = 1.989e30;
export const SOLAR_RADIUS_KM = 696340;
export const EARTH_MASS_KG = 5.972e24;
export const EARTH_RADIUS_KM = 6371;
export const EARTH_GRAVITY = 9.80665; // m/s^2
export const EARTH_DENSITY = 5514; // kg/m^3

// Unshielded radiation dose at 1 AU from a Sun-like star (mSv/year)
// Approx baseline for GCR + Solar Particle Events in free space.
export const RADIATION_UNSHIELDED_DOSE_MSV_YR = 500;

export interface LiquidDef {
    name: string;
    label: string;
    meltK: number;
    boilK: number;
}

export const LIQUIDS: LiquidDef[] = [
    { name: 'water', label: 'Water (H₂O)', meltK: 273, boilK: 373 },
    { name: 'ammonia', label: 'Ammonia', meltK: 195, boilK: 240 },
    { name: 'methane', label: 'Hydrocarbons (Methane)', meltK: 90, boilK: 112 },
    { name: 'nitrogen', label: 'Nitrogen', meltK: 63, boilK: 77 },
    { name: 'sulfuric-acid', label: 'Sulfuric Acid', meltK: 283, boilK: 610 },
    { name: 'magma', label: 'Magma / Lava', meltK: 1000, boilK: 5000 },
    { name: 'water-ammonia', label: 'Water-Ammonia (Cryo)', meltK: 173, boilK: 270 }
];

export const THERMAL_LIMITS: Record<string, number> = {
    'none': 3.0,        // Minimal drag pass, structural limit
    'ceramic': 12.0,    // Space Shuttle / Starship style
    'ablative': 20.0,   // Apollo / Stardust style (High speed return)
    'magnetic': 50.0,   // Active plasma shielding
    'forcefield': 500.0 // Sci-fi shielding
};

export const DEFAULT_AEROBRAKE_LIMIT_KM_S = THERMAL_LIMITS['none'];
