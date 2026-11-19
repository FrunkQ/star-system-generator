// UI-L10 - AFTER A RELOAD, BACK INTO THE SYSTEM THE GM WAS IN - AND NEVER INTO A CRASH LOOP.
//
// Two halves, pinned separately because either one alone is a fault. The restore must HAPPEN (a
// phone that reloads mid-edit put its owner back on the starmap every time), and it must be a
// ONE-SHOT: if opening that system is what killed the tab, the next start-up stays on the starmap.
// The route's half - that the page actually calls this, and stays out of the way of safe mode and
// shared links - is in `routes/page.spec.ts`.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createViewRestore, decideStartupView, parseViewRecord, declinedRestoreNotice,
  VIEW_RESTORE_KEY, VIEW_SETTLE_MS, type ViewRestoreStorage, type ViewRecord
} from './viewRestore';

function memoryStorage(): ViewRestoreStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k)
  };
}

const CAMPAIGN = {
  id: 'campaign',
  systems: [
    { id: 'sol', name: 'Sol', system: { id: 'sol' } },
    { id: 'node-7', name: 'Kepler-32', system: { id: 'kepler-inner' } } // imported: two ids, one system
  ]
};

/** One visit: a page over this tab's storage, with a window and a document that can be hidden. */
function visit(storage: ViewRestoreStorage, opts: { ready?: () => boolean; hidden?: boolean; settleMs?: number } = {}) {
  const win = new EventTarget();
  const docTarget = new EventTarget();
  let hidden = opts.hidden ?? false;
  const doc = {
    addEventListener: docTarget.addEventListener.bind(docTarget),
    removeEventListener: docTarget.removeEventListener.bind(docTarget),
    get hidden() { return hidden; }
  };
  const view = createViewRestore({ storage, win: win as any, doc: doc as any, ready: opts.ready, settleMs: opts.settleMs });
  return {
    view,
    hide() { hidden = true; docTarget.dispatchEvent(new Event('visibilitychange')); },
    show() { hidden = false; docTarget.dispatchEvent(new Event('visibilitychange')); },
    tap() { win.dispatchEvent(new Event('pointerdown')); },
    key() { win.dispatchEvent(new Event('keydown')); },
    loseGraphics() { win.dispatchEvent(new Event('webglcontextlost')); }
  };
}

const stored = (storage: ViewRestoreStorage): ViewRecord | null => parseViewRecord(storage.getItem(VIEW_RESTORE_KEY));
const remember = (storage: ViewRestoreStorage, rec: ViewRecord) => storage.setItem(VIEW_RESTORE_KEY, JSON.stringify(rec));
/** Long enough for the open to come up and the whole dwell to run. */
const stayOpen = () => vi.advanceTimersByTime(VIEW_SETTLE_MS + 50);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('the decision start-up makes', () => {
  const settled: ViewRecord = { mapId: 'campaign', systemId: 'sol', settled: true };

  it('goes back into a system that settled and is still in the campaign', () => {
    expect(decideStartupView(settled, CAMPAIGN, false)).toEqual({ kind: 'restore', systemId: 'sol' });
  });

  it('restores nothing when blocked, whatever is remembered', () => {
    expect(decideStartupView(settled, CAMPAIGN, true)).toEqual({ kind: 'none' });
  });

  it('says nothing about a system that is no longer in the campaign - settled or not', () => {
    expect(decideStartupView({ ...settled, systemId: 'deleted' }, CAMPAIGN, false)).toEqual({ kind: 'none' });
    expect(decideStartupView({ ...settled, systemId: 'deleted', settled: false }, CAMPAIGN, false)).toEqual({ kind: 'none' });
  });

  it('does not open a same-named system in a DIFFERENT campaign', () => {
    expect(decideStartupView({ ...settled, mapId: 'another-campaign' }, CAMPAIGN, false)).toEqual({ kind: 'none' });
  });

  it('declines an open that never settled, and names the system', () => {
    expect(decideStartupView({ ...settled, settled: false }, CAMPAIGN, false))
      .toEqual({ kind: 'declined', systemId: 'sol', name: 'Sol' });
    expect(declinedRestoreNotice('Sol')).toBe(
      'Did not go back into "Sol" — it had only just been opened when the page last reloaded, so it is left for you to open again.'
    );
  });

  it('finds an imported system by either of its ids and answers with the map node', () => {
    expect(decideStartupView({ ...settled, systemId: 'kepler-inner' }, CAMPAIGN, false)).toEqual({ kind: 'restore', systemId: 'node-7' });
    expect(decideStartupView({ ...settled, systemId: 'node-7' }, CAMPAIGN, false)).toEqual({ kind: 'restore', systemId: 'node-7' });
  });

  it('has nothing to decide with no record, no campaign, or a record that is not one', () => {
    expect(decideStartupView(null, CAMPAIGN, false)).toEqual({ kind: 'none' });
    expect(decideStartupView(settled, null, false)).toEqual({ kind: 'none' });
    for (const junk of ['', 'not json', '{}', '{"mapId":"campaign"}', '{"mapId":1,"systemId":2}', 'null']) {
      expect(parseViewRecord(junk), junk).toBeNull();
    }
    // "settled" is true only when it says exactly that: anything else is an open not yet trusted.
    expect(parseViewRecord('{"mapId":"a","systemId":"b","settled":"yes"}')?.settled).toBe(false);
  });
});

