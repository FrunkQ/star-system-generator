import { describe, it, expect } from 'vitest';
import { widthGrip } from './widthGrip';

/** A98. The undo pill's width handle: drag to widen within bounds, release to persist, double-click to reset. */
describe('widthGrip', () => {
  function rig(stored = 0) {
    const node = document.createElement('span');
    const calls: Array<[number, boolean]> = [];
    let width = stored;
    const action = widthGrip(node, {
      get: () => width,
      natural: () => 72,
      set: (w, final) => { width = w; calls.push([w, final]); },
      min: 90,
      max: 420
    });
    return { node, calls, width: () => width, action };
  }
  const ev = (type: string, clientX: number) => new MouseEvent(type, { clientX, clientY: 10, bubbles: true });

  it('starts from the natural width when nothing is stored, and persists only on release', () => {
    const r = rig(0);
    r.node.dispatchEvent(ev('pointerdown', 100));
    r.node.dispatchEvent(ev('pointermove', 150));
    expect(r.calls).toEqual([[122, false]]); // 72 + 50
    r.node.dispatchEvent(ev('pointerup', 160));
    expect(r.calls.at(-1)).toEqual([132, true]);
    r.action.destroy();
  });

  it('starts from the stored width when there is one', () => {
    const r = rig(200);
    r.node.dispatchEvent(ev('pointerdown', 100));
    r.node.dispatchEvent(ev('pointermove', 90));
    expect(r.width()).toBe(190);
    r.action.destroy();
  });

  it('is held between min and max, absolutely', () => {
    const r = rig(200);
    r.node.dispatchEvent(ev('pointerdown', 100));
    r.node.dispatchEvent(ev('pointermove', 1100));
    expect(r.width()).toBe(420);
    r.node.dispatchEvent(ev('pointermove', -900));
    expect(r.width()).toBe(90);
    r.action.destroy();
  });

  it('a double-click puts the natural width back', () => {
    const r = rig(300);
    r.node.dispatchEvent(ev('dblclick', 0));
    expect(r.calls.at(-1)).toEqual([0, true]);
    r.action.destroy();
  });

  it('a move with no press does nothing', () => {
    const r = rig(0);
    r.node.dispatchEvent(ev('pointermove', 500));
    expect(r.calls).toEqual([]);
    r.action.destroy();
  });
});
