// UndoHistory - the generic stack behind the GM's undo/redo pill.
//
// COPIED FROM MAPPADUX: `dynamic-map-renderer-v2/src/gm/CanvasUndoManager.ts`, shipped there at
// v2.14.108 (141 lines). Its housekeeping is reproduced here almost verbatim because it is already
// proven in a GM's hands: a new action clears the redo stack, the stack caps and shifts the oldest,
// the `applying` guard stops an undo recording itself, and the surface is a callback pair so the
// manager knows nothing about the app. Owner's instruction, 2026-08-16: "look at mappadux - worked
// great there."
//
// TWO THINGS DIFFER, AND BOTH FOLLOW FROM SSE HAVING NO SETTER LAYER.
//
// (1) MAPPADUX RECORDS *BEFORE* THE MUTATION - `recordIfNewAction(kind)` is called from its
//     StateManager's setters, so the current state IS the pre-edit state. SSE mutates in place
//     (`body.massKg = ...`) and announces afterwards, across ~145 sites, so by the time anything
//     observes the change the previous value is gone. The caller therefore supplies the "before"
//     to `push()` - it comes from the SHADOW copy that `systemUndo.ts` keeps. Same behaviour, no
//     write path introduced, none of the mutation sites touched.
//
// (2) COALESCING LIVES IN THE CALLER. Mappadux compares timestamps per kind inside the manager
//     (`now - last < IDLE_GAP_MS -> same action`). SSE needs to know when an action ENDS, not only
//     whether a new one has begun, because that is the moment the shadow must be refreshed - so
//     `systemUndo` runs the same 250 ms rule as a timer and calls `push()` once per action.
//     IDLE_GAP_MS is exported from here so there is ONE number, not two.
//
// A capture is whatever the caller's `capture()` returns and must be IMMUTABLE. SSE passes a JSON
// string, which is a deep clone by construction - Mappadux's explicit `_deepClone` step is
// therefore already done by the time a snapshot arrives.
//
// SCOPE, V1, stated here the way Mappadux states its own: everything that flows through
// `systemStore` - body and construct edits from every editor tab, add/delete body, tag edits, GM
// notes, description. NOT COVERED: starmap-level edits (`starmapStore` - system positions, depth,
// the starmap's own description), player-view presets, settings, and the clock. Add later if the
// user finds the gap.

/** Rapid changes closer together than this collapse into ONE undo entry. Mappadux's number. */
export const IDLE_GAP_MS = 250;

/** Mappadux's cap. See `maxBytes` for the second one, which SSE needs and Mappadux does not. */
export const MAX_ENTRIES = 200;

/**
 * MEASURED, 2026-08-18, and the reason a count alone will not do here. Mappadux's slices are a fog
 * polygon set and a marker list; SSE's is the authored half of a whole system - 70.9 KB for Sol
 * (40 nodes) and 738 KB for a synthetic 400-node system. Two hundred entries of the latter is
 * 144 MB, which is not a cache, it is a leak with a cap on it. So the stack ALSO carries a byte
 * budget and evicts the oldest to stay inside it: Sol keeps the full 200 entries (14 MB) and a
 * 400-node monster keeps about 43. The GM loses the deepest history on the biggest map, which is
 * the right thing to lose.
 */
export const MAX_BYTES = 32 * 1024 * 1024;

export interface UndoCallbacks<S> {
  /** Read the CURRENT state as an immutable snapshot (SSE: the authored slice as JSON). */
  capture: () => S;
  /** Put a snapshot back. SSE re-runs `process()` here - that IS the redo function. */
  apply: (snapshot: S) => void;
  /** Called whenever the stacks change, so the buttons can refresh their disabled state. */
  onChange?: () => void;
  /** Size of a snapshot for the byte budget. Defaults to string length. */
  sizeOf?: (snapshot: S) => number;
}

export interface UndoOptions {
  maxEntries?: number;
  maxBytes?: number;
}

export class UndoHistory<S> {
  private undoStack: S[] = [];
  private redoStack: S[] = [];
  private cb: UndoCallbacks<S>;
  private maxEntries: number;
  private maxBytes: number;
  /** Set while an undo/redo is being applied so the store hook - which fires INSIDE `apply` -
   *  does not record the re-application as a fresh user action. Not optional in SSE: applying a
   *  snapshot re-runs `process()` and sets the store, which is the very event the hook listens to. */
  private _applying = false;

  constructor(callbacks: UndoCallbacks<S>, options: UndoOptions = {}) {
    this.cb = callbacks;
    this.maxEntries = options.maxEntries ?? MAX_ENTRIES;
    this.maxBytes = options.maxBytes ?? MAX_BYTES;
  }

  /** True while `apply` is running. The hook checks this before recording anything. */
  get applying(): boolean {
    return this._applying;
  }

  /**
   * Start a new action: push the state from BEFORE it. Clears redo - any new action invalidates
   * the redo path. The caller owns "is this a new action" (see the header, difference 2).
   */
  push(before: S): void {
    this.undoStack.push(before);
    this._trim();
    this.redoStack = [];
    this.cb.onChange?.();
  }

  undo(): void {
    if (this.undoStack.length === 0) return;
    const entry = this.undoStack.pop()!;
    this.redoStack.push(this.cb.capture());
    this._applying = true;
    try {
      this.cb.apply(entry);
    } finally {
      this._applying = false;
    }
    this.cb.onChange?.();
  }

  redo(): void {
    if (this.redoStack.length === 0) return;
    const entry = this.redoStack.pop()!;
    this.undoStack.push(this.cb.capture());
    this._trim();
    this._applying = true;
    try {
      this.cb.apply(entry);
    } finally {
      this._applying = false;
    }
    this.cb.onChange?.();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  depth(): { undo: number; redo: number; bytes: number } {
    return { undo: this.undoStack.length, redo: this.redoStack.length, bytes: this._bytes() };
  }

  /** Tear both stacks down - called when a different system loads, so an undo can never land on
   *  the wrong system. (Mappadux clears on map change for exactly the same reason.) */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.cb.onChange?.();
  }

  private _sizeOf(s: S): number {
    if (this.cb.sizeOf) return this.cb.sizeOf(s);
    return typeof s === 'string' ? (s as unknown as string).length : 0;
  }

  private _bytes(): number {
    let total = 0;
    for (const e of this.undoStack) total += this._sizeOf(e);
    for (const e of this.redoStack) total += this._sizeOf(e);
    return total;
  }

  /** Oldest-first eviction against BOTH caps. The redo stack is counted for the byte budget but
   *  never evicted from - it is at most as deep as the undo stack that produced it. */
  private _trim(): void {
    while (this.undoStack.length > this.maxEntries) this.undoStack.shift();
    while (this.undoStack.length > 1 && this._bytes() > this.maxBytes) this.undoStack.shift();
  }
}
