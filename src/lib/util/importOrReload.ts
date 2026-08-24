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
const GUARD_KEY = 'sse-skew-reload-at';
const GUARD_WINDOW_MS = 60_000;

export async function importOrReload<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (err) {
    let recentlyTried = false;
    try {
      recentlyTried = Date.now() - Number(sessionStorage.getItem(GUARD_KEY) || 0) < GUARD_WINDOW_MS;
      if (!recentlyTried) sessionStorage.setItem(GUARD_KEY, String(Date.now()));
    } catch {
      /* storage unavailable (private mode) — fall through to a single best-effort reload */
    }
    if (recentlyTried || typeof location === 'undefined') throw err;
    console.warn('A module failed to load — likely a new version was deployed. Reloading to pick it up.', err);
    location.reload();
    // The reload takes it from here; never resolve, so the caller cannot run half-initialised.
    return new Promise<never>(() => {});
  }
}
