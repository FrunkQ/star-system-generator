// starmapUndo - the SECOND history: the campaign's own layout, not what is inside a system.
//
// It answers the thing a GM regrets most after a bad slider: moving, renaming or DELETING a system.
// It runs beside `systemUndo` and the two never overlap - one owns `starmapStore`, the other owns
// `systemStore` - because they answer different questions and a GM is only ever looking at one of
// them. The pill binds to whichever view is on screen.
//
// MEASURED FIRST, 2026-08-18, on the bundled 42-system campaign (178 nodes, 633 KB live):
//   - the AUTHORED campaign slice is 227 KB and 7.5 ms to build;
//   - the SHELL - the same campaign with every `systems[].system` removed - is 7.66 KB and 0.03 ms.
// That 250x gap decides the whole design, because of one fact about this app: `starmapStore` TICKS
// WITH EVERY `systemStore` EMISSION (`+page.svelte`'s sync, "several per second while idle"), so
// the gate runs on every step of every slider drag inside a system. A 7.5 ms gate there would be a
// tax on body editing paid by a feature that is not even about bodies. The shell gate costs
// 0.03 ms and, better, is BLIND to system contents by construction: a body edit cannot produce a
// starmap entry, however hard it churns.
//
// WHAT IS IN THE SHELL, and therefore what this history covers:
//   - the map's own name, description and GM notes;
//   - the routes;
//   - per system: its id, name, whether the name is pinned, its position (including depth) and its
//     subsector.
// NOT the clock (`temporal` - out of scope, and winding time back from an undo button would be a
// nasty surprise), NOT the camera (`viewport`), NOT player-view presets, NOT campaign settings
// (units, scale, grid), and NOT the contents of any system - that is `systemUndo`'s job.
//
// DELETION IS THE CASE THAT SHAPES THE ENTRY. A shell alone cannot bring a deleted system back: its
// bodies are not in it. So the shadow holds a REFERENCE to each live system object beside the
// shell, and when the gate sees an id disappear, that one system's authored content is cloned into
// the entry - 69.5 KB, paid only on a deletion. Everything else is taken from the LIVE map at apply
// time, which is what stops an undo of "moved Sirius" from also winding back body edits made since.

import { get, writable, type Readable } from 'svelte/store';
import { starmapStore } from '$lib/starmapStore';
import { stripSystemForExport } from '$lib/system/importFixup';
import { systemProcessor } from '$lib/core/SystemProcessor';
import { IDLE_GAP_MS, UndoHistory } from './undoHistory';
import { describeStarmapChange } from './describeChange';
import type { RulePack, Starmap, System } from '$lib/types';
import type { UndoStatus } from './systemUndo';

/** One system node, without its contents. */
export interface ShellNode {
  id: string;
  name: string;
  isNameUserDefined?: boolean;
  position: { x: number; y: number; z?: number };
  subsectorId?: string;
}

/** The campaign's layout: what this history records, and the only thing its gate reads. */
export interface StarmapShell {
  name: string;
  description?: string;
  gmNotes?: string;
  routes: unknown[];
  systems: ShellNode[];
}

interface StarmapEntry {
  shell: StarmapShell;
  /** Authored JSON of any system that had gone by the time this entry was pushed. */
  removed: Record<string, string>;
}

function shellOf(map: Starmap): StarmapShell {
  return {
    name: map.name,
    description: map.description,
    gmNotes: map.gmNotes,
    routes: JSON.parse(JSON.stringify(map.routes ?? [])),
    systems: (map.systems ?? []).map((n) => ({
      id: n.id,
      name: n.name,
      isNameUserDefined: n.isNameUserDefined,
      position: { ...n.position },
      subsectorId: n.subsectorId
    }))
  };
}

