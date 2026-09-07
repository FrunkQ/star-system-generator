import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { createFloatingControl, nearestClippingAncestor } from './floatingControl';

/**
 * A97. A floating control is bounded by the box that would CLIP it, not by the window, and it
 * remembers its gap from the nearest edge of that box so it moves WITH the edge when the box
 * changes shape. Both faults were user-reported on the body picker: pinned on the starmap, it slid
 * left under the rail the moment the system view's detail pane narrowed the canvas, and the clamp -
 * which only knew the window - saw nothing wrong with `left: 100`. The rects are mocked and follow
 * the control's own offset, so every assertion here is absolute, in pixels.
 */
type R = { left: number; top: number; width: number; height: number };
const rect = (r: R) =>
  ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON() { /* mock */ } }) as DOMRect;

const KEY = 'test-floating-control';
const STAGE: R = { left: 150, top: 0, width: 750, height: 700 }; // a canvas right of a 150px rail
const SIZE = { width: 200, height: 40 };

function mount(opts: { anchor: { x: number; y: number }; stage: R | null; saved?: Record<string, unknown>; explicitStage?: boolean; size?: { width: number; height: number } }) {
  localStorage.removeItem(KEY);
  if (opts.saved) localStorage.setItem(KEY, JSON.stringify(opts.saved));
  const stageEl = document.createElement('div');
  document.body.appendChild(stageEl);
  const node = document.createElement('div');
  stageEl.appendChild(node);
  let stageRect = opts.stage;
  if (stageRect) {
    stageEl.getBoundingClientRect = () => rect(stageRect as R);
    if (opts.explicitStage === false) stageEl.style.overflow = 'hidden'; // found by the default resolver
  }
  const options = opts.explicitStage === false ? {} : { stage: () => (opts.stage ? stageEl : null) };
  const ctl = createFloatingControl(KEY, {}, options);
  // The rect FOLLOWS the offset, the way a translated element's does.
  const size = opts.size ?? SIZE;
  node.getBoundingClientRect = () => rect({ left: opts.anchor.x + get(ctl).dx, top: opts.anchor.y + get(ctl).dy, ...size });
  const action = ctl.root(node);
  return { ctl, action, node, stageEl, setStage: (r: R) => { stageRect = r; } };
}

const at = (ctl: ReturnType<typeof createFloatingControl>, anchor: { x: number; y: number }) =>
  ({ left: anchor.x + get(ctl).dx, top: anchor.y + get(ctl).dy });

