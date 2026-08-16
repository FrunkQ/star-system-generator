// IONISING OUTPUT — the OTHER half of what a star radiates, and the half that hurts.
//
// Owner, 2026-08-15: *"stars flare with little brightness change and a LOT of ionising radiation.
// Generally they move together but not always surely?"* Exactly so, and the real relation says both
// halves of that sentence at once:
//
//     L_X = L_bol x (L_X / L_bol)
//
// The FIRST factor is why they move together: a bigger, hotter star has more of everything. The
// SECOND is why they come apart, because it is set by the magnetic dynamo rather than by size or
// heat, and it spans FOUR DECADES.
//
// THE NUMBERS ARE OBSERVED, NOT CHOSEN.
//   * The quiet Sun sits at L_X/L_bol of roughly 1e-7 (about 1e20 W of corona against 3.8e26 W).
//   * Active stars SATURATE at about 1e-3, and that ceiling is a real, well-measured law: past a
//     certain rotation rate the dynamo stops responding and X-ray output stops climbing. It is not a
//     tuning knob, and nothing should be allowed above it by accident.
//   * Between those, output tracks the dynamo — which is what `flareActivity` already models from
//     class and age, so this reads that rather than inventing a second activity model.
//
// A solar flare is the sentence's other half made concrete: bolometric output moves by ~0.01% while
// X-ray output moves by two to three orders of magnitude. Same star, same radius, same temperature.
import type { CelestialBody } from '$lib/types';

/** L_X/L_bol for a star with no dynamo worth speaking of. The quiet Sun is about here. */
export const IONISING_FRACTION_QUIET = 1e-7;

/**
 * The SATURATION CEILING, and the reason this is a law rather than a preference: past a certain
 * rotation rate a stellar dynamo stops responding and X-ray output stops climbing. Observed across
 * young clusters and rapid rotators at L_X/L_bol ~ 1e-3.
 */
export const IONISING_FRACTION_SATURATED = 1e-3;

/**
 * The ionising fraction for a given dynamo strength, log-interpolated between quiet and saturated.
 *
 * LOG, because the range spans four decades — a linear walk would sit at the ceiling for almost the
 * whole slider and make every star with any activity at all look saturated. Same reasoning as B56's
 * band draws.
 */
export function ionisingFraction(activity: number | undefined): number {
	const a = Math.max(0, Math.min(1, activity ?? 0));
	const lo = Math.log10(IONISING_FRACTION_QUIET);
	const hi = Math.log10(IONISING_FRACTION_SATURATED);
	return Math.pow(10, lo + (hi - lo) * a);
}

/** The inverse: what dynamo strength does this fraction imply? Used when a GM sets L_X directly. */
export function activityForFraction(fraction: number): number {
	if (!(fraction > 0)) return 0;
	const lo = Math.log10(IONISING_FRACTION_QUIET);
	const hi = Math.log10(IONISING_FRACTION_SATURATED);
	return Math.max(0, Math.min(1, (Math.log10(fraction) - lo) / (hi - lo)));
}

/**
 * Ionising output in SOLAR UNITS — i.e. multiples of what the quiet Sun emits in X-ray/EUV, which is
 * the frame a GM can actually reason in ("forty times the Sun's" rather than "1e22 watts").
 *
 * This is the quantity that MOVES WITH luminosity when locked: raise the star's size or heat and it
 * rises proportionally, because the fraction is unchanged.
 */
export function ionisingOutputSolar(luminositySolar: number, activity: number | undefined): number {
	return (luminositySolar * ionisingFraction(activity)) / IONISING_FRACTION_QUIET;
}

/**
 * The two bands the editor draws on the ionising slider, in the same solar units.
 *
 * TYPICAL is what this star's own derived activity gives, spread a little either side — where an
 * undisturbed star of this class and age actually sits. FLARING is the same star driven to the
 * saturation ceiling: what it would emit as a flare star. Showing BOTH is what turns the control
 * from a number into a relationship a GM can see (owner: "guide the user to the relationship and
 * allow deliberate variance").
 *
 * A star with no dynamo — a remnant, or anything the model gives no activity — has no meaningful
 * flaring band, and gets undefined rather than an invented one.
 */
export function ionisingBands(
	luminositySolar: number,
	derivedActivity: number | undefined
): { typical: [number, number]; flaring: [number, number] } | undefined {
	if (!(luminositySolar > 0)) return undefined;
	const a = derivedActivity ?? 0;
	if (a <= 0) return undefined;
	const at = (x: number) => ionisingOutputSolar(luminositySolar, x);
	// Typical: this star's own activity, give or take — real stars of one class and age vary.
	const typical: [number, number] = [at(Math.max(0, a - 0.12)), at(Math.min(1, a + 0.12))];
	// Flaring: from "clearly active" up to the saturation ceiling.
	const flaring: [number, number] = [at(Math.max(a, 0.55)), at(1)];
	return { typical, flaring };
}

/** The star's ionising output, from its own luminosity and activity. */
export function bodyIonisingOutputSolar(body: CelestialBody): number | undefined {
	const lum = body.radiationOutput;
	if (!(lum! > 0)) return undefined;
	return ionisingOutputSolar(lum!, (body as any).flareActivity);
}

/**
 * The spread a GENERATED star carries, in activity units. Owner, 2026-08-15: *"random generation
 * should also encompass the range in rough relation to reality."*
 *
 * The scatter is real — stars of one class and age vary by roughly half a decade in L_X/L_bol,
 * because rotation at birth varies and the dynamo follows rotation — so a model with NO spread is the
 * unphysical one. Half a decade over the four this axis spans is about 0.12.
 */
export const ACTIVITY_SCATTER_SPREAD = 0.12;

/**
 * Turn a 0..1 seeded roll into that offset. Stored on the body at GENERATION and read back by the
 * processor, rather than re-derived in the processor for everything.
 *
 * WHY STORED, WHICH LOOKS LIKE IT BREAKS THE DERIVE-EVERYTHING RULE AND DOES NOT: the scatter is an
 * INPUT, not a derivation — it is this star's individual draw, the equivalent of its birth rotation,
 * and there is nothing to compute it from. Deriving it in the processor instead applied it to every
 * star in existence, including hand-authored ones and the Sol calibration anchor: measured, it moved
 * the Sun's activity to EXACTLY ZERO (a 0.12 spread clamps a 0.052 base to zero for 28% of rolls, and
 * no star has no corona) and shifted every planet's particle dose in the baseline fixture.
 */
export function activityScatterFromRoll(roll: number, spread = ACTIVITY_SCATTER_SPREAD): number {
	return (roll * 2 - 1) * spread;
}

/**
 * Apply a stored scatter to a derived activity. Floored just above zero rather than AT it: the
 * quietest real star still has a corona, and an exact zero is a degenerate value that reads as "no
 * dynamo" rather than "a very quiet one".
 */
export function applyActivityScatter(base: number, scatter: number | undefined): number {
	if (!scatter) return base;
	return Math.max(0.005, Math.min(1, base + scatter));
}
