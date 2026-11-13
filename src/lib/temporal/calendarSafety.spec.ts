// NO CALENDAR A GM CAN TYPE MAY TAKE THE APP DOWN (found live on beta, 2026-09-12): "custom
// calendar completely bricks sse beta ... i think it's because i set a custom second as 1.62 earth
// seconds? or maybe the negative leap time? but one year on that planet is 328.96 of its days".
// All three, and the first is the brick: `BigInt(1.62)` throws, the resolver runs on every clock
// tick, and the saved campaign carries the calendar - so it threw again on every load.
//
// These assertions are ABSOLUTE where they can be: a custom second, a fractional year and a
// negative leap each have one right answer at a chosen instant, and "it did not throw" alone would
// pass a resolver that returned nonsense.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveCalendar, resolveTemporalDisplay, wholeClockSeconds } from './utre';
import { applyTemporalRegistryConfig, ensureTemporalState, temporalForExport } from './defaults';
import type { TemporalCalendarDefinition } from '$lib/types';

const EPOCH = 435084632988264000n;   // any instant; the calendar's zero
const bucket = (over: Record<string, unknown> = {}): TemporalCalendarDefinition => ({
  id: 'CAL_test', math_type: 'BUCKET_DRAIN', epoch_offset_t: EPOCH.toString(),
  format: '{hour:02}:{min:02}:{sec:02}, {mday}{suffix} {month}, Year {year}',
  hierarchy: [
    { unit: 'year', multiplier: 31536000 }, { unit: 'day', multiplier: 86400 },
    { unit: 'hour', multiplier: 3600 }, { unit: 'min', multiplier: 60 }, { unit: 'sec', multiplier: 1 }
  ],
  leap_logic: { drift_per_year_t: 0, threshold_t: 86400, apply_to: 'day' },
  lookup_tables: { weekdays: ['A', 'B', 'C'], months: [{ name: 'Only', days: 400 }] },
  ...over
}) as unknown as TemporalCalendarDefinition;
const at = (cal: TemporalCalendarDefinition, localSeconds: number | bigint) => resolveCalendar(EPOCH + BigInt(localSeconds), cal);

// The reported world: a second of 1.62 Earth seconds, 60 to the minute, 60 to the hour, 24 hours to
// the day, and 328.96 of those days to the year.
const SEC = 1.62, MIN = 97.2, HOUR = 5832, DAY = 139968, YEAR = 328.96 * DAY;   // 46,043,873.28 s
const reported = (leap: Record<string, unknown> = { drift_per_year_t: 0, threshold_t: 86400, apply_to: 'day' }) => bucket({
  hierarchy: [
    { unit: 'year', multiplier: YEAR }, { unit: 'day', multiplier: DAY },
    { unit: 'hour', multiplier: HOUR }, { unit: 'min', multiplier: MIN }, { unit: 'sec', multiplier: SEC }
  ],
  leap_logic: leap
});

describe('a custom second of 1.62 Earth seconds', () => {
  it('ABSOLUTE: the clock reads this world\'s own hours, minutes and seconds', () => {
    expect(at(reported(), 0).formatted).toBe('00:00:00, 1st Only, Year 1');
    expect(at(reported(), 5832).formatted).toBe('01:00:00, 1st Only, Year 1');          // one local hour
    expect(at(reported(), 5832 + 972).formatted).toBe('01:10:00, 1st Only, Year 1');    // + ten local minutes
    expect(at(reported(), 5832 + 972 + 81).formatted).toBe('01:10:50, 1st Only, Year 1'); // + fifty local seconds
    expect(at(reported(), DAY * 3).formatted).toBe('00:00:00, 4th Only, Year 1');
  });
  it('ABSOLUTE: a 328.96-day year turns over where it should - 25 years is 8,224 days exactly', () => {
    const twentyFiveYears = 1151096832;                       // 25 x 46,043,873.28
    expect(twentyFiveYears).toBe(8224 * DAY);
    expect(at(reported(), twentyFiveYears).fields.year).toBe(26);
    expect(at(reported(), twentyFiveYears).formatted).toBe('00:00:00, 1st Only, Year 26');
    expect(at(reported(), twentyFiveYears - 2).fields.year).toBe(25);
  });
});

