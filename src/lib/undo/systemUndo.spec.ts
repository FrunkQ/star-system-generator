// The binding, tested against the REAL store, the REAL processor and the REAL rule pack, because
// every interesting failure here is an interaction: an undo that records itself, a drag that
// becomes two hundred entries, an entry from the previous system landing on this one.
//
// Each edit below is written the way the app writes one - mutate the body IN PLACE, then set the
// store with the processed result - because that convention (145 sites of it) is the reason the
// shadow copy exists at all. If this file ever starts calling a setter, the design has drifted.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { get } from 'svelte/store';
import { systemStore } from '$lib/stores';
import { systemProcessor } from '$lib/core/SystemProcessor';
import { loadStarterPack } from '$lib/import/realsky/testPack';
import { fixUpImportedSystem, stripSystemForExport } from '$lib/system/importFixup';
import {
  attachSystemUndo, detachSystemUndo, endUndoAction, silentSystemWrite,
  undo, redo, undoStatus, resetUndoHistory, setUndoFocus
} from './systemUndo';
import type { CelestialBody, System } from '$lib/types';

const pack = loadStarterPack();

/**
 * THE PATH A SYSTEM ACTUALLY TAKES INTO THE EDITOR - `fixUpImportedSystem` and then `process`, as
 * `Starmap.svelte:941`, `ImportModal` and `GenerationWizard` all do it. Processing the raw example
 * file instead is a state the app never holds (it still carries v1's baked-in classes), and it made
 * the round-trip test below fail for a reason that had nothing to do with undo - the fixup would
 * have re-derived those classes on load anyway. [[DATA-R8]] warns about exactly this file.
 */
function freshSol(): System {
  const raw = JSON.parse(fs.readFileSync(path.resolve('static/examples/Sol_2030-System.json'), 'utf-8')) as System;
  return systemProcessor.process(fixUpImportedSystem(raw, pack), pack);
}

function status() {
  return get(undoStatus);
}

function bodyNamed(name: string): CelestialBody {
  const sys = get(systemStore)!;
  const node = sys.nodes.find((n) => n.name === name) as CelestialBody;
  expect(node, `${name} is in the fixture`).toBeTruthy();
  return node;
}

/** Exactly what `SystemView.handleBodyUpdate` does: splice the (already mutated) body in, process,
 *  set with `isManuallyEdited`. The mutation happens on the object the store already holds. */
function commitEdit(mutate: (sys: System) => void) {
  const sys = get(systemStore)!;
  mutate(sys);
  systemStore.set({ ...systemProcessor.process({ ...sys, nodes: sys.nodes }, pack), isManuallyEdited: true });
}

let detach: () => void;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  systemStore.set(freshSol());
  detach = attachSystemUndo(() => pack);
});

afterEach(() => {
  detach();
  detachSystemUndo();
  systemStore.set(null);
  vi.useRealTimers();
});

describe('systemUndo - recording', () => {
  it('opens with an empty history: mounting the view is not an edit', () => {
    expect(status().canUndo).toBe(false);
    expect(status().canRedo).toBe(false);
  });

  it('COALESCES ONE DRAG INTO ONE ENTRY (measured: a drag is one store set per input event)', () => {
    const before = bodyNamed('Earth').massKg!;
    // 30 steps of a mass drag, 16 ms apart - a real 60 Hz drag, and 30 store sets.
    for (let i = 1; i <= 30; i++) {
      commitEdit(() => {
        bodyNamed('Earth').massKg = before * (1 + i * 0.016);
      });
      vi.advanceTimersByTime(16);
    }
    vi.advanceTimersByTime(300); // the GM lets go and moves on
    expect(status().undoDepth).toBe(1);
  });

  it('starts a NEW entry once the idle gap has passed', () => {
    commitEdit(() => { bodyNamed('Earth').massKg! *= 1.1; });
    vi.advanceTimersByTime(300);
    commitEdit(() => { bodyNamed('Earth').massKg! *= 1.1; });
    vi.advanceTimersByTime(300);
    expect(status().undoDepth).toBe(2);
  });

  it('ENDS THE ACTION AT THE EDITOR\'S OWN RELEASE BOUNDARY, without waiting out the gap', async () => {
    commitEdit(() => { bodyNamed('Earth').massKg! *= 1.1; });
    endUndoAction();                 // what BodyBasicsTab.finalizeEdit() now calls
    await Promise.resolve();         // it defers by a microtask, on purpose
    commitEdit(() => { bodyNamed('Earth').massKg! *= 1.1; });   // no timer advance: still inside 250 ms
    vi.advanceTimersByTime(300);
    expect(status().undoDepth).toBe(2);
  });

  it('records nothing when only DERIVED values were rewritten', () => {
    // A bare re-process. PHY-1 says it settles, so the authored slice is byte-identical and the
    // recorder must not see an edit.
    const sys = get(systemStore)!;
    systemStore.set({ ...systemProcessor.process(sys, pack) });
    vi.advanceTimersByTime(300);
    expect(status().canUndo).toBe(false);
  });

  it('records nothing for a write the CLOCK made', () => {
    silentSystemWrite(() => {
      const sys = get(systemStore)!;
      const ship = { id: 'ship-x', kind: 'construct', name: 'Rocinante', scheduled_journeys: [{ id: 'j1' }] } as any;
      systemStore.set({ ...sys, nodes: [...sys.nodes, ship] });
    });
    vi.advanceTimersByTime(300);
    expect(status().canUndo).toBe(false);
  });

  it('records an ADD and a DELETE, not just a field edit', () => {
    const sys = get(systemStore)!;
    const moon = { ...(bodyNamed('Luna') as any), id: 'luna-2', name: 'Luna II' };
    systemStore.set({ ...systemProcessor.process({ ...sys, nodes: [...sys.nodes, moon] }, pack), isManuallyEdited: true });
    vi.advanceTimersByTime(300);
    expect(status().undoDepth).toBe(1);

    undo();
    expect(get(systemStore)!.nodes.some((n) => n.id === 'luna-2')).toBe(false);
  });
});

