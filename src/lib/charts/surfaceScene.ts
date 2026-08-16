// STANDING ON IT — a view of THIS world, built from what the engine already derived about it.
//
// The stock landscape this replaces was an Earth: blue sky, green trees, a blue sea, on every world
// in the catalogue. It made the wipe measure the model rather than the planet, because the surfaces
// being compared were not the planet's surfaces.
//
// TWO LAYERS, AND THE SPLIT IS PHYSICAL, not a drawing convenience:
//
//   MATERIALS — ground, water, plants, the buildings. These are REFLECTANCES, painted from the
//   authored colour (`rawHex`) and never from the already-lit `hex`. The re-lighting operator turns
//   them into what they look like here, which is exactly what the right-hand side of the wipe is
//   for. Paint them pre-lit and the "at home" side shows the world under its OWN sun, which is not
//   a comparison at all.
//
//   LIGHT — the sky and the star. These are not reflectances; nothing is bouncing off them. They are
//   painted directly in their final colour and are NOT passed through the operator, because doing so
//   would ask what a sky looks like when lit by itself. An airless world's sky is black, and black
//   is black under any star.
//
// The depth markers are the third idea and they are the point of the view: a row of identical posts
// at known distances, each veiled by AIRLIGHT — the scattered light between you and it. Airlight is
// added light, so it goes on AFTER the materials are lit, which is why it is painted over the
// composite rather than mixed into the material layer. Far enough out the marker is pure sky and it
// is simply gone, which is the honest picture of what "the air gives out at 4 km" means.
import type { CelestialBody, RulePack } from '$lib/types';
import { GRID_NM, spectrumToHex, wavelengthHex, gridShare, type Spectrum } from '$lib/physics/spectrum';
import { deriveVisibility, distanceWords, type Visibility } from '$lib/physics/visibility';

/**
 * WHAT THE GROUND IS SHAPED LIKE, read off the tags the engine already derived.
 *
 * None of this is a new judgement about the world — every flag is a tag that some earlier pass
 * committed to. A surface that is ancient and geologically dead has kept every crater it ever took,
 * because nothing has resurfaced it; a young one has not. That is the same reasoning the age tag was
 * emitted from, spent rather than repeated.
 */
export interface Motifs {
	craters: number;      // 0..1 — how thoroughly cratered
	peaks: boolean;       // folded mountains: something is still moving the crust
	volcanoes: boolean;
	cryo: boolean;        // ice volcanism — plumes rather than cones
	ice: boolean;
	dunes: boolean;
	lava: boolean;        // molten enough to glow, which is EMISSION and drawn as such
}

export interface SurfaceScene {
	groundHex: string;
	rockHex: string;
	waterHex: string | null;
	/** Every morphology that shows a colour, painter-ordered — a world's mats and its trees need not
	 *  have settled on the same pigment, and showing only the winner threw that away. */
	plants: { hex: string; coverage: number }[];
	/** How much of the land carries something that lights up at night. */
	settled: number;
	skyLowHex: string;
	skyHighHex: string;
	starHex: string;
	/** Angular radius of the star relative to the Sun seen from Earth. 1 = ours. */
	starSize: number;
	airless: boolean;
	/** 0..1 of the sky that is deck. Hides the star and greys the airlight. */
	cloudCover: number;
	motifs: Motifs;
	seed: number;
	sight: Visibility;
	/** The ladder of distances the markers stand at, nearest first. */
	marks: number[];
}

/**
 * How big the star looks, against the Sun from Earth.
 *
 * Flux at the body is F = R²σT⁴/d², so the angular radius R/d works out as sqrt(F/σ)/T² — the star's
 * own radius cancels, which is what makes this derivable from a summary that never recorded it.
 * Mercury's sun is two and a half times ours across; Jupiter's is a fifth.
 */
