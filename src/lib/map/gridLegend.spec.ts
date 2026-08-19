import { describe, it, expect } from 'vitest';
import { gridLegend, hexAcrossFlats } from './gridLegend';
import { normalizePreset, DEFAULT_PRESET } from '$lib/player/presets';

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
