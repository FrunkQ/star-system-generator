// THE INVARIANT THIS FILE EXISTS TO PROTECT (docs/dev/type-vocabulary-prev4.md):
//
//     "For every type T in the vocabulary, a body created AS T must classify back AS T."
//
// D19 was a live violation of it. Antares is created as `M1.5Iab` — an M SUPERGIANT — and came back
// an M dwarf, at 0.265 solar masses against a real ~12-15. Stars carry no classifier fingerprints
// yet (65 of the pack's 70 are `planet/*`, none are `star/*`), so until they do the round trip is
// asserted on PARAMETERS, which is the only inverse that exists today.
//
// Every spectral string below is one SIMBAD actually returns — the census inside 16.5 ly was dumped
// to get them, so `dM6`, `M1-M2Ia-Iab`, `F5IV-V+DQZ`, `M1VIp` and `K6VeFe-1` are real, not invented.
import { describe, it, expect } from 'vitest';
import { starParamsFromType, starClasses, luminosityClassOf, parseStellarType, formatStellarType } from './stars.mjs';
import { loadStarterPack } from './testPack';

const st = (loadStarterPack() as any).statTemplates;
const LETTERS = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];

describe('luminosityClassOf — the parse', () => {
	it('reads the plain classes', () => {
		expect(luminosityClassOf('B8Ia')).toBe('I');
		expect(luminosityClassOf('M1.5Iab')).toBe('I');
		expect(luminosityClassOf('F7Ib')).toBe('I');
		expect(luminosityClassOf('K1.5III')).toBe('III');
		expect(luminosityClassOf('G2V')).toBe('V');
	});

	it('folds II up to I and IV down to V, as the bands are drawn', () => {
		expect(luminosityClassOf('F0II')).toBe('I'); // Canopus — a bright giant, nearer Ib than III
		expect(luminosityClassOf('G8IV')).toBe('V'); // a subgiant is a dwarf to within a factor
	});

	it('takes the FIRST, more luminous half of a range', () => {
		expect(luminosityClassOf('F5IV-V')).toBe('V'); // IV, then folded
		expect(luminosityClassOf('K0III-IV')).toBe('III');
		expect(luminosityClassOf('B0Ib-II')).toBe('I');
	});

	it('handles a range in the SUBCLASS as well as the class (Betelgeuse)', () => {
		// SIMBAD's real string. The subclass range repeats the letter, which is what breaks a
		// pattern that expects `-<digit>`.
		expect(luminosityClassOf('M1-M2Ia-Iab')).toBe('I');
	});

	it('ignores peculiarity suffixes rather than reading a class out of them', () => {
		expect(luminosityClassOf('M5.5Ve')).toBe('V');
		expect(luminosityClassOf('B2Vn')).toBe('V');
		expect(luminosityClassOf('M8.5Ve:')).toBe('V');
		expect(luminosityClassOf('K6VeFe-1')).toBe('V');
		expect(luminosityClassOf('M1VIp')).toBe('V'); // Kapteyn's Star — VI is a subdwarf, not I
	});

	it("reads SIMBAD's lowercase dwarf prefix as class V", () => {
		expect(luminosityClassOf('dM6')).toBe('V'); // Wolf 359
		expect(luminosityClassOf('dM4')).toBe('V'); // Ross 128
		expect(luminosityClassOf('sdM1')).toBe('V');
	});

	it('states nothing when the string states nothing', () => {
		expect(luminosityClassOf('M2')).toBeUndefined();
		expect(luminosityClassOf('')).toBeUndefined();
		expect(luminosityClassOf('Y0pec')).toBeUndefined();
		expect(luminosityClassOf('A0mA1Va')).toBeUndefined(); // Sirius; unparseable, so main sequence
	});

	it('discards the companion before scanning, never after', () => {
		// The whole bug in one assertion: read left to right and B2Vn's V wins.
		expect(luminosityClassOf('M1.5Iab+B2Vn')).toBe('I');
		expect(luminosityClassOf('F5IV-V+DQZ')).toBe('V');
		// `+` is not always a companion: SIMBAD's `M2+V` means "M2 or later, V".
		expect(luminosityClassOf('M2+V')).toBeUndefined();
	});
});

describe('starClasses — the D-type test is case-sensitive', () => {
	it('keeps real white dwarfs as white dwarfs', () => {
		for (const t of ['DA2.9', 'DA1.9', 'DZ7.5', 'DQ', 'DB3', 'M0 (white dwarf)']) {
			expect(starClasses(t).classes[0]).toBe('star/WD');
		}
	});

	it('does NOT swallow the lowercase dwarf prefix (four stars inside 16.5 ly)', () => {
		// `/^D/i` matched `dM6` and imported Wolf 359 as a 1.0 Msun, 24,000 K white dwarf.
		expect(starClasses('dM6').classes[0]).toBe('star/M'); // Wolf 359, Teegarden's Star
		expect(starClasses('dM4').classes[0]).toBe('star/M'); // Ross 128
		expect(starClasses('dM3').classes[0]).toBe('star/M'); // AD Leo
		expect(starClasses('dK5').classes[0]).toBe('star/K');
	});
});

