/**
 * THE SCALE LAW - how big anything draws in the 3D scene, as pure functions.
 *
 * Extracted from `holo/scene.ts` (phase P1 of `docs/dev/camera-framing-redesign.md`). These were
 * closures inside `createHoloScene`, which meant nothing outside could call them and nothing could
 * test them - and the scale law is exactly the thing that needs a test, because it is invisible on
 * screen without a measurement (see RENDER-S8 in `docs/dev/engine-map.md`).
 *
 * P1 RULE: this file reproduces the previous behaviour BIT FOR BIT. `scaleLaw.spec.ts` pins every
 * function against the arithmetic lifted from the old closures. The law CHANGES in phase P4 (see
 * the design's S2: physical-size bands, kind-blind, no construct cap) - not here. Keeping the
 * extraction and the behaviour change in separate commits is the whole point: if a look moves in
 * P1, the extraction is wrong.
 *
 * THE DIAL. `bodySize` runs 1 = readable (chunky, legible) to 0 = true physical scale. Everything
 * blends between a per-class READABLE size and the object's TRUE size at the system's true-scale
 * factor, GEOMETRICALLY - see `dialBlend` and RENDER-S6.
 */

import { AU_KM } from '$lib/constants';

/** Scene units the outermost body in a system maps to. The scene's own GRID_RADIUS. */
export const GRID_RADIUS = 12;
/** Readable-end scene radius of a star photosphere. */
export const STAR_RADIUS = 0.5;

/**
 * Everything the law needs about the system being drawn, so the functions stay pure.
 * `rMax` is the largest heliocentric distance in the system (AU); `gridRadius` scene units it maps
 * to. Their ratio is the true-scale factor: metres -> AU -> scene units.
 */
export interface ScaleContext {
	/** 1 = readable, 0 = true physical scale. */
	bodySize: number;
	rMax: number;
	gridRadius?: number;
}

/** At or above this the dial is "fully readable" and the true term is not consulted at all. */
export const READABLE_DIAL = 0.999;

/** AU per scene unit, i.e. the factor that turns a true physical size into scene units. */
export function trueScaleFactor(ctx: ScaleContext): number {
	return (ctx.gridRadius ?? GRID_RADIUS) / Math.max(1e-9, ctx.rMax);
}

/**
 * GEOMETRIC dial blend: size = true^(1-v) * readable^v, so every step of the dial multiplies the
 * size by a constant RATIO (RENDER-S6). A linear blend let the readable term dominate a 1e-5 true
 * radius almost immediately, so 20%-90% of the travel looked identical and the whole true-scale
 * transition was crammed into 0-5%. Log spacing also makes ships shed size faster than planets for
 * free, because their readable-to-true ratio is far larger.
 */
export function dialBlend(trueScene: number, readable: number, bodySize: number): number {
	const t = Math.max(1e-12, trueScene);
	const r = Math.max(1e-12, readable);
	return Math.exp(Math.log(t) * (1 - bodySize) + Math.log(r) * bodySize);
}

// --- Bodies -------------------------------------------------------------------------------------

/** The authored radius in km, with the law's own default for a node that carries none. */
export function radiusKmOf(node: any): number {
	return node?.physical_parameters?.radiusKm || node?.radiusKm || 3000;
}

/**
 * Readable radius for a body: a log map of its physical radius, so a gas giant reads bigger than a
 * moon without either leaving the screen. NOT capped here - see `bodyRadiusScene`, where a
 * satellite is capped so it reads as a satellite rather than rivalling its primary.
 */
export function readableBodyRadius(radiusKm: number): number {
	return 0.14 + 0.1 * Math.max(0, Math.log10(radiusKm / 1000));
}

/**
 * Rendered sphere radius for a body at the current dial.
 *
 * NO scene-unit floor beyond a numerical guard. This is the GM orrery's model, the gold standard
 * for actual size: the body's TRUE radius in world units, with visibility guaranteed by a per-role
 * PIXEL floor at draw time. A floor in scene units destroys the very thing true scale is for - 0.006
 * sat above every real body's true radius (Earth 1.1e-5, even Sol 1.2e-3), so Sol, Jupiter, Earth
 * and Luna all drew at the identical clamped size.
 */