function angularSize(body: CelestialBody): number {
	const s = body.surfaceSpectrum;
	if (!s?.starTempK || !(s.totalTopWm2 > 0)) return 1;
	const share = gridShare(s.starTempK);
	if (!(share > 0)) return 1;
	const bolometric = s.totalTopWm2 / share;           // the grid holds only part of the curve
	const ours = Math.sqrt(1361) / (5778 * 5778);
	return Math.sqrt(bolometric) / (s.starTempK * s.starTempK) / ours;
}

/** Deterministic per world: the same planet is the same place every time you look at it. */
function seedOf(id: string): number {
	let h = 2166136261;
	for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
	return h >>> 0;
}
function rng(seed: number) {
	let a = seed || 1;
	return () => { a |= 0; a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function motifsFrom(body: CelestialBody): Motifs {
	const tags = body.tags ?? [];
	const has = (k: string) => tags.some((t) => t.key === k);
	const starts = (p: string) => tags.some((t) => t.key.startsWith(p));
	const val = (k: string) => tags.find((t) => t.key === k)?.value;
	const age = val('surface/age');
	// A dead ancient surface keeps everything that ever hit it. Plate tectonics, volcanism and ice
	// all erase craters, which is why Earth has a handful and the Moon has nothing but.
	const resurfaced = has('geology/plate-tectonics') || has('geology/volcanic-tidal') || starts('activity/cryovolcan');
	const craters = age === 'ancient' ? (resurfaced ? 0.35 : 1) : age === 'moderate' ? 0.45 : 0.12;
	return {
		craters,
		peaks: has('geology/plate-tectonics'),
		volcanoes: has('geology/volcanic-tidal') || has('geology/episodic'),
		cryo: has('geology/cryovolcanic') || has('activity/cryovolcanism'),
		ice: has('climate/polar-ice') || has('structure/icy-shell') || starts('volatiles/ices'),
		dunes: has('weather/dust-storms'),
		lava: has('geology/volcanic-tidal')
	};
}

const hexToRgb = (hex: string): [number, number, number] => {
	const v = parseInt(hex.slice(1), 16);
	return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const rgbToHex = (c: number[]) =>
	'#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
/** Dim in LINEAR light and re-encode, which is what `relightImage` does to the material layer. Doing
 *  it on the sRGB numbers instead would dim the sky on a different curve from the ground. */
export function dimHex(hex: string, k: number): string {
	if (k >= 1) return hex;
	const lin = (u: number) => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
	const enc = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
	return rgbToHex(hexToRgb(hex).map((c) => 255 * enc(Math.max(0, lin(c / 255) * k))));
}
const shade = (hex: string, t: number) => rgbToHex(mix(hexToRgb(hex), t < 0 ? [0, 0, 0] : [255, 255, 255], Math.abs(t)));

/** A palette stop's MATERIAL colour, falling back to its appearance when nothing recorded the raw. */
function material(body: CelestialBody, role: string): string | null {
	const stop = (body.apparentColor?.palette ?? []).filter((p) => p.role === role).slice(-1)[0];
	return stop ? (stop.rawHex ?? stop.hex) : null;
}

/**
 * THE SKY'S OWN COLOUR — airlight, which is the light scattered INTO your line of sight.
 *
 * It is the light available down here weighted by how strongly the air scatters each wavelength,
 * and Rayleigh scattering goes as λ⁻⁴. That single factor is why Earth's sky is blue: our air
 * scatters the short end hardest and there is plenty of short end to scatter. It is also why Venus's
 * is not — λ⁻⁴ cannot recover blue that never made it down, so ninety bar of carbon dioxide leaves
 * an ochre sky, which is what Venera photographed.
 *
 * A world with no air has no airlight and therefore a black sky at noon, with the star a hard disc
 * in it. That is not a special case in the drawing — it is what this returns when there is no
 * atmosphere to scatter.
 */
/**
 * HOW BRIGHT the sky is, 0..1 — which is a different question from what colour it is, and leaving it
 * out was why Mercury and Mars had Earth's blue overhead.
 *
 * `spectrumToHex` is display-referred: it normalises, so it answers "what HUE is the scattered light"
 * and cheerfully returns a fully saturated blue for an atmosphere that scatters a millionth of a
 * percent. Mercury holds about 1e-11 bar and was being given the same sky as Earth.
 *
 * The brightness is the share of the beam that gets scattered rather than passing straight through,
 * which saturates: once a sky is optically thick it cannot get any more sky-like. Cloud counts for
 * far more than clear air per unit depth, because a droplet deck is a near-perfect diffuser.
 *
 *   Mercury  tau ~1e-12          -> 0.000   black, stars at noon
 *   Mars     tau  0.0025         -> 0.003   all but black, a faint glow — the butterscotch everyone
 *                                           pictures is DUST, which this model does not scatter yet
 *   Earth    tau  0.10 + cloud   -> 0.73    a proper blue sky
 *   Venus    tau  16   + cloud   -> 1.00    a solid luminous lid
 */
function skyStrength(gasTau: number, dustTau: number, cloudCover: number): number {
	return 1 - Math.exp(-(gasTau + dustTau + 4 * cloudCover));
}

function airlightHex(surface: Spectrum | null, airless: boolean, cloudCover: number): string {
	if (airless || !surface) return '#05070c';
	// CLEAR AIR: the light down here weighted by how hard the air scatters each wavelength.
	const clear = surface.map((v, i) => v * Math.pow(550 / GRID_NM[i], 4));
	// OVERCAST: you are not looking at the air, you are looking at the LIT UNDERSIDE OF A CLOUD, and
	// what that glows with is the light coming through it — which is the surface spectrum itself,
	// since a deck's extinction is already in it. No λ⁻⁴, because a droplet far larger than the
	// wavelength scatters every colour alike; that is why an overcast day is grey and not blue.
	//
	// Leaving this out was why every world with air had a blue sky: λ⁻⁴ hands the short end a factor
	// of several hundred across the grid, so it wins wherever there is any blue left at all — and
	// nothing was allowed to overrule it. Jupiter has 90% ammonia cover at its 1 bar level and was
	// being shown the sky of the clear hydrogen above the cloud.
	const overcast = surface;
	const t = Math.max(0, Math.min(1, cloudCover));
	return rgbToHex(mix(hexToRgb(spectrumToHex(clear)), hexToRgb(spectrumToHex(overcast)), t));
}

/**
 * Where to stand the depth markers.
 *
 * Log-spaced from arm's length out to a little past where the air gives up, so the ladder always
 * straddles the interesting part rather than being five posts that are all perfectly clear (which is
 * what a fixed 10/50/200 m ladder gives you on any world with decent air). Capped at the horizon,
 * because nothing is visible past that however clean the air is.
 */
function markLadder(sight: Visibility): number[] {
	const far = Math.min(sight.horizonM, isFinite(sight.rangeM) ? sight.rangeM * 1.4 : sight.horizonM);
	const near = 8;
	if (!(far > near)) return [near];
	const out: number[] = [];
	for (let i = 0; i < 5; i++) {
		const d = near * Math.pow(far / near, i / 4);
		// Round to something a GM can say out loud.
		const mag = Math.pow(10, Math.floor(Math.log10(d)));
		out.push(Math.max(near, Math.round(d / (mag / 2)) * (mag / 2)));
	}
	return [...new Set(out)];
}

export function surfaceSceneFor(
	body: CelestialBody | null, pack: RulePack | null | undefined, surfaceLight: Spectrum | null
): SurfaceScene | null {
	if (!body) return null;
	const sight = deriveVisibility(body, pack);
	const airless = !(body.atmosphere?.pressure_bar && body.atmosphere.pressure_bar > 0);
	const ground = material(body, 'surface') ?? '#8b7d6b';
	const water = material(body, 'ocean');
	// EVERY morphology that shows a colour, not just the winner. A world's microbial mats and its
	// canopy score the pigments separately and often disagree, which is the whole reason the pigment
	// model ships a ranked set instead of one answer — so the view shows what is actually down there.
	const layers = body.vegetation?.layers ?? [];
	const plants = layers
		.filter((l) => l.colorHex && l.coverage > 0.01)
		.map((l) => ({ hex: l.colorHex as string, coverage: Math.min(1, l.coverage) }));
	// Anything that glows at night is somebody's doing. It gets a lit window.
	const settled = layers.reduce((m, l) => (l.light > 0 ? Math.max(m, l.coverage) : m), 0);
	// How much of the sky is deck. Decks overlap, so the thickest wins rather than the sum.
	const cloudCover = (body.apparentColor?.palette ?? [])
		.filter((p) => p.role === 'cloud')
		.reduce((m, p) => Math.max(m, p.weight), 0);
	// A sky you cannot see is not a sky. Whether stars come out at noon is this, not a pressure test:
	// Mercury's trace exosphere is technically an atmosphere and scatters nothing.
	const strength = airless ? 0 : skyStrength(sight.gasTau, sight.dustTau, cloudCover);
	const noSky = strength < 0.005;
	// SUSPENDED DUST IS THE GROUND, AIRBORNE — so it lends the sky the ground's own colour rather than
	// a scattering law's. That is the whole of why Mars's sky is butterscotch and not the very dark
	// blue its six millibars of carbon dioxide would give on their own: you are looking at lit
	// iron-oxide fines, not at air. Nothing new is authored for it; it is the surface material.
	const dustShare = sight.dustTau / Math.max(1e-9, sight.dustTau + sight.gasTau);
	const scattered = airlightHex(surfaceLight, noSky, cloudCover);
	const sky = dimHex(
		noSky ? scattered : rgbToHex(mix(hexToRgb(scattered), hexToRgb(ground), dustShare)),
		strength);
	return {
		groundHex: ground,
		rockHex: shade(ground, -0.28),
		waterHex: water,
		plants,
		settled,
		// The horizon is brighter than the zenith because you are looking through more air — but only
		// where there is air enough for that to mean anything.
		skyLowHex: noSky ? '#05070c' : shade(sky, 0.34 * strength),
		skyHighHex: noSky ? '#05070c' : sky,
		// THE STAR'S OWN COLOUR AND SIZE, both derived rather than assumed.
		//
		// Colour is the direct beam as it ARRIVES — which is the surface spectrum, since that is
		// exactly the starlight after the sky has had its cut. So a red dwarf's disc is red, and the
		// Sun seen from Venus's ground would be a deep ember if you could see it.
		//
		// Size needs no new data either. Flux F = R^2*sigma*T^4/d^2, so the angular radius R/d is
		// sqrt(F/sigma)/T^2 — the star's radius cancels out. Both terms are already on the summary.
		starHex: surfaceLight ? spectrumToHex(surfaceLight) : '#fff6e0',
		starSize: angularSize(body),
		airless: noSky,
		cloudCover,
		motifs: motifsFrom(body),
		seed: seedOf(body.id ?? body.name ?? 'world'),
		sight,
		marks: markLadder(sight)
	};
}

// ── Drawing ──────────────────────────────────────────────────────────────────────────────────────
// `sky` and `mat` are two contexts of the same size. Everything painted into `mat` is a reflectance
// and will be re-lit; `mat` starts transparent, and relightImage() skips transparent pixels, so the
// composite needs no masking of its own.

const HORIZON_Y = 0.52;

/** The sky, the star, and nothing else — never re-lit. */
export function drawSky(
	ctx: CanvasRenderingContext2D, W: number, H: number, s: SurfaceScene, brightness = 1
) {
	const hy = H * HORIZON_Y;
	// THE SKY DIMS TOO. It is scattered sunlight, not a backdrop — asked for the real light level, the
	// ground went black under a sky that stayed broad daylight. It comes out brighter than the ground
	// anyway, and for the right reason: the ground only returns a fraction of what lands on it, while
	// the sky IS the source. That contrast is a result here, not a fudge.
	const high = dimHex(s.skyHighHex, brightness), low = dimHex(s.skyLowHex, brightness);
	const g = ctx.createLinearGradient(0, 0, 0, hy);
	g.addColorStop(0, high);
	g.addColorStop(1, low);
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, W, hy);
	// The star. On an airless world it is a hard disc against black; through air it wears a glow,
	// because the same scattering that colours the sky also smears the source.
	//
	// AND UNDER A THICK ENOUGH DECK IT IS NOT THERE AT ALL. Nobody standing on Venus has ever seen the
	// Sun: 92 bar of overcast turns it into a uniformly bright sky with no disc in it. Drawing one
	// anyway was the giveaway that the star and the weather were not talking to each other.
	//
	// THE STAR IS NEVER SIMPLY ABSENT. Cloud does not delete a sun, it SPREADS it: under a thick deck
	// you cannot find a disc but you can always tell which way it is, because that part of the sky is
	// brighter. The first version hid it outright past a coverage threshold, which lost Venus its sun
	// on both sides of the wipe and lost the viewer the one cue that says where the light comes from.
	// So cover turns a disc into a glare patch — wider, softer, never gone.
	//
	// Size is the real angular size, scaled up to be visible: the Sun from Earth is half a degree
	// across and would be a single pixel at this scale. The RATIOS are true, which is the part that
	// carries a table — a red dwarf's sun fills the sky and Jupiter's is a bright star.
	const sx = W * 0.79, sy = hy * 0.32;
	const r = Math.max(2.5, H * 0.030 * Math.sqrt(Math.max(0.01, s.starSize)));
	const spread = 1 + 7 * s.cloudCover * s.cloudCover;
	// The disc's own brightness far exceeds the sky's, so it survives dimming the sky does not —
	// which is why you can still find a low sun in deep twilight.
	const lit = dimHex(s.starHex, Math.min(1, brightness * 12 + 0.06));
	const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 5 * spread);
	glow.addColorStop(0, lit);
	glow.addColorStop(0.25, high);
	glow.addColorStop(1, 'rgba(0,0,0,0)');
	ctx.globalAlpha = s.airless ? 0 : 0.5 + 0.4 * (1 - s.cloudCover);
	ctx.fillStyle = glow;
	ctx.beginPath(); ctx.arc(sx, sy, r * 5 * spread, 0, 7); ctx.fill();
	ctx.globalAlpha = 1;
	// A hard disc only where the air is clear enough to have one.
	const disc = Math.max(0, 1 - s.cloudCover * 1.4);
	if (disc > 0.02) {
		ctx.globalAlpha = disc;
		ctx.fillStyle = lit;
		ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fill();
		ctx.globalAlpha = 1;
	}
	if (s.airless) {
		// No air to scatter, so no twilight and no washed-out stars: the sky stays black to the horizon.
		ctx.fillStyle = 'rgba(255,255,255,0.75)';
		for (let i = 0; i < 40; i++) {
			const x = ((i * 137.5) % 100) / 100 * W, y = ((i * 61.8) % 100) / 100 * hy;
			ctx.fillRect(x, y, 1, 1);
		}
	}
}

/** Ground, water, plants and the reference blocks — all reflectances, all re-lit. */
export function drawMaterials(ctx: CanvasRenderingContext2D, W: number, H: number, s: SurfaceScene) {
	const hy = H * HORIZON_Y;
	// The ground, receding. Darker near the horizon is not shading — it is the same surface seen at a
	// glancing angle, which is genuinely how a plain reads.
	const g = ctx.createLinearGradient(0, hy, 0, H);
	g.addColorStop(0, shade(s.groundHex, -0.18));
	g.addColorStop(1, s.groundHex);
	ctx.fillStyle = g;
	ctx.fillRect(0, hy, W, H - hy);

	const rand = rng(s.seed);
	const m = s.motifs;

	// The skyline. Folded mountains are sharp because something is still pushing them up; everywhere
	// else the horizon is the low, worn line of a surface nothing has renewed.
	ctx.fillStyle = s.rockHex;
	ctx.beginPath(); ctx.moveTo(0, hy);
	for (let x = 0; x <= W; x += 8) {
		const worn = Math.sin(x / 97) * H * 0.05 + Math.sin(x / 29) * H * 0.014;
		const sharp = m.peaks ? Math.pow(Math.abs(Math.sin(x / 61 + 1.2)), 0.6) * H * 0.14 : 0;
		ctx.lineTo(x, hy - worn - sharp);
	}
	ctx.lineTo(W, hy + 2); ctx.lineTo(0, hy + 2); ctx.fill();

	// Volcanic cones sit ON the skyline, so they read as landscape rather than as furniture.
	if (m.volcanoes || m.cryo) {
		for (let i = 0; i < 2; i++) {
			const x = W * (0.18 + 0.5 * rand()), h = H * (0.09 + 0.05 * rand());
			ctx.fillStyle = m.cryo ? shade(s.rockHex, 0.3) : shade(s.rockHex, -0.35);
			ctx.beginPath();
			ctx.moveTo(x - h * 1.5, hy); ctx.lineTo(x, hy - h); ctx.lineTo(x + h * 1.5, hy);
			ctx.fill();
		}
	}

	// DUNES. Drawn as long shallow crescents rather than stripes, because that is what makes a plain
	// read as sand instead of as carpet.
	if (m.dunes) {
		ctx.fillStyle = shade(s.groundHex, 0.12);
		for (let i = 0; i < 14; i++) {
			const y = hy + (H - hy) * (0.06 + 0.9 * rand());
			const x = rand() * W, w = W * (0.12 + 0.22 * rand());
			ctx.beginPath();
			ctx.ellipse(x, y, w, Math.max(2, (y - hy) * 0.07), 0, Math.PI, 0);
			ctx.fill();
		}
	}

	// CRATERS. Lit rim toward the star, shadowed rim away from it, dark floor — the three marks that
	// make a circle read as a hole rather than as a disc. Count and size fall off with distance so
	// the plain has depth.
	if (m.craters > 0.05) {
		const n = Math.round(4 + 34 * m.craters);
		for (let i = 0; i < n; i++) {
			const t = rand();
			const y = hy + (H - hy) * (0.04 + 0.94 * t * t);
			const r = Math.max(2, (H - hy) * (0.03 + 0.11 * rand()) * (0.25 + t));
			const x = rand() * W;
			ctx.fillStyle = shade(s.groundHex, -0.22);
			ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.34, 0, 0, 7); ctx.fill();
			ctx.fillStyle = shade(s.groundHex, 0.2);
			ctx.beginPath(); ctx.ellipse(x, y - r * 0.09, r, r * 0.32, 0, Math.PI, 0); ctx.fill();
			ctx.fillStyle = shade(s.groundHex, -0.4);
			ctx.beginPath(); ctx.ellipse(x, y + r * 0.04, r * 0.74, r * 0.22, 0, 0, 7); ctx.fill();
		}
	}

	// Ice, where it survives: banked against the far ground and scattered as frost nearer to.
	if (m.ice) {
		ctx.fillStyle = shade(s.groundHex, 0.72);
		ctx.fillRect(0, hy, W, (H - hy) * 0.1);
		for (let i = 0; i < 16; i++) {
			const y = hy + (H - hy) * (0.1 + 0.85 * rand());
			ctx.beginPath();
			ctx.ellipse(rand() * W, y, (H - hy) * (0.03 + 0.08 * rand()), (y - hy) * 0.06 + 2, 0, 0, 7);
			ctx.fill();
		}
	}

	// Water, only if this world has any.
	if (s.waterHex) {
		ctx.fillStyle = s.waterHex;
		ctx.fillRect(0, H * 0.86, W, H * 0.14);
	}

	// LIFE, every layer of it, in the pigment each morphology actually settled on. Painter order:
	// the array is deepest first, so mats go down before whatever grows on top of them.
	s.plants.forEach((p, li) => {
		ctx.fillStyle = p.hex;
		const n = Math.round(5 + 40 * p.coverage);
		for (let i = 0; i < n; i++) {
			const y = hy + 4 + (H - hy) * 0.62 * rand();
			const x = rand() * W;
			const h = ((y - hy) / (H - hy)) * (H - hy) * 0.22 + 4;
			if (li === 0 && s.plants.length > 1) {
				// The deepest layer is a mat: it lies flat rather than standing up.
				ctx.beginPath(); ctx.ellipse(x, y, h * 0.9, h * 0.28, 0, 0, 7); ctx.fill();
			} else {
				ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + h * 0.36, y); ctx.lineTo(x - h * 0.36, y); ctx.fill();
			}
		}
	});

	// THE REFERENCE BLOCKS. Primary-coloured because that is what makes a light's failure legible:
	// a red and a green block that look the same is a fact you can act on. They are human-made and
	// their colours are known, which is what lets them be a reference at all.
	const BLOCKS = ['#c4262b', '#2f8f3a', '#2a5fb0', '#e0c72a', '#e8e8e8'];
	BLOCKS.forEach((hex, i) => {
		const x = W * (0.05 + i * 0.135), y = H * 0.63, w = W * 0.085, h = H * 0.17;
		ctx.fillStyle = hex;
		ctx.fillRect(x, y, w, h);
		ctx.fillStyle = shade(hex, -0.3);
		ctx.fillRect(x, y + h * 0.72, w, h * 0.28);
	});

	// A settlement, if anything here builds. The STRUCTURE is a reflectance and belongs in this
	// layer; the light in its windows does not, and is drawn in the emissive pass below.
	if (s.settled > 0.01) {
		ctx.fillStyle = shade(s.rockHex, 0.16);
		const n = Math.min(7, 1 + Math.round(s.settled * 8));
		for (let i = 0; i < n; i++) {
			const x = W * (0.60 + 0.34 * (i / Math.max(1, n - 1))) - 8;
			const h = H * (0.10 + 0.13 * ((i * 7919) % 5) / 5);
			ctx.fillRect(x, hy + (H - hy) * 0.16 - h, W * 0.035, h);
		}
	}
}

