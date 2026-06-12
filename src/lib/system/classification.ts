// src/lib/system/classification.ts
import type { CelestialBody, Barycenter, RulePack, Expr, Feature, Fingerprint, FingerprintBand } from "../types";

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

function bandFit(value: number | string | undefined, band: FingerprintBand): number {
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
  modifiers: { class: string; score: number }[];
  fallback: boolean;
}

// Explain WHY a body classified as it did: the winning base type, the defining bands it matched
// (with the body's value + fit), the runner-up it beat, and any stacked modifiers.
export function explainClassification(
  features: Record<string, number | string>,
  fingerprints: Fingerprint[]
): ClassExplanation {
  const scored = fingerprints
    .map((fp) => ({ fp, score: fingerprintScore(features, fp) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  const bases = scored.filter((s) => s.fp.kind === 'base');
  const base = bases[0];

  if (!base) {
    return {
      base: (features['mass_Me'] as number) > 10 ? 'planet/gas-giant' : 'planet/terrestrial',
      baseScore: 0, bands: [], modifiers: [], fallback: true
    };
  }

  const bands: ClassBandMatch[] = Object.entries(base.fp.match).map(([feature, band]) => ({
    feature,
    value: features[feature] ?? '—',
    band: bandToStr(band),
    fit: +bandFit(features[feature], band).toFixed(2)
  }));
  const modifiers = scored
    .filter((s) => s.fp.kind === 'modifier' && s.score >= 0.6)
    .map((s) => ({ class: s.fp.class, score: +s.score.toFixed(2) }));

  return {
    base: base.fp.class,
    baseScore: +base.score.toFixed(2),
    bands,
    runnerUp: bases[1] ? { class: bases[1].fp.class, score: +bases[1].score.toFixed(2) } : undefined,
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
  // Best base archetype first (mutually exclusive).
  const base = scored.find((s) => s.fp.kind === 'base');
  if (base) out.push(base.fp.class);
  // Then stack modifiers that are a real match (not a margin sliver).
  for (const s of scored) {
    if (s.fp.kind === 'modifier' && s.score >= 0.6 && !out.includes(s.fp.class)) out.push(s.fp.class);
    if (out.length >= maxClasses) break;
  }

  if (out.length === 0) {
    out.push((features['mass_Me'] as number) > 10 ? 'planet/gas-giant' : 'planet/terrestrial');
  }
  return out;
}

// Helper function to recursively evaluate classifier expressions
function evaluateExpr(features: Record<string, number | string>, expr: Expr, tags: {key: string, value?: any}[]): boolean {
    if (expr.all) return expr.all.every((e: Expr) => evaluateExpr(features, e, tags));
    if (expr.any) return expr.any.some((e: Expr) => evaluateExpr(features, e, tags));
    if (expr.not) return !evaluateExpr(features, expr.not, tags);
    if (expr.gt) return (features[expr.gt[0]] ?? -Infinity) > expr.gt[1];
    if (expr.lt) return (features[expr.lt[0]] ?? Infinity) < expr.lt[1];
    if (expr.between) {
        const val = features[expr.between[0]];
        return val !== undefined && val >= expr.between[1] && val <= expr.between[2];
    }
    if (expr.eq) return features[expr.eq[0]] === expr.eq[1];
    if (expr.hasTag) return tags.some(t => t.key === expr.hasTag);
    return false;
}

export function classifyBody(planet: CelestialBody, features: Record<string, number | string>, pack: RulePack, allNodes: (CelestialBody | Barycenter)[]): string[] {
  if (!pack.classifier) return [];

    const planetId = features['id'] as string;
    const hasRing = allNodes.some(n => n.parentId === planetId && n.kind === 'body' && (n as CelestialBody).roleHint === 'ring');
    features['has_ring_child'] = hasRing ? 1 : 0;

    // Phase 04: prefer the per-type fingerprint engine when the rulepack provides one.
    if (pack.classifier.fingerprints && pack.classifier.fingerprints.length > 0) {
        return classifyByFingerprint(features, pack.classifier.fingerprints, pack.classifier.maxClasses || 4);
    }

    const scores: Record<string, number> = {};

    for (const rule of pack.classifier.rules) {
        if (evaluateExpr(features, rule.when, planet.tags)) {
            scores[rule.addClass] = (scores[rule.addClass] || 0) + rule.score;
        }
    }

    const sortedClasses = Object.entries(scores)
        .filter(([, score]) => score >= (pack.classifier?.minScore || 10))
        .sort((a, b) => b[1] - a[1]);

    // Mutually exclusive base archetypes
    // We prioritize the highest scoring one and discard the rest.
    const baseArchetypes = new Set([
        'planet/terrestrial', 'planet/gas-giant', 'planet/ice-giant', 
        'planet/dwarf-planet', 'planet/super-earth', 'planet/mini-neptune',
        'planet/hot-jupiter', 'planet/cold-jupiter', 'planet/warm-jupiter',
        'planet/cloudless-gas-giant', 'planet/ammonia-clouds-gas-giant', 'planet/water-clouds-gas-giant',
        'planet/silicate-clouds-gas-giant', 'planet/alkali-metal-clouds-gas-giant',
        'planet/protoplanet', 'planet/brown-dwarf', 'planet/rogue'
    ]);

    const finalClasses: string[] = [];
    let hasBase = false;

    for (const [cls, score] of sortedClasses) {
        if (baseArchetypes.has(cls)) {
            if (!hasBase) {
                finalClasses.push(cls);
                hasBase = true;
            }
            // Else: Skip other base types (e.g. if we are Ice Giant, skip Gas Giant)
        } else {
            // Always include modifiers (ringed, eyeball, etc.)
            finalClasses.push(cls);
        }
        
        if (finalClasses.length >= (pack.classifier?.maxClasses || 3)) break;
    }

    // Start with the most likely class, but also add generic fallbacks.
    if (finalClasses.length === 0) {
        if ((features['mass_Me'] as number) > 10) {
            finalClasses.push('planet/gas-giant');
        } else {
            finalClasses.push('planet/terrestrial');
        }
    }
    return finalClasses;
}
