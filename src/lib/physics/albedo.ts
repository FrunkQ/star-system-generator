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
const FROST_ALBEDO_DEFAULT = 0.62;   // a volatile DEPOSIT condensing out of the air now — Io's SO2
const DUST_ALBEDO_DEFAULT = 0.35;    // wind-laid oxide fines — what makes Mars orange and bright
const OXIDISED_COVERAGE_DEFAULT: Record<string, number> = { light: 0.3, moderate: 0.6, heavy: 0.85 };
const FROST_RAMP_K_DEFAULT = 30;
// ICE DARKENS WITH AGE, AND THAT IS THE WHOLE OF INBOX B68 (2026-08-17).
//
// A single constant stood for every frozen surface, so Enceladus — the brightest body in the solar
// system at 0.81 — and Callisto, one of the darkest at 0.11, came out at the same 0.62. A 5.6x error
// on one of them, and the two are not a special case: they are the two ENDS of one process.
//
// FRESH ICE IS BRIGHT AND OLD ICE IS FILTHY. What darkens it is a non-ice LAG that builds up on the
// surface — micrometeoritic infall and radiolytic processing — and what resets it is resurfacing.
// So the surface is clean ice mixed with dark lag, and the mixing fraction is how long that surface
// has sat there: exactly the shape the ROCKY branch already uses for oxide dust, asked of a
// different material. The surface age is the same figure `deriveOxidation` grades rust on, computed
// once inside the solve, so this adds NO new coupling to the fixed point (see B5's bistability note
// in the header) — it is one more reader of an input that is already there.
// CLEAN ICE IS NOT THE SAME NUMBER AS A VOLATILE FROST DEPOSIT, and conflating them was the first
// thing this change got wrong. `frost` above is a coating condensing out of the atmosphere NOW —
// thin, patchy, over whatever the ground is — and 0.62 is what Io measures with it. `ice_clean` is a
// SLAB: a shell of solid solvent that IS the surface. Fresh snow and glacier ice sit near 0.9, and
// Enceladus at 0.81 is the brightest body in the solar system because its plumes keep laying more of
// it down. Two states of one material, and only the slab can grow old.
const ICE_CLEAN_ALBEDO_DEFAULT = 0.90;   // pack: surface_albedo.ice_clean
const ICE_LAG_ALBEDO_DEFAULT = 0.09;     // pack: surface_albedo.ice_lag - dark carbonaceous residue
const ICE_LAG_HALF_AGE_GYR_DEFAULT = 0.22; // pack: surface_albedo.ice_lag_half_age_Gyr

interface SurfaceAlbedoConstants {
  metal: number; rock: number; carbon: number; ice: number; gas: number;
  ocean: number; frost: number; dust: number;
  oxidisedCoverage: Record<string, number>;
  frostRampK: number;
  iceClean: number; iceLag: number; iceLagHalfAgeGyr: number;
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
    frostRampK: d.volatile_frost_ramp_K ?? FROST_RAMP_K_DEFAULT,
    iceClean: d.ice_clean ?? ICE_CLEAN_ALBEDO_DEFAULT,
    iceLag: d.ice_lag ?? ICE_LAG_ALBEDO_DEFAULT,
    iceLagHalfAgeGyr: d.ice_lag_half_age_Gyr ?? ICE_LAG_HALF_AGE_GYR_DEFAULT
  };
}
// What a deck of an unlisted condensate reflects. Only reached for a liquid with no cloudAlbedo in
// the rule pack (a user-added substance); everything bundled carries a value.
const DEFAULT_CLOUD_ALBEDO = 0.45;

