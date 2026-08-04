// Constructs of Interest (CoIs) — manually-applied tags on constructs (ships/stations). Unlike PoIs
// (programmatically derived from physics), CoIs are ALWAYS chosen by hand by the GM. They are pre-work for
// autopilot: a construct's Owner sets its tardiness, its Purpose(s) describe what it does. The category +
// tag lists are user-editable (Settings -> CoIs) and travel inside the .json starmap.
import { derived, get } from 'svelte/store';
import type { CelestialBody, Tag } from '../types';
import {
  tagCategories, seedTagCategories, normalizeTagCategories, setCategoryEnabled,
  addTagToCategory, removeTagFromCategory, type TagCategory, type TagRole
} from '../tags/tagCategories';
import { DEFAULT_POI_PACK } from '../tags/tagDefaults';

export interface CoITag {
  key: string;       // namespaced, e.g. 'owner/military', 'purpose/patrol'
  label: string;     // what the user sees
  tardiness?: number; // owner tags carry the 0..1 tardiness the ship inherits (used later by autopilot)
  rate?: number; // capability tags (mining/loading/skimming…) carry a default rate (t/day); per-ship override via the tag value × source abundance ⇒ dwell. See docs/autopilot-spec.md §12.6.
  readiness?: number; // STATUS tags only: 0..1 operational capability (drive). Absent ⇒ 1 (no impairment).
                      // A construct is assumed operational (1) unless a status blocks it: Derelict 0 (dead),
                      // Under construction 0.5 (half drive), etc. See constructReadiness().
  locked?: boolean;  // can't be removed
  derived?: boolean; // auto-mirrored from internal state (e.g. Status: Adrift / In transit), not hand-set
}
export interface CoICategory {
  id: string;        // the tag prefix, e.g. 'owner'
  label: string;     // heading the user sees
  color?: string;    // chip background
  textColor?: string;
  single?: boolean;  // true = at most one tag from this category may be applied (e.g. one Owner)
  enabled?: boolean; // shown on constructs / usable when true (toggled on the Settings -> CoIs page)
  required?: boolean; // a core category autopilot needs (Status, Owner, Purpose): always on, can't be removed/deselected; its tag list is still editable
  tags: CoITag[];
}

// The starter sets moved to tags/tagDefaults.ts so the store can seed itself without an import
// cycle; re-exported here because this is where every consumer already looks for them.
export { DEFAULT_COI_CATEGORIES } from '../tags/tagDefaults';
import { DEFAULT_COI_CATEGORIES } from '../tags/tagDefaults';


// Enforce the invariant autopilot relies on: the three CORE categories (Status, Owner, Purpose) always
// exist, sit first (Status top), stay enabled, and can't be removed; Status always keeps its locked
// Active tag. Their tag LISTS are otherwise user-editable. Applied to any externally-sourced category set
// (load / import / starmap merge) so a stale or hand-edited set can never drop the essentials.
export function normalizeCoIs(cats: CoICategory[]): CoICategory[] {
  const out = cats.map((c) => ({ ...c, tags: [...(c.tags ?? [])] }));
  const byId = new Map(out.map((c) => [c.id, c]));
  for (const def of DEFAULT_COI_CATEGORIES.filter((d) => d.required)) {
    let cur = byId.get(def.id);
    if (!cur) { cur = structuredClone(def); out.push(cur); byId.set(def.id, cur); }
    cur.required = true;
    cur.enabled = true;
    if (def.id === 'status') {
      // Drop any legacy "Active" tag — operational is now the default (no tag), gated by readiness.
      cur.tags = cur.tags.filter((t) => t.key !== 'status/active');
      // The system NEEDS the derived state tags — re-add any a stale/imported set is missing (Adrift is a
      // zero-readiness blocker; in-transit are operational).
      for (const d of [
        { key: 'status/in-transit-interstellar', label: 'In transit (interstellar)' },
        { key: 'status/in-transit-system', label: 'In transit (in-system)' },
        { key: 'status/adrift', label: 'Adrift', readiness: 0 }
      ]) {
        let t = cur.tags.find((x) => x.key === d.key);
        if (!t) { t = { ...d }; cur.tags.push(t); }
        t.derived = true;
        if ((d as any).readiness !== undefined) t.readiness = (d as any).readiness;
      }
    }
  }
  // Core categories first (in their defaults order), everything else after, original order preserved.
  const order = DEFAULT_COI_CATEGORIES.filter((d) => d.required).map((d) => d.id);
  const rank = (c: CoICategory) => { const i = order.indexOf(c.id); return i < 0 ? order.length : i; };
  return out.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c);
}

