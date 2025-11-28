// src/lib/constants.ts
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
