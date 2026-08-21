import { describe, it, expect } from 'vitest';
import { gridLegend, hexAcrossFlats } from './gridLegend';
import { normalizePreset, DEFAULT_PRESET } from '$lib/player/presets';
import { gridLevelOpacity } from './niceInterval';
import { ORBIT_KM_BELOW_AU } from '$lib/units';
import { AU_KM } from '$lib/constants';

describe('gridLegend', () => {
	it('states a square by its side, which is unambiguous', () => {
		expect(gridLegend(1, 'square')).toBe('1 square = 1 AU');
		expect(gridLegend(0.25, 'square')).toBe('1 square = 0.25 AU');
		expect(gridLegend(10, 'square')).toBe('1 square = 10 AU');
	});

	// `hexLattice` takes `cell` as the CORNER-TO-CORNER width (`size = cell / 2` is the circumradius),
	// and a hex is only √3/2 of that across the flats. Traveller players measure across the flats by
	// habit, so a bare "1 hex = 1 AU" would be read as the wrong number by the very audience most
	// likely to choose hexes.
	it('qualifies a hex, because the bare sentence would be read as the wrong width', () => {
		expect(gridLegend(1, 'hex')).toBe('1 hex = 1 AU corner to corner');
		expect(gridLegend(2, 'hex')).toContain('corner to corner');
	});

	it('the qualifier is load-bearing: the two widths really do differ by 13%', () => {
		expect(hexAcrossFlats(1)).toBeCloseTo(0.866, 3);
		expect(hexAcrossFlats(1)).toBeLessThan(1);
		expect(1 - hexAcrossFlats(1)).toBeGreaterThan(0.1);
	});

	it('says nothing when there is no lattice to describe', () => {
		expect(gridLegend(1, null)).toBeNull();
		expect(gridLegend(null, 'square')).toBeNull();
		expect(gridLegend(null, null)).toBeNull();
	});

	it('says nothing rather than something absurd for a nonsense cell', () => {
		for (const bad of [0, -1, NaN, Infinity]) expect(gridLegend(bad, 'square')).toBeNull();
	});

	it('formats a cell at the precision the cell justifies, via the shared formatter', () => {
		expect(gridLegend(0.25, 'square')).not.toContain('0.250');
		expect(gridLegend(100, 'square')).toBe('1 square = 100 AU');
	});
});

// The grid TYPE was ONE field for both stages, so choosing hexes for the starmap silently changed the
// system map and back again. M4 caught the same field as a lossy EDITOR round-trip and was closed by
// making the two option sets identical — which fixed the loss and left the sharing, because the
// entry's own prescription (two fields) had been argued away. It was right; this is it.
describe('the two stages own their grid type separately', () => {
	it('a starmap choice does not reach the system view', () => {
		const p = normalizePreset({ ...DEFAULT_PRESET, id: 'x', name: 'x', grid: 'square', starmapGrid: 'traveller-hex' });
		expect(p.grid).toBe('square');
		expect(p.starmapGrid).toBe('traveller-hex');
	});

	it('and a system choice does not reach the starmap', () => {
		const p = normalizePreset({ ...DEFAULT_PRESET, id: 'x', name: 'x', grid: 'hex', starmapGrid: 'plain' });
		expect(p.grid).toBe('hex');
		expect(p.starmapGrid).toBe('plain');
	});

	it('a preset written BEFORE the split opens looking exactly as it did', () => {
		const old = { ...DEFAULT_PRESET, id: 'x', name: 'x', grid: 'scaled' as const };
		delete (old as Record<string, unknown>).starmapGrid;
		const p = normalizePreset(old);
		expect(p.starmapGrid).toBe('scaled');
		expect(p.grid).toBe('scaled');
	});

	it('falls back to the default rather than undefined when a preset names neither', () => {
		const bare = { id: 'x', name: 'x' };
		const p = normalizePreset(bare);
		expect(p.starmapGrid).toBe(DEFAULT_PRESET.grid);
		expect(p.starmapGrid).toBeDefined();
	});
});

