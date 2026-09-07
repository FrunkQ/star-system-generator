// ONE behaviour for every floating on-canvas control (the time transport, the body picker, and
// whatever comes next). Two lookalikes drift; a shared module cannot.
//
// The contract, identical for all of them:
//   - a small GRIP moves the control (the lock doubles as one while the control is locked), and
//     the position is remembered as a GAP FROM THE NEAREST EDGE of the box that would clip it, so
//     it moves with that edge when the box changes shape (a detail pane, a bar, a phone), is never
//     stranded off screen or under the rail, and a desktop drag cannot strand it off a phone;
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
  /**
   * Which edge of its stage the control was nearest when last settled, and its gap from it (px).
   * The offset above is what the DOM renders; this is what SURVIVES a change of shape: a
   * right-hand control keeps its distance from the right edge when a detail pane narrows the
   * canvas, a left-hand one stays put, and the same saved control lands in the same place on a
   * different host. Absent until the control has been laid out once. (A97)
   */
  ex?: 'left' | 'right';
  gx?: number;
  ey?: 'top' | 'bottom';
  gy?: number;
  /**
   * The GM CHOSE that axis's edge, so `settle` stops re-reading the nearest one (G81). The guess is
   * right at the sides and wrong in the middle of a wide screen: a control sitting just left of
   * centre is nearest the LEFT edge, and a GM who wants it to travel with the right-hand pane has
   * no way to say so. One flag per axis, and the choice is the whole difference - the gap is still
   * measured from wherever the control actually is, so choosing an edge never makes it jump.
   */
  fx?: boolean;
  fy?: boolean;
}

/** The five things the edge menu can say. One list, not five branches. (G81) */
export type EdgeChoice = 'left' | 'right' | 'top' | 'bottom' | 'nearest';

export const EDGE_CHOICES: { choice: EdgeChoice; label: string }[] = [
  { choice: 'left', label: 'Pin to the left edge' },
  { choice: 'right', label: 'Pin to the right edge' },
  { choice: 'top', label: 'Pin to the top edge' },
  { choice: 'bottom', label: 'Pin to the bottom edge' },
  { choice: 'nearest', label: 'Nearest edge (automatic)' }
];

export interface FloatingControl extends Readable<FloatingState> {
  /** Action for the outermost element: anchors the drag clamp and the outside-click dismissal. */
  root: (node: HTMLElement) => { destroy(): void };
  /** Action for the drag handle (the grip, or a collapsed puck that doubles as one). */
  grip: (node: HTMLElement) => { destroy(): void };
  setOpen(v: boolean): void;
  toggleOpen(): void;
  togglePin(): void;
  /**
   * Where the edge menu should be drawn, or null while it is shut. A right-click or a long-press on
   * ANY handle opens it - which is why it lives on the `grip` action rather than in a host: the grip
   * and the lock both carry that action, so all four hosts gain the gesture without one of them
   * knowing about it.
   */
  edgeMenu: Readable<{ x: number; y: number } | null>;
  closeEdgeMenu(): void;
  /** Take one of the five choices. The control does NOT move; only what it measures from changes. */
  chooseEdge(choice: EdgeChoice): void;
  /**
   * True when the gesture just finished on the grip was a DRAG, so a puck that doubles as its own
   * handle can ignore the click that follows. CONSUMES the flag: a click with no pointer gesture
   * behind it (keyboard activation) must not inherit the verdict of some earlier drag.
   */
  didDrag(): boolean;
}

const EDGE = 4; // keep this much of the control inside its bounds
const TAP_SLOP = 4; // px of movement below which a grip gesture is still a tap
const SETTLED = 0.5; // px below which a gap or offset has not moved (sub-pixel layout noise)
const LONG_PRESS = 500; // ms of a still finger before the edge menu opens instead of a drag

/**
 * The box a control must stay inside: the nearest ancestor that CLIPS (any overflow but visible),
 * or null for the viewport alone. The orrery and starmap wrappers clip, so a control pushed past
 * their edge does not sit over the rail - it VANISHES under it. The clip box is the honest bound.
 */
export function nearestClippingAncestor(node: Element): Element | null {
  if (typeof getComputedStyle === 'undefined') return null;
  for (let el = node.parentElement; el && el !== document.body; el = el.parentElement) {
    const overflow = getComputedStyle(el).overflow || 'visible';
    if (overflow !== 'visible') return el;
  }
  return null;
}

export interface FloatingOptions {
  enabled?: boolean;
  /** The box to clamp inside; defaults to the nearest clipping ancestor of the root element. */
  stage?: (root: HTMLElement) => Element | null;
}

