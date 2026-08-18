// The history that survives a reload - and the promise that it never leaves this browser.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { get } from 'svelte/store';
import { starmapStore } from '$lib/starmapStore';
import { systemStore } from '$lib/stores';
import { systemProcessor } from '$lib/core/SystemProcessor';
import { loadStarterPack } from '$lib/import/realsky/testPack';
import { fixUpImportedSystem, stripStarmapForExport } from '$lib/system/importFixup';
import { computePlayerStarmapSnapshot } from '$lib/system/utils';
import { attachSystemUndo, detachSystemUndo, undoStatus } from './systemUndo';
import { attachStarmapUndo, detachStarmapUndo, starmapUndoStatus } from './starmapUndo';
import { setUndoPersist, readCampaignHistory, trimForSave, PERSISTED_ENTRIES } from './campaignHistory';
import { UNDO_HISTORY_KEY } from './historyKey';
import type { Starmap, System } from '$lib/types';

const pack = loadStarterPack();

function solSystem(): System {
  const raw = JSON.parse(fs.readFileSync(path.resolve('static/examples/Sol_2030-System.json'), 'utf-8')) as System;
  return systemProcessor.process(fixUpImportedSystem(raw, pack), pack);
}

function campaign(sol: System): Starmap {
  return {
    id: 'map-1', name: 'Local Neighbourhood',
    systems: [{ id: 'node-sol', name: 'Sol', position: { x: 0, y: 0 }, system: sol }],
    routes: [], distanceUnit: 'ly', unitIsPrefix: false
  } as unknown as Starmap;
}

function editEarth(mass: number) {
  const sys = get(systemStore)!;
  (sys.nodes.find((n) => n.name === 'Earth') as any).massKg = mass;
  systemStore.set({ ...systemProcessor.process({ ...sys, nodes: sys.nodes }, pack), isManuallyEdited: true });
}

let saves = 0;
let detachSys: () => void;
let detachMap: () => void;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  saves = 0;
  setUndoPersist(() => saves++);
  const sol = solSystem();
  starmapStore.set(campaign(sol));
  systemStore.set(sol);
  detachSys = attachSystemUndo(() => pack);
  detachMap = attachStarmapUndo(() => pack);
});

afterEach(() => {
  detachSys(); detachMap();
  detachSystemUndo(); detachStarmapUndo();
  setUndoPersist(null);
  systemStore.set(null);
  starmapStore.set(null);
  vi.useRealTimers();
});

