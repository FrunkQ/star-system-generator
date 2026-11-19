// using-sharing B-3 - "When I use a magnetosphere override to give a planet with no dynamo an
// anomalous magnetic field, it doesn't contribute to habitability (the points are deducted for not
// having a magnetosphere)".
//
// The long-term habitability term asked the INTERIOR MODEL whether there was a dynamo and never the
// resolved field, so the pin moved the shielding tag, the magnetopause and the dose and left this
// one line behind. It now asks `lacksMagnetosphere`, which reads the pin first, in both directions.
// The WEIGHT is untouched: 8 points, exactly as before.
import { describe, it, expect } from 'vitest';
import { systemProcessor } from '../core/SystemProcessor';
import { loadStarterPack } from '../import/realsky/testPack';
import { lacksMagnetosphere } from '../physics/magnetism';
import { buildPhysicsTrace } from '../physics/physicsTrace';
import type { System } from '../types';

const pack = loadStarterPack() as any;
const EARTH = 5.972e24, R_E = 6371;
const NO_FIELD_LINE = 'No magnetosphere (atmosphere stripping)';

// `dynamo: false` is a Mars-mass rock with too little iron to hold a molten core (source 'none');
// `dynamo: true` is an Earth.
function world(dynamo: boolean, pinGauss?: number): System {
	const planet: any = dynamo
		? { massKg: EARTH, radiusKm: R_E, makeup: { metal: 0.32, rock: 0.68 } }
		: { massKg: 0.107 * EARTH, radiusKm: 0.532 * R_E, makeup: { metal: 0.2, rock: 0.8 } };
	return {
		id: 'sys', name: 'Sys', seed: 'seed', epochT0: 0, age_Gyr: 4.6,
		nodes: [
			{ id: 'star', name: 'Star', kind: 'body', parentId: null, roleHint: 'star', massKg: 1.989e30, radiusKm: 696340,
			  temperatureK: 5778, radiationOutput: 1, classes: ['star/G'], axial_tilt_deg: 7, rotation_period_hours: 600 },
			{ id: 'p', name: 'P', kind: 'body', parentId: 'star', roleHint: 'planet', ...planet,
			  axial_tilt_deg: 23, rotation_period_hours: 24, classes: [], tags: [],
			  hydrosphere: { composition: 'water', coverage: 0.4 },
			  atmosphere: { main: 'N2', pressure_bar: 1, composition: { N2: 0.78, O2: 0.21, CO2: 0.0004 } },
			  ...(pinGauss === undefined ? {} : { overrides: { magneticFieldGauss: pinGauss } }),
			  orbit: { hostId: 'star', elements: { a_AU: 1, e: 0.02, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } }
		]
	} as any;
}
// `any`: the committed field and the score are derived fields the CelestialBody type does not declare.
const run = (s: System): any => systemProcessor.process(s, pack).nodes.find((n) => n.id === 'p');
const deducted = (p: any) => p.habitabilityBreakdown.modifiers.some((m: any) => m.label === NO_FIELD_LINE);
const modifierSum = (p: any) => p.habitabilityBreakdown.modifiers
	.filter((m: any) => m.label === NO_FIELD_LINE).reduce((a: number, m: any) => a + m.delta, 0);

describe('B-3 - the magnetosphere override counts towards habitability', () => {
	it('the premise: a small iron-poor world has no dynamo, and loses exactly 8 points for it', () => {
		const p = run(world(false));
		expect(p.magnetism?.source).toBe('none');
		expect(p.tags?.some((t: any) => t.key === 'magnetic/unshielded')).toBe(true);
		expect(deducted(p)).toBe(true);
		expect(modifierSum(p)).toBe(-8);            // the weight, pinned absolutely - it must not move
	});

	it('pinning a field onto that world removes the deduction - the interior still has no source', () => {
		const p = run(world(false, 0.5));
		expect(p.magnetism?.source).toBe('none');   // the override is NOT a dynamo...
		expect(p.magneticField?.strengthGauss).toBe(0.5);
		expect(p.tags?.some((t: any) => t.key === 'magnetic/anomalous')).toBe(true);
		expect(deducted(p)).toBe(false);            // ...but it IS a magnetosphere
		expect(lacksMagnetosphere(p)).toBe(false);
	});

	it('the score follows: the pinned world scores at least the 8 points more', () => {
		const bare = run(world(false)), pinned = run(world(false, 0.5));
		expect(bare.habitabilityBreakdown!.surfaceScore).toBeGreaterThan(8);   // or the floor at zero hides it
		expect(pinned.habitabilityScore! - bare.habitabilityScore!).toBeGreaterThanOrEqual(8);
	});

	it('and it cuts both ways: a field pinned to ZERO on a world with a dynamo is no magnetosphere', () => {
		const earth = run(world(true));
		expect(earth.magnetism?.intrinsic).toBe(true);
		expect(deducted(earth)).toBe(false);
		const stripped = run(world(true, 0));
		expect(stripped.tags?.some((t: any) => t.key === 'magnetic/unshielded')).toBe(true);
		expect(deducted(stripped)).toBe(true);
		expect(modifierSum(stripped)).toBe(-8);
	});

	it('the Newton explainer shows the same working: the pin, not the interior model\'s "none"', () => {
		const line = (p: any) => buildPhysicsTrace(p).layers.find((l) => l.id === 'habitability')!
			.inputs.find((i) => i.label === 'Magnetosphere')!.value;
		expect(line(run(world(false)))).toBe('none');
		expect(line(run(world(false, 0.5)))).toMatch(/^present .*pinned by the GM at 0\.500 G/);
		expect(line(run(world(true, 0)))).toMatch(/^none .*pinned by the GM at 0 G/);
	});

	it('with nothing pinned the answer is the interior model\'s, exactly as before', () => {
		const none: any = { magnetism: { source: 'none', intrinsic: false }, magneticField: { strengthGauss: 0 } };
		const venus: any = { magnetism: { source: 'suppressed', intrinsic: false }, magneticField: { strengthGauss: 0 } };
		const europa: any = { magnetism: { source: 'salty-ocean-induced', intrinsic: false }, magneticField: { strengthGauss: 0.005 } };
		const earth: any = { magnetism: { source: 'iron-core', intrinsic: true }, magneticField: { strengthGauss: 0.5 } };
		expect(lacksMagnetosphere(none)).toBe(true);
		expect(lacksMagnetosphere(venus)).toBe(false);   // unchanged on purpose: this is not the overhaul
		expect(lacksMagnetosphere(europa)).toBe(false);
		expect(lacksMagnetosphere(earth)).toBe(false);
		expect(lacksMagnetosphere({} as any)).toBe(false); // never processed: no claim either way
	});
});
