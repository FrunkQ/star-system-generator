// THE TAG VOCABULARY, ACROSS THE WIRE — how a player's device learns what the GM's tags look like.
//
// `tagCategories` is a localStorage store and `tagPresentation`'s PoI registries are module-level
// state built from it. Both are therefore PER BROWSER PROFILE. On the GM's own machine a second
// window shares them, so a recoloured faction, a renamed tag or an invented category all look right —
// and on a player's phone every one of them arrives as a shipped default. That asymmetry is why it
// survived: the failure is invisible in exactly the setup you test in.
//
// So the host publishes the presentation SUBSET and a receiving window feeds it into the same two
// registries the GM's own surfaces read. Nothing else changes: `markersFor` and `describeTag` keep
// their existing lookup order, they simply have the GM's answers to look up.
//
// WHAT DELIBERATELY DOES NOT CROSS: rules, provenance, `appliesTo`, `secretDefault`, `system`. They
// are authoring data. A player's device gets what it needs to DRAW a tag it has already been sent and
// nothing that would let it reason about tags it has not.
import type { TagCategory } from './tagCategories';
import type { TagStyleSnapshot } from '$lib/broadcast';
import { registerPoiCategories, registerPoiTags } from './tagPresentation';

/** Reduce the GM's categories to what a receiver needs in order to draw their tags. */
export function tagStyleSnapshot(categories: TagCategory[] | null | undefined): TagStyleSnapshot {
  const cats: TagStyleSnapshot['categories'] = [];
  const tags: TagStyleSnapshot['tags'] = [];
  for (const c of categories ?? []) {
    if (!c?.id) continue;
    cats.push({ id: c.id, label: c.longName || c.shortName || c.id, color: c.color, textColor: c.textColor });
    for (const t of c.tags ?? []) {
      // Only carry a tag that says something its category does not — a per-tag colour or a label the
      // key would not produce. Sending all of them would put the whole vocabulary on the wire on
      // every change, and the receiver's fallbacks already handle the rest.
      if (!t?.key) continue;
      if (t.color || t.textColor || t.label) tags.push({ key: t.key, label: t.label, color: t.color, textColor: t.textColor });
    }
  }
  return { categories: cats, tags };
}

/**
 * Adopt a host's vocabulary on a receiving window.
 *
 * Both registries are REBUILT WHOLESALE by their register functions, which is what makes a deletion
 * or an edit take effect rather than accumulating. That is also why this is safe to call on every
 * arriving snapshot.
 */
export function applyTagStyles(snap: TagStyleSnapshot | null | undefined): void {
  if (!snap) return;
  registerPoiCategories(snap.categories ?? []);
  registerPoiTags(snap.tags ?? []);
}

/**
 * The snapshot as the shape `markersFor` wants.
 *
 * It reads only `id` / `color` / `textColor` and each tag's `key` / `label` / `color` / `textColor`,
 * plus the ARRAY ORDER, which is what keeps a body's badges from reshuffling between renders. So a
 * receiving window can hand it these instead of its own store and get the GM's answers — which is
 * the whole point, because its own store is the shipped defaults.
 */
export function tagCategoriesFromSnapshot(snap: TagStyleSnapshot | null | undefined): TagCategory[] | null {
  if (!snap?.categories?.length) return null;
  const byNs = new Map<string, { key: string; label?: string; color?: string; textColor?: string }[]>();
  for (const t of snap.tags ?? []) {
    const ns = t.key.split('/')[0];
    if (!byNs.has(ns)) byNs.set(ns, []);
    byNs.get(ns)!.push(t);
  }
  return snap.categories.map((c) => ({
    id: c.id,
    shortName: c.label,
    longName: c.label,
    color: c.color,
    textColor: c.textColor,
    appliesTo: [],
    enabled: true,
    rules: [],
    tags: byNs.get(c.id) ?? []
  })) as unknown as TagCategory[];
}
