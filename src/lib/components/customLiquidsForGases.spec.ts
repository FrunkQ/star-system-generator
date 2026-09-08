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

	it('the page mounts the atmospheres editor with the EFFECTIVE pack, so the custom liquid is offered', () => {
		const src = readFileSync(resolve(process.cwd(), 'src/routes/+page.svelte'), 'utf-8');
		expect(src).toMatch(/<EditAtmospheresModal[^>]*rulePack=\{effectiveRulePack \?\? selectedRulepack\}/);
	});

	// THE BIOSPHERES HALF OF THIS GATE WAS CORRECTED AT R-19, and the correction is the point of the
	// note. It used to assert the biosphere editor took the effective pack too - "as it already did"
	// - which was an observation of the code rather than a requirement of B132, and the state it
	// pinned was a DATA-LOSING BUG: that editor stores a DELTA, so the pack it is handed is both the
	// base a delta is laid over and the base it is diffed against, and handing it the pack with the
	// overrides already applied made an unchanged open-and-save delete all three sections.
	//
	// The two editors differ because what they need differs: the atmospheres editor needs the
	// EFFECTIVE liquid list to populate a dropdown (that is B132), the biospheres editor needs the
	// SHIPPED lists to compute a delta against. Pinned by `EditBiospheresModal.base.spec.ts`.
	it('the page mounts the biospheres editor with the SHIPPED pack, because it stores a delta', () => {
		const src = readFileSync(resolve(process.cwd(), 'src/routes/+page.svelte'), 'utf-8');
		expect(src).toMatch(/<EditBiospheresModal[^>]*rulePack=\{selectedRulepack\}/);
	});
});
