// LETTING A MODAL TAKE OVER THE SCREEN ON MOBILE — two markers and ONE rule (A52).
//
// THE SHAPE, because getting this wrong once already cost a rewrite: BOTH SIDES DECLARE THEMSELVES.
// A dialog says "I am foreground" (`use:foreground`); a bar, rail or floating control says "I am
// chrome" (`use:chrome`). A single CSS rule in `styles/tokens.css` joins them — when anything is
// foreground and the viewport is not a desktop, chrome is not displayed. Nothing anywhere holds a
// LIST: not of modal names, and not of chrome names either.
//
// THE FIRST ATTEMPT PUT `{#if}` GATES IN EACH COMPONENT and it was wrong twice over. It was a list of
// chrome by another name, so every new floating control would have to remember the condition — and it
// treated the time control as a special case when the owner's point was that it is not special ("it
// can move"). It also UNMOUNTED the bar, throwing away whatever state it held, when all that was ever
// wanted was for it to stop being drawn. Hiding is what "take over" means; destroying is not.
//
// WHY THIS CANNOT BE "HIDE THE APP SHELL" — measured, because it is the obvious idea: the reported bar
// is rendered OUTSIDE `<AppShell>` (a sibling, not a child), exactly like the modals are, so hiding the
// shell misses the one thing that was reported while risking the canvas-resize trap (RENDER-B1).
//
// WHAT COUNTS AS "A FOREGROUND UI IS OPEN" — one answer, registered by the UI itself.
//
// A phone GM reported the bottom "My Starmap" bar covering the foot of the real-sky import dialog,
// with the floating time control across its middle: the panel they were trying to read was sandwiched
// between two pieces of persistent chrome. Fixing those two would have left the next dialog to be
// reported separately, because there was nothing that KNEW a dialog was open.
//
// THE RULE IS STATE-DEPENDENT AND BREAKPOINT-DEPENDENT, and both halves are needed (owner, 2026-08-16):
//   (a) NOTHING IN THE FOREGROUND -> chrome COLLAPSES, never disappears. On the starmap with nothing
//       selected that bar is the ONLY route to the starmap description and the GM notes, so removing it
//       costs a phone GM two fields they cannot reach any other way.
//   (b) A FOREGROUND UI OPEN ON A SMALL SCREEN -> chrome HIDDEN OUTRIGHT, restored on dismiss. Not
//       dimmed, not lowered, not collapsed. The word that settles it is UNREACHABLE: while a modal is
//       up that bar cannot be used anyway, so collapsing it is a half-measure that still eats screen.
//       On DESKTOP "yield" means order-and-dim instead, because there is room for both.
//
// WHY AN ACTION RATHER THAN A LIST OF MODAL NAMES: a list has to be remembered, and the one thing we
// know about this codebase is that a new dialog arrives most weeks. There are 26 modal components and
// they spell their backdrop TWELVE different ways (`modal-backdrop`, `overlay`, `modal-overlay`,
// `dialog-backdrop`...), so there is no CSS selector that catches them either. Registering is one
// attribute on the element that already exists.
//
// USE IT: `<div class="modal-backdrop" use:foreground>` — that is the whole contract. Mount registers,
// unmount releases, and Svelte guarantees the release even if the modal is destroyed by a route change.
//
// A NEW FLOATING CONTROL (G28's undo/redo pill is the next one) takes `use:chrome`, NOT `use:foreground`
// — one attribute, no condition to get right, and it inherits the rule for ever.
import { writable, derived, type Readable } from 'svelte/store';

// A COUNT, not a boolean: modals stack (Settings opens a confirm; the preset editor opens a picker), and
// a boolean would be cleared by the first one to close while another was still up.
const count = writable(0);

/** How many foreground UIs are open. Exposed for diagnostics; prefer `foregroundOpen`. */
export const foregroundDepth: Readable<number> = { subscribe: count.subscribe };

/** True while anything has registered as foreground. */
export const foregroundOpen: Readable<boolean> = derived(count, (n) => n > 0);

/**
 * Svelte action marking an element as a foreground UI — a modal, dialog, or full-screen editor.
 * Put it on the backdrop (the element that already covers the screen), not on the inner panel.
 */
export function foreground(_node: HTMLElement) {
  count.update((n) => n + 1);
  return {
    destroy() {
      // Clamped at zero so a double-destroy (HMR, or a component torn down twice during a route change)
      // cannot drive the count negative and leave the chrome permanently hidden.
      count.update((n) => Math.max(0, n - 1));
    }
  };
}

// The count is mirrored onto the document element so plain CSS can see it. CSS is what actually hides
// the chrome — no component has to know, and the breakpoint is expressed once, in the same media query
// language the rest of the app uses, rather than duplicated as a JS `mode === 'phone'` test.
if (typeof document !== 'undefined') {
  count.subscribe((n) => {
    if (n > 0) document.documentElement.setAttribute('data-foreground', '');
    else document.documentElement.removeAttribute('data-foreground');
  });
}

/**
 * Svelte action marking an element as PERSISTENT CHROME — a bar, rail, FAB or floating control that
 * lives over the map rather than in the flow. It stays exactly as it is until a foreground UI opens on
 * a small screen, at which point it stops being drawn and the dialog has the screen to itself.
 *
 * It is HIDDEN, not unmounted: whatever the control was showing is still there when the dialog closes.
 */
export function chrome(node: HTMLElement) {
  node.classList.add('sse-chrome');
  return {
    destroy() {
      node.classList.remove('sse-chrome');
    }
  };
}

/** Test/recovery hatch: force the count back to zero. Never call this from UI code. */
export function __resetForeground() {
  count.set(0);
}