describe('an open is trusted only once it has settled', () => {
  it('is written down unsettled the moment it is entered, and settled after staying open', () => {
    const storage = memoryStorage();
    const { view } = visit(storage);
    view.entered('campaign', 'sol');
    expect(stored(storage)).toEqual({ mapId: 'campaign', systemId: 'sol', settled: false });
    vi.advanceTimersByTime(VIEW_SETTLE_MS - 100);
    expect(stored(storage)?.settled, 'not before the dwell has run').toBe(false);
    vi.advanceTimersByTime(200);
    expect(stored(storage)).toEqual({ mapId: 'campaign', systemId: 'sol', settled: true });
  });

  it('counts the dwell from when the open came up, not from when it was asked for', async () => {
    // Fake timers fire in order and on time, so they cannot show a BLOCKED main thread - which is
    // the case this is about. Real ones, and a real busy loop standing in for a slow mount.
    vi.useRealTimers();
    const storage = memoryStorage();
    const { view } = visit(storage, { settleMs: 400 });
    view.entered('campaign', 'sol');
    const until = Date.now() + 500; // a mount that blocks for longer than the whole dwell
    while (Date.now() < until) { /* the main thread is busy */ }
    await new Promise((r) => setTimeout(r, 20));
    expect(stored(storage)?.settled, 'a slow mount is not time spent open').toBe(false);
    await new Promise((r) => setTimeout(r, 600));
    expect(stored(storage)?.settled).toBe(true);
    view.destroy();
  });

  it('does not count time the page spent hidden', () => {
    const storage = memoryStorage();
    const page = visit(storage);
    page.view.entered('campaign', 'sol');
    vi.advanceTimersByTime(1000);
    page.hide();
    vi.advanceTimersByTime(VIEW_SETTLE_MS * 10);
    expect(stored(storage)?.settled, 'hidden: nothing was drawn, so nothing was proved').toBe(false);
    page.show();
    vi.advanceTimersByTime(VIEW_SETTLE_MS - 100);
    expect(stored(storage)?.settled, 'the dwell starts again when the page is shown').toBe(false);
    vi.advanceTimersByTime(200);
    expect(stored(storage)?.settled).toBe(true);
  });

  it('a page that was hidden when the system opened settles only after it has been shown', () => {
    const storage = memoryStorage();
    const page = visit(storage, { hidden: true });
    page.view.entered('campaign', 'sol');
    vi.advanceTimersByTime(VIEW_SETTLE_MS * 10);
    expect(stored(storage)?.settled).toBe(false);
    page.show();
    stayOpen();
    expect(stored(storage)?.settled).toBe(true);
  });

  it('never settles a system view that is not actually there', () => {
    const storage = memoryStorage();
    const { view } = visit(storage, { ready: () => false }); // it threw while mounting
    view.entered('campaign', 'sol');
    vi.advanceTimersByTime(VIEW_SETTLE_MS * 10);
    expect(stored(storage)).toEqual({ mapId: 'campaign', systemId: 'sol', settled: false });
  });

  it('never settles an open that cost the page its graphics', () => {
    const storage = memoryStorage();
    const page = visit(storage);
    page.view.entered('campaign', 'sol');
    vi.advanceTimersByTime(1000);
    page.loseGraphics();
    vi.advanceTimersByTime(VIEW_SETTLE_MS * 10);
    page.tap();
    expect(stored(storage)).toEqual({ mapId: 'campaign', systemId: 'sol', settled: false });
  });

  it('graphics lost AFTER it settled do not undo it: reloading is the cure, and the GM wants back in', () => {
    const storage = memoryStorage();
    const page = visit(storage);
    page.view.entered('campaign', 'sol');
    stayOpen();
    page.loseGraphics();
    expect(stored(storage)?.settled).toBe(true);
  });

  it('the GM using a system they opened themselves settles it early', () => {
    const storage = memoryStorage();
    const page = visit(storage);
    page.view.entered('campaign', 'sol');
    page.tap();
    expect(stored(storage)?.settled, 'not before the open has come up').toBe(false);
    vi.advanceTimersByTime(1);
    page.key();
    expect(stored(storage)?.settled).toBe(true);
  });

  it('noting the system the GM is already in changes nothing', () => {
    const storage = memoryStorage();
    const { view } = visit(storage);
    view.entered('campaign', 'sol');
    stayOpen();
    view.entered('campaign', 'sol');
    expect(stored(storage)?.settled, 'a settled open stays settled').toBe(true);
    view.entered('campaign', 'node-7');
    expect(stored(storage)).toEqual({ mapId: 'campaign', systemId: 'node-7', settled: false });
  });

  it('leaving for the starmap forgets it, and a late timer does not bring it back', () => {
    const storage = memoryStorage();
    const { view } = visit(storage);
    view.entered('campaign', 'sol');
    vi.advanceTimersByTime(1000);
    view.forget();
    expect(storage.map.size).toBe(0);
    vi.advanceTimersByTime(VIEW_SETTLE_MS * 10);
    expect(storage.map.size).toBe(0);
  });

  it('a page that is torn down stops watching and leaves the record as it was', () => {
    const storage = memoryStorage();
    const { view } = visit(storage);
    view.entered('campaign', 'sol');
    view.destroy();
    vi.advanceTimersByTime(VIEW_SETTLE_MS * 10);
    expect(stored(storage)).toEqual({ mapId: 'campaign', systemId: 'sol', settled: false });
  });

  it('storage that throws is survived, and simply remembers nothing', () => {
    const boom = () => { throw new Error('SecurityError'); };
    const view = createViewRestore({ storage: { getItem: boom, setItem: boom, removeItem: boom } });
    expect(() => { view.entered('campaign', 'sol'); stayOpen(); view.forget(); }).not.toThrow();
    expect(view.startup(CAMPAIGN)).toEqual({ kind: 'none' });
    expect(createViewRestore({ storage: null }).startup(CAMPAIGN)).toEqual({ kind: 'none' });
  });
});

