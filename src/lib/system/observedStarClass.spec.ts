// THE OBSERVED DESIGNATION (G54 phase 3) — the three-way disagreement, in the words a GM reads out.
//
// The assertion this file exists for, and it is the design's owner-corrected §2: THE DESIGNATION
// DOES NOT MOVE. Grey attenuation cuts flux at every wavelength equally, so it touches neither the
// colour nor the absorption lines, and a heavily swarmed G2V star still reads G2V. What moves is
// what the OTHER two measurements say, and the three disagreeing is the whole feature.
//
// The absolute anchor here is `apparentColourTempK`: for a grey occluder it comes back EXACTLY the
// star's own temperature, because a flat factor cancels out of a colour ratio. That is the
// correction made falsifiable rather than merely asserted — and it is a number, not a comparison
// between two things computed the same way.
import { describe, it, expect } from 'vitest';
import { explainObservedStarClass, explainStarClass } from './starClassExplain';
import {
	apparentColourTempK, composeLineOfSight, greyTransmission, dustTransmission,
	observedStarReading, occluderEffect
} from '$lib/physics/observedStar';
import { spectralLetterForTempK } from '$lib/physics/starDesignation';
import { SOLAR_LUMINOSITY_W, SOLAR_TEFF_K } from '$lib/physics/luminosity';

// The real pack's anchors would drag a fixture in; these are the shape the pack states, with the
// published main-sequence temperatures, which is all either function reads.
const pack = {
	stellarClassification: {
		subclass_anchors: {
			O: { 5: 42000, 9: 33000 },
			B: { 0: 30000, 5: 15200, 9: 10500 },
			A: { 0: 9790, 5: 8180, 9: 7300 },
			F: { 0: 7300, 5: 6650, 9: 6050 },
			G: { 0: 5940, 2: 5790, 5: 5560, 9: 5310 },
			K: { 0: 5150, 5: 4410, 9: 3900 },
			M: { 0: 3850, 5: 3060, 9: 2400 }
		}
	},
	statTemplates: { 'star/G': { radius_solar: [0.9, 1.1], temp_k: [5300, 6000] } }
} as never;

const grey = (f: number) => composeLineOfSight([{ sourceId: 'g', sourceName: 'Swarm', transmission: greyTransmission(f) }]);
const dust = (tau: number) => composeLineOfSight([{ sourceId: 'd', sourceName: 'Dust', transmission: dustTransmission(tau) }]);

describe('what photometry alone would call the star', () => {
	it('returns the star EXACTLY, at any swarm depth — a flat factor cancels out of a colour ratio', () => {
		// ABSOLUTE, and it is the §2 correction as a number rather than a claim: 0.01 of the light or
		// 0.99 of it, the colour a photometer measures is the same colour.
		for (const f of [0.01, 0.3, 0.7, 0.95]) {
			expect(apparentColourTempK(SOLAR_TEFF_K, grey(f))).toBeCloseTo(SOLAR_TEFF_K, 1);
		}
	});

	it('returns the star exactly for a cool one and a hot one alike', () => {
		expect(apparentColourTempK(3200, grey(0.5))).toBeCloseTo(3200, 1);
		expect(apparentColourTempK(20000, grey(0.5))).toBeCloseTo(20000, 0);
	});

	it('comes back COOLER behind dust, and further with every optical depth', () => {
		let last = SOLAR_TEFF_K + 1;
		for (const tau of [0.5, 1, 2, 4]) {
			const t = apparentColourTempK(SOLAR_TEFF_K, dust(tau));
			expect(t).toBeLessThan(last);
			last = t;
		}
	});

	it('turns a G star into something a photometer would call K or M', () => {
		// THE OWNER'S ORIGINAL STORY, WHICH IS EXACTLY RIGHT FOR DUST. The Sun is G; behind four
		// optical depths of dust its colour reads as a cooler letter, and only a spectrum tells you.
		expect(spectralLetterForTempK(SOLAR_TEFF_K, pack)).toBe('G');
		const behindDust = spectralLetterForTempK(apparentColourTempK(SOLAR_TEFF_K, dust(4)), pack);
		expect(['K', 'M']).toContain(behindDust);
	});

	it('says nothing when nothing is in the way, rather than searching for an answer', () => {
		expect(apparentColourTempK(SOLAR_TEFF_K, composeLineOfSight([]))).toBe(SOLAR_TEFF_K);
		expect(apparentColourTempK(0, dust(1))).toBe(0);
	});

	it('takes the nearest letter rather than none for a temperature off the end of the table', () => {
		expect(spectralLetterForTempK(90000, pack)).toBe('O');
		expect(spectralLetterForTempK(900, pack)).toBe('M');
		expect(spectralLetterForTempK(5778, undefined)).toBeUndefined();
	});
});

