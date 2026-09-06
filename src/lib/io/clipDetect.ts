import { derived, writable, get } from 'svelte/store';
import { clipBuffer } from './clipBuffer';
import { parseHubClip, describeClipRoot, describeClipCompact, looksLikeHubClip, type HubClip } from './hubClip';

// IS THERE ANYTHING TO PASTE, AND WHAT IS IT? (owner, 2026-09-05)
//
// "the paste icon should ONLY appear when it detects a valid data chunk - and it should probably
// say what - Paste - Planet x, system x, star x."
//
// A Paste control that is always there is a control that fails most of the time it is pressed, and
// the first thing it did in the wild was throw. So it appears only when something readable is
// actually in hand, and it says what that something is.
//
// TWO SOURCES, and the second one is the awkward half:
//   1. THE APP'S OWN BUFFER — a Copy or Cut made here. Always known, no permission, no guessing.
//   2. THE SYSTEM CLIPBOARD — a branch copied on the map library's site, in another tab.
//
// READING THE SYSTEM CLIPBOARD IS NOT FREE, and this deliberately does not pay the price. Calling
// `navigator.clipboard.readText()` unprompted throws up a permission dialogue in Chrome and does
// nothing at all in Firefox, and a browser prompt appearing because a GM moved their mouse over the
// starmap would be worse than the missing button. So the clipboard is read ONLY where the browser
// has ALREADY granted permission, checked first through the Permissions API and abandoned in silence
// otherwise. Ctrl+V still works everywhere regardless: that path carries the text with the event and
// needs no permission at all.

export interface DetectedClip {
  clip: HubClip;
  /** "System Sol", "Planet Earth" — the full name, for a menu item that has room for it. */
  label: string;
  /** "Planet+7", "Moon" — for the pill beside the undo buttons, where a name would push the chrome
   *  about every time the GM copied something else. */
  compact: string;
  count: number;
  /** Where it came from, so the caller can say "cut" rather than "copied" if it ever matters. */
  from: 'app' | 'clipboard';
}

/** A clip found on the SYSTEM clipboard, when the browser let us look without asking. */
const fromClipboard = writable<HubClip | null>(null);

export const detectedClip = derived([clipBuffer, fromClipboard], ([$buffer, $clip]): DetectedClip | null => {
  // The app's own buffer wins: it is what this GM just did, and it is certain.
  if ($buffer) {
    return { clip: $buffer.clip, label: describeClipRoot($buffer.clip), compact: describeClipCompact($buffer.clip), count: $buffer.count, from: 'app' };
  }
  if ($clip) {
    return { clip: $clip, label: describeClipRoot($clip), compact: describeClipCompact($clip), count: $clip.nodes.length, from: 'clipboard' };
  }
  return null;
});

/** True only where the browser has ALREADY said yes. Never asks. */
async function mayReadClipboard(): Promise<boolean> {
  try {
    const q = (navigator as any)?.permissions?.query;
    if (!q) return false;
    const status = await (navigator as any).permissions.query({ name: 'clipboard-read' as PermissionName });
    return status?.state === 'granted';
  } catch {
    return false; // Firefox has no such permission to grant, and says so by throwing
  }
}

/**
 * Look at the system clipboard, if we are allowed to without asking. Safe to call often: it is
 * cheap, it never prompts, and it never throws.
 */
export async function refreshDetectedClip(): Promise<void> {
  if (typeof navigator === 'undefined') return;
  if (get(clipBuffer)) return; // the app's own copy already wins; do not go looking
  if (!(await mayReadClipboard())) return;
  try {
    const text = await navigator.clipboard.readText();
    if (!looksLikeHubClip(text)) { fromClipboard.set(null); return; }
    const parsed = parseHubClip(text);
    fromClipboard.set(parsed.ok ? parsed.clip : null);
  } catch {
    fromClipboard.set(null);
  }
}

/** Take note of a clip we were HANDED (a paste event) - no permission needed for that. */
export function noteClipText(text: string): void {
  if (!looksLikeHubClip(text)) return;
  const parsed = parseHubClip(text);
  if (parsed.ok) fromClipboard.set(parsed.clip);
}
