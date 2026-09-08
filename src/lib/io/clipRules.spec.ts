// R-19 JOB 1 — THE ENVELOPE AND THE THREE PRODUCERS.
//
// The bug this whole feature closes is a WRONG ANSWER, not a missing feature: a pasted planet whose
// hydrosphere names a GM's custom liquid used to look up a definition that was not there, fall back
// to a default, and REPORT SUCCESS. So the gates here are about what survives the envelope, and the
// ones in `clipRulesMerge.spec.ts` are about what the merge does with it.
//
// EVERY GATE BELOW WAS RUN AGAINST THE CODE WITH THE FIX REMOVED AND SEEN TO GO RED (2026-09-08).
// Three gates in this project's history passed with their bug fully present, which is why that is
// the house rule and why it is recorded here rather than assumed.
import { describe, it, expect } from 'vitest';
import { parseHubClip, buildClip, isRulesOnlyClip, insertClip, systemNodesFromClip, CLIP_FORMAT } from './hubClip';
import { readClipOverrides, effectiveDefinitions, describeOverrides, SECTIONS } from './clipRules';
import type { RulePack, RulePackOverrides, System } from '$lib/types';

const UNOBTAINIUM = {
	name: 'unobtainium', label: 'Unobtainium', meltK: 90, boilK: 260,
	colorHex: '#b18cff', biosolvent: 'alternative' as const
};

/** The smallest pack that answers `allLiquids` etc. without dragging the whole starter pack in. */
const PACK = {
	liquids: [
		{ name: 'water', label: 'Water', meltK: 273.15, boilK: 373.15 },
		{ name: 'ammonia', label: 'Ammonia', meltK: 195.4, boilK: 239.8 }
	],
	morphologies: [
		{ key: 'microbial', label: 'Microbial', order: 0, defaultCoverage: 0.9, tints: ['#6b7a5a'], pigmentDriven: 0.5, opacity: 0.4, light: { min: 0, max: 0 } },
		{ key: 'flora', label: 'Flora', order: 2, defaultCoverage: 0.6, tints: ['#3d6b34'], pigmentDriven: 0.9, opacity: 0.8, light: { min: 0, max: 0 } }
	],
	pigments: [{ key: 'chlorophyll', label: 'Chlorophyll', bands: [{ centreNm: 430, widthNm: 40, strength: 0.9 }] }]
} as unknown as RulePack;

function mapClipText(over?: any): string {
	return JSON.stringify({
		sseClip: 1,
		source: { site: 'hub', url: 'https://example.test/s/m#node=a', title: 'A map', creator: 'Somebody' },
		root: 'a',
		nodes: [{ id: 'a', kind: 'body', roleHint: 'planet', name: 'Vex', parentId: null, hydrosphere: { composition: 'unobtainium', coverage: 0.4 } }],
		...(over ? { rulePackOverrides: over } : {})
	});
}