describe('floating control: bounded by its stage, anchored to its nearest edge (A97)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    localStorage.removeItem(KEY);
  });

  it('a control sitting under the rail is pulled back inside its stage, not merely on screen', () => {
    // left: 100 is ON SCREEN (the old clamp allowed anything past 4px) but 50px inside the rail.
    const anchor = { x: 100, y: 60 };
    const { ctl, action } = mount({ anchor, stage: STAGE });
    vi.runAllTimers();
    expect(at(ctl, anchor).left).toBe(154); // stage left 150 + EDGE 4
    const s = get(ctl);
    expect(s.ex).toBe('left');
    expect(s.gx).toBe(0);
    action.destroy();
  });

  it('a right-hand control keeps its gap from the right edge when the stage narrows', () => {
    const anchor = { x: 400, y: 60 };
    const saved = { dx: 0, dy: 0, open: true, pinned: true, ex: 'right', gx: 100, ey: 'top', gy: 8 };
    const { ctl, action, setStage } = mount({ anchor, stage: STAGE, saved });
    vi.runAllTimers();
    expect(at(ctl, anchor)).toEqual({ left: 596, top: 12 }); // 896 - 100 - 200; 4 + 8
    // A detail pane opens: the canvas is 350px wide now. The control follows its edge.
    setStage({ left: 150, top: 0, width: 350, height: 700 });
    window.dispatchEvent(new Event('resize'));
    expect(at(ctl, anchor).left).toBe(196); // 496 - 100 - 200
    action.destroy();
  });

  it('a left-hand control stays put when the right side narrows', () => {
    const anchor = { x: 400, y: 60 };
    const saved = { dx: 0, dy: 0, open: true, pinned: true, ex: 'left', gx: 50, ey: 'top', gy: 8 };
    const { ctl, action, setStage } = mount({ anchor, stage: STAGE, saved });
    vi.runAllTimers();
    expect(at(ctl, anchor).left).toBe(204); // 154 + 50
    setStage({ left: 150, top: 0, width: 350, height: 700 });
    window.dispatchEvent(new Event('resize'));
    expect(at(ctl, anchor).left).toBe(204);
    action.destroy();
  });

  it('a control with no stage is still bounded by the window (the old behaviour, kept)', () => {
    const anchor = { x: 1150, y: 60 };
    const { ctl, action } = mount({ anchor, stage: null });
    vi.runAllTimers();
    expect(at(ctl, anchor).left).toBe(996); // right edge 1350 -> 1196
    action.destroy();
  });

  it('a drag is held inside the stage and settles there on release', () => {
    const anchor = { x: 120, y: 60 };
    const { ctl, action, node } = mount({ anchor, stage: STAGE });
    vi.runAllTimers();
    expect(at(ctl, anchor).left).toBe(154);
    const grip = ctl.grip(node);
    node.dispatchEvent(new MouseEvent('pointerdown', { clientX: 500, clientY: 100 }));
    node.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 100 })); // asks for 200px left
    node.dispatchEvent(new MouseEvent('pointermove', { clientX: 299, clientY: 100 })); // the stale-rect clamp catches up
    node.dispatchEvent(new MouseEvent('pointerup', { clientX: 299, clientY: 100 }));
    vi.runAllTimers();
    expect(at(ctl, anchor).left).toBe(154);
    expect(ctl.didDrag()).toBe(true);
    grip.destroy();
    action.destroy();
  });

  it('a drag re-homes the control to its new nearest edge; it never snaps back to the old gap', () => {
    const anchor = { x: 400, y: 60 };
    const saved = { dx: 0, dy: 0, open: true, pinned: true, ex: 'right', gx: 100, ey: 'top', gy: 8 };
    const { ctl, action, node } = mount({ anchor, stage: STAGE, saved });
    vi.runAllTimers();
    expect(at(ctl, anchor).left).toBe(596);
    const grip = ctl.grip(node);
    node.dispatchEvent(new MouseEvent('pointerdown', { clientX: 700, clientY: 100 }));
    node.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 100 })); // 400px left: to x=196
    node.dispatchEvent(new MouseEvent('pointerup', { clientX: 300, clientY: 100 }));
    vi.runAllTimers();
    expect(at(ctl, anchor).left).toBe(196);
    const s = get(ctl);
    expect(s.ex).toBe('left');
    expect(s.gx).toBe(42); // 196 - 154
    grip.destroy();
    action.destroy();
  });

  it('the stage is RE-RESOLVED on a resize, because the shell swaps which box clips', () => {
    // FOUND IN THE BROWSER. The app's structure is not the same at every width, so the nearest
    // ancestor that clips a control on a wide window is a different ELEMENT on a narrow one. A
    // control still watching the box it was given at mount is bounded by a node that is no longer
    // between it and the screen - and no observer fires when the real box changes.
    const anchor = { x: 100, y: 60 };
    const { ctl, action, stageEl, node } = mount({ anchor, stage: STAGE, explicitStage: false });
    vi.runAllTimers();
    expect(at(ctl, anchor).left).toBe(154); // the original stage: 150 + 4

    // The shell re-arranges: a NEW element, nearer the control, becomes the one that clips it.
    const inner = document.createElement('div');
    inner.style.overflow = 'hidden';
    inner.getBoundingClientRect = () => rect({ left: 500, top: 0, width: 300, height: 700 });
    stageEl.appendChild(inner);
    inner.appendChild(node);
    expect(nearestClippingAncestor(node)).toBe(inner);

    window.dispatchEvent(new Event('resize'));
    expect(at(ctl, anchor).left, 'bounded by the box that clips it NOW: 500 + 4').toBe(504);
    action.destroy();
  });

  it('the default stage is the nearest ancestor that clips', () => {
    const anchor = { x: 100, y: 60 };
    const { ctl, action, stageEl, node } = mount({ anchor, stage: STAGE, explicitStage: false });
    expect(nearestClippingAncestor(node)).toBe(stageEl);
    vi.runAllTimers();
    expect(at(ctl, anchor).left).toBe(154);
    action.destroy();
  });
});

/**
 * G81 job 2. THE NEAREST EDGE IS A GUESS, AND IT IS WRONG IN THE MIDDLE. A control just left of
 * centre on a wide screen is nearest the LEFT edge, so it sits still while the right-hand pane
 * opens and shoves the canvas about under it - and a GM who wanted it to travel with that pane had
 * no way to say so. Choosing an edge writes `ex`/`fx` (or `ey`/`fy`) and stops `settle` re-reading
 * that axis. It must NOT move the control: only what it measures from changes.
 */