describe('persisting the history', () => {
  it('writes a step onto the campaign and asks for ONE save per action, not per store set', () => {
    const before = saves;
    for (let i = 1; i <= 20; i++) { editEarth(6e24 + i); vi.advanceTimersByTime(16); }
    vi.advanceTimersByTime(300);
    expect(saves - before).toBe(1);            // 20 store sets, one action, one save
    const stored = readCampaignHistory()!;
    expect(stored.systemId).toBe(get(systemStore)!.id);
    expect(stored.system).toHaveLength(1);
    expect(stored.system[0].label).toBeTruthy();
  });

  it('restores the stack on a fresh attach - the reload case', () => {
    editEarth(9e24);
    vi.advanceTimersByTime(300);
    const mass0 = (get(systemStore)!.nodes.find((n) => n.name === 'Earth') as any).massKg;
    expect(mass0).toBe(9e24);

    // Reload: the campaign object survives in IndexedDB, the stacks do not.
    detachSystemUndo();
    expect(get(undoStatus).canUndo).toBe(false);
    detachSys = attachSystemUndo(() => pack);

    expect(get(undoStatus).canUndo).toBe(true);
    expect(get(undoStatus).undoLabel).toBeTruthy();
  });

  it('will not hand a saved stack to a DIFFERENT system', () => {
    editEarth(9e24);
    vi.advanceTimersByTime(300);
    detachSystemUndo();

    const other = solSystem();
    other.id = 'a-different-system';
    systemStore.set(other);
    detachSys = attachSystemUndo(() => pack);
    expect(get(undoStatus).canUndo).toBe(false);
  });

  it('keeps the campaign history too, and hands it back', () => {
    starmapStore.update((m) => ({ ...m!, gmNotes: 'the vault is in Sirius' }));
    vi.advanceTimersByTime(300);
    expect(readCampaignHistory()!.starmap).toHaveLength(1);

    detachStarmapUndo();
    detachMap = attachStarmapUndo(() => pack);
    expect(get(starmapUndoStatus).canUndo).toBe(true);
    expect(get(starmapUndoStatus).undoLabel).toBe('GM notes of the starmap');
  });

  it('keeps the OWNER\'S TWENTY, newest first out of the door', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ data: `entry-${i}`, label: `step ${i}` }));
    const kept = trimForSave(many);
    expect(kept).toHaveLength(PERSISTED_ENTRIES);
    expect(kept[0].data).toBe('entry-10');
    expect(kept[kept.length - 1].data).toBe('entry-29');
  });

  it('has a BYTE budget as well, because 20 slices of a huge system is not 1.4 MB', () => {
    const huge = Array.from({ length: 20 }, (_, i) => ({ data: 'x'.repeat(1024 * 1024), label: `step ${i}` }));
    const kept = trimForSave(huge);
    expect(kept.length).toBeLessThan(20);
    expect(kept.reduce((n, e) => n + e.data.length, 0)).toBeLessThanOrEqual(4 * 1024 * 1024);
  });
});

describe('and it still never leaves this browser', () => {
  it('a campaign carrying a REAL persisted history exports without it', () => {
    editEarth(9e24);
    vi.advanceTimersByTime(300);
    const map: any = get(starmapStore);
    expect(map[UNDO_HISTORY_KEY]).toBeTruthy();          // it IS there, in the autosave

    const exported: any = stripStarmapForExport(map, pack);
    expect(exported[UNDO_HISTORY_KEY]).toBeUndefined();
    expect(JSON.stringify(exported)).not.toContain(UNDO_HISTORY_KEY);
  });

  it('and the player broadcast does not carry it either', () => {
    editEarth(9e24);
    vi.advanceTimersByTime(300);
    const snap: any = computePlayerStarmapSnapshot(get(starmapStore)!);
    expect(snap[UNDO_HISTORY_KEY]).toBeUndefined();
    expect(JSON.stringify(snap)).not.toContain(UNDO_HISTORY_KEY);
  });
});

describe('the emergency localStorage save', () => {
  it('drops the history rather than risking the ~5 MB ceiling', async () => {
    // The fallback only runs when IndexedDB is unavailable, and it is the campaign that must
    // survive - not the undo log, which can be up to 4 MB of it.
    const { saveStarmap } = await import('$lib/starmapStorage');
    const map: any = get(starmapStore);
    map[UNDO_HISTORY_KEY] = { version: 1, systemId: null, system: [{ data: 'x'.repeat(2000) }], starmap: [] };

    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      setItem: (k: string, v: string) => { store[k] = v; },
      getItem: (k: string) => store[k] ?? null,
      removeItem: (k: string) => { delete store[k]; }
    });
    // Force the IndexedDB path to fail so the fallback runs.
    vi.stubGlobal('indexedDB', undefined);

    await saveStarmap(map);
    const written = Object.values(store).join('');
    vi.unstubAllGlobals();
    // NO CONDITIONAL ASSERTION: if the fallback did not run, this test proved nothing and must say so.
    expect(written.length, 'the localStorage fallback did not run - this test is not exercising it').toBeGreaterThan(0);
    expect(written).not.toContain(UNDO_HISTORY_KEY);
    expect(written).toContain('Local Neighbourhood');           // the campaign itself DID survive
    expect(map[UNDO_HISTORY_KEY]).toBeTruthy();                 // and the live one keeps its history
  });
});
