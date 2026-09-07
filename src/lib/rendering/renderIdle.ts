// RENDER ON DEMAND: when nothing on screen can have changed, do not draw the frame.
//
// Owner, 2026-09-07: *"do the render loop throttle - pause when nothing moves"*. It is the biggest
// saving available on a laptop - a GM leaving a paused map open was rendering sixty full frames a
// second of an unchanging picture, for ever - and it is also the most dangerous change in the file,
// because the cost of being wrong is a map that has silently stopped updating. Everything here is
// built around that asymmetry.
//
// THREE PRINCIPLES, and they are what make it safe to skip a frame at all:
//
// 1. EVERY DOUBT DRAWS. The question asked is not "can I prove nothing changed" but "is there any
//    reason to think something might have" - and any reason at all is enough. The scene marks itself
//    dirty on every public call it receives, so an unknown interaction costs one wasted frame rather
//    than a stale picture.
// 2. A HEARTBEAT BOUNDS THE DAMAGE. However careful the bookkeeping, one day something will change
//    the scene without saying so. A frame taken at least once a second means the worst case is a
//    picture up to a second late, not a picture wrong until somebody touches it - which is the
//    difference between a performance feature and a bug report nobody can reproduce.
// 3. ANIMATION IS NOT AN OPINION. A corona pulsing, an aurora swelling, a cloud deck drifting: each
//    is a real change every frame and none of them can be skipped without freezing the picture. Only
//    a scene with NONE of them can idle - which is why this pairs so well with low power, where most
//    of them are already gone.

/**
 * The longest a scene may go without drawing, in ms. See principle 2: this is the safety net under
 * the whole feature, not a tuning knob, and it should not be raised to save the last few frames.
 */
export const IDLE_HEARTBEAT_MS = 1000;

export interface IdleInputs {
	/** Something asked the scene to change since the last frame drawn. Any doubt sets this. */
	dirty: boolean;
	/** The camera is in flight: a drag, damping still bleeding off, a turntable, or a focus ease. */
	cameraMoving: boolean;
	/**
	 * The scene holds something that moves on its OWN clock rather than the simulation's - a pulsing
	 * corona, an aurora, drifting cloud, a running post-filter. Never idle while this is true.
	 */
	animated: boolean;
	/** The simulation clock moved, so orbits, spins and belts have all moved with it. */
	clockAdvancing: boolean;
	/** Since the last frame actually drawn. */
	sinceLastFrameMs: number;
}

/**
 * Should this frame be drawn?
 *
 * Note the shape of it: every clause says YES. There is no clause that says no, and there must never
 * be one - a reason to skip is only ever the ABSENCE of every reason to draw.
 */
export function shouldRender(i: IdleInputs): boolean {
	if (i.dirty || i.cameraMoving || i.animated || i.clockAdvancing) return true;
	// A NaN or a clock that has not started yet reads as "long enough ago", so the scene draws. The
	// comparison is deliberately the way round that fails toward drawing.
	return !(i.sinceLastFrameMs < IDLE_HEARTBEAT_MS);
}
