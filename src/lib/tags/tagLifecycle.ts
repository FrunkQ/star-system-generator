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
// `origin/migrated` and `orbit/retrograde` survived only because no strip site happened to name them
// and `importFixup`'s DERIVED_TAG_PREFIXES happened to omit them. The spin pair in particular is a
// PROMISE TO THE READER — that an inferred obliquity is distinguishable from a measured one (inbox
// B10, C3c) — and it should not rest on nobody having added `spin/` to a list. It is now declared,
// per namespace, in tagDefaults.ENGINE_NAMESPACES, and a test holds it.
import type { Tag } from '../types';
// Safe to import: tagDefaults has type-only imports, so this cannot cycle.
import { ENGINE_NAMESPACES } from './tagDefaults';

export type TagOrigin = 'physics' | 'rule' | 'authored' | 'manual' | 'inherited' | 'derived';

// PROVENANCE IS A PROPERTY OF THE CATEGORY; the TAG carries only a flag.
//
// The split is the useful one: a tag records whether a human put it there (`manual`), and its
// category records what a tag in that namespace IS when nothing else says — derived every pass, or
// written once at generation. So the per-tag data stays a simple yes/no that any writer can set
// honestly, and the richer logic lives in one editable place instead of being restated per tag.
//
// It used to be the latter — a literal `['spin/', 'origin/', …]` sitting in this file — and that is
// the shape of thing that goes stale in silence: add a namespace anywhere in the engine and this list
// does not know, so its tags quietly claim to be physics-derived. Categories already declare
// everything else about a namespace, so they declare this too and there is one answer to "where does
// a tag in this namespace come from".
//
// A registry rather than an import, because `tagCategories` imports THIS module — inverting the
// dependency keeps the graph acyclic, and a Map lookup stays cheap in the strip/emit hot paths.
// Whoever owns the categories calls `registerCategoryProvenance` whenever they change.
const CATEGORY_PROVENANCE = new Map<string, TagOrigin>();

function seedEngineProvenance(): void {
  for (const n of ENGINE_NAMESPACES) CATEGORY_PROVENANCE.set(canonicalTagKey(n.id), n.provenance as TagOrigin);
}
// Seeded AT LOAD, not on first use. Registration that waits for someone to import the store is how a
// spec (and, one import-order change away, the app) ends up asking an empty registry and being told
// every generated tag is physics-derived.
seedEngineProvenance();

/** Register the USER categories' provenance. The engine's own namespaces are re-seeded alongside, so
 *  a category edit can never drop them. */
export function registerCategoryProvenance(entries: { id: string; provenance?: TagOrigin }[]): void {
  CATEGORY_PROVENANCE.clear();
  seedEngineProvenance();
  for (const e of entries) {
    if (e?.id && e.provenance) CATEGORY_PROVENANCE.set(canonicalTagKey(e.id), e.provenance);
  }
}

/** The provenance a namespace declares, or undefined if nothing has claimed it. */
export function namespaceProvenance(key: string): TagOrigin | undefined {
  const k = canonicalTagKey(key);
  const ns = k.includes('/') ? k.split('/')[0] : k;
  // An exact key can override its namespace: `orbit/` is mixed — `orbit/retrograde` is the
  // generator's claim while `orbit/tidally-locked` is re-derived every pass.
  return CATEGORY_PROVENANCE.get(k) ?? CATEGORY_PROVENANCE.get(ns);
}

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
let PHYSICS_NS_CACHE: { id: string; label: string }[] =
  ENGINE_NAMESPACES.filter((n) => n.provenance === 'physics' && !n.id.includes('/'));

/** Populated from the same table that declares provenance — one list, not two that drift apart. */
export function registerOverridableNamespaces(entries: { id: string; label: string }[]): void {
  PHYSICS_NS_CACHE = entries.filter((e) => !e.id.includes('/'));
}
export const overridableNamespaces = (): { id: string; label: string }[] => PHYSICS_NS_CACHE;
export const isPhysicsNamespace = (id: string): boolean => namespaceProvenance(id) === 'physics';

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
  // Ask the namespace what it is. Physics is the fallback because an unclaimed namespace is one the
  // engine emitted and nobody described — which is a documentation gap, not a licence to keep it.
  return namespaceProvenance(t.key) ?? 'physics';
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
