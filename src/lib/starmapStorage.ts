import type { Starmap } from './types';

const LEGACY_STARMAP_KEY = 'stargen_saved_starmap';
const DB_NAME = 'stargen_storage';
const STORE_NAME = 'kv';
const IDB_STARMAP_KEY = 'saved_starmap';

let dbPromise: Promise<IDBDatabase> | null = null;

function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
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

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });

  return dbPromise;
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
  });
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(value, key);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export async function migrateLegacyStarmapToIndexedDb(): Promise<void> {
  if (typeof window === 'undefined') return;

  const legacyRaw = window.localStorage.getItem(LEGACY_STARMAP_KEY);
  if (!legacyRaw) return;

  try {
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

  try {
    const fromIdb = await idbGet<Starmap>(IDB_STARMAP_KEY);
    if (fromIdb) return fromIdb;
  } catch (error) {
    console.warn('IndexedDB starmap load failed, attempting localStorage fallback.', error);
  }

  const legacyRaw = window.localStorage.getItem(LEGACY_STARMAP_KEY);
  if (!legacyRaw) return null;

  try {
    return JSON.parse(legacyRaw) as Starmap;
  } catch {
    return null;
  }
}

export async function saveStarmap(starmap: Starmap): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    await idbSet(IDB_STARMAP_KEY, starmap);
  } catch (error) {
    console.warn('IndexedDB starmap save failed, using localStorage fallback.', error);
    window.localStorage.setItem(LEGACY_STARMAP_KEY, JSON.stringify(starmap));
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

