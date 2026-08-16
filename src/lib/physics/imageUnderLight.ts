// WHAT A FAMILIAR SIGHT LOOKS LIKE ON THAT WORLD.
//
// The GM problem this solves: "cut the red wire" is a fine instruction on Earth and may be a cruel
// one under an M dwarf, where the light has almost nothing short of 600 nm in it and red, orange and
// brown collapse into one another. Saying that in prose does not land. Showing somebody a familiar
// colour chart with the world's own light on it lands immediately.
//
// It is the SAME derivation as everything else in this feature — each pixel's colour is treated as a
// reflectance, the world's surface spectrum is filtered through it, and the result is converted for
// human eyes once. No new physics, no second model of what light does. A picture is a consumer.
//
// THE REASON THIS IS AFFORDABLE AT ALL is that the whole chain is LINEAR in the four basis weights,
// so it collapses to ONE SMALL OPERATOR per world: four tristimulus vectors. Per pixel it is then a
// handful of multiplies, because a quarter of a million pixels cannot each afford a spectral
// integration.
//
// That shape is deliberate and it is also the door to the GPU. The operator is a 3x4 matrix and a
// scale; re-lighting is `xyz = M * basisWeights(rgb)`, which is a fragment shader with one uniform
// and no textures beyond the image itself. Nothing here needs to change to move it there — which is
// the point at which re-lighting the whole 3D scene live becomes free rather than merely possible.
// On the CPU it is already a few milliseconds for a full-size chart, so the viewer does not wait.
import {
	GRID_NM, basisWeights, spectrumToXyz, blackbodySpectrum, gridShare, BASIS_LOBES, type Spectrum
} from './spectrum';
import { deriveSurfaceSpectrum } from './surfaceSpectrum';
import { EARTH_GRAVITY } from '$lib/constants';
import type { CelestialBody } from '$lib/types';

/** The four tristimulus responses of the basis under one world's light. Build once, use per pixel. */
export interface LightOperator {
	/** XYZ of a FLAT reflector — the white basis. Also the illuminant's own white point. */
	white: [number, number, number];
	/** XYZ of each of the three lobes under this light. */
	lobes: [number, number, number][];
	/** The scale that maps a perfect white reflector to display white. */
	norm: number;
}

/** One basis lobe, sampled on the grid. */
function lobeCurve(i: number): Spectrum {
	const spec = BASIS_LOBES[i];
	return GRID_NM.map((nm) => {
		const t = (Math.min(nm, 700) - spec.c) / spec.w;
		return Math.exp(-0.5 * t * t);
	});
}

/**
 * Build the operator for one world's light.
 *
 * `adapt` is the question being asked, and the two answers are both honest:
 *   false — what you see the moment you step out of the ship, the star's cast and brightness left in.
 *   true  — what you see after an hour outside, once your eyes have settled. THIS is the one that
 *           answers "can I tell these two wires apart", because adaptation removes the overall cast
 *           and leaves only the differences the light genuinely cannot carry.
 */
export function lightOperator(light: Spectrum): LightOperator {
	const white = spectrumToXyz(light);
	const lobes = [0, 1, 2].map((i) => {
		const curve = lobeCurve(i);
		return spectrumToXyz(light.map((v, k) => v * curve[k]));
	}) as [number, number, number][];
	return { white, lobes, norm: Math.max(white[0], white[1], white[2], 1e-9) };
}

const D65: [number, number, number] = [0.95047, 1.0, 1.08883];
const toLinear = (u: number) => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
const toSrgb = (v: number) => {
	const u = Math.max(0, Math.min(1, v));
	return u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055;
};

