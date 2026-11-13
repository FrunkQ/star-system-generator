// EVERY ROAD A CAMPAIGN'S CUSTOM DEFINITIONS TRAVEL, WITH TWO OF EVERYTHING ON BOARD.
//
// The 3.1.1 emergency fix. GMs reported custom gases, liquids, engines and biospheres "deleted out of
// existence", in production and in beta, and nobody could say which road lost them. So this walks
// every one, each with TWO custom definitions in EVERY section a GM can author (`customDefinitions.
// testkit.ts`), and counts them absolutely on the far side:
//
//   1. Save Starmap as plain .json, and load it.
//   2. Save Starmap as an .sse.zip bundle (a campaign carrying a picture), and load it.
//   3. The browser's own autosave, and a reload.
//   4. Copy an object, paste it into a different campaign (R-19).
//   5. Save System as .json or .sse.zip, and Load System into a campaign that has none of it.   <- THE HOLE
//   6. The same system file through the wizard's "place a saved system on the map" door.       <- THE HOLE
//   7. A CAMPAIGN file through that same door (it takes the campaign's first system).          <- THE HOLE
//   8. A campaign file in the shape production v3.1.48 writes, loaded here.
//
// 1-4 and 8 KEPT THE DEFINITIONS ALREADY and are pinned here so they keep doing so (what 1 and 3 got
// wrong was the worlds' derived look on load - `rulepack/campaignRulePack.spec.ts`). 5-7 are what was
// broken: a system saved on its own was written without the rules its campaign made, so the worlds
// came back naming a gas whose definition was nowhere - "the planets' atmospheres with custom
// molecules were unchanged".
//
// WHAT IS DRIVEN, HONESTLY. The save and load handlers live in two Svelte components
// (`+page.svelte`, `SystemView.svelte`) that cannot be mounted here. Each road below is therefore
// the handler's OWN functions called in the handler's own order, and the last block pins, in the
// components' source, that the handlers still call them. A road re-plumbed in a component without
// these functions turns that block red.
//
// RED-FIRST, 2026-11-13: with `withCampaignRules` returning the document untouched (the save half
// removed), roads 5 and 6 fail with no definitions at all where two per section are expected; with
// `takeCarriedRules` returning undefined (the load half removed), roads 5, 6 and 7 fail the same way.
// Roads 1-4 and 8 stay green under both, which is the evidence that they never lost a definition.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RulePack, RulePackOverrides, Starmap, System } from '$lib/types';
import { classifySaveFile } from './classify';
import { packBundle, plainSaveJson } from './bundle';
import { buildClip, parseHubClip, insertClip } from './hubClip';
import { mergeClipOverrides } from './clipRules';
import { systemFromSave } from './systemFromSave';
import { landCarriedRules, takeCarriedRules, withCampaignRules } from './systemRules';
import { stampForSave } from '$lib/map/provenance';
import { fixUpImportedSystem, stripStarmapForExport, stripSystemForExport } from '$lib/system/importFixup';
import { sanitizeStarmapForRuntime } from '$lib/starmapSanitizer';
import { validateStarmap } from '$lib/utils';
import { systemProcessor } from '$lib/core/SystemProcessor';
import { buildEffectiveRulePack, campaignRulePack } from '$lib/rulepack/effectivePack';
import { temporalForExport } from '$lib/temporal/defaults';
import { liquidDef } from '$lib/physics/liquids';
import {
	AUTHORED_PER_SECTION, authored, authoredCounts, campaign, campaignOverrides, freshCampaign,
	homeSystem, namedBySystem, shippedPack, LIQUIDS
} from './customDefinitions.testkit';

const PACK: RulePack = shippedPack();
const PAGE = readFileSync(resolve(process.cwd(), 'src/routes/+page.svelte'), 'utf-8');
const VIEW = readFileSync(resolve(process.cwd(), 'src/lib/components/SystemView.svelte'), 'utf-8');
const WIZARD = readFileSync(resolve(process.cwd(), 'src/lib/components/GenerationWizard.svelte'), 'utf-8');
/** The text of a function in a component, from its declaration on. */
function body(src: string, fn: string, span = 4500): string {
	const i = src.indexOf(fn);
	if (i < 0) throw new Error(`the component no longer declares "${fn}"`);
	return src.slice(i, i + span);
}
/**
 * WHICH PACK A CAMPAIGN LOAD DERIVES AGAINST, read out of the page rather than assumed: the campaign's
 * own rules if that load function asks `campaignRulePack` for them, the shipped pack if it does not.
 * So the rows below that look at a loaded world's colour fail on the WORLD when the page stops asking.
 */
