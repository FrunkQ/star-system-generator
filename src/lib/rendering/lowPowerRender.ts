// THE TWO RENDERER LEVERS THAT LOW POWER PULLS, kept in one place because three surfaces pull them
// and a number that means "how hard are we trying" must not be written down three times.
//
// Both COST VISIBLE FIDELITY, which is why neither is on by default and why the owner put them
// behind the switch rather than in the ordinary path (2026-09-07): "If it won't impact visual
// fidelity then do it. If it will toggle them to the Low Power mode."

/**
 * The device pixel ratio to render at.
 *
 * THE BIGGEST SINGLE LEVER THERE IS, and the arithmetic is why: a ratio of 2 on a retina panel is
 * FOUR times the fragments of 1, and fill rate is exactly what an alpha-heavy scene is short of.
 * Every renderer in this app already caps at 2 (above that the cost climbs and nobody can see it);
 * low power takes it to 1, which is a visibly softer picture and an enormous saving.
 *
 * `setPixelRatio` must be followed by a `setSize`, or the drawing buffer keeps its old dimensions
 * and the change does nothing at all.
 */
export const MAX_PIXEL_RATIO = 2;
export function pixelRatioFor(lowPower: boolean): number {
	const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
	return lowPower ? 1 : Math.min(MAX_PIXEL_RATIO, dpr);
}

/**
 * How long a low-power frame is allowed to take, in ms. 33 is 30 fps.
 *
 * Half the frames is half of EVERYTHING - CPU passes, draw calls, fill - and on a view that is
 * barely moving it is the saving nobody notices. It is deliberately not lower: below about 24 the
 * eye stops reading motion as motion, and a map that stutters reads as broken rather than as frugal.
 */
export const LOW_POWER_FRAME_MS = 33;

/**
 * Should this frame be skipped? Asked BEFORE any work is done, so a skipped frame costs nothing but
 * the callback that asked.
 *
 * The comparison is `<` rather than `<=` and the slack is deliberate: a display running at exactly
 * 60 Hz delivers frames 16.67 ms apart, so a naive 33 ms gate lets one through every OTHER frame and
 * lands on 30 fps by luck. Allowing a frame that is within a whole 60 Hz tick of being due keeps the
 * cadence honest on 60, 120 and 144 Hz panels alike instead of beating against them.
 */
export const FRAME_SLACK_MS = 8;
export function skipFrame(lowPower: boolean, nowMs: number, lastFrameAtMs: number): boolean {
	if (!lowPower) return false;
	// A NaN clock needs no guard of its own: every comparison against NaN is false, so a broken
	// timestamp falls through to "do not skip" and the view keeps drawing. That is the right way for
	// it to fail and it is gated - an explicit isFinite check here was unfalsifiable dead code.
	return nowMs - lastFrameAtMs < LOW_POWER_FRAME_MS - FRAME_SLACK_MS;
}
