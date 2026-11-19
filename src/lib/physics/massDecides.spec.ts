// ideas B18 / B17 / S6 - "brown dwarfs turning into rockys", "only happens when i lock the mass",
// "when I try setting a custom density for a super-jupiter or a sub-brown dwarf it instead becomes
// a very large rocky planet", "import brown dwarfs from space engine ... ultra dense rockys".
//
// ONE CAUSE, TWO DOORS. The engine tells a giant from a solid world by "massive AND lighter than
// 2.5 g/cc". Degenerate hydrogen is not light: a body past ~2 Jupiter masses is denser than that by
// its own mass-radius relation, and a brown dwarf is denser than iron. So
//   (1) a heavy giant with no stored composition was INFERRED as iron (`makeupFractions`), and
//   (2) any density edit re-inferred the composition from the new density (`makeupForGeomDensity`).
// Above the mass where the lightness test can no longer be passed, mass now decides.
import { describe, it, expect } from 'vitest';
import {
	isFluidByMass, nominalGasDensityGcc, makeupFractions, normalizeMakeup, hasSolidSurface, rendersAsGiant,
	FLUID_GIANT_MAX_GCC
} from './makeup';
import { editDensity, editDensityAnchored, editRadius, editMass, densityGcc, denserThanFluid, trimEnvelope } from './bodyEdit';
import { systemProcessor } from '../core/SystemProcessor';
import { loadStarterPack } from '../import/realsky/testPack';
import { describeTag, hasOwnTagWriteUp } from '../tags/tagPresentation';
import type { CelestialBody, System } from '../types';

const EARTH = 5.972e24, R_E = 6371, MJ = 317.8, RJ = 11.209;
const GAS = normalizeMakeup({ gas: 0.95, ice: 0.05 });
/** A body with NO stored composition - what an import hands over. */
const bare = (mj: number, rj: number) => ({ id: 'b', kind: 'body', roleHint: 'planet', massKg: mj * MJ * EARTH, radiusKm: rj * RJ * R_E }) as unknown as CelestialBody;
const rhoOf = (b: CelestialBody) => densityGcc(b.massKg! / EARTH, b.radiusKm! / R_E);

describe('B18 - where mass starts to decide', () => {
	it('the line is where the engine\'s own giant relation reaches the 2.5 g/cc ceiling: about 1.9 Jupiter masses', () => {
		// Absolute anchors, not a ratio: Jupiter and Saturn are below it, every super-Jupiter band is above.
		expect(isFluidByMass(95.2)).toBe(false);          // Saturn
		expect(isFluidByMass(317.8)).toBe(false);         // Jupiter
		expect(isFluidByMass(560)).toBe(false);
		expect(isFluidByMass(620)).toBe(true);
		expect(isFluidByMass(800)).toBe(true);            // the pack's super-jupiter band starts here
		expect(isFluidByMass(2500)).toBe(true);           // sub-brown dwarf
		expect(isFluidByMass(6883)).toBe(true);           // CoRoT-3b
		expect(nominalGasDensityGcc(560)).toBeLessThan(FLUID_GIANT_MAX_GCC);
		expect(nominalGasDensityGcc(620)).toBeGreaterThan(FLUID_GIANT_MAX_GCC);
	});

	it('it is never true of a small body, however dense the giant relation would make one', () => {
		for (const m of [1e-6, 0.01, 0.3, 1, 5, 8]) expect(isFluidByMass(m)).toBe(false);
	});
});

