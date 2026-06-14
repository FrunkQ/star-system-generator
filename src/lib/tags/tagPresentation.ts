// Tag presentation layer: turns raw namespaced tag keys (geology/cryovolcanic, magnetic/induced,
// structure/icy-shell, …) into a friendly LABEL + a plain-English DESCRIPTION (the physics behind
// it) + a namespace GROUP and COLOUR. Keeps the data model terse while the UI reads human.

export interface TagPresentation {
  key: string;
  label: string;
  description: string;
  group: string;
  color: string;
  textColor?: string;
}

// PoI category styles, registered at runtime by the reasons-to-visit system from the active packs.
// Keyed by category id (= the tag namespace before "/"). Lets a user-defined tag like
// survey/geochem-sample render with its pack-chosen colour + heading. Stale entries are harmless.
const POI_CATEGORY_STYLE: Record<string, { label: string; color: string; textColor?: string }> = {};
export function registerPoiCategories(cats: { id: string; label: string; color?: string; textColor?: string }[]): void {
  for (const c of cats) {
    if (!c?.id) continue;
    POI_CATEGORY_STYLE[c.id] = { label: c.label || c.id, color: c.color || NAMESPACE_META[c.id]?.color || '#888888', textColor: c.textColor };
  }
}

// Per-tag friendly name + hover description, supplied by PoI rules (the editor's "player name" and
// "hover text"). Rebuilt wholesale on each registration so deletions/edits take effect. Overrides
// the built-in TAG_INFO / title-cased fallback for that exact tag key.
const POI_TAG_META: Record<string, { label?: string; description?: string }> = {};
export function registerPoiTags(tags: { key: string; label?: string; description?: string }[]): void {
  for (const k of Object.keys(POI_TAG_META)) delete POI_TAG_META[k];
  for (const t of tags) { if (t?.key && (t.label || t.description)) POI_TAG_META[t.key] = { label: t.label, description: t.description }; }
}

// Per-namespace grouping + chip colour.
const NAMESPACE_META: Record<string, { group: string; color: string; poi?: boolean }> = {
  origin:       { group: 'Origin',       color: '#8a8a9a' },
  orbit:        { group: 'Orbit',        color: '#9a8ac0' },
  barycenter:   { group: 'Barycentre',   color: '#9a8ac0' },
  stability:    { group: 'Stability',    color: '#b0a060' },
  resonance:    { group: 'Resonance',    color: '#c0a0e0' },
  fate:         { group: 'Stability',    color: '#d06868' },
  structure:    { group: 'Structure',    color: '#5f8f8f' },
  ring:         { group: 'Rings',        color: '#b9a36a' },
  geology:      { group: 'Geology',      color: '#c2733a' },
  tidal:        { group: 'Tidal',        color: '#d8843a' },
  magnetic:     { group: 'Magnetism',    color: '#6aa0d8' },
  atmosphere:   { group: 'Atmosphere',   color: '#8aa0b0' },
  climate:      { group: 'Climate',      color: '#6fae8f' },
  hazard:       { group: 'Hazard',       color: '#cc5555' },
  habitability: { group: 'Habitability', color: '#5bbf6a' },
  biodiversity: { group: 'Biosphere',    color: '#4fa86a' },
  // RPG "reasons to visit" categories (poi: re-derived by a PoI RULE the user can change).
  resource:     { group: 'Resources',    color: '#d4a843', poi: true },
  science:      { group: 'Science',       color: '#5a9fd0', poi: true },
  frontier:     { group: 'Frontier',      color: '#6fae8f', poi: true },
  intrigue:     { group: 'Intrigue',      color: '#b07ad0', poi: true }
};

