// WHOSE CLOCK IS A PLAYER VIEW ON? — the rule, pinned.
//
// Owner, 2026-08-27: "unless the GM says time is important by RUNNING TIME, or it is follow GM - so
// the GM view and player view align. Otherwise the players are free to play with it as a tool; ships
// will not MOVE on their version, as it is not 'true time'." And: "when the players can't scrub time
// it shows the GM time."
import { describe, it, expect } from 'vitest';
import { resolveClockOwnership, gmClockTouched } from './clockOwnership';

const gm = (isPlaying: boolean) => ({ currentTime: 1_800_000_000_000, isPlaying, timeScale: 3600 });

describe('the two faces are complements — you steer, or you are told whose time it is', () => {
	it('an interactive view with a PAUSED GM steers its own clock', () => {
		const r = resolveClockOwnership({ presetInteractive: true, followGM: false, gmTime: gm(false) });
		expect(r.canScrub).toBe(true);
		expect(r.onGmClock).toBe(false);
		expect(r.lockReason).toBeNull();
	});

	it('following the GM: no controls, on their clock, and no explanation needed', () => {
		// The mode IS the explanation — a follow view has never had controls, so nothing has gone away.
		const r = resolveClockOwnership({ presetInteractive: true, followGM: true, gmTime: gm(false) });
		expect(r.canScrub).toBe(false);
		expect(r.onGmClock).toBe(true);
		expect(r.lockReason).toBeNull();
	});

	it('the GM RUNNING time locks an interactive view, and says why', () => {
		// The momentary case: a control that was there a second ago is gone, so it must explain itself
		// or it reads as a bug.
		const r = resolveClockOwnership({ presetInteractive: true, followGM: false, gmTime: gm(true) });
		expect(r.canScrub).toBe(false);
		expect(r.onGmClock).toBe(true);
		expect(r.lockReason).toBe('The GM is running the clock');
	});

	it('and pausing hands the freedom back — WHEN NOTHING IS LATCHED', () => {
		// This is the rule in isolation. In the running app a GM who plays the clock also LATCHES
		// `gmHoldsClock`, so pausing offers the freedom back rather than handing it back; that case is
		// two describes below. Kept separate because they are two rules and the second is the newer one.
		const running = resolveClockOwnership({ presetInteractive: true, followGM: false, gmTime: gm(true) });
		const paused = resolveClockOwnership({ presetInteractive: true, followGM: false, gmTime: gm(false) });
		expect(running.canScrub).toBe(false);
		expect(paused.canScrub).toBe(true);
	});
});

describe('a reader with no controls cannot be wrong on purpose', () => {
	it('a display-only view rides the GM clock when there is one', () => {
		// The projector tier. It had no controls, no readout, no reset, and free-ran at its own default
		// rate forever — the view most likely to be left running all evening.
		const r = resolveClockOwnership({ presetInteractive: false, followGM: false, gmTime: gm(false) });
		expect(r.canScrub).toBe(false);
		expect(r.onGmClock).toBe(true);
	});

	it('...but keeps its own clock when there is NO GM, rather than freezing', () => {
		// The guard that keeps this from turning a disconnected display into a dead one. There is no GM
		// time to show, so the readout stays blank rather than naming a campaign time it is not showing.
		const r = resolveClockOwnership({ presetInteractive: false, followGM: false, gmTime: null });
		expect(r.canScrub).toBe(false);
		expect(r.onGmClock).toBe(false);
		expect(r.lockReason).toBeNull();
	});

	it('onGmClock is NOT merely the negation of canScrub', () => {
		// The case that proves they are two rules and not one: no controls AND not on the GM's clock.
		// Reading one off the other would have named an arbitrary local time as the campaign's.
		const r = resolveClockOwnership({ presetInteractive: false, followGM: false, gmTime: null });
		expect(r.canScrub).toBe(false);
		expect(r.onGmClock).toBe(false);
	});
});

describe('follow outranks everything', () => {
	it('a following view stays on the GM clock whether they are running or paused', () => {
		for (const playing of [true, false]) {
			const r = resolveClockOwnership({ presetInteractive: true, followGM: true, gmTime: gm(playing) });
			expect(r.canScrub).toBe(false);
			expect(r.onGmClock).toBe(true);
		}
	});

	it('and a following view with no GM connected still refuses the controls', () => {
		// followGM is a standing instruction from the GM's preset; losing the heartbeat does not revoke
		// it. There is simply no time to show until it comes back.
		const r = resolveClockOwnership({ presetInteractive: true, followGM: true, gmTime: null });
		expect(r.canScrub).toBe(false);
		expect(r.onGmClock).toBe(true);
	});
});

