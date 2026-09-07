import { describe, it, expect } from 'vitest';
import { autoPairName, contextPeerIds, dominantMemberOf, isBarycentre, pairMembersOf, systemRootNode } from './barycentres';
import { availableFrameLevels, frameForLevel } from '../viewport/camera';
import type { System } from '../types';

// A real-shaped stellar pair: the members sit on OPPOSITE sides of the barycentre at their own
// mass-weighted share of the separation, so they are at DIFFERENT distances from it (Alpha Centauri:
// the heavier A at ~10.3 AU, B at ~18.3 AU, 28.6 AU apart). A circumbinary planet orbits the pair.
const pairSystem = {
  nodes: [
    { id: 'bary', kind: 'barycenter', parentId: null, name: 'A-B Barycentre', memberIds: ['a', 'b'] },
    { id: 'a', kind: 'body', roleHint: 'star', parentId: 'bary', name: 'A', radiusKm: 854400, massKg: 2.2e30 },
    { id: 'b', kind: 'body', roleHint: 'star', parentId: 'bary', name: 'B', radiusKm: 600000, massKg: 1.2e30 },
    { id: 'p', kind: 'body', roleHint: 'planet', parentId: 'bary', name: 'P', radiusKm: 6371, massKg: 6e24 }
  ]
} as unknown as System;

const pairPos = new Map<string, { x: number; y: number }>([
  ['bary', { x: 0, y: 0 }],
  ['a', { x: -10.3, y: 0 }],
  ['b', { x: 18.3, y: 0 }],
  ['p', { x: 0, y: 120 }]
]);

const canvas = { width: 1280, height: 720 } as HTMLCanvasElement;
const frame = (nodeId: string, level: number) =>
  frameForLevel({
    nodeId, level, system: pairSystem, canvas, currentPan: { x: 0, y: 0 }, currentZoom: 1,
    toytownFactor: 0, scaledWorldPositions: new Map(), worldPositions: pairPos, x0_distance: 1
  });
// Half the view's SHORT dimension in AU — the extent the ladder actually fits.
const halfViewAU = (zoom: number) => (canvas.height / 2) / zoom;
const levels = (nodeId: string) =>
  availableFrameLevels({
    nodeId, system: pairSystem, toytownFactor: 0,
    scaledWorldPositions: new Map(), worldPositions: pairPos
  });

describe('barycentres are pair containers', () => {
  it('identifies members, the dominant member and context peers', () => {
    expect(isBarycentre(pairSystem.nodes[0])).toBe(true);
    expect(isBarycentre(pairSystem.nodes[1])).toBe(false);
    // The circumbinary planet orbits the pair but is NOT half of it.
    expect(pairMembersOf(pairSystem, 'bary').map((n) => n.id)).toEqual(['a', 'b']);
    expect(dominantMemberOf(pairSystem, 'bary')?.id).toBe('a');
    // A member's context is its PARTNER (plus the point itself), not the bare point.
    expect(contextPeerIds(pairSystem, 'a', 'bary')).toEqual(['bary', 'b']);
    expect(contextPeerIds(pairSystem, 'b', 'bary')).toEqual(['bary', 'a']);
    // An ordinary parent is just itself.
    expect(contextPeerIds(pairSystem, 'moon', 'a')).toEqual(['a']);
  });

  it('frames a pair as a pair from EITHER half, symmetrically', () => {
    // The bug this pins: framing to the barycentre POINT gave B a 18.3 AU reach while its partner sat
    // 28.6 AU away on the other side — so you could step from A to B and then never back.
    const fromA = frame('a', 1);
    const fromB = frame('b', 1);
    expect(halfViewAU(fromA.zoom)).toBeCloseTo(halfViewAU(fromB.zoom), 6); // identical frame either way
    // Each star's partner is genuinely inside its own context frame.
    for (const [f, partner] of [[fromA, 'b'], [fromB, 'a']] as const) {
      const half = halfViewAU(f.zoom);
      const p = pairPos.get(partner)!;
      expect(Math.abs(p.x - f.pan.x)).toBeLessThanOrEqual(half);
    }
  });

  it('gives a barycentre no close-up rung — there is nothing there to look at', () => {
    // A radius-less point at level 3 framed a few thousandths of an AU of empty space.
    expect(levels('bary')).toEqual([2]);        // root pair: its members, and nothing else
    expect(levels('bary')).not.toContain(3);
    // Its members keep the full ladder, context last.
    expect(levels('a')).toEqual([3, 1]);
    expect(levels('b')).toEqual([3, 1]);
  });

  it('frames a circumbinary child against the whole pair', () => {
    const f = frame('p', 1);
    const half = halfViewAU(f.zoom);
    expect(half).toBeGreaterThanOrEqual(120); // reaches back to the pair it orbits
  });
});

