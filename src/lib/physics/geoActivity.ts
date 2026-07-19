// Geological activity: tectonic regime + volcanism, by MECHANISM (proposal — the biosphere
// keystone). "Volcanic" is not one thing — Earth, Venus and Io are active for mechanically
// different reasons, with opposite consequences for life:
//
//   Earth  → radiogenic heat + surface water → MOBILE LID (plate tectonics) → carbonate–silicate
//            cycle regulates climate → the engine of long-term habitability.
//   Venus  → same heat but DRY → STAGNANT LID → heat builds → episodic catastrophic resurfacing
//            → no CO2 drawdown → runaway greenhouse.
//   Io     → TIDAL flux ≫ radiogenic → silicate volcanism.
//   Europa → icy mantle + subsurface ocean + modest heat → CRYOVOLCANISM (water "lava").
//   Mars   → small + OLD → radiogenics decayed below the convection threshold → INACTIVE.
//
// AGE is the knob that turns Earth into Mars: radiogenic heat decays (~halving every few Gyr) and
// small bodies cool fastest (low thermal mass per surface area).

export type TectonicRegime =
  | 'plate-tectonics' | 'stagnant-lid' | 'episodic' | 'plutonic'
  | 'tidal-volcanic' | 'cryovolcanic' | 'inactive';
export type VolcanismStyle = 'arc-effusive' | 'resurfacing' | 'intrusive' | 'silicate-tidal' | 'cryo' | 'none';

export interface GeoActivity {
  regime: TectonicRegime;
  volcanism: VolcanismStyle;
  vigor: number;            // relative geothermal vigor (Earth today ≈ 1)
  active: boolean;
  driver: string;           // short human label of the dominant heat source
  tags: string[];
  notes: string[];
}

export interface GeoInputs {
  makeup: { metal: number; rock: number; carbon: number; ice: number; gas: number };
  massMe: number;           // mass, Earth masses
  radiusRe: number;         // radius, Earth radii
  ageGyr: number;           // system age
  hasSurfaceWater: boolean; // liquid water (or water-family) ocean at the surface
  hasSubsurfaceOcean: boolean;
  icyShell?: boolean;       // a water/ice-rich exterior (frozen ocean or ice mantle) — Europa's
                            // density can infer as rock, so this carries the ice signal explicitly
  tidalHotspots: boolean;   // tidal forcing above the hotspot onset
  tidalLavaFlows: boolean;  // tidal forcing reaching silicate melt
  resonanceTidal?: boolean; // a mean-motion resonance pumps the eccentricity (sustained forcing the
                            // instantaneous tidal index under-predicts — Enceladus–Dione 2:1)
  surfaceIce?: boolean;     // an ice-covered surface (hydrosphere present, frozen or liquid below)
  teqK?: number;            // equilibrium temperature — drives the solar-seasonal geyser branch
  radiogenicOverrideK?: number; // GM radiogenic-heat override (+K) — adds to the geothermal vigor
}

const ACTIVE_THRESHOLD = 0.35;   // relative vigor below which a rocky world is geologically dead
// The dry radiogenic path is a graded LADDER on the same vigor: dead → plutonic (melt at depth only)
// → stagnant lid → episodic (heat-trapping lid that overturns catastrophically, Venus). Calibrated so
// Mars/Moon/Mercury (~0.1–0.14) read inactive, a waning/mid world (0.35–0.6) plutonic, and Venus
// (~0.82) episodic; a cooler dry world between sits on the quiet stagnant lid. See docs/dev/geo-foundations.md.
const PLUTONIC_MAX = 0.6;        // below this (but active): intrusive-only, no surface volcanism
const EPISODIC_ONSET = 0.7;      // dry + at/above this: catastrophic periodic resurfacing (Venus)
const RADIOGENIC_HALFLIFE_GYR = 2.8;
// How much a GM radiogenic-heat override (in K) adds to the relative vigor: ~12 K ≈ +1 (Earth-now),
// so a modest slider can wake a dead world and cranking it hard drives vigorous tectonics/volcanism.
const RADIOGENIC_K_PER_VIGOR = 12;