export function createFloatingControl(
  storageKey: string,
  defaults: Partial<FloatingState> = {},
  options: FloatingOptions = {}
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
    if (resized) scheduleClamp(true);
  }

  let clampTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Re-settle once the DOM has caught up. A macrotask, NOT requestAnimationFrame: rAF is suspended
   * while the page is not painting (background tab, minimised window), and a control that opened
   * off-screen while hidden would then still be off-screen when you came back to it.
   * `fromEdge` says whether the remembered edge gap drives the place (the box changed shape, or the
   * control has just mounted) or the current place is the truth (the user has just dragged it).
   */
  function scheduleClamp(fromEdge: boolean) {
    if (clampTimer !== null) clearTimeout(clampTimer);
    clampTimer = setTimeout(() => { clampTimer = null; settle(fromEdge); }, 0);
  }

  let rootEl: HTMLElement | null = null;
  let stageEl: Element | null = null;
  let dragged = false;

  /** The stage intersected with the viewport, inset by EDGE: nothing may leave either. */
  function bounds() {
    let left = 0, top = 0, right = window.innerWidth, bottom = window.innerHeight;
    if (stageEl) {
      const b = stageEl.getBoundingClientRect();
      if (b.width || b.height) {
        left = Math.max(left, b.left);
        top = Math.max(top, b.top);
        right = Math.min(right, b.right);
        bottom = Math.min(bottom, b.bottom);
      }
    }
    return { left: left + EDGE, top: top + EDGE, right: right - EDGE, bottom: bottom - EDGE };
  }

  const edgeMenu = writable<{ x: number; y: number } | null>(null);
  let menuOpen = false;
  edgeMenu.subscribe((v) => { menuOpen = v !== null; });

  function onOutside(e: Event) {
    if (!rootEl || rootEl.contains(e.target as Node)) return;
    // The edge menu is drawn OUTSIDE the control (it would be clipped by the stage otherwise), so
    // without this a tap on one of its items would put the control away underneath it.
    if (menuOpen) return;
    if (s.pinned || !s.open) return;
    set({ open: false });
  }

  const noop = { destroy() { /* disabled */ } };

  /**
   * Settle the control inside its bounds. With `fromEdge`, its place is its remembered gap from
   * its nearest edge (so it MOVES WITH that edge); otherwise its place is where it is now. Either
   * way it is then held inside the bounds - right/bottom corrected first so top/left wins for
   * anything larger than the box - and the nearest edge and gap are re-read from where it settled.
   * The stored state is shared across devices, so a control dragged to the far edge of a desktop
   * would otherwise open off a phone entirely - with no puck left to grab.
   */
  function settle(fromEdge: boolean) {
    if (!rootEl || typeof window === 'undefined') return;
    const r = rootEl.getBoundingClientRect();
    if (!r.width && !r.height) return; // not laid out yet
    const ax = r.left - s.dx, ay = r.top - s.dy; // where the host's anchor is now
    const b = bounds();
    let left = r.left, top = r.top;
    if (fromEdge && s.ex && s.gx !== undefined) left = s.ex === 'right' ? b.right - s.gx - r.width : b.left + s.gx;
    if (fromEdge && s.ey && s.gy !== undefined) top = s.ey === 'bottom' ? b.bottom - s.gy - r.height : b.top + s.gy;
    if (left + r.width > b.right) left = b.right - r.width;
    if (top + r.height > b.bottom) top = b.bottom - r.height;
    if (left < b.left) left = b.left;
    if (top < b.top) top = b.top;
    const dx = left - ax, dy = top - ay;
    const gl = left - b.left, gr = b.right - (left + r.width);
    const gt = top - b.top, gb = b.bottom - (top + r.height);
    // A CHOSEN edge is kept; otherwise the nearest one is re-read from where the control now is.
    // The gap is measured from whichever edge that turns out to be, which is the same expression
    // for both cases - for an unchosen axis the nearest edge IS the smaller of the two gaps.
    const ex: 'left' | 'right' = s.fx && s.ex ? s.ex : gr < gl ? 'right' : 'left';
    const ey: 'top' | 'bottom' = s.fy && s.ey ? s.ey : gb < gt ? 'bottom' : 'top';
    const gx = Math.max(0, ex === 'right' ? gr : gl), gy = Math.max(0, ey === 'bottom' ? gb : gt);
    const moved = Math.abs(dx - s.dx) >= SETTLED || Math.abs(dy - s.dy) >= SETTLED;
    const rehomed =
      ex !== s.ex || ey !== s.ey || s.gx === undefined || s.gy === undefined ||
      Math.abs(gx - s.gx) >= SETTLED || Math.abs(gy - s.gy) >= SETTLED;
    if (moved || rehomed) set({ dx, dy, ex, gx, ey, gy });
  }

  const root = (node: HTMLElement) => {
    if (!enabled) return noop;
    rootEl = node;
    stageEl = options.stage ? options.stage(node) : nearestClippingAncestor(node);
    // The box changes shape without the window doing so - a detail pane opening narrows the canvas
    // and would drag a centre-anchored control with it. Re-settle from the remembered edge then.
    const onResize = () => settle(true);
    let ro: ResizeObserver | null = null;
    if (stageEl && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => scheduleClamp(true));
      ro.observe(stageEl);
    }
    // Capture phase: the control must put itself away even when the thing being touched stops
    // propagation for its own reasons (canvas gestures do exactly that).
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('resize', onResize);
    scheduleClamp(true);
    return {
      destroy() {
        if (clampTimer !== null) { clearTimeout(clampTimer); clampTimer = null; }
        document.removeEventListener('pointerdown', onOutside, true);
        window.removeEventListener('resize', onResize);
        ro?.disconnect();
        if (rootEl === node) { rootEl = null; stageEl = null; }
      }
    };
  };

  const grip = (node: HTMLElement) => {
    if (!enabled) return noop;
    let dragging = false;
    let startX = 0, startY = 0, baseX = 0, baseY = 0;

    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    const cancelPress = () => { if (pressTimer !== null) { clearTimeout(pressTimer); pressTimer = null; } };

    const down = (e: PointerEvent) => {
      // A right-click is the edge menu, never a drag - and without this guard the secondary button
      // would start one and leave the control mid-move under an open menu. `button` is the test
      // rather than `pointerType`: a touch or pen contact reports button 0, so this reads "the
      // primary contact" for every kind of pointer and needs no branch per device.
      if (e.button > 0) return;
      dragging = true;
      dragged = false;
      startX = e.clientX; startY = e.clientY;
      baseX = s.dx; baseY = s.dy;
      try { node.setPointerCapture(e.pointerId); } catch { /* not capturable — pointermove still fires */ }
      // A STILL FINGER IS THE TOUCH FORM OF A RIGHT-CLICK. It abandons the drag and marks the
      // gesture as "not a tap", so the click that follows does not also toggle the lock it is on.
      cancelPress();
      pressTimer = setTimeout(() => {
        pressTimer = null;
        if (!dragging) return;
        dragging = false;
        dragged = true;
        try { node.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
        edgeMenu.set({ x: startX, y: startY });
      }, LONG_PRESS);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const mx = e.clientX - startX, my = e.clientY - startY;
      if (Math.abs(mx) + Math.abs(my) > TAP_SLOP) { dragged = true; cancelPress(); }
      let dx = baseX + mx, dy = baseY + my;
      // Clamp against the rect as last painted: one frame stale, so it converges over the drag
      // rather than snapping. Same approach the time pill has always used.
      if (rootEl && typeof window !== 'undefined') {
        const r = rootEl.getBoundingClientRect();
        const b = bounds();
        if (r.left < b.left) dx += b.left - r.left;
        if (r.top < b.top) dy += b.top - r.top;
        if (r.right > b.right) dx -= r.right - b.right;
        if (r.bottom > b.bottom) dy -= r.bottom - b.bottom;
      }
      set({ dx, dy }, false); // persist on release, not on every frame
    };
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      cancelPress();
      dragging = false;
      edgeMenu.set({ x: e.clientX, y: e.clientY });
    };
    const up = () => {
      cancelPress();
      if (!dragging) return;
      dragging = false;
      set({}, true);
      // The in-drag clamp works off a rect that is one frame behind, so it converges during a slow
      // drag but a flick that ENDS at the edge can stop just past it. One authoritative correction
      // on release, against a settled rect (and it persists again if it moves anything) - and the
      // nearest edge is re-read from where the control was LEFT, never from where it was.
      scheduleClamp(false);
    };

    node.addEventListener('pointerdown', down);
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('contextmenu', onContextMenu);
    return {
      destroy() {
        cancelPress();
        node.removeEventListener('pointerdown', down);
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', up);
        node.removeEventListener('pointercancel', up);
        node.removeEventListener('contextmenu', onContextMenu);
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
    edgeMenu: { subscribe: edgeMenu.subscribe },
    closeEdgeMenu: () => edgeMenu.set(null),
    // CHOOSING AN EDGE NEVER MOVES THE CONTROL. It stays exactly where the GM left it and only the
    // edge it is measured FROM changes, so it now travels with that edge. `settle(false)` re-reads
    // the gap from where the control actually is - which is why the choice is a flag rather than a
    // second placement path.
    chooseEdge: (choice: EdgeChoice) => {
      edgeMenu.set(null);
      if (choice === 'nearest') set({ fx: false, fy: false });
      else if (choice === 'left' || choice === 'right') set({ ex: choice, fx: true });
      else set({ ey: choice, fy: true });
      scheduleClamp(false);
    },
    didDrag: () => { const v = dragged; dragged = false; return v; }
  };
}