// BRADFORD. Adaptation has to happen in a CONE space, not in XYZ.
//
// The first version divided XYZ channel-wise by the illuminant's white, which is the textbook naive
// von Kries and is known to wreck saturated colours: a pillar-box red came back as pale peach under
// our OWN sun, which is a round trip that should not move at all. XYZ axes are not the eye's
// channels, so scaling them is not what adaptation does. Bradford's matrix takes XYZ into a
// sharpened cone space where scaling IS the right operation, and back out again.
const M_BRAD = [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]];
const M_BRAD_INV = [[0.9869929, -0.1470543, 0.1599627], [0.4323053, 0.5183603, 0.0492912], [-0.0085287, 0.0400428, 0.9684867]];
const XYZ_TO_SRGB = [
	[3.2404542, -1.5371385, -0.4985314],
	[-0.9692660, 1.8760108, 0.0415560],
	[0.0556434, -0.2040259, 1.0572252]
];
const mul3 = (m: number[][], v: number[]) => [
	m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
	m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
	m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
];
const mm3 = (a: number[][], b: number[][]) =>
	[0, 1, 2].map((i) => [0, 1, 2].map((j) => a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j]));

/**
 * The single 3x3 taking this world's XYZ straight to linear sRGB, adaptation included.
 *
 * `D` is the DEGREE of adaptation, and it is never 1. A tungsten-lit room still looks warm after an
 * hour rather than looking like daylight, and modelling adaptation as complete made every colour
 * pair come back "as distinguishable as at home" under an M dwarf — which is exactly the claim this
 * view exists to disprove. Around three quarters is what the standard appearance models use.
 *
 * AND IT IS NOT THE SAME IN EVERY CHANNEL. That is the correction that killed the pink Venus.
 *
 * Plain von Kries divides by the illuminant's own cone response, which is UNBOUNDED: it assumes the
 * eye can discount any light however little of it there is. On Venus the S cones receive HALF A
 * PERCENT of the short-wavelength light they get at home, and the maths dutifully asked for a
 * 134-fold gain to put it back. Amplifying a channel that has almost no photons in it does not
 * recover the colour — it recovers the noise. A white card came back `#ffcdc8` and a blue wire came
 * back purple, so the whole world went pink.
 *
 * Real eyes do not do that, and the everyday proof is a low-pressure sodium street lamp: under one
 * the world looks orange-grey, NOT colour-corrected, because there is no short-wavelength light to
 * correct with. So the degree of adaptation is set PER CONE, by how much light that cone is actually
 * receiving — shot-noise limited, so the trustworthy fraction goes as the square root, the same rule
 * the discrimination figures already use. A starved channel is left as it arrived rather than
 * amplified, which is why blues under a red sun go dark instead of going violet.
 */
function adaptationMatrix(white: [number, number, number], D: number): number[][] {
	const src = mul3(M_BRAD, white);
	const dst = mul3(M_BRAD, D65);
	const ssum = src[0] + src[1] + src[2];
	const dsum = dst[0] + dst[1] + dst[2];
	// The achromatic part: overall level only, no chromatic correction at all. This is what "no
	// adaptation" means in cone space, and it is bounded, which the old `dst/max(src)` was not.
	const flat = ssum > 0 ? dsum / ssum : 1;
	const diag = [0, 1, 2].map((i) => {
		// This cone's SHARE of the light, here versus at home. Share rather than absolute level: the
		// question is what the light is made of, not how much of it there is.
		const share = ssum > 0 && dst[i] > 0 ? (src[i] / ssum) / (dst[i] / dsum) : 0;
		const trust = Math.min(1, Math.sqrt(Math.max(0, share)));
		const d = D * trust;
		const full = src[i] > 0 ? dst[i] / src[i] : flat;
		return d * full + (1 - d) * flat;
	});
	const scale = [[diag[0], 0, 0], [0, diag[1], 0], [0, 0, diag[2]]];
	return mm3(XYZ_TO_SRGB, mm3(M_BRAD_INV, mm3(scale, M_BRAD)));
}

// Relative luminance weights in linear sRGB — used to drain colour toward grey, not to black.
const LUMA = [0.2126, 0.7152, 0.0722];

/**
 * How much colour survives at a given light level, as a fraction.
 *
 * Rods have no colour and cones stop responding as the light fails, which is why a moonlit landscape
 * is grey however long you look at it. Photopic vision holds down to roughly a thousandth of a
 * daylight scene and is gone by a hundred-thousandth; between those it fades. Venus sits at about a
 * sixtieth, so it stays fully coloured — dim is not the same as grey, and the model should not
 * pretend otherwise.
 */
