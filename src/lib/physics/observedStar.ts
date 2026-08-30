// WHAT AN OBSERVER MEASURES, as against what the star IS. (G54 phase 2,
// docs/dev/observed-vs-intrinsic-design.md.)
//
// THE SEAM, and it is the whole reason this file is not part of the occlusion work it consumes.
// `starlightOcclusion.ts` answers what a body IN this system RECEIVES — a power balance, time-
// averaged over an orbit, feeding temperature. This module answers what an observer OUTSIDE the
// system MEASURES — a spectrum along one fixed bearing, feeding a colour and a designation. Same
// geometry, same occluders, two different questions, and the difference shows up exactly where a
// BAND is involved: a ringworld shadows a coplanar world for the SHARE OF ITS ORBIT the geometry
// allows, but it either does or does not lie across a given line of sight. Nothing here touches
// temperature; nothing there touches colour.
//
// THE PHYSICS CORRECTION THAT MAKES THE FICTION BETTER (design §2, owner-corrected and not up for
// re-litigation). A Dyson swarm does NOT turn a G star into an M star. Grey attenuation — flat
// across wavelength — cuts FLUX without touching COLOUR, and the absorption lines stay exactly
// where they were, so a spectrum still reads G2V. What it produces is THREE MEASUREMENTS THAT
// DISAGREE: spectroscopy says G2V, photometry says far too faint, infrared says a large excess.
// DUST is the other case and there the reddening is real, because interstellar extinction goes
// roughly as 1/lambda: a G star behind enough dust really can be mistaken for a cooler one, right
// up until someone takes a spectrum. The lines are the tell and they never lie.
//
// THE OUT-OF-BAND RULE, AND IT IS NOT NEGOTIABLE (design §3). The shared grid is 280-1400 nm, the
// PHOTOCHEMISTRY window, chosen for what a photon can drive rather than for what an eye can see. A
// shell at 1 AU around a Sun-like star re-radiates near 400 K, whose Wien peak is about 7,400 nm —
// five times outside the grid. Extending the grid to reach it would be tens of thousands of samples
// per spectrum on every body on every pass, to serve one feature. So the split is:
//
//     IN-BAND ATTENUATION on the existing grid   observed[i] = intrinsic[i] * transmission[i]
//     OUT-OF-BAND RE-EMISSION as a SCALAR + a TEMPERATURE   "N watts at T kelvin, peaking at L nm"
//
// which is everything a designation, an info card or a sensor reading needs, and `wienPeakNm`
// already computes the peak. Nothing is sampled where nothing else in the engine looks.
//
// A NOTE ON THE DESIGN'S OWN FIGURE, because the anchor rule says check it rather than copy it.
// The design says a 1 AU shell sits "roughly 150 K, Wien peak near 19,000 nm". Stefan-Boltzmann
// from this engine's own constants gives ~394 K and ~7,350 nm: a shell intercepting the whole
// luminosity and re-radiating over its own sphere has sigma T^4 = L / (4 pi r^2), which at 1 AU is
// the solar constant itself. 150 K corresponds to a shell about seven times further out. The
// CONCLUSION is unchanged and if anything stronger — 7,350 nm is still five times outside the grid
// — so the split above stands; only the illustrative number moves.
import type { CelestialBody, Barycenter, Kepler, ID } from '../types';
import {
	GRID_NM, blackbodySpectrum, constantSpectrum, gridShare, radiantPower, wienPeakNm,
	spectrumToXyz, xyzToLinearSrgb, scaleHexLinear, type Spectrum
} from './spectrum';
import { STEFAN_BOLTZMANN_CONSTANT, AU_KM } from '$lib/constants';
import { luminosityWattsFromRT } from './luminosity';
import { starOccluders, type StarOccluder } from './starlightOcclusion';

// ── THE DATA SHAPE (design §6) ───────────────────────────────────────────────────────────────────

