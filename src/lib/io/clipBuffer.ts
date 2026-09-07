import { writable } from 'svelte/store';
import type { HubClip } from './hubClip';

// THE APP'S OWN COPY BUFFER — what a right-click Copy puts down and a Paste picks up.
//
// WHY A BUFFER AND NOT JUST THE SYSTEM CLIPBOARD. `navigator.clipboard.readText()` needs a
// permission the browser may refuse, needs a user gesture, and in Firefox is simply not available
// to a page at all - which is the same wall the hub paste hit. So the in-app buffer is the source
// of truth for Copy inside SSE, and the system clipboard is written to AS WELL, best-effort, so a
// copied branch can also be pasted into another tab, another window, or a text file.
//
// The buffer holds a PARSED clip rather than text: it was produced here, so re-serialising it just
// to parse it back would be work done to reach the state we already had. The text written to the
// system clipboard is the same clip in the hub's own format, which is what lets it come back in
// through the ordinary paste door.
//
// IT IS NOT PERSISTED. A copy is a within-session gesture, and a clip left in browser storage from
// three weeks ago pasting itself into a campaign nobody expected is a worse outcome than losing a
// copy on reload.

export interface ClipBufferEntry {
  clip: HubClip;
  /** What was copied, for the menu to say "Paste Earth" rather than "Paste". */
  label: string;
  /** How many objects came with it, so a GM can see a branch is a branch. */
  count: number;
  /** True when the copy was a CUT - the branch has already been removed from its old home. */
  cut: boolean;
}

export const clipBuffer = writable<ClipBufferEntry | null>(null);

/** Put a branch down. Also writes the system clipboard, best-effort and never blocking. */
export function putClip(clip: HubClip, label: string, cut = false): void {
  clipBuffer.set({ clip, label, count: clip.nodes.length, cut });
  try {
    // Deliberately not awaited and deliberately swallowed: a refused clipboard permission must not
    // break Copy, because the in-app buffer is what Paste actually reads.
    void navigator.clipboard?.writeText(JSON.stringify(clip));
  } catch {
    /* no clipboard access: the buffer still has it */
  }
}

export function clearClip(): void {
  clipBuffer.set(null);
}
