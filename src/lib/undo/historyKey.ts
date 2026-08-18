// THE UNDO HISTORY IS GM-PRIVATE. One name for it, and one function that removes it.
//
// LEAF MODULE, DELIBERATELY: it imports nothing. `system/importFixup.ts` (export) and
// `system/utils.ts` (player redaction) both need it, and both are imported BY the undo binding —
// a constant that lived next to the binding would close a cycle (the TAG-10 lesson: a shared
// registry that can cycle eventually does).
//
// WHY THE STRIP EXISTS, and why it was built BEFORE anything was persisted: an undo log is a record
// of what a GM CHANGED, including what they deliberately DELETED - a name they redacted, a secret
// they thought better of. A save in this product is a SHARED ARTEFACT (a GM sends a campaign to
// another GM) and the project itself ships bundled example starmaps built by someone.
//
// THE HISTORY IS NOW PERSISTED (the owner's "keep the last 20 undos in the save file", built at
// v2.1.781) - it rides the campaign object into IndexedDB, see `campaignHistory.ts`. That is exactly
// the day this strip was written for: the local autosave is the only place it exists, and all four
// outbound paths were already closed and tested before the first entry was ever written.
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