function packThePageLoadsWith(fn: string, campaignVar: string, map: Starmap): RulePack {
	return body(PAGE, fn).includes(`const pack = campaignRulePack(selectedRulepack, ${campaignVar});`)
		? (campaignRulePack(PACK, map) as RulePack)
		: PACK;
}
const utf8 = (s: string) => new TextEncoder().encode(s);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** The sixteen definitions and one setting a full campaign authors - the number every road must deliver. */
const EVERYTHING = authored(campaignOverrides(PACK), PACK);
/** What the Homeworld and the Kestrel name, as authored. */
const NAMED = namedBySystem(homeSystem());

function expectEverything(overrides: RulePackOverrides | undefined, road: string) {
	expect(authoredCounts(overrides, PACK), `${road}: how many custom definitions arrived, per section`).toEqual(AUTHORED_PER_SECTION);
	expect(authored(overrides, PACK), `${road}: and each one arrived as it was written`).toEqual(EVERYTHING);
}

// --- the campaign roads, as `+page.svelte` runs them ------------------------------------------------

/** `handleDownloadStarmap`: strip, stamp, then a bundle if there is an asset to carry, else plain JSON. */
async function saveStarmapFile(map: Starmap): Promise<Uint8Array> {
	const lean = stripStarmapForExport(map, PACK);
	const exportObj = stampForSave({ ...lean }, { exportMode: 'gm' });
	const bundle = await packBundle('starmap', exportObj, {});
	return bundle ?? utf8(plainSaveJson(exportObj));
}

/** `openStarmapPayload`: sanitise, fix up and re-derive every system, validate, and it is the campaign. */
function openStarmapFile(raw: Uint8Array): Starmap {
	const classified = classifySaveFile(raw);
	expect(classified.kind).toBe('starmap');
	const sanitized: any = sanitizeStarmapForRuntime(classified.doc as Starmap);
	const pack = packThePageLoadsWith('async function openStarmapPayload', 'sanitized', sanitized);
	for (const node of sanitized.systems) {
		node.system = systemProcessor.process(fixUpImportedSystem(node.system, pack), pack);
	}
	expect(validateStarmap(sanitized)).toEqual([]);
	return sanitized;
}

// --- the system roads, as `SystemView.svelte` and the wizard run them -------------------------------

/** `handleSaveSystem`, GM mode: strip, add the campaign's rules, stamp, bundle or plain JSON. */
async function saveSystemFile(system: System, campaignRules: RulePackOverrides | undefined): Promise<Uint8Array> {
	const stripped = withCampaignRules(stripSystemForExport(system, buildEffectiveRulePack(PACK, campaignRules)), campaignRules);
	const stamped = stampForSave(stripped as any, { exportMode: 'gm' });
	const bundle = await packBundle('system', stamped, {});
	return bundle ?? utf8(plainSaveJson(stamped));
}

/** `openSystemBytes`: classify, take the rules off the file and into the campaign, fix up, process. */
function loadSystemFile(raw: Uint8Array, into: Starmap): { map: Starmap; system: System; note: string } {
	const classified = classifySaveFile(raw);
	expect(classified.kind).toBe('system');
	const carried = takeCarriedRules(classified);
	const doc: any = classified.doc;
	const landed = landCarriedRules(carried, into.rulePackOverrides, PACK, doc.nodes);
	const system = systemProcessor.process(fixUpImportedSystem(doc, landed.pack), landed.pack);
	return { map: { ...into, rulePackOverrides: landed.overrides } as Starmap, system, note: landed.note };
}

/** The wizard's door and the "Add System" link: `systemFromSave`, then `landSystem` on the page. */
async function placeSavedSystem(raw: Uint8Array, into: Starmap): Promise<{ map: Starmap; system: System; note: string }> {
	const got = await systemFromSave(classifySaveFile(raw), PACK);
	if (!got.ok) throw new Error(got.problem);
	const landed = landCarriedRules(got.rules, into.rulePackOverrides, PACK, got.system.nodes);
	const system = systemProcessor.process(got.system, landed.pack);
	return { map: { ...into, rulePackOverrides: landed.overrides } as Starmap, system, note: landed.note };
}

/** The colour the engine derived for a world's surface ocean - null when it found no definition. */
const oceanColour = (system: System): string | null => {
	const world: any = system.nodes.find((n: any) => n.name === 'Homeworld');
	const surface = (world?.hydrosphere?.layers ?? []).find((l: any) => l.location === 'surface');
	return surface?.colorHex ?? null;
};

