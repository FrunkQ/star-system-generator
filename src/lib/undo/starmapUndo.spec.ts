// The campaign history, against the real store and the real processor.
//
// The two cases that shaped it are the last two: a BODY edit must cost this recorder nothing and
// produce no entry (the starmap store ticks on every one of them), and a DELETED system must come
// back with its contents, which no shell snapshot can hold.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { get } from 'svelte/store';
import { starmapStore } from '$lib/starmapStore';
import { systemProcessor } from '$lib/core/SystemProcessor';
import { loadStarterPack } from '$lib/import/realsky/testPack';
import { fixUpImportedSystem } from '$lib/system/importFixup';
import {
  attachStarmapUndo, detachStarmapUndo, undoStarmap, redoStarmap,
  starmapUndoStatus, silentStarmapWrite
} from './starmapUndo';
import type { Starmap, System } from '$lib/types';

const pack = loadStarterPack();

function solSystem(): System {
  const raw = JSON.parse(fs.readFileSync(path.resolve('static/examples/Sol_2030-System.json'), 'utf-8')) as System;
  return systemProcessor.process(fixUpImportedSystem(raw, pack), pack);
}

function campaign(): Starmap {
  const sol = solSystem();
  const other = JSON.parse(JSON.stringify(sol)) as System;
  other.id = 'sirius-system';
  other.name = 'Sirius';
  return {
    id: 'map-1',
    name: 'Local Neighbourhood',
    systems: [
      { id: 'node-sol', name: 'Sol', position: { x: 0, y: 0 }, system: sol },
      { id: 'node-sirius', name: 'Sirius', position: { x: 40, y: 12 }, system: other }
    ],
    routes: [],
    distanceUnit: 'ly',
    unitIsPrefix: false
  } as unknown as Starmap;
}

function status() {
  return get(starmapUndoStatus);
}
function node(id: string) {
  return get(starmapStore)!.systems.find((s) => s.id === id);
}

let detach: () => void;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  starmapStore.set(campaign());
  detach = attachStarmapUndo(() => pack);
});

afterEach(() => {
  detach();
  detachStarmapUndo();
  starmapStore.set(null);
  vi.useRealTimers();
});

