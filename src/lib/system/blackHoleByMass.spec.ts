// ideas B22 / S8 - a 120,000 solar-mass black hole, "between a stellar and a supermassive black
// hole", and "a black hole is classified as this".
//
// TWO THINGS WERE WRONG, AND THE SECOND IS THE ONE THAT READ AS A BUG:
//  (1) there was one word, "Black hole", for everything from a collapsed star to a galaxy's core;
//  (2) the plausibility pass compared the hole's mass with the pack's `star/BH` band, which is the
//      STELLAR-mass population (3 to 100 solar masses), and tagged anything ten times past it
//      `physics/implausible = mass-outside-class` - "about 1200x outside its own band". So the
//      product called a perfectly real kind of object physically implausible, while its own
//      supermassive switch offers holes up to 2.7e11.
import { describe, it, expect } from 'vitest';
import { explainStarClass } from './starClassExplain';
import { starImplausibilities } from '../physics/starPlausibility';
import { SUPERMASSIVE_BH_FROM_SOLAR, SUPERMASSIVE_MASS } from '../physics/starBounds';
import { systemProcessor } from '../core/SystemProcessor';
import { systemSummary } from '../starmap/systemSummary';
import { loadStarterPack } from '../import/realsky/testPack';

const pack = loadStarterPack() as any;
const SOL = 1.989e30, RSUN = 695700;
const hole = (mSolar: number, cls = 'star/BH') => ({
	id: 'bh', name: 'BH', kind: 'body', roleHint: 'star', parentId: null, classes: [cls], tags: [],
	massKg: mSolar * SOL, radiusKm: 2.953 * mSolar, temperatureK: 0, radiationOutput: 1e-9
}) as any;
const kindOf = (mSolar: number, cls = 'star/BH') =>
	explainStarClass(pack, cls, { massSolar: mSolar, radiusSolar: (2.953 * mSolar) / RSUN })!.kind;

describe('B22 - a black hole is named for its mass', () => {
	it('the premise: the pack\'s black-hole band is the stellar-mass one, topping out at 100', () => {
		expect(pack.statTemplates['star/BH'].mass_solar).toEqual([3, 100]);
		expect(SUPERMASSIVE_BH_FROM_SOLAR).toBe(1e6);
	});

	it('stellar, intermediate-mass, supermassive - across 10 to 4 million solar masses', () => {
		expect(kindOf(10)).toBe('Black hole');
		expect(kindOf(100)).toBe('Black hole');                       // the top of the stellar band is still stellar
		expect(kindOf(101)).toBe('Intermediate-mass black hole');
		expect(kindOf(1e3)).toBe('Intermediate-mass black hole');
		expect(kindOf(1e4)).toBe('Intermediate-mass black hole');
		expect(kindOf(1.2e5)).toBe('Intermediate-mass black hole');   // the hole in the report
		expect(kindOf(9.9e5)).toBe('Intermediate-mass black hole');
		expect(kindOf(1e6)).toBe('Supermassive black hole');
		expect(kindOf(4e6)).toBe('Supermassive black hole');          // Sagittarius A*
		expect(kindOf(2.7e11)).toBe('Supermassive black hole');
	});

	it('a feeding hole keeps "feeding" and gains the same word', () => {
		expect(kindOf(10, 'star/BH_active')).toBe('Feeding black hole');
		expect(kindOf(1.2e5, 'star/BH_active')).toBe('Feeding intermediate-mass black hole');
		expect(kindOf(4e6, 'star/BH_active')).toBe('Feeding supermassive black hole');
	});

	it('the sentence a GM reads carries it, and the size clause still comes from the hole\'s own horizon', () => {
		const ex = explainStarClass(pack, 'star/BH', { massSolar: 1.2e5, radiusSolar: (2.953 * 1.2e5) / RSUN })!;
		expect(ex.text).toBe('BH (Intermediate-mass black hole, about 0.5 times the width of the Sun)');
	});

	it('with no mass in hand - the picker explaining the CLASS - it stays plain "Black hole"', () => {
		expect(explainStarClass(pack, 'star/BH')!.kind).toBe('Black hole');
		expect(explainStarClass(pack, 'star/BH_active')!.kind).toBe('Feeding black hole');
	});

	it('nothing that is not a black hole reads the mass', () => {
		expect(explainStarClass(pack, 'star/G', { massSolar: 1.2e5 })!.kind).toBe('Main-sequence dwarf');
		expect(explainStarClass(pack, 'star/NS', { massSolar: 1.2e5 })!.kind).toBe('Neutron star');
	});

	it('the starmap card says the same thing as the editor', () => {
		const sys: any = { id: 's', name: 'S', seed: 's', epochT0: 0, age_Gyr: 4.6, nodes: [hole(1.2e5)] };
		expect(systemSummary('S', sys, pack).designation).toMatch(/Intermediate-mass black hole/);
	});
});

describe('B22 - a heavy black hole is not "physically implausible"', () => {
	const laws = (b: any) => starImplausibilities(b, pack).map((x) => x.law);

	it('no hole from 100 solar masses to the theoretical growth limit is told its mass is outside its class', () => {
		for (const m of [100, 1e3, 1.001e3, 1e4, 1.2e5, 1e6, 4e6, 1e9, SUPERMASSIVE_MASS[1]]) {
			expect(laws(hole(m)), `${m} solar masses`).toEqual([]);
			expect(laws(hole(m, 'star/BH_active')), `${m} solar masses, feeding`).toEqual([]);
		}
	});

	it('through the processor: the 120,000 solar-mass hole carries no implausible tag', () => {
		const sys: any = { id: 's', name: 'S', seed: 's', epochT0: 0, age_Gyr: 4.6, nodes: [hole(1.2e5)] };
		const bh = systemProcessor.process(sys, pack).nodes[0] as any;
		expect(bh.classes[0]).toBe('star/BH');
		expect((bh.tags ?? []).filter((t: any) => t.key === 'physics/implausible')).toEqual([]);
	});

	it('the LOW side still speaks: a "black hole" far too light to have collapsed is named', () => {
		expect(laws(hole(0.1))).toEqual(['mass-outside-class']);
	});

	it('and the rule is unchanged for everything else: a 50 solar-mass "G star" is still far outside its band', () => {
		const g: any = { ...hole(50), classes: ['star/G'], radiusKm: RSUN, temperatureK: 5778, radiationOutput: 1 };
		expect(laws(g)).toContain('mass-outside-class');
		const ns: any = { ...hole(50), classes: ['star/NS'], radiusKm: 12 };
		expect(laws(ns)).toContain('mass-outside-class');
	});
});