export interface AlbedoBreakdown {
  albedo: number;
  surfaceAlbedo: number;
  // The ground BEFORE anything settled on it — makeup alone. Kept separate from surfaceAlbedo so
  // the Newton trace can show the working rather than a single finished number: bare rock is dark,
  // and what makes a world bright is the deposit on top of it (B5). Mars is 0.105 bare and 0.252
  // once its oxide dust is counted, and those two numbers are the whole explanation.
  bareAlbedo: number;
  // What is lying on the ground, if anything — 'moderate oxide dust', 'Sulphur Dioxide frost'.
  deposit?: string;
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
 * How bright a FROZEN surface is, given how long it has been sitting there.
 *
 * Clean ice at one end, a dark non-ice lag at the other, and the surface age says how far along it
 * is. Saturating rather than linear, because the lag builds fastest on a fresh surface and then has
 * less and less clean ice left to cover: `age / (age + halfAge)`.
 *
 * MEASURED against the five frozen-surface anchors and fitted to none of them individually — the
 * half-age is set so a freshly resurfaced world lands near 0.75 and an ancient one near 0.13:
 *
 *     Europa      0.05 Gyr   0.75   measured 0.68
 *     Triton      0.05 Gyr   0.75   measured 0.76
 *     Enceladus   0.05 Gyr   0.75   measured 0.81
 *     Callisto    4.6  Gyr   0.13   measured 0.11
 *     Ganymede    4.6  Gyr   0.13   measured 0.35   <- THE RESIDUAL, and it is a DATA gap
 *
 * GANYMEDE IS THE ONE THIS CANNOT REACH, AND IT IS WORTH SAYING WHY RATHER THAN BENDING THE CURVE:
 * about 60% of its surface is bright grooved terrain resurfaced roughly two billion years ago and
 * the rest is ancient dark terrain, so its true answer is a MIXTURE of two ages. The engine carries
 * one surface age per body, which puts Ganymede and Callisto at the same 4.6 Gyr — and the same
 * output. Fitting the curve to split them would need a lever that is not there, and would move every
 * other frozen world to do it. The gap is a terrain-mix datum, not a wrong law.
 */
export function frozenSurfaceAlbedo(surfaceAgeGyr: number | null | undefined, K: { iceClean: number; iceLag: number; iceLagHalfAgeGyr: number }): number {
  const age = Math.max(0, surfaceAgeGyr ?? 0);
  const half = Math.max(1e-6, K.iceLagHalfAgeGyr);
  const lag = age / (age + half);
  return K.iceClean - lag * (K.iceClean - K.iceLag);
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
  oxidation?: string | null,
  // How long this body's visible surface has been exposed, from the SAME evaluation the rust grade
  // above comes from (`surfaceAgeOnProbe`, inside the solve). Ice darkens with it (B68), so this
  // adds a second reader of an input already in the loop rather than a new coupling. Absent →
  // treated as freshly resurfaced, which is the reading that states least: a caller that has not
  // evaluated geology has not established that anything has had time to accumulate.
  surfaceAgeGyr?: number | null
): AlbedoBreakdown {
  // F-OVR: a GM-pinned albedo (body.overrides.albedo) wins and is fed straight into the temperature
  // solve; the legacy body.albedo is honoured too. Otherwise the albedo is derived below.
  //
  // G37 REMOVED THE [0, 1] GATE, and that gate was the whole of what blocked a negative albedo. A
  // figure outside the physical range is now honoured rather than silently ignored — below zero the
  // world returns MORE energy than its star delivers (energy amplification: `1 − A` exceeds one, and
  // the equilibrium formula carries it straight through), at or above one it absorbs nothing at all.
  // Neither is refused and neither is clamped; the roster bounds what a GM can type, the row says
  // what is wrong with it, and the physics does what the number tells it. The one guard that stays
  // is finiteness, because NaN is not a claim about a world.
  const pinned = body.overrides?.albedo ?? (typeof body.albedo === 'number' ? body.albedo : undefined);
  if (typeof pinned === 'number' && Number.isFinite(pinned)) {
    const note = pinned < 0
      ? 'Manually set (GM override) — NEGATIVE: this surface returns more energy than the star delivers to it.'
      : pinned >= 1
        ? 'Manually set (GM override) — a perfect mirror: no starlight is absorbed at all.'
        : 'Manually set (GM override).';
    return { albedo: pinned, surfaceAlbedo: pinned, bareAlbedo: pinned, cloudAlbedo: 0, cloudCover: 0, note };
  }
  const K = surfaceConstants(pack);
  const mk = makeupFractions(body);
  const isGiant = mk.gas > 0.5;
  // What is lying ON the ground, if anything — named so the Newton trace can say WHY a dark rock
  // reads bright, rather than leaving the reader to wonder where 0.57 came from on a basalt moon.
  let deposit: string | null = null;
  let bare = 0;   // surface albedo BEFORE deposits — the trace shows both (B5)
  let icyLagged = false;   // a frozen surface old enough to have gone dirty, for the note

  // --- What sits UNDER the clouds. -------------------------------------------------------------
  // A giant has no surface, so the decks are composited over its deep atmosphere instead.
  let surf: number;
  if (isGiant) {
    surf = giantBaseAlbedo(teqK, K.gas);
    bare = surf;
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
      // A PERMANENT ICE SHELL AGES (B68). This is the one frost that has been lying there since the
      // surface was last renewed, so it carries a lag; the atmospheric frost below is condensing NOW
      // and is clean by definition. Same constant, two different states of the same material.
      else if (phase === 'solid') {
        const frozen = frozenSurfaceAlbedo(surfaceAgeGyr, K);
        surf = surf * (1 - hydroCov) + frozen * hydroCov;
        icyLagged = frozen < K.iceClean - 0.02;
      }
      // gas / supercritical: nothing is standing on the surface, so the bare ground shows.
    }

    bare = surf;   // the ground as its makeup and hydrosphere leave it, before any deposit
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
      // A FROST CANNOT DARKEN GROUND THAT IS ALREADY BRIGHTER THAN IT (B68). This constant is a
      // coating over rock — Io's sulphur dioxide on dark volcanics is what calibrates it — and
      // applying it to a clean ice SLAB had Enceladus's own plume-fall dimming Enceladus, which is
      // absurd on its face: the falling material and the surface are the same substance. Where the
      // ground is darker the coating brightens it, as before; where it is brighter, laying more of
      // the same down changes nothing.
      if (frostCov > 0.01 && K.frost > surf) {
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
    : icyLagged ? 'weathered ice'
    : surf < 0.1 ? 'dark surface' : surf > 0.4 ? 'bright surface' : 'mid-tone surface';
  return {
    albedo: +clamp(albedo, 0.02, 0.95).toFixed(3),
    surfaceAlbedo: +surf.toFixed(3),
    bareAlbedo: +bare.toFixed(3),
    ...(deposit ? { deposit } : {}),
    cloudAlbedo: +topAlbedo.toFixed(3),
    cloudCover: +(top?.coverage ?? 0).toFixed(2),
    cloudSpecies: top?.species,
    note: top
      ? `${speciesLabel(top.species, pack)} cloud deck over a ${where}${decks.length > 1 ? ` (${decks.length} decks)` : ''}.`
      : isGiant ? 'Cloud-free giant.'
        : deposit ? `Cloud-free ${deposit} over bare ground.`
          : icyLagged ? 'Cloud-free ice, darkened by the lag of an old surface.'
            : 'Cloud-free surface.'
  };
}
