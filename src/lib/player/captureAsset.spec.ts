// R-07: A CAPTURED VIEW IS THE CREATOR'S OWN WORK, AND THE FILE CARRIES THE CREDITS.
//
// The owner's rule, 2026-09-01: "a screenshot represents the FILE and the FILE has the attributions
// - so anything that COULD be credited is, even if accidentally caught in shot."
//
// That settles a question this stream first got backwards. The worry was laundering: a shot of a map
// using CC-BY art would be a new image with no provenance, looking cleaner than the art inside it.
// It does not hold, because a capture travels INSIDE the same bundle as ATTRIBUTIONS.md - the file
// is what gets distributed, and the file credits its own contents.
//
// The real consequence runs the other way, and it is the one that would have bitten a GM. The public
// sharing gate is `missing.length === 0`. An asset with no credit, no licence and no source counts
// toward `missing`. So a GM who captured a beauty shot of their OWN map would have been told they
// could not publish it - blocked by their own screenshot.
import { describe, it, expect } from 'vitest';
import { collectAttributions, renderAttributions } from '$lib/io/attributions';

const withPlayerAsset = (a: any) => ({
	name: 'Cap',
	systems: [],
	playerAssets: [a]
});

const IMG = 'assets/images/player/asset-x.png';

describe('R-07: a captured view does not read as an uncredited upload', () => {
	it('does NOT count toward the missing-provenance gate', () => {
		const entries = collectAttributions(
			withPlayerAsset({ id: 'asset-x', name: 'Beauty shot', dataUrl: IMG, capturedInApp: true })
		);
		expect(entries.length).toBe(1);
		// The gate the hub computes: `missing.length === 0`.
		const missing = entries.filter((e) => !e.capturedInApp && !e.credit && !e.license && !e.sourceUrl);
		expect(missing.length).toBe(0);
	});

	it('DOES count when it is an ordinary upload with nothing recorded', () => {
		// The other direction, so the rule above is a distinction and not a blanket exemption.
		const entries = collectAttributions(
			withPlayerAsset({ id: 'asset-x', name: 'Someone else art', dataUrl: IMG })
		);
		const missing = entries.filter((e) => !e.capturedInApp && !e.credit && !e.license && !e.sourceUrl);
		expect(missing.length).toBe(1);
	});

	it('says what it is in ATTRIBUTIONS.md, rather than claiming nothing is recorded', () => {
		const md = renderAttributions(
			collectAttributions(
				withPlayerAsset({ id: 'asset-x', name: 'Beauty shot', dataUrl: IMG, capturedInApp: true })
			),
			'starmap.json'
		);
		expect(md).toContain('Captured in Star System Explorer from this save');
		expect(md).not.toContain('_No provenance recorded._');
		// And the file must not warn about assets with no provenance, because there are none.
		expect(md).not.toMatch(/have no provenance recorded at all/);
	});

	it('still reports a genuine gap in the same file', () => {
		const md = renderAttributions(
			collectAttributions({
				name: 'Cap',
				systems: [],
				playerAssets: [
					{ id: 'asset-a', name: 'Shot', dataUrl: 'assets/images/player/asset-a.png', capturedInApp: true },
					{ id: 'asset-b', name: 'Downloaded', dataUrl: 'assets/images/player/asset-b.png' }
				]
			}),
			'starmap.json'
		);
		expect(md).toContain('Captured in Star System Explorer from this save');
		expect(md).toContain('_No provenance recorded._');
		expect(md).toMatch(/1 asset has no provenance recorded at all/);
	});

	it('a CAPTURE THAT CLAIMS CC-BY WITHOUT A CREDIT is still called out', () => {
		// `capturedInApp` excuses an ABSENCE of provenance. It does not excuse a licence claim that
		// names an obligation and then fails to meet it - that is wrong whoever made the picture.
		const md = renderAttributions(
			collectAttributions(
				withPlayerAsset({ id: 'asset-x', name: 'Shot', dataUrl: IMG, capturedInApp: true, license: 'CC BY 4.0' })
			),
			'starmap.json'
		);
		expect(md).toContain('the author must be named');
	});

	it('keeps a credit the creator chose to add anyway', () => {
		const entries = collectAttributions(
			withPlayerAsset({ id: 'asset-x', name: 'Shot', dataUrl: IMG, capturedInApp: true, credit: 'The GM' })
		);
		expect(entries[0].credit).toBe('The GM');
		expect(entries[0].capturedInApp).toBe(true);
	});
});
