// Cloud decks — THE single evaluation of "what cloud layers does this body have?"
// (docs/dev/cloud-decks-design.md, under the physics→tags→visuals rule in
// docs/dev/architecture-physics-tags-visuals.md).
//
// The processor calls deriveCloudDecks() once per pass and publishes the result as
// `structure/cloud-deck` tags (one per deck, value "<species> <bucket>"). Renderers read ONLY the
// tags plus the liquid's look-data — never this module, never the raw atmosphere. Which gases can
// condense, and what the condensate looks like, is rule-pack DATA: a gas's `cloud` block says it
// condenses and into what; the liquid it condenses to carries colour, opacity and melt point.
import type { CelestialBody, RulePack, Tag, GasCloud, LiquidDef } from '$lib/types';
import { liquidDef, phaseAtP, saturationPressureBar } from './liquids';
import { atmosphereProfile, MIN_ATM_BAR, type AtmosphereProfile } from './atmosphereProfile';
import { makeupFractions } from './makeup';
import { stripForReprocess } from '../tags/tagLifecycle';

// ── The published vocabulary ─────────────────────────────────────────────────────────────────────
export const CLOUD_DECK_TAG = 'structure/cloud-deck';
// Precipitation: what falls out of a deck, from the species' phase AT GROUND LEVEL — liquid there
// = rain reaches the surface; solid = snow; still gas = it evaporates on the way down (virga —
// Venus's sulphuric-acid rain famously never lands). Pure flavour surfaced for future systems
// (reasons-to-visit, weather) to build on. Value: "<species> rain|snow|virga".
export const PRECIPITATION_TAG = 'weather/precipitation';
export type PrecipKind = 'rain' | 'snow' | 'virga';
// Further weather, derived from the decks + the body's own physics. Flavour first — surfaced as tags
// so scenarios, reasons-to-visit and the renderers can all build on them without re-deriving.
export const LIGHTNING_TAG = 'weather/lightning';       // value: bucket (occasional|frequent|constant)
export const DUST_STORM_TAG = 'weather/dust-storms';    // value: bucket (seasonal|frequent|planet-wide)
export const MONSOON_TAG = 'weather/monsoon';           // value: the raining species
// Coverage buckets, thinnest → thickest. Buckets, not floats: they read better in the tag list,
// survive hand-editing, and make GM authoring a dropdown (the codebase idiom — surface/age,
// surface/irradiation). The emitter computes precisely and publishes the band.
export const CLOUD_BUCKETS = ['wisps', 'scattered', 'broken', 'overcast', 'veil'] as const;
export type CloudBucket = (typeof CLOUD_BUCKETS)[number];

export interface CloudDeck {
  species: string;      // the LIQUID the deck is made of ('water', 'ammonium-hydrosulfide', …)
  bucket: CloudBucket;
  coverage: number;     // the emitter's exact 0..1 (internal — the tag carries only the bucket)
  condenseK: number;    // condensation temperature — SORT KEY for the stack (higher condenses deeper)
  precip: PrecipKind;   // what this deck drops at the surface (rain / snow / virga)
  baseBar?: number;     // pressure level of the deck BASE, where the column first saturates
  baseK?: number;       // temperature there — droplets or ice crystals is read from this
  opticalDepth?: number;// the deck's own optical depth, before persistence
}

const DEFAULT_MIN_FRACTION = 0.001;

// ── Turning a condensate column into something you can see ───────────────────────────────────────
// A deck's OPACITY is its optical depth, and for a cloud of droplets that is geometric: cross-section
// per unit mass, which for a suspension of radius r and density rho comes to 3/(2 rho r). Take the
// droplet radius as 10 µm — real cloud droplets across water, ammonia and sulphuric acid sit within a
// factor of two or so of that, and nothing in the rule pack pretends to know better.
const DROPLET_RADIUS_M = 1e-5;
// Where a cloud stops looking thicker. Past tau ~5 a deck is visually solid; there is no more to see.
const TAU_OPAQUE = 5;
// What stays UP. The column integral below counts everything a rising parcel condenses on its way
// through the deck — but on a world where the condensate reaches the ground, almost all of it is
// already falling: Earth's air holds some 20 kg/m² of condensable water and its clouds carry about
// a hundredth of that at any moment. On a world where the drops evaporate before they land there is
// nowhere for it to go, so the deck keeps the lot — which is the physical reason Venus stays wrapped
// on a few parts per million while Earth, holding far more water, has gaps in its sky.
const SUSPENDED_WHEN_RAINING = 0.01;

