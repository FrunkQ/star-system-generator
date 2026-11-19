// THE CALENDAR EDITOR'S MONTHS (reports of 2026-09-10/12): "you can't actually add months for
// custom calendars" and "i accidentally added a new month to the Gregorian calendar and now I cant
// get rid of it". The add and the remove both WORK in this component and always did (the first two
// cases pin that, so nobody chases it again); what was missing is everything around them - the
// editor opens on the ACTIVE calendar, which is a built-in, with no word that it is one and no way
// back; and the months table and the year's length are two separate numbers that nothing compared.
import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, beforeAll } from 'vitest';
import { tick } from 'svelte';
import { readFileSync } from 'node:fs';
import EditTemporalModal from './EditTemporalModal.svelte';
import { applyTemporalRegistryConfig, createDefaultTemporalState, shippedCalendar } from '$lib/temporal/defaults';
import { resolveCalendar } from '$lib/temporal/utre';

beforeAll(() => applyTemporalRegistryConfig(JSON.parse(readFileSync('static/temporal/calendars.json', 'utf8'))));

const open = async (temporal: any = createDefaultTemporalState()) => {
  let saved: any = null;
  const starmap: any = { id: 'm', name: 'm', systems: [], temporal };
  const r = render(EditTemporalModal, { props: { showModal: true, starmap }, events: { save: (e: any) => { saved = e.detail.temporal; } } } as any);
  await tick();
  const button = (text: string) => Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
  const press = async (text: string) => { await fireEvent.click(button(text)); await tick(); await tick(); };
  const rows = () => r.container.querySelectorAll('.month-row').length;
  const note = () => r.container.querySelector('[data-testid="builtin-note"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const total = () => r.container.querySelector('[data-testid="months-total"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const months = (key: string) => saved?.temporal_registry[key]?.lookup_tables?.months;
  return { r, button, press, rows, note, total, months, saved: () => saved };
};

describe('add and remove a month - the calendar in hand, and only that one', () => {
  it('a month added to a NEW calendar lands on it and on nothing else', async () => {
    const e = await open();
    await e.press('+ Add Calendar');
    expect(e.rows()).toBe(12);
    await e.press('+ Add Month');
    expect(e.rows()).toBe(13);
    await e.press('Save Changes');
    expect(e.months('New Calendar 1')).toHaveLength(13);
    expect(e.months('Earth Gregorian')).toHaveLength(12);
    expect(e.months('Mayan Haab (Simplified)')).toHaveLength(19);
  });
  it('a month added to Gregorian can be taken off again with its own x', async () => {
    const e = await open();
    await e.press('+ Add Month');
    expect(e.rows()).toBe(13);
    const dels = e.r.container.querySelectorAll('.small-del');
    await fireEvent.click(dels[dels.length - 1]); await tick();
    expect(e.rows()).toBe(12);
  });
});

describe('a built-in calendar says that it is one, and can be put back', () => {
  it('unchanged: the note says built-in and offers no restore', async () => {
    const e = await open();
    expect(e.note()).toMatch(/built-in calendar/i);
    expect(e.button('Restore the built-in')).toBeUndefined();
  });
  it('the reported accident: a thirteenth month on Gregorian is one press from gone, and SAVES gone', async () => {
    const temporal = createDefaultTemporalState();
    (temporal.temporal_registry['Earth Gregorian'] as any).lookup_tables.months.push({ name: 'Month 13', days: 30 });
    (temporal.temporal_registry['Earth Gregorian'] as any).id = 'CAL_earth_gregorian';   // what Save had stamped
    const e = await open(temporal);
    expect(e.rows()).toBe(13);
    expect(e.note()).toMatch(/has been changed/i);
    await e.press('Restore the built-in');
    expect(e.rows()).toBe(12);
    expect(e.note()).not.toMatch(/has been changed/i);
    await e.press('Save Changes');
    const { id: _a, ...savedGreg } = e.saved().temporal_registry['Earth Gregorian'];
    const { id: _b, ...shipped } = shippedCalendar('Earth Gregorian') as any;
    expect(savedGreg).toEqual(shipped);
  });
  it('a calendar of the GM\'s own carries no such note', async () => {
    const e = await open();
    await e.press('+ Add Calendar');
    expect(e.note()).toBeNull();
  });
});

describe('the months and the year are compared, out loud', () => {
  it('a new calendar is told its twelve 30-day months do not fill its 365-day year', async () => {
    const e = await open();
    await e.press('+ Add Calendar');
    expect(e.total()).toContain('The months add up to 360 days; the year is 365 days long');
    expect(e.total()).toContain('have no month name');
  });
  it('a thirteenth month overruns the year, and one press makes the year fit - after which the clock REACHES it', async () => {
    const e = await open();
    await e.press('+ Add Calendar');
    await e.press('+ Add Month');
    expect(e.total()).toContain('The months add up to 390 days; the year is 365 days long');
    expect(e.total()).toContain('never reaches');
    await e.press('Make the year 390 days');
    expect(e.total()).toContain('The months add up to 390 days; the year is 390 days long');
    expect(e.button('Make the year')).toBeUndefined();
    await e.press('Save Changes');
    const cal = e.saved().temporal_registry['New Calendar 1'];
    expect(cal.hierarchy.find((u: any) => u.unit === 'year').multiplier).toBe(390 * 86400);
    // day 389 of the year is the 30th of Month 13: the added month exists in the clock now
    cal.format = '{mday} {month}';
    expect(resolveCalendar(BigInt(389 * 86400), cal).formatted).toBe('30 Month 13');
  });
  it('the line follows a month\'s length as it is typed', async () => {
    const e = await open();
    const days = e.r.container.querySelector('.month-row input[type="number"]') as HTMLInputElement;
    await fireEvent.input(days, { target: { value: '41' } }); await tick(); await tick();
    expect(e.total()).toContain('The months add up to 375 days; the year is 365 days long');
  });
  it('Gregorian is 365 and 365 and says nothing more', async () => {
    const e = await open();
    expect(e.total()).toBe('The months add up to 365 days; the year is 365 days long (year sec ÷ day sec).');
  });
});
