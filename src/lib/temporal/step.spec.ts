// STEP THE CLOCK BY AN EXACT AMOUNT (UI-C24). A user: "a forward ticker that moves the time forward
// by X amount then stops ... if I want to go forward exactly one month."
//
// The Gregorian cases are checked against JAVASCRIPT'S OWN CALENDAR (`Date.UTC`), which shares no
// code with this engine's resolver - so "one month on from 31 January 2024" is right because two
// independent calendars agree on the instant, not because the function agrees with itself.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { clockStepUnits, stepClockSeconds, MAX_MONTH_STEPS } from './step';
import { resolveCalendar, unixMsToMasterSeconds, masterSecondsToUnixMs } from './utre';
import { applyTemporalRegistryConfig, shippedCalendar } from './defaults';
import type { TemporalCalendarDefinition } from '$lib/types';

const SHIPPED = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'static/temporal/calendars.json'), 'utf8'));
let GREG: TemporalCalendarDefinition, HAAB: TemporalCalendarDefinition, STARDATE: TemporalCalendarDefinition;
beforeAll(() => {
  applyTemporalRegistryConfig(SHIPPED);
  GREG = shippedCalendar('Earth Gregorian')!;
  HAAB = shippedCalendar('Mayan Haab (Simplified)')!;
  STARDATE = shippedCalendar('Star Trek Stardate')!;
});

const utc = (y: number, m: number, d: number, h = 0, min = 0, s = 0) => Date.UTC(y, m - 1, d, h, min, s);
const at = (ms: number) => unixMsToMasterSeconds(ms);
const step = (ms: number, unit: string, n: number) => {
  const out = stepClockSeconds(at(ms), GREG, unit, n);
  return out == null ? null : masterSecondsToUnixMs(out);
};

describe('what a calendar can be stepped by', () => {
  it('Gregorian: its own seconds, minutes, hours and days, then months and years', () => {
    expect(clockStepUnits(GREG).map((u) => u.id)).toEqual(['sec', 'min', 'hour', 'day', 'month', 'year']);
    expect(clockStepUnits(GREG).find((u) => u.id === 'day')).toMatchObject({ kind: 'fixed', seconds: 86400, label: 'days' });
  });
  it('a ratio calendar has only its own count: a stardate defines no day to step by', () => {
    const units = clockStepUnits(STARDATE);
    expect(units.map((u) => u.id)).toEqual(['unit']);
    expect(units[0].seconds).toBeCloseTo(31557.6, 6); // 31,557,600 s per 1000 units
  });
  it('a calendar with one month is not offered months, and one with no day is offered no dates', () => {
    const oneMonth = { ...GREG, lookup_tables: { months: [{ name: 'Only', days: 365 }] } } as TemporalCalendarDefinition;
    expect(clockStepUnits(oneMonth).map((u) => u.id)).toEqual(['sec', 'min', 'hour', 'day', 'year']);
    const noDay = { ...GREG, hierarchy: (GREG as any).hierarchy.filter((u: any) => u.unit !== 'day') } as TemporalCalendarDefinition;
    expect(clockStepUnits(noDay).map((u) => u.id)).toEqual(['sec', 'min', 'hour']);
  });
  it('no calendar at all: seconds, which is what the clock counts', () => {
    expect(clockStepUnits(null)).toEqual([{ id: 'sec', label: 'seconds', kind: 'fixed', seconds: 1 }]);
  });
});

describe('a fixed step is exactly that long', () => {
  it('ABSOLUTE: 3 days is 259,200 seconds, forward and back; half a day is 43,200', () => {
    const t = at(utc(2026, 9, 1, 12));
    expect(stepClockSeconds(t, GREG, 'day', 3)).toBe(t + 259200n);
    expect(stepClockSeconds(t, GREG, 'day', -3)).toBe(t - 259200n);
    expect(stepClockSeconds(t, GREG, 'day', 0.5)).toBe(t + 43200n);
    expect(stepClockSeconds(t, GREG, 'hour', 36)).toBe(t + 129600n);
  });
  it('a day is the CALENDAR\'s day, never Earth\'s: 139,968 seconds on the world that says so', () => {
    const alien = { ...GREG, hierarchy: [
      { unit: 'year', multiplier: 328.96 * 139968 }, { unit: 'day', multiplier: 139968 },
      { unit: 'hour', multiplier: 5832 }, { unit: 'min', multiplier: 97.2 }, { unit: 'sec', multiplier: 1.62 }
    ] } as unknown as TemporalCalendarDefinition;
    const t = at(utc(2026, 9, 1));
    expect(stepClockSeconds(t, alien, 'day', 2)).toBe(t + 279936n);
    expect(stepClockSeconds(t, alien, 'hour', 1)).toBe(t + 5832n);
    expect(stepClockSeconds(t, alien, 'min', 10)).toBe(t + 972n);
  });
  it('a stardate unit is 31,557.6 seconds; ten of them is 315,576', () => {
    const t = at(utc(2026, 9, 1));
    expect(stepClockSeconds(t, STARDATE, 'unit', 10)).toBe(t + 315576n);
    expect(stepClockSeconds(t, STARDATE, 'day', 1)).toBeNull();
  });
  it('nothing to do is null, not a step of zero: a zero, a non-number, an unknown unit', () => {
    const t = at(utc(2026, 9, 1));
    for (const n of [0, NaN, Infinity]) expect(stepClockSeconds(t, GREG, 'day', n)).toBeNull();
    expect(stepClockSeconds(t, GREG, 'fortnight', 1)).toBeNull();
    expect(stepClockSeconds(t, GREG, 'month', 0.4)).toBeNull();
  });
});

