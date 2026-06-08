// One-way import FIX-UP for systems/starmaps brought in from SSE v1 (or any older save). The new
// engine DERIVES almost everything (temperature, geology, magnetism, albedo, colour, classification,
// the layered fluids, dozens of tags); a v1 file carries baked-in copies of all of that, plus legacy
// display-name tags ("Tidally Locked", "Active Volcanism") and retired atmosphere flavour. Left in
// place, that stale data shadows the derived values (the exact bug the Sol examples hit).
//
// So on import we STRIP everything the processor will re-derive, keeping only the authored INPUTS
// (mass, radius, orbit, atmosphere/hydrosphere composition, makeup, biosphere, rotation, names,
// descriptions, GM notes, and any genuinely-authored namespaced tags). Then the caller re-processes.
import type { System, CelestialBody, Tag } from '$lib/types';

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

// A tag is "interfering" (strip it) if it's a derived namespace, a known managed/retired flat tag, or a
// legacy DISPLAY-NAME tag (the old format used spaces / capitals; the new format is lowercase-hyphen-
// namespaced). Genuinely-authored tags (faction/x, plot/y, lore/z) are lowercase-namespaced and kept.
export function isInterferingTag(key: string): boolean {
  if (DERIVED_TAG_PREFIXES.some((p) => key.startsWith(p))) return true;
  if (DERIVED_FLAT_TAGS.has(key)) return true;
  if (/[A-Z]/.test(key) || key.includes(' ')) return true; // legacy display-name tag
  return false;
}

function stripBody(body: CelestialBody): void {
  for (const f of DERIVED_FIELDS) delete (body as any)[f];
  // Classification is re-derived from physics.
  body.classes = [];
  // Derived sub-structures.
  if (body.hydrosphere) delete (body.hydrosphere as any).layers;
  if (body.atmosphere) { delete (body.atmosphere as any).molarMassKg; delete (body.atmosphere as any).scaleHeightKm; }
  // Tags: keep only authored ones.
  if (Array.isArray(body.tags)) body.tags = body.tags.filter((t: Tag) => !isInterferingTag(t.key));
}

// Fix up a single system in place (and return it). Caller should re-run systemProcessor.process().
export function fixUpImportedSystem(system: System): System {
  for (const node of system.nodes) {
    if (node.kind === 'body') stripBody(node as CelestialBody);
    // Auto-generated barycentres are reconciled by the processor; drop them so they don't duplicate.
    if (node.kind === 'barycenter' && (node as any).tags?.some?.((t: Tag) => t.key === 'barycenter/auto')) {
      (node as any).__autoBary = true;
    }
  }
  // Remove auto barycentres (the processor regenerates them from the orbital hierarchy).
  system.nodes = system.nodes.filter((n) => !(n as any).__autoBary);
  return system;
}
