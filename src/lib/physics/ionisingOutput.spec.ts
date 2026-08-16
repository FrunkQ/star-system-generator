// "Generally they move together but not always" — the owner's sentence, asserted as two properties.
import { describe, it, expect } from 'vitest';
import {
	ionisingFraction, activityForFraction, ionisingOutputSolar, ionisingBands,
	activityScatterFromRoll, applyActivityScatter, ACTIVITY_SCATTER_SPREAD,
	ionisingFromField, hasHotCorona, logSurfaceGravity, magneticFluxRelative, saturationFieldGauss,
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

	// THE LIMIT THIS FILE USED TO PIN AS WRONG IS NOW FIXED, and the entry is kept as the record of
	// how it was found. The activity-only model had a quiet red giant out-emitting an active M dwarf,
	// because L_X scaled with L_bol and a giant is enormously bright. Reality has the M dwarf ahead by
	// about thirty. Tying ionising output to MAGNETIC FLUX and applying the coronal dividing line
	// closes it — see the field-driven tests below.
	it('no longer over-estimates a giant, which the luminosity-scaled model did', () => {
		const activeDwarf = ionisingFromField({ fieldGauss: 550, radiusSolar: 0.4, massSolar: 0.27, tempK: 3050, luminositySolar: 0.012 });
		const quietGiant = ionisingFromField({ fieldGauss: 0.5, radiusSolar: 25.4, massSolar: 1.08, tempK: 4286, luminositySolar: 170 });
		expect(activeDwarf).toBeGreaterThan(quietGiant);
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

// FIELD-DRIVEN IONISING OUTPUT, and the fix for the limit the earlier model pinned as wrong.
describe('ionising output follows MAGNETIC FLUX, not brightness', () => {
	const sun = { fieldGauss: 1, radiusSolar: 1, massSolar: 1, tempK: 5772, luminositySolar: 1 };
	const activeMDwarf = { fieldGauss: 550, radiusSolar: 0.4, massSolar: 0.27, tempK: 3050, luminositySolar: 0.012 };
	const arcturus = { fieldGauss: 0.5, radiusSolar: 25.4, massSolar: 1.08, tempK: 4286, luminositySolar: 170 };

	it('anchors the quiet Sun at one', () => {
		expect(ionisingFromField(sun)).toBeCloseTo(1, 2);
	});

	it('rises with FLUX, so a bigger star with the same field emits more', () => {
		expect(magneticFluxRelative(1, 10)).toBe(100);
		expect(ionisingFromField({ ...sun, radiusSolar: 10, massSolar: 10 })).toBeGreaterThan(ionisingFromField(sun));
	});

	// THE FIX. The previous model had a red giant out-emitting an active M dwarf by 40x; reality has
	// the M dwarf ahead by about thirty. That gap was pinned as a known-wrong result, and this closes it.
	it('lets an active M DWARF out-irradiate a red GIANT, as reality does', () => {
		const dwarf = ionisingFromField(activeMDwarf);
		const giant = ionisingFromField(arcturus);
		expect(dwarf).toBeGreaterThan(giant);
		// Real ratio is roughly 30x. Within a factor of a few is the bar here, not decimals.
		expect(dwarf / giant).toBeGreaterThan(5);
		expect(dwarf / giant).toBeLessThan(200);
	});

	it('never exceeds the saturation ceiling, whatever field is authored', () => {
		const absurd = ionisingFromField({ ...sun, fieldGauss: 1e9 });
		const ceiling = (1 * IONISING_FRACTION_SATURATED) / IONISING_FRACTION_QUIET;
		expect(absurd).toBeLessThanOrEqual(ceiling);
	});

	it('says nothing for a star with no field', () => {
		expect(ionisingFromField({ ...sun, fieldGauss: 0 })).toBe(0);
	});
});

describe('the coronal dividing line, as a PROPERTY rather than a list of classes', () => {
	it('is where a star is both COOL and puffed out', () => {
		expect(logSurfaceGravity(1, 1)).toBeCloseTo(4.44, 2);
		// Corona: the Sun, an M dwarf, Vega — and Rigel, which is a supergiant but HOT.
		expect(hasHotCorona(1, 1, 5772)).toBe(true);
		expect(hasHotCorona(0.27, 0.4, 3050)).toBe(true);
		expect(hasHotCorona(2.1, 2.36, 9600)).toBe(true);
		expect(hasHotCorona(21, 78.9, 12100)).toBe(true);
		// Past the line: Arcturus and Betelgeuse. Betelgeuse has no detected X-ray corona at all.
		expect(hasHotCorona(1.08, 25.4, 4286)).toBe(false);
		expect(hasHotCorona(16.5, 764, 3600)).toBe(false);
	});

	it('needs BOTH conditions, because it is cool giants that lose their coronae', () => {
		// Hot and puffed out keeps its emission; cool and compact keeps its dynamo.
		expect(hasHotCorona(20, 80, 20000)).toBe(true);  // hot supergiant
		expect(hasHotCorona(0.3, 0.3, 3200)).toBe(true); // cool dwarf
	});
});

// THE CEILING IS REAL, AND ITS INVISIBILITY WAS THE BUG. Owner, 2026-08-16: "ionising output visually
// caps at 456x Sun - but I have headroom in gauss." The cap was correct; saying nothing about it was
// not. These pin the field at which it bites, so the UI can mark it.
describe('the saturation field — where more gauss stops buying anything', () => {
	const earlyM = { radiusSolar: 0.45, massSolar: 0.35, tempK: 3500, luminositySolar: 0.0456 };

	it('reproduces the reported number exactly', () => {
		// 0.0456 Lsun x (1e-3 / 1e-7) = 456x the quiet Sun's X-ray output. Not a coincidence, and not
		// a bug: a star cannot emit more than about a thousandth of its brightness in X-rays.
		const ceiling = (0.0456 * 1e-3) / 1e-7;
		expect(Math.round(ceiling)).toBe(456);
	});

	it('is the field at which output first reaches the ceiling', () => {
		const b = saturationFieldGauss(earlyM)!;
		expect(b).toBeGreaterThan(0);
		// Just below it, output is under the ceiling; at it, output is the ceiling.
		const ceiling = (earlyM.luminositySolar * 1e-3) / 1e-7;
		expect(ionisingFromField({ ...earlyM, fieldGauss: b * 0.5 })).toBeLessThan(ceiling);
		expect(ionisingFromField({ ...earlyM, fieldGauss: b })).toBeCloseTo(ceiling, 0);
	});

	it('stays flat above it, however much field is authored', () => {
		const b = saturationFieldGauss(earlyM)!;
		const at = ionisingFromField({ ...earlyM, fieldGauss: b });
		expect(ionisingFromField({ ...earlyM, fieldGauss: b * 10 })).toBeCloseTo(at, 6);
		expect(ionisingFromField({ ...earlyM, fieldGauss: b * 1e6 })).toBeCloseTo(at, 6);
	});

	it('sits HIGHER for a brighter star, because the ceiling scales with luminosity', () => {
		const sun = { radiusSolar: 1, massSolar: 1, tempK: 5772, luminositySolar: 1 };
		expect(saturationFieldGauss(sun)!).toBeGreaterThan(saturationFieldGauss(earlyM)!);
	});

	it('declines when there is no ceiling to compute', () => {
		expect(saturationFieldGauss({ radiusSolar: 0, luminositySolar: 1 })).toBeUndefined();
		expect(saturationFieldGauss({ radiusSolar: 1, luminositySolar: 0 })).toBeUndefined();
	});
});