describe('starmapUndo', () => {
  it('opens empty', () => {
    expect(status().canUndo).toBe(false);
  });

  it('winds back a MOVE, and names it', () => {
    starmapStore.update((m) => ({ ...m!, systems: m!.systems.map((s) => s.id === 'node-sirius' ? { ...s, position: { x: 99, y: 99 } } : s) }));
    vi.advanceTimersByTime(300);
    expect(status().undoDepth).toBe(1);
    expect(status().undoLabel).toBe('Moved Sirius');

    undoStarmap();
    expect(node('node-sirius')!.position).toEqual({ x: 40, y: 12 });
  });

  it('winds back a RENAME', () => {
    starmapStore.update((m) => ({ ...m!, systems: m!.systems.map((s) => s.id === 'node-sirius' ? { ...s, name: 'Sirius B Colony', isNameUserDefined: true } : s) }));
    vi.advanceTimersByTime(300);
    expect(status().undoLabel).toBe('Renamed Sirius B Colony');
    undoStarmap();
    expect(node('node-sirius')!.name).toBe('Sirius');
    expect(node('node-sirius')!.isNameUserDefined).toBeFalsy();
  });

  it('coalesces a DRAG of one system into a single step', () => {
    for (let i = 1; i <= 20; i++) {
      starmapStore.update((m) => ({ ...m!, systems: m!.systems.map((s) => s.id === 'node-sirius' ? { ...s, position: { x: 40 + i, y: 12 } } : s) }));
      vi.advanceTimersByTime(16);
    }
    vi.advanceTimersByTime(300);
    expect(status().undoDepth).toBe(1);
    undoStarmap();
    expect(node('node-sirius')!.position).toEqual({ x: 40, y: 12 });
  });

  it('winds back the map\'s own description and GM notes', () => {
    starmapStore.update((m) => ({ ...m!, gmNotes: 'the vault is in Sirius' }));
    vi.advanceTimersByTime(300);
    expect(status().undoLabel).toBe('GM notes of the starmap');
    undoStarmap();
    expect(get(starmapStore)!.gmNotes).toBeFalsy();
  });

  it('RESTORES A DELETED SYSTEM, bodies and all - the case a shell alone could not carry', () => {
    const bodies = node('node-sirius')!.system.nodes.length;
    expect(bodies).toBeGreaterThan(5);

    starmapStore.update((m) => ({ ...m!, systems: m!.systems.filter((s) => s.id !== 'node-sirius') }));
    vi.advanceTimersByTime(300);
    expect(status().undoLabel).toBe('Deleted Sirius');
    expect(get(starmapStore)!.systems).toHaveLength(1);

    undoStarmap();
    const back = node('node-sirius');
    expect(back).toBeTruthy();
    expect(back!.position).toEqual({ x: 40, y: 12 });
    expect(back!.system.nodes.length).toBe(bodies);
    // It came back through `process()`, so its derived physics is live rather than restored.
    const star: any = back!.system.nodes.find((n: any) => n.roleHint === 'star');
    expect(star.temperatureK).toBeGreaterThan(0);
  });

  it('takes an ADDED system back out again', () => {
    const extra = { id: 'node-new', name: 'New Home', position: { x: 5, y: 5 }, system: solSystem() };
    starmapStore.update((m) => ({ ...m!, systems: [...m!.systems, extra as any] }));
    vi.advanceTimersByTime(300);
    expect(status().undoLabel).toBe('Added New Home');
    undoStarmap();
    expect(get(starmapStore)!.systems.map((s) => s.id)).toEqual(['node-sol', 'node-sirius']);
  });

  it('redoes what it undid', () => {
    starmapStore.update((m) => ({ ...m!, systems: m!.systems.map((s) => s.id === 'node-sirius' ? { ...s, position: { x: 99, y: 99 } } : s) }));
    vi.advanceTimersByTime(300);
    undoStarmap();
    vi.advanceTimersByTime(300);
    expect(status().canRedo).toBe(true);
    redoStarmap();
    expect(node('node-sirius')!.position).toEqual({ x: 99, y: 99 });
  });

  it('IGNORES A BODY EDIT ENTIRELY - the store ticks on every one and the shell cannot see it', () => {
    // Exactly what `+page.svelte`'s systemStore -> starmapStore sync does on every slider step.
    for (let i = 0; i < 30; i++) {
      starmapStore.update((m) => {
        const sol = m!.systems[0].system;
        (sol.nodes.find((n: any) => n.name === 'Earth') as any).massKg = 6e24 + i;
        return { ...m! };
      });
      vi.advanceTimersByTime(16);
    }
    vi.advanceTimersByTime(300);
    expect(status().canUndo).toBe(false);
  });

  it('KEEPS BODY EDITS MADE AFTER THE MOVE - an undo of a move is not a time machine', () => {
    starmapStore.update((m) => ({ ...m!, systems: m!.systems.map((s) => s.id === 'node-sirius' ? { ...s, position: { x: 99, y: 99 } } : s) }));
    vi.advanceTimersByTime(300);

    // Now edit a body, the way the system view does, after the move was recorded.
    starmapStore.update((m) => {
      (m!.systems[0].system.nodes.find((n: any) => n.name === 'Earth') as any).massKg = 1.234e25;
      return { ...m! };
    });
    vi.advanceTimersByTime(300);

    undoStarmap();
    expect(node('node-sirius')!.position).toEqual({ x: 40, y: 12 });
    // The body edit survives: the apply took every surviving system's CONTENT from the live map.
    expect((node('node-sol')!.system.nodes.find((n: any) => n.name === 'Earth') as any).massKg).toBe(1.234e25);
  });

  it('records nothing for a write the app makes', () => {
    silentStarmapWrite(() => {
      starmapStore.update((m) => ({ ...m!, systems: m!.systems.map((s) => s.id === 'node-sirius' ? { ...s, position: { x: 7, y: 7 } } : s) }));
    });
    vi.advanceTimersByTime(300);
    expect(status().canUndo).toBe(false);
  });

  it('resets when a different campaign loads', () => {
    starmapStore.update((m) => ({ ...m!, gmNotes: 'x' }));
    vi.advanceTimersByTime(300);
    expect(status().canUndo).toBe(true);

    const other = campaign();
    other.id = 'map-2';
    starmapStore.set(other);
    vi.advanceTimersByTime(300);
    expect(status().canUndo).toBe(false);
  });

  it('does not record its own undo', () => {
    starmapStore.update((m) => ({ ...m!, gmNotes: 'x' }));
    vi.advanceTimersByTime(300);
    expect(status().undoDepth).toBe(1);
    undoStarmap();
    vi.advanceTimersByTime(300);
    expect(status().undoDepth).toBe(0);
    expect(status().canRedo).toBe(true);
  });
});
