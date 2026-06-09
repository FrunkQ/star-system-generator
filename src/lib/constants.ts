// src/lib/constants.ts
// APP_VERSION / APP_DATE are derived from the build stamp injected by vite.config
// (__BUILD_INFO__) so the About box never goes stale: version tracks package.json,
// date is the build date. The typeof guard keeps it safe if the define is absent.
const _buildInfo = typeof __BUILD_INFO__ !== 'undefined' ? __BUILD_INFO__ : null;
export const APP_VERSION = _buildInfo?.version ?? '2.0.0-alpha';
export const APP_DATE = _buildInfo?.time
	? new Date(_buildInfo.time)
			.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
			.replace(/ /g, '-')
	: '12-Apr-26';

export const G = 6.67430e-11; // Gravitational constant
export const UNIVERSAL_GAS_CONSTANT = 8.31446; // J/(mol·K)
export const AU_KM = 149597870.7;
// Interstellar scales
export const C_MS = 299792458;                  // speed of light, m/s
export const LY_M = 9.4607304725808e15;         // light-year, m
export const PC_M = 3.0856775814913673e16;      // parsec, m
export const JULIAN_YEAR_S = 31557600;          // seconds in a Julian year (365.25 d)
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
    { name: 'water', label: 'Water (H₂O)', meltK: 273, boilK: 373, colorHex: '#2b6cb0', density_gcc: 1.0, conductive: false, biosolvent: 'ideal', family: 'water' },
    { name: 'water-ammonia', label: 'Water-Ammonia (Cryo)', meltK: 173, boilK: 270, colorHex: '#4f8fb0', density_gcc: 0.94, conductive: true, biosolvent: 'alternative', family: 'cryo' },
    { name: 'ammonia', label: 'Ammonia', meltK: 195, boilK: 240, colorHex: '#c9b08a', density_gcc: 0.68, conductive: false, biosolvent: 'alternative', family: 'cryo' },
    { name: 'methane', label: 'Hydrocarbons (Methane)', meltK: 90, boilK: 112, colorHex: '#6a8caf', density_gcc: 0.42, conductive: false, biosolvent: 'alternative', family: 'hydrocarbon' },
    { name: 'ethane', label: 'Hydrocarbons (Ethane)', meltK: 90, boilK: 184, colorHex: '#7a9ab0', density_gcc: 0.55, conductive: false, biosolvent: 'alternative', family: 'hydrocarbon' },
    { name: 'nitrogen', label: 'Nitrogen', meltK: 63, boilK: 77, colorHex: '#cfe0ff', density_gcc: 0.81, conductive: false, biosolvent: 'none', family: 'cryo' },
    { name: 'sulfuric-acid', label: 'Sulfuric Acid', meltK: 283, boilK: 610, colorHex: '#efe6c0', density_gcc: 1.83, conductive: true, biosolvent: 'none', family: 'acid' },
    { name: 'carbon-dioxide', label: 'Liquid CO₂ (High Pressure)', meltK: 217, boilK: 304, colorHex: '#e6e6e6', density_gcc: 1.1, conductive: false, biosolvent: 'none', family: 'exotic' },
    { name: 'magma', label: 'Magma / Lava', meltK: 1000, boilK: 5000, colorHex: '#d9531e', density_gcc: 2.6, conductive: true, biosolvent: 'none', family: 'molten' },
    { name: 'molten-iron', label: 'Molten Iron', meltK: 1811, boilK: 3134, colorHex: '#808080', density_gcc: 7.0, conductive: true, biosolvent: 'none', family: 'molten' }
];

export const THERMAL_LIMITS: Record<string, number> = {
    'none': 3.0,        // Minimal drag pass, structural limit
    'ceramic': 12.0,    // Space Shuttle / Starship style
    'ablative': 20.0,   // Apollo / Stardust style (High speed return)
    'magnetic': 50.0,   // Active plasma shielding
    'forcefield': 500.0 // Sci-fi shielding
};

export const DEFAULT_AEROBRAKE_LIMIT_KM_S = THERMAL_LIMITS['none'];
