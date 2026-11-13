// B21 - "the axis tilt always sets to 90 degrees" on a new planet or moon, and "axial tilt going to
// 90 when you edit a planet" (four reporters).
//
// THE CAUSE WAS NOT PHYSICS. A range input always HAS a value: with nothing to show it rests at its
// midpoint, which for a 0..180 slider is 90. Bound two-way to a field the body does not carry, Svelte
// writes that resting value back INTO THE BODY at mount - so merely opening the editor gave every
// tilt-less world a 90 degree axis, and the next edit of anything at all saved it. And every world
// added from the type picker was tilt-less, because that route built its body inline and never
// reached the one tilt model.
//
// jsdom rests its range inputs at 50 rather than a browser's 90 (it reads the bounds later), which
// is why nothing below asserts a 90: the fault is that ANY number appears, and "undefined" is the
// absolute form of that.
//
// A105: the tilt slider moved, with the rest of the spin block, from the Composition tab to the
// Orbit tab (`BodySpinEditor`, mounted by `BodyOrbitTab`). This gate moved with it and mounts the
// tab a GM actually opens, so it also proves the block ARRIVED - and the last describe proves it
// LEFT the Composition tab rather than being copied.
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import BodyOrbitTab from './BodyOrbitTab.svelte';
import BodyBasicsTab from './BodyBasicsTab.svelte';
import { loadStarterPack } from '$lib/import/realsky/testPack';
import { inferMissingAxialTilt } from '$lib/system/importFixup';
import { inferAxialTilt } from '$lib/physics/axialTilt';

const rulePack = loadStarterPack() as any;

function makePlanet(extra: Record<string, unknown> = {}): any {
	return { id: 'p1', kind: 'body', roleHint: 'planet', name: 'T', classes: ['planet/terrestrial'], massKg: 5.97e24, radiusKm: 6371, tags: [], ...extra };
}

describe('B21 - opening the editor never gives a body a tilt', () => {
	it('a body with no tilt still has none after the tab mounts, and reads "not set"', async () => {
		const body = makePlanet();
		const { container } = render(BodyOrbitTab, { props: { body, rulePack, showSpin: true } });
		await tick();
		expect(body.axial_tilt_deg).toBeUndefined();
		expect('axial_tilt_deg' in body).toBe(false);
		expect(container.querySelector('label[for="tilt"]')!.textContent).toMatch(/not set/i);
	});

	it('an authored tilt is shown and left exactly as it was', async () => {
		const body = makePlanet({ axial_tilt_deg: 23.4 });
		const { container } = render(BodyOrbitTab, { props: { body, rulePack, showSpin: true } });
		await tick();
		expect(body.axial_tilt_deg).toBe(23.4);
		expect(Math.abs(+(container.querySelector('#tilt') as HTMLInputElement).value - 23.4)).toBeLessThan(0.5);
		expect((container.querySelector('.tilt-num') as HTMLInputElement).value).toBe('23.4');
	});

	it('moving the slider DOES write the tilt, announces the edit and retires the inferred-axis claim', async () => {
		const body = makePlanet({ axial_tilt_deg: 12, tags: [{ key: 'spin/axis-inferred' }] });
		let updates = 0;
		const { container } = render(BodyOrbitTab, { props: { body, rulePack, showSpin: true }, events: { update: () => updates++ } } as any);
		const slider = container.querySelector('#tilt') as HTMLInputElement;
		await fireEvent.input(slider, { target: { value: '41' } });
		expect(body.axial_tilt_deg).toBe(41);
		expect(body.tags.some((t: any) => t.key === 'spin/axis-inferred')).toBe(false);
		expect(container.querySelector('label[for="tilt"]')!.textContent).toMatch(/41/);
		expect(updates).toBeGreaterThan(0);
	});

	it('clearing the number box DELETES the field instead of leaving a null or a zero', async () => {
		const body = makePlanet({ axial_tilt_deg: 30 });
		const { container } = render(BodyOrbitTab, { props: { body, rulePack, showSpin: true } });
		const num = container.querySelector('.tilt-num') as HTMLInputElement;
		await fireEvent.input(num, { target: { value: '' } });
		expect('axial_tilt_deg' in body).toBe(false);
		expect(container.querySelector('label[for="tilt"]')!.textContent).toMatch(/not set/i);
	});
});

