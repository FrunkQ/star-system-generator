// Bond albedo, DERIVED from what the world is made of and what is floating above it: the surface
// (makeup → rock/ice/ocean reflectivity) seen through the CLOUD DECKS the atmosphere actually
// condenses. This module does NOT decide which clouds a body has — physics/cloudDecks.ts is the
// single evaluation of that (docs/dev/cloud-decks-design.md), and this reads its answer. It used to
// carry its own boiling-point table and its own "is it cool enough to condense?" test, which put two
// disagreeing cloud models on the same body: Venus's deck read as CO₂ here and sulphuric acid there,
// and a hot 8-bar CO₂ super-Earth grew a cloud deck out of nothing but a 1.6× fudge on a boiling
// point. What is left here is only OPTICS: how bright each layer is, and how they stack.
//
// Cloud reflectivity per condensate is rule-pack DATA (a liquid's `cloudAlbedo`), not a table in
// this file — the physics→tags→visuals rule in docs/dev/architecture-physics-tags-visuals.md.
//
// Albedo couples back into temperature (a brighter world is colder, and a colder world condenses
// different clouds), so this function is one evaluation inside the fixed point solved by
// solveThermalState() in physics/temperature.ts — not a standalone answer.
import type { CelestialBody, RulePack } from '$lib/types';
import { makeupFractions } from './makeup';
import { phaseAtP, liquidDef } from './liquids';
import type { CloudDeck } from './cloudDecks';

// Surface reflectivity, as rule-pack DATA (`surface_albedo` in planets.json) — the
// constants-in-data rule. These are the fallbacks for a pack that does not carry the block.
//
// BARE ROCK IS DARK, AND METAL IS DARKER THAN ROCK (inbox B5). A flat 0.15 for every world was too
// bright for bare ground on both anchors that measure it — Mercury 0.088, Luna 0.11 — and far too
// dark for a world carrying surface DEPOSITS, Mars at 0.25 and Io at 0.63. The measurements point
// three ways at once, so brightness comes from the deposits rather than from the rock: a
// space-weathered iron regolith is one of the darkest natural surfaces there is, which is exactly
// why Mercury, at 62% metal, is the darkest rocky body in the Solar System.
const SURF_ALBEDO_DEFAULT = { metal: 0.075, rock: 0.11, carbon: 0.05, ice: 0.62, gas: 0.30 };
const OCEAN_ALBEDO_DEFAULT = 0.06;   // any standing liquid: light goes in and mostly does not come back
const FROST_ALBEDO_DEFAULT = 0.62;   // a frozen surface volatile, whatever the species
const DUST_ALBEDO_DEFAULT = 0.35;    // wind-laid oxide fines — what makes Mars orange and bright
const OXIDISED_COVERAGE_DEFAULT: Record<string, number> = { light: 0.3, moderate: 0.6, heavy: 0.85 };
const FROST_RAMP_K_DEFAULT = 30;

interface SurfaceAlbedoConstants {
  metal: number; rock: number; carbon: number; ice: number; gas: number;
  ocean: number; frost: number; dust: number;
  oxidisedCoverage: Record<string, number>;
  frostRampK: number;
}
function surfaceConstants(pack?: RulePack | null): SurfaceAlbedoConstants {
  const d = (pack as any)?.surface_albedo ?? {};
  return {
    metal: d.metal ?? SURF_ALBEDO_DEFAULT.metal,
    rock: d.rock ?? SURF_ALBEDO_DEFAULT.rock,
    carbon: d.carbon ?? SURF_ALBEDO_DEFAULT.carbon,
    ice: d.ice ?? SURF_ALBEDO_DEFAULT.ice,
    gas: d.gas ?? SURF_ALBEDO_DEFAULT.gas,
    ocean: d.ocean ?? OCEAN_ALBEDO_DEFAULT,
    frost: d.frost ?? FROST_ALBEDO_DEFAULT,
    dust: d.dust ?? DUST_ALBEDO_DEFAULT,
    oxidisedCoverage: d.oxidised_coverage ?? OXIDISED_COVERAGE_DEFAULT,
    frostRampK: d.volatile_frost_ramp_K ?? FROST_RAMP_K_DEFAULT
  };
}
// What a deck of an unlisted condensate reflects. Only reached for a liquid with no cloudAlbedo in
// the rule pack (a user-added substance); everything bundled carries a value.
const DEFAULT_CLOUD_ALBEDO = 0.45;