/**
 * EMISSION — lava and lit windows.
 *
 * These make their own light, so they are neither reflectances nor airlight: re-lighting them would
 * ask what a lamp looks like under a red sun, and the answer is that it looks like the lamp. They go
 * on the composite unchanged, which is also why a settlement reads the same on both sides of the
 * wipe while everything around it changes — and that contrast is the point.
 */
export function drawEmissive(ctx: CanvasRenderingContext2D, W: number, H: number, s: SurfaceScene) {
	const hy = H * HORIZON_Y;
	const rand = rng(s.seed ^ 0x5f3a);
	if (s.motifs.lava) {
		for (let i = 0; i < 9; i++) {
			const y = hy + (H - hy) * (0.1 + 0.8 * rand()), x = rand() * W;
			const r = (H - hy) * (0.02 + 0.05 * rand());
			const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
			g.addColorStop(0, 'rgba(255,190,90,0.95)');
			g.addColorStop(0.35, 'rgba(226,88,26,0.55)');
			g.addColorStop(1, 'rgba(226,88,26,0)');
			ctx.fillStyle = g;
			ctx.beginPath(); ctx.arc(x, y, r * 3, 0, 7); ctx.fill();
		}
	}
	if (s.settled > 0.01) {
		const n = Math.min(7, 1 + Math.round(s.settled * 8));
		for (let i = 0; i < n; i++) {
			const x = W * (0.60 + 0.34 * (i / Math.max(1, n - 1))) - 8;
			const h = H * (0.10 + 0.13 * ((i * 7919) % 5) / 5);
			const top = hy + (H - hy) * 0.16 - h;
			ctx.fillStyle = '#ffd98a';
			for (let r0 = 0; r0 < Math.max(1, Math.floor(h / 9)); r0++) {
				for (let c = 0; c < 2; c++) {
					if (((i + r0 + c) * 2654435761) % 5 === 0) continue;
					ctx.fillRect(x + 3 + c * (W * 0.014), top + 4 + r0 * 9, W * 0.008, 4);
				}
			}
		}
	}
}

