// THE ONLY PLACE THAT KNOWS A BODY CAN WEAR CONSTRUCT CHROME. (G53 phase 1,
// docs/dev/mega-constructs-design.md §3.3.)
//
// The hybrid (a mega-construct, or later an asteroid-as-place) is `kind: 'body'` so that every
// physics gate — gravity, barycentres, hierarchy, classification — already works, and the CHROME is
// what gets taught. The two facts below are ORTHOGONAL, and conflating them was a real error in an
// earlier draft of the design: an asteroid presented as a place is entirely natural and still wants
// construct chrome.
//
//   |                                | kind        | showsAsConstruct | isArtificial |
//   | Death Star, ringworld, shell   | 'body'      | true             | true         |
//   | asteroid as a PLACE (§3.7)     | 'body'      | true             | false — real rock, derive it |
//   | ordinary station (ISS, Ceres)  | 'construct' | true             | (not consulted — no physics path ever sees a construct) |
//   | planet                         | 'body'      | false            | false        |
//
// MIGRATION IS DELIBERATELY LAZY. The 154 existing `kind === 'construct'` sites are NOT re-pointed
// here in one sweep; they migrate to `showsAsConstruct()` as they are touched, because the failure
// modes are asymmetric (§3.1): a chrome site not yet migrated shows a hybrid as a sphere in a body
// list — legible, obviously wrong to a human eye, and fixed when seen — while a physics site wrongly
// taught would be silently incorrect. New view code must call these predicates, never test `kind`
// or the raw flags directly, so the convention cannot fork (the G43 five-rival-conventions lesson).
//
// PHASE 1 CARRIES NO HYBRID YET: nothing in the shipped data sets `constructChrome` on a body, so
// today both predicates agree exactly with the `kind` test everywhere. The module exists first so
// that every site touched from now on migrates to the one convention before the flip (phase 5).
import type { CelestialBody } from '$lib/types';

/** Present and handle this node as a PLACE, not a world: glyph, dock, construct lists. True for
 *  every ordinary construct and for any body wearing construct chrome. */
export function showsAsConstruct(node: Pick<CelestialBody, 'kind' | 'constructChrome'>): boolean {
  return node.kind === 'construct' || node.constructChrome === true;
}

/** BUILT, not formed — so its composition is DECLARED, never derived (§3.4 item 1). Reads the
 *  `artificial` flag alone: for `kind: 'construct'` the answer is not consulted by anything (no
 *  physics path ever sees a construct), and when constructs migrate through this seam they gain the
 *  flag explicitly rather than being guessed at. */
export function isArtificial(node: Pick<CelestialBody, 'artificial'>): boolean {
  return node.artificial === true;
}
