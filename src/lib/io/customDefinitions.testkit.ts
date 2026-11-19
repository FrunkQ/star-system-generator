// TEST KIT for the 3.1.1 "custom definitions disappear" gates. Not shipped: nothing in the app imports it.
//
// THE REPORTS WERE ALL OF THE FORM "I MADE TWO AND ONE VANISHED", so every gate that uses this builds
// TWO OR MORE custom definitions in every section a GM can author, and counts them ABSOLUTELY on the
// far side (engine map PHY-34: a ratio or a "still equal to itself" check passes with the bug present).
//
// The shipped pack is the real starter pack, read from disk and assembled the way `rulepack-loader.ts`
// assembles it, so "shipped" means what a GM's campaign actually ships with.
import fs from 'node:fs';
import path from 'node:path';
import type { RulePack, RulePackOverrides, Starmap, System } from '$lib/types';
import { SECTIONS, effectiveDefinitions } from './clipRules';
import { canonicalJson } from './shippedDefaults';
import { makeListDelta } from '$lib/rulepackDelta';
import { allLiquids } from '$lib/physics/liquids';
import { allMorphologies } from '$lib/physics/vegetation';
import { allPigments } from '$lib/physics/pigments';

function deepMerge(t: any, s: any): any {
	if (typeof t !== 'object' || t === null || Array.isArray(t)) return s;
	const out = { ...t };
	for (const k of Object.keys(s || {})) out[k] = k in out ? deepMerge(out[k], s[k]) : s[k];
	return out;
}

/** The starter pack as the app loads it (`fetchAndLoadRulePack`), from disk. A fresh object each call. */
export function shippedPack(): RulePack {
	const base = path.resolve('static/rulepacks/starter-sf');
	const read = (f: string) => JSON.parse(fs.readFileSync(path.join(base, f), 'utf-8'));
	let p: any = read('main.json');
	p.constructTemplates = read('construct_templates.json');
	p.engineDefinitions = read('engine-definitions.json');
	p.fuelDefinitions = read('fuel-definitions.json');
	p = deepMerge(p, read('classification.json'));
	for (const f of p.imports ?? []) p = deepMerge(p, read(String(f).replace('./', '')));
	return p as RulePack;
}

// --- two of everything a GM can author ------------------------------------------------------------
export const GASES = {
	Xq: { molarMass: 0.08, shielding: 3, greenhouse: 2, specificHeat: 0.9, radiativeCooling: 0.1, colorHex: '#c06bd0', meltK: 40, boilK: 90, tags: [], aurora: [], cloud: { condensesTo: 'unobtainium', minFraction: 0.001 } },
	Zz: { molarMass: 0.12, shielding: 1, greenhouse: 0, specificHeat: 1.1, radiativeCooling: 0.2, colorHex: null, meltK: 60, boilK: 140, tags: [], aurora: [] }
};
export const LIQUIDS = [
	{ name: 'unobtainium', label: 'Liquid Unobtainium', meltK: 20, boilK: 90, colorHex: '#7fd4c1', density_gcc: 1.4, conductive: false, biosolvent: 'none', family: 'exotic', refractiveIndex: 1.31 },
	{ name: 'liquid-neon', label: 'Liquid Neon', meltK: 24, boilK: 27, colorHex: '#ff5a3c', density_gcc: 1.2, conductive: false, biosolvent: 'none', family: 'cryo', refractiveIndex: 1.1 }
];
export const MIXES = [
	{ weight: 2, value: { name: 'Xq-rich', pressure_range_bar: [0.5, 2], composition: { Xq: 0.9, N2: 0.1 }, occurs_on: 'terrestrial' } },
	{ weight: 1, value: { name: 'Zz haze', pressure_range_bar: [0.1, 0.4], composition: { Zz: 0.6, CO2: 0.4 }, occurs_on: 'terrestrial' } }
];
export const FUELS = [
	{ id: 'fuel-custom-1001', name: 'DT Slush', density_kg_per_m3: 200, description: 'Deuterium-tritium slush' },
	{ id: 'fuel-custom-1002', name: 'Metallic Xenon', density_kg_per_m3: 3500, description: 'Dense and expensive' }
];
export const ENGINES = [
	{ id: 'engine-custom-2001', name: 'Q Drive', type: 'Fusion', fuel_type_id: 'fuel-custom-1001', thrust_kN: 5, efficiency_isp: 90000, atmo_efficiency: 0, powerDraw_MW: 0, description: 'Burns DT slush' },
	{ id: 'engine-custom-2002', name: 'Xenon Torch', type: 'Ion', fuel_type_id: 'fuel-custom-1002', thrust_kN: 1, efficiency_isp: 12000, atmo_efficiency: 0, powerDraw_MW: 4, description: 'Burns metallic xenon' }
];
export const SENSORS = [
	{ id: 'sensor-custom-3001', name: 'Deep Eye', range_km: 1e9, preferred_unit: 'AU', description: 'Targets: everything' },
	{ id: 'sensor-custom-3002', name: 'Whisker', range_km: 5000, preferred_unit: 'km', description: 'Targets: hulls' }
];
export const MORPHOLOGIES = [
	{ key: 'crystalline', label: 'Crystalline', order: 60, defaultCoverage: 0.3, tints: ['#7a7f6a'], pigmentDriven: 0, opacity: 0.7, light: { min: 0, max: 0 } },
	{ key: 'aerial', label: 'Aerial', order: 70, defaultCoverage: 0.2, tints: ['#a9c6d8'], pigmentDriven: 0.2, opacity: 0.4, light: { min: 0, max: 0 } }
];
export const PIGMENTS = [
	{ key: 'rhodopsin-b', label: 'Rhodopsin B', baselineAbsorptance: 0.06, bands: [{ centreNm: 560, widthNm: 60, strength: 0.8 }] },
	{ key: 'umbrin', label: 'Umbrin', baselineAbsorptance: 0.3, bands: [{ centreNm: 700, widthNm: 120, strength: 0.9 }] }
];

