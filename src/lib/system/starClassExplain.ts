// PLAIN ENGLISH FOR A STAR DESIGNATION — owner, 2026-08-15, with the format given by example:
//
//   G2V   (Main-sequence dwarf, about the size of the Sun)
//   G2III (Giant star, roughly 10 times wider than the Sun)
//   G2Ia  (Luminous supergiant, hundreds of times wider than the Sun)
//
// ONE builder, used by the editor's tooltip and the physics page, so the two cannot describe the
// same designation differently.
//
// THE SIZE CLAUSE IS DERIVED FROM THE PACK'S OWN RADIUS BAND, NOT AUTHORED PROSE. That is B57's rule
// paying off twice: radius is an ANCHOR the band already states, so the sentence cannot drift from
// the physics, and retuning a band updates every explanation for free. Authoring "roughly 10 times
// wider" as a string would have been a second copy of a number the pack already holds.
import type { RulePack } from '$lib/types';
import { starStatTemplate } from '$lib/generation/star';
import { SOLAR_RADIUS_KM } from '$lib/constants';

export interface StarClassExplanation {
	/** The designation itself, e.g. `G2V`. */
	designation: string;
	/** What kind of object it is, in plain words: "Giant star", "White dwarf". */
	kind: string;
	/** The colour a human eye would call it, or undefined for objects with no spectral letter. */
	colour?: string;
	/** Size in plain words, derived from the band: "roughly 10 times wider than the Sun". */
	size?: string;
	/** The whole thing, formatted as the owner wrote it. */
	text: string;
}

// THE LUMINOSITY CLASS SAYS WHAT KIND OF OBJECT, and this is a presentation table rather than a
// physics one — the physics decides which class applies, this only names it for a reader.
const KIND_BY_BAND: Record<string, string> = {
	'0': 'Hypergiant',
	I: 'Luminous supergiant',
	Ia: 'Luminous supergiant',
	Iab: 'Luminous supergiant',
	Ib: 'Supergiant',
	II: 'Bright giant',
	III: 'Giant star',
	IV: 'Subgiant',
	V: 'Main-sequence dwarf',
	VI: 'Subdwarf',
	VII: 'White dwarf'
};

// A NON-SPECTRAL KEY IS ITS OWN KIND. These have no letter and no luminosity class — they are what
// they are — so they are named directly rather than parsed.
const KIND_BY_KEY: Record<string, string> = {
	WD: 'White dwarf',
	NS: 'Neutron star',
	magnetar: 'Magnetar',
	BH: 'Black hole',
	BH_active: 'Feeding black hole',
	L: 'Brown dwarf',
	T: 'Brown dwarf (methane)',
	Y: 'Brown dwarf (cool)'
};

// The colour a human eye would call it. SAY WHOSE EYES: this is the standing rule that an
// anthropocentric frame is welcome on the OUTPUT and forbidden in the derivation — the letter comes
// from temperature, and this only translates it for a reader.
const COLOUR_BY_LETTER: Record<string, string> = {
	O: 'blue', B: 'blue-white', A: 'white', F: 'yellow-white',
	G: 'yellow', K: 'orange', M: 'red'
};

