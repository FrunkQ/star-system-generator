// "Generally they move together but not always" — the owner's sentence, asserted as two properties.
import { describe, it, expect } from 'vitest';
import {
	ionisingFraction, activityForFraction, ionisingOutputSolar, ionisingBands,
	activityScatterFromRoll, applyActivityScatter, ACTIVITY_SCATTER_SPREAD,
	IONISING_FRACTION_QUIET, IONISING_FRACTION_SATURATED
} from './ionisingOutput';

describe('the observed numbers, so nobody has to rediscover them', () => {
	it('anchors the quiet Sun and the saturation ceiling', () => {
		expect(IONISING_FRACTION_QUIET).toBe(1e-7);
		expect(IONISING_FRACTION_SATURATED).toBe(1e-3);
		// The Sun, by definition of the unit, emits 1 solar ionising output when quiet.
		expect(ionisingOutputSolar(1, 0)).toBeCloseTo(1, 6);
	});

	it('never exceeds saturation, because that ceiling is a law and not a preference', () => {
		// Past a certain rotation rate the dynamo stops responding. Nothing may sit above it.
		expect(ionisingFraction(1)).toBeCloseTo(IONISING_FRACTION_SATURATED, 12);
		expect(ionisingFraction(5)).toBeCloseTo(IONISING_FRACTION_SATURATED, 12); // clamped
		expect(ionisingFraction(-3)).toBeCloseTo(IONISING_FRACTION_QUIET, 12);
	});

	it('walks the four decades in LOG, not linearly', () => {
		// Linear would sit at the ceiling for most of the slider and make every active star look
		// saturated — the same fault B56 found in the pack's band draws.
		expect(ionisingFraction(0.5)).toBeCloseTo(1e-5, 10);
		expect(Math.log10(ionisingFraction(0.25))).toBeCloseTo(-6, 6);
	});

	it('inverts, so a GM setting the output implies an activity', () => {
		for (const a of [0, 0.2, 0.5, 0.85, 1]) {
			expect(activityForFraction(ionisingFraction(a))).toBeCloseTo(a, 6);
		}
	});
});

describe('GENERALLY THEY MOVE TOGETHER', () => {
	it('scales with luminosity at fixed activity — bigger and hotter means more of everything', () => {
		const quietSun = ionisingOutputSolar(1, 0.05);
		const quietGiant = ionisingOutputSolar(100, 0.05);
		expect(quietGiant / quietSun).toBeCloseTo(100, 6);
	});
});

describe('BUT NOT ALWAYS', () => {
	it('moves four decades on activity alone, with luminosity untouched', () => {
		// This is the flare case: same star, same radius, same temperature, vastly more ionising
		// output. It is the whole reason the two controls are separate.
		const quiet = ionisingOutputSolar(1, 0);
		const saturated = ionisingOutputSolar(1, 1);
		expect(saturated / quiet).toBeCloseTo(1e4, 0);
	});

	it('lets a DIM star out-irradiate a BRIGHT one of the same kind', () => {
		// An active young M dwarf against an old quiet one: the two are comparably feeble in
		// brightness, and the active one emits four decades more ionising radiation. A single
		// "radiation" figure could never express this, which is why there are two controls.
		const young = ionisingOutputSolar(0.012, 0.85);
		const old = ionisingOutputSolar(0.012, 0.05);
		expect(young / old).toBeGreaterThan(1000);
	});

	// A KNOWN LIMIT OF THE MODEL, PINNED RATHER THAN HIDDEN. In reality an active M dwarf OUT-EMITS a
	// red giant in X-rays despite being ten thousand times dimmer: Arcturus sits near L_X/L_bol 1.5e-9
	// while an active dwarf reaches 1e-3. This model cannot express that, because L_X scales with
	// L_bol and `flareActivity` gives the old Sun 0.052 and a red giant 0.050 — indistinguishable.
	//
	// The floor here is calibrated on the SUN, and a giant's corona is roughly two decades fainter per
	// unit luminosity, so a giant comes out too X-ray bright. Fixing it properly needs the ionising
	// fraction to depend on the KIND of dynamo (surface gravity, convective envelope) rather than on
	// one 0..1 scalar. Recorded as a finding rather than patched with a giant-shaped special case,
	// which would be the anchor rule's forbidden move in a new place.
	it('is known to over-estimate a giant, and this pins the gap until it is fixed', () => {
		const activeDwarf = ionisingOutputSolar(0.012, 0.85);
		const quietGiant = ionisingOutputSolar(800, 0.05);
		expect(quietGiant).toBeGreaterThan(activeDwarf); // WRONG in reality; true of the model today
	});
});

describe('the two bands the slider draws', () => {
	const bands = ionisingBands(1, 0.35)!; // a Sun-like star

	it('gives a typical range around where this star actually sits', () => {
		expect(bands.typical[0]).toBeLessThan(ionisingOutputSolar(1, 0.35));
		expect(bands.typical[1]).toBeGreaterThan(ionisingOutputSolar(1, 0.35));
	});

	it('puts the flaring range ABOVE the typical one, topping out at saturation', () => {
		expect(bands.flaring[0]).toBeGreaterThan(bands.typical[1]);
		expect(bands.flaring[1]).toBeCloseTo(ionisingOutputSolar(1, 1), 6);
	});

	it('offers no flaring band for something with no dynamo', () => {
		// A remnant, or anything the activity model gives nothing. Inventing a range for it would be
		// the "wrong picture is worse than no picture" fault in slider form.
		expect(ionisingBands(1, 0)).toBeUndefined();
		expect(ionisingBands(1, undefined)).toBeUndefined();
		expect(ionisingBands(0, 0.5)).toBeUndefined();
	});
});

// The scatter that lets a generated POPULATION span the range — and the fault that came of putting it
// in the wrong place, pinned so it is not reintroduced.
describe('generated scatter', () => {
	it('spans about half a decade of ionising output, which is the observed spread', () => {
		expect(ACTIVITY_SCATTER_SPREAD).toBe(0.12);
		expect(activityScatterFromRoll(0)).toBeCloseTo(-0.12, 6);
		expect(activityScatterFromRoll(1)).toBeCloseTo(0.12, 6);
		expect(activityScatterFromRoll(0.5)).toBeCloseTo(0, 6);
	});

	it('NEVER produces an inert star, which the first version did', () => {
		// Measured: a +/-0.12 spread clamped a Sun-like base of 0.052 to EXACTLY ZERO for 28% of rolls,
		// and no star has no corona. Floored just above zero instead — "very quiet", not "no dynamo".
		for (let r = 0; r <= 1; r += 0.05) {
			expect(applyActivityScatter(0.052, activityScatterFromRoll(r))).toBeGreaterThan(0);
		}
		expect(applyActivityScatter(0.052, -0.12)).toBeGreaterThan(0);
	});

	it('leaves a star with NO stored scatter completely untouched', () => {
		// The other half of that fault: deriving the scatter in the processor applied it to every star
		// in existence, including hand-authored ones and the Sol calibration anchor, moving every
		// planet's particle dose. A star that was never generated with one must be unaffected.
		expect(applyActivityScatter(0.052, undefined)).toBe(0.052);
		expect(applyActivityScatter(0.85, 0)).toBe(0.85);
	});
});
