// DEPLOYMENT-SKEW RECOVERY (A68). A tab loaded before a deploy still holds the old chunk graph;
// hashed chunks it has not yet fetched no longer exist on the server, so the FIRST lazy-loaded
// view after a deploy dies with "Failed to fetch dynamically imported module" and every later one
// follows. A reload gets the new graph, and it is exactly what the user does by hand once they
// give up — so do it for them, ONCE. The sessionStorage guard stops a reload loop when the real
// cause is a network outage rather than a deploy: the second failure inside the window rethrows
// into the caller's normal error path instead.
//
// Callers must keep the literal specifier inside the callback — `importOrReload(() =>
// import('$lib/x'))` — so Vite's static analysis still sees it and the chunk still splits.
//
// B-1: THE RELOAD WAITS FOR THE AUTOSAVE (`settleBeforeReload`), because this is a reload the GM
// did not ask for and must not cost them their last edit. And it happens ONLY when the guard could
// be written down: with sessionStorage unavailable there is no way to know a reload was already
// tried, so "one best-effort reload" was really a reload on every failure - an endless refresh for
// as long as the module kept failing to load. No guard, no reload: the caller's error path runs.
import { settleBeforeReload } from './beforeReload';

const GUARD_KEY = 'sse-skew-reload-at';
const GUARD_WINDOW_MS = 60_000;

/** The browser pieces this touches. Defaulted; named so the gate can stand in for them. */
export interface ReloadEnv {
  session: () => Pick<Storage, 'getItem' | 'setItem'>;
  reload: (() => void) | null;
}
const BROWSER: ReloadEnv = {
  session: () => sessionStorage,
  reload: typeof location === 'undefined' ? null : () => location.reload()
};

export async function importOrReload<T>(load: () => Promise<T>, env: ReloadEnv = BROWSER): Promise<T> {
  try {
    return await load();
  } catch (err) {
    let mayReload = false;
    try {
      const session = env.session();
      const recentlyTried = Date.now() - Number(session.getItem(GUARD_KEY) || 0) < GUARD_WINDOW_MS;
      if (!recentlyTried) {
        session.setItem(GUARD_KEY, String(Date.now()));
        // Read it back: some private modes accept the write and keep nothing.
        mayReload = session.getItem(GUARD_KEY) !== null;
      }
    } catch {
      /* storage unavailable (private mode): the guard cannot be kept, so there is no reload */
    }
    if (!mayReload || !env.reload) throw err;
    console.warn('A module failed to load — likely a new version was deployed. Reloading to pick it up.', err);
    await settleBeforeReload();
    env.reload();
    // The reload takes it from here; never resolve, so the caller cannot run half-initialised.
    return new Promise<never>(() => {});
  }
}
