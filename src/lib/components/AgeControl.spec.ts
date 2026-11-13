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

// G94 job 4 - the inversion, which is what answers the user who started this (B150). He typed a
// temperature into a brown dwarf and it snapped back. He can still type one: he is offered the AGE
// that gives it.
describe('AgeControl - a brown dwarf: type a temperature, be offered the age', () => {
	const MJ = 1.898e27;
	// The dwarf in the report: 0.0352 solar masses, 0.0806 solar radii - as a star, and as a planet.
	const dwarf = (extra: Record<string, unknown> = {}): any =>
		({ id: 'bd', kind: 'body', roleHint: 'star', name: 'BD', classes: ['star/T'], massKg: 0.0352 * 1.989e30, radiusKm: 0.0806 * 696340, temperatureK: 1172, tags: [], ...extra });
	const aim = async (container: HTMLElement, kelvin: string) => {
		const input = container.querySelector('#age-aim') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: kelvin } });
		await fireEvent.change(input);
	};
	const young = { age_Gyr: 2.9, epochT0: system.epochT0 };   // his system: 1173 K

	it('shows the temperature this age gives, straight from the cooling track', () => {
		const { container } = render(AgeControl, { props: { body: dwarf(), system: young, rulePack } });
		expect(container.querySelector('.teff')!.textContent).toMatch(/Effective temperature at this age\s*1,?173/);
	});

	it('988 K is offered as a 9.1 Gyr dwarf, and accepting it sets the AGE - no temperature is stored', async () => {
		const body = dwarf();
		let updates = 0;
		const { container } = render(AgeControl, { props: { body, system: young, rulePack }, events: { update: () => updates++ } } as any);
		await aim(container, '988');
		expect('formationTimeGyr' in body).toBe(false);                       // asking is not setting
		expect(updates).toBe(0);
		expect(container.querySelector('.fit')!.textContent).toMatch(/A dwarf of this mass is\s*988.*at 9\.1 Gyr/);
		const accept = container.querySelector('.accept') as HTMLButtonElement;
		expect(accept.textContent).toBe('Set its age to 9.1 Gyr');
		await fireEvent.click(accept);
		expect(ageOf(body, young)).toBeCloseTo(9.1, 1);
		expect(body.temperatureK).toBe(1172);                                 // untouched: the processor derives it
		expect(body.overrides).toBeUndefined();
		expect(updates).toBe(1);
		expect(container.querySelector('.teff')!.textContent).toMatch(/988/); // and the readout now agrees
		expect(container.querySelector('.fit')).toBeNull();
	});

	it('914 K - the other figure he typed - is not offered: it says why, and what the dwarf can reach', async () => {
		const body = dwarf();
		const { container } = render(AgeControl, { props: { body, system: young, rulePack } });
		await aim(container, '914');
		const text = container.querySelector('.fit')!.textContent!.replace(/\s+/g, ' ');
		expect(text).toMatch(/would need 15\.3 Gyr to cool to 914/);
		expect(text).toMatch(/the universe is 13\.8 Gyr old here/);
		expect(text).toMatch(/coolest it can be by now is 928/);
		expect(text).toMatch(/a lighter dwarf cools faster/);
		expect(container.querySelector('.accept')).toBeNull();
		expect('formationTimeGyr' in body).toBe(false);
	});

	it('too hot and too cold are each said in words, and neither changes the body', async () => {
		const body = dwarf();
		const { container } = render(AgeControl, { props: { body, system: young, rulePack } });
		await aim(container, '5000');
		expect(container.querySelector('.fit')!.textContent!.replace(/\s+/g, ' ')).toMatch(/never that hot: it starts at about 2,?800/);
		await aim(container, '100');
		expect(container.querySelector('.fit')!.textContent!.replace(/\s+/g, ' ')).toMatch(/No brown dwarf is colder than 250/);
		expect('formationTimeGyr' in body).toBe(false);
	});

	it('filed as a PLANET it is offered exactly the same thing (DATA-R22)', async () => {
		const body = dwarf({ roleHint: 'planet', classes: [] });
		const { container } = render(AgeControl, { props: { body, system: young, rulePack } });
		// A planet's temperatures read in the campaign's planet unit, which is Celsius by default: the
		// same 988 K is typed as 714.85. The unit is the panel's business; the answer is the track's.
		expect(container.querySelector('.cooling .unit')!.textContent).toMatch(/C/);
		await aim(container, '714.85');
		expect((container.querySelector('.accept') as HTMLButtonElement).textContent).toBe('Set its age to 9.1 Gyr');
	});

	it('an ordinary planet and a fusing star are offered no temperature at all', () => {
		expect(render(AgeControl, { props: { body: planet(), system, rulePack } }).container.querySelector('.cooling')).toBeNull();
		const sun = { id: 's', kind: 'body', roleHint: 'star', name: 'S', classes: ['star/G'], massKg: 1.989e30, radiusKm: 696340, temperatureK: 5772, tags: [] };
		expect(render(AgeControl, { props: { body: sun as any, system, rulePack } }).container.querySelector('.cooling')).toBeNull();
		expect(MJ).toBeGreaterThan(0);
	});
});