export interface AlbedoBreakdown {
  albedo: number;
  surfaceAlbedo: number;
  cloudAlbedo: number;      // reflectivity of the TOP deck (0 when there are none)
  cloudCover: number;       // 0..1, sky coverage of the top deck
  cloudSpecies?: string;    // the top deck's condensate — the same species name the deck tags carry
  note: string;
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

/** Human-readable name for a condensate: the rule pack's label, minus its formula. */
function speciesLabel(species: string, pack?: RulePack | null): string {
  const label = liquidDef(species, pack)?.label;
  return label ? label.replace(/\s*\(.*\)\s*$/, '') : species.replace(/-/g, ' ');
}

/**
 * The deep atmosphere a giant's decks sit on top of — its "surface" for optical purposes. A cool
 * giant's clear air is a deep Rayleigh scatterer and reads bright (this is most of Uranus's and
 * Neptune's albedo between their methane decks). Hot enough and it stops being clear: alkali metals
 * and metal oxides go into the gas phase and absorb, which is why the hot Jupiters are among the
 * darkest objects measured — a few per cent, darker than coal.
 */
function giantBaseAlbedo(teqK: number, gasAlbedo: number): number {
  if (teqK <= 1000) return gasAlbedo;
  if (teqK >= 1500) return 0.06;
  return gasAlbedo + ((teqK - 1000) / 500) * (0.06 - gasAlbedo);
}

/**
 * Bond albedo of a body with the cloud decks it has been found to carry.
 *
 * `decks` comes from deriveCloudDecks() — deepest-first, which is the order they are composited in.
 * Pass an empty array for a body whose atmosphere condenses nothing; that is a real answer, not a
 * missing one.
 */
export function deriveAlbedo(
  body: CelestialBody,
  teqK: number,
  decks: CloudDeck[] = [],
  pack?: RulePack | null,
  // The rust grade from deriveOxidation, when the caller has one. Passed IN rather than derived
  // here, because grading it needs the surface age, which needs geology, which needs this pass's
  // temperature — so the single place that can answer it is inside the thermal solve, which is
  // where the only production caller lives (solveThermalState). Absent → bare ground, which is the
  // honest default for a caller that has not evaluated geology.
  oxidation?: string | null
): AlbedoBreakdown {
  // F-OVR: a GM-pinned albedo (body.overrides.albedo) wins and is fed straight into the temperature
  // solve; the legacy body.albedo is honoured too. Otherwise the albedo is derived below.
  const pinned = body.overrides?.albedo ?? (typeof body.albedo === 'number' ? body.albedo : undefined);
  if (typeof pinned === 'number' && pinned >= 0 && pinned <= 1) {
    return { albedo: pinned, surfaceAlbedo: pinned, cloudAlbedo: 0, cloudCover: 0, note: 'Manually set (GM override).' };
  }
  const K = surfaceConstants(pack);
  const mk = makeupFractions(body);
  const isGiant = mk.gas > 0.5;
  // What is lying ON the ground, if anything — named so the Newton trace can say WHY a dark rock
  // reads bright, rather than leaving the reader to wonder where 0.57 came from on a basalt moon.
  let deposit: string | null = null;

  // --- What sits UNDER the clouds. -------------------------------------------------------------
  // A giant has no surface, so the decks are composited over its deep atmosphere instead.
  let surf: number;
  if (isGiant) {
    surf = giantBaseAlbedo(teqK, K.gas);
  } else {
    surf = mk.metal * K.metal + mk.rock * K.rock + mk.carbon * K.carbon
      + mk.ice * K.ice + mk.gas * K.gas;
    // A hydrosphere replaces that over the fraction it covers — dark where it is liquid, bright
    // where it has frozen. Which of those it is comes from the SOLVENT'S OWN phase at the surface
    // temperature and pressure (the same phaseAtP every other subsystem classifies on), not from a
    // water-shaped guess. The old test compared the EQUILIBRIUM temperature against a hand-picked
    // 230 K to avoid snowballing a greenhouse world; the surface temperature answers that honestly,
    // and it works for a methane sea or a nitrogen frost too.
    const hydroComp = body.hydrosphere?.composition;
    const hydroCov = body.hydrosphere?.coverage ?? 0;
    if (hydroComp && hydroComp !== 'none' && hydroCov > 0.05) {
      const surfT = body.temperatureK ?? body.equilibriumTempK ?? teqK;
      const phase = phaseAtP(hydroComp, surfT, body.atmosphere?.pressure_bar, pack);
      if (phase === 'liquid') surf = surf * (1 - hydroCov) + K.ocean * hydroCov;
      else if (phase === 'solid') surf = surf * (1 - hydroCov) + K.frost * hydroCov;
      // gas / supercritical: nothing is standing on the surface, so the bare ground shows.
    }

    // --- OXIDE DUST (B5). Wind-laid ferric fines over the bare ground. The grade is
    // deriveOxidation's, which already reads the iron fraction, the oxidising power of the air and
    // how long the surface has sat there — nothing new is being invented, it is being LOOKED AT.
    // This is what takes Mars from bare rock at 0.105 to its measured 0.25, and it is why Mars
    // brightens without any frost: at ~210 K its CO2 is well above its own 195 K freezing point.
    const dustCov = oxidation ? (K.oxidisedCoverage[oxidation] ?? 0) : 0;
    if (dustCov > 0) { surf = surf * (1 - dustCov) + K.dust * dustCov; deposit = `${oxidation} oxide dust`; }

    // --- VOLATILE FROST (B5). If the atmosphere's dominant gas is BELOW ITS OWN FREEZING POINT at
    // the surface, it is not really an atmosphere any more — it is lying on the ground. Io's SO2
    // (melts at 198 K, surface at 117) is the extreme case and the reason Io measures 0.63; Triton's
    // nitrogen is the same story. Deliberately general rather than an Io branch: the melt point is
    // the gas's own, from the rule pack, so Mars's CO2 correctly does NOT frost out globally and
    // Earth's nitrogen never comes close.
    const main = body.atmosphere?.main;
    const meltK = main ? (pack as any)?.gasPhysics?.[main]?.meltK : undefined;
    if (main && typeof meltK === 'number') {
      const surfT = body.temperatureK ?? body.equilibriumTempK ?? teqK;
      const share = body.atmosphere?.composition?.[main] ?? 0;
      const frostCov = clamp((meltK - surfT) / K.frostRampK, 0, 1) * share;
      if (frostCov > 0.01) {
        surf = surf * (1 - frostCov) + K.frost * frostCov;
        deposit = `${speciesLabel(main, pack)} frost`;
      }
    }
  }

  // --- Then look down through the decks. -------------------------------------------------------
  // Each deck reflects its own share of what reaches it and passes the rest to the layer below.
  // Composited bottom-up (decks arrive deepest-first), so the top deck has the last and largest say
  // — which is why Jupiter's bright ammonia veil, not the brown hydrosulphide beneath it, sets what
  // Jupiter reflects. Light bouncing back UP between layers is ignored: it is a small correction and
  // there is nothing here that would justify the precision.
  let albedo = surf;
  for (const deck of decks) {
    const a = liquidDef(deck.species, pack)?.cloudAlbedo ?? DEFAULT_CLOUD_ALBEDO;
    const cov = clamp(deck.coverage, 0, 1);
    albedo = a * cov + albedo * (1 - cov);
  }

  const top = decks.length ? decks[decks.length - 1] : undefined;
  const topAlbedo = top ? (liquidDef(top.species, pack)?.cloudAlbedo ?? DEFAULT_CLOUD_ALBEDO) : 0;
  const where = isGiant ? 'deep atmosphere'
    : deposit ? `surface under ${deposit}`
    : surf < 0.1 ? 'dark surface' : surf > 0.4 ? 'bright surface' : 'mid-tone surface';
  return {
    albedo: +clamp(albedo, 0.02, 0.95).toFixed(3),
    surfaceAlbedo: +surf.toFixed(3),
    cloudAlbedo: +topAlbedo.toFixed(3),
    cloudCover: +(top?.coverage ?? 0).toFixed(2),
    cloudSpecies: top?.species,
    note: top
      ? `${speciesLabel(top.species, pack)} cloud deck over a ${where}${decks.length > 1 ? ` (${decks.length} decks)` : ''}.`
      : isGiant ? 'Cloud-free giant.'
        : deposit ? `Cloud-free ${deposit} over bare ground.`
          : 'Cloud-free surface.'
  };
}
