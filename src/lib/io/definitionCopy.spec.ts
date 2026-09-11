// G99 (Stream AA job 4): COPY A DEFINITION A GM MADE, PASTE IT INTO ANOTHER CAMPAIGN.
//
// The owner, 2026-09-11: *"A quick easy way of getting new drive/atmo/liquid presets"*. The paste half
// already existed (R-19); this is the copy half, and the gate is the round trip the brief names: copy in
// one campaign, paste into a FRESH one, the definition arrives (as a delta where the section stores
// deltas), and a SECOND paste has nothing to add. For every section a Settings editor offers a Copy on -
// and for the definitions a copied one names, which is where a copy that "worked" would still paste an
// engine with no fuel.
//
// The shipped pack is the real starter pack, read from disk and assembled as `rulepack-loader.ts` does,
// so "shipped" means what a GM's campaign actually ships with. The text between copy and paste is the
// exact text `putClip` writes (`JSON.stringify`), parsed back by the paste's own `parseHubClip`.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { RulePack, RulePackOverrides } from '$lib/types';
import {
	SECTIONS,
	compareClipOverrides,
	describeMerge,
	effectiveDefinitions,
	isShippedDefinition,
	mergeClipOverrides,
	rulesForDefinition
} from './clipRules';
import { buildRulesClip, isRulesOnlyClip, parseHubClip } from './hubClip';
import { canonicalJson } from './shippedDefaults';

function deepMerge(t: any, s: any): any {
	if (typeof t !== 'object' || t === null || Array.isArray(t)) return s;
	const out = { ...t };
	for (const k of Object.keys(s || {})) out[k] = k in out ? deepMerge(out[k], s[k]) : s[k];
	return out;
}
function shippedPack(): RulePack {
	const base = path.resolve('static/rulepacks/starter-sf');
	const read = (f: string) => JSON.parse(fs.readFileSync(path.join(base, f), 'utf-8'));
	let p: any = read('main.json');
	for (const f of p.imports ?? []) p = deepMerge(p, read(f.replace('./', '')));
	p.engineDefinitions = read('engine-definitions.json');
	p.fuelDefinitions = read('fuel-definitions.json');
	return p as RulePack;
}
const PACK = shippedPack();

// --- the GM's own definitions, one per section a Settings editor offers a Copy on -----------------
const UNOBTAINIUM = { name: 'unobtainium', label: 'Liquid Unobtainium', meltK: 20, boilK: 90, colorHex: '#7fd4c1', family: 'exotic' };
const XQ = { molarMass: 0.08, cp: 900, cloud: { condensesTo: 'unobtainium', minFraction: 0.001 } };
const MIX = { weight: 2, value: { name: 'Xq-rich', composition: { Xq: 0.9, N2: 0.1 } } };
const SLUSH = { id: 'fuel-dt-slush', name: 'DT Slush', density_kg_per_m3: 200, description: 'Deuterium-tritium slush' };
const QDRIVE = { id: 'engine-q-drive', name: 'Q Drive', type: 'Fusion', fuel_type_id: 'fuel-dt-slush', thrust_kN: 5, efficiency_isp: 90000 };
const DEEP_EYE = { id: 'sensor-deep-eye', name: 'Deep Eye', range_km: 1e9 };
const CRYSTAL = { key: 'crystalline', label: 'Crystalline', defaultCoverage: 0.3, tints: ['#7a7f6a'], pigmentDriven: 0 };
const RHODOPSIN = { key: 'rhodopsin-b', label: 'Rhodopsin B', bands: [], baselineAbsorptance: 0.2 };

/** Campaign A: every custom definition, stored in the shape its editor saves it in. */
const CAMPAIGN_A: RulePackOverrides = {
	liquids: { entries: { unobtainium: UNOBTAINIUM } } as any,
	gasPhysics: { Xq: XQ } as any,
	atmosphereCompositions: [MIX] as any,
	fuelDefinitions: [SLUSH] as any,
	engineDefinitions: [QDRIVE] as any,
	sensorDefinitions: [DEEP_EYE] as any,
	morphologies: { entries: { crystalline: CRYSTAL } } as any,
	pigments: { entries: { 'rhodopsin-b': RHODOPSIN } } as any
};

