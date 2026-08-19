// JETS AND SHEDDING ARE TAGS FROM PHYSICS (inbox G26): a fed hole and a neutron star jet, the Sun does
// not; a red giant sheds, a dwarf does not. Pinned on the numbers first (the pure law) and then
// through the processor (the tag really lands, and idempotently).
import { describe, it, expect } from 'vitest';
import { systemProcessor } from '$lib/core/SystemProcessor';
import { loadStarterPack } from '$lib/import/realsky/testPack';
import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '$lib/constants';
import {
	STELLAR_JETS_TAG, STELLAR_SHEDDING_TAG,
	compactness, jetWellTerm, jetFieldTerm, jetIndex, jetBucket, accretionFraction, ACTIVE_HOLE_FEED_FLOOR,
	reimersMassLossMsunYr, sheddingBucket, starJetBucket, starSheddingBucket,
	jetStrength, sheddingStrength
} from './stellarOutflows';

const pack = loadStarterPack() as any;
const SOL = SOLAR_MASS_KG, RSUN = SOLAR_RADIUS_KM;

// ── The law ──────────────────────────────────────────────────────────────────────────────────────

describe('compactness — the well a jet launches from', () => {
	it('is 1 at a horizon, a third for a neutron star, nothing for the Sun', () => {
		expect(compactness(10 * SOL, 29.5)).toBeCloseTo(1, 1);          // a 10 Msun hole: R = Rs
		expect(compactness(1.4 * SOL, 12)).toBeCloseTo(0.34, 1);        // a 12 km neutron star
		expect(compactness(0.6 * SOL, 9000)).toBeLessThan(1e-3);        // Sirius B
		expect(compactness(SOL, RSUN)).toBeLessThan(1e-5);              // the Sun
	});
	it('gates: a white dwarf and the Sun contribute nothing, a neutron star most of a hole', () => {
		expect(jetWellTerm(compactness(SOL, RSUN))).toBe(0);
		expect(jetWellTerm(compactness(0.6 * SOL, 9000))).toBe(0);
		expect(jetWellTerm(compactness(1.4 * SOL, 12))).toBeGreaterThan(0.7);
		expect(jetWellTerm(1)).toBe(1);
	});
});

describe('the field term', () => {
	it('is zero through a white dwarf\'s megagauss and saturates at a pulsar\'s teragauss', () => {
		expect(jetFieldTerm(1)).toBe(0);
		expect(jetFieldTerm(1e6)).toBe(0);
		expect(jetFieldTerm(1e9)).toBeCloseTo(0.5, 5);
		expect(jetFieldTerm(1e12)).toBe(1);
		expect(jetFieldTerm(1e15)).toBe(1);
	});
});

