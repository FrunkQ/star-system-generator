// ONE behaviour for every floating on-canvas control (the time transport, the body picker, and
// whatever comes next). Two lookalikes drift; a shared module cannot.
//
// The contract, identical for all of them:
//   - a small GRIP moves the control, and the position is remembered (clamped to the screen it
//     opens on, so a desktop drag cannot strand it off a phone);
//   - it is PUT AWAY to a puck by default, and opens on demand;
//   - it CLOSES ITSELF as soon as something else is touched -- that is what keeps the canvas clear;
//   - unless it is PINNED, in which case it stays open until you unpin it. Pinning is the opt-out
//     from auto-close, and it is the only thing that survives a reload as "open".
//
// The pin replaces the old minimise button: unpinning also puts the control away, so the same
// physical control still means "I'm done with this" as well as "keep this".

import { writable, type Readable } from 'svelte/store';

export interface FloatingState {
  /** Offset from wherever the host anchored the control, in CSS px. */
  dx: number;
  dy: number;
  /** Expanded (true) or collapsed to its puck (false). */
  open: boolean;
  /** Pinned open: suppresses auto-close. */
  pinned: boolean;
}

export interface FloatingControl extends Readable<FloatingState> {
  /** Action for the outermost element: anchors the drag clamp and the outside-click dismissal. */
  root: (node: HTMLElement) => { destroy(): void };
  /** Action for the drag handle (the grip, or a collapsed puck that doubles as one). */
  grip: (node: HTMLElement) => { destroy(): void };
  setOpen(v: boolean): void;
  toggleOpen(): void;
  togglePin(): void;
  /**
   * True when the gesture just finished on the grip was a DRAG, so a puck that doubles as its own
   * handle can ignore the click that follows. CONSUMES the flag: a click with no pointer gesture
   * behind it (keyboard activation) must not inherit the verdict of some earlier drag.
   */
  didDrag(): boolean;
}

const EDGE = 4; // keep this much of the control on screen
const TAP_SLOP = 4; // px of movement below which a grip gesture is still a tap

