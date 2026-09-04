// The construct file contract (B117, DATA-R40): what Export writes, Import accepts - proved over
// every template the starter pack ships, built the way AddConstructModal builds one.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SITUATION_FIELDS, stripSituation, constructFileProblem } from './constructFile';

const pack = JSON.parse(readFileSync(resolve(process.cwd(), 'static/rulepacks/starter-sf/construct_templates.json'), 'utf-8'));
const templates: any[] = Object.entries(pack)
	.filter(([k]) => k !== 'id' && k !== 'name')
	.flatMap(([, v]) => (Array.isArray(v) ? v : []));

// What AddConstructModal makes of a template: a deep copy, an id, a placement, a host and an orbit.
function built(template: any) {
	return {
		...JSON.parse(JSON.stringify(template)),
		id: 'c-1', IsTemplate: false, placement: 'medium', parentId: 'p-1',
		orbit: { hostId: 'p-1', hostMu: 1, t0: 0, elements: { a_AU: 0.001, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }
	};
}

describe('the construct file contract (B117)', () => {
	it('has real templates to test against, and none carries the `class` the old importer demanded', () => {
		expect(templates.length).toBeGreaterThan(20);
		expect(templates.filter((t) => t.class).length).toBe(0);
	});

	it('round-trips EVERY template the pack ships: built, exported, accepted back', () => {
		for (const t of templates) {
			const file = stripSituation(built(t));
			expect(constructFileProblem(file), `${t.name}: ${constructFileProblem(file)}`).toBeNull();
		}
	});

	it('strips the situation and nothing else', () => {
		const t = templates[0];
		const file = stripSituation(built(t));
		for (const f of SITUATION_FIELDS) expect(file, f).not.toHaveProperty(f);
		expect(file.kind).toBe('construct');
		expect(file.name).toBe(t.name);
		expect(file.roleHint).toBe(t.roleHint);
		expect(file.systems).toEqual(t.systems);
	});

	it('says what is wrong in words, never just "invalid"', () => {
		expect(constructFileProblem(null)).toMatch(/does not hold a construct/);
		expect(constructFileProblem([])).toMatch(/does not hold a construct/);
		expect(constructFileProblem({ kind: 'body', name: 'Mars' })).toMatch(/body file/);
		expect(constructFileProblem({ id: 's', name: 'Sol', nodes: [] })).toMatch(/whole system save/);
		expect(constructFileProblem({ name: 'x' })).toMatch(/"kind": "construct"/);
		expect(constructFileProblem({ kind: 'construct', name: '  ' })).toMatch(/no name/);
		expect(constructFileProblem({ kind: 'construct', name: 'Rocinante' })).toBeNull();
	});

	it('the panel reads the contract from here, and no longer demands `class` or keeps its own field list', () => {
		const src = readFileSync(resolve(process.cwd(), 'src/lib/components/ConstructSidePanel.svelte'), 'utf-8');
		expect(src).toMatch(/constructFileProblem\(/);
		expect(src).toMatch(/stripSituation\(/);
		expect(src).not.toMatch(/importedConstruct\.class/);
		expect(src).not.toMatch(/const SITUATION_FIELDS/);
	});
});
