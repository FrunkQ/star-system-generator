// Constructs of Interest (CoIs) — manually-applied tags on constructs (ships/stations). Unlike PoIs
// (programmatically derived from physics), CoIs are ALWAYS chosen by hand by the GM. They are pre-work for
// autopilot: a construct's Owner sets its tardiness, its Purpose(s) describe what it does. The category +
// tag lists are user-editable (Settings -> CoIs) and travel inside the .json starmap.
import { writable, get } from 'svelte/store';
import type { CelestialBody, Tag } from '../types';
import { registerPoiCategories, registerPoiTags } from '../tags/tagPresentation';

export interface CoITag {
  key: string;       // namespaced, e.g. 'owner/military', 'purpose/patrol'
  label: string;     // what the user sees
  tardiness?: number; // owner tags carry the 0..1 tardiness the ship inherits (used later by autopilot)
}
export interface CoICategory {
  id: string;        // the tag prefix, e.g. 'owner'
  label: string;     // heading the user sees
  color?: string;    // chip background
  textColor?: string;
  single?: boolean;  // true = at most one tag from this category may be applied (e.g. one Owner)
  enabled?: boolean; // shown on constructs / usable when true (toggled on the Settings -> CoIs page)
  tags: CoITag[];
}

// Starter sets (Alex 2026-06-15). Owner -> tardiness; Purpose -> what the ship is for.
export const DEFAULT_COI_CATEGORIES: CoICategory[] = [
  {
    id: 'owner', label: 'Owner', color: '#3f6fb0', textColor: '#ffffff', single: true, enabled: true,
    tags: [
      { key: 'owner/military', label: 'Military', tardiness: 0 },
      { key: 'owner/corporation', label: 'Corporation', tardiness: 0.25 },
      { key: 'owner/consortium', label: 'Consortium', tardiness: 0.5 },
      { key: 'owner/pirate', label: 'Pirate', tardiness: 0.75 },
      { key: 'owner/owner-operator', label: 'Owner-operator', tardiness: 1 }
    ]
  },
  {
    id: 'purpose', label: 'Purpose', color: '#2f9e8f', textColor: '#ffffff', single: false, enabled: true,
    tags: mkTags('purpose', [
      'patrol', 'ship-repair', 'refuel', 'leisure', 'people-transport', 'cargo-transport',
      'bulk-carrier', 'courier', 'mining', 'survey-prospecting', 'survey-science', 'prison',
      'colony', 'research', 'manufacturing', 'trade-hub', 'HQ', 'salvage', 'rescue-tender',
      'medical', 'diplomatic', 'tanker', 'factory-ship', 'farm-ship', 'comms-relay', 'defence-platform'
    ])
  },
  {
    // The ship's size/role class — scale governs what jobs make sense (a capital ship won't run courier).
    id: 'class', label: 'Hull class', color: '#8a6fc0', textColor: '#ffffff', single: true, enabled: false,
    tags: mkTags('class', [
      'shuttle', 'fighter', 'gunship', 'corvette', 'frigate', 'destroyer', 'cruiser',
      ['capital', 'Capital ship'], 'carrier', 'dreadnought', 'freighter', ['liner', 'Liner'],
      'tug', 'station', 'habitat', 'orbital-elevator'
    ])
  },
  {
    // FTL method — genre-defining and relevant to routing (sublight ships can't jump between stars).
    id: 'drive', label: 'FTL drive', color: '#c07f3f', textColor: '#ffffff', single: true, enabled: false,
    tags: mkTags('drive', [
      ['sublight', 'Sublight only'], 'jump-drive', 'warp', 'hyperdrive', ['gate', 'Wormhole / gate'],
      ['generation', 'Generation ship'], ['torch', 'Torch (fusion)'], 'solar-sail', ['ftl-unknown', 'Exotic / unknown']
    ])
  },
  {
    // Operational state — guidance cares (a derelict isn't going anywhere; damaged needs repair first).
    id: 'status', label: 'Status', color: '#5a7d8c', textColor: '#ffffff', single: true, enabled: true,
    tags: mkTags('status', [
      'active', 'damaged', 'adrift', 'derelict', 'mothballed', ['construction', 'Under construction'],
      'impounded', 'quarantined', 'lost', 'decommissioned'
    ])
  },
  {
    // Stance toward the party — a quick GM read; could colour contacts on a future tactical view.
    id: 'disposition', label: 'Disposition', color: '#b05050', textColor: '#ffffff', single: true, enabled: false,
    tags: mkTags('disposition', ['allied', 'friendly', 'neutral', 'wary', 'hostile', 'unknown'])
  },
  {
    // Tech level / origin — sets the sci-fi register (primitive frontier vs precursor relic).
    id: 'tech', label: 'Tech & origin', color: '#6a6f7a', textColor: '#ffffff', single: true, enabled: false,
    tags: mkTags('tech', [
      'primitive', 'industrial', 'standard', 'advanced', 'experimental',
      'alien', ['precursor', 'Precursor / ancient']
    ])
  }
];

