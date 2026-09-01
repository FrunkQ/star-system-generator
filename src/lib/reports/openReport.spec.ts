// B113(b) — THE REPORT WINDOW THAT OPENED NOTHING AND SAID NOTHING.
//
// Two silent failures were MEASURED in the browser on both channels before any of this was written
// (prod v3.0.164 and beta v3.0.258): the starmap rail's Report with no system open never called
// `window.open` at all, and with a system open the call returned NULL because the browser blocked
// the popup. In both cases the modal closed and the GM was told nothing.
//
// Every assertion here was run against the pre-fix code and seen RED — the old call sites returned
// `void`, so there was nothing to assert on at all, which is precisely the fault.
import { describe, it, expect } from 'vitest';
import {
  openSystemReport,
  REPORT_STASH_KEY,
  REPORT_ROUTE,
  REPORT_FAILURE_MESSAGES,
  type ReportEnv
} from './openReport';
import type { System, TemporalState } from '$lib/types';

function makeEnv(openReturns: unknown, opts: { throwOnSet?: boolean } = {}) {
  const stash: Record<string, string> = {};
  const opened: Array<[string, string]> = [];
  const env: ReportEnv = {
    setItem: (k, v) => {
      if (opts.throwOnSet) throw new Error('QuotaExceededError');
      stash[k] = v;
    },
    open: (url, target) => {
      opened.push([url, target]);
      return openReturns;
    }
  };
  return { env, stash, opened };
}

const SYSTEM = { id: 'sys-1', name: 'Test', epochT0: 1_762_339_146_908, nodes: [] } as unknown as System;
const TEMPORAL = {
  masterTimeSec: '1',
  displayTimeSec: '1',
  activeCalendarKey: 'Earth Gregorian',
  temporal_registry: {},
  playbackRunning: false,
  playbackRateSecPerSec: 1
} as unknown as TemporalState;

const OPTIONS = { mode: 'GM' as const, theme: 'retro', includeConstructs: true };

describe('openSystemReport — no failure may be silent', () => {
  it('opens the report and stashes the payload on the happy path', () => {
    const { env, stash, opened } = makeEnv({});
    const result = openSystemReport(
      { system: SYSTEM, options: OPTIONS, unitPrefs: {}, temporal: TEMPORAL },
      env
    );
    expect(result).toEqual({ ok: true });
    expect(opened).toEqual([[REPORT_ROUTE, '_blank']]);
    expect(stash[REPORT_STASH_KEY]).toBeTruthy();
  });

  // THE MEASURED PROD FAULT #1. The starmap rail reaches this with no system opened, and the old
  // code returned early without opening anything or saying so.
  it('reports no-system instead of returning silently, and never opens a window', () => {
    const { env, opened, stash } = makeEnv({});
    const result = openSystemReport(
      { system: null, options: OPTIONS, unitPrefs: {}, temporal: TEMPORAL },
      env
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('no-system');
    expect(opened).toEqual([]);
    expect(stash[REPORT_STASH_KEY]).toBeUndefined();
  });

  // THE MEASURED PROD FAULT #2. A blocked popup returns null and that was thrown away.
  it('reports popup-blocked when window.open returns null', () => {
    const { env } = makeEnv(null);
    const result = openSystemReport(
      { system: SYSTEM, options: OPTIONS, unitPrefs: {}, temporal: TEMPORAL },
      env
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('popup-blocked');
  });

  it('treats an undefined return from window.open as blocked too', () => {
    const { env } = makeEnv(undefined);
    const result = openSystemReport(
      { system: SYSTEM, options: OPTIONS, unitPrefs: {}, temporal: TEMPORAL },
      env
    );
    expect(result.ok === false && result.reason).toBe('popup-blocked');
  });

  it('reports a failed stash rather than opening a window onto nothing', () => {
    const { env, opened } = makeEnv({}, { throwOnSet: true });
    const result = openSystemReport(
      { system: SYSTEM, options: OPTIONS, unitPrefs: {}, temporal: TEMPORAL },
      env
    );
    expect(result.ok === false && result.reason).toBe('stash-failed');
    expect(opened).toEqual([]);
  });

  it('every failure carries a non-empty GM-facing sentence', () => {
    for (const [reason, message] of Object.entries(REPORT_FAILURE_MESSAGES)) {
      expect(message.length, reason).toBeGreaterThan(20);
    }
  });

  // B113(a) needs the calendar on the other side of the window, and only this module writes it.
  it('carries the campaign temporal state into the stash', () => {
    const { env, stash } = makeEnv({});
    openSystemReport({ system: SYSTEM, options: OPTIONS, unitPrefs: {}, temporal: TEMPORAL }, env);
    const payload = JSON.parse(stash[REPORT_STASH_KEY]);
    expect(payload.temporal).toBeTruthy();
    expect(payload.temporal.activeCalendarKey).toBe('Earth Gregorian');
  });

  it('writes an explicit null temporal rather than omitting the key', () => {
    const { env, stash } = makeEnv({});
    openSystemReport({ system: SYSTEM, options: OPTIONS, unitPrefs: {}, temporal: null }, env);
    const payload = JSON.parse(stash[REPORT_STASH_KEY]);
    expect('temporal' in payload).toBe(true);
    expect(payload.temporal).toBeNull();
  });
});
