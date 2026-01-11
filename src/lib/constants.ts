// src/lib/constants.ts
export const APP_VERSION = '1.3.0';
export const APP_DATE = '11-Jan-26';

export const G = 6.67430e-11; // Gravitational constant
export const AU_KM = 149597870.7;
export const SOLAR_MASS_KG = 1.989e30;
export const SOLAR_RADIUS_KM = 696340;
export const EARTH_MASS_KG = 5.972e24;
export const EARTH_RADIUS_KM = 6371;

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
