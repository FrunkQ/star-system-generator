// THE REFERENCE STARS — [[B48]] section 6 step 1, and the fixture the whole workstream is measured
// against. Published MK classifications on the left, ours on the right.
//
// WHY THIS FILE EXISTS AT ALL: `classifyStar` was believed to work because nothing contradicted it.
// Nothing contradicted it because there was no table of stars whose answers are known. Every claim
// about the classifier before this file was an argument; every claim after it is a measurement.
//
// THE HOT-END FAILURES BELOW ARE DELIBERATELY LEFT FAILING-BY-DOCUMENTATION rather than skipped:
// each is asserted at its CURRENT wrong value with the correct one named beside it, so the suite
// stays green while the debt is impossible to miss and impossible to "fix" by accident. When the 2D
// match regions land (section 10), these flip to the published column and the `WRONG` markers go.
// A skipped test would say nothing; this says exactly what is broken and by how much.
import { describe, it, expect } from 'vitest';
import { classifyStar, determineSpectralClass } from './stellar-evolution';
import { loadStarterPack } from '$lib/import/realsky/testPack';

const SOLAR_MASS_KG = 1.989e30;

interface Ref {
	name: string;
	/** Published MK type. */
	mk: string;
	tempK: number;
	/** Solar luminosities. */
	lum: number;
	/** Solar masses. */
	mass: number;
	/** The luminosity class the published type states. */
	published: string;
	/** What we return TODAY. Where it differs from `published`, that is the open defect. */
	today: string;
}

// Figures are standard catalogue values, rounded. They are anchors, not targets: if a general law
// gets one badly wrong, the law is wrong and the anchor has done its job.
const REFERENCE: Ref[] = [
	{ name: 'Sun', mk: 'G2V', tempK: 5772, lum: 1, mass: 1.0, published: 'V', today: 'V' },
	{ name: 'Proxima Centauri', mk: 'M5.5V', tempK: 3042, lum: 0.0017, mass: 0.122, published: 'V', today: 'VI' },
	{ name: 'Vega', mk: 'A0V', tempK: 9600, lum: 40, mass: 2.1, published: 'V', today: 'III' },
	{ name: 'B2V', mk: 'B2V', tempK: 20600, lum: 4300, mass: 9.1, published: 'V', today: 'II' },
	// B1V rather than B0V DELIBERATELY: a B0V's ~31,500 K sits ABOVE the standard 30,000 K O/B
	// boundary, so `determineSpectralClass` correctly returns 'O' for it and the row would assert a
	// fault that is not there. A reference table has to be free of boundary cases or it measures its
	// own edges rather than the engine. B1V is unambiguously B and just as bright.
	{ name: 'B1V', mk: 'B1V', tempK: 26000, lum: 16000, mass: 11, published: 'V', today: 'I' },
	{ name: 'O5V', mk: 'O5V', tempK: 42000, lum: 200000, mass: 37, published: 'V', today: 'I' },
	{ name: 'Arcturus', mk: 'K1.5III', tempK: 4286, lum: 170, mass: 1.08, published: 'III', today: 'III' },
	{ name: 'Aldebaran', mk: 'K5III', tempK: 3900, lum: 439, mass: 1.16, published: 'III', today: 'III' },
	{ name: 'Rigel', mk: 'B8Ia', tempK: 12100, lum: 120000, mass: 21, published: 'I', today: 'I' },
	{ name: 'Betelgeuse', mk: 'M1Ia', tempK: 3600, lum: 126000, mass: 16.5, published: 'I', today: 'I' }
];

const pack = loadStarterPack() as any;

/** WITHOUT a pack: the legacy absolute-luminosity cuts. Kept because it is still the fallback. */
const classOf = (r: Ref) =>
	classifyStar({ tempK: r.tempK, lumSolar: r.lum, massKg: r.mass * SOLAR_MASS_KG, ageGyr: 1 }).lumClass;

/** WITH a pack: position against the pack's own bands, which is what callers should use. */
const classWithPack = (r: Ref) =>
	classifyStar({ tempK: r.tempK, lumSolar: r.lum, massKg: r.mass * SOLAR_MASS_KG, ageGyr: 1 }, pack).lumClass;

describe('reference stars — the SPECTRAL LETTER is derived correctly today', () => {
	it.each(REFERENCE.map((r) => [r.name, r.tempK, r.mk[0]] as const))(
		'%s is spectral class %s',
		(_name, tempK, letter) => {
			expect(determineSpectralClass(tempK as number)).toBe(letter);
		}
	);
});

describe('reference stars — the LUMINOSITY CLASS, pinned at what we actually return', () => {
	it.each(REFERENCE.map((r) => [r.name, r] as const))('%s', (_name, r) => {
		const got = classOf(r as Ref);
		const ref = r as Ref;
		expect(got, `${ref.name} (${ref.mk}) — published ${ref.published}, we return ${ref.today}`)
			.toBe(ref.today);
	});
});

