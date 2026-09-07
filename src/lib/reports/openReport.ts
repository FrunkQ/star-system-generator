// OPENING THE PAPER REPORT — one place, because the silence was the fault.
//
// B113(b): "The Reports appears to not work at all for me - the window no longer opens with the
// paper report." Two DIFFERENT silent failures were measured on both channels (prod v3.0.164 and
// beta v3.0.258), and neither of them logged, alerted or marked the UI in any way:
//
//   1. NO SYSTEM LOADED. The starmap rail's Report entry opens the config modal whether or not a
//      system has ever been opened; its handler then did `if (!sys) return;` and the modal simply
//      closed. `window.open` was never called at all. Measured on prod: 0 open calls, no stash.
//   2. THE POPUP WAS BLOCKED. With a system loaded, `window.open('/report','_blank')` returned
//      NULL — the browser refused the popup — and the app carried on as though it had worked.
//      Measured on both channels in the same browser that renders /report perfectly when it is
//      reached directly.
//
// The report DOCUMENT was never at fault: /report renders the full paper report on beta with no
// console errors, which EXONERATES v3.0.205 (the A80 unit sweep, the only commit to touch reports
// since prod) for this row. That was the coordinator's leading suspect and it is measured clear.
//
// So this module owns the whole hand-off and RETURNS what happened instead of dropping it. The two
// call sites (the starmap rail in `routes/+page.svelte` and the system view's rail in
// `SystemView.svelte`) had a copy each of the stash-then-open pair; they drifted only in whitespace
// so far, but they are exactly the "two spellings of one idea" the duplication rule is about — and
// only one of them could have grown the temporal payload B113(a) needs.
import type { System, TemporalState } from '$lib/types';
import type { UnitPrefs } from '$lib/units';

export const REPORT_STASH_KEY = 'reportData';
export const REPORT_ROUTE = '/report';

export type ReportOptions = {
  mode: 'GM' | 'Player';
  theme: string;
  includeConstructs: boolean;
};

export type ReportOpenFailure = 'no-system' | 'popup-blocked' | 'stash-failed';

export type ReportOpenResult =
  | { ok: true }
  | { ok: false; reason: ReportOpenFailure; message: string };

/**
 * The GM-facing sentence for each failure. They name what the BROWSER or the APP did and what to do
 * about it, because "nothing happened" is the report we are fixing: a GM cannot tell a blocked
 * popup from a crashed render, and both looked identical from the outside.
 */
export const REPORT_FAILURE_MESSAGES: Record<ReportOpenFailure, string> = {
  'no-system':
    'No system is open, so there is nothing to report on yet. Open a system from the starmap first, then choose Report.',
  'popup-blocked':
    'Your browser blocked the report window. Allow pop-ups for this site (usually an icon at the right-hand end of the address bar) and choose Report again.',
  'stash-failed':
    'The report could not be prepared for the new window. If this keeps happening, reload the page and try again.'
};

/** Injectable browser edges, so the decision logic above is gateable without a DOM. */
export type ReportEnv = {
  setItem: (key: string, value: string) => void;
  open: (url: string, target: string) => unknown;
};

export const browserReportEnv: ReportEnv = {
  setItem: (key, value) => sessionStorage.setItem(key, value),
  open: (url, target) => window.open(url, target)
};

export type ReportPayloadInput = {
  system: System | null | undefined;
  options: ReportOptions;
  unitPrefs: UnitPrefs;
  /**
   * B113(a): the campaign's clock and calendar library ride along, so the report can render dates
   * through the SAME resolver every other surface uses. Without this the report route has no way to
   * know which calendar the campaign runs on and falls back to raw Gregorian, which is the fault.
   */
  temporal: TemporalState | null | undefined;
};

/**
 * Prepare the one-shot payload and open the report window. Returns what happened; the caller shows
 * it. NOTHING here is allowed to fail quietly — that is the entire point of the row.
 */
export function openSystemReport(
  input: ReportPayloadInput,
  env: ReportEnv = browserReportEnv
): ReportOpenResult {
  if (!input.system) {
    return { ok: false, reason: 'no-system', message: REPORT_FAILURE_MESSAGES['no-system'] };
  }

  try {
    env.setItem(
      REPORT_STASH_KEY,
      JSON.stringify({
        system: input.system,
        mode: input.options.mode,
        theme: input.options.theme,
        includeConstructs: input.options.includeConstructs,
        unitPrefs: input.unitPrefs,
        temporal: input.temporal ?? null
      })
    );
  } catch {
    return { ok: false, reason: 'stash-failed', message: REPORT_FAILURE_MESSAGES['stash-failed'] };
  }

  // A blocked popup returns null. It is the ONE signal the browser gives us and it was being thrown
  // away; `undefined` is treated the same way because a stubbed or exotic host may return it.
  const opened = env.open(REPORT_ROUTE, '_blank');
  if (opened === null || opened === undefined) {
    return { ok: false, reason: 'popup-blocked', message: REPORT_FAILURE_MESSAGES['popup-blocked'] };
  }

  return { ok: true };
}
