// CLASSIFY A STAR AGAINST THE PACK'S OWN BANDS — [[B48]] section 10, and the fix for the hot-end
// failures that made `classifyStar` call Vega a giant and every O and B dwarf a supergiant.
//
// WHY THE OLD APPROACH COULD NOT WORK. `classifyStar` cuts on ABSOLUTE luminosity: logL > 4 means
// supergiant, > 1.5 means giant. Measured against published MK types, that gets five of ten reference
// stars wrong, and always the same way - anything intrinsically bright is called evolved whether or
// not it is. A B0V is genuinely 10^4.5 Lsun; brightness alone cannot tell you it is a dwarf.
//
// AND THE CHEAP FIX DOES NOT WORK EITHER, which was measured before this was written: making the test
// RELATIVE to a main-sequence line needs a ZAMS proxy, and of the two candidates the linear-in-logT
// line breaks Proxima into a false subdwarf while the mass-luminosity relation collapses Rigel and
// Betelgeuse below any threshold that keeps Vega on the main sequence. The failure modes sit at
// opposite ends of the sequence, so no single relative threshold classifies all ten.
//
// WHAT ACTUALLY SEPARATES THEM IS RADIUS AT A GIVEN TEMPERATURE, which is what a luminosity class
// physically IS - a statement about surface gravity. A K dwarf and a K giant share a temperature and
// differ ~40x in radius. So the classifier matches the star's (temperature, radius) against the same
// bands the GENERATOR draws from, which makes classification the exact inverse of generation rather
// than a second independent table with its own thresholds.
import type { RulePack } from '$lib/types';

export interface BandMatch {
	/** The pack key that fits best, e.g. `star/K-III`. */
	key: string;
	/** Its luminosity class: 'I', 'III' or 'V'. Remnants and brown dwarfs report undefined. */
	band?: 'I' | 'III' | 'V';
	/** How far off the band centre it sits, in log units. 0 is dead centre. */
	distance: number;
}

/** Bands that describe a position on the HR diagram. Remnants are identity, not position (PHY-14). */
const NON_POSITIONAL = /^star\/(WD|NS|BH|BH_active|magnetar|default)$/;

function bandOf(key: string): 'I' | 'III' | 'V' | undefined {
	if (/-I$/.test(key)) return 'I';
	if (/-III$/.test(key)) return 'III';
	if (/^star\/[OBAFGKMLTY]$/.test(key)) return 'V'; // a bare letter IS main sequence (mk-lum 1.1)
	return undefined;
}

const mid = (b: number[] | undefined) => (b && b.length === 2 ? (b[0] + b[1]) / 2 : undefined);

/**
 * The band this star best fits, by position on the HR diagram.
 *
 * Distance is measured in LOG space on temperature and radius, because both span orders of magnitude
 * and a linear distance would let the hot end dominate every comparison. Radius is weighted more
 * heavily than temperature: at a given temperature it is the whole of the difference between a dwarf
 * and a supergiant, whereas temperature mostly picks the letter, which is not what this decides.
 */
export function matchStarBand(
	pack: RulePack | any,
	star: { temperatureK?: number; radiusSolar?: number }
): BandMatch | undefined {
	const templates = pack?.statTemplates as Record<string, any> | undefined;
	if (!templates) return undefined;
	const t = star.temperatureK, r = star.radiusSolar;
	if (!(t! > 0) || !(r! > 0)) return undefined;
	const logT = Math.log10(t!), logR = Math.log10(r!);

	let best: BandMatch | undefined;
	for (const key of Object.keys(templates)) {
		if (!key.startsWith('star/') || NON_POSITIONAL.test(key)) continue;
		const tpl = templates[key];
		const bt = mid(tpl?.temp_k), br = mid(tpl?.radius_solar);
		if (!(bt! > 0) || !(br! > 0)) continue;
		const dT = Math.log10(bt!) - logT;
		const dR = Math.log10(br!) - logR;
		// RADIUS DOMINATES, and that is the whole point: it is what a luminosity class measures.
		const distance = Math.sqrt(dT * dT + (dR * dR) * 4);
		if (!best || distance < best.distance) best = { key, band: bandOf(key), distance };
	}
	return best;
}

/**
 * The luminosity class for a star, from its position against the pack's bands.
 *
 * Returns undefined when the pack cannot answer - a remnant, or a star outside every band - rather
 * than guessing. A wrong luminosity class is worse than none: it is the difference between a red
 * dwarf and a red supergiant, which D19 established the hard way.
 */
export function luminosityClassFromPosition(
	pack: RulePack | any,
	star: { temperatureK?: number; radiusSolar?: number }
): 'I' | 'III' | 'V' | undefined {
	return matchStarBand(pack, star)?.band;
}