describe('B18 door 1 - a heavy giant with no stored composition is not inferred as iron', () => {
	it('CoRoT-3b (21.66 M_Jup, 1.01 R_Jup, 26.4 g/cc) is a fluid body, drawn as a giant', () => {
		const b = bare(21.66, 1.01);
		expect(rhoOf(b)).toBeGreaterThan(25);             // the premise: denser than iron
		expect(makeupFractions(b).gas).toBeGreaterThan(0.5);
		expect(makeupFractions(b).metal).toBe(0);
		expect(hasSolidSurface(b)).toBe(false);
		expect(rendersAsGiant(b)).toBe(true);
	});

	it('so are a dense super-Jupiter, a sub-brown dwarf and a 60 M_Jup brown dwarf', () => {
		for (const [mj, rj] of [[3, 1.0], [5, 0.6], [9.43, 1.014], [13, 0.98], [60, 0.85]]) {
			const b = bare(mj, rj);
			expect(rhoOf(b), `${mj} M_Jup premise`).toBeGreaterThan(FLUID_GIANT_MAX_GCC);
			expect(makeupFractions(b).gas, `${mj} M_Jup at ${rhoOf(b).toFixed(1)} g/cc`).toBeGreaterThan(0.5);
		}
	});

	it('nothing below the line moves: a dense Saturn-mass body, a mega-Earth and Earth are still solid', () => {
		const denseSaturn = { massKg: 95 * EARTH, radiusKm: 5 * R_E } as CelestialBody;      // 4.2 g/cc
		const megaEarth = { massKg: 30 * EARTH, radiusKm: 2.4 * R_E } as CelestialBody;      // 12 g/cc
		const earth = { massKg: EARTH, radiusKm: R_E } as CelestialBody;
		for (const b of [denseSaturn, megaEarth, earth]) expect(makeupFractions(b).gas).toBe(0);
		expect(makeupFractions(bare(1, 1)).gas).toBeGreaterThan(0.5);                        // Jupiter, as ever
	});

	it('a composition somebody WROTE stands, at any mass (steer, never stop)', () => {
		const ironGiant = { ...bare(20, 0.5), makeup: { metal: 1 } } as CelestialBody;
		expect(makeupFractions(ironGiant).metal).toBe(1);
		expect(hasSolidSurface(ironGiant)).toBe(true);
	});
});

describe('B18 door 2 - a density edit no longer turns a heavy giant into rock', () => {
	const superJupiter = { massMe: 5 * MJ, radiusRe: 10.5, makeup: GAS };
	const brownDwarf = { massMe: 20 * MJ, radiusRe: 10, makeup: GAS };

	it('"lock the mass, raise the density": the radius follows and the composition holds', () => {
		for (const [s, rho] of [[superJupiter, 20], [superJupiter, 30], [brownDwarf, 26.4]] as const) {
			const out = editDensity(s, rho, 'mass');
			expect(out.makeup).toEqual(GAS);
			expect(out.massMe).toBe(s.massMe);
			expect(densityGcc(out.massMe, out.radiusRe)).toBeCloseTo(rho, 6);
		}
	});

	it('unlocked, past the green band: the same, and the type is NOT handed back to the physics', () => {
		const env = trimEnvelope(superJupiter.massMe, GAS);
		const out = editDensityAnchored(superJupiter, env.denHi * 2);
		expect(out.makeup).toEqual(GAS);
		expect(out.outOfBand).toBe(false);
	});

	it('a radius edit and a radius-locked mass drag hold the composition too', () => {
		expect(editRadius(superJupiter, 6, 'mass').makeup).toEqual(GAS);
		// Jupiter dragged up to 3 M_Jup with its radius pinned: 4 g/cc, which used to read as rock.
		const jupiter = { massMe: MJ, radiusRe: 11.2, makeup: GAS };
		const out = editMass(jupiter, 3 * MJ, 'radius');
		expect(densityGcc(out.massMe, out.radiusRe)).toBeGreaterThan(FLUID_GIANT_MAX_GCC);
		expect(out.makeup).toEqual(GAS);
	});

	it('below the line a density edit still re-reads the composition, exactly as before', () => {
		const jupiter = { massMe: MJ, radiusRe: 11.2, makeup: GAS };
		const out = editDensity(jupiter, 4, 'mass');
		expect(out.makeup.gas).toBeLessThan(0.5);
		expect(editDensityAnchored(jupiter, 4).outOfBand).toBe(true);
	});

	it('an authored solid giant is held as well - the density box is not how a makeup is changed up here', () => {
		const iron = normalizeMakeup({ metal: 1 });
		expect(editDensity({ massMe: 20 * MJ, radiusRe: 6, makeup: iron }, 20, 'mass').makeup).toEqual(iron);
	});
});