const sectionOf = (key: keyof RulePackOverrides) => SECTIONS.find((s) => s.key === key)!;
/** What campaign A holds for a definition it overrides. */
const inA = (key: keyof RulePackOverrides, id: string) => effectiveDefinitions(sectionOf(key), CAMPAIGN_A, PACK).get(id);
/**
 * THE LOOKUP A COPY IS ACTUALLY HANDED, which answers for SHIPPED definitions too: an editor's own list
 * holds every shipped fuel and gas beside the GM's (Fuel & Drives, Atmospheres). A lookup that knew only
 * the campaign's overrides could never find a shipped dependency, and so could never show the copy
 * refusing to carry one - this spec passed with that refusal deleted until it used this.
 */
const lookup = (key: keyof RulePackOverrides, id: string) => inA(key, id) ?? sectionOf(key).fromPack(PACK).get(id);

/** Copy exactly as the button does, and hand back the text `putClip` would have written. */
function copyText(key: keyof RulePackOverrides, id: string): string {
	const clip = buildRulesClip(rulesForDefinition(key, id, inA(key, id), PACK, lookup), { title: 'Campaign A' });
	expect(clip, `${String(key)} ${id} produced no clip`).not.toBeNull();
	return JSON.stringify(clip);
}

function paste(text: string, destination: RulePackOverrides | undefined) {
	const parsed = parseHubClip(text);
	expect(parsed.ok).toBe(true);
	const clip = (parsed as any).clip;
	expect(isRulesOnlyClip(clip), 'a copied definition is a RULES clip - no nodes, no root').toBe(true);
	return { clip, merge: mergeClipOverrides(clip.rulePackOverrides, destination, PACK, { sourceLabel: clip.source?.title }) };
}

const CASES: [keyof RulePackOverrides, string][] = [
	['liquids', 'unobtainium'],
	['gasPhysics', 'Xq'],
	['atmosphereCompositions', 'Xq-rich'],
	['fuelDefinitions', 'fuel-dt-slush'],
	['engineDefinitions', 'engine-q-drive'],
	['sensorDefinitions', 'sensor-deep-eye'],
	['morphologies', 'crystalline'],
	['pigments', 'rhodopsin-b']
];

describe('G99: none of these definitions is shipped, so every one of them may be copied', () => {
	it.each(CASES)('%s %s is the GM’s own', (key, id) => {
		expect(isShippedDefinition(key, id, PACK)).toBe(false);
		expect(inA(key, id), 'campaign A holds it').toBeTruthy();
	});
});

describe('G99: the round trip - copy in one campaign, paste into a fresh one, paste again', () => {
	it.each(CASES)('%s %s arrives whole, and a second paste has nothing to add', (key, id) => {
		const text = copyText(key, id);
		const first = paste(text, undefined);
		expect(first.clip.source?.title).toBe('Campaign A');
		expect(first.merge.changed).toBe(true);
		expect(first.merge.renamed, 'a fresh campaign has nothing to clash with').toHaveLength(0);

		// It is there, and it is THE SAME definition campaign A has - compared as the paste compares.
		const arrived = effectiveDefinitions(sectionOf(key), first.merge.overrides, PACK).get(id);
		expect(arrived, `${String(key)} ${id} did not arrive`).toBeTruthy();
		expect(canonicalJson(arrived)).toBe(canonicalJson(inA(key, id)));

		// A DELTA SECTION IS STORED AS A DELTA (DATA-R48), never a whole list frozen at paste time.
		if (sectionOf(key).shape === 'delta') {
			expect(Array.isArray((first.merge.overrides as any)[key]), `${String(key)} was stored as a whole list`).toBe(false);
		}

		const second = paste(text, first.merge.overrides);
		expect(second.merge.changed, 'the second paste changed the campaign').toBe(false);
		// The route's own words for this: "That clip carries rules this campaign already has - nothing to add".
		expect(describeMerge(second.merge)).toBe('');
	});
});

