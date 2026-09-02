// G62 — THE STAKE IN THE SAND.
//
// Owner: "The main clock is 'seconds from big bang' but we need a genuine stake in the sand to the
// gregorian calendar... a common reference to ground the calendars so <tick> = 12:00:00 on
// 1/Sept/26 or stardate or whatever. I put in a correction number to try and do this but I am not
// sure it works entirely as planned."
//
// WHAT THE CORRECTION NUMBERS ACTUALLY DID, measured before any of them was touched. Three of the
// four shipped calendars disagreed with the code anchor, each by a DIFFERENT amount, because each
// carried an independent absolute `epoch_offset_t` and nothing tied them together:
//
//   Earth Gregorian     zero at 297 BC    - should be 1 AD    -> 297 years early
//   Mayan Haab          zero at 3408 BC   - should be 3114 BC -> 294 years early
//   Chinese Lunisolar   zero at 2553 BC   - should be 2697 BC -> 144 years LATE
//   Star Trek Stardate  zero at 2026-01-01T06:56:15Z          -> correct
//
// That is why the shipped app showed "00:00:00, Monday 1st January, 2323 AD" for a clock seeded at
// what the code believed was 1 January 2026.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  calendarEpochOffset,
  anchorUnixEpochMasterSeconds,
  resolveCalendar,
  setRuntimeTemporalAnchor,
  getRuntimeTemporalAnchor,
  unixMsToMasterSeconds,
  DEFAULT_TEMPORAL_ANCHOR
} from './utre';
import type { TemporalAnchor, TemporalCalendarDefinition } from '$lib/types';
import {
  applyTemporalRegistryConfig,
  ensureTemporalState,
  createDefaultTemporalState,
  defaultCampaignStartSeconds
} from './defaults';

const SHIPPED = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'static/temporal/calendars.json'), 'utf8')
) as {
  temporal_anchor: TemporalAnchor;
  temporal_registry: Record<string, TemporalCalendarDefinition>;
};

const ANCHOR = SHIPPED.temporal_anchor;
const GREG = SHIPPED.temporal_registry['Earth Gregorian'];

/** The owner's own stake, and the acceptance sentence for this item. */
const STAKE = '2026-09-01T12:00:00Z';

function renderAt(iso: string, calendar: TemporalCalendarDefinition, anchor = ANCHOR): string {
  const unixSec = BigInt(Math.floor(Date.parse(iso) / 1000));
  const master = (anchorUnixEpochMasterSeconds(anchor) as bigint) + unixSec;
  return resolveCalendar(master, calendar).formatted;
}

