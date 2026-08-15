// G21: one star-image lookup, three callers. The three copies it replaced agreed on the exact hit
// and disagreed on everything else, so every case below that is NOT an exact hit is a case at least
// one of them got wrong. Each test names which.
import { describe, it, expect } from 'vitest';
import { resolveStarImage, spectralLetterOf } from './starImage';
import { loadStarterPack } from '$lib/import/realsky/testPack';

const pack = loadStarterPack() as any;
const images = pack.classifier.starImages as Record<string, string>;

describe('spectralLetterOf — a SHAPE test, not a list of exceptions (DATA-R13)', () => {
	it.each([
		['star/G', 'G'], //       a bare letter
		['star/G5V', 'G'], //     subtype digit + luminosity class
		['star/M-I', 'M'], //     supergiant band
		['star/K-III', 'K'], //   giant band
		['star/O', 'O']
	])('%s has the spectral letter %s', (cls, letter) => {
		expect(spectralLetterOf(cls)).toBe(letter);
	});

	// THE LIST THIS REPLACES IS THE POINT. A hardcoded exclusion list is correct only until someone
	// adds a class and nothing tells them the list exists — so these must fall through on their SHAPE.
	it.each([
		'star/red-giant', //   'r' is not a spectral letter at all
		'star/WD', //          'W' likewise
		'star/NS', //          'N' likewise
		'star/magnetar', //    lowercase, and never fold case on a spectral type (DATA-R10c)
		'star/BH', //          'B' IS a spectral letter — this is the one that bites
		'star/BH_active'
	])('%s has NO spectral letter', (cls) => {
		expect(spectralLetterOf(cls)).toBeUndefined();
	});

	it('survives a malformed class instead of throwing', () => {
		// `generateFromConfig.ts:148` did `classes[0].split('/')[1][0]` with no guard, which throws a
		// TypeError on any class with no slash in it — the whole generator dies on one bad key.
		for (const junk of ['star', 'star/', '', 'planet/terrestrial', undefined, null]) {
			expect(() => spectralLetterOf(junk as any)).not.toThrow();
			expect(spectralLetterOf(junk as any)).toBeUndefined();
		}
	});
});

describe('resolveStarImage — exact hit first, then the letter', () => {
	it('takes the class-specific portrait when the pack has one', () => {
		// A red supergiant must not draw a red DWARF: that is what the specific keys are for.
		expect(resolveStarImage(pack, 'star/M-I')).toBe(images['star/M-I']);
		expect(resolveStarImage(pack, 'star/K-III')).toBe(images['star/K-III']);
		expect(resolveStarImage(pack, 'star/M-I')).not.toBe(images['star/M']);
	});

	it('falls back to the letter for a band the pack does not picture', () => {
		// Deliberate and honest — a blue supergiant does look broadly like a hot blue star.
		expect(images['star/B-I']).toBeUndefined();
		expect(resolveStarImage(pack, 'star/B-I')).toBe(images['star/B']);
		expect(resolveStarImage(pack, 'star/G-III')).toBe(images['star/G']);
	});

	// THE FAULT THAT WAS ACTUALLY SHIPPED. `BodyStarTab` only fell back for a HYPHENATED band
	// (/^star\/([OBAFGKMLTY])-/), so a subtype key matched nothing and the editor set no portrait at
	// all — while `generation/star.ts` resolved the same key to `star/G`. Two doors, two answers.
	it('resolves a SUBTYPE key that the editor used to miss entirely', () => {
		expect(images['star/G5V']).toBeUndefined(); // the pack has no subtype keys
		expect(resolveStarImage(pack, 'star/G5V')).toBe(images['star/G']);
		expect(resolveStarImage(pack, 'star/M3')).toBe(images['star/M']);
	});

	// THE FAULT THAT WAS ONE PACK EDIT AWAY. `star.ts` took `spectral[0]` for any name longer than a
	// character, so removing an exact key would have sent these to `star/r`, `star/W` and `star/B`.
	// `star/B` is not a hypothetical miss — it is a black hole drawing a hot blue star.
	it('gives a remnant NO picture rather than a wrong one when its own key is absent', () => {
		const stripped = { classifier: { starImages: { ...images } } };
		delete (stripped.classifier.starImages as any)['star/BH'];
		delete (stripped.classifier.starImages as any)['star/red-giant'];
		delete (stripped.classifier.starImages as any)['star/WD'];
		expect(resolveStarImage(stripped, 'star/BH')).toBeUndefined();
		expect(resolveStarImage(stripped, 'star/red-giant')).toBeUndefined();
		expect(resolveStarImage(stripped, 'star/WD')).toBeUndefined();
		// ...and the real pack still pictures them, via their own keys.
		expect(resolveStarImage(pack, 'star/BH')).toBe(images['star/BH']);
	});

	it('answers undefined for a missing pack, a missing map and a malformed class', () => {
		expect(resolveStarImage(undefined, 'star/G')).toBeUndefined();
		expect(resolveStarImage({}, 'star/G')).toBeUndefined();
		expect(resolveStarImage({ classifier: {} }, 'star/G')).toBeUndefined();
		expect(resolveStarImage(pack, 'star')).toBeUndefined();
		expect(resolveStarImage(pack, undefined)).toBeUndefined();
	});

	it('reads a top-level starImages map as well as the classifier one', () => {
		// The editor honoured both; the two generators honoured only the classifier. One place now.
		expect(resolveStarImage({ starImages: { 'star/G': '/x.png' } }, 'star/G5V')).toBe('/x.png');
	});
});
