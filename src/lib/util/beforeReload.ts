// src/lib/util/beforeReload.ts
//
// "FINISH WRITING BEFORE THE PAGE GOES" - for the reloads the APP itself performs (B-1).
//
// There are two: the deploy-skew recovery in `importOrReload`, and the accepted "new version"
// prompt in `swUpdate`. Both used to call `location.reload()` straight away, and the campaign
// autosave is asynchronous - a deep clone and an IndexedDB transaction that may not have committed.
// A reload the GM did not ask for must not be the thing that drops their last edit, so anything
// with unwritten state registers here and the reloaders wait for it.
//
// BOUNDED, ALWAYS. A save that never settles must not turn "reload to recover" into a page that
// never reloads, so the wait has a ceiling and a failure inside it is swallowed: the reload is the
// recovery, and it happens regardless.

type Settle = () => Promise<unknown> | unknown;

const pending = new Set<Settle>();

/** Register work to be settled before an app-initiated reload. Returns the un-register function. */
export function onBeforeReload(settle: Settle): () => void {
  pending.add(settle);
  return () => { pending.delete(settle); };
}

/** How long a reload will wait for registered work. Generous for a write, short for a human. */
export const BEFORE_RELOAD_LIMIT_MS = 3000;

/** Resolves when everything registered has settled, or the limit passes. Never rejects. */
export async function settleBeforeReload(limitMs: number = BEFORE_RELOAD_LIMIT_MS): Promise<void> {
  if (pending.size === 0) return;
  const all = Promise.all(
    [...pending].map((settle) => Promise.resolve().then(settle).catch(() => undefined))
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<void>((resolve) => { timer = setTimeout(resolve, limitMs); });
  try {
    await Promise.race([all, limit]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
