import { describe, it, expect } from 'vitest';
import { makeListDelta, applyListDelta, type PackListDelta } from './rulepackDelta';

interface Item { key: string; label: string; n: number; list?: string[] }
const K = (i: Item) => i.key;
const BASE: Item[] = [
	{ key: 'a', label: 'Alpha', n: 1, list: ['x'] },
	{ key: 'b', label: 'Beta', n: 2 },
	{ key: 'c', label: 'Gamma', n: 3 }
];
const clone = () => JSON.parse(JSON.stringify(BASE)) as Item[];
const roundTrip = (edited: Item[]) => applyListDelta(BASE, makeListDelta(BASE, edited, K), K);

describe('an override stores what changed and nothing else', () => {
	it('stores NOTHING when nothing changed', () => {
		expect(makeListDelta(BASE, clone(), K)).toBeUndefined();
	});

	it('stores one field of one entry when that is all that moved', () => {
		const edited = clone();
		edited[2].n = 99;
		const delta = makeListDelta(BASE, edited, K)!;
		expect(delta.order).toBeUndefined();               // order untouched, so not stored
		expect(Object.keys(delta.entries!)).toEqual(['c']); // only the entry that changed
		expect(delta.entries!.c).toEqual({ n: 99 });        // only the field that changed
		// And it is a fraction of the size of storing the list.
		expect(JSON.stringify(delta).length).toBeLessThan(JSON.stringify(BASE).length / 2);
	});

	it('rebuilds the same list it was given', () => {
		const edited = clone();
		edited[0].label = 'Renamed';
		edited[1].n = 7;
		expect(roundTrip(edited)).toEqual(edited);
	});
});

describe('the delta keeps tracking the pack for everything untouched', () => {
	it('picks up a later change to a field the GM never edited', () => {
		// THE REASON FOR ALL OF THIS. Storing the whole list freezes the defaults at the moment of the
		// edit, and every later improvement to the shipped pack stops reaching that campaign silently.
		const edited = clone();
		edited[2].n = 99;                                   // the GM touches ONE number
		const delta = makeListDelta(BASE, edited, K)!;
		const improvedPack: Item[] = JSON.parse(JSON.stringify(BASE));
		improvedPack[2].label = 'Gamma, improved';          // the pack changes something else later
		const out = applyListDelta(improvedPack, delta, K);
		expect(out[2].n).toBe(99);                          // the GM's edit survives…
		expect(out[2].label).toBe('Gamma, improved');       // …and the improvement reaches them
	});
});

describe('order, additions and deletions', () => {
	it('stores the order only when it moved, and restores it', () => {
		const edited = [clone()[2], clone()[0], clone()[1]];
		const delta = makeListDelta(BASE, edited, K)!;
		expect(delta.order).toEqual(['c', 'a', 'b']);
		expect(delta.entries).toBeUndefined();              // nothing else changed
		expect(applyListDelta(BASE, delta, K).map(K)).toEqual(['c', 'a', 'b']);
	});

	it('carries a wholly new entry in full', () => {
		const edited = [...clone(), { key: 'd', label: 'Delta', n: 4 }];
		const delta = makeListDelta(BASE, edited, K)!;
		expect(delta.entries!.d).toEqual({ key: 'd', label: 'Delta', n: 4 });
		expect(applyListDelta(BASE, delta, K).map(K)).toEqual(['a', 'b', 'c', 'd']);
	});

	it('expresses a DELETION through the order list', () => {
		const edited = clone().filter((i) => i.key !== 'b');
		const delta = makeListDelta(BASE, edited, K)!;
		expect(delta.order).toEqual(['a', 'c']);
		expect(applyListDelta(BASE, delta, K).map(K)).toEqual(['a', 'c']);
	});

	it('records a field the GM removed, so the merge does not put it back', () => {
		const edited = clone();
		delete edited[0].list;
		const out = roundTrip(edited);
		expect('list' in out[0]).toBe(false);
	});
});

describe('back-compatibility', () => {
	it('still honours an override saved as a whole list', () => {
		// Campaigns saved before this existed carry the full edited list. It is a complete answer,
		// just a wasteful one, and it must keep working until the GM next saves that editor.
		const whole: Item[] = [{ key: 'a', label: 'Old style', n: 42 }];
		expect(applyListDelta(BASE, whole as unknown as PackListDelta<Item>, K)).toEqual(whole);
	});

	it('falls back to the pack when the override is empty or missing', () => {
		expect(applyListDelta(BASE, undefined, K)).toEqual(BASE);
		expect(applyListDelta(BASE, [] as unknown as PackListDelta<Item>, K)).toEqual(BASE);
	});
});
