// Tag inheritance for constructs (docs/tag-inheritance.md): a construct inherits its drive tag from its
// ENGINES and its refuel-source tags from its FUEL TANKS — the hardware decides the tags, so they don't
// have to be hand-set. Pure functions: pass the definition lookups; no store reads, no mutation.
import type { CelestialBody, EngineDefinition, FuelDefinition } from '../types';

// FTL capability ranking — a construct's drive is the MOST capable among its engines. (Most ships carry one
// FTL engine, so this only matters for oddities; absence of any FTL engine = sublight = no drive tag.)
const DRIVE_RANK: Record<string, number> = {
  'drive/ftl-unknown': 1,
  'drive/gate': 2,
  'drive/jump-drive': 3,
  'drive/hyperdrive': 4,
  'drive/warp': 5
};

export type DefLookup<T> = Map<string, T> | Record<string, T>;
function look<T>(defs: DefLookup<T> | undefined, id: string): T | undefined {
  if (!defs) return undefined;
  return defs instanceof Map ? defs.get(id) : defs[id];
}

/** Build an id→definition map from a rulepack's `entries` array (or a bare array). */
export function byId<T extends { id: string }>(defs: { entries: T[] } | T[] | undefined): Map<string, T> {
  const arr = Array.isArray(defs) ? defs : defs?.entries ?? [];
  return new Map(arr.map((d) => [d.id, d]));
}

/**
 * The FTL drive tag a construct inherits from its engines — the most capable drive/* among them, or null
 * for sublight (no FTL engine). Torch / ion / NTR / chemical engines confer no drive tag (sublight).
 */
export function constructDriveTag(construct: CelestialBody, engines: DefLookup<EngineDefinition>): string | null {
  let best: string | null = null;
  for (const e of (construct.engines ?? [])) {
    const def = look(engines, e.engine_id);
    for (const key of (def?.drive_tags ?? [])) {
      if (!best || (DRIVE_RANK[key] ?? 0) > (DRIVE_RANK[best] ?? 0)) best = key;
    }
  }
  return best;
}

/**
 * The set of refuel-source tags (resource/* + frontier/*) a construct can top up from, gathered across the
 * fuels in its tanks. The autopilot planner uses these to find where each fuel type can be replenished.
 */
export function constructRefuelTags(construct: CelestialBody, fuels: DefLookup<FuelDefinition>): string[] {
  const out = new Set<string>();
  for (const tank of (construct.fuel_tanks ?? [])) {
    const def = look(fuels, tank.fuel_type_id);
    for (const t of (def?.refuel_tags ?? [])) out.add(t);
  }
  return [...out];
}

/**
 * The tags a construct INHERITS from its hardware (drive from engines, refuel-source from fuels), as Tag
 * objects flagged `inherited` (not `manual` — they come from the build, so they're not hand-removable; the
 * GM changes them by changing the engines/fuels). A hand-set drive/* CoI tag still wins over the derived
 * one (caller filters), per the "green/red, still selectable" picker rule.
 */
export function inheritedConstructTags(
  construct: CelestialBody,
  engines: DefLookup<EngineDefinition>,
  fuels: DefLookup<FuelDefinition>
): { key: string; inherited: true; coi: true }[] {
  const keys = new Set<string>();
  const drive = constructDriveTag(construct, engines);
  if (drive) keys.add(drive);
  for (const t of constructRefuelTags(construct, fuels)) keys.add(t);
  return [...keys].map((key) => ({ key, inherited: true, coi: true }));
}
