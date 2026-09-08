// R-19 JOB 2 — ABSENT / IDENTICAL / DIFFERENT, and the reasoning that decides each.
//
// This is the job the whole feature turns on. Get IDENTICAL wrong and every paste after the first
// duplicates or renames somebody's rules; get DIFFERENT wrong and a paste silently replaces a
// definition every body in the destination campaign reads.
//
// RED-FIRST, checked 2026-09-08: swap `canonicalJson` for `JSON.stringify` and the key-order gate
// fails; compare against `destination` instead of the destination's EFFECTIVE pack and the
// shipped-definition gate fails; compare deltas instead of applied results and the water gate fails.
import { describe, it, expect } from 'vitest';
import { compareClipOverrides, effectiveDefinitions, SECTIONS } from './clipRules';
import type { RulePack, RulePackOverrides } from '$lib/types';

const PACK = {
	id: 'test', version: '1',
	fuelDefinitions: { entries: [{ id: 'h2', name: 'Hydrogen', density_kg_per_m3: 71, description: '' }] },
	engineDefinitions: { entries: [{ id: 'ion', name: 'Ion', type: 'ion', fuel_type_id: 'h2', thrust_kN: 1, efficiency_isp: 3000, description: '' }] },
	gasPhysics: { N2: { molarMass: 28 } },
	// The distribution has to be here: `buildEffectiveRulePack` only applies an atmosphere override
	// INTO an existing `atmosphere_composition` distribution, so a pack without one drops it. That is
	// the engine's own behaviour, pinned by `effectivePack.spec.ts`, not something this test invents.
	distributions: { atmosphere_composition: { name: 'Atmosphere Composition', entries: [{ weight: 20, value: { name: 'Nitrogen-Oxygen' } }] } },
	liquids: [
		{ name: 'water', label: 'Water', meltK: 273.15, boilK: 373.15 },
		{ name: 'ammonia', label: 'Ammonia', meltK: 195.4, boilK: 239.8 }
	],
	morphologies: [
		{ key: 'flora', label: 'Flora', order: 2, defaultCoverage: 0.6, tints: ['#3d6b34'], pigmentDriven: 0.9, opacity: 0.8, light: { min: 0, max: 0 } }
	],
	pigments: [{ key: 'chlorophyll', label: 'Chlorophyll', bands: [{ centreNm: 430, widthNm: 40, strength: 0.9 }] }]
} as unknown as RulePack;

const UNOBTAINIUM = { name: 'unobtainium', label: 'Unobtainium', meltK: 90, boilK: 260, colorHex: '#b18cff' };

/** Everything about one definition, for a test that only cares about the verdict. */
function verdictFor(incoming: RulePackOverrides, destination: RulePackOverrides | undefined, id: string) {
	return compareClipOverrides(incoming, destination, PACK).find((d) => d.id === id);
}

