/**
 * SCREEN-SPACE PIXEL FLOORS — what stops a thing vanishing at true scale.
 *
 * NOT PART OF THE SCALE LAW, and the distinction is the whole reason this file exists separately.
 * `scaleLaw.ts` decides relative size in SCENE units; this clamps the result in SCREEN units,
 * underneath it. **No dial position can correct a floor** — which is why P4/S2c's construct dial
 * could not have fixed the complaint that produced this file (constructs reading over-large until
 * you zoom in), and why the owner went looking for the dial and found the wrong control.
 *
 * EXTRACTED FROM `holo/scene.ts` for the same reason `scaleLaw.ts` was (phase P1): five numbers
 * that decide how big things look were closures inside `createHoloScene`, so nothing could test
 * them, nothing could show them, and tuning them meant editing the renderer. They are also the kind
 * of number this project expects to revisit after use, so they are now one table in one place.
 *
 * ONE AXIS. EVERY FLOOR IS A SPAN.
 * A body's floor used to be its RADIUS and a construct's its LENGTH, declared 170 lines apart. On
 * their own axes the two are not comparable, and comparing them anyway is exactly what happened:
 * 14 px of ship length beside 2.2 px of planet radius reads as a factor of six, when the honest
 * comparison — 14 against a planet's 4.4 px of DIAMETER — is a factor of three. Same fault shape as
 * A33 / B27 / B28: a quantity correct for its own purpose, published against a neighbour measured
 * differently. Everything here is a span (a diameter for a body, the long axis for a construct), so
 * the numbers can simply be read against each other. `bodyMinRadiusPx` converts at the one call
 * site that still wants a radius.
 */

/** Every floor, as an on-screen SPAN in pixels. This table is the tuning surface. */
export interface PixelFloorTable {
	/** A star's diameter. */
	star: number;
	/** A planet's — anything system-level that is not a star. */
	planet: number;
	/** A moon's — anything drawn as a satellite. */
	moon: number;
	/** A construct's long axis while its view has it in focus. */
	constructFocused: number;
	/** A construct's long axis otherwise. */
	constructIdle: number;
}

/**
 * The shipped floors.
 *
 * THE HIERARCHY IS THE POINT, not the absolute values: when things are too far to resolve they
 * become markers, and the marker hierarchy should still say which is the star, which the planet and
 * which the moon. One shared floor made a framed Earth and its Luna read as equals. The ratios
 * mirror the GM orrery's own marker ranks (star 4 / planet 2 / moon 1 px there).
 *
 * A CONSTRUCT JOINS THAT HIERARCHY RATHER THAN SITTING ABOVE IT — owner, 2026-08-27: *"2px planet
 * 14px ship seems silly — maybe pin at 2px/1px for constructs."* A focused ship therefore floors at
 * a PLANET's span and an unfocused one at a MOON's, which is what "2px/1px" means once both are
 * stated on one axis. It was 14 px focused and 7 px idle, i.e. three times a planet and six times a
 * moon.
 *
 * WHY LOWERING IT IS SAFE, both objections checked in the code rather than assumed:
 *   CLICKING is unaffected — the tap assist picks the nearest clickable body within 14 px of the tap
 *   on a raycast miss, and its own comment says it exists for construct icons and small bodies,
 *   i.e. things already drawn far below 14 px. The click target was never the model's size.
 *   LABELS are unaffected — `setLabelSize` is a fixed px font with a global toggle; nothing gates a
 *   label on its body's rendered size.
 *   AND THE COINCIDENCE, stated for what it is: the tap radius and the old focused floor were both
 *   14, but they are two independent literals with no shared constant, and the floor's own comment
 *   gave an unrelated reason ("a model smaller than this on screen is mush"). Nothing links them, so
 *   nothing breaks by moving one — but the code cannot tell us the 14 was ever copied from the
 *   other, so that remains a plausible story rather than a finding.
 *
 * EQUAL SPAN IS NOT EQUAL INK, AND THE GAP WAS MEASURED RATHER THAN GUESSED — it is much smaller
 * than it sounds. A hull is an elongated silhouette and a body is a disc, so at the same span a hull
 * lights fewer pixels; the obvious worry is that a ship therefore needs a bigger floor than a planet
 * to read as anything. Across the 26 bundled constructs that carry `dimensionsM` the MEDIAN aspect
 * ratio is 1.6 (not the 4:1 or 10:1 one imagines), which puts a hull at about 0.8x the lit area of a
 * disc of the same span. Parity is therefore defensible on measurement, not only on the owner's
 * suggestion. The extreme is the Hail Mary at 5.88:1 (~0.2x), and it is a 47 m craft that sits on its
 * floor in almost any shot anyway.
 * WHAT WAS NOT CHECKED, and it is the one thing a number cannot settle: nobody has LOOKED at a 4.4 px
 * hull on a screen. If it turns out not to read, raise `constructFocused` alone — that is a one-line
 * change in the table above and it does not disturb the body hierarchy.
 */
