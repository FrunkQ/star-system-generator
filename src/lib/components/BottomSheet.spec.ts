import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import BottomSheet from './BottomSheet.svelte';

// Svelte 5: listen via the `events` mount option (instance $on is gone).
function firePointer(node: Element, type: string, props: Record<string, any> = {}) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: 1, pointerType: 'touch', button: 0, clientX: 0, clientY: 0, ...props });
  node.dispatchEvent(e);
}

describe('BottomSheet', () => {
  it('renders its title', () => {
    const { getByText } = render(BottomSheet, { props: { snap: 'peek', title: 'Earth' } });
    expect(getByText('Earth')).toBeTruthy();
  });

  it('collapses to peek when the close button is tapped', async () => {
    const snapchange = vi.fn();
    const { getByLabelText } = render(BottomSheet, {
      props: { snap: 'half', title: 'Earth' },
      events: { snapchange }
    });
    await fireEvent.click(getByLabelText('Collapse panel'));
    expect(snapchange).toHaveBeenCalledWith(expect.objectContaining({ detail: 'peek' }));
  });

  it('cycles up (peek -> half) when the header is tapped', () => {
    const snapchange = vi.fn();
    const { container } = render(BottomSheet, {
      props: { snap: 'peek', title: 'Earth' },
      events: { snapchange }
    });
    const header = container.querySelector('.sheet-header')!;
    firePointer(header, 'pointerdown');
    firePointer(header, 'pointerup');
    expect(snapchange).toHaveBeenCalledWith(expect.objectContaining({ detail: 'half' }));
  });

  it('grows to full on a strong upward drag of the grabber', () => {
    const snapchange = vi.fn();
    const { container } = render(BottomSheet, {
      props: { snap: 'peek', title: 'Earth' },
      events: { snapchange }
    });
    const header = container.querySelector('.sheet-header')!;
    // Drag far up (negative dy = taller). innerHeight defaults to jsdom's 768.
    firePointer(header, 'pointerdown', { clientY: 700 });
    firePointer(header, 'pointermove', { clientY: 690 }); // crosses 8px pan threshold
    firePointer(header, 'pointermove', { clientY: 50 });
    firePointer(header, 'pointerup', { clientY: 50 });
    expect(snapchange).toHaveBeenCalledWith(expect.objectContaining({ detail: 'full' }));
  });
});
