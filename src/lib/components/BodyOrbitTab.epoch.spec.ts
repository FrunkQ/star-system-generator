// PHY-48 - THE MEAN ANOMALY A GM TYPES IS THE ONE AT THE SYSTEM'S REFERENCE EPOCH.
//
// User report from the bug run: *"two objects with identical orbital elements placed at different
// times end up in different places."* `M(t) = M0 + n*(t - t0)`, and `t0` was the instant each body
// happened to be created - shown nowhere. So the Mean Anomaly box held a number whose meaning was
// different on every body, and the same six elements typed into two of them were two different
// orbits. The tab now shows the phase re-expressed at `system.epochT0` and, when it is typed,
// writes the phase AND its epoch together. Nothing stored is migrated, and editing any other
// element leaves the phase alone.
//
// Each case below was run against the tab with that change removed and seen red; the ones that
// are pure regression guards (they pass either way) say so.
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { readFileSync } from 'node:fs';
import { describe, it, expect, afterEach } from 'vitest';
import BodyOrbitTab from './BodyOrbitTab.svelte';
import { starmapStore } from '$lib/starmapStore';
import { propagateState3D, rephasedM0, setPhaseAtEpoch } from '$lib/physics/orbits';
import { SystemProcessor } from '$lib/core/SystemProcessor';
import { G, AU_KM } from '$lib/constants';
import type { RulePack } from '$lib/types';

const SUN = 1.989e30;
const MU = G * SUN;
const DAY = 86_400_000;
// A campaign clock, not a wall clock (PHY-33: never sanity-check an epoch against Date.now()).
const EPOCH = 27_542_822_528_000;
const PLACED_FIRST = EPOCH + 311.3 * DAY;   // one world placed most of a year in...
const PLACED_LATER = EPOCH + 2044.9 * DAY;  // ...and its twin five and a half years in.

const star = (): any => ({ id: 's', name: 'Sol', kind: 'body', roleHint: 'star', parentId: null, massKg: SUN, radiusKm: 695700, temperatureK: 5772, tags: [] });
const world = (id: string, t0: number, M0_rad: number, extra: Record<string, unknown> = {}): any => ({
	id, name: id, kind: 'body', roleHint: 'planet', parentId: 's', massKg: 5.97e24, radiusKm: 6371, tags: [],
	orbit: { hostId: 's', hostMu: MU, t0, elements: { a_AU: 1.3, e: 0.1, i_deg: 2, omega_deg: 30, Omega_deg: 40, M0_rad }, ...extra }
});

async function open(body: any, system: any, parentBody: any = system.nodes[0]) {
	const view = render(BodyOrbitTab, { props: { body, parentBody, system } });
	await tick();
	const c = view.container;
	const box = (sel: string) => c.querySelector(sel) as HTMLInputElement;
	const type = async (sel: string, v: string) => { await fireEvent.input(box(sel), { target: { value: v } }); await tick(); };
	// The semi-major axis and eccentricity boxes have no ids of their own; they are the first two.
	const nums = () => [...c.querySelectorAll('input[type="number"]')] as HTMLInputElement[];
	return { ...view, box, type, nums };
}
const typeAll = async (tab: Awaited<ReturnType<typeof open>>, el: { a: string; e: string; w: string; M: string; i: string; O: string }) => {
	const [aBox, eBox, wBox] = tab.nums();
	await fireEvent.input(aBox, { target: { value: el.a } });
	await fireEvent.input(eBox, { target: { value: el.e } });
	await fireEvent.input(wBox, { target: { value: el.w } });
	await tab.type('#mean-anomaly', el.M);
	await tab.type('#inclination', el.i);
	await tab.type('#asc-node', el.O);
};
const dist = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

afterEach(() => starmapStore.set(null));

