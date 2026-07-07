import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gestures } from './gestures';

// jsdom's getBoundingClientRect returns an all-zero rect, so local coords == client coords.
function fire(node: Element, type: string, props: Record<string, any> = {}) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: 1, pointerType: 'mouse', button: 0, ...props });
  node.dispatchEvent(e);
  return e;
}

describe('gestures action', () => {
  let node: HTMLDivElement;
  beforeEach(() => {
    node = document.createElement('div');
    document.body.appendChild(node);
  });
  afterEach(() => {
    node.remove();
    vi.useRealTimers();
  });

  it('fires onTap for a press-release with no movement', () => {
    const onTap = vi.fn();
    const onPan = vi.fn();
    const action = gestures(node, { onTap, onPan });
    fire(node, 'pointerdown', { clientX: 10, clientY: 10 });
    fire(node, 'pointerup', { clientX: 10, clientY: 10 });
    expect(onTap).toHaveBeenCalledOnce();
    expect(onTap).toHaveBeenCalledWith({ x: 10, y: 10 });
    expect(onPan).not.toHaveBeenCalled();
    action.destroy();
  });

  it('does not pan under the 8px threshold, but taps', () => {
    const onPan = vi.fn();
    const onTap = vi.fn();
    const action = gestures(node, { onPan, onTap });
    fire(node, 'pointerdown', { clientX: 0, clientY: 0 });
    fire(node, 'pointermove', { clientX: 3, clientY: 2 }); // dist ~3.6 < 8
    fire(node, 'pointerup', { clientX: 3, clientY: 2 });
    expect(onPan).not.toHaveBeenCalled();
    expect(onTap).toHaveBeenCalledOnce();
    action.destroy();
  });

  it('pans once movement crosses the threshold, and suppresses the tap', () => {
    const onPanStart = vi.fn();
    const onPan = vi.fn();
    const onPanEnd = vi.fn();
    const onTap = vi.fn();
    const action = gestures(node, { onPanStart, onPan, onPanEnd, onTap });
    fire(node, 'pointerdown', { clientX: 0, clientY: 0 });
    fire(node, 'pointermove', { clientX: 20, clientY: 0 }); // > 8
    fire(node, 'pointermove', { clientX: 30, clientY: 0 });
    fire(node, 'pointerup', { clientX: 30, clientY: 0 });
    expect(onPanStart).toHaveBeenCalledOnce();
    expect(onPan).toHaveBeenCalled();
    expect(onPanEnd).toHaveBeenCalledOnce();
    expect(onTap).not.toHaveBeenCalled();
    action.destroy();
  });

  it('zooms in on wheel up and out on wheel down, at the pointer', () => {
    const onZoom = vi.fn();
    const action = gestures(node, { onZoom });
    fire(node, 'wheel', { deltaY: -100, clientX: 50, clientY: 60 });
    expect(onZoom).toHaveBeenLastCalledWith({ factor: 1.12, x: 50, y: 60 });
    fire(node, 'wheel', { deltaY: 100, clientX: 50, clientY: 60 });
    expect(onZoom).toHaveBeenLastCalledWith({ factor: 1 / 1.12, x: 50, y: 60 });
    action.destroy();
  });

  it('fires onLongPress after 480ms with no movement, and no tap', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const onTap = vi.fn();
    const action = gestures(node, { onLongPress, onTap });
    fire(node, 'pointerdown', { clientX: 5, clientY: 5 });
    vi.advanceTimersByTime(480);
    expect(onLongPress).toHaveBeenCalledOnce();
    expect(onLongPress).toHaveBeenCalledWith({ x: 5, y: 5 });
    fire(node, 'pointerup', { clientX: 5, clientY: 5 });
    expect(onTap).not.toHaveBeenCalled();
    action.destroy();
  });

  it('cancels the long-press once a pan begins', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const action = gestures(node, { onLongPress });
    fire(node, 'pointerdown', { clientX: 0, clientY: 0 });
    fire(node, 'pointermove', { clientX: 40, clientY: 0 });
    vi.advanceTimersByTime(480);
    expect(onLongPress).not.toHaveBeenCalled();
    action.destroy();
  });

  it('maps contextmenu (right-click) to onLongPress', () => {
    const onLongPress = vi.fn();
    const action = gestures(node, { onLongPress });
    fire(node, 'contextmenu', { clientX: 12, clientY: 34 });
    expect(onLongPress).toHaveBeenCalledWith({ x: 12, y: 34 });
    action.destroy();
  });

  it('ignores a non-primary mouse button press', () => {
    const onTap = vi.fn();
    const action = gestures(node, { onTap });
    fire(node, 'pointerdown', { clientX: 0, clientY: 0, button: 2 });
    fire(node, 'pointerup', { clientX: 0, clientY: 0, button: 2 });
    expect(onTap).not.toHaveBeenCalled();
    action.destroy();
  });

  it('stops firing after destroy()', () => {
    const onTap = vi.fn();
    const action = gestures(node, { onTap });
    action.destroy();
    fire(node, 'pointerdown', { clientX: 0, clientY: 0 });
    fire(node, 'pointerup', { clientX: 0, clientY: 0 });
    expect(onTap).not.toHaveBeenCalled();
  });
});
