// G94 / B150 - an EXISTING system's age can be changed. Before this it was set by the wizard and the
// import dialog and by nothing else, which is why "the lever that works is the system's age" was a
// true answer nobody could act on.
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, it, expect } from 'vitest';
import SystemInfoTab from './SystemInfoTab.svelte';

const EPOCH = Date.UTC(2026, 8, 1, 12);
const makeSystem = (extra: Record<string, unknown> = {}): any => ({
	id: 's', name: 'S', seed: 's', epochT0: EPOCH, age_Gyr: 2.9, rulePackId: '', rulePackVersion: '', tags: [],
	nodes: [
		{ id: 'star', kind: 'body', roleHint: 'star', name: 'Star' },
		{ id: 'bd', kind: 'body', roleHint: 'star', name: 'BD' }
	],
	...extra
});

describe('SystemInfoTab - the system age is a control on an existing system', () => {
	it('opening the tab changes nothing: the age, and whether it was an estimate, are as they were', async () => {
		const system = makeSystem({ ageEstimated: true, ageBandGyr: [0.5, 9] });
		const { container } = render(SystemInfoTab, { props: { system } });
		await tick();
		expect(system.age_Gyr).toBe(2.9);
		expect(system.ageEstimated).toBe(true);
		expect((container.querySelector('#sys-age') as HTMLInputElement).value).toBe('2.9');
		expect(container.querySelector('label[for="sys-age"] .est')!.textContent).toBe('estimated');
	});

	it('typing an age sets it, announces the edit, and it is no longer an estimate', async () => {
		const system = makeSystem({ ageEstimated: true });
		let updates = 0;
		const { container } = render(SystemInfoTab, { props: { system }, events: { update: () => updates++ } } as any);
		const num = container.querySelector('#sys-age') as HTMLInputElement;
		num.value = '9';
		await fireEvent.change(num);
		expect(system.age_Gyr).toBe(9);
		expect('ageEstimated' in system).toBe(false);
		expect(updates).toBe(1);
		expect(container.querySelector('label[for="sys-age"] .est')).toBeNull();
	});

	it('the slider is log-scaled from a million years to the universe on the system\'s own date', async () => {
		const system = makeSystem();
		const { container } = render(SystemInfoTab, { props: { system } });
		const slider = container.querySelector('#sys-age-slider') as HTMLInputElement;
		expect(+slider.min).toBe(-3);
		expect(Math.pow(10, +slider.max)).toBeCloseTo(13.787, 3);
		await fireEvent.input(slider, { target: { value: '-1' } });       // 10^-1 Gyr
		expect(system.age_Gyr).toBeCloseTo(0.1, 9);
		await fireEvent.input(slider, { target: { value: '1' } });        // 10^1 Gyr
		expect(system.age_Gyr).toBeCloseTo(10, 9);
	});

	it('nothing is older than the universe, and an emptied box is not an age of zero', async () => {
		const system = makeSystem();
		const { container } = render(SystemInfoTab, { props: { system } });
		const num = container.querySelector('#sys-age') as HTMLInputElement;
		num.value = '';
		await fireEvent.change(num);
		expect(system.age_Gyr).toBe(2.9);
		num.value = '50';
		await fireEvent.change(num);
		expect(system.age_Gyr).toBeCloseTo(13.787, 3);
	});

	it('says what the age drives, and that it does not age the stars themselves', () => {
		const text = render(SystemInfoTab, { props: { system: makeSystem() } }).container.querySelector('.age-why')!.textContent!.replace(/\s+/g, ' ');
		expect(text).toMatch(/Every body that has not been given an age of its own is this old/);
		expect(text).toMatch(/how far brown dwarfs and giant planets have cooled/);
		expect(text).toMatch(/does not age the stars themselves/);
	});

	it('counts the bodies that will NOT follow, because they have an age of their own', () => {
		const none = render(SystemInfoTab, { props: { system: makeSystem() } }).container;
		expect(none.textContent).not.toMatch(/will not follow/);
		const system = makeSystem();
		system.nodes[1].formationTimeGyr = 4;
		const one = render(SystemInfoTab, { props: { system } }).container;
		expect(one.textContent!.replace(/\s+/g, ' ')).toMatch(/1 body here has an age of its own and will not follow this/);
	});

	it('an age outside what the star\'s life makes likely is KEPT and said, never clamped', async () => {
		const system = makeSystem({ ageBandGyr: [0.5, 9] });
		const { container } = render(SystemInfoTab, { props: { system } });
		expect(container.querySelector('.age-note.outside')).toBeNull();
		const num = container.querySelector('#sys-age') as HTMLInputElement;
		num.value = '12';
		await fireEvent.change(num);
		expect(system.age_Gyr).toBe(12);
		expect(container.querySelector('.age-note.outside')!.textContent!.replace(/\s+/g, ' ')).toMatch(/12 Gyr is outside what the main star's own life makes likely \(500 Myr to 9 Gyr\)\. It is kept as you set it/);
	});

	it('the credits below it still work', async () => {
		const system = makeSystem();
		const { container } = render(SystemInfoTab, { props: { system } });
		expect(container.querySelector('#sc-author')).toBeTruthy();
		expect(system.credits).toEqual({});
	});
});
