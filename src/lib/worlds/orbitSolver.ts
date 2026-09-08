// FIT A WORLD TO A CONDITION: at what orbit does this star produce THAT? (G87.)
//
// Asked for by the owner, 2026-09-08, while the main-world placement was being built: "Are you
// working out a general solver for planets in general ranges - that is a useful feature that can be
// reused a lot. A 'fit to this' type option for human habitable... but also for alien habitats to
// control their spread. It is GENUINELY useful for authoring."
//
// So this is not part of the Traveller importer and does not import it. It answers one question, in
// several dialects: GIVEN A STAR, WHERE DOES A BODY SIT TO BE <this>? The main-world placement is its
// first caller; an authoring control is the obvious second.
//
// THE ONE PIECE OF PHYSICS, and every function here is a rearrangement of it:
//
//     T = Tstar * sqrt(Rstar / 2a) * (1 - A)^(1/4)
//
// the equilibrium temperature of a fast-rotating grey body. Solved for `a` it is exact, it needs no
// constants beyond the star's own radius and temperature, and it is checked against Earth in the
// spec: 5778 K, 696,340 km and a bond albedo of 0.3 give 1.000 AU.
//
// BECAUSE T FALLS AS 1/sqrt(a), A TEMPERATURE RANGE INVERTS INTO AN ORBIT RANGE. The HOTTEST
// temperature gives the INNERMOST orbit. Getting that backwards is the obvious mistake and it is
// gated.
//
// WHAT THIS DELIBERATELY DOES NOT DO: it does not add a greenhouse. That is derived from an
// atmosphere the body being placed does not have yet - and the owner's own note, same day: "you need
// an atmo before the goldilocks zone works".
//
// SO AN EQUILIBRIUM TEMPERATURE IS A FLOOR ON THE SURFACE TEMPERATURE, NEVER A CEILING: an
// atmosphere in this engine can only warm a world, never cool it. A caller fitting to a range of
// SURFACE temperatures should therefore aim at the range's LOW end and let the greenhouse carry the
// world up into it.
//
// HOW BIG THAT GAP IS DEPENDS ENTIRELY ON THE AIR, and both extremes were measured on real imports:
// a dense nitrogen-oxygen world gained 0.35 K, and a corrosive Venusian one gained about 650 K. The
// first is nothing; the second is most of the answer. A caller that needs to land inside a narrow
// surface range for a THICK atmosphere cannot get there in one pass, and should place, build the
// atmosphere, then re-fit - which is the ordering the owner's note is really about.
//
// AND NO EARTH BASELINE. There is no 288 K, no 1 AU and no "habitable zone" in this file. A human
// fit is one solvent's liquid range among twenty-two, reached through the same door as any other -
// which is the standing rule's own worked example: the honest answer is THE SOLVENT'S OWN LIQUID
// RANGE, and water is not privileged.
import type { CelestialBody, LiquidDef } from '$lib/types';

const AU_KM = 149597870.7;

/**
 * A nominal bond albedo, used only to fit a world that does not exist yet.
 *
 * Not an Earth constant in disguise: it is the middle of the range this engine's own `surface_albedo`
 * model produces for ordinary rock and ice. The orbit goes as sqrt(1 - A), so the fit is only
 * WEAKLY sensitive to it - across the 0.2 to 0.4 an ordinary rocky world actually spans, the answer
 * moves about 15 per cent, comfortably inside the width of any real target range. Across the whole
 * conceivable 0.1 to 0.6 it moves 50 per cent, which is NOT negligible, so a caller that knows the
 * body's albedo should pass it. (An earlier version of this note said 13 per cent for the wide span;
 * that was wrong, and the spec now pins the real figure.)
 */
export const NOMINAL_BOND_ALBEDO = 0.3;

/** No rocky body survives closer than this to its star, whatever it is being fitted to. */
export const MIN_ORBIT_STELLAR_RADII = 20;

export interface StarFit {
  temperatureK: number;
  radiusKm: number;
}

/** A star as this solver needs it, from a body or from bare figures. */
export const starFit = (star: Pick<CelestialBody, 'temperatureK' | 'radiusKm'>): StarFit | null =>
  star?.temperatureK && star?.radiusKm ? { temperatureK: star.temperatureK, radiusKm: star.radiusKm } : null;

/** The closest a body may be placed to this star, in AU. */
export const minimumOrbitAU = (star: StarFit) => (star.radiusKm * MIN_ORBIT_STELLAR_RADII) / AU_KM;

/**
 * THE ORBIT AT WHICH THIS STAR HEATS A BODY TO `targetK`. The primitive; everything else calls it.
 *
 * Returns null rather than a wrong number when the inputs cannot answer - a star with no temperature
 * or no radius, or a target of zero.
 */
export function orbitForTemperature(star: StarFit, targetK: number, bondAlbedo = NOMINAL_BOND_ALBEDO): number | null {
  if (!(star?.temperatureK > 0) || !(star?.radiusKm > 0) || !(targetK > 0)) return null;
  const a = Math.max(0, Math.min(0.95, bondAlbedo));
  const au = ((star.radiusKm / 2) * (star.temperatureK / targetK) ** 2 * Math.sqrt(1 - a)) / AU_KM;
  return Number.isFinite(au) && au > 0 ? au : null;
}

