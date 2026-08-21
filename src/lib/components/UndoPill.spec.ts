// The pill and its keys. The stacks themselves are tested in `lib/undo/`; what matters here is the
// part a GM feels: the control appears when there is something to wind back, it says what it will
// take back, and Ctrl+Z does the right thing depending on WHERE the caret is.
//
// It takes its history as PROPS - the system view hands it the system history, the starmap view
// hands it the campaign's - so this file needs no module mocking at all: a plain store and two
// spies are the whole contract.
import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { writable } from 'svelte/store';
import { tick } from 'svelte';
import UndoPill from './UndoPill.svelte';
import type { UndoStatus } from '$lib/undo/systemUndo';

const EMPTY: UndoStatus = { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0, undoLabel: '', redoLabel: '' };

let state = writable<UndoStatus>({ ...EMPTY });
let undo = vi.fn();
let redo = vi.fn();

function mount(mode: 'phone' | 'tablet' | 'desktop' = 'desktop') {
  return render(UndoPill, { props: { mode, status: state, undo, redo } });
}

function keydown(target: EventTarget, init: KeyboardEventInit = {}) {
  return fireEvent.keyDown(target, { key: 'z', ctrlKey: true, ...init });
}

beforeEach(() => {
  state = writable<UndoStatus>({ ...EMPTY });
  undo = vi.fn();
  redo = vi.fn();
});

describe('UndoPill', () => {
  it('shows nothing on an untouched system - the top of the view stays clear', () => {
    const { container } = mount();
    expect(container.querySelector('.undo-pill')).toBeNull();
  });

  it('appears once there is something to wind back, and marks itself as CHROME (UI-C6)', async () => {
    const { container } = mount();
    state.set({ ...EMPTY, canUndo: true, undoDepth: 1 });
    await tick();
    const pill = container.querySelector('.undo-pill')!;
    expect(pill).toBeTruthy();
    // `use:chrome` is what hides it under a dialog on a phone. Registering as `foreground` instead
    // would make the chrome hide itself whenever it was visible.
    expect(pill.classList.contains('sse-chrome')).toBe(true);
  });

  it('disables redo until there is a redo path, and enables it when there is', async () => {
    const { container } = mount();
    state.set({ ...EMPTY, canUndo: true, undoDepth: 1 });
    await tick();
    const [u, r] = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
    expect(u.disabled).toBe(false);
    expect(r.disabled).toBe(true);

    state.set({ ...EMPTY, canRedo: true, redoDepth: 1 });
    await tick();
    expect((container.querySelectorAll('button')[0] as HTMLButtonElement).disabled).toBe(true);
    expect((container.querySelectorAll('button')[1] as HTMLButtonElement).disabled).toBe(false);
  });

  it('winds back on a click, through whichever history it was handed', async () => {
    const { container } = mount();
    state.set({ ...EMPTY, canUndo: true, canRedo: true, undoDepth: 1, redoDepth: 1 });
    await tick();
    const buttons = container.querySelectorAll('button');
    await fireEvent.click(buttons[0]);
    expect(undo).toHaveBeenCalledTimes(1);
    await fireEvent.click(buttons[1]);
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it("puts the step's NAME on the buttons, and falls back to a phrase that is always true", async () => {
    const { container } = mount();
    state.set({ ...EMPTY, canUndo: true, canRedo: true, undoDepth: 1, redoDepth: 1, undoLabel: 'Mass of Earth', redoLabel: 'Deleted Luna' });
    await tick();
    const [u, r] = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
    expect(u.title).toBe('Undo: Mass of Earth (Ctrl+Z)');
    expect(u.getAttribute('aria-label')).toBe('Undo: Mass of Earth');
    expect(r.title).toBe('Redo: Deleted Luna (Ctrl+Shift+Z)');

    state.set({ ...EMPTY, canUndo: true, undoDepth: 1 });
    await tick();
    expect((container.querySelectorAll('button')[0] as HTMLButtonElement).title).toBe('Undo the last edit (Ctrl+Z)');
  });

  it('binds Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y', async () => {
    mount();
    await keydown(window);
    expect(undo).toHaveBeenCalledTimes(1);

    await keydown(window, { shiftKey: true });
    expect(redo).toHaveBeenCalledTimes(1);

    await keydown(window, { key: 'y' });
    expect(redo).toHaveBeenCalledTimes(2);
  });

  it('works with Cmd on a Mac, and ignores Alt+Ctrl+Z', async () => {
    mount();
    await fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
    await fireEvent.keyDown(window, { key: 'z', ctrlKey: true, altKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it("KEEPS ITS HANDS OFF A TEXT FIELD - the browser's own undo is the right one there", async () => {
    mount();
    const text = document.createElement('input');
    text.type = 'text';
    document.body.appendChild(text);
    await keydown(text);
    expect(undo).not.toHaveBeenCalled();

    const area = document.createElement('textarea');
    document.body.appendChild(area);
    await keydown(area);
    expect(undo).not.toHaveBeenCalled();

    const rich = document.createElement('div');
    rich.setAttribute('contenteditable', 'true');
    Object.defineProperty(rich, 'isContentEditable', { value: true });
    document.body.appendChild(rich);
    await keydown(rich);
    expect(undo).not.toHaveBeenCalled();
  });

  it('BUT STILL FIRES ON A SLIDER, which is where the focus is after a drag', async () => {
    mount();
    const range = document.createElement('input');
    range.type = 'range';
    document.body.appendChild(range);
    await keydown(range);
    expect(undo).toHaveBeenCalledTimes(1);

    const box = document.createElement('input');
    box.type = 'checkbox';
    document.body.appendChild(box);
    await keydown(box);
    expect(undo).toHaveBeenCalledTimes(2);
  });

  it("moves out of the clock's way on a phone", async () => {
    const { container } = mount('phone');
    state.set({ ...EMPTY, canUndo: true, undoDepth: 1 });
    await tick();
    expect(container.querySelector('.undo-pill')!.classList.contains('phone')).toBe(true);
  });
});
