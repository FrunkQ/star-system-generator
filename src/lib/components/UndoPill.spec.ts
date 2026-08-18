// The pill and its keys. The stack itself is tested in `lib/undo/`; what matters here is the part
// a GM feels: the control appears when there is something to wind back, and Ctrl+Z does the right
// thing depending on WHERE the caret is.
import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tick } from 'svelte';

// `vi.mock` is hoisted above every import, so the stubs are built inside `vi.hoisted` - including
// a three-line store, because `writable` is not available that early either.
const h = vi.hoisted(() => {
  const subs = new Set<(v: any) => void>();
  let value = { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 };
  return {
    store: {
      subscribe(fn: (v: any) => void) {
        subs.add(fn);
        fn(value);
        return () => subs.delete(fn);
      },
      set(v: any) {
        value = v;
        subs.forEach((fn) => fn(value));
      }
    },
    undo: vi.fn(),
    redo: vi.fn()
  };
});

vi.mock('$lib/undo/systemUndo', () => ({
  undoStatus: { subscribe: h.store.subscribe },
  undo: h.undo,
  redo: h.redo
}));

import UndoPill from './UndoPill.svelte';

const state = h.store;
const undo = h.undo;
const redo = h.redo;

function keydown(target: EventTarget, init: KeyboardEventInit) {
  return fireEvent.keyDown(target, { key: 'z', ctrlKey: true, ...init });
}

beforeEach(() => {
  undo.mockClear();
  redo.mockClear();
  state.set({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 });
});

describe('UndoPill', () => {
  it('shows nothing on an untouched system - the top of the view stays clear', () => {
    const { container } = render(UndoPill, { props: { mode: 'desktop' } });
    expect(container.querySelector('.undo-pill')).toBeNull();
  });

  it('appears once there is something to wind back, and marks itself as CHROME (UI-C6)', async () => {
    const { container } = render(UndoPill, { props: { mode: 'desktop' } });
    state.set({ canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0 });
    await tick();
    const pill = container.querySelector('.undo-pill')!;
    expect(pill).toBeTruthy();
    // `use:chrome` is what hides it under a dialog on a phone. Registering as `foreground` instead
    // would make the chrome hide itself whenever it was visible.
    expect(pill.classList.contains('sse-chrome')).toBe(true);
  });

  it('disables redo until there is a redo path, and enables it when there is', async () => {
    const { container } = render(UndoPill, { props: { mode: 'desktop' } });
    state.set({ canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0 });
    await tick();
    const [undoBtn, redoBtn] = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
    expect(undoBtn.disabled).toBe(false);
    expect(redoBtn.disabled).toBe(true);

    state.set({ canUndo: false, canRedo: true, undoDepth: 0, redoDepth: 1 });
    await tick();
    expect((container.querySelectorAll('button')[0] as HTMLButtonElement).disabled).toBe(true);
    expect((container.querySelectorAll('button')[1] as HTMLButtonElement).disabled).toBe(false);
  });

  it('winds back on a click', async () => {
    const { container } = render(UndoPill, { props: { mode: 'desktop' } });
    state.set({ canUndo: true, canRedo: true, undoDepth: 1, redoDepth: 1 });
    await tick();
    const buttons = container.querySelectorAll('button');
    await fireEvent.click(buttons[0]);
    expect(undo).toHaveBeenCalledTimes(1);
    await fireEvent.click(buttons[1]);
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it('binds Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y', async () => {
    render(UndoPill, { props: { mode: 'desktop' } });
    await keydown(window, {});
    expect(undo).toHaveBeenCalledTimes(1);

    await keydown(window, { shiftKey: true });
    expect(redo).toHaveBeenCalledTimes(1);

    await keydown(window, { key: 'y' });
    expect(redo).toHaveBeenCalledTimes(2);
  });

  it('works with Cmd on a Mac, and ignores Alt+Ctrl+Z', async () => {
    render(UndoPill, { props: { mode: 'desktop' } });
    await fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
    await fireEvent.keyDown(window, { key: 'z', ctrlKey: true, altKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('KEEPS ITS HANDS OFF A TEXT FIELD - the browser\'s own undo is the right one there', async () => {
    render(UndoPill, { props: { mode: 'desktop' } });
    const text = document.createElement('input');
    text.type = 'text';
    document.body.appendChild(text);
    await keydown(text, {});
    expect(undo).not.toHaveBeenCalled();

    const area = document.createElement('textarea');
    document.body.appendChild(area);
    await keydown(area, {});
    expect(undo).not.toHaveBeenCalled();

    const rich = document.createElement('div');
    rich.setAttribute('contenteditable', 'true');
    Object.defineProperty(rich, 'isContentEditable', { value: true });
    document.body.appendChild(rich);
    await keydown(rich, {});
    expect(undo).not.toHaveBeenCalled();
  });

  it('BUT STILL FIRES ON A SLIDER, which is where the focus is after a drag', async () => {
    render(UndoPill, { props: { mode: 'desktop' } });
    const range = document.createElement('input');
    range.type = 'range';
    document.body.appendChild(range);
    await keydown(range, {});
    expect(undo).toHaveBeenCalledTimes(1);

    const box = document.createElement('input');
    box.type = 'checkbox';
    document.body.appendChild(box);
    await keydown(box, {});
    expect(undo).toHaveBeenCalledTimes(2);
  });

  it('moves out of the clock\'s way on a phone', async () => {
    const { container } = render(UndoPill, { props: { mode: 'phone' } });
    state.set({ canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0 });
    await tick();
    expect(container.querySelector('.undo-pill')!.classList.contains('phone')).toBe(true);
  });
});
