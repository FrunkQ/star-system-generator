// The subclass derivation measured against stars whose published designation is known — the same
// discipline as `starClassification.reference.spec.ts`, which exists because "nothing contradicted
// it" is not evidence. Temperatures are the published effective temperatures; the digit on the right
// is what the MK catalogue says, and where we differ the entry says by how much.
import { describe, it, expect } from 'vitest';
import { subclassForTemp, designationFor } from './starDesignation';
import { loadStarterPack } from '$lib/import/realsky/testPack';

const pack = loadStarterPack() as any;

describe('subclassForTemp — the digit comes from anchors, interpolated', () => {
	// THE PUBLISHED DIGIT IS ON THE LEFT AND OURS IS ON THE RIGHT, and where they differ the row
	// says so rather than the anchors being bent to close the gap — two stars are not a calibration
	// set, and moving an anchor to catch one would move every star that shares its letter.
	// The whole table lands within ONE subclass of the catalogue, which is the claim being made.
	it.each([
		// star,               letter, Teff,   published, ours
		['Sol', 'G', 5772, 2, 2],
		['Vega', 'A', 9602, 0, 0],
		['Altair', 'A', 7550, 7, 8],        // a rapid rotator: gravity darkening makes its own Teff
		//                                     ambiguous in the literature (6,900-8,500 K quoted)
		['Procyon A', 'F', 6530, 5, 5],
		['Alpha Cen A', 'G', 5790, 2, 2],
		['Alpha Cen B', 'K', 5260, 1, 0],   // K1V at 5,260 K, a whisker off K0's own anchor
		['Epsilon Eridani', 'K', 5084, 2, 2],
		['61 Cygni A', 'K', 4526, 5, 4],
		['Proxima', 'M', 3042, 5, 5],       // published M5.5Ve
		["Barnard's Star", 'M', 3134, 4, 4],
		['Betelgeuse', 'M', 3600, 2, 2],    // published M1-M2; the giant branch runs a little cooler
		['Rigel', 'B', 12100, 8, 8]         // published B8Ia, off the MAIN-SEQUENCE anchors
	])('%s: published %s%i, ours %s%i', (_name, letter, tempK, published, ours) => {
		const got = Math.round(subclassForTemp(letter as string, tempK as number, pack)!);
		expect(got).toBe(ours);
		expect(Math.abs(got - (published as number)), 'never more than one subclass out').toBeLessThanOrEqual(1);
	});

	it('clamps rather than running off either end of a letter', () => {
		// A star hotter than its letter's 0 anchor is a 0, not a negative one, and the coolest is a 9.
		expect(subclassForTemp('G', 99000, pack)).toBe(0);
		expect(subclassForTemp('G', 1, pack)).toBe(9);
		expect(subclassForTemp('O', 99000, pack)).toBe(3);   // the O sequence starts at O3
	});

	it('states nothing when the pack states no anchors, rather than guessing', () => {
		// A pack describing another classification scheme gets letters with no digit — a designation
		// that says less, never one that says something wrong.
		expect(subclassForTemp('G', 5772, {})).toBeUndefined();
		expect(subclassForTemp('Q', 5772, pack)).toBeUndefined();   // no such letter in the anchors
		expect(subclassForTemp('G', 0, pack)).toBeUndefined();      // no temperature is not a cool star
	});

	it('the sequence is uneven, and a linear split of the band would not reproduce it', () => {
		// The reason anchors exist at all: equal steps in subclass are NOT equal steps in temperature.
		const g0 = 5930, g2 = 5770, g5 = 5660, g9 = 5340;
		expect((g0 - g2) / 2).toBeGreaterThan((g2 - g5) / 3);   // 80 K per subclass against 37
		expect((g5 - g9) / 4).toBeGreaterThan((g2 - g5) / 3);   // and it widens again below G5
	});
});

describe('designationFor — the parts the engine already has, assembled', () => {
	it('carries the luminosity class through without re-deriving it', () => {
		const d = designationFor({ spectral: 'G', tempK: 5772, luminosity: 'V' }, pack);
		expect(d).toEqual({ spectral: 'G', subclass: 2, luminosity: 'V', band: 'V' });
	});

	it('splits a Roman class from its a/b suffix for the band', () => {
		expect(designationFor({ spectral: 'M', tempK: 3600, luminosity: 'Iab' }, pack).band).toBe('I');
	});

	it('states no class when the caller has none — absent is not the same as V', () => {
		expect(designationFor({ spectral: 'K', tempK: 4500 }, pack).luminosity).toBeUndefined();
	});
});
