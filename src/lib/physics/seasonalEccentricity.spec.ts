// WHICH ECCENTRICITY DRIVES SEASONS? The one that moves the body relative to its STAR.
//
// `orbit.elements.e` describes the orbit about the body's IMMEDIATE HOST, and the seasonal term used
// it directly. For a plain planet those are the same thing; for anything nested they are not, and
// the failures were real:
//   - Pluto was handed its 6-day mutual orbit about Charon (e = 0.0002) instead of its 248-year one
//     about the Sun (e = 0.2488) — and its atmosphere freezing out at aphelion is the single most
//     characteristic thing about it.
//   - Rocheworld's two lobes carry e = 0 on a barycentre orbiting Barnard's Star at e = 0.25, so
//     they got no eccentric term at all. That case predates the Pluto one and had nothing to do
//     with it, which is what showed the fault was general rather than a Pluto quirk.
//   - Luna was handed its orbit about Earth (0.0549) rather than Earth's about the Sun (0.0167).
//
// `effectiveOrbitEccentricity` recovers it from the equilibrium-temperature range the processor has
// already computed by walking the whole chain to the star, so there is ONE walk and one answer.
import { describe, expect, it } from 'vitest';
import { effectiveOrbitEccentricity } from '$lib/core/SystemProcessor';

// A body carrying only what the function reads: the committed equilibrium range, plus the stored
// element it must fall back to.
const body = (minK: number, maxK: number, storedE?: number) => ({
	equilibriumTempMinK: minK,
	equilibriumTempMaxK: maxK,
	orbit: storedE === undefined ? undefined : { elements: { e: storedE } }
});

// T ∝ d^(-1/2), so a body between d(1−e) and d(1+e) sits between these two temperatures.
const rangeFor = (e: number, tMean = 300) => body(tMean / Math.sqrt(1 + e), tMean / Math.sqrt(1 - e));

describe('effectiveOrbitEccentricity', () => {
	it('returns a plain planet its own eccentricity', () => {
		for (const e of [0, 0.0167, 0.0934, 0.2056, 0.2488, 0.6]) {
			expect(effectiveOrbitEccentricity(rangeFor(e)), `e=${e}`).toBeCloseTo(e, 6);
		}
	});

	it('ignores the stored element when a range is available', () => {
		// Pluto's shape: mutual e is 0.0002, heliocentric is 0.2488. The range wins.
		const pluto = { ...rangeFor(0.2488), orbit: { elements: { e: 0.0002 } } };
		expect(effectiveOrbitEccentricity(pluto)).toBeCloseTo(0.2488, 6);
	});

	it('falls back to the stored element when there is no range', () => {
		expect(effectiveOrbitEccentricity({ orbit: { elements: { e: 0.31 } } })).toBe(0.31);
		expect(effectiveOrbitEccentricity(body(0, 0, 0.22))).toBe(0.22);
		expect(effectiveOrbitEccentricity(body(NaN, NaN, 0.22))).toBe(0.22);
	});

	it('is undefined rather than NaN when there is nothing to go on', () => {
		// A barycentre has no equilibrium temperatures at all; it must not produce NaN downstream.
		expect(effectiveOrbitEccentricity({})).toBeUndefined();
	});

	it('never returns a negative or absurd eccentricity from a degenerate range', () => {
		const e = effectiveOrbitEccentricity(body(300, 300));   // circular
		expect(e).toBeCloseTo(0, 9);
		expect(effectiveOrbitEccentricity(body(400, 300, 0.1))).toBe(0.1);  // inverted → fall back
	});
});
