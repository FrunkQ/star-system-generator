// UI range metadata over classifier fingerprints (composition redesign §12). Fingerprints
// carry an optional `range` block — mass_Me / radius_Re / density / Teq_K — that is EDITOR
// metadata only: it drives slider spans, picker inclusion and context filtering, and is
// never read by the classifier's scorer (so ranging can be tuned without recalibrating
// classification). Classes without a `range` are specialist/derived (climate, biosphere,
// atmosphere…) and are not offered in pickers, though they still classify normally.
//
// This module is the single "what types are valid in this context" logic — shared by the
// composition editor and intended for the add-body flow (filter creation options by the
// known orbit temperature + a parent-derived mass range) so parallel systems don't drift.
import type { Fingerprint } from '$lib/types';
import { bandFit } from './classification';

export type RangeAxis = 'mass_Me' | 'radius_Re' | 'density' | 'Teq_K';

// A UI-only class for "the GM insists": full-range sliders, no bands, never emitted by
// the classifier. Pinnable from the picker like any other type.
export const UNKNOWN_CLASS = 'planet/unknown';

// The UI band for an axis: the authored range, else the classifier's match band (numeric
// only), else null.
export function rangeOf(fp: Fingerprint | null | undefined, axis: RangeAxis): [number, number] | null {
  const r = (fp as any)?.range?.[axis] ?? (fp?.match as any)?.[axis];
  return Array.isArray(r) && typeof r[0] === 'number' && typeof r[1] === 'number'
    ? (r as [number, number]) : null;
}

// Pickable = a base type that declares UI ranges. Specialist/derived classes don't.
export function isPickable(fp: Fingerprint): boolean {
  return fp.kind === 'base' && !!(fp as any).range;
}

export interface TypeContext { massMe?: number; radiusRe?: number; density?: number; teqK?: number; }

function ctxValue(ctx: TypeContext, axis: RangeAxis): number | undefined {
  return axis === 'mass_Me' ? ctx.massMe
    : axis === 'radius_Re' ? ctx.radiusRe
    : axis === 'density' ? ctx.density
    : ctx.teqK;
}

// Types offerable in a context: pickable + every gated axis's range admits the given value
// (undefined context values don't filter; soft edges via bandFit's relative tolerance).
// The editor gates on mass + Teq — the two hard physical parameters; radius/density are
// what the user is about to tune INTO the chosen type.
export function pickableTypes(
  fps: Fingerprint[], ctx: TypeContext, gateAxes: RangeAxis[] = ['mass_Me', 'Teq_K']
): Fingerprint[] {
  const seen = new Set<string>();
  const out: Fingerprint[] = [];
  for (const fp of fps) {
    if (!isPickable(fp) || seen.has(fp.class)) continue;
    let ok = true;
    for (const axis of gateAxes) {
      const v = ctxValue(ctx, axis);
      if (v === undefined) continue;
      const r = rangeOf(fp, axis);
      if (r && bandFit(v, r) <= 0) { ok = false; break; }
    }
    if (ok) { seen.add(fp.class); out.push(fp); }
  }
  return out;
}

// Best pickable type for a state (used when a TYPED value leaves the current class's
// range): highest mean band-fit across the axes each type declares, preferring MORE
// SPECIFIC types — a narrow-ranged class that contains the value beats a wide catch-all
// (else Protoplanet's 4.7-decade mass range swallows everything). Classifier `weight`
// is deliberately NOT applied: those weights compensate for match bands (makeup, age…)
// that range-space scoring does not evaluate. Null when nothing fits → UNKNOWN_CLASS.
export function bestTypeFor(fps: Fingerprint[], ctx: TypeContext): string | null {
  let best: string | null = null;
  let bestScore = 0;
  const AXES: RangeAxis[] = ['mass_Me', 'radius_Re', 'density', 'Teq_K'];
  for (const fp of fps) {
    if (!isPickable(fp)) continue;
    let sum = 0, n = 0, logWidth = 0, dead = false;
    for (const axis of AXES) {
      const v = ctxValue(ctx, axis);
      const r = rangeOf(fp, axis);
      if (v === undefined || !r) continue;
      const fit = bandFit(v, r);
      if (fit <= 0) { dead = true; break; }
      sum += fit; n++;
      logWidth += Math.log(Math.max(r[1], 1e-15) / Math.max(r[0], 1e-15));
    }
    if (dead || n === 0) continue;
    const score = (sum / n) * (1 + 0.1 * n) / (1 + logWidth / 20);
    if (score > bestScore) { bestScore = score; best = fp.class; }
  }
  return best;
}

// Slider span for a class range: padded by 15% of the band's LOG width each side (linear
// padding is invisible across decades), minimum total span ×2 so narrow bands stay
// draggable, clamped to the editor's full range. No range → the full range.
export function sliderSpan(
  range: [number, number] | null, fullLo: number, fullHi: number
): [number, number] {
  if (!range) return [fullLo, fullHi];
  const lo = Math.max(range[0] > 0 ? range[0] : fullLo, fullLo);
  const hi = Math.max(Math.min(range[1], fullHi), lo * 1.0001);
  let a = Math.log(lo), b = Math.log(hi);
  const w = b - a;
  a -= w * 0.15;
  b += w * 0.15;
  const MIN_W = Math.log(2);
  if (b - a < MIN_W) { const c = (a + b) / 2; a = c - MIN_W / 2; b = c + MIN_W / 2; }
  a = Math.max(a, Math.log(fullLo));
  b = Math.min(b, Math.log(fullHi));
  return [Math.exp(a), Math.exp(b)];
}