function sameShell(a: StarmapShell | null, b: StarmapShell | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const EMPTY: UndoStatus = { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0, undoLabel: '', redoLabel: '' };
const status = writable<UndoStatus>({ ...EMPTY });
/** What the pill reads on the STARMAP view. */
export const starmapUndoStatus: Readable<UndoStatus> = { subscribe: status.subscribe };

let history: UndoHistory<string> | null = null;
let getPack: () => RulePack | null = () => null;
let unsubscribe: (() => void) | null = null;

let shadowShell: StarmapShell | null = null;
/** Live system objects by id - references, NOT clones. Only ever read for a system that has been
 *  DELETED, and a deleted object is unreachable from the app, so it cannot drift under us. */
let shadowContents = new Map<string, System>();
let shadowMapId: string | null = null;
let lastSeen: Starmap | null | undefined;
let actionOpen = false;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let silentDepth = 0;

function publish(): void {
  const d = history?.depth() ?? { undo: 0, redo: 0, bytes: 0 };
  status.set({
    canUndo: d.undo > 0,
    canRedo: d.redo > 0,
    undoDepth: d.undo,
    redoDepth: d.redo,
    undoLabel: history?.undoLabel() ?? '',
    redoLabel: history?.redoLabel() ?? ''
  });
}

function cancelTimer(): void {
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = null;
}

function contentsOf(map: Starmap): Map<string, System> {
  const m = new Map<string, System>();
  for (const n of map.systems ?? []) if (n?.system) m.set(n.id, n.system);
  return m;
}

function refreshShadow(map: Starmap): void {
  shadowShell = shellOf(map);
  shadowContents = contentsOf(map);
  shadowMapId = map.id;
}

function closeAction(): void {
  cancelTimer();
  const wasOpen = actionOpen;
  actionOpen = false;
  const map = get(starmapStore);
  if (!map || map.id !== shadowMapId) return;
  const now = shellOf(map);
  if (wasOpen && history) {
    const label = describeStarmapChange(shadowShell, now);
    if (label) history.labelTop(label);
  }
  refreshShadow(map);
}

function bumpTimer(): void {
  cancelTimer();
  closeTimer = setTimeout(closeAction, IDLE_GAP_MS);
}

function resetTo(map: Starmap | null): void {
  cancelTimer();
  actionOpen = false;
  if (map) refreshShadow(map);
  else {
    shadowShell = null;
    shadowContents = new Map();
    shadowMapId = null;
  }
  history?.clear();
}

function onStarmap(map: Starmap | null): void {
  if (!history) return;
  if (map === lastSeen) return;
  lastSeen = map;

  if (history.applying || silentDepth > 0) {
    if (map && map.id === shadowMapId) refreshShadow(map);
    return;
  }
  if (!map) {
    resetTo(null);
    publish();
    return;
  }
  // A different campaign: an entry from the last one would apply itself to this one.
  if (map.id !== shadowMapId) {
    resetTo(map);
    publish();
    return;
  }
  if (actionOpen) {
    bumpTimer();
    return;
  }

  const now = shellOf(map);
  // THE CHEAP GATE. Body edits tick this store constantly and change nothing in the shell, so they
  // stop here having cost 0.03 ms and no entry.
  if (sameShell(now, shadowShell)) return;

  // Anything the shell has lost has been DELETED - clone its authored content into the entry now,
  // while the shadow still holds a reference to it.
  const removed: Record<string, string> = {};
  const liveIds = new Set(now.systems.map((s) => s.id));
  for (const s of shadowShell?.systems ?? []) {
    if (liveIds.has(s.id)) continue;
    const sys = shadowContents.get(s.id);
    if (sys) removed[s.id] = JSON.stringify(stripSystemForExport(sys, getPack() ?? undefined));
  }

  history.push(JSON.stringify({ shell: shadowShell ?? now, removed } satisfies StarmapEntry));
  actionOpen = true;
  bumpTimer();
  publish();
}

/** Rebuild the campaign from an entry: the SHELL from the snapshot, every system's CONTENT from the
 *  live map where it still exists. That is what keeps an undo of a move from also winding back the
 *  body edits a GM made afterwards. */
function applyEntry(json: string): void {
  const map = get(starmapStore);
  if (!map) return;
  const entry = JSON.parse(json) as StarmapEntry;
  const pack = getPack();
  const live = new Map((map.systems ?? []).map((n) => [n.id, n]));

  const systems = entry.shell.systems.map((s) => {
    const existing = live.get(s.id);
    if (existing) {
      return { ...existing, name: s.name, isNameUserDefined: s.isNameUserDefined, position: { ...s.position }, subsectorId: s.subsectorId };
    }
    // A system that is no longer here: it was deleted, and this entry is the only copy left.
    const raw = entry.removed[s.id];
    if (!raw || !pack) return null;
    const system = systemProcessor.process(JSON.parse(raw) as System, pack);
    return { id: s.id, name: s.name, isNameUserDefined: s.isNameUserDefined, position: { ...s.position }, subsectorId: s.subsectorId, system };
  }).filter(Boolean) as Starmap['systems'];

  starmapStore.set({
    ...map,
    name: entry.shell.name,
    description: entry.shell.description,
    gmNotes: entry.shell.gmNotes,
    routes: JSON.parse(JSON.stringify(entry.shell.routes)) as Starmap['routes'],
    systems
  });
}

export function attachStarmapUndo(getRulePack: () => RulePack | null): () => void {
  detachStarmapUndo();
  getPack = getRulePack;
  history = new UndoHistory<string>({
    capture: () => {
      const map = get(starmapStore);
      return map ? JSON.stringify({ shell: shellOf(map), removed: {} } satisfies StarmapEntry) : '';
    },
    apply: applyEntry,
    onChange: publish
  });
  const current = get(starmapStore);
  lastSeen = current;
  resetTo(current);
  publish();
  unsubscribe = starmapStore.subscribe(onStarmap);
  return detachStarmapUndo;
}

export function detachStarmapUndo(): void {
  unsubscribe?.();
  unsubscribe = null;
  cancelTimer();
  history = null;
  shadowShell = null;
  shadowContents = new Map();
  shadowMapId = null;
  lastSeen = undefined;
  actionOpen = false;
  silentDepth = 0;
  publish();
}

/** For a write the APP makes rather than the GM - the same hatch `systemUndo` gives the clock. */
export function silentStarmapWrite<T>(fn: () => T): T {
  silentDepth++;
  try {
    return fn();
  } finally {
    silentDepth--;
  }
}

export function undoStarmap(): void {
  if (!history?.canUndo()) return;
  cancelTimer();
  actionOpen = false;
  history.undo();
}

export function redoStarmap(): void {
  if (!history?.canRedo()) return;
  cancelTimer();
  actionOpen = false;
  history.redo();
}

/** Test hatch. */
export function resetStarmapUndo(): void {
  if (!history) return;
  resetTo(get(starmapStore));
  publish();
}