export const MIN_SPAN_PX: PixelFloorTable = {
	star: 6.4,
	planet: 4.4,
	moon: 2.4,
	constructFocused: 4.4,   // a planet's span
	constructIdle: 2.4       // a moon's span
};

/** Scene units per pixel at unit distance, for a vertical FOV in degrees and a viewport height. */
export function sceneUnitsPerPixel(fovYDeg: number, viewH: number): number {
	return (2 * Math.tan((fovYDeg * Math.PI) / 360)) / Math.max(1, viewH);
}

/** How many pixels a scene-unit size covers at `distance` from the camera. Axis-agnostic. */
export function onScreenPx(sizeScene: number, unitsPerPx: number, distance: number): number {
	return sizeScene / Math.max(1e-9, unitsPerPx * distance);
}

/** The scene-unit span a floor of `minSpanPx` demands at `distance`. */
export function flooredSpanScene(minSpanPx: number, unitsPerPx: number, distance: number): number {
	return minSpanPx * unitsPerPx * distance;
}

/**
 * How much to ENLARGE something already sized honestly, so it meets its floor. 1 when it is already
 * big enough, so the honest render is kept wherever it can be resolved and nothing ever vanishes —
 * the same answer the bodies' true-scale floor has always given (A9).
 *
 * BOTH ARGUMENTS MUST BE ON THE SAME AXIS. This function does not know or care which: pass a radius
 * with a radius floor, or a length with a length floor. That is deliberate — the axis belongs to the
 * MEASUREMENT, which is the call site's business, while `MIN_SPAN_PX` keeps the *table* on one axis
 * so the numbers can be read against each other. Mixing the two is the fault this whole file exists
 * to stop, so it is worth stating twice.
 *
 * THE `1e-9` IS A CAP ON ENLARGEMENT, NOT A DIVIDE-BY-ZERO GUARD, and it is load-bearing rather than
 * defensive — which was learned by extracting it and briefly getting it wrong. Something measuring
 * 2e-10 px would otherwise be scaled by 1.6e10 to meet a 3.2 px floor, and a body at the numerical
 * floor would be blown up into a visible disc. Clamping the measured size first caps the stretch at
 * `minPx / 1e-9`. It engages nine orders of magnitude below anything renderable, so it never fires
 * in practice — but it fires on exactly the inputs a sweep test uses, which is how it was found.
 */
export function floorScale(sizeScene: number, minPx: number, unitsPerPx: number, distance: number): number {
	if (!(sizeScene > 0) || !(minPx > 0)) return 1;
	const px = onScreenPx(sizeScene, unitsPerPx, distance);
	return px < minPx ? minPx / Math.max(1e-9, px) : 1;
}

/** The floor for a body, by the role it is drawn in. */
export function bodyMinSpanPx(isStar: boolean, isSatellite: boolean, table: PixelFloorTable = MIN_SPAN_PX): number {
	return isStar ? table.star : isSatellite ? table.moon : table.planet;
}

/** The same, as a RADIUS — for the one call site that measures bodies by radius. */
export function bodyMinRadiusPx(isStar: boolean, isSatellite: boolean, table: PixelFloorTable = MIN_SPAN_PX): number {
	return bodyMinSpanPx(isStar, isSatellite, table) / 2;
}

/**
 * The floor for a construct. `framed` means the camera has committed to this ship, and its floor is
 * ZERO on purpose: a screen-size floor pins the hull to a constant number of pixels, which is right
 * for a marker and wrong for a close-up — while it is active, moving the camera cannot change the
 * apparent size at all. That is the "wrestles the view" fault, and it is a policy this file must
 * keep rather than a special case to tidy away.
 */
export function constructMinSpanPx(opts: { framed: boolean; inFocus: boolean }, table: PixelFloorTable = MIN_SPAN_PX): number {
	if (opts.framed) return 0;
	return opts.inFocus ? table.constructFocused : table.constructIdle;
}
