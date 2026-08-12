// Real-sky import — bulk-makeup inference.
//
// `defaultMakeup` is the ONLY composition inference for every imported planet:
// four branches, one call site in each of its two consumers (the in-app
// converter at convert.mjs:96 and the build kit at build-starmaps.mjs:144), and
// its verdict is written into both shipped starmaps. So it gets its own pin.
//
// The case that earned this file is eps Ind A b (D17): a 6.5 Jupiter-mass
// companion whose 5.56 g/cc is arithmetically CORRECT — past about one Jupiter
// mass a giant stops growing and compresses, so mass climbs into a near-constant
// volume — but which the density branch read as rock because it was tested
// before mass. The classifier, reading the same two figures, called it a
// super-Jupiter at the same time. Two subsystems, one question, two answers.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defaultMakeup, estimateRadiusRe } from './planets.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cache = JSON.parse(readFileSync(
	resolve(here, join('..', '..', '..', '..', 'scripts', 'starmap-build', 'data', 'cache', 'archive-pscomppars.json')), 'utf-8'
));

const gasFraction = (mk) => mk.gas ?? 0;
const rockFraction = (mk) => (mk.rock ?? 0) + (mk.metal ?? 0);

describe('defaultMakeup', () => {
	it('reads a self-compressed giant as an envelope, not as rock (D17)', () => {
		// eps Ind A b, verbatim from the archive: 2065.88 Me, 5.54 g/cc.
		const mk = defaultMakeup(2065.8846455, 5.54);
		expect(gasFraction(mk)).toBeGreaterThan(0.8);
		expect(rockFraction(mk)).toBeLessThan(0.1);
	});

	// The three rows in the whole catalogue that are past the terrestrial ceiling with a
	// genuinely MEASURED radius and a density over 4 g/cc. The mass rule defaults them to
	// giants and the measurement overrules it — otherwise 55 Cancri e, one of the best
	// characterised rocky planets there is, would import as a gas giant.
	it('lets a MEASURED density overrule the mass rule below the giant threshold', () => {
		for (const [name, m, dens, radiusRe] of [
			['HD 219134 b', 4.74, 6.34, 1.602],
			['HD 219134 c', 4.36, 6.95, 1.511],
			['55 Cnc e', 7.99, 6.66, 1.875]
		]) {
			const mk = defaultMakeup(m, dens, name, radiusRe);
			expect(rockFraction(mk), name).toBeGreaterThan(0.9);
			expect(gasFraction(mk), name).toBe(0);
		}
	});

	// …but the same density on a BACK-FILLED radius proves nothing, so the mass rule stands.
	it('ignores a dense-looking back-filled row', () => {
		const backfilled = estimateRadiusRe(6);            // exactly what the archive would compute
		expect(gasFraction(defaultMakeup(6, 6.34, 'x', backfilled))).toBeGreaterThanOrEqual(0.8);
	});

	// And no measurement whatever can make a GIANT rocky — eps Ind A b's radius IS measured
	// (12.7 R⊕ against the estimator's 12) and its 5.54 g/cc is real. This exact case
	// regressed once while the measured-density exception was being added.
	it('lets no density, measured or not, make a giant rocky (D17)', () => {
		expect(gasFraction(defaultMakeup(2065.88, 5.54, 'eps', 12.7))).toBeGreaterThanOrEqual(0.8);
		expect(gasFraction(defaultMakeup(7977.5, 25.4, 'gj680', 12))).toBeGreaterThanOrEqual(0.8);
	});

	it('gives every giant an envelope whether or not a density is quoted', () => {
		for (const dens of [null, undefined, 0.3, 1.33, 5.54, 25.4, 33.5]) {
			const mk = defaultMakeup(2065.88, dens, 'eps-ind-b');
			expect(gasFraction(mk)).toBeGreaterThanOrEqual(0.8);
		}
	});

	// The owner's rule, 2026-08-12: above ~4 M⊕ a planet is likelier a giant than a
	// terrestrial, so mass alone decides and the circular catalogue density (DATA-R7)
	// is never consulted there. Nothing between 4 M⊕ and the top of the catalogue may
	// come back rocky, whatever density is quoted.
	it('never reads a back-filled row above the terrestrial ceiling as rock', () => {
		for (const m of [4, 6.5, 11.09, 36, 40, 100, 317.8, 2065.88]) {
			for (const dens of [null, 0.5, 2.4, 4.1, 6.34, 33.5]) {
				// back-filled radius — i.e. the density carries no independent information
				const mk = defaultMakeup(m, dens, `b-${m}-${dens}`, estimateRadiusRe(m));
				expect(gasFraction(mk), `${m} Me at ${dens} g/cc`).toBeGreaterThanOrEqual(0.8);
				expect(rockFraction(mk), `${m} Me at ${dens} g/cc`).toBeLessThanOrEqual(0.05);
			}
		}
	});

	it('leaves the terrestrial branches as they were', () => {
		expect(defaultMakeup(1.05, 5.46, 'x')).toEqual({ rock: 0.62, metal: 0.33, ice: 0.05 });
		expect(defaultMakeup(3.9, 3.67, 'x')).toEqual({ rock: 0.65, metal: 0.30, ice: 0.05 });
	});

	// Varied, but not random: the seed is the body's own id, the same one that fixes
	// its orbital elements, so a re-import reproduces the map exactly (DATA-R2).
	it('varies giants across a map yet reproduces each one exactly', () => {
		const seeds = ['gj-674-b', 'gj-687-b', 'gj-876-e', 'lacaille-9352-c', 'wolf-1061-d', 'kapteyn-c'];
		const drawn = seeds.map((s) => defaultMakeup(12, 1.5, s).gas);
		expect(new Set(drawn).size).toBeGreaterThan(1);                     // not one figure repeated
		for (const s of seeds) expect(defaultMakeup(12, 1.5, s)).toEqual(defaultMakeup(12, 1.5, s));
		for (const g of drawn) expect(g).toBeGreaterThanOrEqual(0.8) && expect(g).toBeLessThanOrEqual(0.92);
	});

	it('always returns fractions that sum to one', () => {
		for (const m of [0.5, 3.9, 4, 12, 40, 2065.88]) {
			const mk = defaultMakeup(m, 2.0, `sum-${m}`);
			const sum = Object.values(mk).reduce((a, b) => a + b, 0);
			expect(sum, `${m} Me -> ${JSON.stringify(mk)}`).toBeCloseTo(1, 9);
		}
	});

	it('no archive row is called rocky while its mass says giant', () => {
		// The whole-catalogue statement of the same rule: whatever the branches
		// do, mass and composition must not contradict each other. Six rows in the
		// committed cache failed this before the ceiling.
		const contradictions = cache
			.filter((r) => r.pl_bmasse != null)
			.map((r) => ({ name: r.pl_name, m: r.pl_bmasse, mk: defaultMakeup(r.pl_bmasse, r.pl_dens) }))
			.filter((x) => x.m >= 40 && rockFraction(x.mk) > 0.5)
			.map((x) => `${x.name} (${x.m.toFixed(0)} Me)`);
		expect(contradictions).toEqual([]);
	});
});

describe('estimateRadiusRe', () => {
	// This estimator is NEVER REACHED by either bundled map: all 182 rows in the
	// committed cache carry pl_rade, because pscomppars back-fills a radius from
	// mass when none was measured — using essentially this same relation. That is
	// D7's circularity, and it is measured here rather than asserted: a radius
	// the archive derived from the mass makes pl_dens a pure function of the mass,
	// so `density > 4` becomes a MASS test wearing a density costume (it is true
	// over 0.162-3.50 Me and nowhere else in the sub-giant range).
	it('reproduces the archive radius for three quarters of the catalogue', () => {
		const withBoth = cache.filter((r) => r.pl_bmasse != null && r.pl_rade != null);
		const backfilled = withBoth.filter(
			(r) => Math.abs(r.pl_rade - estimateRadiusRe(r.pl_bmasse)) / estimateRadiusRe(r.pl_bmasse) < 0.01
		);
		expect(withBoth.length).toBe(182);
		expect(backfilled.length).toBeGreaterThan(120);
	});

	it('never lets the estimator run for a bundled map, because pl_rade is always present', () => {
		expect(cache.filter((r) => r.pl_rade == null)).toEqual([]);
	});
});
