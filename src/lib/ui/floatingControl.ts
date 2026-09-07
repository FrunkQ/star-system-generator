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
  /**
   * DOCKED: the id of the group this control belongs to (G81). Owner: *"allow them to be pinned
   * together"*. It is a GROUP ID held by every member rather than a parent/child link, because
   * "pinned together" has no direction - three controls in a row are one box, not a chain with a
   * head - and because a member whose host is not mounted (the undo pill only exists while there
   * is something to undo) must be able to leave and rejoin without anyone re-pointing at it.
   */
  dock?: string;
  /**
   * Where this control sits inside its group: px from the group's top-left. Recorded when the group
   * forms, and it is what holds a docked pair together - NOT a shared delta.
   *
   * THE MEMBERS DO NOT SHARE AN ANCHOR. The clock hangs off its stage's top-left, the undo pill off
   * its CENTRE, the picker off a 50% of its own. When the box changes shape those anchors move by
   * DIFFERENT amounts - narrowing the canvas by 260 px moved the pill 130 px and the clock not at
   * all - so nudging every member by one delta preserves nothing. A group settles by placing each
   * member ABSOLUTELY at the group's origin plus its own offset.
   */
  ox?: number;
  oy?: number;
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
  /** Leave the group, if this control is in one. The others stay docked to each other. */
  undock(): void;
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
const SNAP = 12; // px: drop a control this close to another's edge and the two dock
const UNSNAP = 24; // px: a member this far from every other member of its group has drifted out

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

/**
 * EVERY LIVE CONTROL, so that two of them can be docked together (G81).
 *
 * The module makes one INDEPENDENT control per host and that is still the shape - a host knows
 * nothing about any other host. Docking needs the controls to see each other all the same, so they
 * register themselves here while their root action is mounted, and the only thing anyone reads out
 * of it is a box and a group id. A member unmounts (the undo pill disappears when there is nothing
 * to undo) and simply stops being in the union; its saved `dock` waits for it to come back.
 */
interface Member {
  key: string;
  state(): FloatingState;
  stage(): Element | null;
  rect(): { left: number; top: number; right: number; bottom: number; width: number; height: number } | null;
  /** Move by a delta without re-settling: a group drag must not make each member settle itself. */
  nudge(mvx: number, mvy: number, persist: boolean): void;
  /** Where this member sits inside its group, px from the group's top-left. */
  offset(): { ox: number; oy: number };
  /**
   * Hand this member the group's edge and gap. It is NOT moved from here: it places ITSELF, in its
   * own settle, from the same edge - which is the only way the answer comes out right, because a
   * control's offset can only be turned into a position through ITS OWN anchor, and that anchor can
   * only be read from a DOM box that this pass may already have written to.
   */
  shareEdge(edge: Partial<FloatingState>): void;
  join(id: string | undefined, ox: number, oy: number): void;
}

const members = new Set<Member>();

/** The smallest box containing all of them - what a docked group settles as. */
function unionOf(list: Member[]) {
  let box: { left: number; top: number; right: number; bottom: number } | null = null;
  for (const m of list) {
    const r = m.rect();
    if (!r) continue;
    box = box
      ? { left: Math.min(box.left, r.left), top: Math.min(box.top, r.top),
          right: Math.max(box.right, r.right), bottom: Math.max(box.bottom, r.bottom) }
      : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }
  return box && { ...box, width: box.right - box.left, height: box.bottom - box.top };
}

/**
 * How far apart two boxes are: 0 when they touch or overlap. Measured per axis and taken as the
 * larger, which is what "beside each other" means - two controls level with each other and 6 px
 * apart are 6 px apart, and two on opposite corners are as far apart as the diagonal makes them.
 */