describe('systemUndo - naming the step', () => {
  // The GM's selection names the CAUSE when one edit moves several bodies - giving Earth mass
  // re-derives tidally-locked Luna's rotation period, so the raw diff sees two bodies.
  beforeEach(() => setUndoFocus(bodyNamed('Earth').id));
  afterEach(() => setUndoFocus(null));

  it('names the action in the status the pill reads', () => {
    commitEdit(() => { bodyNamed('Earth').massKg! *= 1.5; });
    vi.advanceTimersByTime(300);              // the action closes, and THAT is when it is named
    // SHARPENED BY B82, exactly as the note here predicted. This used to read "Edit to Earth",
    // because one mass drag also moved eight derived fields that survived the strip and so looked
    // authored. Those are stripped now, and the label says what the GM actually did. `tags` is
    // still in it: a mass change legitimately moves AUTHORED-surviving tags on Earth.
    expect(status().undoLabel).toBe('Mass and tags of Earth');
    expect(status().redoLabel).toBe('');
  });

  it('carries the name across to redo, because it names the STEP not the state', () => {
    commitEdit(() => { bodyNamed('Earth').massKg! *= 1.5; });
    vi.advanceTimersByTime(300);
    undo();
    vi.advanceTimersByTime(300);
    expect(status().redoLabel).toBe('Mass and tags of Earth');
    expect(status().undoLabel).toBe('');
  });

  it('names a whole drag ONCE, by what the drag ended up doing', () => {
    const m0 = bodyNamed('Earth').massKg!;
    for (let i = 1; i <= 10; i++) {
      commitEdit(() => { bodyNamed('Earth').massKg = m0 * (1 + i * 0.05); });
      vi.advanceTimersByTime(16);
    }
    vi.advanceTimersByTime(300);
    expect(status().undoDepth).toBe(1);
    expect(status().undoLabel).toBe('Mass and tags of Earth');
  });

  it('names a field edit with no physical knock-on EXACTLY', () => {
    commitEdit(() => { (bodyNamed('Earth') as any).gmNotes = 'the vault is under the ice'; });
    vi.advanceTimersByTime(300);
    expect(status().undoLabel).toBe('GM notes of Earth');
  });

  it('names a deletion', () => {
    const sys = get(systemStore)!;
    systemStore.set({ ...systemProcessor.process({ ...sys, nodes: sys.nodes.filter((n) => n.name !== 'Luna') }, pack), isManuallyEdited: true });
    vi.advanceTimersByTime(300);
    expect(status().undoLabel).toBe('Deleted Luna');
  });
});

