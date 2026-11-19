// THE DENSITY CEILING DEPENDS ON THE MASS (engine map PHY-49).
//
// Asked for from play: "more room for brown dwarfs and super-Jupiters" - the density box stopped at a
// flat 30 g/cc, and the suggestion was 80 for a brown dwarf and 30 for a super-Jupiter. The owner
// agreed to a ceiling that follows the mass rather than a second flat number, because a flat one is
// wrong at both ends: 80 is absurd for a rock and too low for a 60 M_Jup dwarf (a real one, LHS 6343 b,
// is about 146).
//
// The engine already knows the shape. Past ~1.9 M_Jup degeneracy holds a hydrogen body near one
// Jupiter radius, so density climbs with mass (`nominalGasDensityGcc`), and v3.1.78 gave such a body
// a fluid envelope whose dense edge is where `structure/overdense` starts. The ceiling is that edge
// times a stated headroom, never below the 30 everything else keeps.
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import {
	maxDensityGcc, densityCeiling, MAX_D, OVERDENSE_HEADROOM, MAX_M,
	editDensity, editDensityAnchored, denserThanFluid, trimEnvelope, densityGcc, massFromRadiusDensity
} from './bodyEdit';
import { compressedDensityFromMakeup, isFluidByMass, nominalGasDensityGcc, normalizeMakeup } from './makeup';
import BodyBasicsTab from '../components/BodyBasicsTab.svelte';
import { loadStarterPack } from '../import/realsky/testPack';
import { unitPrefs } from '../unitPrefsStore';

const EARTH = 5.972e24, R_E = 6371, MJ = 317.8, RJ = 11.209;
const GAS = normalizeMakeup({ gas: 0.95, ice: 0.05 });
const IRON = normalizeMakeup({ metal: 1 });
const radiusAt = (massMe: number, rho: number) => Math.cbrt((5.513 * massMe) / rho);

describe('the ceiling, by mass', () => {
	it('is the old 30 g/cc for every body whose density still says what it is made of', () => {
		// Absolute: the figure itself, not a comparison with the constant that produces it.
		for (const m of [1e-9, 0.01, 0.107, 1, 8, 17.15, 95.2, MJ, 560]) expect(maxDensityGcc(m), `${m} M_E`).toBe(30);
	});

	it('stays at 30 through the super-Jupiters and rises through the brown dwarfs - the figures asked for', () => {
		expect(maxDensityGcc(2 * MJ)).toBe(30);
		expect(maxDensityGcc(5 * MJ)).toBe(30);
		// 13 M_Jup, the lightest brown dwarf: "80 for brown dwarfs" was the request.
		expect(maxDensityGcc(13 * MJ)).toBeGreaterThan(70);
		expect(maxDensityGcc(13 * MJ)).toBeLessThan(75);
		expect(maxDensityGcc(15 * MJ)).toBeGreaterThan(80);
		expect(maxDensityGcc(20 * MJ)).toBeGreaterThan(110);
		expect(maxDensityGcc(20 * MJ)).toBeLessThan(120);
		expect(maxDensityGcc(63 * MJ)).toBeGreaterThan(400);
	});

	it('never falls as the mass rises, and has no step where mass starts to decide', () => {
		let prev = 0;
		for (let m = 0.001; m <= MAX_M; m *= 1.07) {
			const c = maxDensityGcc(m);
			expect(c, `${m} M_E`).toBeGreaterThanOrEqual(prev);
			prev = c;
		}
		expect(isFluidByMass(590)).toBe(false);
		expect(isFluidByMass(592)).toBe(true);
		expect(maxDensityGcc(592)).toBe(maxDensityGcc(590));
	});

	it('is read off the body\'s own fluid envelope: the headroom times the edge where "overdense" starts', () => {
		for (const mj of [8, 13, 22, 40, 80]) {
			const edge = trimEnvelope(mj * MJ, GAS).denHi;
			expect(maxDensityGcc(mj * MJ), `${mj} M_Jup`).toBeCloseTo(OVERDENSE_HEADROOM * edge, 9);
			// So the whole of the "you are being told" zone is reachable from the box...
			const justPast = radiusAt(mj * MJ, edge * 1.05);
			expect(denserThanFluid(mj * MJ, justPast, GAS)).toBe(true);
			// ...and an ordinary body of that mass is nowhere near the stop.
			expect(nominalGasDensityGcc(mj * MJ)).toBeLessThan(maxDensityGcc(mj * MJ) / 3);
		}
	});

	it('real dense objects fit with room to spare', () => {
		expect(maxDensityGcc(21.66 * MJ)).toBeGreaterThan(26.4 * 2);   // CoRoT-3b, 26.4 g/cc
		expect(maxDensityGcc(63 * MJ)).toBeGreaterThan(146 * 2);       // LHS 6343 b, ~146 g/cc
	});

	it('30 is right for solids by the engine\'s own numbers: twice the dense edge of pure iron', () => {
		// The headroom is not a new idea - it is the room the flat 30 always left above the densest
		// thing the composition model can build. If the compression model changes, this says so.
		let densest = 0;
		for (let m = 1e-6; m < 590; m *= 1.5) {
			expect(compressedDensityFromMakeup(m, IRON)).toBeLessThan(14);
			densest = Math.max(densest, trimEnvelope(m, IRON).denHi);
		}
		expect(densest).toBeGreaterThan(14);
		expect(densest).toBeLessThan(15);
		expect(MAX_D / densest).toBeGreaterThanOrEqual(OVERDENSE_HEADROOM);
		expect(MAX_D / densest).toBeLessThan(OVERDENSE_HEADROOM * 1.1);
	});
});