/**
 * WHAT ONE INTERVENING THING DOES TO THE LIGHT PASSING IT. Composed multiplicatively, in order.
 *
 * Deliberately NOT owned by mega-constructs: a nebula, a dust lane or an atmosphere must be able to
 * produce one of these without knowing that Dyson swarms exist. That is why the producer functions
 * below are separate from the composition ones — the composition half is the reusable core and it
 * has no idea what made its inputs.
 */
export interface LineOfSightEffect {
	/** What causes it. The tag or marker that discloses it hangs off this. */
	sourceId: ID;
	/** What a reader is told it is, when they are told at all (the disclosure ladder decides). */
	sourceName: string;
	/** In-band, on `GRID_NM`: 1 = transparent, 0 = opaque. Flat for a swarm, ~1/lambda for dust. */
	transmission?: Spectrum;
	/** Out-of-band re-emission. NOT a spectrum (see the header): total power, in watts. */
	reradiatedW?: number;
	/** The temperature that power comes out at, K — with `reradiatedW`, the whole of the IR story. */
	reradiatedTempK?: number;
	/**
	 * In-band EMISSION — nebular lines. Declared here so the shape does not have to change when
	 * nebula emission is built (its own item, design §5); nothing produces one today, and the
	 * composition below carries it through rather than pretending it cannot exist.
	 */
	emission?: Spectrum;
}

// ── TRANSMISSION CURVES ──────────────────────────────────────────────────────────────────────────

/**
 * GREY ATTENUATION — the swarm, the shell, the ring. `blocked` of the light is intercepted at every
 * wavelength equally, so the colour does not move and only the brightness does. This is the whole
 * of the §2 correction expressed as three lines of code, and it is why "a G star that looks M" is a
 * nebula story rather than a swarm one.
 */
export function greyTransmission(blocked: number): Spectrum {
	const b = Number.isFinite(blocked) ? Math.min(1, Math.max(0, blocked)) : 0;
	return constantSpectrum(1 - b);
}

/** The wavelength extinction is quoted at, nm — the astronomer's V band, and the anchor `tau550`
 *  means. Named rather than inline because it is the definition of the override's units. */
export const EXTINCTION_REFERENCE_NM = 550;

/**
 * DUST — wavelength-dependent extinction, and the case where the owner's original story is exactly
 * right. Optical depth goes roughly as 1/lambda across the optical and near-infrared, so blue is
 * scattered out of the beam preferentially and what survives is both FAINTER and REDDER.
 *
 * `tau550` is the optical depth at 550 nm: 0 is clear, 1 leaves e^-1 (about 37%) of the V-band
 * light, 3 leaves 5%. Transmission at any other wavelength is exp(-tau550 * 550/lambda), so the far
 * red end of the grid at 1400 nm loses only 550/1400 = 0.39 of that optical depth.
 *
 * SAY WHAT IT IS NOT: real extinction curves have structure (the 2175 A bump, the silicate
 * features) and the near-infrared slope is nearer lambda^-1.7 than lambda^-1. A single power is the
 * honest first model for a worldbuilding tool, it has one authored number, and it gets the
 * direction and the rough magnitude of the reddening right — which is what the story needs.
 */
export function dustTransmission(tau550: number): Spectrum {
	const t = Number.isFinite(tau550) ? Math.max(0, tau550) : 0;
	if (!(t > 0)) return constantSpectrum(1);
	return GRID_NM.map((nm) => Math.exp(-t * (EXTINCTION_REFERENCE_NM / nm)));
}

// ── COMPOSITION ──────────────────────────────────────────────────────────────────────────────────

