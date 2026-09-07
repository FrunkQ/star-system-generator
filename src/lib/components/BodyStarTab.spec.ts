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

// ANSWER 3, 2026-08-16: stars default to DERIVED where planets default to PINNED, and the difference
// must be VISIBLE or it reads as a bug — a planet has an auto-classify checkbox and a star has none.
describe('BodyStarTab — the star says its designation is a readout', () => {
	it('shows the designation the body holds, and says it follows the numbers', () => {
		const body: any = { ...makeStar(['star/G2V']), id: 'sd' };
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		const line = container.querySelector('.designation-line')!;
		expect(line, 'the star tab must explain why it has no pin control').toBeTruthy();
		expect(line.textContent).toContain('G2V');
		expect(line.textContent).toMatch(/follows/i);
	});

	it('reads a giant in the MK form, not the pack key spelling', () => {
		const body: any = { ...makeStar(['star/K-III']), id: 'kg' };
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		expect(container.querySelector('.designation-line')!.textContent).toContain('K III');
	});

	it('says nothing for a remnant, which has no designation to read', () => {
		const body: any = { ...makeStar(['star/WD']), id: 'wd' };
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		expect(container.querySelector('.designation-line')).toBeNull();
	});
});

// A83, COMMIT 1: THE BOUND MOVED TO DATA AND THE BEHAVIOUR DID NOT.
//
// `const massMax = 300` was a component constant — the scattered-constant fault — and it is now
// `STAR_BOUNDS.mass.soft` in `physics/starBounds.ts`. `starBounds.spec.ts` pins the ARITHMETIC
// against the old inline expressions; this pins the SHIPPED RESULT end to end, through the real
// component, so the extraction cannot have moved what a GM sees. The supermassive switch arrives
// in the next commit and these figures must survive it untouched with the switch off.
describe('A83 — the mass slider spans exactly what it always spanned', () => {
	const sliders = (container: HTMLElement) =>
		Array.from(container.querySelectorAll<HTMLInputElement>('input.full-width-slider.overlay'));

	/** Drive the mass slider (the first overlay slider on a non-remnant star) to `pos`. */
	const dragMassTo = (container: HTMLElement, pos: number) => {
		const mass = sliders(container)[0];
		mass.value = String(pos);
		mass.dispatchEvent(new Event('input', { bubbles: true }));
	};

	it('tops out at 300 M☉ and bottoms out at 0.01 M☉', () => {
		const body: any = makeStar(['star/G']);
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		dragMassTo(container, 1);
		expect(body.massKg / SOLAR_MASS_KG).toBeCloseTo(300, 6);
		dragMassTo(container, 0);
		expect(body.massKg / SOLAR_MASS_KG).toBeCloseTo(0.01, 9);
	});

	it('is LOG-scaled, so half travel is the geometric mean rather than 150 M☉', () => {
		const body: any = makeStar(['star/G']);
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		dragMassTo(container, 0.5);
		// exp((ln 0.01 + ln 300) / 2) = 1.732…, rounded to the editor's three significant figures.
		expect(body.massKg / SOLAR_MASS_KG).toBeCloseTo(1.73, 2);
	});

	it('a black hole\'s event horizon still follows the mass it is dragged to', () => {
		// r_s = 2GM/c^2: one solar mass is 2.95 km, so 300 are about 886 km.
		const body: any = { ...makeStar(['star/BH']), massKg: 10 * SOLAR_MASS_KG };
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		dragMassTo(container, 1);
		expect(body.massKg / SOLAR_MASS_KG).toBeCloseTo(300, 6);
		expect(body.radiusKm).toBeGreaterThan(870);
		expect(body.radiusKm).toBeLessThan(900);
	});
});

