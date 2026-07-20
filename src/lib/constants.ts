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
// The icy hydrostatic-equilibrium ("round") limit, ~Mimas-sized. Below this a body lacks the self-
// gravity to differentiate a shell-over-interior, sustain a subsurface ocean, or cryovolcano — a small
// tidally-stressed lump (Phobos/Deimos) is shredded, not warmed to melt. Keeps Enceladus (~252 km).
export const HYDROSTATIC_MIN_RADIUS_KM = 200;
export const EARTH_GRAVITY = 9.80665; // m/s^2
export const EARTH_DENSITY = 5514; // kg/m^3

// Unshielded radiation dose at 1 AU from a Sun-like star (mSv/year)
// Approx baseline for GCR + Solar Particle Events in free space.
export const RADIATION_UNSHIELDED_DOSE_MSV_YR = 500;

// Liquid solvent definitions — SINGLE source of truth, in src/lib/data/liquids.json (imported here so
// it works in both dev and prod — a public /static import breaks the Vite dev server). This is the
// built-in engine default; a rule pack may still override it by shipping its own liquids.json, which
// the loader merges into pack.liquids (allLiquids(pack) prefers the pack copy). Edit the JSON only.
import type { LiquidDef } from '$lib/types';
import LIQUIDS_JSON from './data/liquids.json';
export type { LiquidDef };
export const LIQUIDS: LiquidDef[] = LIQUIDS_JSON as unknown as LiquidDef[];

export const THERMAL_LIMITS: Record<string, number> = {
    'none': 3.0,        // Minimal drag pass, structural limit
    'ceramic': 12.0,    // Space Shuttle / Starship style
    'ablative': 20.0,   // Apollo / Stardust style (High speed return)
    'magnetic': 50.0,   // Active plasma shielding
    'forcefield': 500.0 // Sci-fi shielding
};

export const DEFAULT_AEROBRAKE_LIMIT_KM_S = THERMAL_LIMITS['none'];
