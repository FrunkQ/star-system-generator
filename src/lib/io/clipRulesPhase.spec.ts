// R-19 — THE GATE THAT IS THE DIFFERENCE BETWEEN THE FIX AND THE BUG.
//
// It is not enough that the pasted body keeps the WORD "unobtainium" in its hydrosphere. It kept that
// before R-19 too. The bug was that the word resolved to nothing, so `liquidDef` returned undefined
// and everything downstream fell back to a default while the paste reported success.
//
// So this asserts the PHASE, and it is deliberately arranged so the failure mode is not a near miss:
//
//   `phaseAtP` returns 'liquid' for an UNKNOWN substance - "unknown, do not over-constrain"
//   (`liquids.ts`). A body at 150 K whose ocean boils at 90 K should read GAS. Without the merge it
//   reads LIQUID, which is both wrong and the exact shape of the original fault: a plausible answer,
//   silently produced, that nobody would look at twice.
//
// The assertion is therefore ABSOLUTE - an equality against a named phase, not a ratio or a
// tolerance - which is what engine-map PHY-34 asks of a gate.
//
// RED-FIRST, checked 2026-09-08: comment out the `mergeClipOverrides` call and both phase gates fail
// with 'liquid', which is precisely the bug being closed.
import { describe, it, expect } from 'vitest';
import { buildClip, parseHubClip } from './hubClip';
import { mergeClipOverrides } from './clipRules';
import { buildEffectiveRulePack } from '$lib/rulepack/effectivePack';
import { phaseAtP, liquidDef } from '$lib/physics/liquids';
import type { RulePack, System } from '$lib/types';

/** Unobtainium is liquid only between 20 K and 90 K, so 150 K is gas and 10 K is solid. */
const UNOBTAINIUM = { name: 'unobtainium', label: 'Liquid Unobtainium', meltK: 20, boilK: 90, colorHex: '#7fd4c1' };

/** The DESTINATION campaign's pack. It has never heard of unobtainium. */
const PACK = {
	id: 'test', version: '1',
	liquids: [{ name: 'water', label: 'Water', meltK: 273.15, boilK: 373.15 }]
} as unknown as RulePack;

/** The SOURCE campaign: one star, one planet whose ocean is the custom liquid. */
function sourceSystem(tempK: number): System {
	return {
		id: 'src', nodes: [
			{ id: 'star', kind: 'body', roleHint: 'star', name: 'Home', parentId: null, massKg: 2e30 },
			{
				id: 'bellwether', kind: 'body', roleHint: 'planet', name: 'Bellwether', parentId: 'star',
				massKg: 6e24, temperatureK: tempK,
				hydrosphere: { composition: 'unobtainium', coverage: 0.6 }
			}
		]
	} as unknown as System;
}

/** Copy the planet out of the source campaign and paste it into a fresh one. */
function copyAcross(tempK: number) {
	const clipObj = buildClip(sourceSystem(tempK), 'bellwether', {
		rulePackOverrides: { liquids: [UNOBTAINIUM] } as any
	})!;
	// Through the real envelope, as a clipboard round trip - not the in-memory object.
	const parsed = parseHubClip(JSON.stringify(clipObj));
	if (!parsed.ok) throw new Error(parsed.problem);
	const clip = parsed.clip;

	// A FRESH CAMPAIGN: no overrides at all.
	const merged = mergeClipOverrides(clip.rulePackOverrides, undefined, PACK, { sourceLabel: 'Home' });
	const effective = buildEffectiveRulePack(PACK, merged.overrides);
	const body: any = clip.nodes.find((n: any) => n.id === 'bellwether');
	return { merged, effective, body };
}

describe('R-19 a body with a custom liquid arrives with its PHYSICS, not just its label', () => {
	it('the definition is reachable through the lookup that used to miss', () => {
		const { effective } = copyAcross(150);
		expect(liquidDef('unobtainium', effective)).toMatchObject({ meltK: 20, boilK: 90 });
	});

	it('ABOVE its boiling point the ocean reads GAS - it read LIQUID with the bug', () => {
		const { effective, body } = copyAcross(150);
		expect(phaseAtP(body.hydrosphere.composition, 150, undefined, effective)).toBe('gas');
		// and this is what the same call answered before the merge, on the destination's own pack:
		expect(phaseAtP(body.hydrosphere.composition, 150, undefined, PACK)).toBe('liquid');
	});

	it('BELOW its melting point the ocean reads SOLID - it read LIQUID with the bug', () => {
		const { effective, body } = copyAcross(10);
		expect(phaseAtP(body.hydrosphere.composition, 10, undefined, effective)).toBe('solid');
		expect(phaseAtP(body.hydrosphere.composition, 10, undefined, PACK)).toBe('liquid');
	});

	it('and between them it reads LIQUID for the right reason rather than by default', () => {
		const { effective, body } = copyAcross(60);
		expect(phaseAtP(body.hydrosphere.composition, 60, undefined, effective)).toBe('liquid');
		// The reason matters: the definition is present, so this is a derivation and not a fallback.
		expect(liquidDef(body.hydrosphere.composition, effective)).toBeTruthy();
	});

	it('the campaign that received it now carries the liquid as a DELTA, tracking the pack', () => {
		const { merged } = copyAcross(60);
		const written: any = (merged.overrides as any).liquids;
		expect(Array.isArray(written)).toBe(false);
		expect(Object.keys(written.entries)).toEqual(['unobtainium']);
	});

	it('pasting the same body a second time changes nothing at all', () => {
		const { merged } = copyAcross(60);
		const clipObj = buildClip(sourceSystem(60), 'bellwether', { rulePackOverrides: { liquids: [UNOBTAINIUM] } as any })!;
		const again = mergeClipOverrides(clipObj.rulePackOverrides, merged.overrides, PACK, { sourceLabel: 'Home' });
		expect(again.changed).toBe(false);
		expect(again.renamed).toEqual([]);
		expect(again.overrides).toEqual(merged.overrides);
	});
});
