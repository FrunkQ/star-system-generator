// B2 - THE LOAD GUARD MUST TELL A HUNG LOAD FROM A PAGE THAT WENT AWAY.
//
// The report: "The last load didn't finish" appearing "randomly", on maps with nothing wrong with
// them, and "Try again" always working. The cause: the stamp was withdrawn only by a FINISHED load,
// so any load whose page was reloaded, closed, or put in the background before it finished left the
// stamp behind and the next visit read it as a hang.
//
// The fix must not buy that by weakening the thing the guard is for, so this file pins BOTH halves:
// the page going away withdraws the stamp, and a load that stops with no event at all - which is
// what a hang and an out-of-memory kill both look like from inside - keeps it.
import { describe, it, expect } from 'vitest';
import { createLoadGuard, LOAD_GUARD_KEY, type GuardStorage } from './loadGuard';

function memoryStorage(): GuardStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k)
  };
}

/** A page: a window and a document that can be hidden, shown, unloaded and restored. */
function page(storage: GuardStorage, opts: { hidden?: boolean } = {}) {
  const win = new EventTarget();
  const docTarget = new EventTarget();
  let hidden = opts.hidden ?? false;
  const doc = {
    addEventListener: docTarget.addEventListener.bind(docTarget),
    removeEventListener: docTarget.removeEventListener.bind(docTarget),
    get hidden() { return hidden; }
  };
  const guard = createLoadGuard({ storage, win: win as unknown as Window, doc: doc as unknown as Document });
  return {
    guard,
    hide() { hidden = true; docTarget.dispatchEvent(new Event('visibilitychange')); },
    show() { hidden = false; docTarget.dispatchEvent(new Event('visibilitychange')); },
    unload() { win.dispatchEvent(new Event('pagehide')); },
    restore() { win.dispatchEvent(new Event('pageshow')); }
  };
}

/** What the NEXT visit would find: a fresh page over the same storage, asked before it arms. */
const nextVisitFinds = (storage: GuardStorage) => page(storage).guard.tripped();

describe('the load guard still catches a load that really stopped', () => {
  it('a load that stops with no event at all leaves its stage for the next visit', () => {
    const storage = memoryStorage();
    const { guard } = page(storage);
    guard.arm('reading browser storage');
    guard.stage('physics: Sol');
    // ...and nothing more: the main thread is stuck, or the tab was killed. No handler runs.
    expect(nextVisitFinds(storage)).toBe('physics: Sol');
  });

  it('a finished load leaves nothing', () => {
    const storage = memoryStorage();
    const { guard } = page(storage);
    guard.arm('reading browser storage');
    guard.stage('first starmap render');
    guard.clear();
    expect(nextVisitFinds(storage)).toBeNull();
    expect(storage.map.size).toBe(0);
  });

  it('a stage noted before arming, or after clearing, writes nothing', () => {
    const storage = memoryStorage();
    const { guard } = page(storage);
    guard.stage('physics: Sol');
    expect(storage.map.has(LOAD_GUARD_KEY)).toBe(false);
    guard.arm('reading browser storage');
    guard.clear();
    guard.stage('physics: Sol');
    expect(storage.map.has(LOAD_GUARD_KEY)).toBe(false);
  });
});