describe('G99: a copy carries the custom definitions a copied one names, and never a shipped one', () => {
	it('copies an engine WITH the custom fuel it burns, and the pasted engine burns it', () => {
		const { merge } = paste(copyText('engineDefinitions', 'engine-q-drive'), undefined);
		const fuels = effectiveDefinitions(sectionOf('fuelDefinitions'), merge.overrides, PACK);
		const engines = effectiveDefinitions(sectionOf('engineDefinitions'), merge.overrides, PACK);
		expect(fuels.has('fuel-dt-slush')).toBe(true);
		expect(engines.get('engine-q-drive')?.fuel_type_id).toBe('fuel-dt-slush');
	});

	it('follows a chain: an atmosphere mix brings its custom gas, and the gas brings its liquid', () => {
		const clip = JSON.parse(copyText('atmosphereCompositions', 'Xq-rich'));
		expect(Object.keys(clip.rulePackOverrides).sort()).toEqual(['atmosphereCompositions', 'gasPhysics', 'liquids']);
		// N2 is in the mix and is shipped: every campaign has it, so it is not carried.
		expect(Object.keys(clip.rulePackOverrides.gasPhysics)).toEqual(['Xq']);
	});

	it('carries nothing for an engine that burns a shipped fuel but the engine itself', () => {
		const shippedFuel = (PACK as any).fuelDefinitions.entries[0].id as string;
		expect(isShippedDefinition('fuelDefinitions', shippedFuel, PACK)).toBe(true);
		const overrides = rulesForDefinition('engineDefinitions', 'engine-x', { ...QDRIVE, id: 'engine-x', fuel_type_id: shippedFuel }, PACK, lookup);
		expect(Object.keys(overrides ?? {})).toEqual(['engineDefinitions']);
	});

	it('copies nothing that every campaign already has, and no scalar setting', () => {
		expect(isShippedDefinition('liquids', 'water', PACK)).toBe(true);
		expect(rulesForDefinition('liquids', 'water', { name: 'water', boilK: 400 }, PACK)).toBeUndefined();
		expect(rulesForDefinition('gasPhysics', 'N2', { molarMass: 0.028 }, PACK)).toBeUndefined();
		expect(rulesForDefinition('pigmentModel', 'captureWeight', { captureWeight: 2 } as any, PACK)).toBeUndefined();
	});
});

describe('G99: a clash renames what arrives and repoints what named it - for every reference a copy carries', () => {
	const DIFFERENT = { ...UNOBTAINIUM, boilK: 400, label: 'Their Unobtainium' };

	it('a renamed fuel is followed by the engine that burns it (the reference the merge always knew)', () => {
		const destination: RulePackOverrides = { fuelDefinitions: [{ ...SLUSH, density_kg_per_m3: 999 }] as any };
		const { merge } = paste(copyText('engineDefinitions', 'engine-q-drive'), destination);
		const rename = merge.renamed.find((r) => r.section.key === 'fuelDefinitions');
		expect(rename?.to).toBe('fuel-dt-slush (from Campaign A)');
		const engines = effectiveDefinitions(sectionOf('engineDefinitions'), merge.overrides, PACK);
		expect(engines.get('engine-q-drive')?.fuel_type_id).toBe('fuel-dt-slush (from Campaign A)');
	});

	it('a renamed liquid is followed by the gas that condenses into it (new with G99)', () => {
		const destination: RulePackOverrides = { liquids: { entries: { unobtainium: DIFFERENT } } as any };
		const { merge } = paste(copyText('gasPhysics', 'Xq'), destination);
		expect(merge.renamed.map((r) => r.to)).toEqual(['unobtainium (from Campaign A)']);
		const gases = effectiveDefinitions(sectionOf('gasPhysics'), merge.overrides, PACK);
		expect(gases.get('Xq')?.cloud?.condensesTo).toBe('unobtainium (from Campaign A)');
		// And the destination's own liquid is untouched - the third rule of R-19.
		expect(effectiveDefinitions(sectionOf('liquids'), merge.overrides, PACK).get('unobtainium')?.label).toBe('Their Unobtainium');
	});

	it('a renamed gas is followed by the mix made of it (new with G99)', () => {
		const destination: RulePackOverrides = { gasPhysics: { Xq: { ...XQ, molarMass: 0.5 } } as any };
		const { merge } = paste(copyText('atmosphereCompositions', 'Xq-rich'), destination);
		expect(merge.renamed.some((r) => r.section.key === 'gasPhysics' && r.to === 'Xq (from Campaign A)')).toBe(true);
		const mixes = effectiveDefinitions(sectionOf('atmosphereCompositions'), merge.overrides, PACK);
		expect(Object.keys(mixes.get('Xq-rich')?.value?.composition ?? {}).sort()).toEqual(['N2', 'Xq (from Campaign A)']);
	});
});

