// R-19 JOB 3 — THE MERGE, RUN AGAINST THE HUB'S OWN CLIPS.
//
// The seven fixtures in the Creator Hub repo are produced by the hub's `buildClip`/`buildRulesClip`
// from real nodes, and its own test asserts their shape - so they cannot drift from what the hub
// actually emits. That is worth far more than fixtures written on this side: as the hub's README puts
// it, a paste target built against a guess passes its own tests and fails on the first real clipboard.
//
// THEY ARE READ WHERE THEY LIVE AND NEVER COPIED HERE. One copy, on the side that generates them; a
// second copy in this repo is a second thing to keep in step, which is the fault this whole seam has
// a protocol about. The suite therefore SKIPS GRACEFULLY when the hub repo is not on the machine -
// CI and a fresh clone will not have it, and a red suite for a missing sibling teaches nobody
// anything (the same rule `../user-test-files/` already follows).
//
// RED-FIRST, checked 2026-09-08 by removing each rule in turn: allow an overwrite and the conflict
// gates fail; drop the reuse-a-previous-rename branch and the twice-pasted gate fails; write a whole
// list instead of a delta and the tracking gate fails.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseHubClip, isRulesOnlyClip } from './hubClip';
import { mergeClipOverrides, compareClipOverrides, SECTIONS } from './clipRules';
import { buildEffectiveRulePack } from '$lib/rulepack/effectivePack';
import { allLiquids } from '$lib/physics/liquids';
import type { RulePack, RulePackOverrides } from '$lib/types';

const CLIPS = 'C:/Development/starsystemx-creator-hub/docs/clips';
const haveClips = existsSync(CLIPS);
const clip = (name: string) => {
	const file = readdirSync(CLIPS).find((f) => f.startsWith(name) && f.endsWith('.json'))!;
	const parsed = parseHubClip(readFileSync(join(CLIPS, file), 'utf8'));
	if (!parsed.ok) throw new Error(`${file} did not parse: ${parsed.problem}`);
	return parsed.clip;
};

/** A destination campaign's pack. Deliberately WITHOUT any of the clip's definitions. */
const PACK = {
	id: 'test', version: '1',
	fuelDefinitions: { entries: [{ id: 'h2', name: 'Hydrogen', density_kg_per_m3: 71, description: '' }] },
	engineDefinitions: { entries: [{ id: 'ion', name: 'Ion', type: 'ion', fuel_type_id: 'h2', thrust_kN: 1, efficiency_isp: 3000, description: '' }] },
	liquids: [{ name: 'water', label: 'Water', meltK: 273.15, boilK: 373.15 }]
} as unknown as RulePack;

const label = (c: any) => c.source?.title as string | undefined;