// ── Where a species condenses ────────────────────────────────────────────────────────────────────
// A well-mixed gas keeps its mole fraction with height, so its partial pressure falls in step with
// the total. Saturation pressure falls much faster as the profile cools — so the two curves cross,
// and that crossing is the CLOUD BASE. Below it the species is dry; above it, everything past
// saturation has condensed out. This is the lifting condensation level, and it is why Earth's
// clouds start at 900 m, Venus's at 1.5 bar and Saturn's methane never starts at all.
interface Condensation {
  baseBar: number;
  baseK: number;
  columnKgM2: number;   // condensate suspended above the base
}

function condensationOf(
  frac: number,
  def: LiquidDef,
  gasMolarMass: number,
  profile: AtmosphereProfile
): Condensation | null {
  const levels = profile.levels;                       // surface first
  let baseIdx = -1;
  for (let i = 0; i < levels.length; i++) {
    const { pBar, tempK } = levels[i];
    if (def.criticalK !== undefined && tempK >= def.criticalK) continue;   // no distinct condensate
    if (frac * pBar >= saturationPressureBar(def, tempK)) { baseIdx = i; break; }
  }
  if (baseIdx < 0) return null;
  const base = levels[baseIdx];

  // Condensate column: integrate the SUPERSATURATION — the share of the column the parcel can no
  // longer hold — from the base upwards. In partial-pressure terms that is (f - P_sat/P) dP, and
  // dividing by g and scaling to the species' own molar mass turns it into kg/m².
  let integralPa = 0;
  for (let i = baseIdx; i < levels.length - 1; i++) {
    const a = levels[i], b = levels[i + 1];
    const ea = Math.max(0, frac - saturationPressureBar(def, a.tempK) / a.pBar);
    const eb = Math.max(0, frac - saturationPressureBar(def, b.tempK) / b.pBar);
    integralPa += ((ea + eb) / 2) * (a.pBar - b.pBar) * 1e5;
  }
  const massRatio = gasMolarMass / Math.max(1e-6, profile.molarMass);
  return { baseBar: base.pBar, baseK: base.tempK, columnKgM2: (integralPa * massRatio) / profile.gravity };
}

// ── Effective composition (reactions + evaporation) ──────────────────────────────────────────────

// Reaction products (edge E7): a product gas declares its recipe (`reaction.from`). Effective
// product fraction = min of the constituents × the recipe's yield (default 1 — NH4SH converts
// what it can; Titan's photochemical HCN converts a sliver), constituents depleted by the amount
// converted. ONE generation: products cannot themselves react (no chains, no cycles).
export function effectiveComposition(
  declared: Record<string, number>,
  pack?: RulePack | null
): Record<string, number> {
  const out: Record<string, number> = { ...declared };
  const gasDefs = pack?.gasPhysics ?? {};
  for (const [product, def] of Object.entries(gasDefs)) {
    const from = def.reaction?.from;
    if (!from || from.length < 2) continue;
    if (out[product]) continue;                       // explicitly present already — leave it
    const available = from.map((g) => out[g] ?? 0);
    const yielded = Math.min(...available) * Math.max(0, Math.min(1, def.reaction?.yield ?? 1));
    if (yielded <= 0) continue;
    out[product] = yielded;
    for (const g of from) out[g] = (out[g] ?? 0) - yielded;
  }
  return out;
}