/** Everything between a star and one observer, reduced to what a reading needs. */
export interface ComposedLineOfSight {
	/** The product of every transmission curve, on `GRID_NM`. */
	transmission: Spectrum;
	/** In-band emission added along the way (nebulae). Zero everywhere until that item is built. */
	emission: Spectrum;
	/** Total out-of-band re-emission, watts. */
	reradiatedW: number;
	/** The temperature it comes out at, K — POWER-WEIGHTED across sources, or 0 with no source. */
	reradiatedTempK: number;
	/** Who did what, in order, for the trace and for the disclosure ladder to redact. */
	sources: { id: ID; name: string }[];
}

/**
 * Compose effects in order. The multiply is the entire mechanism, and it is the same call for a
 * swarm (flat), for dust (1/lambda) and one day for an atmosphere.
 *
 * THE RE-EMISSION TEMPERATURE IS POWER-WEIGHTED, not averaged. Two structures re-radiating equal
 * power at 400 K and 100 K are not one structure at 250 K in any useful sense, but a reader asking
 * "what temperature is the excess" wants one number, and the power-weighted mean is the one that
 * degrades correctly: it goes to the hotter source when the hotter source dominates the watts,
 * which is what a bolometer would actually be told.
 */
export function composeLineOfSight(effects: readonly LineOfSightEffect[]): ComposedLineOfSight {
	const transmission = constantSpectrum(1);
	const emission = constantSpectrum(0);
	let reradiatedW = 0;
	let weightedT = 0;
	const sources: { id: ID; name: string }[] = [];
	for (const e of effects) {
		if (e.transmission) for (let i = 0; i < transmission.length; i++) transmission[i] *= e.transmission[i] ?? 1;
		if (e.emission) for (let i = 0; i < emission.length; i++) emission[i] += e.emission[i] ?? 0;
		const w = e.reradiatedW ?? 0;
		if (w > 0) {
			reradiatedW += w;
			weightedT += w * (e.reradiatedTempK ?? 0);
		}
		sources.push({ id: e.sourceId, name: e.sourceName });
	}
	return {
		transmission,
		emission,
		reradiatedW,
		reradiatedTempK: reradiatedW > 0 ? weightedT / reradiatedW : 0,
		sources
	};
}

// ── THE RE-EMISSION TEMPERATURE ──────────────────────────────────────────────────────────────────

/**
 * The equilibrium temperature of a structure at `radiusAu` around a star of `luminosityW`, K.
 *
 * sigma T^4 = L / (4 pi r^2) — it intercepts the star's light over the part of the sphere it
 * covers and re-radiates the same power over the same area, so THE COVERING FRACTION CANCELS and a
 * 10% swarm sits at the same temperature as a complete shell at the same radius. That is not a
 * simplification, it is the result: both absorbed power and radiating area scale with coverage.
 *
 * STATED APPROXIMATION: one-sided, the shell convention. A flat collector radiating from BOTH faces
 * runs 2^-0.25 cooler (about 84% of this). Which is right depends on a structure's construction,
 * which the engine does not model, and the shell convention is the one every published Dyson-sphere
 * figure uses — so a reader comparing against anything they look up gets the number they expect.
 */
export function reradiationTempK(luminosityW: number, radiusAu: number): number {
	if (!(luminosityW > 0) || !(radiusAu > 0)) return 0;
	const rM = radiusAu * AU_KM * 1000;
	return Math.pow(luminosityW / (4 * Math.PI * rM * rM * STEFAN_BOLTZMANN_CONSTANT), 0.25);
}

// ── DIRECTION: WHICH OBSERVERS A BAND DIMS (design §2b) ──────────────────────────────────────────

const DEG = Math.PI / 180;

/**
 * The unit NORMAL of an orbital plane in the reference frame: (sin i sin W, -sin i cos W, cos i).
 *
 * WHICH FRAME, AND THE HONEST ANSWER: there is only one. A system's orbital elements are expressed
 * against its own reference plane and the starmap positions bodies in map coordinates, and nothing
 * in the data relates the two — a `StarSystemNode` carries a position and no orientation. So the
 * convention here is that a system's reference plane IS the map's xy plane. It is an assumption and
 * it is stated rather than hidden; if per-system orientation is ever added, this is the one function
 * that has to learn about it.
 */
