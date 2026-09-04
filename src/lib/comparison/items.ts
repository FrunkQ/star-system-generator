// src/lib/comparison/items.ts
// WHAT GOES ON THE STRIP, for each of the two maps.
//
// One rule decides a size and it is the TRUE one: a body's authored `radiusKm`, and a star's through
// `starRadiusKmOf` (which carries the law's default for a star with none authored). Nothing here
// consults the readable-size law, the body-size dial or the system's extent — see `layout.ts` for
// why, and the engine map entry RENDER-S51.
import { starRadiusKmOf } from '$lib/rendering/scaleLaw';
import { systemVisualStars } from '$lib/starmap/systemStars';
import type { ComparisonItem } from './layout';

/** An item plus the node the scene needs to build its look. */
export interface ComparisonEntry extends ComparisonItem {
  node: any;
}

/** The authored radius of a body node, in km, or 0 for a node that has none. */
function radiusKmOf(node: any): number {
  if (node?.roleHint === 'star') return starRadiusKmOf(node);
  return Number(node?.physical_parameters?.radiusKm ?? node?.radiusKm ?? 0) || 0;
}

/**
 * Every object on the SYSTEM map that has a true size: the star or stars, the giants, the planets,
 * the moons and the small bodies — the classic poster's cast, and the owner's own list.
 *
 * DELIBERATELY NOT HERE, and this is a scope line rather than an oversight: belts and rings (their
 * radius is an ORBIT, not an object, so putting one beside a planet compares two different kinds of
 * thing), constructs and megastructures (their look is a MODEL or a generated volume, a different
 * assembly from the globe this view draws — RENDER-S9/RENDER-S44 — and one nobody has extracted
 * yet), and barycentres (which have no body at all). Recorded on the board with the row.
 */
export function itemsForSystem(system: { nodes?: any[] } | null | undefined): ComparisonEntry[] {
  const nodes = system?.nodes ?? [];
  const out: ComparisonEntry[] = [];
  for (const n of nodes) {
    if (n?.kind !== 'body') continue;
    if (n.roleHint === 'belt' || n.roleHint === 'ring') continue;
    const r = radiusKmOf(n);
    if (!(r > 0)) continue;
    out.push({
      id: String(n.id), name: String(n.name ?? n.id), diameterKm: r * 2,
      role: String(n.roleHint ?? 'other'), colorHex: n.apparentColorHex, node: n
    });
  }
  return out;
}

/**
 * Every STAR on the starmap, one entry per star rather than one per system — `systemVisualStars` is
 * the multi-star-aware answer the two starmap renderers already share, so a binary appears twice
 * here for the same reason it appears twice on the map.
 *
 * The visual-star record carries what a GLYPH needs and no radius, so the size comes from the star
 * NODE it names. A system whose star is missing from its own node list contributes nothing rather
 * than a guess.
 */
export function itemsForStarmap(starmap: { systems?: any[] } | null | undefined): ComparisonEntry[] {
  const out: ComparisonEntry[] = [];
  for (const sys of starmap?.systems ?? []) {
    const stars = systemVisualStars(sys as any);
    for (const vs of stars) {
      const node = (sys?.nodes ?? []).find((n: any) => String(n.id) === String(vs.id));
      if (!node) continue;
      const r = radiusKmOf(node);
      if (!(r > 0)) continue;
      // The star's own name where it has one, qualified by its system when several systems could
      // otherwise field a star called "A" — a strip of eight identical labels is not a comparison.
      const name = String(vs.name || node.name || sys.name || vs.id);
      out.push({
        id: `${sys.id}:${vs.id}`, name,
        diameterKm: r * 2, role: 'star', colorHex: vs.color, node
      });
    }
  }
  return out;
}

/**
 * The localStorage key for a map's hidden set. PER MAP, because "I do not want to look at the moons
 * of this system" says nothing about the next one.
 *
 * IN LOCALSTORAGE RATHER THAN IN THE CAMPAIGN FILE, deliberately: what a viewer has chosen not to
 * look at is a fact about the viewer, not about the system, and a hidden set that rode the save
 * would travel to every player who opened the map and to every GM the file was shared with. The
 * owner may want to reverse that when this view reaches the Player tier — a GM hiding the moons for
 * everyone is a legitimate thing to want — and that is a change to WHERE this lives, nothing else.
 */
export function hiddenKey(scope: 'system' | 'starmap', id: string | null | undefined): string {
  return `sse.sizeComparison.hidden.${scope}.${id ?? 'none'}`;
}

export function loadHidden(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();   // a private window, cleared data, or a value someone else wrote
  }
}

export function saveHidden(key: string, ids: ReadonlySet<string>): void {
  try {
    if (ids.size) localStorage.setItem(key, JSON.stringify([...ids]));
    else localStorage.removeItem(key);   // an empty set is an absent key, not a stored "[]"
  } catch {
    /* storage refused: the view still works, it just will not remember */
  }
}
