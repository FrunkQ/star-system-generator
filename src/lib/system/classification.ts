// src/lib/system/classification.ts
import type { CelestialBody, Barycenter, RulePack, Fingerprint, FingerprintBand } from "../types";

// --- Fingerprint classifier (Phase 04) ---------------------------------------------------
// Each planet type is a fingerprint: the parameter bands that define it. A body's fit to a
// band is 1.0 inside the band, decaying linearly outside it over a relative margin, and 0
// beyond that (which disqualifies the whole fingerprint — a body fully outside a defining
// parameter is not that type). A fingerprint's score is the MEAN of its band fits times a
// mild specificity bonus for band count: among CLEAN matches, more matched bands still wins
// (specific beats generic), but a band-rich catch-all whose extra bands are barely-true
// edge slivers can no longer out-score a perfect match on fewer bands (summing fits let
// barren/desert steal Venus-class and dwarf-planet-class worlds). The best-scoring BASE
// archetype is chosen (mutually exclusive); MODIFIERS (ringed, eyeball, …) stack on top.

export function bandFit(value: number | string | undefined, band: FingerprintBand): number {
  // Categorical band: a string or list of accepted strings → exact (hard) match.
  if (typeof band === 'string') return value === band ? 1 : 0;
  if (Array.isArray(band) && (typeof band[0] === 'string' || typeof band[1] === 'string')) {
    return (band as string[]).includes(value as string) ? 1 : 0;
  }
  // Numeric band [lo, hi].
  const [lo, hi] = band as [number, number];
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  if (value >= lo && value <= hi) return 1;
  // Soft edge measured RELATIVE to the boundary it crossed (tol = 15%). Mass/radius/temp
  // span orders of magnitude, so an absolute (band-width) margin is wrong — a 0.02-Me moon
  // must NOT half-match a 50–4000 Me gas-giant band. Relative distance fixes that.
  const TOL = 0.15;
  if (value < lo) {
    const ref = lo !== 0 ? Math.abs(lo) : (hi !== 0 ? Math.abs(hi) : 1);
    return Math.max(0, 1 - ((lo - value) / ref) / TOL);
  }
  const refHi = hi !== 0 ? Math.abs(hi) : 1;
  return Math.max(0, 1 - ((value - hi) / refHi) / TOL);
}

function fingerprintScore(features: Record<string, number | string>, fp: Fingerprint): number {
  // GATES first, and they are scored differently on purpose (see Fingerprint.gate). A gate is a
  // precondition — "does this body have a surface at all" — not a defining trait, so failing one
  // rules the type out entirely while passing one earns nothing. Expressing a gate as a match band
  // instead would make it always-true for every survivor, and an always-true band pulls a poor
  // defining band UP by averaging: fit 0.11 gains 37%, fit 1.0 gains 8%. That inverts the whole
  // point of the scoring redesign in the header, which was to stop weak bands padding a score.
  for (const [feat, band] of Object.entries(fp.gate ?? {})) {
    if (bandFit(features[feat], band) <= 0) return 0;
  }
  let sum = 0;
  let n = 0;
  for (const [feat, band] of Object.entries(fp.match)) {
    const fit = bandFit(features[feat], band);
    if (fit <= 0) return 0; // fully outside a defining band → not this type
    sum += fit;
    n++;
  }
  if (n === 0) return 0;
  // Mean fit × specificity bonus (see header). For all-perfect matches this preserves the
  // old band-count ordering; partial fits now drag the score down instead of padding it up.
  return (sum / n) * (1 + 0.1 * n) * (fp.weight ?? 1);
}

// Human-readable form of a fingerprint band, for the "why this type" explanation.
function bandToStr(band: FingerprintBand): string {
  if (typeof band === 'string') return band;
  if (Array.isArray(band) && typeof band[0] === 'string') return (band as string[]).join(' | ');
  const [lo, hi] = band as [number, number];
  return `${lo} – ${hi}`;
}

