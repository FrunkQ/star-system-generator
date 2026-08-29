import { describe, it, expect } from 'vitest';
import { autoPairName, contextPeerIds, dominantMemberOf, isBarycentre, pairMembersOf } from './barycentres';
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
