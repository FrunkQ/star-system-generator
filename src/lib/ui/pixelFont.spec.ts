// THE GLYPH TABLES, COPIED FROM THE HUB — and the test the hub told us to bring with them.
//
// Its warning, quoted because it is the whole reason this file exists: *"Two characters drawn
// identically is the failure mode, and it is invisible in review. When the hub added ROUND and
// NARROW, a test that refuses any two glyphs with identical rows caught `O` and `0` drawn the same
// in BOTH new alphabets, `N` reading as `K` in NARROW, and `U` byte-identical to `V` in ROUND.
// Nobody spotted any of them by eye."*
//
// It does a second job here that it did not do there: THREE HUNDRED LINES OF `#` AND `.` WERE
// COPIED BETWEEN TWO REPOSITORIES, and a botched copy is exactly as invisible as a badly drawn
// letter. This is the proof the data arrived whole.
import { describe, it, expect } from 'vitest';
import { GLYPHS, GLYPH_H, ROUND, NARROW, fold, runs, textRows, gridWidth } from './pixelFont';

const FAMILIES: [string, Record<string, string[]>][] = [
	['GLYPHS', GLYPHS],
	['ROUND', ROUND],
	['NARROW', NARROW]
];

describe.each(FAMILIES)('%s is a well-formed alphabet', (name, family) => {
	it('never draws two different characters identically', () => {
		const seen = new Map<string, string>();
		for (const [ch, rows] of Object.entries(family)) {
			if (ch === ' ') continue;
			const key = rows.join('/');
			expect(seen.has(key), `${name}: ${ch} is drawn exactly like ${seen.get(key)}`).toBe(false);
			seen.set(key, ch);
		}
	});

	it('gives every glyph seven rows of equal width, drawn only in # and .', () => {
		for (const [ch, rows] of Object.entries(family)) {
			expect(rows.length, `${name}: ${ch} has ${rows.length} rows`).toBe(GLYPH_H);
			const widths = new Set(rows.map((r) => r.length));
			expect(widths.size, `${name}: ${ch} has ragged rows`).toBe(1);
			for (const r of rows) expect(/^[#.]+$/.test(r), `${name}: ${ch} row "${r}"`).toBe(true);
		}
	});

	it('leaves no letter blank', () => {
		for (const [ch, rows] of Object.entries(family)) {
			if (ch === ' ') continue;
			expect(rows.join('').includes('#'), `${name}: ${ch} is empty`).toBe(true);
		}
	});
});

describe('the copy arrived whole', () => {
	it('carries a full A-Z and 0-9 in every alphabet', () => {
		// ABSOLUTE: a truncated paste would most likely lose the tail of a table, and the tail is
		// where the digits are.
		for (const [name, family] of FAMILIES) {
			for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
				expect(family[ch], `${name} is missing ${ch}`).toBeTruthy();
			}
		}
	});

	it('keeps punctuation in the BASE set only, which is what the fall-through is for', () => {
		// The hub's trap 2: NARROW's letters are 3 columns and it does not define a full stop, so
		// `SSE3.1` in NARROW would put a 5-wide stop beside 3-wide letters. That is a fact about the
		// data, and it is why the wordmark is set in ROUND.
		expect(GLYPHS['.']).toBeTruthy();
		expect(ROUND['.'], 'ROUND falls through for punctuation').toBeUndefined();
		expect(NARROW['.'], 'and so does NARROW').toBeUndefined();
	});
});

describe('fold: the alphabet is capitals, and it says so by enforcing it', () => {
	it('upper-cases, strips accents and folds quotes', () => {
		expect(fold('sse3.1')).toBe('SSE3.1');
		expect(fold('Zeta Réticuli')).toBe('ZETA RETICULI');
		expect(fold('it’s')).toBe("IT'S");
	});

	it('turns anything it cannot draw into a space rather than a hole', () => {
		expect(fold('A☃B')).toBe('A B');
	});
});

describe('the renderer', () => {
	it('merges each horizontal span of ink into ONE rect', () => {
		// The only cleverness in it: a word is tens of rectangles rather than hundreds.
		expect(runs(['#####'])).toEqual([{ x: 0, y: 0, w: 5 }]);
		expect(runs(['##.##'])).toEqual([
			{ x: 0, y: 0, w: 2 },
			{ x: 3, y: 0, w: 2 }
		]);
		expect(runs(['.....']), 'a blank row draws nothing').toEqual([]);
	});

	it('sets the wordmark in ROUND at a width the rail can hold', () => {
		// ABSOLUTE, because it is the thing on screen: six characters of ROUND, five columns each,
		// with a blank column between them - 6*5 + 5 = 35. At scale 3 that is 105 x 21 css pixels.
		const rows = textRows('SSE3.1', ROUND);
		expect(rows.length).toBe(GLYPH_H);
		expect(gridWidth(rows)).toBe(35);
	});

	it('falls through to the base alphabet for the full stop, and it is 5 wide there too', () => {
		// If ROUND ever gained its own '.', this width would move and the wordmark would reflow -
		// which is fine, but it should be a decision rather than a surprise.
		const withStop = gridWidth(textRows('SSE3.1', ROUND));
		const withoutStop = gridWidth(textRows('SSE31', ROUND));
		expect(withStop - withoutStop, 'the stop plus its spacing').toBe(6);
	});
});
