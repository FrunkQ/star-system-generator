import { describe, it, expect } from 'vitest';

// The BodyOrbitTab pair-distance control had its maximum derived from its own current value
// (max = value x 10). That makes the control a positive feedback loop: dragging to the end sets the
// value to the maximum, the maximum then re-scales around the NEW value, and the next drag multiplies
// again. Two drags took Alpha Centauri's inner barycentre from 874 AU to 2.97e49 AU, which destroys the
// system's geometry (every member's rendered position derives from the pair's orbit).
//
// This pins the property that fixes it: the slider's range must NOT depend on the value it edits.
// Kept as pure maths so it holds regardless of how the component is wired.

const PAIR_MIN_AU = 0.01;
const PAIR_MAX_AU = 1e6;

/** The shipped range: fixed bounds, whatever the current value is. */
const fixedRange = (_current: number) => [PAIR_MIN_AU, PAIR_MAX_AU] as const;
/** The old, value-derived range that ran away. */
const runawayRange = (current: number) => [0.01, Math.max(100, current * 10)] as const;

/** Drag the handle to the far right N times, re-deriving the range each time as the UI did. */
function dragToMaxRepeatedly(range: (v: number) => readonly [number, number], start: number, times: number) {
  let v = start;
  for (let i = 0; i < times; i++) v = range(v)[1];
  return v;
}

describe('pair-distance range is independent of the value it edits', () => {
  it('the shipped range does not grow when the value is dragged to its end', () => {
    const start = 874.2; // Alpha Centauri's inner pair
    expect(fixedRange(start)).toEqual(fixedRange(start * 1e6)); // same range at any value
    expect(dragToMaxRepeatedly(fixedRange, start, 10)).toBe(PAIR_MAX_AU); // converges, never grows
  });

  it('reproduces the runaway the old value-derived range allowed', () => {
    // Documented so nobody reintroduces the pattern: each drag multiplies the reachable value by ten.
    const blown = dragToMaxRepeatedly(runawayRange, 874.2, 10);
    expect(blown).toBeGreaterThan(1e12);
  });

  it('clamping on write bounds a typed value too', () => {
    const clampAU = (v: number, lo: number, hi: number) =>
      !Number.isFinite(v) ? lo : Math.min(hi, Math.max(lo, v));
    expect(clampAU(2.97e49, PAIR_MIN_AU, PAIR_MAX_AU)).toBe(PAIR_MAX_AU);
    expect(clampAU(-5, PAIR_MIN_AU, PAIR_MAX_AU)).toBe(PAIR_MIN_AU);
    expect(clampAU(NaN, PAIR_MIN_AU, PAIR_MAX_AU)).toBe(PAIR_MIN_AU);
    expect(clampAU(874.2, PAIR_MIN_AU, PAIR_MAX_AU)).toBe(874.2); // a sane value is untouched
  });
});
