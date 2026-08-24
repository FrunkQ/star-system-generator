// ONE store for every tag category the GM can configure — what used to be PoIs and CoIs.
//
// They were never two things. A "Point of Interest" was a category of tags applied to worlds by a
// rule; a "Construct of Interest" was a category of tags applied to ships by hand. Same shape, same
// namespace vocabulary (both own half of `resource/*`), two stores, two file formats, two settings
// sections, two editors — and TWO DEFINITIONS OF "CORE", which disagreed: CoI protected six
// categories, PoI protected one. A GM had to learn both to answer "what tags exist".
//
// This module is the single source of truth. `coi.ts` and `reasonsToVisit.ts` keep their old exports
// as VIEWS over it (derived stores) so nothing that reads them had to change, and they are the ones
// to delete once the last consumer moves.
//
// SYSTEM ≠ UNDISABLEABLE. A system category cannot be DELETED, because the engine matches its slugs
// by hand — `resource/*` for mining, `drive/*` for FTL, `status/*` for readiness, `frontier/*` for
// refuelling — and a dangling reference there is a silent breakage, not an error. It can still be
// switched OFF, because that is a real thing a GM might want and `frontier` in particular has always
// been user-toggleable: forcing it on during migration would have silently re-seeded tags across the
// starmaps of anyone who had turned it off.
import { writable, derived, get } from 'svelte/store';
import { registerPoiCategories, registerPoiTags } from './tagPresentation';
import { canonicalTagKey, tagSlugSegment, registerCategoryProvenance, registerOverridableNamespaces, type TagOrigin } from './tagLifecycle';
import { ENGINE_NAMESPACES, DEFAULT_COI_CATEGORIES, DEFAULT_POI_PACK, REASONS_DEFAULTS, ANOMALY_CATEGORY_SEED, POI_SEED_V2_TAGS } from './tagDefaults';
import type { PoIExpr, PoIRole } from '../physics/reasonsToVisit';

export type TagRole = PoIRole;

/** One defined tag inside a category. `key` is the whole key, not the segment, so a category whose
 *  tags predate it (or were hand-filed under it) cannot drift out of its own namespace. */
export interface TagDef {
  key: string;
  label: string;
  description?: string;
  color?: string;          // per-tag colour OVERRIDE — wins over the category's
  textColor?: string;
  secretDefault?: boolean; // new instances start redacted from players
  // Engine data. Fixed fields on the categories that use them rather than a general attribute
  // system: `owner` carries tardiness, `status` carries readiness, capability tags carry a rate.
  tardiness?: number;
  rate?: number;
  readiness?: number;
  locked?: boolean;        // cannot be removed by hand
  derived?: boolean;       // mirrored from runtime state (in transit, adrift), never hand-set
}

/** An automated tagging rule. The condition engine is unchanged — this is the old PoIRule. */
export interface TagRule {
  id: string;
  tag: string;
  category: string;
  chance: number;
  when: PoIExpr;
  enabled?: boolean;
  label?: string;
  description?: string;
  appliesTo?: TagRole[];
  // GLOBAL EVALUATION ORDER, and it is load-bearing rather than cosmetic. Each body rolls a seeded
  // random number PER RULE and the sequence advances every time, so which tags a world ends up with
  // depends on the order the rules run in. Storing rules on their categories groups them by
  // category, which is a different order from the flat pack list they came from — and the whole
  // bundled starmap re-rolled. `seq` preserves the original sequence across the move.
  seq?: number;
}

export interface TagCategory {
  id: string;                 // the namespace: keys are `${id}/${slug}`
  shortName: string;          // chip context
  longName: string;           // settings list + editor title
  description?: string;
  color: string;
  textColor?: string;
  // WHERE A TAG IN THIS NAMESPACE COMES FROM, when the tag itself does not say. Provenance belongs to
  // the category because that is the only place it can be kept honest: a hardcoded list of key
  // prefixes goes stale the moment someone adds a namespace, and does so silently. A user adding
  // their own tags to a category simply inherits its answer, which is right — they can override any
  // individual tag by hand, and that override is recorded on the tag.
  // Omitted on a user category: its tags carry their own flags (manual, or rule-emitted).
  provenance?: TagOrigin;
  appliesTo: TagRole[];
  system?: boolean;           // UNDELETABLE (see header). Not undisableable.
  enabled: boolean;
  playerHidden?: boolean;     // whole category redacted from players
  single?: boolean;           // at most one tag from this category per object
  tags: TagDef[];
  rules: TagRule[];
}