const withPicture = (map: Starmap): Starmap => {
	const out = clone(map);
	(out.systems[0].system.nodes[1] as any).image = { url: 'data:image/png;base64,' + btoa('PNGBYTES'), custom: true };
	return out;
};

describe('1-2. Save Starmap and load it: every custom definition comes back, in both containers', () => {
	it('plain .json', async () => {
		const raw = await saveStarmapFile(campaign(PACK));
		expect(raw[0], 'an asset-free campaign is plain JSON').toBe('{'.charCodeAt(0));
		const back = openStarmapFile(raw);
		expectEverything(back.rulePackOverrides, 'starmap .json');
		expect(namedBySystem(back.systems[0].system)).toEqual(NAMED);
		// S33, and the half of this bug that looked like a lost colour: the definitions were in the file,
		// but the load derived every world against the SHIPPED pack, so the ocean came back in the
		// default colour until that system was opened. Derived with its own liquid, at load.
		expect(oceanColour(back.systems[0].system), 'the loaded world is derived WITH its custom liquid').toBe('#7fd4c1');
	});

	it('.sse.zip bundle', async () => {
		const raw = await saveStarmapFile(withPicture(campaign(PACK)));
		expect(String.fromCharCode(raw[0], raw[1]), 'a campaign with a picture is a zip').toBe('PK');
		const back = openStarmapFile(raw);
		expectEverything(back.rulePackOverrides, 'starmap .sse.zip');
		expect(namedBySystem(back.systems[0].system)).toEqual(NAMED);
	});

	it('saved, loaded, saved and loaded again - nothing wears off on the second trip', async () => {
		const once = openStarmapFile(await saveStarmapFile(campaign(PACK)));
		const twice = openStarmapFile(await saveStarmapFile(once));
		expectEverything(twice.rulePackOverrides, 'starmap, second trip');
	});
});

describe('3. the browser autosave and a reload', () => {
	it('what is put in IndexedDB is the campaign with its custom definitions, and a reload re-derives without touching them', () => {
		const live = campaign(PACK);
		// `enqueueStarmapPersist`: the live campaign, with only the calendar registry pruned. IndexedDB
		// stores a structured clone.
		const temporal = temporalForExport((live as any).temporal);
		const stored = structuredClone(temporal === (live as any).temporal ? live : { ...live, temporal });
		// `recalcAllSystems` on boot: fix up and re-derive each system.
		const pack = packThePageLoadsWith('async function recalcAllSystems', 'starmap', stored);
		for (const node of stored.systems) node.system = systemProcessor.process(fixUpImportedSystem(node.system, pack), pack);
		expectEverything(stored.rulePackOverrides, 'autosave');
		expect(namedBySystem(stored.systems[0].system)).toEqual(NAMED);
		expect(oceanColour(stored.systems[0].system), 'and the reloaded world is derived WITH its custom liquid').toBe('#7fd4c1');
	});
});

describe('4. copy an object out of one campaign and paste it into another (R-19)', () => {
	it('the Homeworld arrives in a fresh campaign with every rule its campaign made', () => {
		const from = campaign(PACK);
		const clip = buildClip(from.systems[0].system, 'home-world', { rulePackOverrides: from.rulePackOverrides, systemName: 'Home' })!;
		const parsed = parseHubClip(JSON.stringify(clip));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		const merged = mergeClipOverrides(parsed.clip.rulePackOverrides, freshCampaign().rulePackOverrides, PACK, { nodes: parsed.clip.nodes });
		// The pigment model is a setting, not a definition, and a paste never carries one (DATA-R49).
		const { pigmentModel: _setting, ...definitions } = AUTHORED_PER_SECTION;
		expect(authoredCounts(merged.overrides, PACK)).toEqual(definitions);
	});

	it('and into a system of a campaign that already has other rules, which are all kept', () => {
		const from = campaign(PACK);
		const clip = buildClip(from.systems[0].system, 'home-world', { rulePackOverrides: from.rulePackOverrides })!;
		const dest: Starmap = { ...freshCampaign(), rulePackOverrides: { gasPhysics: { Qq: { molarMass: 0.2 } } } as any };
		const host = homeSystem();
		const result = insertClip(host, clip, 'home-sun', Date.now());
		expect(result.ok).toBe(true);
		const merged = mergeClipOverrides(clip.rulePackOverrides, dest.rulePackOverrides, PACK, {});
		expect(authoredCounts(merged.overrides, PACK).gasPhysics, 'two arrived, one was already there').toBe(3);
	});
});