describe('G62 — the anchor is DATA, and it is the only reference', () => {
  it('the shipped registry carries an anchor', () => {
    expect(ANCHOR).toBeTruthy();
    expect(ANCHOR.master_t).toBe('435084631200000000');
    expect(ANCHOR.utc).toBe('1970-01-01T00:00:00Z');
  });

  it('every shipped calendar states its zero as a real instant, so none holds its own opinion', () => {
    for (const [key, cal] of Object.entries(SHIPPED.temporal_registry)) {
      expect(cal.epoch_utc, `${key} must declare epoch_utc`).toBeTruthy();
      expect(Number.isFinite(Date.parse(cal.epoch_utc as string)), `${key} epoch_utc parses`).toBe(true);
    }
  });

  // THE ACCEPTANCE SENTENCE. ABSOLUTE (PHY-34): a fixed string the owner named, not a comparison.
  it('the stake reads exactly: 12:00:00 on 1 September 2026', () => {
    expect(renderAt(STAKE, GREG)).toBe('12:00:00, Tuesday 1st September, 2026 AD');
  });

  it('1 September 2026 really was a Tuesday', () => {
    // The weekday above is not taken on trust from the engine's own day-count.
    expect(new Date(STAKE).getUTCDay()).toBe(2); // 0=Sunday, so 2=Tuesday
  });

  it('real dates land on their real years - the 297-year error is gone', () => {
    // Mid-year instants, deliberately: this model carries no leap DAY (see the wobble test), so a
    // midnight-on-1-January probe can land either side of a year boundary for reasons that have
    // nothing to do with the anchor. The 297-year fault being pinned here would move all of these.
    for (const [iso, year] of [
      ['2026-06-15T12:00:00Z', '2026'],
      ['2000-06-15T12:00:00Z', '2000'],
      ['1970-06-15T12:00:00Z', '1970'],
      ['1900-06-15T12:00:00Z', '1900']
    ] as const) {
      expect(renderAt(iso, GREG), iso).toContain(year + ' AD');
    }
  });

  // THE MECHANISM, stated as the behaviour that proves it: ONE reference, everything derives.
  it('moving the anchor moves every shipped calendar together', () => {
    const shifted: TemporalAnchor = { ...ANCHOR, utc: '1970-01-01T01:00:00Z' }; // anchor an hour later
    const before = Object.values(SHIPPED.temporal_registry).map((c) =>
      calendarEpochOffset(c, ANCHOR)
    );
    const after = Object.values(SHIPPED.temporal_registry).map((c) =>
      calendarEpochOffset(c, shifted)
    );
    // Same master tick, anchor moved one hour: EVERY calendar's zero moves by the same 3600 s.
    for (let i = 0; i < before.length; i++) {
      expect(after[i] - before[i], `calendar ${i}`).toBe(-3600n);
    }
  });

  it('a calendar with no epoch_utc keeps its own stored offset - a GM reckoning is the GM\'s', () => {
    const gmOwn = { ...GREG, epoch_utc: undefined, epoch_offset_t: '123456789' };
    expect(calendarEpochOffset(gmOwn as TemporalCalendarDefinition, ANCHOR)).toBe(123456789n);
  });

  it('a malformed anchor falls back to the built-in rather than placing campaigns at random', () => {
    expect(anchorUnixEpochMasterSeconds({ master_t: 'not-a-number', utc: ANCHOR.utc })).toBeNull();
    expect(anchorUnixEpochMasterSeconds({ master_t: ANCHOR.master_t, utc: 'never' })).toBeNull();
    expect(anchorUnixEpochMasterSeconds(undefined)).toBeNull();
  });
});

describe('G62 — the runtime anchor carries wall-clock conversion with it', () => {
  it('unixMsToMasterSeconds follows the anchor the build is running', () => {
    try {
      setRuntimeTemporalAnchor(ANCHOR);
      const base = unixMsToMasterSeconds(0);
      setRuntimeTemporalAnchor({ ...ANCHOR, utc: '1970-01-01T00:01:00Z' });
      expect(unixMsToMasterSeconds(0)).toBe(base - 60n);
    } finally {
      setRuntimeTemporalAnchor(DEFAULT_TEMPORAL_ANCHOR);
    }
  });

  it('a rejected anchor leaves the default standing', () => {
    try {
      setRuntimeTemporalAnchor({ master_t: 'rubbish', utc: 'also rubbish' });
      expect(getRuntimeTemporalAnchor()).toEqual(DEFAULT_TEMPORAL_ANCHOR);
    } finally {
      setRuntimeTemporalAnchor(DEFAULT_TEMPORAL_ANCHOR);
    }
  });
});

