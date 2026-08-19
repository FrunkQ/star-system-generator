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
import { giantComposition, GIANT_ANCHOR_BAR } from '$lib/physics/giantTraces';
import { makeupFractions } from '$lib/physics/makeup';
import { survivesRederive } from '$lib/tags/tagLifecycle';
import { inferAxialTilt, bodyCanHaveTilt } from '$lib/physics/axialTilt';
import { spinProvenanceTags } from '$lib/generation/spinProvenance';
import { starClassParts, starClassKeyFor, isBandKey } from '$lib/physics/starDesignation';
import { luminosityClassFromPosition } from '$lib/system/starBandMatch';
import { determineSpectralClass } from '$lib/physics/stellar-evolution';
import { SOLAR_RADIUS_KM } from '$lib/constants';
import { stripUndoHistory } from '$lib/undo/historyKey';

// Derived fields the processor recomputes — never trust them from an old file. (Also stripped on EXPORT
// so saved files carry only authored INPUTS and stay small — the load path re-derives all of this.)
//
// DATA-R8: EVERY NAME IN THIS LIST IS A FOSSIL IN A SAVED FILE. Reading one out of
// `static/example-starmaps/**` or `static/examples/**` and concluding anything from it measures what
// some earlier build believed, not what the app shows — the load path deletes it and re-derives.
// Audit through `systemProcessor.process(fixUpImportedSystem(sys, pack), pack)` instead. This has
// produced two wrong findings (`classes`, then `makeup`) on consecutive days.
const DERIVED_FIELDS = [
  'calculatedGravity_ms2', 'calculatedRotationPeriod_s', 'orbital_period_days', 'distanceToHost_km',
  'equilibriumTempK', 'equilibriumTempMinK', 'equilibriumTempMaxK', 'greenhouseTempK', 'temperatureK',
  'temperatureRangeK', 'temperatureProfile', 'tidalHeatK', 'radiogenicHeatK', 'internalHeatK',
  'surfaceRadiation', 'surfaceRadiationMin', 'surfaceRadiationMax', 'radiationShieldingMag',
  'radiationShieldingAtmo', 'totalIncidentFlux', 'totalIncidentFluxMin', 'totalIncidentFluxMax', 'starlightFlux',
  // Legacy names for the same three fields, kept so a saved file or bundled map written before B34
  // sheds them instead of carrying a stale figure under a name nothing reads any more.
  'stellarRadiation', 'stellarRadiationMin', 'stellarRadiationMax',
  'photonRadiation', 'particleRadiation', 'habitabilityScore', 'habitabilityBreakdown', 'orbitalBoundaries',
  'loDeltaVBudget_ms', 'propulsiveLandBudget_ms', 'aerobrakeLandBudget_ms',
  'apparentColorHex', 'apparentColor', 'magnetism', 'geoActivity', 'albedoBreakdown', 'classification',
  'albedo',  // now derived from makeup + clouds; an old pinned value would override the model
  'oblateness',  // derived from spin vs density-set breakup limit
  // Substellar self-luminosity (brown dwarfs) — all re-derived by the processor's substellar pass.
  'isSelfLuminous', 'selfLuminousTeffK', 'internalLuminositySolar',
  // A star's radiationOutput (its luminosity) is authored input and is KEPT for stars (see stripBody);
  // on a planet it's a derived brown-dwarf luminosity, so strip it there.
  'radiationOutput',
  // B82, and every one of these was MEASURED rather than read: see `derivedFieldDrift.spec.ts`,
  // which diffs a body's key set across `process()` and fails on any field not classified here or
  // in NOT_STRIPPED below. The list had drifted eight releases behind the engine; this is the half
  // that is purely derived, with nothing authored to protect.
  'orbitalRadiation', 'irradiationDose', 'volatiles', 'surfaceSpectrum', 'vegetation',
  'beltInnerEdgeRadii', 'auroraEmitters', 'flareActivity',
  'resonanceNote', 'resonanceProtective', 'resonanceTidal', 'starTidallyLocked',
  'orbitalStability', 'orbitalStabilityDetails'
];

