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

/**
 * The namespaces the engine derives, offered to a GM who wants to OVERRIDE one by hand — say a
 * volcanic moon the physics does not think is volcanic. An override is a manual tag, so it survives
 * the pass that would otherwise re-derive the namespace, and it suppresses the derived tag of the
 * same key rather than sitting beside it.
 *
 * This is deliberately a curated list rather than every namespace that exists: these are the ones a
 * GM has a reason to force, and each one drives something visible (a renderer feature, a rule input,
 * a find-by-tag result).
 */
export const PHYSICS_NAMESPACES: { id: string; label: string }[] = [
  { id: 'geology', label: 'Geology' },
  { id: 'tidal', label: 'Tidal' },
  { id: 'climate', label: 'Climate' },
  { id: 'weather', label: 'Weather' },
  { id: 'aurora', label: 'Aurora' },
  { id: 'magnetic', label: 'Magnetism' },
  { id: 'shape', label: 'Shape' },
  { id: 'structure', label: 'Structure' },
  { id: 'surface', label: 'Surface' },
  { id: 'volatiles', label: 'Volatiles' },
  { id: 'thermal', label: 'Thermal' },
  { id: 'habitability', label: 'Habitability' },
  { id: 'hazard', label: 'Hazard' },
  { id: 'flight', label: 'Flight' },
  { id: 'activity', label: 'Activity' }
];
export const isPhysicsNamespace = (id: string): boolean => PHYSICS_NAMESPACES.some((n) => n.id === id);

// TAG KEYS ARE CASE-INSENSITIVE, and the way to make that true everywhere is to have ONE spelling
// rather than to compare loosely in a dozen places. `Smugglers`, `smugglers` and `SMUGGLERS` are one
// tag, stored lowercase; `describeTag` title-cases it back for display, so the reader still sees
// "Smugglers". Spaces become hyphens for the same reason the category path already slugs them — a
// key with a space in it is indistinguishable from a V1 display-name tag, which is exactly why free
// text like "Red Syndicate" used to be thrown away on save.
export function canonicalTagKey(key: string): string {
  return String(key ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9/_-]/g, '');
}

/**
 * Canonicalise ONE path segment — a label the GM typed, becoming the part after the slash. Slashes
 * collapse here (unlike `canonicalTagKey`) because a segment cannot contain one: a category tag named
 * "Search/Rescue" is one tag called `purpose/search-rescue`, not a two-level key.
 */
export function tagSlugSegment(label: string): string {
  return String(label ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Canonicalise a tag list and collapse keys that differ only in case. The first spelling of a key
 * wins its position; a `manual` tag beats a derived twin, because if a GM and the engine disagree the
 * GM's is the one they typed.
 *
 * NOT to be run before legacy detection. `isLegacyTag` recognises a V1 tag BY its capitals and
 * spaces ("Tidally Locked"), so canonicalising first would launder every V1 tag into a valid-looking
 * user tag and the import strip would keep them all. Strip first, canonicalise what survives.
 */
export function canonicaliseTags(tags: Tag[] | undefined): Tag[] {
  const out: Tag[] = [];
  const seen = new Map<string, number>();
  for (const t of tags ?? []) {
    const key = canonicalTagKey(t.key);
    if (!key) continue;                       // a key of only punctuation is not a tag
    const at = seen.get(key);
    if (at === undefined) {
      seen.set(key, out.length);
      out.push(key === t.key ? t : { ...t, key });
      continue;
    }
    // Duplicate after folding case: keep the GM's over the engine's, else keep the first.
    if (isManual(t) && !isManual(out[at])) out[at] = { ...t, key };
  }
  return out;
}

/** True when `key` matches a target: an entry ending in `/` is a namespace prefix, else an exact key. */
export function matchesTarget(key: string, targets: readonly string[]): boolean {
  const k = canonicalTagKey(key);
  for (const t of targets) {
    // canonicalTagKey keeps a trailing slash, so a namespace target stays a namespace target.
    const target = canonicalTagKey(t);
    if (t.endsWith('/') ? k.startsWith(target) : k === target) return true;
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
/**
 * Strip everything a player must not see: a tag marked `secret`, and every tag belonging to a
 * category marked `playerHidden`.
 *
 * ONE place does this, and it is called from `computePlayerSnapshot` — the single point every player
 * surface already flows through (the catalogue, the player views, the holo table, the broadcast, the
 * printed report). A second redaction site is how a leak happens: one surface gets the fix and
 * another does not, and nothing reports the difference.
 */
export function redactTagsForPlayers(
  tags: Tag[] | undefined,
  categories: { id: string; playerHidden?: boolean }[]
): Tag[] {
  const hidden = new Set(categories.filter((c) => c.playerHidden).map((c) => c.id));
  return (tags ?? []).filter((t) => {
    if (t.secret) return false;
    const ns = canonicalTagKey(t.key).split('/')[0];
    return !hidden.has(ns);
  });
}

export function emit(tags: Tag[], tag: Tag): void {
  const key = canonicalTagKey(tag.key);
  if (!tags.some((t) => canonicalTagKey(t.key) === key)) tags.push(tag);
}
