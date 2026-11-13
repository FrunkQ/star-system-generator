// src/lib/util/swUpdate.ts
//
// THE "NEW VERSION AVAILABLE" PROMPT, AND THE ONE RELOAD IT IS ALLOWED TO CAUSE (B3, 2026-11).
//
// What it replaced lived inline in `+layout.svelte` and had a Cancel button that did nothing:
//   - `static/sw.js` called `skipWaiting()` at the end of its own install, so a new worker took the
//     page over whether or not anybody had agreed to it;
//   - the layout reloaded on EVERY `controllerchange`, which is what that takeover fires.
// So the prompt was a notice, not a question. "Cancel" reloaded the page exactly as "OK" did - in
// the middle of whatever the GM was doing - and because nothing remembered the answer, every later
// worker asked again. The same pair also reloaded a first-time visitor a second or two after the
// app appeared, when the brand-new worker claimed the page.
//
// THE RULE NOW: this module reloads the page for ONE reason - the GM said yes to the prompt, on
// this page. A controller change nobody agreed to (a first install claiming the page, or a worker
// from before this fix skipping its own wait) is not a reason, and is ignored. A "no" is remembered
// for the life of the tab, so a long session is asked once, not hourly. A page that has only just
// loaded is not asked at all - it already is the new version. And the worker itself waits to be
// told (see the note at the install handler in `static/sw.js`).
//
// DECLINING COSTS NOTHING, which is what makes it safe to honour: the worker is a network-first
// cache and an offline fallback, not the app. A page that keeps the old worker still fetches the
// current app on its next load; the waiting worker takes over by itself once every tab has closed.

/** What the worker listens for in `static/sw.js`. One spelling, shared with the gate. */
export const SKIP_WAITING_MESSAGE = { type: 'SKIP_WAITING' } as const;

export const UPDATE_PROMPT = 'A new version is available. Reload now to update?';

const DECLINED_KEY = 'sse-sw-update-declined';
const ACCEPTED_AT_KEY = 'sse-sw-update-accepted-at';
/** After an accepted reload, do not ask again inside this window: an "update" found straight after
 *  updating is a fault somewhere, and asking would turn it into a reload loop with a button on it. */
const REASK_AFTER_ACCEPT_MS = 60_000;
const POLL_MS = 60 * 60 * 1000;
/** A page this young fetched the app after the release it is being told about: it IS the new
 *  version, so "reload to update" would be asking it to reload into itself. See `offer`. */
const FRESH_PAGE_MS = 60_000;

interface WorkerLike {
  state: string;
  postMessage(message: unknown): void;
  addEventListener(type: 'statechange', listener: () => void): void;
}
interface RegistrationLike {
  installing: WorkerLike | null;
  update(): Promise<unknown> | void;
  addEventListener(type: 'updatefound', listener: () => void): void;
}
export interface SwContainerLike {
  controller: unknown;
  register(url: string): Promise<RegistrationLike>;
  addEventListener(type: 'controllerchange', listener: () => void): void;
}
interface SessionLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SwUpdateEnv {
  container: SwContainerLike;
  /** The question. Returns true for "reload now". */
  ask: (message: string) => boolean;
  reload: () => void;
  /** Anything that must be safely stored before the page goes (the campaign autosave). */
  beforeReload?: () => Promise<unknown>;
  /** `sessionStorage`. Optional and allowed to throw: the answer is then remembered in memory. */
  session?: SessionLike | null;
  now?: () => number;
}

/**
 * Register the worker and wire the prompt. Returns a stop function for the hourly poll.
 * Registration failing is reported and otherwise harmless: the app works without a worker.
 */
export function wireServiceWorkerUpdates(env: SwUpdateEnv): () => void {
  const { container, ask, reload } = env;
  const now = env.now ?? (() => Date.now());
  const startedAt = now();
  let accepted = false;
  let reloading = false;
  let declinedInMemory = false;
  let poll: ReturnType<typeof setInterval> | undefined;

  const read = (key: string): string | null => {
    try { return env.session?.getItem(key) ?? null; } catch { return null; }
  };
  const write = (key: string, value: string) => {
    try { env.session?.setItem(key, value); } catch { /* private mode: memory will do */ }
  };
  const declined = () => declinedInMemory || read(DECLINED_KEY) === '1';
  const justUpdated = () => now() - Number(read(ACCEPTED_AT_KEY) || 0) < REASK_AFTER_ACCEPT_MS;

  container.addEventListener('controllerchange', () => {
    // NOT EVERY CONTROLLER CHANGE IS AN UPDATE THE GM ASKED FOR. Reloading here unconditionally is
    // what made Cancel a second OK and reloaded first-time visitors mid-first-look.
    if (!accepted || reloading) return;
    reloading = true;
    // The campaign is written before the page goes. `beforeReload` is bounded by its owner, and a
    // failure there must not strand the GM on a page they have just agreed to leave.
    Promise.resolve()
      .then(() => env.beforeReload?.())
      .catch(() => undefined)
      .then(() => reload());
  });

  const offer = (worker: WorkerLike) => {
    // No controller means this is the FIRST worker this browser has had for the app: there is no
    // older version to update from, and nothing to ask.
    if (!container.controller) return;
    // A PAGE THAT HAS ONLY JUST LOADED IS NOT ASKED. The app shell is fetched network-first, so a
    // page that started seconds ago is already running the release this worker belongs to; the
    // prompt would interrupt the load to offer nothing. This was the dialog that greeted every
    // reload after a release. The worker simply waits and takes over once the tabs have closed. A
    // release that lands while the app has been open for a while is what the prompt is for.
    if (now() - startedAt < FRESH_PAGE_MS) return;
    if (accepted || declined() || justUpdated()) return;
    if (ask(UPDATE_PROMPT)) {
      accepted = true;
      write(ACCEPTED_AT_KEY, String(now()));
      worker.postMessage(SKIP_WAITING_MESSAGE);
    } else {
      declinedInMemory = true;
      write(DECLINED_KEY, '1');
    }
  };

  container
    .register('/sw.js')
    .then((registration) => {
      // Offline, or the host unreachable: no update to find, and not an error worth a stack trace.
      const check = () => { Promise.resolve(registration.update()).catch(() => undefined); };
      check();
      registration.addEventListener('updatefound', () => {
        const next = registration.installing;
        if (!next) return;
        next.addEventListener('statechange', () => {
          if (next.state === 'installed') offer(next);
        });
      });
      // Poll for updates roughly hourly while the app is open.
      poll = setInterval(check, POLL_MS);
    })
    .catch((err) => console.error('Service worker registration failed:', err));

  return () => { if (poll) clearInterval(poll); };
}