// Relative radiogenic+secular geothermal vigor, calibrated so Earth today ≈ 1.
export function geothermalVigor(i: Pick<GeoInputs, 'makeup' | 'massMe' | 'radiusRe' | 'ageGyr'>): number {
  const rockyMass = (i.makeup.metal + i.makeup.rock + i.makeup.carbon) * i.massMe;
  if (rockyMass <= 0 || i.radiusRe <= 0) return 0;
  const age = Math.max(0.1, Math.min(13, i.ageGyr));
  const ageDecay = Math.pow(2, -(age - 4.5) / RADIOGENIC_HALFLIFE_GYR);   // Earth-now = 1
  const radiogenicFlux = (rockyMass * ageDecay) / (i.radiusRe * i.radiusRe); // per unit area
  const coolingRetention = Math.max(0.05, Math.min(1.4, Math.pow(i.massMe, 0.45))); // small → cools fast
  return radiogenicFlux * coolingRetention;
}

export function deriveGeoActivity(i: GeoInputs): GeoActivity {
  const iceFrac = i.makeup.ice;
  const carbonRich = i.makeup.carbon > 0.3;
  // A GM radiogenic-heat override adds directly to the derived vigor (extra internal heat = more
  // geological drive), so the Temperature-tab slider actually changes the geology regime + tag.
  const vigor = geothermalVigor(i) + Math.max(0, i.radiogenicOverrideK ?? 0) / RADIOGENIC_K_PER_VIGOR;
  const notes: string[] = [];

  // A body must be large enough to differentiate (the ~200 km icy "round" limit, ~Mimas) before tidal
  // or resonance forcing can drive VOLCANISM — melt needs a differentiated, pressure-bearing interior.
  // Below it, a tidally-stressed lump (Phobos/Deimos) is shredded, not warmed to erupt; it stays on the
  // radiogenic path below (→ inactive for a small cold body). MIN_ROUND_RE ≈ 200/6371 Earth radii.
  const MIN_ROUND_RE = 200 / 6371;
  const differentiated = i.radiusRe >= MIN_ROUND_RE;

  // --- Tidal forcing takes precedence (it dwarfs radiogenic heat for the moons that have it). ---
  if (differentiated && (i.tidalHotspots || i.tidalLavaFlows)) {
    if (iceFrac > 0.3 || i.hasSubsurfaceOcean || i.icyShell) {
      notes.push('Tidal flexing keeps a subsurface ocean liquid; cryovolcanic plumes vent water/ice (Europa/Enceladus-like).');
      return mk('cryovolcanic', 'cryo', vigor, 'tidal flexing (icy)', ['geology/cryovolcanic'], notes);
    }
    notes.push('Tidal flexing drives silicate volcanism far exceeding radiogenic heat (Io-like).');
    return mk('tidal-volcanic', 'silicate-tidal', vigor, 'tidal flexing', ['geology/volcanic-tidal'], notes);
  }

  // --- Resonance-pumped cryovolcanism (Enceladus). A mean-motion resonance keeps pumping the
  //     eccentricity, so even forcing far below the SILICATE melt threshold (~1000 K) sustains
  //     activity in ICE, which melts at ~273 K. Gated on an explicit water signal (ocean / icy
  //     shell / ice-covered surface) so resonant-but-dry moons (Mimas-like) stay quiet. ---
  if (differentiated && i.resonanceTidal && (i.hasSubsurfaceOcean || i.icyShell || (i.surfaceIce && iceFrac > 0.15))) {
    notes.push('A mean-motion resonance continually pumps the orbital eccentricity; the resulting tidal flexing is modest by silicate standards but ample to melt ICE (~273 K vs ~1000 K) — geysers vent a subsurface ocean (Enceladus-like).');
    return mk('cryovolcanic', 'cryo', Math.max(vigor, 0.4), 'resonance-pumped tidal flexing (icy)', ['geology/cryovolcanic'], notes);
  }

  // --- Solar-seasonal geysers (Triton). On a very cold ice-covered world, sunlight penetrating
  //     translucent nitrogen ice builds a solid-state greenhouse a few kelvin warm — enough to
  //     sublimate gas pockets that erupt as geysers. No interior heat or tidal forcing needed. ---
  if (differentiated && (i.teqK ?? Infinity) < 60 && i.surfaceIce && iceFrac > 0.2) {
    notes.push('Sunlight through translucent nitrogen ice drives a solid-state greenhouse; sub-surface gas pockets erupt as seasonal geysers (Triton-like). Driven by the distant sun, not interior heat.');
    return mk('cryovolcanic', 'cryo', Math.max(vigor, 0.15), 'solar-seasonal sublimation', ['geology/cryovolcanic'], notes);
  }

  // --- Radiogenic / secular heat path (the rocky planets), as a graded LADDER on the same vigor. ---
  if (vigor < ACTIVE_THRESHOLD) {
    notes.push(`Radiogenic heat has decayed below the convection threshold (vigor ${vigor.toFixed(2)} < ${ACTIVE_THRESHOLD}); small/old worlds cool to a dead, single-plate lid (Mars/Moon-like).`);
    return mk('inactive', 'none', vigor, 'cooled interior', ['geology/inactive'], notes);
  }

  // Enough heat to melt at depth, but too little to erupt or to mobilise the lid — magmatism stays
  // INTRUSIVE (plutons, dykes) beneath an intact crust. Independent of water: the heat simply doesn't
  // reach the surface. Mars a couple of Gyr ago, or an aging Earth past its plate-tectonic prime.
  if (vigor < PLUTONIC_MAX) {
    notes.push(`Modest interior heat (vigor ${vigor.toFixed(2)}) melts rock at depth but cannot reach the surface or mobilise the lithosphere — magmatism stays intrusive (plutons, dykes) under an intact crust.`);
    return mk('plutonic', 'intrusive', vigor, 'radiogenic (waning)', ['geology/plutonic'], notes);
  }

  if (i.hasSurfaceWater) {
    const note = carbonRich
      ? 'Vigorous interior with surface water → mobile-lid plate tectonics (a carbon-rich crust may stiffen subduction).'
      : 'Vigorous interior with surface water hydrating the lithosphere → mobile-lid plate tectonics → the carbonate–silicate cycle regulates climate.';
    notes.push(note);
    return mk('plate-tectonics', 'arc-effusive', vigor, 'radiogenic + water', ['geology/plate-tectonics'], notes);
  }

  // Dry + vigorous → a single stagnant lid. At/above the episodic onset the rigid dry lid can't shed
  // heat fast enough, so it builds until the lithosphere overturns in catastrophic global resurfacing
  // (Venus, ~700 Myr cycle); below it, the lid sheds heat quietly with only occasional hotspots.
  if (vigor >= EPISODIC_ONSET) {
    notes.push('Vigorous interior but a DRY, rigid lithosphere traps heat until it overturns in periodic catastrophic global resurfacing (Venus-like); no carbonate–silicate drawdown → runaway greenhouse.');
    return mk('episodic', 'resurfacing', vigor, 'radiogenic (dry, heat-trapping)', ['geology/episodic'], notes);
  }
  notes.push('Vigorous interior but a DRY, rigid lithosphere → a quiet stagnant lid: heat conducts out through one unbroken plate with only occasional hotspot volcanism; no CO2 drawdown.');
  return mk('stagnant-lid', 'resurfacing', vigor, 'radiogenic (dry)', ['geology/stagnant-lid'], notes);
}

function mk(
  regime: TectonicRegime, volcanism: VolcanismStyle, vigor: number,
  driver: string, tags: string[], notes: string[]
): GeoActivity {
  return { regime, volcanism, vigor: +vigor.toFixed(3), active: regime !== 'inactive', driver, tags, notes };
}
