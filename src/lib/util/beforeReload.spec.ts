// B-1 - A RELOAD THE APP PERFORMS ITSELF MUST NOT COST THE GM THEIR LAST EDIT.
//
// Two things reload the page without being asked to by a keypress: the deploy-skew recovery
// (`importOrReload`) and an accepted "new version" prompt (`swUpdate`). The autosave is
// asynchronous, so both now wait - through this registry - for it to finish, with a ceiling so a
// save that never settles cannot turn a recovery into a page that never reloads.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onBeforeReload, settleBeforeReload } from './beforeReload';
import { importOrReload, type ReloadEnv } from './importOrReload';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function memorySession() {
  const map = new Map<string, string>();
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

describe('settleBeforeReload', () => {
  it('waits for registered work to finish', async () => {
    const order: string[] = [];
    const off = onBeforeReload(async () => { await tick(20); order.push('written'); });
    try {
      await settleBeforeReload();
      order.push('reload');
      expect(order).toEqual(['written', 'reload']);
    } finally { off(); }
  });

  it('does not wait for ever: a write that never settles is abandoned at the limit', async () => {
    const off = onBeforeReload(() => new Promise(() => {}));
    try {
      const started = Date.now();
      await settleBeforeReload(40);
      expect(Date.now() - started).toBeLessThan(1000);
    } finally { off(); }
  });

  it('a write that fails, or throws outright, does not stop the reload', async () => {
    const offA = onBeforeReload(() => Promise.reject(new Error('quota')));
    const offB = onBeforeReload(() => { throw new Error('boom'); });
    try {
      await expect(settleBeforeReload()).resolves.toBeUndefined();
    } finally { offA(); offB(); }
  });

  it('work that has un-registered is not run', async () => {
    const settle = vi.fn();
    onBeforeReload(settle)();
    await settleBeforeReload();
    expect(settle).not.toHaveBeenCalled();
  });
});

describe('the deploy-skew reload (importOrReload)', () => {
  beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  const failingImport = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module'));
  // A call that reloads never settles (by design), so "it reloaded" would otherwise show up here as
  // a two-minute timeout rather than a failure. Name the three outcomes and wait briefly.
  const outcome = (call: Promise<unknown>) =>
    Promise.race([
      call.then(() => 'resolved', () => 'handed to the caller'),
      tick(60).then(() => 'left hanging for a reload')
    ]);

  it('a module that loads is simply returned', async () => {
    const reload = vi.fn();
    await expect(importOrReload(() => Promise.resolve({ ok: 1 }), { session: memorySession, reload })).resolves.toEqual({ ok: 1 });
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads only AFTER the campaign has been written', async () => {
    const order: string[] = [];
    const session = memorySession();
    const env: ReloadEnv = { session: () => session, reload: () => void order.push('reload') };
    const off = onBeforeReload(async () => { await tick(20); order.push('written'); });
    try {
      void importOrReload(failingImport, env); // never resolves by design: the reload takes over
      await tick(80);
      expect(order).toEqual(['written', 'reload']);
    } finally { off(); }
  });

  it('a second failure inside the window is handed to the caller instead of reloading again', async () => {
    const session = memorySession();
    const reload = vi.fn();
    const env: ReloadEnv = { session: () => session, reload };
    void importOrReload(failingImport, env);
    await tick(10);
    expect(reload).toHaveBeenCalledTimes(1);
    await expect(importOrReload(failingImport, env)).rejects.toThrow(/dynamically imported/);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('NO GUARD, NO RELOAD: where sessionStorage is refused it must not reload on every failure', async () => {
    const reload = vi.fn();
    const refused: ReloadEnv = { session: () => { throw new Error('SecurityError'); }, reload };
    // Three failures in a row is three page loads' worth: before, each of them reloaded.
    for (let i = 0; i < 3; i++) expect(await outcome(importOrReload(failingImport, refused))).toBe('handed to the caller');
    expect(reload).not.toHaveBeenCalled();
  });

  it('a private mode that accepts the write and keeps nothing counts as no guard', async () => {
    const reload = vi.fn();
    const forgets: ReloadEnv = { session: () => ({ getItem: () => null, setItem: () => {} }), reload };
    expect(await outcome(importOrReload(failingImport, forgets))).toBe('handed to the caller');
    expect(reload).not.toHaveBeenCalled();
  });
});
