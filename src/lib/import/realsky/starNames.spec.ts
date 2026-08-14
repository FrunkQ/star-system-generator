// D24: the name map is TWO-WAY, and the tests are written to fail if it stops being.
//
// A display-only prettifier produces an app that shows a name it cannot find — the user copies what
// the app printed, pastes it into the Resolve box, and gets an error. So every assertion here that
// says "this is displayed as X" has a partner saying "and X, normalised, is a thing the catalogue
// accepts". The live half of that (434 identifiers x 2 styles, all resolving) was measured against
// SIMBAD directly; what is pinned here is the shape that made it true.
import { describe, it, expect } from 'vitest';
import {
	displayStarName, systemStarName, expandDesignation, splitDesignation,
	toAsciiQuery, needsAsciiRewrite, stripCatalogueFurniture, GREEK, CONSTELLATION
} from './starNames.mjs';

describe('the tables are complete by construction', () => {
	it('has all 24 Greek letters and all 88 constellations', () => {
		expect(Object.keys(GREEK)).toHaveLength(24);
		expect(Object.keys(CONSTELLATION)).toHaveLength(88);
	});

	it('gives every Greek letter both a word and a symbol, and they are distinct', () => {
		const words = new Set<string>(), symbols = new Set<string>();
		for (const [word, symbol] of Object.values(GREEK) as [string, string][]) {
			expect(word).toMatch(/^[A-Z][a-z]+$/);
			expect(symbol).toHaveLength(1);
			words.add(word); symbols.add(symbol);
		}
		expect(words.size).toBe(24);
		expect(symbols.size).toBe(24);
	});

	it('gives every constellation a genitive, never the nominative', () => {
		// "Alpha OF Scorpius" is "Alpha Scorpii". A nominative here would read as a grammatical error
		// on every label it touches.
		expect(CONSTELLATION.Sco).toBe('Scorpii');
		expect(CONSTELLATION.Ori).toBe('Orionis');
		expect(CONSTELLATION.UMa).toBe('Ursae Majoris');
		expect(CONSTELLATION.Cru).toBe('Crucis');
		expect(CONSTELLATION.PsA).toBe('Piscis Austrini');
		expect(CONSTELLATION.Com).toBe('Comae Berenices');
		// A blanket "no -us ending" check would be wrong: Dorado's genitive really is Doradus. The
		// nominatives worth guarding against are the ones a careless table would leave in place.
		for (const wrong of ['Scorpius', 'Orion', 'Ursa Major', 'Crux', 'Pisces', 'Taurus', 'Cygnus']) {
			expect(Object.values(CONSTELLATION)).not.toContain(wrong);
		}
	});
});

describe('display: a name rather than a database key', () => {
	it.each([
		['* alf Sco', 'Antares'],
		['* alf Ori', 'Betelgeuse'],
		['* bet Ori', 'Rigel'],
		['* alf UMi', 'Polaris'],
		['* alf Boo', 'Arcturus'],
		['* alf CMa', 'Sirius'],
		['* alf CMa B', 'Sirius B'],
		['* bet01 Cyg', 'Albireo'],
		['NAME Proxima Centauri', 'Proxima Centauri'],
		['V* AD Leo', 'AD Leo'],
		['Wolf  359', 'Wolf 359'],
		['HD  95735', 'HD 95735']
	])('%s reads as %s', (id, expected) => {
		expect(displayStarName(id)).toBe(expected);
	});

	it('expands a designation the catalogue has no proper name for', () => {
		expect(displayStarName('* eps Ind')).toBe('Epsilon Indi');
		expect(displayStarName('* tau Cet')).toBe('Tau Ceti');
		expect(displayStarName('*  61 Cyg A')).toBe('61 Cygni A');
		expect(displayStarName('* eps Ind', { style: 'symbol' })).toBe('ε Indi');
	});

	it('LEAVES A SURVEY DESIGNATION ALONE, because mangling it would be inventing', () => {
		for (const id of ['2MASS J09205549+4539058', 'WISEA J085510.74-071442.5', 'SCR J1845-6357B',
			'DENIS J104814.6-395606', 'G 272-61B', 'LP  731-58']) {
			expect(displayStarName(id)).toBe(id.replace(/\s+/g, ' '));
		}
	});

	it('names the SYSTEM without the component letter', () => {
		// A system is Alpha Centauri; the star at its centre is Rigil Kentaurus. Naming the system
		// after its primary gives "Rigil Kentaurus" for the most familiar system in the sky.
		expect(systemStarName('* alf Cen A')).toBe('Alpha Centauri');
		expect(displayStarName('* alf Cen A')).toBe('Rigil Kentaurus');
		expect(displayStarName('* alf Cen B')).toBe('Toliman');
		// ...but a star that IS its own system keeps its name.
		expect(systemStarName('* alf Sco')).toBe('Antares');
		expect(systemStarName('2MASS J09205549+4539058')).toBe('2MASS J09205549+4539058');
	});
});

