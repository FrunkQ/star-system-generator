// src/lib/viewRestore.ts
//
// "AFTER A RELOAD, RE-OPEN THE SYSTEM THE GM WAS IN" (owner's yes, 2026-11; engine map UI-L10).
//
// v3.1.78 made a reload bring back the last EDIT. It did not bring back the VIEW: SvelteKit drops
// `page.state` on a reload by design, the campaign auto-loads, and the GM lands on the starmap. A
// phone that kept reloading mid-edit put its owner back on the map every time.
//
// WHAT IS REMEMBERED: the campaign's id and the system's id, and whether that open has SETTLED.
// Nothing else - no selected body, no camera. One small record, in the storage of THIS TAB.
//
// WHY THE TAB AND NOT THE DEVICE. Two tabs share one stored campaign (DATA-R54's last line), so a
// record in localStorage would have one tab drag the other into whatever system it was last in.
// sessionStorage belongs to the tab, survives a reload and a discarded-then-restored tab (the two
// cases this is for), and dies with the tab - a fresh visit starts on the starmap, as it always did.
//
// THE ONE-SHOT, WHICH IS THE WHOLE DIFFICULTY. If opening that system is what crashed or hung the
// tab - a huge system on a phone, a graphics context that is taken away, a save that throws - then
// re-opening it automatically turns one crash into a crash LOOP, and the reload that used to be the
// way out becomes the way back in. So an open is trusted only once it has SETTLED:
//
//   - every open (the GM's own click included) is written down as UNSETTLED;
//   - it settles after the system view has been up, in front of somebody, for `VIEW_SETTLE_MS` with
//     no graphics context lost - or sooner if the GM, having opened it themselves, uses the page;
//   - start-up re-opens a SETTLED record only, and marks it unsettled BEFORE it attempts the open.
//
// So a restore that kills the tab leaves an unsettled record, and the next start-up finds it, stays
// on the starmap and says so. The same rule covers a system that killed the tab when the GM first
// clicked it. An open the APP chose (a restore) is never settled by a tap: it has to stay up.
//
// The dwell is counted only while the page is VISIBLE, and only from the first timer that fires
// after the open - a timer cannot fire inside a synchronous mount, so a mount that took twenty
// seconds does not count as twenty seconds of staying open. (A hidden tab also renders no frames,
// so time spent hidden proves nothing about whether the view draws: engine map UI-L2.)

export const VIEW_RESTORE_KEY = 'sse-view-restore';

/** How long a system must stay open, visible, before a reload is allowed to go back into it. */
export const VIEW_SETTLE_MS = 5000;

export interface ViewRecord {
  mapId: string;
  systemId: string;
  settled: boolean;
}

/** The slice of a campaign start-up needs: its id, and each system's node id and inner id. */
export interface RestorableMap {
  id?: string | null;
  systems?: Array<{ id: string; name?: string | null; system?: { id?: string | null } | null }> | null;
}

export type StartupView =
  /** Nothing to go back to (or not allowed to): the starmap, and nothing is said. */
  | { kind: 'none' }
  /** Re-open this system. `systemId` is the map NODE's id, whichever id was remembered. */
  | { kind: 'restore'; systemId: string }
  /** The last open of this system never settled: the starmap, and one quiet line says so. */
  | { kind: 'declined'; systemId: string; name: string };

export function parseViewRecord(raw: string | null | undefined): ViewRecord | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v.mapId !== 'string' || typeof v.systemId !== 'string' || !v.mapId || !v.systemId) return null;
    return { mapId: v.mapId, systemId: v.systemId, settled: v.settled === true };
  } catch {
    return null;
  }
}

/**
 * THE DECISION, and nothing else: no storage, no timers. `blocked` is every reason start-up must
 * leave the view alone whatever is remembered - the safe-mode screen, a shared map or system
 * arriving by link. A system that is no longer in the campaign, or a record from another campaign,
 * is answered with silence: there is nothing useful to tell the GM about either.
 */
export function decideStartupView(record: ViewRecord | null, map: RestorableMap | null | undefined, blocked: boolean): StartupView {
  if (blocked || !record || !map || !map.id || record.mapId !== map.id) return { kind: 'none' };
  // A system is known by its map node's id AND by its own inner id, and for imported or legacy
  // systems the two differ (the route's delete and save paths do the same double lookup).
  const node = (map.systems ?? []).find((s) => s.id === record.systemId || s.system?.id === record.systemId);
  if (!node) return { kind: 'none' };
  if (!record.settled) return { kind: 'declined', systemId: node.id, name: node.name || 'that system' };
  return { kind: 'restore', systemId: node.id };
}

/** The one quiet line for a declined restore, in the voice of the other start-up notices. */
export function declinedRestoreNotice(name: string): string {
  return `Did not go back into "${name}" — it had only just been opened when the page last reloaded, so it is left for you to open again.`;
}

export interface ViewRestoreStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type Listening = { addEventListener(type: string, fn: (e: any) => void, capture?: boolean): void; removeEventListener(type: string, fn: (e: any) => void, capture?: boolean): void };