export interface ClassBandMatch { feature: string; value: number | string; band: string; fit: number }
export interface ClassExplanation {
  base: string;
  baseScore: number;
  bands: ClassBandMatch[];
  runnerUp?: { class: string; score: number };
  // ranked base types that scored > 0 (winner first); each carries its OWN band fits so the Newton
  // panel can show "why" for whichever candidate you click, not just the winner.
  candidates: { class: string; score: number; bands: ClassBandMatch[] }[];
  borderline: boolean;                              // runner-up scored within ~10% of the winner — a coin-toss the GM may want to settle
  modifiers: { class: string; score: number }[];
  fallback: boolean;
}

// How close the runner-up must be (fraction of the winner's score) to call a classification borderline.
export const BORDERLINE_RATIO = 0.9;

// Does this body fall INSIDE every band the type defines, with nothing on a soft edge?
function isCleanMatch(features: Record<string, number | string>, fp: Fingerprint): boolean {
  for (const [feat, band] of Object.entries(fp.match)) {
    if (bandFit(features[feat], band) < 1) return false;
  }
  return true;
}

// B16 — A PERFECT MATCH BEATS A PARTIAL ONE, whatever the arithmetic says.
//
// The score is `mean fit x (1 + 0.1 x bands) x weight`, reshaped so that "partial fits drag the
// score down instead of padding it up". That holds only while WEIGHTS ARE EQUAL. Give one type a
// heavy enough weight and a single band on a soft edge can still beat a type the body sits cleanly
// inside: at weight 1.5, earth-analogue with one band at fit 0.689 (Testion's jungle body, 314 K
// against a 255-300 K band) scored 2.11 against a PERFECT jungle at 2.10. B15 worked around that by
// picking 1.45 instead — a weight chosen so it could not happen, which means every future weight
// change has to re-derive the same inequality by hand or quietly reintroduce the bug.
//
// So the rule is stated once, as an ordering rather than a number: a type the body matches
// COMPLETELY outranks a type it matches partially, and score only decides within a tier. Weights
// keep doing what they are for — ranking types that all fit — and can no longer buy a type past a
// better-fitting rival.
function compareBases(
  features: Record<string, number | string>,
  a: { fp: Fingerprint; score: number },
  b: { fp: Fingerprint; score: number }
): number {
  const ca = isCleanMatch(features, a.fp), cb = isCleanMatch(features, b.fp);
  if (ca !== cb) return ca ? -1 : 1;
  return b.score - a.score;
}

// Explain WHY a body classified as it did: the winning base type, the defining bands it matched
// (with the body's value + fit), the runner-up it beat, and any stacked modifiers.
/**
 * THE LAST RESORT, and it has to be honest about being one.
 *
 * `(features['mass_Me'] as number) > 10 ? 'planet/gas-giant' : 'planet/terrestrial'` looks like a
 * threshold and behaves like a default: in JavaScript `undefined > 10` is FALSE, so a body whose mass
 * is missing or NaN fell to the TERRESTRIAL branch and came back a confident rocky planet however
 * massive it actually was. A brown dwarf entered by hand with no mass became Earth's cousin.
 *
 * A fallback is not wrong to exist — a classifier needs one — it is wrong to express it as a class
 * the numbers never supported. So an unknown mass now says UNCLASSIFIED, which is the true answer,
 * and only a KNOWN mass earns a guess. ("Absent is not typical" — the fourth instance of this shape,
 * after an unknown star defaulting to M, a borrowed age, and unweathered-is-not-unmeasured.)
 *
 * Shared by both call sites deliberately: the explanation path must name the same winner the body
 * actually carries, and two copies of a fallback is how they stop agreeing.
 */
export function fallbackBaseClass(features: Record<string, unknown>): string {
  const m = features['mass_Me'];
  if (typeof m !== 'number' || !Number.isFinite(m)) return 'planet/unclassified';
  return m > 10 ? 'planet/gas-giant' : 'planet/terrestrial';
}

