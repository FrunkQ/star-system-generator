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
import { starOccluders } from '$lib/physics/starlightOcclusion';

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

/** The host whose seeds make sense for this type — a star for star-circlers, a world otherwise. */
const naturalHost = (d: MegaTypeDef): CelestialBody => (d.requires.hard?.hostIsStar ? sol() : earth());

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

			it("render2d mirrors isMegaRing's rule (SystemVisualizer ~797): sphere-sections ARE their orbit line", () => {
				expect(d.capabilities.render2d.structure).toBe(d.family === 'sphere-section' ? 'orbit-line' : 'glyph');
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
				expect(d.capabilities.flux?.amplifies).toBeUndefined(); // reserved for the soletta (N4)
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