// A83, COMMIT 2: THE SUPERMASSIVE SWITCH.
//
// Owner, 2026-08-31: *"a switch that can offer 'supermassive black holes' - the scale will change
// from 300 to 270 Billion SM - which is the theoretical limit (log slider!)"*.
//
// Three things this has to get right and each has its own case below: the switch must not MOVE
// the mass (a control that edits what it describes is a trap); the top of the track must be the
// stated limit on a log scale; and 270 billion is an AMBER EDGE, so a heavier figure is kept and
// merely explained. Run against the previous commit all of these go red - there is no switch.
describe('A83 — the supermassive switch', () => {
	const sliders = (c: HTMLElement) =>
		Array.from(c.querySelectorAll<HTMLInputElement>('input.full-width-slider.overlay'));
	const massSlider = (c: HTMLElement) => sliders(c)[0];
	const toggle = (c: HTMLElement) =>
		c.querySelector<HTMLInputElement>('.sm-toggle input[type="checkbox"]');
	const dragMassTo = (c: HTMLElement, pos: number) => {
		const m = massSlider(c);
		m.value = String(pos);
		m.dispatchEvent(new Event('input', { bubbles: true }));
	};
	const flip = (c: HTMLElement) => {
		const t = toggle(c)!;
		t.checked = !t.checked;
		t.dispatchEvent(new Event('change', { bubbles: true }));
	};

	it('is offered on a black hole and on nothing else', () => {
		const bh = render(BodyStarTab, { props: { body: makeStar(['star/BH']), rulePack } });
		expect(toggle(bh.container), 'a black hole should offer it').toBeTruthy();
		const g = render(BodyStarTab, { props: { body: makeStar(['star/G']), rulePack } });
		expect(toggle(g.container), 'a G star must not').toBeNull();
	});

	it('reaches 2.7e11 M☉ at the top of the track', () => {
		const body: any = { ...makeStar(['star/BH']), massKg: 10 * SOLAR_MASS_KG };
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		flip(container);
		dragMassTo(container, 1);
		expect(body.massKg / SOLAR_MASS_KG).toBeCloseTo(2.7e11, -9);
	});

	it('is LOG-scaled across the decades, so Sgr A* is reachable in the middle of the track', () => {
		const body: any = { ...makeStar(['star/BH']), massKg: 10 * SOLAR_MASS_KG };
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		flip(container);
		// A linear 0.01..2.7e11 track would put everything below 1e9 in its first 0.4% of travel.
		// Log puts Sgr A* (4.3e6 M☉) most of the way along, where a GM can actually land on it.
		dragMassTo(container, 0.7);
		const m = body.massKg / SOLAR_MASS_KG;
		expect(m).toBeGreaterThan(1e5);
		expect(m).toBeLessThan(1e9);
	});

	it('throwing the switch moves the TRACK, never the mass', async () => {
		const body: any = { ...makeStar(['star/BH']), massKg: 12 * SOLAR_MASS_KG };
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		const before = body.massKg;
		const posBefore = Number(massSlider(container).value);
		flip(container);
		await tick(); // the DOM lags the state by a flush - reading it straight back races Svelte
		expect(body.massKg, 'the hole must not gain or lose mass').toBe(before);
		// The thumb re-seats onto the wider track, so it moves DOWN while the number stands still.
		expect(Number(massSlider(container).value)).toBeLessThan(posBefore);
		flip(container);
		await tick();
		expect(body.massKg).toBe(before);
		expect(Number(massSlider(container).value)).toBeCloseTo(posBefore, 9);
	});

	it('opens already on the supermassive scale for a hole that is one', () => {
		// Derived from the mass rather than remembered, so an imported or undone body is right too.
		const body: any = { ...makeStar(['star/BH']), massKg: 4.3e6 * SOLAR_MASS_KG };
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		expect(toggle(container)!.checked).toBe(true);
		// ...and the thumb is genuinely somewhere usable rather than pinned to the end.
		const pos = Number(massSlider(container).value);
		expect(pos).toBeGreaterThan(0.05);
		expect(pos).toBeLessThan(0.95);
	});

	it('a 12 M☉ hole still opens on the stellar scale — the switch is off by default', () => {
		const body: any = { ...makeStar(['star/BH']), massKg: 12 * SOLAR_MASS_KG };
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		expect(toggle(container)!.checked).toBe(false);
		dragMassTo(container, 1);
		expect(body.massKg / SOLAR_MASS_KG).toBeCloseTo(300, 6);
	});

	it('270 billion is an AMBER EDGE — a heavier hole is kept and explained, never clamped', async () => {
		const body: any = { ...makeStar(['star/BH']), massKg: 5e11 * SOLAR_MASS_KG };
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		await tick();
		expect(body.massKg / SOLAR_MASS_KG, 'the typed figure must survive').toBeCloseTo(5e11, -9);
		const warn = container.querySelector('.mass-amber');
		expect(warn, 'past the limit the editor must say so').toBeTruthy();
		expect(warn!.textContent).toMatch(/270 billion/i);
		// And the thumb pins to the end rather than dragging the value back down with it.
		expect(Number(massSlider(container).value)).toBe(1);
	});

	it('says nothing about an ordinary supermassive hole — M87* is inside the limit', async () => {
		const body: any = { ...makeStar(['star/BH']), massKg: 6.5e9 * SOLAR_MASS_KG };
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		await tick();
		expect(container.querySelector('.mass-amber')).toBeNull();
	});
});

