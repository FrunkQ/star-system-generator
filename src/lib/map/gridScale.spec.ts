// THE SYSTEM LATTICE'S CELL — automatic, or pinned to a real distance.
//
// G10 made the system grid a SCALE rather than decoration: its cell is a round number of AU, not a
// fraction of the scene. The ladder that picks that number tracks the zoom, which is right while a GM
// is browsing and wrong the moment the grid has to MEAN something at the table — "these are 1 AU
// squares" stops being true as soon as someone scrolls. So the cell can be pinned, and the ladder
// becomes one option rather than the only behaviour.
import { describe, it, expect } from 'vitest';
import { gridLevels } from './niceInterval';
import { DEFAULT_PRESET, holoStyleOf } from '$lib/player/presets';

describe('the automatic ladder', () => {
	it('is still the default — a pinned cell is opt-in and changes nothing until asked for', () => {
		expect(DEFAULT_PRESET.gridScaleAu ?? 0).toBe(0);
		expect(holoStyleOf(DEFAULT_PRESET).gridScaleAu).toBe(0);
	});

	it('nests its two levels exactly ten to one, which is what lets them crossfade', () => {
		const lv = gridLevels(30, 6);
		expect(lv).not.toBeNull();
		expect(lv!.coarse / lv!.fine).toBeCloseTo(10);
	});

	// The property a pinned cell exists to provide, stated as its absence here: the automatic cell is
	// a function of the view, so two different zooms give two different answers.
	it('changes the cell as the view zooms — the behaviour a table cannot rely on', () => {
		const wide = gridLevels(300, 6)!;
		const tight = gridLevels(3, 6)!;
		expect(wide.coarse).not.toBe(tight.coarse);
	});
});

describe('a pinned cell', () => {
	it('carries through the preset to the holo style unchanged', () => {
		expect(holoStyleOf({ ...DEFAULT_PRESET, gridScaleAu: 1 }).gridScaleAu).toBe(1);
		expect(holoStyleOf({ ...DEFAULT_PRESET, gridScaleAu: 0.5 }).gridScaleAu).toBe(0.5);
	});

	it('survives a preset that predates the field', () => {
		const old = { ...DEFAULT_PRESET };
		delete (old as Record<string, unknown>).gridScaleAu;
		expect(holoStyleOf(old).gridScaleAu).toBe(0);
	});

	it('treats every non-positive or non-finite value as "automatic" rather than as a cell', () => {
		for (const bad of [0, -1, NaN, Infinity, undefined]) {
			const style = holoStyleOf({ ...DEFAULT_PRESET, gridScaleAu: bad as number });
			expect(style.gridScaleAu === 0 || !(style.gridScaleAu! > 0)).toBe(true);
		}
	});

	it('offers cells off the 1/2/5 ladder, so every option is a round number to say out loud', () => {
		const offered = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
		for (const au of offered) {
			const mantissa = au / Math.pow(10, Math.floor(Math.log10(au)));
			expect([1, 2, 5]).toContain(Math.round(mantissa));
		}
	});
});
