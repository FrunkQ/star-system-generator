// EXOTICS N1 — PARITY (G58). Every capability declaration is pinned to the LEGACY behaviour it
// will replace, so N1 is zero-behaviour-change BY GATE rather than by assertion, and every field
// on the record is consumed from the day it exists (the board's own `secretDefault` criticism,
// applied to ourselves). When an N2 seam flips, its rows here stop being parity and become the
// spec of record — do not delete them, repoint their comments.
//
// Seen RED first by flipping the ringworld's flux declaration to isotropic (three rows caught it).
import { describe, it, expect } from 'vitest';
import type { CelestialBody } from '$lib/types';
import { MEGA_TYPE_DEFS, defaultMegaParams, type MegaTypeDef } from './megaTypes';
import { starOccluders, starlightBoost } from '$lib/physics/starlightOcclusion';

const sol = (): CelestialBody =>
	({
		id: 'sol', name: 'Sol', parentId: null, tags: [],
		kind: 'body', roleHint: 'star', massKg: 1.989e30, radiusKm: 696340, temperatureK: 5778
	}) as CelestialBody;

const earth = (): CelestialBody =>
	({
		id: 'earth', name: 'Earth', parentId: 'sol', tags: [], kind: 'body', roleHint: 'planet',
		massKg: 5.972e24, radiusKm: 6371, rotation_period_hours: 23.934,
		orbitalBoundaries: {
			minLeoKm: 200, leoMoeBoundaryKm: 2000, meoHeoBoundaryKm: 50000,
			heoUpperBoundaryKm: 1.47e6, geoStationaryKm: 35786, isGeoFallback: false
		}
	}) as CelestialBody;

/** A quiescent black hole of Sagittarius A*'s mass - the Birch shell's natural host. */
const hole = (): CelestialBody =>
	({
		id: 'bh', name: 'The Hole', parentId: null, tags: [], classes: ['star/BH'],
		kind: 'body', roleHint: 'star', massKg: 4.3e6 * 1.989e30, radiusKm: 1.27e7, temperatureK: 0
	}) as CelestialBody;

/** The host whose seeds make sense for this type — a star for star-circlers, a hole for a shell
 *  built round one, a world otherwise. */
const naturalHost = (d: MegaTypeDef): CelestialBody =>
	d.requires.hard?.hostIsBlackHole ? hole() : d.requires.hard?.hostIsStar ? sol() : earth();

