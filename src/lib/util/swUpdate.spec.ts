// B3 - "WHEN YOU CLICK CANCEL IT INFINITELY REFRESHES."
//
// The prompt in question is the app's own "A new version is available. Reload now to update?", and
// its Cancel did not cancel: the worker skipped its own wait at install, the layout reloaded on
// every controller change, and nothing remembered the answer. Two halves had to change together -
// the page (`swUpdate.ts`) and the worker (`static/sw.js`) - so both are pinned here, the worker by
// RUNNING the shipped file against a stand-in for the worker scope rather than by reading its text.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { wireServiceWorkerUpdates, SKIP_WAITING_MESSAGE, UPDATE_PROMPT, type SwContainerLike } from './swUpdate';

// ---- a browser's service-worker plumbing, small enough to drive by hand -------------------------

function fakeWorker() {
  const listeners: Array<() => void> = [];
  const worker = {
    state: 'installing',
    posted: [] as unknown[],
    postMessage(m: unknown) { worker.posted.push(m); },
    addEventListener(_type: 'statechange', l: () => void) { listeners.push(l); },
    become(state: string) { worker.state = state; listeners.forEach((l) => l()); }
  };
  return worker;
}

function fakeBrowser(opts: { controlled: boolean }) {
  const controllerListeners: Array<() => void> = [];
  const updateFound: Array<() => void> = [];
  const registration = {
    installing: null as ReturnType<typeof fakeWorker> | null,
    update: vi.fn(() => Promise.resolve()),
    addEventListener(_type: 'updatefound', l: () => void) { updateFound.push(l); }
  };
  const container: SwContainerLike & { controller: unknown } = {
    controller: opts.controlled ? {} : null,
    register: vi.fn(() => Promise.resolve(registration)),
    addEventListener(_type: 'controllerchange', l: () => void) { controllerListeners.push(l); }
  };
  return {
    container,
    registration,
    /** A new version of sw.js was found and has finished installing. */
    async newVersionInstalls() {
      await Promise.resolve(); await Promise.resolve(); // let register().then() attach its listener
      const worker = fakeWorker();
      registration.installing = worker;
      updateFound.forEach((l) => l());
      worker.become('installed');
      return worker;
    },
    /** A different worker now controls this page. */
    controllerChanges() { container.controller = {}; controllerListeners.forEach((l) => l()); }
  };
}

function memorySession() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

/**
 * A page that has been open long enough for a new release to be news to it. `now` jumps ten minutes
 * between the wiring call (the first read) and everything after, which is the long-open tab the
 * prompt exists for; the just-loaded page has its own case below.
 */
function openForAWhile(start = 1_000_000) {
  let first = true;
  const clock = { t: start };
  const now = () => { if (first) { first = false; return clock.t - 10 * 60_000; } return clock.t; };
  return { now, clock };
}