describe('a month is a date, not a length (checked against JavaScript\'s own calendar)', () => {
  it('the same day next month, at the same time of day', () => {
    expect(step(utc(2026, 3, 15, 10, 30, 7), 'month', 1)).toBe(utc(2026, 4, 15, 10, 30, 7));
    expect(step(utc(2026, 12, 15, 23, 59, 59), 'month', 1)).toBe(utc(2027, 1, 15, 23, 59, 59));
    expect(step(utc(2026, 1, 15), 'month', -1)).toBe(utc(2025, 12, 15));
  });
  it('February is not thirty days: 15 January + 1 month is 31 days on, + 2 months is 59 (60 in a leap year)', () => {
    const day = 86_400_000;
    expect(step(utc(2026, 1, 15), 'month', 1)! - utc(2026, 1, 15)).toBe(31 * day);
    expect(step(utc(2026, 1, 15), 'month', 2)! - utc(2026, 1, 15)).toBe(59 * day);
    expect(step(utc(2024, 1, 15), 'month', 2)! - utc(2024, 1, 15)).toBe(60 * day);
  });
  it('a day the target month does not have becomes its LAST day: 31 January to 29 (or 28) February', () => {
    expect(step(utc(2024, 1, 31, 8), 'month', 1)).toBe(utc(2024, 2, 29, 8));
    expect(step(utc(2026, 1, 31, 8), 'month', 1)).toBe(utc(2026, 2, 28, 8));
    expect(step(utc(2026, 3, 31), 'month', -1)).toBe(utc(2026, 2, 28));
    expect(step(utc(2026, 5, 31), 'month', 1)).toBe(utc(2026, 6, 30));
  });
  it('...and the day asked for is REMEMBERED across the short month: 31 Jan + 2 months is 31 March', () => {
    expect(step(utc(2026, 1, 31), 'month', 2)).toBe(utc(2026, 3, 31));
    expect(step(utc(2026, 1, 31), 'month', 13)).toBe(utc(2027, 2, 28));
    expect(step(utc(2026, 3, 31), 'month', -2)).toBe(utc(2026, 1, 31));
  });
  it('twelve months is a year, a hundred and twenty is a decade, and back again', () => {
    const t = utc(2026, 9, 11, 6, 15);
    expect(step(t, 'month', 12)).toBe(utc(2027, 9, 11, 6, 15));
    expect(step(t, 'month', 120)).toBe(utc(2036, 9, 11, 6, 15));
    expect(step(t, 'month', -120)).toBe(utc(2016, 9, 11, 6, 15));
  });
  it('the month table is the CALENDAR\'s: a Haab month is twenty days', () => {
    const t = at(utc(2026, 9, 11, 6));
    const before = resolveCalendar(t, HAAB).fields;
    const after = resolveCalendar(stepClockSeconds(t, HAAB, 'month', 1)!, HAAB).fields;
    expect(after.mday).toBe(before.mday);
    expect(after.month).not.toBe(before.month);
    // 20 days exactly, unless the walk crossed the five-day Wayeb at the year's end.
    const days = Number(stepClockSeconds(t, HAAB, 'month', 1)! - t) / 86400;
    expect([5, 20, 25]).toContain(days);
    expect(String(before.month)).not.toBe('');
  });
});

