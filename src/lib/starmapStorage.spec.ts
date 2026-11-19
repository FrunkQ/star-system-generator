// B-1 - "THE GAME JUST RESET AS I WAS GONNA SAVE." / "I GOTTA REDO THE NEXT TWO PLANETS AGAIN."
//
// The autosave writes the whole campaign to IndexedDB on every change, so a reload - asked for or
// not - should bring back the last edit. This file pins the three ways it did not:
//
//   1. A connection that died under the running page (a phone backgrounding the browser does this)
//      was cached for the rest of the visit, so every later write failed.
//   2. A failed write falls back to localStorage - and at the next start-up the OLDER IndexedDB copy
//      was loaded in preference, and the newer fallback copy was deleted as a "leftover".
//   3. When neither store would take the campaign, nobody was told.
//
// jsdom has no IndexedDB, so a small stand-in is built here with the faults a real one has: writes
// that are refused while reads still work (quota), a connection that dies (every transaction on it
// throws), and an open that fails. Every "reload" below is a fresh copy of the module over the same
// two stores, which is what a reload is.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Starmap } from './types';

// ---- a stand-in IndexedDB --------------------------------------------------------------------

function fakeIndexedDb() {
  const data = new Map<string, unknown>(); // the one object store, `kv`
  let created = false;
  const control = {
    data,
    refuseWrites: false, // quota exceeded: reads fine, every write transaction aborts
    failNextOpen: false,
    opens: 0,
    connections: [] as Array<{ dead: boolean; closed: boolean; onclose: null | (() => void) }>,
    /** What a phone does to a backgrounded tab: the connection is gone, and nobody tells the page. */
    killConnections() { for (const c of control.connections) c.dead = true; }
  };
  const later = (fn: () => void) => setTimeout(fn, 0);

  const makeDb = () => {
    const conn = { dead: false, closed: false, onclose: null as null | (() => void), onversionchange: null as null | (() => void) };
    control.connections.push(conn);
    return Object.assign(conn, {
      objectStoreNames: { contains: () => created },
      createObjectStore: () => { created = true; },
      close: () => { conn.closed = true; },
      transaction: (_store: string, mode: 'readonly' | 'readwrite') => {
        if (conn.dead || conn.closed) {
          throw new DOMException('The database connection is closing.', 'InvalidStateError');
        }
        const tx: any = { oncomplete: null, onerror: null, onabort: null, error: null };
        const pendingWrites: Array<() => void> = [];
        tx.objectStore = () => ({
          get: (key: string) => {
            const req: any = { onsuccess: null, onerror: null, result: undefined };
            later(() => { req.result = structuredClone(data.get(key)); req.onsuccess?.(); });
            return req;
          },
          put: (value: unknown, key: string) => { const v = structuredClone(value); pendingWrites.push(() => data.set(key, v)); },
          delete: (key: string) => { pendingWrites.push(() => data.delete(key)); },
          clear: () => { pendingWrites.push(() => data.clear()); }
        });
        if (mode === 'readwrite') {
          later(() => {
            if (control.refuseWrites) {
              tx.error = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
              tx.onabort?.();
            } else {
              pendingWrites.forEach((w) => w());
              tx.oncomplete?.();
            }
          });
        }
        return tx;
      }
    });
  };

  const indexedDB = {
    open: () => {
      control.opens++;
      const req: any = { onupgradeneeded: null, onsuccess: null, onerror: null, result: null, error: null };
      later(() => {
        if (control.failNextOpen) {
          control.failNextOpen = false;
          req.error = new DOMException('Internal error opening backing store.', 'UnknownError');
          req.onerror?.();
          return;
        }
        req.result = makeDb();
        if (!created) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
    deleteDatabase: () => {
      const req: any = { onsuccess: null, onerror: null, onblocked: null };
      later(() => { data.clear(); created = false; req.onsuccess?.(); });
      return req;
    }
  };
  return { indexedDB, control };
}

// ---- the page, and reloading it ----------------------------------------------------------------

const campaign = (label: string): Starmap =>
  ({ id: 'campaign', name: label, systems: [], routes: [], undoHistory: { starmap: ['big'], systems: {} } }) as unknown as Starmap;

let db: ReturnType<typeof fakeIndexedDb>;

/** A fresh copy of the storage module: its cached connection is gone, the two stores are not. */
async function loadPage() {
  vi.resetModules();
  return import('./starmapStorage');
}

/** What start-up does, in start-up's order. */
async function reloadAndRead(): Promise<Starmap | null> {
  const page = await loadPage();
  await page.migrateLegacyStarmapToIndexedDb();
  return page.loadSavedStarmap();
}

beforeEach(() => {
  localStorage.clear();
  db = fakeIndexedDb();
  vi.stubGlobal('indexedDB', db.indexedDB);
  (window as any).indexedDB = db.indexedDB;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('the ordinary case still works', () => {
  it('a saved campaign comes back after a reload, from IndexedDB, with nothing left in localStorage', async () => {
    const page = await loadPage();
    await page.saveStarmap(campaign('two planets'));
    expect((await reloadAndRead())?.name).toBe('two planets');
    expect(localStorage.length).toBe(0);
    expect((db.control.data.get('saved_starmap') as any).undoHistory, 'the undo history rides the IndexedDB copy').toBeTruthy();
  });

  it('a genuine V1 localStorage copy is still moved into IndexedDB once', async () => {
    localStorage.setItem('stargen_saved_starmap', JSON.stringify(campaign('from V1')));
    expect((await reloadAndRead())?.name).toBe('from V1');
    expect((db.control.data.get('saved_starmap') as any).name).toBe('from V1');
    expect(localStorage.getItem('stargen_saved_starmap')).toBeNull();
  });

  it('a stale V1 copy beside a real IndexedDB campaign is still discarded - IndexedDB wins', async () => {
    const page = await loadPage();
    await page.saveStarmap(campaign('the real campaign'));
    localStorage.setItem('stargen_saved_starmap', JSON.stringify(campaign('an old V1 leftover')));
    expect((await reloadAndRead())?.name).toBe('the real campaign');
    expect(localStorage.getItem('stargen_saved_starmap')).toBeNull();
  });
});

describe('a connection that dies under the running page (B-1)', () => {
  it('the next save reopens it and lands in IndexedDB - it does not fail for the rest of the visit', async () => {
    const page = await loadPage();
    await page.saveStarmap(campaign('before the phone went to another app'));
    db.control.killConnections();
    await page.saveStarmap(campaign('after coming back'));
    await page.saveStarmap(campaign('and one more planet'));
    expect((db.control.data.get('saved_starmap') as any).name).toBe('and one more planet');
    expect(localStorage.length, 'no need for the fallback at all').toBe(0);
    expect((await reloadAndRead())?.name).toBe('and one more planet');
  });

  it('a read on a dead connection reopens too', async () => {
    const page = await loadPage();
    await page.saveStarmap(campaign('saved'));
    db.control.killConnections();
    expect((await page.loadSavedStarmap())?.name).toBe('saved');
  });

  it('an open that fails once is not remembered: the following save uses IndexedDB', async () => {
    const page = await loadPage();
    db.control.failNextOpen = true;
    // The first attempt and its one retry: the retry opens cleanly, so even this save lands.
    await page.saveStarmap(campaign('first'));
    await page.saveStarmap(campaign('second'));
    expect((db.control.data.get('saved_starmap') as any).name).toBe('second');
    expect(localStorage.length).toBe(0);
  });
});

describe('IndexedDB refusing writes while it still answers reads (B-1)', () => {
  it('THE REPORTED LOSS: work saved to the fallback survives the reload instead of being deleted', async () => {
    const page = await loadPage();
    await page.saveStarmap(campaign('as it stood before the trouble'));
    db.control.refuseWrites = true;
    await page.saveStarmap(campaign('plus the first new planet'));
    await page.saveStarmap(campaign('plus the second new planet'));

    // The reload. IndexedDB still holds the old copy and still refuses writes.
    const back = await reloadAndRead();
    expect(back?.name).toBe('plus the second new planet');
    expect(localStorage.getItem('stargen_saved_starmap'), 'the only copy of that work must not be deleted').not.toBeNull();
    // ...and it survives a SECOND reload the same way, for as long as IndexedDB refuses.
    expect((await reloadAndRead())?.name).toBe('plus the second new planet');
  });

  it('once IndexedDB takes writes again the newer copy is moved in, and the fallback is retired', async () => {
    const page = await loadPage();
    await page.saveStarmap(campaign('old'));
    db.control.refuseWrites = true;
    await page.saveStarmap(campaign('new'));
    db.control.refuseWrites = false;

    expect((await reloadAndRead())?.name).toBe('new');
    expect((db.control.data.get('saved_starmap') as any).name).toBe('new');
    expect(localStorage.length, 'copy and marker both gone').toBe(0);
  });

  it('a later successful save in the same visit retires the fallback, so it can never win as a stale copy', async () => {
    const page = await loadPage();
    db.control.refuseWrites = true;
    await page.saveStarmap(campaign('written to the fallback'));
    db.control.refuseWrites = false;
    await page.saveStarmap(campaign('written to IndexedDB afterwards'));
    expect(localStorage.length).toBe(0);
    expect((await reloadAndRead())?.name).toBe('written to IndexedDB afterwards');
  });

  it('the fallback copy leaves the undo history behind, as it always did', async () => {
    const page = await loadPage();
    db.control.refuseWrites = true;
    await page.saveStarmap(campaign('lean'));
    expect(JSON.parse(localStorage.getItem('stargen_saved_starmap')!).undoHistory).toBeUndefined();
  });
});

describe('when nothing will take the campaign', () => {
  it('saveStarmap REJECTS, so the caller can tell the GM - it never resolves on a save that did not happen', async () => {
    const page = await loadPage();
    await page.saveStarmap(campaign('the last good save'));
    db.control.refuseWrites = true;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    try {
      await expect(page.saveStarmap(campaign('unsaveable'))).rejects.toThrow(/quota/i);
    } finally {
      setItem.mockRestore();
    }
    // And the last good save is still what a reload finds - not hidden by a marker with no copy.
    expect((await reloadAndRead())?.name).toBe('the last good save');
  });
});