describe('PHY-48 - identical elements are one orbit, whenever they were typed', () => {
	it('two worlds placed years apart, given the same six elements, are in the same place at every instant', async () => {
		const first = world('First', PLACED_FIRST, 1.1);
		const later = world('Later', PLACED_LATER, 4.9);
		const system: any = { id: 'sys', name: 'sys', epochT0: EPOCH, nodes: [star(), first, later] };
		const same = { a: '2.5', e: '0.3', w: '77', M: '40', i: '5', O: '120' };

		const t1 = await open(first, system); await typeAll(t1, same); t1.unmount();
		const t2 = await open(later, system); await typeAll(t2, same); t2.unmount();

		// What a GM reads off the two tabs is identical...
		for (const k of ['a_AU', 'e', 'i_deg', 'omega_deg', 'Omega_deg'] as const) expect(first.orbit.elements[k], k).toBe(later.orbit.elements[k]);
		// ...and so is where the two worlds ARE, sampled across years on both sides of the epoch.
		for (const days of [-900, 0, 1, 311.3, 2044.9, 7777]) {
			const t = EPOCH + days * DAY;
			const gapAu = dist(propagateState3D(first, t).r, propagateState3D(later, t).r);
			// The propagator answers in AU. 1e-9 AU is 150 metres, on a 2.5 AU orbit.
			expect(gapAu, `${days} days from the epoch`).toBeLessThan(1e-9);
		}
		// ABSOLUTE (PHY-34), not just "equal to each other": both are the orbit a catalogue would
		// mean by those elements at the epoch - 40 degrees of mean anomaly at EPOCH itself.
		const reference: any = { orbit: { hostId: 's', hostMu: MU, t0: EPOCH, elements: { a_AU: 2.5, e: 0.3, i_deg: 5, omega_deg: 77, Omega_deg: 120, M0_rad: (40 * Math.PI) / 180 } } };
		for (const days of [0, 500]) {
			expect(dist(propagateState3D(first, EPOCH + days * DAY).r, propagateState3D(reference, EPOCH + days * DAY).r)).toBeLessThan(1e-9);
		}
		// With the epoch handling removed this case measured the twins 3.14 AU apart (at 900 days
		// before the epoch) on a 2.5 AU orbit - opposite sides of their star, from identical boxes.
		expect(first.orbit.t0).toBe(EPOCH);
		expect(later.orbit.t0).toBe(EPOCH);
	});

	it('the box SHOWS the phase at the epoch: a quarter of an orbit after it reads 270, not the stored 0', async () => {
		// A circular 1 AU orbit, created exactly a quarter period AFTER the epoch with M0 = 0. At the
		// epoch it was a quarter orbit short of periapsis: -90, which is 270. Worked by hand from
		// n = sqrt(mu / a^3), not read back off the code.
		const a_m = AU_KM * 1000;
		const periodMs = 2 * Math.PI * Math.sqrt((a_m * a_m * a_m) / MU) * 1000;
		const body = world('Quarter', EPOCH + periodMs / 4, 0);
		body.orbit.elements.a_AU = 1; body.orbit.elements.e = 0;
		const system: any = { id: 'sys', name: 'sys', epochT0: EPOCH, nodes: [star(), body] };
		const tab = await open(body, system);
		expect(Number(tab.box('#mean-anomaly').value)).toBeCloseTo(270, 3);
		// Opening the tab moved nothing: the stored fact is exactly as it was.
		expect(body.orbit.t0).toBe(EPOCH + periodMs / 4);
		expect(body.orbit.elements.M0_rad).toBe(0);
	});

	it('typing in ANOTHER element leaves the phase and its epoch alone, and the box follows the new period', async () => {
		const body = world('Kept', PLACED_FIRST, 1.1);
		const system: any = { id: 'sys', name: 'sys', epochT0: EPOCH, nodes: [star(), body] };
		const tab = await open(body, system);
		await tab.type('#inclination', '33');
		expect(body.orbit.elements.i_deg).toBe(33);
		expect(body.orbit.t0, 'an inclination edit must not re-stamp the epoch').toBe(PLACED_FIRST);
		expect(body.orbit.elements.M0_rad).toBe(1.1);

		// A new semi-major axis is a new mean motion, so the SAME stored phase is a different mean
		// anomaly at the epoch - and the box says so rather than going stale.
		const before = Number(tab.box('#mean-anomaly').value);
		await fireEvent.input(tab.nums()[0], { target: { value: '2.6' } });
		await tick();
		expect(body.orbit.t0).toBe(PLACED_FIRST);
		expect(body.orbit.elements.M0_rad).toBe(1.1);
		const after = Number(tab.box('#mean-anomaly').value);
		expect(after).not.toBeCloseTo(before, 1);
		expect(after).toBeCloseTo((rephasedM0(body.orbit, EPOCH) * 180) / Math.PI, 3);
	});

	it('a stored mean motion is respected: the box uses the orbit\'s own n, not sqrt(mu / a^3)', async () => {
		// A pair member's n is the pair's relative motion and an l1/l2 point's comes from a scaled
		// hostMu (PHY-33). Here it is pinned at exactly twice the Keplerian value, so over the same
		// quarter-Keplerian-period the body went HALF way round: 180 at the epoch, not 270.
		const a_m = AU_KM * 1000;
		const nKepler = Math.sqrt(MU / (a_m * a_m * a_m));
		const periodMs = ((2 * Math.PI) / nKepler) * 1000;
		const body = world('Pinned', EPOCH + periodMs / 4, 0, { n_rad_per_s: 2 * nKepler });
		body.orbit.elements.a_AU = 1; body.orbit.elements.e = 0;
		const system: any = { id: 'sys', name: 'sys', epochT0: EPOCH, nodes: [star(), body] };
		const tab = await open(body, system);
		expect(Number(tab.box('#mean-anomaly').value)).toBeCloseTo(180, 3);
	});

	it('the field says which instant it means, on the campaign\'s own calendar', async () => {
		starmapStore.set({ temporal: { activeCalendarKey: 'SD', temporal_registry: { SD: {
			id: 'TNG_SD', math_type: 'RATIO_LINEAR', epoch_offset_t: '435084632967250575', format: 'Stardate {val}',
			parameters: { units_per_earth_year: 1000.0, seconds_per_earth_year: 31557600, precision_digits: 1 }
		} } } } as any);
		const body = world('Dated', 1_762_339_146_908, 0);
		// The epoch stamped on every bundled map; `calendarFormat.spec.ts` derives its Stardate by hand.
		const system: any = { id: 'sys', name: 'sys', epochT0: 1_762_339_146_908, nodes: [star(), body] };
		const tab = await open(body, system);
		expect(tab.container.querySelector('label[for="mean-anomaly"]')!.textContent).toMatch(/at epoch/i);
		const hint = tab.container.querySelector('.epoch-hint')!.textContent!;
		expect(hint).toContain('Stardate -155.6');
		expect(hint).toMatch(/reference epoch/);
	});

	it('with no system to name an epoch, the field is the stored phase and says nothing about an epoch (guard)', async () => {
		const body = world('Bare', PLACED_FIRST, Math.PI / 2);
		const view = render(BodyOrbitTab, { props: { body, parentBody: star(), system: null } });
		await tick();
		const box = view.container.querySelector('#mean-anomaly') as HTMLInputElement;
		expect(Number(box.value)).toBeCloseTo(90, 6);
		expect(view.container.querySelector('label[for="mean-anomaly"]')!.textContent).not.toMatch(/epoch/i);
		expect(view.container.querySelector('.epoch-hint')).toBeNull();
		await fireEvent.input(box, { target: { value: '10' } });
		expect(body.orbit.t0).toBe(PLACED_FIRST);
		expect(body.orbit.elements.M0_rad).toBeCloseTo((10 * Math.PI) / 180, 12);
	});

	it('clearing the box is not a phase of zero: nothing is written', async () => {
		const body = world('Blank', PLACED_FIRST, 1.1);
		const system: any = { id: 'sys', name: 'sys', epochT0: EPOCH, nodes: [star(), body] };
		const tab = await open(body, system);
		await tab.type('#mean-anomaly', '');
		expect(body.orbit.t0).toBe(PLACED_FIRST);
		expect(body.orbit.elements.M0_rad).toBe(1.1);
	});
});

