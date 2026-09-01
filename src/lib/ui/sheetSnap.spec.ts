/**
 * A84 — the phone sheet's height follows its content, and only ever upward.
 *
 * RUN AGAINST THE PREVIOUS COMMIT THIS IS RED BY ABSENCE: there was no rule at all, `sheetSnap` was
 * declared and never written, and every detail pane opened into an 86-pixel peek sheet. The live
 * measurement that produced these cases is on the module.
 */
import { describe, it, expect } from 'vitest';
import { wantedSnap, promoteSnap, type Snap } from './sheetSnap';

describe('A84 — what the sheet wants', () => {
	it('peeks when nothing is selected — the map is what the GM is looking at', () => {
		expect(wantedSnap({ focused: false, fullPanel: false })).toBe('peek');
	});

	it('takes half the screen for a selected body', () => {
		expect(wantedSnap({ focused: true, fullPanel: false })).toBe('half');
	});

	it('takes the SCREEN for a full-panel flow — half a transit planner is not a transit planner', () => {
		expect(wantedSnap({ focused: true, fullPanel: true })).toBe('full');
		// A flow can be open with nothing focused (the pane was taken over); it still wants the room.
		expect(wantedSnap({ focused: false, fullPanel: true })).toBe('full');
	});
});

describe('A84 — promoting never shrinks the sheet under the GM', () => {
	it('grows peek to half to full', () => {
		expect(promoteSnap('peek', 'half')).toBe('half');
		expect(promoteSnap('peek', 'full')).toBe('full');
		expect(promoteSnap('half', 'full')).toBe('full');
	});

	it('leaves a sheet the GM has already dragged taller exactly where it is', () => {
		expect(promoteSnap('full', 'half')).toBe('full');
		expect(promoteSnap('full', 'peek')).toBe('full');
		expect(promoteSnap('half', 'peek')).toBe('half');
	});

	it('is a no-op when nothing changes, so an unconditional assignment cannot loop', () => {
		for (const s of ['peek', 'half', 'full'] as Snap[]) {
			expect(promoteSnap(s, s)).toBe(s);
		}
	});

	it('the worked case: opening the transit planner from a peek sheet gives it the screen', () => {
		let snap: Snap = 'peek';
		snap = promoteSnap(snap, wantedSnap({ focused: true, fullPanel: false })); // tap a ship
		expect(snap).toBe('half');
		snap = promoteSnap(snap, wantedSnap({ focused: true, fullPanel: true })); // Plan Transit
		expect(snap).toBe('full');
		snap = promoteSnap(snap, wantedSnap({ focused: true, fullPanel: false })); // Cancel and Return
		expect(snap, 'and it does not collapse under them on the way back').toBe('full');
	});
});
