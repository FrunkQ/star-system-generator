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
		expect(star.craters).toBeNull();
		expect(star.magma).toBeNull();
		expect(star.aurora).toBeNull();

		const belt = deriveAppearance(mk({ roleHint: 'belt' }));
		expect(belt.isBelt).toBe(true);
		expect(belt.polarIce).toBe(false);
	});

	it('draws craters on an airless, geologically dead world but not a giant', () => {
		const dead = deriveAppearance(mk({ tags: [{ key: 'geology/inactive' }] }));
		expect(dead.craters).toBeTruthy();
		expect(dead.craters!.density).toBeGreaterThan(0);

		// With a thick atmosphere the impactors burn up + erode → no craters.
		const airy = deriveAppearance(mk({ tags: [{ key: 'geology/inactive' }], atmosphere: { pressure_bar: 1 } as any }));
		expect(airy.craters).toBeNull();
	});

	it('crater density tracks surface age; a young resurfaced world stays smooth', () => {
		const ancient = deriveAppearance(mk({ geoActivity: { regime: 'inactive', surfaceAgeGyr: 4.6 } } as any));
		const young = deriveAppearance(mk({ geoActivity: { regime: 'plate-tectonics', surfaceAgeGyr: 0.2 } } as any));
		expect(ancient.craters!.density).toBeGreaterThan(0.9);
		expect((young.craters?.density ?? 0)).toBeLessThan(0.1);
	});

	it('a tidally-locked cratered world reads a leading-hemisphere bias', () => {
		const locked = deriveAppearance(mk({ tidallyLocked: true, geoActivity: { regime: 'inactive', surfaceAgeGyr: 4.6 } } as any));
		const free = deriveAppearance(mk({ geoActivity: { regime: 'inactive', surfaceAgeGyr: 4.6 } } as any));
		expect(locked.craters!.leadBias).toBeGreaterThan(0);
		expect(free.craters!.leadBias).toBe(0);
	});

	it('an icy world FRACTURES instead of cratering (Europa)', () => {
		const europa = deriveAppearance(mk({
			makeup: { ice: 0.5, rock: 0.5 }, geoActivity: { regime: 'cryovolcanic', surfaceAgeGyr: 0.05 },
			volatiles: { retained: ['carbon-dioxide', 'water'] }, tags: [{ key: 'tidal/hotspots' }]
		} as any));
		expect(europa.iceCracks).toBeTruthy();
		expect(europa.craters).toBeNull(); // ice cracks, doesn't crater
	});

	it('a LIQUID-ocean world with bulk ice does NOT fracture (a liquid sea is not a frozen crust)', () => {
		const oceanWorld = deriveAppearance(mk({
			makeup: { rock: 0.5, ice: 0.5 }, temperatureK: 94,
			hydrosphere: { coverage: 0.71, composition: 'methane', layers: [{ location: 'surface', liquid: 'methane' }] }
		} as any));
		expect(oceanWorld.iceCracks).toBeNull(); // liquid surface, not a cracked ice shell
		expect(oceanWorld.craters).toBeNull();
	});

	it('tholins need an organic precursor AND dose: Pluto reddens, Europa (no CH4/N2) does not', () => {
		const pluto = deriveAppearance(mk({
			makeup: { ice: 0.5, rock: 0.5 }, irradiationDose: 0.2,
			geoActivity: { regime: 'inactive', surfaceAgeGyr: 4.6 },
			volatiles: { retained: ['nitrogen', 'methane', 'water'] }
		} as any));
		const europa = deriveAppearance(mk({
			makeup: { ice: 0.5, rock: 0.5 }, irradiationDose: 0.002,
			geoActivity: { regime: 'cryovolcanic', surfaceAgeGyr: 0.05 },
			volatiles: { retained: ['carbon-dioxide', 'water'] }
		} as any));
		expect(pluto.tholin).toBeTruthy();
		expect(pluto.tholin!.strength).toBeGreaterThan(0);
		expect(europa.tholin).toBeNull();
	});

	it('retained bright ices give a frost overlay; SO2-only frost is sulphur-yellow', () => {
		const io = deriveAppearance(mk({
			geoActivity: { regime: 'tidal-volcanic', surfaceAgeGyr: 0.002 },
			volatiles: { retained: ['sulfur-dioxide'] }
		} as any));
		expect(io.frost).toBeTruthy();
		expect(io.frost!.colorHex.toLowerCase()).toBe('#f0e28a');
	});

	it('a super-hot surface incandesces (thermal glow); a cool one does not', () => {
		const lava = deriveAppearance(mk({ temperatureRangeK: { min: 1850, max: 2000 } } as any));
		expect(lava.thermalGlow).toBeTruthy();
		expect(lava.thermalGlow!.strength).toBeGreaterThan(0.7);
		expect(deriveAppearance(mk({ temperatureRangeK: { min: 240, max: 320 } } as any)).thermalGlow).toBeNull();
	});

	it('a tidally-locked hot world is an eyeball; >1200 K substellar is molten (glow confined to the day side)', () => {
		const molten = deriveAppearance(mk({ tidallyLocked: true, temperatureRangeK: { min: 110, max: 1550 } } as any));
		expect(molten.eyeball).toBeTruthy();
		expect(molten.eyeball!.molten).toBe(true);
		expect(molten.eyeball!.kind).toBe('hot');
		expect(molten.thermalGlow).toBeNull(); // the eyeball owns the glow (substellar hemisphere), not a uniform one

		const mercury = deriveAppearance(mk({ tidallyLocked: true, temperatureRangeK: { min: 3, max: 796 } } as any));
		expect(mercury.eyeball!.molten).toBe(false); // baked, not molten
		expect(mercury.eyeball!.kind).toBe('hot');
	});

	it('a locked world with a temperate day side reads a COLD eyeball (an eye of liquid on a frozen world)', () => {
		const cold = deriveAppearance(mk({ tidallyLocked: true, temperatureRangeK: { min: 70, max: 292 } } as any));
		expect(cold.eyeball!.kind).toBe('cold');
		expect(cold.eyeball!.molten).toBe(false);
	});

	it('an UNLOCKED world (no day/night lock) gets no eyeball even if hot', () => {
		expect(deriveAppearance(mk({ temperatureRangeK: { min: 720, max: 772 } } as any)).eyeball).toBeNull();
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

	it('gives cryovolcanic worlds plumes whose reach grows as gravity falls', () => {
		// Gated on the authoritative geoActivity regime (the tag mis-fires on non-cryo bodies).
		// Enceladus-like: tiny, low gravity → jets throw far (reach clamps high).
		const ence = deriveAppearance(mk({ radiusKm: 252, massKg: 1.08e20, geoActivity: { regime: 'cryovolcanic' } } as any));
		expect(ence.cryoPlumes).not.toBeNull();
		expect(ence.cryoPlumes!.reachRadii).toBeGreaterThan(3);
		// A heavy cryovolcanic body: same regime, high gravity → short plumes (reach clamps low).
		const heavy = deriveAppearance(mk({ radiusKm: 6000, massKg: 5e24, geoActivity: { regime: 'cryovolcanic' } } as any));
		expect(heavy.cryoPlumes!.reachRadii).toBeCloseTo(0.8, 6);
		// A body carrying the loose activity/cryovolcanism TAG but NOT the cryovolcanic regime → NO plumes.
		expect(deriveAppearance(mk({ tags: [{ key: 'activity/cryovolcanism' }] })).cryoPlumes).toBeNull();
		// No cryovolcanism at all → no plumes.
		expect(deriveAppearance(mk({})).cryoPlumes).toBeNull();
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
