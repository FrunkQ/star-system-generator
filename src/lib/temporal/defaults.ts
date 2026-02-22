import type { Starmap, TemporalState } from '$lib/types';
import { BIG_BANG_TO_UNIX_EPOCH_T, parseClockSeconds, unixMsToMasterSeconds } from '$lib/temporal/utre';

const YEAR_SECONDS = 31536000n;
const DEFAULT_AD_YEAR_OFFSET = 2000n;
const GREGORIAN_DEFAULT_EPOCH_OFFSET_T = BIG_BANG_TO_UNIX_EPOCH_T - (DEFAULT_AD_YEAR_OFFSET * YEAR_SECONDS);

export const BUILTIN_TEMPORAL_REGISTRY: TemporalState['temporal_registry'] = {
  gregorian_earth: {
    id: 'EARTH_GREG',
    math_type: 'BUCKET_DRAIN',
    epoch_offset_t: GREGORIAN_DEFAULT_EPOCH_OFFSET_T.toString(),
    format: '{hour:02}:{min:02}:{sec:02}, {weekday} {mday}{suffix} {month}, {year} AD',
    hierarchy: [
      { unit: 'year', multiplier: 31536000 },
      { unit: 'day', multiplier: 86400 },
      { unit: 'hour', multiplier: 3600 },
      { unit: 'min', multiplier: 60 },
      { unit: 'sec', multiplier: 1 }
    ],
    leap_logic: {
      drift_per_year_t: 20925,
      threshold_t: 86400,
      apply_to: 'day'
    },
    lookup_tables: {
      weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      months: [
        { name: 'January', days: 31 }, { name: 'February', days: 28 },
        { name: 'March', days: 31 }, { name: 'April', days: 30 },
        { name: 'May', days: 31 }, { name: 'June', days: 30 },
        { name: 'July', days: 31 }, { name: 'August', days: 31 },
        { name: 'September', days: 30 }, { name: 'October', days: 31 },
        { name: 'November', days: 30 }, { name: 'December', days: 31 }
      ]
    }
  },
  star_trek_stardate: {
    id: 'TNG_SD',
    math_type: 'RATIO_LINEAR',
    epoch_offset_t: BIG_BANG_TO_UNIX_EPOCH_T.toString(),
    format: 'Stardate {val}',
    parameters: {
      units_per_earth_year: 1000.0,
      seconds_per_earth_year: 31557600,
      precision_digits: 1
    }
  }
};

let runtimeTemporalRegistry: TemporalState['temporal_registry'] = JSON.parse(JSON.stringify(BUILTIN_TEMPORAL_REGISTRY));
let runtimeActiveCalendarKey = 'gregorian_earth';

type TemporalConfigPayload = {
  default_active_calendar_key?: string;
  temporal_registry?: TemporalState['temporal_registry'];
};

function getTemporalRegistryDefaults(): { registry: TemporalState['temporal_registry']; activeKey: string } {
  const registry = JSON.parse(JSON.stringify(runtimeTemporalRegistry));
  const keys = Object.keys(registry);
  const activeKey = runtimeActiveCalendarKey && registry[runtimeActiveCalendarKey]
    ? runtimeActiveCalendarKey
    : (keys[0] ?? 'gregorian_earth');
  return { registry, activeKey };
}

