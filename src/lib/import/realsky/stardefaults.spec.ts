// Real-sky import — star-completion tests: catalogue stars get the pack-band
// magnetic field and spin tilt the generator gives its own stars, seeded per
// star id (deterministic), and never overwrite a value that is present.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CelestialBody } from '$lib/types';
import { SOL_CENTRE } from './query.mjs';
import { convertArchiveRows } from './convert.mjs';
import { buildSgrAStarSystem } from './sgrastar.mjs';
import { completeImportedStars } from './stardefaults';
import { loadStarterPack } from './testPack';

const repo = resolve(__dirname, '..', '..', '..', '..');
const cache = JSON.parse(readFileSync(join(repo, 'scripts', 'starmap-build', 'data', 'cache', 'archive-pscomppars.json'), 'utf-8'));

const rulePack = loadStarterPack();
const stars = (systems: any[]) =>
  systems.flatMap((s) => s.system.nodes.filter((n: any) => n.roleHint === 'star')) as CelestialBody[];

describe('completeImportedStars', () => {
  it('every imported star gains a magnetic field and a spin tilt', () => {
    const { systems } = convertArchiveRows(cache, { region: { centre: SOL_CENTRE, radiusLy: 30 }, generated: 'test' });
    completeImportedStars(systems, rulePack);
    for (const s of stars(systems)) {
      expect(s.magneticField?.strengthGauss, `${s.id} field`).toBeGreaterThan(0);
      expect(s.axial_tilt_deg, `${s.id} tilt`).toBeGreaterThanOrEqual(0);
    }
  });

  it('is deterministic per star id across independent runs', () => {
    const a = convertArchiveRows(cache, { region: { centre: SOL_CENTRE, radiusLy: 30 }, generated: 'test' }).systems;
    const b = convertArchiveRows(cache, { region: { centre: SOL_CENTRE, radiusLy: 30 }, generated: 'test' }).systems;
    completeImportedStars(a, rulePack);
    completeImportedStars(b, rulePack);
    expect(stars(a).map((s) => [s.id, s.magneticField?.strengthGauss, s.axial_tilt_deg]))
      .toEqual(stars(b).map((s) => [s.id, s.magneticField?.strengthGauss, s.axial_tilt_deg]));
  });

  it('never overwrites a value that is already present', () => {
    const { systems } = convertArchiveRows(cache, { region: { centre: SOL_CENTRE, radiusLy: 20 }, generated: 'test' });
    const first = stars(systems)[0];
    first.magneticField = { strengthGauss: 123, manual: true };
    first.axial_tilt_deg = 7;
    completeImportedStars(systems, rulePack);
    expect(first.magneticField.strengthGauss).toBe(123);
    expect(first.axial_tilt_deg).toBe(7);
  });

  it('completes the Sgr A* cluster too (B-star fields, black hole band-zero)', () => {
    const entry = buildSgrAStarSystem();
    completeImportedStars([entry], rulePack);
    for (const s of stars([entry])) {
      if (s.id === 'sgr-a-star') {
        // The pack's star/BH band is 0 by design — a black hole has no surface
        // field to quote. Defined-and-zero, not absent.
        expect(s.magneticField?.strengthGauss, `${s.id}`).toBe(0);
      } else {
        expect(s.magneticField?.strengthGauss, `${s.id}`).toBeGreaterThan(0);
      }
    }
  });
});

