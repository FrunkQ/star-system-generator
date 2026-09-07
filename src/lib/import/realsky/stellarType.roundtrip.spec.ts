// The classification must survive the whole path, not just the parser: import -> the fix-up every
// loaded/imported starmap goes through -> back out. A structured field that gets dropped on the way
// to storage is no better than the string it replaced, and a saved starmap is the case a GM actually
// meets.
import { describe, it, expect } from 'vitest';
import { convertRegion } from './convert.mjs';
import { SOL_CENTRE } from './query.mjs';
import { fixUpImportedSystem } from '$lib/system/importFixup';
import { loadStarterPack } from './testPack';

const statTemplates = (loadStarterPack() as any).statTemplates;

// Real SIMBAD census rows, shape as `convertRegion` takes them.
const starRows = [
	{ main_id: '* alf Sco', ra: 247.35, dec: -26.43, plx_value: 5.89, sp_type: 'M1.5Iab+B2Vn', otype: 's*r' },
	{ main_id: '* alf Ori', ra: 88.79, dec: 7.41, plx_value: 6.55, sp_type: 'M1-M2Ia-Iab', otype: 's*r' },
	{ main_id: '* alf Boo', ra: 213.91, dec: 19.18, plx_value: 88.83, sp_type: 'K1.5III', otype: 'RG*' },
	{ main_id: 'Wolf  359', ra: 164.1, dec: 7.01, plx_value: 415.18, sp_type: 'dM6', otype: 'Er*' },
	{ main_id: 'NAME Proxima Centauri', ra: 217.42, dec: -62.68, plx_value: 768.5, sp_type: 'M5.5Ve', otype: 'Er*' }
];

function importedStars(radiusLy = 1000) {
	const out = convertRegion(
		{ starRows, planetRows: [], solPreset: null, statTemplates },
		{ region: { centre: SOL_CENTRE, radiusLy }, generated: 'test' }
	);
	return out.systems.flatMap((s: any) => s.system.nodes.filter((n: any) => n.roleHint === 'star'));
}

describe('the classification survives import', () => {
	it('lands on the node as structured data, parsed once', () => {
		const byName = Object.fromEntries(importedStars().map((n: any) => [n.name, n]));
		expect(byName['Antares'].stellarType).toEqual({
			spectral: 'M', subclass: 1.5, luminosity: 'Iab', band: 'I', companion: 'B2Vn'
		});
		expect(byName['Betelgeuse'].stellarType).toEqual({ spectral: 'M', subclass: 1, luminosity: 'Ia', band: 'I' });
		expect(byName['Arcturus'].stellarType).toEqual({ spectral: 'K', subclass: 1.5, luminosity: 'III', band: 'III' });
		// SIMBAD's lowercase dwarf prefix: an explicit class V, and NOT a white dwarf.
		expect(byName['Wolf 359'].stellarType).toEqual({ spectral: 'M', subclass: 6, luminosity: 'V', band: 'V' });
		// B116: `M5.5Ve` - the emission code is read and KEPT as a peculiarity, not lost.
		expect(byName['Proxima Centauri'].stellarType).toEqual({ spectral: 'M', subclass: 5.5, luminosity: 'V', band: 'V', peculiarity: 'e' });
	});

	it('and the parameters follow from it — the supergiants are supergiants', () => {
		const byName = Object.fromEntries(importedStars().map((n: any) => [n.name, n]));
		const SOLAR_MASS_KG = 1.989e30;
		expect(byName['Antares'].massKg / SOLAR_MASS_KG).toBeGreaterThan(8);
		expect(byName['Betelgeuse'].massKg / SOLAR_MASS_KG).toBeGreaterThan(8);
		expect(byName['Arcturus'].massKg / SOLAR_MASS_KG).toBeGreaterThan(1);
		// ...and the dwarfs are still dwarfs. Wolf 359 used to import as a 1.0 Msun WHITE dwarf.
		expect(byName['Wolf 359'].massKg / SOLAR_MASS_KG).toBeLessThan(0.5);
		// Its CLASS is its designation now (B60) and it resolves to the M dwarf band.
		expect(byName['Wolf 359'].classes[0]).toBe('star/M6V');
		expect(byName['Wolf 359'].classes).toContain('star/M');
	});

	it('survives the fix-up every loaded starmap goes through', () => {
		const out = convertRegion(
			{ starRows, planetRows: [], solPreset: null, statTemplates },
			{ region: { centre: SOL_CENTRE, radiusLy: 1000 }, generated: 'test' }
		);
		expect(out.systems.length).toBeGreaterThan(0);
		for (const entry of out.systems) {
			const before: any = entry.system.nodes.find((n: any) => n.roleHint === 'star');
			const fixed = fixUpImportedSystem(structuredClone(entry.system));
			const star: any = (fixed.nodes ?? []).find((n: any) => n.roleHint === 'star');
			expect(star, 'the star did not survive fix-up at all').toBeTruthy();
			expect(star.stellarType, `${star.name} lost its classification in fix-up`).toEqual(before.stellarType);
		}
	});
});
