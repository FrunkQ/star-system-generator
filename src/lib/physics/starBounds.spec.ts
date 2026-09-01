/**
 * THE STAR EDITOR'S SLIDER BOUNDS — the equivalence gate for the A83 extraction.
 *
 * Seven pairs of numbers moved out of `BodyStarTab.svelte`'s script block into `starBounds.ts`.
 * EXTRACTION IS A MEASUREMENT, so it is pinned as one: every value here is checked against the OLD
 * inline arithmetic, transcribed verbatim below, at enough sample points to catch a transposed
 * bound or a flipped axis. Moving a number and changing it are two commits, never one — and the
 * pixel-floor extraction is why that rule exists, because a silent axis change shipped as "just a
 * refactor" and doubled a clamp.
 *
 * RUN AGAINST A DELIBERATELY WRONG BOUND THIS GOES RED: changing `STAR_BOUNDS.mass.soft` to
 * [0.01, 200] fails `mass — the thumb sits where it used to` on the first sample. Checked before
 * this was believed, not after.
 */
import { describe, it, expect } from 'vitest';
import {
	STAR_BOUNDS,
	SUPERMASSIVE_MASS,
	SUPERMASSIVE_AMBER_ABOVE,
	boundPos,
	boundValue,
	bandPct,
	massSoftRange
} from './starBounds';

// ── THE OLD INLINE ARITHMETIC, VERBATIM ─────────────────────────────────────────────────────────
// Transcribed from BodyStarTab.svelte before the extraction. Bounds first, then the three shapes
// they were used in: position-from-value, value-from-position, and the green band rectangle.

const LEGACY = {
	mass: { min: 0.01, max: 300 },
	radius: { min: 0.01, max: 2000 },
	temp: { min: 500, max: 50000 },
	rad: { min: 0.01, max: 50000 },
	mag: { min: 0.01, max: 1e15 },
	rot: { min: 0.1, max: 10000 }
} as const;

/** `massSliderPos = (Math.log(Math.max(min, Math.min(max, v))) - logMin) / (logMax - logMin)` */
const legacyPos = (min: number, max: number, v: number) => {
	const logMin = Math.log(min);
	const logMax = Math.log(max);
	return (Math.log(Math.max(min, Math.min(max, v))) - logMin) / (logMax - logMin);
};

/** `const val = Math.exp(logMin + (logMax - logMin) * sliderPos)` */
const legacyValue = (min: number, max: number, pos: number) => {
	const logMin = Math.log(min);
	const logMax = Math.log(max);
	return Math.exp(logMin + (logMax - logMin) * pos);
};

/** `getRangePct`, both halves, for one prop's [min,max] and the pack band it is given. */
const legacyBand = (min: number, max: number, range: readonly [number, number] | undefined) => {
	if (!range || !(range[0] > 0) || !(range[1] > 0)) return { start: 0, width: 0 };
	const minL = Math.log(min);
	const maxL = Math.log(max);
	const startL = Math.log(Math.max(min, range[0]));
	const endL = Math.log(Math.min(max, range[1]));
	const startPct = ((startL - minL) / (maxL - minL)) * 100;
	const endPct = ((endL - minL) / (maxL - minL)) * 100;
	return { start: Math.max(0, startPct), width: Math.max(2, endPct - startPct) };
};

const POSITIONS = [0, 0.001, 0.1, 0.25, 0.5, 0.75, 0.9, 0.999, 1];

