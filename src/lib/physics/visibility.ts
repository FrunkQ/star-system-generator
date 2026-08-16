// HOW FAR YOU CAN SEE, AND HOW FAR A LAMP REACHES.
//
// This exists because occluded sight lines are where the plot is. "The air is thick" is scenery; "you
// can see forty metres, and your torch reaches twelve" is an encounter — it decides whether the thing
// in the murk gets a surprise round. So the engine answers it in metres.
//
// IT IS THE SAME OPTICAL DEPTH the surface spectrum already computes, turned on its side. A sky is
// dim overhead and a horizon is lost for one reason: light is scattered out of the path. Looking up
// through the whole column gives the transmission; looking sideways through air of the same density
// gives the range. So the extinction here is `rayleighTau550 / scaleHeight` — the column's optical
// depth spread over the height it occupies — and nothing about visibility is derived twice.
//
// WHAT VALIDATES IT: Earth comes out at roughly 300 km, which is the textbook Rayleigh limit for
// perfectly clean air, and the reason distant mountains are blue rather than invisible. Real Earth
// visibility is far shorter because of aerosols, which is a thing this model does NOT have — see the
// caveats at the bottom of the file.
import type { CelestialBody, RulePack } from '$lib/types';
import { UNIVERSAL_GAS_CONSTANT, EARTH_GRAVITY, EARTH_RADIUS_KM } from '$lib/constants';
import { rayleighTau550 } from './surfaceSpectrum';
import { decksFromTags } from './cloudDecks';
import { liquidDef } from './liquids';

/**
 * KOSCHMIEDER. A black object against the horizon sky is lost when its contrast falls to 2%, and
 * −ln(0.02) = 3.912. This is the definition "visibility" means on a weather report, so quoting it
 * means the number can be compared with a figure a person already has a feel for.
 */
const CONTRAST_THRESHOLD = 3.912;

/** A standing person's eye. Sets the horizon, which on a small moon is the binding limit. */
const EYE_HEIGHT_M = 1.7;

/**
 * Lamps, by luminous intensity along the beam in candela. These are ordinary real-world figures —
 * a good hand torch throws about 1500 cd, a car's dipped beam around 25000, a vehicle-mounted
 * floodlight a few hundred thousand. They are the one place a GM might reasonably want to substitute
 * their own numbers, which is why they are a table rather than three constants buried in a formula.
 */
export const LAMPS = [
	{ key: 'torch', label: 'hand torch', candela: 1_500 },
	{ key: 'headlights', label: 'headlights', candela: 25_000 },
	{ key: 'floodlight', label: 'floodlight', candela: 500_000 }
] as const;

/** What you are trying to pick out: rock, a hull, a person. Dry rock and cloth sit near 0.2. */
const TARGET_ALBEDO = 0.2;

/**
 * The luminance at which a dark-adapted eye picks a surface out of the dark, in cd/m². A few
 * thousandths is the standard figure for detecting a large low-contrast patch, and it is a DETECTION
 * threshold, not a recognition one — at this range you know something is there, not what it is.
 */
const DETECTION_LUMINANCE = 3e-3;

export interface Visibility {
	/** Extinction coefficient at the surface, per metre, at 550 nm. */
	extinctionPerM: number;
	/** Meteorological visual range — how far a dark object stays visible against the sky. */
	rangeM: number;
	/** Distance to the horizon for a standing person, which no amount of clear air gets you past. */
	horizonM: number;
	/** How far you can actually see: the nearer of the two above. */
	seeM: number;
	/** How far each lamp picks a target out of the dark, by lamp key. */
	lampM: Record<string, number>;
	/** A condensate deck sitting ON the ground rather than overhead — fog, not cloud. */
	fogged: boolean;
	/** One-word band, for the tag and for a quick read. */
	band: VisibilityBand;
}

export const VISIBILITY_BANDS = ['airless', 'clear', 'hazy', 'murky', 'thick', 'blind'] as const;
export type VisibilityBand = (typeof VISIBILITY_BANDS)[number];

/** Pressure scale height, RT/(Mg) — the height the atmosphere would occupy at constant density. */
export function scaleHeightM(body: CelestialBody): number {
	const t = body.temperatureK ?? 288;
	const molar = body.atmosphere?.molarMassKg ?? 0.02896;
	const g = body.calculatedGravity_ms2 || EARTH_GRAVITY;
	if (!(t > 0) || !(molar > 0) || !(g > 0)) return 8400;
	return (UNIVERSAL_GAS_CONSTANT * t) / (molar * g);
}

/** Distance to the horizon over a sphere, sqrt(2Rh) — small enough on a moon to matter at the table. */
export function horizonM(body: CelestialBody): number {
	const r = (body.radiusKm ?? EARTH_RADIUS_KM) * 1000;
	return r > 0 ? Math.sqrt(2 * r * EYE_HEIGHT_M) : Infinity;
}

