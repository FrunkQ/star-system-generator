// R-12 (the revision counter) and R-10 (the export-mode label).
//
// R-12 IS THE ONE THAT PREVENTS REAL DATA LOSS. A creator uploads their campaign; weeks later they
// find an older export in Downloads and upload it as an update; the hub replaces every row and the
// newer version is gone. Nothing in a save said which of two files was newer - verified across two
// real exports of one map nine months apart: same id, 42/42 shared system ids, no serial of any
// kind. This counter is what lets the hub ask before it destroys work.
//
// THE INVARIANT UNDER TEST is not "the number goes up" but "the number in the FILE is the number
// the CAMPAIGN now holds". A save that incremented on the way out while the store kept the old
// value would pass a naive going-up test and still write the same revision twice.
//
// GATE DISCIPLINE (PHY-34): the anchors here are absolute - literal 1, 2, 3 rather than "one more
// than last time" - because a relative assertion cannot see a counter that advances the export and
// not the campaign, which is exactly the fault this field exists to avoid.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { nextRevision, stampForSave, exportModeFromChoice } from './provenance';
import { plainSaveJson } from '$lib/io/bundle';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** What the app's two campaign-save paths do: advance the LIVE campaign, then export from it. */
const advanceRevision = <T extends { revision?: number }>(map: T): T => ({ ...map, revision: nextRevision(map) });

describe('R-12: a save says which of two copies is newer', () => {
	it('starts at 1 for a campaign that has never been saved', () => {
		expect(nextRevision({})).toBe(1);
		expect(nextRevision({ appVersion: '3.0.244' })).toBe(1);
	});

	it('treats a save written BEFORE this field existed as never-saved, not as an error', () => {
		// Every campaign in existence on the day this shipped has no revision. The first explicit
		// save of one writes 1, and it counts up honestly from there.
		const legacy: any = { id: 'starmap-old', name: 'Old', appVersion: '2.1.692-beta' };
		expect(nextRevision(legacy)).toBe(1);
	});

	it('ACCEPTANCE: two consecutive explicit saves differ by exactly +1', () => {
		// The campaign as it lives in the store, saved twice with an edit in between.
		let campaign: any = { id: 'starmap-a', name: 'A', systems: [], routes: [] };

		campaign = advanceRevision(campaign);
		const first = JSON.parse(plainSaveJson(stampForSave(campaign, { exportMode: 'gm' })));

		campaign = { ...campaign, name: 'A, edited' };

		campaign = advanceRevision(campaign);
		const second = JSON.parse(plainSaveJson(stampForSave(campaign, { exportMode: 'gm' })));

		// ABSOLUTE, not relative: a counter that advanced the export but not the campaign would
		// write 1 twice and a "second > first" assertion would be the only thing to notice.
		expect(first.revision).toBe(1);
		expect(second.revision).toBe(2);
		expect(second.revision - first.revision).toBe(1);
	});

	it('THE INVARIANT: the revision in the file is the one the campaign now holds', () => {
		let campaign: any = { id: 'starmap-b', name: 'B', revision: 6 };
		campaign = advanceRevision(campaign);
		const file = JSON.parse(plainSaveJson(stampForSave(campaign)));
		expect(campaign.revision).toBe(7); // the live campaign advanced...
		expect(file.revision).toBe(7); // ...and the file says the same thing
	});

	it('keeps counting across a save, a reload and another save', () => {
		let campaign: any = { id: 'starmap-c', name: 'C' };
		campaign = advanceRevision(campaign);
		const saved = JSON.parse(plainSaveJson(stampForSave(campaign)));
		// A reload reads the file back as the campaign - unknown top-level fields survive.
		const reopened = { ...saved };
		const next = advanceRevision(reopened);
		expect(saved.revision).toBe(1);
		expect(next.revision).toBe(2);
	});

	it('is advanced ON THE LIVE CAMPAIGN by each save path that writes new work', () => {
		// Testing the arithmetic is not enough: this failed red-first with `nextRevision` perfect
		// and the campaign save reading the store WITHOUT writing the advanced copy back. The file
		// would then claim a revision the campaign never held, and the next save would claim it
		// again - which is the exact fault the counter exists to prevent, silently.
		const src = readFileSync(join(SRC, 'routes/+page.svelte'), 'utf-8');
		const bodyOf = (name: string) => {
			const start = src.indexOf(`function ${name}(`);
			expect(start, `${name} is gone - did the save path move?`).toBeGreaterThan(-1);
			const rest = src.slice(start);
			const end = rest.slice(1).search(/\n {2}(?:async )?function /);
			return end < 0 ? rest : rest.slice(0, end + 1);
		};

		// The ordinary campaign save: advance, and put it back in the store so the reactive
		// autosave persists it.
		const download = bodyOf('handleDownloadStarmap');
		expect(download.includes('advanceRevision('), 'the campaign save no longer advances the revision').toBe(true);
		expect(
			download.includes('starmapStore.set('),
			'the campaign save advances the revision but never writes it back - the file and the campaign will disagree'
		).toBe(true);

		// The crash file: advance, and persist STRAIGHT to storage. It must not touch the store.
		const crash = bodyOf('writeCrashSave');
		expect(crash.includes('advanceRevision('), 'the crash save no longer advances the revision').toBe(true);
		expect(
			crash.includes('enqueueStarmapPersist('),
			'the crash save advances the revision but never persists it'
		).toBe(true);
		expect(
			crash.includes('starmapStore.set('),
			'the crash save must NOT set the store - that fires the rebuild P3 exists to avoid, at 3 GB of heap'
		).toBe(false);

		// THE DELIBERATE EXCEPTION, pinned so it stays deliberate: the safe-mode escape hatch dumps
		// the STORED campaign unchanged. It is existing work, not new work, and claiming a newer
		// revision for it would be a lie.
		expect(
			bodyOf('downloadStoredStarmap').includes('advanceRevision('),
			'the recovery export must NOT advance the revision - it is a dump, not a new save'
		).toBe(false);
	});

	it('reads a nonsense value as never-saved rather than propagating it', () => {
		// The plain .json save is a file GMs hand-edit, so any of these can arrive.
		for (const bad of [undefined, null, NaN, Infinity, -1, 'seven', {}]) {
			expect(nextRevision({ revision: bad } as any)).toBe(1);
		}
		// A fractional value is floored rather than discarded - the GM's intent is still legible.
		expect(nextRevision({ revision: 4.7 } as any)).toBe(5);
	});
});