describe('the jet index — well x power, no class branch', () => {
	it('a FED black hole jets; a QUIESCENT hole (no field, no feed) does not', () => {
		const fed = jetIndex({ massKg: 10 * SOL, radiusKm: 29.5, fieldGauss: 1e6, accretion: 0.6 });
		const quiet = jetIndex({ massKg: 10 * SOL, radiusKm: 29.5, fieldGauss: 0, accretion: 0 });
		expect(jetBucket(fed)).toBe('strong');
		expect(jetBucket(quiet)).toBeUndefined();
	});
	it('a neutron star jets on its magnetosphere alone; a magnetar harder', () => {
		const ns = jetIndex({ massKg: 1.4 * SOL, radiusKm: 12, fieldGauss: 1e10 });
		const mag = jetIndex({ massKg: 1.4 * SOL, radiusKm: 12, fieldGauss: 1e15 });
		expect(jetBucket(ns)).toBeDefined();
		expect(mag).toBeGreaterThan(ns);
		expect(jetBucket(mag)).toBe('strong');
	});
	it('Sol, a magnetic white dwarf and a flare M dwarf do not', () => {
		expect(jetIndex({ massKg: SOL, radiusKm: RSUN, fieldGauss: 1 })).toBe(0);
		expect(jetIndex({ massKg: 0.6 * SOL, radiusKm: 9000, fieldGauss: 1e6 })).toBe(0);
		expect(jetIndex({ massKg: 0.12 * SOL, radiusKm: 0.15 * RSUN, fieldGauss: 1000 })).toBe(0);
	});
	it('a known spin multiplies up, an absent one boosts nothing', () => {
		const slow = jetIndex({ massKg: 1.4 * SOL, radiusKm: 12, fieldGauss: 1e9 });
		const fast = jetIndex({ massKg: 1.4 * SOL, radiusKm: 12, fieldGauss: 1e9, rotationHours: 1 / 3600 }); // a 1 s pulsar
		expect(fast).toBeGreaterThan(slow);
	});
	it('a hole authored as feeding with no fraction stored takes the engine\'s 0.5 default, as flareActivity does', () => {
		expect(accretionFraction({ classes: ['star/BH_active'] })).toBe(0.5);
		expect(accretionFraction({ classes: ['star/BH'] })).toBe(0);
		expect(accretionFraction({ classes: ['star/BH'], accretionEddington: 0.2 })).toBe(0.2);
	});
	it("an authored-ACTIVE hole is fed however small its stored fraction - it always jets (the owner's Kouchash)", () => {
		expect(accretionFraction({ classes: ['star/BH_active'], accretionEddington: 0 })).toBe(ACTIVE_HOLE_FEED_FLOOR);
		expect(accretionFraction({ classes: ['star/BH_active'], accretionEddington: 0.02 })).toBe(ACTIVE_HOLE_FEED_FLOOR);
		expect(accretionFraction({ classes: ['star/BH_active'], accretionEddington: 0.6 })).toBe(0.6);
		// Kouchash: 14 Msun, 41 km, 72,444 G, BH Active, a tiny fraction — jets, at least moderate.
		const k = { classes: ['star/BH_active'], massKg: 2.77e31, radiusKm: 41, magneticField: { strengthGauss: 72444 }, accretionEddington: 0.02 };
		expect(starJetBucket(k)).toBeDefined();
		// ...and the SAME numbers as a quiescent hole: nothing.
		expect(starJetBucket({ ...k, classes: ['star/BH'], accretionEddington: 0 })).toBeUndefined();
	});
});

describe('Reimers shedding — L R / M', () => {
	it('the Sun sheds nothing visible; a K giant a wind; a red supergiant a shell', () => {
		expect(sheddingBucket(reimersMassLossMsunYr(1, 1, 1))).toBeUndefined();          // 4e-13
		expect(sheddingBucket(reimersMassLossMsunYr(190, 25, 1.5))).toBe('wind');        // Arcturus-ish
		expect(sheddingBucket(reimersMassLossMsunYr(1e5, 900, 15))).toBe('shell');       // Betelgeuse-ish
	});
	it('a dwarf of any letter sheds nothing; an O star\'s wind falls out of the same law', () => {
		expect(sheddingBucket(reimersMassLossMsunYr(25, 1.7, 2.06))).toBeUndefined();    // Sirius A
		expect(sheddingBucket(reimersMassLossMsunYr(0.0016, 0.15, 0.12))).toBeUndefined(); // Proxima
		expect(sheddingBucket(reimersMassLossMsunYr(2.8e5, 10, 40))).toBe('wind');       // an O5 V
	});
});

// ── The body-level verdicts and the readers ──────────────────────────────────────────────────────

describe('verdicts from a star node', () => {
	it('reads radiationOutput as the luminosity and never recomputes it when present', () => {
		// Pinned luminosity of 1 on a body whose radius and temperature would say 800: Sun-like.
		const pinned = { massKg: 2.5 * SOL, radiusKm: 80 * RSUN, temperatureK: 3450, radiationOutput: 1 };
		expect(starSheddingBucket(pinned)).toBeUndefined();
		const free = { massKg: 2.5 * SOL, radiusKm: 80 * RSUN, temperatureK: 3450 };
		expect(starSheddingBucket(free)).toBe('wind');   // ~1e-8: a red GIANT is a wind; a supergiant is the shell
	});
	it('the readers turn the tag into a strength and nothing else', () => {
		expect(jetStrength([{ key: STELLAR_JETS_TAG, value: 'strong' }])).toBe(2);
		expect(jetStrength([{ key: STELLAR_JETS_TAG, value: 'moderate' }])).toBe(1);
		expect(jetStrength([])).toBe(0);
		expect(sheddingStrength([{ key: STELLAR_SHEDDING_TAG, value: 'shell' }])).toBe(2);
		expect(sheddingStrength([{ key: STELLAR_SHEDDING_TAG, value: 'wind' }])).toBe(1);
		expect(sheddingStrength(undefined)).toBe(0);
	});
	it('a neutron star from the pack\'s own numbers jets', () => {
		expect(starJetBucket({ massKg: 1.6 * SOL, radiusKm: 0.00002 * RSUN, magneticField: { strengthGauss: 1e10 } })).toBeDefined();
	});
});

