// STEP THE CLOCK BY AN EXACT AMOUNT, IN THE CAMPAIGN CALENDAR'S OWN UNITS (engine map UI-C24).
//
// A user, on Discord: *"a forward ticker that moves the time forward by X amount then stops ... if
// I want to go forward exactly one month."* The transport could play, and jog, but not ARRIVE: there
// was no way to move the clock by a stated amount.
//
// TWO KINDS OF UNIT, and the difference is the whole design:
//
//  - A FIXED unit is a length the calendar states outright - its own second, minute, hour and day
//    (`hierarchy[].multiplier`), or a ratio calendar's own counting unit. Stepping by one is
//    arithmetic. These are the CALENDAR'S lengths, never Earth's: on a world whose day is 139,968
//    seconds, "1 day" is 139,968 seconds.
//
//  - A MONTH or a YEAR is not a length at all. February is not March, a leap year is not a common
//    one, and an invented calendar can make a year 328.96 of its days. So these are stepped by
//    DATE: "the same day of the month, one month on, at the same time of day", clamped to the last
//    day when the target month is shorter (31 January + 1 month is the last day of February).
//
// THE RESOLVER IS THE ONLY AUTHORITY ON WHAT DATE AN INSTANT IS. Nothing here knows how long a
// month is, when a leap unit lands or which month it lands in - re-deriving any of that would be a
// second copy of `resolveBucketDrain`, and the two would part on the first calendar that surprised
// one of them. Instead the date steps WALK, a calendar day at a time, asking `resolveCalendar` what
// date each instant is. That is a few dozen resolves for a month and a few hundred for a year
// (about 14 microseconds each, measured), whatever the count, and it is right for any calendar the
// resolver can render - including ones nobody has written yet.
//
// TOTAL OVER ANYTHING A GM CAN TYPE, the same promise the resolver makes (calendarSafety.spec): a
// hostile calendar gets `null` (no step) after a bounded number of looks, never a hang or a throw.
import { resolveCalendar } from './utre';
import type { TemporalCalendarDefinition } from '$lib/types';

export type ClockStepKind = 'fixed' | 'month' | 'year';
export interface ClockStepUnit {
  /** 'sec' | 'min' | 'hour' | 'day' | 'month' | 'year' | 'unit' (a ratio calendar's own count). */
  id: string;
  /** Plural, lower case, for "Step by 3 <label>". */
  label: string;
  kind: ClockStepKind;
  /** FIXED units only: the unit's length in clock seconds, as the calendar states it. */
  seconds?: number;
}

const FIXED_LABELS: Record<string, string> = { sec: 'seconds', min: 'minutes', hour: 'hours', day: 'days' };
/** The most date-walking one call may do, in calendar days looked at. A guard, not a budget. */
const MAX_LOOKS = 40_000;
/** ...and the most QUESTIONS it may ask, answered from memory or not. A loop that never reaches a
 *  new day never trips the first guard: past 2^53 `k++` leaves `k` where it was, so a year of a
 *  quadrillion days span the same remembered day for ever. That hung the first run of the gate. */
const MAX_ASKS = 400_000;
/** The largest whole count a month step takes: each month is a walk, so this bounds the click. */
export const MAX_MONTH_STEPS = 1200;

const positive = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function hierarchySeconds(calendar: TemporalCalendarDefinition, unit: string): number | null {
  if (calendar.math_type !== 'BUCKET_DRAIN' || !Array.isArray(calendar.hierarchy)) return null;
  return positive(calendar.hierarchy.find((u) => u && u.unit === unit)?.multiplier);
}

/**
 * The units this calendar can honestly be stepped by, smallest first. A unit the calendar does not
 * define is not offered: no months without a month table, nothing but its own count for a ratio
 * calendar (a stardate has no day to step by), and seconds alone when there is no calendar at all.
 */
export function clockStepUnits(calendar: TemporalCalendarDefinition | null | undefined): ClockStepUnit[] {
  if (!calendar) return [{ id: 'sec', label: 'seconds', kind: 'fixed', seconds: 1 }];
  if (calendar.math_type === 'RATIO_LINEAR') {
    const perYear = positive(calendar.parameters?.units_per_earth_year);
    const secPerYear = positive(calendar.parameters?.seconds_per_earth_year);
    return perYear && secPerYear ? [{ id: 'unit', label: 'units', kind: 'fixed', seconds: secPerYear / perYear }] : [];
  }
  const out: ClockStepUnit[] = [];
  for (const id of ['sec', 'min', 'hour', 'day']) {
    const seconds = hierarchySeconds(calendar, id);
    if (seconds) out.push({ id, label: FIXED_LABELS[id], kind: 'fixed', seconds });
  }
  const day = hierarchySeconds(calendar, 'day');
  const year = hierarchySeconds(calendar, 'year');
  const months = (calendar.lookup_tables?.months ?? []).filter((m) => m && positive(m.days));
  // One month is the year under another name; a step by it would be the year step twice.
  if (day && months.length >= 2) out.push({ id: 'month', label: 'months', kind: 'month' });
  if (day && year) out.push({ id: 'year', label: 'years', kind: 'year' });
  return out;
}

interface DateKey { year: number; month: string; mday: number; day: number; tod: number; clock: string; }

/**
 * The instant `count` units from `current`, or null when it cannot be worked out. `count` may be
 * negative (a step back) and, for FIXED units, fractional (half a day); months and years take whole
 * numbers and anything else is truncated toward zero.
 */
