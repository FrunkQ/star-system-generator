// ONE LIST RULE, FOR EVERY "WHICH BODY?" IN THE APP.
//
// Owner, 2026-08-26: the pickers want "a proper Earth / Moon / construct hierarchy", type toggles,
// the current home left out, and "ONE interface for the user to learn".
import { describe, it, expect } from 'vitest';
import { buildPickerRows, buildCategoryChips } from './bodyPickerList';

// Sol > Earth > (Luna > Lunar Gateway), ISS ; Sol > Mars.
const NODES = [
	{ id: 'sol', name: 'Sol', kind: 'body', parentId: null, roleHint: 'star' },
	{ id: 'earth', name: 'Earth', kind: 'body', parentId: 'sol' },
	{ id: 'luna', name: 'Luna', kind: 'body', parentId: 'earth', roleHint: 'moon' },
	{ id: 'gateway', name: 'Lunar Gateway', kind: 'construct', parentId: 'luna' },
	{ id: 'iss', name: 'ISS', kind: 'construct', parentId: 'earth' },
	{ id: 'mars', name: 'Mars', kind: 'body', parentId: 'sol' },
	{ id: 'ring', name: 'Debris Ring', kind: 'ring', parentId: 'sol' }
];

const categorize = (n: any): string[] => {
	if (n.kind === 'construct') return ['Constructs'];
	if (n.roleHint === 'star') return ['Stars'];
	if (n.roleHint === 'moon') return ['Moons'];
	if (n.kind === 'body') return ['Planets'];
	return ['Other'];
};

const ids = (rows: any[]) => rows.map((r) => r.node.id);
const shape = (rows: any[]) => rows.map((r) => `${'  '.repeat(r.depth)}${r.node.id}${r.context ? ' (context)' : ''}`);

describe('browsing shows where a thing IS, not just what it is', () => {
	it('nests children under their parents', () => {
		const rows = buildPickerRows({ nodes: NODES, categorize });
		expect(shape(rows)).toEqual([
			'sol',
			'  earth',
			'    iss',
			'    luna',
			'      gateway',
			'  mars'
		]);
	});

	it('a kind the picker does not offer is left out entirely', () => {
		// Rings are not a destination in this configuration, and nothing depends on them, so the row
		// simply is not there - as against being shown greyed, which would imply it could be picked.
		const rows = buildPickerRows({ nodes: NODES, categorize });
		expect(ids(rows)).not.toContain('ring');
	});
});

describe('type toggles narrow WITHOUT orphaning what survives', () => {
	it('filtering to constructs keeps the parents that place them, as context', () => {
		// The thing a flat filter gets wrong: a bare "ISS, Lunar Gateway" tells you nothing about
		// where either is. The parents stay, marked unselectable.
		const rows = buildPickerRows({ nodes: NODES, categorize, activeCategories: ['Constructs'] });
		expect(shape(rows)).toEqual([
			'sol (context)',
			'  earth (context)',
			'    iss',
			'    luna (context)',
			'      gateway'
		]);
		expect(ids(rows)).not.toContain('mars');
	});

	it('several toggles are an OR, not an AND', () => {
		const rows = buildPickerRows({ nodes: NODES, categorize, activeCategories: ['Moons', 'Planets'] });
		const pickable = rows.filter((r) => !r.context).map((r) => r.node.id);
		expect(pickable.sort()).toEqual(['earth', 'luna', 'mars']);
	});

	it('no toggles means everything, not nothing', () => {
		const all = buildPickerRows({ nodes: NODES, categorize, activeCategories: [] });
		expect(all.filter((r) => !r.context).length).toBe(6);
	});
});

describe('the origin is not a destination', () => {
	it('an excluded node disappears, and stays as context if it holds something', () => {
		// A ship at Earth should not be offered Earth. Its moon and its station are still fair game,
		// so Earth stays on screen to say where they are.
		const rows = buildPickerRows({ nodes: NODES, categorize, excludeIds: ['earth'] });
		expect(rows.find((r) => r.node.id === 'earth')?.context).toBe(true);
		expect(ids(rows)).toContain('luna');
		expect(ids(rows)).toContain('iss');
	});

	it('an excluded LEAF disappears completely', () => {
		const rows = buildPickerRows({ nodes: NODES, categorize, excludeIds: ['mars'] });
		expect(ids(rows)).not.toContain('mars');
	});

	it('search cannot hand back what exclusion ruled out', () => {
		// The trap: filters applied to the browse list but not the search box, so typing the name
		// gets you the thing the caller said was not available.
		const rows = buildPickerRows({ nodes: NODES, categorize, excludeIds: ['mars'], query: 'mar' });
		expect(rows.length).toBe(0);
	});
});

