// systemUndo - binds the generic `UndoHistory` to SSE's one system store.
//
// THE WHOLE DESIGN IN FOUR LINES:
//   - SSE mutates bodies IN PLACE and announces afterwards, so there is no "before" to record.
//     A SHADOW deep clone of the AUTHORED state is kept here; it IS the before.
//   - "Authored" is not defined twice: it is whatever survives `stripSystemForExport`, which is
//     `importFixup`'s own strip (DERIVED_FIELDS + stripBody). Derived churn is invisible for free.
//   - `process()` is the redo function. An undo puts authored fields back and the processor
//     re-derives temperature, class, tags and the rest - none of it is stored.
//   - Nothing in the ~145 mutation sites changes. That is the point of the shape.
//
// MEASURED FIRST, 2026-08-18, at v2.1.773-beta (the numbers drove every choice below):
//   - ONE MASS-SLIDER DRAG = ONE STORE SET PER INPUT EVENT. 30 synthetic input events produced 30
//     `update` dispatches and 30 store sets, 1:1; a real 60 Hz drag is ~60 sets a second. Without
//     coalescing the feature is worse than useless, exactly as [[G28]] predicted.
//   - THE RELEASE ADDS NOTHING. `on:change` -> `finalizeEdit()` dispatched 0 further updates for a
//     plain mass drag (it early-returns unless the composition flowed through), so hooking the
//     action boundary onto it costs no extra entry.
//   - A NUMBER FIELD + BLUR = EXACTLY ONE STORE SET.
//   - THE AUTHORED SLICE IS SMALL: Sol (40 nodes) is 70.9 KB of the full 216.4 KB, and
//     strip+stringify costs 2.2 ms. A synthetic 400-node system is 738 KB and 21 ms.
// So: snapshot the whole authored slice (no delta diffing - the slice IS the changed values), and
// keep the per-action cost to TWO of those 2.2 ms passes, never one per store set. See `onSystem`.
//
// WHEN IS AN EDIT FINISHED? THE ANSWER ALREADY EXISTED AND IS REUSED RATHER THAN REINVENTED.
// `BodyBasicsTab.finalizeEdit()` is the slider-release boundary that re-arms autoClassify, so the
// type commits once per drag rather than mid-drag. It calls `endUndoAction()` now, which means the
// undo steps line up exactly with the type changes a GM sees. The 250 ms idle gap (Mappadux's
// number, in `undoHistory.ts`) is the FALLBACK for every control that has no release event.
//
// PERSISTENCE - the owner's "keep the last 20 undos in the save file", built at v2.1.781 and living
// in `campaignHistory.ts`. It shipped memory-only first and was persisted second, on purpose: the
// strip on all four outbound paths (`undo/historyKey.ts`) was already in place and tested before a
// single entry was written, because a save is a shared artefact and an undo log records what a GM
// DELETED. Two things that shape it and are enforced there: the stack is written to the campaign
// object IN PLACE with no store emission (an emission recomputes the redacted player snapshot), and
// it is capped by BYTES as well as by the owner's twenty (20 slices is 1.4 MB for Sol but 14.8 MB
// for a 400-node system).
//
// OUT OF SCOPE, V1: `starmapStore` (system positions, depth, the starmap's own description),
// player-view presets, settings, the clock.

import { get, writable, type Readable } from 'svelte/store';
import { systemStore } from '$lib/stores';
import { stripSystemForExport } from '$lib/system/importFixup';
import { systemProcessor } from '$lib/core/SystemProcessor';
import { IDLE_GAP_MS, UndoHistory } from './undoHistory';
import { describeSystemChange } from './describeChange';
import { readCampaignHistory, writeCampaignHistory } from './campaignHistory';
import type { RulePack, System } from '$lib/types';

/** A stack entry is the authored slice as JSON - immutable, and a deep clone by construction. */
type Snapshot = string;

/**
 * THE SHADOW IS AN OBJECT, AND THE COMPARISON IS A DEEP EQUAL RATHER THAN A STRING COMPARE. That is
 * not a style choice, it is a bug that was caught in test: `process()` deletes and re-adds fields,
 * so two IDENTICAL authored states serialise to different strings the moment a key changes
 * position. Comparing the JSON text recorded an undo entry for a re-process that changed nothing.
 * The strip already returns a deep CLONE, so keeping the object costs nothing extra and the
 * stringify happens only when an entry is actually pushed.
 */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