function coneFraction(brightness: number): number {
	if (brightness >= 1e-3) return 1;
	if (brightness <= 1e-5) return 0;
	return (Math.log10(brightness) + 5) / 2;
}

/** Fold the loss of colour vision at low light into the same 3x3, so it stays one matrix. */
function withConeFraction(M: number[][], f: number): number[][] {
	if (f >= 1) return M;
	const desat = [0, 1, 2].map((i) => [0, 1, 2].map((j) => (i === j ? f : 0) + (1 - f) * LUMA[j]));
	return mm3(desat, M);
}

/** No adaptation at all: the star's cast and brightness left in, scaled so a white reflector under
 *  it reaches display white. */
function rawMatrix(norm: number): number[][] {
	const k = 1 / norm;
	return XYZ_TO_SRGB.map((row) => row.map((v) => v * k));
}

/**
 * Re-light an image through a world's surface spectrum, in place.
 *
 * Every pixel is treated as a REFLECTANCE — which is what a photograph of a lit scene approximately
 * is, once you accept that it was lit by daylight to begin with. That assumption is the honest
 * weakness here and it is stated on the page: a photograph already contains its original
 * illuminant, so this is "the same surfaces under a different sun", not a simulation of the scene.
 */
export function relightImage(
	data: Uint8ClampedArray, op: LightOperator, adapt: boolean, brightness = 1
): void {
	const { white, lobes, norm } = op;
	const base = adapt ? adaptationMatrix(white, 0.75) : rawMatrix(norm);
	const M = withConeFraction(base, coneFraction(brightness));
	for (let i = 0; i < data.length; i += 4) {
		if (data[i + 3] === 0) continue;
		const [w, wr, wg, wb] = basisWeights(
			toLinear(data[i] / 255), toLinear(data[i + 1] / 255), toLinear(data[i + 2] / 255));
		// XYZ of (reflectance x light), assembled from the four precomputed responses.
		const X = w * white[0] + wr * lobes[0][0] + wg * lobes[1][0] + wb * lobes[2][0];
		const Y = w * white[1] + wr * lobes[0][1] + wg * lobes[1][1] + wb * lobes[2][1];
		const Z = w * white[2] + wr * lobes[0][2] + wg * lobes[1][2] + wb * lobes[2][2];
		let r = M[0][0] * X + M[0][1] * Y + M[0][2] * Z;
		let g = M[1][0] * X + M[1][1] * Y + M[1][2] * Z;
		let b = M[2][0] * X + M[2][1] * Y + M[2][2] * Z;
		// Out-of-gamut repair, as everywhere else: desaturate toward the luminance it already has
		// rather than clipping a vivid colour to black.
		const lo = Math.min(r, g, b);
		if (lo < 0) { r -= lo; g -= lo; b -= lo; }
		const hi = Math.max(r, g, b, 1e-9);
		// Gamut repair first, then the real light level — dimming must not be undone by the rescale.
		const k = (hi > 1 ? 1 / hi : 1) * brightness;
		data[i] = Math.round(toSrgb(r * k) * 255);
		data[i + 1] = Math.round(toSrgb(g * k) * 255);
		data[i + 2] = Math.round(toSrgb(b * k) * 255);
	}
}

let HOME: LightOperator | null = null;

/**
 * HOME — the light everything else is quoted against, and it is Earth's OWN midday.
 *
 * Not a bare 5778 K blackbody, which was the earlier stand-in: that is the light above the air, and
 * comparing a ground-level spectrum against it made Earth itself read as 1.23 of Earth. Running the
 * same derivation on Earth's own sky costs one call, is memoised, and makes the reference honest —
 * Earth reads exactly 1 because it is the same quantity measured the same way.
 */