describe.skipIf(!haveClips)('R-19 against the hub own fixtures', () => {
	it('CLIP 1 - a body that needs a custom liquid: the rules are taken', () => {
		const c = clip('1-body');
		const m = mergeClipOverrides(c.rulePackOverrides, undefined, PACK, { sourceLabel: label(c), nodes: c.nodes });
		expect(m.added.map((a) => a.id).sort()).toEqual(['dt-slush', 'q-drive', 'unobtainium']);
		expect(m.renamed).toEqual([]);
		expect(m.changed).toBe(true);

		// AND THE DEFINITION IS REACHABLE - the difference between the fix and the bug. `liquidDef`
		// asks `allLiquids(pack)`, so the test is that the merged overrides produce a pack that has it.
		const merged = buildEffectiveRulePack(PACK, m.overrides);
		expect(allLiquids(merged).find((l) => l.name === 'unobtainium')).toMatchObject({ meltK: 20, boilK: 90 });
	});

	it('CLIP 2 - the same clip again: nothing added, nothing renamed, silently', () => {
		const first = clip('1-body');
		const after = mergeClipOverrides(first.rulePackOverrides, undefined, PACK, { sourceLabel: label(first) });
		const again = clip('2-same-clip-again');
		const m = mergeClipOverrides(again.rulePackOverrides, after.overrides, PACK, { sourceLabel: label(again), nodes: again.nodes });
		expect(m.added).toEqual([]);
		expect(m.renamed).toEqual([]);
		expect(m.changed).toBe(false);
		expect(m.discarded).toHaveLength(3);
		expect(m.overrides).toEqual(after.overrides);           // byte-for-byte the same campaign
	});

	it('CLIP 3 - the same rules with their keys shuffled: still a duplicate', () => {
		// The one a reasonable implementation gets wrong. Key order is decided by whatever built the
		// object; comparing raw text reports an ordinary duplicate as a conflict.
		const first = clip('1-body');
		const after = mergeClipOverrides(first.rulePackOverrides, undefined, PACK, { sourceLabel: label(first) });
		const shuffled = clip('3-same-rules-shuffled');
		expect(JSON.stringify(shuffled.rulePackOverrides))
			.not.toBe(JSON.stringify(first.rulePackOverrides));  // genuinely different text
		const m = mergeClipOverrides(shuffled.rulePackOverrides, after.overrides, PACK, { sourceLabel: label(shuffled), nodes: shuffled.nodes });
		expect(m.added).toEqual([]);
		expect(m.renamed).toEqual([]);
		expect(m.changed).toBe(false);
	});

	it('CLIP 4 - a DIFFERENT liquid under the same name is never overwritten', () => {
		const first = clip('1-body');
		const after = mergeClipOverrides(first.rulePackOverrides, undefined, PACK, { sourceLabel: label(first) });
		const conflict = clip('4-conflicting-liquid');
		const nodes = JSON.parse(JSON.stringify(conflict.nodes));
		const m = mergeClipOverrides(conflict.rulePackOverrides, after.overrides, PACK, { sourceLabel: label(conflict), nodes });

		// The destination's own unobtainium is untouched - boilK 90, not 140.
		const merged = buildEffectiveRulePack(PACK, m.overrides);
		expect(allLiquids(merged).find((l) => l.name === 'unobtainium')).toMatchObject({ boilK: 90 });

		// The incoming one arrived under a new name that says where it came from.
		expect(m.renamed).toHaveLength(1);
		const to = m.renamed[0].to;
		expect(to).toContain('unobtainium');
		expect(to).toContain(String(label(conflict)));
		expect(allLiquids(merged).find((l) => l.name === to)).toMatchObject({ boilK: 140 });
	});

	it('CLIP 4 - and the pasted body is repointed at the renamed liquid', () => {
		const first = clip('1-body');
		const after = mergeClipOverrides(first.rulePackOverrides, undefined, PACK, { sourceLabel: label(first) });
		const conflict = clip('4-conflicting-liquid');
		const nodes = JSON.parse(JSON.stringify(conflict.nodes));
		// The engine reads `hydrosphere.composition`; the hub's fixtures write `hydrosphere.liquid`,
		// which nothing here reads (reported on the seam, 2026-09-08). Set the field this engine
		// actually uses, so the repoint is tested rather than the field-name mismatch.
		for (const n of nodes) if (n?.hydrosphere?.liquid) n.hydrosphere.composition = n.hydrosphere.liquid;
		const m = mergeClipOverrides(conflict.rulePackOverrides, after.overrides, PACK, { sourceLabel: label(conflict), nodes });
		const body = nodes.find((n: any) => n?.hydrosphere?.composition);
		expect(body.hydrosphere.composition).toBe(m.renamed[0].to);
	});

	it('CLIP 4 twice - the second paste reuses the rename and adds nothing', () => {
		const first = clip('1-body');
		let state = mergeClipOverrides(first.rulePackOverrides, undefined, PACK, { sourceLabel: label(first) }).overrides;
		const conflict = clip('4-conflicting-liquid');
		const once = mergeClipOverrides(conflict.rulePackOverrides, state, PACK, { sourceLabel: label(conflict) });
		state = once.overrides;
		const twice = mergeClipOverrides(conflict.rulePackOverrides, state, PACK, { sourceLabel: label(conflict) });
		expect(twice.added).toEqual([]);
		expect(twice.changed).toBe(false);
		expect(twice.renamed.map((r) => r.reused)).toEqual([true]);   // renamed to the SAME name, not a second one
		expect(twice.overrides).toEqual(state);
	});

	it('CLIP 5 - a rules-only clip: rules merge, and there is nothing to place', () => {
		const c = clip('5-rules-only');
		expect(isRulesOnlyClip(c)).toBe(true);
		expect(c.nodes).toHaveLength(0);
		const m = mergeClipOverrides(c.rulePackOverrides, undefined, PACK, { sourceLabel: label(c) });
		expect(m.added.map((a) => a.id)).toEqual(['unobtainium']);
	});

	it('CLIP 6 - no rules at all: exactly today behaviour, nothing merged, nothing said', () => {
		const c = clip('6-no-rules');
		expect(c.rulePackOverrides).toBeUndefined();
		const m = mergeClipOverrides(c.rulePackOverrides, undefined, PACK, { sourceLabel: label(c) });
		expect(m.added).toEqual([]);
		expect(m.renamed).toEqual([]);
		expect(m.discarded).toEqual([]);
		expect(m.changed).toBe(false);
		expect(m.overrides).toBeUndefined();
	});

	it('CLIP 7 - a key from a future engine is ignored, not refused', () => {
		const c = clip('7-unknown-future-key');
		expect((c.rulePackOverrides as any)?.somethingTheEngineAddedLater).toBeUndefined();  // dropped at the door
		const m = mergeClipOverrides(c.rulePackOverrides, undefined, PACK, { sourceLabel: label(c) });
		expect(m.added.map((a) => a.id).sort()).toEqual(['dt-slush', 'q-drive', 'unobtainium']);
	});
});