describe('the "new version" prompt (B3)', () => {
  it('Cancel means no reload - not now, and not when the controller changes anyway', async () => {
    const browser = fakeBrowser({ controlled: true });
    const reload = vi.fn();
    const ask = vi.fn(() => false);
    wireServiceWorkerUpdates({ container: browser.container, ask, reload, session: memorySession(), now: openForAWhile().now });

    const worker = await browser.newVersionInstalls();
    expect(ask).toHaveBeenCalledWith(UPDATE_PROMPT);
    expect(worker.posted, 'a declined update is not told to take over').toEqual([]);

    // A worker from before this fix skips its own wait and takes the page over regardless. The page
    // must still not reload: that reload, after a "no", is the bug.
    browser.controllerChanges();
    await settle();
    expect(reload).not.toHaveBeenCalled();
  });

  it('a "no" is remembered: later versions in the same tab do not ask again, and never reload', async () => {
    const browser = fakeBrowser({ controlled: true });
    const reload = vi.fn();
    const ask = vi.fn(() => false);
    const session = memorySession();
    wireServiceWorkerUpdates({ container: browser.container, ask, reload, session, now: openForAWhile().now });
    await browser.newVersionInstalls();
    await browser.newVersionInstalls();
    browser.controllerChanges();

    // ...and a RELOAD of that tab (same sessionStorage, new page) finding yet another one stays quiet
    // too. This is the reported loop: asked on every reload, reloaded by every Cancel.
    const reloaded = fakeBrowser({ controlled: true });
    wireServiceWorkerUpdates({ container: reloaded.container, ask, reload, session, now: openForAWhile().now });
    await reloaded.newVersionInstalls();
    reloaded.controllerChanges();
    await settle();

    expect(ask).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('a "no" is remembered even where sessionStorage refuses to work', async () => {
    const browser = fakeBrowser({ controlled: true });
    const ask = vi.fn(() => false);
    const refuses = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } };
    wireServiceWorkerUpdates({ container: browser.container, ask, reload: vi.fn(), session: refuses, now: openForAWhile().now });
    await browser.newVersionInstalls();
    await browser.newVersionInstalls();
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('OK tells the waiting worker to take over, saves first, then reloads exactly once', async () => {
    const browser = fakeBrowser({ controlled: true });
    const order: string[] = [];
    const reload = vi.fn(() => void order.push('reload'));
    const beforeReload = vi.fn(async () => { await settle(); order.push('saved'); });
    wireServiceWorkerUpdates({ container: browser.container, ask: () => true, reload, beforeReload, session: memorySession(), now: openForAWhile().now });

    const worker = await browser.newVersionInstalls();
    expect(worker.posted).toEqual([SKIP_WAITING_MESSAGE]);
    expect(reload, 'not before the new worker has actually taken over').not.toHaveBeenCalled();

    browser.controllerChanges();
    browser.controllerChanges(); // a second change must not start a second reload
    await settle(); await settle();
    expect(order).toEqual(['saved', 'reload']);
  });

  it('a save that fails does not strand the GM on a page they agreed to leave', async () => {
    const browser = fakeBrowser({ controlled: true });
    const reload = vi.fn();
    wireServiceWorkerUpdates({
      container: browser.container, ask: () => true, reload, session: memorySession(), now: openForAWhile().now,
      beforeReload: () => Promise.reject(new Error('storage is gone'))
    });
    await browser.newVersionInstalls();
    browser.controllerChanges();
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('a first visit is neither asked nor reloaded when its brand-new worker claims the page', async () => {
    const browser = fakeBrowser({ controlled: false });
    const reload = vi.fn();
    const ask = vi.fn(() => true);
    wireServiceWorkerUpdates({ container: browser.container, ask, reload, session: memorySession(), now: openForAWhile().now });
    await browser.newVersionInstalls();
    browser.controllerChanges(); // clients.claim() on the first install
    await settle();
    expect(ask).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('an "update" found straight after updating is not offered again - no reload loop with a button on it', async () => {
    const session = memorySession();
    const ask = vi.fn(() => true);
    const first = fakeBrowser({ controlled: true });
    const a = openForAWhile(1_000_000);
    wireServiceWorkerUpdates({ container: first.container, ask, reload: vi.fn(), session, now: a.now });
    await first.newVersionInstalls(); // accepted at t = 1,000,000: the page reloads

    // Five seconds on, the reloaded page is told there is ANOTHER one. (Its own youth is taken out
    // of the picture by `openForAWhile`, so this pins the after-accept window and nothing else.)
    const afterReload = fakeBrowser({ controlled: true });
    const reload = vi.fn();
    wireServiceWorkerUpdates({ container: afterReload.container, ask, reload, session, now: openForAWhile(1_005_000).now });
    const again = await afterReload.newVersionInstalls();
    afterReload.controllerChanges();
    await settle();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(again.posted).toEqual([]);
    expect(reload).not.toHaveBeenCalled();

    // A genuinely later release, well after the window, is offered normally.
    const later = fakeBrowser({ controlled: true });
    wireServiceWorkerUpdates({ container: later.container, ask, reload: vi.fn(), session, now: openForAWhile(1_005_000 + 10 * 60_000).now });
    await later.newVersionInstalls();
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('a page that has only just loaded is not asked to reload into the version it already is', async () => {
    const browser = fakeBrowser({ controlled: true });
    const reload = vi.fn();
    const ask = vi.fn(() => true);
    let t = 5_000_000;
    wireServiceWorkerUpdates({ container: browser.container, ask, reload, session: memorySession(), now: () => t });

    t += 4_000; // the worker for the release this page was just served finishes installing
    const worker = await browser.newVersionInstalls();
    browser.controllerChanges();
    await settle();
    expect(ask, 'this was the dialog on every reload after a release').not.toHaveBeenCalled();
    expect(worker.posted, 'the worker is left waiting, not hurried into taking over').toEqual([]);
    expect(reload).not.toHaveBeenCalled();

    t += 45 * 60_000; // the app has now been open a while, and a NEWER release lands
    await browser.newVersionInstalls();
    expect(ask).toHaveBeenCalledTimes(1);
  });
});

// ---- the layout must USE it: a correct module beside a second, inline copy fixes nothing ---------

describe('the layout has one update path (B3)', () => {
  const layout = readFileSync(resolve(process.cwd(), 'src/routes/+layout.svelte'), 'utf-8');

  it('hands the worker to wireServiceWorkerUpdates', () => {
    expect(layout).toContain('wireServiceWorkerUpdates(');
  });

  it('keeps no reload-on-controllerchange, registration or prompt of its own', () => {
    expect(layout, 'an unconditional reload on controllerchange is the bug').not.toContain('controllerchange');
    expect(layout).not.toContain(".register('/sw.js')");
    expect(layout).not.toContain('SKIP_WAITING');
  });
});

// ---- the worker's half: run the SHIPPED file ----------------------------------------------------

function runShippedWorker() {
  const source = readFileSync(resolve(process.cwd(), 'static/sw.js'), 'utf-8');
  const handlers: Record<string, (event: any) => void> = {};
  const skipWaiting = vi.fn(() => Promise.resolve());
  const self = {
    addEventListener: (type: string, handler: (event: any) => void) => { handlers[type] = handler; },
    skipWaiting,
    clients: { claim: vi.fn(() => Promise.resolve()) },
    location: { origin: 'https://example.test' }
  };
  const cache = { addAll: vi.fn(() => Promise.resolve()), put: vi.fn(), match: vi.fn() };
  const caches = { open: vi.fn(() => Promise.resolve(cache)), keys: vi.fn(() => Promise.resolve([])), delete: vi.fn(), match: vi.fn() };
  new Function('self', 'caches', 'fetch', source)(self, caches, vi.fn());
  return { handlers, skipWaiting, cache };
}

describe('static/sw.js waits to be told (B3)', () => {
  it('installing a new version does NOT take over open pages by itself', async () => {
    const { handlers, skipWaiting, cache } = runShippedWorker();
    let installed: Promise<unknown> = Promise.resolve();
    handlers.install({ waitUntil: (p: Promise<unknown>) => { installed = p; } });
    await installed;
    expect(cache.addAll, 'the offline shell is still precached').toHaveBeenCalledTimes(1);
    expect(skipWaiting, 'skipWaiting at install is what made Cancel reload the page').not.toHaveBeenCalled();
  });

  it('it takes over when the page says the GM agreed, and for nothing else', () => {
    const { handlers, skipWaiting } = runShippedWorker();
    handlers.message({ data: { type: 'SOMETHING_ELSE' } });
    handlers.message({ data: null });
    expect(skipWaiting).not.toHaveBeenCalled();
    handlers.message({ data: SKIP_WAITING_MESSAGE });
    expect(skipWaiting).toHaveBeenCalledTimes(1);
  });
});
