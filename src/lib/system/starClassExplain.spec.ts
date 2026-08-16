// The owner's own examples, asserted as written, plus the property that makes them maintainable:
// the size clause is DERIVED from the pack band, so it cannot drift from the physics.
import { describe, it, expect } from 'vitest';
import { explainStarClass, sizeInWords, pickerLabel, luminosityClassOfKey, exemplarFor } from './starClassExplain';
import { loadStarterPack } from '$lib/import/realsky/testPack';

const pack = loadStarterPack() as any;

describe('explainStarClass — the three shapes the owner gave', () => {
	it('names a main-sequence dwarf, a giant and a supergiant distinctly', () => {
		expect(explainStarClass(pack, 'star/G')!.kind).toBe('Main-sequence dwarf');
		expect(explainStarClass(pack, 'star/G-III')!.kind).toBe('Giant star');
		expect(explainStarClass(pack, 'star/G-I')!.kind).toBe('Luminous supergiant');
	});

	it('says the size in words a reader can picture, growing with the band', () => {
		expect(explainStarClass(pack, 'star/G')!.size).toBe('about the size of the Sun');
		expect(explainStarClass(pack, 'star/G-III')!.size).toMatch(/times wider than the Sun/);
		// G-I's band is 40..150 solar radii, so its midpoint is 95 - genuinely TENS. M-I, at 300..1200,
		// is the one that earns "hundreds". Asserting the band's own answer rather than the one the
		// phrase suggests is the whole point of deriving it.
		expect(explainStarClass(pack, 'star/G-I')!.size).toBe('tens of times wider than the Sun');
		expect(explainStarClass(pack, 'star/M-I')!.size).toBe('hundreds of times wider than the Sun');
	});

	it('reads as one sentence', () => {
		expect(explainStarClass(pack, 'star/G')!.text)
			.toBe('G (Main-sequence dwarf, yellow to human eyes, about the size of the Sun)');
		expect(explainStarClass(pack, 'star/M-I')!.text)
			.toBe('M-I (Luminous supergiant, red to human eyes, hundreds of times wider than the Sun)');
	});

	// The standing rule: an anthropocentric frame is welcome on the OUTPUT and forbidden in the
	// derivation. The letter comes from temperature; this only translates it for a reader, and says
	// whose eyes.
	it('attributes the colour rather than asserting it', () => {
		expect(explainStarClass(pack, 'star/M')!.text).toContain('red to human eyes');
		expect(explainStarClass(pack, 'star/O')!.colour).toBe('blue');
	});
});

describe('explainStarClass — the objects that are not points on the main sequence', () => {
	it.each([
		['star/WD', 'White dwarf'],
		['star/NS', 'Neutron star'],
		['star/magnetar', 'Magnetar'],
		['star/BH', 'Black hole'],
		['star/L', 'Brown dwarf']
	])('%s is named directly as a %s', (key, kind) => {
		expect(explainStarClass(pack, key)!.kind).toBe(kind);
	});

	it('describes each compact object at ITS OWN scale, not one bucket for all of them', () => {
		// Caught in the browser rather than here: an earlier version called a black hole "about the
		// size of the Earth", because one band covered everything from a 30 km neutron star to a
		// 300 km event horizon. A compact object's whole point is being small in a way solar radii
		// cannot express, so below a hundredth of a solar radius it is stated in kilometres.
		expect(explainStarClass(pack, 'star/WD')!.size).toBe('roughly the size of the Earth');
		expect(explainStarClass(pack, 'star/NS')!.size).toMatch(/^a ball about \d+ km across$/);
		expect(explainStarClass(pack, 'star/BH')!.size).toMatch(/^a ball about \d+ km across$/);
		// ...and they must not come out the same.
		expect(explainStarClass(pack, 'star/NS')!.size).not.toBe(explainStarClass(pack, 'star/BH')!.size);
	});

	it('gives no colour to an object with no spectral letter', () => {
		expect(explainStarClass(pack, 'star/BH')!.colour).toBeUndefined();
	});

	it('leaves an unknown designation unexplained rather than guessing', () => {
		expect(explainStarClass(pack, 'star/unknown')).toBeUndefined();
		expect(explainStarClass(pack, 'planet/terrestrial')).toBeUndefined();
	});
});