export function orbitPlaneNormal(elements: Kepler | null | undefined): [number, number, number] {
	const i = (elements?.i_deg ?? 0) * DEG;
	const W = (elements?.Omega_deg ?? 0) * DEG;
	return [Math.sin(i) * Math.sin(W), -Math.sin(i) * Math.cos(W), Math.cos(i)];
}

/**
 * Does a band of half-angle `halfAngleRad` about `elements`' plane lie across the bearing `dir`?
 *
 * ONE DOT PRODUCT, which is what the owner said it would be. The sine of the observer's latitude
 * above the band's plane is the normal dotted with the bearing, and the band reaches latitudes
 * +/- its half-angle — so it covers the bearing when |n . d| <= sin(halfAngle). From most of the sky
 * a thin ring occludes essentially nothing of its star, and two crews in different systems can
 * honestly disagree about what that star looks like with both of them right.
 *
 * THIS IS NOT `bandAlignmentShare` AND MUST NOT BE CONFUSED WITH IT. That one answers how much of
 * its ORBIT a body spends inside the band — a time share, for a power balance. This one answers
 * whether a single fixed LINE OF SIGHT passes through it. A body on a crossing orbit is dimmed part
 * of the time; an observer on a bearing is dimmed or is not.
 */
export function bandCoversBearing(
	halfAngleRad: number,
	elements: Kepler | null | undefined,
	dir: readonly [number, number, number]
): boolean {
	if (!(halfAngleRad > 0)) return false;
	const n = orbitPlaneNormal(elements);
	const len = Math.hypot(dir[0], dir[1], dir[2]);
	if (!(len > 0)) return false;
	const sinLat = Math.abs((n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2]) / len);
	return sinLat <= Math.sin(Math.min(Math.PI / 2, halfAngleRad));
}

// ── PRODUCERS: what is actually in front of this star ────────────────────────────────────────────

/** The override key a GM pins to put dust in front of a star. Named here because this module owns
 *  what the number MEANS; `physics/overrides.ts` owns the slider. */
export const DUST_OVERRIDE_KEY = 'lineOfSightExtinction';

export interface ObservationOptions {
	/**
	 * The unit bearing from the star to the observer, in map coordinates. Absent = NO VIEWPOINT
	 * CHOSEN, and the answer falls back to the isotropic one and says so (`bandsUnresolved`).
	 */
	viewDir?: readonly [number, number, number];
}

export interface StarObservation extends ComposedLineOfSight {
	/** Bands that could not be tested because no viewpoint was chosen — the "and say so" half. */
	bandsUnresolved: { id: ID; name: string }[];
}

/**
 * Everything between this star and an observer on `viewDir`, from authored data alone.
 *
 * THE OCCLUDER LIST IS NOT REBUILT HERE. `starlightOcclusion.starOccluders` is the ONE place that
 * decides who shades whom and by how much (engine-map PHY-36) and this consumes it — a second
 * walk of the node list, keyed on `megaType` a second time, is exactly the duplication that ends
 * with two answers to one question the moment either is touched.
 *
 * WHAT IS DIFFERENT FROM THE IN-SYSTEM CASE, and it is only the geometry: rule 2 (a body radially
 * inside the occluder is undimmed) does not apply, because an observer outside the system is
 * outside every occluder by definition; and a band's test is a bearing rather than an orbit share.
 */
