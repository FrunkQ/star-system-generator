// Real-sky import — the size guardrails (design doc §5b).
//
// Pure functions, kept OUT of the dialogue component so they can be tested
// against counts the real catalogue never produces: confirmed-planet hosts
// are a small population, so today every import lands in the green band, and
// the guardrails that matter are the ones the Gaia population presets will
// trip next phase. A guardrail first exercised the day it is needed is a
// guardrail written under pressure.
//
// The thresholds are first guesses recorded in the design doc, exported so
// the dialogue's copy and these tests quote the same numbers.

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
// Size is SAMPLED from one system rather than serialising the whole set,
// because this recomputes on every slider step — an estimate, labelled as one.
export function estimateCost(systems) {
  const n = systems.length;
  const kb = n ? Math.round((JSON.stringify(systems[0]).length * n) / 1024) : 0;
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
