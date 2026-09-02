import type { Starmap, TemporalAnchor, TemporalState } from '$lib/types';
import {
  parseClockSeconds,
  unixMsToMasterSeconds,
  setRuntimeTemporalAnchor,
  getRuntimeTemporalAnchor
} from '$lib/temporal/utre';
import { sameAsShipped } from '$lib/io/shippedDefaults';

/**
 * G62 - WHERE A NEW CAMPAIGN'S CLOCK STARTS, derived from the anchor rather than written down twice.
 *
 * This was the literal `435084632967250575n`, which is also the Star Trek Stardate calendar's
 * `epoch_offset_t` in `calendars.json` - the same number in two places, meaning two different
 * things, with nothing to keep them together. It is now the stake in the sand itself: a new
 * campaign starts at the instant the anchor names, so the default map opens on a date the GM
 * recognises instead of one that has to be explained.
 *
 * It is a FUNCTION rather than a constant because the anchor is data and can move; a constant
 * evaluated at module load would freeze whatever the fallback anchor said.
 */
export function defaultCampaignStartSeconds(): bigint {
  const anchor = getRuntimeTemporalAnchor();
  const stakeMs = Date.parse(anchor.stake_utc ?? anchor.utc);
  if (!Number.isFinite(stakeMs)) return unixMsToMasterSeconds(Date.parse(DEFAULT_STAKE_UTC));
  return unixMsToMasterSeconds(stakeMs);
}

/** Used only when the anchor names no stake at all - keeps the seed a real, nameable date. */
const DEFAULT_STAKE_UTC = '2026-09-01T12:00:00Z';