// THE STORE MOVED. Categories now live in one place (tags/tagCategories.ts) alongside what used to be
// PoI categories — they were always the same shape, and keeping two stores meant two answers to "what
// tags exist" and two definitions of "core". What is left here is the CONSTRUCT VIEW of that store,
// with the old shape and the old name, so nothing that reads it had to change.
seedTagCategories({ coi: DEFAULT_COI_CATEGORIES, poi: DEFAULT_POI_PACK });

const toCoI = (c: TagCategory): CoICategory => ({
  id: c.id, label: c.longName || c.shortName, color: c.color, textColor: c.textColor,
  single: c.single, enabled: c.enabled, required: c.system,
  tags: c.tags.map((t) => ({
    key: t.key, label: t.label, tardiness: t.tardiness, rate: t.rate,
    readiness: t.readiness, locked: t.locked, derived: t.derived
  }))
});

// Only categories that apply to constructs. A world-only category (science, intrigue) is in the same
// store now but has no business on a ship's Tags tab.
export const coiCategories = derived(tagCategories, (cats) =>
  cats.filter((c) => c.appliesTo.includes('construct')).map(toCoI)
);

export function resetCoIs(): void {
  tagCategories.update((cs) => {
    const keep = cs.filter((c) => !c.appliesTo.includes('construct'));
    const fresh = DEFAULT_COI_CATEGORIES.map((d) => ({
      id: d.id, shortName: d.label, longName: d.label, color: d.color || '#888888', textColor: d.textColor,
      appliesTo: ['construct'] as TagRole[], enabled: d.enabled === true || d.required === true,
      single: d.single, tags: d.tags.map((t) => ({ ...t })), rules: []
    }));
    return normalizeTagCategories([...keep, ...fresh]);
  });
}

// Only ENABLED categories are offered on constructs and used by guidance (toggled on Settings -> CoIs).
export function activeCoICategories(cats: CoICategory[]): CoICategory[] {
  return cats.filter((c) => c.enabled === true);
}
export function setCoIEnabled(id: string, on: boolean): void {
  setCategoryEnabled(id, on);
}

// The Status tag a construct's CURRENT internal placement implies (derived, not stored): adrift / in
// transit. Mirrors the journey state so find-by-tag and displays can surface e.g. all adrift ships.
export function derivedStatusKey(placementKind: 'transit' | 'adrift' | string | undefined): string | null {
  if (placementKind === 'transit') return 'status/in-transit-interstellar';
  if (placementKind === 'adrift') return 'status/adrift';
  return null;
}

// A construct's operational readiness (0..1) — its capability multiplier for movement/drive. There is no
// "Active" tag: a construct is assumed fully operational (1) unless a Status tag impairs it, in which case
// the LOWEST readiness among its status tags wins (the most limiting blocker). Derelict 0 = dead in space;
// Under construction / Damaged 0.5 = half drive. Statuses with no `readiness` (e.g. In transit, Captured)
// don't impair. Pass the category set to avoid a store read in hot paths.
export function constructReadiness(construct: CelestialBody, cats?: CoICategory[]): number {
  const statusCat = (cats ?? get(coiCategories)).find((c) => c.id === 'status');
  if (!statusCat) return 1;
  const readinessOf = new Map(statusCat.tags.map((t) => [t.key, t.readiness]));
  let r = 1;
  for (const tag of construct.tags ?? []) {
    if (!tag.key.startsWith('status/')) continue;
    const rd = readinessOf.get(tag.key);
    if (typeof rd === 'number') r = Math.min(r, rd);
  }
  return r;
}

// --- Save / load CoI sets as files (like PoI packs) so people can swap genres. The whole category set
//     is one "CoI pack". (They also travel inside the starmap regardless.) ---
export function exportCoIs(cats: CoICategory[]): string {
  return JSON.stringify({ _kind: 'sse-coi-pack', _version: 1, categories: cats }, null, 2);
}
export function importCoIs(json: string): CoICategory[] {
  const p = JSON.parse(json);
  const cats = Array.isArray(p) ? p : p?.categories;
  if (!Array.isArray(cats) || !cats.every((c) => c && c.id && Array.isArray(c.tags))) {
    throw new Error('Not a valid CoI pack (needs categories[] with id + tags).');
  }
  return normalizeCoIs(cats.map((c) => ({ ...c, enabled: c.enabled !== false })));
}

// --- Applying / reading CoIs on a construct (tags live in construct.tags, flagged manual so the PoI
//     re-tag pass never strips them). ---
export function constructHasCoI(construct: CelestialBody, key: string): boolean {
  return !!construct.tags?.some((t) => t.key === key);
}