describe('an explicit edge overrides the nearest-edge guess (G81)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    localStorage.removeItem(KEY);
  });

  // The stage is 154..896 inside its 4px inset and the control is 200 wide, so a control at 420 is
  // 266 from the left and 276 from the right: JUST left of centre, and the guess says "left".
  const MIDDLE = { x: 420, y: 60 };
  const NARROWED: R = { left: 150, top: 0, width: 550, height: 700 }; // right 700 -> bounds 154..696

  it('choosing the right edge does not move the control, and then it travels with that edge', () => {
    const { ctl, action, setStage } = mount({ anchor: MIDDLE, stage: STAGE });
    vi.runAllTimers();
    expect(at(ctl, MIDDLE).left).toBe(420);
    expect(get(ctl).ex, 'the guess: 266 from the left against 276 from the right').toBe('left');

    ctl.chooseEdge('right');
    vi.runAllTimers();
    expect(at(ctl, MIDDLE).left, 'choosing an edge NEVER moves the control').toBe(420);
    expect(get(ctl).ex).toBe('right');
    expect(get(ctl).fx).toBe(true);
    expect(get(ctl).gx, 'the gap is re-measured from the chosen edge').toBe(276); // 896 - (420 + 200)

    // The detail pane opens and takes 200px off the canvas. The control goes with the right edge.
    setStage(NARROWED);
    window.dispatchEvent(new Event('resize'));
    expect(at(ctl, MIDDLE).left).toBe(220); // 696 - 276 - 200
    action.destroy();
  });

  it('WITHOUT the choice the same control stays put, which is the fault being fixed', () => {
    const { ctl, action, setStage } = mount({ anchor: MIDDLE, stage: STAGE });
    vi.runAllTimers();
    expect(get(ctl).ex).toBe('left');
    expect(get(ctl).gx).toBe(266); // 420 - 154
    setStage(NARROWED);
    window.dispatchEvent(new Event('resize'));
    expect(at(ctl, MIDDLE).left, 'a left-anchored control ignores the right edge moving').toBe(420);
    action.destroy();
  });

  it('a drag re-measures the gap but does NOT re-read a chosen edge', () => {
    const anchor = { x: 400, y: 60 };
    const saved = { dx: 0, dy: 0, open: true, pinned: true, ex: 'right', gx: 100, ey: 'top', gy: 8, fx: true };
    const { ctl, action, node } = mount({ anchor, stage: STAGE, saved });
    vi.runAllTimers();
    expect(at(ctl, anchor).left).toBe(596); // 896 - 100 - 200
    const grip = ctl.grip(node);
    node.dispatchEvent(new MouseEvent('pointerdown', { clientX: 700, clientY: 100, button: 0 }));
    node.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 100 })); // 400px left
    node.dispatchEvent(new MouseEvent('pointerup', { clientX: 300, clientY: 100 }));
    vi.runAllTimers();
    expect(at(ctl, anchor).left).toBe(196);
    // It is now far nearer the LEFT edge (42 vs 500) and it stays a right-hand control anyway.
    expect(get(ctl).ex).toBe('right');
    expect(get(ctl).gx).toBe(500); // 896 - (196 + 200)
    grip.destroy();
    action.destroy();
  });

  it('"nearest" hands the axis back to the guess', () => {
    const anchor = { x: 200, y: 60 };
    const saved = { dx: 0, dy: 0, open: true, pinned: true, ex: 'right', gx: 496, ey: 'top', gy: 56, fx: true };
    const { ctl, action } = mount({ anchor, stage: STAGE, saved });
    vi.runAllTimers();
    expect(at(ctl, anchor).left).toBe(200); // 896 - 496 - 200
    ctl.chooseEdge('nearest');
    vi.runAllTimers();
    expect(at(ctl, anchor).left, 'still no jump').toBe(200);
    expect(get(ctl).fx).toBe(false);
    expect(get(ctl).ex, 'nearer the left now: 46 against 496').toBe('left');
    expect(get(ctl).gx).toBe(46); // 200 - 154
    action.destroy();
  });

  it('a control as wide as its box keeps the edge it had: a tie is not decided by a sub-pixel', () => {
    // FOUND IN THE BROWSER, NOT HERE. The clock read-out is 382.125 px wide, and on a 390 px window
    // it is hard against both edges: 0.000 from the left and -0.125 from the right. The old rule
    // read that as "nearer the right", so the moment the window was made wide the clock left the
    // top-left corner it has lived in since it was written and hugged the far edge instead.
    // Nothing in a headless gate had a fractional width, so nothing here could see it.
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    const anchor = { x: 8, y: 8 };
    const size = { width: 382.125, height: 48 };
    const { ctl, action } = mount({ anchor, stage: null, size });
    vi.runAllTimers();
    expect(at(ctl, anchor).left, 'clamped hard against both edges').toBe(4);
    expect(get(ctl).ex, 'a tie keeps what it had, and a fresh control is left-handed').toBe('left');
    expect(get(ctl).gx).toBe(0);

    // The window is made wide. A LEFT-hand control stays where it is; the sub-pixel verdict would
    // have sent it to 893.875 instead.
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    window.dispatchEvent(new Event('resize'));
    expect(at(ctl, anchor).left, 'still in its corner').toBe(4);
    action.destroy();
  });

  it('a right-click on a handle opens the menu and never starts a drag', () => {
    const anchor = { x: 300, y: 60 };
    const { ctl, action, node } = mount({ anchor, stage: STAGE });
    vi.runAllTimers();
    const grip = ctl.grip(node);
    let seen: { x: number; y: number } | null = null;
    const stop = ctl.edgeMenu.subscribe((v) => { seen = v; });
    expect(seen).toBeNull();
    // THE SECONDARY BUTTON MUST NOT BEGIN A MOVE, and this is asserted BEFORE the contextmenu
    // event rather than after it: the contextmenu handler ends any drag, so a check made after it
    // passes with the guard fully absent. The gate has to catch the press on its own.
    node.dispatchEvent(new MouseEvent('pointerdown', { clientX: 640, clientY: 220, button: 2 }));
    node.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 220 }));
    expect(at(ctl, anchor).left, 'a right-button press is not a drag').toBe(300);
    node.dispatchEvent(new MouseEvent('contextmenu', { clientX: 640, clientY: 220, bubbles: true }));
    expect(seen).toEqual({ x: 640, y: 220 });
    expect(at(ctl, anchor).left).toBe(300);
    stop();
    grip.destroy();
    action.destroy();
  });

  it('a long press is the touch form of the same thing, and it swallows the click that follows', () => {
    // Without this a long press on the LOCK would open the menu and unlock the control underneath.
    const anchor = { x: 300, y: 60 };
    const { ctl, action, node } = mount({ anchor, stage: STAGE });
    vi.runAllTimers();
    const grip = ctl.grip(node);
    let seen: { x: number; y: number } | null = null;
    const stop = ctl.edgeMenu.subscribe((v) => { seen = v; });
    node.dispatchEvent(new MouseEvent('pointerdown', { clientX: 500, clientY: 300, button: 0 }));
    vi.advanceTimersByTime(499);
    expect(seen, 'not yet - a brief press is still a tap').toBeNull();
    vi.advanceTimersByTime(2);
    expect(seen).toEqual({ x: 500, y: 300 });
    node.dispatchEvent(new MouseEvent('pointerup', { clientX: 500, clientY: 300 }));
    expect(ctl.didDrag(), 'the tap is spent, so the lock does not toggle').toBe(true);
    stop();
    grip.destroy();
    action.destroy();
  });

  it('a press that MOVES is a drag, not a menu', () => {
    const anchor = { x: 300, y: 60 };
    const { ctl, action, node } = mount({ anchor, stage: STAGE });
    vi.runAllTimers();
    const grip = ctl.grip(node);
    let seen: { x: number; y: number } | null = null;
    const stop = ctl.edgeMenu.subscribe((v) => { seen = v; });
    node.dispatchEvent(new MouseEvent('pointerdown', { clientX: 500, clientY: 300, button: 0 }));
    node.dispatchEvent(new MouseEvent('pointermove', { clientX: 460, clientY: 300 }));
    vi.advanceTimersByTime(800);
    expect(seen, 'the press timer was cancelled by the movement').toBeNull();
    node.dispatchEvent(new MouseEvent('pointerup', { clientX: 460, clientY: 300 }));
    vi.runAllTimers();
    expect(at(ctl, anchor).left).toBe(260);
    stop();
    grip.destroy();
    action.destroy();
  });
});

