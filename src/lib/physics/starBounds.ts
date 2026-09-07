// THE STAR EDITOR'S SLIDER BOUNDS, AS DATA (A83).
//
// Every one of these was a `const massMax = 300` sitting in `BodyStarTab.svelte`'s script block —
// seven pairs of numbers spread over sixty lines of a 1,150-line component, which is the scattered-
// constant fault the standing rules name: a number a human will want to change after using the
// product, kept where nothing can assert what it is and where no two of them can be read side by
// side.
//
// PUTTING THEM ON ONE AXIS IS THE POINT, NOT THE TIDINESS. The pixel-floor extraction is the worked
// example: two floors 170 lines apart turned out to be measured on different axes, and nobody could
// see it until they sat in one table. The same thing happened here the moment these were listed —
// see ROTATION below, whose green band is drawn on a log axis under a LINEAR slider, so the band and
// the thumb disagree about where the same number lives.
//
// EXTRACTION IS A MEASUREMENT, SO IT IS GATED AS ONE. `starBounds.spec.ts` pins every mapping here
// against the old inline arithmetic, verbatim, before anything is allowed to move. Moving a number
// and changing it are two commits, never one.
//
// UNITS ARE THE EDITOR'S OWN, NOT SI, and that is deliberate: these bound the numbers the GM types
// into these particular boxes (solar masses, solar radii, kelvin, solar luminosities, gauss, hours).
// DATA-R20 governs what reaches storage — `massKg`, `radiusKm`, `temperatureK` — and nothing here
// touches that conversion.

/** The quantities the star editor gives a slider. */
export type StarBoundKey = 'mass' | 'radius' | 'temp' | 'radiation' | 'mag' | 'rot';

export interface StarBound {
	key: StarBoundKey;
	/** What the editor's own label calls it — for a test failure that names itself. */
	label: string;
	/** The unit the slider's numbers are in. The editor's unit, not SI. */
	unit: string;
	/**
	 * SLIDER TRAVEL: the range the thumb spans. NOT a wall — a typed figure outside it is kept and
	 * merely pins the thumb to that end (steer, do not stop). Every writer in the component already
	 * behaved that way and the extraction preserves it exactly.
	 */
	soft: readonly [number, number];
	/**
	 * Log-mapped travel. ALL of them are, and rotation only became so when this table was written:
	 * see its note. The band drawn behind a slider reads THIS FIELD, so the two cannot part again.
	 */
	log: boolean;
	/** Why this bound is where it is. Prose, so retuning one is an informed act. */
	note: string;
}

/**
 * THE ROSTER. One record per slider, in the order the editor draws them.
 */
export const STAR_BOUNDS: Readonly<Record<StarBoundKey, StarBound>> = {
	mass: {
		key: 'mass',
		label: 'Mass',
		unit: 'M☉',
		soft: [0.01, 300],
		log: true,
		note:
			'0.01 M☉ is about ten Jupiters — the deuterium-burning floor, below which the object is a ' +
			'planet rather than any kind of star. 300 M☉ is the top of the observed stellar range ' +
			'(R136a1 is around 200). Black holes leave this range far behind: see SUPERMASSIVE_MASS.'
	},
	radius: {
		key: 'radius',
		label: 'Radius',
		unit: 'R☉',
		soft: [0.01, 2000],
		log: true,
		note:
			'0.01 R☉ is roughly Earth-sized — a white dwarf. 2,000 R☉ is past the largest known red ' +
			'supergiants (Stephenson 2-18 is around 2,150 by some measurements, UY Scuti around 1,700).'
	},
	temp: {
		key: 'temp',
		label: 'Effective Temperature',
		unit: 'K',
		soft: [500, 50000],
		log: true,
		note:
			'500 K is the Y-dwarf floor — the coolest objects still filed as stars. 50,000 K covers the ' +
			'hottest O stars and Wolf-Rayets without the slider spending half its travel on the tail.'
	},
	radiation: {
		key: 'radiation',
		label: 'Ionising Output',
		unit: 'L☉',
		soft: [0.01, 50000],
		log: true,
		note:
			'A DERIVED readout with a slider only because it is also authored on remnants. The band is ' +
			'the ordinary stellar spread; a feeding black hole is Eddington-capped elsewhere.'
	},
	mag: {
		key: 'mag',
		label: 'Magnetic Field',
		unit: 'G',
		soft: [0.01, 1e15],
		log: true,
		note:
			'1e15 G is the magnetar range — the strongest fields known anywhere. The Sun is about 1 G ' +
			'at the surface, so this slider spans seventeen decades and could not be anything but log.'
	},
	rot: {
		key: 'rot',
		label: 'Rotation Period',
		unit: 'h',
		soft: [0.1, 10000],
		log: true,
		note:
			'0.1 h is a millisecond-pulsar-ish spin; 10,000 h is about fourteen months, past the slowest ' +
			'stellar rotators. LOG since A85, and it was the extraction that found why it had to be: the ' +
			'slider shipped LINEAR while the typical-for-class band behind it was drawn on a log axis, ' +
			'so a G star\u2019s 24 h band start painted at 48 per cent of a track where the thumb for 24 h ' +
			'sat at 0.24 per cent. Five decades cannot go on a linear track: on one, every period under ' +
			'a hundred hours — which is most stars and every pulsar — is unreachable.'
	}
} as const;