/**
 * THE SPECTRUM, up both edges — the quick reference that says WHY everything else looks how it does.
 *
 * Each band runs 380 nm at the bottom to 700 nm at the top, coloured by the wavelength and dimmed by
 * how much power the light actually has there. Left is home, right is this world. Venus's band goes
 * black below about 550 nm, and that black stripe is the entire explanation for why a blue wire down
 * there is a dark grey one.
 *
 * Each band is normalised to ITS OWN peak, so what is being compared is SHAPE — which wavelengths
 * survive — and not brightness. Brightness has its own control and its own readout.
 */
export function drawSpectrumEdges(
	ctx: CanvasRenderingContext2D, W: number, H: number, home: number[], there: number[] | null
) {
	const band = (x: number, spec: number[] | null) => {
		if (!spec) return;
		let peak = 0;
		for (let i = 0; i < GRID_NM.length; i++) {
			if (GRID_NM[i] >= 380 && GRID_NM[i] <= 700) peak = Math.max(peak, spec[i]);
		}
		if (!(peak > 0)) return;
		for (let y = 0; y < H; y++) {
			const nm = 700 - (y / H) * 320;
			const i = Math.round((nm - GRID_NM[0]) / (GRID_NM[1] - GRID_NM[0]));
			const p = Math.max(0, Math.min(1, (spec[i] ?? 0) / peak));
			const c = hexToRgb(wavelengthHex(nm));
			// Square-root, because the eye judges a band of light by something much closer to its
			// square root than to its power — a linear ramp reads as almost entirely black.
			ctx.fillStyle = rgbToHex(c.map((v) => v * Math.sqrt(p)));
			ctx.fillRect(x, y, EDGE_W, 1);
		}
		ctx.strokeStyle = 'rgba(255,255,255,0.25)';
		ctx.lineWidth = 1;
		ctx.strokeRect(x + 0.5, 0.5, EDGE_W - 1, H - 1);
	};
	band(0, home);
	band(W - EDGE_W, there);
}

