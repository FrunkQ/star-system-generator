import type { Starmap, TemporalState } from '$lib/types';
import { parseClockSeconds, unixMsToMasterSeconds } from '$lib/temporal/utre';

export const STARTDATE_EPOCH_OFFSET_T = 435084632967250575n;

const FALLBACK_CALENDAR_KEY = 'Default Linear';
const FALLBACK_TEMPORAL_REGISTRY: TemporalState['temporal_registry'] = {
  [FALLBACK_CALENDAR_KEY]: {
    id: 'DEFAULT_LINEAR',
    math_type: 'RATIO_LINEAR',
    epoch_offset_t: STARTDATE_EPOCH_OFFSET_T.toString(),
    format: 't+{val}s',
    parameters: {
      units_per_earth_year: 31557600,
      seconds_per_earth_year: 31557600,
      precision_digits: 0
    }
  }
};

let runtimeTemporalRegistry: TemporalState['temporal_registry'] = JSON.parse(JSON.stringify(FALLBACK_TEMPORAL_REGISTRY));
let runtimeActiveCalendarKey = FALLBACK_CALENDAR_KEY;

type TemporalConfigPayload = {
  default_active_calendar_key?: string;
  temporal_registry?: TemporalState['temporal_registry'];
};

function cloneRegistry(registry: TemporalState['temporal_registry']): TemporalState['temporal_registry'] {
  return JSON.parse(JSON.stringify(registry));
}

function getTemporalRegistryDefaults(): { registry: TemporalState['temporal_registry']; activeKey: string } {
  const registry = cloneRegistry(runtimeTemporalRegistry);
  const keys = Object.keys(registry);
  const activeKey = runtimeActiveCalendarKey && registry[runtimeActiveCalendarKey]
    ? runtimeActiveCalendarKey
    : (keys[0] ?? FALLBACK_CALENDAR_KEY);
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

    runtimeTemporalRegistry = cloneRegistry(payload.temporal_registry);

    if (
      payload.default_active_calendar_key &&
      runtimeTemporalRegistry[payload.default_active_calendar_key]
    ) {
      runtimeActiveCalendarKey = payload.default_active_calendar_key;
    } else {
      runtimeActiveCalendarKey = Object.keys(runtimeTemporalRegistry)[0] ?? FALLBACK_CALENDAR_KEY;
    }
  } catch (error) {
    console.warn(`Failed to load temporal config from ${url}. Using built-in fallback.`, error);
  }
}

export function createDefaultTemporalState(epochMs?: number): TemporalState {
  const seed = typeof epochMs === 'number'
    ? unixMsToMasterSeconds(epochMs)
    : STARTDATE_EPOCH_OFFSET_T;
  const defaults = getTemporalRegistryDefaults();
  return {
    masterTimeSec: seed.toString(),
    displayTimeSec: seed.toString(),
    activeCalendarKey: defaults.activeKey,
    temporal_registry: defaults.registry,
    playbackRunning: false,
    playbackRateSecPerSec: 1
  };
}

export function createAnchoredTemporalState(): TemporalState {
  return createDefaultTemporalState();
}

function normalizeRegistryAliasesById(
  registry: TemporalState['temporal_registry'],
  defaults: TemporalState['temporal_registry']
): { registry: TemporalState['temporal_registry']; changed: boolean } {
  const byId = new Map<string, string>();
  Object.entries(defaults).forEach(([key, calendar]) => {
    if (calendar?.id) byId.set(calendar.id, key);
  });

  let changed = false;
  let working = { ...registry };

  Object.entries(registry).forEach(([key, calendar]) => {
    const canonicalKey = calendar?.id ? byId.get(calendar.id) : undefined;
    if (!canonicalKey || canonicalKey === key) return;
    if (working[canonicalKey]) {
      delete working[key];
      changed = true;
      return;
    }
    working = {
      ...working,
      [canonicalKey]: calendar
    };
    delete working[key];
    changed = true;
  });

  return { registry: working, changed };
}

function resolveActiveCalendarKey(
  existing: NonNullable<Starmap['temporal']>,
  registry: TemporalState['temporal_registry'],
  defaultKey: string
): string {
  if (existing.activeCalendarKey && registry[existing.activeCalendarKey]) {
    return existing.activeCalendarKey;
  }

  const existingActive = existing.activeCalendarKey
    ? existing.temporal_registry?.[existing.activeCalendarKey]
    : undefined;
  if (existingActive?.id) {
    const match = Object.entries(registry).find(([, cal]) => cal.id === existingActive.id);
    if (match) return match[0];
  }

  if (registry[defaultKey]) return defaultKey;
  return Object.keys(registry)[0] ?? defaultKey;
}

export function ensureTemporalState(starmap: Starmap): Starmap {
  const firstEpochMs = starmap.systems?.[0]?.system?.epochT0 ?? Date.now();
  const existing = starmap.temporal;
  if (!existing) {
    return {
      ...starmap,
      temporal: createAnchoredTemporalState()
    };
  }

  const defaults = getTemporalRegistryDefaults();
  const hasExistingRegistry = !!(existing.temporal_registry && Object.keys(existing.temporal_registry).length > 0);
  let registry = hasExistingRegistry
    ? (existing.temporal_registry as TemporalState['temporal_registry'])
    : defaults.registry;
  let changed = false;

  if (hasExistingRegistry) {
    const missingDefaultKeys = Object.keys(defaults.registry).filter((key) => !registry[key]);
    if (missingDefaultKeys.length > 0) {
      const merged = { ...registry };
      for (const key of missingDefaultKeys) {
        merged[key] = defaults.registry[key];
      }
      registry = merged;
      changed = true;
    }
  }

  const aliasNormalized = normalizeRegistryAliasesById(registry, defaults.registry);
  if (aliasNormalized.changed) {
    registry = aliasNormalized.registry;
    changed = true;
  }

  const hasLegacyMissingTimeCodes = !existing.masterTimeSec || !existing.displayTimeSec;
  const fallbackMaster = hasLegacyMissingTimeCodes
    ? STARTDATE_EPOCH_OFFSET_T
    : unixMsToMasterSeconds(firstEpochMs);
  const master = parseClockSeconds(existing.masterTimeSec, fallbackMaster);
  const display = parseClockSeconds(existing.displayTimeSec, master);
  const activeCalendarKey = resolveActiveCalendarKey(existing, registry, defaults.activeKey);

  const normalized: TemporalState = {
    masterTimeSec: master.toString(),
    displayTimeSec: display.toString(),
    activeCalendarKey,
    temporal_registry: registry,
    playbackRunning: existing.playbackRunning ?? false,
    playbackRateSecPerSec: existing.playbackRateSecPerSec ?? 1
  };

  if (
    !changed &&
    normalized.masterTimeSec === existing.masterTimeSec &&
    normalized.displayTimeSec === existing.displayTimeSec &&
    normalized.activeCalendarKey === existing.activeCalendarKey &&
    normalized.playbackRunning === existing.playbackRunning &&
    normalized.playbackRateSecPerSec === existing.playbackRateSecPerSec &&
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
