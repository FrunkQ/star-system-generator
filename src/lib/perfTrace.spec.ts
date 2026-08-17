import { describe, it, expect, beforeEach } from 'vitest';
import { perfEvent, perfCount, perfCounters } from './perfTrace';

/**
 * The event ring exists because a COUNTER cannot say why something happened (engine map RENDER-S22,
 * inbox P2). These tests pin the two properties that make it usable for the fault it was built for —
 * an INTERMITTENT rebuild storm that a hard refresh clears.
 *
 * Each is a regression test for a specific way the ring could be "tidied up" into uselessness, not
 * coverage for its own sake.
 */
describe('perfTrace event ring', () => {
  const ring = () => (globalThis as unknown as { __ssePerf?: { perfEvents: Record<string, unknown>[] } }).__ssePerf?.perfEvents ?? [];

  beforeEach(() => { ring().length = 0; });

  it('records without any switch being turned on', () => {
    // THE LOAD-BEARING PROPERTY. The fault this serves is intermittent and the refresh you would use
    // to go and enable an instrument destroys the evidence, so the ring must never be gated on
    // verbose mode. If someone "optimises" it behind perfEnabled(), this fails.
    perfEvent('holo.setSystem', { reason: 'prop', sameRef: false });
    expect(ring()).toHaveLength(1);
    expect(ring()[0]).toMatchObject({ name: 'holo.setSystem', reason: 'prop', sameRef: false });
  });

  it('stamps every row with a time, so gaps between events are readable', () => {
    // Even spacing reads as a driver, bursts as a retrigger — that distinction is the whole
    // diagnostic value, and it is lost if a row carries only its payload.
    perfEvent('rx', { type: 'SYNC_STARMAP' });
    expect(typeof ring()[0].t).toBe('number');
  });

  it('is BOUNDED, discarding oldest first', () => {
    // It runs on a hot path during a storm (~12 Hz). Unbounded, the instrument for a memory-adjacent
    // fault would itself grow without limit.
    for (let i = 0; i < 400; i++) perfEvent('spam', { i });
    const rows = ring();
    expect(rows.length).toBeLessThanOrEqual(300);
    // Newest survive: the last row is the last one pushed.
    expect(rows[rows.length - 1]).toMatchObject({ i: 399 });
  });
});

describe('perfCount', () => {
  it('accumulates by name, so a .ms total can be divided by a call count', () => {
    // The established idiom (`holo.setSystem.ms` / calls = average rebuild cost). Guards against a
    // "set" rather than "add" implementation.
    const k = `test.spec.${Math.round(performance.now())}`;
    perfCount(k, 10);
    perfCount(k, 5);
    expect(perfCounters[k]).toBe(15);
  });
});
