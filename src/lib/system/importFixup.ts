// One-way import FIX-UP for systems/starmaps brought in from SSE v1 (or any older save). The new
// engine DERIVES almost everything (temperature, geology, magnetism, albedo, colour, classification,
// the layered fluids, dozens of tags); a v1 file carries baked-in copies of all of that, plus legacy
// display-name tags ("Tidally Locked", "Active Volcanism") and retired atmosphere flavour. Left in
// place, that stale data shadows the derived values (the exact bug the Sol examples hit).
//
// So on import we STRIP everything the processor will re-derive, keeping only the authored INPUTS
// (mass, radius, orbit, atmosphere/hydrosphere composition, makeup, biosphere, rotation, names,
// descriptions, GM notes, and any genuinely-authored namespaced tags). Then the caller re-processes.
import type { System, CelestialBody, Tag, RulePack } from '$lib/types';

// Derived fields the processor recomputes — never trust them from an old file.
const DERIVED_FIELDS = [
  'calculatedGravity_ms2', 'calculatedRotationPeriod_s', 'orbital_period_days', 'distanceToHost_km',
  'equilibriumTempK', 'equilibriumTempMinK', 'equilibriumTempMaxK', 'greenhouseTempK', 'temperatureK',
  'temperatureRangeK', 'temperatureProfile', 'tidalHeatK', 'radiogenicHeatK', 'internalHeatK',
  'surfaceRadiation', 'radiationShieldingMag', 'habitabilityScore', 'orbitalBoundaries',
  'loDeltaVBudget_ms', 'propulsiveLandBudget_ms', 'aerobrakeLandBudget_ms',
  'apparentColorHex', 'apparentColor', 'magnetism', 'geoActivity', 'albedoBreakdown', 'classification',
  'albedo'  // now derived from makeup + clouds; an old pinned value would override the model
];

// Tag namespaces the processor owns (re-derived every run).
const DERIVED_TAG_PREFIXES = [
  'geology/', 'magnetic/', 'structure/', 'tidal/', 'habitability/', 'climate/', 'stability/', 'barycenter/'
];
// Flat (non-namespaced) tags the processor manages or has retired.
const DERIVED_FLAT_TAGS = new Set([
  // current atmosphere gas-role tags
  'acid-rain', 'asphyxiant', 'breathable-human', 'breathable-human-hypoxic', 'contact-hazard', 'corrosive',
  'crushing-atmosphere', 'extreme-fire-hazard', 'fire-hazard', 'flammable', 'greenhouse', 'haze-former',
  'heavy-gas', 'high-humidity', 'highly-corrosive', 'highly-toxic', 'hypergolic', 'inert', 'irritant',
  'lifting-gas', 'organic-solvent', 'oxidizer', 'oxygen-toxicity', 'ozone-depleter', 'prebiotic-precursor',
  'reducing', 'solvent-hazard', 'super-greenhouse', 'technosignature', 'toxic-human',
  // retired flavour / superseded
  'voice-changer', 'almond-smell', 'rotten-egg-smell', 'pungent', 'nitrogen-narcosis', 'leak-prone',
  'abrasive-wind', 'steambath', 'buffer-gas', 'noble-gas', 'acidic-rain', 'visible-fumes', 'visible-gas',
  'reactive', 'cloud-former', 'condensible-metal', 'condensible-rock', 'condensible-fuel', 'glass-haze',
  'refractory', 'opaque', 'conductive-atmosphere', 'metal-embrittlement', 'volcanic',
  'thin', 'thick', 'exosphere', 'haze', 'hot'
]);

// Classification namespaces — a type is a CLASS (lives in body.classes), never a tag. Old saves
// sometimes stored the class as a tag ("ice-giant", "planet/ice-giant"); those must go.
const CLASS_PREFIXES = ['planet/', 'star/', 'belt/', 'ring/'];