export interface UndoStatus {
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
  /** What the next undo/redo would take back, named from the diff - "Mass of Earth". '' when the
   *  change could not be named; the button then says "the last edit", which is always true. */
  undoLabel: string;
  redoLabel: string;
}

const EMPTY: UndoStatus = { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0, undoLabel: '', redoLabel: '' };
const status = writable<UndoStatus>({ ...EMPTY });
/** What the pill reads. */
export const undoStatus: Readable<UndoStatus> = { subscribe: status.subscribe };

const epoch = writable(0);
/**
 * BUMPED ON EVERY APPLIED UNDO/REDO. An editor that deliberately seeds its local fields ONCE per
 * body - `BodyStarTab` does, so that typing a precise mass is not snapped back by the next store
 * tick - would otherwise keep showing the pre-undo numbers over a model that has changed underneath
 * it. Reading this makes an undo the ONE other event that re-seeds. Found in the browser: the model
 * was correct and the open star panel still read 1.68 solar masses.
 */
export const undoEpoch: Readable<number> = { subscribe: epoch.subscribe };

let history: UndoHistory<Snapshot> | null = null;
let getPack: () => RulePack | null = () => null;
let unsubscribe: (() => void) | null = null;

/** The authored state as of the last CLOSED action - the "before" the next action pushes. */
let shadow: System | null = null;
let shadowSystemId: string | null = null;
/** The last object the store emitted, by REFERENCE: a write that returns `s` unchanged is a no-op. */
let lastSeen: System | null | undefined;
let actionOpen = false;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
/** Depth, not a flag: machine writes can nest (a clock tick inside a settle animation). */
let silentDepth = 0;
/** Which body the GM has selected - the CAUSE when one edit moves several bodies (see
 *  `describeChange.ts`). Naming only, never used to decide what is recorded. */
let focusId: string | null = null;

/** The authored slice, as a fresh deep clone: `stripSystemForExport` clones and then deletes
 *  everything `process()` re-derives. ONE definition of "authored" in this app, not two. */
function authored(sys: System): System {
  return stripSystemForExport(sys, getPack() ?? undefined);
}

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

/** The action is over: refresh the shadow so the NEXT action records the right "before". This is
 *  the one place the shadow is rebuilt during editing, which is why a 30-step drag costs two
 *  strip+stringify passes and not thirty. */
function closeAction(): void {
  cancelTimer();
  const wasOpen = actionOpen;
  actionOpen = false;
  const sys = get(systemStore);
  if (!sys || sys.id !== shadowSystemId) return;
  const now = authored(sys);
  // NAME THE STEP HERE, and only here: what an action DID is only knowable once it has ENDED. The
  // before state is the shadow, the after state is what we were about to make the new shadow, so
  // the name costs one diff of two objects that are already in hand and nothing at the call sites.
  if (wasOpen && history) {
    const label = describeSystemChange(shadow, now, focusId);
    if (label) history.labelTop(label);
    // The step is complete and named, so this is the moment to save it. Once per action, not once
    // per store set - and it writes onto the campaign object in place rather than emitting.
    writeCampaignHistory('system', history.exportEntries(), shadowSystemId);
  }
  shadow = now;
}

function bumpTimer(): void {
  cancelTimer();
  closeTimer = setTimeout(closeAction, IDLE_GAP_MS);
}

function resetTo(sys: System | null): void {
  cancelTimer();
  actionOpen = false;
  shadow = sys ? authored(sys) : null;
  shadowSystemId = sys?.id ?? null;
  history?.clear();
}

