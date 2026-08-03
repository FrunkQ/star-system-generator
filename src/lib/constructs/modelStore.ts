// Hash-addressed store for construct 3D models (G3, design: docs/dev/ship-appearance-design.md §4).
//
// WHY A SIDE STORE AND NOT A DATA URL ON THE NODE: the broadcast layer re-stringifies the whole
// snapshot on every reactive tick and re-sends the whole payload on any change (broadcast.ts
// sendIfChanged). A photo at 30-80 KB rides that acceptably; a model at 5-10x the size does not.
// So the node carries only a ModelRef ({ hash, attribution... }, types.ts) and the binary lives
// here, keyed by its SHA-256, shipped to a consumer ONCE and cached by content — identical hulls
// on twenty ships cost one entry.
//
// Own database, deliberately: adding a store to stargen_storage would bump that DB's version, and
// parallel sessions share this tree (see the inbox standing rules). Self-contained is safer.
import type { ModelRef } from '$lib/types';

const DB_NAME = 'sse_model_store';
const STORE = 'models';

export interface StoredModel {
  bytes: ArrayBuffer;      // the normalised GLB binary
  meta: ModelRef;          // same shape the node carries — attribution survives with the binary
  savedAtMs: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!hasIndexedDb()) { reject(new Error('IndexedDB is unavailable')); return; }
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open model store'));
  });
  return dbPromise;
}

/** SHA-256 of the binary, hex — the content address. */
export async function hashModelBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Store a model under its content hash; returns the hash. Idempotent by construction. */
export async function putModel(bytes: ArrayBuffer, meta: Omit<ModelRef, 'hash'>): Promise<string> {
  const hash = await hashModelBytes(bytes);
  const db = await openDb();
  const entry: StoredModel = { bytes, meta: { ...meta, hash }, savedAtMs: Date.now() };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(entry, hash);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Model store write failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Model store write aborted'));
  });
  return hash;
}

export async function getModel(hash: string): Promise<StoredModel | null> {
  if (!hasIndexedDb()) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(hash);
    request.onsuccess = () => resolve((request.result as StoredModel | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Model store read failed'));
  });
}

export async function hasModel(hash: string): Promise<boolean> {
  return (await getModel(hash).catch(() => null)) !== null;
}

export async function deleteModel(hash: string): Promise<void> {
  if (!hasIndexedDb()) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(hash);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Model store delete failed'));
  });
}

/** Every stored hash — for export embedding and future garbage collection against a campaign. */
export async function listModelHashes(): Promise<string[]> {
  if (!hasIndexedDb()) return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAllKeys();
    request.onsuccess = () => resolve((request.result as string[]) ?? []);
    request.onerror = () => reject(request.error ?? new Error('Model store keys failed'));
  });
}
