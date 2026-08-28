// THE REGION OF INTEREST — the ONE answer to "what does selecting this body bring into view".
//
// Owner, 2026-08-26, naming the concept and asking for it to be reused: *"Selection generally shows
// itself - all children and all parents & siblings. Children of siblings or parents are not shown"*
// and *"stay consistent - we call this a 'region of interest' selection - and reuse it where
// possible"*.
//
// THE RULE, and the shape of it is the point: you descend from YOURSELF ONLY. Everything else in the
// set is there so you can see where you sit, not so you can see what it contains.
//   - self
//   - every ANCESTOR, all the way to the root (parent, grandparent, ...)
//   - every SIBLING (anything sharing your parent)
//   - every DESCENDANT of your own (children, their children, ...)
//   - and nothing else: NOT a sibling's children, NOT an ancestor's other children (aunts/uncles)
//
// **A CIRCUMBINARY BODY IS A SIBLING AND NEEDS NO SPECIAL CASE** (owner, same day: *"circumbinary
// naturally counts as sibling"*). A pair's members and anything orbiting the pair all carry the
// barycentre as `parentId`, so selecting Pluto puts Charon AND every circumbinary moon in the set by
// the plain sibling rule, and puts the barycentre in it as the parent — which is what makes the
// pair's annulus drawable from the selection without a rule of its own.
//
// WHY ONE MODULE: this scoping was written twice with two different answers — the Hill-sphere
// overlay did "self + immediate parent + siblings + direct children" and the Lagrange overlay did
// "self + siblings + direct children", so the same selection lit different things depending on which
// overlay was on. Both were also one level deep in each direction, which the rule above is not.
// Anything that narrows a display by selection comes HERE; do not write a third answer.

import type { CelestialBody, Barycenter } from '../types';

type Node = CelestialBody | Barycenter;

/** The ids in the region of interest for `focusedId`.
 *
 *  Returns `null` when nothing is selected, meaning NO NARROWING — every caller should read null as
 *  "show everything", which is the behaviour each overlay already had with no selection. Returning a
 *  set containing everything would be a lie of a different kind: it would say the root's region of
 *  interest happens to be the whole system, when what is true is that no region was asked for. */
export function regionOfInterest(nodes: Node[], focusedId: string | null | undefined): Set<string> | null {
  if (!focusedId) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const focused = byId.get(focusedId);
  if (!focused) return null;

  const out = new Set<string>([focusedId]);

  // ANCESTORS — the whole chain, not just the parent. A moon of a moon of a planet should still show
  // you the star it all hangs off. Guarded against a cyclic parent chain, which corrupt saves do
  // produce (the same guard `zones.stellarContextFor` carries, for the same reason).
  let cursor: Node | undefined = focused;
  for (let depth = 0; cursor?.parentId && depth < 32; depth++) {
    if (out.has(cursor.parentId)) break;
    out.add(cursor.parentId);
    cursor = byId.get(cursor.parentId);
  }

  // SIBLINGS — anything sharing the selection's parent. This is the rule that quietly covers
  // circumbinary bodies, pair members, and co-orbital trojans, none of which need naming here.
  if (focused.parentId) {
    for (const n of nodes) if (n.parentId === focused.parentId && n.id !== focusedId) out.add(n.id);
  }

  // DESCENDANTS — all of them, breadth-first from the selection only. `seen` stops a cycle turning
  // this into an infinite walk.
  const childrenOf = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    if (!childrenOf.has(n.parentId)) childrenOf.set(n.parentId, []);
    childrenOf.get(n.parentId)!.push(n.id);
  }
  const queue = [focusedId];
  const seen = new Set<string>([focusedId]);
  while (queue.length) {
    for (const childId of childrenOf.get(queue.shift()!) ?? []) {
      if (seen.has(childId)) continue;
      seen.add(childId);
      out.add(childId);
      queue.push(childId);
    }
  }

  return out;
}

/** Convenience for the overlays: is this id in view, given a region (or null for "no selection")? */
export function inRegionOfInterest(region: Set<string> | null, id: string): boolean {
  return region === null || region.has(id);
}
