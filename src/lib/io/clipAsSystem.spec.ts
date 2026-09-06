// A CLIP AS A SYSTEM OF ITS OWN — the starmap's paste into empty space. Owner, 2026-09-06:
// *"We also need to be able to paste a star system into the starmap level in the same way. eg -
// copy from source - paste in empty space on starmap"*, and *"people will generally only be copying
// systems from the explorers site"* — so this is the COMMON case, not the exotic one.
//
// The clone it shares with `insertClip` is the one that produced a real defect when it remapped only
// `parentId` and `orbit.hostId` and left an autopilot pointing at the source map's ship. It is one
// function now. THE REGRESSION GATE FOR THAT EXTRACTION IS `hubClip.spec.ts` ITSELF - its suite
// exercises `insertClip` against realistic fixtures and passed unchanged when the clone was lifted
// out, which is stronger evidence than anything a synthetic system here could give. (A hand-built
// orbit in this file has no `elements`, so `reparentBody` cannot propagate it - the fixture would be
// testing the fixture.) What is asserted below is the NEW path.
import { describe, it, expect } from 'vitest';
import { systemNodesFromClip } from './hubClip';
import type { HubClip } from './hubClip';

const clip = (nodes: any[], root = 'r', extra: Partial<HubClip> = {}): HubClip =>
  ({ sseClip: 1, root, nodes, ...extra }) as HubClip;

const star = (id = 'r', name = 'Sol') => ({ id, name, kind: 'body', roleHint: 'star', parentId: null, massKg: 2e30 });
const planet = (id: string, parentId: string, name = id) =>
  ({ id, name, kind: 'body', roleHint: 'planet', parentId, massKg: 6e24, orbit: { hostId: parentId, a_AU: 1, hostMu: 1.3e20, t0: 5 } });

describe('a star and what orbits it becomes a system', () => {
	it('makes the star the root: no parent and NO ORBIT', () => {
		// The top of a system goes round nothing. Keeping the old orbit would leave the star of a new
		// system describing a path about a host that is not in this map at all.
		const out = systemNodesFromClip(clip([{ ...star(), orbit: { hostId: 'gone', a_AU: 40 } }, planet('p', 'r')]));
		expect(out.ok).toBe(true);
		if (!out.ok) return;
		const rootNode = out.nodes.find((n: any) => n.id === out.rootId);
		expect(rootNode.parentId, 'a system root has no parent').toBeNull();
		expect('orbit' in rootNode, 'and no orbit').toBe(false);
		expect(out.name).toBe('Sol');
		expect(out.count).toBe(2);
	});

	it('keeps what orbits the star orbiting it, under the NEW ids', () => {
		const out = systemNodesFromClip(clip([star(), planet('p', 'r', 'Earth')]));
		if (!out.ok) throw new Error('should have built');
		const child = out.nodes.find((n: any) => n.name === 'Earth');
		expect(child.id, 'ids are re-minted').not.toBe('p');
		expect(child.parentId).toBe(out.rootId);
		expect(child.orbit.hostId, 'the orbit follows the id').toBe(out.rootId);
		expect(child.orbit.a_AU, 'and its elements are untouched').toBe(1);
	});

	it('rewrites EVERY reference, not just the obvious two', () => {
		// The defect this clone was fixed for: a construct carries ids far from its orbit - an
		// autopilot's legs, an avoid-list, a docking target. A second copy of the walk would have
		// been free to forget that again, which is why there is only one.
		const ship = {
			id: 's', name: 'Tender', kind: 'construct', roleHint: 'ship', parentId: 'p',
			autopilot: { enabled: true, legs: [{ placeId: 'p' }] },
			avoidPlaceIds: ['p', 'not-in-this-clip'],
			dockedTo: 'p'
		};
		const out = systemNodesFromClip(clip([star(), planet('p', 'r'), ship]));
		if (!out.ok) throw new Error('should have built');
		const copied = out.nodes.find((n: any) => n.name === 'Tender');
		const newPlanetId = out.nodes.find((n: any) => n.id !== out.rootId && n.kind === 'body').id;
		expect(copied.autopilot.legs[0].placeId).toBe(newPlanetId);
		expect(copied.avoidPlaceIds[0]).toBe(newPlanetId);
		expect(copied.dockedTo).toBe(newPlanetId);
		// A reference to something NOT copied is left exactly as it was rather than guessed at.
		expect(copied.avoidPlaceIds[1]).toBe('not-in-this-clip');
		// And the route is stood down, because its stops are places in another campaign.
		expect(copied.autopilot.enabled, 'a pasted ship does not carry on flying somebody else’s plan').toBe(false);
	});

	it('carries the credit, which is the easiest thing in the feature to lose', () => {
		const out = systemNodesFromClip(
			clip([star(), planet('p', 'r')], 'r', { source: { title: 'Gamma', creator: 'carol', url: 'https://x/s/g#node=r' } })
		);
		if (!out.ok) throw new Error('should have built');
		expect(out.credit?.creator).toBe('carol');
		expect(out.credit?.title).toBe('Gamma');
		expect(out.credit?.nodeIds?.length, 'the credit covers what arrived').toBe(2);
	});
});

describe('what cannot become a system says so, rather than being hidden', () => {
	it('refuses a planet, and names what it actually is', () => {
		// Owner: "show but grey out if not applicable". The menu needs a REASON to put in the tooltip,
		// so the refusal is a sentence rather than a false.
		const out = systemNodesFromClip(clip([planet('r', 'x', 'Earth')]));
		expect(out.ok).toBe(false);
		if (out.ok) return;
		expect(out.problem).toMatch(/only a star/i);
		expect(out.problem, 'and it says what you actually have').toContain('Planet Earth');
	});

	it('refuses a ship and an empty clip too', () => {
		const ship = { id: 'r', name: 'Tender', kind: 'construct', roleHint: 'ship', parentId: null };
		expect(systemNodesFromClip(clip([ship])).ok).toBe(false);
		expect(systemNodesFromClip(clip([])).ok).toBe(false);
	});
});