export function starObservation(
	star: CelestialBody,
	allNodes: (CelestialBody | Barycenter)[],
	opts: ObservationOptions = {}
): StarObservation {
	const effects: LineOfSightEffect[] = [];
	const bandsUnresolved: { id: ID; name: string }[] = [];
	const luminosityW = luminosityWattsFromRT(star.radiusKm ?? 0, starTempK(star));

	for (const occ of starOccluders(star, allNodes)) {
		const band = occ.bandHalfAngleRad !== undefined;
		if (band) {
			if (!opts.viewDir) { bandsUnresolved.push({ id: occ.id, name: occ.name }); continue; }
			if (!bandCoversBearing(occ.bandHalfAngleRad!, occ.elements, opts.viewDir)) continue;
		}
		effects.push(occluderEffect(occ, luminosityW));
	}

	// AUTHORED DUST, LAST — it sits between the observer and everything the system contains, which
	// is what "line of sight" means. Composition is multiplicative so the order does not change the
	// transmission; it changes the order sources are NAMED in, and a reader should be told about the
	// star's own furniture before the fog in between.
	const tau = Number((star.overrides as Record<string, unknown> | undefined)?.[DUST_OVERRIDE_KEY]);
	if (Number.isFinite(tau) && tau > 0) {
		effects.push({ sourceId: `${star.id}:dust`, sourceName: 'Foreground dust', transmission: dustTransmission(tau) });
	}

	return { ...composeLineOfSight(effects), bandsUnresolved };
}

/** One occluder as a line-of-sight effect: what it takes out, and what it gives back in the far
 *  infrared. The two halves are the same energy, which is the point — a swarm is not a hole. */
export function occluderEffect(occ: StarOccluder, starLuminosityW: number): LineOfSightEffect {
	const reradiatedW = starLuminosityW > 0 ? starLuminosityW * occ.fraction : 0;
	return {
		sourceId: occ.id,
		sourceName: occ.name,
		transmission: greyTransmission(occ.fraction),
		reradiatedW,
		reradiatedTempK: reradiationTempK(starLuminosityW, occ.radiusAu)
	};
}

/** A star's effective temperature, with the engine's own fallbacks — the one place this module
 *  decides what "the star's temperature" means, so the spectrum and the designation agree. */
function starTempK(star: CelestialBody): number {
	return star.temperatureK ?? (star as { surfaceTempK?: number }).surfaceTempK ?? 0;
}

// ── THE READING ──────────────────────────────────────────────────────────────────────────────────

/**
 * WHEN THE READINGS DISAGREE ENOUGH TO CALL IT AN ANOMALY. Data, not code: these are exactly the
 * "will a human want to change this after using the product" numbers the standing rule names, and
 * they are the detection thresholds of the two real measurements.
 */
export const ANOMALY_THRESHOLDS = {
	/** Magnitudes of dimming below which no honest observer would call a star odd. 0.1 mag is about
	 *  9% and is roughly where ground photometry stops arguing with itself. Tabby's Star's deepest
	 *  recorded dips are around 0.2. */
	magnitudeDrop: 0.1,
	/** Infrared excess as a fraction of the star's bolometric output. 1% is generous by the
	 *  standards of real technosignature searches and mean-nothing small in fiction. */
	irExcessFrac: 0.01,
	/** Colour shift, in the ratio of blue-end to red-end transmission, past which the star is
	 *  REDDENED rather than merely dimmed. 1.05 is a 5% tilt across the grid. */
	reddeningRatio: 1.05
} as const;

export interface ObservedStarReading {
	/** Band-integrated share of the star's in-band light that arrives, 0..1. */
	transmission: number;
	/** How much fainter it looks, in magnitudes: -2.5 log10(transmission). Infinite for opaque. */
	magnitudeDrop: number;
	/** Total re-emission, watts, and where it comes out. Zero when nothing intercepts anything. */
	reradiatedW: number;
	reradiatedTempK: number;
	/** Wien peak of that re-emission, nm — outside the grid by design, which is why it is a scalar. */
	reradiatedPeakNm: number;
	/** The excess as a fraction of the star's INTRINSIC bolometric output. */
	irExcessFrac: number;
	/** True when the light is reddened as well as dimmed — dust, never a grey occluder. */
	reddened: boolean;
	/** The per-channel linear gain a human eye's primaries take. (1,1,1) = nothing in the way. */
	colourGain: [number, number, number];
	/** Any of the three measurements disagreeing by more than `ANOMALY_THRESHOLDS`. */
	anomalous: boolean;
}

