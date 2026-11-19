import type { Starmap } from './types';
import { stripUndoHistory } from './undo/historyKey';

const LEGACY_STARMAP_KEY = 'stargen_saved_starmap';
const DB_NAME = 'stargen_storage';
const STORE_NAME = 'kv';
const IDB_STARMAP_KEY = 'saved_starmap';

// B-1: THE NEWEST COPY IS NOT ALWAYS THE ONE IN INDEXEDDB. When an IndexedDB write fails the save
// falls back to localStorage (`saveStarmap`), and from that moment the fallback copy is NEWER than
// whatever IndexedDB still holds. This marker says so. Without it the next start-up read IndexedDB
// first, found the older copy, loaded it - and `migrateLegacyStarmapToIndexedDb`, seeing "a copy
// already in IndexedDB", DELETED the newer one as a leftover. The GM came back from a reload to the
// campaign as it stood when writes began to fail, with everything since gone: the same lost work,
// redone and lost again, on every reload.
const FALLBACK_NEWER_KEY = 'stargen_saved_starmap_is_newer';

let dbPromise: Promise<IDBDatabase> | null = null;

function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // A CONNECTION CAN DIE UNDER A RUNNING PAGE, and a cached dead one fails every write until a
      // reload. Mobile browsers do this when the app is put in the background (WebKit reports it
      // as "Connection to Indexed Database server lost"); a browser clearing site data does it
      // too. Forget the connection the moment it goes, so the next save opens a new one.
      const forget = () => { if (dbPromise === opening) dbPromise = null; };
      db.onclose = forget;
      db.onversionchange = () => { forget(); try { db.close(); } catch { /* already closed */ } };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
  // A FAILED open is not cached either: one bad moment must not disable saving for the whole visit.
  opening.catch(() => { if (dbPromise === opening) dbPromise = null; });

  dbPromise = opening;
  return opening;
}

/**
 * Run one piece of IndexedDB work, and if it fails, try ONCE more on a brand-new connection. A dead
 * connection fails in more than one way - `transaction()` throws, or the request errors - and all
 * of them are cured by reopening, so they are all treated here rather than at each call site. A
 * second failure is real (quota, storage refused) and is the caller's to handle.
 */
async function withFreshConnectionOnFailure<T>(work: (db: IDBDatabase) => Promise<T>): Promise<T> {
  try {
    return await work(await openDb());
  } catch {
    const stale = dbPromise;
    dbPromise = null;
    if (stale) { try { (await stale).close(); } catch { /* it never opened, or is already gone */ } }
    return work(await openDb());
  }
}

function idbGet<T>(key: string): Promise<T | null> {
  return withFreshConnectionOnFailure((db) => new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
  }));
}

function idbSet<T>(key: string, value: T): Promise<void> {
  return withFreshConnectionOnFailure((db) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(value, key);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  }));
}

/** Is the localStorage copy the one written AFTER IndexedDB last failed? Never throws. */
function fallbackIsNewer(): boolean {
  try { return window.localStorage.getItem(FALLBACK_NEWER_KEY) === '1'; } catch { return false; }
}

/** The fallback copy, parsed, or null if there is none or it cannot be read. */
function readFallback(): Starmap | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_STARMAP_KEY);
    return raw ? (JSON.parse(raw) as Starmap) : null;
  } catch {
    return null;
  }
}

/** IndexedDB holds the newest copy again: the fallback is now a leftover and can go. */
function retireFallback(): void {
  try {
    window.localStorage.removeItem(LEGACY_STARMAP_KEY);
    window.localStorage.removeItem(FALLBACK_NEWER_KEY);
  } catch { /* private mode */ }
}

export async function migrateLegacyStarmapToIndexedDb(): Promise<void> {
  if (typeof window === 'undefined') return;

  const legacyRaw = window.localStorage.getItem(LEGACY_STARMAP_KEY);
  if (!legacyRaw) return;

  try {
    // B-1: a fallback copy written after IndexedDB failed is the NEWEST copy, not a leftover. Put
    // it where it belongs if IndexedDB will take it now; if not, it stays exactly where it is and
    // `loadSavedStarmap` reads it from there. It is never deleted before it is safely re-homed.
    if (fallbackIsNewer()) {
      await idbSet(IDB_STARMAP_KEY, JSON.parse(legacyRaw) as Starmap);
      retireFallback();
      return;
    }

    const existing = await idbGet<Starmap>(IDB_STARMAP_KEY);
    if (existing) {
      window.localStorage.removeItem(LEGACY_STARMAP_KEY);
      return;
    }

    const parsed = JSON.parse(legacyRaw) as Starmap;
    await idbSet(IDB_STARMAP_KEY, parsed);
    // Remove large payload from localStorage to avoid quota pressure.
    window.localStorage.removeItem(LEGACY_STARMAP_KEY);
  } catch (error) {
    console.warn('Starmap migration to IndexedDB failed, using legacy localStorage fallback.', error);
  }
}

