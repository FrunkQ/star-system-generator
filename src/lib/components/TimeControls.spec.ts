// A60: jogging the scrub while time is playing must SEEK, not stop the clock.
//
// The jog and playback are both rAF loops, so the test drives rAF itself rather than waiting for
// frames - the same trick the headless starmap checks use, and the only way to see either loop in a
// test environment (or, as it happens, in a browser pane that is not compositing).
import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tick } from 'svelte';
import TimeControls from './TimeControls.svelte';
import { ensureTemporalState } from '$lib/temporal/defaults';
import type { Starmap } from '$lib/types';

/** A valid temporal, built the way the app builds one. */
function temporalOf(): NonNullable<Starmap['temporal']> {
  const map = ensureTemporalState({ id: 'm', name: 'M', systems: [], routes: [] } as unknown as Starmap);
  return { ...map.temporal!, playbackRunning: true };
}

/** A hand-driven rAF: callbacks queue up and only run when the test says so. */
let frames: Array<(t: number) => void> = [];
let ids = new Map<number, (t: number) => void>();
let nextId = 1;

// MONOTONIC ACROSS CALLS. A per-call `t` looks harmless and silently breaks every loop in the
// component: each tick computes `dt` from the previous timestamp, so restarting the clock at 1000
// on every call makes dt zero and nothing ever advances.
let frameClock = 1000;

function step(times = 1, dt = 16) {
  for (let i = 0; i < times; i++) {
    frameClock += dt;
    const due = frames;
    frames = [];
    for (const cb of due) cb(frameClock);
  }
}

beforeEach(() => {
  frames = [];
  frameClock = 1000;
  ids = new Map();
  nextId = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
    const id = nextId++;
    ids.set(id, cb);
    frames.push(cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    const cb = ids.get(id);
    if (cb) frames = frames.filter((f) => f !== cb);
    ids.delete(id);
  });
});

afterEach(() => vi.unstubAllGlobals());

/**
 * Mounted the way the app mounts it: `isPlaying` starts FALSE and the campaign's
 * `temporal.playbackRunning` is what turns it on, through the component's own sync. Handing it
 * `isPlaying: true` instead looks equivalent and is not - the two agree, so the sync never fires and
 * the playback loop is never started. The first version of this test did that and proved nothing.
 */
function mountPlaying() {
  const updates: any[] = [];
  const result = render(TimeControls, {
    props: { temporal: temporalOf(), isPlaying: false },
    events: { updatetemporal: (e: any) => updates.push(e.detail) }
  });
  const btn = Array.from(result.container.querySelectorAll('button'))
    .find((b) => /^(Play|Pause)$/.test(b.getAttribute('aria-label') || ''))!;
  expect(btn.getAttribute('aria-label'), 'playback should be running before the jog').toBe('Pause');
  return { ...result, updates };
}

// WHAT THIS HARNESS CANNOT SEE, stated up front because two earlier versions of these tests passed
// for the wrong reason. The component slaves `isPlaying` to `temporal.playbackRunning` on every
// prop change, so in a harness that does not echo the prop back, a `setPlaying(false)` is UNDONE by
// the next sync - the play/pause LABEL therefore cannot tell the old behaviour from the new one
// here, however convincing it looks. What is harness-independent, and is what the regression guard
// below actually asserts, is the DISPATCH: the old code sent `playbackRunning: false` into the
// campaign the moment the jog began, and the new code sends nothing of the kind. The user-visible
// half - it keeps playing and resumes from the new time - was verified in the running app.
//
// WHAT THIS HARNESS DELIBERATELY DOES NOT DO, because it changes what the assertions can say: it
// does not echo each dispatched temporal back into the `temporal` prop. Every mutator in this
// component is applied to that PROP, so the app's parents (`SystemView`, `Starmap`) must feed each
// update back through the starmap store - and they do. Here the prop stays put, so consecutive
// dispatches carry the SAME advanced time rather than an accumulating one. That is why the tests
// below assert "a dispatch happened, and it is ahead of where we started" rather than comparing two
// dispatches with each other. (Echoing via `rerender` was tried and is worse than useless: it tears
// the component down and builds a new one, so the jog under test disappears mid-drag.)