describe('a negative leap value takes a unit OUT, when the deficit reaches the threshold', () => {
  // 329 whole days a year, less 0.04 of a day: every 25th year is a day short.
  const cal = bucket({
    hierarchy: [
      { unit: 'year', multiplier: 329 * 86400 }, { unit: 'day', multiplier: 86400 },
      { unit: 'hour', multiplier: 3600 }, { unit: 'min', multiplier: 60 }, { unit: 'sec', multiplier: 1 }
    ],
    leap_logic: { drift_per_year_t: -3456, threshold_t: 86400, apply_to: 'day' }
  });
  it('ABSOLUTE: 24 full years, then the 25th loses its last day; 25 years is 8,224 days', () => {
    expect(at(cal, 24 * 329 * 86400).fields.year).toBe(25);
    expect(at(cal, 24 * 329 * 86400 - 1).fields.year).toBe(24);        // the first 24 are full length
    expect(at(cal, 8224 * 86400 - 1).fields.year).toBe(25);
    expect(at(cal, 8224 * 86400).formatted).toBe('00:00:00, 1st Only, Year 26');
    expect(at(cal, 8224 * 86400 - 1).fields.day).toBe(327);            // day 328 of a 328-day year
  });
  it('a fractional negative drift (the value that threw) behaves the same way', () => {
    const frac = bucket({ leap_logic: { drift_per_year_t: -3456.5, threshold_t: 86400, apply_to: 'day' } });
    expect(() => at(frac, 123456789)).not.toThrow();
    expect(at(frac, 0).formatted).toBe('00:00:00, 1st Only, Year 1');
  });
});

describe('nothing the editor\'s boxes can hold throws, hangs or prints NaN', () => {
  const NASTY: unknown[] = [1.62, 0.001, 0, -5, null, undefined, NaN, Infinity, '', '12', 'abc', 1e30];
  it('every unit length, drift and threshold, one nasty value at a time', () => {
    for (const v of NASTY) {
      for (const unit of ['year', 'day', 'hour', 'min', 'sec']) {
        const cal = bucket();
        (cal as any).hierarchy.find((u: any) => u.unit === unit).multiplier = v;
        const r = at(cal, 987654321);
        expect(r.formatted, `${unit}=${String(v)}`).not.toMatch(/NaN|undefined|t=\d+s/);
        for (const f of ['year', 'day', 'hour', 'min', 'sec', 'mday']) expect(Number.isFinite(Number(r.fields[f])), `${unit}=${String(v)} ${f}`).toBe(true);
      }
      for (const field of ['drift_per_year_t', 'threshold_t']) {
        const cal = bucket({ leap_logic: { drift_per_year_t: 3600, threshold_t: 86400, apply_to: 'day', [field]: v } });
        expect(at(cal, 987654321).formatted, `${field}=${String(v)}`).not.toMatch(/NaN|undefined|t=\d+s/);
      }
    }
  });
  it('a drift so negative the year would have no length is not run at all (and does not hang)', () => {
    const cal = bucket({ leap_logic: { drift_per_year_t: -1e12, threshold_t: 1, apply_to: 'day' } });
    const started = Date.now();
    expect(at(cal, 31536000 * 3 + 5).formatted).toBe('00:00:05, 1st Only, Year 4');
    expect(Date.now() - started).toBeLessThan(200);
  });
  it('blank months, fractional months, no tables, no format, a missing hierarchy', () => {
    expect(() => at(bucket({ lookup_tables: { months: [{ name: 'A', days: null }, { name: 'B', days: 27.41 }, { days: 400 }] } }), 86400 * 30)).not.toThrow();
    expect(at(bucket({ lookup_tables: { months: [{ name: 'A', days: 27.5 }, { name: 'B', days: 400 }] } }), 86400 * 28).fields.month).toBe('B');
    expect(() => at(bucket({ lookup_tables: undefined }), 5)).not.toThrow();
    expect(at(bucket({ format: undefined }), 5).formatted).toBe('');
    expect(() => at(bucket({ hierarchy: undefined }), 5)).not.toThrow();
    expect(() => at(bucket({ leap_logic: { leap_cycle: [0, -4, 2.5, NaN, 'x', 4] } }), 5)).not.toThrow();
  });
  it('the ratio form: a zero-second year, a blank, and digits toFixed would refuse', () => {
    const ratio = (parameters: unknown) => ({ id: 'R', math_type: 'RATIO_LINEAR', epoch_offset_t: '0', format: 'SD {val}', parameters }) as unknown as TemporalCalendarDefinition;
    expect(resolveCalendar(1000n, ratio({ units_per_earth_year: 1000, seconds_per_earth_year: 0, precision_digits: 1 })).formatted).toBe('SD 0.0');
    expect(resolveCalendar(1000n, ratio({ units_per_earth_year: 1000, seconds_per_earth_year: 1000, precision_digits: 500 })).formatted).toBe('SD 1000.000000');
    expect(resolveCalendar(1000n, ratio({ units_per_earth_year: null, seconds_per_earth_year: null, precision_digits: -3 })).formatted).toBe('SD 0');
    expect(() => resolveCalendar(1000n, ratio(undefined))).not.toThrow();
  });
  it('and behind all of it: a definition that cannot be read at all answers with the raw tick', () => {
    expect(resolveCalendar(42n, undefined as unknown as TemporalCalendarDefinition).formatted).toBe('t=42s');
  });
  it('wholeClockSeconds never throws (Settings shifts the clock by a calendar\'s year)', () => {
    expect(wholeClockSeconds(46043873.28)).toBe(46043873n);
    expect(wholeClockSeconds(null, 7n)).toBe(7n);
    expect(wholeClockSeconds('abc', 7n)).toBe(7n);
    expect(wholeClockSeconds(-3456.5)).toBe(-3456n);
  });
});

