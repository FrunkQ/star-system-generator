// LUMINOSITY AND IONISING OUTPUT ARE TWO NUMBERS — owner, 2026-08-15: "stars flare with little
// brightness change and a LOT of ionising radiation. Generally they move together but not always."
//
// That is the physics: a solar flare moves bolometric output by roughly a hundredth of a percent
// while X-ray output jumps three orders of magnitude. Luminosity is fixed by radius and temperature
// (L = 4piR^2 sigma T^4, exact); ionising output is the magnetic dynamo's, and the dynamo is driven by
// convection, rotation and age. Entangling them meant sliding "radiation" up on a red giant produced
// only a `luminosity-mismatch` complaint and never made the star flare.
import { describe, it, expect } from 'vitest';
import { systemProcessor } from '$lib/core/SystemProcessor';
import { loadStarterPack } from '$lib/import/realsky/testPack';
import { STELLAR_ACTIVITY_TAG } from '$lib/physics/stellarActivity';
import { STAR_IMPLAUSIBLE_TAG } from './starPlausibility';

const pack = loadStarterPack() as any;
const SOL = 1.989e30;
const RSUN = 696340;

/** A red giant: big, cool, luminous — and quiet, because it has no strong surface dynamo. */
const redGiant = (over: any = {}) => ({
	id: 'sys', name: 'T', seed: 'activity-test', age_Gyr: 4.6,
	nodes: [{
		id: 'g', name: 'Giant', kind: 'body', roleHint: 'star', parentId: null,
		classes: ['star/M-III'], massKg: 2.5 * SOL, radiusKm: 80 * RSUN,
		temperatureK: 3450, radiationOutput: 813, tags: [], ...over
	}]
}) as any;

const run = (sys: any) => { systemProcessor.process(sys, pack); return sys.nodes[0]; };
const tagVal = (b: any, key: string) => (b.tags ?? []).find((t: any) => t.key === key)?.value;
const hasTag = (b: any, key: string) => (b.tags ?? []).some((t: any) => t.key === key);

describe('a red giant, left alone', () => {
	it('is quiet, because a swollen star has no strong surface dynamo', () => {
		const g = run(redGiant());
		expect(g.flareActivity).toBeCloseTo(0.05, 2);
		expect(tagVal(g, STELLAR_ACTIVITY_TAG)).toBe('quiet');
		expect(hasTag(g, 'hazard/flaring')).toBe(false);
	});
});

// THE OWNER'S CASE: "If I take a red giant up in ionising radiation it never flares... it just says
// Physically implausible: luminosity-mismatch."
describe('a red giant the GM makes active', () => {
	const active = () => run(redGiant({ overrides: { flareActivity: 0.8 } }));

	it('FLARES — which is the whole point, and did not happen before', () => {
		const g = active();
		expect(g.flareActivity).toBe(0.8);
		expect(tagVal(g, STELLAR_ACTIVITY_TAG)).toBe('flare-star');
		expect(hasTag(g, 'hazard/flaring')).toBe(true);
	});

	it('does NOT get brighter, and is NOT called implausible for it', () => {
		const g = active();
		// The complaint the owner actually saw. Activity is not brightness, so raising one must not
		// contradict the other — that was the entanglement.
		expect(hasTag(g, STAR_IMPLAUSIBLE_TAG)).toBe(false);
		// Luminosity still follows radius and temperature, untouched.
		const thermal = Math.pow(80, 2) * Math.pow(3450 / 5778, 4);
		expect(g.radiationOutput).toBeCloseTo(thermal, 0);
	});
});

describe('the override is a PIN, and hands back cleanly', () => {
	it('survives reprocessing rather than being re-derived away', () => {
		const sys = redGiant({ overrides: { flareActivity: 0.8 } });
		systemProcessor.process(sys, pack);
		systemProcessor.process(sys, pack); // idempotence: a pin is not a one-pass effect
		expect(sys.nodes[0].flareActivity).toBe(0.8);
	});

	it('returns to the derived value when the key is deleted', () => {
		const sys = redGiant({ overrides: { flareActivity: 0.8 } });
		systemProcessor.process(sys, pack);
		delete sys.nodes[0].overrides.flareActivity;
		systemProcessor.process(sys, pack);
		expect(sys.nodes[0].flareActivity).toBeCloseTo(0.05, 2);
		expect(hasTag(sys.nodes[0], 'hazard/flaring')).toBe(false);
	});

	it('leaves an unpinned star entirely to the physics', () => {
		// The derivation still owns the ordinary case: class AND age, so a young M dwarf flares and an
		// old one does not. Nothing here changes that.
		const young = run({ ...redGiant(), age_Gyr: 0.3, nodes: [{ ...redGiant().nodes[0], id: 'm', classes: ['star/M'], massKg: 0.27 * SOL, radiusKm: 0.4 * RSUN, temperatureK: 3050, radiationOutput: 0.0124 }] });
		expect(hasTag(young, 'hazard/flaring')).toBe(true);
	});
});