describe('the invariant: a supergiant must not come back a dwarf', () => {
	// (1) SEPARATION — the assertion that failed for every letter before this patch.
	it.each(LETTERS)('%s: a supergiant is a different band from a dwarf, and >=10x as luminous', (L) => {
		const giant = starParamsFromType(`${L}2I`, st)!;
		const dwarf = starParamsFromType(`${L}2V`, st)!;
		expect(giant.massMsun).not.toBe(dwarf.massMsun);
		expect(giant.radiusRsun).toBeGreaterThan(dwarf.radiusRsun);
		expect(giant.luminosity! / dwarf.luminosity!).toBeGreaterThanOrEqual(10);
	});

	// (2) THE NAMED WORKED EXAMPLE. Pinned by name because it is the reported case.
	it('Antares (M1.5Iab+B2Vn) imports as a red supergiant, not a red dwarf', () => {
		const p = starParamsFromType('M1.5Iab+B2Vn', st)!;
		expect(p.luminosityClass).toBe('I');
		expect(p.massMsun).toBeGreaterThanOrEqual(8);
		expect(p.massMsun).toBeLessThanOrEqual(25);
		expect(p.radiusRsun).toBeGreaterThanOrEqual(300);
		expect(p.radiusRsun).toBeLessThanOrEqual(1200);
		expect(p.luminosity!).toBeGreaterThanOrEqual(30000);
	});

	it.each([
		['Betelgeuse', 'M1-M2Ia-Iab', 'star/M-I'],
		['Rigel', 'B8Ia', 'star/B-I'],
		['Deneb', 'A2Ia', 'star/A-I'],
		['Polaris', 'F7Ib', 'star/F-I'],
		['Canopus', 'F0II', 'star/F-I'],
		['Arcturus', 'K1.5III', 'star/K-III'],
		['Aldebaran', 'K5III', 'star/K-III'],
		['Capella Aa', 'G8III', 'star/G-III'],
		['Gacrux', 'M3.5III', 'star/M-III']
	])('%s (%s) resolves to %s', (_name, sp, key) => {
		const p = starParamsFromType(sp, st)!;
		const band = st[key];
		expect(p.massMsun).toBe((band.mass_solar[0] + band.mass_solar[1]) / 2);
		expect(p.radiusRsun).toBe((band.radius_solar[0] + band.radius_solar[1]) / 2);
	});

	// (4) COMPANION ISOLATION.
	it('a companion in the type changes nothing about the primary', () => {
		expect(starParamsFromType('M1.5Iab+B2Vn', st)).toEqual(starParamsFromType('M1.5Iab', st));
		expect(starParamsFromType('F5IV-V+DQZ', st)).toEqual(starParamsFromType('F5IV-V', st));
	});

	// (5) RANGE HANDLING.
	it('a subgiant range stays on the main sequence; a supergiant range does not', () => {
		expect(starParamsFromType('F5IV-V', st)).toEqual(starParamsFromType('F5V', st));
		expect(starParamsFromType('M1-M2Ia-Iab', st)!.massMsun).toBe(starParamsFromType('M1.5Iab', st)!.massMsun);
	});

	// (6) EVERY NEW KEY IS REACHABLE. A band nothing can reach is the bug this patch exists to fix.
	it.each(LETTERS.flatMap((L) => [[`star/${L}-I`, `${L}2Iab`], [`star/${L}-III`, `${L}2III`]]))(
		'%s is reachable from a catalogue string',
		(key, sp) => {
			expect(st[key], `${key} missing from the pack`).toBeTruthy();
			const p = starParamsFromType(sp, st)!;
			expect(p.massMsun).toBe((st[key].mass_solar[0] + st[key].mass_solar[1]) / 2);
		}
	);
});

// (3) THE FALLBACK IS UNCHANGED — the assertion that stops this patch moving the 34 bare stars a
// Local Neighbourhood import already returns. These are the values the pack's LETTER bands give,
// written out rather than derived, so a change to either side is caught.
describe('a star with no luminosity class behaves exactly as it did', () => {
	it.each([
		['M5.5Ve', 'star/M'], // Proxima Centauri
		['M4V', 'star/M'], // Barnard's Star
		['M2', 'star/M'],
		['M2+V', 'star/M'], // Lalande 21185
		['G2V', 'star/G'], // the Sun
		['K1V', 'star/K'], // Alpha Centauri B
		['A0mA1Va', 'star/A'], // Sirius A
		['F5IV-V+DQZ', 'star/F'], // Procyon A
		['', 'star/M'],
		['L7.5 (brown dwarf)', 'star/L'],
		['Y2', 'star/Y'],
		['T9', 'star/T'],
		['DA2.9', 'star/WD'] // 40 Eridani B
	])('%s still takes the %s band', (sp, key) => {
		const band = st[key];
		const p = starParamsFromType(sp, st)!;
		expect(p.massMsun).toBe((band.mass_solar[0] + band.mass_solar[1]) / 2);
		expect(p.radiusRsun).toBe((band.radius_solar[0] + band.radius_solar[1]) / 2);
		expect(p.temperatureK).toBe(Math.round((band.temp_k[0] + band.temp_k[1]) / 2));
		expect(p.typicalForClass).toBe(true);
	});
});

