// WHAT COUNTS AS "A FOREGROUND UI IS OPEN" — one answer, registered by the UI itself (A52).
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
// A NEW FLOATING CONTROL (G28's undo/redo pill is the next one) does NOT register through this — it is
// chrome, not foreground. It should READ `foregroundOpen` and hide itself on mobile exactly as AppShell
// does. Registering it here would make the chrome hide itself whenever it was visible.
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

/** Test/recovery hatch: force the count back to zero. Never call this from UI code. */
export function __resetForeground() {
  count.set(0);
}