/**
 * G81 job 3. TWO CONTROLS DOCKED TOGETHER ARE ONE BOX. Owner: *"allow them to be pinned together.
 * This allow user display customisation"*. Drop one within 12 px of another's edge and they snap
 * and join a group; one grip then moves both by the same delta, and the pair settles against the
 * stage as the UNION of its members rather than each member on its own - which is the whole point,
 * because settling them separately is what would pull a docked pair apart the first time the
 * details pane opened.
 *
 * Every number here is absolute. The stage is 154..896 inside its inset and each control is 200
 * wide, so a pair sitting at 400..800 has a 96 px gap from the right edge and 246 from the left.
 */
const KEY_A = 'test-float-a';
const KEY_B = 'test-float-b';
const KEY_C = 'test-float-c';
const KEY_D = 'test-float-d';
const KEYS = [KEY_A, KEY_B, KEY_C, KEY_D];

function row(xs: number[], stage?: R) {
  KEYS.forEach((k) => localStorage.removeItem(k));
  const stageEl = document.createElement('div');
  document.body.appendChild(stageEl);
  let stageRect = stage ?? STAGE;
  stageEl.getBoundingClientRect = () => rect(stageRect);
  const make = (key: string, x: number) => {
    const node = document.createElement('div');
    stageEl.appendChild(node);
    const ctl = createFloatingControl(key, {}, { stage: () => stageEl });
    // The anchor is MUTABLE, because a host's anchor really does move on its own: the undo pill
    // hangs off its stage's CENTRE, so narrowing the canvas by 260 shifts it 130 with no drag and
    // no settle. `shift` is that happening.
    const anchor = { x, y: 60 };
    const size = { ...SIZE };
    node.getBoundingClientRect = () => rect({ left: anchor.x + get(ctl).dx, top: anchor.y + get(ctl).dy, ...size });
    return { ctl, node, anchor, size, action: ctl.root(node) };
  };
  const items = xs.map((x, i) => make(KEYS[i], x));
  return {
    items,
    setStage: (r: R) => { stageRect = r; },
    done: () => { items.forEach((i) => i.action.destroy()); KEYS.forEach((k) => localStorage.removeItem(k)); }
  };
}

