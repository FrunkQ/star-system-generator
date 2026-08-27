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

export interface ClockInputs {
	/** The preset allows interaction at all. A display-only tier has no controls by definition. */
	presetInteractive: boolean;
	/** `followGM`, from the preset or the GM's live override. A standing mode. */
	followGM: boolean;
	/** The GM's heartbeat, or null when there is no GM connected. */
	gmTime: { currentTime: number; isPlaying: boolean; timeScale: number } | null;
}

export interface ClockOwnership {
	/** Does this reader get time controls? */
	canScrub: boolean;
	/** Is this view running on the GM's absolute time and rate? */
	onGmClock: boolean;
	/** Short reason the controls are away, for a MOMENTARY lock. Null when there is nothing to explain
	 *  — either the controls are present, or their absence is the standing mode the reader is in. */
	lockReason: string | null;
}

export function resolveClockOwnership(inputs: ClockInputs): ClockOwnership {
	const { presetInteractive, followGM, gmTime } = inputs;

	// A running GM clock is the GM saying "this moment matters". Pausing hands the freedom back.
	// `isPlaying` has ridden SYNC_TIME all along and nothing read it.
	const gmRunning = gmTime?.isPlaying === true;

	const canScrub = presetInteractive && !followGM && !gmRunning;

	// ...and the converse is NOT simply `!canScrub`. A display-only view with no GM connected has no
	// controls and no GM clock to be on: it keeps its own, and the readout stays blank rather than
	// naming a campaign time it is not actually showing.
	const onGmClock = followGM || gmRunning || (!presetInteractive && gmTime !== null);

	// `followGM` is a standing mode and explains itself by having no controls at all. A running clock
	// is momentary — a control that was there a moment ago has gone, and that must say why.
	const lockReason = !followGM && gmRunning ? 'The GM is running the clock' : null;

	return { canScrub, onGmClock, lockReason };
}