// The categories the engine matches by slug. Deleting one breaks something that reports no error:
// resource/frontier feed mining and refuelling, purpose drives leg inference, drive confers FTL,
// status gates movement, owner sets tardiness, class is read by the template picker.
export const SYSTEM_CATEGORY_IDS = ['status', 'owner', 'purpose', 'resource', 'class', 'drive', 'frontier', 'anomaly'] as const;
export const isSystemCategory = (id: string): boolean => (SYSTEM_CATEGORY_IDS as readonly string[]).includes(id);

const STORE_KEY = 'tag-categories';
const RULES_ENABLED_KEY = 'tag-rules-enabled';

// Legacy keys, read once to migrate and then left alone (harmless; a later release deletes them).
const LEGACY_COI_KEY = 'coi-categories';
const LEGACY_POI_KEY = 'poi-packs';
const LEGACY_REASONS_KEY = 'reasons-to-visit-config';

const readJson = (key: string): any => {
  if (typeof localStorage === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
};

/**
 * Build the unified set from whatever the old stores held. Called once, when `tag-categories` is
 * absent. Everything about a category carries over — colours, tag lists, rules, and crucially its
 * ENABLED STATE, copied verbatim rather than defaulted.
 */
export function migrateLegacyCategories(
  coiCats: any[] | null,
  poiPacks: any[] | null,
  reasonsCfg: any | null,
  defaults: { coi: any[]; poi: any }
): TagCategory[] {
  const out = new Map<string, TagCategory>();
  let seq = 0;   // global rule order — see TagRule.seq

  const ensure = (id: string, seed: Partial<TagCategory>): TagCategory => {
    let c = out.get(id);
    if (!c) {
      c = {
        id, shortName: seed.shortName ?? id, longName: seed.longName ?? id,
        color: seed.color ?? '#888888', textColor: seed.textColor,
        appliesTo: [], enabled: seed.enabled ?? true, tags: [], rules: []
      };
      out.set(id, c);
    }
    return c;
  };
  const addRoles = (c: TagCategory, roles: TagRole[]) => {
    for (const r of roles) if (!c.appliesTo.includes(r)) c.appliesTo.push(r);
  };

  // --- constructs side. Every CoI category applies to constructs and nothing else. ---
  for (const src of (Array.isArray(coiCats) && coiCats.length ? coiCats : defaults.coi)) {
    const c = ensure(src.id, {
      shortName: src.label, longName: src.label, color: src.color, textColor: src.textColor,
      enabled: src.enabled === true || src.required === true
    });
    c.shortName ||= src.label; c.longName ||= src.label;
    if (src.color) c.color = src.color;
    if (src.textColor) c.textColor = src.textColor;
    if (src.single) c.single = true;
    // `required` was CoI's word for what is now `system`, but the system list is authoritative.
    c.enabled = src.enabled === true || src.required === true;
    addRoles(c, ['construct']);
    for (const t of src.tags ?? []) {
      if (c.tags.some((x) => x.key === t.key)) continue;
      c.tags.push({
        key: canonicalTagKey(t.key), label: t.label,
        tardiness: t.tardiness, rate: t.rate, readiness: t.readiness,
        locked: t.locked, derived: t.derived
      });
    }
  }

  // --- worlds side. A PoI pack's categories carry rules; several packs may share a category id. ---
  const packs = Array.isArray(poiPacks) && poiPacks.length ? poiPacks : [defaults.poi];
  // The saved preference LAYERS OVER the shipped defaults. Treating "absent" as "on" is not a
  // neutral choice: `intrigue` ships OFF, so a fresh install would have silently gained a whole
  // category of tags — which is precisely what the derived baseline caught.
  const cfgCats: Record<string, boolean> = { ...REASONS_DEFAULTS.categories, ...(reasonsCfg?.categories ?? {}) };
  for (const pack of packs) {
    if (!pack || pack.enabled === false) continue;      // a disabled pack contributed nothing
    for (const rc of pack.categories ?? []) {
      const c = ensure(rc.id, {
        shortName: rc.label, longName: rc.label, color: rc.color, textColor: rc.textColor
      });
      if (rc.color && !out.get(rc.id)!.tags.length) c.color = rc.color;   // don't override a CoI colour that already has tags
      c.description ||= rc.desc;
      // Enabled state comes from the reasons config, verbatim. Absent means on, which is what
      // `activeCategories` did. A category that also came from the CoI side keeps ITS answer if it
      // was a required one, because that side had no way to turn it off.
      if (!isSystemCategory(rc.id) || cfgCats[rc.id] !== undefined) {
        c.enabled = cfgCats[rc.id] !== false;
      }
    }
    for (const r of pack.rules ?? []) {
      const c = out.get(r.category);
      if (!c) continue;
      if (c.rules.some((x) => x.id === r.id)) continue;   // same rule from two packs: first wins
      c.rules.push({ ...r, tag: canonicalTagKey(r.tag), seq: r.seq ?? seq++ });
      addRoles(c, (r.appliesTo?.length ? r.appliesTo : ['planet', 'moon', 'belt']) as TagRole[]);
      // A rule's tag is a tag of the category even if no CoI ever defined it.
      const key = canonicalTagKey(r.tag);
      if (!c.tags.some((t) => t.key === key)) {
        c.tags.push({ key, label: r.label || key.split('/').slice(1).join(' '), description: r.description });
      }
    }
  }

  // Invariants last, so nothing above can leave the set unusable.
  return normalizeTagCategories([...out.values()]);
}

/** Full definitions for system categories the legacy migration cannot produce. See the loop below. */
const SYSTEM_CATEGORY_SEEDS: Record<string, TagCategory> = {
  anomaly: { ...ANOMALY_CATEGORY_SEED, appliesTo: [...ANOMALY_CATEGORY_SEED.appliesTo], rules: [] } as TagCategory
};

/**
 * Enforce what the engine needs: every system category exists and is undeletable, system categories
 * sort first, and every tag key is canonical. Does NOT force `enabled` — see the header.
 */
export function normalizeTagCategories(cats: TagCategory[]): TagCategory[] {
  const out = cats.map((c) => ({ ...c, tags: [...(c.tags ?? [])], rules: [...(c.rules ?? [])] }));
  const byId = new Map(out.map((c) => [c.id, c]));

  for (const id of SYSTEM_CATEGORY_IDS) {
    let c = byId.get(id);
    if (!c) {
      // A SEED, when there is one to use. `anomaly` (G37) is the first system category the legacy
      // migration cannot produce - nothing in the CoI or PoI stores ever held it - so it is created
      // here, on the load path, which is also how an EXISTING user's saved set gains it. ONLY on
      // creation: a GM who deletes a seed tag they do not want must not get it back on the next
      // load. `enabled` is set here for the same reason it is nowhere else - a brand new category
      // has no saved preference to override (TAG-12).
      const seed = SYSTEM_CATEGORY_SEEDS[id];
      c = seed
        ? { ...seed, tags: seed.tags.map((t) => ({ ...t })), rules: [] }
        : { id, shortName: id, longName: id, color: '#888888', appliesTo: ['construct'], enabled: true, tags: [], rules: [] };
      out.push(c); byId.set(id, c);
    }
    c.system = true;
  }
  for (const c of out) {
    if (!isSystemCategory(c.id)) delete c.system;
    if (!c.appliesTo?.length) c.appliesTo = ['planet', 'moon', 'belt'];
    c.tags = c.tags.map((t) => ({ ...t, key: canonicalTagKey(t.key) }));
    c.rules = c.rules.map((r) => ({ ...r, tag: canonicalTagKey(r.tag) }));
  }
  // The status category owns tags the runtime mirrors onto constructs; re-add any a stale set lost.
  const status = byId.get('status')!;
  status.tags = status.tags.filter((t) => t.key !== 'status/active');   // retired: operational is the default
  for (const d of [
    { key: 'status/in-transit-interstellar', label: 'In transit (interstellar)' },
    { key: 'status/in-transit-system', label: 'In transit (in-system)' },
    { key: 'status/adrift', label: 'Adrift', readiness: 0 }
  ]) {
    let t = status.tags.find((x) => x.key === d.key);
    if (!t) { t = { ...d } as TagDef; status.tags.push(t); }
    t.derived = true;
    if ((d as any).readiness !== undefined) t.readiness = (d as any).readiness;
  }

  const order = SYSTEM_CATEGORY_IDS as readonly string[];
  const rank = (c: TagCategory) => { const i = order.indexOf(c.id); return i < 0 ? order.length : i; };
  return out.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c);
}