function onSystem(sys: System | null): void {
  if (!history) return;
  // A store write that returned its argument unchanged (`update(s => s)`) emits the SAME object.
  // The clock's autopilot top-up does that several times a second while idle, and it must cost
  // nothing. A write that really changed something returns a fresh object at every site in the
  // app - the one exception, AddConstructModal, was made to do the same.
  if (sys === lastSeen) return;
  lastSeen = sys;

  // An undo/redo is applying: adopt the state we just put back, and record nothing. Without this
  // the hook would record the re-application as a fresh user action - `apply` sets the store,
  // which is the very event this function listens to.
  if (history.applying) {
    if (sys && sys.id === shadowSystemId) shadow = authored(sys);
    return;
  }

  // A machine write (the clock advancing journeys). Adopt it silently: it is not an edit, and
  // winding it back is the clock's business, not undo's.
  if (silentDepth > 0) {
    if (sys && sys.id === shadowSystemId) shadow = authored(sys);
    return;
  }

  if (!sys) {
    resetTo(null);
    publish();
    return;
  }

  // A DIFFERENT SYSTEM. Load, switch, or a new campaign - not a user edit, and an entry from the
  // previous system would apply itself to this one. Reset, never record.
  if (sys.id !== shadowSystemId) {
    resetTo(sys);
    publish();
    return;
  }

  // Mid-action (a drag): nothing to compute, just keep the action alive.
  if (actionOpen) {
    bumpTimer();
    return;
  }

  const now = authored(sys);
  // Nothing AUTHORED changed - a re-process, a derived-only refresh, a no-op write. Invisible to
  // the log, which is [[PHY-1]] paying for itself: everything else is re-derived anyway.
  if (deepEqual(now, shadow)) return;

  // Push the SHADOW, not the current state: it is the state from BEFORE this action began.
  history.push(JSON.stringify(shadow ?? now));
  actionOpen = true;
  bumpTimer();
  publish();
}

/**
 * Start recording. Called from the GM system view on mount; the returned function detaches.
 * `getRulePack` is a getter because the pack can change under the view (pack editor, campaign
 * settings) and `process()` needs the live one.
 */
export function attachSystemUndo(getRulePack: () => RulePack | null): () => void {
  detachSystemUndo();
  getPack = getRulePack;
  history = new UndoHistory<Snapshot>({
    capture: () => {
      const sys = get(systemStore);
      return sys ? JSON.stringify(authored(sys)) : '';
    },
    apply: (snapshot) => {
      const pack = getPack();
      if (!snapshot || !pack) return;
      const sys = JSON.parse(snapshot) as System;
      // `process()` IS the redo function: authored fields go back, everything else is re-derived.
      systemStore.set(systemProcessor.process(sys, pack));
      epoch.update((n) => n + 1);
    },
    onChange: publish
  });
  const current = get(systemStore);
  lastSeen = current;
  resetTo(current);
  // A history saved with the campaign is only meaningful against the system it was recorded on.
  const saved = readCampaignHistory();
  if (current && saved && saved.systemId === current.id && saved.system.length) {
    history.importEntries(saved.system);
  }
  publish();
  unsubscribe = systemStore.subscribe(onSystem);
  return detachSystemUndo;
}

export function detachSystemUndo(): void {
  unsubscribe?.();
  unsubscribe = null;
  cancelTimer();
  history = null;
  shadow = null;
  shadowSystemId = null;
  lastSeen = undefined;
  actionOpen = false;
  silentDepth = 0;
  publish();
}

/**
 * THE EDIT IS FINISHED. Called from `BodyBasicsTab.finalizeEdit()` - the release boundary the body
 * editor already had. Deferred by a microtask because the caller may still dispatch an update of
 * its own (the composition flow-through commits `autoClassify` on release), and that write belongs
 * to the action that is ending, not to a new one.
 */
export function endUndoAction(): void {
  if (!history) return;
  queueMicrotask(() => {
    if (history) closeAction();
  });
}

/** The GM's current selection, for NAMING a step only. Set from the system view. */
export function setUndoFocus(id: string | null): void {
  focusId = id;
}

/**
 * Wrap a write the CLOCK makes, not the GM: the autopilot journey top-up and the display-time
 * journey sync. They fire several times a second while a system sits idle with time running, and
 * they are the reason a naive recorder fills its stack with entries nobody asked for. Time is out
 * of V1 scope; this is where that decision is enforced.
 */
export function silentSystemWrite<T>(fn: () => T): T {
  silentDepth++;
  try {
    return fn();
  } finally {
    silentDepth--;
  }
}

export function undo(): void {
  if (!history?.canUndo()) return;
  cancelTimer();
  actionOpen = false;
  history.undo();
  writeCampaignHistory('system', history.exportEntries(), shadowSystemId);
}

export function redo(): void {
  if (!history?.canRedo()) return;
  cancelTimer();
  actionOpen = false;
  history.redo();
  writeCampaignHistory('system', history.exportEntries(), shadowSystemId);
}

/** Test hatch and the explicit reset for a load that keeps the same system id. */
export function resetUndoHistory(): void {
  if (!history) return;
  resetTo(get(systemStore));
  publish();
}
