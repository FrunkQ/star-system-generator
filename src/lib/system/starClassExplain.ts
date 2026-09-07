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
import { starClassParts, spectralLetterForTempK } from '$lib/physics/starDesignation';
import type { ObservedStarReading } from '$lib/physics/observedStar';
import { starStatTemplate } from '$lib/generation/star';
import { SOLAR_RADIUS_KM, AU_KM } from '$lib/constants';

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
// The key parser lives in `physics/starDesignation` with the derivation that WRITES these keys, so
// the thing that spells a designation and the thing that reads one cannot drift apart.
function parts(key: string): { letter?: string; band?: string; bare?: string } {
	const p = starClassParts(key);
	// A key this module has a KIND for (WD, NS, brown dwarfs) is 'bare' here even when the parser
	// found a letter in it — `star/L` is a brown-dwarf band, not an L-class main-sequence star.
	const name = key.replace(/^star\//, '');
	if (KIND_BY_KEY[name]) return { bare: name };
	return { letter: p.letter, band: p.band };
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
	// A FRACTION, NOT A RECIPROCAL. "3.3 times narrower" is both clumsy and not really English —
	// narrower does not multiply — and the owner said what he wanted instead: "red dwarfs can say
	// they are 0.3 the size of Sol".
	if (r < 0.8) return `about ${Number(r.toPrecision(1))} times the width of the Sun`;
	if (r < 1.25) return 'about the size of the Sun';
	if (r < 25) return `roughly ${Math.round(r)} times wider than the Sun`;
	if (r < 100) return 'tens of times wider than the Sun';
	// ABOVE ABOUT 2,500 SOLAR RADII NOTHING IS A STAR ANY MORE (the largest known is ~2,150), so a
	// figure this big is a supermassive black hole's event horizon and solar radii stop meaning
	// anything to a reader. Give it in AU, where a GM can put it against their own outer system:
	// a 1e10 M-sol horizon is about 390 AU across, ten times Neptune's orbit.
	if (r > 2500) {
		const auAcross = (2 * r * SOLAR_RADIUS_KM) / AU_KM;
		return `a disc about ${Number(auAcross.toPrecision(2)).toLocaleString()} AU across`;
	}
	return 'hundreds of times wider than the Sun';
}

/** What the caller knows about the PARTICULAR star, beyond its class. Both optional: a caller
 *  explaining a CLASS rather than a star (the picker tooltip, the physics page) passes neither. */
export interface StarClassContext {
	/** B116: the parsed catalogue type, so an Am star can be SAID to be one - the notation is information. */
	stellarType?: import('$lib/types').StellarType;
	/**
	 * The star's activity bucket, when it is known. A FLARE STAR is worth saying out loud — owner,
	 * 2026-08-15: "this should also change M-type to Flaring M-Type". It is not a different CLASS
	 * (the designation is unchanged) but it is the single most consequential thing about living near
	 * one, and it is derived: the same `stellar/activity` bucket the renderers read, which comes from
	 * class AND age, so an old M dwarf correctly stops being described as flaring.
	 */
	activity?: string;
	/**
	 * THIS STAR'S OWN RADIUS, in solar radii, when the caller has a body rather than a class (A88).
	 * Preferred over the band whenever it is a real measurement; zero and undefined both fall back,
	 * because neither is one.
	 */
	radiusSolar?: number;
}

/**
 * Explain a star designation in plain English.
 *
 * THE SIZE CLAUSE PREFERS THE STAR'S OWN RADIUS AND FALLS BACK TO THE PACK'S BAND (A88).
 * B57 built it from the band deliberately — a band is an anchor the pack already states, so the
 * sentence cannot drift and retuning a band updates every explanation for free — and that
 * reasoning still holds for a CLASS, which is what the picker tooltip and the physics page are
 * explaining. It does not hold for a BODY, whose radius we have already measured; and for a
 * REMNANT it never held, because a black hole's radius IS its mass and no band can stand in for
 * it. The owner found that out loud: a 195 AU event horizon described as "a ball about 300 km
 * across", because the band is the stellar-mass one.
 *
 * Returns undefined only for a key with no letter AND no known kind — an unknown designation is
 * better left unexplained than guessed at.
 */
export function explainStarClass(
	pack: RulePack | any,
	classKey: string,
	ctx: StarClassContext = {}
): StarClassExplanation | undefined {
	const { activity, radiusSolar: measuredRadius } = ctx;
	const { letter, band, bare } = parts(classKey);
	// A bare letter with no stated luminosity class means MAIN SEQUENCE (mk-lum 1.1), but only when
	// there IS a letter: an unparseable key must be declined rather than defaulted, or `star/unknown`
	// comes back confidently described as a yellow dwarf.
	const kind = bare ? KIND_BY_KEY[bare] : letter ? (band ? KIND_BY_BAND[band] : 'Main-sequence dwarf') : undefined;
	if (!kind) return undefined;
	const designation = classKey.replace(/^star\//, '');
	const colour = letter ? COLOUR_BY_LETTER[letter] : undefined;

	// THIS STAR'S OWN RADIUS FIRST; the pack's band only when there is no star to measure. A zero
	// or absent figure is not a measurement, so it falls back rather than printing nonsense.
	const tpl = starStatTemplate(pack, classKey);
	const radiusBand: [number, number] | undefined = tpl?.radius_solar;
	const bandRadius = radiusBand ? (radiusBand[0] + radiusBand[1]) / 2 : undefined;
	const radiusSolar = measuredRadius && measuredRadius > 0 ? measuredRadius : bandRadius;
	const size = sizeInWords(radiusSolar);

	const flaring = activity === 'flare-star';
	const headline = flaring ? `Flaring ${kind.toLowerCase()}` : kind;
	// B116: an Am star is a real thing and the catalogue told us - say so, with the two readings.
	const st = ctx.stellarType;
	const am = st?.peculiarity?.includes('m')
		? `a metallic-line Am star${st.kLineType && st.metallicType ? ` - calcium K line ${st.kLineType}, metallic lines ${st.metallicType}${st.hydrogenType ? `, hydrogen ${st.hydrogenType}` : ', temperature between the two'}` : ''}`
		: undefined;
	const clauses = [headline, colour && `${colour} to human eyes`, size, am].filter(Boolean) as string[];
	return { designation, kind: headline, colour, size, text: `${designation} (${clauses.join(', ')})` };
}

// ── THE OBSERVED DESIGNATION (G54 phase 3) ───────────────────────────────────────────────────────
//
// BESIDE THE INTRINSIC ONE, IN THIS FILE, AND FOR THE REASON THE HEADER ALREADY GIVES: this is the
// ONE designation builder, so the editor tooltip and the physics page cannot describe the same star
// differently. A second builder for "what it looks like from here" would be exactly that fault with
// a new excuse.
//
// THE CORRECTION IS THE WHOLE POINT, AND IT IS WHY THE DESIGNATION DOES NOT MOVE.
// Grey attenuation - a Dyson swarm, a shell, a ring - cuts FLUX at every wavelength equally. It does
// not touch the colour and it does not touch the absorption lines, so a spectrometer pointed at a
// heavily swarmed G2V star still reads G2V and always will. Dust does redden, and there photometry
// alone genuinely can mis-type the star - but its lines are untouched too. So:
//
//     THE SPECTRUM IS NEVER OVERWRITTEN. The lines are the tell and they never lie.
//
// What changes is what the OTHER two measurements say, and the three disagreeing is the drama. A
// crew that notices a G-type spectrum attached to a star four magnitudes too faint, pouring out far
// infrared, has FOUND something. A crew told "it is an M star" has merely been told a fact.

// A SPECTRAL LETTER IS READ ALOUD, so the article follows how the LETTER SOUNDS and not what it is:
// "an M star", "an F star", "a G star". Spelling it out beats a vowel test, which gets M and F
// wrong in the one place a reader is guaranteed to notice - a sentence about what a star looks like.
const ARTICLE_AN = new Set(['A', 'E', 'F', 'H', 'I', 'L', 'M', 'N', 'O', 'R', 'S', 'X']);
const articleFor = (letter: string): string => (ARTICLE_AN.has(letter.toUpperCase()) ? 'an' : 'a');

/** One reading, in the words a GM would read out. */
export interface ObservedStarClassExplanation {
	/** The designation, UNCHANGED. Spectroscopy is the measurement that does not move. */
	designation: string;
	/** What the lines say - and that they are untouched, which is the fact doing the work. */
	spectroscopy: string;
	/** What the brightness says, and the colour with it when dust has moved the colour. */
	photometry: string;
	/** What the infrared says, or undefined when there is no excess to report. */
	infrared?: string;
	/** The compact form for a card or a tooltip: `G2V (4.1 mag faint, IR excess)`. */
	text: string;
	/**
	 * WHAT IS DOING IT. Present ONLY when the caller passes it, and the caller passes it only at
	 * disclosure level `open` (design §6: both readings are always computed, only the CAUSE is
	 * redacted). That is what makes "both sides of the story" one object rather than two code paths,
	 * and it is what stops a player surface ever having to re-derive anything.
	 */
	cause?: string;
	/** True when the three measurements do not agree - the condition the anomaly is about. */
	disagrees: boolean;
}

/**
 * The three measurements for a star with something in front of it, or undefined when the
 * designation cannot be explained at all (the same refusal `explainStarClass` makes).
 *
 * `apparentTempK` is what PHOTOMETRY ALONE would assign - `physics/observedStar.apparentColourTempK`
 * - and it is handed in rather than derived here so this file keeps no spectral machinery of its
 * own. For a grey occluder it equals the star's real temperature exactly, which is the correction
 * above expressed as an input: pass it and the sentence about colour writes itself correctly.
 */
export function explainObservedStarClass(
	pack: RulePack | any,
	classKey: string,
	reading: ObservedStarReading,
	opts: { activity?: string; apparentTempK?: number; cause?: string } = {}
): ObservedStarClassExplanation | undefined {
	// A88 changed the third argument to a context object; the observed builder passes the activity
	// through and has no measured radius of its own to add (its caller has the class, not the body).
	const intrinsic = explainStarClass(pack, classKey, { activity: opts.activity });
	if (!intrinsic) return undefined;
	const { designation } = intrinsic;

	const mag = reading.magnitudeDrop;
	const faint = Number.isFinite(mag) && mag >= 0.1;
	const gone = !Number.isFinite(mag) || reading.transmission <= 0;
	const excess = reading.irExcessFrac > 0;

	// SPECTROSCOPY. The one that does not move, and the sentence says WHY rather than just asserting
	// it - a reader who understands why grey attenuation leaves the lines alone has learnt the piece
	// of astronomy this feature exists to teach.
	const spectroscopy = gone
		? `No spectrum: nothing of ${designation} reaches the visible sky from here.`
		: `${designation} — ${intrinsic.kind.toLowerCase()}. The absorption lines are untouched, `
			+ 'and they are the measurement that never lies.';

	// PHOTOMETRY. Brightness always; colour only when something actually moved it.
	const apparentLetter = opts.apparentTempK && reading.reddened
		? spectralLetterForTempK(opts.apparentTempK, pack)
		: undefined;
	const photometry = gone
		? 'Absent from the visible sky altogether.'
		: `${mag.toFixed(1)} magnitudes too faint for a ${designation} at this distance`
			+ (reading.reddened
				? `, and reddened with it${apparentLetter ? ` — colour alone would call it ${articleFor(apparentLetter)} ${apparentLetter} star` : ''}.`
				: ', with no change of colour at all — which is the tell for something that blocks light evenly.');

	// INFRARED. Absent rather than "none", because a star with no excess has nothing to report and a
	// row saying so is noise on every ordinary star.
	const infrared = excess
		? `${(reading.irExcessFrac * 100).toFixed(0)}% of the star's output arriving as far infrared`
			+ (reading.reradiatedTempK > 0
				? `, at about ${Math.round(reading.reradiatedTempK)} K peaking near `
					+ `${Math.round(reading.reradiatedPeakNm).toLocaleString()} nm`
				: '')
			+ `. No ${designation} produces that.`
		: undefined;

	// THE COMPACT FORM, and it keeps the designation FIRST because the designation is still true.
	const notes: string[] = [];
	if (gone) notes.push('not visible');
	else if (faint) notes.push(`${mag.toFixed(1)} mag faint`);
	if (reading.reddened) notes.push('reddened');
	if (excess) notes.push('IR excess');
	const text = notes.length ? `${designation} (${notes.join(', ')})` : designation;

	return {
		designation, spectroscopy, photometry, infrared, text,
		cause: opts.cause,
		disagrees: faint || gone || excess || reading.reddened
	};
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

// (THE SUBCLASS AND `fullDesignation` LIVED HERE and now live in `physics/starDesignation`, with the
//  ladder replaced by anchors held in the pack. The interpolation here divided each letter's
//  temperature band into ten equal steps, which the real sequence is not: it put the Sun at G2.6 —
//  so the wizard displayed the Sun as G3V — Vega at A1.4 against A0, and Proxima at M4.6 against
//  M5.5. The anchored version gets ten of twelve published designations exactly. The REFUSAL for
//  giants and supergiants moved with it unchanged, because it was right: the ladder is
//  main-sequence, and Arcturus derives four subclasses out on it. Re-exported here so the two
//  callers that already read this module keep one import.)
export { spectralSubclass, fullDesignation } from '$lib/physics/starDesignation';