/** The temperature a body at this orbit reaches. The inverse, for checking a fit. */
export function temperatureAtOrbit(star: StarFit, orbitAU: number, bondAlbedo = NOMINAL_BOND_ALBEDO): number | null {
  if (!(star?.temperatureK > 0) || !(star?.radiusKm > 0) || !(orbitAU > 0)) return null;
  const a = Math.max(0, Math.min(0.95, bondAlbedo));
  const t = star.temperatureK * Math.sqrt(star.radiusKm / (2 * orbitAU * AU_KM)) * (1 - a) ** 0.25;
  return Number.isFinite(t) && t > 0 ? t : null;
}

export interface OrbitBand {
  /** Nearest the star - produced by the HOTTEST end of the target. */
  innerAU: number;
  /** Furthest out - produced by the COOLEST end. */
  outerAU: number;
}

/**
 * THE ORBIT BAND FOR A TEMPERATURE RANGE. Note the inversion: hot maps to inner.
 *
 * This is the "control their spread" half of the owner's ask - an authoring caller can place several
 * worlds anywhere inside the returned band and know every one of them meets the condition.
 */
export function orbitBandForTemperatures(
  star: StarFit, lowK: number, highK: number, bondAlbedo = NOMINAL_BOND_ALBEDO
): OrbitBand | null {
  const lo = Math.min(lowK, highK), hi = Math.max(lowK, highK);
  const innerAU = orbitForTemperature(star, hi, bondAlbedo);   // hottest -> closest
  const outerAU = orbitForTemperature(star, lo, bondAlbedo);   // coolest -> furthest
  if (innerAU == null || outerAU == null) return null;
  return { innerAU, outerAU };
}

/**
 * WHERE THIS SOLVENT IS LIQUID. The alien-habitat door, and the one the standing rules ask for by name.
 *
 * "A bio-compatible temperature band was nearly hardcoded, when three of the four biochemistries the
 * type already declares are not water-based - the honest answer is THE SOLVENT'S OWN liquid range."
 * Twenty-two solvents ship with a `meltK` and a `boilK`, so ammonia, methane and molten sulfur are
 * reached through exactly the same call as water, and none of them is the default.
 *
 * PRESSURE IS NOT MODELLED HERE and the boiling point moves with it - `physics/liquids.ts` owns that
 * question. This is the one-atmosphere band, which is what an authoring control wants for a first
 * placement; a caller that knows the pressure should narrow it afterwards.
 */
export function orbitBandForSolvent(star: StarFit, liquid: Pick<LiquidDef, 'meltK' | 'boilK'>, bondAlbedo = NOMINAL_BOND_ALBEDO): OrbitBand | null {
  if (!(liquid?.meltK > 0) || !(liquid?.boilK > 0)) return null;
  return orbitBandForTemperatures(star, liquid.meltK, liquid.boilK, bondAlbedo);
}

/** What a fit was asked for, so a caller can say WHY a world sits where it does. */
export type OrbitTarget =
  | { kind: 'temperature'; targetK: number; label?: string }
  | { kind: 'temperature-range'; lowK: number; highK: number; label?: string }
  | { kind: 'solvent'; liquid: Pick<LiquidDef, 'meltK' | 'boilK'> & { label?: string; name?: string } };

export interface OrbitFit {
  /** The orbit to use - the middle of the band, or the single solution. */
  orbitAU: number;
  band: OrbitBand;
  /** The temperature that orbit actually produces, so a caller can check its own work. */
  temperatureK: number;
  /** True when the answer was pushed out to the physical floor rather than freely solved. */
  clampedToFloor: boolean;
  /** Plain words: what it was fitted to, and where that put it. */
  reason: string;
}

/**
 * FIT A WORLD TO A CONDITION. One call, whichever dialect the caller speaks.
 *
 * The orbit returned is the GEOMETRIC middle of the band, not the arithmetic one, because the
 * relationship is a power law: the geometric middle of [inner, outer] is the orbit whose temperature
 * is the geometric middle of the two temperatures, which is what "the middle of this range" means
 * when the quantity goes as 1/sqrt(a).
 */
export function fitOrbit(star: StarFit, target: OrbitTarget, bondAlbedo = NOMINAL_BOND_ALBEDO): OrbitFit | null {
  let band: OrbitBand | null = null;
  let what = '';
  if (target.kind === 'temperature') {
    const a = orbitForTemperature(star, target.targetK, bondAlbedo);
    if (a == null) return null;
    band = { innerAU: a, outerAU: a };
    what = target.label ?? `about ${Math.round(target.targetK)} K`;
  } else if (target.kind === 'temperature-range') {
    band = orbitBandForTemperatures(star, target.lowK, target.highK, bondAlbedo);
    what = target.label ?? `between ${Math.round(Math.min(target.lowK, target.highK))} and ${Math.round(Math.max(target.lowK, target.highK))} K`;
  } else {
    band = orbitBandForSolvent(star, target.liquid, bondAlbedo);
    const name = target.liquid.label ?? target.liquid.name ?? 'that solvent';
    what = `liquid ${name}`;
  }
  if (!band) return null;

  const floor = minimumOrbitAU(star);
  const middle = Math.sqrt(band.innerAU * band.outerAU);
  const clampedToFloor = middle < floor;
  const orbitAU = Math.max(middle, floor);
  const temperatureK = temperatureAtOrbit(star, orbitAU, bondAlbedo) ?? 0;
  return {
    orbitAU,
    band,
    temperatureK,
    clampedToFloor,
    reason: clampedToFloor
      ? `Fitted for ${what}, which would put it closer to the star than anything survives; held at ${orbitAU.toFixed(4)} AU, where it reaches about ${Math.round(temperatureK)} K instead.`
      : `Fitted for ${what}: ${orbitAU.toFixed(4)} AU, where this star heats it to about ${Math.round(temperatureK)} K.`
  };
}