// THE AUTO NAME FOR A NEW PAIR. Owner's screenshot, 2026-08-28: promoting a trojan and its companion
// produced "Jupiter L4 Trojan-Jupiter L4 Trojan I Barycentre" - 47 characters saying one thing twice,
// and long enough that the picker row it captioned had no space left for the body's own name. A
// companion is normally named FROM its primary, so the joined form repeats the shared part by
// construction; this is not a rare case, it is the DEFAULT one for anything created as a companion.
describe('autoPairName', () => {
	it('collapses the shared prefix, which is what a companion name always has', () => {
		expect(autoPairName('Jupiter L4 Trojan', 'Jupiter L4 Trojan I')).toBe('Jupiter L4 Trojan Pair');
		expect(autoPairName('Alpha Centauri A', 'Alpha Centauri B')).toBe('Alpha Centauri Pair');
		expect(autoPairName('PS21 Ba', 'PS21 Bb')).toBe('PS21 Pair');
	});

	it('KEEPS the joined form when the two names share nothing - there it is the informative one', () => {
		expect(autoPairName('Pluto', 'Charon')).toBe('Pluto-Charon Barycentre');
		expect(autoPairName('Rigil Kentaurus', 'Toliman')).toBe('Rigil Kentaurus-Toliman Barycentre');
	});

	it('matches WHOLE WORDS only, so a coincidental letter run is not a shared name', () => {
		expect(autoPairName('Mars', 'Marsha')).toBe('Mars-Marsha Barycentre');
		expect(autoPairName('Io', 'Ion')).toBe('Io-Ion Barycentre');
	});

	it('never returns something longer than the two names joined - the whole point', () => {
		for (const [a, b] of [['Jupiter L4 Trojan', 'Jupiter L4 Trojan I'], ['Alpha Centauri A', 'Alpha Centauri B'],
		                      ['Pluto', 'Charon'], ['Mars', 'Marsha']]) {
			expect(autoPairName(a, b).length).toBeLessThanOrEqual(`${a}-${b} Barycentre`.length);
		}
	});

	it('survives a missing name rather than producing "-X Barycentre"', () => {
		expect(autoPairName('', 'Charon')).toBe('Charon Barycentre');
		expect(autoPairName('Pluto', '')).toBe('Pluto Barycentre');
	});
});

describe('systemRootNode: which node is the top of a system', () => {
	it('takes the PAIR CONTAINER of a binary, not either of its stars', () => {
		// THE WHOLE REASON THIS IS SHARED. Both stars are parented to the barycentre, so a naive
		// "first node with no parent" would still land on the barycentre here - but only because the
		// list happens to open with it. The rule asks for the barycentre by name so the answer does
		// not depend on node order, which nothing in the format promises.
		expect(systemRootNode(pairSystem)?.id).toBe('bary');
	});

	it('finds it wherever it sits in the list', () => {
		// The order-independence, stated as its own question: the same system with the barycentre
		// LAST must give the same answer. Written because a copy of this rule that reads "the first
		// parentless node" passes the test above and fails this one.
		const shuffled = { nodes: [...(pairSystem as any).nodes].reverse() } as any;
		expect(systemRootNode(shuffled)?.id).toBe('bary');
	});

	it('takes the lone star of a single system', () => {
		const single = {
			nodes: [
				{ id: 'sun', kind: 'body', roleHint: 'star', parentId: null, name: 'Sun' },
				{ id: 'earth', kind: 'body', roleHint: 'planet', parentId: 'sun', name: 'Earth' }
			]
		} as unknown as System;
		expect(systemRootNode(single)?.id).toBe('sun');
	});

	it('never mistakes a NESTED barycentre for the top', () => {
		// A hierarchical triple: a close pair orbiting a third star. The inner barycentre has a
		// parent, so it is not the top - and copying from it would take two of the three stars.
		const triple = {
			nodes: [
				// The INNER pair is listed FIRST on purpose: a rule that asks only 'is it a barycentre'
				// and forgets to ask 'has it a parent' picks this one, and takes two stars of three.
				{ id: 'inner', kind: 'barycenter', parentId: 'outer', name: 'Inner', memberIds: ['a', 'b'] },
				{ id: 'outer', kind: 'barycenter', parentId: null, name: 'Outer', memberIds: ['c', 'inner'] },
				{ id: 'c', kind: 'body', roleHint: 'star', parentId: 'outer', name: 'C' },
				{ id: 'a', kind: 'body', roleHint: 'star', parentId: 'inner', name: 'A' },
				{ id: 'b', kind: 'body', roleHint: 'star', parentId: 'inner', name: 'B' }
			]
		} as unknown as System;
		expect(systemRootNode(triple)?.id).toBe('outer');
	});

	it('prefers the pair container when a BROKEN file leaves a star parentless too', () => {
		// THIS is what the barycentre-first clause is actually for, and it took a mutation to find
		// out: in a well-formed system the root is the ONLY parentless node, so preferring the
		// barycentre changes nothing there. It earns its place on a file that has been hand-edited
		// or half-imported, where a member has lost its parentId and now looks like a second root.
		// Answering "the star" there would copy, hide or judge a fragment of the system.
		const broken = {
			nodes: [
				{ id: 's1', kind: 'body', roleHint: 'star', parentId: null, name: 'A' },
				{ id: 'bary', kind: 'barycenter', parentId: null, name: 'A-B', memberIds: ['s1', 's2'] },
				{ id: 's2', kind: 'body', roleHint: 'star', parentId: 'bary', name: 'B' }
			]
		} as unknown as System;
		expect(systemRootNode(broken)?.id).toBe('bary');
	});

	it('says nothing rather than guessing when there is nothing to say', () => {
		expect(systemRootNode(null)).toBeNull();
		expect(systemRootNode({ nodes: [] } as unknown as System)).toBeNull();
	});
});