// ── THE FORWARD/INVERSE PAIR ──────────────────────────────────────────────────────────────────────
//
// `docs/dev/type-vocabulary-prev4.md`: "For every type T in the vocabulary, a body created AS T must
// classify back AS T." Picking is forward, classifying is inverse, and a vocabulary is sound when
// they compose to identity. Until this pair existed there was no way to ASK the question of a star —
// which is why D19 could stand: Antares went in as a supergiant and came back a dwarf with nothing
// in a position to notice.
const LUM_BAND: Record<string, string> = { Ia: 'I', Iab: 'I', Ib: 'I', II: 'I', III: 'III', IV: 'V', V: 'V', VI: 'V' };
const VOCABULARY = ['O', 'B', 'A', 'F', 'G', 'K', 'M', 'L', 'T', 'Y'].flatMap((spectral) =>
	[undefined, 'Ia', 'Iab', 'Ib', 'II', 'III', 'IV', 'V', 'VI'].flatMap((luminosity) =>
		[undefined, 0, 1.5, 5, 9.5].map((subclass) => ({
			spectral,
			...(subclass != null ? { subclass } : {}),
			...(luminosity ? { luminosity, band: LUM_BAND[luminosity] } : {})
		}))
	)
);

describe('the invariant: created AS it, classifies back AS it', () => {
	it(`round-trips every one of the ${VOCABULARY.length} types in the vocabulary`, () => {
		const broken = VOCABULARY.filter((t) => {
			const back = parseStellarType(formatStellarType(t));
			return JSON.stringify(back) !== JSON.stringify(t);
		});
		expect(broken, `${broken.length} types do not survive the round trip`).toEqual([]);
	});

	it('is idempotent on a real catalogue string — parse(format(parse(s))) == parse(s)', () => {
		// Every one of these is a string SIMBAD actually returned for the field inside 16.5 ly, plus
		// the bright-star anchors. The claim is NOT that the string comes back byte-identical:
		// peculiarity suffixes and range notation are annotation, not classification.
		const REAL = [
			'M5.5Ve', 'G2V', 'K1V', 'M4V', 'L7.5+T0.5', 'Y2', 'dM6', 'M2+V', 'A0mA1Va', 'M5.5V+M6V',
			'DA1.9', 'M3.5Ve', 'M5.0V', 'K2V', 'M2V', 'dM4', 'K7V', 'K5V', 'F5IV-V+DQZ', 'M3V',
			'M6.5Ve', 'G8V', 'T1V+T6V', 'M4.0Ve', 'M1VIp', 'M8.5V', 'M8.5Ve:', 'T6', 'DZ7.5', 'DQ',
			'K6VeFe-1', 'M1.0V', 'M6.0V', 'Y0pec', 'dM3', 'M1.5V', 'DA2.9', 'K0V', 'M4.5V', 'T9',
			'M1.5Iab+B2Vn', 'M1-M2Ia-Iab', 'B8Ia', 'A2Ia', 'F7Ib', 'K1.5III', 'K5III', 'K0III',
			'G8III', 'M3.5III', 'F0II', 'B0Ib-II', 'K0III-IV'
		];
		for (const s of REAL) {
			const once = parseStellarType(s);
			const twice = parseStellarType(formatStellarType(once));
			expect(twice, `${s} is not stable under the round trip`).toEqual(once);
		}
	});

	it('reads all three facts out of the reported case, and keeps the companion without acting on it', () => {
		expect(parseStellarType('M1.5Iab+B2Vn')).toEqual({
			spectral: 'M', subclass: 1.5, luminosity: 'Iab', band: 'I', companion: 'B2Vn'
		});
		expect(formatStellarType(parseStellarType('M1.5Iab+B2Vn'))).toBe('M1.5Iab+B2Vn');
	});

	it('distinguishes "stated as V" from "states nothing", which is the whole point of the field', () => {
		expect(parseStellarType('G2V')).toEqual({ spectral: 'G', subclass: 2, luminosity: 'V', band: 'V' });
		expect(parseStellarType('G2')).toEqual({ spectral: 'G', subclass: 2 });
		expect(parseStellarType('G2').luminosity).toBeUndefined();
	});

	it('classifies a white dwarf by its own notation, and rebuilds it', () => {
		expect(parseStellarType('DQZ')).toEqual({ spectral: 'WD', variant: 'QZ' });
		expect(parseStellarType('DA2.9')).toEqual({ spectral: 'WD', variant: 'A', subclass: 2.9 });
		expect(formatStellarType(parseStellarType('DZ7.5'))).toBe('DZ7.5');
	});

	it('says nothing rather than guessing when the string states no type', () => {
		expect(parseStellarType('')).toBeUndefined();
		expect(parseStellarType(null)).toBeUndefined();
		expect(parseStellarType('err')).toBeUndefined(); // 40 Eridani b, typed 'err' by SIMBAD
		expect(formatStellarType(undefined)).toBe('');
	});
});
