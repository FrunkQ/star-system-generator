// THE VIEW FROM A BALLOON — the Surface view for a world that has no surface.
//
// A gas giant used to get the rock-and-sea painter, which drew a ground that does not exist. What you
// actually see from inside the air is a cloudscape: a soft deck below you, darker atmosphere above,
// no hard horizon anywhere — the line between them is a fade, because there is no edge to stand at.
// And the depth markers become BALLOONS, which is not a joke: an aerostat is the one thing a person
// could genuinely float at depth in such an atmosphere, so it is the honest reference object.
//
// The same three-layer rule as the ground scene, because it is physics and not style:
//   LIGHT      the sky, and the glow of a deck lit from above — painted directly, never re-lit.
//   MATERIAL   the balloons and their payloads — reflectances, re-lit by the light at this depth.
//   ADDED      haze between you and each balloon, composited after.
import type { DepthLevel } from '$lib/physics/depthView';
import { spectrumToHex } from '$lib/physics/spectrum';
import { dimHex } from './surfaceScene';
import { distanceWords } from '$lib/physics/visibility';

const hexToRgb = (hex: string): [number, number, number] => {
	const v = parseInt(hex.slice(1), 16);
	return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const rgbToHex = (c: number[]) =>
	'#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

export interface Cloudscape {
	/** Sky overhead — the light at this depth, scattered. */
	skyHex: string;
	/** The deck floor you are looking down onto, as it appears lit. */
	floorHex: string;
	/** Darker air between sky and floor. */
	midHex: string;
	/** 0..1, how much of the scene is inside cloud. Inside a deck the world is a grey-white room. */
	immersion: number;
	/** How dark it is here versus the top of the air. */
	transmission: number;
	/** What to say about the light. */
	note: string;
}

/**
 * Everything the painter needs, from one probe level.
 *
 * The floor's colour is its MATERIAL lit by the light reaching it — the same move the ground scene
 * makes. Under an opaque deck the light is essentially gone and the scene would go black; that is
 * honest for starlight but wrong for what you would see, because the deck itself glows faintly with
 * the light it has scattered and a balloon carries its own lamps. So the floor keeps a small self-
 * glow below 1% transmission, and the note says so rather than hiding it.
 */
export function cloudscapeFor(level: DepthLevel, fallbackFloor = '#c9b08a', trueLevel = false): Cloudscape {
	// COLOUR AND BRIGHTNESS ARE SEPARATE QUESTIONS, the same split the ground scene makes. `spectrumToHex`
	// normalises, so `litHex` is the COLOUR of whatever light is here, however faint — which is what the
	// unticked view shows: under the ammonia deck the light is a trillionth of what it was, and it is
	// still ochre. Only "midday brightness" asks how DARK, and then the answer is black, because it is.
	const litHex = spectrumToHex(level.light);
	const t = Math.max(0, Math.min(1, level.transmission));
	const mat = hexToRgb(level.floorHex ?? fallbackFloor);
	const lit = hexToRgb(litHex);
	const floorLit = rgbToHex(mix(mat, lit, 0.25));
	// THE AIR'S OWN GLOW, where there is any. On a hot giant the adiabat runs to incandescence a few
	// bar down, and a scene lit by starlight alone paints a dark room where reality is a furnace. The
	// probe says how much of the light here is emission; that share is painted in the glow colour and
	// is NOT dimmed by "midday brightness", because it is not daylight — it is the walls glowing.
	const g = level.glowShare;
	const glowRgb = level.glowHex ? hexToRgb(level.glowHex) : null;
	// At true level, dim the STARLIT part in linear light on the same curve the ground scene uses. A
	// small floor stays, because the deck scatters the little that remains and a balloon carries
	// lamps — it is not a void.
	const dimK = trueLevel ? Math.max(0.02, Math.pow(t, 0.6)) : 1;
	const starFloor = hexToRgb(dimHex(floorLit, dimK));
	const starSky = hexToRgb(dimHex(rgbToHex(mix(lit, [255, 255, 255], 0.35)), trueLevel ? Math.max(0.03, Math.pow(t, 0.8)) : 1));
	// Blend toward the glow by its share. Emission lights the floor and the air alike — there is no
	// "above" to a furnace — so sky and floor converge on it.
	const floorHex = glowRgb ? rgbToHex(mix(starFloor, glowRgb, g)) : rgbToHex(starFloor);
	const skyHex = glowRgb ? rgbToHex(mix(starSky, mix(glowRgb, [0, 0, 0], 0.35), g)) : rgbToHex(starSky);
	const midHex = dimHex(rgbToHex(mix(hexToRgb(floorHex), hexToRgb(skyHex), 0.45)), 0.7);
	// Graded, not binary: the probe says how deep into the murk you are, so entering a deck is a fade
	// into the grey room rather than a jump cut. (Leaving through the BASE is still sharp, and that is
	// the physics, not a shortcut.)
	const immersion = level.cloudImmersion ?? (level.inCloud ? 1 : 0);
	const inside = level.floor?.species ?? 'cloud';
	const above = level.ceiling?.species ?? 'upper';
	const note = level.inCloud
		? `Inside the ${inside} deck: a featureless grey room, visibility an arm's length.`
		: g > 0.5
			? `${Math.round(level.tempK)} K — the air itself glows ${level.tempK > 1400 ? 'yellow-white' : level.tempK > 1000 ? 'orange' : 'dull red'}. A furnace, lit from every side.`
		: t < 0.01
			? `Under the ${above} deck, starlight is gone — what you see is the deck's own faint glow and your own lamps.`
			: t < 0.5
				? `Under the ${above} deck: dim, ${Math.round(t * 100)}% of the light above.`
				: level.floor
					? `Above the ${level.floor.species} deck, looking down onto it.`
					: `Clear air, above the cloud.`;
	return { skyHex, floorHex, midHex, immersion, transmission: t, note };
}

const HORIZON_Y = 0.55;

/** Sky, fade, and the deck floor — all LIGHT or lit material, never re-lit. */
export function drawCloudscape(ctx: CanvasRenderingContext2D, W: number, H: number, c: Cloudscape, seed: number) {
	// Sky to air: a long gradient with NO hard line. The horizon on a gas giant is a haze limb, not an
	// edge, and drawing one would put a ground back in.
	const g = ctx.createLinearGradient(0, 0, 0, H);
	g.addColorStop(0, c.skyHex);
	g.addColorStop(HORIZON_Y - 0.18, c.midHex);
	g.addColorStop(HORIZON_Y + 0.05, c.floorHex);
	g.addColorStop(1, dimHex(c.floorHex, 0.75));
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, W, H);

	// The deck surface, seen from above: soft billows, receding. Overlapping ellipses with a lighter
	// top and a darker under-shadow — which is all a cloud top is at this scale.
	let a = seed >>> 0 || 1;
	const rnd = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
	const lighter = rgbToHex(mix(hexToRgb(c.floorHex), [255, 255, 255], 0.22));
	const darker = dimHex(c.floorHex, 0.7);
	for (let i = 0; i < 42; i++) {
		const t = rnd();                                   // 0 far .. 1 near
		const y = H * (HORIZON_Y - 0.02) + (H - H * HORIZON_Y) * Math.pow(t, 1.6);
		const rx = W * (0.03 + 0.16 * t) * (0.6 + 0.8 * rnd());
		const ry = rx * (0.18 + 0.22 * t);
		const x = rnd() * W;
		ctx.globalAlpha = 0.55 + 0.35 * t;
		ctx.fillStyle = darker;
		ctx.beginPath(); ctx.ellipse(x, y + ry * 0.35, rx, ry, 0, 0, 7); ctx.fill();
		ctx.fillStyle = lighter;
		ctx.beginPath(); ctx.ellipse(x, y, rx * 0.92, ry * 0.8, 0, 0, 7); ctx.fill();
	}
	ctx.globalAlpha = 1;

	// Inside a deck: the frame fades into a grey room BY how deep you are, and the billows with it.
	if (c.immersion > 0) {
		ctx.fillStyle = c.floorHex;
		ctx.globalAlpha = 0.82 * c.immersion;
		ctx.fillRect(0, 0, W, H);
		ctx.globalAlpha = 1;
	}
}