describe('B18 - steer, tag and explain: the unusual density is SAID, never corrected', () => {
	it('real dense objects are inside their envelope; a 30 g/cc super-Jupiter is past it', () => {
		expect(denserThanFluid(21.66 * MJ, 1.01 * RJ, GAS)).toBe(false);   // CoRoT-3b
		expect(denserThanFluid(9.1 * MJ, 0.95 * RJ, GAS)).toBe(false);     // HAT-P-2b
		expect(denserThanFluid(63 * MJ, 0.83 * RJ, GAS)).toBe(false);      // LHS 6343 b, ~146 g/cc
		const r30 = Math.cbrt((5.513 * 5 * MJ) / 30);
		expect(denserThanFluid(5 * MJ, r30, GAS)).toBe(true);
	});

	it('it is silent below the line (an ice giant sits on its own edge) and on a solid makeup', () => {
		expect(denserThanFluid(17.15, 3.88, normalizeMakeup({ gas: 0.8, ice: 0.2 }))).toBe(false);  // Neptune
		expect(denserThanFluid(MJ, 7, GAS)).toBe(false);
		expect(denserThanFluid(5 * MJ, 5, normalizeMakeup({ metal: 1 }))).toBe(false);
	});

	const pack = loadStarterPack() as any;
	const sys = (p: Partial<CelestialBody>): System => ({
		id: 'sys', name: 'S', seed: 's', epochT0: 0, age_Gyr: 4.6, nodes: [
			{ id: 'star', name: 'Star', kind: 'body', parentId: null, roleHint: 'star', massKg: 1.989e30, radiusKm: 696340,
			  temperatureK: 5778, radiationOutput: 1, classes: ['star/G'], axial_tilt_deg: 7, rotation_period_hours: 600 },
			{ id: 'p', name: 'P', kind: 'body', parentId: 'star', roleHint: 'planet', axial_tilt_deg: 20, rotation_period_hours: 10,
			  classes: [], tags: [], autoClassify: true,
			  orbit: { hostId: 'star', elements: { a_AU: 5, e: 0.02, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }, ...p }
		]
	}) as any;
	const body = (s: System) => s.nodes.find((n) => n.id === 'p') as CelestialBody;
	const has = (b: CelestialBody, key: string) => !!b.tags?.some((t) => t.key === key);

	it('through the processor: an imported CoRoT-3b is a dwarf with no ground and no warning', () => {
		const b = body(systemProcessor.process(sys({ massKg: 21.66 * MJ * EARTH, radiusKm: 1.01 * RJ * R_E }), pack));
		expect(b.classes?.[0]).toMatch(/dwarf/);
		expect(hasSolidSurface(b)).toBe(false);
		expect(has(b, 'structure/overdense')).toBe(false);
		expect(b.habitabilityBreakdown?.modifiers?.[0]?.label).toMatch(/No solid surface/);
	});

	it('a super-Jupiter squeezed to 30 g/cc stays a giant, is tagged, and keeps the tag on a reprocess', () => {
		const r30 = Math.cbrt((5.513 * 5 * MJ) / 30) * R_E;
		const once = systemProcessor.process(sys({ massKg: 5 * MJ * EARTH, radiusKm: r30, makeup: { ...GAS } }), pack);
		const twice = systemProcessor.process(JSON.parse(JSON.stringify(once)), pack);
		for (const b of [body(once), body(twice)]) {
			expect(b.classes?.[0]).toMatch(/giant|jupiter/);
			expect(b.classes?.[0]).not.toMatch(/terrestrial|earth|iron|barren|rock/);
			expect(makeupFractions(b).gas).toBeGreaterThan(0.5);
			expect(b.radiusKm).toBeCloseTo(r30, 3);                      // nothing "repaired" the GM's size
			expect(b.tags!.filter((t) => t.key === 'structure/overdense')).toHaveLength(1);
		}
	});

	it('the tag explains itself', () => {
		expect(hasOwnTagWriteUp('structure/overdense')).toBe(true);
		expect(describeTag('structure/overdense').description).toMatch(/still treated as a fluid giant/);
	});
});
