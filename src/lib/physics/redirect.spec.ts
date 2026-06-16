import { describe, it, expect } from 'vitest';
import { redirectDeltaV, headingOffsetDeg } from './redirect';

describe('redirectDeltaV — honest vector cost of replotting while coasting', () => {
  it('a new course along the current drift is ~free', () => {
    expect(redirectDeltaV([100, 0], [5, 0])).toBeCloseTo(0, 9);
  });
  it('reversing onto the opposite heading costs the whole speed', () => {
    expect(redirectDeltaV([100, 0], [-5, 0])).toBeCloseTo(100, 9);
  });
  it('a perpendicular heading costs the whole speed (must cancel the sideways drift)', () => {
    expect(redirectDeltaV([100, 0], [0, 5])).toBeCloseTo(100, 9);
  });
  it('a 45° forward heading keeps the aligned part, cancels only the cross part', () => {
    // v=(100,0), target at 45° (1,1): along = 100·cos45 ≈ 70.7 (kept), perp ≈ 70.7 (cancelled)
    expect(redirectDeltaV([100, 0], [1, 1])).toBeCloseTo(70.71, 1);
  });
  it('a stationary ship needs no redirect', () => {
    expect(redirectDeltaV([0, 0], [1, 1])).toBe(0);
  });
  it('headingOffsetDeg reports the angle between drift and the new heading', () => {
    expect(headingOffsetDeg([1, 0], [1, 0])).toBeCloseTo(0, 6);
    expect(headingOffsetDeg([1, 0], [0, 1])).toBeCloseTo(90, 6);
    expect(headingOffsetDeg([1, 0], [-1, 0])).toBeCloseTo(180, 6);
  });
});