describe('R-19 the verdict', () => {
	it('ABSENT when the destination has never heard of it', () => {
		expect(verdictFor({ liquids: [UNOBTAINIUM] } as any, undefined, 'unobtainium')?.verdict).toBe('absent');
	});

	it('IDENTICAL when the destination already has the same one - the ordinary case', () => {
		// Paste a star, then one of its planets: every rule the second clip carries is one the first
		// already brought. This is the row that must be silent.
		const v = verdictFor({ liquids: [UNOBTAINIUM] } as any, { liquids: [UNOBTAINIUM] } as any, 'unobtainium');
		expect(v?.verdict).toBe('identical');
	});

	it('DIFFERENT when the destination has another definition under that name', () => {
		const theirs = { ...UNOBTAINIUM, boilK: 999, colorHex: '#ff0000' };
		const v = verdictFor({ liquids: [theirs] } as any, { liquids: [UNOBTAINIUM] } as any, 'unobtainium');
		expect(v?.verdict).toBe('different');
		expect(v?.existing).toMatchObject({ boilK: 260 });
		expect(v?.incoming).toMatchObject({ boilK: 999 });
	});

	// THE GATE THE BRIEF NAMES: key order alone must never cause a rename.
	it('KEY ORDER ALONE IS NEVER A DIFFERENCE, however the object was built', () => {
		// Built field by field in a deliberately different order - which is what a different engine
		// version, a hand-edited save or a round trip through a database actually produces.
		const reordered: any = {};
		reordered.colorHex = UNOBTAINIUM.colorHex;
		reordered.boilK = UNOBTAINIUM.boilK;
		reordered.label = UNOBTAINIUM.label;
		reordered.meltK = UNOBTAINIUM.meltK;
		reordered.name = UNOBTAINIUM.name;
		expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(UNOBTAINIUM));   // genuinely two strings
		const v = verdictFor({ liquids: [reordered] } as any, { liquids: [UNOBTAINIUM] } as any, 'unobtainium');
		expect(v?.verdict).toBe('identical');
	});

	it('but ARRAY ORDER IS a difference, because a sequence is not a set', () => {
		// A pigment's bands are a sequence; the fields of a band are a set. `canonicalJson` sorts the
		// second and leaves the first alone, and that distinction is the whole reason it exists.
		const bands = [{ centreNm: 430, widthNm: 40, strength: 0.9 }, { centreNm: 660, widthNm: 30, strength: 0.7 }];
		const mine = { pigments: { entries: { p: { key: 'p', label: 'P', bands } } } } as any;
		const theirs = { pigments: { entries: { p: { key: 'p', label: 'P', bands: [...bands].reverse() } } } } as any;
		expect(verdictFor(mine, theirs, 'p')?.verdict).toBe('different');
	});

	it('a definition identical to the SHIPPED one is identical, not absent', () => {
		// The destination has no liquids override at all - but it IS using the shipped water, so a
		// clip carrying that water unchanged brings nothing. Adding it would store a redundant
		// override and freeze water against every later improvement to the pack.
		const shippedWater = { name: 'water', label: 'Water', meltK: 273.15, boilK: 373.15 };
		expect(verdictFor({ liquids: [shippedWater] } as any, undefined, 'water')?.verdict).toBe('identical');
	});
});

describe('R-19 a delta is judged by what it MEANS, not by what it says', () => {
	// The decision written up as engine-map DATA-R46, and the case that proves it is not academic.
	it('an incoming delta against an untouched definition is DIFFERENT, not absent', () => {
		// `{ boilK: 400 }` for water, against a campaign with no water override. Judged as a DELTA it
		// looks like a new entry to be added. It is not: it is a different water from the one that
		// campaign is already using, and adding it would silently change every body that names water.
		const incoming = { liquids: { entries: { water: { boilK: 400 } } } } as any;
		const v = verdictFor(incoming, undefined, 'water');
		expect(v?.verdict).toBe('different');
		expect(v?.existing).toMatchObject({ boilK: 373.15 });
		expect(v?.incoming).toMatchObject({ name: 'water', boilK: 400 });   // the APPLIED record
	});

	it('two deltas that say different things but MEAN the same are identical', () => {
		// One side restates a field at its shipped value, the other does not mention it. Different
		// deltas, one definition - which comparing deltas would have called a clash and renamed.
		const incoming = { morphologies: { entries: { flora: { opacity: 0.25, pigmentDriven: 0.9 } } } } as any;
		const destination = { morphologies: { entries: { flora: { opacity: 0.25 } } } } as any;
		expect(verdictFor(incoming, destination, 'flora')?.verdict).toBe('identical');
	});

	it('a whole-list override and an equivalent delta agree, because both campaigns saved differently', () => {
		const asList = { liquids: [{ name: 'water', label: 'Water', meltK: 273.15, boilK: 373.15 }, UNOBTAINIUM] } as any;
		const asDelta = { liquids: { entries: { unobtainium: UNOBTAINIUM } } } as any;
		expect(verdictFor(asList, asDelta, 'unobtainium')?.verdict).toBe('identical');
	});

	it('a delta round-trips: what it brings is what the destination ends up using', () => {
		const section = SECTIONS.find((s) => s.key === 'liquids')!;
		const brought = effectiveDefinitions(section, { liquids: { entries: { unobtainium: UNOBTAINIUM } } } as any, PACK);
		expect(brought.get('unobtainium')).toEqual(UNOBTAINIUM);
		// and having merged it, the same comparison now says identical
		expect(verdictFor({ liquids: { entries: { unobtainium: UNOBTAINIUM } } } as any,
			{ liquids: { entries: { unobtainium: UNOBTAINIUM } } } as any, 'unobtainium')?.verdict).toBe('identical');
	});
});