// G38 one-time seed: merge the v3.0.33 structural/orbital rules into an EXISTING saved store.
// Marker-guarded, so it runs once per browser — a user deleting one of these rules afterwards
// stays deleted, unlike the status-tag re-seed above which is meant to be permanent. New rules
// take seq numbers AFTER every existing rule, so no saved world's chance-based rolls move (the
// seeded roll advances per rule in seq order — TagRule.seq). Tag + category identifies the rule;
// a category the user deleted, or a rule they already authored for the same tag, is skipped.
const POI_SEED_V2_KEY = 'poi-seed-v2-done';
function seedV2Rules(cats: TagCategory[]): TagCategory[] {
  if (typeof localStorage === 'undefined') return cats;
  try {
    if (localStorage.getItem(POI_SEED_V2_KEY)) return cats;
    let maxSeq = 0;
    for (const c of cats) for (const r of c.rules ?? []) if (typeof r.seq === 'number' && r.seq > maxSeq) maxSeq = r.seq;
    let next = maxSeq + 1;
    const out = cats.map((c) => ({ ...c, rules: [...(c.rules ?? [])] }));
    for (const tagKey of POI_SEED_V2_TAGS) {
      const def = DEFAULT_POI_PACK.rules.find((r) => r.tag === tagKey);
      if (!def) continue;
      const cat = out.find((c) => c.id === def.category);
      if (!cat || cat.rules.some((r) => r.tag === tagKey)) continue;
      cat.rules.push({ ...def, tag: canonicalTagKey(def.tag), seq: next++ });
    }
    localStorage.setItem(POI_SEED_V2_KEY, '1');
    return out;
  } catch { return cats; }
}