/** Nothing in the way — the reading a clear star gets, and the identity every gate checks first. */
export const CLEAR_READING: ObservedStarReading = {
	transmission: 1, magnitudeDrop: 0, reradiatedW: 0, reradiatedTempK: 0, reradiatedPeakNm: 0,
	irExcessFrac: 0, reddened: false, colourGain: [1, 1, 1], anomalous: false
};

/**
 * The three measurements, from the star and what is in front of it.
 *
 * THE COLOUR IS DERIVED SPECTRALLY AND PROJECTED ONCE, AT THE END. The star's own blackbody goes
 * through the transmission curve on the shared grid; only then is the pair projected through the
 * human colour-matching functions to get the per-channel gain. That is `spectrum.ts`'s first rule
 * (the colour-matching step is the LAST step and belongs only on the presentation branch) obeyed
 * rather than quoted: multiplying an RGB by an RGB would get a grey swarm approximately right and a
 * dust lane in front of an M dwarf quite wrong, which is inbox B54 one level up.
 *
 * AND THE GAIN, NOT A COLOUR. This returns what the light LOST, so the caller applies it to
 * whatever colour that surface already shows for the star. Returning a hex would be a second
 * authority on what colour a star is, disagreeing with `getPlanetColor` the moment either moved.
 */
export function observedStarReading(
	tempK: number,
	los: ComposedLineOfSight,
	/** The star's INTRINSIC bolometric output, watts — the divisor the infrared excess is quoted
	 *  against. Handed in rather than derived here so this module never computes R^2 T^4 (PHY-34:
	 *  there is one answer to how bright a star is and `luminosity.ts` gives it). */
	bolometricW = 0
): ObservedStarReading {
	if (!(tempK > 0)) return CLEAR_READING;
	// NOTHING IN THE WAY: return before building a single spectrum. This runs per star on a starmap
	// that may hold seven hundred systems and redraws reactively, and the overwhelmingly common case
	// is a star with nothing in front of it at all. The identity is exact, not approximate, which is
	// what makes it safe to skip the arithmetic rather than merely cheap.
	if (!los.sources.length) return CLEAR_READING;
	// Absolute irradiance is irrelevant to every quantity here (all of them are ratios of two
	// spectra or a separately-computed wattage), so the intrinsic curve is normalised to the share
	// of a unit bolometric output that falls inside the grid — the same convention every other
	// caller of `blackbodySpectrum` in the engine uses.
	const intrinsic = blackbodySpectrum(tempK, gridShare(tempK));
	const observed = intrinsic.map((v, i) => v * (los.transmission[i] ?? 1) + (los.emission[i] ?? 0));

	const pIn = radiantPower(intrinsic);
	const pOut = radiantPower(observed);
	const transmission = pIn > 0 ? pOut / pIn : 1;
	const magnitudeDrop = transmission > 0 ? -2.5 * Math.log10(transmission) : Infinity;

	const [xi, yi, zi] = spectrumToXyz(intrinsic);
	const [xo, yo, zo] = spectrumToXyz(observed);
	const li = xyzToLinearSrgb(xi, yi, zi);
	const lo = xyzToLinearSrgb(xo, yo, zo);
	const colourGain: [number, number, number] = [
		li[0] !== 0 ? lo[0] / li[0] : 1,
		li[1] !== 0 ? lo[1] / li[1] : 1,
		li[2] !== 0 ? lo[2] / li[2] : 1
	];

	// REDDENED, not merely dimmer: the blue end of the grid has lost more than the red end. A grey
	// occluder gives exactly 1 here whatever its depth, which is the §2 correction as an assertion.
	const tBlue = los.transmission[0] ?? 1;
	const tRed = los.transmission[los.transmission.length - 1] ?? 1;
	const reddened = tBlue > 0 && tRed / tBlue >= ANOMALY_THRESHOLDS.reddeningRatio;

	const reradiatedTempK = los.reradiatedTempK;
	const irExcessFrac = bolometricW > 0 ? los.reradiatedW / bolometricW : 0;

	return {
		transmission,
		magnitudeDrop,
		reradiatedW: los.reradiatedW,
		reradiatedTempK,
		reradiatedPeakNm: reradiatedTempK > 0 ? wienPeakNm(reradiatedTempK) : 0,
		irExcessFrac,
		reddened,
		colourGain,
		// THE THREE MEASUREMENTS, AND ANY ONE OF THEM DISAGREEING IS THE ANOMALY. Photometry too
		// faint, or infrared where none belongs. Spectroscopy is the third and it is the one that
		// never disagrees with itself — the lines are the tell (design §2).
		anomalous: magnitudeDrop >= ANOMALY_THRESHOLDS.magnitudeDrop
			|| irExcessFrac >= ANOMALY_THRESHOLDS.irExcessFrac
	};
}

