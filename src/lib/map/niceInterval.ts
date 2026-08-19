// THE "NICE INTERVAL" — one answer to "what step should this grid use", for every spatial view (G10).
//
// The fault this exists to kill: a grid line or a distance ring whose spacing came from a FRACTION OF
// THE VIEW rather than from a chosen distance. The system view's ground grid used `GRID_RADIUS / 7`
// and the starmap's polar rings used sixths of the extent, so both scaled with the camera and meant
// nothing physical — and the polar rings then LABELLED that arbitrary radius, which is worse than not
// labelling it. A ring reading "5 ly" is a scale a GM can use; one reading "3.7 ly" is noise wearing
// a number.
//
// UNIT-AGNOSTIC BY CONSTRUCTION — raw extent in, raw step out. The starmap works in light years or
// parsecs and the system view in AU, and the same logic serves both; a copy per unit is exactly the
// duplication the standing rules warn about, which is why this takes no unit and formats nothing.
//
// The sequence is the classic 1 / 2 / 5 x 10^n. Those are the steps people can do arithmetic in
// without thinking, which is the whole job: three squares across is 15 AU, not 11.1.

/** The 1 / 2 / 5 mantissas, in order. Exported so a caller can reason about the ladder itself. */
export const NICE_MANTISSAS = [1, 2, 5] as const;

/**
 * The largest 1/2/5-x-10^n step no bigger than `raw`. This is the primitive everything else uses.
 *
 * Rounding DOWN rather than to-nearest is deliberate: a step is a promise about how many divisions
 * appear, and rounding up can halve the count at a stroke — an extent of 11 wanting ~5 divisions would
 * jump from a step of 2 (5 divisions) to 5 (2 divisions), which is not the grid that was asked for.
 */
export function niceStepBelow(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 0;
  const exp = Math.floor(Math.log10(raw));
  const decade = Math.pow(10, exp);
  const f = raw / decade;
  const m = f >= 5 ? 5 : f >= 2 ? 2 : 1;
  return m * decade;
}

/** The next step UP the 1/2/5 ladder from `step` (1 -> 2 -> 5 -> 10). */
export function nextNiceStep(step: number): number {
  if (!(step > 0)) return 0;
  const exp = Math.floor(Math.log10(step) + 1e-9);
  const decade = Math.pow(10, exp);
  const f = step / decade;
  if (f < 1.5) return 2 * decade;
  if (f < 3.5) return 5 * decade;
  return 10 * decade;
}

/** The next step DOWN the ladder (10 -> 5 -> 2 -> 1). The inverse of `nextNiceStep`. */
export function prevNiceStep(step: number): number {
  if (!(step > 0)) return 0;
  const exp = Math.floor(Math.log10(step) + 1e-9);
  const decade = Math.pow(10, exp);
  const f = step / decade;
  if (f < 1.5) return 5 * decade / 10;
  if (f < 3.5) return 1 * decade;
  return 2 * decade;
}

/**
 * A step that divides `extent` into roughly `targetDivisions` parts, on the 1/2/5 ladder.
 *
 * `targetDivisions` is a WISH, not a guarantee — the whole point of snapping to the ladder is that the
 * count moves so the number does not. Expect anywhere between about half and twice what was asked.
 */
export function niceStep(extent: number, targetDivisions = 6): number {
  if (!(extent > 0) || !(targetDivisions > 0)) return 0;
  return niceStepBelow(extent / targetDivisions);
}

/**
 * Round distances at which to place scale rings: `step`, `2*step`, ... out to `extent`.
 * Never more than `max` of them, thinning by whole multiples so what survives is still round.
 */
export function niceSeries(extent: number, targetDivisions = 6, max = 8): number[] {
  const step = niceStep(extent, targetDivisions);
  if (!(step > 0)) return [];
  const out: number[] = [];
  for (let v = step; v <= extent * 1.0001 && out.length < 512; v += step) out.push(v);
  if (out.length <= max) return out;
  // Keep every n-th, so every surviving ring is still a whole multiple of the step.
  const n = Math.ceil(out.length / max);
  return out.filter((_, i) => (i + 1) % n === 0);
}

