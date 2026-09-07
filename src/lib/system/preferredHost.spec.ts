// WHICH HOST A PASTE OPENS ON. Owner, 2026-09-06: *"by default bias the orbit to what it is -
// planets on stars, moons on planets.... otherwise star... be smart about it"*, and in the same
// breath *"always try to put something there - i moved saturn to orbit jupiter and it worked fine"*.
//
// Those two sentences are one rule and its limit: BIAS THE DEFAULT, RESTRICT NOTHING. So every test
// below asserts which host comes up FIRST, and the last one asserts that the odd placements are
// still on the list - because the failure that would matter most here is a "smart" default quietly
// becoming a rule that argues with the GM.
import { describe, it, expect } from 'vitest';
import { preferredHost, hostCandidates, hostRole } from './reparent';
import type { System, CelestialBody, Barycenter } from '$lib/types';

const body = (id: string, roleHint: string, parentId: string | null, massKg = 1e24): CelestialBody =>
  ({ id, name: id, kind: 'body', roleHint, parentId, massKg } as unknown as CelestialBody);

/** A star, two planets, a moon - listed MOON FIRST, because `system.nodes` order is arbitrary and
 *  taking `hosts[0]` is exactly the behaviour this replaces. */
function sol(): System {
  return {
    id: 's', name: 'Sol',
    nodes: [
      body('luna', 'moon', 'earth', 7.3e22),
      body('earth', 'planet', 'sol', 6e24),
      body('jupiter', 'planet', 'sol', 1.9e27),
      body('sol', 'star', null, 2e30)
    ]
  } as unknown as System;
}

/** A two-star pair with a planet round the pair - the case a naive role test gets wrong. */
function binary(): System {
  const bary = { id: 'pair', name: 'Pair', kind: 'barycenter', parentId: null, memberIds: ['a', 'b'] } as unknown as Barycenter;
  return {
    id: 'b', name: 'Binary',
    nodes: [
      body('rock', 'planet', 'pair', 5e24),
      bary,
      body('a', 'star', 'pair', 2e30),
      body('b', 'star', 'pair', 1e30)
    ]
  } as unknown as System;
}

describe('the paste opens on a host that suits what is being pasted', () => {
	it('offers a STAR for a planet, not whatever was listed first', () => {
		const system = sol();
		const hosts = hostCandidates(system);
		// ABSOLUTE: the old behaviour is `hosts[0]`, and in this system that is the MOON. If this
		// ever returns 'luna' again, the bias has been lost.
		expect(hosts[0].id, 'the fixture must actually start with the wrong answer').toBe('luna');
		expect(preferredHost(system, hosts, { roleHint: 'planet' })?.id).toBe('sol');
	});

	it('offers a PLANET for a moon', () => {
		const system = sol();
		expect(preferredHost(system, hostCandidates(system), { roleHint: 'moon' })?.id).toBe('earth');
	});

	it('offers a star for anything that keeps its role wherever it goes', () => {
		// A star, a belt, a ring, a construct: `roleHintUnderHost` is true of every host for these,
		// so the role test cannot choose, and the owner's fallback applies - "otherwise star".
		const system = sol();
		const hosts = hostCandidates(system);
		for (const role of ['star', 'belt', 'ring', 'construct', undefined]) {
			expect(preferredHost(system, hosts, { roleHint: role })?.id, String(role)).toBe('sol');
		}
	});

	it('offers the PAIR for a planet of a binary, not one of its stars', () => {
		// The case a hand-written role test gets wrong. `roleHintUnderHost` resolves a barycentre to
		// its heaviest member, so a planet stays a planet under the pair - and the pair is listed
		// before either star here, which is what a circumbinary planet actually orbits.
		const system = binary();
		const hosts = hostCandidates(system);
		expect(preferredHost(system, hosts, { roleHint: 'planet' })?.id).toBe('pair');
	});

	it('resolves a pair to its heaviest member, which is what hostRole is for', () => {
		// The extraction that made "moons on planets" expressible at all: `roleHintUnderHost`
		// collapses a planet host and a moon host into one answer ('moon'), so it cannot tell them
		// apart and the bias needed the host's OWN role. One walk, two callers.
		const system = binary();
		const pair = system.nodes.find((n) => n.id === 'pair')!;
		expect(hostRole(system, pair)).toBe('star');
		expect(hostRole(sol(), sol().nodes.find((n) => n.id === 'luna')!)).toBe('moon');
	});

	it('says nothing when there is nothing to say', () => {
		expect(preferredHost(sol(), [], { roleHint: 'planet' })).toBeNull();
	});

	it('BIASES THE DEFAULT AND RESTRICTS NOTHING - Saturn may still orbit Jupiter', () => {
		// The owner's own example, and the line this must not cross: the default is a suggestion.
		// Every host stays on the list, including the ones the bias passed over.
		const system = sol();
		const hosts = hostCandidates(system);
		const ids = hosts.map((h) => h.id);
		expect(ids, 'a planet under a planet must still be offerable').toContain('jupiter');
		expect(ids, 'and a planet under a moon, which is odder still').toContain('luna');
		// The bias chose the star; it did not shorten the list it chose from.
		expect(preferredHost(system, hosts, { roleHint: 'planet' })?.id).toBe('sol');
		expect(hosts.length).toBe(4);
	});
});
