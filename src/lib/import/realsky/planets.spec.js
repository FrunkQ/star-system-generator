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

	it('still reads a genuinely dense SMALL planet as rock', () => {
		// HD 219134 b: 4.74 Me at a MEASURED 6.34 g/cc. The density branch exists
		// for this case and the ceiling must not disarm it.
		const mk = defaultMakeup(4.74, 6.34);
		expect(rockFraction(mk)).toBeGreaterThan(0.9);
		expect(gasFraction(mk)).toBe(0);
	});

	it('gives every giant an envelope whether or not a density is quoted', () => {
		for (const dens of [null, undefined, 0.3, 1.33, 5.54, 25.4, 33.5]) {
			const mk = defaultMakeup(2065.88, dens);
			expect(gasFraction(mk)).toBeGreaterThan(0.8);
		}
	});

	it('leaves the sub-giant branches ordered as they were', () => {
		expect(defaultMakeup(1.05, 5.46)).toEqual({ rock: 0.62, metal: 0.33, ice: 0.05 });
		expect(defaultMakeup(3.9, 3.67)).toEqual({ rock: 0.65, metal: 0.30, ice: 0.05 });
		expect(defaultMakeup(11.09, 1.65)).toEqual({ ice: 0.55, gas: 0.25, rock: 0.20 });
		expect(defaultMakeup(317.8, 1.33)).toEqual({ gas: 0.85, ice: 0.10, rock: 0.05 });
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