/**
 * THE DECADE CROSSFADE. Which two grid levels to draw at this zoom, and how far between them we are.
 *
 * A grid that JUMPS between decades is more distracting than one that never adapts at all, so the
 * finer level fades UP as it becomes useful while the coarser fades DOWN: at any zoom there is one
 * dominant level and a ghost of the next. Standard map and CAD behaviour.
 *
 * `t` is the position within the current decade, 0 at the point the coarse step was just chosen and
 * approaching 1 as the view tightens toward the next one down. `fine` is always one rung below
 * `coarse`, and their opacities are `1 - t` and `t` scaled by the caller.
 *
 * Returning BOTH levels rather than a single blended step is what makes it a crossfade rather than a
 * lerp — the two grids genuinely coexist, which is the only way a subdivision can appear gradually.
 */
export interface GridLevels {
  /** The dominant level. Draw at `1 - t` of the base opacity. */
  coarse: number;
  /** One decade finer, exactly ten of them to a coarse cell. Draw at `t`. */
  fine: number;
  /** 0..1 — how far the fine level has faded in. */
  t: number;
}

/**
 * THESE ARE DECADES, NOT THE 1/2/5 LADDER, and the difference is not cosmetic.
 *
 * A crossfading grid needs its two levels NESTED — every coarse line must also be a fine line, or the
 * subdivision does not appear inside the cells, it appears alongside them and the two grids beat
 * against each other. Consecutive rungs of the 1/2/5 ladder are not integer multiples (5 to 2 is a
 * factor of 2.5), so the ladder cannot do that. Powers of ten can, exactly, which is also what the
 * item asked for in as many words: subdivide into ten on the way in.
 *
 * So the two sequences do different jobs and both are right: DECADES for a grid that subdivides,
 * 1/2/5 for polar rings and any label, where nothing has to nest and the finer ladder gives a more
 * useful choice of round number.
 */
export function gridLevels(extent: number, targetDivisions = 6): GridLevels | null {
  if (!(extent > 0) || !(targetDivisions > 0) || !Number.isFinite(extent)) return null;
  const raw = extent / targetDivisions;
  if (!(raw > 0) || !Number.isFinite(raw)) return null;
  const l = Math.log10(raw);
  const exp = Math.floor(l);
  const coarse = Math.pow(10, exp);
  const fine = Math.pow(10, exp - 1);
  // Position within the decade, in log space because the ladder is multiplicative. At the moment the
  // view tightens onto a new decade (raw === coarse) the fine level is fully in and hands over.
  const t = Math.min(1, Math.max(0, 1 - (l - exp)));
  return { coarse, fine, t };
}

/**
 * THE LEVEL OPACITY SCHEDULE (A55). One law for both levels, and it is CONTINUOUS ACROSS THE HANDOVER,
 * which the first version was not: the fine level used to climb to a ghost peak of 0.30 and, the
 * instant the decade turned over, the SAME LINES were rebuilt as the coarse level at 0.42 — a 40%
 * brightness pop on every surviving line, in both zoom directions. "It should fade, not pop" is the
 * whole requirement, so fine(t = 1) must equal coarse(t = 0) exactly.
 *
 * The fine level still reads as a ghost for most of the decade — it rises as t squared, so it is at
 * the old 0.30 around t = 0.85 and only arrives at the coarse peak at the very moment it takes over.
 */
export const GRID_LEVEL_PEAK = 0.42;
export function gridLevelOpacity(level: 'coarse' | 'fine', t: number): number {
  const u = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  return level === 'coarse' ? GRID_LEVEL_PEAK * (1 - u) : GRID_LEVEL_PEAK * u * u;
}

/**
 * Format a step or a ring distance for a label, at the precision the step itself justifies.
 * A step of 0.5 wants "0.5"; a step of 500 wants "500" and never "500.0".
 */
export function formatNice(value: number): string {
  if (!Number.isFinite(value)) return '';
  const a = Math.abs(value);
  if (a === 0) return '0';
  if (a >= 100) return String(Math.round(value));
  if (a >= 1) return String(Math.round(value * 100) / 100);
  // Sub-unit steps come off the 1/2/5 ladder, so the decade tells us exactly how many places are real.
  const dp = Math.min(6, Math.max(0, -Math.floor(Math.log10(a))));
  return value.toFixed(dp);
}
