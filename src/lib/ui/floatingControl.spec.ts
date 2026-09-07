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

function mount(opts: { anchor: { x: number; y: number }; stage: R | null; saved?: Record<string, unknown>; explicitStage?: boolean }) {
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
  node.getBoundingClientRect = () => rect({ left: opts.anchor.x + get(ctl).dx, top: opts.anchor.y + get(ctl).dy, ...SIZE });
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

  it('the default stage is the nearest ancestor that clips', () => {
    const anchor = { x: 100, y: 60 };
    const { ctl, action, stageEl, node } = mount({ anchor, stage: STAGE, explicitStage: false });
    expect(nearestClippingAncestor(node)).toBe(stageEl);
    vi.runAllTimers();
    expect(at(ctl, anchor).left).toBe(154);
    action.destroy();
  });
});