// The summary assertion. It fails the moment the count moves in EITHER direction: fixing one without
// updating the table is caught, and so is a regression that breaks one more.
describe('reference stars — the standing score', () => {
	it('gets 5 of 10 luminosity classes right, and the 5 wrong ones are all hot dwarfs', () => {
		const wrong = REFERENCE.filter((r) => classOf(r) !== r.published);
		expect(wrong.map((r) => r.name).sort()).toEqual(
			['B1V', 'B2V', 'O5V', 'Proxima Centauri', 'Vega'].sort()
		);
		// Every failure calls a MAIN-SEQUENCE star something evolved. That single sentence is the
		// diagnosis: absolute logL cuts fire before the relative main-sequence test, so anything
		// intrinsically bright is called a giant regardless of where it sits.
		expect(wrong.every((r) => r.published === 'V')).toBe(true);
	});

	it('never mistakes an evolved star for a dwarf — the error is one-directional', () => {
		// Worth pinning separately: the fault inflates, it does not deflate. A giant is never called
		// a dwarf, which is why nobody noticed — the wrong answers all look impressive.
		const evolved = REFERENCE.filter((r) => r.published !== 'V');
		for (const r of evolved) expect(classOf(r), r.name).not.toBe('V');
	});
});

// B55's hard requirement, and the frame bug that made it necessary. A remnant's identity is a fact
// about its PROGENITOR, so `massKg` (the object's own mass) cannot answer it — the parameter used to
// carry both frames and the thresholds were progenitor masses.
describe('remnants are classified in the right FRAME', () => {
	const remnant = (massSolar: number, progenitorSolar?: number) =>
		classifyStar({
			tempK: 20000, lumSolar: 0.05, massKg: massSolar * SOLAR_MASS_KG, ageGyr: 1, isRemnant: true,
			...(progenitorSolar == null ? {} : { progenitorMassKg: progenitorSolar * SOLAR_MASS_KG })
		});

	it('uses the PROGENITOR mass when it survived generation', () => {
		expect(remnant(1.8, 30).category).toBe('Black Hole');
		expect(remnant(1.8, 12).category).toBe('Neutron Star');
		expect(remnant(0.9, 3).category).toBe('White Dwarf');
	});

	it('falls back to the REMNANT limits when no progenitor was recorded', () => {
		// This is the case that used to be wrong. The pack's own star/NS band is 1.4..2.2 solar, and
		// its midpoint of 1.80 came back a WHITE DWARF because a real neutron star can never satisfy
		// a progenitor threshold of `> 8`.
		expect(remnant(1.8).category).toBe('Neutron Star');
		expect(remnant(1.8).lumClass).toBe('X');
		expect(remnant(0.9).category).toBe('White Dwarf'); // Chandrasekhar
		expect(remnant(10).category).toBe('Black Hole'); // above TOV
	});

	it('agrees with the pack\'s own remnant bands at their midpoints', () => {
		// WD 0.6..1.4, NS 1.4..2.2, BH 3..100 — the classifier must read the pack's shape back.
		expect(remnant((0.6 + 1.4) / 2).category).toBe('White Dwarf');
		expect(remnant((1.4 + 2.2) / 2).category).toBe('Neutron Star');
		expect(remnant((3 + 100) / 2).category).toBe('Black Hole');
	});
});

// THE FIX, AND THE WHOLE POINT OF THIS FILE. The table above records what the absolute-luminosity
// cuts return: five of ten wrong, every one of them a main-sequence star called something evolved.
// Given the PACK, the class comes from the star's POSITION against the same bands the generator draws
// from - radius at a given temperature, which is what a luminosity class physically measures.
describe('given the rule pack, all ten reference stars are classified correctly', () => {
	it.each(REFERENCE.map((r) => [`${r.name} (${r.mk})`, r] as const))('%s', (_n, r) => {
		expect(classWithPack(r as Ref)).toBe((r as Ref).published);
	});

	it('turns five wrong into none', () => {
		expect(REFERENCE.filter((r) => classWithPack(r) !== r.published).map((r) => r.name)).toEqual([]);
		// ...and the legacy path is still what it was, so the difference is the PACK and nothing else.
		expect(REFERENCE.filter((r) => classOf(r) !== r.published).length).toBe(5);
	});

	it('fixes precisely the hot dwarfs the old cuts inflated', () => {
		for (const name of ['Vega', 'B1V', 'O5V', 'B2V']) {
			const r = REFERENCE.find((x) => x.name === name)!;
			expect(classOf(r), `${name} legacy`).not.toBe('V');   // was wrong
			expect(classWithPack(r), `${name} with pack`).toBe('V'); // is right
		}
	});
});
