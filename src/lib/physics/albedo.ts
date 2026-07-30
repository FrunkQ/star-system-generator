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

// Surface reflectivity by makeup component.
const SURF_ALBEDO = { metal: 0.18, rock: 0.15, carbon: 0.05, ice: 0.62, gas: 0.30 };
const OCEAN_ALBEDO = 0.06;   // any standing liquid: light goes in and mostly does not come back
const FROST_ALBEDO = 0.62;   // a frozen surface volatile
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
function giantBaseAlbedo(teqK: number): number {
  if (teqK <= 1000) return SURF_ALBEDO.gas;
  if (teqK >= 1500) return 0.06;
  return SURF_ALBEDO.gas + ((teqK - 1000) / 500) * (0.06 - SURF_ALBEDO.gas);
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
  pack?: RulePack | null
): AlbedoBreakdown {
  // F-OVR: a GM-pinned albedo (body.overrides.albedo) wins and is fed straight into the temperature
  // solve; the legacy body.albedo is honoured too. Otherwise the albedo is derived below.
  const pinned = body.overrides?.albedo ?? (typeof body.albedo === 'number' ? body.albedo : undefined);
  if (typeof pinned === 'number' && pinned >= 0 && pinned <= 1) {
    return { albedo: pinned, surfaceAlbedo: pinned, cloudAlbedo: 0, cloudCover: 0, note: 'Manually set (GM override).' };
  }
  const mk = makeupFractions(body);
  const isGiant = mk.gas > 0.5;

  // --- What sits UNDER the clouds. -------------------------------------------------------------
  // A giant has no surface, so the decks are composited over its deep atmosphere instead.
  let surf: number;
  if (isGiant) {
    surf = giantBaseAlbedo(teqK);
  } else {
    surf = mk.metal * SURF_ALBEDO.metal + mk.rock * SURF_ALBEDO.rock + mk.carbon * SURF_ALBEDO.carbon
      + mk.ice * SURF_ALBEDO.ice + mk.gas * SURF_ALBEDO.gas;
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
      if (phase === 'liquid') surf = surf * (1 - hydroCov) + OCEAN_ALBEDO * hydroCov;
      else if (phase === 'solid') surf = surf * (1 - hydroCov) + FROST_ALBEDO * hydroCov;
      // gas / supercritical: nothing is standing on the surface, so the bare ground shows.
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
  const where = isGiant ? 'deep atmosphere' : surf < 0.1 ? 'dark surface' : surf > 0.4 ? 'bright surface' : 'mid-tone surface';
  return {
    albedo: +clamp(albedo, 0.02, 0.95).toFixed(3),
    surfaceAlbedo: +surf.toFixed(3),
    cloudAlbedo: +topAlbedo.toFixed(3),
    cloudCover: +(top?.coverage ?? 0).toFixed(2),
    cloudSpecies: top?.species,
    note: top
      ? `${speciesLabel(top.species, pack)} cloud deck over a ${where}${decks.length > 1 ? ` (${decks.length} decks)` : ''}.`
      : isGiant ? 'Cloud-free giant.' : 'Cloud-free surface.'
  };
}