function pair(opts: { a: number; b: number; stage?: R }) {
  const r = row([opts.a, opts.b], opts.stage);
  return { a: r.items[0], b: r.items[1], setStage: r.setStage, done: r.done };
}

/** Drag `who` by (mx, my) with its own grip, exactly as a GM would. */
function dragOf(who: { ctl: ReturnType<typeof createFloatingControl>; node: HTMLElement }, mx: number, my = 0) {
  drag(who, mx, my);
}

function drag(who: { ctl: ReturnType<typeof createFloatingControl>; node: HTMLElement }, mx: number, my = 0) {
  const grip = who.ctl.grip(who.node);
  who.node.dispatchEvent(new MouseEvent('pointerdown', { clientX: 500, clientY: 300, button: 0 }));
  who.node.dispatchEvent(new MouseEvent('pointermove', { clientX: 500 + mx, clientY: 300 + my }));
  who.node.dispatchEvent(new MouseEvent('pointerup', { clientX: 500 + mx, clientY: 300 + my }));
  vi.runAllTimers();
  grip.destroy();
}

describe('two controls dock, move as one, and settle as one box (G81)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    KEYS.forEach((k) => localStorage.removeItem(k));
  });

  /** A at 400..600, B dropped beside it so the two are docked and settled at 400..800. */
  function docked() {
    const p = pair({ a: 400, b: 614 }); // 14 px apart: NOT close enough on its own
    vi.runAllTimers();
    expect(at(p.b.ctl, p.b.anchor).left).toBe(614);
    expect(get(p.b.ctl).dock, 'nothing has been dropped yet').toBeUndefined();
    drag(p.b, -6); // to 608 - now 8 px from A's right edge, inside the 12 px snap
    return p;
  }

  it('the dock is decided AFTER the drop has reached the DOM, not during pointerup', () => {
    // MEASURED IN THE BROWSER, and invisible here until it was: the offset a drag writes reaches the
    // DOM as a Svelte microtask, so a `getBoundingClientRect` taken inside `pointerup` still returns
    // the box the control had BEFORE the drag. A pill dropped 5.75 px from the clock measured itself
    // 120.75 px away - its own starting distance - and nothing ever docked. So the check runs in a
    // later macrotask, and this pins that ordering: nothing is docked the instant the finger lifts.
    const p = pair({ a: 400, b: 614 });
    vi.runAllTimers();
    const grip = p.b.ctl.grip(p.b.node);
    p.b.node.dispatchEvent(new MouseEvent('pointerdown', { clientX: 500, clientY: 300, button: 0 }));
    p.b.node.dispatchEvent(new MouseEvent('pointermove', { clientX: 494, clientY: 300 }));
    p.b.node.dispatchEvent(new MouseEvent('pointerup', { clientX: 494, clientY: 300 }));
    expect(get(p.b.ctl).dock, 'not yet - the DOM has not caught up').toBeUndefined();
    vi.runAllTimers();
    expect(get(p.b.ctl).dock, 'and now it has').toBeTruthy();
    grip.destroy();
    p.done();
  });

  it('dropping a control within 12 px of another snaps the edges together and docks them', () => {
    const p = docked();
    expect(at(p.b.ctl, p.b.anchor).left, 'snapped the last 8 px so the edges meet').toBe(600);
    const id = get(p.a.ctl).dock;
    expect(id, 'A joined a group').toBeTruthy();
    expect(get(p.b.ctl).dock, 'and B is in the same one').toBe(id);
    p.done();
  });

  it('a drop that lands MORE than 12 px away does not dock', () => {
    const p = pair({ a: 400, b: 614 });
    vi.runAllTimers();
    drag(p.b, 4); // to 618: 18 px from A
    expect(at(p.b.ctl, p.b.anchor).left).toBe(618);
    expect(get(p.b.ctl).dock).toBeUndefined();
    expect(get(p.a.ctl).dock).toBeUndefined();
    p.done();
  });

  /** Three in a line at 200, 400 and 600, docked left to right - so the middle one has TWO. The
   *  row is 600 px wide and the stage is 742 inside its inset, so the whole thing fits with room. */
  function trio() {
    const r = row([200, 414, 628]); // 14 px apart: too far to dock on their own
    vi.runAllTimers();
    dragOf(r.items[1], -6); // 408 -> flush against A's right edge at 400
    dragOf(r.items[2], -16); // 612 -> within the 12 px snap of B's right edge, now at 600
    return r;
  }

  it('the MIDDLE of a row carries the whole row, frame by frame', () => {
    // Owner, 2026-09-07: *"If it is between 2 this current behaviour makes sense"*.
    const r = trio();
    const [a, b, c] = r.items;
    expect([at(a.ctl, a.anchor).left, at(b.ctl, b.anchor).left, at(c.ctl, c.anchor).left]).toEqual([200, 400, 600]);
    const id = get(b.ctl).dock;
    expect(id, 'all three in one group').toBeTruthy();
    expect(get(a.ctl).dock).toBe(id);
    expect(get(c.ctl).dock).toBe(id);

    // Mid-gesture, with no settle yet: the others have to be following FRAME BY FRAME. Left to the
    // settle on release they would sit still while the middle was dragged across the canvas and
    // then jump - which is not "moving as one", it is catching up.
    const grip = b.ctl.grip(b.node);
    b.node.dispatchEvent(new MouseEvent('pointerdown', { clientX: 500, clientY: 300, button: 0 }));
    b.node.dispatchEvent(new MouseEvent('pointermove', { clientX: 460, clientY: 300 }));
    expect([at(a.ctl, a.anchor).left, at(b.ctl, b.anchor).left, at(c.ctl, c.anchor).left],
      'all three, already there').toEqual([160, 360, 560]);
    b.node.dispatchEvent(new MouseEvent('pointerup', { clientX: 460, clientY: 300 }));
    vi.runAllTimers();
    expect([at(a.ctl, a.anchor).left, at(b.ctl, b.anchor).left, at(c.ctl, c.anchor).left],
      'and the settle left them where they were').toEqual([160, 360, 560]);
    expect(get(b.ctl).dock, 'a middle one never leaves its row').toBe(id);
    grip.destroy();
    r.done();
  });

  it('dragging a row leaves its LAYOUT alone - the offsets are not re-derived on release', () => {
    // MEASURED IN THE BROWSER, AND ONLY THERE. Releasing a group drag used to re-derive every
    // member's place in the group from wherever the members happened to BE - and on release they
    // are mid-correction, because each one places itself in its own settle. The middle of a row of
    // three came back as 512 instead of 382, which made the group 600 wide instead of 512, which
    // put 130 px of daylight between two members that were touching, which made the drift check
    // throw one out. One stale read, four wrong answers.
    //
    // THIS GATE WAS NOT SEEN RED, and it cannot be: the mocked rect here follows the store
    // synchronously, so "the DOM is one flush behind" does not exist in jsdom and re-deriving from
    // live boxes gives the identical answer. Restoring the old code leaves it green. It is kept
    // because what it asserts is true and worth holding - a group drag must not touch the layout -
    // and it would catch a synchronous regression. The fault itself was found, fixed and verified
    // in a real browser; see UI-C18.
    const r = trio();
    const [a, b, c] = r.items;
    const offsets = () => r.items.map((i) => [get(i.ctl).ox, get(i.ctl).oy]);
    expect(offsets(), 'the row as it formed').toEqual([[0, 0], [200, 0], [400, 0]]);
    dragOf(b, 90); // drag the row by its middle - 96 px of room before the far end hits the wall
    expect(offsets(), 'and unchanged after a group drag').toEqual([[0, 0], [200, 0], [400, 0]]);
    expect([at(a.ctl, a.anchor).left, at(b.ctl, b.anchor).left, at(c.ctl, c.anchor).left]).toEqual([290, 490, 690]);
    expect([get(a.ctl).dock, get(b.ctl).dock, get(c.ctl).dock], 'and nobody was thrown out')
      .toEqual([get(b.ctl).dock, get(b.ctl).dock, get(b.ctl).dock]);
    r.done();
  });

  it('an END of a row comes away in your hand, and the rest stay put', () => {
    // Owner, 2026-09-07, on three controls docked in a line and all three moving together: *"if an
    // item is on the edge and connected to only 1 thing its default behaviour is to undock"*.
    const r = trio();
    const [a, b, c] = r.items;
    const id = get(b.ctl).dock;
    dragOf(c, 80); // the right-hand end, dragged clear
    expect(at(c.ctl, c.anchor).left, 'it went alone').toBe(680);
    expect(get(c.ctl).dock, 'and it left the row').toBeUndefined();
    expect([at(a.ctl, a.anchor).left, at(b.ctl, b.anchor).left], 'the other two did not move').toEqual([200, 400]);
    expect(get(a.ctl).dock, 'and are still docked to each other').toBe(id);
    expect(get(b.ctl).dock).toBe(id);
    r.done();
  });

  it('a TAP on an end member does not take it out of the row', () => {
    // The peel happens at the slop threshold, not on pointerdown: until the finger has travelled
    // this is still a tap, and a tap on the lock is how a control is unlocked.
    const r = trio();
    const [, , c] = r.items;
    const id = get(c.ctl).dock;
    const grip = c.ctl.grip(c.node);
    c.node.dispatchEvent(new MouseEvent('pointerdown', { clientX: 500, clientY: 300, button: 0 }));
    c.node.dispatchEvent(new MouseEvent('pointermove', { clientX: 502, clientY: 300 })); // 2px: a tap
    c.node.dispatchEvent(new MouseEvent('pointerup', { clientX: 502, clientY: 300 }));
    vi.runAllTimers();
    expect(get(c.ctl).dock, 'still in the row').toBe(id);
    expect(c.ctl.didDrag(), 'and it was a tap, not a drag').toBe(false);
    grip.destroy();
    r.done();
  });

  it('peeling one off a PAIR frees the other too - and a pair has no middle to drag by', () => {
    // THE TRADE THIS RULE MAKES, stated where it will be found: in a pair BOTH members are ends, so
    // dragging either one separates them and a pair cannot be moved by one grip. Moving a pair is
    // two gestures - drag one, drag the other beside it, and it snaps back flush. Docking still
    // does the thing it is for, which is holding them together as the canvas changes shape.
    const p = docked();
    const id = get(p.a.ctl).dock;
    expect(id).toBeTruthy();
    drag(p.a, -120);
    expect(at(p.a.ctl, p.a.anchor).left, 'the dragged one went alone').toBe(280);
    expect(at(p.b.ctl, p.b.anchor).left, 'and the other stayed').toBe(600);
    expect(get(p.a.ctl).dock).toBeUndefined();
    expect(get(p.b.ctl).dock, 'nobody is left holding an empty group').toBeUndefined();
    p.done();
  });

  it('a member whose ANCHOR moves under it is put back, because the members do not share one', () => {
    // MEASURED IN THE BROWSER, and the reason a docked pair came apart there. The clock hangs off
    // its stage's top-left and the undo pill off its CENTRE: narrowing the canvas moved the pill
    // 130 px and the clock not at all, so a group held together by ONE shared delta was already
    // broken by the time anything settled - and the settle, seeing its own member exactly where it
    // wanted it, moved nothing. A group is laid out from remembered OFFSETS and each member is
    // placed absolutely, so the one that drifted is put back.
    const p = docked();
    expect(at(p.b.ctl, p.b.anchor).left).toBe(600);
    p.b.anchor.x += 80; // the pill's centre anchor slides out from under it
    expect(at(p.b.ctl, p.b.anchor).left, 'adrift, and nothing has told it so').toBe(680);
    window.dispatchEvent(new Event('resize'));
    vi.runAllTimers();
    expect(at(p.b.ctl, p.b.anchor).left, 'put back beside its partner').toBe(600);
    expect(at(p.a.ctl, p.a.anchor).left, 'which did not move').toBe(400);
    // AND THE PAIR IS STILL A PAIR. 80 px is well past the 24 px tolerance, so a drift check that
    // asked where the members ARE - rather than what the group's layout SAYS - would have dissolved
    // the group on the way past. That is what happened in the browser.
    expect(get(p.a.ctl).dock, 'still docked').toBeTruthy();
    expect(get(p.b.ctl).dock).toBe(get(p.a.ctl).dock);
    p.done();
  });

  it('the pair settles as ONE box: the union keeps its gap from the edge, and both move by it', () => {
    const p = docked();
    // The union is 400..800, so it is 96 from the right edge and 246 from the left: a RIGHT-hand
    // pair, even though A on its own would be a left-hand control (246 against 296).
    expect(get(p.a.ctl).ex).toBe('right');
    expect(get(p.a.ctl).gx).toBe(96);
    expect(get(p.b.ctl).ex, 'both members store the group\'s edge').toBe('right');
    expect(get(p.b.ctl).gx).toBe(96);

    p.setStage({ left: 150, top: 0, width: 550, height: 700 }); // right 700 -> bounds 154..696
    window.dispatchEvent(new Event('resize'));
    vi.runAllTimers();
    expect(at(p.b.ctl, p.b.anchor).left, 'the union: 696 - 96 - 400').toBe(400);
    expect(at(p.a.ctl, p.a.anchor).left, 'and A moved by the same 200').toBe(200);

    // The pair is now 46 from the left and 96 from the right, so it has re-homed to the LEFT - as
    // any control does when it is no longer nearest the edge it was. AND NARROWER STILL, until the
    // union no longer FITS where its gap would put it: this is the half a per-member settle cannot
    // fake, because the clamp has to bite on the 400px UNION rather than on either 200px member.
    p.setStage({ left: 150, top: 0, width: 450, height: 700 }); // right 600 -> bounds 154..596
    window.dispatchEvent(new Event('resize'));
    vi.runAllTimers();
    expect(at(p.a.ctl, p.a.anchor).left, '154 + 46 = 200, pulled back 4 so the UNION fits').toBe(196);
    expect(at(p.b.ctl, p.b.anchor).left, 'still exactly one control width behind').toBe(396);
    p.done();
  });

  it('a member that has GROWN APART from the group leaves it on its own', () => {
    // This is the 24 px, and its real job. Controls change size by themselves - the undo pill
    // widens on its handle, the picker opens, the transport expands - so a pair that was flush can
    // stop being adjacent with nobody touching either of them. The question is asked of the group's
    // LAYOUT (the offsets and the live sizes), never of where the members happen to be: a member
    // whose anchor has just slid out from under it is one settle away from being put back, and
    // asking the positions undocked a perfectly good pair the moment the canvas changed width.
    const p = docked();
    expect(get(p.a.ctl).dock).toBeTruthy();
    p.a.size.width = 100; // A shrinks: it now ends 100 px short of where B's offset begins
    window.dispatchEvent(new Event('resize'));
    vi.runAllTimers();
    expect(get(p.a.ctl).dock, '100 px of daylight is well past the 24 px tolerance').toBeUndefined();
    expect(get(p.a.ctl).ox).toBe(0);
    p.done();
  });

  it('a member that shrinks only a LITTLE stays docked', () => {
    const p = docked();
    p.a.size.width = 180; // 20 px of daylight - inside the tolerance
    window.dispatchEvent(new Event('resize'));
    vi.runAllTimers();
    expect(get(p.a.ctl).dock, '20 px is still docked').toBeTruthy();
    p.done();
  });

  it('undocking restores INDEPENDENT settling, and neither inherits the union\'s gap', () => {
    const p = docked();
    p.a.ctl.undock();
    vi.runAllTimers();
    expect(get(p.a.ctl).dock).toBeUndefined();
    expect(at(p.a.ctl, p.a.anchor).left, 'leaving the group does not move it').toBe(400);
    // A is 400..600 on its own: 246 from the left, 296 from the right. Its own edge again.
    expect(get(p.a.ctl).ex).toBe('left');
    expect(get(p.a.ctl).gx).toBe(246);

    p.setStage({ left: 150, top: 0, width: 550, height: 700 });
    window.dispatchEvent(new Event('resize'));
    vi.runAllTimers();
    expect(at(p.a.ctl, p.a.anchor).left, 'a left-hand control stays put').toBe(400);
    expect(at(p.b.ctl, p.b.anchor).left, 'B is a right-hand control alone now: 696 - 96 - 200').toBe(400);
    p.done();
  });

  it('leaving a PAIR releases the other member too - a group of one is not a group', () => {
    const p = docked();
    const id = get(p.a.ctl).dock;
    expect(id).toBeTruthy();
    p.a.ctl.undock();
    vi.runAllTimers();
    expect(get(p.a.ctl).dock).toBeUndefined();
    expect(get(p.b.ctl).dock, 'and B is not left holding an empty group').toBeUndefined();
    p.done();
  });

  it('a drag on an undocked neighbour no longer drags the other', () => {
    const p = docked();
    p.a.ctl.undock();
    vi.runAllTimers();
    drag(p.a, -120);
    expect(at(p.a.ctl, p.a.anchor).left).toBe(280);
    expect(at(p.b.ctl, p.b.anchor).left, 'B stayed where it was').toBe(600);
    p.done();
  });
});

describe('a floating control marks itself, so a palette can find it without a list (G34 addendum)', () => {
  it('the root action adds `sse-float` on mount and removes it on destroy', () => {
    localStorage.removeItem(KEY);
    const node = document.createElement('div');
    document.body.appendChild(node);
    const ctl = createFloatingControl(KEY, {}, { stage: () => null });
    const action = ctl.root(node);
    expect(node.classList.contains('sse-float')).toBe(true);
    action.destroy();
    expect(node.classList.contains('sse-float')).toBe(false);
  });
});
