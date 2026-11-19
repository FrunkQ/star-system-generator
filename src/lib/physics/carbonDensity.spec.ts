// v4-plans section 4 B2 / discord B7 - "idk why Carbon cannot be seen in densities when I type a value".
//
// Typing a density re-infers the interior makeup from it, and the inference is a LADDER of the two
// grain densities that bracket the number: metal-rock, rock-ice, ice-gas. Carbon (2.3 g/cc) sits
// between rock and ice and is never a rung, so every density-driven recomposition came back with
// carbon 0 - a carbon world stopped being one the moment a density was typed, and with the mass
// locked even re-typing the density it already had did it.
//
// The carbon the body ALREADY HAS is now carried through, and the rest of the body is solved to the
// density that makes the whole come out right.
import { describe, it, expect } from 'vitest';
import { inferMakeupFromDensity, normalizeMakeup, bulkDensityFromMakeup, compressedDensityFromMakeup, radiusReFromMassMakeup } from './makeup';
import { editDensity, editDensityAnchored, editRadius, editMass, densityGcc, trimEnvelope } from './bodyEdit';

const carbonWorld = (() => {
	const makeup = normalizeMakeup({ carbon: 0.5, rock: 0.5 });
	const massMe = 2;
	return { massMe, radiusRe: radiusReFromMassMakeup(massMe, makeup, 1), makeup };
})();
const ownDensity = densityGcc(carbonWorld.massMe, carbonWorld.radiusRe);

describe('B2 - a typed density keeps the carbon a world already has', () => {
	it('the premise: the typed values below are OUTSIDE the mix\'s own trim band, so the makeup is re-inferred', () => {
		const env = trimEnvelope(carbonWorld.massMe, carbonWorld.makeup);
		expect(4.0).toBeLessThan(env.denLo);
		expect(5.0).toBeGreaterThan(env.denHi);
	});

	it('typing a lower or a higher density keeps the full 50% carbon, and still honours the density', () => {
		for (const typed of [3.0, 3.5, 4.0, 5.0, 5.5]) {
			const out = editDensityAnchored(carbonWorld, typed);
			expect(out.outOfBand).toBe(true);
			expect(out.makeup.carbon, `carbon at ${typed} g/cc`).toBeCloseTo(0.5, 6);
			// The makeup really does give the density that was typed (same model that sizes the body).
			expect(compressedDensityFromMakeup(out.massMe, out.makeup)).toBeCloseTo(typed, 4);
			expect(densityGcc(out.massMe, out.radiusRe)).toBeCloseTo(typed, 6);
		}
	});

	it('with the mass locked, re-typing the density it already has changes nothing', () => {
		const out = editDensity(carbonWorld, ownDensity, 'mass');
		expect(out.makeup.carbon).toBeCloseTo(0.5, 6);
		expect(out.makeup.rock).toBeCloseTo(0.5, 4);
		expect(out.makeup.ice).toBeCloseTo(0, 4);
	});

	it('a radius edit and a radius-locked mass edit carry the carbon too', () => {
		expect(editRadius(carbonWorld, carbonWorld.radiusRe * 1.01, 'mass').makeup.carbon).toBeCloseTo(0.5, 6);
		expect(editMass(carbonWorld, carbonWorld.massMe * 1.05, 'radius').makeup.carbon).toBeCloseTo(0.5, 6);
	});

	it('carbon gives ground only when the density cannot hold it: as much as fits, never a wrong density', () => {
		// 10 g/cc at 2 Earth masses is past anything half-carbon can be (carbon + pure iron tops out lower).
		const dense = editDensity(carbonWorld, 10, 'mass');
		expect(dense.makeup.carbon).toBeGreaterThan(0);
		expect(dense.makeup.carbon).toBeLessThan(0.5);
		expect(dense.makeup.metal).toBeCloseTo(1 - dense.makeup.carbon, 6);    // the rest is all iron
		expect(compressedDensityFromMakeup(dense.massMe, dense.makeup)).toBeCloseTo(10, 4);
		// ...and past solid iron there is no room for any.
		expect(inferMakeupFromDensity(9, 0.5)).toEqual({ metal: 1 });
	});

	it('the inversion is exact: whatever share is kept, the blend has the density asked for', () => {
		for (const d of [0.4, 1.0, 2.0, 2.3, 3.0, 4.5, 6.5]) {
			for (const c of [0.1, 0.3, 0.5, 0.9]) {
				expect(bulkDensityFromMakeup(inferMakeupFromDensity(d, c)), `d=${d} c=${c}`).toBeCloseTo(d, 9);
			}
		}
	});

	it('a body with no carbon infers exactly as it always did (absolute values, not a ratio)', () => {
		expect(inferMakeupFromDensity(5.4).metal).toBeCloseTo(0.66788, 4);     // Mercury-like: two thirds iron
		expect(inferMakeupFromDensity(5.4).rock).toBeCloseTo(0.33212, 4);
		expect(inferMakeupFromDensity(2.0).rock).toBeCloseTo(0.73723, 4);
		expect(inferMakeupFromDensity(0.5).ice).toBeCloseTo(0.86988, 4);
		expect(inferMakeupFromDensity(9)).toEqual({ metal: 1 });
		for (const d of [0.5, 2.0, 5.4]) expect(inferMakeupFromDensity(d).carbon).toBeUndefined();
		expect(inferMakeupFromDensity(5.4, 0)).toEqual(inferMakeupFromDensity(5.4));
		// And through the editor: a plain rock world gains no carbon from a density edit.
		const rock = { massMe: 1, radiusRe: 1, makeup: normalizeMakeup({ rock: 0.68, metal: 0.32 }) };
		expect(editDensity(rock, 4.2, 'mass').makeup.carbon).toBe(0);
	});
});