// ── Through the processor: the tag lands, and lands once ─────────────────────────────────────────

const sys = (star: any) => ({
	id: 'sys', name: 'T', seed: 'outflow-test', age_Gyr: 4.6,
	nodes: [{ id: 's', name: 'S', kind: 'body', roleHint: 'star', parentId: null, tags: [], ...star }]
}) as any;
const run = (s: any) => { systemProcessor.process(s, pack); return s.nodes[0]; };
const tagVal = (b: any, key: string) => (b.tags ?? []).find((t: any) => t.key === key)?.value;
const count = (b: any, key: string) => (b.tags ?? []).filter((t: any) => t.key === key).length;

describe('the processor publishes both tags', () => {
	it('Sol: neither', () => {
		const s = run(sys({ classes: ['star/G2V'], massKg: SOL, radiusKm: RSUN, temperatureK: 5778, radiationOutput: 1, magneticField: { strengthGauss: 1 } }));
		expect(tagVal(s, STELLAR_JETS_TAG)).toBeUndefined();
		expect(tagVal(s, STELLAR_SHEDDING_TAG)).toBeUndefined();
	});
	it('a fed black hole: jets', () => {
		const s = run(sys({ classes: ['star/BH_active'], massKg: 10 * SOL, radiusKm: 29.5, temperatureK: 0, radiationOutput: 1e4, magneticField: { strengthGauss: 1e6 }, accretionEddington: 0.6 }));
		expect(tagVal(s, STELLAR_JETS_TAG)).toBe('strong');
	});
	it('a quiescent black hole: no jets', () => {
		const s = run(sys({ classes: ['star/BH'], massKg: 10 * SOL, radiusKm: 29.5, temperatureK: 0, radiationOutput: 0, magneticField: { strengthGauss: 0 } }));
		expect(tagVal(s, STELLAR_JETS_TAG)).toBeUndefined();
	});
	it('a neutron star: jets; a white dwarf: none', () => {
		const ns = run(sys({ classes: ['star/NS'], massKg: 1.6 * SOL, radiusKm: 0.00002 * RSUN, temperatureK: 5e5, radiationOutput: 3000, magneticField: { strengthGauss: 1e11 } }));
		expect(tagVal(ns, STELLAR_JETS_TAG)).toBe('strong');
		const wd = run(sys({ classes: ['star/WD'], massKg: 1.02 * SOL, radiusKm: 5634, temperatureK: 25369, radiationOutput: 0.056, magneticField: { strengthGauss: 1e5 } }));
		expect(tagVal(wd, STELLAR_JETS_TAG)).toBeUndefined();
	});
	it('a red giant sheds a wind, a red supergiant a shell; and it is idempotent — process twice, one tag', () => {
		const g = sys({ classes: ['star/M-III'], massKg: 2.5 * SOL, radiusKm: 80 * RSUN, temperatureK: 3450, radiationOutput: 813 });
		systemProcessor.process(g, pack);
		systemProcessor.process(g, pack);
		const star = g.nodes[0];
		expect(tagVal(star, STELLAR_SHEDDING_TAG)).toBe('wind');
		expect(count(star, STELLAR_SHEDDING_TAG)).toBe(1);
		const sg = run(sys({ classes: ['star/M-I'], massKg: 15 * SOL, radiusKm: 900 * RSUN, temperatureK: 3500, radiationOutput: 1e5 }));
		expect(tagVal(sg, STELLAR_SHEDDING_TAG)).toBe('shell');
	});
	it('a star edited out of its wind loses the tag (the pass owns the key)', () => {
		const g = sys({ classes: ['star/M-III'], massKg: 2.5 * SOL, radiusKm: 80 * RSUN, temperatureK: 3450, radiationOutput: 813 });
		systemProcessor.process(g, pack);
		expect(tagVal(g.nodes[0], STELLAR_SHEDDING_TAG)).toBe('wind');
		g.nodes[0].radiusKm = RSUN; g.nodes[0].radiationOutput = 1; g.nodes[0].massKg = SOL;
		systemProcessor.process(g, pack);
		expect(tagVal(g.nodes[0], STELLAR_SHEDDING_TAG)).toBeUndefined();
	});
});