// FIELDS THE PROCESSOR WRITES THAT ARE DELIBERATELY *NOT* STRIPPED, each with the reason. The drift
// guard reads this list, so adding a name here is a DECLARATION that survives review — which is the
// whole point: B82 happened because there was no way to tell 'authored' from 'nobody has looked yet'.
export const NOT_STRIPPED: Record<string, string> = {
  hydrosphere: 'AUTHORED: the GM sets composition and coverage (BodyHydrosphereTab). Only the derived',
  atmosphere: 'AUTHORED: composition and pressure are input. molarMassKg/scaleHeightKm are stripped below.',
  orbit: 'AUTHORED: the elements are input. The derived `resonance` cache is stripped below.',
  image: 'AUTHORED: the GM can set a URL (BodyBasicsTab). The classifier overwrites it on process - see B82.',
  classes: 'HANDLED SEPARATELY below: cleared, except a star spectral class or a GM-pinned type.',
  tags: 'HANDLED SEPARATELY below by namespace. On a CONSTRUCT the processor only writes an empty [].',
  magneticField: 'CONDITIONAL below: authored for a star and for a GM manual field; derived otherwise.',
  tidallyLocked: 'CONDITIONAL below: derived unless the GM pinned it with tidalLockManual.',
  rotation_period_hours: 'AUTHORED: the engine rewrites it for a LOCKED body, but it is input for a spin-orbit resonance and stripping it made Mercury an eyeball world (B82).'
};