export interface ViewRestoreEnv {
  /** The TAB's storage. Every call may throw (private mode, a locked-down browser); all are caught. */
  storage: ViewRestoreStorage | null;
  win?: Listening | null;
  doc?: (Listening & { readonly hidden: boolean }) | null;
  /** Is the system view for this system actually mounted? A view that threw while mounting is not. */
  ready?: (systemId: string) => boolean;
  settleMs?: number;
}

export interface ViewRestore {
  /**
   * Start-up, once the campaign has loaded. Reads the record and - THE ONE-SHOT - rewrites it as
   * unsettled BEFORE answering `restore`; every other answer forgets it.
   */
  startup(map: RestorableMap | null | undefined, blocked?: boolean): StartupView;
  /** The GM is in this system. Writes it down unsettled and starts watching it settle. */
  entered(mapId: string | null | undefined, systemId: string): void;
  /**
   * There is nothing to go back to: the GM left for the starmap, or start-up is not restoring
   * anything at all (the safe-mode screen, no campaign in this browser).
   */
  forget(): void;
  /** What this tab remembers right now, or null. */
  peek(): ViewRecord | null;
  /** The component is going away. Stops watching; the record stays exactly as it is. */
  destroy(): void;
}

export function createViewRestore(env: ViewRestoreEnv): ViewRestore {
  const { storage, win = null, doc = null, ready = () => true, settleMs = VIEW_SETTLE_MS } = env;

  const read = (): ViewRecord | null => { try { return parseViewRecord(storage?.getItem(VIEW_RESTORE_KEY)); } catch { return null; } };
  const write = (rec: ViewRecord) => { try { storage?.setItem(VIEW_RESTORE_KEY, JSON.stringify(rec)); } catch { /* private mode */ } };
  const remove = () => { try { storage?.removeItem(VIEW_RESTORE_KEY); } catch { /* private mode */ } };

  // The open being watched, and how it came about. Null once it has settled, failed, or been left.
  let watching: { mapId: string; systemId: string; byApp: boolean; up: boolean } | null = null;
  // The open now in front of the GM, watched or settled: re-noting the same one changes nothing.
  let current: { mapId: string; systemId: string } | null = null;
  // The system start-up decided to re-open, until the route reports having entered it.
  let restoring: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  const visible = () => !(doc?.hidden ?? false);
  const stopTimer = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
  const stopWatching = () => { stopTimer(); watching = null; };

  const settle = () => {
    const w = watching;
    if (!w) return;
    stopWatching();
    write({ mapId: w.mapId, systemId: w.systemId, settled: true });
  };
  // The dwell ran out. A view that is not there (it threw while mounting, or the page is showing
  // something else) has not stayed open, however long the clock ran: the record stays unsettled.
  const onDwell = () => {
    timer = null;
    const w = watching;
    if (!w) return;
    if (ready(w.systemId)) settle(); else stopWatching();
  };
  const startDwell = () => {
    stopTimer();
    if (watching && watching.up && visible()) timer = setTimeout(onDwell, settleMs);
  };
  // The first timer to fire after the open: the synchronous part of mounting has returned.
  const onUp = () => {
    timer = null;
    if (!watching) return;
    watching.up = true;
    startDwell();
  };

  const onVisibility = () => { if (!watching || !watching.up) return; if (visible()) startDwell(); else stopTimer(); };
  // Opening it cost the page its graphics. The app's own advice for that is "reload", and a reload
  // must not then walk straight back into the system that did it.
  const onContextLost = () => { if (watching) stopWatching(); };
  // The GM is using the page they opened. Not for an open the APP made: a tap on a view that is
  // about to fall over says nothing about whether it would fall over again.
  const onInteraction = () => {
    const w = watching;
    if (!w || w.byApp || !w.up) return;
    if (ready(w.systemId)) settle();
  };

  win?.addEventListener('webglcontextlost', onContextLost, true);
  win?.addEventListener('pointerdown', onInteraction, true);
  win?.addEventListener('keydown', onInteraction, true);
  doc?.addEventListener('visibilitychange', onVisibility);

  return {
    startup(map, blocked = false) {
      if (destroyed) return { kind: 'none' };
      const view = decideStartupView(read(), map, blocked);
      if (view.kind === 'restore' && map?.id) {
        // BEFORE the open is attempted. If the attempt takes the tab down, this is what the next
        // start-up reads.
        write({ mapId: map.id, systemId: view.systemId, settled: false });
        restoring = view.systemId;
      } else {
        remove();
        restoring = null;
      }
      return view;
    },
    entered(mapId, systemId) {
      if (destroyed || !mapId || !systemId) return;
      if (current && current.mapId === mapId && current.systemId === systemId) return;
      const byApp = restoring === systemId;
      restoring = null;
      stopWatching();
      current = { mapId, systemId };
      watching = { mapId, systemId, byApp, up: false };
      write({ mapId, systemId, settled: false });
      timer = setTimeout(onUp, 0);
    },
    forget() {
      if (destroyed) return;
      stopWatching();
      current = null;
      restoring = null;
      remove();
    },
    peek: read,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopWatching();
      current = null;
      win?.removeEventListener('webglcontextlost', onContextLost, true);
      win?.removeEventListener('pointerdown', onInteraction, true);
      win?.removeEventListener('keydown', onInteraction, true);
      doc?.removeEventListener('visibilitychange', onVisibility);
    }
  };
}
