// Where a persisted undo history lives, and the ONE place that reads or writes it.
//
// The owner asked for it: "maybe even keep the last 20 undos in the save file so they are intact."
// This is that, with the two things that make it safe and cheap.
//
// (1) IT NEVER LEAVES THIS BROWSER. It rides the campaign object, which is autosaved to IndexedDB -
//     and every path OUT of that object strips the key: both export paths (`stripSystemForExport`,
//     `stripStarmapForExport`) and both player-redaction points (`computePlayerSnapshot`,
//     `computePlayerStarmapSnapshot`), pinned by `historyStrip.spec.ts`. An undo log records what a
//     GM DELETED, a save is a shared artefact and this project ships bundled example starmaps, so
//     the local autosave is the only place it is allowed to exist. That strip was built and tested
//     BEFORE anything was persisted, precisely so this step could not open a leak.
//
// (2) IT IS WRITTEN WITHOUT AN EMISSION. The history is attached to the live campaign object in
//     place and the autosave is asked to run; it does NOT go through `starmapStore.set`. That is
//     deliberate and measured: every starmap emission recomputes the full redacted player snapshot
//     in `+page.svelte` (hundreds of KB, fingerprint-gated for SENDING but not for computing), so
//     an emission per undo step would put that cost on every edit. Nothing renders the history, so
//     nothing needs to react to it.
//
// SIZE, measured: 20 entries of Sol's authored slice is 1.36 MB, which the autosave carries. A
// 400-node system would be 14.8 MB, which it should not, so there is a byte budget as well as the
// owner's count of 20 - same shape as the in-memory caps, one number each.
//
// The entries are stored as the JSON STRINGS the stacks already hold. Storing them as objects would
// read better in a file - but this key is stripped from every file a person can open, so there is
// no reader to be kind to, and parsing 20 slices on every autosave would not be free.

import { get } from 'svelte/store';
import { starmapStore } from '$lib/starmapStore';
import { UNDO_HISTORY_KEY } from './historyKey';

/** The owner's number. */
export const PERSISTED_ENTRIES = 20;
/** ...and the guard for a campaign whose systems are much bigger than Sol's. */
export const PERSISTED_BYTES = 4 * 1024 * 1024;

export interface PersistedEntry {
  data: string;
  label?: string;
}

export interface CampaignHistory {
  version: 1;
  /** Which system the `system` stack belongs to - it is meaningless against any other. */
  systemId: string | null;
  system: PersistedEntry[];
  starmap: PersistedEntry[];
}

/** Set once by the app: how to ask for an autosave without emitting on the store. */
let persist: (() => void) | null = null;

export function setUndoPersist(fn: (() => void) | null): void {
  persist = fn;
}

function emptyHistory(): CampaignHistory {
  return { version: 1, systemId: null, system: [], starmap: [] };
}

/** Trim to the smaller of the two budgets, newest kept. */
export function trimForSave(entries: PersistedEntry[]): PersistedEntry[] {
  const out = entries.slice(-PERSISTED_ENTRIES);
  let bytes = out.reduce((n, e) => n + (e.data?.length ?? 0), 0);
  while (out.length > 1 && bytes > PERSISTED_BYTES) {
    const dropped = out.shift();
    bytes -= dropped?.data?.length ?? 0;
  }
  return out;
}

/** What is stored on the open campaign, or null if there is none / it is not ours to read. */
export function readCampaignHistory(): CampaignHistory | null {
  const map: any = get(starmapStore);
  const raw = map?.[UNDO_HISTORY_KEY];
  if (!raw || raw.version !== 1) return null;
  return {
    version: 1,
    systemId: typeof raw.systemId === 'string' ? raw.systemId : null,
    system: Array.isArray(raw.system) ? raw.system.filter((e: any) => typeof e?.data === 'string') : [],
    starmap: Array.isArray(raw.starmap) ? raw.starmap.filter((e: any) => typeof e?.data === 'string') : []
  };
}

/**
 * Write one half of the history onto the live campaign object and ask for an autosave. In place and
 * without an emission - see the header.
 */
export function writeCampaignHistory(part: 'system' | 'starmap', entries: PersistedEntry[], systemId?: string | null): void {
  const map: any = get(starmapStore);
  if (!map) return;
  const current: CampaignHistory = map[UNDO_HISTORY_KEY]?.version === 1 ? map[UNDO_HISTORY_KEY] : emptyHistory();
  const next: CampaignHistory = { ...current, [part]: trimForSave(entries) } as CampaignHistory;
  if (part === 'system') next.systemId = systemId ?? null;
  map[UNDO_HISTORY_KEY] = next;
  persist?.();
}

/** Drop the whole thing - a different campaign, or a GM clearing the map. */
export function clearCampaignHistory(): void {
  const map: any = get(starmapStore);
  if (!map) return;
  delete map[UNDO_HISTORY_KEY];
  persist?.();
}
