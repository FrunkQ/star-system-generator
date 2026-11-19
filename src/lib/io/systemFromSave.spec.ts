// ONE ANSWER TO "WHAT SYSTEM IS IN THIS SAVE?" for every door that places one (R-18, Stream AA job 3):
// the wizard's file picker, the wizard's Explorers list, and an "Add System to SSE" link.
import { describe, it, expect } from 'vitest';
import { systemFromSave } from './systemFromSave';
import type { ClassifiedSaveFile } from './classify';
import type { RulePack } from '$lib/types';

const pack = { id: 'test', version: '1' } as unknown as RulePack;
const star = (id: string) => ({ id, name: id, kind: 'body', roleHint: 'star', parentId: null });

describe('systemFromSave', () => {
	it('takes a single system as it is, fixed up and not processed', async () => {
		const classified: ClassifiedSaveFile = { kind: 'system', container: 'json', doc: { id: 'tau', name: 'Tau Ceti', nodes: [star('a')], isManuallyEdited: true } };
		const got = await systemFromSave(classified, pack);
		expect(got.ok).toBe(true);
		if (!got.ok) return;
		expect(got.system.name).toBe('Tau Ceti');
		// The fix-up ran: `isManuallyEdited` is deleted on load (G37), so its absence is the proof.
		expect((got.system as any).isManuallyEdited).toBeUndefined();
	});

	it("takes a campaign's FIRST system, as the wizard always has (G42)", async () => {
		const classified: ClassifiedSaveFile = {
			kind: 'starmap', container: 'json',
			doc: { systems: [{ id: 's1', system: { id: 'one', name: 'One', nodes: [star('a')] } }, { id: 's2', system: { id: 'two', name: 'Two', nodes: [star('b')] } }], routes: [] }
		};
		const got = await systemFromSave(classified, pack);
		expect(got.ok && got.system.name).toBe('One');
	});

	it('says, in words, when there is nothing it can place', async () => {
		const notASave = await systemFromSave({ kind: 'unknown', container: 'json', problem: 'Not JSON.' }, pack);
		expect(!notASave.ok && notASave.problem).toMatch(/not a Star System Explorer save[\s\S]*Not JSON\./);
		const emptyCampaign = await systemFromSave({ kind: 'starmap', container: 'json', doc: { systems: [], routes: [] } }, pack);
		expect(!emptyCampaign.ok && emptyCampaign.problem).toMatch(/no loadable system/);
	});
});