export function homeDaylight(): LightOperator {
	if (HOME) return HOME;
	const earth = {
		id: 'earth-reference', kind: 'body', name: 'Earth', roleHint: 'planet',
		makeup: { rock: 0.7, metal: 0.3 }, calculatedGravity_ms2: EARTH_GRAVITY,
		atmosphere: {
			pressure_bar: 1, molarMassKg: 0.02896,
			composition: { N2: 0.78, O2: 0.21, Ar: 0.009, CO2: 0.0004, H2O: 0.004 }
		}
	} as unknown as CelestialBody;
	// The rule pack is deliberately NOT passed: home has to stay put even if a GM edits their gases.
	const r = deriveSurfaceSpectrum(earth, { starTempK: 5778, luminositySolar: 1, distanceAU: 1 }, null);
	HOME = lightOperator(r?.curves.surface ?? blackbodySpectrum(5778, 1000 * gridShare(5778)));
	return HOME;
}

/**
 * HOW BRIGHT this world's midday is, against a reference — Earth's own noon, so it reads 1.
 *
 * It is the illuminant's own Y, which the operator already carries, and Y is the photopic luminance
 * because the y-bar curve IS the luminous efficiency function. That distinction is the whole point on
 * a world like Venus: a FIFTH of the star's energy reaches the ground there, but the surviving light
 * peaks at 920 nm, so only about a SIXTIETH of the visible light does. Quoting the energy would say
 * "dim"; quoting the luminance says "you would want the lights on", which is the true answer.
 */
export function brightnessVs(op: LightOperator, reference: LightOperator): number {
	return reference.white[1] > 0 ? op.white[1] / reference.white[1] : 1;
}

/** A familiar comparison for a light level, because a percentage means nothing at a table. */
export function brightnessWords(ratio: number): string {
	if (ratio >= 0.6) return 'a clear day at home';
	if (ratio >= 0.2) return 'a bright overcast day';
	if (ratio >= 0.05) return 'a dull overcast day';
	if (ratio >= 0.01) return 'heavy overcast — you would want the lights on';
	if (ratio >= 2e-3) return 'twilight, just after sunset';
	if (ratio >= 2e-4) return 'deep twilight';
	if (ratio >= 2e-6) return 'a night under a full moon';
	return 'starlight';
}

/** One colour through a world's light — the same maths as a pixel, for a swatch or a label. */
export function colourUnderOperator(hexOrRgb: [number, number, number], op: LightOperator, adapt: boolean): string {
	const d = new Uint8ClampedArray([hexOrRgb[0], hexOrRgb[1], hexOrRgb[2], 255]);
	relightImage(d, op, adapt);
	const h = (v: number) => v.toString(16).padStart(2, '0');
	return `#${h(d[0])}${h(d[1])}${h(d[2])}`;
}

/**
 * HOW CONFUSABLE two colours become under this light — the "cut the red wire" number.
 *
 * Measured AFTER adaptation, because that is the fair test: an overall orange cast is something a
 * person adjusts to within the hour, whereas two colours that the light cannot tell apart stay
 * indistinguishable however long they stand there. Returned as a rough perceptual distance, with the
 * SAME pair under daylight as the reference — so it says "half as distinguishable as at home"
 * rather than an abstract number.
 */
export function confusability(
	a: [number, number, number], b: [number, number, number], op: LightOperator, daylight: LightOperator
): number {
	// THE SHOT-NOISE LIMIT NOW LIVES IN THE ADAPTATION, NOT HERE.
	//
	// This used to weight each channel by sqrt(light here / light at home), because the first version
	// compared two adapted colours directly and reported "as distinguishable as at home" under an M
	// dwarf — plainly false, and the cause was that adaptation was modelled as NOISELESS and would
	// amplify a channel with almost no photons in it back to full strength.
	//
	// That amplification is now bounded where it belongs, inside `adaptationMatrix`: a cone class
	// that is starved of light is left as it arrived rather than gained up. The two colours therefore
	// converge on their own, and weighting the difference a second time would count the same physics
	// twice — it made every dim world read as more confusing than it is.
	const ch = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
	const dist = (o: LightOperator) => {
		const [r1, g1, b1] = ch(colourUnderOperator(a, o, true));
		const [r2, g2, b2] = ch(colourUnderOperator(b, o, true));
		// Rough perceptual weighting — greens count for more to the human eye than blues do.
		return Math.sqrt(2 * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + 3 * (b1 - b2) ** 2);
	};
	const home = dist(daylight);
	return home > 0 ? Math.min(1, dist(op) / home) : 1;
}