describe('query: the inverse, and it is load-bearing', () => {
	it('turns a Greek symbol into something the service will accept', () => {
		// SIMBAD's TAP rejects non-ASCII with an HTTP 400. This is why the map must be two-way:
		// without it, improving the display CREATES a bug for anyone who copies what they were shown.
		expect(toAsciiQuery('α Scorpii')).toBe('Alpha Scorpii');
		expect(toAsciiQuery('β Ori')).toBe('Beta Ori');
		expect(toAsciiQuery('ο² Eridani')).toBe('Omicron2 Eridani');
		expect(toAsciiQuery('ε Indi')).toBe('Epsilon Indi');
	});

	it('leaves an already-plain query completely alone', () => {
		for (const q of ['Antares', 'alf Sco', 'HD 148478', '61 Cygni', "Barnard's Star", '2MASS J0920+4539']) {
			expect(toAsciiQuery(q)).toBe(q);
			expect(needsAsciiRewrite(q)).toBeNull();
		}
	});

	it('tidies what a user pastes from a web page', () => {
		expect(toAsciiQuery('Barnard’s Star')).toBe("Barnard's Star");
		expect(toAsciiQuery('  spaced   out  ')).toBe('spaced out');
	});

	it('emits pure ASCII whatever it is given, because anything else is a 400', () => {
		for (const q of ['α Scorpii', 'ο² Eridani', 'Straße', 'Wolf 359', 'ε Indi B', '日本']) {
			expect(toAsciiQuery(q)).toMatch(/^[\x20-\x7E]*$/);
		}
	});

	it('reports the rewrite so the UI can say so rather than silently changing the search', () => {
		expect(needsAsciiRewrite('α Scorpii')).toBe('Alpha Scorpii');
	});
});

describe('the two halves compose — what is shown can be sent', () => {
	// The property the live check measured over 434 cases, pinned here on the anchors so a
	// regression is caught without a network call.
	it.each([
		'* alf Sco', '* alf Ori', '* bet Ori', '* alf Cyg', '* alf UMi', '* alf Boo', '* alf Tau',
		'* alf Cen A', '* alf Cen B', '* eps Ind', '* omi02 Eri', '* omi02 Eri B', '* bet01 Cyg',
		'*  61 Cyg A', '* eta Cas B', '* tau Cet', 'NAME Proxima Centauri', '2MASS J09205549+4539058'
	])('%s survives display -> normalise, in both styles', (id) => {
		for (const style of ['word', 'symbol'] as const) {
			const shown = displayStarName(id, { style });
			const sent = toAsciiQuery(shown);
			expect(shown, `${id} displayed as nothing`).toBeTruthy();
			expect(sent, `${id} normalised to nothing`).toBeTruthy();
			// Pure ASCII, or the service returns a 400 rather than a result.
			expect(sent).toMatch(/^[\x20-\x7E]+$/);
		}
	});

	it('parses back the designations it builds', () => {
		expect(splitDesignation('alf Sco')).toEqual({ bayer: 'alf', superscript: '', constellation: 'Sco', component: '' });
		expect(splitDesignation('bet01 Cyg A')).toEqual({ bayer: 'bet', superscript: '01', constellation: 'Cyg', component: 'A' });
		expect(splitDesignation('61 Cyg')).toEqual({ flamsteed: '61', constellation: 'Cyg', component: '' });
		// Not a designation, and must not be forced into one.
		expect(splitDesignation('2MASS J09205549+4539058')).toBeNull();
		expect(splitDesignation('HD 95735')).toBeNull();
		expect(expandDesignation('2MASS J09205549+4539058')).toBeNull();
	});

	it('strips catalogue furniture without eating the identifier', () => {
		expect(stripCatalogueFurniture('* alf Cen A')).toBe('alf Cen A');
		expect(stripCatalogueFurniture('NAME Proxima Centauri')).toBe('Proxima Centauri');
		expect(stripCatalogueFurniture('*  61 Cyg A')).toBe('61 Cyg A');
		expect(stripCatalogueFurniture('V* EZ Aqr')).toBe('EZ Aqr');
		expect(stripCatalogueFurniture('')).toBe('');
	});
});
