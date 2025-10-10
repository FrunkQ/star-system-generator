// src/lib/system/classification.ts
import type { CelestialBody, Barycenter, RulePack, Expr, Feature } from "../types";

// Helper function to recursively evaluate classifier expressions
function evaluateExpr(features: Record<string, number | string>, expr: Expr): boolean {
    if (expr.all) return expr.all.every((e: Expr) => evaluateExpr(features, e));
    if (expr.any) return expr.any.some((e: Expr) => evaluateExpr(features, e));
    if (expr.not) return !evaluateExpr(features, expr.not);
    if (expr.gt) return (features[expr.gt[0]] ?? -Infinity) > expr.gt[1];
    if (expr.lt) return (features[expr.lt[0]] ?? Infinity) < expr.lt[1];
    if (expr.between) {
        const val = features[expr.between[0]];
        return val !== undefined && val >= expr.between[1] && val <= expr.between[2];
    }
    if (expr.eq) return features[expr.eq[0]] === expr.eq[1];
    // hasTag is not implemented yet as tags are not generated for planets
    return false;
}

export function classifyBody(features: Record<string, number | string>, pack: RulePack, allNodes: (CelestialBody | Barycenter)[]): string[] {
  if (!pack.classifier) return [];

    const planetId = features['id'] as string;
    const hasRing = allNodes.some(n => n.parentId === planetId && n.kind === 'body' && (n as CelestialBody).roleHint === 'ring');
    features['has_ring_child'] = hasRing ? 1 : 0;

    const scores: Record<string, number> = {};

    for (const rule of pack.classifier.rules) {
        if (evaluateExpr(features, rule.when)) {
            scores[rule.addClass] = (scores[rule.addClass] || 0) + rule.score;
        }
    }

    const sortedClasses = Object.entries(scores)
        .filter(([, score]) => score >= (pack.classifier?.minScore || 10))
        .sort((a, b) => b[1] - a[1]);

    // Start with the most likely class, but also add generic fallbacks.
    const primaryClass = sortedClasses.slice(0, pack.classifier?.maxClasses || 2).map(([className]) => className);
    if (primaryClass.length === 0) {
        if ((features['mass_Me'] as number) > 10) {
            primaryClass.push('planet/gas-giant');
        } else {
            primaryClass.push('planet/terrestrial');
        }
    }
    return primaryClass;
}