describe('a year is a date too', () => {
  it('the same date next year, across leap years, at the same time of day', () => {
    expect(step(utc(2026, 9, 11, 6, 15), 'year', 1)).toBe(utc(2027, 9, 11, 6, 15));
    expect(step(utc(2023, 6, 1), 'year', 1)).toBe(utc(2024, 6, 1));   // 366 days: a leap day lies between
    expect(step(utc(2024, 1, 10), 'year', 1)).toBe(utc(2025, 1, 10)); // 366 days again
    expect(step(utc(2026, 9, 11), 'year', -26)).toBe(utc(2000, 9, 11));
    expect(step(utc(2026, 9, 11), 'year', 400)).toBe(utc(2426, 9, 11));
  });
  it('29 February + 1 year is 28 February; + 4 years is 29 February again', () => {
    expect(step(utc(2024, 2, 29, 9), 'year', 1)).toBe(utc(2025, 2, 28, 9));
    expect(step(utc(2024, 2, 29, 9), 'year', 4)).toBe(utc(2028, 2, 29, 9));
    expect(step(utc(2024, 2, 29, 9), 'year', -1)).toBe(utc(2023, 2, 28, 9));
  });
  it('a year that is not a whole number of days keeps the clock time across its turn', () => {
    // The world from the bug report: 328.96 of its own days to the year, so the year turns over
    // part-way through a day. One year on must read the same hour, minute and day of the year.
    const DAY = 139968;
    const cal = {
      id: 'CAL_alien', math_type: 'BUCKET_DRAIN', epoch_offset_t: at(utc(2026, 1, 1)).toString(),
      format: '{hour:02}:{min:02}:{sec:02}, {mday}{suffix} {month}, Year {year}',
      hierarchy: [
        { unit: 'year', multiplier: 328.96 * DAY }, { unit: 'day', multiplier: DAY },
        { unit: 'hour', multiplier: 5832 }, { unit: 'min', multiplier: 97.2 }, { unit: 'sec', multiplier: 1.62 }
      ],
      leap_logic: { drift_per_year_t: 0, threshold_t: 86400, apply_to: 'day' },
      lookup_tables: { months: [{ name: 'Only', days: 400 }] }
    } as unknown as TemporalCalendarDefinition;
    const t = at(utc(2026, 1, 1)) + BigInt(40 * DAY + 3 * 5832 + 972); // day 41, 03:10:00
    const a = resolveCalendar(t, cal).fields;
    const out = stepClockSeconds(t, cal, 'year', 1)!;
    const b = resolveCalendar(out, cal).fields;
    expect(resolveCalendar(t, cal).formatted).toBe('03:10:00, 41st Only, Year 1');
    expect(resolveCalendar(out, cal).formatted).toBe('03:10:00, 41st Only, Year 2');
    expect([b.hour, b.min, b.mday]).toEqual([a.hour, a.min, a.mday]);
  });
});

describe('no calendar a GM can type may hang the step (the resolver\'s own promise)', () => {
  const hostile = (over: Record<string, unknown>) => ({
    id: 'CAL_bad', math_type: 'BUCKET_DRAIN', epoch_offset_t: '0', format: '{mday} {month} {year}',
    hierarchy: [{ unit: 'year', multiplier: 31536000 }, { unit: 'day', multiplier: 86400 }, { unit: 'hour', multiplier: 3600 }, { unit: 'min', multiplier: 60 }, { unit: 'sec', multiplier: 1 }],
    lookup_tables: { months: [{ name: 'A', days: 30 }, { name: 'B', days: 30 }] },
    ...over
  }) as unknown as TemporalCalendarDefinition;

  it('answers (a number or null) in bounded time for absurd calendars, and never throws', () => {
    const t = at(utc(2026, 9, 1));
    const cases = [
      hostile({ hierarchy: [{ unit: 'year', multiplier: 1e15 }, { unit: 'day', multiplier: 1 }] }),              // a year of a quadrillion days
      hostile({ hierarchy: [{ unit: 'year', multiplier: 10 }, { unit: 'day', multiplier: 86400 }] }),            // a year shorter than a day
      hostile({ lookup_tables: { months: [{ name: 'Same', days: 10 }, { name: 'Same', days: 10 }] } }),          // two months, one name
      hostile({ lookup_tables: { months: [{ name: 'A', days: 0.5 }, { name: 'B', days: 0.25 }] } }),             // fractional months
      hostile({ leap_logic: { drift_per_year_t: -9e9, threshold_t: 1, apply_to: 'day' } }),
      hostile({ hierarchy: null }), hostile({ lookup_tables: null }), hostile({ format: null })
    ];
    const t0 = performance.now();
    for (const cal of cases) {
      for (const unit of ['day', 'month', 'year']) {
        for (const n of [1, -1, 37]) {
          let out: bigint | null = null;
          expect(() => { out = stepClockSeconds(t, cal, unit, n); }).not.toThrow();
          expect(out === null || typeof out === 'bigint').toBe(true);
        }
      }
    }
    expect(performance.now() - t0).toBeLessThan(20_000);
  });
  it('a month count past the bound is refused rather than walked', () => {
    expect(stepClockSeconds(at(utc(2026, 9, 1)), GREG, 'month', MAX_MONTH_STEPS + 1)).toBeNull();
    expect(stepClockSeconds(at(utc(2026, 9, 1)), GREG, 'month', MAX_MONTH_STEPS)).not.toBeNull();
  });
});
