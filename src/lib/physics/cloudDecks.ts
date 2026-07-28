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

// ── The published vocabulary ─────────────────────────────────────────────────────────────────────
export const CLOUD_DECK_TAG = 'structure/cloud-deck';
// Precipitation: what falls out of a deck, from the species' phase AT GROUND LEVEL — liquid there
// = rain reaches the surface; solid = snow; still gas = it evaporates on the way down (virga —
// Venus's sulphuric-acid rain famously never lands). Pure flavour surfaced for future systems
// (reasons-to-visit, weather) to build on. Value: "<species> rain|snow|virga".
export const PRECIPITATION_TAG = 'weather/precipitation';
export type PrecipKind = 'rain' | 'snow' | 'virga';
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
    // Coverage: grows with abundance and with pressure to suspend it. log-ish so trace decks read
    // as wisps and a dominant condensable reads as a veil.
    const coverage = Math.max(0, Math.min(1,
      (0.25 + 0.35 * Math.log10(1 + pBar)) * Math.min(1, Math.pow(frac / 0.05, 0.5))));
    const deck: CloudDeck = { species, bucket: bucketFor(coverage), coverage, condenseK: condenseTempK(species, pack), precip };
    const prior = decks.get(species);
    if (!prior || deck.coverage > prior.coverage) decks.set(species, deck);  // dedupe by species
  }
  // Stack order: HIGHER condensation temperature condenses first on the way up = sits DEEPER.
  // Sorted deepest-first, so renderers paint in array order and the last entry is the top deck.
  return [...decks.values()].sort((a, b) => b.condenseK - a.condenseK);
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

// Processor hook: strip the previous pass's AUTO deck + precipitation tags, keep manual ones, and
// emit fresh auto tags for species the manual set doesn't already cover (manual wins a collision).
export function applyCloudDeckTags(tags: Tag[], decks: CloudDeck[]): Tag[] {
  const kept = tags.filter((t) => (t.key !== CLOUD_DECK_TAG && t.key !== PRECIPITATION_TAG) || t.manual);
  const manualSpecies = new Set(
    kept.filter((t) => t.key === CLOUD_DECK_TAG).map((t) => parseCloudDeckValue(t.value).species));
  const fresh = cloudDeckTags(decks.filter((d) => !manualSpecies.has(d.species)));
  return [...kept, ...fresh];
}
