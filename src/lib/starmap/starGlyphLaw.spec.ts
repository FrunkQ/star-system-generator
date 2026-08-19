// THE STARMAP GLYPH LAW (G26/C17): sizes and spreads are SCREEN quantities, bands come from the MK
// class, the scaler interpolates from all-equal to fully separated, and the old hand-written layout
// falls out of it exactly at scaler 0.
import { describe, it, expect } from 'vitest';
import {
	bandScale, sizeBandOfClass, sizeBandOf, clusterLayout, clusterHalfExtent, starClusterOffsets,
	BAND_FULL_SPREAD, SIZE_BANDS, letterTilt, glyphScale, spectralLetterOfBody, LETTER_TILT_FULL
} from './starGlyphLaw';

describe('the band from the class key (B60 designations)', () => {
	it('reads the luminosity class off the designation', () => {
		expect(sizeBandOfClass('star/G2V')).toBe('dwarf');
		expect(sizeBandOfClass('star/M5.5V')).toBe('dwarf');
		expect(sizeBandOfClass('star/F5IV')).toBe('dwarf');       // subgiant: with the dwarfs
		expect(sizeBandOfClass('star/K-III')).toBe('giant');
		expect(sizeBandOfClass('star/M-III')).toBe('giant');
		expect(sizeBandOfClass('star/B-II')).toBe('giant');       // bright giant: with the giants (owner: III/II)
		expect(sizeBandOfClass('star/M-I')).toBe('supergiant');
		expect(sizeBandOfClass('star/M1.5Iab')).toBe('supergiant'); // Betelgeuse as SIMBAD writes it
		expect(sizeBandOfClass('star/B8Ia')).toBe('supergiant');
	});
	it('remnants and brown dwarfs are the compact band; a bare letter or nothing is a dwarf', () => {
		for (const k of ['star/WD', 'star/NS', 'star/BH', 'star/BH_active', 'star/magnetar']) expect(sizeBandOfClass(k)).toBe('compact');
		expect(sizeBandOfClass('star/T6')).toBe('compact');
		expect(sizeBandOfClass('star/L7.5')).toBe('compact');
		expect(sizeBandOfClass('star/G')).toBe('dwarf');
		expect(sizeBandOfClass(undefined)).toBe('dwarf');
		expect(sizeBandOfClass('star/unknown')).toBe('dwarf');
	});
	it('reads the body: stellarType first, then EVERY star/ class — the one that states a band wins, whatever the order', () => {
		expect(sizeBandOf({ classes: ['star/M1.5Iab', 'star/M'] })).toBe('supergiant');
		expect(sizeBandOf({ classes: ['star/K', 'star/K-III'] })).toBe('giant');       // letter first in the save
		expect(sizeBandOf({ classes: ['star/G', 'star/G2V'] })).toBe('dwarf');          // the Sol fixture's order
		expect(sizeBandOf({ classes: ['star/M'], stellarType: { spectral: 'M', luminosity: 'III' } })).toBe('giant');
		expect(sizeBandOf({ classes: ['star/B'], stellarType: { spectral: 'B', luminosity: 'Iab' } })).toBe('supergiant');
		expect(sizeBandOf({ classes: ['star/WD'], stellarType: { spectral: 'WD' } })).toBe('compact');
		expect(sizeBandOf({ classes: [] })).toBe('dwarf');
		expect(sizeBandOf(null)).toBe('dwarf');
	});
	it('and the spectral letter, for the dwarf tilt', () => {
		expect(spectralLetterOfBody({ classes: ['star/G2V', 'star/G'] })).toBe('G');
		expect(spectralLetterOfBody({ classes: ['star/M5.5V'] })).toBe('M');
		expect(spectralLetterOfBody({ classes: ['star/WD'] })).toBeUndefined();
		expect(spectralLetterOfBody({ classes: ['star/O'], stellarType: { spectral: 'O' } })).toBe('O');
		expect(spectralLetterOfBody({ classes: ['star/T6'] })).toBeUndefined();
	});
});

