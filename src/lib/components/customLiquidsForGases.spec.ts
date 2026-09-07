// B132: a liquid the GM creates must be offered as something a gas can condense into. The list is
// `allLiquids(pack)` - ONE definition - and the fault was the gas editor being mounted with the BASE
// pack while the custom liquid lives in the EFFECTIVE pack the page builds from the campaign's overrides.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { allLiquids } from '$lib/physics/liquids';
import { LIQUIDS } from '$lib/constants';

describe('a custom liquid reaches the gas editor (B132)', () => {
	it('allLiquids offers the campaign override, custom liquid included, once the override is on the pack', () => {
		const custom = { ...LIQUIDS[0], name: 'Liquid Unobtainium' };
		const pack: any = { liquids: [...LIQUIDS, custom] };
		expect(allLiquids(pack).map((l) => l.name)).toContain('Liquid Unobtainium');
		// and the base pack, which is what the editor used to be handed, cannot know about it
		expect(allLiquids({ liquids: [] } as any).map((l) => l.name)).not.toContain('Liquid Unobtainium');
	});

	it('the page mounts the atmospheres editor with the EFFECTIVE pack, as it already did the biospheres editor', () => {
		const src = readFileSync(resolve(process.cwd(), 'src/routes/+page.svelte'), 'utf-8');
		expect(src).toMatch(/<EditAtmospheresModal[^>]*rulePack=\{effectiveRulePack \?\? selectedRulepack\}/);
		expect(src).toMatch(/<EditBiospheresModal[^>]*rulePack=\{effectiveRulePack \?\? selectedRulepack\}/);
	});
});