function apart(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number }
) {
  const dx = Math.max(0, a.left - b.right, b.left - a.right);
  const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
  return Math.max(dx, dy);
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
  let redockTimer: ReturnType<typeof setTimeout> | null = null;
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
    // THE BOX THAT MUST STAY INSIDE THE BOUNDS IS THE GROUP'S, NOT THIS CONTROL'S - and it is built
    // from the REMEMBERED OFFSETS and the members' live SIZES, never from where they happen to be.
    // Positions drift (the anchors are not the same anchor); sizes do not lie. Undocked, the offsets
    // are zero and every line below reduces to what it did before docking existed - one path, not
    // two, which is why the A97 gates still pin this exactly.
    const group = groupMembers();
    const ox = s.ox ?? 0, oy = s.oy ?? 0;
    let gw = ox + r.width, gh = oy + r.height;
    for (const m of group) {
      if (m === me) continue;
      const mr = m.rect();
      if (!mr) continue;
      const o = m.offset();
      gw = Math.max(gw, o.ox + mr.width);
      gh = Math.max(gh, o.oy + mr.height);
    }
    const b = bounds();
    let left = r.left - ox, top = r.top - oy; // the group's origin, as this member sees it
    if (fromEdge && s.ex && s.gx !== undefined) left = s.ex === 'right' ? b.right - s.gx - gw : b.left + s.gx;
    if (fromEdge && s.ey && s.gy !== undefined) top = s.ey === 'bottom' ? b.bottom - s.gy - gh : b.top + s.gy;
    if (left + gw > b.right) left = b.right - gw;
    if (top + gh > b.bottom) top = b.bottom - gh;
    if (left < b.left) left = b.left;
    if (top < b.top) top = b.top;
    // THROUGH THIS CONTROL'S OWN ANCHOR, and as an absolute assignment rather than an increment.
    // Two settles in one pass both read a DOM box that neither has been repainted for, so an
    // increment applies its correction twice: measured in the browser as a docked pill 120 px past
    // where two passes had each already put it.
    const ax = r.left - s.dx, ay = r.top - s.dy;
    const dx = left + ox - ax, dy = top + oy - ay;
    const mvx = dx - s.dx, mvy = dy - s.dy;
    const gl = left - b.left, gr = b.right - (left + gw);
    const gt = top - b.top, gb = b.bottom - (top + gh);
    // A CHOSEN edge is kept; otherwise the nearest one is re-read from where the control now is.
    // The gap is measured from whichever edge that turns out to be, which is the same expression
    // for both cases - for an unchosen axis the nearest edge IS the smaller of the two gaps.
    //
    // A TIE KEEPS WHAT IT HAD, and the gaps are floored at zero before they are compared. A control
    // as wide as the box it is in is hard against BOTH edges and the "nearer" one is then decided
    // by sub-pixel noise: the clock read-out on a 390px window measured 0.000 from the left and
    // -0.125 from the right, called itself a right-hand control, and moved to the far corner the
    // moment the window was made wide. Nothing in a headless gate sees that, because nothing there
    // has a fractional width.
    const gl0 = Math.max(0, gl), gr0 = Math.max(0, gr);
    const gt0 = Math.max(0, gt), gb0 = Math.max(0, gb);
    const ex: 'left' | 'right' =
      s.fx && s.ex ? s.ex : gr0 < gl0 ? 'right' : gl0 < gr0 ? 'left' : s.ex ?? 'left';
    const ey: 'top' | 'bottom' =
      s.fy && s.ey ? s.ey : gb0 < gt0 ? 'bottom' : gt0 < gb0 ? 'top' : s.ey ?? 'top';
    const gx = ex === 'right' ? gr0 : gl0, gy = ey === 'bottom' ? gb0 : gt0;
    const moved = Math.abs(mvx) >= SETTLED || Math.abs(mvy) >= SETTLED;
    const rehomed =
      ex !== s.ex || ey !== s.ey || s.gx === undefined || s.gy === undefined ||
      Math.abs(gx - s.gx) >= SETTLED || Math.abs(gy - s.gy) >= SETTLED;
    if (moved || rehomed) set({ dx, dy, ex, gx, ey, gy });
    // THE OTHERS ARE NOT MOVED FROM HERE - they are handed the group's EDGE and place themselves.
    // Every member computes the same origin from the same edge (that is what makes it a group) and
    // then converts it through its OWN anchor, which is the only anchor it can read correctly.
    // Moving them from here instead cost two attempts: a shared delta preserves nothing when the
    // anchors differ, and an absolute placement from here reads a DOM box this pass has already
    // written to. A member that shares an edge re-settles itself, so nothing is left behind.
    if (group.length > 1) for (const m of group) if (m !== me) m.shareEdge({ ex, gx, ey, gy });
    // A DOCK IS A CLAIM ABOUT THE GROUP'S LAYOUT, AND IT IS TESTED AGAINST THAT - the remembered
    // offsets and the live SIZES - never against where the members happen to be. Controls change
    // size on their own (the pill widens, the picker opens, the transport expands) and a group whose
    // members have grown apart is a group in name only; but a member whose ANCHOR has just slid out
    // from under it is not adrift, it is one settle away from being put back. Asking the question of
    // the positions undocked a perfectly good pair the moment the canvas changed width.
    if (s.dock && group.length > 1) {
      const mine = { left: ox, top: oy, right: ox + r.width, bottom: oy + r.height };
      const touching = group.some((m) => {
        if (m === me) return false;
        const mr = m.rect();
        if (!mr) return false;
        const o = m.offset();
        return apart(mine, { left: o.ox, top: o.oy, right: o.ox + mr.width, bottom: o.oy + mr.height }) <= UNSNAP;
      });
      if (!touching) {
        set({ dock: undefined, ox: 0, oy: 0 });
        scheduleClamp(false); // its own edge and gap again, not the group's
      }
    }
  }

  /** This control and everyone sharing its group id on the same stage. Just itself when undocked. */
  function groupMembers(): Member[] {
    if (!s.dock) return [me];
    const out = [me];
    for (const m of members) {
      if (m === me || m.state().dock !== s.dock) continue;
      if (m.stage() !== stageEl) continue; // never one box across two canvases
      if (m.rect()) out.push(m);
    }
    return out;
  }

  /**
   * DROP IT BESIDE SOMETHING AND THE TWO DOCK. Run once on release, against the settled rect: any
   * control within SNAP of this one's edge joins its group (or starts one), and this control is
   * nudged the last few pixels so the edges actually meet - a dock that leaves a 9 px gap looks
   * like a near miss rather than a decision.
   */
  function redock() {
    const mine = me.rect();
    if (!mine || !rootEl) return;
    let id = s.dock;
    let snapX = 0, snapY = 0, best = Infinity;
    for (const m of members) {
      if (m === me || m.key === storageKey || m.stage() !== stageEl) continue;
      const r = m.rect();
      if (!r) continue;
      const d = apart(mine, r);
      if (d > SNAP) continue;
      id = m.state().dock || id || 'd' + Math.random().toString(36).slice(2, 8);
      m.join(id, m.offset().ox, m.offset().oy); // the real offsets are written once, below
      if (d < best) {
        best = d;
        snapX = mine.left - r.right >= 0 ? -(mine.left - r.right) : (r.left - mine.right >= 0 ? r.left - mine.right : 0);
        snapY = mine.top - r.bottom >= 0 ? -(mine.top - r.bottom) : (r.top - mine.bottom >= 0 ? r.top - mine.bottom : 0);
      }
    }
    if (id === s.dock && !snapX && !snapY) return;
    if (snapX || snapY) set({ dx: s.dx + snapX, dy: s.dy + snapY });
    if (id !== s.dock) set({ dock: id });
    // WHERE EVERYONE SITS IN THE GROUP IS RECORDED HERE, once, from the boxes as dropped - including
    // this control's own snap, which is why the snap is applied first. From now on the group is laid
    // out from these offsets and not from wherever the members drift to.
    if (id) {
      const joined = [me, ...[...members].filter((m) => m !== me && m.key !== storageKey && m.stage() === stageEl && (m.state().dock === id) && m.rect())];
      const boxes = joined.map((m) => m.rect()!).filter(Boolean);
      const snapped = { left: mine.left + snapX, top: mine.top + snapY };
      const originX = Math.min(snapped.left, ...boxes.slice(1).map((r) => r.left));
      const originY = Math.min(snapped.top, ...boxes.slice(1).map((r) => r.top));
      set({ ox: snapped.left - originX, oy: snapped.top - originY });
      for (let i = 1; i < joined.length; i++) {
        joined[i].join(id, boxes[i].left - originX, boxes[i].top - originY);
      }
    }
    scheduleClamp(false); // the group is a different box now, and its edge is the group's
  }

  const me: Member = {
    key: storageKey,
    state: () => s,
    stage: () => stageEl,
    rect: () => {
      if (!rootEl) return null;
      const r = rootEl.getBoundingClientRect();
      return r.width || r.height
        ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
        : null;
    },
    nudge: (mvx, mvy, persist) => set({ dx: s.dx + mvx, dy: s.dy + mvy }, persist),
    offset: () => ({ ox: s.ox ?? 0, oy: s.oy ?? 0 }),
    shareEdge: (edge) => {
      if (edge.ex === s.ex && edge.gx === s.gx && edge.ey === s.ey && edge.gy === s.gy) return;
      set(edge);
      scheduleClamp(true); // now place yourself from it, with your own anchor
    },
    join: (id, ox, oy) => set({ dock: id, ox, oy })
  };

  const root = (node: HTMLElement) => {
    if (!enabled) return noop;
    rootEl = node;
    // The control MARKS ITSELF as floating chrome, so a palette meant for the floating controls
    // alone (`data-float` on <html>, skins.css) can find every one without anyone keeping a list -
    // the same shape as UI-C6's `use:chrome`. A host added next month is covered because it floats.
    node.classList.add('sse-float');
    let ro: ResizeObserver | null = null;
    /**
     * THE STAGE IS RE-RESOLVED, NOT CAPTURED ONCE. The shell swaps its structure at the tablet and
     * phone breakpoints, so the nearest ancestor that clips this control is not the same element on
     * a narrow window as on a wide one - and a control still observing the box it had at mount is
     * bounded by a node that is no longer between it and the screen. FOUND IN THE BROWSER: the
     * clock kept a 439 px gap from a right edge that had moved 300 px, because the observer was
     * watching the wrong element and nothing fired.
     */
    const resolveStage = () => {
      const next = options.stage ? options.stage(node) : nearestClippingAncestor(node);
      if (next === stageEl && ro) return;
      stageEl = next;
      ro?.disconnect();
      ro = null;
      if (stageEl && typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => scheduleClamp(true));
        ro.observe(stageEl);
      }
    };
    // The box changes shape without the window doing so - a detail pane opening narrows the canvas
    // and would drag a centre-anchored control with it. Re-settle from the remembered edge then.
    const onResize = () => { resolveStage(); settle(true); };
    resolveStage();
    // Capture phase: the control must put itself away even when the thing being touched stops
    // propagation for its own reasons (canvas gestures do exactly that).
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('resize', onResize);
    members.add(me);
    scheduleClamp(true);
    return {
      destroy() {
        members.delete(me);
        if (clampTimer !== null) { clearTimeout(clampTimer); clampTimer = null; }
        if (redockTimer !== null) { clearTimeout(redockTimer); redockTimer = null; }
        document.removeEventListener('pointerdown', onOutside, true);
        window.removeEventListener('resize', onResize);
        ro?.disconnect();
        node.classList.remove('sse-float');
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
      // rather than snapping. Same approach the time pill has always used - except that what is
      // clamped is the GROUP's box, so a docked pair stops when its far member reaches the wall.
      const group = groupMembers();
      if (rootEl && typeof window !== 'undefined') {
        const r = unionOf(group) ?? rootEl.getBoundingClientRect();
        const b = bounds();
        if (r.left < b.left) dx += b.left - r.left;
        if (r.top < b.top) dy += b.top - r.top;
        if (r.right > b.right) dx -= r.right - b.right;
        if (r.bottom > b.bottom) dy -= r.bottom - b.bottom;
      }
      const mvx = dx - s.dx, mvy = dy - s.dy;
      set({ dx, dy }, false); // persist on release, not on every frame
      // ONE GRIP MOVES ALL: the others take the same delta, with no settle of their own. A settle
      // per member per frame is exactly the fight UI-C17 warns about.
      for (const m of group) if (m !== me) m.nudge(mvx, mvy, false);
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
      for (const m of groupMembers()) if (m !== me) m.nudge(0, 0, true);
      // The in-drag clamp works off a rect that is one frame behind, so it converges during a slow
      // drag but a flick that ENDS at the edge can stop just past it. One authoritative correction
      // on release, against a settled rect (and it persists again if it moves anything) - and the
      // nearest edge is re-read from where the control was LEFT, never from where it was.
      scheduleClamp(false);
      // DOCKING IS DECIDED AFTER THE SETTLE, IN A LATER MACROTASK, AND BOTH HALVES OF THAT MATTER.
      // Not per frame, or a control dragged PAST a neighbour snaps to it in passing - the GM's drop
      // is the thing that means something. And not synchronously here either: the offset this drag
      // just wrote reaches the DOM as a Svelte microtask, so `getBoundingClientRect` at this point
      // still returns the box the control had BEFORE the drag. MEASURED IN THE BROWSER: a pill
      // dropped 5.75 px from the clock measured itself 120.75 px away - its own starting distance -
      // and nothing ever docked. Same trap as the in-drag clamp one frame behind (UI-C17).
      if (dragged) {
        if (redockTimer !== null) clearTimeout(redockTimer);
        redockTimer = setTimeout(() => { redockTimer = null; redock(); }, 0);
      }
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
    undock: () => {
      edgeMenu.set(null);
      if (!s.dock) return;
      // A GROUP OF ONE IS NOT A GROUP. Leaving a pair leaves the other member holding a group id
      // with nobody in it - harmless to the layout, and exactly the kind of state that is still
      // there months later when a third control lands beside it and inherits a phantom.
      const left = groupMembers().filter((m) => m !== me);
      if (left.length === 1) left[0].join(undefined, 0, 0);
      set({ dock: undefined, ox: 0, oy: 0 });
      // IT KEEPS THE GROUP'S EDGE AND GAP UNTIL IT IS TOLD OTHERWISE, and those were measured from
      // the whole GROUP - so a control leaving a pair would inherit its neighbour's distance from
      // the wall and the two would settle on top of each other. `settle(false)` re-reads its own.
      scheduleClamp(false);
    },
    didDrag: () => { const v = dragged; dragged = false; return v; }
  };
}
