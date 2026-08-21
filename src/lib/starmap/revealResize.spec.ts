import { describe, it, expect, vi } from 'vitest';

/**
 * A62 — the two guards a renderer's resize path needs, extracted so they can be tested without a
 * WebGL context.
 *
 * REPORTED: resize the window while the player's COVER PAGE is up, and the starmap revealed
 * afterwards is stretched. Intermittent.
 *
 * NOT REPRODUCED HERE, and this file does not claim to. Reaching that surface needs a live broadcast
 * session between two windows. What IS testable is the shape of the fix, and the shape is what the
 * row asked for: never take a 0x0 measurement, and re-read the container when the view is revealed.
 */

/** The push guard the views share: a zero-size container must never reach the renderer. */
function makePush(resize: (w: number, h: number) => void) {
  return (w: number, h: number) => {
    if (!(w > 1) || !(h > 1)) return;
    resize(w, h);
  };
}

describe('a 0x0 measurement never reaches the renderer', () => {
  it('drops zero and sub-pixel sizes', () => {
    const resize = vi.fn();
    const push = makePush(resize);
    // A container that is momentarily unlaid-out reports zero. Taking it as a size sets a 2x2
    // backing store, and the next real frame draws that stretched across the viewport — which is
    // the reported symptom, arrived at from the opposite direction.
    push(0, 0);
    push(1920, 0);
    push(0, 1080);
    push(1, 1);
    expect(resize).not.toHaveBeenCalled();
  });

  it('passes a real size straight through', () => {
    const resize = vi.fn();
    makePush(resize)(1920, 1080);
    expect(resize).toHaveBeenCalledWith(1920, 1080);
  });
});

describe('revalidate re-reads the container rather than trusting the last observation', () => {
  it('sends the size the container has NOW, not the one last observed', () => {
    const resize = vi.fn();
    const push = makePush(resize);
    let rect = { width: 1600, height: 900 };
    const container = { getBoundingClientRect: () => rect } as unknown as HTMLElement;
    const revalidate = () => { const b = container.getBoundingClientRect(); if (b) push(b.width, b.height); };

    revalidate();
    expect(resize).toHaveBeenLastCalledWith(1600, 900);

    // The window changed aspect while the view was covered and no observation arrived.
    rect = { width: 900, height: 1600 };
    revalidate();
    expect(resize).toHaveBeenLastCalledWith(900, 1600);
  });

  it('a revalidate on a collapsed container is a no-op, not a 0x0 write', () => {
    const resize = vi.fn();
    const push = makePush(resize);
    const container = { getBoundingClientRect: () => ({ width: 0, height: 0 }) } as unknown as HTMLElement;
    const revalidate = () => { const b = container.getBoundingClientRect(); if (b) push(b.width, b.height); };
    revalidate();
    expect(resize).not.toHaveBeenCalled();
  });
});

describe('the reveal nudge reaches a listener without the page knowing which views exist', () => {
  it('a window resize event drives revalidate', async () => {
    const resize = vi.fn();
    const push = makePush(resize);
    let rect = { width: 800, height: 600 };
    const container = { getBoundingClientRect: () => rect } as unknown as HTMLElement;
    const revalidate = () => { const b = container.getBoundingClientRect(); if (b) push(b.width, b.height); };
    const onReveal = () => revalidate();
    window.addEventListener('resize', onReveal);
    try {
      rect = { width: 1280, height: 400 };
      // What `dismissCover` fires. Deliberately NOT a call into each view: a renderer that adopts
      // the listener is covered, and one that does not is unaffected.
      window.dispatchEvent(new Event('resize'));
      expect(resize).toHaveBeenLastCalledWith(1280, 400);
    } finally {
      window.removeEventListener('resize', onReveal);
    }
  });
});
