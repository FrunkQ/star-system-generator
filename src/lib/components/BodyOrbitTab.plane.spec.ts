// WHICH PLANE IS THE INCLINATION MEASURED FROM? The Orbit tab says, for the body in hand.
//
// A106 put Inclination and the Longitude of the Ascending Node in the open, and a number with no
// stated reference plane is half a fact: a moon's are quoted in its PARENT'S EQUATOR (so Saturn's
// inner moons read 0 and sit in the ring plane), everything else's in the SYSTEM plane, and a moon
// whose orbit declares `frame: 'ecliptic'` follows the system plane too (`system/satelliteFrame`).
//
// The hint must never be a second opinion. So besides reading the words, every case here asks the
// PROPAGATOR's own gate (`satelliteTiltRad`) and requires the two to agree - a hint that drifted
// from the walk would be worse than no hint.
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, it, expect, afterEach } from 'vitest';
import BodyOrbitTab from './BodyOrbitTab.svelte';
import { starmapStore } from '$lib/starmapStore';
import { orbitReferencePlane, satelliteTiltRad } from '$lib/system/satelliteFrame';

const orbit = (hostId: string, extra: Record<string, unknown> = {}) =>
	({ hostId, hostMu: 1e15, t0: 0, elements: { a_AU: 0.01, e: 0, i_deg: 1, omega_deg: 0, Omega_deg: 0, M0_rad: 0 }, ...extra });
const sun: any = { id: 's', name: 'Sol', kind: 'body', roleHint: 'star', parentId: null, massKg: 1.989e30, radiusKm: 695700, axial_tilt_deg: 7.25, tags: [] };
const saturn: any = { id: 'sat', name: 'Saturn', kind: 'body', roleHint: 'planet', parentId: 's', massKg: 5.68e26, radiusKm: 58232, axial_tilt_deg: 26.73, tags: [], orbit: orbit('s') };
const upright: any = { ...saturn, id: 'up', name: 'Upright', axial_tilt_deg: undefined };
const bary: any = { id: 'b', name: 'Pair', kind: 'barycenter', parentId: 's', memberIds: ['m1', 'm2'], effectiveMassKg: 2e24, tags: [], orbit: orbit('s') };
const rogue: any = { id: 'r', name: 'Rogue', kind: 'body', roleHint: 'planet', parentId: null, massKg: 5e24, radiusKm: 6000, axial_tilt_deg: 40, tags: [] };
const moon = (parent: any, extra: Record<string, unknown> = {}): any =>
	({ id: 'm', name: 'Moon', kind: 'body', roleHint: 'moon', parentId: parent.id, massKg: 1e20, radiusKm: 200, tags: [], orbit: orbit(parent.id, extra) });

async function hintFor(body: any, parent: any) {
	const system: any = { id: 'sys', name: 'sys', epochT0: 0, nodes: [sun, saturn, upright, bary, rogue, body] };
	const { container, unmount } = render(BodyOrbitTab, { props: { body, parentBody: parent, system } });
	await tick();
	const el = container.querySelector('.plane-hint');
	expect(el, 'the hint sits with the inclination and node fields').not.toBeNull();
	// It belongs to the block that holds the node field, directly under the inclination.
	expect(el!.closest('.form-group')!.querySelector('#asc-node')).not.toBeNull();
	const text = el!.textContent!.trim();
	unmount(); // one tab at a time: two mounted tabs would share their field ids
	return text;
}

afterEach(() => starmapStore.set(null));

describe('the Orbit tab names the plane the inclination is measured from', () => {
	it('a moon of a tilted planet: its PARENT\'S EQUATOR, with the tilt that carries it out of the system plane', async () => {
		const m = moon(saturn);
		const hint = await hintFor(m, saturn);
		expect(hint).toMatch(/Saturn's equator/);
		expect(hint).toContain('26.7°');
		expect(orbitReferencePlane(m, saturn)).toBe('parent-equator');
		expect(satelliteTiltRad(m, saturn)).toBeCloseTo((26.73 * Math.PI) / 180, 12);
	});

	it('a moon of a planet with no tilt set: still the equator, and no invented angle', async () => {
		const m = moon(upright);
		const hint = await hintFor(m, upright);
		expect(hint).toMatch(/Upright's equator/);
		expect(hint).not.toMatch(/tilted/);
		expect(hint).not.toMatch(/\d°\s*to the system plane/);
	});

	it('a moon whose orbit declares itself ecliptic-framed: the SYSTEM plane, and it says why not the equator', async () => {
		const m = moon(saturn, { frame: 'ecliptic' });
		const hint = await hintFor(m, saturn);
		expect(hint).toMatch(/measured from the system plane/);
		expect(hint).toMatch(/not from Saturn's equator/);
		expect(orbitReferencePlane(m, saturn)).toBe('system-declared');
		expect(satelliteTiltRad(m, saturn)).toBe(0);
	});

	it('a planet of a star: the system plane, whatever the star\'s own tilt', async () => {
		const hint = await hintFor(saturn, sun);
		expect(hint).toMatch(/measured from the system plane/);
		expect(hint).not.toMatch(/equator/);
		expect(satelliteTiltRad(saturn, sun)).toBe(0);
	});

	it('a member of a pair, orbiting a barycentre: the system plane', async () => {
		const m = moon(bary);
		const hint = await hintFor(m, bary);
		expect(hint).toMatch(/measured from the system plane/);
		expect(hint).not.toMatch(/equator/);
		expect(satelliteTiltRad(m, bary)).toBe(0);
	});

	it('a moon of the system\'s ROOT world (a rogue planet): the system plane, as the propagator has it', async () => {
		const m = moon(rogue);
		const hint = await hintFor(m, rogue);
		expect(hint).toMatch(/measured from the system plane/);
		expect(hint).not.toMatch(/equator/);
		expect(satelliteTiltRad(m, rogue)).toBe(0);
	});

	it('the words and the walk never part: equator in the hint if and only if the propagator rotates', async () => {
		const tilted = { ...saturn };
		const cases: [any, any][] = [
			[moon(tilted), tilted], [moon(tilted, { frame: 'ecliptic' }), tilted], [moon(tilted, { frame: 'ECLIPTIC' }), tilted],
			[saturn, sun], [moon(bary), bary], [moon(rogue), rogue]
		];
		for (const [node, parent] of cases) {
			const hint = await hintFor(node, parent);
			const rotates = satelliteTiltRad(node, parent) !== 0;
			// "measured from X's equator", as against "measured from the system plane[, not from X's equator]".
			expect(/are measured from (?!the system plane)/.test(hint), `${node.name} about ${parent.name}`).toBe(rotates);
			expect(/are measured from the system plane/.test(hint), `${node.name} about ${parent.name}`).toBe(!rotates);
		}
	});
});