describe('the density edits stop at that ceiling and nowhere else', () => {
	const dwarf = { massMe: 13 * MJ, radiusRe: radiusAt(13 * MJ, 22), makeup: GAS };

	it('THE REQUEST - a 13 M_Jup brown dwarf can be set to 60 g/cc, with the mass locked or free', () => {
		for (const out of [editDensity(dwarf, 60, 'mass'), editDensityAnchored(dwarf, 60)]) {
			expect(densityGcc(out.massMe, out.radiusRe)).toBeCloseTo(60, 6);    // it was held at 30
			expect(out.massMe).toBe(dwarf.massMe);
			expect(out.makeup).toEqual(GAS);                                     // and it is still a dwarf (PHY-41)
		}
	});

	it('past its ceiling the value is limited to the ceiling, the same figure on both paths', () => {
		const cap = maxDensityGcc(dwarf.massMe);
		expect(densityGcc(dwarf.massMe, editDensity(dwarf, 500, 'mass').radiusRe)).toBeCloseTo(cap, 6);
		expect(densityGcc(dwarf.massMe, editDensityAnchored(dwarf, 500).radiusRe)).toBeCloseTo(cap, 6);
	});

	it('a rock, an ice giant and Jupiter still stop at 30', () => {
		const earth = { massMe: 1, radiusRe: 1, makeup: normalizeMakeup({ rock: 0.7, metal: 0.3 }) };
		const neptune = { massMe: 17.15, radiusRe: 3.88, makeup: normalizeMakeup({ gas: 0.8, ice: 0.2 }) };
		const jupiter = { massMe: MJ, radiusRe: 11.2, makeup: GAS };
		for (const s of [earth, neptune, jupiter]) {
			expect(densityGcc(s.massMe, editDensity(s, 80, 'mass').radiusRe)).toBeCloseTo(30, 6);
			expect(densityGcc(s.massMe, editDensityAnchored(s, 80).radiusRe)).toBeCloseTo(30, 6);
		}
	});
});

describe('with the RADIUS held the density is the mass, so the ceiling is asked of the radius', () => {
	it('does not depend on the mass at all - or the slider would re-range under the pointer as it is dragged', () => {
		for (const r of [0.5, 1, 4, 9, RJ, 14]) {
			const a = densityCeiling({ massMe: 1, radiusRe: r }, 'radius');
			const b = densityCeiling({ massMe: 5000, radiusRe: r }, 'radius');
			expect(a, `${r} R_E`).toBe(b);
		}
	});

	it('a small world stays at 30; a Jupiter-sized one runs to the mass limit', () => {
		expect(densityCeiling({ massMe: 1, radiusRe: 1 }, 'radius')).toBe(30);
		expect(densityCeiling({ massMe: 17, radiusRe: 3.88 }, 'radius')).toBe(30);
		expect(densityCeiling({ massMe: MJ, radiusRe: RJ }, 'radius')).toBeCloseTo(densityGcc(MAX_M, RJ), 9);
		expect(densityCeiling({ massMe: MJ, radiusRe: RJ }, 'radius')).toBeGreaterThan(300);
	});

	it('THE LAW IT RESTS ON: every density on the way up is under the ceiling of the mass it implies', () => {
		// Not a figure for one radius - the property that makes "30, or the mass limit" the whole
		// answer. The ceiling has to climb faster than the mass does, or there would be a density
		// part-way up that the mass-held edit refuses and this one allows.
		for (const r of [7.2, 8, 9.5, RJ, 13, 20]) {
			const top = densityCeiling({ massMe: 1, radiusRe: r }, 'radius');
			if (top === MAX_D) continue;
			for (let d = MAX_D; d <= top; d *= 1.03) {
				expect(maxDensityGcc(Math.min(MAX_M, massFromRadiusDensity(r, d))), `${d} g/cc at ${r} R_E`).toBeGreaterThanOrEqual(d);
			}
		}
		// And where it says 30, 30 really is where the next step would be refused.
		for (const r of [0.3, 1, 2.5, 5, 6.5]) {
			expect(densityCeiling({ massMe: 1, radiusRe: r }, 'radius')).toBe(MAX_D);
			expect(maxDensityGcc(massFromRadiusDensity(r, MAX_D))).toBe(MAX_D);
		}
	});

	it('editDensity with the radius locked uses it: Jupiter\'s radius can be loaded up to a brown dwarf', () => {
		const jupiter = { massMe: MJ, radiusRe: RJ, makeup: GAS };
		const out = editDensity(jupiter, 100, 'radius');
		expect(out.radiusRe).toBe(RJ);
		expect(densityGcc(out.massMe, out.radiusRe)).toBeCloseTo(100, 6);
		expect(out.massMe / MJ).toBeGreaterThan(70);
	});
});