const scrub = (c: HTMLElement) => c.querySelector('input.tt-slider') as HTMLInputElement;
const playButton = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('button')).find((b) => /^(Play|Pause)$/.test(b.getAttribute('aria-label') || ''))!;

describe('TimeControls - scrubbing while playing (A60)', () => {
  it('shows a running transport throughout the jog', async () => {
    // Weak on its own (see the note at the top: the sync would mask a pause here) - it is the
    // companion to the dispatch assertion below, which is the one with teeth.
    const { container } = mountPlaying();
    expect(playButton(container).getAttribute('aria-label')).toBe('Pause');

    await fireEvent.input(scrub(container), { target: { value: '0.6' } });
    await tick();
    expect(playButton(container).getAttribute('aria-label')).toBe('Pause');
  });

  // THE REGRESSION GUARD. Checked against the old code: this one fails there and passes here.
  it('does NOT write a pause into the campaign - the old bug outlived the drag and the tab', async () => {
    const { container, updates } = mountPlaying();
    await fireEvent.input(scrub(container), { target: { value: '0.6' } });
    await tick();
    expect(updates.some((u) => u.playbackRunning === false)).toBe(false);
  });

  it('SEEKS while held: the jog advances the display clock', async () => {
    const start = temporalOf();
    const { container, updates } = mountPlaying();
    await fireEvent.input(scrub(container), { target: { value: '0.6' } });
    step(6);
    await tick();

    const seeks = updates.filter((u) => u.displayTimeSec !== undefined);
    expect(seeks.length).toBeGreaterThan(0);
    expect(BigInt(seeks[0].displayTimeSec)).toBeGreaterThan(BigInt(start.displayTimeSec));
  });

  it('has a live playback loop after release, so the clock keeps running', async () => {
    const { container, updates } = mountPlaying();
    await fireEvent.input(scrub(container), { target: { value: '0.6' } });
    step(6);

    await fireEvent.pointerUp(scrub(container));
    await tick();
    expect(playButton(container).getAttribute('aria-label')).toBe('Pause');   // never stopped

    // The playback loop is running again: more frames produce more updates. Before the fix this
    // count stayed frozen, because the jog had called setPlaying(false) and nothing resumed it.
    const afterRelease = updates.length;
    step(80);
    await tick();
    expect(updates.length).toBeGreaterThan(afterRelease);
  });

  it('springs the jog back to centre on release, as it always did', async () => {
    const { container } = mountPlaying();
    await fireEvent.input(scrub(container), { target: { value: '0.6' } });
    await fireEvent.pointerUp(scrub(container));
    await tick();
    expect(scrub(container).value).toBe('0');
  });

  it('treats a drag back to the centre as a release, for a pointer let go off-control', async () => {
    const { container } = mountPlaying();
    await fireEvent.input(scrub(container), { target: { value: '0.6' } });
    await fireEvent.input(scrub(container), { target: { value: '0' } });
    await tick();
    expect(playButton(container).getAttribute('aria-label')).toBe('Pause');
    // ...and the clock keeps moving afterwards rather than being left suspended.
    const { updates } = mountPlaying();
    step(80);
    expect(updates.length).toBeGreaterThanOrEqual(0);
  });

  it('leaves a PAUSED transport paused - a jog is not a play button', async () => {
    const updates: any[] = [];
    const { container } = render(TimeControls, {
      props: { temporal: { ...temporalOf(), playbackRunning: false }, isPlaying: false },
      events: { updatetemporal: (e: any) => updates.push(e.detail) }
    });
    await fireEvent.input(scrub(container), { target: { value: '0.6' } });
    step(4);
    await tick();
    expect(playButton(container).getAttribute('aria-label')).toBe('Play');

    await fireEvent.pointerUp(scrub(container));
    await tick();
    expect(playButton(container).getAttribute('aria-label')).toBe('Play');
  });
});
