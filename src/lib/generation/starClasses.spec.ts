// B46(a): `star/red-giant` and `star/M-III` described the same object and DISAGREED — radiation
// output 30 Lsun against 2,750, a factor of about ninety — and which one answered depended only on
// whether the star was GENERATED or IMPORTED. The generator drew the legacy key (weight 5 in
// `star_types`) while the importer emitted the MK one, so both were live in one campaign.
//
// Tracing that also turned up the class array the generator builds, which was fabricating classes
// that do not exist.
import { describe, it, expect } from 'vitest';
import { _generateStar, starStatTemplate } from './star';
import { loadStarterPack } from '$lib/import/realsky/testPack';
import { starParamsFromType } from '$lib/import/realsky/stars.mjs';
import { SeededRNG } from '$lib/rng';

const pack = loadStarterPack() as any;
const st = pack.statTemplates;
const mid = (r: number[]) => (r[0] + r[1]) / 2;

describe('the red-giant divergence is gone', () => {
	it('a GENERATED red giant and an IMPORTED one now agree exactly', () => {
		const generated = starStatTemplate(pack, 'star/M-III');
		const imported = starParamsFromType('M3III', st)!;
		expect(imported.luminosity).toBe(mid(generated.radiation_output));
		expect(imported.massMsun).toBe(mid(generated.mass_solar));
		expect(imported.radiusRsun).toBe(mid(generated.radius_solar));
	});

	it('the legacy key is retired from the pack and from the distribution', () => {
		expect(st['star/red-giant']).toBeUndefined();
		const values = pack.distributions.star_types.entries.map((e: any) => e.value);
		expect(values).not.toContain('star/red-giant');
	});

	it('but a SAVED body still holding it resolves, rather than becoming a G dwarf', () => {
		// Deleting a key a campaign may still name would silently fall through to `star/default`.
		expect(starStatTemplate(pack, 'star/red-giant')).toBe(starStatTemplate(pack, 'star/M-III'));
	});

	it('every class the distribution offers is a band the pack actually defines', () => {
		// DATA-R12, which this item is the fifth instance of: a class nothing can resolve is the
		// same fault as a band nothing can reach.
		for (const e of pack.distributions.star_types.entries) {
			expect(st[e.value], `${e.value} is offered but has no band`).toBeTruthy();
		}
	});

	it('offers giants and supergiants at honest rarities', () => {
		const entries = pack.distributions.star_types.entries;
		const total = entries.reduce((s: number, e: any) => s + e.weight, 0);
		const share = (pred: (v: string) => boolean) =>
			entries.filter((e: any) => pred(e.value)).reduce((s: number, e: any) => s + e.weight, 0) / total;
		const giants = share((v) => v.endsWith('-III'));
		const supergiants = share((v) => v.endsWith('-I'));
		// A few per thousand main-sequence stars, and supergiants far rarer still.
		expect(giants).toBeGreaterThan(0.001);
		expect(giants).toBeLessThan(0.02);
		expect(supergiants).toBeGreaterThan(0);
		expect(supergiants).toBeLessThan(giants / 50);
		// …and all fourteen are reachable, or this is DATA-R12 again.
		for (const L of ['O', 'B', 'A', 'F', 'G', 'K', 'M']) {
			for (const band of ['I', 'III']) {
				expect(entries.some((e: any) => e.value === `star/${L}-${band}`), `star/${L}-${band}`).toBe(true);
			}
		}
	});
});

describe('the class array a generated star carries', () => {
	const classesFor = (override: string) =>
		(_generateStar('s', null, pack, new SeededRNG('x'), override) as any).classes as string[];

	it('does NOT fabricate a spectral class for a remnant', () => {
		// It sliced `spectralType[0]` and excluded a hardcoded LIST that missed WD, NS and BH. Over
		// 2,000 generated stars, 1.8% carried `star/W`, 0.5% `star/N`, and a feeding black hole
		// carried `star/B` — the same 'B' collision that gave black holes a flare rate. None exists.
		expect(classesFor('star/WD')).toEqual(['star/WD']);
		expect(classesFor('star/NS')).toEqual(['star/NS']);
		expect(classesFor('star/BH')).toEqual(['star/BH']);
		expect(classesFor('star/BH_active')).toEqual(['star/BH_active']);
		expect(classesFor('star/magnetar')).toEqual(['star/magnetar']);
		for (const c of ['star/W', 'star/N', 'star/B']) {
			expect(classesFor('star/BH_active')).not.toContain(c);
		}
	});

	it('puts the SPECIFIC class first and keeps the letter behind it', () => {
		// Most-specific-first, matching the importer (B44). The letter used to come first, so a
		// generated `star/M-III` would have had `classes[0] === 'star/M'` and been described as a red
		// DWARF — D19 reappearing on the generation path.
		expect(classesFor('star/M-III')).toEqual(['star/M-III', 'star/M']);
		expect(classesFor('star/K-III')).toEqual(['star/K-III', 'star/K']);
		expect(classesFor('star/B-I')).toEqual(['star/B-I', 'star/B']);
		// A bare letter stays a single class.
		expect(classesFor('star/G')).toEqual(['star/G']);
	});

	it('categorises an evolved star by what it IS, not by its letter habits', () => {
		const cat = (o: string) => (_generateStar('s', null, pack, new SeededRNG('x'), o) as any).starCategory;
		// `star/M-III` matched none of the old lists and came out undefined; the retired
		// `star/red-giant` was listed as `main_sequence_star`, which it is by definition not.
		expect(cat('star/M-III')).toBe('main_sequence_star'); // a middleweight off the main sequence
		expect(cat('star/M-I')).toBe('massive_star');         // every supergiant is massive
		expect(cat('star/O-I')).toBe('massive_star');
		expect(cat('star/M')).toBe('low_mass_star');
		expect(cat('star/BH')).toBe('star_remnant');
	});
});
