/**
 * THE GM STARMAP'S HOVER SUMMARY (A82) — the counts, the designation, and the GM-only rule.
 *
 * Three things this has to get right and each has its own block:
 *   1. the COUNTS are one answer, and a mega-construct is counted once as the thing it presents as;
 *   2. the DESIGNATION comes from `starClassExplain` and is not respelled here;
 *   3. the PLAYER starmap does not gain any of it — the player's view is redacted for a reason, and
 *      this module counts everything a GM owns.
 *
 * RUN WITH THE CHROME PREDICATE REMOVED (count `roleHint === 'planet'` first) THIS GOES RED on
 * `a ringworld is a construct, not a planet`. Checked before it was believed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { systemSummary, contentsLine, listLine } from './systemSummary';
import { loadStarterPack } from '$lib/import/realsky/testPack';

const rulePack = loadStarterPack() as any;

let n = 0;
const id = () => `n${++n}`;

const star = (classes: string[], extra: Record<string, unknown> = {}) => ({
	id: id(), kind: 'body', roleHint: 'star', name: 'A', parentId: null,
	classes, massKg: 2e30, radiusKm: 7e5, temperatureK: 5772, ...extra
});
const planet = (extra: Record<string, unknown> = {}) =>
	({ id: id(), kind: 'body', roleHint: 'planet', name: 'P', massKg: 6e24, ...extra });
const moon = () => ({ id: id(), kind: 'body', roleHint: 'moon', name: 'M', massKg: 7e22 });
const belt = () => ({ id: id(), kind: 'body', roleHint: 'belt', name: 'B' });
const station = () => ({ id: id(), kind: 'construct', roleHint: 'construct', name: 'S' });
const mega = (megaType: string) =>
	({ id: id(), kind: 'construct', roleHint: 'construct', name: 'X', megaType, artificial: true });

const sys = (nodes: unknown[]) => ({ id: 'sys', name: 'Test', nodes } as any);

describe('A82 — the counts are one answer', () => {
	it('counts stars, planets, moons, belts and constructs apart', () => {
		const s = systemSummary('Test', sys([
			star(['star/G2V']), planet(), planet(), planet(), moon(), moon(), belt(), station()
		]), rulePack);
		expect(s.stars).toBe(1);
		expect(s.planets).toBe(3);
		expect(s.moons).toBe(2);
		expect(s.minorBodies).toBe(1);
		expect(s.constructs).toBe(1);
	});

	it('a binary is TWO stars — the same reader the glyphs use, so the card cannot disagree', () => {
		const s = systemSummary('Test', sys([
			star(['star/G2V'], { massKg: 2e30 }), star(['star/K'], { massKg: 1.5e30 }), planet()
		]), rulePack);
		expect(s.stars).toBe(2);
		expect(s.planets).toBe(1);
	});

	it('a ringworld is a construct, not a planet — counted once, as what it presents as', () => {
		// G53 §3.3: a hybrid is `kind: 'body'` with construct chrome, so the chrome predicate has to
		// be asked FIRST or it is tallied twice. Both shapes are checked because both will exist.
		const hybrid = {
			id: 'rw', kind: 'body', roleHint: 'planet', name: 'Ring',
			constructChrome: true, artificial: true, megaType: 'ringworld'
		};
		const s = systemSummary('Test', sys([star(['star/G2V']), planet(), hybrid]), rulePack);
		expect(s.planets, 'the ring must not be counted as a world').toBe(1);
		expect(s.constructs).toBe(1);
		expect(s.specials).toEqual(['Ringworld']);

		const plain = systemSummary('Test', sys([star(['star/G2V']), mega('ringworld')]), rulePack);
		expect(plain.constructs).toBe(1);
		expect(plain.specials).toEqual(['Ringworld']);
	});

	it('names the specials by their REGISTRY label, and counts repeats', () => {
		const s = systemSummary('Test', sys([
			star(['star/G2V']), mega('dyson-swarm'), mega('dyson-swarm'), mega('ringworld')
		]), rulePack);
		expect(s.specials).toContain('Ringworld');
		expect(s.specials).toContain('2 × Dyson Swarm');
	});

	it('says nothing about a megaType this build has no record for', () => {
		const s = systemSummary('Test', sys([star(['star/G2V']), mega('klemperer-rosette')]), rulePack);
		expect(s.specials).toEqual([]);
		expect(s.constructs, 'it is still a construct').toBe(1);
	});

	it('survives an empty, absent or barycentre-only system rather than throwing', () => {
		expect(systemSummary('Nowhere', null, rulePack).stars).toBe(0);
		expect(systemSummary('Nowhere', sys([]), rulePack).planets).toBe(0);
		const bary = { id: 'b', kind: 'barycenter', name: 'AB', parentId: null };
		expect(systemSummary('Pair', sys([bary]), rulePack).stars).toBe(0);
	});
});

describe('A82 — the life line', () => {
	it('is absent when nothing lives there', () => {
		expect(systemSummary('T', sys([star(['star/G2V']), planet()]), rulePack).life).toBeUndefined();
	});

	it('names the worlds and whether anything got past microbes', () => {
		const microbial = { complexity: 'simple', coverage: 0.4, biochemistry: 'water-carbon', energy_source: 'photosynthesis', morphologies: ['microbial'] };
		const complex = { ...microbial, complexity: 'complex' };
		const one = systemSummary('T', sys([star(['star/G2V']), planet({ biosphere: microbial })]), rulePack);
		expect(one.life).toBe('Life on 1 world, microbial');
		const two = systemSummary('T', sys([
			star(['star/G2V']), planet({ biosphere: microbial }), planet({ biosphere: complex })
		]), rulePack);
		expect(two.life).toBe('Life on 2 worlds, 1 complex');
	});
});

describe('A82 — the designation is the ONE builder’s, never a second spelling', () => {
	it('gives the full plain-English designation for a main-sequence star', () => {
		const s = systemSummary('Sol', sys([star(['star/G2V']), planet()]), rulePack);
		expect(s.designation).toMatch(/^G2V \(/);
		expect(s.designation).toMatch(/Main-sequence dwarf/);
		expect(s.designation).toMatch(/yellow to human eyes/); // SAY WHOSE EYES
	});

	it('reads the HELD designation, not the band it was drawn from', () => {
		const s = systemSummary('T', sys([star(['star/K-III'])]), rulePack);
		expect(s.designation).toMatch(/Giant star/);
	});

	it('describes a flaring M dwarf as flaring — the activity tag, not a guess', () => {
		const flaring = star(['star/M'], { tags: [{ key: 'stellar/activity', value: 'flare-star' }] });
		expect(systemSummary('T', sys([flaring]), rulePack).designation).toMatch(/Flaring/);
	});

	it('says nothing rather than guessing at a designation it cannot parse', () => {
		expect(systemSummary('T', sys([star(['star/unknowable'])]), rulePack).designation).toBeUndefined();
	});

	it('is EXACTLY what explainStarClass returns — not a rebuild of it', async () => {
		const { explainStarClass } = await import('$lib/system/starClassExplain');
		const s = systemSummary('T', sys([star(['star/G2V'])]), rulePack);
		expect(s.designation).toBe(explainStarClass(rulePack, 'star/G2V')?.text);
	});
});

describe('A82 — the lines a view prints', () => {
	it('names each category and drops the empty ones', () => {
		const s = systemSummary('T', sys([star(['star/G2V']), planet(), moon(), moon()]), rulePack);
		expect(contentsLine(s)).toBe('1 planet · 2 moons');
		expect(listLine(s)).toBe('1 star · 1 planet · 2 moons');
	});

	it('an empty system reads "uncharted" rather than an empty string', () => {
		expect(listLine(systemSummary('T', sys([]), rulePack))).toBe('uncharted');
	});
});

// THE GM-ONLY RULE, AS A GATE RATHER THAN A COMMENT.
//
// The player's starmap is `Starmap3DView` (mounted by `routes/catalogue` and, as a preview of what
// players see, by `PlayerPresetEditor`); the GM's is `components/Starmap.svelte`, mounted only by
// `routes/+page.svelte`. This module counts everything a GM owns — hidden bodies included — so a
// player surface must not import it without deciding redaction first. Grepping the sources is the
// only check that survives someone wiring it up in six months.
describe('A82 — the PLAYER starmap does not gain the summary', () => {
	const reads = (path: string) => {
		const src = readFileSync(path, 'utf8');
		return /systemSummary|StarSummaryCard/.test(src);
	};

	it('is not imported by the player 3D starmap or its scene', () => {
		expect(reads('src/lib/starmap/Starmap3DView.svelte')).toBe(false);
		expect(reads('src/lib/starmap/starmapScene.ts')).toBe(false);
	});

	it('is not imported by the player catalogue or the preset editor’s preview', () => {
		expect(reads('src/routes/catalogue/+page.svelte')).toBe(false);
		expect(reads('src/lib/components/PlayerPresetEditor.svelte')).toBe(false);
	});

	it('IS used by the GM starmap — the other half of the same claim', () => {
		expect(reads('src/lib/components/Starmap.svelte')).toBe(true);
	});
});

/**
 * A88 ON THE SURFACE IT WAS REPORTED ON. The owner was looking at the STARMAP HOVER CARD when he
 * saw a supermassive black hole called "a ball about 300 km across". The cause is one level down
 * — the size clause was taking the pack band rather than the star's own radius — but the card is
 * where a GM meets it, so the card is where it is pinned too.
 */
describe('A88 — the hover card describes the star in front of it', () => {
	const SOLAR_RADIUS_KM = 695700;

	it('a supermassive black hole is not described as a 300 km ball', () => {
		// 9.87e9 M☉: the event horizon is 29,176,646,000 km, which is 195 AU.
		const bh = star(['star/BH'], { massKg: 9.87e9 * 1.989e30, radiusKm: 29176646000 });
		const s = systemSummary('Sirius', sys([bh]), rulePack);
		expect(s.designation).not.toMatch(/km across/);
		expect(s.designation).toMatch(/AU across/);
	});

	it('a stellar-mass hole still reads in kilometres', () => {
		const bh = star(['star/BH'], { massKg: 10 * 1.989e30, radiusKm: 29.5 });
		expect(systemSummary('X', sys([bh]), rulePack).designation).toMatch(/km across/);
	});

	it('a red dwarf is measured, not looked up', () => {
		const m = star(['star/M'], { radiusKm: 0.3 * SOLAR_RADIUS_KM });
		expect(systemSummary('X', sys([m]), rulePack).designation)
			.toMatch(/0\.3 times the width of the Sun/);
	});
});
