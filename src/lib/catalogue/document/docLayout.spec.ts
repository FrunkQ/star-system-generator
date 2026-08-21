import { describe, it, expect } from 'vitest';
import { docSideBySide, docGraphicStripFrac, DOC_TWO_COL_MIN_W, DOC_TWO_COL_MIN_H } from './docLayout';

// Real viewports, so the rule is tested against the devices it exists to tell apart rather than
// against numbers chosen to agree with it.
const DEVICES = {
	phonePortrait: [390, 844],        // iPhone 14 Pro
	phoneLandscape: [844, 390],       // the same phone, turned
	bigPhoneLandscape: [932, 430],    // 14 Pro Max — WIDER than plenty of desktop windows
	tabletPortrait: [820, 1180],      // iPad Air
	tabletLandscape: [1180, 820],
	laptop: [1440, 900],
	narrowDesktopWindow: [600, 900]   // a wide screen, a narrow window
} as const;

describe('docSideBySide', () => {
	it('stacks on a phone in portrait — nowhere near the width for two columns', () => {
		expect(docSideBySide(...DEVICES.phonePortrait)).toBe(false);
	});

	// The case width alone gets wrong, and the reason the rule takes both. The owner named it: "on
	// phones and horizontal views have them on top of one another".
	it('stacks on a phone in LANDSCAPE, which a width-only test would have split', () => {
		expect(docSideBySide(...DEVICES.phoneLandscape)).toBe(false);
		expect(docSideBySide(...DEVICES.bigPhoneLandscape)).toBe(false);
		// ...and that second one really is wider than the threshold, so only the height test saves it.
		expect(DEVICES.bigPhoneLandscape[0]).toBeGreaterThan(DOC_TWO_COL_MIN_W);
	});

	it('splits on a tablet, either way up', () => {
		expect(docSideBySide(...DEVICES.tabletPortrait)).toBe(true);
		expect(docSideBySide(...DEVICES.tabletLandscape)).toBe(true);
	});

	it('splits on a laptop', () => {
		expect(docSideBySide(...DEVICES.laptop)).toBe(true);
	});

	it('stacks in a tall narrow window — height is not enough on its own either', () => {
		expect(docSideBySide(...DEVICES.narrowDesktopWindow)).toBe(false);
	});

	it('needs BOTH, which is the whole point', () => {
		expect(docSideBySide(DOC_TWO_COL_MIN_W, DOC_TWO_COL_MIN_H)).toBe(true);
		expect(docSideBySide(DOC_TWO_COL_MIN_W - 1, DOC_TWO_COL_MIN_H)).toBe(false);
		expect(docSideBySide(DOC_TWO_COL_MIN_W, DOC_TWO_COL_MIN_H - 1)).toBe(false);
	});

	// A caller that has not been taught to measure passes nothing, and must get the old layout rather
	// than a split page built from zeroes.
	it('assumes no room when it is not told any', () => {
		expect(docSideBySide(0, 0)).toBe(false);
		expect(docSideBySide(NaN, 900)).toBe(false);
		expect(docSideBySide(1440, Infinity)).toBe(false);
		expect(docSideBySide(-1440, -900)).toBe(false);
	});
});

describe('docGraphicStripFrac', () => {
	it('gives the picture less than the photo sliver does — a globe is square, and the facts lead', () => {
		expect(docGraphicStripFrac(1440)).toBeLessThan(0.34);
	});

	it('gives a wider page proportionally less, since a bigger globe stops adding anything', () => {
		expect(docGraphicStripFrac(1440)).toBeLessThan(docGraphicStripFrac(800));
	});

	it('always leaves the facts the majority of the measure', () => {
		for (const w of [640, 800, 1100, 1440, 2560]) {
			expect(docGraphicStripFrac(w)).toBeGreaterThan(0.2);
			expect(docGraphicStripFrac(w)).toBeLessThan(0.5);
		}
	});

	it('returns a usable fraction for a nonsense width rather than 0 or NaN', () => {
		for (const w of [0, -1, NaN]) {
			const f = docGraphicStripFrac(w);
			expect(Number.isFinite(f)).toBe(true);
			expect(f).toBeGreaterThan(0);
		}
	});
});