describe('R-10: the export mode is a label, and never a gate', () => {
	it('records the choice the GM already made, both ways', () => {
		expect(stampForSave({}, { exportMode: 'player' }).exportMode).toBe('player');
		expect(stampForSave({}, { exportMode: 'gm' }).exportMode).toBe('gm');
	});

	it('translates the Save modal choice in ONE direction-checked place', () => {
		// The modal speaks 'GM' | 'Player'; the file speaks 'gm' | 'player'. Getting this backwards
		// labels a GM export `player`, which is the mislabel that leaks a campaign - so both
		// directions are pinned absolutely rather than one being inferred from the other.
		expect(exportModeFromChoice('Player')).toBe('player');
		expect(exportModeFromChoice('GM')).toBe('gm');
	});

	it('is taken from the GM CHOICE at the only save that offers one', () => {
		// Testing the translation is not enough: this failed red-first with the translation correct
		// and the call site passing a hard-coded 'gm', which is precisely the leak. The system save
		// is the ONLY export with a Player radio, so it is the only one whose label can be wrong.
		const src = readFileSync(join(SRC, 'lib/components/SystemView.svelte'), 'utf-8');
		const call = src.split('\n').find((l) => l.includes('stampForSave(') && !l.trim().startsWith('//'));
		expect(call, 'the system save no longer stamps at all').toBeTruthy();
		expect(
			call!.includes('exportModeFromChoice(mode)'),
			`the system save must label from the GM's own choice, not a literal:\n${call}`
		).toBe(true);
	});

	it('defaults to gm, which is the SAFE direction', () => {
		// A player export mislabelled `gm` is merely over-cautious. A GM export mislabelled
		// `player` is the one that leaks a campaign, so the default must never be `player`.
		expect(stampForSave({}).exportMode).toBe('gm');
		expect(stampForSave({}).exportMode).not.toBe('player');
	});

	it('is written into the file beside the build stamp', () => {
		const file = JSON.parse(plainSaveJson(stampForSave({ id: 'x', name: 'X' }, { exportMode: 'player' })));
		expect(file.exportMode).toBe('player');
		expect(typeof file.appVersion).toBe('string');
	});

	it('is never read back as a decision anywhere in the app', () => {
		// THE CRITICAL RULE. The stamp arrives inside a file a stranger uploaded, so it is a claim.
		// This app writes it and must never branch on it; if it ever needs to know which tree a
		// file holds, it must detect that from the content. A consumer doing otherwise inherits
		// whatever the file asserts.
		// `provenance.ts` is excluded because it is the WRITER: `opts.exportMode ?? 'gm'` is its own
		// caller-supplied option defaulting, not a read of anything a file claimed. Everywhere else
		// the field may only ever be WRITTEN, as a property of the options object.
		const offenders: string[] = [];
		for (const rel of [
			'routes/+page.svelte',
			'lib/components/SystemView.svelte',
			'lib/io/bundle.ts',
			'lib/io/classify.ts'
		]) {
			const src = readFileSync(join(SRC, rel), 'utf-8');
			for (const line of src.split('\n')) {
				const code = line.split('//')[0];
				if (!code.includes('exportMode')) continue;
				if (/^\s*import\s/.test(code)) continue; // naming the translator is not reading a claim
				// A WRITE names the value on the spot, or asks the one translator for it. Anything
				// that compares it, defaults it or branches on it is reading a claim that arrived
				// inside somebody else's file.
				if (!/exportMode:\s*(?:'gm'|'player'|exportModeFromChoice\()/.test(code)) {
					offenders.push(`${rel}: ${line.trim()}`);
				}
			}
		}
		expect(offenders, `exportMode is being read as a decision:\n${offenders.join('\n')}`).toEqual([]);
	});
});