describe('the observed designation, beside the intrinsic one', () => {
	const swarmed = observedStarReading(
		SOLAR_TEFF_K,
		composeLineOfSight([occluderEffect({ id: 's', name: 'Dyson swarm', fraction: 0.4, radiusAu: 1 }, SOLAR_LUMINOSITY_W)]),
		SOLAR_LUMINOSITY_W
	);

	it('DOES NOT CHANGE THE DESIGNATION — the lines are the tell', () => {
		// TESTED WITH AN APPARENT TEMPERATURE IN HAND AND DUST ACTUALLY REDDENING THE STAR, because
		// that is the only case a naive implementation would relabel — and it is exactly the case
		// the design corrects. An earlier version of this assertion passed a swarm with no apparent
		// temperature at all, and a deliberately relabelling implementation walked straight through it.
		const los = dust(4);
		const reddened = observedStarReading(SOLAR_TEFF_K, los, SOLAR_LUMINOSITY_W);
		const apparentTempK = apparentColourTempK(SOLAR_TEFF_K, los);
		expect(spectralLetterForTempK(apparentTempK, pack)).not.toBe('G');   // the temptation is real
		for (const o of [
			explainObservedStarClass(pack, 'star/G2V', swarmed),
			explainObservedStarClass(pack, 'star/G2V', swarmed, { apparentTempK: SOLAR_TEFF_K }),
			explainObservedStarClass(pack, 'star/G2V', reddened, { apparentTempK })
		]) {
			expect(o?.designation).toBe('G2V');
			expect(o?.designation).toBe(explainStarClass(pack, 'star/G2V')?.designation);
			expect(o?.text.startsWith('G2V')).toBe(true);
		}
	});

	it('gives the three measurements, and they disagree', () => {
		const o = explainObservedStarClass(pack, 'star/G2V', swarmed)!;
		expect(o.disagrees).toBe(true);
		expect(o.spectroscopy).toContain('G2V');
		expect(o.spectroscopy.toLowerCase()).toContain('untouched');
		expect(o.photometry).toContain('0.6 magnitudes too faint');
		// The §2 correction, in the reader-facing sentence: dimmer, NOT redder.
		expect(o.photometry).toContain('no change of colour');
		expect(o.infrared).toContain('40%');
		expect(o.infrared).toContain('394 K');
		expect(o.infrared).toContain('7,351 nm');
	});

	it('reads as the design writes it in the compact form', () => {
		expect(explainObservedStarClass(pack, 'star/G2V', swarmed)!.text).toBe('G2V (0.6 mag faint, IR excess)');
	});

	it('names the colder letter for dust, and only for dust', () => {
		const los = dust(4);
		const r = observedStarReading(SOLAR_TEFF_K, los, SOLAR_LUMINOSITY_W);
		const o = explainObservedStarClass(pack, 'star/G2V', r, { apparentTempK: apparentColourTempK(SOLAR_TEFF_K, los) })!;
		expect(o.designation).toBe('G2V');            // still. always.
		expect(o.photometry).toContain('reddened');
		// "an M star", not "a M star" - a spectral letter is read aloud, and this sentence is the one
		// place a reader is guaranteed to notice. Found in the browser, on the real Sun, behind dust.
		expect(o.photometry).toMatch(/colour alone would call it (an [AFHILMNORSX]|a [BCDGJKPQTUVWYZ]) star/);
		expect(o.photometry).not.toMatch(/ a [AFHILMNORSX] star/);
		expect(o.text).toContain('reddened');
		// And the swarm case must NOT claim a colour it did not change.
		expect(explainObservedStarClass(pack, 'star/G2V', swarmed)!.photometry).not.toContain('reddened');
	});

	it('says a completely enclosed star is absent rather than printing Infinity', () => {
		const shell = composeLineOfSight([occluderEffect({ id: 's', name: 'Shell', fraction: 1, radiusAu: 1 }, SOLAR_LUMINOSITY_W)]);
		const o = explainObservedStarClass(pack, 'star/G2V', observedStarReading(SOLAR_TEFF_K, shell, SOLAR_LUMINOSITY_W))!;
		expect(o.text).toBe('G2V (not visible, IR excess)');
		expect(o.photometry).not.toContain('Infinity');
		expect(o.spectroscopy).toContain('No spectrum');
		expect(o.disagrees).toBe(true);
	});

	it('a clear star disagrees with nothing and says nothing extra', () => {
		const clear = observedStarReading(SOLAR_TEFF_K, composeLineOfSight([]), SOLAR_LUMINOSITY_W);
		const o = explainObservedStarClass(pack, 'star/G2V', clear)!;
		expect(o.disagrees).toBe(false);
		expect(o.text).toBe('G2V');
		expect(o.infrared).toBeUndefined();
	});

	it('carries the CAUSE only when the caller gives it — design §6', () => {
		// Both readings are always computed; only the cause is redacted. That is what makes "both
		// sides of the story" one object rather than two code paths.
		expect(explainObservedStarClass(pack, 'star/G2V', swarmed)!.cause).toBeUndefined();
		expect(explainObservedStarClass(pack, 'star/G2V', swarmed, { cause: 'Dyson swarm' })!.cause).toBe('Dyson swarm');
		// And the cause never leaks into the three measurements themselves.
		const withCause = explainObservedStarClass(pack, 'star/G2V', swarmed, { cause: 'Dyson swarm' })!;
		const said = [withCause.spectroscopy, withCause.photometry, withCause.infrared, withCause.text].join(' ');
		expect(said).not.toContain('Dyson');
	});

	it('declines a designation it cannot explain, exactly as the intrinsic builder does', () => {
		expect(explainObservedStarClass(pack, 'star/unknown', swarmed)).toBeUndefined();
		expect(explainStarClass(pack, 'star/unknown')).toBeUndefined();
	});

	it('keeps the flaring note the intrinsic builder adds', () => {
		const o = explainObservedStarClass(pack, 'star/M5V', swarmed, { activity: 'flare-star' })!;
		expect(o.spectroscopy.toLowerCase()).toContain('flaring');
	});
});
