// The two grid dials, as ONE set of numbers for both maps.
//
// The fade window was unified under C14 after the system map's copy turned the dial into a delete.
// The DEPTH curtain went the same way in this batch, for the same reason and before it could drift:
// the starmap had it and the system map had no dial at all, so there was nothing yet to disagree —
// which is the cheapest moment to bind them.
import { describe, it, expect } from 'vitest';
import { skirtDepth, SKIRT_DEPTH_RATIO, SKIRT_TOP_ALPHA, gridFadeWindow, gridFadeAlpha } from './gridFade';

describe('skirtDepth', () => {
	it('scales with the cell, so a coarse line drops a deeper curtain than a fine one', () => {
		expect(skirtDepth(10, 1)).toBeCloseTo(10 * SKIRT_DEPTH_RATIO);
		expect(skirtDepth(1, 1)).toBeCloseTo(SKIRT_DEPTH_RATIO);
		expect(skirtDepth(10, 1)).toBeGreaterThan(skirtDepth(1, 1));
	});

	it('scales with the dial, monotonically', () => {
		const d = [0.2, 0.4, 0.6, 0.8, 1].map((f) => skirtDepth(10, f));
		for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1]);
	});

	it('never returns exactly zero — a degenerate curtain is a NaN normal, not an absent one', () => {
		expect(skirtDepth(10, 0)).toBeGreaterThan(0);
		expect(skirtDepth(0, 0)).toBeGreaterThan(0);
	});

	it('clamps a dial outside 0..1 rather than inverting the curtain', () => {
		expect(skirtDepth(10, -5)).toBe(skirtDepth(10, 0));
		expect(skirtDepth(10, 99)).toBeCloseTo(skirtDepth(10, 1));
		expect(skirtDepth(10, NaN as unknown as number)).toBeGreaterThan(0);
	});

	it('keeps the curtain fainter than its line, so depth reads as shading not as a second grid', () => {
		expect(SKIRT_TOP_ALPHA).toBeGreaterThan(0);
		expect(SKIRT_TOP_ALPHA).toBeLessThan(1);
	});
});

// The bug this batch fixed, stated as the invariant that was broken. The scene writes the fade into
// the vertex alpha and lets the coarse/fine crossfade own the MATERIAL opacity; three.js multiplies
// the two. It used to bake the material's opacity into the vertex alpha as well and then set the
// material to 1 — correct for exactly one frame, because updateGridLevels reassigns that opacity
// every frame afterwards. The level then landed twice and the grid rendered at its square.
describe('the fade composes with the level opacity ONCE', () => {
	const R = 12;
	it('a squared level opacity is visibly darker — which is what was on screen', () => {
		const levelOpacity = 0.42;           // the coarse level at full strength
		const fade = gridFadeAlpha(0, gridFadeWindow(0.5, R)); // inside the window: no fade
		expect(fade).toBe(1);
		const correct = fade * levelOpacity;
		const doubled = fade * levelOpacity * levelOpacity;
		expect(correct).toBeCloseTo(0.42);
		expect(doubled).toBeCloseTo(0.176);
		expect(doubled / correct).toBeCloseTo(levelOpacity); // a whole level's worth of brightness lost
	});

	it('is worse mid-crossfade, where the fine level is already at part strength', () => {
		const levelOpacity = 0.3 * 0.5;      // fine level, halfway through the crossfade
		expect(levelOpacity * levelOpacity).toBeLessThan(levelOpacity / 6);
	});

	it('turning the dial off must leave the grid at full level brightness', () => {
		// Below GRID_FADE_OFF the scene writes no colour attribute at all, so alpha is the material's
		// alone. That is why the fault appeared the instant the dial moved off zero rather than gradually.
		const win = gridFadeWindow(0, R);
		expect(gridFadeAlpha(R, win)).toBe(1);
		expect(gridFadeAlpha(R * 1.5, win)).toBe(1);
	});
});
