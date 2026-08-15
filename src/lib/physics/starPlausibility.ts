// WHY THIS STAR IS NOT A VALID STAR — owner, 2026-08-15: *"reclassify live is BEST... if the figures
// [don't] align add tags effectively describing why this star is not a valid star - we keep in line
// with physics AND narrative."*
//
// THE PRODUCT RULE THIS SERVES: REFUSE TO PRODUCE, NEVER REFUSE TO ACCEPT. The engine will not
// GENERATE an impossible star, but a GM may author one and gets it — with a tag saying which law it
// breaks. Owner: *"If they have a 100 year old black hole then fine. Our job is to show the problems
// (in tags) and allow it."*
//
// SO EVERY FINDING NAMES A LAW, NEVER "INVALID". That is the `ageEstimated` pattern, where
// `physicsTrace` says which of three reasons applies rather than staying silent — a GM who is told
// "this is 40x too light to fuse hydrogen" can decide it is a feature; one told "invalid" can only
// guess what to change.
import type { CelestialBody, RulePack } from '$lib/types';
import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '$lib/constants';
import { starStatTemplate } from '$lib/generation/star';
import { SOLAR_TEMPERATURE_K } from './stellar-evolution';

/**
 * ONE namespace, owned by SystemProcessor's stellar pass (TAG-6). The VALUE names the law, so a
 * reader is told which rule is broken rather than that something is.
 */
export const STAR_IMPLAUSIBLE_TAG = 'star/implausible';

/** The physical limits below. Real constants, not tuning knobs — each has a name and a reason. */
export const HYDROGEN_BURNING_LIMIT_SOLAR = 0.08;   // below this, no sustained hydrogen fusion
export const DEUTERIUM_BURNING_LIMIT_SOLAR = 0.013; // below this, not even deuterium: a planemo
export const TOV_LIMIT_SOLAR = 2.5;                 // most a neutron star's degeneracy pressure holds

export interface Implausibility {
	/** Tag value: a short slug naming the law. */
	law: string;
	/** One sentence a GM can act on, naming the law and the size of the discrepancy. */
	detail: string;
}

const solar = (kg: number | undefined) => (kg ?? 0) / SOLAR_MASS_KG;
const ratio = (a: number, b: number) => (a > b ? a / b : b / a);

/**
 * Everything physically wrong with this star, as named laws. Empty when it is a plausible object.
 *
 * PURE, and takes the body rather than the editor's state, so the same answer is available to the
 * processor, the editor and any future classifier. Reads only present state — no clock, no history —
 * so it stays correct when dynamic ageing lands (V4).
 */
