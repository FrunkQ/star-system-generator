// THE EXTRACTION IS A MEASUREMENT, SO IT IS GATED AS ONE.
//
// `buildEffectiveRulePack` was lifted verbatim out of a reactive block in `src/routes/+page.svelte`.
// The standing rule for that move is to pin the OLD behaviour bit-for-bit against the old expression
// IN THE SAME COMMIT - because the last time this project extracted something "just a refactor", the
// move silently changed a clamp from a radius axis to a span axis and doubled it, and only an
// equivalence sweep caught it.
//
// So `oldExpression` below is the original block, pasted unchanged, and every case runs both and
// deep-equals the whole pack. If they ever differ, the extraction changed behaviour.
import { describe, it, expect } from 'vitest';
import { buildEffectiveRulePack } from './effectivePack';
import { applyListDelta } from '$lib/rulepackDelta';
import { allLiquids } from '$lib/physics/liquids';
import { allMorphologies } from '$lib/physics/vegetation';
import { allPigments, pigmentModel } from '$lib/physics/pigments';
import type { RulePack, RulePackOverrides } from '$lib/types';

/** THE ORIGINAL, pasted from `+page.svelte` as it stood at v3.1.37. Do not tidy it. */
function oldExpression(selectedRulepack: any, starmapOverrides: any): any {
	if (!selectedRulepack) return undefined;
	// Deep clone to avoid mutating the original rulepack which might be cached
	const pack = JSON.parse(JSON.stringify(selectedRulepack));

	if (starmapOverrides) {
		const overrides = starmapOverrides;

		if (overrides.fuelDefinitions && pack.fuelDefinitions) {
			overrides.fuelDefinitions.forEach((f: any) => {
				const idx = pack.fuelDefinitions.entries.findIndex((d: any) => d.id === f.id);
				if (idx !== -1) pack.fuelDefinitions.entries[idx] = f;
				else pack.fuelDefinitions.entries.push(f);
			});
		}

		if (overrides.engineDefinitions && pack.engineDefinitions) {
			overrides.engineDefinitions.forEach((e: any) => {
				const idx = pack.engineDefinitions.entries.findIndex((d: any) => d.id === e.id);
				if (idx !== -1) pack.engineDefinitions.entries[idx] = e;
				else pack.engineDefinitions.entries.push(e);
			});
		}

		if (overrides.sensorDefinitions && pack.sensorDefinitions) {
			overrides.sensorDefinitions.forEach((s: any) => {
				const idx = pack.sensorDefinitions.entries.findIndex((d: any) => d.id === s.id);
				if (idx !== -1) pack.sensorDefinitions.entries[idx] = s;
				else pack.sensorDefinitions.entries.push(s);
			});
		}

		if (overrides.gasPhysics) {
			pack.gasPhysics = { ...pack.gasPhysics, ...overrides.gasPhysics };
		}

		if (overrides.atmosphereCompositions && pack.distributions?.['atmosphere_composition']) {
			pack.distributions['atmosphere_composition'].entries = overrides.atmosphereCompositions;
		}

		if (overrides.liquids) {
			pack.liquids = applyListDelta(allLiquids(pack), overrides.liquids as any, (l: any) => l.name);
		}

		if (overrides.morphologies) {
			pack.morphologies = applyListDelta(allMorphologies(pack), overrides.morphologies, (m: any) => m.key);
		}
		if (overrides.pigments) {
			pack.pigments = applyListDelta(allPigments(pack), overrides.pigments, (p: any) => p.key);
		}
		if (overrides.pigmentModel) {
			pack.pigmentModel = { ...pigmentModel(pack), ...overrides.pigmentModel };
		}
	}
	return pack;
}

const PACK = {
	id: 'test', version: '1',
	fuelDefinitions: { entries: [{ id: 'h2', name: 'Hydrogen', density_kg_per_m3: 71, description: '' }] },
	engineDefinitions: { entries: [{ id: 'ion', name: 'Ion', type: 'ion', fuel_type_id: 'h2', thrust_kN: 1, efficiency_isp: 3000, description: '' }] },
	sensorDefinitions: { entries: [{ id: 'lidar', name: 'Lidar', range_km: 1000 }] },
	gasPhysics: { N2: { molarMass: 28 }, CO2: { molarMass: 44 } },
	distributions: { atmosphere_composition: { name: 'Atmosphere Composition', entries: [{ weight: 20, value: { name: 'Nitrogen-Oxygen' } }] } },
	liquids: [
		{ name: 'water', label: 'Water', meltK: 273.15, boilK: 373.15 },
		{ name: 'ammonia', label: 'Ammonia', meltK: 195.4, boilK: 239.8 }
	],
	morphologies: [
		{ key: 'microbial', label: 'Microbial', order: 0, defaultCoverage: 0.9, tints: ['#6b7a5a'], pigmentDriven: 0.5, opacity: 0.4, light: { min: 0, max: 0 } },
		{ key: 'flora', label: 'Flora', order: 2, defaultCoverage: 0.6, tints: ['#3d6b34'], pigmentDriven: 0.9, opacity: 0.8, light: { min: 0, max: 0 } }
	],
	pigments: [{ key: 'chlorophyll', label: 'Chlorophyll', bands: [{ centreNm: 430, widthNm: 40, strength: 0.9 }] }],
	pigmentModel: { captureWeight: 1, protectionWeight: 1, steadinessWeight: 1, tissueAbsorptance: 0.2, saturationFlux: 1e21, reactionCentreNm: 700, viabilityFraction: 0.5 }
} as unknown as RulePack;