describe('the letter tilt within the dwarf band', () => {
	it('is 1 for everyone at spread 0 and ordered O > B > A > F > G > K > M at 1', () => {
		for (const L of 'OBAFGKM') expect(letterTilt(L, 0)).toBe(1);
		const at1 = [...'OBAFGKM'].map((L) => letterTilt(L, 1));
		for (let i = 1; i < at1.length; i++) expect(at1[i]).toBeLessThan(at1[i - 1]);
		expect(letterTilt('G', 1)).toBe(1);
		expect(letterTilt(undefined, 1)).toBe(1);
		expect(letterTilt('WD', 1)).toBe(1);
	});
	it('applies ONLY to dwarfs, and never to a fixed member, and keeps the band ordering', () => {
		expect(glyphScale({ band: 'dwarf', letter: 'M' }, 1)).toBe(LETTER_TILT_FULL.M);
		expect(glyphScale({ band: 'dwarf', letter: 'O' }, 1)).toBe(LETTER_TILT_FULL.O);
		expect(glyphScale({ band: 'giant', letter: 'M' }, 1)).toBe(BAND_FULL_SPREAD.giant);
		expect(glyphScale({ band: 'compact', letter: 'M', fixed: true }, 1)).toBe(1);
		// compact < M dwarf < G dwarf < O dwarf < giant < supergiant
		const order = [glyphScale({ band: 'compact' }, 1), glyphScale({ band: 'dwarf', letter: 'M' }, 1), glyphScale({ band: 'dwarf', letter: 'G' }, 1), glyphScale({ band: 'dwarf', letter: 'O' }, 1), glyphScale({ band: 'giant' }, 1), glyphScale({ band: 'supergiant' }, 1)];
		for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
	});
	it('an all-V map (a generated one) now spreads at scaler 1: an M dwarf is visibly smaller than an A dwarf', () => {
		const slots = clusterLayout([{ band: 'dwarf', letter: 'A' }, { band: 'dwarf', letter: 'M' }], 1);
		expect(slots[0].scale / slots[1].scale).toBeGreaterThan(1.25);
	});
});

describe('the scaler', () => {
	it('at 0 every band is 1 — the old equal-size map', () => {
		for (const b of SIZE_BANDS) expect(bandScale(b, 0)).toBe(1);
	});
	it('at 1 the four bands are four visibly different sizes, monotone compact < dwarf < giant < supergiant', () => {
		const at1 = SIZE_BANDS.map((b) => bandScale(b, 1));
		expect(at1).toEqual(SIZE_BANDS.map((b) => BAND_FULL_SPREAD[b]));
		for (let i = 1; i < at1.length; i++) expect(at1[i]).toBeGreaterThan(at1[i - 1] * 1.2);
	});
	it('interpolates linearly and clamps the dial', () => {
		expect(bandScale('supergiant', 0.5)).toBeCloseTo(1.5, 9);
		expect(bandScale('compact', 2)).toBe(BAND_FULL_SPREAD.compact);
		expect(bandScale('giant', -1)).toBe(1);
		expect(bandScale('giant', NaN)).toBe(1);
	});
});

