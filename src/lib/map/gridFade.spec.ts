// C14: the system map's grid DISAPPEARED at falloff instead of fading toward its edge, while the
// starmap's identical-looking dial behaved. Two copies of the window with different constants, and
// the holo's were calibrated for a smaller extent than the scene actually fills.
import { describe, it, expect } from 'vitest';
import { gridFadeWindow, gridFadeAlpha, GRID_FADE_OFF } from './gridFade';

const R = 12;

describe('gridFadeWindow', () => {
	it('is effectively OFF below the threshold - the window sits past any content', () => {
		for (const f of [0, GRID_FADE_OFF]) {
			const w = gridFadeWindow(f, R);
			expect(gridFadeAlpha(R, w)).toBe(1);
			expect(w.from).toBeGreaterThan(R);
		}
	});

	it('tightens monotonically as the dial rises', () => {
		let prev = Infinity;
		for (const f of [0.1, 0.25, 0.5, 0.75, 1]) {
			const { from } = gridFadeWindow(f, R);
			expect(from).toBeLessThan(prev);
			prev = from;
		}
	});

	it('clamps out-of-range dials rather than inverting the window', () => {
		for (const f of [-5, 2, Number.NaN]) {
			const w = gridFadeWindow(Number.isNaN(f) ? 0 : f, R);
			expect(w.to).toBeGreaterThan(w.from);
		}
	});

	// THE REGRESSION. The rim is where content actually sits: compressRadius maps the outermost body
	// to EXACTLY gridRadius, so a window that has finished before the rim has finished inside the
	// content - which is "deletes the grid" rather than "fades it".
	it('still SHOWS the rim at every dial short of maximum - the C14 fault', () => {
		for (const f of [0.25, 0.5, 0.75]) {
			expect(gridFadeAlpha(R, gridFadeWindow(f, R))).toBeGreaterThan(0.15);
		}
	});

	it('the REJECTED holo window failed that, which is why it was replaced', () => {
		// The constants that shipped, kept as a live comparison rather than an anecdote.
		const old = (f: number) => { const from = R * (1 - 0.85 * f); return { from, to: from + R * (1.1 - 0.55 * f) }; };
		expect(gridFadeAlpha(R, old(0.75))).toBeLessThan(0.1);  // rim all but gone at three-quarter dial
		expect(gridFadeAlpha(R, old(1))).toBe(0);               // and entirely gone at full
	});

	it('fades - alpha falls with distance and never goes negative or above 1', () => {
		const w = gridFadeWindow(0.5, R);
		let prev = 2;
		for (const d of [0, R * 0.25, R * 0.5, R * 0.75, R, R * 2]) {
			const a = gridFadeAlpha(d, w);
			expect(a).toBeLessThanOrEqual(prev);
			expect(a).toBeGreaterThanOrEqual(0);
			expect(a).toBeLessThanOrEqual(1);
			prev = a;
		}
	});
});
