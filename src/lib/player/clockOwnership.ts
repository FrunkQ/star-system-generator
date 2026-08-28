// WHOSE CLOCK IS A PLAYER VIEW ON? One rule, four inputs, two faces.
//
// Owner, 2026-08-27, across three messages that together settle it:
//
//   "On GM view it 'holds the time', and the 'view time' is what is shown on the player view... when
//    the GM is updating time we effectively need to lock out the time controls on the player view, and
//    on 'follow GM' the user view has no time controls at all."
//
//   "Keplerian dynamics means we should be able to set time on the player view easily enough. We just
//    need to indicate to the players they cannot mess with time when it is actually relevant."
//
//   "Unless the GM says time is important by RUNNING TIME, or it is follow GM - so the GM view and
//    player view align. Otherwise the players are free to play with it as a tool; ships will not MOVE
//    on their version, as it is not 'true time'."
//
// WIDENED 2026-08-27, at the owner's word: *"When a GM scrubs their own time or does ANYTHING to
// update the clock (including run time) then the player view time controls are disabled... When the
// GM touches time (or does follow me) everything snaps back to GM Display Time."* A running clock was
// only the loudest case; a SCRUB is the GM saying the same thing.
//
// AND THAT NEEDED A WAY OUT, because a scrub is INSTANTANEOUS. Taken literally, "any activity takes
// the controls" plus "a stationary clock frees them" is a flicker: the controls vanish and return in
// the same frame. Owner's choice, from three candidates: THE PLAYER TAKES IT BACK. The GM's touch
// snaps everyone to their time and the controls stay away until a player asks for them. Nothing is
// timed, nothing is guessed, and a player always knows whose clock they are on - which is the whole
// point of the pair below.
//
// THE RULE. A reader either steers the clock or is told whose clock they are on - never neither, and
// never both. `canScrub` and `onGmClock` are the two faces of that, and the time controls and the
// campaign readout are gated on exactly those, so they cannot drift apart.
//
// WHY A FREE CLOCK IS ALLOWED AT ALL. A body's position is closed-form in time, so a player scrubbing
// draws every world CORRECTLY for the time they chose. Nothing is lost, and it makes the map a tool
// rather than a slide. A construct is different: its course lives in the GM's journeys, which the
// player snapshot does not carry, so a ship stands still on a clock the GM does not own. That is the
// honest consequence of the freedom, not a fault to chase - and it is exactly why the lock exists for
// the moments when it would matter.
//
// KEPT OUT OF THE COMPONENT so it can be tested without a DOM, like the picker's list rule.

export interface GmClockSample {
	currentTime: number;
	isPlaying: boolean;
	timeScale: number;
}

export interface ClockInputs {
	/** The preset allows interaction at all. A display-only tier has no controls by definition. */
	presetInteractive: boolean;
	/** `followGM`, from the preset or the GM's live override. A standing mode. */
	followGM: boolean;
	/** The GM's heartbeat, or null when there is no GM connected. */
	gmTime: GmClockSample | null;
	/** LATCHED by the caller: the GM has touched their clock and no player has taken it back since.
	 *  Set by `gmClockTouched` on each heartbeat, cleared when a player asks for the controls. Starts
	 *  FALSE, so a session where the GM never touches the clock behaves exactly as it did before. */
	gmHoldsClock?: boolean;
}

export interface ClockOwnership {
	/** Does this reader get time controls? */
	canScrub: boolean;
	/** Is this view running on the GM's absolute time and rate? */
	onGmClock: boolean;
	/** Short reason the controls are away, for a MOMENTARY lock. Null when there is nothing to explain
	 *  — either the controls are present, or their absence is the standing mode the reader is in. */
	lockReason: string | null;
	/** May this reader ask for the controls back? Only while the GM's clock is STILL: a running clock
	 *  is the GM saying this moment matters, and there is nothing to take back from it. */
	canReclaim: boolean;
}

/**
 * DID THE GM TOUCH THEIR CLOCK BETWEEN THESE TWO HEARTBEATS? Running counts, and so does a scrub -
 * which shows up as `currentTime` moving while PAUSED, since a paused clock has no other reason to
 * change. The first heartbeat of a session is not a touch: there is nothing to compare it to, and
 * treating it as one would take the controls from every player the moment a GM connected.
 */
export function gmClockTouched(prev: GmClockSample | null, next: GmClockSample | null): boolean {
	if (!next) return false;
	if (next.isPlaying) return true;
	if (!prev) return false;
	return next.currentTime !== prev.currentTime;
}

export function resolveClockOwnership(inputs: ClockInputs): ClockOwnership {
	const { presetInteractive, followGM, gmTime, gmHoldsClock = false } = inputs;

	// A running GM clock is the GM saying "this moment matters" while it runs. A TOUCH of the clock
	// says the same thing and then stops saying it, so the caller latches that into `gmHoldsClock`
	// and only a player asking for the controls clears it.
	const gmRunning = gmTime?.isPlaying === true;
	const noGm = gmTime === null || gmTime === undefined;

	// Nobody can hold a clock that is not there. Without a heartbeat the latch is meaningless, and
	// leaving it set would strand a player on a GM who has gone.
	const gmHolds = !noGm && (gmRunning || gmHoldsClock);

	const canScrub = presetInteractive && !followGM && !gmHolds;

	// ...and the converse is NOT simply `!canScrub`. A display-only view with no GM connected has no
	// controls and no GM clock to be on: it keeps its own, and the readout stays blank rather than
	// naming a campaign time it is not actually showing.
	const onGmClock = followGM || gmHolds || (!presetInteractive && !noGm);

	// `followGM` is a standing mode and explains itself by having no controls at all. The other two
	// are momentary — a control that was there a moment ago has gone, and that must say why. They say
	// DIFFERENT things, because one of them can be undone by the reader and the other cannot.
	const lockReason = followGM ? null : gmRunning ? 'The GM is running the clock' : gmHolds ? 'The GM moved the clock' : null;

	// Offered only when there is something to take and taking it would stick. While the GM's clock
	// runs it would be undone on the next heartbeat, which is worse than not offering it.
	const canReclaim = presetInteractive && !followGM && !noGm && !gmRunning && gmHoldsClock;

	return { canScrub, onGmClock, lockReason, canReclaim };
}