const EDGE_W = 10;

/**
 * THE DEPTH MARKERS, and the airlight that eats them.
 *
 * Identical posts at the distances in `marks`, drawn small with distance, each then veiled toward the
 * sky by 1 − e^(−βd). That exponent is the same extinction the visual range came from, so a marker
 * disappears exactly where the range says it should — the picture and the number cannot disagree.
 *
 * Painted over the composite because AIRLIGHT IS ADDED LIGHT, not a property of the post: mixing it
 * into the material layer would send it through the re-lighting operator, which would be asking what
 * colour the air is when lit by itself.
 */
export function drawMarkers(
	ctx: CanvasRenderingContext2D, W: number, H: number, s: SurfaceScene,
	beta: number, veilHex: string, x0: number, x1: number
) {
	const hy = H * HORIZON_Y;
	ctx.save();
	ctx.beginPath(); ctx.rect(x0, 0, Math.max(0, x1 - x0), H); ctx.clip();
	s.marks.forEach((d, i) => {
		const t = i / Math.max(1, s.marks.length - 1);
		const y = hy + (H - hy) * Math.pow(1 - t, 1.7) * 0.82 + 4;
		const h = (H - hy) * 0.30 * Math.pow(1 - t, 1.5) + 4;
		const x = W * (0.10 + t * 0.78);
		const w = Math.max(1.5, h * 0.13);
		const veil = Math.min(1, 1 - Math.exp(-beta * d));
		ctx.globalAlpha = 1;
		ctx.fillStyle = '#20242c';
		ctx.fillRect(x - w / 2, y - h, w, h);
		ctx.fillStyle = '#d8dde5';
		ctx.fillRect(x - w / 2, y - h, w, h * 0.22);
		// The air between you and it.
		if (veil > 0.002) {
			ctx.globalAlpha = veil;
			ctx.fillStyle = veilHex;
			ctx.fillRect(x - w / 2 - 1, y - h - 1, w + 2, h + 2);
		}
		ctx.globalAlpha = 1;
		// The label is information, not part of the scene, so it is never veiled and never re-lit.
		ctx.fillStyle = veil > 0.97 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.8)';
		ctx.font = '10px system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText(distanceWords(d), x, y + 12);
	});
	ctx.restore();
}
