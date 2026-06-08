// Tag presentation layer: turns raw namespaced tag keys (geology/cryovolcanic, magnetic/induced,
// structure/icy-shell, …) into a friendly LABEL + a plain-English DESCRIPTION (the physics behind
// it) + a namespace GROUP and COLOUR. Keeps the data model terse while the UI reads human.

export interface TagPresentation {
  key: string;
  label: string;
  description: string;
  group: string;
  color: string;
}

// Per-namespace grouping + chip colour.
const NAMESPACE_META: Record<string, { group: string; color: string }> = {
  origin:       { group: 'Origin',       color: '#8a8a9a' },
  orbit:        { group: 'Orbit',        color: '#9a8ac0' },
  barycenter:   { group: 'Barycentre',   color: '#9a8ac0' },
  stability:    { group: 'Stability',    color: '#b0a060' },
  structure:    { group: 'Structure',    color: '#5f8f8f' },
  geology:      { group: 'Geology',      color: '#c2733a' },
  tidal:        { group: 'Tidal',        color: '#d8843a' },
  magnetic:     { group: 'Magnetism',    color: '#6aa0d8' },
  atmosphere:   { group: 'Atmosphere',   color: '#8aa0b0' },
  climate:      { group: 'Climate',      color: '#6fae8f' },
  hazard:       { group: 'Hazard',       color: '#cc5555' },
  habitability: { group: 'Habitability', color: '#5bbf6a' },
  biodiversity: { group: 'Biosphere',    color: '#4fa86a' }
};

// Friendly label + physics description, keyed by exact tag.
const TAG_INFO: Record<string, { label: string; description: string }> = {
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
  'structure/icy-shell':        { label: 'Icy shell',        description: 'A frozen water/ice exterior over a rockier interior.' },
  'structure/subsurface-ocean': { label: 'Subsurface ocean', description: 'A liquid ocean beneath an ice crust, kept liquid by tidal and/or radiogenic interior heat.' },
  'structure/cloud-deck':       { label: 'Cloud deck',       description: 'A condensed cloud layer in the atmosphere — affects albedo, apparent colour and greenhouse warming.' },

  // --- Habitability tiers ---
  'habitability/super':      { label: 'Super-habitable',  description: 'Better than Earth for life — a larger biosphere on durable plate tectonics, a mature stable system, a warm wet optimum. Scores above 100.' },
  'habitability/earth-like': { label: 'Earth-like',       description: 'Surface conditions and an oxygen-bearing atmosphere closely match Earth.' },
  'habitability/human':      { label: 'Human-habitable',  description: 'Liveable for unprotected humans with little or no life support.' },
  'habitability/alien':      { label: 'Alien-habitable',  description: 'Hostile to humans but viable for some biochemistry.' },
  'habitability/subsurface': { label: 'Subsurface niche',  description: 'No surface biosphere, but a liquid subsurface ocean with an energy source could host sub-ice life (Europa/Enceladus).' },
  'habitability/none':       { label: 'Uninhabitable',    description: 'No plausible biosphere under the current model.' }
};

function titleCase(s: string): string {
  return s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function describeTag(key: string): TagPresentation {
  const ns = key.split('/')[0];
  const meta = NAMESPACE_META[ns] ?? { group: 'Other', color: '#888888' };
  const info = TAG_INFO[key];
  const label = info?.label ?? titleCase(key.includes('/') ? key.split('/').slice(1).join(' ') : key);
  return { key, label, description: info?.description ?? '', group: meta.group, color: meta.color };
}

// Suggested tags for the editor's "Common" list — grouped, current namespaces.
export const SUGGESTED_TAGS: string[] = [
  'structure/subsurface-ocean', 'structure/icy-shell',
  'geology/plate-tectonics', 'geology/cryovolcanic',
  'orbit/tidally-locked', 'hazard/high-radiation',
  'habitability/human', 'habitability/alien',
  'biodiversity/high', 'biodiversity/low'
];
