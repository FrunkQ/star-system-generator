// The generic stack, tested away from the app: the housekeeping copied from Mappadux's
// CanvasUndoManager is exactly the part that is miserable to debug once it is wired to a store.
import { describe, it, expect, vi } from 'vitest';
import { UndoHistory } from './undoHistory';

/** A tiny surface: `state` is the app, `capture`/`apply` are the callbacks. */
function harness(options?: { maxEntries?: number; maxBytes?: number }) {
  const seen: string[] = [];
  let state = 'v0';
  let changes = 0;
  const history = new UndoHistory<string>(
    {
      capture: () => state,
      apply: (s) => {
        state = s;
        seen.push(s);
      },
      onChange: () => changes++
    },
    options ?? {}
  );
  return {
    history,
    seen,
    get state() {
      return state;
    },
    set state(v: string) {
      state = v;
    },
    get changes() {
      return changes;
    }
  };
}

describe('UndoHistory', () => {
  it('winds one action back and forward again', () => {
    const h = harness();
    h.history.push('v0');
    h.state = 'v1';

    h.history.undo();
    expect(h.state).toBe('v0');
    expect(h.history.canRedo()).toBe(true);

    h.history.redo();
    expect(h.state).toBe('v1');
    expect(h.history.canUndo()).toBe(true);
    expect(h.history.canRedo()).toBe(false);
  });

  it('clears the redo stack when a new action is pushed', () => {
    const h = harness();
    h.history.push('v0');
    h.state = 'v1';
    h.history.undo();
    expect(h.history.canRedo()).toBe(true);

    h.history.push('v0-again'); // the GM edited instead of redoing
    expect(h.history.canRedo()).toBe(false);
  });

  it('reports `applying` while - and only while - a snapshot is being put back', () => {
    let sawApplying: boolean | null = null;
    const history = new UndoHistory<string>({
      capture: () => 'now',
      apply: () => {
        // This is where the store hook fires in the real app: it must be able to see the guard.
        sawApplying = history.applying;
      }
    });
    history.push('before');
    expect(history.applying).toBe(false);
    history.undo();
    expect(sawApplying).toBe(true);
    expect(history.applying).toBe(false);
  });

  it('leaves the guard down even if apply throws', () => {
    const history = new UndoHistory<string>({
      capture: () => 'now',
      apply: () => {
        throw new Error('boom');
      }
    });
    history.push('before');
    expect(() => history.undo()).toThrow('boom');
    expect(history.applying).toBe(false);
  });

  it('caps the stack and drops the OLDEST entry', () => {
    const h = harness({ maxEntries: 3 });
    for (let i = 0; i < 6; i++) h.history.push(`v${i}`);
    expect(h.history.depth().undo).toBe(3);
    // The three that survive must be the newest three: undo lands on v5 first.
    h.history.undo();
    expect(h.state).toBe('v5');
  });

  it('also caps by BYTES, because one SSE snapshot is 70 KB and not one polygon', () => {
    const h = harness({ maxEntries: 1000, maxBytes: 25 });
    h.history.push('a'.repeat(10));
    h.history.push('b'.repeat(10));
    h.history.push('c'.repeat(10)); // 30 > 25: the oldest goes
    expect(h.history.depth().undo).toBe(2);
    expect(h.history.depth().bytes).toBe(20);
  });

  it('never evicts the last entry, however big it is', () => {
    const h = harness({ maxBytes: 5 });
    h.history.push('x'.repeat(1000));
    expect(h.history.depth().undo).toBe(1);
  });

  it('does nothing on an empty stack', () => {
    const h = harness();
    h.history.undo();
    h.history.redo();
    expect(h.seen).toEqual([]);
  });

  it('clear() empties both stacks and notifies', () => {
    const h = harness();
    h.history.push('v0');
    h.history.undo();
    const before = h.changes;
    h.history.clear();
    expect(h.history.canUndo()).toBe(false);
    expect(h.history.canRedo()).toBe(false);
    expect(h.changes).toBeGreaterThan(before);
  });

  it('tells the buttons about every stack change', () => {
    const h = harness();
    const start = h.changes;
    h.history.push('v0');
    h.history.undo();
    h.history.redo();
    expect(h.changes - start).toBe(3);
  });

  it('uses a supplied sizeOf for the byte budget', () => {
    const sizeOf = vi.fn(() => 4);
    const history = new UndoHistory<string>({ capture: () => 'x', apply: () => {}, sizeOf }, { maxBytes: 10 });
    history.push('a');
    history.push('b');
    history.push('c'); // 12 > 10
    expect(history.depth().undo).toBe(2);
    expect(sizeOf).toHaveBeenCalled();
  });
});