describe('R-19 the comparison covers every shape, not just the easy ones', () => {
	it('an upsert-by-id section', () => {
		expect(verdictFor({ engineDefinitions: [{ id: 'ion', name: 'Ion', type: 'ion', fuel_type_id: 'h2', thrust_kN: 1, efficiency_isp: 3000, description: '' }] } as any, undefined, 'ion')?.verdict).toBe('identical');
		expect(verdictFor({ engineDefinitions: [{ id: 'ion', name: 'Ion II', type: 'ion', fuel_type_id: 'h2', thrust_kN: 9, efficiency_isp: 3000, description: '' }] } as any, undefined, 'ion')?.verdict).toBe('different');
		expect(verdictFor({ engineDefinitions: [{ id: 'torch', name: 'Torch' }] } as any, undefined, 'torch')?.verdict).toBe('absent');
	});

	it('a record section, keyed by the record key', () => {
		expect(verdictFor({ gasPhysics: { N2: { molarMass: 28 } } } as any, undefined, 'N2')?.verdict).toBe('identical');
		expect(verdictFor({ gasPhysics: { N2: { molarMass: 99 } } } as any, undefined, 'N2')?.verdict).toBe('different');
		expect(verdictFor({ gasPhysics: { NH3: { molarMass: 17 } } } as any, undefined, 'NH3')?.verdict).toBe('absent');
	});

	it('the weighted section, identified one level down at value.name', () => {
		const preset = { weight: 5, value: { name: 'Chlorine haze', pressure_range_bar: [0.4, 2] } };
		expect(verdictFor({ atmosphereCompositions: [preset] } as any, undefined, 'Chlorine haze')?.verdict).toBe('absent');
		expect(verdictFor({ atmosphereCompositions: [preset] } as any, { atmosphereCompositions: [preset] } as any, 'Chlorine haze')?.verdict).toBe('identical');
	});

	it('the scalar section, per FIELD - one changed weight is one setting, not six', () => {
		const all = compareClipOverrides({ pigmentModel: { captureWeight: 3 } } as any, undefined, PACK)
			.filter((d) => d.section.key === 'pigmentModel');
		expect(all).toHaveLength(1);
		expect(all[0].id).toBe('captureWeight');
	});
});

describe('R-19 the comparison says nothing when there is nothing to say', () => {
	it('an absent or empty override bag produces no rows', () => {
		expect(compareClipOverrides(undefined, undefined, PACK)).toEqual([]);
		expect(compareClipOverrides({}, { liquids: [UNOBTAINIUM] } as any, PACK)).toEqual([]);
	});

	it('the same clip compared twice against a destination that took it is entirely identical', () => {
		// The gate behind "paste the same clip twice and nothing is added or renamed".
		const clip = { liquids: [UNOBTAINIUM], gasPhysics: { NH3: { molarMass: 17 } } } as any;
		const after = { liquids: { entries: { unobtainium: UNOBTAINIUM } }, gasPhysics: { NH3: { molarMass: 17 } } } as any;
		const rows = compareClipOverrides(clip, after, PACK);
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.every((r) => r.verdict === 'identical')).toBe(true);
	});
});