/** How many definitions `campaignOverrides` puts in each section - the ABSOLUTE the gates count to. */
export const AUTHORED_PER_SECTION: Record<string, number> = {
	fuelDefinitions: 2, engineDefinitions: 2, sensorDefinitions: 2, gasPhysics: 2,
	atmosphereCompositions: 2, liquids: 2, morphologies: 2, pigments: 2, pigmentModel: 1
};

/** A campaign's overrides with two custom definitions in every section, each in the shape its own
 *  Settings editor stores it in (a delta for the three delta sections, a whole list for the mixes). */
export function campaignOverrides(pack: RulePack): RulePackOverrides {
	const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
	return {
		fuelDefinitions: clone(FUELS) as any,
		engineDefinitions: clone(ENGINES) as any,
		sensorDefinitions: clone(SENSORS) as any,
		gasPhysics: clone(GASES) as any,
		atmosphereCompositions: [...clone((pack as any).distributions.atmosphere_composition.entries), ...clone(MIXES)],
		liquids: makeListDelta(allLiquids(pack), [...allLiquids(pack), ...clone(LIQUIDS)] as any, (l: any) => l.name) as any,
		morphologies: makeListDelta(allMorphologies(pack), [...allMorphologies(pack), ...clone(MORPHOLOGIES)] as any, (m: any) => m.key) as any,
		pigments: makeListDelta(allPigments(pack), [...allPigments(pack), ...clone(PIGMENTS)] as any, (p: any) => p.key) as any,
		pigmentModel: { captureWeight: 3 }
	};
}

/**
 * WHAT THE GM MADE: every definition a campaign's overrides give it that the shipped pack does not
 * already hold identically, as `section/id -> canonical JSON`. This is the oracle every round trip is
 * compared on. It is built from the engine's own `effectiveDefinitions`, so "a liquid" means what the
 * merge means by it, and it ignores key order because a save may have been through a formatter.
 */
export function authored(overrides: RulePackOverrides | null | undefined, pack: RulePack): Record<string, string> {
	const out: Record<string, string> = {};
	for (const section of SECTIONS) {
		const shipped = section.fromPack(pack);
		for (const [id, def] of effectiveDefinitions(section, overrides, pack)) {
			const mine = canonicalJson(def);
			const theirs = shipped.get(id);
			if (theirs !== undefined && canonicalJson(theirs) === mine) continue;
			out[`${String(section.key)}/${id}`] = mine;
		}
	}
	return out;
}

/** `authored`, counted per section. */
export function authoredCounts(overrides: RulePackOverrides | null | undefined, pack: RulePack): Record<string, number> {
	const out: Record<string, number> = {};
	for (const key of Object.keys(authored(overrides, pack))) {
		const section = key.slice(0, key.indexOf('/'));
		out[section] = (out[section] ?? 0) + 1;
	}
	return out;
}

