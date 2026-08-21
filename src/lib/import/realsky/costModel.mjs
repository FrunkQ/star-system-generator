// Real-sky import — the size guardrails (design doc §5b).
//
// Pure functions, kept OUT of the dialogue component so they can be tested against counts the
// catalogue does not happen to produce today.
//
// RE-DERIVED FOR THE STELLAR CENSUS (D18, v2.1.547). This file used to say its thresholds were
// calibrated against "confirmed-planet hosts", "a small population, so today every import lands in
// the green band" — and that was exactly true: before the pipeline inverted, a 41 ly import returned
// 92 systems and every band was green. A stellar census is several times larger, so the guardrails
// were re-measured against it rather than assumed still valid:
//
//     radius     systems   band       (measured against the real SIMBAD census, 2026-08-13)
//      13 ly          28   green
//      16.5 ly        56   green      <- the Local Neighbourhood preset, comfortably inside
//      20 ly          99   green
//      25 ly         159   amber
//      30 ly         266   amber
//      41.4 ly       730   red        <- the bundled snapshot's own bound
//
// THE THRESHOLDS THEMSELVES SURVIVED and are unchanged: the flagship preset sits at 56 against a
// green line of 150, which leaves real headroom rather than skimming it, and the bands now actually
// discriminate instead of every import reading "comfortable". What did NOT survive is the size
// estimate — see `estimateCost`.
//
// The thresholds are exported so the dialogue's copy and these tests quote the same numbers.

export const GREEN_MAX = 150;   // no commentary below this
export const AMBER_MAX = 500;   // allowed, with a real alternative offered
export const CEILING = 2000;    // a flat no, with a reason
export const MIN_RADIUS_LY = 4; // the dialogue's slider floor

// The progress loop yields ~30 ms per system so the bar repaints; that
// dominates the ~2 ms of physics, so it is what a GM actually waits for.
export const MS_PER_SYSTEM = 32;

export function costBand(n) {
  return n <= GREEN_MAX ? 'green' : n <= AMBER_MAX ? 'amber' : 'red';
}

// What the count MEANS at the table: size and load time, not just a number.
//
// Size is MEASURED, not sampled, and that changed with D18. It used to extrapolate from
// `systems[0]`, which was fair while every system was a planet host of much the same size. A
// stellar census is not uniform: node counts run from 1 (a bare star, now the common case) to 39
// (Sol), so the answer depended on whichever star happened to sort first — at 41.4 ly it claimed
// 2,248 KB against a true 815, over-stating by 2.8x and making a legitimate import look expensive.
//
// Sampling a spread was tried next and was WORSE at small radii, because one outlier dominates:
// Sol alone is 62% of a 13 ly import, so a sample either includes it and over-states or misses it
// and halves the answer. So the estimate was timed instead of guessed — serialising all 730 systems
// of the largest offline import takes about 2 ms, which is nothing on a slider step. Exact is both
// simpler and right, and the sampling is gone.
export function estimateCost(systems) {
  const n = systems.length;
  let bytes = 0;
  for (const s of systems) bytes += JSON.stringify(s).length;
  const kb = Math.round(bytes / 1024);
  const seconds = Math.max(1, Math.round((n * MS_PER_SYSTEM) / 1000));
  return {
    systems: n,
    kb,
    size: kb >= 1024 ? `~${(kb / 1024).toFixed(1)} MB` : `~${kb} KB`,
    time: `loads in ~${seconds}s`,
    reading: n <= GREEN_MAX ? 'comfortable' : n <= AMBER_MAX ? 'large' : 'very large'
  };
}

// A REAL alternative rather than advice: bisect count-against-radius to find
// the LARGEST radius still inside the green band, so the chip can name the
// radius and the number it will produce ("Radius 13 ly → 120 systems") instead
// of saying "try smaller".
//
// `countAt(radiusLy)` is injected — the dialogue passes a client-side
// conversion over rows it already holds (a dozen calls, instant); tests pass
// a synthetic curve. Returns null when even the floor is over budget, because
// a suggestion that does not help is worse than staying quiet, and the caller
// says so in words instead.
export function suggestRadius(currentRadiusLy, countAt, { minRadiusLy = MIN_RADIUS_LY, step = 0.5, target = GREEN_MAX, iterations = 12 } = {}) {
  if (currentRadiusLy <= minRadiusLy) return null;
  // Nothing to shrink TO if the current radius is already within budget. The
  // dialogue only asks when it is over, but the contract holds either way:
  // this never returns a "suggestion" that is not an improvement.
  if (countAt(currentRadiusLy) <= target) return null;
  if (countAt(minRadiusLy) > target) return null;
  let lo = minRadiusLy, hi = currentRadiusLy;
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    if (countAt(mid) <= target) lo = mid; else hi = mid;
  }
  // Snap DOWN to the slider's step so the chip names a radius the slider can
  // actually hold, and so rounding can never push it back over the target.
  const radiusLy = Math.max(minRadiusLy, Math.floor(lo / step) * step);
  const count = countAt(radiusLy);
  if (count > target || radiusLy >= currentRadiusLy) return null;
  return { radiusLy, count };
}
