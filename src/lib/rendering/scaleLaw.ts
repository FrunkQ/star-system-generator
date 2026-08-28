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
/**
 * LEGACY: the flat readable-end scene radius every star used to draw at, whatever its size - so a
 * red dwarf and a red supergiant were the same size on screen. P4/S2 replaced it with the one
 * kind-blind span map (`readableSpanScene`), which a star now goes through like everything else.
 *
 * Still exported because `holo/scene.ts` and `/scale-reference` name it, and because it is the
 * number every pre-P4 saved look was built around - keeping it makes the size of the change
 * legible rather than lost. NOTHING IN THE LAW READS IT ANY MORE.
 */
export const STAR_RADIUS = 0.5;

// --- S2: ONE KIND-BLIND SPAN MAP ----------------------------------------------------------------

/**
 * P4/S2, the owner's decision of 2026-08-06: readable size is a single KIND-BLIND monotone map of
 * log(PHYSICAL size). What an object IS never enters the law - only how big it is. So a 940 km
 * station and a 940 km rock render identically, and "you could construct a death star" is answered
 * by the law rather than by an exception.
 *
 * WHAT WAS WRONG BEFORE: bodies and ships had SEPARATE readable bands and the bands OVERLAPPED.
 * Ships ran 0.14-0.7 while every body under 2000 km across sat flat at 0.28, so a 1 km cruiser
 * out-drew Luna and a 22 km station out-drew EARTH. That is R9's ordering inversion, and no dial
 * position could correct it because it was in the readable endpoint itself.
 *
 * THE SHAPE: piecewise-linear in log10(metres), continuous, monotone end to end.
 *
 *   - ABOVE the anchor (2000 km across) the slope is 0.2 per decade, which IS the shipped body
 *     curve. Every body 1000 km in radius or larger therefore renders BIT-IDENTICALLY to before -
 *     Luna, Earth, Jupiter and every gas giant do not move at all.
 *   - BELOW the anchor the slope shallows to 0.044 per decade, so eleven decades of ships,
 *     boulders and moonlets fit underneath 0.28 without the map going negative. The shipped law
 *     was FLAT here (every body under 2000 km read 0.28), and that flatness is precisely what made
 *     ordering impossible: a 22 km hull cannot be both smaller than a 2000 km moon and larger than
 *     a 10 km moonlet if the two moons render the same size.
 *
 * WHY MONOTONE IS ENOUGH TO SETTLE R9 FOR GOOD: the true-scale term is exactly proportional to
 * physical span, this readable term is monotone in physical span, and `dialBlend` is a GEOMETRIC
 * blend of the two - so the product of two monotone positive functions is monotone at every dial
 * stop. R9 holds by construction rather than by tuning, which is what the redesign asked for.
 *
 * The argument is the object's LONGEST PHYSICAL DIMENSION in metres, and the result is that same
 * dimension in scene units: a body's DIAMETER, a construct's LENGTH. Callers that want a radius
 * halve it.
 */
export const SPAN_ANCHOR_M = 2e6;         // 2000 km across - where the shipped body curve starts rising
export const SPAN_ANCHOR = 0.28;          // its readable span there, unchanged from the shipped law
export const SPAN_SLOPE_LARGE = 0.2;      // per decade above the anchor - the shipped body slope, kept
export const SPAN_SLOPE_SMALL = 0.044;    // per decade below it - chosen so a 20 m craft lands on 0.06
/** Positive floor for the readable span. Not a design size - it stops the map going negative for
 *  sub-metre objects. Legibility below this is the SCREEN-space pixel floor's job, as it is for
 *  everything else in this file. */
export const MIN_READABLE_SPAN = 0.002;

export function readableSpanScene(metres: number): number {
	const L = Math.log10(Math.max(1e-9, metres));
	const L0 = Math.log10(SPAN_ANCHOR_M);
	const span = L >= L0
		? SPAN_ANCHOR + SPAN_SLOPE_LARGE * (L - L0)
		: SPAN_ANCHOR - SPAN_SLOPE_SMALL * (L0 - L);
	return Math.max(MIN_READABLE_SPAN, span);
}

/** A body's diameter in metres, from its authored radius in km - the span map's argument. */
export function bodySpanM(radiusKm: number): number {
	return 2 * radiusKm * 1000;
}

/**
 * Everything the law needs about the system being drawn, so the functions stay pure.
 * `rMax` is the largest heliocentric distance in the system (AU); `gridRadius` scene units it maps
 * to. Their ratio is the true-scale factor: metres -> AU -> scene units.
 */
export interface ScaleContext {
	/** 1 = readable, 0 = true physical scale. THE MASTER DIAL: it moves bodies AND constructs. */
	bodySize: number;
	/**
	 * S2c, owner 2026-08-27: the CONSTRUCT dial, as a RELATIVE OFFSET on the master rather than a
	 * second absolute dial. *"Bodies moves both, but constructs only moves itself - so you can set
	 * relative position you like (default to current) and be able to slide constructs apart if
	 * needed. We are honest as it is a user visual choice."*
	 *
	 * ZERO IS TODAY'S LOOK, which is why it is an offset and not a dial: at 0 a construct sits at
	 * exactly the body dial, which is what the single-dial law always did, so no saved preset moves.
	 * Positive nudges constructs toward the readable end (bigger, more legible); negative toward
	 * true scale.
	 *
	 * IT IS A DELIBERATE, LABELLED DEPARTURE FROM TRUTH, and R9 DOES NOT APPLY TO IT. Ordering is a
	 * property of the LAW, which is what offset 0 is; sliding ships apart from bodies is a display
	 * choice a user makes and can see. That distinction only means anything because S2 put truth
	 * underneath it - which is why the design insists S2 ships first.
	 */
	constructOffset?: number;
	rMax: number;
	gridRadius?: number;
}