describe('G99: the app’s own body Copy carries the campaign’s rules too', () => {
	// R-19's record said `buildClip` "now carries the campaign's overrides" - and it accepted them, but
	// no Copy ever passed them, so a planet copied into another campaign still arrived without its
	// custom liquid. Pinned in the source, because the behaviour of `buildClip` itself was always right.
	const read = (p: string) => fs.readFileSync(path.resolve(p), 'utf-8');

	it('passes them in Copy and Cut in the system view, and in Copy System on the starmap', () => {
		const systemView = read('src/lib/components/SystemView.svelte');
		expect(systemView.split('rulePackOverrides: $starmapStore?.rulePackOverrides').length - 1, 'Copy and Cut').toBe(2);
		expect(systemView).not.toMatch(/buildClip\(\$systemStore, node\.id, \{ credits: \$starmapStore\?\.contentCredits \?\? \[\] \}\)/);
		expect(read('src/lib/components/Starmap.svelte')).toContain('rulePackOverrides: starmap.rulePackOverrides');
	});

	it('lets a copied rule be pasted from the starmap\'s own "Paste … here", which the route already merges', () => {
		// FOUND BY LOOKING (2026-09-11): the item was greyed for a rules clip, because the menu asked
		// `systemNodesFromClip` - "can this become a system?" - while `pasteClipAsNewSystem` behind it
		// has handed a rules clip to `pasteRulesOnlyClip` since R-19.
		const starmap = read('src/lib/components/Starmap.svelte');
		expect(starmap).toContain('isRulesOnlyClip($detectedClip.clip) ? ({ ok: true } as const) : systemNodesFromClip($detectedClip.clip)');
		expect(read('src/routes/+page.svelte')).toContain('if (isRulesOnlyClip(d.clip)) { pasteRulesOnlyClip(d.clip); return; }');
	});

	it('offers Copy in every editor, for every section the paste merges by definition', () => {
		const offered: Record<string, string[]> = {
			'src/lib/components/EditLiquidsModal.svelte': ['liquids'],
			'src/lib/components/EditAtmospheresModal.svelte': ['gasPhysics', 'atmosphereCompositions'],
			'src/lib/components/EditFuelAndDrivesModal.svelte': ['fuelDefinitions', 'engineDefinitions'],
			'src/lib/components/EditSensorsModal.svelte': ['sensorDefinitions'],
			'src/lib/components/EditBiospheresModal.svelte': ['morphologies', 'pigments']
		};
		const all = Object.values(offered).flat().sort();
		// ABSOLUTE against the paste's own table: every section with an identity is offered, and only those.
		expect(all).toEqual(SECTIONS.filter((s) => s.shape !== 'scalars').map((s) => String(s.key)).sort());
		for (const [file, sections] of Object.entries(offered)) {
			const src = read(file);
			for (const s of sections) expect(src, `${file} offers no Copy for ${s}`).toContain(`<CopyDefinitionButton section="${s}"`);
		}
	});
});