// Tag namespaces the processor owns (re-derived every run).
const DERIVED_TAG_PREFIXES = [
  'geology/', 'magnetic/', 'structure/', 'tidal/', 'habitability/', 'climate/', 'stability/', 'barycenter/', 'shape/', 'aurora/', 'thermal/',
  'resonance/', 'fate/', 'volatiles/', 'surface/',  // re-derived every run (resonance/stability/volatile/surface-age passes)
  'hazard/'  // B82: hazard/radiation, hazard/orbital-radiation and hazard/flaring are all written by the processor
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
  // A STAR's temperatureK is its EFFECTIVE TEMPERATURE — an authored INPUT (it defines the spectral class,
  // like mass/radius), NOT a derived planet surface temp. The processor re-derives planet temps but never a
  // star's, so stripping it left loaded stars at 0 K. Keep it for stars; strip it (and the rest) for others.
  const isStar = body.roleHint === 'star';
  // MIGRATION: radiogenic heat used to be an editable field on the body (stripped on load → lost). It's
  // now a GM OVERRIDE (body.overrides.radiogenicHeatK) that persists. Recover any still-present authored
  // value into the override before the strip below removes it.
  const legacyRadiogenic = (body as any).radiogenicHeatK;
  if (typeof legacyRadiogenic === 'number' && legacyRadiogenic > 0 && body.overrides?.radiogenicHeatK == null) {
    body.overrides = body.overrides || {};
    body.overrides.radiogenicHeatK = legacyRadiogenic;
  }
  // MIGRATION: axial tilt had TWO field names for one quantity. `axial_tilt_deg` is the one the
  // editor, the renderers and the moon-plane rule all use; `obliquity_deg` was read only by the
  // seasonal-temperature term, and the two importers disagreed about which to write (ubox wrote only
  // the second, so its worlds had seasons but no visible tilt). Everything reads `axial_tilt_deg`
  // now, so recover the legacy name into it rather than leaving those saves tiltless.
  const legacyObliquity = (body as any).obliquity_deg;
  if (typeof legacyObliquity === 'number' && Number.isFinite(legacyObliquity) && body.axial_tilt_deg == null) {
    body.axial_tilt_deg = legacyObliquity;
  }
  delete (body as any).obliquity_deg;
  for (const f of DERIVED_FIELDS) {
    // A star's effective temperature AND its luminosity (radiationOutput) are authored INPUTS that
    // define it (like mass/radius) and are never re-derived on load — keep them; strip for everyone else.
    if (isStar && (f === 'temperatureK' || f === 'radiationOutput')) continue;
    delete (body as any)[f];
  }
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
  } else if (body.autoClassify === false) {
    // A GM who turned auto-classify OFF has PINNED the type — that's authored end-state data, not stale
    // derived data, so keep it (as we do for a star's spectral class). Without this the class is wiped
    // and the processor re-derives it (its guard re-classifies when classes is empty), silently losing a
    // hand-picked type on every save→load. Only genuine planet/* classes survive; a legacy class-as-tag
    // or empty pick still falls through to the re-derive path below.
    body.classes = (body.classes ?? []).filter((c) => typeof c === 'string' && c.startsWith('planet/'));
  } else {
    body.classes = [];
  }
  // Derived sub-structures.
  if (body.hydrosphere) delete (body.hydrosphere as any).layers;
  if (body.atmosphere) { delete (body.atmosphere as any).molarMassKg; delete (body.atmosphere as any).scaleHeightKm; }
  if (body.orbit) delete (body.orbit as any).resonance;   // B82: derived by the resonance pass

  // B82 — THE THREE THAT A FLAT LIST CANNOT EXPRESS, because each is derived for most bodies and
  // AUTHORED for some. This is why the item could not be closed by adding eight names to the list.
  //
  // (1) A MAGNETIC FIELD is derived for a planet or moon, but it is authored twice over: a STAR's is
  // never re-derived on load (measured: the processor writes `magneticField` for moons and planets
  // only), so stripping it would zero every star exactly as stripping `temperatureK` once did; and a
  // GM can set one by hand, which `magnetism.ts` reads through `field.manual` to tell an anomalous
  // field from a dynamo. Both of those are input; the rest is a fossil.
  if (!isStar && !(body as any).magneticField?.manual) delete (body as any).magneticField;

  // (2) TIDAL LOCK is decided by the engine unless the GM pinned it (`tidalLockManual`, set by any
  // hand-set rate or lock in BodyBasicsTab).
  const lockPinned = !!(body as any).tidalLockManual;
  const wasLocked = !!(body as any).tidallyLocked;
  if (!lockPinned) delete (body as any).tidallyLocked;

  // (3) ROTATION PERIOD IS NOT STRIPPED, AND THE MEASUREMENT IS WHY — B82 recommended stripping it
  // on a locked body and that is WRONG. It is true that the engine rewrites it for a locked body
  // (Luna's moved 659.0 h -> 538.1 h when Earth gained mass, which is what B82 saw). But it is
  // AUTHORED input for a body in a SPIN-ORBIT RESONANCE, and the processor cannot tell the two
  // apart without the value it would have just deleted. Stripping it cost Mercury its real 1407.6 h
  // day: the engine read the missing period as a synchronous lock, gave it its 88-day year instead,
  // and RECLASSIFIED it from planet/terrestrial to planet/hot-eyeball, moving its habitability from
  // 32.9 to 40. Caught by `systemUndo.spec.ts`'s round-trip, which is the test that exists to prove
  // the strip is lossless. It stays, and it is declared in NOT_STRIPPED.
  // Tags: keep only authored ones.
  //
  // survivesRederive() first, and it is a FIX rather than a tidy-up: this filter never checked the
  // manual flag, so a tag the GM added by hand inside a derived namespace — exactly what the override
  // mechanism produces — was deleted here, on import AND on save, silently. It relied on hand-added
  // tags never looking derived, which stops being true the moment a GM is allowed to override the
  // physics. It also means a free-text tag with a capital in it ("Smugglers", which the Tags tab
  // offers as its own example) now survives a save instead of being read as a legacy display-name tag.
  if (Array.isArray(body.tags)) body.tags = body.tags.filter((t: Tag) => survivesRederive(t) || !isInterferingTag(t.key, classNames));
}

// Fix up a single system in place (and return it). Caller should re-run systemProcessor.process().

// MIGRATION: giants saved before the cloud model had nothing in them TO condense.
//
// Two things are wrong with an old giant, and only one of them heals itself. Its quoted pressure —
// commonly 100000 bar, sometimes 200000 — is handled at read time, because the temperature beside it
// has always been the ~1 bar reading and the profile simply anchors there. But its COMPOSITION is
// missing data: bulk H2/He with, at best, methane. Nothing else was ever written, so nothing else
// can condense, and Saturn comes out with an empty sky instead of the ammonia compound that makes it
// gold. That cannot be re-derived; it has to be filled in.
//
// Deliberately narrow. We only touch a giant whose atmosphere carries NO cloud-forming gas beyond
// methane AND is otherwise essentially all hydrogen and helium — the exact fingerprint of the old
// default. A giant somebody actually authored, with sulphur or water or an ammonia figure of their
// own, is left completely alone. And the fill is the repeatable mid-range mix, not a random roll: a
// repair should give the same answer every time it runs.
const OLD_DEFAULT_GASES = new Set(['H2', 'He', 'CH4']);

