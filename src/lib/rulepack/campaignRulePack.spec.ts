// A LOADED CAMPAIGN'S WORLDS ARE DERIVED WITH THE CAMPAIGN'S OWN RULES - 3.1.1.
//
// "Liquid colours" (S33) was filed as blocked by the custom-definitions bug, and half of it was this
// instead. The definitions were in the save and came back intact; but every campaign load - a file,
// the browser's own copy on a refresh, a base-map upgrade - strips each system's derived data and
// re-derives it, and it did that against the SHIPPED pack. So a world with an ocean of a custom
// liquid under a custom gas came back in the default colours, at the wrong temperature, without its
// custom vegetation layers, and stayed that way on the starmap, in All Bodies and for players until
// the GM happened to open that system (the system view derives against the effective pack). To the
// GM who had just set a liquid's colour and refreshed, the colour had not been saved.
//
// MEASURED 2026-11-13 on this file's test world: 49 derived fields differ between the two packs,
// among them `apparentColorHex`, the ocean's colour, the sky haze, the greenhouse temperature and
// two vegetation layers.
//
// THE PAGE'S LOAD FUNCTIONS CANNOT BE CALLED FROM HERE (they live in `+page.svelte`), so this reads
// out of the page's own source which pack each one derives against and derives with THAT - the rows
// about the world fail on the world when the page stops asking for the campaign's rules.
//
// RED-FIRST: with both `const pack = campaignRulePack(...)` lines put back to `selectedRulepack`,
// the two load rows fail with the ocean colour null where '#7fd4c1' is expected, and the pin row
// fails naming the function.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RulePack, Starmap, System } from '$lib/types';
import { buildEffectiveRulePack, campaignRulePack } from './effectivePack';
import { fixUpImportedSystem } from '$lib/system/importFixup';
import { systemProcessor } from '$lib/core/SystemProcessor';
import { campaign, freshCampaign, homeSystem, shippedPack } from '$lib/io/customDefinitions.testkit';

const PACK: RulePack = shippedPack();
const PAGE = readFileSync(resolve(process.cwd(), 'src/routes/+page.svelte'), 'utf-8');
const body = (fn: string) => { const i = PAGE.indexOf(fn); if (i < 0) throw new Error(`+page.svelte no longer declares "${fn}"`); return PAGE.slice(i, i + 4500); };

/** The pack a page load function derives against, as its source says. */
function packThePageLoadsWith(fn: string, campaignVar: string, map: Starmap): RulePack {
	return body(fn).includes(`const pack = campaignRulePack(selectedRulepack, ${campaignVar});`)
		? (campaignRulePack(PACK, map) as RulePack)
		: PACK;
}
const derive = (system: System, pack: RulePack): System =>
	systemProcessor.process(fixUpImportedSystem(JSON.parse(JSON.stringify(system)), pack), pack);
const world = (system: System): any => system.nodes.find((n: any) => n.name === 'Homeworld');
const oceanColour = (system: System): string | null =>
	(world(system)?.hydrosphere?.layers ?? []).find((l: any) => l.location === 'surface')?.colorHex ?? null;

describe('campaignRulePack', () => {
	it('is the shipped pack itself for a campaign with no custom rules, and for no campaign at all', () => {
		expect(campaignRulePack(PACK, freshCampaign())).toBe(PACK);
		expect(campaignRulePack(PACK, null)).toBe(PACK);
		expect(campaignRulePack(undefined, campaign(PACK))).toBeUndefined();
	});

	it('is the effective pack for a campaign that has some, and never the shipped object mutated', () => {
		const map = campaign(PACK);
		const pack = campaignRulePack(PACK, map) as any;
		expect(pack).not.toBe(PACK);
		expect(Object.keys(pack.gasPhysics)).toEqual(expect.arrayContaining(['Xq', 'Zz']));
		expect((PACK as any).gasPhysics.Xq).toBeUndefined();
	});
});

describe('a campaign load derives its worlds with the campaign\'s own gases and liquids', () => {
	const map = campaign(PACK);
	const asTheSystemViewWouldShowIt = derive(homeSystem(), buildEffectiveRulePack(PACK, map.rulePackOverrides)!);

	for (const [what, fn, campaignVar] of [
		['a campaign FILE being opened', 'async function openStarmapPayload', 'sanitized'],
		['the browser\'s own copy on a refresh', 'async function recalcAllSystems', 'starmap']
	] as const) {
		it(`${what}: the ocean has its custom liquid's colour, and the world is the one the system view shows`, () => {
			const loaded = derive(homeSystem(), packThePageLoadsWith(fn, campaignVar, map));
			expect(oceanColour(loaded)).toBe('#7fd4c1');
			expect(world(loaded).apparentColorHex).toBe(world(asTheSystemViewWouldShowIt).apparentColorHex);
			expect(world(loaded).temperatureK).toBe(world(asTheSystemViewWouldShowIt).temperatureK);
			expect((world(loaded).vegetation?.layers ?? []).map((l: any) => l.morphology))
				.toEqual((world(asTheSystemViewWouldShowIt).vegetation?.layers ?? []).map((l: any) => l.morphology));
		});
	}

	it('THE CONTROL: derived against the shipped pack alone, the same world has no ocean colour and a different face', () => {
		const stale = derive(homeSystem(), PACK);
		expect(oceanColour(stale)).toBeNull();
		expect(world(stale).apparentColorHex).not.toBe(world(asTheSystemViewWouldShowIt).apparentColorHex);
	});

	it('both load functions in the page ask for the campaign\'s rules before the first pass', () => {
		expect(body('async function openStarmapPayload')).toMatch(/const pack = campaignRulePack\(selectedRulepack, sanitized\);[\s\S]*systemProcessor\.process\(fixUpImportedSystem\(node\.system, pack\), pack\)/);
		expect(body('async function recalcAllSystems')).toMatch(/const pack = campaignRulePack\(selectedRulepack, starmap\);[\s\S]*systemProcessor\.process\(fixUpImportedSystem\(node\.system, pack\), pack\)/);
	});
});