/** Where balloon i of n sits and how big it is — shared by the material pass and the veil pass so the
 *  haze lands exactly on the balloon it belongs to. */
function balloonAt(W: number, H: number, i: number, n: number) {
	const t = i / Math.max(1, n - 1);                   // 0 near .. 1 far
	const y = H * (HORIZON_Y - 0.04) - H * 0.22 * (1 - t) + H * 0.04 * t;
	const r = Math.max(2.5, H * 0.075 * Math.pow(1 - t, 1.4) + 2);
	const x = W * (0.12 + t * 0.74);
	return { x, y, r };
}

/**
 * BALLOONS at known distances, the giant's answer to depth markers. Each is a MATERIAL — a bright
 * envelope and a dark gondola — so the caller draws them into the re-lit layer; `drawBalloonVeils`
 * then hazes each by the air between you and it, exactly as the ground scene veils its posts.
 */
export function drawBalloonsMaterial(ctx: CanvasRenderingContext2D, W: number, H: number, marks: number[]) {
	marks.forEach((_, i) => {
		const { x, y, r } = balloonAt(W, H, i, marks.length);
		// Envelope: the reference red, the one colour everyone knows a balloon in.
		ctx.fillStyle = '#c4262b';
		ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.15, 0, 0, 7); ctx.fill();
		// A pale stripe so there is a light material to re-light as well as a saturated one.
		ctx.fillStyle = '#e8e8e8';
		ctx.fillRect(x - r * 0.9, y - r * 0.12, r * 1.8, r * 0.24);
		// Gondola and lines.
		ctx.fillStyle = '#2b2b30';
		ctx.fillRect(x - r * 0.28, y + r * 1.5, r * 0.56, r * 0.4);
		ctx.strokeStyle = '#2b2b30'; ctx.lineWidth = Math.max(0.6, r * 0.05);
		ctx.beginPath(); ctx.moveTo(x - r * 0.7, y + r * 0.95); ctx.lineTo(x - r * 0.2, y + r * 1.5);
		ctx.moveTo(x + r * 0.7, y + r * 0.95); ctx.lineTo(x + r * 0.2, y + r * 1.5); ctx.stroke();
	});
}

/** The haze veil over each balloon, plus its distance label — added light, composited last. */
export function drawBalloonVeils(
	ctx: CanvasRenderingContext2D, W: number, H: number, marks: number[],
	beta: number, veilHex: string, x0: number, x1: number
) {
	ctx.save();
	ctx.beginPath(); ctx.rect(x0, 0, Math.max(0, x1 - x0), H); ctx.clip();
	marks.forEach((d, i) => {
		const { x, y, r } = balloonAt(W, H, i, marks.length);
		const veil = Math.min(1, 1 - Math.exp(-beta * d));
		if (veil > 0.002) {
			ctx.globalAlpha = veil;
			ctx.fillStyle = veilHex;
			ctx.beginPath(); ctx.ellipse(x, y + r * 0.4, r * 1.3, r * 1.9, 0, 0, 7); ctx.fill();
			ctx.globalAlpha = 1;
		}
		ctx.fillStyle = veil > 0.97 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.8)';
		ctx.font = '10px system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText(distanceWords(d), x, y + r * 2.3 + 10);
	});
	ctx.restore();
}