/** Parse a pack key or MK designation into its letter and luminosity band. */
function parts(key: string): { letter?: string; band?: string; bare?: string } {
	const name = key.replace(/^star\//, '');
	if (KIND_BY_KEY[name]) return { bare: name };
	const m = /^([OBAFGKMLTY])(\d+(?:\.\d+)?)?-?(0|Ia|Iab|Ib|I{1,3}|IV|VI|V)?$/.exec(name);
	if (!m) return {};
	return { letter: m[1], band: m[3] };
}

/**
 * Size in plain words, from a radius in solar radii.
 *
 * Deliberately vague at the top end — "hundreds of times wider" rather than a figure — because a
 * supergiant band spans 300 to 1200 solar radii and a single number would be false precision about
 * a range. Deliberately concrete in the middle, where a reader can picture it.
 */
export function sizeInWords(radiusSolar: number | undefined): string | undefined {
	if (!(radiusSolar! > 0)) return undefined;
	const r = radiusSolar!;
	// BELOW ABOUT A HUNDREDTH OF A SOLAR RADIUS, GIVE KILOMETRES. "About the size of the Earth" was
	// caught covering everything from a 30 km neutron star to a 300 km event horizon, which is absurd
	// at both ends — a compact object's whole point is that it is small in a way solar radii cannot
	// express. Rounded to one significant figure, because a band's midpoint does not justify more.
	if (r < 0.01) {
		const kmAcross = 2 * r * SOLAR_RADIUS_KM;
		const rounded = Number(kmAcross.toPrecision(1));
		return `a ball about ${rounded.toLocaleString()} km across`;
	}
	if (r < 0.05) return 'roughly the size of the Earth';
	if (r < 0.8) return `roughly ${Math.round((1 / r) * 10) / 10} times narrower than the Sun`;
	if (r < 1.25) return 'about the size of the Sun';
	if (r < 25) return `roughly ${Math.round(r)} times wider than the Sun`;
	if (r < 100) return 'tens of times wider than the Sun';
	return 'hundreds of times wider than the Sun';
}

/**
 * Explain a star designation in plain English, deriving the size from the pack's own band.
 *
 * Returns undefined only for a key with no letter AND no known kind — an unknown designation is
 * better left unexplained than guessed at.
 */
export function explainStarClass(
	pack: RulePack | any,
	classKey: string,
	/**
	 * The star's activity bucket, when it is known. A FLARE STAR is worth saying out loud — owner,
	 * 2026-08-15: "this should also change M-type to Flaring M-Type". It is not a different CLASS
	 * (the designation is unchanged) but it is the single most consequential thing about living near
	 * one, and it is derived: the same `stellar/activity` bucket the renderers read, which comes from
	 * class AND age, so an old M dwarf correctly stops being described as flaring.
	 */
	activity?: string
): StarClassExplanation | undefined {
	const { letter, band, bare } = parts(classKey);
	// A bare letter with no stated luminosity class means MAIN SEQUENCE (mk-lum 1.1), but only when
	// there IS a letter: an unparseable key must be declined rather than defaulted, or `star/unknown`
	// comes back confidently described as a yellow dwarf.
	const kind = bare ? KIND_BY_KEY[bare] : letter ? (band ? KIND_BY_BAND[band] : 'Main-sequence dwarf') : undefined;
	if (!kind) return undefined;
	const designation = classKey.replace(/^star\//, '');
	const colour = letter ? COLOUR_BY_LETTER[letter] : undefined;

	// The radius comes from the band the pack states for this key — an ANCHOR, per B57.
	const tpl = starStatTemplate(pack, classKey);
	const radiusBand: [number, number] | undefined = tpl?.radius_solar;
	const radiusSolar = radiusBand ? (radiusBand[0] + radiusBand[1]) / 2 : undefined;
	const size = sizeInWords(radiusSolar);

	const flaring = activity === 'flare-star';
	const headline = flaring ? `Flaring ${kind.toLowerCase()}` : kind;
	const clauses = [headline, colour && `${colour} to human eyes`, size].filter(Boolean) as string[];
	return { designation, kind: headline, colour, size, text: `${designation} (${clauses.join(', ')})` };
}

// A FAMOUS STAR PER DESIGNATION, so a reader has something to hang the label on — owner, 2026-08-15:
// "re-include the star examples - eg The Sun and other well known stars along the type as examples.
// just a famous few."
//
// PRESENTATION DATA, and the one thing here that genuinely CANNOT be computed: a star's fame is a
// fact about people, not about physics. Deliberately SPARSE — an exemplar nobody recognises is worse
// than none, so bands with no household name (K supergiants, O giants) simply have none rather than
// being filled in for symmetry. Each is accurate to the band it sits against.
const EXEMPLAR: Record<string, string> = {
	'star/G': 'the Sun',
	'star/A': 'Sirius A',
	'star/B': 'Regulus',
	'star/K': 'Alpha Centauri B',
	'star/M': 'Proxima Centauri',
	'star/F': 'Procyon A',
	'star/O': 'Zeta Ophiuchi',
	'star/M-I': 'Betelgeuse',
	'star/B-I': 'Rigel',
	'star/A-I': 'Deneb',
	'star/F-I': 'Polaris',
	'star/O-I': 'Alnitak',
	'star/K-III': 'Arcturus',
	'star/G-III': 'Capella',
	'star/M-III': 'Mira',
	'star/WD': 'Sirius B',
	'star/NS': 'the Crab Pulsar',
	'star/magnetar': 'SGR 1806-20',
	'star/BH': 'Cygnus X-1',
	'star/L': 'Luhman 16'
};

/** A famous star of this designation, where one is genuinely famous. */
export function exemplarFor(classKey: string): string | undefined {
	return EXEMPLAR[classKey];
}

// THE MK LUMINOSITY CLASS, as a reader sees it in the dropdown. A bare letter band IS main sequence
// (mk-lum 1.1), so it shows `V` rather than nothing — owner, 2026-08-15: the list "needs to have the
// I V II Ia luminosity after to inform the user what type is which".
export function luminosityClassOfKey(classKey: string): string | undefined {
	const { letter, band, bare } = parts(classKey);
	if (bare) return undefined; // WD / NS / BH / brown dwarfs have no luminosity class
	if (!letter) return undefined;
	return band ?? 'V';
}

/**
 * A dropdown label: designation, luminosity class, and what it means in plain words.
 *
 *   `G V — Main-sequence dwarf (yellow)`
 *   `K III — Giant star (orange)`
 *   `M I — Luminous supergiant (red)`
 *   `WD — White dwarf`
 *
 * Built from the same explanation the line beneath the picker shows, so the two cannot disagree.
 */
export function pickerLabel(pack: RulePack | any, classKey: string): string | undefined {
	const ex = explainStarClass(pack, classKey);
	if (!ex) return undefined;
	const lum = luminosityClassOfKey(classKey);
	const letter = parts(classKey).letter;
	const head = letter ? `${letter}${lum ? ' ' + lum : ''}` : ex.designation;
	const eg = exemplarFor(classKey);
	return `${head} — ${ex.kind}${ex.colour ? ` (${ex.colour})` : ''}${eg ? ` · ${eg}` : ''}`;
}

// ---------------------------------------------------------------------------------------------
// THE SUBCLASS — the "2" of G2V, derived from temperature rather than authored.
//
// Each letter spans a temperature range and the subclass runs 0 (hot end) to 9 (cool end), so this
// is one interpolation, not a table. Measured against published types: the Sun comes out G2.6
// against G2, Rigel B8.1 against B8, Betelgeuse M0.7 against M1, Proxima M4.6 against M5.5 and Vega
// A1.4 against A0 — within about a subclass and a half, which is the bar for "reasonably realistic".
//
// AND IT IS DERIVED ONLY FOR THE MAIN SEQUENCE, WHICH IS THE HONEST LIMIT. The relation between
// temperature and subclass depends on the LUMINOSITY CLASS — a K1.5 giant is cooler than a K1.5
// dwarf — so applying the main-sequence ladder to a giant is wrong by a lot: Arcturus (K1.5III)
// derives as K5.5, four subclasses out. That is DATA-R10 again, the letter alone determining less
// than it appears to. A giant therefore gets its letter and luminosity class with NO subclass, which
// is both honest and how people actually speak of them ("a K giant").
const MAIN_SEQUENCE_TEMP_BAND: Record<string, [number, number]> = {
	O: [30000, 50000], B: [10000, 30000], A: [7500, 10000],
	F: [6000, 7500], G: [5200, 6000], K: [3700, 5200], M: [2400, 3700]
};

/** The subclass 0..9 for a MAIN-SEQUENCE star, or undefined where the ladder does not apply. */
export function spectralSubclass(letter: string, tempK: number, band?: string): number | undefined {
	if (band && band !== 'V') return undefined; // giants and supergiants: see above
	const range = MAIN_SEQUENCE_TEMP_BAND[letter];
	if (!range || !(tempK > 0)) return undefined;
	const [lo, hi] = range;
	const sub = (9 * (hi - tempK)) / (hi - lo);
	return Math.max(0, Math.min(9, Math.round(sub * 10) / 10));
}

/**
 * The full MK designation for a star's measured state: `G2V`, `K III`, `M1 Ia`-ish.
 *
 * COMPUTED FROM POSITION, never authored — which is what makes the full designation space affordable
 * at all. There is no 700-cell grid to fill in, because a designation is a place on the HR diagram
 * rather than a row in a table.
 */
export function fullDesignation(letter: string, tempK: number, band?: 'I' | 'III' | 'V'): string {
	const sub = spectralSubclass(letter, tempK, band);
	const subText = sub == null ? '' : String(Math.round(sub));
	return `${letter}${subText}${band ?? ''}`;
}