function backfillGiantAtmosphere(body: CelestialBody): void {
  const atm = body.atmosphere;
  if (!atm?.composition) return;
  if (makeupFractions(body).gas <= 0.5) return;                 // not a giant: it has a surface
  const gases = Object.entries(atm.composition).filter(([, v]) => (v ?? 0) > 0);
  if (!gases.length) return;
  if (!gases.every(([g]) => OLD_DEFAULT_GASES.has(g))) return;  // authored something of their own
  const bulk = gases.reduce((sum, [g, v]) => sum + (g === 'H2' || g === 'He' ? (v ?? 0) : 0), 0);
  if (bulk < 0.9) return;                                       // not the old default shape
  atm.composition = giantComposition(body.massKg);
  atm.pressure_bar = GIANT_ANCHOR_BAR;
  delete (atm as any).molarMassKg;                              // recomputed from the new mix
}

// A world that arrives with no spin axis gets a plausible one, from the SAME model the generator
// uses — and says so.
//
// D8, and it is two populations rather than the six fiction worlds the entry started from:
//  - 45 real-sky imported exoplanets. Obliquity is essentially unmeasurable for an exoplanet, so no
//    catalogue will ever carry one; the alternative to inferring is having none, forever.
//  - ~50 hand-authored fiction worlds, where nobody ever wrote one down.
// Sol is untouched: all 9 planets and 19 moons carry real, measured obliquities, and an authored
// value is never overwritten.
//
// WHY THIS IS NOT INVENTING DATA, which is the line D2a draws: the value is DERIVED (deterministic
// from the body's id, so a reload or re-import reproduces it) and it is TAGGED `spin/axis-inferred`,
// which is exactly the mechanism `spinProvenance.ts` exists to provide — "an invented number must be
// distinguishable from a measured one, or a generated world sitting in the same starmap as Earth
// asserts its obliquity just as firmly". What it replaces is worse on both counts: the seasonal term
// silently substituted a flat 25 deg for any body with no tilt, which is an invented number with no
// provenance at all, and it was the same 25 deg for every world.
function inferMissingAxialTilt(body: CelestialBody, pack?: RulePack): void {
  if (!bodyCanHaveTilt(body.roleHint)) return;      // belts, rings, stars, constructs have no spin axis
  if (body.axial_tilt_deg != null) return;          // authored or measured — never overwritten
  if (!body.id) return;
  const { tiltDeg, tipped } = inferAxialTilt(body.id, pack);
  body.axial_tilt_deg = tiltDeg;
  body.tags = body.tags ?? [];
  for (const t of spinProvenanceTags(body)) {
    if (!body.tags.some((x) => x.key === t.key)) body.tags.push(t);
  }
  if (tipped && !body.tags.some((x) => x.key === 'spin/tipped')) body.tags.push({ key: 'spin/tipped' });
}