// Friendly label + physics description, keyed by exact tag.
const TAG_INFO: Record<string, { label: string; description: string }> = {
  // --- Resonances & predicted fates ---
  'resonance/laplace': {
    label: 'Laplace resonance',
    description: 'Three bodies locked in a 1:2:4 orbital chain (Io–Europa–Ganymede style). The lock is protective AND continually pumps eccentricity — the archetypal driver of tidal heating.'
  },
  'fate/infall': {
    label: 'Fated: spirals in',
    description: 'The predicted end-state: the orbit decays inside the Roche limit or onto the host — consumed or tidally shredded into a ring.'
  },
  'fate/eject': {
    label: 'Fated: flung out',
    description: 'The predicted end-state: gravitational scattering pumps the orbit until the body is thrown onto an escape trajectory.'
  },
  'fate/collision': {
    label: 'Fated: collision',
    description: 'The predicted end-state: crossing orbits with a comparable-mass neighbour — a merger or mutual disruption.'
  },
  'fate/inversion': {
    label: 'Unphysical hierarchy',
    description: 'The orbiting body outweighs its host — rebuild the hierarchy.'
  },
  // --- Stability severities (timescales from the spacing/overlap heuristics) ---
  'stability/marginal': {
    label: 'Marginal',
    description: 'Metastable: dynamically packed and perturbation-sensitive, but generally long-lived (>100 Myr to Gyr).'
  },
  'stability/unstable': {
    label: 'Unstable',
    description: 'Likely 1–100 Myr before disruption under sustained perturbations.'
  },
  'stability/very-unstable': {
    label: 'Very unstable',
    description: 'Likely <1 kyr before major orbital disruption (collision, ejection or infall).'
  },
  // --- RPG "reasons to visit": resource / science / frontier / intrigue ---
  'resource/heavy-metals':    { label: 'Heavy metals',      description: 'A metal-rich interior/crust — iron, nickel and friends in extractable concentrations.' },
  'resource/platinum-group':  { label: 'Platinum-group',    description: 'Unusually metal-dense — platinum, iridium, osmium: high-value, low-bulk cargo.' },
  'resource/rare-earths':     { label: 'Rare earths',       description: 'Lanthanides and friends in workable ore — the stuff of electronics and exotic alloys.' },
  'resource/fissiles':        { label: 'Fissiles',          description: 'A radiogenic-rich crust: uranium/thorium for reactors and weapons-grade refining.' },
  'resource/helium-3':        { label: 'Helium-3',          description: 'He-3 for clean fusion — abundant in giant atmospheres and solar-wind-soaked airless regolith.' },
  'resource/deuterium':       { label: 'Deuterium',         description: 'Heavy hydrogen for fusion fuel — skimmed from giant atmospheres or extracted from water.' },
  'resource/water-ice':       { label: 'Water ice',         description: 'Accessible water ice — reaction mass, life support and split-for-fuel.' },
  'resource/volatiles':       { label: 'Volatiles',         description: 'Frozen gases (CO₂, ammonia, methane) — cheap propellant and industrial feedstock.' },
  'resource/hydrocarbons':    { label: 'Hydrocarbons',      description: 'Liquid/solid hydrocarbons — a petrochemical bonanza (Titan-style methane seas).' },
  'resource/exotic-crystals': { label: 'Exotic crystals',   description: 'High-pressure mineral phases from a deep interior — prized for tech and curiosity alike.' },
  'resource/diamonds':        { label: 'Diamonds',          description: 'A carbon-rich, high-pressure world — diamond as bedrock, and as industrial abrasive.' },
  'resource/organics':        { label: 'Organics',          description: 'Pre-biotic or biotic organic chemistry — feedstock, samples, or food supplies.' },
  'resource/ore-belt':        { label: 'Asteroid ore',      description: 'A debris belt: undifferentiated metals, rock and ice ready for in-situ mining.' },
  'resource/rare-metals':     { label: 'Asteroid rare metals', description: 'A warm, rocky-metallic belt — platinum-group and rare earths in low-gravity bodies that are cheap to mine.' },
  'resource/oxidizer':        { label: 'Oxidizer',          description: 'A free-oxygen atmosphere — bankable oxidizer for chemical propellant and industry.' },

  'science/pristine-protoplanetary': { label: 'Pristine protoplanetary', description: 'A very young world — a snapshot of planet formation before it weathers away.' },
  'science/biosignature':            { label: 'Biosignature',            description: 'Signs of life — the find of a career, and a quarantine headache.' },
  'science/extremophile-niche':      { label: 'Extremophile niche',      description: 'A sub-ice ocean or cryo-vent: a candidate for alien biochemistry.' },
  'science/tidal-laboratory':        { label: 'Tidal laboratory',        description: 'Extreme tidal heating — a natural lab for interior physics (and a spectacular sight).' },
  'science/impact-record':           { label: 'Impact record',           description: 'A battered or eccentric body preserving the system\'s collisional history.' },
  'science/remnant-proximity':       { label: 'Remnant proximity',       description: 'Orbits near a stellar remnant — relativistic physics on the doorstep.' },
  'science/resonance-showcase':      { label: 'Resonance showcase',      description: 'A clean orbital resonance — a textbook celestial-mechanics demonstration.' },
  'science/rare-world-type':         { label: 'Rare world type',         description: 'An uncommon planet class — worth charting for its rarity alone.' },
  'science/exotic-chemistry':        { label: 'Exotic chemistry',        description: 'Aggressive or artificial atmospheric chemistry — hazardous and fascinating.' },
  'science/runaway-greenhouse':      { label: 'Runaway greenhouse',      description: 'A Venus-like hothouse — a cautionary tale and a climate-science prize.' },
  'science/shattered-core':          { label: 'Shattered core',          description: 'An eccentric, dynamically excited belt — likely the debris of a disrupted differentiated body, its metallic core laid bare. A window into planetary interiors (and a metal bonanza).' },

  'frontier/ice-mining':     { label: 'Belt ice refuelling', description: 'Icy belt/Kuiper bodies — crack the ice for hydrogen/oxygen propellant; refuelling among the rocks, no gravity well.' },
  'frontier/fuel-depot':     { label: 'Water/ice refuelling', description: 'Accessible water/ice to crack into hydrogen/oxygen propellant — a wilderness refuelling stop.' },
  'frontier/gas-skimming':   { label: 'Gas-giant refuelling', description: 'Skim the giant\'s hydrogen atmosphere for jump/reaction fuel — the classic Traveller wilderness top-up.' },
  'frontier/life-support':   { label: 'Life-support resupply', description: 'Breathable oxygen and/or water on hand — replenish air and life-support consumables.' },
  'frontier/aerobraking':    { label: 'Aerobraking',      description: 'Enough atmosphere to brake against — saves fuel on arrival.' },
  'frontier/gravity-assist': { label: 'Gravity assist',   description: 'A massive body well placed for slingshot manoeuvres.' },
  'frontier/waystation':     { label: 'Waystation site',  description: 'A solid, resource-bearing moon — a plausible spot for a forward base.' },

  'intrigue/anomalous-signal':  { label: 'Anomalous signal',  description: 'Something here is broadcasting — or reflecting — that shouldn\'t be. (GM hook.)' },
  'intrigue/derelict-rumour':   { label: 'Derelict rumour',   description: 'Spacers\' tales of a wreck or abandoned station in this neighbourhood. (GM hook.)' },
  'intrigue/uncharted-feature': { label: 'Uncharted feature', description: 'A surface/orbital feature the surveys can\'t quite explain. (GM hook.)' },
  'intrigue/legend':            { label: 'Legend',            description: 'A world that has entered legend — paradise, curse, or both. (GM hook.)' },

  // --- Orbit ---
  'orbit/tidally-locked': {
    label: 'Tidally locked',
    description: 'Derived: the despinning timescale (∝ a⁶) is shorter than the system age, so the body has settled into synchronous rotation — one face permanently toward its host (the Moon, Mercury, most close-in worlds). Pin it by hand in the body editor to override.'
  },

  // --- Rings (derived from ring-child geometry) ---
  'ring/system':   { label: 'Ringed',         description: 'Hosts a ring system — orbiting ice/rock debris — derived from a ring child in the geometry, not hand-tagged.' },
  'ring/multiple': { label: 'Multiple rings',  description: 'More than one distinct ring orbits the body.' },
  'ring/light':    { label: 'Light ring',      description: 'A faint, low-mass ring — sparse, tenuous debris.' },
  'ring/medium':   { label: 'Medium ring',     description: 'A moderately dense ring of orbiting debris.' },
  'ring/heavy':    { label: 'Heavy ring',      description: 'A dense, massive ring — a bright, prominent Saturn-like band.' },

  // --- Geology (tectonics + volcanism by mechanism) ---
  'geology/plate-tectonics': {
    label: 'Plate tectonics',
    description: 'A vigorous interior plus surface water drives a mobile lid; the carbonate–silicate cycle regulates climate — the engine of long-term habitability (Earth).'
  },
  'geology/stagnant-lid': {
    label: 'Stagnant lid',
    description: 'A vigorous but dry interior traps heat under a rigid lid → episodic catastrophic resurfacing and no CO₂ drawdown → runaway greenhouse risk (Venus).'
  },
  'geology/volcanic-tidal': {
    label: 'Tidal volcanism',
    description: 'Tidal flexing drives silicate volcanism far exceeding radiogenic heat — surfaces resurface too fast for surface life (Io).'
  },
  'geology/cryovolcanic': {
    label: 'Cryovolcanism',
    description: 'Interior heat keeps a subsurface ocean liquid; plumes vent water/ice through the crust — a separate, sub-ice habitability niche (Europa/Enceladus).'
  },
  'geology/inactive': {
    label: 'Geologically dead',
    description: 'Radiogenic heat has decayed below the convection threshold (small or old world); no tectonics, no volcanism, no nutrient recycling (Mars/Moon).'
  },

  // --- Tidal heating ---
  'tidal/hotspots':  { label: 'Tidal hotspots',  description: 'Tidal flexing concentrates heat into localized hotspots far above the mean surface temperature.' },
  'tidal/volcanism': { label: 'Active volcanism', description: 'Tidal hotspots reach volcanic temperatures.' },
  'tidal/lava-flows':{ label: 'Tidal lava flows', description: 'Tidal hotspots reach silicate melt — surface lava lakes and flows (Io).' },

  // --- Magnetism ---
  'magnetic/dynamo':     { label: 'Intrinsic dynamo', description: 'A convecting conductive interior generates a self-sustained magnetic field that shields the atmosphere from stellar wind.' },
  'magnetic/induced':    { label: 'Induced field',    description: "A conductive subsurface ocean induces a weak field within the host planet's magnetosphere — no internal dynamo (Europa)." },
  'magnetic/unshielded': { label: 'No magnetosphere', description: 'No convecting conductor (or far too slow rotation) → the atmosphere is exposed to stellar-wind stripping.' },

  // --- Structure (derived layering) ---
  'structure/icy-shell':        { label: 'Icy shell',        description: 'A frozen exterior (the value names the ice — water, nitrogen, CO₂, methane…) over a rockier interior.' },
  'climate/polar-ice':          { label: 'Polar ice',        description: 'Liquid at the mean temperature, but the cold poles / night side dip below the solvent\'s freezing point — partial frozen caps.' },
  'structure/subsurface-ocean': { label: 'Subsurface ocean', description: 'A liquid ocean beneath an ice crust, kept liquid by tidal and/or radiogenic interior heat.' },
  'structure/cloud-deck':       { label: 'Cloud deck',       description: 'A condensed cloud layer in the atmosphere — affects albedo, apparent colour and greenhouse warming.' },

  // --- Atmosphere gas roles (flat keys, from the atmosphere composition). RPG-relevant only:
  //     survival, breathability, equipment hazards, world-building signals. ---
  'inert':                     { label: 'Inert atmosphere', description: 'Dominated by chemically unreactive gases (N₂, noble gases) — no reactive chemistry.' },
  'oxidizer':                  { label: 'Oxidizing',        description: 'Free oxidizer (e.g. O₂) present — a strong sign of an active biosphere or photochemistry.' },
  'breathable-human':          { label: 'Breathable',       description: 'Composition and partial pressures fall within the human-breathable envelope.' },
  'breathable-human-hypoxic':  { label: 'Thin but breathable', description: 'Breathable mix, but low partial pressure of O₂ — hypoxic, like high altitude.' },
  'reducing':                  { label: 'Reducing',         description: 'No free oxygen — hydrogen/methane/ammonia chemistry (a young or abiotic world).' },
  'corrosive':                 { label: 'Corrosive',        description: 'Corrosive species attack unprotected gear and suits over time.' },
  'highly-corrosive':          { label: 'Highly corrosive', description: 'Aggressively corrosive (sulfuric acid, halogens) — rapid damage to gear and suits.' },
  'toxic-human':               { label: 'Toxic',            description: 'Toxic to humans at the modelled partial pressures — a suit breach is dangerous.' },
  'highly-toxic':              { label: 'Highly toxic',     description: 'Lethal in small doses (e.g. HCN) — even trace exposure is deadly.' },
  'asphyxiant':                { label: 'Asphyxiant',       description: 'Displaces oxygen — suffocation risk without a sealed air supply.' },
  'crushing-atmosphere':       { label: 'Crushing pressure',description: 'Surface pressure high enough to crush unrated equipment.' },
  'acid-rain':                 { label: 'Acid rain',        description: 'Acidic precipitation — an environmental and equipment hazard.' },
  'flammable':                 { label: 'Flammable',        description: 'Combustible gases present — ignition risk.' },
  'oxygen-toxicity':           { label: 'Oxygen toxicity',  description: 'O₂ partial pressure high enough to be toxic over time.' },
  'hypergolic':                { label: 'Hypergolic',       description: 'Spontaneously ignites on contact with common materials (e.g. F₂).' },
  'lifting-gas':               { label: 'Lifting gas',      description: 'Low-density gas that supports airships / balloons.' },
  'greenhouse':                { label: 'Greenhouse',       description: 'Contains greenhouse gases that warm the surface.' },
  'super-greenhouse':          { label: 'Super-greenhouse', description: 'Extremely potent greenhouse forcing (e.g. CFCs).' },
  'prebiotic-precursor':       { label: 'Prebiotic chemistry', description: 'Precursor molecules (e.g. HCN) relevant to the origin of life.' },
  'technosignature':           { label: 'Technosignature',  description: 'Artificial gases (e.g. CFCs) — a sign of technology, not nature.' },

  // --- Habitability tiers ---
  'habitability/super':      { label: 'Super-habitable',  description: 'Better than Earth for life — a larger biosphere on durable plate tectonics, a mature stable system, a warm wet optimum. Scores above 100.' },
  'habitability/earth-like': { label: 'Earth-like',       description: 'Surface conditions and an oxygen-bearing atmosphere closely match Earth.' },
  'habitability/human':      { label: 'Human-habitable',  description: 'Liveable for unprotected humans with little or no life support.' },
  'habitability/alien':      { label: 'Alien-habitable',  description: 'Hostile to humans but viable for some biochemistry.' },
  'habitability/subsurface': { label: 'Subsurface niche',  description: 'No surface biosphere, but a liquid subsurface ocean with an energy source could host sub-ice life (Europa/Enceladus).' },
  'habitability/none':       { label: 'Uninhabitable',    description: 'No plausible biosphere under the current model.' }
};