// Evaporation source (edge E2): real bodies' compositions list N2/O2 — the water is in the
// hydrosphere. A LIQUID surface solvent feeds its own vapour into the effective composition via
// the reverse condensesTo mapping. How MUCH is not a guess: air over a sea tends toward saturation,
// so the vapour fraction is the solvent's own saturation pressure at the surface temperature over
// the total pressure, discounted by a relative humidity that a bigger sea pushes closer to 1. Earth
// lands on ~1% water vapour at ~75% RH, which is what Earth has. Titan's methane sea and its
// atmospheric CH4 then DEDUPE to one deck (by species, larger coverage wins) below.
function evaporationFraction(body: CelestialBody, pack?: RulePack | null): { gas: string; frac: number } | null {
  const solvent = body.hydrosphere?.composition;
  const coverage = body.hydrosphere?.coverage ?? 0;
  if (!solvent || solvent === 'none' || coverage < 0.05) return null;
  const surfT = body.temperatureK ?? body.equilibriumTempK ?? 0;
  const pBar = body.atmosphere?.pressure_bar ?? 0;
  if (pBar < MIN_ATM_BAR) return null;                          // no air to hold the vapour
  if (phaseAtP(solvent, surfT, pBar, pack) !== 'liquid') return null;  // frozen/boiled → not a sea
  const def = liquidDef(solvent, pack);
  if (!def) return null;
  // Which GAS is this liquid's vapour? The gas whose cloud block condenses to it.
  const gasDefs = pack?.gasPhysics ?? {};
  const gas = Object.entries(gasDefs).find(([, d]) => d.cloud?.condensesTo === solvent)?.[0];
  if (!gas) return null;
  // Relative humidity: a world under a global ocean sits near saturation, a small sea leaves the
  // air dry. Bounded well short of 1 — a saturated surface is fog, not weather.
  const humidity = 0.35 + 0.5 * Math.min(1, coverage);
  const satFrac = saturationPressureBar(def, surfT) / pBar;
  return { gas, frac: Math.max(0, Math.min(0.95, humidity * satFrac)) };
}

