// Starmap PROVENANCE (M1). Which build wrote a file, and which edition of a bundled starter map it came
// from. Small, but it is what makes future migrations deterministic instead of guesswork — before this,
// a starmap file carried no version of any kind.
//
// WHERE THE STAMP IS WRITTEN, AND WHY IT IS NOT WRITTEN EVERYWHERE:
// `appVersion` is stamped on an EXPLICIT save (the rail's Download, the Save modal) and deliberately NOT on
// the IndexedDB autosave. Autosave runs constantly, so stamping there would re-stamp an old campaign the
// instant it loaded — erasing the very evidence the base-map upgrade offer needs before the GM had any
// chance to see the offer. An explicit save is the GM choosing to write a file with this build; an autosave
// is not.
//
// `baseMapVersion` is never invented. A map the GM built from scratch has no base, so it has no base
// version, and saying otherwise would make it look upgradeable when there is nothing to upgrade from.

import { APP_VERSION } from '$lib/constants';

/** The provenance fields, alone. Structural so it applies to a full Starmap or a lean export clone. */
export interface Provenance {
  appVersion?: string;
  baseMapVersion?: number;
}

/**
 * The edition of the bundled base maps that THIS build ships. Bumped when the shipped starter maps change
 * in a way a derived campaign should be offered an upgrade for (new positions, new physics inputs).
 * Mirrors `static/example-starmaps/manifest.json`.
 */
export const CURRENT_BASE_MAP_VERSION = 2;

/**
 * Stamp a map for an explicit save. Returns a COPY — callers are building an export object and must not
 * mutate live campaign state. `baseMapVersion` is carried through exactly as found, including absent.
 */
export function stampForSave<T extends Provenance>(map: T): T {
  return { ...map, appVersion: APP_VERSION };
}

/**
 * Which base-map edition a campaign descends from, for maps that predate the stamp.
 *
 * `hasBaseSystems` is the caller's answer to "does this map still contain systems from a bundled base map"
 * (an id match against the shipped manifest — never a name match). A map with base systems but no stamp
 * is edition 1, because edition 2 is the first that stamps. No base systems at all returns null: the
 * campaign has no base, so there is nothing to compare and nothing to offer.
 */
export function baseMapEdition(map: Provenance, hasBaseSystems: boolean): number | null {
  if (typeof map.baseMapVersion === 'number' && Number.isFinite(map.baseMapVersion)) return map.baseMapVersion;
  return hasBaseSystems ? 1 : null;
}

/** True when a campaign descends from an OLDER edition of a bundled map than this build ships. */
export function isBaseMapOutdated(map: Provenance, hasBaseSystems: boolean): boolean {
  const edition = baseMapEdition(map, hasBaseSystems);
  return edition !== null && edition < CURRENT_BASE_MAP_VERSION;
}