describe('every registry record declares capabilities, and they match the behaviour shipped today', () => {
	for (const d of MEGA_TYPE_DEFS) {
		describe(d.key, () => {
			it('render3d mirrors the geometry family switch (megaGeometry.ts) and the scene flags', () => {
				// attachMegaVolume: sphere-section builds and sets megaCentred; tether builds the
				// stood-up ribbon and sets megaTether; a spheroid declines and keeps the hull.
				const expected = {
					'sphere-section': { generator: 'sphere-section', anchor: 'host-centred' },
					tether: { generator: 'tether', anchor: 'surface-stand' },
					spheroid: { generator: 'hull', anchor: 'node' }
				}[d.family];
				expect(d.capabilities.render3d).toEqual(expected);
			});

			it('docking mirrors the 3D anchor: a surface-stand is a LADDER, a host-centred structure docks ANYWHERE, a hull is a POINT', () => {
				const a = d.capabilities.render3d.anchor;
				expect(d.capabilities.docking).toBe(a === 'surface-stand' ? 'ladder' : a === 'host-centred' ? 'anywhere' : 'point');
			});
			it("render2d: sphere-sections ARE their orbit line, a tether is a RADIAL from the host edge, a spheroid is its glyph", () => {
				expect(d.capabilities.render2d.structure).toBe(d.family === 'sphere-section' ? 'orbit-line' : d.family === 'tether' ? 'radial' : 'glyph');
			});

			it("framing mirrors computeBase's three construct shots, keyed today off the same flags", () => {
				const expected = { 'sphere-section': 'annulus', tether: 'surface-host', spheroid: 'point' }[d.family];
				expect(d.capabilities.framing).toBe(expected);
			});

			it('flux matches what derive() actually publishes at defaults', () => {
				const host = naturalHost(d);
				const out = d.derive(defaultMegaParams(d, host), host);
				const occludes = d.capabilities.flux?.occludes;
				if (occludes === undefined) {
					expect(out.starOcclusion ?? 0).toBe(0);
				} else {
					expect(out.starOcclusion!).toBeGreaterThan(0);
					if (occludes === 'band') expect(out.occlusionBandWidthKm!).toBeGreaterThan(0);
					else expect(out.occlusionBandWidthKm).toBeUndefined();
				}
				// THE AMPLIFY CASE (phase 6): declared exactly when derive() publishes an added share -
				// and a type that brightens its target shades nothing (no record does both).
				if (d.capabilities.flux?.amplifies === 'target') {
					expect(out.starAmplification!).toBeGreaterThan(0);
					expect(occludes).toBeUndefined();
				} else {
					expect(d.capabilities.flux?.amplifies).toBeUndefined();
					expect(out.starAmplification).toBeUndefined();
				}
			});

			it('a figure about the STAR is published only by a type that circles one, and never without its units\' partner', () => {
				// The stellar engines publish thrust (and the Caplan its mass loss). No capability axis
				// declares it - nothing consumes it as motion (no event driver, board row G41) - so the
				// gate holds the published side honest: only a star-circler speaks about its star.
				const host = naturalHost(d);
				const out = d.derive(defaultMegaParams(d, host), host);
				const speaks = out.starThrustPhotonFrac !== undefined || out.starThrustN !== undefined || out.starMassLossKgPerS !== undefined;
				if (speaks) expect(d.requires.hard?.hostIsStar, d.key).toBe(true);
				if (out.starThrustPhotonFrac !== undefined) {
					expect(out.starThrustPhotonFrac).toBeGreaterThan(0);
					expect(out.starThrustPhotonFrac).toBeLessThanOrEqual(1);   // all the light out one way is L/c, no more
				}
				if (out.starMassLossKgPerS !== undefined) expect(out.starThrustN!).toBeGreaterThan(0);
			});

			it('apparentG names the figure derive() publishes, and none means NO number', () => {
				const host = naturalHost(d);
				const out = d.derive(defaultMegaParams(d, host), host);
				switch (d.capabilities.apparentG) {
					case 'own-rotation':
						expect(out.spinGravityMs2).not.toBeUndefined();
						expect(out.surfaceGravityMs2).toBeUndefined();
						break;
					case 'surface':
						expect(out.surfaceGravityMs2).not.toBeUndefined();
						expect(out.spinGravityMs2).toBeUndefined();
						break;
					case 'none':
						expect(out.spinGravityMs2).toBeUndefined();
						expect(out.surfaceGravityMs2).toBeUndefined();
						break;
					case 'spin-section':
						throw new Error('no registry type is a station yet — declaring one means the crew-tab seam flipped without updating this gate');
				}
			});
		});
	}
});

describe('the amplify declaration and the who-lights-whom discovery agree across the module seam', () => {
	it('an instance stationed at a world lights it exactly when its record declares flux.amplifies', () => {
		for (const d of MEGA_TYPE_DEFS) {
			const node = {
				id: `m-${d.key}`, name: d.key, parentId: 'earth', tags: [], kind: 'construct', megaType: d.key,
				orbit: { hostId: 'earth', hostMu: 3.986e14, t0: 0, elements: { a_AU: 1e-4, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0 } }
			} as unknown as CelestialBody;
			const lit = starlightBoost(earth(), [sol(), earth(), node]);
			expect(lit.gain > 1, d.key).toBe(d.capabilities.flux?.amplifies === 'target');
		}
	});
});

describe('the flux declarations and the phase-4 occluder discovery agree across the module seam', () => {
	const nodeFor = (key: string, aAU: number): CelestialBody =>
		({
			id: `x-${key}`, name: key, parentId: 'sol', tags: [], kind: 'construct', megaType: key,
			orbit: { hostId: 'sol', hostMu: 1.327e20, t0: 0, elements: { a_AU: aAU, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0 } }
		}) as unknown as CelestialBody;

	it('a star-parented instance is an occluder exactly when its record declares flux', () => {
		for (const d of MEGA_TYPE_DEFS) {
			const found = starOccluders(sol(), [sol(), nodeFor(d.key, 1)]);
			const declares = d.capabilities.flux?.occludes !== undefined;
			expect(found.length, d.key).toBe(declares ? 1 : 0);
			if (declares) {
				expect(found[0].bandHalfAngleRad !== undefined, d.key)
					.toBe(d.capabilities.flux!.occludes === 'band');
			}
		}
	});
});