// --- Legacy tag cleanup -----------------------------------------------------------------------
// V1 tags the new engine replaces are stripped (never a manual tag). We avoid a hand-maintained
// list: a modern tag is always lowercase-hyphen-namespaced, so any key with an UPPERCASE letter or
// SPACE is a V1 display-name ("Tidally Locked", "Ice Giant", "Sun-like"); classification stored as a
// tag uses the planet/ · star/ · belt/ prefixes (NOT ring/, now a live physics namespace). The
// lowercase retired-atmosphere flavour (voice-changer, noble-gas, …) is handled separately by the
// atmosphere pass (RETIRED_ATMOSPHERE_TAGS), and the example files have been cleaned at source.
export function isLegacyTag(key: string): boolean {
  return /[A-Z\s]/.test(key) || /^(planet|star|belt)\//.test(key);
}

// A tag is "managed" (system-owned) if the engine re-derives it every run — physics namespaces,
// known flat gas tags, and the PoI categories (resource/science/frontier/intrigue). These can't be
// usefully removed by hand (they come straight back); the way to change them is the rules/PoI pack.
// Anything else is a USER tag — free-text the player added, theirs to keep or remove.
export function isManagedTag(key: string): boolean {
  return tagSource(key) !== 'manual';
}

// Where a tag comes from: 'physics' (derived, fixed — red lock), 'poi' (a PoI rule, changeable via
// the pack — orange lock), or 'manual' (the player's own — removable). Drives the Tags editor.
export type TagSource = 'physics' | 'poi' | 'manual';
export function tagSource(key: string): TagSource {
  if (key.includes('/')) {
    const ns = key.split('/')[0];
    if (POI_CATEGORY_STYLE[ns]) return 'poi';   // a registered PoI pack category
    const meta = NAMESPACE_META[ns];
    if (!meta) return 'manual';
    return meta.poi ? 'poi' : 'physics';
  }
  return key in TAG_INFO ? 'physics' : 'manual';
}