export async function loadSavedStarmap(): Promise<Starmap | null> {
  if (typeof window === 'undefined') return null;

  // B-1: newest first. See FALLBACK_NEWER_KEY.
  if (fallbackIsNewer()) {
    const newer = readFallback();
    if (newer) return newer;
  }

  try {
    const fromIdb = await idbGet<Starmap>(IDB_STARMAP_KEY);
    if (fromIdb) return fromIdb;
  } catch (error) {
    console.warn('IndexedDB starmap load failed, attempting localStorage fallback.', error);
  }

  return readFallback();
}

/**
 * Persist the campaign. RESOLVES ONLY IF IT IS STORED SOMEWHERE A RELOAD WILL FIND IT, and rejects
 * when neither IndexedDB nor the fallback would take it - the caller tells the GM (B-1), because a
 * save that failed in silence is how an evening's work is lost to the next reload.
 */
export async function saveStarmap(starmap: Starmap): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    await idbSet(IDB_STARMAP_KEY, starmap);
    // IndexedDB is current again, so an earlier fallback copy is now the OLDER one.
    if (fallbackIsNewer()) retireFallback();
  } catch (error) {
    console.warn('IndexedDB starmap save failed, using localStorage fallback.', error);
    // THE FALLBACK HAS A ~5 MB CEILING AND THE UNDO HISTORY IS THE MOST EXPENDABLE THING IN THE
    // CAMPAIGN, so it does not travel this road (G28). This path only runs when IndexedDB is
    // unavailable - the emergency save must not be the thing that fails because a GM has twenty
    // undo steps banked, and up to 4 MB of them would leave almost nothing for the campaign itself.
    const lean = { ...starmap };
    stripUndoHistory(lean);
    window.localStorage.setItem(LEGACY_STARMAP_KEY, JSON.stringify(lean));
    // Only once the copy is really there: a marker without a copy would hide the IndexedDB one.
    window.localStorage.setItem(FALLBACK_NEWER_KEY, '1');
  }
}

export async function hasSavedStarmap(): Promise<boolean> {
  const saved = await loadSavedStarmap();
  return saved !== null;
}

// --- WS8: the pre-upgrade snapshot ---
// Browser storage holds exactly ONE campaign, under one key. So accepting a base-map upgrade would
// overwrite the only in-browser copy of the campaign it replaced — and the upgrade screen promises the GM
// can go straight back to it. This keeps that promise: the original is copied to its own key first, and
// stays there until the GM restores it or upgrades again. Exporting a file is still the only real backup;
// this is a single, specific undo for a single, specific action.
const IDB_PRE_UPGRADE_KEY = 'pre_upgrade_starmap';

export async function savePreUpgradeStarmap(starmap: Starmap): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    await idbSet(IDB_PRE_UPGRADE_KEY, starmap);
    return true;
  } catch (error) {
    // NOT silent: the caller must be able to tell the GM the undo is unavailable rather than promise it.
    console.warn('Could not store the pre-upgrade snapshot.', error);
    return false;
  }
}

export async function loadPreUpgradeStarmap(): Promise<Starmap | null> {
  if (typeof window === 'undefined') return null;
  try { return await idbGet<Starmap>(IDB_PRE_UPGRADE_KEY); } catch { return null; }
}

export async function clearPreUpgradeStarmap(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(IDB_PRE_UPGRADE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch { /* nothing to clear, or storage is gone — either way there is no snapshot now */ }
}

// Wipe EVERYTHING this app has stored in the browser — the IndexedDB starmap DB, all localStorage
// (saved map, PoI/CoI packs, palette, rail, settings…) and sessionStorage. Used by the Settings danger
// zone to reproduce a brand-new-user state. Caller should reload the page afterwards.
export async function clearAllData(): Promise<void> {
  if (typeof window === 'undefined') return;
  try { window.localStorage.clear(); } catch { /* private mode */ }
  try { window.sessionStorage.clear(); } catch { /* private mode */ }

  // CLOSE the connection before deleting. Dropping the promise only lets go of our reference — the
  // underlying IDBDatabase stays open, deleteDatabase fires `onblocked` instead of deleting, and
  // since blocked used to resolve like success the danger button reported "done" and reloaded
  // straight back into the map it claimed to have deleted. That was the bug: not a stale render, a
  // delete that never happened.
  if (dbPromise) {
    try { (await dbPromise).close(); } catch { /* already gone */ }
    dbPromise = null;
  }

  if (hasIndexedDb()) {
    const deleted = await new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (ok: boolean) => { if (!done) { done = true; resolve(ok); } };
      try {
        const req = window.indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = () => finish(true);
        req.onerror = () => finish(false);
        req.onblocked = () => finish(false);   // another TAB still holds it — genuinely not deleted
        setTimeout(() => finish(false), 3000); // never hang the danger button
      } catch { finish(false); }
    });
    // Last resort: if the database itself could not be dropped (another tab of the app is open),
    // at least empty it, so a reload does not restore what the user asked to be rid of.
    if (!deleted) {
      try {
        const db = await openDb();
        await new Promise<void>((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        });
        db.close();
        dbPromise = null;
      } catch { /* nothing more we can do */ }
    }
  }
}

