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

describe('BodyStarTab — picking a class draws from the PACK band, seeded', () => {
	// D22: the per-class table used to exist twice and the two copies disagreed for 8 of 16 classes,
	// so the same pick produced two different stars depending on which door you came through. The pack
	// is the only copy now, and these still assert that. What CHANGED at B61 is the draw: picking used
	// to apply the band MIDPOINT, which made every G dwarf a GM placed numerically identical to every
	// other one, and disagreed with generation, which has always drawn across the band. Each row names
	// the axis where the two copies differed and the midpoint the dead copy applied, so the assertion
	// is still that a GM gets the PACK's band — now anywhere inside it rather than at its centre.
	// star/BH and star/BH_active are deliberately absent: `applyBHPresets` overrides the pick.
	it.each([
		['star/O', 'mass', 58], //          editor 16-100 Msun, pack 16-90
		['star/M', 'temp', 2850], //        editor floor 2,000 K, pack 2,400 - the L band starts at 2,000
		['star/WD', 'temp', 52000], //      editor 4,000-100,000 K centres a white dwarf on a very hot young one
		['star/NS', 'mass', 2.2], //        editor to 3 Msun, above the observed maximum
		['star/magnetar', 'mass', 2.2] //   as star/NS
	])('%s: %s lands inside the pack band, not the copy that disagreed', async (key, axis, oldMid) => {
		const body: any = makeStar([key]);
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		const select = container.querySelector('select')!;
		select.value = key;
		select.dispatchEvent(new Event('change', { bubbles: true }));

		const band = st[key];
		const within = (v: number, b: number[]) => v >= b[0] - 1e-9 && v <= b[1] + 1e-9;
		expect(within(body.massKg / SOLAR_MASS_KG, band.mass_solar), `mass ${body.massKg / SOLAR_MASS_KG}`).toBe(true);
		expect(within(body.radiusKm / SOLAR_RADIUS_KM, band.radius_solar), `radius`).toBe(true);
		expect(within(body.temperatureK, band.temp_k), `temp ${body.temperatureK}`).toBe(true);
		// And the named axis is genuinely the pack's band rather than the dead copy's, or this test
		// proves nothing: the two copies' centres must differ.
		const oldBand = axis === 'mass' ? band.mass_solar : band.temp_k;
		const packMid = (oldBand[0] + oldBand[1]) / 2;
		expect(Math.abs(packMid - oldMid)).toBeGreaterThan(Math.abs(oldMid) * 0.01);
	});

	it('two different stars given the same class are not the same star (B61)', async () => {
		// The whole point of the owner's ruling. Every G dwarf in a campaign being identical to four
		// decimal places is the artefact; picking G twice must give two slightly different G stars.
		const pick = (id: string) => {
			const body: any = { ...makeStar(['star/G']), id };
			const { container } = render(BodyStarTab, { props: { body, rulePack } });
			const select = container.querySelector('select')!;
			select.value = 'star/G';
			select.dispatchEvent(new Event('change', { bubbles: true }));
			return body;
		};
		const a = pick('star-alpha'), b = pick('star-beta');
		expect(a.temperatureK).not.toBe(b.temperatureK);
		expect(a.massKg).not.toBe(b.massKg);
		// Same band, so still the same KIND of star.
		expect(Math.abs(a.temperatureK - b.temperatureK)).toBeLessThan(st['star/G'].temp_k[1] - st['star/G'].temp_k[0] + 1);
	});

	it('the SAME star picked twice does not move — this is an editor, not a slot machine', async () => {
		// Seeded from the body id, so re-opening the panel or re-picking the same class cannot reroll
		// the star under the GM's hands (DATA-G1).
		const pick = () => {
			const body: any = { ...makeStar(['star/K']), id: 'the-same-star' };
			const { container } = render(BodyStarTab, { props: { body, rulePack } });
			const select = container.querySelector('select')!;
			select.value = 'star/G';
			select.dispatchEvent(new Event('change', { bubbles: true }));
			return body;
		};
		expect(pick().temperatureK).toBe(pick().temperatureK);
		expect(pick().massKg).toBe(pick().massKg);
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
		// The BODY holds a designation and the DROPDOWN shows the band it came from (B60): a pick is
		// a range to draw from, a class is what the star turned out to be.
		expect(body.classes[0]).toBe('star/Y0');
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