function titleCase(s: string): string {
  return s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Flat (un-namespaced) gas-role tags derived from the atmosphere composition. They live without a
// "/" prefix for terseness, so group them explicitly under Atmosphere — this signals to the player
// that the lever is the body's atmosphere data (edit that to change these physics-derived tags).
const FLAT_ATMOSPHERE_TAGS = new Set([
  'inert', 'oxidizer', 'breathable-human', 'breathable-human-hypoxic', 'reducing', 'corrosive',
  'highly-corrosive', 'toxic-human', 'highly-toxic', 'asphyxiant', 'crushing-atmosphere', 'acid-rain',
  'flammable', 'oxygen-toxicity', 'hypergolic', 'lifting-gas', 'greenhouse', 'super-greenhouse',
  'prebiotic-precursor', 'technosignature'
]);

export function describeTag(key: string): TagPresentation {
  const ns = key.split('/')[0];
  // A registered PoI category wins (user/pack-chosen colour + heading), then flat atmosphere, then
  // the built-in namespace map, then a neutral fallback.
  const poiStyle = key.includes('/') ? POI_CATEGORY_STYLE[ns] : undefined;
  const meta = poiStyle
    ? { group: poiStyle.label, color: poiStyle.color }
    : (!key.includes('/') && FLAT_ATMOSPHERE_TAGS.has(key))
      ? { group: 'Atmosphere', color: NAMESPACE_META.atmosphere.color }
      : NAMESPACE_META[ns] ?? { group: 'Other', color: '#888888' };
  const textColor = poiStyle?.textColor;
  const info = TAG_INFO[key];
  // Dynamic mean-motion resonance tags (resonance/3-2 → "3:2 resonance").
  const mmr = !info && /^resonance\/(\d+)-(\d+)$/.exec(key);
  if (mmr) {
    return {
      key, label: `${mmr[1]}:${mmr[2]} resonance`, group: meta.group, color: meta.color,
      description: `Mean-motion resonance: the orbital periods sit in a ${mmr[1]}:${mmr[2]} whole-number ratio with a partner. Depending on the masses it shields the pair from close approaches, pumps eccentricity (tidal heating), or destabilises a packed system.`
    };
  }
  const tagMeta = POI_TAG_META[key];
  const label = tagMeta?.label || info?.label || titleCase(key.includes('/') ? key.split('/').slice(1).join(' ') : key);
  return { key, label, description: tagMeta?.description ?? info?.description ?? '', group: meta.group, color: meta.color, textColor };
}
