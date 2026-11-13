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

	// THIS ROW WAS CORRECTED AT 3.1.1, the same way the biospheres row below it was at R-19, and for
	// the same reason. It used to assert `rulePack={effectiveRulePack ?? selectedRulepack}` - B132's
	// own fix - and the state it pinned was the "it only saves one custom gas" bug: this editor writes
	// back only the gases that DIFFER from `rulePack`, so with the campaign's overrides already in it a
	// gas saved last time was "the default", was left out, and the page replaced the section without it.
	//
	// What B132 actually requires is narrower than the pack prop: the LIQUID DROPDOWN reads the
	// effective list. So the editor now takes that separately (`effectivePack`, read-only) and diffs
	// against the shipped pack like every other editor. The behaviour - a custom liquid offered in the
	// dropdown, mounted as the page mounts it - is driven in `customDefinitionsSurviveEditors.spec.ts`.
	it('the page hands the atmospheres editor the EFFECTIVE pack for its liquid dropdown, and the SHIPPED pack to diff against', () => {
		const src = readFileSync(resolve(process.cwd(), 'src/routes/+page.svelte'), 'utf-8');
		expect(src).toMatch(/<EditAtmospheresModal[^>]*effectivePack=\{effectiveRulePack \?\? selectedRulepack\}/);
		expect(src).toMatch(/<EditAtmospheresModal[^>]*rulePack=\{selectedRulepack\}/);
		const modal = readFileSync(resolve(process.cwd(), 'src/lib/components/EditAtmospheresModal.svelte'), 'utf-8');
		expect(modal).toMatch(/liquidNames = allLiquids\(effectivePack \?\? rulePack\)/);
	});

	// THE BIOSPHERES HALF OF THIS GATE WAS CORRECTED AT R-19, and the correction is the point of the
	// note. It used to assert the biosphere editor took the effective pack too - "as it already did"
	// - which was an observation of the code rather than a requirement of B132, and the state it
	// pinned was a DATA-LOSING BUG: that editor stores a DELTA, so the pack it is handed is both the
	// base a delta is laid over and the base it is diffed against, and handing it the pack with the
	// overrides already applied made an unchanged open-and-save delete all three sections.
	//
	// Both editors store a difference, so both need the SHIPPED pack to compute it against; the
	// atmospheres editor ALSO needs the effective liquid list to populate a dropdown (that is B132),
	// which it now takes as a second, read-only prop. Pinned by `EditBiospheresModal.base.spec.ts`.
	it('the page mounts the biospheres editor with the SHIPPED pack, because it stores a delta', () => {
		const src = readFileSync(resolve(process.cwd(), 'src/routes/+page.svelte'), 'utf-8');
		expect(src).toMatch(/<EditBiospheresModal[^>]*rulePack=\{selectedRulepack\}/);
	});
});
