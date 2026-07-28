// Atmospheric temperature profile — how cold it gets as you climb.
//
// This is the piece the cloud model was missing. Deriving where a substance condenses needs to know
// the temperature at the PRESSURE LEVEL where the condensing happens, and until this module existed
// there was one notional "deck temperature" fudged from the surface value. That single number was
// behind every remaining cloud misjudgement: Saturn grew a methane deck the real planet does not
// have, Uranus's methane read far too strong, and Venus's acid deck had to be hand-tuned into place.
//
// Two pieces of textbook physics, no new rule-pack data:
//
//  1. A CONVECTING atmosphere follows its dry adiabat, T = T_surf (P/P_surf)^K, where the exponent
//     K = R / c_p(molar) comes straight from the gases present. It falls out at 0.29 for an N2/O2
//     world, 0.22 for a CO2 one, 0.29 for a hydrogen giant — from the per-gas specificHeat and
//     molarMass the rule pack already carries for the greenhouse model.
//
//  2. Convection stops. Above the tropopause the air is heated by radiation alone and settles at the
//     SKIN TEMPERATURE, T_eq / 2^(1/4) — the classic grey-atmosphere result. It is remarkably good:
//     Earth 214 K (real ~210), Jupiter 104 K (real ~110), Venus 195 K (real ~190). The profile is
//     the adiabat until it reaches that floor, isothermal above.
//
// Everything downstream — where each species saturates, how much condensate a column holds, whether
// what falls out survives to the ground — reads this rather than guessing.
import type { CelestialBody, RulePack } from '$lib/types';
import { makeupFractions } from './makeup';

export const R_GAS = 8.314;              // J/mol/K
const GRAV_CONST = 6.674e-11;
/** Below this there is no collisional atmosphere at all, however condensable it reads. */
export const MIN_ATM_BAR = 1e-6;
/** Where a surfaceless giant's sky is taken to start — the level its temperature is quoted at. */
export const GIANT_REFERENCE_BAR = 1;

export interface AtmosphereLevel {
  pBar: number;
  tempK: number;
}

export interface AtmosphereProfile {
  pSurfBar: number;
  tSurfK: number;
  tSkinK: number;         // the isothermal upper atmosphere
  kappa: number;          // adiabatic exponent R/c_p
  gravity: number;        // m/s^2
  molarMass: number;      // mixture, kg/mol
  tropopauseBar: number;  // where the adiabat meets the skin temperature
  tempAt(pBar: number): number;
  levels: AtmosphereLevel[];   // surface -> MIN_ATM_BAR, log-spaced
}

/** Surface gravity (m/s^2); a mid value if the body is too sparsely defined to say. */
export function surfaceGravity(body: CelestialBody): number {
  const rM = (body.radiusKm ?? 0) * 1000;
  const m = (body as any).massKg ?? 0;
  if (!rM || !m) return 9.8;
  return Math.max(0.05, (GRAV_CONST * m) / (rM * rM));
}

/** Mole-weighted mixture molar mass (kg/mol). */
export function mixtureMolarMass(comp: Record<string, number>, pack?: RulePack | null): number {
  const gases = pack?.gasPhysics ?? {};
  let sum = 0, weight = 0;
  for (const [g, f] of Object.entries(comp)) {
    const m = gases[g]?.molarMass;
    if (!m || !(f > 0)) continue;
    sum += m * f; weight += f;
  }
  return weight > 0 ? sum / weight : 0.029;
}

/**
 * Adiabatic exponent K = R / c_p(molar) for the mixture. specificHeat is per-mass (kJ/kg/K in the
 * rule pack), so molar c_p = specificHeat * 1000 * molarMass. Clamped to the physical range for a
 * gas: 0.4 (monatomic) down to ~0.12 (a big floppy polyatomic).
 */
