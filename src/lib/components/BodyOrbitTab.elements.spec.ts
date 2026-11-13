// A106 - "as we have 3d - we don't need advanced orbital controls - we need those in the open now."
//
// Inclination and the longitude of the ascending node sat behind a "Show Advanced Orbital Elements"
// checkbox. They are first level now and the checkbox is gone. The one thing that stays behind a
// disclosure is RE-HOME (G64), on the owner's earlier word that it "does not deserve 1st level
// appearance": it keeps a small "Re-home..." button of its own at the foot of the tab.
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, it, expect, afterEach } from 'vitest';
import BodyOrbitTab from './BodyOrbitTab.svelte';
import { starmapStore } from '$lib/starmapStore';

const M_SUN = 1.989e30;
const G = 6.6743e-11;

function mount() {
	const star: any = { id: 's', name: 'Sol', kind: 'body', roleHint: 'star', parentId: null, massKg: M_SUN, radiusKm: 695700, temperatureK: 5772, tags: [] };
	const other: any = { id: 'j', name: 'Jove', kind: 'body', roleHint: 'planet', parentId: 's', massKg: 1.9e27, radiusKm: 69911, tags: [],
		orbit: { hostId: 's', hostMu: G * M_SUN, t0: 0, elements: { a_AU: 5.2, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } };
	const body: any = { id: 'p', name: 'Tellus', kind: 'body', roleHint: 'planet', parentId: 's', massKg: 5.97e24, radiusKm: 6371, tags: [],
		orbit: { hostId: 's', hostMu: G * M_SUN, t0: 0, elements: { a_AU: 1, e: 0.02, i_deg: 3, omega_deg: 10, Omega_deg: 20, M0_rad: 0 } } };
	const system: any = { id: 'sys', name: 'sys', epochT0: 0, nodes: [star, other, body] };
	const view = render(BodyOrbitTab, { props: { body, parentBody: star, system, showSpin: true } });
	return { body, system, ...view };
}

afterEach(() => starmapStore.set(null));

describe('A106 - the orbital elements are in the open', () => {
	it('inclination and the ascending node are there at mount, with no toggle to find first', async () => {
		const { container } = mount();
		await tick();
		const inc = container.querySelector('#inclination') as HTMLInputElement;
		const node = container.querySelector('#asc-node') as HTMLInputElement;
		expect(inc, 'inclination').not.toBeNull();
		expect(node, 'ascending node').not.toBeNull();
		expect(inc.value).toBe('3');
		expect(node.value).toBe('20');
		expect(container.querySelector('#showAdv')).toBeNull();
		expect(container.textContent).not.toMatch(/Show Advanced/i);
	});

	it('typing an inclination writes it, exactly as it did behind the toggle', async () => {
		const { container, body } = mount();
		await tick();
		await fireEvent.input(container.querySelector('#inclination') as HTMLInputElement, { target: { value: '17.5' } });
		expect(body.orbit.elements.i_deg).toBe(17.5);
		expect(body.orbit.elements.Omega_deg).toBe(20);
	});
});

describe('A106 - re-home is NOT first level: it keeps a disclosure of its own at the foot', () => {
	it('the host picker is absent until "Re-home..." is pressed, then offers the hosts', async () => {
		const { container } = mount();
		await tick();
		expect(container.querySelector('#rehome-host')).toBeNull();
		expect(container.querySelector('.rehome-btn')).toBeNull();
		const toggle = container.querySelector('.rehome-toggle') as HTMLButtonElement;
		expect(toggle, 'the Re-home... button').not.toBeNull();
		expect(toggle.textContent).toMatch(/^Re-home/);
		expect(toggle.getAttribute('aria-expanded')).toBe('false');

		await fireEvent.click(toggle);
		const select = container.querySelector('#rehome-host') as HTMLSelectElement;
		expect(select).not.toBeNull();
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		expect([...select.options].map((o) => o.textContent?.trim())).toContain('Jove');
	});

	it('it is the LAST thing on the tab - below the elements and below the spin block', async () => {
		const { container } = mount();
		await tick();
		const order = (sel: string) => {
			const el = container.querySelector(sel)!;
			expect(el, sel).not.toBeNull();
			return [...container.querySelectorAll('*')].indexOf(el);
		};
		expect(order('.rehome-toggle')).toBeGreaterThan(order('#asc-node'));
		expect(order('.rehome-toggle')).toBeGreaterThan(order('#tilt'));
		expect(order('#tilt')).toBeGreaterThan(order('#asc-node'));
	});

	it('a re-home through the disclosure still moves the body to its new host', async () => {
		const { container, body } = mount();
		await tick();
		await fireEvent.click(container.querySelector('.rehome-toggle') as HTMLButtonElement);
		const select = container.querySelector('#rehome-host') as HTMLSelectElement;
		await fireEvent.change(select, { target: { value: 'j' } });
		await tick();
		const go = container.querySelector('.rehome-btn') as HTMLButtonElement;
		expect(go.disabled).toBe(false);
		await fireEvent.click(go);
		expect(body.parentId).toBe('j');
		expect(body.orbit.hostId).toBe('j');
	});
});
