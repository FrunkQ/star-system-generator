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

const EDGE = 4; // keep this much of the control inside its bounds
const TAP_SLOP = 4; // px of movement below which a grip gesture is still a tap
const SETTLED = 0.5; // px below which a gap or offset has not moved (sub-pixel layout noise)

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

  function onOutside(e: Event) {
    if (!rootEl || rootEl.contains(e.target as Node)) return;
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
    const ex: 'left' | 'right' = gr < gl ? 'right' : 'left';
    const ey: 'top' | 'bottom' = gb < gt ? 'bottom' : 'top';
    const gx = Math.max(0, Math.min(gl, gr)), gy = Math.max(0, Math.min(gt, gb));
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
        const b = bounds();
        if (r.left < b.left) dx += b.left - r.left;
        if (r.top < b.top) dy += b.top - r.top;
        if (r.right > b.right) dx -= r.right - b.right;
        if (r.bottom > b.bottom) dy -= r.bottom - b.bottom;
      }
      set({ dx, dy }, false); // persist on release, not on every frame
    };
    const up = () => {
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