export function stepClockSeconds(
  current: bigint,
  calendar: TemporalCalendarDefinition | null | undefined,
  unitId: string,
  count: number
): bigint | null {
  try {
    if (!Number.isFinite(count) || count === 0) return null;
    const unit = clockStepUnits(calendar).find((u) => u.id === unitId);
    if (!unit) return null;
    if (unit.kind === 'fixed') {
      const delta = Math.round(count * (unit.seconds as number));
      return Number.isSafeInteger(delta) && delta !== 0 ? current + BigInt(delta) : null;
    }
    const whole = Math.trunc(count);
    if (whole === 0 || !calendar) return null;
    return unit.kind === 'month' ? stepByDate(current, calendar, 'month', whole) : stepByDate(current, calendar, 'year', whole);
  } catch {
    return null;
  }
}

function stepByDate(current: bigint, calendar: TemporalCalendarDefinition, kind: 'month' | 'year', count: number): bigint | null {
  const dayLen = hierarchySeconds(calendar, 'day');
  if (!dayLen) return null;
  if (kind === 'month' && Math.abs(count) > MAX_MONTH_STEPS) return null;

  // Every instant looked at is `current` plus a WHOLE number of calendar days, computed from the
  // base each time so a fractional day length cannot accumulate a rounding drift across the walk.
  const seen = new Map<number, DateKey>();
  let looks = 0, asks = 0;
  const instant = (k: number) => current + BigInt(Math.round(k * dayLen));
  const at = (k: number): DateKey => {
    // A day count that is not an exact integer cannot be walked from: `k + 1` may be `k`.
    if (!Number.isSafeInteger(k) || !Number.isSafeInteger(Math.round(k * dayLen)) || ++asks > MAX_ASKS) {
      throw new Error('calendar step: walk exceeded its guard');
    }
    const hit = seen.get(k);
    if (hit) return hit;
    if (++looks > MAX_LOOKS) throw new Error('calendar step: walk exceeded its guard');
    const f = resolveCalendar(instant(k), calendar).fields;
    const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const key: DateKey = {
      year: num(f.year), month: String(f.month ?? ''), mday: num(f.mday), day: num(f.day),
      // Seconds into the calendar's own day, from the calendar's own hour, minute and second.
      tod: num(f.hour) * num(f.hour_unit) + num(f.min) * num(f.min_unit) + num(f.sec) * num(f.sec_unit),
      clock: `${num(f.hour)}:${num(f.min)}:${num(f.sec)}`
    };
    seen.set(k, key);
    return key;
  };
  const sameMonth = (a: DateKey, b: DateKey) => a.year === b.year && a.month === b.month;

  const start = at(0);
  const wantDay = start.mday;
  let k = 0;

  // Having arrived somewhere in a month, settle on the wanted day of it - or its last day, when
  // the month is too short to have one. `from` says which end of the month `k` arrived at.
  const settleInMonth = (from: 'first' | 'last') => {
    const month = at(k);
    if (from === 'first') while (at(k).mday < wantDay && sameMonth(at(k + 1), month)) k++;
    else while (at(k).mday > wantDay && sameMonth(at(k - 1), month)) k--;
  };

  if (kind === 'month') {
    const dir = count > 0 ? 1 : -1;
    for (let i = 0; i < Math.abs(count); i++) {
      const here = at(k);
      do { k += dir; } while (sameMonth(at(k), here));
      // Forward, that is the next month's first day; backward, the previous month's last.
      settleInMonth(dir > 0 ? 'first' : 'last');
    }
  } else {
    const yearLen = hierarchySeconds(calendar, 'year');
    if (!yearLen) return null;
    const targetYear = start.year + count;
    // A first guess from the calendar's plain year. Leap units put it a few days out at most, and
    // the walk below settles it; the guard is what stops absurd data, not this estimate.
    k = Math.round((count * yearLen) / dayLen);
    while (at(k).year < targetYear) k++;
    while (at(k).year > targetYear) k--;
    // Back to the first day of the target year: the day-of-year says how far, and the two short
    // walks after it put right whatever a year that turns over mid-day leaves one day out.
    k -= Math.max(0, Math.floor(at(k).day));
    while (at(k).year < targetYear) k++;
    while (at(k - 1).year === targetYear) k--;
    if (start.month) {
      // The same named month. A year that has no such month (authored data can do that) leaves
      // the walk on the year's last day rather than wandering into the next.
      while (at(k).month !== start.month && at(k + 1).year === targetYear) k++;
      if (at(k).month === start.month) settleInMonth('first');
    } else {
      // No month table: the same day of the year, or the year's last day if it is shorter.
      while (at(k).day < start.day && at(k + 1).year === targetYear) k++;
    }
  }

  // THE SAME TIME OF DAY. Whole days keep it within a year, but a year that is not a whole number
  // of days (328.96 of them, say) turns over part-way through one, so the clock time on the far
  // side has shifted. Put it back, provided that does not push the result onto another date. The
  // clock counts whole seconds and a calendar's own second need not be one (1.62, on that world),
  // so the shift is tried a second or two either side until the read-out matches to the second.
  let result = instant(k);
  const landed = at(k);
  const shift = Math.round(start.tod - landed.tod);
  if (landed.clock !== start.clock && Number.isSafeInteger(shift)) {
    for (const nudge of [0, 1, -1, 2, -2]) {
      const candidate = result + BigInt(shift + nudge);
      const f = resolveCalendar(candidate, calendar).fields;
      const sameDate = Number(f.year) === landed.year && String(f.month ?? '') === landed.month && Number(f.mday) === landed.mday;
      if (sameDate && `${Number(f.hour)}:${Number(f.min)}:${Number(f.sec)}` === start.clock) { result = candidate; break; }
    }
  }
  return result === current ? null : result;
}