// ── Condensate colour ────────────────────────────────────────────────────────────────────────────
// A cloud is SCATTERING DROPLETS, not bulk liquid. Water is deep blue in a sea (weak absorption over
// metres of path) yet white as cloud; sulphuric acid is genuinely yellow-tinted and its cloud stays
// creamy. So the rule is not "mix toward white by a fixed amount" — that whitens out substances that
// are already pale, which cost Venus its yellow haze. Instead normalise the colour's DISTANCE from
// white: a dark liquid lightens a lot, an already-pale one barely moves, and the hue survives either
// way.
//
// HOW FAR from white is per-substance, because the physics differs. A cloud of transparent droplets
// scatters every wavelength alike and goes white however dark the bulk liquid is — that is water,
// and 60 is its number. A suspension whose particles ABSORB keeps its colour no matter how finely
// divided it is: Jupiter's belts are genuinely brown, a martian dust storm genuinely ochre, and no
// amount of scattering turns either pastel. One constant for both cases made every deck in the game
// pastel; it is `LiquidDef.cloudTintDistance` now, and it is rule-pack data like every other optical
// property of a liquid.
export const DEFAULT_CONDENSATE_DISTANCE = 60;   // how far from white, in 0..255 channel terms
export function condensateTint(hex: string, distance?: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#eef2f8';
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const d = c.map((v) => 255 - v);
  const max = Math.max(...d);
  if (max <= 0) return hex;
  const f = Math.min(1, Math.max(0, distance ?? DEFAULT_CONDENSATE_DISTANCE) / max);
  const out = d.map((v) => Math.round(255 - v * f));
  return '#' + out.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

// ── Coverage → bucket ────────────────────────────────────────────────────────────────────────────
export function bucketFor(coverage: number): CloudBucket {
  if (coverage < 0.12) return 'wisps';
  if (coverage < 0.3) return 'scattered';
  if (coverage < 0.55) return 'broken';
  if (coverage < 0.8) return 'overcast';
  return 'veil';
}
// The renderer's inverse: a representative coverage for a bucket (centre of band). Seeded per-body
// variation WITHIN the band is the renderer's own affair.
export function bucketCoverage(bucket: string): number {
  switch (bucket) {
    case 'wisps': return 0.08;
    case 'scattered': return 0.2;
    case 'broken': return 0.42;
    case 'overcast': return 0.68;
    case 'veil': return 0.92;
    default: return 0.3; // lenient: legacy/unknown values read as a moderate deck (edge E8)
  }
}

// ── The evaluation ───────────────────────────────────────────────────────────────────────────────
export function deriveCloudDecks(body: CelestialBody, pack?: RulePack | null): CloudDeck[] {
  const pBar = body.atmosphere?.pressure_bar ?? 0;
  if (pBar < MIN_ATM_BAR) return [];
  const surfT = body.temperatureK ?? body.equilibriumTempK ?? 0;
  const gasDefs = pack?.gasPhysics ?? {};

  const comp = effectiveComposition({ ...(body.atmosphere?.composition ?? {}) }, pack);
  const evap = evaporationFraction(body, pack);
  if (evap) comp[evap.gas] = Math.max(comp[evap.gas] ?? 0, evap.frac);

  const profile = atmosphereProfile(body, comp, pack);
  if (!profile) return [];
  // A body with a SURFACE cannot hold more of a substance in its air than the ground-level
  // temperature allows: the excess frosts out and stays there. So a well-mixed fraction is capped by
  // saturation at the surface. Without this, a hundred parts per million of hydrogen cyanide — which
  // on Titan is solid everywhere, ground included — read as an overcast sky rather than the trace
  // frost it is. A giant has no such floor; its reservoir is the hot interior, so it is exempt.
  const hasSurface = makeupFractions(body).gas <= 0.5;

  const decks = new Map<string, CloudDeck>();
  for (const [gas, fracRaw] of Object.entries(comp)) {
    const cloud: GasCloud | undefined = gasDefs[gas]?.cloud;
    if (!cloud) continue;                                        // not cloud-forming — data says so
    const species = cloud.condensesTo;
    const def = liquidDef(species, pack);
    if (!def) continue;
    const frac = hasSurface
      ? Math.min(fracRaw ?? 0, saturationPressureBar(def, surfT) / profile.pSurfBar)
      : (fracRaw ?? 0);
    if (frac < (cloud.minFraction ?? DEFAULT_MIN_FRACTION)) continue;
    // Does this species saturate anywhere in the column, and how much condensate does that put up
    // there? Everything about the deck — that it exists at all, how high it sits, how thick it is —
    // comes out of this one crossing. (Edge E4's supercritical ceiling is inside it: a level hotter
    // than the critical point can never saturate.)
    const cond = condensationOf(frac, def, gasDefs[gas]?.molarMass ?? profile.molarMass, profile);
    if (!cond) continue;

    // PRECIPITATION, and with it how much of the sky stays covered. Both come from ONE question the
    // profile can now answer honestly: is the air at the SURFACE saturated in this species? If it is
    // close, what falls lands — Earth's rain, Titan's methane drizzle — and the sky clears behind it.
    // If the ground air is far from saturated, the drops evaporate on the way down (virga) and go
    // straight back into the deck, so the cover never breaks. That is the whole reason Venus is
    // total overcast on a few parts per million of vapour, and it is no longer a special case: it
    // falls out of the same saturation test used to place the deck.
    const satSurf = saturationPressureBar(def, surfT);
    const surfaceRatio = satSurf > 0 ? (frac * profile.pSurfBar) / satSurf : 1;
    const landsIntact = surfaceRatio >= 0.5;
    const precip: PrecipKind = !landsIntact ? 'virga' : surfT < def.meltK ? 'snow' : 'rain';
    const rainOut = Math.min(1, Math.sqrt(Math.max(0, Math.min(1, surfaceRatio))));

    // Optical depth of what is actually SUSPENDED, then the fraction of sky it holds. Precipitation
    // does both jobs: it drains the deck, and what does land leaves clear gaps behind it.
    const suspended = cond.columnKgM2 * Math.pow(SUSPENDED_WHEN_RAINING, rainOut);
    const rho = Math.max(100, (def.density_gcc ?? 1) * 1000);
    const tau = (3 * suspended) / (2 * rho * DROPLET_RADIUS_M);
    const opacity = 1 - Math.exp(-tau / TAU_OPAQUE);
    const coverage = Math.max(0, Math.min(1, opacity * (1 - 0.4 * rainOut)));
    // Faint is not absent. Mars's real water-ice cloud, at its real 210 ppm, computes to barely a
    // percent of sky — and it is genuinely there, and losing it is the bug this whole model was
    // built to fix. The floor is only here to stop a deck existing on paper that nothing could
    // resolve, so it sits well below anything you would call a wisp.
    if (coverage < 0.004) continue;

    const deck: CloudDeck = {
      species, bucket: bucketFor(coverage), coverage,
      condenseK: cond.baseK, precip,
      baseBar: cond.baseBar, baseK: cond.baseK, opticalDepth: tau
    };
    const prior = decks.get(species);
    if (!prior || deck.coverage > prior.coverage) decks.set(species, deck);  // dedupe by species
  }
  // Stack order is now literal: the deck with the DEEPEST base sits at the bottom. Sorted
  // deepest-first, so renderers paint in array order and the last entry is the top deck. Two decks
  // can both bottom out at the very base of the profile — an enriched giant saturates in both
  // ammonia and its hydrosulphide before the air we model even begins — and there the substance
  // that condenses at the higher temperature is the one that started deeper.
  return [...decks.values()].sort((a, b) =>
    (b.baseBar ?? 0) - (a.baseBar ?? 0) || condenseTempK(b.species, pack) - condenseTempK(a.species, pack));
}

// ── Surface oxidation ────────────────────────────────────────────────────────────────────────────
// Mars is red because its iron RUSTED. That is surface chemistry, not bulk composition, which is why
// deriving surface colour from makeup alone made every rocky world the same brown — Mars included.
// Rusting needs three things: iron at the surface, an oxidiser to react with (free oxygen, or the
// CO2/water that did the job on early Mars), and time exposed. The Moon has iron and age but no
// oxidiser and stays grey; a freshly resurfaced world has not had the time.
export const OXIDISED_TAG = 'surface/oxidised';

export function deriveOxidation(body: CelestialBody): string | null {
  const mk = makeupFractions(body);
  if (mk.gas > 0.5) return null;                       // no surface to rust
  const iron = mk.metal;
  if (iron < 0.05) return null;
  const comp = (body.atmosphere?.composition ?? {}) as Record<string, number>;
  const pBar = body.atmosphere?.pressure_bar ?? 0;
  // Oxidising potential: free O2 is the strong case; CO2 and water vapour oxidise iron slowly, which
  // is what actually rusted Mars over billions of years. Needs a real atmosphere to do it at all.
  const oxidiser = pBar < 1e-5 ? 0
    : (comp.O2 ?? 0) * 3 + (comp.CO2 ?? 0) * 0.9 + (comp.H2O ?? 0) * 0.6;
  if (oxidiser < 0.1) return null;                     // airless or reducing → stays grey
  const ageGyr = (body as any).geoActivity?.surfaceAgeGyr ?? 0;
  if (ageGyr < 0.3) return null;                       // resurfaced too recently to have rusted
  const score = Math.min(1, iron * 2.2) * Math.min(1, oxidiser) * Math.min(1, ageGyr / 2.5);
  if (score < 0.08) return null;
  return score > 0.45 ? 'heavy' : score > 0.2 ? 'moderate' : 'light';
}

/** Renderer view: 0..1 storm rate from the lightning tag — how often the sky fires. */
export function lightningStrength(tags: Tag[] | undefined): number {
  const v = (tags ?? []).find((t) => t.key === LIGHTNING_TAG)?.value;
  return v === 'constant' ? 1 : v === 'frequent' ? 0.65 : v === 'occasional' ? 0.35 : 0;
}

/** Renderer view: 0..1 rust strength from the tag. */
export function oxidationStrength(tags: Tag[] | undefined): number {
  const v = (tags ?? []).find((t) => t.key === OXIDISED_TAG)?.value;
  return v === 'heavy' ? 0.62 : v === 'moderate' ? 0.4 : v === 'light' ? 0.2 : 0;
}

// ── Weather (derived from the decks + the body's own physics) ────────────────────────────────────
// Flavour tags, but derived not sprinkled: each needs a real reason to exist, so a world only gets
// them when its physics earns them. Kept OUT of the appearance model deliberately — they describe
// the world, and the renderers may read them, but nothing here feeds back into temperature.
export interface WeatherTags { lightning?: string; dustStorms?: string; monsoon?: string }

export function deriveWeather(body: CelestialBody, decks: CloudDeck[], pack?: RulePack | null): WeatherTags {
  const out: WeatherTags = {};
  const pBar = body.atmosphere?.pressure_bar ?? 0;
  const surfT = body.temperatureK ?? body.equilibriumTempK ?? 0;
  if (pBar < 1e-4) return out;                       // no air, no weather

  // LIGHTNING — charge separation needs a deep convecting cloud with heavy particles moving through
  // it. So: a substantial deck, plus something driving the convection (a warm thick atmosphere, or
  // volcanic ash on a thinner one — Io's plumes and volcanic lightning on Earth do the same job).
  const thickest = decks.reduce<CloudDeck | null>((b, d) => (!b || d.coverage > b.coverage ? d : b), null);
  if (thickest && thickest.coverage > 0.3) {
    const volcanic = (body.tags ?? []).some((t) => t.key === 'tidal/volcanism' || t.key === 'tidal/lava-flows'
      || t.key === 'geology/plate-tectonics' || t.key === 'activity/cryovolcanism');
    // Convective vigour: warmth drives the updraughts, pressure gives them something to lift. A GIANT
    // is a deep convecting atmosphere by nature — its weather is driven from BELOW, by the heat still
    // leaking out of it, not by the sunlight on its cloud tops. Judging Jupiter on its 125 K cloud-top
    // temperature said "too cold for storms" about the most electrically violent place in the system.
    const giant = makeupFractions(body).gas > 0.5;
    const vigour = giant ? 0.85 : Math.min(1, (surfT / 320) * Math.min(1, Math.log10(1 + pBar) + 0.35));
    const score = vigour + (volcanic ? 0.35 : 0) + (thickest.coverage - 0.3) * 0.6;
    if (score > 0.55) out.lightning = score > 1.15 ? 'constant' : score > 0.8 ? 'frequent' : 'occasional';
  }

  // DUST STORMS — a dry, loose, wind-scoured surface. Needs air to lift the dust but NO ocean to
  // pin it down and no thick cloud to damp the surface heating that drives the wind (Mars).
  const oceanCover = body.hydrosphere?.coverage ?? 0;
  const surfaceLiquid = oceanCover > 0.05
    && !!body.hydrosphere?.composition && body.hydrosphere.composition !== 'none'
    && phaseAtP(body.hydrosphere.composition, surfT, pBar, pack) === 'liquid';
  const solid = !((body as any).makeup?.gas > 0.5);
  if (solid && !surfaceLiquid && pBar >= 1e-4 && pBar < 5 && (!thickest || thickest.coverage < 0.4)) {
    out.dustStorms = pBar > 0.5 ? 'planet-wide' : pBar > 0.02 ? 'frequent' : 'seasonal';
  }

  // MONSOON — a seasonal swing in rainfall: you need rain reaching the ground, an ocean to supply
  // it, and a real axial tilt to give the year seasons at all.
  const tilt = Math.abs(body.axial_tilt_deg ?? 0) % 180;
  const seasonal = Math.min(tilt, 180 - tilt) > 12;
  const raining = decks.find((d) => d.precip === 'rain' && d.coverage > 0.2);
  if (seasonal && surfaceLiquid && raining) out.monsoon = raining.species;

  return out;
}

// ── Tags (the published interface) ───────────────────────────────────────────────────────────────
export function cloudDeckTags(decks: CloudDeck[]): Tag[] {
  const tags: Tag[] = decks.map((d) => ({ key: CLOUD_DECK_TAG, value: `${d.species} ${d.bucket}` }));
  // One precipitation tag per species that drops anything — pure flavour, deduped with the decks.
  for (const d of decks) tags.push({ key: PRECIPITATION_TAG, value: `${d.species} ${d.precip}` });
  return tags;
}

// Parse a tag value back into { species, bucket } — lenient for legacy values (old saves held a
// colour word like "white"): an unparseable value reads as an unknown species with a moderate
// bucket, so a stale manual tag still draws SOMETHING rather than throwing (edge E8).
export function parseCloudDeckValue(value: string | undefined): { species: string; bucket: string } {
  const parts = (value ?? '').trim().split(/\s+/);
  if (parts.length >= 2 && (CLOUD_BUCKETS as readonly string[]).includes(parts[parts.length - 1])) {
    return { species: parts.slice(0, -1).join(' '), bucket: parts[parts.length - 1] };
  }
  return { species: parts[0] ?? 'water', bucket: 'scattered' };
}

// The decks a RENDERER should draw for a body: parsed from tags (auto + manual alike — a manual
// tag is a GM instruction), deduped by species with manual implicitly winning because the
// processor never emits an auto duplicate of a manual species (see applyCloudDeckTags).
// Stack order from TAGS alone. A tag carries species + bucket, not the pressure level the emitter
// computed, so renderers re-derive the ordering from the one thing the species itself implies: a
// substance that condenses at a higher temperature condensed lower down, and so sits deeper.
function condenseTempK(species: string, pack?: RulePack | null): number {
  return liquidDef(species, pack)?.boilK ?? 273;
}

export function decksFromTags(tags: Tag[] | undefined, pack?: RulePack | null): { species: string; bucket: string; coverage: number; condenseK: number }[] {
  const seen = new Map<string, { species: string; bucket: string; coverage: number; condenseK: number }>();
  for (const t of tags ?? []) {
    if (t.key !== CLOUD_DECK_TAG) continue;
    const { species, bucket } = parseCloudDeckValue(t.value);
    if (!seen.has(species) || t.manual) {
      seen.set(species, { species, bucket, coverage: bucketCoverage(bucket), condenseK: condenseTempK(species, pack) });
    }
  }
  return [...seen.values()].sort((a, b) => b.condenseK - a.condenseK);
}

const WEATHER_KEYS = [CLOUD_DECK_TAG, PRECIPITATION_TAG, LIGHTNING_TAG, DUST_STORM_TAG, MONSOON_TAG];

// Processor hook: strip the previous pass's AUTO deck/weather tags, keep manual ones, and emit
// fresh auto tags for species the manual set doesn't already cover (manual wins a collision).
export function applyCloudDeckTags(tags: Tag[], decks: CloudDeck[], weather: WeatherTags = {}): Tag[] {
  const kept = stripForReprocess(tags, WEATHER_KEYS);
  const manualKeys = new Set(kept.map((t) => t.key));
  const manualSpecies = new Set(
    kept.filter((t) => t.key === CLOUD_DECK_TAG).map((t) => parseCloudDeckValue(t.value).species));
  const fresh = cloudDeckTags(decks.filter((d) => !manualSpecies.has(d.species)));
  // A GM's hand-set weather wins outright — if they've said "constant lightning", don't argue.
  if (weather.lightning && !manualKeys.has(LIGHTNING_TAG)) fresh.push({ key: LIGHTNING_TAG, value: weather.lightning });
  if (weather.dustStorms && !manualKeys.has(DUST_STORM_TAG)) fresh.push({ key: DUST_STORM_TAG, value: weather.dustStorms });
  if (weather.monsoon && !manualKeys.has(MONSOON_TAG)) fresh.push({ key: MONSOON_TAG, value: weather.monsoon });
  return [...kept, ...fresh];
}
