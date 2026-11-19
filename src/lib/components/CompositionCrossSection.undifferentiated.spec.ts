// ideas B27 - "Should asteroids below a certain point not have differentiated layers on the cross
// section? Since by that point they're rubble piles". Owner: "You are right".
//
// The cutaway drew EVERY body as concentric shells - a metal core, a rock mantle, an ice shell - down
// to a rock a few kilometres across. Shells are a claim that the body once melted and its iron sank,
// and the engine already has one line for when that is possible: HYDROSTATIC_MIN_RADIUS_KM, which
// the geology and subsurface-ocean models ask. Below it the same makeup is now drawn as a mix.
//
// This renders the component and reads the SVG it drew, because the claim is about a picture.
import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import CompositionCrossSection from './CompositionCrossSection.svelte';
import { HYDROSTATIC_MIN_RADIUS_KM } from '$lib/constants';
import type { CelestialBody, Makeup } from '$lib/types';

const MAKEUP: Required<Makeup> = { metal: 0.1, rock: 0.75, carbon: 0.15, ice: 0, gas: 0 };
const COLOUR = { metal: '#8e939e', rock: '#a9805a', carbon: '#3a3a40' };

function body(radiusKm: number, extra: Partial<CelestialBody> = {}): CelestialBody {
	return { id: `b-${radiusKm}`, name: 'B', kind: 'body', roleHint: 'planet', parentId: 'star', apparentColorHex: '#8a8f99',
		massKg: 2.6e3 * (4 / 3) * Math.PI * (radiusKm * 1000) ** 3, radiusKm, classes: [], tags: [], ...extra } as CelestialBody;
}
function draw(b: CelestialBody, makeup = MAKEUP) {
	const { container } = render(CompositionCrossSection, { props: { body: b, makeup, seed: b.id } });
	const quarter = container.querySelector(`[clip-path="url(#xsec-q-comp-${b.id})"]`)!;
	const titles = [...quarter.querySelectorAll('title')].map((t) => t.textContent ?? '');
	return { container, quarter, titles, mix: quarter.querySelector('.xsec-mix') };
}

describe('B27 - a body too small to have differentiated is not drawn with layers', () => {
	it('the premise: the line is the engine\'s own differentiation limit, 200 km', () => {
		expect(HYDROSTATIC_MIN_RADIUS_KM).toBe(200);
	});

	it('a 5 km asteroid: no core, no mantle, no shell - one mixed mass', () => {
		const { quarter, titles, mix } = draw(body(5, { classes: ['asteroid/s-type'] }));
		expect(mix).toBeTruthy();
		for (const layer of ['Metal core', 'Rock mantle', 'Carbon layer', 'Ice shell']) expect(titles).not.toContain(layer);
		// Nothing concentric: no circle in the composition quarter is centred on the body.
		const centred = [...quarter.querySelectorAll('circle')].filter((c) => c.getAttribute('cx') === '50' && c.getAttribute('cy') === '50');
		expect(centred).toHaveLength(0);
	});

	it('the mix is the body\'s own makeup: the commonest material is the mass, the others are fragments in it', () => {
		const { mix, titles } = draw(body(40));
		expect(mix!.querySelector('rect')!.getAttribute('fill')).toBe(COLOUR.rock);
		const fills = [...mix!.querySelectorAll('circle')].map((c) => c.getAttribute('fill'));
		expect(fills).toContain(COLOUR.carbon);
		expect(fills).toContain(COLOUR.metal);
		expect(fills).not.toContain(COLOUR.rock);                  // the base is not scattered through itself
		expect(fills).not.toContain('#cfe6ff');                    // and a material it does not have is not invented
		// Carbon is 15% by mass but light, so by VOLUME it outnumbers the 10% of dense metal several times over.
		const n = (c: string) => fills.filter((f) => f === c).length;
		expect(n(COLOUR.carbon)).toBeGreaterThan(n(COLOUR.metal));
		expect(titles[0]).toMatch(/^Mixed throughout, not layered: rock 75%, carbon 15%, metal 10% by mass/);
	});

	it('it is repeatable: the same body draws the same fragments', () => {
		const a = draw(body(40)).mix!.innerHTML, b = draw(body(40)).mix!.innerHTML;
		expect(a).toBe(b);
	});

	it('a single-material rock is simply that material', () => {
		const { mix } = draw(body(12), { metal: 1, rock: 0, carbon: 0, ice: 0, gas: 0 });
		expect(mix!.querySelector('rect')!.getAttribute('fill')).toBe(COLOUR.metal);
		expect(mix!.querySelectorAll('circle')).toHaveLength(0);
	});

	it('just over the line the layers are back: Vesta-sized (263 km) and Earth keep their core and mantle', () => {
		for (const r of [HYDROSTATIC_MIN_RADIUS_KM, 263, 6371]) {
			const { titles, mix } = draw(body(r));
			expect(mix, `${r} km`).toBeNull();
			expect(titles, `${r} km`).toContain('Metal core');
			expect(titles, `${r} km`).toContain('Rock mantle');
		}
	});

	it('just under it they are gone', () => {
		expect(draw(body(HYDROSTATIC_MIN_RADIUS_KM - 1)).mix).toBeTruthy();
	});
});
