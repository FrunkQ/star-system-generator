// R-07: WHICH picture represents a campaign when it is shared.
//
// The hub guesses today - map background, then any player graphic, then the first body picture - and
// a guess is right often enough to be irritating when it is wrong, because the creator can see a
// better shot sitting in the same list. `coverAssetId` is the creator saying which.
//
// It is a POINTER, not a picture, and that is the whole design: the graphics already ride in the
// bundle as real files, already carry credit/licence/source, and already appear in ATTRIBUTIONS.md.
// A separate cover image would duplicate all four and hand the sharing gate a second thing to check.
//
// GATE DISCIPLINE (PHY-34): the anchors are absolute - a literal id, and the ABSENCE of a key rather
// than a falsy value - because "absent means the creator has not chosen" and "present but empty" are
// different statements to a reader that has to decide whether to fall back to guessing.
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { starmapStore } from '$lib/starmapStore';
import { setCoverAsset, coverAssetId, deleteAsset } from './presetStore';

function campaignWithAssets(): any {
	return {
		id: 'starmap-cover',
		name: 'Cover Test',
		routes: [],
		systems: [],
		playerAssets: [
			{ id: 'asset-sector-map', name: 'Sector map', dataUrl: 'data:image/png;base64,AAA' },
			{ id: 'asset-beauty-shot', name: 'Beauty shot', dataUrl: 'data:image/png;base64,BBB' }
		]
	};
}

beforeEach(() => starmapStore.set(campaignWithAssets()));

describe('R-07: the creator chooses the cover', () => {
	it('starts absent, because nobody has chosen', () => {
		expect(get(coverAssetId)).toBe(null);
		expect('coverAssetId' in (get(starmapStore) as any)).toBe(false);
	});

	it('records the chosen graphic by id', () => {
		setCoverAsset('asset-beauty-shot');
		expect(get(coverAssetId)).toBe('asset-beauty-shot');
		expect((get(starmapStore) as any).coverAssetId).toBe('asset-beauty-shot');
	});

	it('clears by REMOVING the key, not by emptying it', () => {
		// A reader falls back to guessing when the creator has not chosen. `coverAssetId: ''` or
		// `null` is present-but-meaningless, and a consumer that tests for presence would follow a
		// pointer to nowhere instead of guessing.
		setCoverAsset('asset-beauty-shot');
		setCoverAsset('asset-beauty-shot'); // the control is a toggle
		expect(get(coverAssetId)).toBe(null);
		expect('coverAssetId' in (get(starmapStore) as any)).toBe(false);

		setCoverAsset('asset-beauty-shot');
		setCoverAsset(null);
		expect('coverAssetId' in (get(starmapStore) as any)).toBe(false);
	});

	it('refuses a graphic the campaign does not carry', () => {
		setCoverAsset('asset-does-not-exist');
		expect(get(coverAssetId)).toBe(null);
	});

	it('refuses a BUILT-IN starter graphic even when the file claims to carry one', () => {
		// The starters live on a static path and are deliberately NOT extracted into the bundle
		// (hubFixture.spec pins that). A cover pointing at one would name a file the archive does
		// not contain - and would put this app's own logo on somebody else's map page.
		//
		// THIS TEST WAS BLIND FIRST TIME ROUND and it is worth saying why: with the built-in listed
		// only in BUILTIN_ASSETS, the "must be one of this campaign's own graphics" rule already
		// refused it, so removing the built-in guard changed nothing and the test still passed. The
		// case that needs the guard is a save where a built-in id HAS got into `playerAssets` - and
		// a plain .json save is a file GMs hand-edit and diff, so that is ordinary input rather than
		// a hypothetical.
		starmapStore.update((sm: any) => ({
			...sm,
			playerAssets: [...sm.playerAssets, { id: 'builtin-sse-logo', name: 'SSE', dataUrl: '/images/logo/SSE.png' }]
		}));
		setCoverAsset('builtin-sse-logo');
		expect(get(coverAssetId)).toBe(null);
		expect('coverAssetId' in (get(starmapStore) as any)).toBe(false);
	});

	it('refuses a built-in that is only in the shipped list, by the same rule', () => {
		setCoverAsset('builtin-sse-logo');
		expect(get(coverAssetId)).toBe(null);
	});

	it('drops the cover when the picture it pointed at is deleted', () => {
		// A pointer to a deleted picture is worse than no pointer: a reader follows it, finds
		// nothing, and has to guess anyway - having first been told not to.
		setCoverAsset('asset-beauty-shot');
		deleteAsset('asset-beauty-shot');
		expect(get(coverAssetId)).toBe(null);
		expect('coverAssetId' in (get(starmapStore) as any)).toBe(false);
	});

	it('leaves the cover alone when a DIFFERENT picture is deleted', () => {
		setCoverAsset('asset-beauty-shot');
		deleteAsset('asset-sector-map');
		expect(get(coverAssetId)).toBe('asset-beauty-shot');
	});
});