describe('a page that goes away mid-load is not a load that hung (B2)', () => {
  it('a reload or a closed tab part way through the physics leaves nothing for the next visit', () => {
    const storage = memoryStorage();
    const p = page(storage);
    p.guard.arm('reading browser storage');
    p.guard.stage('physics: Sol');
    expect(storage.map.get(LOAD_GUARD_KEY)).toBe('physics: Sol');
    p.unload(); // pagehide: only a live main thread can deliver it
    expect(nextVisitFinds(storage)).toBeNull();
  });

  it('a phone that backgrounds the browser mid-load, then discards the tab, leaves nothing', () => {
    const storage = memoryStorage();
    const p = page(storage);
    p.guard.arm('reading browser storage');
    p.guard.stage('physics: Sol');
    p.hide();
    // The load carries on in the background and reaches later stages; none of them may re-stamp,
    // or a tab frozen and discarded from here would trip the guard on the next visit.
    p.guard.stage('physics: Alpha Centauri');
    p.guard.stage('first starmap render');
    expect(nextVisitFinds(storage)).toBeNull();
  });

  it('a load started in a background tab is not stamped until somebody can see it', () => {
    const storage = memoryStorage();
    const p = page(storage, { hidden: true });
    p.guard.arm('reading browser storage');
    p.guard.stage('physics: Sol');
    expect(storage.map.has(LOAD_GUARD_KEY)).toBe(false);
  });

  it('coming back while the load is still running guards it again, from the stage it has reached', () => {
    const storage = memoryStorage();
    const p = page(storage);
    p.guard.arm('reading browser storage');
    p.hide();
    p.guard.stage('physics: Alpha Centauri');
    p.show();
    expect(storage.map.get(LOAD_GUARD_KEY)).toBe('physics: Alpha Centauri');
    // ...so a hang from here on is caught exactly as it always was.
    expect(nextVisitFinds(storage)).toBe('physics: Alpha Centauri');
  });

  it('a page restored from the back/forward cache mid-load is guarded again', () => {
    const storage = memoryStorage();
    const p = page(storage);
    p.guard.arm('reading browser storage');
    p.guard.stage('physics: Sol');
    p.unload();
    expect(storage.map.has(LOAD_GUARD_KEY)).toBe(false);
    p.restore();
    expect(storage.map.get(LOAD_GUARD_KEY)).toBe('physics: Sol');
  });

  it('coming back after the load finished does not bring the stamp back', () => {
    const storage = memoryStorage();
    const p = page(storage);
    p.guard.arm('reading browser storage');
    p.hide();
    p.guard.clear();
    p.show();
    p.unload();
    p.restore();
    expect(storage.map.size).toBe(0);
  });

  it('hiding a page that is not loading touches nothing - another tab may own the stamp', () => {
    const storage = memoryStorage();
    storage.setItem(LOAD_GUARD_KEY, 'physics: left by a hung tab');
    const p = page(storage);
    p.hide();
    p.show();
    p.unload();
    expect(storage.map.get(LOAD_GUARD_KEY)).toBe('physics: left by a hung tab');
  });
});

describe('a page component that is torn down mid-load (a move to another route)', () => {
  it('withdraws its stamp, and the tail of its load can no longer touch a newer page\'s stamp', () => {
    const storage = memoryStorage();
    const old = page(storage);
    old.guard.arm('reading browser storage');
    old.guard.stage('physics: Sol');
    old.guard.destroy();
    expect(storage.map.has(LOAD_GUARD_KEY), 'the teardown ran, so the load was not hung').toBe(false);

    // The GM comes back to the app: a new page, a new load, its own stamp.
    const fresh = page(storage);
    fresh.guard.arm('reading browser storage');
    // Meanwhile the old load, still running in its dead component, reaches its end.
    old.guard.stage('first starmap render');
    old.guard.clear();
    old.hide();
    old.unload();
    expect(storage.map.get(LOAD_GUARD_KEY)).toBe('reading browser storage');
  });
});

describe('storage that throws never breaks a load', () => {
  it('every call is survivable in a browser that refuses storage', () => {
    const refuses: GuardStorage = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => { throw new Error('SecurityError'); }
    };
    const p = page(refuses);
    expect(() => { p.guard.arm('a'); p.guard.stage('b'); p.hide(); p.show(); p.unload(); p.guard.clear(); }).not.toThrow();
    expect(p.guard.tripped()).toBeNull();
  });

  it('works with no storage and no page at all (server render)', () => {
    const guard = createLoadGuard({ storage: null });
    expect(() => { guard.arm('a'); guard.stage('b'); guard.clear(); guard.destroy(); }).not.toThrow();
    expect(guard.tripped()).toBeNull();
  });
});