describe('the editor: the slider and the number box are one ceiling', () => {
	const rulePack = loadStarterPack() as any;
	const giant = (mj: number, rho: number) => ({
		id: 'p', kind: 'body', roleHint: 'planet', name: 'P', parentId: 'star', classes: ['planet/brown-dwarf'], tags: [],
		autoClassify: false, massKg: mj * MJ * EARTH, radiusKm: radiusAt(mj * MJ, rho) * R_E, makeup: { ...GAS },
		orbit: { hostId: 'star', elements: { a_AU: 5, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }
	}) as any;
	const mount = (body: any) => {
		unitPrefs.set({});
		const { container } = render(BodyBasicsTab, { props: { body, rulePack } });
		const label = Array.from(container.querySelectorAll('.sc-field label')).find((l) => l.textContent === 'Density')!;
		const field = label.closest('.sc-field')!;
		return {
			container, body,
			num: field.querySelector('input.sc-num') as HTMLInputElement,
			slider: field.querySelector('input.sc-slider') as HTMLInputElement,
			ends: field.querySelector('.sc-ends')!.textContent ?? '',
			rho: () => densityGcc(body.massKg / EARTH, body.radiusKm / R_E)
		};
	};
	// The component reassigns `body` to a new object on commit; the prop object handed in is the one
	// mutated first, so read through it.

	it('a 13 M_Jup dwarf: the slider ends at its ceiling, and 60 typed in the box is 60 on the body', async () => {
		const ed = mount(giant(13, 22));
		const cap = maxDensityGcc(13 * MJ);
		expect(ed.ends).toContain(`${Number(cap.toPrecision(3))} g/cc`);
		expect(ed.ends).not.toContain('30 g/cc');
		ed.num.value = '60';
		await fireEvent.change(ed.num);
		await tick();
		expect(ed.rho()).toBeCloseTo(60, 3);
		expect(Number(ed.num.value)).toBeCloseTo(60, 3);
	});

	it('typed past the ceiling: the body, the box and the top of the slider all read the same figure, and it is explained', async () => {
		const ed = mount(giant(13, 22));
		const cap = maxDensityGcc(13 * MJ);
		ed.num.value = '500';
		await fireEvent.change(ed.num);
		await tick();
		expect(ed.rho()).toBeCloseTo(cap, 3);
		expect(Number(ed.num.value)).toBeCloseTo(cap, 1);
		expect(Number(ed.slider.value)).toBe(1);
		const chip = ed.container.querySelector('.sc-edge-chip')?.textContent ?? '';
		expect(chip).toContain(`${Number(cap.toPrecision(3))} g/cc`);
		expect(chip).toContain('Overrides');
		// Typed AGAIN, with the body already at the stop: nothing changes, so nothing re-renders,
		// and the field used to keep the typed text over a body that did not have it.
		ed.num.value = '500';
		await fireEvent.change(ed.num);
		await tick();
		expect(Number(ed.num.value)).toBeCloseTo(cap, 1);
	});

	it('the slider dragged to its end lands on the same ceiling', async () => {
		const ed = mount(giant(13, 22));
		ed.slider.value = '1';
		await fireEvent.input(ed.slider);
		await tick();
		expect(ed.rho()).toBeCloseTo(maxDensityGcc(13 * MJ), 3);
	});

	it('Jupiter and a rock still end at 30', () => {
		expect(mount(giant(1, 1.25)).ends).toContain('30 g/cc');
		const rock = { ...giant(1, 5.5), massKg: EARTH, radiusKm: R_E, makeup: { rock: 0.7, metal: 0.3 }, classes: ['planet/terrestrial'] };
		expect(mount(rock).ends).toContain('30 g/cc');
	});

	it('A SAVED BODY ALREADY PAST THE CEILING IS LEFT ALONE: it opens showing its own density and nothing is written', async () => {
		// Mesklin's shape (5 M_Jup, hundreds of g/cc by hand) and a dwarf squeezed to 300, far past 72.
		for (const body of [giant(5, 672), giant(13, 300)]) {
			const before = JSON.stringify(body);
			const stated = densityGcc(body.massKg / EARTH, body.radiusKm / R_E);
			const ed = mount(body);
			await tick();
			expect(stated).toBeGreaterThan(maxDensityGcc(body.massKg / EARTH));   // the premise
			expect(Number(ed.num.value)).toBeCloseTo(stated, 0);
			expect(Number(ed.num.value)).toBe(Number(stated.toPrecision(4)));
			expect(Number(ed.slider.value)).toBe(1);                               // pinned at the end, not moved
			expect(JSON.stringify(body)).toBe(before);
		}
	});
});