/**
 * ALLARD'S LAW, out and back.
 *
 * A lamp of intensity I puts E = I·e^(−βd)/d² onto a target d away — the inverse square because the
 * beam spreads, the exponential because the murk eats it. The target throws back ρE/π, and THAT has
 * to survive the same journey again before it reaches an eye. So the returned luminance is
 *
 *     L = ρ·I·e^(−2βd) / (π·d²)
 *
 * and the reach is where L falls to the detection threshold. Note the 2 in the exponent: fog does not
 * halve a lamp's range, it takes it out twice, which is why lights are so much less use in murk than
 * people expect. Monotonic in d, so a bisection is exact enough and cannot spin.
 */
export function lampReachM(candela: number, extinctionPerM: number): number {
	const clear = Math.sqrt((TARGET_ALBEDO * candela) / (Math.PI * DETECTION_LUMINANCE));
	if (!(extinctionPerM > 0)) return clear;
	const seen = (d: number) =>
		(TARGET_ALBEDO * candela * Math.exp(-2 * extinctionPerM * d)) / (Math.PI * d * d);
	let lo = 0.01, hi = clear;      // clear air is the upper bound: murk can only shorten it
	for (let i = 0; i < 60; i++) {
		const mid = 0.5 * (lo + hi);
		if (seen(mid) > DETECTION_LUMINANCE) lo = mid; else hi = mid;
	}
	return 0.5 * (lo + hi);
}

/**
 * The band describes THE AIR, so it keys on the atmospheric range and not on how far you can
 * actually see. Those are different facts and conflating them threw the answer away: clamped to the
 * horizon, Earth, Mars, Titan and Venus all came out "murky" — because a standing person's horizon
 * is two to five kilometres everywhere, which says nothing about the atmosphere at all.
 */
function bandFor(extinctionPerM: number, rangeM: number): VisibilityBand {
	if (!(extinctionPerM > 0)) return 'airless';
	if (rangeM >= 50_000) return 'clear';
	if (rangeM >= 10_000) return 'hazy';
	if (rangeM >= 1_000) return 'murky';
	if (rangeM >= 100) return 'thick';
	return 'blind';
}

export function deriveVisibility(body: CelestialBody, pack?: RulePack | null): Visibility {
	const h = scaleHeightM(body);
	// The column's optical depth spread over the height it occupies. For a well-mixed gas this is the
	// extinction a person standing in it walks through, per metre.
	let beta = h > 0 ? rayleighTau550(body, pack) / h : 0;

	// FOG IS NOT CLOUD, and the difference is whether the deck's base is above your head. A deck
	// condenses at `baseBar`; if that pressure is at or below the surface pressure the deck starts at
	// the ground and you are standing inside it. Venus's decks sit at about 1.5 bar under a 92 bar
	// surface — far overhead — which is why Venus is murky from sheer air rather than from fog.
	const surfaceBar = body.atmosphere?.pressure_bar ?? 0;
	let fogged = false;
	if (surfaceBar > 0) {
		for (const d of decksFromTags(body.tags, pack)) {
			if (!(d.baseBar && d.baseBar >= surfaceBar * 0.995)) continue;
			const tau = d.opticalDepth ?? -Math.log(1 - Math.min(0.98, (liquidDef(d.species, pack)?.cloudOpacity ?? 0.5) * d.coverage));
			if (!(tau > 0)) continue;
			fogged = true;
			// SPREAD OVER A SCALE HEIGHT, which overstates the range: real fog is a boundary-layer
			// thing tens of metres deep, and nothing in the deck data says how deep. Recorded as a
			// known limit rather than papered over with an invented depth.
			beta += tau / h;
		}
	}

	const rangeM = beta > 0 ? CONTRAST_THRESHOLD / beta : Infinity;
	const hor = horizonM(body);
	const seeM = Math.min(rangeM, hor);
	const lampM: Record<string, number> = {};
	for (const l of LAMPS) lampM[l.key] = Math.min(lampReachM(l.candela, beta), hor);
	return { extinctionPerM: beta, rangeM, horizonM: hor, seeM, lampM, fogged, band: bandFor(beta, rangeM) };
}

/** Metres into something sayable at a table. */
export function distanceWords(m: number): string {
	if (!isFinite(m)) return 'as far as there is anything to see';
	if (m >= 100_000) return `${Math.round(m / 1000)} km`;
	if (m >= 10_000) return `${(m / 1000).toFixed(0)} km`;
	if (m >= 1_000) return `${(m / 1000).toFixed(1)} km`;
	if (m >= 100) return `${Math.round(m / 10) * 10} m`;
	if (m >= 10) return `${Math.round(m)} m`;
	return `${m.toFixed(1)} m`;
}

// WHAT THIS DOES NOT MODEL, said plainly because /physics claims to show its working:
//   - AEROSOLS. Dust, smoke, spray and photochemical haze are the usual reason real visibility is
//     short, and none of them are here. Earth therefore reads as its clean-air Rayleigh limit of a
//     few hundred kilometres rather than the twenty or thirty a damp day gives you, and Titan reads
//     far clearer than its orange smog really is. Every figure is a CEILING.
//   - Fog depth, as above.
//   - Beam shape. A lamp is treated as its on-axis intensity, so these are reaches down the beam,
//     not radii of a lit bubble.
//   - The sky's own glow, which in daylight is what a dark object is lost AGAINST. Koschmieder
//     assumes it; on a world with almost no scattering the contrast holds further than this says.
