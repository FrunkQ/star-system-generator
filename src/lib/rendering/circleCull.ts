// WHICH ASTRONOMICAL CIRCLES ARE WORTH DRAWING, in screen pixels.
//
// Owner, 2026-09-07, on the zone overlay: *"the Zones are all full of transparencies and dashed
// lines (probably drawn off screen)"*. Half right, and the half he was wrong about is the
// interesting one - the zones already skip a circle whose bounding box misses the viewport. What
// NOTHING here did was the opposite case, and on this view it is the common one.
//
// A RING AND A DISC ARE NOT VISIBLE UNDER THE SAME CONDITIONS. A filled disc that swallows the
// viewport covers every pixel of it. The RING of that same circle is somewhere out beyond the
// corners, and not one pixel of it can be seen - yet a bounding-box test says "visible", and the
// canvas is handed a path whose circumference can run to millions of pixels at deep zoom. That is a
// stroke, a dash walk and a rasteriser clip, all for nothing, every frame.
//
// It is exactly the shape of the thing the owner asked about at the top of the thread ("don't try
// and draw offscreen items") - just not where anybody was looking, because the circle in question is
// not off screen. It is all the way around it.

/**
 * Is any part of the FILLED disc on screen? A bounding-box overlap, which is the honest test for a
 * fill: a circle enclosing the viewport fills every pixel of it.
 */
export function discVisible(
	cx: number, cy: number, r: number, width: number, height: number, margin = 0
): boolean {
	if (!(r > 0)) return false;
	return cx + r >= -margin && cx - r <= width + margin && cy + r >= -margin && cy - r <= height + margin;
}

/**
 * Is any part of the RING on screen?
 *
 * The disc test, AND the circle must not swallow the viewport whole: if the furthest corner of the
 * view is inside the circle then every visible point is inside it, so the boundary is somewhere out
 * of sight and stroking it draws nothing at all.
 *
 * The comparison is `>` rather than `>=` so a ring passing exactly through the far corner still
 * draws - the failure that costs a frame is cheap and the failure that loses a line is not.
 */
export function ringVisible(
	cx: number, cy: number, r: number, width: number, height: number, margin = 0
): boolean {
	if (!discVisible(cx, cy, r, width, height, margin)) return false;
	const farX = Math.max(Math.abs(cx + margin), Math.abs(width + margin - cx));
	const farY = Math.max(Math.abs(cy + margin), Math.abs(height + margin - cy));
	return Math.hypot(farX, farY) > r;
}