// B43: stars had no rotation at all, so no star was ever drawn oblate however fast it should have
// been turning. `completeImportedStars` now supplies one — derived below the Kraft break, drawn
// above it — and these assert the physics rather than the plumbing.
describe('completeImportedStars: rotation', () => {
	const packFor = () => loadStarterPack();
	const sys = (star: any, ageGyr = 4.6) => ([{ system: { nodes: [star], age_Gyr: ageGyr } as any }]);
	const mk = (over: any) => ({
		id: 'star-x', kind: 'body', roleHint: 'star', name: 'X', classes: ['star/G'],
		massKg: 1.989e30, radiusKm: 696340, ...over
	});

	it('gives a Sun-like star roughly the Sun\'s period, because that is the anchor', () => {
		const star: any = mk({});
		completeImportedStars(sys(star, 4.6) as any, packFor() as any);
		// 25 days. The relation is anchored on the Sun by construction, so this is a check that the
		// anchor is wired up, not a discovery.
		expect(star.rotation_period_hours / 24).toBeCloseTo(25, 0);
	});

	it('spins an old M dwarf down hard, and a young star of the same mass much less', () => {
		const old: any = mk({ id: 'm-old', massKg: 0.16 * 1.989e30, radiusKm: 0.19 * 696340 });
		const young: any = mk({ id: 'm-young', massKg: 0.16 * 1.989e30, radiusKm: 0.19 * 696340 });
		completeImportedStars(sys(old, 10) as any, packFor() as any);
		completeImportedStars(sys(young, 0.5) as any, packFor() as any);
		// Barnard's Star is ~130 days at ~10 Gyr; this lands in the same country.
		expect(old.rotation_period_hours / 24).toBeGreaterThan(80);
		expect(old.rotation_period_hours / 24).toBeLessThan(200);
		// Skumanich: P goes as sqrt(age), so 20x younger is ~4.5x faster.
		expect(young.rotation_period_hours).toBeLessThan(old.rotation_period_hours / 3);
	});

	it('does NOT brake a star above the Kraft break — that is why Vega is fast', () => {
		// Vega: 2.14 Msun, ~2.36 Rsun, and OLD enough that gyrochronology would have stopped it dead.
		const vega: any = mk({ id: 'vega', classes: ['star/A'], massKg: 2.135 * 1.989e30, radiusKm: 2.36 * 696340 });
		completeImportedStars(sys(vega, 0.455) as any, packFor() as any);
		// Hours, not days: a hot star keeps its birth spin for life.
		expect(vega.rotation_period_hours).toBeLessThan(48);
		expect(vega.rotation_period_hours).toBeGreaterThan(4);
	});

	it('leaves a remnant alone rather than inventing a spin for it', () => {
		for (const cls of ['star/WD', 'star/NS', 'star/BH']) {
			const r: any = mk({ id: `r-${cls}`, classes: [cls] });
			completeImportedStars(sys(r) as any, packFor() as any);
			expect(r.rotation_period_hours, cls).toBeUndefined();
		}
	});

	it('never overwrites a period the catalogue already gave', () => {
		// SpaceEngine and ubox imports DO carry a real spin; a fill-in must not clobber a measurement.
		const star: any = mk({ rotation_period_hours: 12.5 });
		completeImportedStars(sys(star) as any, packFor() as any);
		expect(star.rotation_period_hours).toBe(12.5);
	});

	it('is deterministic — one person\'s Vega is everyone\'s', () => {
		const a: any = mk({ id: 'vega', classes: ['star/A'], massKg: 2.135 * 1.989e30, radiusKm: 2.36 * 696340 });
		const b: any = mk({ id: 'vega', classes: ['star/A'], massKg: 2.135 * 1.989e30, radiusKm: 2.36 * 696340 });
		completeImportedStars(sys(a, 0.455) as any, packFor() as any);
		completeImportedStars(sys(b, 0.455) as any, packFor() as any);
		expect(a.rotation_period_hours).toBe(b.rotation_period_hours);
	});
});

// B47(c): the importer falls back to 4.6 Gyr — the Sun's age — for a system the catalogue gives no
// age for. That was cosmetic until gyrochronology started deriving ROTATION from it, at which point
// an unknown-age star was silently given the Sun's spin-down. The standing rule catching a real one.
describe('completeImportedStars: an estimated age must not produce a derived spin', () => {
	const mk = (over: any = {}) => ({
		id: 'star-age', kind: 'body', roleHint: 'star', name: 'X', classes: ['star/G'],
		massKg: 1.989e30, radiusKm: 696340, ...over
	});
	const run = (system: any) => {
		completeImportedStars([{ system }] as any, loadStarterPack() as any);
		return system.nodes[0];
	};

	it('derives a spin when the age was MEASURED', () => {
		const star = run({ nodes: [mk()], age_Gyr: 4.6, ageEstimated: false });
		expect(star.rotation_period_hours).toBeGreaterThan(0);
	});

	it('leaves it UNDERIVED when the age is the Sun\'s borrowed by default', () => {
		const star = run({ nodes: [mk({ id: 'star-est' })], age_Gyr: 4.6, ageEstimated: true });
		expect(star.rotation_period_hours).toBeUndefined();
	});

	it('still spins a hot star with an estimated age, because that half never used the age', () => {
		// Above the Kraft break the period is drawn from breakup, not derived from age — so an
		// unknown age is no obstacle there and refusing would be over-correcting.
		const vega = mk({ id: 'v', classes: ['star/A'], massKg: 2.135 * 1.989e30, radiusKm: 2.36 * 696340 });
		const star = run({ nodes: [vega], age_Gyr: 4.6, ageEstimated: true });
		expect(star.rotation_period_hours).toBeGreaterThan(0);
		expect(star.rotation_period_hours).toBeLessThan(48);
	});
});
