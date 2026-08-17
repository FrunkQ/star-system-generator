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

/**
 * ONE numerical floor, for every kind (S2b of the redesign). Not a design floor - purely the point
 * below which the scene's transforms stop carrying a size usefully. Legibility is the SCREEN-space
 * pixel floor's job, which is the argument `bodyRadiusScene` already made against scene-unit floors.
 *
 * WHY IT MUST BE SHARED, measured by /scale-reference on its first render: bodies used to floor at
 * 1e-7 scene units and constructs at 1e-10, a thousandfold apart. At true scale that made a 10 km
 * moonlet render 2.0e-7 while a physically LARGER 22 km station rendered 5.9e-8 - the moonlet drew
 * 3.4x too big purely because of which floor it landed on. Each floor was defensible alone (the
 * body one predates true scale; the ship one was lowered for G3 hulls) and together they were an
 * ordering violation (R9) that no dial setting could correct.
 */
export const NUMERICAL_FLOOR = 1e-10;

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
	return Math.max(NUMERICAL_FLOOR, dialBlend(trueScene, readable, ctx.bodySize));
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
	return Math.max(NUMERICAL_FLOOR, dialBlend(trueScene, STAR_RADIUS, ctx.bodySize));
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
	return Math.max(NUMERICAL_FLOOR, dialBlend(trueScene, readable, ctx.bodySize));
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

/** A wireframe/lo-poly vertex dot, as a fraction of the body it decorates. */
export const WIRE_DOT_FRAC = 0.13;
/**
 * A dot may never exceed this fraction of its body's rendered radius. THIS IS THE FIX, not tuning:
 * without a cap the dot has no relationship to the thing it is drawn on.
 */
export const WIRE_DOT_MAX_FRAC = 0.5;

/**
 * Size of a wireframe / lo-poly VERTEX DOT, in scene units.
 *
 * WHY IT IS A LAW AND NOT A `Math.max` AT THE CALL SITE (C15). The scene sized these as
 * `max(0.02 * markerScale(dial), radius * 0.13)` — a floor in WORLD units, which is F2/F3's fault
 * wearing new clothes. `markerScale` bottoms out at 0.02, so the floor bottoms out at 4e-4 scene
 * units, while a body shrinks by FIVE orders of magnitude between the readable dial and true scale.
 * Measured on the owner's screenshot case: Mars at true scale in a 30 AU system renders at 9.1e-6
 * scene units, against a dot floor of 4e-4 — the dot is FORTY-FOUR TIMES the planet's radius, which
 * is the "huge white pixelated blob with wireframe scribbles inside" that was reported.
 *
 * The floor is kept, because at the readable end it is what stops a small moon's dots vanishing —
 * but it is now CLAMPED to the body's own radius, so a dot can never be bigger than the thing it
 * decorates at any dial position. That clamp is the whole fix and it is what the test pins: the
 * floor is a legitimate readable-end device and an absurdity at true scale, and the cap is what
 * tells the two apart without needing a second branch.
 *
 * `markerScale` is still the right shrink for the floor itself — that is the shared sprite rule the
 * belt rubble and ring particles use, and this stays consistent with them.
 */
export function wireDotSize(radiusScene: number, bodySize: number): number {
	const r = Math.max(0, radiusScene);
	const wanted = Math.max(r * WIRE_DOT_FRAC, 0.02 * markerScale(bodySize));
	return Math.min(wanted, r * WIRE_DOT_MAX_FRAC);
}
