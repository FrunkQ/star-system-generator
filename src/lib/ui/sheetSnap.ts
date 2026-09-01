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
//   2. IT ONLY EVER PROMOTES. A GM who has dragged the sheet to full does not want the next
//      selection to shrink it, and a rule that could shrink it would be fighting the finger. The
//      close button still demotes to peek, which is the one place a demotion is asked for.

export type Snap = 'peek' | 'half' | 'full';

/** Taller is higher. Compared rather than ordered by string, so a fourth stop cannot mis-sort. */
const RANK: Record<Snap, number> = { peek: 0, half: 1, full: 2 };

/** What is in the detail pane, in the only terms that change how much room it needs. */
export interface SheetContent {
	/** A body, construct or ship is selected — there is a panel to read. */
	focused: boolean;
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