// A85: THE ROTATION BAND AND THE ROTATION THUMB WERE MEASURING DIFFERENT AXES.
//
// Found by the A83 extraction, which is the whole argument for putting scattered constants in one
// table: `getRangePct('rot')` placed the green typical-for-class band on a LOG axis over
// 0.1..10,000 h, while the slider under it was `min="0.1" max="10000"` — LINEAR. Same two numbers,
// two different meanings, 770 lines apart, and nothing could report it.
//
// A G star's band is 24..1,000 h. Logged, 24 h paints at 48% of the track; linearly, the thumb for
// 24 h sits at 0.24%. The GM was being shown a green stripe in the middle of a slider whose
// matching value is jammed against the left stop.
//
// The fix is the slider, not the band: five decades on a linear track make everything under 100 h
// unreachable, which is why every other slider in this editor is already log.
describe('A85 — the rotation band and the rotation thumb measure ONE axis', () => {
	const rotBlock = (c: HTMLElement) => {
		const label = Array.from(c.querySelectorAll('label'))
			.find((l) => /^Rotation Period/.test(l.textContent?.trim() ?? ''))!;
		const group = label.closest('.form-group')!;
		return {
			rect: group.querySelector('rect')!,
			range: group.querySelector<HTMLInputElement>('input[type="range"]')!,
			number: group.querySelector<HTMLInputElement>('input[type="number"]')!
		};
	};

	it('puts the thumb for the band\'s own start exactly where the band starts', async () => {
		// star/G's presentation band is rot [24, 1000] — a real pack band, not a contrived one.
		const body: any = { ...makeStar(['star/G']), rotation_period_hours: 24 };
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		await tick();
		const { rect, range } = rotBlock(container);
		const bandStart = parseFloat(rect.getAttribute('x')!); // a percentage of the track
		// The slider is a 0..1 position, like every other slider in this editor.
		expect(Number(range.min)).toBe(0);
		expect(Number(range.max)).toBe(1);
		expect(Number(range.value) * 100).toBeCloseTo(bandStart, 6);
	});

	it('reaches the short periods a pulsar needs — 0.1 h is the bottom of the track', async () => {
		const body: any = { ...makeStar(['star/NS']), rotation_period_hours: 0.1 };
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		await tick();
		expect(Number(rotBlock(container).range.value)).toBeCloseTo(0, 6);
	});

	it('is log-scaled: half travel is 31.6 h, not 5,000', async () => {
		const body: any = makeStar(['star/G']);
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		const { range, number } = rotBlock(container);
		range.value = '0.5';
		range.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
		// sqrt(0.1 * 10000) = 31.62…
		expect(body.rotation_period_hours).toBeCloseTo(31.6, 1);
		expect(Number(number.value)).toBeCloseTo(31.6, 1);
	});

	it('an unset rotation stays unset — the empty box is a gap, not a still star (B9a)', async () => {
		const body: any = makeStar(['star/G']);
		delete body.rotation_period_hours;
		const { container } = render(BodyStarTab, { props: { body, rulePack } });
		await tick();
		expect(body.rotation_period_hours).toBeUndefined();
		expect(rotBlock(container).number.value).toBe('');
	});
});