export function bodyRadiusScene(radiusKm: number, systemLevel: boolean, ctx: ScaleContext): number {
	const full = readableBodyRadius(radiusKm);
	const readable = systemLevel ? full : Math.min(full, 0.1);
	if (ctx.bodySize >= READABLE_DIAL) return readable;
	const trueScene = (radiusKm / AU_KM) * trueScaleFactor(ctx);
	return Math.max(1e-7, dialBlend(trueScene, readable, ctx.bodySize));
}

/** The authored stellar radius in km, with the law's default for a node that carries none. */
export function starRadiusKmOf(node: any): number {
	return node?.physical_parameters?.radiusKm || node?.radiusKm || 696000;
}

/**
 * Rendered star radius: the readable STAR_RADIUS at the top of the dial, blending toward its true
 * physical size (a star is still far larger than any planet, so it stays clearly visible).
 */
export function starRadiusScene(radiusKm: number, ctx: ScaleContext): number {
	if (ctx.bodySize >= READABLE_DIAL) return STAR_RADIUS;
	const trueScene = (radiusKm / AU_KM) * trueScaleFactor(ctx);
	return Math.max(1e-7, dialBlend(trueScene, STAR_RADIUS, ctx.bodySize));
}

// --- Constructs ---------------------------------------------------------------------------------

/**
 * A construct's longest authored dimension, in metres. The law's default (100 m) stands in for a
 * construct with no dimensions authored at all.
 */
export function shipLengthMOf(node: any): number {
	const dims = node?.physical_parameters?.dimensionsM;
	const longest = Math.max(...(Array.isArray(dims) ? dims.map((d: number) => Number(d) || 0) : [0]), 0);
	return longest || 100;
}

/**
 * Readable LENGTH for a construct - a log-mapped marker length, so relative size stays honest (a
 * 1 km cruiser visibly dwarfs a 110 m frigate) while both stay legible.
 *
 * NOTE for P4: this band (0.14 - 0.7) OVERLAPS the bodies' band, which is what lets a 46 m ship
 * out-draw a small moon at the readable end - the ordering inversion the redesign's R9 exists to
 * kill. Do not "fix" it here; P4 replaces both bands with one kind-blind monotone map of physical
 * size. Changing it in isolation would move ships without moving bodies and make the inversion
 * worse.
 */
export function readableShipLength(lengthM: number): number {
	return Math.min(0.7, Math.max(0.14, 0.16 + 0.1 * (Math.log10(lengthM) - 1)));
}

/**
 * The construct's long axis in scene units at the current dial - the SAME geometric blend a body's
 * radius takes. At the true end this is the authored dimensions converted exactly as body radii
 * are, so it is genuinely 1:1; the floating origin is what makes that renderable.
 *
 * The 1e-10 guard is a numerical floor, not a design floor: below it a construct is smaller than
 * float64 can usefully carry through the scene's transforms. It does mean two different tiny hulls
 * can land on the same value at the very bottom of the dial - noted in the design as a P4 concern.
 */
export function shipLengthScene(lengthM: number, ctx: ScaleContext): number {
	const readable = readableShipLength(lengthM);
	if (ctx.bodySize >= READABLE_DIAL) return readable;
	const trueScene = (lengthM / 1000 / AU_KM) * trueScaleFactor(ctx);
	return Math.max(1e-10, dialBlend(trueScene, readable, ctx.bodySize));
}

// --- Markers ------------------------------------------------------------------------------------

/**
 * How far a SPRITE may shrink as the dial leaves readable. The scene draws a good deal that is a
 * marker rather than geometry (wireframe vertex dots, belt rubble, ring particles) and each was
 * sized for the readable end. At true scale a real body shrinks three or four orders of magnitude,
 * and sprites that did not follow left planets under a wall of boulders lying across their own
 * orbits. They stop at 2%, below which a belt would cease to exist rather than read as fine dust.
 *
 * SPRITES ONLY. The minimum body radius is not a sprite - the camera is sized off it, so scaling it
 * down puts the framing distance inside the near plane. Body visibility is a screen-space job.
 */
export function markerScale(bodySize: number): number {
	return bodySize >= READABLE_DIAL ? 1 : Math.max(0.02, bodySize);
}
