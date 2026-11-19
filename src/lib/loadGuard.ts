// src/lib/loadGuard.ts
//
// THE LOAD GUARD: a stage stamp in localStorage that says "a load of the saved campaign started and
// has not finished". It is armed before the auto-load, advanced through the stages, and cleared once
// the first starmap frame paints (or a timer proves the main thread is alive - engine map UI-L2). If
// the stamp is still there at the next start-up the previous load never finished, so the app does
// not auto-load into the same hang: it shows the safe-mode screen instead.
//
// WHAT THIS MODULE ADDS, AND WHY IT IS A MODULE (B2, 2026-11). The stamp used to be six one-line
// functions in the route, and it could not tell a load that HUNG from a load whose page simply WENT
// AWAY. Both leave the stamp behind, and only the first is a fault. Three ordinary things take a
// page away in the middle of a load:
//   - a reload: the GM pressing it twice, the "new version" prompt, the deploy-skew recovery;
//   - closing the tab, or following a link, while the physics pass is still running;
//   - a phone putting the browser in the background, freezing the tab and later discarding it.
// Every one of them produced "The last load didn't finish" on the next visit, on a map with nothing
// wrong with it - which is the misfire the owner described as "just hit Try again, it always works".
//
// THE RULE THAT KEEPS REAL DETECTION INTACT: the stamp is withdrawn only by an event handler, and
// an event handler can only run on a main thread that is ALIVE. A genuinely hung load (the reported
// phone: a 4.36-billion-iteration grid loop) cannot run `pagehide` or `visibilitychange`, so its
// stamp stays exactly where it was and safe mode appears as before. An out-of-memory kill runs no
// handler either. What is given up is narrow and stated: a load that hangs AFTER its tab was
// already hidden is not caught on that visit - the next one auto-loads, hangs in front of the GM
// with the stamp set, and is caught then. One extra attempt, never a locked-out app.
//
// While the page is hidden the stamp is HELD BACK rather than forgotten: the guard stays armed and
// remembers its stage, and the stamp is written again the moment the page is shown, so a load that
// is still running when the GM comes back is still guarded.

export const LOAD_GUARD_KEY = 'sse-load-guard';

/** The slice of `Storage` the guard uses. Every call may throw (private mode); all are caught. */
export interface GuardStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LoadGuardEnv {
  storage: GuardStorage | null;
  /** `window`: the guard listens for `pagehide` and `pageshow` on it. */
  win?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null;
  /** `document`: the guard listens for `visibilitychange` and reads `hidden`. */
  doc?: (Pick<Document, 'addEventListener' | 'removeEventListener'> & { readonly hidden: boolean }) | null;
}

export interface LoadGuard {
  /** Start guarding a load. `stage` is the first thing it does. */
  arm(stage: string): void;
  /** Note the stage the load has reached. A no-op unless armed. */
  stage(stage: string): void;
  /** The load finished (or there was nothing to load): disarm and remove the stamp. */
  clear(): void;
  /** The stage a previous visit left behind, or null. Read this BEFORE arming. */
  tripped(): string | null;
  /** True between `arm` and `clear`. */
  readonly armed: boolean;
  /**
   * The page component is going away (a move to another route). Same rule as `pagehide`: this ran,
   * so the load was not hung - an armed stamp is withdrawn. From here on the guard is inert, so the
   * tail of a load still running in a dead component cannot remove a stamp that a newer page owns.
   */
  destroy(): void;
}

export function createLoadGuard(env: LoadGuardEnv): LoadGuard {
  const { storage, win = null, doc = null } = env;
  let armed = false;
  let current: string | null = null;
  // True from `pagehide` until `pageshow`: the page is leaving, or parked in the back/forward cache.
  let away = false;

  const write = (value: string) => { try { storage?.setItem(LOAD_GUARD_KEY, value); } catch { /* private mode */ } };
  const remove = () => { try { storage?.removeItem(LOAD_GUARD_KEY); } catch { /* private mode */ } };
  // The stamp may only stand while somebody could be WATCHING this load hang.
  const watched = () => !away && !(doc?.hidden ?? false);

  // The page stopped being watched while a load was running. This handler ran, so the main thread
  // is alive and the load is not hung: whatever happens to the page next is not a failed load.
  const withdraw = () => { if (armed) remove(); };
  // The page is back and the load is still going: guard it again from the stage it has reached.
  const reinstate = () => { if (armed && current !== null && watched()) write(current); };

  const onPageHide = () => { away = true; withdraw(); };
  const onPageShow = () => { away = false; reinstate(); };
  const onVisibility = () => { if (doc?.hidden) withdraw(); else reinstate(); };

  win?.addEventListener('pagehide', onPageHide);
  win?.addEventListener('pageshow', onPageShow);
  doc?.addEventListener('visibilitychange', onVisibility);

  let destroyed = false;

  const stage = (name: string) => {
    if (!armed) return;
    current = name;
    if (watched()) write(name);
  };

  return {
    arm(name: string) {
      if (destroyed) return;
      armed = true;
      stage(name);
    },
    stage,
    clear() {
      if (destroyed) return;
      armed = false;
      current = null;
      remove();
    },
    tripped() {
      try { return storage?.getItem(LOAD_GUARD_KEY) ?? null; } catch { return null; }
    },
    get armed() { return armed; },
    destroy() {
      if (destroyed) return;
      withdraw();
      destroyed = true;
      armed = false;
      current = null;
      win?.removeEventListener('pagehide', onPageHide);
      win?.removeEventListener('pageshow', onPageShow);
      doc?.removeEventListener('visibilitychange', onVisibility);
    }
  };
}
