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
// READING THE SYSTEM CLIPBOARD IS NOT FREE, and there are two ways to pay: silently, where the
// browser has already said yes, and ON A GESTURE, where it will ask.
//
// THE SILENT READ ALONE COULD NEVER WORK, AND THAT WAS THE BUG (owner, 2026-09-06: *"never being
// offered a paste when i have a paste buffer from the sharing site"*). `mayReadClipboard` requires
// the permission state to be `granted` - but Chrome's default is `prompt` and NOTHING EVER MOVES IT
// to `granted` except a read attempt the user allows. Firefox has no such permission at all and
// throws. So the check returned false for essentially every user, forever, the clipboard was never
// looked at, and a branch copied on the map library's site was invisible to the app. Worse, with no
// clip and no edits the undo pill has nothing to show either, so the GM saw an empty screen and two
// broken-looking features with one cause.
//
// THE FIX IS WHERE THE READ HAPPENS, not whether. `readClipboardOnGesture` is called when a GM opens
// a context menu - a deliberate "show me my options", which is exactly what the original caution
// ruled IN. It is emphatically not "a GM moved their mouse over the starmap", which is what that
// caution ruled out and which is still never done. Chrome prompts once; on allow the state becomes
// `granted` and every later check takes the silent path for free.
//
// Ctrl+V still works everywhere regardless, and remains the only route in Firefox: that path carries
// the text with the event and needs no permission at all.

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
 * ASK FOR THE CLIPBOARD, ON A USER GESTURE. Call this from a gesture handler and nowhere else.
 *
 * TWO THINGS ABOUT THE ORDER, BOTH OF WHICH BREAK IT IF GOT WRONG:
 *  - `readText()` IS CALLED FIRST, before any `await`. The browser grants a gesture "transient
 *    activation" that an intervening await can spend, so checking the permission first - which is
 *    what the silent path does - would lose the very thing that makes the read allowed.
 *  - A REFUSAL IS REMEMBERED FOR THE SESSION. If the GM dismisses the prompt, or the browser has no
 *    clipboard read at all, this stops asking; a control that raises a dialogue on every right-click
 *    would be worse than the one that never asked.
 */
let gestureReadRefused = false;

/**
 * WHAT TO SAY WHEN THE APP CANNOT LOOK. Null when there is nothing to say - either something is
 * already in hand, or the browser can still be asked and the right-click will do it.
 *
 * FIREFOX IS THE CASE THIS EXISTS FOR: it has no `clipboard-read` permission at all, so no gesture
 * will ever get us the clipboard and the app would otherwise show a GM with a copied system exactly
 * nothing, forever, with no way to learn that Ctrl+V is the way in. A Chrome user who refused the
 * prompt lands here too, which is the other half of the same courtesy.
 *
 * It is ONE sentence in ONE place so the menus cannot word it differently.
 */
export function clipboardHint(): string | null {
  if (typeof navigator === 'undefined') return null;
  if (get(clipBuffer) || get(fromClipboard)) return null;
  if (clipboardCanBeAsked()) return null;
  return 'Press Ctrl+V to paste something copied elsewhere';
}

export function clipboardCanBeAsked(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.clipboard?.readText && !gestureReadRefused;
}

export async function readClipboardOnGesture(): Promise<void> {
  if (!clipboardCanBeAsked()) return;
  if (get(clipBuffer)) return; // the app's own copy already wins; do not go looking
  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    gestureReadRefused = true;
    return;
  }
  if (!looksLikeHubClip(text)) { fromClipboard.set(null); return; }
  const parsed = parseHubClip(text);
  fromClipboard.set(parsed.ok ? parsed.clip : null);
}

/**
 * Look at the system clipboard, if we are allowed to without asking. Safe to call often: it is
 * cheap, it never prompts, and it never throws. This is the FAST PATH once a gesture read has been
 * allowed once - from then on the permission is `granted` and no gesture is needed.
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

/**
 * THE WATCH, AND THE FLASH, IN ONE PLACE - because there are now two views that need them.
 *
 * The system view had both written into it. The starmap needs the same indicator (owner,
 * 2026-09-06), and a second copy of "look at the clipboard on focus, flash once when something new
 * arrives from outside" is two answers to one question waiting to drift apart. So the timing lives
 * here, with the store it is about, and a view just reads `clipPulse` and calls `watchClipboard()`.
 */
const pulse = writable(false);

/** True for one beat when something NEW arrives from OUTSIDE the app. */
export const clipPulse = { subscribe: pulse.subscribe };

let pulseKey = '';
let pulseTimer: ReturnType<typeof setTimeout> | null = null;

detectedClip.subscribe((d) => {
  const key = d ? `${d.label}|${d.count}|${d.from}` : '';
  if (key === pulseKey) return;
  pulseKey = key;
  // QUIET FOR YOUR OWN COPIES, ANNOUNCE ONES FROM OUTSIDE (owner, 2026-09-06). A Copy made in the
  // app needs no announcement - the GM just made it, and the indicator appearing says enough. A
  // branch that arrived from the map library is news, and the flash is the app saying it noticed.
  if (!key || d?.from !== 'clipboard') { pulse.set(false); return; }
  pulse.set(true);
  if (pulseTimer) clearTimeout(pulseTimer);
  pulseTimer = setTimeout(() => pulse.set(false), 1400);
});

/**
 * Look at the clipboard now, and again whenever the window comes back - which is exactly when a GM
 * returns from copying something on the map library's site. Returns its own teardown, so a view can
 * hand it straight to `onMount`. It never prompts: see the note at the top of this file.
 *
 * `visibilitychange` as well as `focus`, because a GM who copied in ANOTHER TAB of the same window
 * comes back without the window ever losing focus, and that is the commonest way this happens.
 */
export function watchClipboard(): () => void {
  if (typeof window === 'undefined') return () => {};
  const look = () => void refreshDetectedClip();
  look();
  const onVisible = () => { if (!document.hidden) look(); };
  window.addEventListener('focus', look);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('focus', look);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** Take note of a clip we were HANDED (a paste event) - no permission needed for that. */
export function noteClipText(text: string): void {
  if (!looksLikeHubClip(text)) return;
  const parsed = parseHubClip(text);
  if (parsed.ok) fromClipboard.set(parsed.clip);
}
