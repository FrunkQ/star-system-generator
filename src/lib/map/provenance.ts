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

/** Which of the two trees an export holds. A LABEL, never a gate - see stampForSave. */
export type ExportMode = 'gm' | 'player';

/**
 * The Save modal speaks `'GM' | 'Player'`; the file speaks `'gm' | 'player'`. ONE translation
 * between the two vocabularies, here rather than inline at the call site, because one concept
 * living under two names translated in exactly one place is a thing this codebase has been bitten
 * by before - and because an inline ternary is untestable from anywhere the choice is made.
 *
 * The direction matters more than the spelling: getting this backwards labels a GM export
 * `player`, which is the mislabel that leaks a campaign.
 */
export function exportModeFromChoice(choice: 'GM' | 'Player'): ExportMode {
  return choice === 'Player' ? 'player' : 'gm';
}

/** The provenance fields, alone. Structural so it applies to a full Starmap or a lean export clone. */
export interface Provenance {
  appVersion?: string;
  baseMapVersion?: number;
  /** R-12: how many explicit saves this campaign has had. See nextRevision. */
  revision?: number;
  /** R-10: which tree this file holds, as a label. Never read as a gate. */
  exportMode?: ExportMode;
}

/**
 * R-12: THE REVISION A NEW EXPLICIT SAVE SHOULD CARRY - one past whatever the campaign holds.
 *
 * THE SCENARIO THIS PREVENTS, and it is real data loss rather than an untidiness. A creator uploads
 * their campaign to the hub. Weeks later they find an older export in their Downloads folder and
 * upload it as an update. Nothing in either file says which is newer - verified across two real
 * exports of one map nine months apart: same `id`, 42/42 shared system ids, and no serial of any
 * kind - so the hub accepts it, replaces every row, and the newer version is gone. With this the
 * hub can ask "the copy you uploaded is older than the one published - did you mean to roll back?"
 *
 * `appVersion` cannot serve: two saves from one build are indistinguishable, and a creator who has
 * not updated SSE produces identical stamps forever. Nor can a file timestamp - it is a client
 * clock, it survives copying badly, and it is trivially wrong.
 *
 * THE INVARIANT THAT MAKES IT TRUSTWORTHY: **the revision in the file is the revision the campaign
 * now holds.** The caller advances the LIVE campaign and exports from that, rather than
 * incrementing on the way out - otherwise the file and the autosave disagree, and the next save
 * writes the same number again. A missing, negative or non-integer value reads as "never saved",
 * so the first explicit save of any campaign - including one made before this field existed -
 * writes 1.
 */
export function nextRevision(map: Provenance): number {
  const held = map.revision;
  if (typeof held !== 'number' || !Number.isFinite(held) || held < 0) return 1;
  return Math.floor(held) + 1;
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
 *
 * R-10, `exportMode`: WHICH TREE THIS FILE HOLDS, AND IT IS A LABEL RATHER THAN A GATE. A reader
 * meets it inside a file a stranger sent, so it is a CLAIM exactly like ATTRIBUTIONS.md, and
 * detection stays the control: a stamp saying `player` on a file full of GM notes must lose to the
 * detector, loudly. What it buys is precision in the labelling - a file with no GM notes in it is
 * a player export OR a GM export of a campaign with no secrets, and those are indistinguishable
 * from the outside. Nothing in this app reads it.
 *
 * It DEFAULTS TO 'gm', which is the safe direction: the campaign save has only ever written the
 * full GM file, and a player export mislabelled `gm` is merely over-cautious, while a GM export
 * mislabelled `player` is the one that leaks a campaign.
 *
 * `revision` is deliberately NOT incremented here. It has to be advanced on the LIVE campaign so
 * the file and the autosave agree - see nextRevision.
 */
export function stampForSave<T extends Provenance>(map: T, opts: { exportMode?: ExportMode } = {}): T {
  return { ...map, appVersion: APP_VERSION, exportMode: opts.exportMode ?? 'gm' };
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
