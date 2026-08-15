// B56: every multi-decade pack band was drawn LINEARLY, so 23 shipped bands were systematically
// biased to the top of their own range and advertised values they would essentially never produce.
import { describe, it, expect } from 'vitest';
import { drawFromBand, bandIsLog, randomFromRange, BAND_LOG_RATIO } from './utils';
import { SeededRNG } from './rng';

const sample = (band: [number, number], n = 4000, scale?: 'log' | 'linear') => {
	const rng = new SeededRNG('band-test');
	return Array.from({ length: n }, () => drawFromBand(rng, band, scale));
};
const fractionBelow = (xs: number[], x: number) => xs.filter((v) => v < x).length / xs.length;

describe('bandIsLog — the band declares its own scale, and inference is the default', () => {
	it('treats a genuinely narrow band as linear', () => {
		// The fix is NOT "make everything log" — that is the same point solution in the other
		// direction. A neutron star's mass really is 1.4..2.2 and a radius within a factor of two.
		expect(bandIsLog([1.4, 2.2])).toBe(false);
		expect(bandIsLog([0.6, 1.4])).toBe(false);
		expect(bandIsLog([3, 100])).toBe(false); // 33x — under the threshold
	});

	it('treats a multi-decade band as log', () => {
		expect(bandIsLog([1e8, 1e11])).toBe(true); // star/NS field
		expect(bandIsLog([1e11, 1e15])).toBe(true); // star/magnetar field
		expect(bandIsLog([0.8, 1500])).toBe(true); // star/M radiation_output
		expect(bandIsLog([0.1, 10])).toBe(true); // exactly 100x — at the threshold
	});

	it('lets the pack override the inference in BOTH directions', () => {
		expect(bandIsLog([1e8, 1e11], 'linear')).toBe(false);
		expect(bandIsLog([1.4, 2.2], 'log')).toBe(true);
	});

	it('refuses a log scale when the band has no positive floor', () => {
		// star/BH's field is [0, 0] by design — a black hole has no surface field to quote — and
		// log(0) is not a number. Absence of a floor means linear, never NaN.
		expect(bandIsLog([0, 0])).toBe(false);
		expect(bandIsLog([0, 1e15])).toBe(false);
		expect(bandIsLog([-5, 5])).toBe(false);
		expect(Number.isFinite(drawFromBand(new SeededRNG('x'), [0, 0]))).toBe(true);
	});

	it('states its threshold as data rather than burying it', () => {
		expect(BAND_LOG_RATIO).toBe(100);
	});
});

describe('drawFromBand — the measured fault, and the fix', () => {
	it('gives each DECADE roughly equal weight across star/NS\'s field band', () => {
		// 1e8..1e11 is three decades. Linear put ~99% in the top one.
		const xs = sample([1e8, 1e11]);
		const perDecade = [
			fractionBelow(xs, 1e9),
			fractionBelow(xs, 1e10) - fractionBelow(xs, 1e9),
			1 - fractionBelow(xs, 1e10)
		];
		for (const f of perDecade) expect(f).toBeGreaterThan(0.28);
		for (const f of perDecade) expect(f).toBeLessThan(0.39);
	});

	it('reproduces the fault it fixes, so the number in the entry is not folklore', () => {
		// The old behaviour, spelled out: P(draw < 1e9) over 1e8..1e11 is about 0.9%.
		const rng = new SeededRNG('linear');
		const xs = Array.from({ length: 4000 }, () => randomFromRange(rng, 1e8, 1e11));
		expect(fractionBelow(xs, 1e9)).toBeLessThan(0.02);
		// ...against roughly a third now.
		expect(fractionBelow(sample([1e8, 1e11]), 1e9)).toBeGreaterThan(0.28);
	});

	// THIS IS THE ONE THAT MAKES THE MAGNETAR MERGE POSSIBLE, and it is why B56 says the merge and
	// the log draw are ONE change rather than two.
	it('keeps magnetars a MINORITY when the neutron-star band is widened to include them', () => {
		// The owner's design: magnetar is not a spawn type, it is a neutron star with a high field.
		// One merged band 1e8..1e15, threshold at 1e11 where the two existing bands already meet.
		const merged: [number, number] = [1e8, 1e15];
		const linearRng = new SeededRNG('m-lin');
		const linear = Array.from({ length: 4000 }, () => randomFromRange(linearRng, ...merged));
		// Drawn linearly the merge inverts the population: ~90% of neutron stars become magnetars.
		expect(1 - fractionBelow(linear, 1e11)).toBeGreaterThan(0.85);
		// Log-uniform makes it a minority, and the rate falls out of the distribution rather than a
		// spawn weight — 3 of the 7 decades sit below the threshold.
		const log = sample(merged);
		const magnetarRate = 1 - fractionBelow(log, 1e11);
		expect(magnetarRate).toBeLessThan(0.65);
		expect(magnetarRate).toBeGreaterThan(0.5);
	});

	it('stays inside the band it was given', () => {
		for (const band of [[1e8, 1e11], [1.4, 2.2], [0.1, 10]] as [number, number][]) {
			for (const v of sample(band, 500)) {
				expect(v).toBeGreaterThanOrEqual(band[0]);
				expect(v).toBeLessThanOrEqual(band[1]);
			}
		}
	});

	it('is deterministic for a given seed', () => {
		const a = new SeededRNG('same'), b = new SeededRNG('same');
		expect(drawFromBand(a, [1e8, 1e11])).toBe(drawFromBand(b, [1e8, 1e11]));
	});
});
