import type {
  BucketDrainCalendarDefinition,
  TemporalAnchor,
  TemporalCalendarDefinition,
  TemporalState
} from '$lib/types';

/**
 * The built-in stake in the sand, and the ONLY reason it is still a constant: something has to
 * answer before `calendars.json` has been fetched (server-side render, a unit test, the fallback
 * registry). `static/temporal/calendars.json` carries the real one as `temporal_anchor` and it wins
 * wherever it has been loaded - see `anchorMasterSeconds` and G62.
 */
export const BIG_BANG_TO_UNIX_EPOCH_T = 435084631200000000n;

export const DEFAULT_TEMPORAL_ANCHOR: TemporalAnchor = {
  master_t: BIG_BANG_TO_UNIX_EPOCH_T.toString(),
  utc: '1970-01-01T00:00:00Z'
};

/**
 * G62 - the anchor read as a single number: master-clock seconds at the UNIX epoch. Everything that
 * converts between wall time and the master clock goes through this one value, so an anchor that
 * moves takes every calendar with it.
 *
 * Returns null for an anchor that does not parse, so a malformed one falls back to the built-in
 * rather than silently placing every campaign somewhere arbitrary.
 */
export function anchorUnixEpochMasterSeconds(anchor: TemporalAnchor | null | undefined): bigint | null {
  if (!anchor?.master_t || !anchor?.utc) return null;
  const utcMs = Date.parse(anchor.utc);
  if (!Number.isFinite(utcMs)) return null;
  let masterAtUtc: bigint;
  try {
    masterAtUtc = BigInt(anchor.master_t);
  } catch {
    return null;
  }
  // master at the unix epoch = master at the anchor instant, less that instant's unix seconds.
  return masterAtUtc - BigInt(Math.floor(utcMs / 1000));
}

/**
 * G62 - a calendar's zero on the master clock, DERIVED from the anchor whenever the calendar states
 * its zero as a real instant (`epoch_utc`).
 *
 * This is the whole mechanism. Four shipped calendars used to carry four independent absolute
 * `epoch_offset_t` values with nothing tying them to each other or to the anchor, and three of the
 * four were wrong by three DIFFERENT amounts (Gregorian 297 years early, Mayan 294 early, Chinese
 * 144 late) precisely because nothing could have noticed. A calendar that states `epoch_utc` cannot
 * drift from the anchor because it no longer holds an opinion of its own.
 *
 * A calendar with no `epoch_utc` - a GM's own, or one from a save written before this - keeps its
 * stored `epoch_offset_t` untouched. That is deliberate: the GM's reckoning is the GM's.
 */
export function calendarEpochOffset(
  calendar: TemporalCalendarDefinition,
  anchor: TemporalAnchor | null | undefined = runtimeAnchor
): bigint {
  const stored = parseClockSeconds(calendar.epoch_offset_t, 0n);
  if (!calendar.epoch_utc) return stored;
  const zeroMs = Date.parse(calendar.epoch_utc);
  if (!Number.isFinite(zeroMs)) return stored;
  const unixEpochMaster = anchorUnixEpochMasterSeconds(anchor) ?? BIG_BANG_TO_UNIX_EPOCH_T;
  return unixEpochMaster + BigInt(Math.floor(zeroMs / 1000));
}

const FALLBACK_DISPLAY_FORMAT = 't={master_t}s';

export type ResolvedTemporal = {
  formatted: string;
  fields: Record<string, string | number>;
};