describe('R-19 the envelope', () => {
	it('carries rulePackOverrides through a map clip, whole', () => {
		const p = parseHubClip(mapClipText({ liquids: [UNOBTAINIUM] }));
		expect(p.ok).toBe(true);
		if (!p.ok) return;
		expect(p.clip.rulePackOverrides?.liquids).toEqual([UNOBTAINIUM]);
	});

	it('an engine that is sent no overrides behaves exactly as before', () => {
		const p = parseHubClip(mapClipText());
		expect(p.ok).toBe(true);
		if (!p.ok) return;
		expect('rulePackOverrides' in p.clip).toBe(false);
	});

	// THE TWO PRODUCERS, told apart by the PAIR and never by a marker.
	it('a rules-only clip parses instead of being refused', () => {
		const text = JSON.stringify({ sseClip: 1, source: { site: 'hub' }, nodes: [], rulePackOverrides: { liquids: [UNOBTAINIUM] } });
		const p = parseHubClip(text);
		expect(p.ok).toBe(true);
		if (!p.ok) return;
		expect(isRulesOnlyClip(p.clip)).toBe(true);
		expect(p.clip.root).toBeUndefined();
	});

	it('a map clip is never mistaken for a rules-only one', () => {
		const p = parseHubClip(mapClipText({ liquids: [UNOBTAINIUM] }));
		expect(p.ok).toBe(true);
		if (!p.ok) return;
		expect(isRulesOnlyClip(p.clip)).toBe(false);
	});

	it('a clip with neither objects nor rules is still refused', () => {
		const p = parseHubClip(JSON.stringify({ sseClip: 1, nodes: [] }));
		expect(p.ok).toBe(false);
		if (p.ok) return;
		expect(p.problem).toContain('no objects and no rules');
	});

	it('a clip that names a root but carries no nodes is refused, not merged in silence', () => {
		const p = parseHubClip(JSON.stringify({ sseClip: 1, root: 'a', nodes: [], rulePackOverrides: { liquids: [UNOBTAINIUM] } }));
		expect(p.ok).toBe(false);
	});

	// Job 1 is PARSING ONLY: a rules-only clip that reaches a paste path says so plainly rather
	// than half-doing it. Both paths, because the starmap offers both.
	it('a rules-only clip refuses the two node paste paths in plain words', () => {
		const p = parseHubClip(JSON.stringify({ sseClip: 1, nodes: [], rulePackOverrides: { liquids: [UNOBTAINIUM] } }));
		expect(p.ok).toBe(true);
		if (!p.ok) return;
		const sys = { id: 's', nodes: [{ id: 'host', kind: 'body', roleHint: 'star', name: 'Sun', parentId: null, massKg: 2e30 }] } as unknown as System;
		const into = insertClip(sys, p.clip, 'host', 0);
		expect(into.ok).toBe(false);
		if (!into.ok) expect(into.problem).toContain('rules, not objects');
		const asSystem = systemNodesFromClip(p.clip);
		expect(asSystem.ok).toBe(false);
		if (!asSystem.ok) expect(asSystem.problem).toContain('rules, not objects');
	});
});

describe('R-19 the third producer: this app own copy', () => {
	const system = {
		id: 's', nodes: [
			{ id: 'star', kind: 'body', roleHint: 'star', name: 'Sun', parentId: null, massKg: 2e30 },
			{ id: 'vex', kind: 'body', roleHint: 'planet', name: 'Vex', parentId: 'star', massKg: 6e24, hydrosphere: { composition: 'unobtainium', coverage: 0.4 } }
		]
	} as unknown as System;

	it('carries the campaign rules, so a body copied between campaigns keeps its liquid', () => {
		const clip = buildClip(system, 'vex', { rulePackOverrides: { liquids: [UNOBTAINIUM] } });
		expect(clip?.rulePackOverrides?.liquids).toEqual([UNOBTAINIUM]);
		expect(clip?.sseClip).toBe(CLIP_FORMAT);
	});

	it('says nothing when the campaign customises nothing', () => {
		const clip = buildClip(system, 'vex', {});
		expect(clip && 'rulePackOverrides' in clip).toBe(false);
	});
});

