import { describe, it, expect } from 'vitest';
import { deriveAppearance, shade, bdGlowColour } from './planetAppearance';
import type { CelestialBody } from '$lib/types';

const mk = (over: Partial<CelestialBody> & { tags?: { key: string; value?: string }[] }): CelestialBody =>
	({
		id: 'b1',
		name: 'Test',
		roleHint: 'planet',
		radiusKm: 3000,
		massKg: 3e23,
		tags: [],
		...over
	}) as unknown as CelestialBody;

describe('deriveAppearance — feature resolution', () => {
	it('classifies stars and belts and gives them no surface features', () => {
		const star = deriveAppearance(mk({ roleHint: 'star', temperatureK: 5778 }));
		expect(star.isStar).toBe(true);
		expect(star.craters).toBe(false);
		expect(star.magma).toBeNull();
		expect(star.aurora).toBeNull();

		const belt = deriveAppearance(mk({ roleHint: 'belt' }));
		expect(belt.isBelt).toBe(true);
		expect(belt.polarIce).toBe(false);
	});

	it('draws craters on an airless, geologically dead world but not a giant', () => {
		const dead = deriveAppearance(mk({ tags: [{ key: 'geology/inactive' }] }));
		expect(dead.craters).toBe(true);

		// With a thick atmosphere the impactors burn up → no craters.
		const airy = deriveAppearance(mk({ tags: [{ key: 'geology/inactive' }], atmosphere: { pressure_bar: 1 } as any }));
		expect(airy.craters).toBe(false);
	});

	it('scales magma vents by volcanism tier and flags a lava world', () => {
		expect(deriveAppearance(mk({ tags: [{ key: 'tidal/lava-flows' }] })).magma).toEqual({ vents: 7, lava: true });
		expect(deriveAppearance(mk({ tags: [{ key: 'tidal/volcanism' }] })).magma).toEqual({ vents: 5, lava: false });
		expect(deriveAppearance(mk({ tags: [{ key: 'tidal/hotspots' }] })).magma).toEqual({ vents: 3, lava: false });
		expect(deriveAppearance(mk({})).magma).toBeNull();
	});

	it('reads aurora strength + brilliance from the aurora/* tag', () => {
		const faint = deriveAppearance(mk({ tags: [{ key: 'aurora/oxygen', value: '0.3' }] }));
		expect(faint.aurora?.strength).toBeCloseTo(0.3, 6);
		expect(faint.aurora?.brilliant).toBe(false);

		const bright = deriveAppearance(mk({ tags: [{ key: 'aurora/oxygen', value: '0.9' }] }));
		expect(bright.aurora?.brilliant).toBe(true);
		expect(bright.aurora?.coreHex).toMatch(/^#/);
	});

	it('resolves polar ice, atmosphere glow and self-luminous glow', () => {
		expect(deriveAppearance(mk({ tags: [{ key: 'climate/polar-ice' }] })).polarIce).toBe(true);

		const atm = deriveAppearance(mk({ atmosphere: { pressure_bar: 1 } as any }));
		expect(atm.atmGlow).not.toBeNull();
		expect(atm.atmGlow!.strength).toBeGreaterThan(0);

		const bd = deriveAppearance(mk({ tags: [{ key: 'thermal/self-luminous', value: '1400' }] }));
		expect(bd.selfLumGlow?.teff).toBe(1400);
		expect(bd.selfLumGlow?.colorHex).toBe(bdGlowColour(1400));
	});

	it('marks a fast rotator toroidal and carries axial tilt through', () => {
		expect(deriveAppearance(mk({ oblateness: 0.85 })).isToroid).toBe(true);
		expect(deriveAppearance(mk({ oblateness: 0.1 })).isToroid).toBe(false);
		expect(deriveAppearance(mk({ axial_tilt_deg: 26.7 })).axialTiltDeg).toBe(26.7);
	});
});

describe('shade', () => {
	it('lightens and darkens', () => {
		expect(shade('#808080', 0)).toBe('#808080');
		expect(shade('#000000', 1)).toBe('#ffffff');
		expect(shade('#ffffff', -1)).toBe('#000000');
	});
});