// A tag is "interfering" (strip it) if it's a derived namespace, a known managed/retired flat tag, a
// classification (a class-as-tag — bare type name or namespaced class), or a legacy DISPLAY-NAME tag
// (old format used spaces/capitals; the new format is lowercase-hyphen-namespaced). Genuinely-authored
// tags (faction/x, plot/y, lore/z) are lowercase-namespaced and kept.
export function isInterferingTag(key: string, classNames?: Set<string>): boolean {
  if (DERIVED_TAG_PREFIXES.some((p) => key.startsWith(p))) return true;
  if (CLASS_PREFIXES.some((p) => key.startsWith(p))) return true;      // class duplicated as a tag
  if (classNames && classNames.has(key)) return true;                  // bare type name (e.g. "ice-giant")
  if (DERIVED_FLAT_TAGS.has(key)) return true;
  if (/[A-Z]/.test(key) || key.includes(' ')) return true;            // legacy display-name tag
  return false;
}

// Bare type names from the rulepack's classifier (so "ice-giant", "puffy", … are recognised as
// classifications, not tags).
function classNamesFromPack(pack?: RulePack): Set<string> {
  const out = new Set<string>();
  const add = (cls: string) => { const bare = cls.split('/').pop(); if (bare) out.add(bare); };
  for (const k of Object.keys(pack?.classifier?.planetImages ?? {})) add(k);
  for (const k of Object.keys((pack?.classifier as any)?.starImages ?? {})) add(k);
  for (const fp of pack?.classifier?.fingerprints ?? []) add(fp.class);
  return out;
}

function stripBody(body: CelestialBody, classNames: Set<string>): void {
  for (const f of DERIVED_FIELDS) delete (body as any)[f];
  // Classification is re-derived from physics for planets/moons — but the processor NEVER
  // re-classifies a star (its spectral class star/G… is generation/authored input). Wiping a
  // star's classes here leaves it colourless, so it renders white on reload. Preserve the star's
  // star/ class; if it only survived as a class-tag in an old save, recover it before the tag
  // strip below drops it. Everything else is cleared so the engine re-derives cleanly.
  if (body.roleHint === 'star') {
    const fromClasses = (body.classes ?? []).filter((c) => typeof c === 'string' && c.startsWith('star/'));
    body.classes = fromClasses.length
      ? fromClasses
      : (body.tags ?? []).map((t) => t.key).filter((k) => typeof k === 'string' && k.startsWith('star/'));
  } else {
    body.classes = [];
  }
  // Derived sub-structures.
  if (body.hydrosphere) delete (body.hydrosphere as any).layers;
  if (body.atmosphere) { delete (body.atmosphere as any).molarMassKg; delete (body.atmosphere as any).scaleHeightKm; }
  // Tags: keep only authored ones.
  if (Array.isArray(body.tags)) body.tags = body.tags.filter((t: Tag) => !isInterferingTag(t.key, classNames));
}

// Fix up a single system in place (and return it). Caller should re-run systemProcessor.process().
export function fixUpImportedSystem(system: System, pack?: RulePack): System {
  const classNames = classNamesFromPack(pack);
  for (const node of system.nodes) {
    if (node.kind === 'body') stripBody(node as CelestialBody, classNames);
  }
  // NOTE: we used to DELETE every auto-barycentre here and let the processor regenerate them. But a
  // nested auto-barycentre (e.g. a planet + an oversized moon that v1 promoted) carries the pair's REAL
  // orbit around its host (its own `orbit`, e.g. 4.44 AU from the star); deleting it orphaned the two
  // members, and the processor's dangling-node repair then re-homed them onto the SYSTEM ROOT with only
  // their tiny local separation as `a_AU` — collapsing the pair to the centre / inside the star
  // (the Sirius Ab bug). The processor's `reconcileBarycenters` is a full normalise state-machine
  // (promote / demote / dissolve / de-ghost / repair) that handles a surviving auto-barycentre correctly
  // and won't duplicate it (it only promotes bodies parented to a BODY, and members here are parented to
  // the barycentre). So we KEEP auto-barycentres and let reconcile normalise them, preserving the pair's
  // real placement. Their `barycenter/auto` tag survives (bodies-only tag strip above doesn't touch it).
  return system;
}