describe('5. Save System, then Load System into a campaign that has none of its rules', () => {
	for (const container of ['.json', '.sse.zip'] as const) {
		it(`${container}: all sixteen definitions arrive with it, and the worlds still name them`, async () => {
			const from = container === '.json' ? campaign(PACK) : withPicture(campaign(PACK));
			const raw = await saveSystemFile(from.systems[0].system, from.rulePackOverrides);
			expect(String.fromCharCode(raw[0]), container).toBe(container === '.json' ? '{' : 'P');

			const { map, system, note } = loadSystemFile(raw, freshCampaign());
			const { pigmentModel: _setting, ...definitions } = AUTHORED_PER_SECTION;
			expect(authoredCounts(map.rulePackOverrides, PACK), 'per section, in the campaign that loaded the file').toEqual(definitions);
			expect(namedBySystem(system)).toEqual(NAMED);
			// AND IT SAYS SO - a load that silently carried rules would look exactly like the bug.
			expect(note).toMatch(/^Added 2 fuel definitions, 2 engine definitions, 2 sensor definitions, 2 gases, 2 atmosphere presets, 2 liquids, 2 morphologies and 2 pigments/);
			// The rules live on the CAMPAIGN. Left on the system they would be written back out inside
			// every later campaign save, a second copy of something with one home.
			expect((system as any).rulePackOverrides).toBeUndefined();
		});
	}

	it('S33: a custom liquid keeps its COLOUR, and the loaded world is derived with it', async () => {
		const from = campaign(PACK);
		const { map, system } = loadSystemFile(await saveSystemFile(from.systems[0].system, from.rulePackOverrides), freshCampaign());
		const effective = buildEffectiveRulePack(PACK, map.rulePackOverrides)!;
		for (const l of LIQUIDS) expect(liquidDef(l.name, effective)?.colorHex, l.name).toBe(l.colorHex);
		// The ocean is `unobtainium` (#7fd4c1) and the surface layer takes its colour from the
		// definition: derived against a pack that does not know the liquid, it has none.
		expect(oceanColour(system)).toBe('#7fd4c1');
		expect(oceanColour(systemProcessor.process(fixUpImportedSystem(clone(homeSystem()), PACK), PACK)), 'the control: no definition, no colour').toBeNull();
	});

	it('back into the campaign it came from: nothing is added, nothing is renamed, nothing is said', async () => {
		const from = campaign(PACK);
		const { map, note } = loadSystemFile(await saveSystemFile(from.systems[0].system, from.rulePackOverrides), from);
		expectEverything(map.rulePackOverrides, 'same campaign');
		expect(map.rulePackOverrides, 'the stored overrides are the very same object - no write at all').toBe(from.rulePackOverrides);
		expect(note).toBe('');
	});

	it('into a campaign that defines the same gas DIFFERENTLY: theirs is kept, the arriving one is renamed, the world follows it', async () => {
		const from = campaign(PACK);
		const theirs = { molarMass: 0.5, shielding: 9 };
		const dest: Starmap = { ...freshCampaign(), rulePackOverrides: { gasPhysics: { Xq: theirs } } as any };
		const { map, system, note } = loadSystemFile(await saveSystemFile(from.systems[0].system, from.rulePackOverrides), dest);
		expect(map.rulePackOverrides?.gasPhysics?.Xq, 'the destination\'s own Xq is untouched').toEqual(theirs);
		expect(Object.keys(map.rulePackOverrides?.gasPhysics ?? {}).sort()).toEqual(['Xq', 'Xq (from Home)', 'Zz']);
		expect(namedBySystem(system).gases).toEqual(['N2', 'Xq (from Home)', 'Zz']);
		expect(note).toMatch(/renamed Xq to Xq \(from Home\) because you already had one/i);
	});

	it('a system file written BEFORE this (no rules in it) loads exactly as it did and changes no campaign rules', async () => {
		const from = campaign(PACK);
		const old = utf8(plainSaveJson(stampForSave(stripSystemForExport(from.systems[0].system, PACK) as any, { exportMode: 'gm' })));
		const dest: Starmap = { ...freshCampaign(), rulePackOverrides: { gasPhysics: { Qq: { molarMass: 0.2 } } } as any };
		const { map, system, note } = loadSystemFile(old, dest);
		expect(map.rulePackOverrides).toBe(dest.rulePackOverrides);
		expect(note).toBe('');
		expect(namedBySystem(system)).toEqual(NAMED);
	});

	it('a campaign with no custom rules writes a system file with no extra key', async () => {
		const raw = await saveSystemFile(homeSystem(), undefined);
		expect(JSON.parse(new TextDecoder().decode(raw)).rulePackOverrides).toBeUndefined();
	});
});

