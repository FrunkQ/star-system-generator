// THE ONE AUTHORITY ON TAG PROVENANCE — what a tag came from, and what survives what.
//
// Before this module the answer was spread over 34 call sites that each decided for themselves, and
// they disagreed. Nine spared a hand-added tag; twenty-five silently deleted it. `importFixup`
// deleted one on save. That is not a style problem: a GM who tags a world `geology/plate-tectonics`
// to make a point about it loses the tag on the next process, with no message, and the design that
// lets a GM override the physics at all (docs/dev/unified-tagging-design.md) cannot exist until the
// rule is stated once.
//
// PROVENANCE IS INFERRED, NOT REQUIRED. The design called for a mandatory `origin` field on Tag,
// which would have meant editing ~79 write sites and ~31 read sites across `src/lib/constructs/**`
// and the components — two territories with live sessions in them (see the territory table in
// docs/dev/observations-inbox.md). So `origin` is OPTIONAL and `tagOrigin()` infers it from the
// flags already present. Nothing else has to change to be understood correctly here, and a writer
// that later sets `origin` explicitly is believed over the inference. Same semantics, no merge.
//
// WHAT SURVIVES A RE-PROCESS is the whole point:
//
//   physics    engine-derived, re-derived every pass          stripped and re-emitted
//   rule       emitted by a user-editable tagging rule        stripped and re-rolled
//   authored   written by GENERATION, physics cannot re-derive it   KEPT
//   manual     hand-added by the GM (includes overrides)      KEPT
//   inherited  construct hardware (drive/refuel)              KEPT by a re-process
//   derived    runtime state (status/in-transit-*, adrift)    KEPT by a re-process
//
// `authored` is not a new idea, it is an existing accident written down. `spin/axis-inferred`,
// `origin/migrated` and `orbit/retrograde` survive today only because no strip site happens to name
// them and `importFixup`'s DERIVED_TAG_PREFIXES happens to omit them. The spin pair in particular is
// a PROMISE TO THE READER — that an inferred obliquity is distinguishable from a measured one
// (inbox B10, C3c) — and it should not rest on nobody having added `spin/` to a list. Naming the
// class here means the next person who adds a strip cannot quietly break it, because the test does.
import type { Tag } from '../types';

export type TagOrigin = 'physics' | 'rule' | 'authored' | 'manual' | 'inherited' | 'derived';

// Generation-written provenance the processor never re-derives. Entries ending in `/` are whole
// namespaces; the rest are exact keys. `orbit/` is deliberately NOT a namespace here — it is mixed:
// `orbit/retrograde` and `orbit/double` are generation's claims, while `orbit/tidally-locked` and
// `orbit/spin-orbit-resonance` are re-derived every pass by the processor's lock model.
const AUTHORED = ['spin/', 'origin/', 'traveller/', 'orbit/retrograde', 'orbit/double'];

/** True when `key` matches a target: an entry ending in `/` is a namespace prefix, else an exact key. */
export function matchesTarget(key: string, targets: readonly string[]): boolean {
  for (const t of targets) {
    if (t.endsWith('/') ? key.startsWith(t) : key === t) return true;
  }
  return false;
}

/**
 * Where a tag came from. An explicit `origin` wins; otherwise it is inferred from the legacy flags,
 * which is how every tag in the codebase is still written.
 */
export function tagOrigin(t: Tag): TagOrigin {
  const explicit = (t as { origin?: TagOrigin }).origin;
  if (explicit) return explicit;
  // Runtime status tags are written `{ coi: true, derived: true }` by the journey code. `derived` is
  // not declared on Tag — it is set through an `as any` — so it is read defensively.
  if ((t as { derived?: boolean }).derived) return 'derived';
  if (t.inherited) return 'inherited';
  if (t.manual) return 'manual';
  // A CoI tag that is neither inherited nor runtime-derived was chosen by hand on the Tags tab.
  if (t.coi) return 'manual';
  if (typeof t.source === 'string' && t.source.startsWith('rule:')) return 'rule';
  if (matchesTarget(t.key, AUTHORED)) return 'authored';
  return 'physics';
}

export const isManual = (t: Tag): boolean => tagOrigin(t) === 'manual';
export const isAuthored = (t: Tag): boolean => tagOrigin(t) === 'authored';

/** Engine-owned: the processor or the rules pass will produce it again, so it may be cleared. */
export function isEngineOwned(t: Tag): boolean {
  const o = tagOrigin(t);
  return o === 'physics' || o === 'rule';
}

/**
 * The rule every re-derive pass obeys: anything the engine did not author survives. A hand-added
 * tag, a generation provenance claim, an inherited or runtime construct tag — none of them can be
 * re-created by the pass that is about to run, so none of them may be deleted by it.
 */
export const survivesRederive = (t: Tag): boolean => !isEngineOwned(t);

/**
 * Clear engine-derived tags matching `targets` ahead of re-emitting them. This is the ONLY way a
 * physics pass may remove a tag.
 *
 * A caller that re-emits a key it may have spared must guard its push — see `emit()`. Nine sites
 * already did this by hand (`filter(t => t.key !== X || t.manual)` followed by `if (!tags.some(…))`)
 * and that idiom, arrived at independently for inbox B28 and B31, is what this generalises.
 */
export function stripForReprocess(tags: Tag[] | undefined, targets: readonly string[]): Tag[] {
  return (tags ?? []).filter((t) => !matchesTarget(t.key, targets) || survivesRederive(t));
}

/**
 * Clear tags emitted by tagging RULES in the given categories, ahead of re-rolling them. Separate
 * from `stripForReprocess` because the rules pass owns a whole category namespace at a time, and
 * because a `physics` tag that happens to sit in a rule category is not the rules pass's to delete.
 */
export function stripRuleTags(tags: Tag[] | undefined, categoryPrefixes: readonly string[]): Tag[] {
  return (tags ?? []).filter((t) => {
    if (!categoryPrefixes.some((p) => t.key.startsWith(p))) return true;
    return tagOrigin(t) !== 'rule';
  });
}

/**
 * Push `tag` unless that key is already present — the guard that stops a GM override from being
 * duplicated by the pass that would otherwise have emitted it. A manual `hazard/radiation` therefore
 * SUPPRESSES the derived one rather than sitting beside it, which is the behaviour B28 and B31 chose.
 *
 * NOT for keys a body legitimately carries several times (`volatiles/ices`, `structure/cloud-deck`,
 * `weather/precipitation` — see tagConsistency.spec.ts, which requires several of a thing to be
 * several tags rather than one delimited value). Those sites push directly.
 */
export function emit(tags: Tag[], tag: Tag): void {
  if (!tags.some((t) => t.key === tag.key)) tags.push(tag);
}