describe('G62 - what this calendar can and cannot promise', () => {
  it('states the REAL Gregorian leap rule, and its bucket agrees with it on the mean year', () => {
    const leap = (GREG as any).leap_logic;
    const Y = (GREG as any).hierarchy.find((u: any) => u.unit === 'year').multiplier;
    // A89: the exact rule, as data. [4, 100, 400] is "every 4th year, except every 100th, except
    // every 400th" - 97 leap days per 400 years - and it REPLACES the drift bucket, which is a
    // straight line through a staircase and lands a day out in 224 of 801 years however it is tuned.
    expect(leap.leap_cycle).toEqual([4, 100, 400]);
    expect(leap.leap_month).toBe('February');
    expect(leap.apply_to).toBe('day');
    expect(leap.threshold_t).toBe(86400);
    // The bucket no longer drives Gregorian, but it must still DESCRIBE the same year or the two
    // halves of one record would disagree: 365 d + 20952 s is the mean Gregorian year, and it is
    // exactly what the cycle produces (365 + 97/400 days).
    expect(Y + leap.drift_per_year_t).toBe(31_556_952);
    expect(Y + (86400 * 97) / 400).toBe(31_556_952);
  });

  // A89 TURNED A BOUND INTO AN EQUALITY. This used to assert "within a day of reality across
  // 1900-2100", because the model had NO LEAP DAY - it smeared the surplus evenly across the year,
  // which kept the mean right and made noon render as 06:33. With `leap_cycle` wired, the calendar
  // IS the proleptic Gregorian one, and the sweep says so rather than a tolerance.
  it('is exactly the proleptic Gregorian calendar, swept across four centuries', () => {
    const MONTHS = (GREG as any).lookup_tables.months.map((m: any) => m.name);
    const WEEKDAYS = (GREG as any).lookup_tables.weekdays;
    let samples = 0;
    const wrong: string[] = [];
    // An awkward stride and a non-midnight start, deliberately: a sweep on whole days at midnight
    // would never exercise the hour/min/sec buckets or land inside 29 February.
    for (let t = Date.UTC(1800, 0, 1, 7, 13, 29); t <= Date.UTC(2200, 0, 1); t += 86400000 * 11 + 3600000) {
      const d = new Date(t);
      const rendered = renderAt(d.toISOString(), GREG);
      const m = rendered.match(/^(\d{2}):(\d{2}):(\d{2}), (\w+) (\d+)\w\w (\w+), (\d+) AD$/);
      if (!m) { wrong.push('unparsed: ' + rendered); continue; }
      const [, hh, mm, ss, weekday, mday, month, year] = m;
      const okDate = Number(year) === d.getUTCFullYear()
        && MONTHS.indexOf(month) === d.getUTCMonth()
        && Number(mday) === d.getUTCDate()
        && `${hh}:${mm}:${ss}` === d.toISOString().slice(11, 19);
      // The weekday is checked against the PLATFORM's, not against the engine's own day count -
      // an independent authority, which is what makes this an absolute anchor (PHY-34).
      const okWeekday = WEEKDAYS[(d.getUTCDay() + 6) % 7] === weekday;
      if (!okDate || !okWeekday) wrong.push(d.toISOString() + ' -> ' + rendered);
      samples++;
    }
    expect(samples).toBeGreaterThan(13000);
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it('29 February exists in a leap year and does not in a common one', () => {
    expect(renderAt('2024-02-29T06:00:00Z', GREG)).toBe('06:00:00, Thursday 29th February, 2024 AD');
    // 2100 is divisible by 4 but NOT a leap year - the century rule the drift bucket could not state.
    expect(renderAt('2100-03-01T00:00:00Z', GREG)).toBe('00:00:00, Monday 1st March, 2100 AD');
    // 2000 IS a leap year, because of the 400 rule.
    expect(renderAt('2000-02-29T00:00:00Z', GREG)).toBe('00:00:00, Tuesday 29th February, 2000 AD');
  });
});

describe('G62 - an old save picks up the corrected epoch', () => {
  it('a campaign carrying the pre-anchor Gregorian adopts the shipped one, by id', () => {
    applyTemporalRegistryConfig(SHIPPED as any);
    const stale = {
      ...structuredClone(GREG),
      epoch_offset_t: '435084559692049800',   // the 297-years-early value every real save carries
      leap_logic: { drift_per_year_t: 20925, threshold_t: 86400, apply_to: 'day' }
    } as any;
    delete stale.epoch_utc;

    const starmap: any = {
      systems: [],
      temporal: {
        masterTimeSec: '1', displayTimeSec: '1',
        activeCalendarKey: 'Earth Gregorian',
        temporal_registry: { 'Earth Gregorian': stale }
      }
    };
    const out = ensureTemporalState(starmap);
    const loaded: any = out.temporal!.temporal_registry['Earth Gregorian'];
    expect(loaded.epoch_utc).toBe((GREG as any).epoch_utc);
    expect(loaded.leap_logic.drift_per_year_t).toBe(20952);
    // and it picks up the real rule, which is the half that actually fixes its dates
    expect(loaded.leap_logic.leap_cycle).toEqual([4, 100, 400]);
    // ...and the campaign now names the stake correctly, which is the point of adopting it.
    expect(renderAt(STAKE, loaded)).toBe('12:00:00, Tuesday 1st September, 2026 AD');
  });

  it("a GM's OWN calendar is not touched - a different id keeps its own zero", () => {
    applyTemporalRegistryConfig(SHIPPED as any);
    const mine = { ...structuredClone(GREG), id: 'THOUSAND_SUNS', epoch_offset_t: '999', } as any;
    delete mine.epoch_utc;
    const starmap: any = {
      systems: [],
      temporal: {
        masterTimeSec: '1', displayTimeSec: '1',
        activeCalendarKey: 'Thousand Suns',
        temporal_registry: { 'Thousand Suns': mine }
      }
    };
    const loaded: any = ensureTemporalState(starmap).temporal!.temporal_registry['Thousand Suns'];
    expect(loaded.epoch_offset_t).toBe('999');
    expect(loaded.epoch_utc).toBeUndefined();
  });
});

describe('G62 - a new campaign starts on the stake, not on a number nobody can name', () => {
  it("the default clock IS the anchor's stake instant", () => {
    applyTemporalRegistryConfig(SHIPPED as any);
    const expected = BigInt(SHIPPED.temporal_anchor.master_t) +
      BigInt(Date.parse(SHIPPED.temporal_anchor.stake_utc as string) / 1000);
    expect(defaultCampaignStartSeconds()).toBe(expected);
  });

  it("so a fresh campaign opens reading the owner's own sentence", () => {
    applyTemporalRegistryConfig(SHIPPED as any);
    const fresh = createDefaultTemporalState();
    const cal = fresh.temporal_registry[fresh.activeCalendarKey];
    expect(resolveCalendar(BigInt(fresh.displayTimeSec), cal).formatted)
      .toBe('12:00:00, Tuesday 1st September, 2026 AD');
    // master and display start together - a new campaign is not already scrubbed away from itself.
    expect(fresh.masterTimeSec).toBe(fresh.displayTimeSec);
  });
});

describe("G62 - the number in the editor is the number the engine uses", () => {
  it('every shipped calendar stores the offset its epoch_utc derives to', () => {
    // The Epoch Offset field in the calendar editor binds straight to `epoch_offset_t`. When the
    // engine derives the offset from `epoch_utc` and the stored value says something else, that
    // field shows a number that is both WRONG and INERT - which is exactly what shipped in the
    // first cut of this work: 435084559692049800, 297 years stale, sitting in the editor.
    for (const [key, cal] of Object.entries(SHIPPED.temporal_registry)) {
      const derived = calendarEpochOffset(cal, SHIPPED.temporal_anchor);
      expect(cal.epoch_offset_t, key).toBe(derived.toString());
    }
  });

  it("a GM's own epoch survives a reload - adoption never overwrites what they typed", () => {
    applyTemporalRegistryConfig(SHIPPED as any);
    // Exactly what the editor produces when someone types in the Epoch Offset field: the value is
    // theirs, the derivation is dropped, and the calendar is flagged as authored.
    const theirs: any = { ...structuredClone(GREG), epoch_offset_t: '435084500000000000',
                          epoch_gm_authored: true };
    delete theirs.epoch_utc;
    const starmap: any = {
      systems: [],
      temporal: { masterTimeSec: '1', displayTimeSec: '1', activeCalendarKey: 'Earth Gregorian',
                  temporal_registry: { 'Earth Gregorian': theirs } }
    };
    const loaded: any = ensureTemporalState(starmap).temporal!.temporal_registry['Earth Gregorian'];
    expect(loaded.epoch_offset_t).toBe('435084500000000000');
    expect(loaded.epoch_utc).toBeUndefined();
  });
});