/**
 * A small system whose objects NAME the custom definitions: a world breathing both custom gases over
 * an ocean of a custom liquid, carrying both custom morphologies; and a ship with both custom
 * engines, both custom fuels and both custom sensors. (The second custom liquid is named by nothing:
 * `hydrosphere.layers` is DERIVED by the engine and stripped from a save, so a test cannot author
 * one - and a definition nothing names must survive every road all the same.)
 */
export function homeSystem(): System {
	const sol = JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/solar-system-input.json'), 'utf-8'));
	const sun = sol.nodes.find((n: any) => n.name === 'Sun');
	const earth = sol.nodes.find((n: any) => n.name === 'Earth');
	const world = {
		...earth, id: 'home-world', name: 'Homeworld', classes: [], tags: [],
		atmosphere: { name: 'Xq-rich', composition: { Xq: 0.6, Zz: 0.3, N2: 0.1 }, pressure_bar: 1.2, main: 'Xq' },
		hydrosphere: { composition: 'unobtainium', coverage: 0.5 },
		biosphere: { ...earth.biosphere, morphologies: ['microbial', 'crystalline', { morphology: 'aerial', coverage: 0.1 }] }
	};
	delete world.image;
	const ship = {
		id: 'home-ship', parentId: world.id, name: 'Kestrel', kind: 'construct', roleHint: 'ship', tags: [],
		orbit: { hostId: world.id, hostMu: 3.986e14, t0: sol.epochT0, elements: { a_AU: 0.0001, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } },
		engines: [{ engine_id: 'engine-custom-2001', quantity: 2 }, { engine_id: 'engine-custom-2002', quantity: 1 }],
		fuel_tanks: [{ fuel_type_id: 'fuel-custom-1001', capacity_units: 100, current_units: 80 }, { fuel_type_id: 'fuel-custom-1002', capacity_units: 10, current_units: 10 }],
		sensors: [{ definition_id: 'sensor-custom-3001', name: 'Deep Eye', range_km: 1e9 }, { definition_id: 'sensor-custom-3002', name: 'Whisker', range_km: 5000 }]
	};
	return {
		id: 'home', name: 'Home', seed: 'home', epochT0: sol.epochT0, age_Gyr: 4.6,
		nodes: [{ ...sun, id: 'home-sun', parentId: null }, { ...world, parentId: 'home-sun', orbit: { ...world.orbit, hostId: 'home-sun' } }, ship],
		rulePackId: sol.rulePackId, rulePackVersion: sol.rulePackVersion, tags: []
	} as unknown as System;
}

/** Every custom definition the objects of a system NAME, as the node fields spell them. */
export function namedBySystem(system: System): Record<string, string[]> {
	const world: any = system.nodes.find((n: any) => n.name === 'Homeworld');
	const ship: any = system.nodes.find((n: any) => n.name === 'Kestrel');
	return {
		gases: Object.keys(world?.atmosphere?.composition ?? {}).sort(),
		liquids: [world?.hydrosphere?.composition],
		morphologies: (world?.biosphere?.morphologies ?? []).map((m: any) => (typeof m === 'string' ? m : m?.morphology)),
		engines: (ship?.engines ?? []).map((e: any) => e.engine_id),
		fuels: (ship?.fuel_tanks ?? []).map((t: any) => t.fuel_type_id),
		sensors: (ship?.sensors ?? []).map((s: any) => s.definition_id)
	};
}

/** A campaign holding `homeSystem()` and two custom definitions in every section. */
export function campaign(pack: RulePack, name = 'Contract Reach'): Starmap {
	return {
		id: 'starmap-test', name, distanceUnit: 'LY', unitIsPrefix: false, mapMode: 'diagrammatic',
		systems: [{ id: 'home', name: 'Home', position: { x: 0, y: 0 }, system: homeSystem() }],
		routes: [],
		rulePackOverrides: campaignOverrides(pack)
	} as unknown as Starmap;
}

/** A campaign with nothing custom in it at all - the "I started a new map and loaded my system" case. */
export function freshCampaign(name = 'New Map'): Starmap {
	return { id: 'starmap-fresh', name, distanceUnit: 'LY', unitIsPrefix: false, mapMode: 'diagrammatic', systems: [], routes: [] } as unknown as Starmap;
}
