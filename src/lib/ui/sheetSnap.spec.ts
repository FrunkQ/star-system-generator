/**
 * A84 — the phone sheet's height follows its content, and only ever upward.
 *
 * RUN AGAINST THE PREVIOUS COMMIT THIS IS RED BY ABSENCE: there was no rule at all, `sheetSnap` was
 * declared and never written, and every detail pane opened into an 86-pixel peek sheet. The live
 * measurement that produced these cases is on the module.
 */
import { describe, it, expect } from 'vitest';
import { wantedSnap, promoteSnap, nextSnap, contentKey, type Snap, type SheetContent } from './sheetSnap';

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

/**
 * A92 — THE PROMOTION IS AN EDGE, NOT A LEVEL, AND GETTING THAT WRONG TOOK THE SHEET AWAY FROM
 * THE GM ENTIRELY.
 *
 * Owner, straight after A84 shipped: *"Collapse does not collapse it all the way back to name
 * tab"*. MEASURED at 375x812: a selected body put the sheet at 407 px and Collapse left it at 407.
 * Worse than reported — the header tap cycle could not move it either. The sheet was stuck.
 *
 * WHY, and it is the whole lesson: `promoteSnap` only ever grows, which was meant to stop the rule
 * shrinking the sheet under the GM. It does. But the rule was evaluated on EVERY reactive pass,
 * and `sheetSnap` is one of its own dependencies — so the instant the GM set it to `peek`, the
 * rule ran again, saw a body still focused, and promoted it straight back. "Never shrink it under
 * them" and "never GROW it under them" are two different promises and only the first was kept.
 *
 * THE EDGE IS A CONTENT KEY, NOT A SNAP, and that distinction is the second half of the fix: two
 * different bodies both want `half`, so comparing the wanted SIZE would treat tapping a new world
 * as "nothing changed" and leave the GM looking at a collapsed sheet with someone else's name on
 * it. Comparing the pane's IDENTITY gets both: a collapse holds, and a fresh tap opens.
 */
describe('A92 — promoting on the EDGE, so the GM keeps control of the sheet', () => {
	const body = (id: string): SheetContent => ({ focused: true, focusId: id, fullPanel: false });
	const nothing: SheetContent = { focused: false, focusId: null, fullPanel: false };
	const flow: SheetContent = { focused: true, focusId: 'iss', fullPanel: true };

	it('promotes when the content changes', () => {
		expect(nextSnap('peek', body('earth'), null).snap).toBe('half');
		expect(nextSnap('half', flow, contentKey(body('iss'))).snap).toBe('full');
	});

	it('LEAVES A COLLAPSE ALONE — the bug the owner reported, as one assertion', () => {
		// The GM pressed Collapse: snap is peek, the same body is still selected.
		const key = contentKey(body('earth'));
		expect(nextSnap('peek', body('earth'), key).snap, 'the sheet must stay collapsed').toBe('peek');
		// ...and it must keep staying collapsed on every pass after that, not just the first.
		let snap: Snap = 'peek';
		for (let i = 0; i < 5; i++) snap = nextSnap(snap, body('earth'), key).snap;
		expect(snap).toBe('peek');
	});

	it('leaves the tap cycle alone too — peek, half and full are all reachable by hand', () => {
		const key = contentKey(body('earth'));
		for (const chosen of ['peek', 'half', 'full'] as Snap[]) {
			expect(nextSnap(chosen, body('earth'), key).snap, `the GM chose ${chosen}`).toBe(chosen);
		}
	});

	it('a DIFFERENT body is a fresh request, and opens even from a collapsed sheet', () => {
		// Otherwise a GM who collapsed once would tap world after world at a sheet showing only names.
		expect(nextSnap('peek', body('mars'), contentKey(body('earth'))).snap).toBe('half');
	});

	it('still gives the planner the screen even from a sheet the GM had collapsed', () => {
		expect(nextSnap('peek', flow, contentKey(body('iss'))).snap).toBe('full');
	});

	it('the key tells the three kinds of content apart, and nothing else', () => {
		expect(contentKey(body('earth'))).not.toBe(contentKey(body('mars')));
		expect(contentKey(body('earth'))).toBe(contentKey(body('earth')));
		expect(contentKey(nothing)).not.toBe(contentKey(body('earth')));
		// A flow is a flow whichever body it was opened from — leaving it must not re-promote.
		expect(contentKey(flow)).toBe(contentKey({ focused: true, focusId: 'other', fullPanel: true }));
	});

	it('the whole journey, in order — this is what a GM actually does', () => {
		let snap: Snap = 'peek';
		let key: string | null = null;
		const step = (c: SheetContent) => {
			const r = nextSnap(snap, c, key);
			snap = r.snap;
			key = r.key;
			return snap;
		};
		expect(step(nothing), 'nothing selected').toBe('peek');
		expect(step(body('earth')), 'tap Earth').toBe('half');
		snap = 'peek'; // the GM presses Collapse
		expect(step(body('earth')), 'and it STAYS collapsed').toBe('peek');
		expect(step(body('mars')), 'tap Mars — a fresh request').toBe('half');
		expect(step(flow), 'Plan Transit').toBe('full');
		expect(step(body('iss')), 'Cancel and Return — never shrinks under them').toBe('full');
	});
});
