// Browser storage persistence + usage reporting.
//
// Campaigns live in IndexedDB, which browsers treat as "best effort": under storage pressure the data CAN
// be evicted. The web platform lets us ASK for persistence — `navigator.storage.persist()` — but the browser
// decides, and behaviour differs:
//   • Chrome / Edge — granted on heuristics (site engagement, bookmarked, installed as an app, notification
//     permission). The call can resolve FALSE with no prompt shown at all, and may start succeeding later as
//     engagement grows.
//   • Firefox — shows a real permission prompt, so the user's answer decides.
//   • Safari — the least reliable: it evicts data from sites left unused for an extended period regardless,
//     so persistence there should be treated as a hint.
// So this module never claims data is "safe" — it reports exactly what the browser granted, and the UI is
// worded as a REQUEST. File export remains the only real guarantee.

export type PersistenceState = 'unsupported' | 'granted' | 'not-granted';

export interface StorageReport {
  state: PersistenceState;
  usageBytes?: number;
  quotaBytes?: number;
}

function supported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage && typeof navigator.storage.persist === 'function';
}

/** What the browser currently says — never inferred from a previous request. */
export async function checkPersistence(): Promise<PersistenceState> {
  if (!supported()) return 'unsupported';
  try {
    return (await navigator.storage.persisted()) ? 'granted' : 'not-granted';
  } catch {
    return 'unsupported';
  }
}

/**
 * ASK the browser to keep our data. Must be called from a real user gesture — some browsers ignore or
 * reject it otherwise. Returns the ACTUAL resulting state, re-read from the browser rather than assumed
 * from the request's return value, so the UI can never report a success we did not get.
 */
export async function requestPersistence(): Promise<PersistenceState> {
  if (!supported()) return 'unsupported';
  try {
    await navigator.storage.persist();
  } catch {
    /* fall through — read the real state below regardless */
  }
  return checkPersistence();
}

/** Usage vs quota, so a GM can see how much their campaigns occupy and how close the limit is. */
export async function storageReport(): Promise<StorageReport> {
  const state = await checkPersistence();
  if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.estimate !== 'function') {
    return { state };
  }
  try {
    const est = await navigator.storage.estimate();
    return { state, usageBytes: est.usage, quotaBytes: est.quota };
  } catch {
    return { state };
  }
}

/** Human-readable byte size (MB/GB — campaigns are comfortably in that range). */
export function formatBytes(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