describe('PHY-48 - a pair still has one epoch and one phase (PHY-33)', () => {
	function loadPack(): any {
		const base = 'static/rulepacks/starter-sf';
		const merge = (a: any, b: any): any => {
			const o: any = { ...a };
			for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a?.[k] ? merge(a[k], v) : v;
			return o;
		};
		let p: any = JSON.parse(readFileSync(`${base}/main.json`, 'utf8'));
		for (const f of ['stars.json', 'planets.json', 'generation.json', 'orbital_constants.json', 'classification.json', 'atmospheres.json', 'liquids.json']) {
			try { p = merge(p, JSON.parse(readFileSync(`${base}/${f}`, 'utf8'))); } catch { /* optional */ }
		}
		return p;
	}
	const pack = loadPack() as RulePack;
	const process = (s: any) => new SystemProcessor().process(s, pack);
	const byId = (s: any, id: string) => (s.nodes as any[]).find((n) => n.id === id);
	const kepler = (a_AU: number, omega: number) => ({ a_AU, e: 0.5298, i_deg: 3.5, omega_deg: omega, Omega_deg: 276.36, M0_rad: 4.7495 });

	it('typing a mean anomaly on one member puts BOTH at the epoch, opposite each other', async () => {
		const T_A = EPOCH + 17 * DAY, T_B = EPOCH + 3910 * DAY;
		let system: any = {
			id: 'ps', name: 'Pair', seed: 'ps', epochT0: EPOCH, age_Gyr: 5, rulePackId: '', rulePackVersion: '', tags: [],
			nodes: [
				{ id: 'bary', kind: 'barycenter', name: 'B Barycentre', parentId: null, memberIds: ['Ba', 'Bb'], effectiveMassKg: 3.1659e29, tags: [{ key: 'barycenter/auto' }] },
				{ id: 'Ba', kind: 'body', roleHint: 'star', name: 'Ba', parentId: 'bary', massKg: 1.6329e29, radiusKm: 3e5, tags: [],
					orbit: { hostId: 'bary', hostMu: G * 3.1659e29, t0: T_A, n_rad_per_s: 4.98466646685888e-8, elements: kepler(0.6607, 223.23) } },
				{ id: 'Bb', kind: 'body', roleHint: 'star', name: 'Bb', parentId: 'bary', massKg: 1.5330e29, radiusKm: 3e5, tags: [],
					orbit: { hostId: 'bary', hostMu: G * 3.1659e29, t0: T_B, n_rad_per_s: 4.98466646685888e-8, elements: kepler(0.7038, 43.23) } }
			]
		};
		system = process(system);
		const bb = byId(system, 'Bb');
		const tab = await open(bb, system, byId(system, 'bary'));
		await tab.type('#mean-anomaly', '25');
		expect(bb.orbit.t0).toBe(EPOCH);
		expect(bb.orbit.elements.M0_rad).toBeCloseTo((25 * Math.PI) / 180, 12);

		system = process(system);
		const a = byId(system, 'Ba'), b = byId(system, 'Bb');
		expect(a.orbit.t0, 'the partner takes the edited member\'s epoch').toBe(EPOCH);
		expect(b.orbit.t0).toBe(EPOCH);
		expect(a.orbit.elements.M0_rad).toBeCloseTo((25 * Math.PI) / 180, 12);
		const n = Math.abs(a.orbit.n_rad_per_s);
		const periodMs = ((2 * Math.PI) / n) * 1000;
		for (let i = 0; i < 8; i++) {
			const t = EPOCH + (periodMs * i) / 8;
			const ra = propagateState3D(a, t).r, rb = propagateState3D(b, t).r;
			const cos = (ra.x * rb.x + ra.y * rb.y + ra.z * rb.z) / (Math.hypot(ra.x, ra.y, ra.z) * Math.hypot(rb.x, rb.y, rb.z));
			expect((Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI).toBeCloseTo(180, 4);
		}
	});
});

describe('PHY-48 - the write helper', () => {
	it('writes the phase and its epoch together, and refuses a non-number rather than writing half', () => {
		const orbit: any = { t0: 5, elements: { M0_rad: 1 } };
		setPhaseAtEpoch(orbit, 100, 2);
		expect(orbit).toEqual({ t0: 100, elements: { M0_rad: 2 } });
		setPhaseAtEpoch(orbit, NaN, 3);
		setPhaseAtEpoch(orbit, 200, NaN);
		expect(orbit).toEqual({ t0: 100, elements: { M0_rad: 2 } });
		// The read that matches it: the phase re-expressed at the epoch it was written at is itself.
		expect(rephasedM0({ ...orbit, hostMu: MU, elements: { a_AU: 1, M0_rad: 2 } }, 100)).toBeCloseTo(2, 12);
	});
});