describe('a new calendar\'s zero is the big bang, and its dates are still dates', () => {
  // Year index ~1.4e10: a first guess one second a year out is 437 YEARS from the answer.
  const NOW = 435084632988264000n;
  const sane = (cal: TemporalCalendarDefinition) => {
    const a = resolveCalendar(NOW, cal).fields, b = resolveCalendar(NOW + 86400n, cal).fields;
    for (const f of [a, b]) {
      expect(Number(f.day)).toBeGreaterThanOrEqual(0);
      expect(Number(f.day)).toBeLessThan(367);
      expect(Number(f.hour)).toBeGreaterThanOrEqual(0);
      expect(Number(f.hour)).toBeLessThan(24);
    }
    // one day later is the next day of the same year, or the first day of the next
    const next = Number(b.year) === Number(a.year) ? Number(b.day) === Number(a.day) + 1 : Number(b.day) === 0 && Number(b.year) === Number(a.year) + 1;
    expect(next).toBe(true);
  };
  it('with an exact cycle that is not Gregorian\'s', () => sane(bucket({ epoch_offset_t: '0', leap_logic: { apply_to: 'day', leap_cycle: [5] } })));
  it('with a bucket whose drift does not divide its threshold', () => sane(bucket({ epoch_offset_t: '0', leap_logic: { drift_per_year_t: 20000, threshold_t: 86399, apply_to: 'day' } })));
  it('and the editor\'s own template format prints a day, not the token', () => {
    const cal = bucket({ format: '{hour:02}:{min:02}:{sec:02}, Day {day}, Year {year}' });
    expect(at(cal, 86400 * 9 + 3600).formatted).toBe('01:00:00, Day 10, Year 1');
  });
});

describe('a saved campaign carrying the reported calendar LOADS', () => {
  it('through ensureTemporalState, the clock strip\'s resolver and back out through the export', () => {
    applyTemporalRegistryConfig(JSON.parse(readFileSync('static/temporal/calendars.json', 'utf8')));
    const cal = reported({ drift_per_year_t: -5598.72, threshold_t: 139968, apply_to: 'day' });
    const saved: any = { id: 'm', name: 'm', systems: [], temporal: {
      masterTimeSec: (EPOCH + 5000000000n).toString(), displayTimeSec: (EPOCH + 5000000000n).toString(),
      activeCalendarKey: 'Kepler Time', temporal_registry: { 'Kepler Time': cal }, playbackRunning: false, playbackRateSecPerSec: 1 } };
    const loaded = ensureTemporalState(JSON.parse(JSON.stringify(saved)));
    expect(loaded.temporal!.activeCalendarKey).toBe('Kepler Time');
    const shown = resolveTemporalDisplay(loaded.temporal!);
    expect(shown.formatted).toMatch(/^\d\d:\d\d:\d\d, \d+(st|nd|rd|th) Only, Year \d+$/);
    expect(shown.formatted).not.toMatch(/NaN|t=\d+s/);
    // the GM's numbers are still the GM's: nothing was rounded, repaired or dropped on the way
    expect(temporalForExport(loaded.temporal)!.temporal_registry['Kepler Time']).toEqual(JSON.parse(JSON.stringify(cal)));
  });
});