describe('the extraction is bit-unchanged — every slider maps as it used to', () => {
	const cases = [
		['mass', LEGACY.mass, STAR_BOUNDS.mass, [0.001, 0.01, 0.08, 1, 8, 60, 300, 1200]],
		['radius', LEGACY.radius, STAR_BOUNDS.radius, [0.001, 0.01, 0.1, 1, 20, 700, 2000, 9000]],
		['temp', LEGACY.temp, STAR_BOUNDS.temp, [100, 500, 2400, 5772, 30000, 50000, 120000]],
		['radiation', LEGACY.rad, STAR_BOUNDS.radiation, [0.001, 0.01, 1, 90, 5000, 50000, 1e6]],
		['mag', LEGACY.mag, STAR_BOUNDS.mag, [0.001, 0.01, 1, 1e6, 1e13, 1e15, 1e17]]
	] as const;

	for (const [name, legacy, bound, values] of cases) {
		it(`${name} — the thumb sits where it used to`, () => {
			for (const v of values) {
				expect(boundPos(bound.soft, v), `${name} @ ${v}`).toBeCloseTo(
					legacyPos(legacy.min, legacy.max, v),
					12
				);
			}
		});

		it(`${name} — the number under the thumb is what it used to be`, () => {
			for (const p of POSITIONS) {
				expect(boundValue(bound.soft, p), `${name} @ pos ${p}`).toBeCloseTo(
					legacyValue(legacy.min, legacy.max, p),
					9
				);
			}
		});

		it(`${name} — the green band rectangle is drawn where it used to be`, () => {
			// Bands straddling, inside, and running off each end of the track, plus the zero band a
			// quiescent black hole genuinely has.
			const bands: [number, number][] = [
				[legacy.min, legacy.max],
				[legacy.min * 3, legacy.max / 3],
				[legacy.min / 100, legacy.max * 100],
				[legacy.min * 0.5, legacy.max * 0.9]
			];
			for (const band of bands) {
				const got = bandPct(bound.soft, band);
				const want = legacyBand(legacy.min, legacy.max, band);
				expect(got, `${name} band ${band.join('..')}`).not.toBeNull();
				expect(got!.start).toBeCloseTo(want.start, 10);
				expect(got!.width).toBeCloseTo(want.width, 10);
			}
			// A band the pack states as zero: the old code returned 0/0, the new one returns null so
			// the caller can draw nothing rather than a 2%-wide sliver. Same pixels on screen.
			expect(bandPct(bound.soft, [0, 0])).toBeNull();
			expect(bandPct(bound.soft, undefined)).toBeNull();
		});
	}

	// ROTATION IS THE ONE THAT DOES NOT MATCH ITSELF, and this is the pin for that (A85). The slider
	// is LINEAR (`min="0.1" max="10000"` on the input) while `getRangePct('rot')` drew the band on a
	// LOG axis. Both halves are pinned here as they shipped, so the fix that unifies them has
	// something to go red against.
	it('rotation — the SLIDER is linear and the BAND was drawn on a log axis (A85, as shipped)', () => {
		expect(STAR_BOUNDS.rot.log).toBe(false);
		for (const v of [0.1, 6, 600, 5000, 10000]) {
			expect(boundPos(STAR_BOUNDS.rot.soft, v, false)).toBeCloseTo(
				(v - LEGACY.rot.min) / (LEGACY.rot.max - LEGACY.rot.min),
				12
			);
		}
		// The log band, exactly as the component drew it.
		const got = bandPct(STAR_BOUNDS.rot.soft, [600, 700], true)!;
		const want = legacyBand(LEGACY.rot.min, LEGACY.rot.max, [600, 700]);
		expect(got.start).toBeCloseTo(want.start, 10);
		expect(got.width).toBeCloseTo(want.width, 10);
		// And the disagreement itself, measured: the same 600 h paints at ~76% and sits at ~6%.
		expect(got.start).toBeGreaterThan(70);
		expect(boundPos(STAR_BOUNDS.rot.soft, 600, false) * 100).toBeLessThan(10);
	});
});

describe('a bound is TRAVEL, never a wall — steer, do not stop', () => {
	it('a value past either end pins the thumb and is not itself changed', () => {
		expect(boundPos(STAR_BOUNDS.mass.soft, 1e6)).toBe(1);
		expect(boundPos(STAR_BOUNDS.mass.soft, 1e-9)).toBe(0);
		// Nothing here writes back: `boundPos` is asked where to draw, never what the value is.
		expect(boundValue(STAR_BOUNDS.mass.soft, 1)).toBeCloseTo(300, 9);
	});
});

describe('the supermassive range (A83)', () => {
	it('moves only the TOP — the floor stays stellar so the switch never teleports a mass', () => {
		expect(SUPERMASSIVE_MASS[0]).toBe(STAR_BOUNDS.mass.soft[0]);
		expect(SUPERMASSIVE_MASS[1]).toBe(2.7e11);
		expect(massSoftRange(false)).toEqual(STAR_BOUNDS.mass.soft);
		expect(massSoftRange(true)).toEqual(SUPERMASSIVE_MASS);
	});

	it('reaches the theoretical limit at the top of the track, on a log scale', () => {
		expect(boundValue(SUPERMASSIVE_MASS, 1)).toBeCloseTo(2.7e11, 0);
		// Log, not linear: the halfway point is the geometric mean, not 1.35e11.
		const mid = boundValue(SUPERMASSIVE_MASS, 0.5);
		expect(mid).toBeCloseTo(Math.sqrt(0.01 * 2.7e11), 0);
		expect(mid).toBeLessThan(1e9);
	});

	it('keeps every ordinary hole reachable — Sgr A* and M87* land inside the track', () => {
		// The two black holes anyone has actually photographed: 4.3e6 and 6.5e9 M☉.
		for (const m of [4.3e6, 6.5e9]) {
			const p = boundPos(SUPERMASSIVE_MASS, m);
			expect(p).toBeGreaterThan(0);
			expect(p).toBeLessThan(1);
			// And the thumb returns the same number it was given, to slider precision.
			expect(boundValue(SUPERMASSIVE_MASS, p) / m).toBeCloseTo(1, 6);
		}
	});

	it('270 billion is the AMBER EDGE, not a wall — a heavier hole is kept', () => {
		expect(SUPERMASSIVE_AMBER_ABOVE).toBe(2.7e11);
		// Above the edge the thumb pins; the value is the caller's business and is not touched here.
		expect(boundPos(SUPERMASSIVE_MASS, 5e11)).toBe(1);
	});
});