/** One case per section, plus the empty and absent ones, plus everything at once. */
const CASES: [string, RulePackOverrides | null | undefined][] = [
	['no overrides at all', undefined],
	['null overrides', null],
	['an empty override bag', {}],
	['a fuel that replaces a shipped one', { fuelDefinitions: [{ id: 'h2', name: 'Slush hydrogen', density_kg_per_m3: 80, description: '' }] } as any],
	['a fuel that is wholly new', { fuelDefinitions: [{ id: 'xe', name: 'Xenon', density_kg_per_m3: 2942, description: '' }] } as any],
	['an engine', { engineDefinitions: [{ id: 'torch', name: 'Torch', type: 'fusion', fuel_type_id: 'h2', thrust_kN: 900, efficiency_isp: 90000, description: '' }] } as any],
	['a sensor', { sensorDefinitions: [{ id: 'grav', name: 'Gravimeter', range_km: 5e6 }] } as any],
	['a gas', { gasPhysics: { NH3: { molarMass: 17 } } } as any],
	['a gas that replaces a shipped one', { gasPhysics: { N2: { molarMass: 28.0134 } } } as any],
	['an atmosphere preset (whole-list replace)', { atmosphereCompositions: [{ weight: 5, value: { name: 'Chlorine haze' } }] } as any],
	['liquids as a DELTA', { liquids: { entries: { unobtainium: { name: 'unobtainium', label: 'Unobtainium', meltK: 90, boilK: 260 } } } } as any],
	['liquids as a WHOLE LIST (pre-D25 campaigns)', { liquids: [{ name: 'quicksilver', label: 'Quicksilver', meltK: 234, boilK: 630 }] } as any],
	['a morphology delta with a reorder', { morphologies: { order: ['flora', 'microbial'], entries: { flora: { opacity: 0.25 } } } } as any],
	['a morphology delta that DELETES a field', { morphologies: { entries: { flora: { lightHex: undefined } } } } as any],
	['a pigment delta', { pigments: { entries: { rhodopsin: { key: 'rhodopsin', label: 'Rhodopsin', bands: [] } } } } as any],
	['a pigment model scalar', { pigmentModel: { captureWeight: 3 } } as any],
	['every section at once', {
		fuelDefinitions: [{ id: 'xe', name: 'Xenon', density_kg_per_m3: 2942, description: '' }],
		engineDefinitions: [{ id: 'torch', name: 'Torch', type: 'fusion', fuel_type_id: 'xe', thrust_kN: 900, efficiency_isp: 90000, description: '' }],
		sensorDefinitions: [{ id: 'grav', name: 'Gravimeter', range_km: 5e6 }],
		gasPhysics: { NH3: { molarMass: 17 } },
		atmosphereCompositions: [{ weight: 5, value: { name: 'Chlorine haze' } }],
		liquids: { entries: { unobtainium: { name: 'unobtainium', label: 'Unobtainium', meltK: 90, boilK: 260 } } },
		morphologies: { entries: { flora: { opacity: 0.25 } } },
		pigments: { entries: { rhodopsin: { key: 'rhodopsin', label: 'Rhodopsin', bands: [] } } },
		pigmentModel: { captureWeight: 3 }
	} as any]
];

describe('buildEffectiveRulePack is the old expression, moved', () => {
	for (const [name, overrides] of CASES) {
		it(`matches the original bit for bit: ${name}`, () => {
			expect(buildEffectiveRulePack(PACK, overrides)).toEqual(oldExpression(PACK, overrides));
		});
	}

	it('returns undefined with no pack, exactly as the block did', () => {
		expect(buildEffectiveRulePack(null, { liquids: [] } as any)).toBeUndefined();
		expect(buildEffectiveRulePack(undefined, undefined)).toBeUndefined();
	});

	it('never mutates the pack it is given - it is cached and shared between campaigns', () => {
		const before = JSON.stringify(PACK);
		buildEffectiveRulePack(PACK, { liquids: { entries: { x: { name: 'x', label: 'X', meltK: 1, boilK: 2 } } } } as any);
		buildEffectiveRulePack(PACK, { gasPhysics: { NH3: { molarMass: 17 } } } as any);
		expect(JSON.stringify(PACK)).toBe(before);
	});
});
