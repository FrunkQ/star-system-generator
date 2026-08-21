// The ten reference stars again — this time against the pack's own bands rather than absolute
// luminosity cuts. This is the file that decides whether the fix worked: the same table that recorded
// five of ten wrong should now record none.
import { describe, it, expect } from 'vitest';
import { matchStarBand, luminosityClassFromPosition } from './starBandMatch';
import { explainStarClass } from './starClassExplain';
import { loadStarterPack } from '$lib/import/realsky/testPack';

const pack = loadStarterPack() as any;

interface Ref { name: string; mk: string; tempK: number; radiusSolar: number; published: 'I' | 'III' | 'V' }

// Radii are standard catalogue values. They are ANCHORS, not targets — if the general rule gets one
// badly wrong, the rule is wrong.
const REFERENCE: Ref[] = [
	{ name: 'Sun', mk: 'G2V', tempK: 5772, radiusSolar: 1, published: 'V' },
	{ name: 'Proxima Centauri', mk: 'M5.5V', tempK: 3042, radiusSolar: 0.154, published: 'V' },
	{ name: 'Vega', mk: 'A0V', tempK: 9600, radiusSolar: 2.36, published: 'V' },
	{ name: 'B2V', mk: 'B2V', tempK: 20600, radiusSolar: 5.2, published: 'V' },
	{ name: 'B1V', mk: 'B1V', tempK: 26000, radiusSolar: 6.4, published: 'V' },
	{ name: 'O5V', mk: 'O5V', tempK: 42000, radiusSolar: 12, published: 'V' },
	{ name: 'Arcturus', mk: 'K1.5III', tempK: 4286, radiusSolar: 25.4, published: 'III' },
	{ name: 'Aldebaran', mk: 'K5III', tempK: 3900, radiusSolar: 45, published: 'III' },
	{ name: 'Rigel', mk: 'B8Ia', tempK: 12100, radiusSolar: 78.9, published: 'I' },
	{ name: 'Betelgeuse', mk: 'M1Ia', tempK: 3600, radiusSolar: 764, published: 'I' }
];

describe('the reference stars, classified by POSITION rather than brightness', () => {
	it.each(REFERENCE.map((r) => [`${r.name} (${r.mk})`, r] as const))('%s', (_n, r) => {
		const ref = r as Ref;
		expect(luminosityClassFromPosition(pack, { temperatureK: ref.tempK, radiusSolar: ref.radiusSolar }))
			.toBe(ref.published);
	});

	it('gets ALL TEN right, where absolute luminosity cuts got five wrong', () => {
		const wrong = REFERENCE.filter(
			(r) => luminosityClassFromPosition(pack, { temperatureK: r.tempK, radiusSolar: r.radiusSolar }) !== r.published
		);
		expect(wrong.map((r) => r.name)).toEqual([]);
	});

	// THE FAILURE THAT DEFINED THE OLD MODEL, asserted directly so a regression is unmistakable.
	it('no longer calls a hot MAIN-SEQUENCE star evolved', () => {
		// Vega, B1V, B2V and O5V are all intrinsically bright AND all dwarfs. Brightness alone cannot
		// tell those apart from a giant; radius at a given temperature can.
		for (const r of REFERENCE.filter((x) => x.published === 'V' && x.tempK > 9000)) {
			expect(luminosityClassFromPosition(pack, { temperatureK: r.tempK, radiusSolar: r.radiusSolar }), r.name)
				.toBe('V');
		}
	});
});

describe('what the match is actually doing', () => {
	it('separates a dwarf from a giant at the SAME temperature', () => {
		// The whole principle in one assertion: identical temperature, 40x the radius, different class.
		const t = 4300;
		expect(luminosityClassFromPosition(pack, { temperatureK: t, radiusSolar: 0.7 })).toBe('V');
		expect(luminosityClassFromPosition(pack, { temperatureK: t, radiusSolar: 30 })).toBe('III');
		expect(luminosityClassFromPosition(pack, { temperatureK: t, radiusSolar: 250 })).toBe('I');
	});

	it('names the band, not just the class, so generation and classification share a key', () => {
		const m = matchStarBand(pack, { temperatureK: 4286, radiusSolar: 25.4 })!;
		expect(m.key).toBe('star/K-III');
		expect(m.band).toBe('III');
	});

	it('round-trips every positional band in the pack — the inverse property', () => {
		// Take each band's own midpoint and classify it. It must come back as itself. This is the
		// invariant the whole vocabulary exists for: pick X, get X.
		const templates = pack.statTemplates as Record<string, any>;
		const positional = Object.keys(templates).filter(
			(k) => k.startsWith('star/') && !/^star\/(WD|NS|BH|BH_active|magnetar|default|L|T|Y)$/.test(k)
		);
		expect(positional.length).toBeGreaterThan(15);
		const failures: string[] = [];
		for (const key of positional) {
			const tpl = templates[key];
			const t = (tpl.temp_k[0] + tpl.temp_k[1]) / 2;
			const r = (tpl.radius_solar[0] + tpl.radius_solar[1]) / 2;
			const got = matchStarBand(pack, { temperatureK: t, radiusSolar: r })?.key;
			if (got !== key) failures.push(`${key} -> ${got}`);
		}
		expect(failures).toEqual([]);
	});

	it('declines rather than guessing when it cannot answer', () => {
		expect(matchStarBand(pack, { temperatureK: 0, radiusSolar: 1 })).toBeUndefined();
		expect(matchStarBand(pack, { temperatureK: 5772, radiusSolar: 0 })).toBeUndefined();
		expect(matchStarBand({}, { temperatureK: 5772, radiusSolar: 1 })).toBeUndefined();
	});
});

// CLOSING THE CIRCLE ON THE HR DIAGRAM. The wizard lets a GM CLICK a point — a temperature and a
// luminosity — and the hierarchy row used to answer "G-type", which throws away the luminosity class
// the click just determined. This composes exactly what the row now does, for the very star in the
// owner's screenshot: 5,829 K at 1.14 Lsun.
describe('a clicked point on the HR diagram resolves to a full designation', () => {
	const designationOf = (tempK: number, lumSolar: number) => {
		const radiusSolar = Math.sqrt(lumSolar) / Math.pow(tempK / 5778, 2);
		const band = luminosityClassFromPosition(pack, { temperatureK: tempK, radiusSolar });
		return { band, radiusSolar };
	};

	it('reads the screenshot star as a main-sequence G', () => {
		const { band, radiusSolar } = designationOf(5829, 1.14);
		expect(radiusSolar).toBeCloseTo(1.05, 1); // a Sun-sized star, as it should be
		expect(band).toBe('V');
	});

	it('answers a different CLASS for the same temperature at giant size', () => {
		// Click higher up the diagram at the same colour and the designation must follow — that is the
		// whole point of the diagram being the input.
		expect(designationOf(5829, 1.14).band).toBe('V');
		expect(designationOf(5829, 150).band).toBe('III');
		expect(designationOf(5829, 8000).band).toBe('I');
	});

	it('produces a designation a reader can understand, from one builder', () => {
		const ex = explainStarClass(pack, 'star/G')!;
		expect(ex.text).toBe('G (Main-sequence dwarf, yellow to human eyes, about the size of the Sun)');
		expect(explainStarClass(pack, 'star/G-III')!.kind).toBe('Giant star');
	});
});