describe('B21 - a body added from the type picker is given a tilt by the one model', () => {
	it('a fresh body gets the model\'s own draw for its id, tagged as inferred', () => {
		const body = makePlanet({ id: 'fresh-world-1' });
		inferMissingAxialTilt(body, rulePack, false);
		expect(body.axial_tilt_deg).toBe(inferAxialTilt('fresh-world-1', rulePack, false).tiltDeg);
		expect(body.tags.some((t: any) => t.key === 'spin/axis-inferred')).toBe(true);
	});

	it('the route can say the orbit will have despun it: the tilt is then small, whatever the dice said', () => {
		// Absolute, not relative: the tidally-eroded draw is capped at 5 degrees (A70).
		for (let i = 0; i < 200; i++) {
			const body = makePlanet({ id: `moon-${i}`, roleHint: 'moon' });
			inferMissingAxialTilt(body, rulePack, true);
			expect(body.axial_tilt_deg).toBeLessThanOrEqual(5);
			expect(body.tags.some((t: any) => t.key === 'spin/tipped')).toBe(false);
		}
	});

	it('an authored tilt is never overwritten, hint or no hint', () => {
		const body = makePlanet({ axial_tilt_deg: 97.8 });
		inferMissingAxialTilt(body, rulePack, true);
		expect(body.axial_tilt_deg).toBe(97.8);
	});

	it('SystemView seeds the axis on every body the picker route hands to the processor', () => {
		// The route lives in a 4,000-line component that cannot be mounted here, so this reads the
		// source: inside placeBodyOfType, each process() of a freshly built body is preceded by a
		// seedSpinAxis() of that same body.
		const src = readFileSync('src/lib/components/SystemView.svelte', 'utf8');
		const start = src.indexOf('function placeBodyOfType(');
		const end = src.indexOf('\n  function ', start + 10);
		expect(start).toBeGreaterThan(0);
		const fn = src.slice(start, end);
		const appended = [...fn.matchAll(/nodes: \[\.\.\.\$systemStore\.nodes, (\w+)\]/g)].map((m) => m[1]);
		expect(appended.length).toBeGreaterThanOrEqual(2);
		for (const name of appended) {
			const at = fn.indexOf(`nodes: [...$systemStore.nodes, ${name}]`);
			const seeded = fn.lastIndexOf(`seedSpinAxis(${name},`, at);
			expect(seeded, `${name} reaches the processor with no spin axis`).toBeGreaterThan(0);
		}
		expect(fn).toMatch(/const seedSpinAxis = .*inferMissingAxialTilt\(/);
	});
});

describe('A105 - the spin block lives on the Orbit tab and nowhere else', () => {
	const SPIN = ['#rotation', '#retrograde-spin', '#tilt', '.tilt-num'];
	const small = () => makePlanet({ massKg: 1e15, radiusKm: 8, classes: ['planet/asteroid'], rotation_period_hours: 9 });

	it('the Orbit tab carries Day Length, Retrograde spin, Lobes and Axial Tilt', async () => {
		const { container } = render(BodyOrbitTab, { props: { body: small(), rulePack, showSpin: true } });
		await tick();
		for (const sel of SPIN) expect(container.querySelector(sel), sel).not.toBeNull();
		expect(container.querySelector('#lobes'), 'a small body is offered lobes').not.toBeNull();
		expect((container.querySelector('#rotation') as HTMLInputElement).value).toBe('9');
	});

	it('the Composition tab no longer carries any of them', async () => {
		const { container } = render(BodyBasicsTab, { props: { body: small(), rulePack } });
		await tick();
		for (const sel of [...SPIN, '#lobes', '.rot-editor']) expect(container.querySelector(sel), sel).toBeNull();
		expect(container.textContent).not.toMatch(/Day Length|Axial Tilt|Retrograde/);
	});

	it('a body with no spin block of its own (a star, a barycentre) is not given one', async () => {
		// `BodySidePanel` passes showSpin only for the bodies that have a Composition tab; the
		// default must be OFF, so a star's Orbit tab cannot grow a second tilt beside its Star tab.
		const { container } = render(BodyOrbitTab, { props: { body: makePlanet({ roleHint: 'star' }), rulePack } });
		await tick();
		for (const sel of SPIN) expect(container.querySelector(sel), sel).toBeNull();
	});

	it('the two retrogrades read as SPIN and ORBIT, each on its own control', async () => {
		const body = makePlanet({ rotation_period_hours: 24,
			orbit: { hostId: 's', hostMu: 1.327e20, t0: 0, elements: { a_AU: 1, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } });
		const { container } = render(BodyOrbitTab, { props: { body, rulePack, showSpin: true } });
		await tick();
		const orbitLabel = container.querySelector('label[for="retrograde"]')!.textContent!;
		const spinLabel = (container.querySelector('#retrograde-spin') as HTMLInputElement).closest('label')!.textContent!;
		expect(orbitLabel).toMatch(/orbit/i);
		expect(orbitLabel).not.toMatch(/spin/i);
		expect(spinLabel).toMatch(/spin/i);
		expect(spinLabel).not.toMatch(/orbit/i);
		// ...and each writes its own fact and leaves the other alone.
		await fireEvent.click(container.querySelector('#retrograde-spin') as HTMLInputElement);
		expect(body.rotation_period_hours).toBe(-24);
		expect(body.orbit.isRetrogradeOrbit).toBeFalsy();
		await fireEvent.click(container.querySelector('#retrograde') as HTMLInputElement);
		expect(body.orbit.isRetrogradeOrbit).toBe(true);
		expect(body.rotation_period_hours).toBe(-24);
	});

	it('the side panel gives the block to exactly the bodies that have a Composition tab', () => {
		// The panel cannot be mounted cheaply (it pulls every tab), so this reads its source: the
		// showSpin it passes is the predicate that guards the Composition button, spelled the same.
		const src = readFileSync('src/lib/components/BodySidePanel.svelte', 'utf8');
		expect(src).toMatch(/<BodyOrbitTab[^>]*showSpin=\{!isBeltOrRing && !isStar && !isBarycenter\}/);
		expect(src).toMatch(/\{#if !isBeltOrRing && !isStar && !isBarycenter\}\s*<button[^\n]*>Composition<\/button>/);
	});
});