describe('6-7. a saved file placed on the map through the wizard\'s door', () => {
	it('6. a SYSTEM file brings its rules', async () => {
		const from = campaign(PACK);
		const { map, system, note } = await placeSavedSystem(await saveSystemFile(from.systems[0].system, from.rulePackOverrides), freshCampaign());
		const { pigmentModel: _setting, ...definitions } = AUTHORED_PER_SECTION;
		expect(authoredCounts(map.rulePackOverrides, PACK)).toEqual(definitions);
		expect(namedBySystem(system)).toEqual(NAMED);
		expect((system as any).rulePackOverrides).toBeUndefined();
		expect(note).toMatch(/^Added /);
	});

	it('7. a CAMPAIGN file gives its first system AND the campaign\'s rules, which were at the top of that file all along', async () => {
		const { map, system } = await placeSavedSystem(await saveStarmapFile(campaign(PACK)), freshCampaign());
		const { pigmentModel: _setting, ...definitions } = AUTHORED_PER_SECTION;
		expect(authoredCounts(map.rulePackOverrides, PACK)).toEqual(definitions);
		expect(namedBySystem(system)).toEqual(NAMED);
	});
});

describe('8. a campaign saved by production v3.1.48, loaded here', () => {
	// NOT A REAL USER FILE (those live outside the repo and are never committed). It is this test's
	// campaign written in the shapes 3.1.48 wrote: the same `rulePackOverrides` key, with the liquids
	// as a WHOLE LIST - what every campaign saved before the delta form carries, and what a hand-edited
	// file may still hold - and the stamp that build put on a save.
	it('whole-list liquids, the 3.1.48 stamp, and every other section as that build stored it', async () => {
		const map: any = campaign(PACK);
		const effective = buildEffectiveRulePack(PACK, map.rulePackOverrides)!;
		map.rulePackOverrides.liquids = clone((effective as any).liquids);
		const doc = { ...stripStarmapForExport(map, PACK), appVersion: '3.1.48', exportMode: 'gm' };
		const back = openStarmapFile(utf8(JSON.stringify(doc, null, 2)));
		expectEverything(back.rulePackOverrides, 'a v3.1.48 file');
		expect(namedBySystem(back.systems[0].system)).toEqual(NAMED);
	});
});

describe('the components still take these roads', () => {
	const view = VIEW, page = PAGE, wizard = WIZARD;
	it('Save System (GM) writes the campaign\'s rules beside the nodes; a Player save does not', () => {
		const save = body(view, 'async function handleSaveSystem');
		expect(save).toMatch(/systemToSave = withCampaignRules\(\s*stripSystemForExport\(\$systemStore, rulePack\),\s*\$starmapStore\?\.rulePackOverrides\s*\)/);
		expect(save.indexOf('computePlayerSnapshot')).toBeLessThan(save.indexOf('withCampaignRules'));
		expect((save.match(/withCampaignRules\(/g) ?? []).length, 'on the GM branch only').toBe(1);
	});

	it('Load System takes the rules off the file, folds them into the campaign, and only then processes', () => {
		const load = body(view, 'async function openSystemBytes');
		const take = load.indexOf('takeCarriedRules(classified)');
		const land = load.indexOf('landCarriedRules(');
		const process = load.indexOf('systemProcessor.process(');
		expect(take).toBeGreaterThan(-1);
		expect(land).toBeGreaterThan(take);
		expect(process, 'processed AFTER the merge, against the pack that knows the rules').toBeGreaterThan(land);
		expect(load).toMatch(/rulePackOverrides: landed\.overrides/);
		expect(view).toMatch(/export let shippedRulePack/);
		expect(page).toMatch(/shippedRulePack=\{selectedRulepack\}/);
	});

	it('the wizard and the "Add System" link hand the file\'s rules to the page, which lands them with the system', () => {
		expect((wizard.match(/rules: got\.rules/g) ?? []).length, 'both of the wizard\'s saved-file doors').toBeGreaterThanOrEqual(2);
		const land = body(page, 'function landSystem(', 2200);
		expect(land).toMatch(/landCarriedRules\(rules, map\.rulePackOverrides, selectedRulepack, system\.nodes\)/);
		expect(land, 're-derived against the pack that knows the rules, strip first').toMatch(/systemProcessor\.process\(fixUpImportedSystem\(system, landed\.pack\), landed\.pack\)/);
		expect(land).toMatch(/rulePackOverrides: landed\.overrides/);
		expect(body(page, 'async function placePendingHubSystem', 1600)).toMatch(/landSystem\([^)]*got\.rules\)/);
	});
});