describe('typing is a search, and a search is flat', () => {
	it('matches by name at depth zero, wherever they live', () => {
		const rows = buildPickerRows({ nodes: NODES, categorize, query: 'lun' });
		expect(ids(rows).sort()).toEqual(['gateway', 'luna']);
		expect(rows.every((r) => r.depth === 0)).toBe(true);
		expect(rows.every((r) => !r.context)).toBe(true);
	});

	it('is case-insensitive and honours the type toggles', () => {
		const rows = buildPickerRows({ nodes: NODES, categorize, query: 'LUN', activeCategories: ['Constructs'] });
		expect(ids(rows)).toEqual(['gateway']);
	});

	it('is capped, so a huge system cannot flood the list', () => {
		const many = Array.from({ length: 500 }, (_, i) => ({ id: `b${i}`, name: `Body ${i}`, kind: 'body', parentId: 'sol' }));
		const rows = buildPickerRows({ nodes: [NODES[0], ...many], categorize, query: 'body', searchLimit: 50 });
		expect(rows.length).toBe(50);
	});
});

describe('the toggles say how many they would show', () => {
	it('counts per category, excluding the origin', () => {
		const chips = buildCategoryChips({ nodes: NODES, categorize, order: ['Stars', 'Planets', 'Moons', 'Constructs'] });
		expect(chips).toEqual([
			{ key: 'Stars', count: 1 },
			{ key: 'Planets', count: 2 },
			{ key: 'Moons', count: 1 },
			{ key: 'Constructs', count: 2 }
		]);
		const withoutMars = buildCategoryChips({
			nodes: NODES, categorize, excludeIds: ['mars'],
			order: ['Stars', 'Planets', 'Moons', 'Constructs']
		});
		expect(withoutMars.find((c) => c.key === 'Planets')).toEqual({ key: 'Planets', count: 1 });
	});

	it('a category with nothing in it is not offered as a toggle', () => {
		const chips = buildCategoryChips({ nodes: NODES, categorize, order: ['Stars', 'Belts', 'Planets', 'Moons', 'Constructs'] });
		expect(chips.map((c) => c.key)).not.toContain('Belts');
	});

	it('a category the caller never listed still appears, at the end', () => {
		// Silently dropping an unlisted category would hide whatever is in it. The order is a
		// PREFERENCE, not an allow-list.
		const chips = buildCategoryChips({ nodes: NODES, categorize, order: ['Constructs'] });
		expect(chips[0].key).toBe('Constructs');
		expect(chips.map((c) => c.key)).toContain('Moons');
	});
});

describe('degenerate shapes do not break it', () => {
	it('a flat list with no parents at all is just a flat list — the starmap case', () => {
		const systems = [
			{ id: 's1', name: 'Alpha Centauri', kind: 'body', parentId: null },
			{ id: 's2', name: 'Sol', kind: 'body', parentId: null }
		];
		const rows = buildPickerRows({ nodes: systems, categorize: () => ['Systems'] });
		expect(shape(rows)).toEqual(['s1', 's2']);
	});

	it('a parent that is not in the list does not orphan its child', () => {
		const orphaned = [{ id: 'x', name: 'Waif', kind: 'body', parentId: 'nobody' }];
		const rows = buildPickerRows({ nodes: orphaned, categorize: () => ['Planets'] });
		expect(shape(rows)).toEqual(['x']);
	});

	it('a parent loop is cut rather than hung on', () => {
		const loop = [
			{ id: 'a', name: 'A', kind: 'body', parentId: 'b' },
			{ id: 'b', name: 'B', kind: 'body', parentId: 'a' }
		];
		const rows = buildPickerRows({ nodes: loop, categorize: () => ['Planets'] });
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.length).toBeLessThan(100);
	});
});