function prettify(slug: string): string {
  if (slug === 'HQ') return 'HQ';
  return slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}
// Build a category's tags from a list of slugs, or [slug, explicitLabel] pairs where prettify won't do.
function mkTags(catId: string, entries: (string | [string, string])[]): CoITag[] {
  return entries.map((e) => typeof e === 'string'
    ? { key: `${catId}/${e}`, label: prettify(e) }
    : { key: `${catId}/${e[0]}`, label: e[1] });
}

const COI_KEY = 'coi-categories';
function load(): CoICategory[] {
  if (typeof localStorage === 'undefined') return structuredClone(DEFAULT_COI_CATEGORIES);
  try {
    const saved = JSON.parse(localStorage.getItem(COI_KEY) || 'null');
    if (Array.isArray(saved) && saved.length && saved.every((c) => c && c.id && Array.isArray(c.tags))) return saved;
  } catch { /* fall through */ }
  return structuredClone(DEFAULT_COI_CATEGORIES);
}

export const coiCategories = writable<CoICategory[]>(load());

if (typeof window !== 'undefined') {
  coiCategories.subscribe((v) => { try { localStorage.setItem(COI_KEY, JSON.stringify(v)); } catch { /* private mode */ } });
}

// Keep the shared tag-presentation layer in sync so CoI tags render with their colour + friendly label
// wherever a construct's tags are shown. (Reuses the PoI presentation registry.)
coiCategories.subscribe((cats) => {
  registerPoiCategories(cats.map((c) => ({ id: c.id, label: c.label, color: c.color, textColor: c.textColor })));
  registerPoiTags(cats.flatMap((c) => c.tags).map((t) => ({ key: t.key, label: t.label })));
});

export function resetCoIs(): void {
  coiCategories.set(structuredClone(DEFAULT_COI_CATEGORIES));
}

// Only ENABLED categories are offered on constructs and used by guidance (toggled on Settings -> CoIs).
export function activeCoICategories(cats: CoICategory[]): CoICategory[] {
  return cats.filter((c) => c.enabled === true);
}
export function setCoIEnabled(id: string, on: boolean): void {
  coiCategories.update((cs) => cs.map((c) => c.id === id ? { ...c, enabled: on } : c));
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
  return cats.map((c) => ({ ...c, enabled: c.enabled !== false }));
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
export function mergeStarmapCoIs(cats: CoICategory[] | undefined): void {
  if (!Array.isArray(cats) || !cats.length) return;
  coiCategories.update((cur) => {
    const out = [...cur];
    for (const c of cats) {
      if (!c || !c.id || !Array.isArray(c.tags)) continue;
      const i = out.findIndex((x) => x.id === c.id);
      if (i >= 0) out[i] = c; else out.push(c);
    }
    return out;
  });
}