// Toggle a CoI tag on a construct (mutates construct.tags in place; caller dispatches update). For a
// single-select category, applying one clears the others in that category.
export function toggleCoI(construct: CelestialBody, cat: CoICategory, key: string): void {
  if (!Array.isArray(construct.tags)) construct.tags = [];
  const has = construct.tags.some((t) => t.key === key);
  const catKeys = new Set(cat.tags.map((t) => t.key));
  if (has) {
    construct.tags = construct.tags.filter((t) => t.key !== key);
  } else {
    if (cat.single) construct.tags = construct.tags.filter((t) => !catKeys.has(t.key)); // one per single-select category
    construct.tags.push({ key, manual: true, coi: true } as Tag);
  }
}

// Add a tag to a CoI category (creating the category if it doesn't exist, e.g. a free-form 'custom'
// category). Persists into the store so it appears in the CoI editor and everywhere else. Returns the key.
export function addCoITag(catId: string, catLabel: string, tagLabel: string): string | null {
  const label = tagLabel.trim();
  if (!label) return null;
  // Create the category if this is the first tag filed under it (the free-form path), then add.
  if (!get(tagCategories).some((c) => c.id === catId)) {
    tagCategories.update((cs) => normalizeTagCategories([...cs, {
      id: catId, shortName: catLabel || catId, longName: catLabel || catId,
      color: '#777777', textColor: '#fff', appliesTo: ['construct'] as TagRole[],
      enabled: true, single: false, tags: [], rules: []
    }]));
  } else {
    setCategoryEnabled(catId, true);
  }
  return addTagToCategory(catId, label);
}

// Remove a CoI tag outright (for cleaning up orphans).
export function removeCoITag(construct: CelestialBody, key: string): void {
  if (Array.isArray(construct.tags)) construct.tags = construct.tags.filter((t) => t.key !== key);
}

// A friendly label for a CoI tag key — from its (possibly disabled) category if still defined, else
// derived from the key. Used to render orphaned tags whose category was removed.
export function coiTagLabel(key: string, cats: CoICategory[]): string {
  for (const c of cats) { const t = c.tags.find((x) => x.key === key); if (t) return t.label; }
  const suffix = key.split('/')[1] || key;
  return suffix.split('-').map((w) => w[0]?.toUpperCase() + w.slice(1)).join(' ');
}

// CoI tags on a construct whose category is no longer ACTIVE (disabled, removed, or the tag deleted from
// its category). They're kept on the construct but shown greyed/inactive so nothing silently vanishes.
export function orphanedCoITags(construct: CelestialBody, cats: CoICategory[]): { key: string; label: string }[] {
  const activeKeys = new Set(activeCoICategories(cats).flatMap((c) => c.tags.map((t) => t.key)));
  return (construct.tags || [])
    .filter((t) => t.coi && !activeKeys.has(t.key))
    .map((t) => ({ key: t.key, label: coiTagLabel(t.key, cats) }));
}

// The tardiness a construct inherits from its Owner CoI (used later by autopilot); undefined if no owner set.
export function constructTardiness(construct: CelestialBody): number | undefined {
  const cats = get(coiCategories);
  const owner = cats.find((c) => c.id === 'owner');
  if (!owner) return undefined;
  for (const t of owner.tags) if (constructHasCoI(construct, t.key)) return t.tardiness;
  return undefined;
}

// --- Starmap embedding: CoI category lists travel inside the .json so a shared map carries its tags. ---
export function coiForStarmap(): CoICategory[] {
  return get(coiCategories);
}
/** Merge a starmap's embedded CoI categories. Still accepts the OLD shape, because saved starmaps in
 *  the wild carry it — the unified store is the destination, not the file format. */
export function mergeStarmapCoIs(cats: CoICategory[] | undefined): void {
  if (!Array.isArray(cats) || !cats.length) return;
  tagCategories.update((cur) => {
    const byId = new Map(cur.map((c) => [c.id, c]));
    for (const c of cats) {
      if (!c || !c.id || !Array.isArray(c.tags)) continue;
      const existing = byId.get(c.id);
      byId.set(c.id, {
        // Keep the world-side facts (rules, roles beyond constructs) a CoI file cannot know about.
        ...(existing ?? { appliesTo: [] as TagRole[], rules: [], shortName: c.label, longName: c.label, color: '#888888' }),
        id: c.id,
        shortName: c.label || existing?.shortName || c.id,
        longName: c.label || existing?.longName || c.id,
        color: c.color || existing?.color || '#888888',
        textColor: c.textColor ?? existing?.textColor,
        single: c.single,
        enabled: c.enabled !== false,
        appliesTo: [...new Set([...(existing?.appliesTo ?? []), 'construct' as TagRole])],
        tags: c.tags.map((t) => ({ ...t })),
        rules: existing?.rules ?? []
      } as TagCategory);
    }
    return normalizeTagCategories([...byId.values()]);
  });
}