describe('start-up: the restore, and the one-shot that keeps it from looping', () => {
  it('goes back in, and has ALREADY disarmed itself by the time it says so', () => {
    const storage = memoryStorage();
    remember(storage, { mapId: 'campaign', systemId: 'sol', settled: true });
    const { view } = visit(storage);
    expect(view.startup(CAMPAIGN)).toEqual({ kind: 'restore', systemId: 'sol' });
    // Absolute, and before the open has even been attempted: this is what the next visit reads if
    // the attempt takes the tab down.
    expect(storage.getItem(VIEW_RESTORE_KEY)).toBe('{"mapId":"campaign","systemId":"sol","settled":false}');
  });

  it('THE CRASH LOOP: a restore that kills the tab is not attempted a second time', () => {
    const storage = memoryStorage();
    remember(storage, { mapId: 'campaign', systemId: 'sol', settled: true });

    const first = visit(storage);
    expect(first.view.startup(CAMPAIGN).kind).toBe('restore');
    first.view.entered('campaign', 'sol');
    vi.advanceTimersByTime(1000);
    // ...and the tab dies here: no event, no handler, nothing more from this page.

    const second = visit(storage);
    expect(second.view.startup(CAMPAIGN)).toEqual({ kind: 'declined', systemId: 'sol', name: 'Sol' });
    expect(storage.map.size, 'and it is forgotten, so it is said once').toBe(0);

    const third = visit(storage);
    expect(third.view.startup(CAMPAIGN)).toEqual({ kind: 'none' });
  });

  it('a restored open is not settled by a tap - it has to stay up', () => {
    const storage = memoryStorage();
    remember(storage, { mapId: 'campaign', systemId: 'sol', settled: true });
    const page = visit(storage);
    page.view.startup(CAMPAIGN);
    page.view.entered('campaign', 'sol');
    vi.advanceTimersByTime(1);
    page.tap();
    page.key();
    expect(stored(storage)?.settled, 'the app opened this one; a tap proves nothing').toBe(false);
    stayOpen();
    expect(stored(storage)?.settled).toBe(true);
  });

  it('re-arms once the restored system has stayed open, so the NEXT reload goes back in too', () => {
    const storage = memoryStorage();
    remember(storage, { mapId: 'campaign', systemId: 'sol', settled: true });
    const first = visit(storage);
    first.view.startup(CAMPAIGN);
    first.view.entered('campaign', 'sol');
    stayOpen();
    expect(visit(storage).view.startup(CAMPAIGN)).toEqual({ kind: 'restore', systemId: 'sol' });
  });

  it('a system that killed the tab when the GM first clicked it is not re-opened either', () => {
    const storage = memoryStorage();
    const first = visit(storage);
    first.view.entered('campaign', 'sol');
    // the tab dies inside the open
    expect(visit(storage).view.startup(CAMPAIGN).kind).toBe('declined');
  });

  it('a blocked start-up forgets what was remembered, so a later reload does not act on it', () => {
    const storage = memoryStorage();
    remember(storage, { mapId: 'campaign', systemId: 'sol', settled: true });
    expect(visit(storage).view.startup(null, true)).toEqual({ kind: 'none' });
    expect(storage.map.size).toBe(0);
    expect(visit(storage).view.startup(CAMPAIGN)).toEqual({ kind: 'none' });
  });

  it('the GM who left for the starmap before reloading stays on the starmap', () => {
    const storage = memoryStorage();
    const first = visit(storage);
    first.view.entered('campaign', 'sol');
    stayOpen();
    first.view.forget(); // back to the starmap
    expect(visit(storage).view.startup(CAMPAIGN)).toEqual({ kind: 'none' });
  });

  it('another tab has its own storage and is not dragged anywhere', () => {
    const thisTab = memoryStorage();
    const otherTab = memoryStorage();
    const page = visit(thisTab);
    page.view.entered('campaign', 'sol');
    stayOpen();
    expect(visit(otherTab).view.startup(CAMPAIGN)).toEqual({ kind: 'none' });
    expect(visit(thisTab).view.startup(CAMPAIGN).kind).toBe('restore');
  });
});
