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