function loadCategories(defaults: { coi: any[]; poi: any }): TagCategory[] {
  const saved = readJson(STORE_KEY);
  if (Array.isArray(saved) && saved.length && saved.every((c) => c && c.id && Array.isArray(c.tags))) {
    return normalizeTagCategories(saved);
  }
  return migrateLegacyCategories(readJson(LEGACY_COI_KEY), readJson(LEGACY_POI_KEY), readJson(LEGACY_REASONS_KEY), defaults);
}

// Seeded EAGERLY, at module load, from tagDefaults — which is the whole reason that file exists. An
// earlier version seeded lazily from whoever imported first, and a spec that never imported coi.ts
// therefore ran against an empty store: no rules, no tags, and the B33 surface-resource assertions
// failed for a reason that had nothing to do with B33.
export const tagCategories = writable<TagCategory[]>(
  seedV2Rules(loadCategories({ coi: DEFAULT_COI_CATEGORIES, poi: DEFAULT_POI_PACK }))
);

/** Kept as a no-op so callers that seeded explicitly still compile; the store seeds itself now. */
export function seedTagCategories(_defaults?: { coi: any[]; poi: any }): void { /* eager, see above */ }

/** Master switch for the automated rules — what "Show Point-of-Interest tags" used to be. */
export const tagRulesEnabled = writable<boolean>(
  (() => {
    const v = readJson(RULES_ENABLED_KEY);
    if (typeof v === 'boolean') return v;
    const legacy = readJson(LEGACY_REASONS_KEY);
    return legacy?.enabled !== false;
  })()
);

if (typeof window !== 'undefined') {
  tagCategories.subscribe((v) => {
    if (!v.length) return;                 // never persist the pre-seed empty state
    try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* private mode */ }
  });
  tagRulesEnabled.subscribe((v) => {
    try { localStorage.setItem(RULES_ENABLED_KEY, JSON.stringify(v)); } catch { /* private mode */ }
  });
}

// One registration of colours + labels for the whole app, replacing the two that raced each other.
// A per-tag colour override wins over its category's, which is what makes a faction category able to
// give every faction its own flag colour without a second mechanism.
// Provenance registration. The engine's own namespaces are constant; the user's categories change as
// they edit, so both go in together on every change and `tagOrigin` has one place to ask.
tagCategories.subscribe((cats) => {
  registerCategoryProvenance([
    ...ENGINE_NAMESPACES.map((n) => ({ id: n.id, provenance: n.provenance as TagOrigin })),
    ...cats.filter((c) => c.provenance).map((c) => ({ id: c.id, provenance: c.provenance }))
  ]);
  registerOverridableNamespaces(ENGINE_NAMESPACES.filter((n) => n.provenance === 'physics' && n.overridable !== false));
});