export function explainClassification(
  features: Record<string, number | string>,
  fingerprints: Fingerprint[]
): ClassExplanation {
  const scored = fingerprints
    .map((fp) => ({ fp, score: fingerprintScore(features, fp) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  // Same ordering classifyByFingerprint uses, or the explanation would name a different winner
  // than the class the body actually carries.
  const bases = scored.filter((s) => s.fp.kind === 'base').sort((a, b) => compareBases(features, a, b));
  const base = bases[0];

  if (!base) {
    return {
      base: fallbackBaseClass(features),
      baseScore: 0, bands: [], candidates: [], borderline: false, modifiers: [], fallback: true
    };
  }

  const bandsForFp = (fp: Fingerprint): ClassBandMatch[] =>
    Object.entries(fp.match).map(([feature, band]) => ({
      feature,
      value: features[feature] ?? '—',
      band: bandToStr(band),
      fit: +bandFit(features[feature], band).toFixed(2)
    }));

  const candidates = bases.slice(0, 5).map((s) => ({ class: s.fp.class, score: +s.score.toFixed(2), bands: bandsForFp(s.fp) }));
  const borderline = bases.length > 1 && bases[1].score >= base.score * BORDERLINE_RATIO;

  const bands = bandsForFp(base.fp);
  const modifiers = scored
    .filter((s) => s.fp.kind === 'modifier' && s.score >= 0.6)
    .map((s) => ({ class: s.fp.class, score: +s.score.toFixed(2) }));

  return {
    base: base.fp.class,
    baseScore: +base.score.toFixed(2),
    bands,
    runnerUp: bases[1] ? { class: bases[1].fp.class, score: +bases[1].score.toFixed(2) } : undefined,
    candidates,
    borderline,
    modifiers,
    fallback: false
  };
}

export function classifyByFingerprint(
  features: Record<string, number | string>,
  fingerprints: Fingerprint[],
  maxClasses: number
): string[] {
  const scored = fingerprints
    .map((fp) => ({ fp, score: fingerprintScore(features, fp) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const out: string[] = [];
  // Best base archetype first (mutually exclusive) — a complete match outranks a partial one (B16),
  // and score decides only within a tier. Modifiers below are chosen by threshold, not by rank, so
  // they keep the plain score ordering.
  const base = [...scored].filter((s) => s.fp.kind === 'base').sort((a, b) => compareBases(features, a, b))[0];
  if (base) out.push(base.fp.class);
  // Then stack modifiers that are a real match (not a margin sliver).
  for (const s of scored) {
    if (s.fp.kind === 'modifier' && s.score >= 0.6 && !out.includes(s.fp.class)) out.push(s.fp.class);
    if (out.length >= maxClasses) break;
  }

  if (out.length === 0) {
    out.push(fallbackBaseClass(features));
  }
  return out;
}

export function classifyBody(planet: CelestialBody, features: Record<string, number | string>, pack: RulePack, allNodes: (CelestialBody | Barycenter)[]): string[] {
  if (!pack.classifier) return [];

    const planetId = features['id'] as string;
    const hasRing = allNodes.some(n => n.parentId === planetId && n.kind === 'body' && (n as CelestialBody).roleHint === 'ring');
    features['has_ring_child'] = hasRing ? 1 : 0;

    // ONE classification engine. The additive `classifier.rules[]` seam that used to sit below this
    // is GONE (inbox B67 / D12) — see `warnIfLegacyRules` for what a pack author is told.
    return classifyByFingerprint(features, pack.classifier.fingerprints ?? [], pack.classifier.maxClasses || 4);
}

// A pack that still ships `classifier.rules` gets told, once, that they are not read. Silence here
// was the whole problem: the rules looked live, and a pack without fingerprints would have been
// quietly classified by a copy of the engine that predates two corrections (B6's move onto surface
// temperature, B25's surface gate) and carried a rule that called any small hot world a stripped
// gas-giant core.
const warnedPacks = new Set<string>();
export function warnIfLegacyRules(pack: RulePack): void {
    const legacy = (pack.classifier as unknown as { rules?: unknown[] })?.rules;
    if (!legacy?.length) return;
    const id = pack.id ?? 'unnamed pack';
    if (warnedPacks.has(id)) return;
    warnedPacks.add(id);
    console.warn(
      `[classifier] "${id}" ships ${legacy.length} legacy classifier.rules. They are NOT read — ` +
      'the fingerprint engine is the only classifier. Express each rule as a fingerprint ' +
      '(class + kind + match bands); a pack with no fingerprints falls back to one base class by mass.'
    );
}

