// D22: the per-star-class parameter table used to exist TWICE — `statTemplates` in the rule pack
// and a hard-coded `SPECTRAL_DATA` here — and the two disagreed for 8 of 16 classes on figures that
// are consumed by taking the MIDPOINT, so the same pick produced two different stars depending on
// which door you came through. The pack is now the only copy. These tests assert that: the editor's
// numbers must BE the pack's numbers, not merely resemble them.
import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import BodyStarTab from './BodyStarTab.svelte';
import { loadStarterPack } from '$lib/import/realsky/testPack';
import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '$lib/constants';

const rulePack = loadStarterPack() as any;
const st = rulePack.statTemplates;

function makeStar(classes: string[] = ['star/G']) {
	return { id: 's1', kind: 'body', roleHint: 'star', name: 'Test', classes, massKg: 2e30, radiusKm: 7e5, temperatureK: 5772 };
}

function optionsOf(container: HTMLElement) {
	const select = container.querySelector('select')!;
	return Array.from(select.querySelectorAll('option')).map((o) => ({ value: o.getAttribute('value'), label: o.textContent?.trim() }));
}

describe('BodyStarTab — the spectral picker is driven by the rule pack', () => {
	it('offers every star band the pack defines, and never star/default', () => {
		const { container } = render(BodyStarTab, { props: { body: makeStar(), rulePack } });
		const values = optionsOf(container).map((o) => o.value);
		const packStarKeys = Object.keys(st).filter((k) => k.startsWith('star/') && k !== 'star/default');
		expect(new Set(values)).toEqual(new Set(packStarKeys));
		expect(values).not.toContain('star/default');
	});

	it('can pick a giant and a supergiant at all — it could not before (D19)', () => {
		const { container } = render(BodyStarTab, { props: { body: makeStar(), rulePack } });
		const values = optionsOf(container).map((o) => o.value);
		for (const L of ['O', 'B', 'A', 'F', 'G', 'K', 'M']) {
			expect(values, `${L} supergiant missing`).toContain(`star/${L}-I`);
			expect(values, `${L} giant missing`).toContain(`star/${L}-III`);
		}
	});

	it('no longer captions a MAIN-SEQUENCE band as a giant or supergiant', () => {
		// `star/O` read "O-Type (Blue Supergiant)" and `star/B` read "B-Type (Blue Giant)" while both
		// are dwarf bands — the letter treated as though it implied a luminosity class, which is the
		// whole of D19 in a caption.
		const { container } = render(BodyStarTab, { props: { body: makeStar(), rulePack } });
		const byValue = Object.fromEntries(optionsOf(container).map((o) => [o.value, o.label]));
		expect(byValue['star/O']).not.toMatch(/giant/i);
		expect(byValue['star/B']).not.toMatch(/giant/i);
		expect(byValue['star/M-I']).toMatch(/supergiant/i);
		expect(byValue['star/K-III']).toMatch(/giant/i);
	});

	it('renders without a rule pack rather than throwing', () => {
		const { container } = render(BodyStarTab, { props: { body: makeStar(), rulePack: undefined } });
		expect(container.querySelector('select')).toBeTruthy();
		expect(optionsOf(container)).toHaveLength(0);
	});
});

describe('BodyStarTab — picking a class applies the PACK band midpoint', () => {
	// FIVE OF THE EIGHT THAT DISAGREED. `star/red-giant` was the sixth and is RETIRED at B46a in
	// favour of `star/M-III` — the two described the same object and disagreed by ~100x on radiation
	// output, which is the same divergence D22 is about, one layer further on. Each row names the ONE axis that moved and the midpoint the
	// hard-coded copy used to apply, so the assertion is that a GM now gets the pack's answer AND
	// that the two answers were genuinely different. star/BH and star/BH_active are the other two
	// and are deliberately absent: `applyBHPresets` overrides the midpoint for those, so the table
	// never reached a GM there in the first place.
	it.each([
		['star/O', 'mass', 58], //          editor 16-100 Msun, pack 16-90
		['star/M', 'temp', 2850], //        editor floor 2,000 K, pack 2,400 - the L band starts at 2,000
		['star/WD', 'temp', 52000], //      editor 4,000-100,000 K centres a white dwarf on a very hot young one
		['star/NS', 'mass', 2.2], //        editor to 3 Msun, above the observed maximum
		['star/magnetar', 'mass', 2.2] //   as star/NS
	])('%s: %s comes from the pack now, not the copy that disagreed', async (key, axis, oldMid) => {
		const body: any = makeStar([key]);
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		const select = container.querySelector('select')!;
		select.value = key;
		select.dispatchEvent(new Event('change', { bubbles: true }));

		const band = st[key];
		const packMass = (band.mass_solar[0] + band.mass_solar[1]) / 2;
		const packTemp = Math.round((band.temp_k[0] + band.temp_k[1]) / 2);
		// Every axis must match the pack, whichever one moved.
		expect(body.massKg / SOLAR_MASS_KG).toBeCloseTo(packMass, 2);
		expect(body.temperatureK).toBe(packTemp);
		expect(body.radiusKm / SOLAR_RADIUS_KM).toBeCloseTo((band.radius_solar[0] + band.radius_solar[1]) / 2, 4);
		// And the named axis genuinely moved, or this test proves nothing.
		const applied = axis === 'mass' ? packMass : packTemp;
		expect(Math.abs(applied - oldMid)).toBeGreaterThan(Math.abs(oldMid) * 0.01);
	});

	it('a supergiant pick gives supergiant figures', async () => {
		const body: any = makeStar(['star/G']);
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		const select = container.querySelector('select')!;
		select.value = 'star/M-I';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		expect(body.classes[0]).toBe('star/M-I');
		expect(body.massKg / SOLAR_MASS_KG).toBeGreaterThan(8);
		expect(body.radiusKm / SOLAR_RADIUS_KM).toBeGreaterThan(300);
	});
});