/** The dial a CONSTRUCT is drawn at: the master, nudged by the offset, clamped to the dial's range. */
export function constructDial(ctx: ScaleContext): number {
	return Math.max(0, Math.min(1, ctx.bodySize + (ctx.constructOffset ?? 0)));
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
 * Readable radius for a body - half its span through the one kind-blind map (S2). NOT capped here:
 * see `bodyRadiusScene`, where a SATELLITE is still capped so it reads as a satellite rather than
 * rivalling its primary.
 *
 * THE SATELLITE CAP IS DELIBERATELY KEPT AND IS NOT AN R9 EXCEPTION IN S2'S SENSE. R9 is about KIND
 * - a ship must not out-draw a physically larger body - and the cap is about HIERARCHY, which is a
 * different axis and a readability device the owner has never objected to. It does mean a capped
 * Luna (0.1) reads smaller than a system-level 100 km asteroid (0.118); that inversion is
 * PRE-EXISTING and unchanged by S2, which is why it is recorded here rather than silently fixed.
 */
export function readableBodyRadius(radiusKm: number): number {
	return readableSpanScene(bodySpanM(radiusKm)) / 2;
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

/**
 * Is this node drawn as a STAR? The scene's own rule, lifted here so the extent and the renderer
 * cannot disagree about which default radius a node gets.
 */
export function rendersAsStar(node: any): boolean {
	return node?.roleHint === 'star' || (node?.kind === 'body' && node?.parentId === null);
}

/**
 * A node's TRUE physical radius in AU - how far its own limb reaches from its own centre.
 *
 * WHY IT IS ITS OWN FUNCTION (A78): the framing normaliser `rMax` has to know how big a body is,
 * not only where it is, and the renderer had the identical expression inline. Two copies of "how
 * big is this thing physically" is precisely the duplication the standing rules warn about - they
 * would answer the same question differently the first time either default changed.
 *
 * TRUE radius, never the RENDERED one, and the distinction is load-bearing. The drawn size depends
 * on the `bodySize` dial and on `trueScaleFactor`, which is `gridRadius / rMax` - so feeding a
 * rendered size back into `rMax` would be a loop. The extent is a fact about the DATA and is
 * dial-independent by construction.
 *
 * A CONSTRUCT IS ZERO: its drawn size is a readability marker rather than a physical one, and its
 * true size (tens of metres) is below anything a system-scale extent can carry.
 */
export function physicalRadiusAu(node: any): number {
	if (!node || node.kind === 'construct') return 0;
	const km = node?.physical_parameters?.radiusKm || node?.radiusKm || (rendersAsStar(node) ? 696000 : 3000);
	return km / AU_KM;
}

/** The authored stellar radius in km, with the law's default for a node that carries none. */
export function starRadiusKmOf(node: any): number {
	return node?.physical_parameters?.radiusKm || node?.radiusKm || 696000;
}

/**
 * Rendered star radius. S2 put stars through the same kind-blind span map as everything else, so a
 * star's readable size now depends on HOW BIG IT IS. Before P4 every star drew at a flat
 * `STAR_RADIUS` whatever its class, which made a red dwarf and a red supergiant identical on
 * screen - the same dishonesty S2 removed between ships and bodies, one band further up.
 */
export function starRadiusScene(radiusKm: number, ctx: ScaleContext): number {
	const readable = readableSpanScene(bodySpanM(radiusKm)) / 2;
	if (ctx.bodySize >= READABLE_DIAL) return readable;
	const trueScene = (radiusKm / AU_KM) * trueScaleFactor(ctx);
	return Math.max(NUMERICAL_FLOOR, dialBlend(trueScene, readable, ctx.bodySize));
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
 * Readable LENGTH for a construct - the SAME span map a body goes through, on the same axis and in
 * the same units (S2). There is no ship band any more, which is the whole of the fix: the old one
 * ran 0.14-0.7 and OVERLAPPED the bodies', so a 1 km cruiser out-drew Luna and a 22 km station
 * out-drew Earth.
 */
export function readableShipLength(lengthM: number): number {
	return readableSpanScene(lengthM);
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
	// S2c: a construct reads its OWN dial - the master plus the campaign's offset. At the default
	// offset of 0 this is `ctx.bodySize` exactly, so nothing moves for anyone who has not touched it.
	const dial = constructDial(ctx);
	if (dial >= READABLE_DIAL) return readable;
	const trueScene = (lengthM / 1000 / AU_KM) * trueScaleFactor(ctx);
	return Math.max(NUMERICAL_FLOOR, dialBlend(trueScene, readable, dial));
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
