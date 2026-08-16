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
import { GRID_NM, basisWeights, spectrumToXyz, BASIS_LOBES, type Spectrum } from './spectrum';

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
 */
function adaptationMatrix(white: [number, number, number], D: number): number[][] {
	const src = mul3(M_BRAD, white);
	const dst = mul3(M_BRAD, D65);
	const diag = [0, 1, 2].map((i) => {
		const full = src[i] !== 0 ? dst[i] / src[i] : 0;
		// Toward 1 as the eye gives up adapting; but 1 in CONE space means "leave it as it arrived",
		// so the unadapted end still needs the overall brightness scale, applied by the caller.
		return D * full + (1 - D) * (dst[i] / Math.max(1e-9, Math.max(...src)));
	});
	const scale = [[diag[0], 0, 0], [0, diag[1], 0], [0, 0, diag[2]]];
	return mm3(XYZ_TO_SRGB, mm3(M_BRAD_INV, mm3(scale, M_BRAD)));
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
export function relightImage(data: Uint8ClampedArray, op: LightOperator, adapt: boolean): void {
	const { white, lobes, norm } = op;
	const M = adapt ? adaptationMatrix(white, 0.75) : rawMatrix(norm);
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
		const k = hi > 1 ? 1 / hi : 1;
		data[i] = Math.round(toSrgb(r * k) * 255);
		data[i + 1] = Math.round(toSrgb(g * k) * 255);
		data[i + 2] = Math.round(toSrgb(b * k) * 255);
	}
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
	// CHANNEL BY CHANNEL, WEIGHTED BY HOW MUCH LIGHT THERE IS IN THAT CHANNEL.
	//
	// This is the correction that made the measure mean anything. Comparing the two adapted colours
	// directly said "as distinguishable as at home" under an M dwarf, which is plainly false — and the
	// reason is that the model is NOISELESS. Adaptation will happily amplify a channel with almost no
	// photons in it and hand back a clean number, but an eye cannot: discrimination is shot-noise
	// limited, so the signal-to-noise in a channel goes as the SQUARE ROOT of the light arriving in
	// it. Starve the short wavelengths by a hundred and blue discrimination drops by ten, which is
	// why you cannot tell navy from black by candlelight however long you stare.
	//
	// So each channel's contribution is scaled by sqrt(light here / light at home) in that channel.
	// Nothing is invented: the per-channel light is the illuminant's own tristimulus, which the
	// operator already carries.
	const snr = [0, 1, 2].map((i) => {
		const home = daylight.white[i] / daylight.norm;
		const here = op.white[i] / op.norm;
		return home > 0 ? Math.min(1, Math.sqrt(Math.max(0, here) / home)) : 1;
	});
	const ch = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
	const dist = (o: LightOperator, weight: number[]) => {
		const [r1, g1, b1] = ch(colourUnderOperator(a, o, true));
		const [r2, g2, b2] = ch(colourUnderOperator(b, o, true));
		// Rough perceptual weighting — greens count for more to the human eye than blues do.
		return Math.sqrt(
			2 * ((r1 - r2) * weight[0]) ** 2 +
			4 * ((g1 - g2) * weight[1]) ** 2 +
			3 * ((b1 - b2) * weight[2]) ** 2);
	};
	const home = dist(daylight, [1, 1, 1]);
	return home > 0 ? Math.min(1, dist(op, snr) / home) : 1;
}