/**
 * The whole reading for one star, from the system it sits in and where it is being looked at from.
 * The one function a surface should call.
 */
export function observedStarOf(
	star: CelestialBody,
	allNodes: (CelestialBody | Barycenter)[],
	opts: ObservationOptions = {}
): { reading: ObservedStarReading; los: StarObservation } {
	const los = starObservation(star, allNodes, opts);
	const tempK = starTempK(star);
	return { los, reading: observedStarReading(tempK, los, luminosityWattsFromRT(star.radiusKm ?? 0, tempK)) };
}

// ── THE TAGS (physics drives tags; tags drive the image) ─────────────────────────────
//
// The star's own statement that something is in front of it. Two keys, because they are two
// different MEASUREMENTS disagreeing in two different ways, and a GM highlighting one is asking a
// different question from a GM highlighting the other.

/** How much fainter the star looks to an observer the intervening structure ACTUALLY COVERS —
 *  everyone for a shell or a whole-sky swarm, only observers near its plane for a ring. Value in
 *  magnitudes; `formatTagValue` appends the unit. */
export const STAR_DIMMED_TAG = 'stellar/dimmed';

/** Far-infrared output that no star of this class should produce, as a fraction of its own
 *  bolometric luminosity. Isotropic by nature: re-emitted heat goes in every direction. */
export const STAR_IR_EXCESS_TAG = 'stellar/ir-excess';

/**
 * The tags a star earns from what stands in front of it, or none.
 *
 * DELIBERATELY THE OCCLUDER-COVERED CASE, NOT A PARTICULAR OBSERVER'S. A tag is a property of the
 * star and travels with it into every surface, so it cannot be a function of who is looking — the
 * per-viewer answer is the map's, computed where the audience is known (TAG-21). What this says is
 * "this much light is being taken out of the beam, for whoever is in the beam", which is true from
 * every direction for a shell and true within its plane for a ring, and the tag's own description
 * says which.
 *
 * A GM CAN THEN DECIDE WHAT PLAYERS ARE TOLD, and that is the owner's ask exactly: leave the tag
 * open and they get both sides of the story ("a G2V star with a Dyson swarm"); set it to `anonymous`
 * and they get the anomaly with no cause; hide it and they get a star that is simply too faint.
 */
