// src/lib/rendering/perfGuard.ts
// WHEN TO SHED WORK BECAUSE THE FRAME RATE HAS COLLAPSED — the decision, on its own, as a pure
// function of a stream of frame-rate samples. The measuring is `perfTrace.perfFrame`'s job (it has
// counted frames for the slow-spell hunt since 2026-08 and a second counter would be a second
// answer); the ACTING is the scene's. This is only the judgement between them.
//
// FOUR RULES, and every one of them exists because the obvious version of this feature is worse than
// no feature at all:
//
//  1. WARM UP FIRST. The seconds after a system builds are the slowest a scene ever is — textures are
//     being painted, geometry uploaded — and they are not what the map will feel like. A guard that
//     watched them would strip the atmospheres off every system on arrival, every time.
//  2. TWO BAD WINDOWS, NOT ONE. A single window can be ruined by a garbage collection, a tab losing
//     focus, or the GM dragging a window across a screen boundary. Shedding on one is a guard that
//     fires on things that were never the renderer's fault.
//  3. FIRE ONCE, THEN NEVER AGAIN. Turning something off that the user chose is a big enough
//     intervention that doing it twice is a fight. Once it has fired, this guard is finished.
//  4. AND IT IS FINISHED THE MOMENT THE USER DISAGREES. If they turn the atmospheres back on, they
//     have answered the question — the guard stands down for good rather than waiting to pounce
//     again on the next slow window.
//
// The thresholds are DATA, in one table, because they are exactly the numbers a human will want to
// change after using the product on their own machine.

/** Below this, sustained, the map is not usable and something has to go. */
export const SHED_FPS = 20;
/** Consecutive windows below it before anything is shed. */
export const SHED_WINDOWS = 2;
/**
 * How long after a scene build the guard ignores the frame rate entirely.
 *
 * `perfTrace` reports one sample every 5 s, so this is "skip the first two reports": the build
 * itself, and the one after it in which the textures are still being uploaded.
 */
export const WARMUP_MS = 12000;

export type PerfGuardVerdict = 'watching' | 'warming-up' | 'shed' | 'stood-down';

export interface PerfGuardState {
  /** How many consecutive windows have come in under the threshold. */
  bad: number;
  /** True once it has fired, or once the user has overruled it. Either way it is done. */
  done: boolean;
}

export function newPerfGuard(): PerfGuardState {
  return { bad: 0, done: false };
}

/**
 * Feed one frame-rate sample. Returns 'shed' EXACTLY ONCE, on the sample that trips it — the caller
 * acts on that and nothing else. `sinceBuildMs` is the age of the current scene, not of the page:
 * every rebuild is a fresh set of textures and a fresh warm-up.
 */
export function perfGuardSample(
  state: PerfGuardState,
  fps: number,
  sinceBuildMs: number
): PerfGuardVerdict {
  if (state.done) return 'stood-down';
  if (sinceBuildMs < WARMUP_MS) {
    // Warming up is not the same as healthy: a bad window here proves nothing, so it does not count
    // toward the run — but it must not be allowed to CLEAR a run either, or a rebuild in the middle
    // of a genuinely slow spell would reset the guard and it would never reach two.
    return 'warming-up';
  }
  if (!(fps > 0) || fps >= SHED_FPS) {
    state.bad = 0;
    return 'watching';
  }
  state.bad++;
  if (state.bad < SHED_WINDOWS) return 'watching';
  state.done = true;
  return 'shed';
}

/**
 * The user has turned the shed feature back on. They have answered the question, so the guard is
 * finished for good — it does not get to take it away again on the next slow window.
 */
export function perfGuardStandDown(state: PerfGuardState): void {
  state.done = true;
}

/** What to tell them, in one place, so the wording is not invented at the call site. */
export const PERF_SHED_MESSAGE =
  'Atmospheres turned off to keep this map moving — the frame rate had dropped below '
  + SHED_FPS + ' for several seconds. Turn them back on any time; this will not happen again this session.';