const FALLBACK_CALENDAR_KEY = 'Default Linear';
const FALLBACK_TEMPORAL_REGISTRY: TemporalState['temporal_registry'] = {
  [FALLBACK_CALENDAR_KEY]: {
    id: 'DEFAULT_LINEAR',
    math_type: 'RATIO_LINEAR',
    epoch_offset_t: '435084632967250575',
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
  /** G62: the stake in the sand. Adopted before the registry, because the registry derives from it. */
  temporal_anchor?: TemporalAnchor;
  temporal_registry?: TemporalState['temporal_registry'];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidCalendarDefinition(calendar: unknown): calendar is TemporalState['temporal_registry'][string] {
  if (!calendar || typeof calendar !== 'object') return false;
  const c = calendar as any;
  if (typeof c.id !== 'string' || !c.id) return false;
  if (typeof c.epoch_offset_t !== 'string') return false;
  if (typeof c.format !== 'string') return false;
  if (c.math_type === 'RATIO_LINEAR') {
    return !!(
      c.parameters &&
      isFiniteNumber(c.parameters.units_per_earth_year) &&
      isFiniteNumber(c.parameters.seconds_per_earth_year)
    );
  }
  if (c.math_type === 'BUCKET_DRAIN') {
    return Array.isArray(c.hierarchy) && c.hierarchy.length > 0;
  }
  return false;
}

function sanitizeTemporalRegistry(
  registry: TemporalState['temporal_registry'],
  defaults: TemporalState['temporal_registry']
): TemporalState['temporal_registry'] {
  const cleaned: TemporalState['temporal_registry'] = {};
  Object.entries(registry || {}).forEach(([key, value]) => {
    if (isValidCalendarDefinition(value)) cleaned[key] = value;
  });
  if (Object.keys(cleaned).length === 0) return defaults;
  const originalKeys = Object.keys(registry || {});
  const cleanedKeys = Object.keys(cleaned);
  if (
    originalKeys.length === cleanedKeys.length &&
    cleanedKeys.every((key) => (registry as any)?.[key] === cleaned[key])
  ) {
    return registry;
  }
  return cleaned;
}

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

/**
 * Adopt a parsed calendars.json as THIS BUILD'S shipped library. Split out from the fetch below so
 * the shipped set is reachable without a browser: B112 has to be able to ask "is this calendar one
 * of ours?", and a rule that can only be exercised behind `typeof window !== 'undefined'` cannot be
 * gated at all. The fetch is the only caller in the app; tests are the other.
 */
export function applyTemporalRegistryConfig(payload: TemporalConfigPayload | null | undefined): void {
  // G62: the anchor is adopted FIRST and independently of the registry, because every calendar's
  // epoch is derived from it - adopting calendars against the old anchor and then moving it would
  // place them all, briefly, somewhere nobody chose.
  if (payload?.temporal_anchor) setRuntimeTemporalAnchor(payload.temporal_anchor);

  if (!payload?.temporal_registry || Object.keys(payload.temporal_registry).length === 0) return;

  runtimeTemporalRegistry = cloneRegistry(payload.temporal_registry);

  if (
    payload.default_active_calendar_key &&
    runtimeTemporalRegistry[payload.default_active_calendar_key]
  ) {
    runtimeActiveCalendarKey = payload.default_active_calendar_key;
  } else {
    runtimeActiveCalendarKey = Object.keys(runtimeTemporalRegistry)[0] ?? FALLBACK_CALENDAR_KEY;
  }
}

export async function loadTemporalRegistryConfig(url = '/temporal/calendars.json'): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Temporal config not loaded from ${url}: ${response.status} ${response.statusText}`);
      return;
    }
    applyTemporalRegistryConfig((await response.json()) as TemporalConfigPayload);
  } catch (error) {
    console.warn(`Failed to load temporal config from ${url}. Using built-in fallback.`, error);
  }
}

/**
 * B112 — the SAVE view of a campaign's clock: the calendars the GM added or altered, and nothing
 * else. Every real starmap on record carries all four shipped calendars as though the GM had
 * written them, so a reader cannot tell a bespoke reckoning from an ordinary save.
 *
 * `activeCalendarKey` is kept whichever calendar it names, shipped or not: WHICH reckoning a
 * campaign runs on is the GM's decision even when the calendar itself is ours. `ensureTemporalState`
 * merges the shipped set back in on load and already resolves an active key that is missing, so an
 * old file and a new one of the same campaign arrive at the same state.
 */
export function temporalForExport(temporal: TemporalState | undefined): TemporalState | undefined {
  if (!temporal) return temporal;
  const shipped = getTemporalRegistryDefaults().registry;
  const registry: TemporalState['temporal_registry'] = {};
  for (const [key, calendar] of Object.entries(temporal.temporal_registry ?? {})) {
    if (!sameAsShipped(calendar, shipped[key])) registry[key] = calendar;
  }
  return { ...temporal, temporal_registry: registry };
}

export function createDefaultTemporalState(epochMs?: number): TemporalState {
  const seed = typeof epochMs === 'number'
    ? unixMsToMasterSeconds(epochMs)
    : defaultCampaignStartSeconds();
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

/**
 * G62 - A SHIPPED CALENDAR'S EPOCH BELONGS TO THE APP, NOT TO THE SAVE.
 *
 * The four calendars this build ships were carrying epoch offsets that put three of them centuries
 * away from the anchor, and every real save on record carries a COPY of all four. Without this, a
 * campaign saved before the anchor landed would keep rendering dates 297 years out for ever, and -
 * because its copy no longer matches the shipped set - B112's delta would write the whole app
 * library back into the file on the next save, undoing that work too.
 *
 * So a calendar whose `id` is one of OURS adopts the shipped epoch fields. That is deliberately the
 * narrow set: the GM keeps the key it is filed under, its format string, its month and weekday
 * names - everything that makes a reckoning theirs. WHERE its zero sits is a fact about the anchor,
 * and the anchor is ours. A GM who wants a different zero makes their own calendar with its own id,
 * which this function does not touch and `temporalForExport` still writes in full.
 *
 * This is the cost DATA-R32 already states out loud - "if a later version CHANGES one, campaigns
 * follow the new definition" - being paid on purpose for the first time.
 */
function adoptShippedCalendarEpochs(
  registry: TemporalState['temporal_registry'],
  defaults: TemporalState['temporal_registry']
): { registry: TemporalState['temporal_registry']; changed: boolean } {
  const shippedById = new Map<string, TemporalState['temporal_registry'][string]>();
  Object.values(defaults).forEach((cal) => {
    if (cal?.id) shippedById.set(cal.id, cal);
  });

  let changed = false;
  const working: TemporalState['temporal_registry'] = {};
  for (const [key, calendar] of Object.entries(registry)) {
    const shipped = calendar?.id ? shippedById.get(calendar.id) : undefined;
    // A GM who typed their own zero OWNS it. Adoption exists to carry OUR correction into saves that
    // carry OUR calendar unmodified - never to overwrite a reckoning somebody chose for themselves.
    if (!shipped || (calendar as any).epoch_gm_authored) {
      working[key] = calendar;
      continue;
    }
    const wantOffset = shipped.epoch_offset_t;
    const wantUtc = (shipped as any).epoch_utc;
    const wantLeap = (shipped as any).leap_logic;
    const sameLeap = JSON.stringify((calendar as any).leap_logic ?? null) === JSON.stringify(wantLeap ?? null);
    if (calendar.epoch_offset_t === wantOffset && (calendar as any).epoch_utc === wantUtc && sameLeap) {
      working[key] = calendar;
      continue;
    }
    const next: any = { ...calendar, epoch_offset_t: wantOffset };
    if (wantUtc === undefined) delete next.epoch_utc;
    else next.epoch_utc = wantUtc;
    if (wantLeap === undefined) delete next.leap_logic;
    else next.leap_logic = JSON.parse(JSON.stringify(wantLeap));
    working[key] = next;
    changed = true;
  }
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
  const sanitizedRegistry = sanitizeTemporalRegistry(registry, defaults.registry);
  if (sanitizedRegistry !== registry) {
    registry = sanitizedRegistry;
    changed = true;
  }

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

  const epochAdopted = adoptShippedCalendarEpochs(registry, defaults.registry);
  if (epochAdopted.changed) {
    registry = epochAdopted.registry;
    changed = true;
  }

  const hasLegacyMissingTimeCodes = !existing.masterTimeSec || !existing.displayTimeSec;
  const fallbackMaster = hasLegacyMissingTimeCodes
    ? defaultCampaignStartSeconds()
    : unixMsToMasterSeconds(firstEpochMs);
  
  let master = parseClockSeconds(existing.masterTimeSec, fallbackMaster);
  let display = parseClockSeconds(existing.displayTimeSec, master);

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
