// src/lib/system/classification.ts
import type { CelestialBody, Barycenter, RulePack, Expr, Feature } from "../types";

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
