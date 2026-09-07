import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import TimeDisplayOverlay from './TimeDisplayOverlay.svelte';
import type { Starmap } from '$lib/types';

/**
 * G81 job 1. The clock read-out is the FOURTH host of the shared floating control, so it is bounded
 * by the box that would clip it (`.main-view`, which is `overflow: hidden`) and keeps its gap from
 * its nearest edge when that box changes shape - the A98 model, applied to the read-out the owner
 * asked for: *"Maybe even give the time display the same treatment"*.
 *
 * The canvas underneath cannot be verified headlessly ([[E7]]), but THIS IS DOM: the overlay's place
 * is asserted in absolute pixels, with the rect following the inline transform the way a translated
 * element's really does.
 */
const KEY = 'sse-time-display-float';
const STAGE = { left: 150, top: 0, width: 750, height: 700 }; // a canvas right of a 150px rail
const SIZE = { width: 200, height: 44 };
const ANCHOR = { x: 158, y: 8 }; // the overlay's own `top: 8px; left: 8px` inside the stage

const temporal = {
  displayTimeSec: '0',
  masterTimeSec: '0',
  activeCalendarKey: 'none',
  temporal_registry: {}
} as unknown as NonNullable<Starmap['temporal']>;

/** The offset the component has actually written into its style attribute. */
function translate(el: HTMLElement) {
  const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform || '');
  return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 0, y: 0 };
}

function mount(saved?: Record<string, unknown>) {
  localStorage.removeItem(KEY);
  if (saved) localStorage.setItem(KEY, JSON.stringify(saved));
  const stageEl = document.createElement('div');
  stageEl.style.overflow = 'hidden'; // `.main-view` - what makes it the clip box
  document.body.appendChild(stageEl);
  let stage = { ...STAGE };
  stageEl.getBoundingClientRect = () =>
    ({ ...stage, right: stage.left + stage.width, bottom: stage.top + stage.height,
       x: stage.left, y: stage.top, toJSON() { /* mock */ } }) as DOMRect;
  const r = render(TimeDisplayOverlay, { props: { temporal }, target: stageEl });
  const el = stageEl.querySelector('.time-display-overlay') as HTMLElement;
  el.getBoundingClientRect = () => {
    const t = translate(el);
    const left = ANCHOR.x + t.x, top = ANCHOR.y + t.y;
    return ({ left, top, ...SIZE, right: left + SIZE.width, bottom: top + SIZE.height,
              x: left, y: top, toJSON() { /* mock */ } }) as DOMRect;
  };
  return { el, r, at: () => ({ left: ANCHOR.x + translate(el).x, top: ANCHOR.y + translate(el).y }),
           setStage: (s: typeof STAGE) => { stage = s; } };
}

describe('the clock read-out floats (G81)', () => {
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

  it('a clock saved off the right of the canvas is pulled back INSIDE the stage, not merely on screen', async () => {
    // dx 900 puts it at 1058 - on a 1200px window, so the old window-only clamp saw nothing wrong,
    // and under the detail pane is exactly where it would have sat.
    const { at, r } = mount({ dx: 900, dy: 0, open: true, pinned: true });
    vi.runAllTimers();
    await tick();
    expect(at().left).toBe(696); // stage right 900 - EDGE 4 - width 200
    r.unmount();
  });

  it('a right-hand clock keeps its gap from the right edge when the detail pane narrows the canvas', async () => {
    const saved = { dx: 0, dy: 0, open: true, pinned: true, ex: 'right', gx: 100, ey: 'top', gy: 8 };
    const { at, setStage, r } = mount(saved);
    vi.runAllTimers();
    await tick();
    expect(at()).toEqual({ left: 596, top: 12 }); // 896 - 100 - 200; 4 + 8
    setStage({ left: 150, top: 0, width: 350, height: 700 }); // the detail pane opens
    window.dispatchEvent(new Event('resize'));
    await tick();
    expect(at().left).toBe(196); // 496 - 100 - 200
    r.unmount();
  });

  it('it is CHROME and it always carries its grip, because a read-out has no puck to reopen from', async () => {
    const { el, r } = mount();
    vi.runAllTimers();
    await tick();
    expect(el.classList.contains('sse-chrome'), 'use:chrome, never use:foreground (UI-C6)').toBe(true);
    // Pinned from birth, so FloatGrip would normally stand down; `always` is what keeps it draggable.
    expect(el.querySelector('.float-grip'), 'the grip must survive being pinned').toBeTruthy();
    r.unmount();
  });
});