// THE LEGACY CLASS CLEANER — a bare letter is a BAND, and a body may not hold one (inbox B60).
//
// Owner, 2026-08-16: "O is dead, O1a is valid." A band is the range a draw comes from; a designation
// is what a particular star IS, and `star/G` is not something a star can be. Every star saved before
// v2.1.693 holds one, so the load path resolves it.
//
// IT NEEDS NO MAPPING TABLE, IT NEEDS TO RUN THE CLASSIFIER, and that classifier already exists and
// is tested: a body holding `star/G` has a temperature and a radius, and `matchStarBand` returns the
// luminosity class from that position — the same bands generation draws from, which is what makes
// classification the inverse of generation rather than a second opinion (B48 section 10).
//
// AN AUTHORED STAR IS NOT RECLASSIFIED, IT IS RESOLVED. Hand authoring is hand authoring: a GM who
// set `star/K` keeps K and gets the digit its own temperature states — `star/K3V`, never `star/G2V`
// because the physics disagrees with them. If the parameters really are impossible for a K, the
// implausibility pass says so in a tag, which is this engine's answer everywhere: refuse to PRODUCE,
// never refuse to ACCEPT.
//
// AUTHORED IS THE DEFAULT HERE, AND THE TEST IS `autoClassify` BEING TRUTHY — the same rule
// `SystemProcessor` applies before it commits a classification ("only the engine's own creations or
// class-less bodies get (re)classified"). One rule, two places, rather than a second opinion about
// whose data this is. A star the ENGINE made says so and gets the full readout; a star that arrived
// in a save file keeps its letter. The owner's "a star's designation is a readout of its physics"
// governs what a NEW star defaults to in the editor, not what a load may overwrite.
//
// A GIANT, A SUPERGIANT AND A REMNANT ARE ALREADY WHAT THEY CAN BE. `star/K-III` states everything
// the main-sequence subclass ladder lets us say about a K giant, and a white dwarf's identity is a
// track rather than a position (PHY-14), so both are left exactly as they are.
function resolveLegacyStarClass(body: CelestialBody, pack?: RulePack): void {
  if (body.roleHint !== 'star') return;
  const held = body.classes?.[0];
  if (!held || !held.startsWith('star/') || !isBandKey(held)) return;   // already a designation, or a remnant
  const parts = starClassParts(held);
  if (!parts.letter) return;
  const tempK = body.temperatureK ?? 0;
  if (!(tempK > 0)) return;                                            // nothing to resolve it from
  // PINNED: keep the authored letter and its stated class, and fill in only the digit.
  // DERIVED: ask the classifier where this star actually sits, which is the whole point of a
  // designation being a READOUT of the physics (owner's second answer, same exchange).
  const authored = !body.autoClassify;
  const radiusSolar = (body.radiusKm ?? 0) / SOLAR_RADIUS_KM;
  const band = authored
    ? (parts.band ?? 'V')
    : (luminosityClassFromPosition(pack, { temperatureK: tempK, radiusSolar }) ?? parts.band ?? 'V');
  // The pack's anchors carry L/T/Y; without them the ladder ends at M and a brown dwarf reads as one.
  const letter = authored ? parts.letter : (starClassParts(`star/${determineSpectralClass(tempK, pack)}`).letter ?? parts.letter);
  const key = starClassKeyFor({ letter, tempK, band }, pack);
  if (key === held) return;
  body.classes = [key, ...(body.classes ?? []).slice(1).filter((c) => c !== key)];
}

export function fixUpImportedSystem(system: System, pack?: RulePack): System {
  const classNames = classNamesFromPack(pack);
  for (const node of system.nodes) {
    if (node.kind !== 'body') continue;
    stripBody(node as CelestialBody, classNames);
    backfillGiantAtmosphere(node as CelestialBody);
    inferMissingAxialTilt(node as CelestialBody, pack);
    resolveLegacyStarClass(node as CelestialBody, pack);
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

// Strip derived data from a CLONE of a system — for SAVING. Uses the SAME field/tag strip as the import
// fix-up, so it is symmetric and lossless (the load path re-derives all of it), but on a copy and WITHOUT
// the barycentre reconciliation (a load-time heal). Result carries only authored INPUTS, so saved files
// stay small and never ship stale derived physics.
export function stripSystemForExport(system: System, pack?: RulePack): System {
  const clone = JSON.parse(JSON.stringify(system)) as System;
  stripUndoHistory(clone);   // GM-private, never leaves this browser (G28)
  const classNames = classNamesFromPack(pack);
  for (const node of clone.nodes ?? []) {
    if (node.kind === 'body') stripBody(node as CelestialBody, classNames);
  }
  return clone;
}

// Same, for a whole starmap (every embedded system). Returns a stripped CLONE; the original is untouched.
export function stripStarmapForExport<T extends { systems?: Array<{ system?: System }> }>(
  starmap: T,
  pack?: RulePack
): T {
  const clone = JSON.parse(JSON.stringify(starmap)) as T;
  stripUndoHistory(clone);   // GM-private, never leaves this browser (G28)
  const classNames = classNamesFromPack(pack);
  for (const node of clone.systems ?? []) {
    for (const body of node?.system?.nodes ?? []) {
      if ((body as CelestialBody).kind === 'body') stripBody(body as CelestialBody, classNames);
    }
  }
  return clone;
}
