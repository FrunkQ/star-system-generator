// src/lib/comparison/items.ts
// WHAT GOES ON THE STRIP, for each of the two maps.
//
// One rule decides a size and it is the TRUE one: a body's authored `radiusKm`, and a star's through
// `starRadiusKmOf` (which carries the law's default for a star with none authored). Nothing here
// consults the readable-size law, the body-size dial or the system's extent — see `layout.ts` for
// why, and the engine map entry RENDER-S51.
import { starRadiusKmOf } from '$lib/rendering/scaleLaw';
import { accretionDiscExtentKm, DISC_FLAT_COLOR } from '$lib/holo/bodyFeatures';
import { systemVisualStars } from '$lib/starmap/systemStars';
import { SORT_ORDERS, type ComparisonItem, type SortOrder } from './layout';

/** An item plus the node the scene needs to build its look. */
export interface ComparisonEntry extends ComparisonItem {
  node: any;
  /**
   * The ring's own colour, where it is not the pale ice-and-rock a planet's is: a FEEDING black
   * hole's accretion disc. Kept off `ComparisonItem` because `layout.ts` is the pure geometry and a
   * colour is not a layout question.
   */
  ringColorHex?: string;
}

/**
 * A FEEDING BLACK HOLE'S DISC, as the strip's ring fields. Real holes carry no ring node — the disc
 * is derived — so without this Sagittarius A* is a bare horizon on a view where its disc is the
 * most interesting thing about it. Quiescent holes get nothing, which is the honest difference.
 */
function discRing(node: any): { ringInnerKm: number; ringOuterKm: number; ringColorHex: string } | undefined {
  const ext = accretionDiscExtentKm(node);
  if (!ext) return undefined;
  return {
    ringInnerKm: ext.innerKm, ringOuterKm: ext.outerKm,
    ringColorHex: '#' + DISC_FLAT_COLOR.toString(16).padStart(6, '0')
  };
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
  // A body's RINGS come from its own ring nodes — which are not on the strip themselves (a ring is
  // not an object you compare against a planet) but are drawn around their host at true extent, and
  // are the reason a ringed planet is given more room than its globe needs. Several ring nodes on
  // one host read as one system: the innermost inner edge to the outermost outer.
  const ringsOf = new Map<string, { inner: number; outer: number }>();
  for (const n of nodes) {
    if (n?.roleHint !== 'ring' || !n.parentId) continue;
    const inner = Number(n.radiusInnerKm) || 0;
    const outer = Number(n.radiusOuterKm) || 0;
    if (!(outer > inner)) continue;
    const cur = ringsOf.get(String(n.parentId));
    ringsOf.set(String(n.parentId), cur
      ? { inner: Math.min(cur.inner, inner), outer: Math.max(cur.outer, outer) }
      : { inner, outer });
  }
  for (const n of nodes) {
    if (n?.kind !== 'body') continue;
    if (n.roleHint === 'belt' || n.roleHint === 'ring') continue;
    const r = radiusKmOf(n);
    if (!(r > 0)) continue;
    out.push({
      id: String(n.id), name: String(n.name ?? n.id), diameterKm: r * 2,
      role: String(n.roleHint ?? 'other'), colorHex: n.apparentColorHex,
      // For the MASS and ORBIT orders. `massKg` stays UNDEFINED when the body has none — the sort
      // puts an unknown mass last rather than treating it as zero, because a body a GM has not
      // weighed is unknown, not weightless.
      massKg: Number.isFinite(n.massKg) ? Number(n.massKg) : undefined,
      parentId: n.parentId ?? null,
      orbitAu: Number(n?.orbit?.elements?.a_AU) || undefined,
      ringInnerKm: ringsOf.get(String(n.id))?.inner,
      ringOuterKm: ringsOf.get(String(n.id))?.outer,
      node: n,
      ...discRing(n)
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
  // `starmap.systems` is `StarSystemNode[]` — a WRAPPER carrying the map position, the viewport and
  // the system's own name, with the actual `System` (and therefore the body nodes) hanging off
  // `.system`. Reading `nodes` off the wrapper gets `undefined` and an empty strip, which is exactly
  // what the first live run of this view showed on a fifty-system map; the gate below pins the shape.
  for (const entry of starmap?.systems ?? []) {
    const system = entry?.system ?? entry;
    const stars = systemVisualStars(system as any);
    for (const vs of stars) {
      const node = (system?.nodes ?? []).find((n: any) => String(n.id) === String(vs.id));
      if (!node) continue;
      const r = radiusKmOf(node);
      if (!(r > 0)) continue;
      // The star's own name where it has one; a lone star in a system usually shares the system's
      // name, and a binary's members carry their own, which is what tells "Sirius A" from "Sirius B".
      const name = String(vs.name || node.name || entry?.name || vs.id);
      out.push({
        id: `${entry?.id ?? system?.id}:${vs.id}`, name,
        diameterKm: r * 2, role: 'star', colorHex: vs.color,
        massKg: Number.isFinite(node.massKg) ? Number(node.massKg) : undefined,
        // Every star on the starmap is a ROOT: its parent (a barycentre, or its own system) is not on
        // this strip, so the orbit order degenerates to a flat row here, which is the honest answer -
        // there is no "what orbits what" between two different systems.
        parentId: null,
        node,
        ...discRing(node)
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

/**
 * The chosen ORDER, remembered beside the hidden set and keyed the same way — for the same reason.
 * Which arrangement a GM wants is a fact about how they are reading the system, not about the
 * system, so it stays out of the campaign file too.
 */
export function loadOrder(key: string): SortOrder {
  try {
    const v = localStorage.getItem(key + '.order');
    return SORT_ORDERS.some((o) => o.id === v) ? (v as SortOrder) : 'size';
  } catch {
    return 'size';
  }
}

export function saveOrder(key: string, order: SortOrder): void {
  try {
    if (order === 'size') localStorage.removeItem(key + '.order');   // the default is an absent key
    else localStorage.setItem(key + '.order', order);
  } catch {
    /* storage refused: the view still works, it just will not remember */
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
