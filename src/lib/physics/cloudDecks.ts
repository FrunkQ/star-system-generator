// Cloud decks — THE single evaluation of "what cloud layers does this body have?"
// (docs/dev/cloud-decks-design.md, under the physics→tags→visuals rule in
// docs/dev/architecture-physics-tags-visuals.md).
//
// The processor calls deriveCloudDecks() once per pass and publishes the result as
// `structure/cloud-deck` tags (one per deck, value "<species> <bucket>"). Renderers read ONLY the
// tags plus the liquid's look-data — never this module, never the raw atmosphere. Which gases can
// condense, and what the condensate looks like, is rule-pack DATA: a gas's `cloud` block says it
// condenses and into what; the liquid it condenses to carries colour, opacity and melt point.
import type { CelestialBody, RulePack, Tag, GasCloud } from '$lib/types';
import { liquidDef, phaseAtP } from './liquids';
import { makeupFractions } from './makeup';

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
}

// A body with no real atmosphere holds no clouds: a sputtered exosphere (Mercury, ~1e-11 bar) is
// collisionless however condensable its composition reads. 1 µbar admits Triton/Pluto-thin air.
const MIN_ATM_BAR = 1e-6;
const DEFAULT_MIN_FRACTION = 0.001;

// ── Deck temperature (edge E1) ───────────────────────────────────────────────────────────────────
// Decks form ALOFT, colder than the surface — Venus's sulphuric-acid deck sits at ~50 km and
// ~300 K over a 737 K surface. Until a real adiabatic T(P) profile exists (phase 2), ONE lapse
// approximation lives here: the deck level is cooler than the ground by a factor that grows with
// how much atmosphere there is to climb through. Tuned against the fixtures in cloudDecks.spec.ts
// (Venus keeps its deck, Earth keeps water, airless stays clear); replace this function — nothing
// else — when the adiabat lands.
export function deckTemperatureK(surfaceK: number, pressureBar: number): number {
  const p = Math.max(1e-6, pressureBar);
  // 0 bar → ~0.93·T_surf (thin air: deck level barely cooler); 1 bar → ~0.72; 90 bar → ~0.45.
  const drop = 0.28 + 0.10 * Math.log10(1 + p) * 2.2;
  return surfaceK * Math.max(0.35, 1 - Math.min(0.65, drop * (0.25 + 0.75 * Math.min(1, Math.log10(1 + p)))));
}

// Where on the melt curve a species starts condensing, approximated from its liquid's phase data:
// use the boil point at the deck's pressure regime — phaseAtP owns that curve. For SORTING we just
// need a comparable temperature per species; the 1-atm boil point serves (higher boil → condenses
// at higher T → sits DEEPER in the stack).
function condenseTempK(species: string, pack?: RulePack | null): number {
  return liquidDef(species, pack)?.boilK ?? 273;
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
// the reverse condensesTo mapping, scaled by how close the surface sits to the solvent's boil
// point (warm sea → humid air; near-freezing sea → a trace). Titan's methane sea and its
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
  // Humidity: how far up the melt→boil span the surface sits, damped by ocean coverage.
  const span = Math.max(1, def.boilK - def.meltK);
  const humidity = Math.max(0, Math.min(1, (surfT - def.meltK) / span));
  return { gas, frac: 0.04 * humidity * Math.min(1, coverage / 0.5) };
}