// Which cell the caption names, through a decade handover. The scene asks the CROSSFADE rather than
// testing `t` against a midpoint of its own — a hardcoded 0.5 was wrong within a day, because A55's
// second pass moved the crossfade into the last 40% of a decade and made `t < 0.5` a region where the
// coarse level always wins. This pins the rule that killed it: the dominant level is the one the
// opacity law says is brighter, at every t.
describe('the caption names the level the crossfade is actually showing', () => {
	const dominant = (t: number) =>
		gridLevelOpacity('fine', t) > gridLevelOpacity('coarse', t) ? 'fine' : 'coarse';

	it('names the coarse level for the whole run-up, including past the halfway mark', () => {
		for (const t of [0, 0.2, 0.4, 0.5]) expect(dominant(t)).toBe('coarse');
	});

	it('hands over to the fine level before the decade ends', () => {
		expect(dominant(1)).toBe('fine');
	});

	it('flips exactly once, so the caption never flickers between two cells', () => {
		let flips = 0, prev = dominant(0);
		for (let i = 1; i <= 200; i++) {
			const d = dominant(i / 200);
			if (d !== prev) flips++;
			prev = d;
		}
		expect(flips).toBe(1);
	});

	it('a midpoint test would have disagreed with the crossfade — the bug, as arithmetic', () => {
		const disagreements = [];
		for (let i = 0; i <= 100; i++) {
			const t = i / 100;
			const byMidpoint = t < 0.5 ? 'coarse' : 'fine';
			if (byMidpoint !== dominant(t)) disagreements.push(t);
		}
		expect(disagreements.length).toBeGreaterThan(0);
	});
});

// Below the threshold an AU figure stops being a distance a reader can picture, so the km (or miles)
// goes in brackets ALONGSIDE the AU rather than instead of it — the cell was chosen in AU, off a
// picker labelled in AU, and dropping it would break the link to the control that set it.
describe('small cells say the distance in brackets', () => {
	it('leaves a readable cell alone', () => {
		for (const au of [0.25, 0.5, 1, 2, 5, 10]) {
			expect(gridLegend(au, 'square')).not.toContain('(');
		}
	});

	it('brackets the km at the cell the owner asked about', () => {
		const s = gridLegend(0.01, 'square', 'metric')!;
		expect(s).toContain('0.01 AU');
		expect(s).toContain('km');
		expect(s.startsWith('1 square = 0.01 AU (')).toBe(true);
	});

	it('follows the in-system measurement setting', () => {
		expect(gridLegend(0.01, 'square', 'metric')).toContain('km');
		expect(gridLegend(0.01, 'square', 'imperial')).toContain('mi');
		expect(gridLegend(0.01, 'square', 'imperial')).not.toContain('km');
	});

	it('keeps the AU as well as the distance — the picker is labelled in AU', () => {
		const s = gridLegend(0.001, 'square', 'metric')!;
		expect(s).toContain('0.001 AU');
		expect(s).toMatch(/\(.*\)/);
	});

	it('brackets a hex too, without losing the corner-to-corner qualifier', () => {
		const s = gridLegend(0.01, 'hex', 'metric')!;
		expect(s).toContain('corner to corner');
		expect(s).toContain('km');
	});

	// Reusing units.ts's constant rather than inventing a fifth threshold, per that file's own note.
	it('switches at the threshold the codebase had already agreed on', () => {
		expect(ORBIT_KM_BELOW_AU).toBe(0.05);
		expect(gridLegend(ORBIT_KM_BELOW_AU, 'square')).not.toContain('(');
		expect(gridLegend(ORBIT_KM_BELOW_AU - 0.001, 'square')).toContain('(');
	});

	it('the bracketed figure is the real conversion, not a rounded story', () => {
		const s = gridLegend(0.01, 'square', 'metric')!;
		const km = Number(s.match(/\(([\d,]+)/)![1].replace(/,/g, ''));
		expect(km).toBeCloseTo(0.01 * AU_KM, -1);
	});
});