describe('systemUndo - winding back', () => {
  it('RESTORES THE AUTHORED VALUE *AND* EVERY DERIVED QUANTITY, because process() re-ran', () => {
    const earth = bodyNamed('Earth');
    const mass0 = earth.massKg!;
    const gravity0 = (earth as any).calculatedGravity_ms2;
    expect(gravity0).toBeGreaterThan(0);

    commitEdit(() => { bodyNamed('Earth').massKg = mass0 * 1.5; });
    vi.advanceTimersByTime(300);
    expect(bodyNamed('Earth').massKg).toBeCloseTo(mass0 * 1.5, 5);
    // The derived figure moved with it - so restoring it is a real test, not a tautology.
    expect((bodyNamed('Earth') as any).calculatedGravity_ms2).not.toBeCloseTo(gravity0, 6);

    undo();
    expect(bodyNamed('Earth').massKg).toBeCloseTo(mass0, 5);
    expect((bodyNamed('Earth') as any).calculatedGravity_ms2).toBeCloseTo(gravity0, 6);
  });

  it('an undo does NOT record itself, and redo puts the edit back', () => {
    const mass0 = bodyNamed('Earth').massKg!;
    commitEdit(() => { bodyNamed('Earth').massKg = mass0 * 1.5; });
    vi.advanceTimersByTime(300);
    expect(status().undoDepth).toBe(1);

    undo();
    vi.advanceTimersByTime(300);           // let any pending close fire
    expect(status().undoDepth).toBe(0);    // NOT 1 - the applying guard held
    expect(status().canRedo).toBe(true);

    redo();
    vi.advanceTimersByTime(300);
    expect(bodyNamed('Earth').massKg).toBeCloseTo(mass0 * 1.5, 5);
    expect(status().canRedo).toBe(false);
    expect(status().undoDepth).toBe(1);
  });

  it('an edit AFTER an undo clears the redo path', () => {
    const mass0 = bodyNamed('Earth').massKg!;
    commitEdit(() => { bodyNamed('Earth').massKg = mass0 * 1.5; });
    vi.advanceTimersByTime(300);
    undo();
    vi.advanceTimersByTime(300);
    expect(status().canRedo).toBe(true);

    commitEdit(() => { bodyNamed('Earth').massKg = mass0 * 1.2; });
    vi.advanceTimersByTime(300);
    expect(status().canRedo).toBe(false);
  });

  it('winds back several actions in order', () => {
    const mass0 = bodyNamed('Earth').massKg!;
    for (const f of [1.1, 1.2, 1.3]) {
      commitEdit(() => { bodyNamed('Earth').massKg = mass0 * f; });
      vi.advanceTimersByTime(300);
    }
    expect(status().undoDepth).toBe(3);
    undo(); vi.advanceTimersByTime(300);
    expect(bodyNamed('Earth').massKg).toBeCloseTo(mass0 * 1.2, 5);
    undo(); vi.advanceTimersByTime(300);
    expect(bodyNamed('Earth').massKg).toBeCloseTo(mass0 * 1.1, 5);
    undo(); vi.advanceTimersByTime(300);
    expect(bodyNamed('Earth').massKg).toBeCloseTo(mass0, 5);
    expect(status().canUndo).toBe(false);
  });

  it('restores an authored TAG, a GM note and the description', () => {
    const earth = bodyNamed('Earth');
    const tags0 = JSON.stringify(earth.tags ?? []);
    commitEdit((sys) => {
      const e = sys.nodes.find((n) => n.name === 'Earth') as any;
      e.tags = [...(e.tags ?? []), { key: 'plot/the-vault' }];
      e.gmNotes = 'the vault is under the ice';
      (sys as any).notes = 'campaign note';
    });
    vi.advanceTimersByTime(300);
    undo();
    expect(JSON.stringify(bodyNamed('Earth').tags ?? [])).toBe(tags0);
    expect((bodyNamed('Earth') as any).gmNotes).toBeUndefined();
    expect((get(systemStore) as any).notes).toBeFalsy();
  });
});

describe('systemUndo - which system this is', () => {
  it('RESETS when a different system loads: an entry never lands on the wrong system', () => {
    commitEdit(() => { bodyNamed('Earth').massKg! *= 1.5; });
    vi.advanceTimersByTime(300);
    expect(status().canUndo).toBe(true);

    const other = freshSol();
    other.id = 'some-other-system';
    other.name = 'Alpha Centauri';
    systemStore.set(other);
    vi.advanceTimersByTime(300);

    expect(status().canUndo).toBe(false);
    expect(status().canRedo).toBe(false);
  });

  it('drops the history when the store is emptied (back to the starmap)', () => {
    commitEdit(() => { bodyNamed('Earth').massKg! *= 1.5; });
    vi.advanceTimersByTime(300);
    systemStore.set(null);
    expect(status().canUndo).toBe(false);
  });

  it('resetUndoHistory() re-baselines on the current system', () => {
    commitEdit(() => { bodyNamed('Earth').massKg! *= 1.5; });
    vi.advanceTimersByTime(300);
    resetUndoHistory();
    expect(status().canUndo).toBe(false);
  });

  it('records nothing at all once detached', () => {
    detachSystemUndo();
    commitEdit(() => { bodyNamed('Earth').massKg! *= 1.5; });
    vi.advanceTimersByTime(300);
    expect(status().canUndo).toBe(false);
  });
});

describe('systemUndo - the snapshot is the authored slice', () => {
  it('a snapshot round-trip through process() reproduces the system EXACTLY', () => {
    // This is the guarantee the whole feature rests on, and it is the same one the save/load path
    // relies on: strip to the authored inputs, re-derive, and nothing a GM reads has moved.
    const sys = get(systemStore)!;
    const restored = systemProcessor.process(JSON.parse(JSON.stringify(stripSystemForExport(sys, pack))), pack);
    // DEEP equality, not string equality: `process()` deletes and re-adds fields, so an identical
    // system serialises with its keys in a different ORDER. Comparing the text here was the same
    // trap that made the recorder log an entry for a re-process that changed nothing.
    expect(restored).toEqual(sys);
  });
});
