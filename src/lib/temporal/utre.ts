import type {
  BucketDrainCalendarDefinition,
  TemporalCalendarDefinition,
  TemporalState
} from '$lib/types';

export const BIG_BANG_TO_UNIX_EPOCH_T = 435084631200000000n;

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

export function unixMsToMasterSeconds(unixMs: number): bigint {
  return BIG_BANG_TO_UNIX_EPOCH_T + BigInt(Math.floor(unixMs / 1000));
}

export function resolveCalendar(masterSeconds: bigint, calendar: TemporalCalendarDefinition): ResolvedTemporal {
  if (calendar.math_type === 'RATIO_LINEAR') {
    return resolveRatioLinear(masterSeconds, calendar);
  }
  return resolveBucketDrain(masterSeconds, calendar);
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
  const epochOffset = parseClockSeconds(calendar.epoch_offset_t, 0n);
  const local = Number(masterSeconds - epochOffset);
  const unitsPerYear = calendar.parameters.units_per_earth_year;
  const secPerYear = calendar.parameters.seconds_per_earth_year;
  const precisionDigits = calendar.parameters.precision_digits ?? 1;
  const value = (local / secPerYear) * unitsPerYear;
  const rendered = value.toFixed(precisionDigits);
  return {
    formatted: calendar.format.replace('{val}', rendered),
    fields: { val: rendered }
  };
}

function resolveBucketDrain(masterSeconds: bigint, calendar: BucketDrainCalendarDefinition): ResolvedTemporal {
  const epochOffset = parseClockSeconds(calendar.epoch_offset_t, 0n);
  const localRaw = masterSeconds - epochOffset;
  const local = localRaw >= 0n ? localRaw : 0n;

  const hierarchy = [...calendar.hierarchy].sort((a, b) => b.multiplier - a.multiplier);
  const yearUnit = hierarchy.find((u) => u.unit === 'year');
  const dayUnit = hierarchy.find((u) => u.unit === 'day');
  const hourUnit = hierarchy.find((u) => u.unit === 'hour');
  const minUnit = hierarchy.find((u) => u.unit === 'min');
  const secUnit = hierarchy.find((u) => u.unit === 'sec');

  const fields: Record<string, string | number> = {};
  let working = local;

  if (yearUnit && calendar.leap_logic) {
    const rawYears = local / BigInt(yearUnit.multiplier);
    const totalDrift = rawYears * BigInt(calendar.leap_logic.drift_per_year_t);
    working = local - totalDrift;
  }

  for (const unit of hierarchy) {
    const divisor = BigInt(unit.multiplier);
    const value = working / divisor;
    working %= divisor;
    fields[unit.unit] = Number(value);
  }

  const dayOfYear = typeof fields.day === 'number' ? fields.day : 0;
  const months = calendar.lookup_tables?.months ?? [];
  let remaining = dayOfYear;
  let monthName = '';
  let dayInMonth = dayOfYear + 1;
  for (const month of months) {
    if (remaining < month.days) {
      monthName = month.name;
      dayInMonth = remaining + 1;
      break;
    }
    remaining -= month.days;
  }

  const dayMultiplier = BigInt(dayUnit?.multiplier ?? 86400);
  const weekdayIndex = Number((local / dayMultiplier) % 7n);
  const weekday = calendar.lookup_tables?.weekdays?.[weekdayIndex] ?? '';

  const year = typeof fields.year === 'number' ? fields.year + 1 : 1;
  const hour = typeof fields.hour === 'number' ? fields.hour : 0;
  const min = typeof fields.min === 'number' ? fields.min : 0;
  const sec = typeof fields.sec === 'number' ? fields.sec : 0;
  const suffix = ordinalSuffix(dayInMonth);

  const rendered = calendar.format
    .replace('{hour:02}', pad2(hour))
    .replace('{min:02}', pad2(min))
    .replace('{sec:02}', pad2(sec))
    .replace('{weekday}', weekday)
    .replace('{mday}', String(dayInMonth))
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
      hour_unit: hourUnit?.multiplier ?? 3600,
      min_unit: minUnit?.multiplier ?? 60,
      sec_unit: secUnit?.multiplier ?? 1
    }
  };
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