export function parseClockSeconds(value: string | number | bigint | undefined, fallback = 0n): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string') {
    try {
      return BigInt(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/**
 * G62 - the anchor this build is actually running on. `applyTemporalRegistryConfig` sets it from
 * `calendars.json`; until then (SSR, a unit test, a failed fetch) it is the built-in default. It is
 * module state for the same reason the shipped registry is: the resolver is called from dozens of
 * places that have no business knowing where the anchor came from.
 */
let runtimeAnchor: TemporalAnchor = DEFAULT_TEMPORAL_ANCHOR;

export function setRuntimeTemporalAnchor(anchor: TemporalAnchor | null | undefined): void {
  runtimeAnchor = anchorUnixEpochMasterSeconds(anchor) === null
    ? DEFAULT_TEMPORAL_ANCHOR
    : (anchor as TemporalAnchor);
}

export function getRuntimeTemporalAnchor(): TemporalAnchor {
  return runtimeAnchor;
}

/** Master-clock seconds at the unix epoch, on the anchor this build is running. */
export function anchorMasterSeconds(): bigint {
  return anchorUnixEpochMasterSeconds(runtimeAnchor) ?? BIG_BANG_TO_UNIX_EPOCH_T;
}

export function unixMsToMasterSeconds(unixMs: number): bigint {
  return anchorMasterSeconds() + BigInt(Math.floor(unixMs / 1000));
}

/** The inverse, for surfaces that need to hand a master tick back to wall time. */
export function masterSecondsToUnixMs(masterSeconds: bigint): number {
  return Number(masterSeconds - anchorMasterSeconds()) * 1000;
}

/**
 * THE one way to put a wall-clock instant on the campaign's calendar.
 *
 * Every surface that shows a date for a unix-epoch millisecond value goes through here: the ship
 * log, the companion app's clock readout, and — since B113(a) — the printed report. It existed as a
 * two-line idiom spelled out at each call site (`resolveCalendar(unixMsToMasterSeconds(ms), cal)`),
 * which is how the report came to render `new Date(epochT0).getFullYear()` instead: there was
 * nothing to reuse, so it invented Gregorian.
 *
 * Returns null rather than a string when there is no calendar or the instant is not a number, so a
 * caller keeps its OWN no-calendar fallback — a ship log wants an ISO stamp, a clock strip wants a
 * human sentence, and unifying those would change two shipped surfaces for no reason. What must not
 * differ, and now cannot, is the calendar path itself.
 */
export function formatInstantMs(
  unixMs: number,
  calendar: TemporalCalendarDefinition | undefined | null
): string | null {
  if (!calendar) return null;
  if (!Number.isFinite(unixMs)) return null;
  try {
    return resolveCalendar(unixMsToMasterSeconds(unixMs), calendar).formatted;
  } catch {
    return null;
  }
}

/** The active calendar of a temporal state, or undefined when the state cannot name one. */
export function activeCalendarOf(
  temporal: TemporalState | null | undefined
): TemporalCalendarDefinition | undefined {
  if (!temporal) return undefined;
  return temporal.temporal_registry?.[temporal.activeCalendarKey];
}

/**
 * NO CALENDAR A GM CAN TYPE MAY TAKE THE APP DOWN. This is called from the clock strip on every
 * tick and from a dozen other surfaces, so a throw here is not one broken label - it is every
 * frame, for ever, including on the next load of the campaign that carries the calendar (found
 * live, 2026-09-12: a custom second of 1.62 Earth seconds "completely bricks sse"). The arithmetic
 * below is written to be total over whatever the editor's number boxes can hold; this is the last
 * line behind it, and it answers with the raw tick rather than nothing.
 */
export function resolveCalendar(masterSeconds: bigint, calendar: TemporalCalendarDefinition): ResolvedTemporal {
  try {
    if (calendar.math_type === 'RATIO_LINEAR') {
      return resolveRatioLinear(masterSeconds, calendar);
    }
    return resolveBucketDrain(masterSeconds, calendar);
  } catch (error) {
    warnBrokenCalendar(calendar, error);
    return {
      formatted: FALLBACK_DISPLAY_FORMAT.replace('{master_t}', masterSeconds.toString()),
      fields: { master_t: masterSeconds.toString() }
    };
  }
}

const warnedCalendars = new Set<string>();
function warnBrokenCalendar(calendar: TemporalCalendarDefinition | undefined, error: unknown): void {
  const key = String((calendar as { id?: string } | undefined)?.id ?? '?');
  if (warnedCalendars.has(key)) return;
  warnedCalendars.add(key);
  console.warn(`[calendar] '${key}' could not be resolved - showing the raw clock instead.`, error);
}

// ── AUTHORED NUMBERS INTO EXACT ARITHMETIC ───────────────────────────────────────────────────────
// The clock is a BigInt count of seconds and a calendar's unit lengths are whatever a GM typed into
// a number box: 1.62 (a world whose second is not ours), 28422144.5, a blank (null), a minus sign.
// `BigInt(1.62)` THROWS - that one call was the whole of the brick. So every authored length goes
// through `ticks`, and the arithmetic runs in THOUSANDTHS of a second: a fractional unit is then
// exact to the millisecond, and a whole-second calendar gives bit-for-bit the answer it always did
// (every division is of two numbers scaled by the same thousand).
const TICKS_PER_SECOND = 1000n;
/** A unit LENGTH in ticks: finite and at least one tick, else the fallback (whole seconds). */
function ticks(value: unknown, fallbackSeconds: number): bigint {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return BigInt(fallbackSeconds) * TICKS_PER_SECOND;
  const t = BigInt(Math.round(Math.min(n, 1e18) * 1000));
  return t > 0n ? t : 1n;
}
/** A SIGNED amount in ticks (a drift may be negative: a year shorter than its whole days). */
function signedTicks(value: unknown): bigint {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return 0n;
  return BigInt(Math.round(Math.max(-1e18, Math.min(1e18, n)) * 1000));
}

export function resolveTemporalDisplay(state: TemporalState): ResolvedTemporal {
  const calendar = state.temporal_registry[state.activeCalendarKey];
  const master = parseClockSeconds(state.displayTimeSec, 0n);
  if (!calendar) {
    return {
      formatted: FALLBACK_DISPLAY_FORMAT.replace('{master_t}', master.toString()),
      fields: { master_t: master.toString() }
    };
  }
  return resolveCalendar(master, calendar);
}

function resolveRatioLinear(masterSeconds: bigint, calendar: Extract<TemporalCalendarDefinition, { math_type: 'RATIO_LINEAR' }>): ResolvedTemporal {
  const epochOffset = calendarEpochOffset(calendar);
  const local = Number(masterSeconds - epochOffset);
  const unitsPerYear = Number(calendar.parameters?.units_per_earth_year);
  const secPerYear = Number(calendar.parameters?.seconds_per_earth_year);
  // toFixed THROWS outside 0..100 and a blanked box binds null: hold the digits to what the editor
  // offers, and a year of zero or no seconds to a value that divides.
  const digitsRaw = Number(calendar.parameters?.precision_digits ?? 1);
  const precisionDigits = Number.isFinite(digitsRaw) ? Math.max(0, Math.min(6, Math.trunc(digitsRaw))) : 1;
  const value = Number.isFinite(secPerYear) && secPerYear !== 0 && Number.isFinite(unitsPerYear)
    ? (local / secPerYear) * unitsPerYear
    : 0;
  const rendered = (Number.isFinite(value) ? value : 0).toFixed(precisionDigits);
  return {
    formatted: String(calendar.format ?? '').replace('{val}', rendered),
    fields: { val: rendered }
  };
}

function resolveBucketDrain(masterSeconds: bigint, calendar: BucketDrainCalendarDefinition): ResolvedTemporal {
  const epochOffset = calendarEpochOffset(calendar);
  // Everything below is in TICKS (thousandths of a second) - see `ticks` above.
  const local = (masterSeconds - epochOffset) * TICKS_PER_SECOND;

  const UNIT_FALLBACK_SECONDS: Record<string, number> = { year: 31536000, day: 86400, hour: 3600, min: 60, sec: 1 };
  const hierarchy = (Array.isArray(calendar.hierarchy) ? calendar.hierarchy : [])
    .filter((u) => u && typeof u.unit === 'string')
    .map((u) => ({ unit: u.unit, multiplier: u.multiplier, len: ticks(u.multiplier, UNIT_FALLBACK_SECONDS[u.unit] ?? 1) }))
    .sort((a, b) => (a.len === b.len ? 0 : a.len > b.len ? -1 : 1));
  const yearUnit = hierarchy.find((u) => u.unit === 'year');
  const dayUnit = hierarchy.find((u) => u.unit === 'day');
  const hourUnit = hierarchy.find((u) => u.unit === 'hour');
  const minUnit = hierarchy.find((u) => u.unit === 'min');
  const secUnit = hierarchy.find((u) => u.unit === 'sec');

  const fields: Record<string, string | number> = {};

  // A89: THE BUCKET AND THE DRAIN. `drift_per_year_t` surplus seconds accumulate; when the bucket
  // reaches `threshold_t` a whole unit of `apply_to` is inserted into that year and the threshold
  // drains. So a year is a plain `yearUnit.multiplier` long, sometimes plus one leap unit - and the
  // CLOCK TIME never moves, which is the point. The previous model spread the surplus evenly across
  // every second of the year, which kept the mean right and made noon render as 06:33.
  const dayLen = dayUnit?.len ?? 86400n * TICKS_PER_SECOND;
  const yearLen = yearUnit?.len ?? 31536000n * TICKS_PER_SECOND;
  const leap = calendar.leap_logic;
  const driftPerYear = signedTicks(leap?.drift_per_year_t);
  const thresholdT = signedTicks(leap?.threshold_t);
  const leapUnit = hierarchy.find((u) => u.unit === (leap?.apply_to ?? 'day'));
  const leapUnitLen = leapUnit?.len ?? dayLen;
  // A NEGATIVE drift is a real statement - a year a little SHORTER than its whole days, so now and
  // then one unit is taken out rather than put in - and the bucket arithmetic below already says it
  // (floor of a negative product). It was silently ignored. What cannot run is a drain with no
  // threshold, or a correction so large the average year would have no length left.
  const leapsRun = driftPerYear !== 0n && thresholdT > 0n
    && yearLen * thresholdT + driftPerYear * leapUnitLen > 0n;

  // TWO WAYS TO SAY "SOMETIMES A YEAR IS LONGER", and a calendar picks the one it can state.
  // A CYCLE is exact and is what a real calendar has: [4, 100, 400] reads "every 4th year, except
  // every 100th, except every 400th". A BUCKET approximates a fractional year by accumulating a
  // surplus - the right answer for an invented reckoning, and the only thing available before this.
  // The bucket CANNOT reproduce a cycle: measured over 1600-2400, a single accumulator lands a day
  // out in 224 of 801 years whatever starting fill it is given, because it is a straight line
  // through a staircase.
  const leapCycle = (Array.isArray(leap?.leap_cycle) ? (leap?.leap_cycle ?? []) : [])
    .map((d) => Math.trunc(Number(d))).filter((d) => Number.isFinite(d) && d >= 1).slice(0, 8);
  const cycleRuns = leapCycle.length > 0;

  /** Leap units inserted across the years BEFORE year n (n may be negative). */
  const leapsBefore = (n: bigint): bigint => {
    if (cycleRuns) {
      let total = 0n;
      for (let i = 0; i < leapCycle.length; i++) {
        const term = floorDiv(n, BigInt(leapCycle[i]));
        total += i % 2 === 0 ? term : -term;
      }
      return total;
    }
    if (!leapsRun) return 0n;
    // A negative bucket fills and drains exactly as a positive one does, and what drains is a unit
    // taken OUT: the mirror image, so the short year is the one in which the deficit reaches the
    // threshold (the 25th, for a year 0.04 of a day short) rather than the very first.
    return driftPerYear > 0n
      ? floorDiv(n * driftPerYear, thresholdT)
      : -floorDiv(n * -driftPerYear, thresholdT);
  };
  /** Seconds consumed by every year before year n. */
  const secondsBefore = (n: bigint): bigint => n * yearLen + leapsBefore(n) * leapUnitLen;

  // THE FIRST GUESS IS THE EXACT MEAN YEAR, AS A FRACTION. It has to be: a new calendar's zero is
  // the big bang, so the year index is ~1.4e10, and a mean that is a second out per year lands 437
  // YEARS from the answer - far outside the eight steps below, which then left a negative remainder
  // and a garbage date. (The cycle form assumed Gregorian's 97/400 whatever the cycle said; the
  // bucket form truncated its division.) num/den is the mean year exactly: for a cycle, over the
  // product of its divisors; for a bucket, over the threshold.
  let meanNum = yearLen, meanDen = 1n;
  if (cycleRuns) {
    let span = 1n;
    for (const d of leapCycle) span *= BigInt(d);
    let leapsInSpan = 0n;
    leapCycle.forEach((d, i) => { const per = span / BigInt(d); leapsInSpan += i % 2 === 0 ? per : -per; });
    meanNum = yearLen * span + leapsInSpan * leapUnitLen; meanDen = span;
  } else if (leapsRun) {
    meanNum = yearLen * thresholdT + driftPerYear * leapUnitLen; meanDen = thresholdT;
  }
  let yearIndex = meanNum > 0n ? floorDiv(local * meanDen, meanNum) : floorDiv(local, yearLen);
  // The guess is exact to within the calendar's own irregularity, so this settles in a step or two;
  // the bound is a guard against absurd authored data rather than an expected cost, and it is what
  // makes this loop impossible to hang whatever the numbers are.
  for (let guard = 0; guard < 8 && secondsBefore(yearIndex) > local; guard++) yearIndex -= 1n;
  for (let guard = 0; guard < 8 && secondsBefore(yearIndex + 1n) <= local; guard++) yearIndex += 1n;

  const isLeapYear = leapsBefore(yearIndex + 1n) > leapsBefore(yearIndex);
  let working = local - secondsBefore(yearIndex);
  fields.year = Number(yearIndex);

  for (const unit of hierarchy) {
    if (unit.unit === 'year') continue;
    fields[unit.unit] = Number(floorDiv(working, unit.len));
    working = floorMod(working, unit.len);
  }

  const dayOfYear = typeof fields.day === 'number' ? fields.day : 0;
  const months = Array.isArray(calendar.lookup_tables?.months) ? (calendar.lookup_tables?.months ?? []) : [];
  // The inserted unit lands in a NAMED month - February, for Earth - so every date after it keeps
  // its number. Appending it to the year instead would push 1 March to the 2nd and leave the extra
  // day hanging off the end of the month table with no name at all.
  const leapMonthName = leap?.leap_month ?? months[months.length - 1]?.name;
  let remaining = dayOfYear;
  let monthName = '';
  let dayInMonth = dayOfYear + 1;
  for (const month of months) {
    // A month may be any length a GM types, fractions and blanks included; a blank is no days.
    const authoredDays = Number(month?.days);
    const days = (Number.isFinite(authoredDays) && authoredDays > 0 ? authoredDays : 0)
      + (isLeapYear && month?.name === leapMonthName ? Number(leapUnitLen / dayLen) : 0);
    if (remaining < days) {
      monthName = String(month?.name ?? '');
      dayInMonth = Math.floor(remaining) + 1;
      break;
    }
    remaining -= days;
  }

  const weekdayList = Array.isArray(calendar.lookup_tables?.weekdays) ? (calendar.lookup_tables?.weekdays ?? []) : [];
  const weekdayCycle = weekdayList.length > 0 ? BigInt(weekdayList.length) : 7n;
  const weekdayIndex = Number(floorMod(floorDiv(local, dayLen), weekdayCycle));
  const weekday = weekdayList[weekdayIndex] ?? '';

  const yearBase = Number.isFinite(calendar.year_offset) ? Number(calendar.year_offset) : 0;
  const year = typeof fields.year === 'number' ? fields.year + 1 + yearBase : 1 + yearBase;
  const hour = typeof fields.hour === 'number' ? fields.hour : 0;
  const min = typeof fields.min === 'number' ? fields.min : 0;
  const sec = typeof fields.sec === 'number' ? fields.sec : 0;
  const suffix = ordinalSuffix(dayInMonth);

  const rendered = String(calendar.format ?? '')
    .replace('{hour:02}', pad2(hour))
    .replace('{min:02}', pad2(min))
    .replace('{sec:02}', pad2(sec))
    .replace('{weekday}', weekday)
    .replace('{mday}', String(dayInMonth))
    // The editor's own template for a new calendar says "Day {day}", and nothing replaced it.
    .replace('{day}', String(dayOfYear + 1))
    .replace('{suffix}', suffix)
    .replace('{month}', monthName)
    .replace('{year}', String(year));

  return {
    formatted: rendered,
    fields: {
      year,
      day: dayOfYear,
      month: monthName,
      mday: dayInMonth,
      suffix,
      weekday,
      hour,
      min,
      sec,
      master_t: masterSeconds.toString(),
      leap_year: isLeapYear ? 1 : 0,
      hour_unit: hourUnit?.multiplier ?? 3600,
      min_unit: minUnit?.multiplier ?? 60,
      sec_unit: secUnit?.multiplier ?? 1
    }
  };
}

/** An authored number as WHOLE clock seconds, for callers that shift the clock by a calendar's
 *  unit (Settings' year control). Never throws: `BigInt(1.5)` and `BigInt(null)` both do. */
export function wholeClockSeconds(value: unknown, fallback = 0n): bigint {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? BigInt(Math.round(Math.max(-1e18, Math.min(1e18, n)))) : fallback;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function ordinalSuffix(value: number): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return 'st';
  if (mod10 === 2 && mod100 !== 12) return 'nd';
  if (mod10 === 3 && mod100 !== 13) return 'rd';
  return 'th';
}

function floorDiv(a: bigint, b: bigint): bigint {
  if (b === 0n) return 0n;
  const q = a / b;
  const r = a % b;
  if (r !== 0n && ((r > 0n) !== (b > 0n))) {
    return q - 1n;
  }
  return q;
}

function floorMod(a: bigint, b: bigint): bigint {
  if (b === 0n) return 0n;
  const m = a % b;
  return m < 0n ? m + (b < 0n ? -b : b) : m;
}
