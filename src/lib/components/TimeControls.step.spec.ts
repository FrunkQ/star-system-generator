// THE TRANSPORT CAN STEP BY AN EXACT AMOUNT (UI-C24). A user: "a forward ticker that moves the time
// forward by X amount then stops ... if I want to go forward exactly one month."
//
// `temporal/step.spec.ts` gates the arithmetic against JavaScript's own calendar. What it cannot
// say is whether the pill OFFERS the step, in the active calendar's units, and sends the result
// down the same path a jog does - so the pill is mounted here and driven.
//
// As in the A60 spec beside this one, the harness does not echo a dispatched temporal back into the
// prop, so each assertion reads ONE dispatch against the time the pill was mounted with.
import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, beforeAll } from 'vitest';
import { tick } from 'svelte';
import fs from 'node:fs';
import path from 'node:path';
import TimeControls from './TimeControls.svelte';
import { applyTemporalRegistryConfig, ensureTemporalState } from '$lib/temporal/defaults';
import { unixMsToMasterSeconds, masterSecondsToUnixMs } from '$lib/temporal/utre';
import type { Starmap } from '$lib/types';

beforeAll(() => {
  applyTemporalRegistryConfig(JSON.parse(fs.readFileSync(path.join(process.cwd(), 'static/temporal/calendars.json'), 'utf8')));
});

const START_MS = Date.UTC(2024, 0, 31, 10, 30, 0); // 31 January 2024, 10:30 - a leap year, a 31st

function mount(over: Record<string, unknown> = {}) {
  const map = ensureTemporalState({ id: 'm', name: 'M', systems: [], routes: [] } as unknown as Starmap);
  const start = unixMsToMasterSeconds(START_MS);
  const temporal = { ...map.temporal!, activeCalendarKey: 'Earth Gregorian', displayTimeSec: start.toString(), playbackRunning: false, ...over };
  const updates: any[] = [];
  const view = render(TimeControls, { props: { temporal, isPlaying: false }, events: { updatetemporal: (e: any) => updates.push(e.detail) } });
  const c = view.container;
  const q = <T extends Element>(sel: string) => c.querySelector(sel) as T;
  const open = async () => { await fireEvent.click(q<HTMLButtonElement>('.tt-stepper')); await tick(); };
  const set = async (count: string, unit?: string) => {
    await fireEvent.input(q<HTMLInputElement>('.tt-step-n'), { target: { value: count } });
    if (unit) await fireEvent.change(q<HTMLSelectElement>('.tt-step-unit'), { target: { value: unit } });
    await tick();
  };
  const go = async (which: 'Step forward' | 'Step back') => { await fireEvent.click(q<HTMLButtonElement>(`button[aria-label="${which}"]`)); await tick(); };
  const lastMs = () => masterSecondsToUnixMs(BigInt(updates[updates.length - 1].displayTimeSec));
  return { ...view, start, updates, q, open, set, go, lastMs };
}

describe('the transport steps the displayed time by an exact amount', () => {
  it('the step panel is put away until asked for, and offers the active calendar\'s own units', async () => {
    const t = mount();
    expect(t.q('.tt-step-panel')).toBeNull();
    await t.open();
    expect(t.q('.tt-step-panel')).not.toBeNull();
    const units = [...t.q<HTMLSelectElement>('.tt-step-unit').options].map((o) => o.value);
    expect(units).toEqual(['sec', 'min', 'hour', 'day', 'month', 'year']);
    expect(t.q<HTMLSelectElement>('.tt-step-unit').value).toBe('day');
    expect(t.q<HTMLInputElement>('.tt-step-n').value).toBe('1');
  });

  it('ABSOLUTE: 3 days forward is 259,200 seconds on, and 3 days back is 259,200 before', async () => {
    const t = mount();
    await t.open();
    await t.set('3');
    await t.go('Step forward');
    expect(BigInt(t.updates.at(-1).displayTimeSec)).toBe(t.start + 259200n);
    await t.go('Step back');
    expect(BigInt(t.updates.at(-1).displayTimeSec)).toBe(t.start - 259200n);
  });

  it('"exactly one month": 31 January 2024 goes to 29 February, same time of day', async () => {
    const t = mount();
    await t.open();
    await t.set('1', 'month');
    await t.go('Step forward');
    expect(t.lastMs()).toBe(Date.UTC(2024, 1, 29, 10, 30, 0));
    await t.set('1', 'year');
    await t.go('Step forward');
    expect(t.lastMs()).toBe(Date.UTC(2025, 0, 31, 10, 30, 0));
  });

  it('Enter in the number box steps forward', async () => {
    const t = mount();
    await t.open();
    await t.set('2', 'hour');
    await fireEvent.keyDown(t.q<HTMLInputElement>('.tt-step-n'), { key: 'Enter' });
    expect(BigInt(t.updates.at(-1).displayTimeSec)).toBe(t.start + 7200n);
  });

  it('a step SEEKS: it moves the display and does not touch the play state or the campaign\'s "now"', async () => {
    const t = mount({ playbackRunning: true, masterTimeSec: '123' });
    await t.open();
    const before = t.updates.length;
    await t.set('1', 'day');
    await t.go('Step forward');
    const sent = t.updates.slice(before).filter((u) => BigInt(u.displayTimeSec) === t.start + 86400n);
    expect(sent.length).toBe(1);
    expect(sent[0].playbackRunning).toBe(true);
    expect(sent[0].masterTimeSec).toBe('123');
  });

  it('nothing typed, or a fraction of a month, moves nothing and says why', async () => {
    const t = mount();
    await t.open();
    await t.set('');
    await t.go('Step forward');
    expect(t.updates.length).toBe(0);
    expect(t.q('.tt-step-note').textContent).toMatch(/above zero/);

    await t.set('0.5', 'month');
    await t.go('Step forward');
    expect(t.updates.length).toBe(0);
    expect(t.q('.tt-step-note').textContent).toMatch(/whole number/);

    await t.set('0.5', 'day');
    await t.go('Step forward');
    expect(BigInt(t.updates.at(-1).displayTimeSec)).toBe(t.start + 43200n);
    expect(t.q('.tt-step-note')).toBeNull();
  });

  it('a stardate campaign is offered the stardate\'s own unit and nothing borrowed from Earth', async () => {
    const t = mount({ activeCalendarKey: 'Star Trek Stardate' });
    await t.open();
    const select = t.q<HTMLSelectElement>('.tt-step-unit');
    expect([...select.options].map((o) => o.value)).toEqual(['unit']);
    expect(select.value).toBe('unit');
    await t.set('10');
    await t.go('Step forward');
    expect(BigInt(t.updates.at(-1).displayTimeSec)).toBe(t.start + 315576n);
  });

  it('opening the step panel closes the danger panel, and the other way about', async () => {
    const t = mount();
    await fireEvent.click(t.q<HTMLButtonElement>('.tt-more'));
    await tick();
    expect(t.q('.tt-action.danger')).not.toBeNull();
    await t.open();
    expect(t.q('.tt-action.danger')).toBeNull();
    expect(t.q('.tt-step-panel')).not.toBeNull();
    await fireEvent.click(t.q<HTMLButtonElement>('.tt-more'));
    await tick();
    expect(t.q('.tt-step-panel')).toBeNull();
    expect(t.q('.tt-action.danger')).not.toBeNull();
  });
});
