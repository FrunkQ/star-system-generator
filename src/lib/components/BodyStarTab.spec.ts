// D22: the per-star-class parameter table used to exist TWICE — `statTemplates` in the rule pack
// and a hard-coded `SPECTRAL_DATA` here — and the two disagreed for 8 of 16 classes on figures that
// are consumed by taking the MIDPOINT, so the same pick produced two different stars depending on
// which door you came through. The pack is now the only copy. These tests assert that: the editor's
// numbers must BE the pack's numbers, not merely resemble them.
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
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

// G20: a star can now be given a custom picture like a planet or a construct. The class portrait is
// re-applied from a sync $effect that runs on EVERY pass ("keep the preview image in step with the
// spectral class"), which is the one writer of `starImages` that repeats - the three others write at
// creation. Without the guard a GM's upload is gone before they let go of the mouse, and it would fail
// SILENTLY: the upload appears to work and the picture reverts on the next render.
describe('BodyStarTab — a custom star picture survives the class sync (G20)', () => {
	const CUSTOM = 'data:image/jpeg;base64,QUJD';

	it('leaves a custom image alone when the spectral class changes', async () => {
		const body: any = makeStar(['star/G']);
		body.image = { url: CUSTOM, custom: true, credit: 'A. Painter', license: 'CC-BY' };
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		const select = container.querySelector('select')!;
		select.value = 'star/M-I';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		expect(body.classes[0]).toBe('star/M-I'); // the pick really did land
		expect(body.image.url).toBe(CUSTOM);
		expect(body.image.credit).toBe('A. Painter'); // provenance rides along, unclobbered
	});

	it('still tracks the class when the image is NOT custom', async () => {
		// The guard must not freeze the ordinary case - a star with a derived portrait keeps following
		// its class, which is what the $effect exists for.
		const body: any = makeStar(['star/G']);
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		expect(body.image?.url).toMatch(/star_types/);
		const select = container.querySelector('select')!;
		select.value = 'star/WD';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		expect(body.image.url).toMatch(/WD/);
	});

	it('brings the class portrait back the moment Remove is pressed', async () => {
		// NOT on the next render — that was the first version of this and it was wrong in the app. The
		// sync $effect only re-runs when something re-renders, and with the clock paused nothing does:
		// the GM pressed Remove and got a blank where the portrait should be. Press the real button and
		// assert the picture is back before anything else happens. Same contract the planet has
		// ("Remove (use type image)").
		const body: any = makeStar(['star/M-I']);
		body.image = { url: CUSTOM, custom: true };
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		expect(body.image.url).toBe(CUSTOM);

		const remove = Array.from(container.querySelectorAll('button'))
			.find((b) => b.textContent?.trim() === 'Remove (use class image)')!;
		expect(remove, 'the star tab must offer the shared block').toBeTruthy();
		remove.click();

		expect(body.image?.url).toMatch(/M-I/);
		expect(body.image?.custom).toBeFalsy();
	});
});

// Owner, 2026-08-16: "dragging the effective temperature slider does not reselect star type - when
// that is a direct lookback." It IS a direct lookup, and the class was being re-derived correctly —
// but by MUTATING `body.classes`, which the template did not track, so the dropdown never moved.
describe('BodyStarTab — dragging the temperature reselects the type', () => {
	const tempSlider = (c: HTMLElement) =>
		Array.from(c.querySelectorAll('input[type="range"]')).find((i) =>
			/Effective Temperature/.test(i.closest('.form-group')?.textContent ?? '')) as HTMLInputElement;

	it('moves the DROPDOWN, not just the underlying data', async () => {
		const body: any = makeStar(['star/G']);
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		const select = container.querySelector('select')!;
		expect(select.value).toBe('star/G');

		// Drag the temperature down into the M band.
		const slider = tempSlider(container);
		slider.value = '0';
		slider.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();

		// The data changed AND the control shows it — the second half is what was broken.
		expect(body.classes[0]).toBe('star/Y');
		expect(select.value).toBe('star/Y');
	});

	it('walks the whole ladder as the temperature rises', async () => {
		const body: any = makeStar(['star/G']);
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		const select = container.querySelector('select')!;
		const slider = tempSlider(container);
		const seen = new Set<string>();
		// A FINE step, because the bands are not equal widths on a log slider: G spans 5,200-6,000 K,
		// which is 3.1% of a 500-50,000 K log range. A coarser sweep steps straight over it.
		for (let p = 0; p <= 1.0001; p += 0.02) {
			slider.value = String(p);
			slider.dispatchEvent(new Event('input', { bubbles: true }));
			await tick();
			seen.add(select.value);
		}
		// A direct lookup should sweep the sequence, not stick on one band.
		for (const cls of ['star/M', 'star/K', 'star/G', 'star/F', 'star/A', 'star/B', 'star/O']) {
			expect(seen, `${cls} never selected`).toContain(cls);
		}
	});

	it('still refuses to re-derive a class that states more than a letter', async () => {
		// A supergiant and a dwarf share a temperature and differ in everything else, so nudging the
		// slider must not silently demote a supergiant (D19 inside the editor).
		const body: any = makeStar(['star/M-I']);
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		const slider = tempSlider(container);
		slider.value = '1';
		slider.dispatchEvent(new Event('input', { bubbles: true }));
		expect(body.classes[0]).toBe('star/M-I');
	});
});