export function adiabaticIndex(comp: Record<string, number>, pack?: RulePack | null): number {
  const gases = pack?.gasPhysics ?? {};
  let cp = 0, weight = 0;
  for (const [g, f] of Object.entries(comp)) {
    const def = gases[g];
    if (!def?.molarMass || !def.specificHeat || !(f > 0)) continue;
    cp += def.specificHeat * 1000 * def.molarMass * f;
    weight += f;
  }
  if (weight <= 0 || cp <= 0) return 0.286;              // an air-like default
  return Math.max(0.12, Math.min(0.4, R_GAS / (cp / weight)));
}

/**
 * Radiative skin temperature: what the upper atmosphere settles at once convection has stopped.
 * Derived from the body's EQUILIBRIUM temperature — the greenhouse warms the surface, not the top
 * of the atmosphere, so the surface value is the wrong anchor for the top.
 */
export function skinTemperatureK(equilibriumK: number): number {
  return Math.max(3, equilibriumK / Math.pow(2, 0.25));
}

const LEVELS = 48;

/**
 * Build the profile. Returns null for a body with no meaningful atmosphere.
 * `comp` is the EFFECTIVE composition (reaction products folded in) so the exponent reflects what
 * is actually there.
 */
export function atmosphereProfile(
  body: CelestialBody,
  comp: Record<string, number>,
  pack?: RulePack | null
): AtmosphereProfile | null {
  const quotedBar = body.atmosphere?.pressure_bar ?? 0;
  if (!(quotedBar >= MIN_ATM_BAR)) return null;
  const tSurfK = body.temperatureK ?? body.equilibriumTempK ?? 0;
  if (!(tSurfK > 0)) return null;

  // A giant has no surface, so "its pressure" is whatever depth someone chose to quote — and data in
  // the wild quotes anything from 1 bar to 200000. The app's own convention is that a giant's
  // temperature is its reading at the ~1 bar reference level (see /physics#fudges), so the pressure
  // that temperature belongs to has to be that level too. Take the quoted figure as a floor-marker
  // rather than a literal anchor: pinning a 165 K reading at 200000 bar puts the entire visible
  // atmosphere at its coldest-sky temperature and grows Jupiter a methane deck it has never had.
  // Nothing below the reference level is modelled anyway — it is not visible.
  const pSurfBar = makeupFractions(body).gas > 0.5 ? Math.min(quotedBar, GIANT_REFERENCE_BAR) : quotedBar;

  const kappa = adiabaticIndex(comp, pack);
  // The skin sits on the EQUILIBRIUM temperature. A giant radiating its own internal heat has no
  // meaningful equilibrium value stored, so fall back to the surface reading rather than invent one.
  const tSkinK = Math.min(tSurfK, skinTemperatureK(body.equilibriumTempK ?? tSurfK));

  const tempAt = (pBar: number): number => {
    const p = Math.max(1e-12, Math.min(pSurfBar, pBar));
    return Math.max(tSkinK, tSurfK * Math.pow(p / pSurfBar, kappa));
  };

  // Where the adiabat meets the floor: T_surf (P/P_s)^K = T_skin.
  const tropopauseBar = tSkinK >= tSurfK
    ? pSurfBar
    : pSurfBar * Math.pow(tSkinK / tSurfK, 1 / kappa);

  const top = Math.min(pSurfBar, MIN_ATM_BAR);
  const levels: AtmosphereLevel[] = [];
  const lo = Math.log(top), hi = Math.log(pSurfBar);
  for (let i = 0; i < LEVELS; i++) {
    // Ordered SURFACE FIRST (descending pressure) so a scan finds the deepest crossing first.
    const pBar = Math.exp(hi - ((hi - lo) * i) / (LEVELS - 1));
    levels.push({ pBar, tempK: tempAt(pBar) });
  }

  return {
    pSurfBar, tSurfK, tSkinK, kappa,
    gravity: surfaceGravity(body),
    molarMass: mixtureMolarMass(comp, pack),
    tropopauseBar, tempAt, levels
  };
}