export function observedStarTags(
	star: CelestialBody,
	allNodes: (CelestialBody | Barycenter)[]
): { key: string; value?: string }[] {
	// EVERY occluder counts here, band or not: the question is what a covered observer measures.
	const occluders = starOccluders(star, allNodes);
	const tempK = starTempK(star);
	const luminosityW = luminosityWattsFromRT(star.radiusKm ?? 0, tempK);
	const effects: LineOfSightEffect[] = occluders.map((o) => occluderEffect(o, luminosityW));
	const tau = Number((star.overrides as Record<string, unknown> | undefined)?.[DUST_OVERRIDE_KEY]);
	if (Number.isFinite(tau) && tau > 0) {
		effects.push({ sourceId: `${star.id}:dust`, sourceName: 'Foreground dust', transmission: dustTransmission(tau) });
	}
	if (!effects.length) return [];

	const reading = observedStarReading(tempK, composeLineOfSight(effects), luminosityW);
	const out: { key: string; value?: string }[] = [];
	if (reading.magnitudeDrop >= ANOMALY_THRESHOLDS.magnitudeDrop) {
		// Infinite when the star is completely enclosed, and a reader is better served by the number
		// stopping at something they can read than by the word "Infinity" in a chip.
		const mag = Number.isFinite(reading.magnitudeDrop) ? reading.magnitudeDrop : 99;
		out.push({ key: STAR_DIMMED_TAG, value: mag.toFixed(2) });
	}
	if (reading.irExcessFrac >= ANOMALY_THRESHOLDS.irExcessFrac) {
		out.push({ key: STAR_IR_EXCESS_TAG, value: reading.irExcessFrac.toFixed(3) });
	}
	return out;
}

// ── WHAT PHOTOMETRY ALONE WOULD SAY ─────────────────────────────────────────────

/** The wavelength the colour index is split at, nm. Not "the visible band" — it is simply the
 *  middle of the grid the engine already works on, and what matters is that both halves are
 *  measured the same way. */
const COLOUR_SPLIT_NM = 700;

/** Short-over-long power ratio on the shared grid: one number that rises monotonically with a
 *  blackbody's temperature, which is what makes it invertible. */
function colourIndex(spec: Spectrum): number {
	let blue = 0, red = 0;
	for (let i = 0; i < GRID_NM.length; i++) {
		if (GRID_NM[i] < COLOUR_SPLIT_NM) blue += spec[i] ?? 0; else red += spec[i] ?? 0;
	}
	return red > 0 ? blue / red : Infinity;
}

/**
 * THE TEMPERATURE PHOTOMETRY ALONE WOULD ASSIGN — the blackbody whose colour matches what arrives.
 *
 * This is the number behind "a G star that looks M", and deriving it rather than asserting it is the
 * point: for a GREY occluder it comes back EXACTLY the star's own temperature, because flat
 * attenuation cancels out of a ratio, and that is the §2 correction falsifiable rather than merely
 * stated. For dust it comes back lower, by an amount the extinction law decides.
 *
 * Bisection on a monotonic index rather than a fit: 60 halvings of [1000, 60000] K land inside a
 * fiftieth of a kelvin, it cannot diverge, and it costs nothing anybody notices because it runs only
 * where a designation is being EXPLAINED — never on the map's per-star path.
 */
export function apparentColourTempK(tempK: number, los: ComposedLineOfSight): number {
	if (!(tempK > 0)) return 0;
	if (!los.sources.length) return tempK;
	const intrinsic = blackbodySpectrum(tempK, gridShare(tempK));
	const observed = intrinsic.map((v, i) => v * (los.transmission[i] ?? 1) + (los.emission[i] ?? 0));
	const target = colourIndex(observed);
	if (!Number.isFinite(target)) return tempK;
	let lo = 1000, hi = 60000;
	for (let n = 0; n < 60; n++) {
		const mid = (lo + hi) / 2;
		if (colourIndex(blackbodySpectrum(mid, gridShare(mid))) < target) lo = mid; else hi = mid;
	}
	return (lo + hi) / 2;
}

/** The star's colour as an observer sees it: whatever colour the surface already shows for it,
 *  through the gain. A clear line of sight returns the input unchanged, exactly. */
export function observedStarHex(intrinsicHex: string, reading: ObservedStarReading): string {
	return scaleHexLinear(intrinsicHex, reading.colourGain);
}
