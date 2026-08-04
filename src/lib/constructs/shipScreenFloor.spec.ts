// The ship's on-screen size floor, as arithmetic. Two shipped faults came from getting this
// wrong at TRUE scale, where a hull is ~1e-10 scene units:
//   - dividing by the on-screen size to get a multiplier put the divisor on a 1e-9 guard clamp,
//     so once it fired the drawn size stopped tracking the camera: hulls AU across, and growing
//     as you zoomed in (the invariant below is exactly what that broke);
//   - the same expression used two different fallbacks for a missing length (0 and 0.2), which
//     multiplied an enormous multiplier by a non-zero default.
// The rule: drawn = max(trueSize, minPx * f * dist). No division, one fallback.
import { describe, it, expect } from 'vitest';

const drawnSize = (trueLen: number, minPx: number, f: number, dist: number) =>
  Math.max(trueLen, minPx * f * dist);
/** On-screen pixels a world size occupies at a distance. */
const px = (world: number, f: number, dist: number) => world / (f * dist);

const F = (2 * Math.tan((45 * Math.PI) / 360)) / 847; // 45-degree lens, an 847px-tall viewport

describe('ship screen-size floor', () => {
  it('holds a CONSTANT on-screen size as the camera moves - the invariant zooming broke', () => {
    const iss = 2.9e-10; // ISS at 1:1 in scene units, the case that failed
    for (const dist of [0.5, 2, 10, 31, 120]) {
      expect(px(drawnSize(iss, 14, F, dist), F, dist)).toBeCloseTo(14, 6);
    }
  });

  it('measures the floor in SCREEN pixels, not world units', () => {
    // Worth stating because it looks alarming: at whole-system distance a 14 px ship IS about
    // 0.4 scene units - roughly an AU on a Sol-sized map - and that is correct, because the
    // camera is 31 units away. The screen size is the invariant; the world size is whatever
    // delivers it. Judging this by world size is what makes the honest floor look like a bug.
    const drawn = drawnSize(2.9e-10, 14, F, 31);
    expect(px(drawn, F, 31)).toBeCloseTo(14, 6);
    // ...and it shrinks in step as the camera closes, which the broken form did not.
    expect(drawnSize(2.9e-10, 14, F, 3)).toBeCloseTo(drawn / 10.333, 4);
  });

  it('leaves a hull alone once it is genuinely larger than the floor', () => {
    const big = 0.5;                        // a readable-scale marker, well over 14px
    expect(drawnSize(big, 14, F, 2)).toBe(big);
    expect(px(big, F, 2)).toBeGreaterThan(14);
  });

  it('a missing length falls back once, and cannot be multiplied up', () => {
    const missing = 0;
    const drawn = drawnSize(missing, 14, F, 31);
    expect(px(drawn, F, 31)).toBeCloseTo(14, 6); // the floor alone, not an exploded product
  });
});