// ── Condensate colour ────────────────────────────────────────────────────────────────────────────
// A cloud is SCATTERING DROPLETS, not bulk liquid. Water is deep blue in a sea (weak absorption over
// metres of path) yet white as cloud; sulphuric acid is genuinely yellow-tinted and its cloud stays
// creamy. So the rule is not "mix toward white by a fixed amount" — that whitens out substances that
// are already pale, which cost Venus its yellow haze. Instead normalise the colour's DISTANCE from
// white to a fixed small amount: a dark liquid lightens a lot, an already-pale one barely moves, and
// the hue survives either way.
const CONDENSATE_DISTANCE = 60;   // how far from white a deck sits, in 0..255 channel terms
export function condensateTint(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#eef2f8';
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const d = c.map((v) => 255 - v);
  const max = Math.max(...d);
  if (max <= 0) return hex;
  const f = Math.min(1, CONDENSATE_DISTANCE / max);
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
  const deckT = deckTemperatureK(surfT, pBar);
  const gasDefs = pack?.gasPhysics ?? {};

  let comp = effectiveComposition({ ...(body.atmosphere?.composition ?? {}) }, pack);
  const evap = evaporationFraction(body, pack);
  if (evap) comp[evap.gas] = Math.max(comp[evap.gas] ?? 0, evap.frac);

  const decks = new Map<string, CloudDeck>();
  for (const [gas, fracRaw] of Object.entries(comp)) {
    const frac = fracRaw ?? 0;
    const cloud: GasCloud | undefined = gasDefs[gas]?.cloud;
    if (!cloud) continue;                                        // not cloud-forming — data says so
    if (frac < (cloud.minFraction ?? DEFAULT_MIN_FRACTION)) continue;
    const species = cloud.condensesTo;
    const def = liquidDef(species, pack);
    const partialBar = frac * pBar;
    // Supercritical ceiling (edge E4): past the critical point there is no distinct condensate.
    if (def?.criticalK !== undefined && deckT > def.criticalK) continue;
    // Condensation aloft: at deck temperature the species must NOT be gas (liquid droplets or ice
    // crystals both read as cloud). phaseAtP owns the sublimation/boil curves.
    const aloft = phaseAtP(species, deckT, Math.max(partialBar, 1e-9), pack);
    if (aloft === 'gas') continue;
    // Ground phase drives PRECIPITATION, not deck suppression. (Design note: the original E3 rule
    // killed a deck whose species was condensable at the surface — which would have deleted
    // Mars's real water-ice clouds over its frozen ground, the very bug this replaces. A deck
    // that is condensable aloft persists; what happens on the way down is the flavour.)
    // Rain/snow read from the species' own 1-atm melt/boil span vs the SURFACE temperature —
    // liquid there lands as rain (Earth water, Titan methane, a hot Jupiter's iron), solid lands
    // as snow (Mars water), still-gas evaporates aloft as virga (Venus sulphuric acid).
    const ldef = liquidDef(species, pack);
    const precip: PrecipKind = !ldef ? 'virga'
      : surfT < ldef.meltK ? 'snow'
      : surfT <= ldef.boilK ? 'rain'
      : 'virga';
    // Coverage from the deck's COLUMN AMOUNT — its partial pressure — not its fraction. A deck's
    // opacity is how much condensate is overhead, and fraction alone gets it badly wrong: Venus's
    // sulphuric acid is a mere 0.2% of the atmosphere but that is 0.18 bar of it, an opaque veil,
    // while Earth's 0.4% water in 1 bar is broken cloud. Log scale, anchored on the real solar
    // system: Mars ~1e-6 bar → wisps, Earth 4e-3 → overcast, Venus 0.18 → veil.
    const coverage = Math.max(0, Math.min(1, 0.16 * (Math.log10(Math.max(1e-12, partialBar)) + 6.4)));
    const deck: CloudDeck = { species, bucket: bucketFor(coverage), coverage, condenseK: condenseTempK(species, pack), precip };
    const prior = decks.get(species);
    if (!prior || deck.coverage > prior.coverage) decks.set(species, deck);  // dedupe by species
  }
  // Stack order: HIGHER condensation temperature condenses first on the way up = sits DEEPER.
  // Sorted deepest-first, so renderers paint in array order and the last entry is the top deck.
  return [...decks.values()].sort((a, b) => b.condenseK - a.condenseK);
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
  const kept = tags.filter((t) => !WEATHER_KEYS.includes(t.key) || t.manual);
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