describe('the cluster layout', () => {
	it('reproduces the old hand-written 2D arrangement at scaler 0 (r 5 world units: x +-5, (0,-6)/(+-6,+5), (0,+-6)/(+-7,0))', () => {
		const u = 5;
		const two = clusterLayout(['dwarf', 'dwarf'], 0);
		expect(two.map((s) => [s.dx * u, s.dy * u])).toEqual([[-5, 0], [5, 0]]);
		const three = clusterLayout(['dwarf', 'dwarf', 'dwarf'], 0);
		expect(three.map((s) => [Math.round(s.dx * u), Math.round(s.dy * u)])).toEqual([[0, -6], [-6, 5], [6, 5]]);
		const four = clusterLayout(['dwarf', 'dwarf', 'dwarf', 'dwarf'], 0);
		expect(four.map((s) => [Math.round(s.dx * u), Math.round(s.dy * u)])).toEqual([[0, -6], [0, 6], [-7, 0], [7, 0]]);
		expect(starClusterOffsets(5)).toHaveLength(5);
	});
	it('and the old glyph-half table (5/10/11/12 wide, 5/5/11/11 tall) falls out of clusterHalfExtent', () => {
		const h = (n: number) => { const e = clusterHalfExtent(clusterLayout(Array(n).fill('dwarf'), 0)); return [Math.round(e.w * 5), Math.round(e.h * 5)]; };
		expect(h(1)).toEqual([5, 5]);
		expect(h(2)).toEqual([10, 5]);
		expect(h(3)).toEqual([11, 11]);
		expect(h(4)).toEqual([12, 11]);
	});
	it('scales the spread by the LARGEST member so a giant beside a dwarf does not swallow it', () => {
		const pair = clusterLayout(['giant', 'dwarf'], 1);
		expect(pair[0].scale).toBe(BAND_FULL_SPREAD.giant);
		expect(pair[1].scale).toBe(1);
		// Offsets +-1 unit times the giant's factor: the discs (radii 1.45 and 1) just touch at 1.45 + 1
		// = 2.45 < the 2.9 between centres.
		expect(Math.abs(pair[0].dx - pair[1].dx)).toBeCloseTo(2 * BAND_FULL_SPREAD.giant, 9);
		expect(Math.abs(pair[0].dx - pair[1].dx)).toBeGreaterThan(pair[0].scale + pair[1].scale);
	});
	it('a single star sits on the system point at every scaler', () => {
		for (const sp of [0, 0.5, 1]) { const one = clusterLayout(['supergiant'], sp); expect(one[0].dx).toBe(0); expect(one[0].dy).toBe(0); }
	});
	it('Alpha Centauri: three dwarfs, the same compact cluster at every scaler (all V, so nothing spreads)', () => {
		const a = clusterLayout(['dwarf', 'dwarf', 'dwarf'], 0), b = clusterLayout(['dwarf', 'dwarf', 'dwarf'], 1);
		expect(b).toEqual(a);
	});
});

// THE POINT OF THE LAW, stated as arithmetic. The glyph radius in WORLD units is (px * worldPerPx)
// and worldPerPx is proportional to camera distance — so the on-screen size and spread are constant.
// The old code had R = 0.22 world units, which at three zooms gives three different pixel sizes.
describe('screen terms versus world constants (C17)', () => {
	const fovRad = (45 * Math.PI) / 180, viewH = 800;
	const worldPerPx = (dist: number) => (2 * dist * Math.tan(fovRad / 2)) / viewH;
	it('a 9 px layout radius is 9 px at every camera distance; the old 0.22 world units is not', () => {
		const px = (worldR: number, dist: number) => worldR / worldPerPx(dist);
		for (const d of [22.7, 5, 1]) expect(px(9 * worldPerPx(d), d)).toBeCloseTo(9, 9);
		const old = [22.7, 5, 1].map((d) => px(0.22, d));
		expect(old[2]).toBeGreaterThan(old[0] * 20);   // 22x wider zoomed in: the light-years of fuzz
	});
	it('and a triple\'s spread is 2.4 layout radii on screen wherever the camera is', () => {
		const slots = clusterLayout(['dwarf', 'dwarf', 'dwarf'], 0);
		const spreadUnits = Math.abs(slots[1].dx - slots[2].dx);
		for (const d of [22.7, 5, 1]) expect((spreadUnits * 9 * worldPerPx(d)) / worldPerPx(d)).toBeCloseTo(2.4 * 9, 9);
	});
});

describe('a black hole keeps its glyph', () => {
	it('never shrinks with the scaler while the white dwarf beside it does', () => {
		const slots = clusterLayout([{ band: 'compact', fixed: true }, { band: 'compact' }], 1);
		expect(slots[0].scale).toBe(1);                       // the hole
		expect(slots[1].scale).toBe(BAND_FULL_SPREAD.compact); // the dwarf
	});
	it('four DRAWN sizes at scaler 1: supergiant, dwarf, white dwarf, hole', () => {
		// Layout factors: 2 / 1 / 0.6 / 1 — the hole's slot matches a dwarf's, but its glyph sprite is
		// 5.4 layout units across against a dwarf's 1.0 disc, so what is drawn is four sizes.
		const slots = clusterLayout(['supergiant', 'dwarf', 'compact', { band: 'compact', fixed: true }], 1);
		expect(slots.map((s) => s.scale)).toEqual([2, 1, 0.6, 1]);
		const HOLE_GLYPH = 5.4, DISC = 1.0;
		const drawn = [slots[0].scale * DISC, slots[1].scale * DISC, slots[2].scale * DISC, slots[3].scale * HOLE_GLYPH];
		expect(new Set(drawn).size).toBe(4);
	});
});