export function createFloatingControl(
  storageKey: string,
  defaults: Partial<FloatingState> = {},
  options: { enabled?: boolean } = {}
): FloatingControl {
  const enabled = options.enabled ?? true;
  let s: FloatingState = { dx: 0, dy: 0, open: false, pinned: false, ...defaults };

  if (enabled && typeof localStorage !== 'undefined') {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && typeof saved === 'object') s = { ...s, ...saved };
    } catch { /* corrupt — ignore and use the defaults */ }
  }
  // An UNPINNED control always starts put away. Remembering "open" for something that closes on the
  // next tap anywhere would just be a stale state to explain.
  if (!s.pinned) s.open = false;

  const store = writable<FloatingState>(s);

  function set(patch: Partial<FloatingState>, persist = true) {
    // Opening, or locking (which hides the grip), changes the control's SIZE — so it can now stick
    // off an edge it fitted inside a moment ago. Re-clamp once the DOM has caught up.
    const resized =
      ('open' in patch && patch.open !== s.open) || ('pinned' in patch && patch.pinned !== s.pinned);
    s = { ...s, ...patch };
    store.set(s);
    if (persist && enabled && typeof localStorage !== 'undefined') {
      try { localStorage.setItem(storageKey, JSON.stringify(s)); } catch { /* private mode */ }
    }
    if (resized) scheduleClamp();
  }

  let clampTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Re-clamp once the DOM has caught up. A macrotask, NOT requestAnimationFrame: rAF is suspended
   * while the page is not painting (background tab, minimised window), and a control that opened
   * off-screen while hidden would then still be off-screen when you came back to it.
   */
  function scheduleClamp() {
    if (clampTimer !== null) clearTimeout(clampTimer);
    clampTimer = setTimeout(() => { clampTimer = null; clampIntoView(); }, 0);
  }

  let rootEl: HTMLElement | null = null;
  let dragged = false;

  function onOutside(e: Event) {
    if (!rootEl || rootEl.contains(e.target as Node)) return;
    if (s.pinned || !s.open) return;
    set({ open: false });
  }

  const noop = { destroy() { /* disabled */ } };

  /**
   * Pull the control back on screen. The stored offset is shared across devices, so one dragged to
   * the far edge of a desktop would otherwise open off a phone entirely — with no puck left to grab.
   * Right/bottom are corrected first so top/left wins for anything larger than the viewport.
   */
  function clampIntoView() {
    if (!rootEl || typeof window === 'undefined') return;
    const r = rootEl.getBoundingClientRect();
    if (!r.width && !r.height) return; // not laid out yet
    let dx = s.dx, dy = s.dy;
    if (r.right > window.innerWidth - EDGE) dx -= r.right - (window.innerWidth - EDGE);
    if (r.bottom > window.innerHeight - EDGE) dy -= r.bottom - (window.innerHeight - EDGE);
    const left = r.left + (dx - s.dx);
    const top = r.top + (dy - s.dy);
    if (left < EDGE) dx += EDGE - left;
    if (top < EDGE) dy += EDGE - top;
    if (dx !== s.dx || dy !== s.dy) set({ dx, dy });
  }

  const root = (node: HTMLElement) => {
    if (!enabled) return noop;
    rootEl = node;
    // Capture phase: the control must put itself away even when the thing being touched stops
    // propagation for its own reasons (canvas gestures do exactly that).
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('resize', clampIntoView);
    scheduleClamp();
    return {
      destroy() {
        if (clampTimer !== null) { clearTimeout(clampTimer); clampTimer = null; }
        document.removeEventListener('pointerdown', onOutside, true);
        window.removeEventListener('resize', clampIntoView);
        if (rootEl === node) rootEl = null;
      }
    };
  };

  const grip = (node: HTMLElement) => {
    if (!enabled) return noop;
    let dragging = false;
    let startX = 0, startY = 0, baseX = 0, baseY = 0;

    const down = (e: PointerEvent) => {
      dragging = true;
      dragged = false;
      startX = e.clientX; startY = e.clientY;
      baseX = s.dx; baseY = s.dy;
      try { node.setPointerCapture(e.pointerId); } catch { /* not capturable — pointermove still fires */ }
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const mx = e.clientX - startX, my = e.clientY - startY;
      if (Math.abs(mx) + Math.abs(my) > TAP_SLOP) dragged = true;
      let dx = baseX + mx, dy = baseY + my;
      // Clamp against the rect as last painted: one frame stale, so it converges over the drag
      // rather than snapping. Same approach the time pill has always used.
      if (rootEl && typeof window !== 'undefined') {
        const r = rootEl.getBoundingClientRect();
        if (r.left < EDGE) dx += EDGE - r.left;
        if (r.top < EDGE) dy += EDGE - r.top;
        if (r.right > window.innerWidth - EDGE) dx -= r.right - (window.innerWidth - EDGE);
        if (r.bottom > window.innerHeight - EDGE) dy -= r.bottom - (window.innerHeight - EDGE);
      }
      set({ dx, dy }, false); // persist on release, not on every frame
    };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      set({}, true);
      // The in-drag clamp works off a rect that is one frame behind, so it converges during a slow
      // drag but a flick that ENDS at the edge can stop just past it. One authoritative correction
      // on release, against a settled rect (and it persists again if it moves anything).
      scheduleClamp();
    };

    node.addEventListener('pointerdown', down);
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    return {
      destroy() {
        node.removeEventListener('pointerdown', down);
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', up);
        node.removeEventListener('pointercancel', up);
      }
    };
  };

  return {
    subscribe: store.subscribe,
    root,
    grip,
    setOpen: (v: boolean) => set({ open: v }),
    toggleOpen: () => set({ open: !s.open }),
    // Unpinning also puts the control away: the pin took over the minimise button's place, so it
    // has to keep meaning "I'm done with this" as well as "keep this".
    togglePin: () => (s.pinned ? set({ pinned: false, open: false }) : set({ pinned: true, open: true })),
    didDrag: () => { const v = dragged; dragged = false; return v; }
  };
}
