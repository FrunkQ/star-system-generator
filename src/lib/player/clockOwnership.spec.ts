// WHOSE CLOCK IS A PLAYER VIEW ON? — the rule, pinned.
//
// Owner, 2026-08-27: "unless the GM says time is important by RUNNING TIME, or it is follow GM - so
// the GM view and player view align. Otherwise the players are free to play with it as a tool; ships
// will not MOVE on their version, as it is not 'true time'." And: "when the players can't scrub time
// it shows the GM time."
import { describe, it, expect } from 'vitest';
import { resolveClockOwnership } from './clockOwnership';

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

	it('and pausing hands the freedom straight back', () => {
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