tagCategories.subscribe((cats) => {
  if (!cats.length) return;
  registerPoiCategories(cats.map((c) => ({ id: c.id, label: c.shortName || c.longName, color: c.color, textColor: c.textColor })));
  registerPoiTags(cats.flatMap((c) => c.tags).map((t) => ({
    key: t.key, label: t.label, description: t.description, color: t.color, textColor: t.textColor
  })));
});

export const activeTagCategories = derived(tagCategories, (cats) => cats.filter((c) => c.enabled));

/** Categories offerable on an object of this kind. */
export function categoriesFor(cats: TagCategory[], role: TagRole | undefined): TagCategory[] {
  if (!role) return cats.filter((c) => c.enabled);
  return cats.filter((c) => c.enabled && c.appliesTo.includes(role));
}

// --- mutators (the editor's whole API) ---

export function upsertCategory(cat: TagCategory): void {
  tagCategories.update((cs) => {
    const i = cs.findIndex((c) => c.id === cat.id);
    const next = i < 0 ? [...cs, cat] : cs.map((c, j) => (j === i ? cat : c));
    return normalizeTagCategories(next);
  });
}

/** Deleting a category leaves tags already applied to objects alone — they simply stop being
 *  described by it. Refuses a system category, which is the one thing `system` protects. */
export function deleteCategory(id: string): boolean {
  if (isSystemCategory(id)) return false;
  tagCategories.update((cs) => cs.filter((c) => c.id !== id));
  return true;
}

export function setCategoryEnabled(id: string, on: boolean): void {
  tagCategories.update((cs) => cs.map((c) => (c.id === id ? { ...c, enabled: on } : c)));
}

export function setCategoryPlayerHidden(id: string, hidden: boolean): void {
  tagCategories.update((cs) => cs.map((c) => (c.id === id ? { ...c, playerHidden: hidden } : c)));
}

export function addTagToCategory(categoryId: string, label: string, extra: Partial<TagDef> = {}): string | null {
  const slug = tagSlugSegment(label);
  if (!slug) return null;
  const key = `${categoryId}/${slug}`;
  tagCategories.update((cs) => cs.map((c) => {
    if (c.id !== categoryId || c.tags.some((t) => t.key === key)) return c;
    return { ...c, tags: [...c.tags, { key, label: label.trim(), ...extra }] };
  }));
  return key;
}

export function removeTagFromCategory(categoryId: string, key: string): void {
  tagCategories.update((cs) => cs.map((c) => (
    c.id === categoryId ? { ...c, tags: c.tags.filter((t) => t.key !== key || t.locked || t.derived) } : c
  )));
}

export function updateTagDef(categoryId: string, key: string, patch: Partial<TagDef>): void {
  tagCategories.update((cs) => cs.map((c) => (
    c.id === categoryId ? { ...c, tags: c.tags.map((t) => (t.key === key ? { ...t, ...patch } : t)) } : c
  )));
}

/** The colour a tag actually renders in: its own override, else its category's. */
export function resolveTagColor(cats: TagCategory[], key: string): { color: string; textColor?: string } | null {
  const k = canonicalTagKey(key);
  const cat = cats.find((c) => k.startsWith(`${c.id}/`));
  if (!cat) return null;
  const def = cat.tags.find((t) => t.key === k);
  return { color: def?.color || cat.color, textColor: def?.textColor || cat.textColor };
}

// --- one file format, replacing sse-poi-pack and sse-coi-pack ---

export function exportCategory(cat: TagCategory): string {
  return JSON.stringify({ _kind: 'sse-tag-category', _version: 1, category: cat }, null, 2);
}

export function importCategory(json: string): TagCategory {
  const raw = JSON.parse(json);
  const cat = raw?.category ?? raw;
  if (!cat?.id || !Array.isArray(cat.tags)) throw new Error('Not a tag category file.');
  return { ...cat, id: tagSlugSegment(cat.id), rules: cat.rules ?? [], appliesTo: cat.appliesTo ?? ['planet', 'moon', 'belt'] };
}

// --- starmap embedding: the categories travel with the map, as both old formats did ---

export function categoriesForStarmap(): TagCategory[] {
  return get(tagCategories);
}

export function mergeStarmapCategories(cats: TagCategory[] | undefined): void {
  if (!Array.isArray(cats) || !cats.length) return;
  tagCategories.update((cur) => {
    const byId = new Map(cur.map((c) => [c.id, c]));
    for (const c of cats) byId.set(c.id, c);
    return normalizeTagCategories([...byId.values()]);
  });
}
