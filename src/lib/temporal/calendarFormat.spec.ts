// B113(a) — A DATE ON A REPORT IS THE CAMPAIGN'S DATE, NOT GREGORIAN'S.
//
// The report rendered `new Date(system.epochT0).getFullYear()`, so a GM who had switched the
// campaign to Stardate or Haab still got a Gregorian year on the printed paper. Reproduced live on
// beta v3.0.258: the clock strip read "00:00:00, Monday 1st January, 2323 AD" while the report's
// Epoch cell read "2025" for the same campaign.
//
// The rule this pins is that there is ONE path from a wall-clock instant to a campaign date. Run
// with `formatInstantMs` deleted and every case here is a compile error; run with it returning the
// Gregorian year instead and the absolute-string cases go red.
import { describe, it, expect } from 'vitest';
import { formatInstantMs, activeCalendarOf, unixMsToMasterSeconds, resolveCalendar } from './utre';
import type { TemporalCalendarDefinition, TemporalState } from '$lib/types';

const GREGORIAN: TemporalCalendarDefinition = {
  id: 'EARTH_GREG',
  math_type: 'BUCKET_DRAIN',
  epoch_offset_t: '435084559692049800',
  format: '{hour:02}:{min:02}:{sec:02}, {weekday} {mday}{suffix} {month}, {year} AD',
  hierarchy: [
    { unit: 'year', multiplier: 31536000 },
    { unit: 'day', multiplier: 86400 },
    { unit: 'hour', multiplier: 3600 },
    { unit: 'min', multiplier: 60 },
    { unit: 'sec', multiplier: 1 }
  ],
  leap_logic: { drift_per_year_t: 20925, threshold_t: 86400, apply_to: 'day' },
  lookup_tables: {
    weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    months: [
      { name: 'January', days: 31 }, { name: 'February', days: 28 }, { name: 'March', days: 31 },
      { name: 'April', days: 30 }, { name: 'May', days: 31 }, { name: 'June', days: 30 },
      { name: 'July', days: 31 }, { name: 'August', days: 31 }, { name: 'September', days: 30 },
      { name: 'October', days: 31 }, { name: 'November', days: 30 }, { name: 'December', days: 31 }
    ]
  }
} as unknown as TemporalCalendarDefinition;

const STARDATE: TemporalCalendarDefinition = {
  id: 'TNG_SD',
  math_type: 'RATIO_LINEAR',
  epoch_offset_t: '435084632967250575',
  format: 'Stardate {val}',
  parameters: { units_per_earth_year: 1000.0, seconds_per_earth_year: 31557600, precision_digits: 1 }
} as unknown as TemporalCalendarDefinition;

/** The epoch stamped on every bundled map — the exact value the live report showed as "2025". */
const BUNDLED_EPOCH_MS = 1_762_339_146_908;

describe('formatInstantMs — one path from an instant to a campaign date', () => {
  it('renders a non-Gregorian calendar in its own reckoning, not as a Gregorian year', () => {
    const label = formatInstantMs(BUNDLED_EPOCH_MS, STARDATE);
    // ABSOLUTE (PHY-34), and derived independently rather than copied off the code: Stardate zero
    // is 2026-01-01T06:56:15Z, this instant is 2025-11-05T10:39:06Z, so it sits 4,911,429 s BEFORE
    // zero; at 1000 units per 31,557,600 s that is -155.6. Nothing about that number comes from
    // running the formatter.
    expect(label).toBe('Stardate -155.6');
    // The fault, stated as an assertion: the old code produced this and it must not come back.
    expect(label).not.toBe(String(new Date(BUNDLED_EPOCH_MS).getFullYear()));
    expect(label).not.toContain('2025');
  });

  it('renders the shipped Gregorian calendar to its exact published string', () => {
    // What THIS build produces for the bundled epoch. It is 297 years wrong in real terms - that
    // is G62's fault, not B113(a)'s - and it is pinned here deliberately so the anchor fix has
    // something to move. The real instant is 2025-11-05T10:39:06Z, a Wednesday.
    expect(formatInstantMs(BUNDLED_EPOCH_MS, GREGORIAN)).toBe(
      '03:42:51, Sunday 5th November, 2322 AD'
    );
    expect(new Date(BUNDLED_EPOCH_MS).getUTCFullYear()).toBe(2025);
  });

  it('reproduces the string the shipped app puts on screen, character for character', () => {
    // ABSOLUTE, and the strongest kind available here: this exact sentence was READ OFF the running
    // app at starsystemx.com (v3.0.164) and beta.starsystemx.com (v3.0.258) on 2026-09-01, for the
    // default seed clock. It is an observation of the product, not of this code.
    const SEED_MASTER = 435084632967250575n; // STARTDATE_EPOCH_OFFSET_T, the default campaign seed
    expect(resolveCalendar(SEED_MASTER, GREGORIAN).formatted).toBe(
      '00:00:00, Monday 1st January, 2323 AD'
    );
  });

  it('is the same answer as spelling the two-step idiom out by hand', () => {
    const byHand = resolveCalendar(unixMsToMasterSeconds(BUNDLED_EPOCH_MS), GREGORIAN).formatted;
    expect(formatInstantMs(BUNDLED_EPOCH_MS, GREGORIAN)).toBe(byHand);
  });

  it('returns null - never a Gregorian guess - when there is no calendar', () => {
    expect(formatInstantMs(BUNDLED_EPOCH_MS, undefined)).toBeNull();
    expect(formatInstantMs(BUNDLED_EPOCH_MS, null)).toBeNull();
  });

  it('returns null for an instant that is not a number', () => {
    expect(formatInstantMs(Number.NaN, GREGORIAN)).toBeNull();
    expect(formatInstantMs(Number.POSITIVE_INFINITY, GREGORIAN)).toBeNull();
  });
});

describe('activeCalendarOf', () => {
  const state = {
    masterTimeSec: '0', displayTimeSec: '0',
    activeCalendarKey: 'Star Trek Stardate',
    temporal_registry: { 'Star Trek Stardate': STARDATE, 'Earth Gregorian': GREGORIAN },
    playbackRunning: false, playbackRateSecPerSec: 1
  } as unknown as TemporalState;

  it('picks the calendar the campaign is actually running on', () => {
    expect(activeCalendarOf(state)?.id).toBe('TNG_SD');
  });

  it('is undefined rather than a default when the state names nothing usable', () => {
    expect(activeCalendarOf(undefined)).toBeUndefined();
    expect(activeCalendarOf(null)).toBeUndefined();
    expect(activeCalendarOf({ ...state, activeCalendarKey: 'Nonexistent' })).toBeUndefined();
  });
});
