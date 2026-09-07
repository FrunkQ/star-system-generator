// HOW TALL THE PHONE SHEET SHOULD BE FOR WHAT IS IN IT (A84).
//
// `BottomSheet.svelte` has three snap points and says in its own header that `snap` is bindable
// "so the host can promote it (e.g. to 'half' when a body is selected)". THE HOST NEVER DID.
// `sheetSnap` was declared in `SystemView.svelte`, bound to `AppShell`, and never assigned, so on a
// phone every detail pane opened into an 86-pixel peek sheet and stayed there.
//
// MEASURED at 375x812: tapping "Plan Transit" put a 663 px transit planner inside an 87 px sheet,
// scrolled 379 px above its own top. The GM sees a strip of one panel and nothing tells them to
// drag. That is the owner's "the Constructs Schedule Journey flow is broken on mobile", and it is
// not the planner's fault — the same thing happens to every body detail panel in the system view.
//
// TWO RULES, AND THE SECOND ONE IS WHAT KEEPS IT OUT OF THE USER'S WAY:
//
//   1. THE SHEET'S SIZE FOLLOWS WHAT IS IN IT, not a list of screens. Nothing selected is a peek;
//      a selected body wants half; a FULL-PANEL FLOW — one that replaces the detail pane with a
//      whole workflow of its own — wants the screen.
//   2. IT ONLY EVER PROMOTES, AND ONLY ON AN EDGE. Two promises, and A92 is what it cost to
//      learn they are different. "Never shrink it under them" is `promoteSnap`. "Never GROW it
//      under them" is `nextSnap`, and without it the rule fought the GM: `sheetSnap` is one of
//      the reactive block's own dependencies, so the instant Collapse set it to `peek` the rule
//      ran again, saw a body still selected, and put it straight back to half. Measured at
//      375x812: Collapse left the sheet at 407 px, and the tap cycle could not move it either.
//      The sheet was stuck. So the promotion fires when what is IN the pane changes and at no
//      other time — the same edge-detector shape as `wasOpen` in SettingsModal and
//      `lastSyncedBodyId` in BodyStarTab, both of which exist for exactly this reason.

export type Snap = 'peek' | 'half' | 'full';

/** Taller is higher. Compared rather than ordered by string, so a fourth stop cannot mis-sort. */
const RANK: Record<Snap, number> = { peek: 0, half: 1, full: 2 };

/** What is in the detail pane, in the only terms that change how much room it needs. */
export interface SheetContent {
	/** A body, construct or ship is selected — there is a panel to read. */
	focused: boolean;
	/**
	 * WHICH one, when there is one. It changes nothing about how much room the pane wants; it is
	 * here because it is part of the pane's IDENTITY, and the identity is what the promotion
	 * edges on. Tapping a different world is a fresh request to look at something, so the sheet
	 * opens for it even if the GM had collapsed it on the last one — which is what BottomSheet's
	 * own header always meant by "promote it to 'half' when a body is selected".
	 */
	focusId?: string | null;
	/**
	 * A whole workflow has taken the pane over: the transit planner, a ship's log. These are not
	 * panels with a bit more text, they are screens, and half a screen is not usable.
	 */
	fullPanel: boolean;
}

/** The snap this content wants. Pure; the host decides whether to act on it. */
export function wantedSnap(c: SheetContent): Snap {
	if (c.fullPanel) return 'full';
	return c.focused ? 'half' : 'peek';
}

/**
 * The snap to apply, given where the sheet is now. NEVER SMALLER than it already is — see rule 2.
 * Returns `current` unchanged when there is nothing to do, so a caller can assign unconditionally
 * without causing a reactive loop.
 */
export function promoteSnap(current: Snap, wanted: Snap): Snap {
	return RANK[wanted] > RANK[current] ? wanted : current;
}

/**
 * WHAT IS IN THE PANE, as one comparable string. Two passes with the same key are the same
 * content, whatever else re-ran in between.
 */
export function contentKey(c: SheetContent): string {
	if (c.fullPanel) return 'flow';
	return c.focused ? `body:${c.focusId ?? ''}` : 'none';
}

/**
 * The snap to apply this pass, and the key to remember for the next one.
 *
 * `key === lastKey` means the content has not changed — so whatever the sheet is set to now, the
 * GM set it, and it is left exactly alone. That is the whole of A92, and it is why this takes a
 * key rather than a snap: two different bodies both want `half`, and the GM tapping the second
 * one is a fresh request rather than the same state re-evaluated.
 */
export function nextSnap(
	current: Snap,
	c: SheetContent,
	lastKey: string | null
): { snap: Snap; key: string } {
	const key = contentKey(c);
	return { snap: key === lastKey ? current : promoteSnap(current, wantedSnap(c)), key };
}
