// G94 job 3 / G96 - the Age control. What is pinned here is the behaviour a GM can feel: opening a
// panel never gives a body an age, moving the control does, and one button hands it back.
//
// NOTHING ASSERTS A SLIDER'S RESTING POSITION (engine map UI-C19): jsdom rests a range differently
// from a browser, so "the field is absent" is the absolute form of "mounting wrote nothing".
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, it, expect } from 'vitest';
import AgeControl from './AgeControl.svelte';
import BodyTemperatureTab from './BodyTemperatureTab.svelte';
import { loadStarterPack } from '$lib/import/realsky/testPack';
import { ageOf, cosmicNowGyr } from '$lib/physics/bodyAge';

const rulePack = loadStarterPack() as any;
const system = { age_Gyr: 4.6, epochT0: Date.UTC(2026, 8, 1, 12) };
const NOW = cosmicNowGyr(system);

const planet = (extra: Record<string, unknown> = {}): any =>
	({ id: 'p1', kind: 'body', roleHint: 'planet', name: 'T', classes: ['planet/terrestrial'], massKg: 5.97e24, radiusKm: 6371, tags: [], ...extra });

describe('AgeControl - absent means inherit, and mounting changes nothing', () => {
	it('a body with no age of its own still has none after the control mounts', async () => {
		const body = planet();
		const { container } = render(AgeControl, { props: { body, system, rulePack } });
		await tick();
		expect('formationTimeGyr' in body).toBe(false);
		expect(container.querySelector('.inherit-text')!.textContent).toMatch(/Same as its system \(4\.6 Gyr\)/);
		expect((container.querySelector('.age-num') as HTMLInputElement).value).toBe('4.6');
		expect(container.querySelector('.inherit')).toBeNull();
	});

	it('it is labelled Age, and the scale ends at the universe on the campaign\'s own date', () => {
		const { container } = render(AgeControl, { props: { body: planet(), system, rulePack } });
		expect(container.querySelector('label')!.textContent).toBe('Age');
		expect(container.textContent).not.toMatch(/\btime\b/i);
		expect(+(container.querySelector('.age-slider') as HTMLInputElement).max).toBeCloseTo(13.787, 3);
		expect(+(container.querySelector('.age-slider') as HTMLInputElement).min).toBe(0);
	});

	it('says underneath what the age drives on THIS body', () => {
		const rock = render(AgeControl, { props: { body: planet(), system, rulePack } });
		expect(rock.container.querySelector('.drives')!.textContent).toMatch(/^Nothing this body shows is worked out from its age yet/);
		const dwarf = render(AgeControl, { props: { body: planet({ massKg: 36.9 * 1.898e27, radiusKm: 56000 }), system, rulePack } });
		expect(dwarf.container.querySelector('.drives')!.textContent).toMatch(/^Drives its temperature and brightness/);
	});
});

describe('AgeControl - giving a body an age of its own', () => {
	it('moving the slider stores the FORMATION TIME it was moved to, and announces the edit', async () => {
		const body = planet();
		let updates = 0;
		const { container } = render(AgeControl, { props: { body, system, rulePack }, events: { update: () => updates++ } } as any);
		await fireEvent.input(container.querySelector('.age-slider')!, { target: { value: '2' } });   // 2 Gyr after the big bang
		expect(body.formationTimeGyr).toBeCloseTo(2, 9);
		expect(ageOf(body, system)).toBeCloseTo(NOW - 2, 9);
		expect(updates).toBe(1);
		expect(container.querySelector('.own-text')!.textContent).toMatch(/11\.8 Gyr old.*7\.19 Gyr older than its system/);
	});

	it('typing an age sets that age, to the figure typed', async () => {
		const body = planet();
		const { container } = render(AgeControl, { props: { body, system, rulePack } });
		const num = container.querySelector('.age-num') as HTMLInputElement;
		num.value = '9.2';
		await fireEvent.change(num);
		expect(ageOf(body, system)).toBeCloseTo(9.2, 9);
		expect(container.querySelector('.own-text')!.textContent).toMatch(/9\.2 Gyr old.*4\.6 Gyr older than its system/);
	});

	it('a younger body says so', async () => {
		const body = planet();
		const { container } = render(AgeControl, { props: { body, system, rulePack } });
		const num = container.querySelector('.age-num') as HTMLInputElement;
		num.value = '0.05';
		await fireEvent.change(num);
		expect(container.querySelector('.own-text')!.textContent).toMatch(/50 Myr old.*4\.55 Gyr younger than its system/);
	});

	it('nothing can be older than the universe was on the campaign\'s date, and an emptied box is not zero', async () => {
		const body = planet();
		const { container } = render(AgeControl, { props: { body, system, rulePack } });
		const num = container.querySelector('.age-num') as HTMLInputElement;
		num.value = '';
		await fireEvent.change(num);
		expect('formationTimeGyr' in body).toBe(false);
		num.value = '40';
		await fireEvent.change(num);
		expect(ageOf(body, system)).toBeCloseTo(NOW, 9);
		expect(body.formationTimeGyr).toBeCloseTo(0, 9);
	});

	it('"Use the system\'s age" deletes the field, so the body follows its system again', async () => {
		const body = planet({ formationTimeGyr: 3 });
		let updates = 0;
		const { container } = render(AgeControl, { props: { body, system, rulePack }, events: { update: () => updates++ } } as any);
		await fireEvent.click(container.querySelector('.inherit')!);
		expect('formationTimeGyr' in body).toBe(false);
		expect(updates).toBe(1);
		expect(container.querySelector('.inherit-text')).toBeTruthy();
	});
});

describe('G96 - on a planet or moon the Age control lives on the Temperature tab', () => {
	const mount = (body: any) => render(BodyTemperatureTab, { props: { body, rulePack, system, nodes: [body] } });

	it('a planet and a moon both carry it, and opening the tab gives neither an age', async () => {
		for (const roleHint of ['planet', 'moon']) {
			const body = planet({ roleHint });
			const { container } = mount(body);
			await tick();
			expect(container.querySelector('.age-control'), roleHint).toBeTruthy();
			expect('formationTimeGyr' in body, roleHint).toBe(false);
		}
	});

	it('an edit there reaches the panel as an update', async () => {
		const body = planet();
		let updates = 0;
		const { container } = render(BodyTemperatureTab, { props: { body, rulePack, system, nodes: [body] }, events: { update: () => updates++ } } as any);
		const before = updates;
		await fireEvent.input(container.querySelector('.age-slider')!, { target: { value: '5' } });
		expect(body.formationTimeGyr).toBeCloseTo(5, 9);
		expect(updates).toBe(before + 1);
	});
});