export async function loadTemporalRegistryConfig(url = '/temporal/calendars.json'): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Temporal config not loaded from ${url}: ${response.status} ${response.statusText}`);
      return;
    }
    const payload = (await response.json()) as TemporalConfigPayload;
    if (!payload?.temporal_registry || Object.keys(payload.temporal_registry).length === 0) {
      return;
    }
    runtimeTemporalRegistry = {
      ...JSON.parse(JSON.stringify(BUILTIN_TEMPORAL_REGISTRY)),
      ...payload.temporal_registry
    };
    if (
      payload.default_active_calendar_key &&
      runtimeTemporalRegistry[payload.default_active_calendar_key]
    ) {
      runtimeActiveCalendarKey = payload.default_active_calendar_key;
    } else if (!runtimeTemporalRegistry[runtimeActiveCalendarKey]) {
      runtimeActiveCalendarKey = Object.keys(runtimeTemporalRegistry)[0] ?? 'gregorian_earth';
    }
  } catch (error) {
    console.warn(`Failed to load temporal config from ${url}. Using built-in defaults.`, error);
  }
}

export function createDefaultTemporalState(epochMs?: number): TemporalState {
  const seedEpochMs = typeof epochMs === 'number' ? epochMs : Date.now();
  const startMaster = unixMsToMasterSeconds(seedEpochMs);
  const seed = startMaster.toString();
  const defaults = getTemporalRegistryDefaults();
  return {
    masterTimeSec: seed,
    displayTimeSec: seed,
    activeCalendarKey: defaults.activeKey,
    temporal_registry: defaults.registry
  };
}

export function ensureTemporalState(starmap: Starmap): Starmap {
  const firstEpochMs = starmap.systems?.[0]?.system?.epochT0 ?? Date.now();
  const existing = starmap.temporal;
  if (!existing) {
    return {
      ...starmap,
      temporal: createDefaultTemporalState(firstEpochMs)
    };
  }

  const defaults = getTemporalRegistryDefaults();
  const hasExistingRegistry = !!(existing.temporal_registry && Object.keys(existing.temporal_registry).length > 0);
  let registry = hasExistingRegistry
    ? (existing.temporal_registry as TemporalState['temporal_registry'])
    : defaults.registry;

  if (hasExistingRegistry) {
    const missingDefaultKeys = Object.keys(defaults.registry).filter((key) => !registry[key]);
    if (missingDefaultKeys.length > 0) {
      const merged = { ...registry };
      for (const key of missingDefaultKeys) {
        merged[key] = defaults.registry[key];
      }
      registry = merged;
    }
  }

  const gregorian = registry.gregorian_earth;
  const runtimeGregorian = defaults.registry.gregorian_earth;
  const runtimeGregorianEpochOffset = runtimeGregorian && runtimeGregorian.math_type === 'BUCKET_DRAIN'
    ? runtimeGregorian.epoch_offset_t
    : GREGORIAN_DEFAULT_EPOCH_OFFSET_T.toString();
  const shouldMigrateGregorianEpoch =
    gregorian &&
    gregorian.math_type === 'BUCKET_DRAIN' &&
    gregorian.epoch_offset_t === BIG_BANG_TO_UNIX_EPOCH_T.toString();
  if (shouldMigrateGregorianEpoch) {
    registry = {
      ...registry,
      gregorian_earth: {
        ...gregorian,
        epoch_offset_t: runtimeGregorianEpochOffset
      }
    };
  }

  const master = parseClockSeconds(existing.masterTimeSec, unixMsToMasterSeconds(firstEpochMs));
  const display = parseClockSeconds(existing.displayTimeSec, master);
  const activeCalendarKey = existing.activeCalendarKey && registry[existing.activeCalendarKey]
    ? existing.activeCalendarKey
    : defaults.activeKey;

  const normalized: TemporalState = {
    masterTimeSec: master.toString(),
    displayTimeSec: display.toString(),
    activeCalendarKey,
    temporal_registry: registry
  };

  if (
    normalized.masterTimeSec === existing.masterTimeSec &&
    normalized.displayTimeSec === existing.displayTimeSec &&
    normalized.activeCalendarKey === existing.activeCalendarKey &&
    normalized.temporal_registry === existing.temporal_registry
  ) {
    return starmap;
  }

  return { ...starmap, temporal: normalized };
}

export function updateDisplayBySeconds(temporal: TemporalState, deltaSec: bigint): TemporalState {
  const current = parseClockSeconds(temporal.displayTimeSec, 0n);
  return { ...temporal, displayTimeSec: (current + deltaSec).toString() };
}

export function setMasterToDisplay(temporal: TemporalState): TemporalState {
  return { ...temporal, masterTimeSec: temporal.displayTimeSec };
}
