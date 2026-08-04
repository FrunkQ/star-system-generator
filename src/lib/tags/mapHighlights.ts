// MAP HIGHLIGHTS — "show me where X is", as a live selection rather than a property of a tag.
//
// The earlier design had categories PROMOTED to "priority", which meant configuring a thing in
// Settings before you could see it on a map. That was the wrong shape twice over: it made the common
// case (show the players where they can refuel, right now) a setup task, and it meant the answer to
// "what shows on the map" lived in two places.
//
// So highlighting is a SELECTION, made live, of any category and/or any specific tag:
//   { ref: 'faction' }              every tag in the Faction category, each in its own colour
//   { ref: 'frontier/refuelling' }  only that tag, on whatever carries it
// Formal and informal use the same path. The selection decides WHAT SHOWS and WHAT SHAPE; the colour
// always comes from the tag or its category, which is why a per-tag colour override is the whole
// mechanism behind one Faction category flying a different colour per faction.
import { canonicalTagKey } from './tagLifecycle';
import type { TagCategory } from './tagCategories';
import type { Tag } from '../types';

export type MarkerStyle = 'label' | 'ring' | 'both' | 'pin' | 'flag';

export interface HighlightRef {
  /** A category id ('faction') OR a full tag key ('frontier/refuelling'). */
  ref: string;
  /** Optional per-entry shape; otherwise the viewing surface's default. */
  style?: MarkerStyle;
}
export type MapHighlights = HighlightRef[];

export interface HighlightMarker {
  key: string;
  label: string;
  color: string;
  textColor: string;
  style: MarkerStyle;
  /** 1-2 letters, for the shapes that carry text rather than relying on colour (pin, flag). */
  monogram: string;
}

/** How many markers one object shows before collapsing into "+N". Markers are clutter by design. */
export const MARKER_CAP = 4;

const isCategoryRef = (ref: string) => !ref.includes('/');

/** Initials that stay legible when colour is unreliable — a CRT filter, a colour-blind table. */
export function monogramOf(label: string): string {
  const words = label.trim().split(/[\s-]+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * The markers one object earns from the current selection, in a stable order (category order, then
 * key) so a body does not reshuffle its own badges between renders.
 *
 * `tags` should already be REDACTED for the audience — this function has no idea who is looking, and
 * deliberately so: a secret tag must never reach a player marker, and the way that is guaranteed is
 * that the player snapshot has already removed it (see tagLifecycle.redactTagsForPlayers).
 */
export function markersFor(
  tags: Tag[] | undefined,
  highlights: MapHighlights,
  categories: TagCategory[],
  defaultStyle: MarkerStyle = 'label'
): HighlightMarker[] {
  if (!highlights?.length || !tags?.length) return [];

  const catOrder = new Map(categories.map((c, i) => [c.id, i]));
  const out: HighlightMarker[] = [];
  const seen = new Set<string>();

  for (const t of tags) {
    const key = canonicalTagKey(t.key);
    if (!key || seen.has(key)) continue;
    const ns = key.split('/')[0];

    // The most specific selection wins its style: naming a tag outright beats naming its category.
    const byTag = highlights.find((h) => canonicalTagKey(h.ref) === key);
    const byCat = highlights.find((h) => isCategoryRef(h.ref) && canonicalTagKey(h.ref) === ns);
    const hit = byTag ?? byCat;
    if (!hit) continue;

    const cat = categories.find((c) => c.id === ns);
    const def = cat?.tags.find((x) => canonicalTagKey(x.key) === key);
    const label = def?.label || key.split('/').slice(1).join(' ') || key;

    seen.add(key);
    out.push({
      key,
      label,
      color: def?.color || cat?.color || '#888888',
      textColor: def?.textColor || cat?.textColor || '#ffffff',
      style: hit.style ?? defaultStyle,
      monogram: monogramOf(label)
    });
  }

  return out.sort((a, b) => {
    const ai = catOrder.get(a.key.split('/')[0]) ?? 999;
    const bi = catOrder.get(b.key.split('/')[0]) ?? 999;
    return ai - bi || a.key.localeCompare(b.key);
  });
}

/**
 * A system's markers on the STARMAP: the union of what everything inside it carries.
 *
 * Rolled up rather than read off the star alone, because the interesting cases are not on the star —
 * a faction holding one moon, a refuelling stop at a gas giant. Several factions in one system is a
 * real answer (contested space), not a rendering problem, so duplicates collapse by key and the rest
 * stand.
 */
export function rollUpMarkers(
  bodies: { tags?: Tag[] }[],
  highlights: MapHighlights,
  categories: TagCategory[],
  defaultStyle: MarkerStyle = 'label'
): HighlightMarker[] {
  if (!highlights?.length) return [];
  const byKey = new Map<string, HighlightMarker>();
  for (const b of bodies) {
    for (const m of markersFor(b.tags, highlights, categories, defaultStyle)) {
      if (!byKey.has(m.key)) byKey.set(m.key, m);
    }
  }
  const catOrder = new Map(categories.map((c, i) => [c.id, i]));
  return [...byKey.values()].sort((a, b) => {
    const ai = catOrder.get(a.key.split('/')[0]) ?? 999;
    const bi = catOrder.get(b.key.split('/')[0]) ?? 999;
    return ai - bi || a.key.localeCompare(b.key);
  });
}

/** Split a marker list into what is drawn and how many were left out. */
export function capMarkers(markers: HighlightMarker[], cap = MARKER_CAP): { shown: HighlightMarker[]; overflow: number } {
  if (markers.length <= cap) return { shown: markers, overflow: 0 };
  return { shown: markers.slice(0, cap), overflow: markers.length - cap };
}