export function starImplausibilities(body: CelestialBody, pack?: RulePack): Implausibility[] {
	if (body.roleHint !== 'star') return [];
	const out: Implausibility[] = [];
	const cls = body.classes?.[0] ?? '';
	const mSolar = solar(body.massKg);
	const rSolar = (body.radiusKm ?? 0) / SOLAR_RADIUS_KM;
	const tK = body.temperatureK ?? 0;
	const isRemnant = /star\/(WD|NS|BH|BH_active|magnetar)/.test(cls);
	const isSubstellar = /star\/(L|T|Y)$/.test(cls);

	// (1) IS IT A STAR AT ALL? Fusion limits are the sharpest lines in stellar physics and the ones a
	// mass slider crosses first. Remnants are exempt: a white dwarf is not fusing and never will be.
	if (!isRemnant && mSolar > 0) {
		if (mSolar < DEUTERIUM_BURNING_LIMIT_SOLAR) {
			out.push({
				law: 'no-fusion',
				detail: `At ${mSolar.toFixed(3)} solar masses this is below the deuterium-burning limit of `
					+ `${DEUTERIUM_BURNING_LIMIT_SOLAR}, so it cannot fuse anything at all — it is a planet-mass `
					+ `object, not a star.`
			});
		} else if (mSolar < HYDROGEN_BURNING_LIMIT_SOLAR && !isSubstellar) {
			out.push({
				law: 'brown-dwarf-mass',
				detail: `At ${mSolar.toFixed(3)} solar masses this is below the hydrogen-burning limit of `
					+ `${HYDROGEN_BURNING_LIMIT_SOLAR}, so it cannot sustain hydrogen fusion — it is a brown `
					+ `dwarf rather than a ${cls.replace('star/', '')} star.`
			});
		}
	}

	// (2) DOES IT MATCH THE CLASS IT CLAIMS? The pack's band is the definition of the class, so a body
	// far outside its own band is asserting something its numbers contradict. An order of magnitude is
	// the threshold: bands are typical ranges, not fences, and a GM nudging past the edge is ordinary.
	const band = pack ? starStatTemplate(pack, cls) : undefined;
	if (band?.mass_solar && mSolar > 0) {
		const [lo, hi] = band.mass_solar;
		if (mSolar < lo / 10 || mSolar > hi * 10) {
			out.push({
				law: 'mass-outside-class',
				detail: `A ${cls.replace('star/', '')} runs ${lo}–${hi} solar masses; this is ${mSolar.toFixed(3)}, `
					+ `about ${Math.round(ratio(mSolar, mSolar < lo ? lo : hi))}x outside its own band.`
			});
		}
	}

	// (3) DO ITS OWN NUMBERS AGREE? L = 4(pi)R^2(sigma)T^4 is exact, so a stored luminosity that
	// disagrees with the radius and temperature beside it is not a different opinion, it is an error.
	// This is B57's fault made visible for hand-authored stars, since generation can no longer produce
	// it. Non-thermal emitters are exempt: a black hole's output is its disc, not its surface.
	if (!isRemnant && rSolar > 0 && tK > 0 && (body.radiationOutput ?? 0) > 0) {
		const thermal = Math.pow(rSolar, 2) * Math.pow(tK / SOLAR_TEMPERATURE_K, 4);
		if (ratio(body.radiationOutput!, thermal) > 10) {
			out.push({
				law: 'luminosity-mismatch',
				detail: `Its radius and temperature give ${thermal.toPrecision(3)} solar luminosities, but it is `
					+ `recorded as ${body.radiationOutput!.toPrecision(3)} — about `
					+ `${Math.round(ratio(body.radiationOutput!, thermal))}x apart. Luminosity follows from size `
					+ `and temperature; it is not a free figure.`
			});
		}
	}

	// (4) CAN THE REMNANT HOLD ITSELF UP? Chandrasekhar and Tolman-Oppenheimer-Volkoff are hard
	// physical ceilings — past them, degeneracy pressure loses and the object is the next thing down.
	if (/star\/(NS|magnetar)/.test(cls) && mSolar > TOV_LIMIT_SOLAR) {
		out.push({
			law: 'above-tov',
			detail: `At ${mSolar.toFixed(2)} solar masses this is above the Tolman-Oppenheimer-Volkoff limit of `
				+ `about ${TOV_LIMIT_SOLAR}, so neutron degeneracy pressure cannot hold it up — it would collapse `
				+ `to a black hole.`
		});
	}

	// (5) IS IT BRIGHTER THAN IT CAN HOLD? Above the Eddington limit radiation pressure exceeds
	// gravity and the star blows its own outer layers off, so it cannot sit there in equilibrium.
	if (!isRemnant && mSolar > 0 && (body.radiationOutput ?? 0) > 0) {
		const eddington = 32000 * mSolar;
		if (body.radiationOutput! > eddington * 1.5) {
			out.push({
				law: 'above-eddington',
				detail: `At ${body.radiationOutput!.toPrecision(3)} solar luminosities it is past the Eddington `
					+ `limit for ${mSolar.toFixed(2)} solar masses (about ${eddington.toPrecision(3)}), so radiation `
					+ `pressure would drive its own outer layers away.`
			});
		}
	}

	return out;
}