describe('the size clause is DERIVED, which is the point of it', () => {
	it('follows the band rather than a written-down number', () => {
		// Retune the band and the sentence follows — no prose to update, and no second copy of a
		// figure the pack already holds. This is what B57's "a band carries only what cannot be
		// computed" buys on the presentation side.
		const puffed = { ...pack, statTemplates: { ...pack.statTemplates, 'star/G': { ...pack.statTemplates['star/G'], radius_solar: [40, 60] } } };
		expect(explainStarClass(puffed, 'star/G')!.size).toBe('tens of times wider than the Sun');
	});

	it('is vague where a band is wide, and concrete where a reader can picture it', () => {
		// A supergiant band spans 300..1200 solar radii; a single figure there would be false
		// precision about a range.
		expect(sizeInWords(750)).toBe('hundreds of times wider than the Sun');
		expect(sizeInWords(10)).toBe('roughly 10 times wider than the Sun');
		expect(sizeInWords(1)).toBe('about the size of the Sun');
		expect(sizeInWords(0.2)).toMatch(/narrower than the Sun/);
	});

	it('says nothing rather than something wrong when there is no radius', () => {
		expect(sizeInWords(undefined)).toBeUndefined();
		expect(sizeInWords(0)).toBeUndefined();
	});
});

// Owner, 2026-08-15: the list "needs to have the I V II Ia luminosity after to inform the user what
// type is which". A bare letter band IS main sequence, so it shows V rather than staying silent —
// which is the whole point, since "G-Type (Yellow Dwarf)" never told anyone it meant G V.
describe('pickerLabel — the dropdown says which luminosity class it is', () => {
	it('puts the luminosity class after the letter', () => {
		expect(pickerLabel(pack, 'star/G')).toBe('G V — Main-sequence dwarf (yellow) · the Sun');
		expect(pickerLabel(pack, 'star/K-III')).toBe('K III — Giant star (orange) · Arcturus');
		expect(pickerLabel(pack, 'star/M-I')).toBe('M I — Luminous supergiant (red) · Betelgeuse');
		expect(pickerLabel(pack, 'star/O')).toBe('O V — Main-sequence dwarf (blue) · Zeta Ophiuchi');
	});

	it('shows V for a bare letter, because a bare letter IS main sequence', () => {
		// mk-lum 1.1. The old label "G-Type (Yellow Dwarf)" carried this implicitly and told nobody.
		expect(luminosityClassOfKey('star/G')).toBe('V');
		expect(luminosityClassOfKey('star/M-III')).toBe('III');
		expect(luminosityClassOfKey('star/A-I')).toBe('I');
	});

	it('gives no luminosity class to an object that has none', () => {
		for (const k of ['star/WD', 'star/NS', 'star/BH', 'star/magnetar', 'star/L']) {
			expect(luminosityClassOfKey(k), k).toBeUndefined();
		}
		// ...and those label by name instead, with no dangling dash-V.
		expect(pickerLabel(pack, 'star/WD')).toBe('WD — White dwarf · Sirius B');
		expect(pickerLabel(pack, 'star/BH')).toBe('BH — Black hole · Cygnus X-1');
	});

	it('falls back rather than throwing for a key it cannot read', () => {
		expect(pickerLabel(pack, 'star/unknown')).toBeUndefined();
	});
});

describe('the famous few', () => {
	it('names an exemplar only where one is genuinely famous', () => {
		expect(exemplarFor('star/G')).toBe('the Sun');
		expect(exemplarFor('star/M-I')).toBe('Betelgeuse');
		// Sparse by design: an exemplar nobody recognises is worse than none, so these have none
		// rather than being filled in for symmetry.
		expect(exemplarFor('star/K-I')).toBeUndefined();
		expect(exemplarFor('star/O-III')).toBeUndefined();
	});

	it('leaves the label well-formed when there is no exemplar', () => {
		expect(pickerLabel(pack, 'star/K-I')).toBe('K I — Luminous supergiant (orange)');
	});
});

// Owner, 2026-08-15: "this should also change M-type to Flaring M-Type."
describe('a flare star is described as one', () => {
	it('says Flaring when the activity bucket is flare-star', () => {
		expect(explainStarClass(pack, 'star/M', 'flare-star')!.kind).toBe('Flaring main-sequence dwarf');
		expect(explainStarClass(pack, 'star/M', 'flare-star')!.text).toMatch(/^M \(Flaring main-sequence dwarf/);
	});

	it('does NOT say it for a quiet star, which is the same class', () => {
		// The designation is unchanged — flaring is a property of THIS star, not of M dwarfs as a
		// class, and it comes from class AND age. An old M dwarf is not a flare star.
		for (const bucket of ['quiet', 'moderate', 'active', undefined]) {
			expect(explainStarClass(pack, 'star/M', bucket)!.kind, String(bucket)).toBe('Main-sequence dwarf');
		}
	});
});

// (THE SUBCLASS TESTS MOVED to `physics/starDesignation.spec.ts` with the derivation itself. The
//  ladder they pinned divided each letter into ten equal temperature steps and was accurate to about
//  a subclass and a half; the anchors that replaced it are exact for ten of twelve published stars,
//  so the assertions changed with the numbers. The giant REFUSAL moved unchanged.)