/**
 * THE SUPERMASSIVE RANGE (A83). Owner, 2026-08-31: *"a switch that can offer 'supermassive black
 * holes' — the scale will change from 300 to 270 Billion SM — which is the theoretical limit (log
 * slider!)"*.
 *
 * ONLY THE TOP MOVES. The floor stays at the stellar 0.01 M☉ so that flipping the switch changes
 * the slider's SENSITIVITY and nothing else: the star's mass does not move, and the thumb still
 * stands for the same number. A range that started at 1e5 would teleport every ordinary hole to the
 * bottom of the track the moment the switch was thrown.
 */
export const SUPERMASSIVE_MASS: readonly [number, number] = [0.01, 2.7e11];

/**
 * THE AMBER EDGE, AND IT IS AN EDGE RATHER THAN A WALL.
 *
 * 2.7e11 M☉ is the theoretical ceiling on black-hole growth BY ACCRETION: past it the accretion
 * disc's own self-gravity wins, the disc fragments into stars instead of feeding the hole, and
 * luminous accretion switches off. It is a limit on a MECHANISM, not a law of nature — nothing
 * forbids a heavier hole, there is simply no known way to grow one — which is exactly the
 * amber-not-red distinction the overrides roster already draws (`plausible` vs `possible`).
 *
 * So a GM who types 5e11 keeps it and is told why it is remarkable. Steer, do not stop: alien
 * engineering, a reality breakdown or a plot device are all legitimate reasons, and the engine
 * cannot tell one from a typo.
 */
export const SUPERMASSIVE_AMBER_ABOVE = 2.7e11;

/** The sentence shown beside a mass past the amber edge. UK English, a GM's words. */
export const SUPERMASSIVE_AMBER_NOTE =
	'Past the theoretical growth limit of about 270 billion M☉ — beyond that the accretion disc ' +
	'collapses into stars faster than the hole can swallow it, so nothing is known to grow this ' +
	'heavy. Kept as typed.';

/** The travel this slider spans right now: the supermassive range when the switch is on. */
export function massSoftRange(supermassive: boolean): readonly [number, number] {
	return supermassive ? SUPERMASSIVE_MASS : STAR_BOUNDS.mass.soft;
}

/**
 * Where `value` sits along a bound's travel, 0..1. Clamped to the ends, which is what makes a typed
 * figure outside the range pin the thumb rather than move it off the track.
 *
 * THE ARITHMETIC IS THE COMPONENT'S OWN, VERBATIM — `(log(clamp(v)) - logMin) / (logMax - logMin)`
 * for the log bounds and the plain linear form otherwise. `starBounds.spec.ts` pins that.
 */
export function boundPos(soft: readonly [number, number], value: number, log = true): number {
	const [lo, hi] = soft;
	const v = Math.max(lo, Math.min(hi, value));
	if (!log) return (v - lo) / (hi - lo);
	const logLo = Math.log(lo);
	return (Math.log(v) - logLo) / (Math.log(hi) - logLo);
}

/** The value a position along a bound's travel stands for — the inverse of `boundPos`. */
export function boundValue(soft: readonly [number, number], pos: number, log = true): number {
	const [lo, hi] = soft;
	if (!log) return lo + (hi - lo) * pos;
	const logLo = Math.log(lo);
	return Math.exp(logLo + (Math.log(hi) - logLo) * pos);
}

/**
 * A pack band's start and width as PERCENTAGES of a bound's track — the green "typical for this
 * class" rectangle behind each slider.
 *
 * Returns null when the band cannot be drawn: a band the pack states as zero is a real statement
 * (a quiescent black hole has no temperature and no field), not a gap, and log(0) would poison the
 * geometry. The old code returned 0 for both, which drew a 2%-wide sliver at the far left; null
 * lets the caller draw nothing, which is what it always meant.
 */
export function bandPct(
	soft: readonly [number, number],
	band: readonly [number, number] | undefined,
	log = true
): { start: number; width: number } | null {
	if (!band || !(band[0] > 0) || !(band[1] > 0)) return null;
	const startPct = boundPos(soft, band[0], log) * 100;
	const endPct = boundPos(soft, band[1], log) * 100;
	return { start: Math.max(0, startPct), width: Math.max(2, endPct - startPct) };
}