// The rules that are not about any one fixture. These run everywhere, hub repo or not.
describe('R-19 the merge rules', () => {
	const UNOB = { name: 'unobtainium', label: 'Unobtainium', meltK: 90, boilK: 260 };

	it('a delta section is written back AS A DELTA, so the campaign keeps tracking the pack', () => {
		const m = mergeClipOverrides({ liquids: [UNOB] } as any, undefined, PACK, { sourceLabel: 'Somewhere' });
		const written = (m.overrides as any).liquids;
		expect(Array.isArray(written)).toBe(false);
		expect(written.entries?.unobtainium).toBeTruthy();
		// and it says only what changed: water is not in it, so a later improvement to water arrives.
		expect(Object.keys(written.entries)).toEqual(['unobtainium']);
	});

	it('a clash renames rather than overwrites, in every section that HAS a name', () => {
		const theirs: RulePackOverrides = {
			liquids: [{ ...UNOB, boilK: 999 }],
			engineDefinitions: [{ id: 'q', name: 'Theirs', type: 'x', fuel_type_id: 'h2', thrust_kN: 1, efficiency_isp: 1, description: '' }],
			gasPhysics: { XE: { molarMass: 131 } }
		} as any;
		const mine: RulePackOverrides = {
			liquids: [UNOB],
			engineDefinitions: [{ id: 'q', name: 'Mine', type: 'y', fuel_type_id: 'h2', thrust_kN: 2, efficiency_isp: 2, description: '' }],
			gasPhysics: { XE: { molarMass: 999 } }
		} as any;
		const base = mergeClipOverrides(mine, undefined, PACK, { sourceLabel: 'Home' });
		const m = mergeClipOverrides(theirs, base.overrides, PACK, { sourceLabel: 'Elsewhere' });
		expect(m.renamed.map((r) => r.section.key).sort()).toEqual(['engineDefinitions', 'gasPhysics', 'liquids']);
		// nothing the destination had was changed
		const after = buildEffectiveRulePack(PACK, m.overrides);
		expect(allLiquids(after).find((l) => l.name === 'unobtainium')).toMatchObject({ boilK: 260 });
		expect((after as any).gasPhysics.XE).toEqual({ molarMass: 999 });
	});

	it('a renamed FUEL drags the engine that burns it, or the engine arrives with no fuel', () => {
		const destination = mergeClipOverrides(
			{ fuelDefinitions: [{ id: 'dt', name: 'Mine', density_kg_per_m3: 1, description: '' }] } as any,
			undefined, PACK, { sourceLabel: 'Home' }).overrides;
		const incoming = {
			fuelDefinitions: [{ id: 'dt', name: 'Theirs', density_kg_per_m3: 225, description: '' }],
			engineDefinitions: [{ id: 'torch', name: 'Torch', type: 'fusion', fuel_type_id: 'dt', thrust_kN: 9, efficiency_isp: 9, description: '' }]
		} as any;
		const m = mergeClipOverrides(incoming, destination, PACK, { sourceLabel: 'Elsewhere' });
		const newFuel = m.renamed.find((r) => r.section.key === 'fuelDefinitions')!.to;
		const engine = (m.overrides as any).engineDefinitions.find((e: any) => e.id === 'torch');
		expect(engine.fuel_type_id).toBe(newFuel);
	});

	// THE SCALAR SECTION CAN ONLY EVER BE DISCARDED OR DECLINED, and that is a consequence rather than
	// an oversight. `pigmentModel(pack)` always answers with a COMPLETE config (it falls back to the
	// built-in one), so every field already has an effective value here and no field is ever ABSENT.
	// A field that matches is discarded; a field that differs cannot be renamed - `captureWeight` IS
	// the name - so under "never overwrite" the only honest move is to keep the GM's and say so.
	// Flagged to the owner as a product decision he can reverse; silence would be the R-19 bug again.
	it('a scalar that differs is DECLINED and said out loud, because a setting cannot be renamed', () => {
		const m = mergeClipOverrides({ pigmentModel: { captureWeight: 5 } } as any, undefined, PACK, {});
		expect(m.added).toEqual([]);
		expect(m.declined.map((d) => d.id)).toEqual(['captureWeight']);
		expect(m.declined[0].why).toContain('yours was kept');
		expect((m.overrides as any)?.pigmentModel).toBeUndefined();      // nothing written
	});

	it('a scalar the destination already matches is discarded in silence, not declined', () => {
		const same = { pigmentModel: { captureWeight: 5 } } as any;
		const destination = { pigmentModel: { captureWeight: 5 } } as any;
		const m = mergeClipOverrides(same, destination, PACK, {});
		expect(m.declined).toEqual([]);
		expect(m.discarded.map((d) => d.id)).toEqual(['captureWeight']);
	});

	// The second place a node names a liquid, and the one a narrowing pass would have missed.
	it('a rename repoints a FLUID LAYER as well as the surface composition', () => {
		const destination = mergeClipOverrides({ liquids: [UNOB] } as any, undefined, PACK, { sourceLabel: 'Home' }).overrides;
		const nodes = [{
			id: 'b', kind: 'body',
			hydrosphere: {
				composition: 'unobtainium',
				layers: [{ liquid: 'unobtainium', location: 'subsurface' }, { liquid: 'water', location: 'cloud' }]
			}
		}];
		const m = mergeClipOverrides({ liquids: [{ ...UNOB, boilK: 1 }] } as any, destination, PACK, { sourceLabel: 'Elsewhere', nodes });
		const to = m.renamed[0].to;
		expect(nodes[0].hydrosphere.composition).toBe(to);
		expect(nodes[0].hydrosphere.layers[0].liquid).toBe(to);
		expect(nodes[0].hydrosphere.layers[1].liquid).toBe('water');   // untouched
	});

	it('the destination overrides are never mutated in place', () => {
		const destination: any = { liquids: [UNOB] };
		const before = JSON.stringify(destination);
		mergeClipOverrides({ liquids: [{ ...UNOB, boilK: 1 }] } as any, destination, PACK, { sourceLabel: 'X' });
		expect(JSON.stringify(destination)).toBe(before);
	});

	it('merging nothing changes nothing', () => {
		const destination: any = { liquids: [UNOB] };
		const m = mergeClipOverrides(undefined, destination, PACK, {});
		expect(m.changed).toBe(false);
		expect(m.overrides).toEqual(destination);
	});
});
