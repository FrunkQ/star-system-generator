// G5: orbit-line opacity. Two contracts are worth pinning and neither is about the renderer.
//
// (1) THE DEFAULT MUST BE INVISIBLE. The dial ships at 1 = "today's look", so an untouched preset,
//     an old saved preset with no such field, and a fresh style must all produce exactly 1. A dial
//     that quietly dims every existing view on upgrade is worse than no dial.
// (2) THE GM'S VALUE AND THE PLAYER'S ARE TWO VALUES. The GM's lives in a browser-local store, the
//     player's on the preset; joining them is the fault recorded twice as A10/A3. The test that
//     catches a future join is that the preset mapping reads ONLY the preset.
import { describe, it, expect } from 'vitest';
import { DEFAULT_STYLE } from '$lib/holo/holoStyle';
import { holoStyleOf, systemStageStyle } from '$lib/player/presets';
import type { PlayerPreset } from '$lib/player/presetTypes';

const preset = (over: Partial<PlayerPreset> = {}) => ({ id: 'p', name: 'p', ...over }) as PlayerPreset;

describe('G5 orbit opacity - the default is today', () => {
	it('the shipped style is fully opaque', () => {
		expect(DEFAULT_STYLE.orbitOpacity).toBe(1);
	});

	it('a preset that predates the field maps to 1, not to 0 or undefined', () => {
		expect(holoStyleOf(preset()).orbitOpacity).toBe(1);
	});

	it('carries the GM\'s chosen value to the player view', () => {
		expect(holoStyleOf(preset({ orbitOpacity: 0.3 })).orbitOpacity).toBe(0.3);
		expect(holoStyleOf(preset({ orbitOpacity: 0 })).orbitOpacity).toBe(0);
	});

	it('reads the PRESET and nothing else - a GM-local value must never leak in (A10/A3)', () => {
		// Whatever a GM has set for their own screen, the preset is the only input here.
		const p = preset({ orbitOpacity: 0.25 });
		expect(holoStyleOf(p).orbitOpacity).toBe(0.25);
		expect(holoStyleOf(preset()).orbitOpacity).toBe(1);
	});

	// THE ACCEPTANCE POINT: one dial must reach BOTH player tiers. They are one engine (the holo
	// scene draws the 2D map as a locked-overhead 3D view), and the way to show it rather than assume
	// it is that both tiers are built by the SAME style function - the 2D branch overrides only the
	// framing knobs and spreads everything else.
	it('reaches BOTH player tiers - the flat 2D map and the 3D view', () => {
		for (const systemView of ['diagram2d', 'holo3d'] as const) {
			const style = systemStageStyle(preset({ systemView, orbitOpacity: 0.3 }));
			expect(style.orbitOpacity).toBe(0.3);
		}
	});

	it('0 means 0 on both tiers - the dial can switch orbit lines off entirely', () => {
		for (const systemView of ['diagram2d', 'holo3d'] as const) {
			expect(systemStageStyle(preset({ systemView, orbitOpacity: 0 })).orbitOpacity).toBe(0);
		}
	});
});
