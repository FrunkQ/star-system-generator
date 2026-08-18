// THE UNDO HISTORY IS GM-PRIVATE. One name for it, and one function that removes it.
//
// LEAF MODULE, DELIBERATELY: it imports nothing. `system/importFixup.ts` (export) and
// `system/utils.ts` (player redaction) both need it, and both are imported BY the undo binding —
// a constant that lived next to the binding would close a cycle (the TAG-10 lesson: a shared
// registry that can cycle eventually does).
//
// WHY A STRIP AT ALL WHEN V1 KEEPS THE HISTORY IN MEMORY ONLY (see `systemUndo.ts` for that
// decision): an undo log is a record of what a GM CHANGED, including what they deliberately
// DELETED - a name they redacted, a secret they thought better of. A save in this product is a
// SHARED ARTEFACT (a GM sends a campaign to another GM) and the project itself ships bundled
// example starmaps built by someone. The day anyone persists the stack, every outbound path is
// already closed and a test says so; the alternative is remembering to close four of them at once.
//
// Treat it exactly as `gmNotes` is treated - the strips sit on the same lines.

/** The one name a persisted undo stack may use. Nothing else may spell it. */
export const UNDO_HISTORY_KEY = 'undoHistory';

/**
 * Remove any undo history from a document about to leave this browser - an export, a single-system
 * save, or the redacted player snapshot. Handles both shapes: a System (`nodes`) and a Starmap
 * (`systems[].system`). Mutates the object it is handed, which is always a CLONE at every call site.
 */
export function stripUndoHistory(doc: any): void {
  if (!doc || typeof doc !== 'object') return;
  delete doc[UNDO_HISTORY_KEY];
  const systems = (doc as any).systems;
  if (Array.isArray(systems)) {
    for (const node of systems) {
      if (!node || typeof node !== 'object') continue;
      delete node[UNDO_HISTORY_KEY];
      if (node.system && typeof node.system === 'object') delete node.system[UNDO_HISTORY_KEY];
    }
  }
}