describe('R-19 the shape check', () => {
	it('drops a section this build cannot merge rather than carrying it', () => {
		// `tagVocab` is the real one: the hub flagged it in advance, it is on RulePack but not on
		// RulePackOverrides, and carrying it would be a promise the merge cannot keep.
		const kept = readClipOverrides({ liquids: [UNOBTAINIUM], tagVocab: { some: 'thing' } });
		expect(kept?.liquids).toEqual([UNOBTAINIUM]);
		expect((kept as any)?.tagVocab).toBeUndefined();
	});

	it('says nothing rather than {} when a section survives empty', () => {
		expect(readClipOverrides({ liquids: [] })).toBeUndefined();
		expect(readClipOverrides({ liquids: 'not a list' })).toBeUndefined();
		expect(readClipOverrides(null)).toBeUndefined();
		expect(readClipOverrides([UNOBTAINIUM])).toBeUndefined();
	});

	it('keeps a record with no id out of a list section, and cannot be poisoned by one', () => {
		const kept = readClipOverrides({ engineDefinitions: [{ id: 'x', name: 'X' }, { name: 'no id' }, 7, null] });
		expect(kept?.engineDefinitions).toEqual([{ id: 'x', name: 'X' }]);
	});

	it('accepts BOTH forms of a delta section, because both arrive', () => {
		expect(readClipOverrides({ morphologies: { entries: { flora: { opacity: 0.5 } } } })?.morphologies)
			.toEqual({ entries: { flora: { opacity: 0.5 } } });
		expect(readClipOverrides({ morphologies: [{ key: 'flora', opacity: 0.5 }] })?.morphologies)
			.toEqual([{ key: 'flora', opacity: 0.5 }]);
	});

	it('keeps only finite numbers in the scalar section', () => {
		const kept = readClipOverrides({ pigmentModel: { captureWeight: 2, tissueAbsorptance: NaN, note: 'hello' } });
		expect(kept?.pigmentModel).toEqual({ captureWeight: 2 });
	});
});

describe('R-19 the effective definitions a section describes', () => {
	it('a delta section reports the APPLIED record, not the edit', () => {
		const section = SECTIONS.find((s) => s.key === 'morphologies')!;
		const defs = effectiveDefinitions(section, { morphologies: { entries: { flora: { opacity: 0.25 } } } }, PACK);
		// The whole record, base plus the one changed field - which is the definition the app uses.
		expect(defs.get('flora')).toMatchObject({ key: 'flora', label: 'Flora', opacity: 0.25, pigmentDriven: 0.9 });
	});

	it('a delta names only what it changes, so untouched pack records are not reported as arriving', () => {
		const section = SECTIONS.find((s) => s.key === 'morphologies')!;
		const defs = effectiveDefinitions(section, { morphologies: { entries: { flora: { opacity: 0.25 } } } }, PACK);
		expect([...defs.keys()]).toEqual(['flora']);       // NOT 'microbial', which the GM never touched
	});

	it('the weighted section is identified one level down, at value.name', () => {
		const section = SECTIONS.find((s) => s.key === 'atmosphereCompositions')!;
		const defs = effectiveDefinitions(section, { atmosphereCompositions: [{ weight: 5, value: { name: 'Chlorine haze' } }] } as any, PACK);
		expect([...defs.keys()]).toEqual(['Chlorine haze']);
	});

	it('the scalar section is identified per FIELD, because one changed weight is one setting', () => {
		const section = SECTIONS.find((s) => s.key === 'pigmentModel')!;
		const defs = effectiveDefinitions(section, { pigmentModel: { captureWeight: 2, steadinessWeight: 1 } } as any, PACK);
		expect([...defs.keys()].sort()).toEqual(['captureWeight', 'steadinessWeight']);
	});
});

describe('R-19 saying what is in hand', () => {
	it('counts in the app voice, singular and plural', () => {
		expect(describeOverrides({ liquids: [UNOBTAINIUM] }, PACK)).toBe('a liquid');
		expect(describeOverrides({ engineDefinitions: [{ id: 'a' }, { id: 'b' }] } as any, PACK)).toBe('2 engine definitions');
	});

	it('joins sections the way a person would', () => {
		const phrase = describeOverrides(
			{ liquids: [UNOBTAINIUM, { name: 'quicksilver', label: 'Quicksilver', meltK: 234, boilK: 630 }], engineDefinitions: [{ id: 'a' }] } as any,
			PACK
		);
		expect(phrase).toBe('an engine definition and 2 liquids');
	});

	it('says nothing at all when there is nothing to say', () => {
		expect(describeOverrides(undefined, PACK)).toBe('');
	});
});
