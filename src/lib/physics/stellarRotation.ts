// HOW FAST A STAR TURNS — derived where it can be derived, drawn where it genuinely cannot.
//
// Stars had no rotation at all (inbox B9b, B43), which is why they were never drawn oblate: the
// shape code was handed nothing. This supplies the missing input, and the shape follows from
// `rotationalDeform` without further help.
//
// THE SPLIT IS THE KRAFT BREAK, at roughly F5 / 1.3 solar masses, and it is the whole answer.
//
//   BELOW IT — a convective envelope generates a magnetic field, the field couples to the stellar
//   wind, and the wind carries angular momentum away. So these stars SPIN DOWN, predictably, and the
//   period is a DERIVATION from mass and age rather than a draw. Skumanich's P proportional to
//   sqrt(age), with the mass term modern gyrochronology adds (Barnes 2007; Mamajek & Hillenbrand
//   2008): at a fixed age, redder means slower.
//
//   ABOVE IT — a radiative envelope makes no field to couple to the wind, so there is no braking at
//   all and the star keeps roughly its birth rotation for life. THAT is why Vega is fast: not that
//   it is young, but that it never slowed. Birth angular momentum is unobservable after the fact, so
//   here a draw is the honest tool rather than a failure to find a relation.
//
// NO SOLAR BASELINE IS ASSUMED ANYWHERE EXCEPT WHERE IT IS STATED. The gyrochronology relation is
// explicitly anchored on the Sun, because that is the star whose age and period are both known to
// high precision — and it is written as an anchor with its constants named, not hidden in a
// magic number. Everything else comes from the star's own mass and age.
import { SOLAR_MASS_KG } from '$lib/constants';
import { breakupPeriodHours } from './rotation';

/** The Kraft break, in solar masses. Below it a star has a convective envelope and brakes; above it
 *  it does not and never slows. About spectral type F5. */
export const KRAFT_BREAK_MSUN = 1.3;

/** The Sun's rotation period in hours (25.0 days) at its age in Gyr. The gyrochronology anchor —
 *  named rather than buried, because it IS a solar baseline and the rule is to say so. */
export const SUN_PERIOD_HOURS = 25.0 * 24;
export const SUN_AGE_GYR = 4.6;

/** Skumanich's braking exponent: P proportional to age^0.5. Barnes 2007 fits 0.52; 0.5 is the
 *  classical value and the difference is far inside the observed scatter. */
const BRAKING_EXPONENT = 0.5;

/** The mass term, as P proportional to M^-MASS_EXPONENT at fixed age. Fitted to the two anchors B43
 *  supplies plus Proxima, which disagree slightly with each other — as real gyrochronology does, M
 *  dwarfs being its messiest region:
 *    Barnard's Star  0.16 Msun, ~10 Gyr, ~130 d observed -> 115 d here
 *    Proxima Centauri 0.12 Msun, ~4.9 Gyr, ~83 d observed ->  95 d here
 *    the Sun          1.00 Msun,  4.6 Gyr,   25 d observed ->  25 d here (the anchor, exact)
 *  0.62 is the value that brackets the two M dwarfs rather than matching either, which is the
 *  honest fit to two measurements that do not agree. */
const MASS_EXPONENT = 0.62;

/** How fast a hot star is born turning, as a FRACTION OF BREAKUP. A fraction rather than a velocity
 *  in km/s because breakup is sqrt(GM/R) and varies enormously across the mass range — a fixed km/s
 *  means something entirely different for an M dwarf than for a B star — while a fraction is
 *  dimensionless, comparable everywhere, and bounded at 1 by construction.
 *  Vega measures 0.56 of breakup, which sits near the top of this band rather than beyond it. */
export const FAST_ROTATOR_FRACTION_MIN = 0.15;
export const FAST_ROTATOR_FRACTION_MAX = 0.58;

/** Mean density in g/cc from mass and radius — what breakup depends on. */
export function meanDensityGcc(massKg: number, radiusKm: number): number {
	const radiusM = radiusKm * 1000;
	if (!(radiusM > 0) || !(massKg > 0)) return 0;
	return massKg / ((4 / 3) * Math.PI * radiusM ** 3) / 1000;
}

/** A braked star's period, in hours, from its mass and age alone. */
export function gyrochronologyPeriodHours(massMsun: number, ageGyr: number): number {
	const m = Math.max(0.05, massMsun);
	const t = Math.max(0.01, ageGyr);
	return SUN_PERIOD_HOURS * Math.pow(t / SUN_AGE_GYR, BRAKING_EXPONENT) * Math.pow(m, -MASS_EXPONENT);
}

/**
 * The rotation period a star should have, in hours.
 *
 * `roll` is a deterministic 0..1 draw supplied by the caller — the generator's RNG, or the
 * importer's id hash — so the same star is the same everywhere, and so this function stays pure.
 * It is used ONLY above the Kraft break, where the spread is genuinely stochastic; below it the
 * answer is derived and the roll is ignored.
 *
 * Returns undefined when there is nothing to derive from. ABSENCE IS A REAL ANSWER (inbox B39):
 * `spinFraction` reads a missing period as zero spin, so an undeterminable star stays spherical
 * rather than being handed an invented spin.
 */
export function stellarRotationHours(opts: {
	massKg?: number;
	radiusKm?: number;
	ageGyr?: number;
	roll?: number;
	isRemnant?: boolean;
	isEvolved?: boolean;
}): number | undefined {
	const { massKg, radiusKm, ageGyr, roll = 0.5, isRemnant, isEvolved } = opts;
	// A white dwarf, neutron star or black hole is not on this map at all: their spins come from the
	// collapse, not from a main-sequence history, and a millisecond pulsar would break every
	// assumption below. Left absent rather than guessed.
	if (isRemnant) return undefined;
	// GYROCHRONOLOGY IS A MAIN-SEQUENCE RELATION, and a giant is not on the main sequence. When a star
	// swells from one solar radius to twenty-five, its angular momentum is spread over a vastly larger
	// body and it slows enormously — period goes roughly as radius squared. Arcturus turns once in
	// about 500 days, not the 30 the dwarf relation predicts for its mass and age.
	//
	// Left ABSENT rather than modelled: the swelling factor needs the star's main-sequence radius,
	// which is not carried, and inventing one to divide by would be worse than saying nothing. Absence
	// reads as no spin, so a giant is drawn round — which is what a real one is.
	if (isEvolved) return undefined;
	if (!(massKg && massKg > 0)) return undefined;
	const massMsun = massKg / SOLAR_MASS_KG;

	if (massMsun < KRAFT_BREAK_MSUN) {
		// Derived. Age is the one input that may genuinely be unknown; without it there is no
		// gyrochronology to do, so say nothing rather than assume a solar age.
		if (!(ageGyr && ageGyr > 0)) return undefined;
		return gyrochronologyPeriodHours(massMsun, ageGyr);
	}

	// Above the break: a draw, as a fraction of this star's OWN breakup spin.
	const density = meanDensityGcc(massKg, radiusKm ?? 0);
	if (!(density > 0)) return undefined;
	const fraction = FAST_ROTATOR_FRACTION_MIN
		+ Math.max(0, Math.min(1, roll)) * (FAST_ROTATOR_FRACTION_MAX - FAST_ROTATOR_FRACTION_MIN);
	// fraction = P_breakup / P, so P = P_breakup / fraction.
	return breakupPeriodHours(density) / fraction;
}
