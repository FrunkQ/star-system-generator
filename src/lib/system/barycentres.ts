// Barycentres are PAIR CONTAINERS, not objects. One place says what that means for the rest of the app,
// so the 2D orrery, the 3D holo and the editor can't drift on it.
//
// A barycentre is a mathematical point BETWEEN two bodies. It has no surface, no radius and nothing to
// look at, and each member orbits it at its own mass-weighted share of the pair separation — so the two
// members sit on OPPOSITE sides of it at DIFFERENT distances. Treating it as an ordinary parent breaks
// navigation in two ways this module exists to prevent:
//   * framing a member "with its parent" frames only the empty point, cutting the partner out of shot —
//     and asymmetrically, since the near member's frame reaches the far one but never the reverse (in
//     Alpha Centauri you could step from Rigil Kentaurus to Toliman and then never back);
//   * a barycentre has no close-up, so a "fill the screen with it" step lands on a view of empty space.
//
// Note the spelling split, per the project convention: UK English in code and UI, but the serialised
// node kind stays the shipped `'barycenter'`.
import type { Barycenter, CelestialBody, System, SystemNode } from '$lib/types';

type AnyNode = SystemNode | CelestialBody | Barycenter;

export function isBarycentre(node: AnyNode | null | undefined): boolean {
	return !!node && (node as any).kind === 'barycenter';
}

/** Mass for ranking — a barycentre carries the pair's combined mass under a different field. */
function massOf(node: AnyNode | null | undefined): number {
	if (!node) return 0;
	return isBarycentre(node) ? ((node as Barycenter).effectiveMassKg || 0) : ((node as CelestialBody).massKg || 0);
}

/**
 * The bodies that make up a barycentre — its declared members, plus anything else parented to it that the
 * member list has fallen behind on (hand-edited files, a partly-applied reconcile pass). Excludes the
 * circumbinary children that merely ORBIT the pair: those sit outside the separation and are satellites,
 * not halves of it.
 */
export function pairMembersOf(system: System | null, baryId: string): AnyNode[] {
	if (!system) return [];
	const declared = new Set<string>(
		((system.nodes.find((n) => n.id === baryId) as Barycenter | undefined)?.memberIds ?? []) as string[]
	);
	return system.nodes.filter((n) => declared.has(n.id));
}

/**
 * A barycentre's dominant member — the heaviest body of the pair. This is the body a barycentre "means"
 * wherever a real object is needed: naming the thing a circumbinary planet orbits, or resolving a click
 * on the pair to something that can actually be shown. Nested pairs resolve through to a real body.
 */
export function dominantMemberOf(system: System | null, baryId: string): AnyNode | null {
	const members = pairMembersOf(system, baryId);
	if (!members.length) return null;
	const heaviest = members.reduce((best, m) => (massOf(m) > massOf(best) ? m : best), members[0]);
	return isBarycentre(heaviest) ? dominantMemberOf(system, heaviest.id) ?? heaviest : heaviest;
}

/**
 * The names of the real bodies a barycentre holds, FLATTENED through any nested pairs — so a hierarchy
 * like Alpha Centauri's (a pair of stars paired again with a third) reads as the three stars it actually
 * contains rather than "Barycentre (Barycentre)", which named nothing the user can see.
 */
export function pairBodyNames(system: System | null, baryId: string): string[] {
	const out: string[] = [];
	const walk = (id: string, depth: number) => {
		if (depth > 8) return; // a corrupt cycle must not hang the editor
		for (const m of pairMembersOf(system, id)) {
			if (isBarycentre(m)) walk(m.id, depth + 1);
			else out.push((m as CelestialBody).name ?? '');
		}
	};
	walk(baryId, 0);
	return out.filter(Boolean);
}

/**
 * How to name a barycentre in the UI: the point's own name plus the bodies it holds, e.g.
 * "Alpha Centauri Barycentre (Rigil Kentaurus + Toliman)". A barycentre is invisible and unselectable,
 * so naming it alone leaves the user with no idea what is being orbited.
 */
export function barycentreLabel(system: System | null, bary: AnyNode): string {
	const names = pairBodyNames(system, bary.id);
	const own = (bary as any).name ?? '';
	return names.length ? `${own} (${names.join(' + ')})` : own;
}

/**
 * The peers that define an object's CONTEXT frame (the click ladder's level 1 — "the object and what it
 * belongs to"). Normally that is just the framing parent. When the parent is a BARYCENTRE it is the
 * pair's members instead: framing to the empty point alone loses the partner, and a pair should always
 * frame as a pair, from either half, so you can step straight from one star to the other.
 *
 * Returned as IDs so each renderer measures the distance in its own space (AU for the orrery, scene units
 * for the holo) and so a renderer that has no object for the barycentre itself — the holo draws no mesh
 * for one — simply finds nothing for that id and measures to the members it does have.
 */
export function contextPeerIds(system: System | null, nodeId: string, framingParentId: string | null): string[] {
	if (!system || !framingParentId) return [];
	const parent = system.nodes.find((n) => n.id === framingParentId);
	if (!isBarycentre(parent)) return [framingParentId];
	const peers = pairMembersOf(system, framingParentId)
		.map((m) => m.id)
		.filter((id) => id !== nodeId);
	// Keep the barycentre in the list: for a CIRCUMBINARY child it is the centre of the orbit being
	// framed, and a renderer that can place it gets a sane frame even if the member list is empty.
	return [framingParentId, ...peers];
}