// ================================================================================================
// A SCRUB COUNTS TOO, AND THE WAY BACK IS THE PLAYER ASKING.
//
// Owner, 2026-08-27: *"When a GM scrubs their own time or does ANYTHING to update the clock
// (including run time) then the player view time controls are disabled."* A scrub is instantaneous,
// so the literal rule flickers; his chosen release is that the player takes the controls back.
// ================================================================================================

describe('gmClockTouched — what counts as the GM touching their clock', () => {
	it('a running clock is a touch, every heartbeat of it', () => {
		expect(gmClockTouched(gm(false), gm(true))).toBe(true);
	});

	it('a PAUSED clock whose time has moved is a scrub, and that is the case this whole change is about', () => {
		const before = { currentTime: 1_800_000_000_000, isPlaying: false, timeScale: 3600 };
		const after = { currentTime: 1_800_000_000_000 + 86400_000, isPlaying: false, timeScale: 3600 };
		expect(gmClockTouched(before, after)).toBe(true);
	});

	it('a paused clock sitting still is NOT a touch, however many heartbeats arrive', () => {
		// The heartbeat is periodic. If a repeat of the same time counted, the controls would be taken
		// from every player within a second of a GM connecting and never given back.
		expect(gmClockTouched(gm(false), gm(false))).toBe(false);
	});

	it('the FIRST heartbeat of a session is not a touch', () => {
		// Nothing to compare it against. Treating it as one would mean a player never had the controls
		// unless they opened the view before the GM did.
		expect(gmClockTouched(null, gm(false))).toBe(false);
	});

	it('and losing the heartbeat is not a touch either', () => {
		expect(gmClockTouched(gm(false), null)).toBe(false);
	});
});

describe('the latch: a GM touch holds the clock until a player asks for it', () => {
	const held = (over: Partial<Parameters<typeof resolveClockOwnership>[0]> = {}) =>
		resolveClockOwnership({ presetInteractive: true, followGM: false, gmTime: gm(false), gmHoldsClock: true, ...over });

	it('after a scrub the controls are away, the view is on GM time, and it says why', () => {
		const r = held();
		expect(r.canScrub).toBe(false);
		expect(r.onGmClock).toBe(true);
		expect(r.lockReason).toBe('The GM moved the clock');
	});

	it('...and the way back is OFFERED, which is the whole point of choosing this release', () => {
		expect(held().canReclaim).toBe(true);
	});

	it('the player takes it back and is free again', () => {
		const r = resolveClockOwnership({ presetInteractive: true, followGM: false, gmTime: gm(false), gmHoldsClock: false });
		expect(r.canScrub).toBe(true);
		expect(r.onGmClock).toBe(false);
		expect(r.canReclaim).toBe(false);
		expect(r.lockReason).toBeNull();
	});

	it('a RUNNING clock is held the same way but offers nothing to take', () => {
		// Taking it back would be undone on the next heartbeat, and a button that does not stick is
		// worse than no button. The reason given differs for the same reason: one is undoable, one is not.
		const r = held({ gmTime: gm(true) });
		expect(r.canScrub).toBe(false);
		expect(r.canReclaim).toBe(false);
		expect(r.lockReason).toBe('The GM is running the clock');
	});

	it('pausing after a run does NOT hand the clock back on its own — the player must ask', () => {
		// The behaviour that changed. Running latches the hold, so a GM who stops does not silently
		// return the controls; they appear as an offer instead.
		const r = held({ gmTime: gm(false) });
		expect(r.canScrub).toBe(false);
		expect(r.canReclaim).toBe(true);
	});

	it('a latch left set on a GM who has GONE strands nobody', () => {
		// No heartbeat means no clock to be held by. Without this the player keeps a dead campaign
		// readout and no controls, which is the worst of both.
		const r = resolveClockOwnership({ presetInteractive: true, followGM: false, gmTime: null, gmHoldsClock: true });
		expect(r.canScrub).toBe(true);
		expect(r.onGmClock).toBe(false);
		expect(r.canReclaim).toBe(false);
	});

	it('following the GM outranks the latch, and still explains itself by having no controls', () => {
		const r = held({ followGM: true });
		expect(r.canScrub).toBe(false);
		expect(r.onGmClock).toBe(true);
		expect(r.canReclaim).toBe(false);
		expect(r.lockReason).toBeNull();
	});

	it('a display-only view is never offered the controls, latched or not', () => {
		expect(held({ presetInteractive: false }).canReclaim).toBe(false);
		expect(held({ presetInteractive: false }).canScrub).toBe(false);
	});
});
