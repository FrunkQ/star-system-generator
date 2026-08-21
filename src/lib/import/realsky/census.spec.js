// Turning a raw stellar cone into systems — the two things a cone gets wrong, and the grouping rule.
//
// Fixtures are REAL rows from SIMBAD's cone over 16.5 ly (2026-08-13), because both faults this
// module exists for are properties of the actual catalogue rather than of a shape I could invent.
import { describe, expect, it } from 'vitest';
import {
	normaliseStarRows, groupIntoSystems, projectedSeparationAu, isSameObject, angularSepRad
} from './census.mjs';
import { ORBIT_AUTHOR_MAX_PERIOD_YR } from './clusterGate.mjs';

// Verbatim SIMBAD values: main_id, ra, dec, plx_value, sp_type, otype.
const S = (id, ra, dec, plxMas, sp, otype, massMsun) => ({ id, ra, dec, plxMas, sp, otype, massMsun });

const ALF_CEN     = S('* alf Cen',   219.87500, -60.83278, 750.81, 'G2V+K1V', 'SB*', 1.1);
const ALF_CEN_A   = S('* alf Cen A', 219.90206, -60.83399, 742.12, 'G2V',     'PM*', 1.1);
const ALF_CEN_B   = S('* alf Cen B', 219.89614, -60.83816, 742.12, 'K1V',     'PM*', 0.9);
const PROXIMA     = S('NAME Proxima Centauri', 217.39232, -62.67607, 768.0665, 'M5.5Ve', 'PM*', 0.12);
const SIRIUS_A    = S('* alf CMa',   101.28716, -16.71612, 379.21, 'A0mA1Va', 'SB*', 2.06);
const SIRIUS_B    = S('* alf CMa B', 101.28876, -16.71314, 374.4896, 'DA1.9', 'WD*', 1.02);
const EPS_IND     = S('* eps Ind',   330.83999, -56.78595, 274.8431, 'K5V',   'PM*', 0.75);
const EPS_IND_B   = S('* eps Ind B', 330.75700, -56.86400, 270.658, 'T1V+T6V','BD*', 0.06);
const BARNARD     = S("NAME Barnard's star", 269.45207, 4.69339, 546.9759, 'M4V', 'BY*', 0.16);
const LUHMAN16    = S('NAME Luhman 16', 162.32888, -53.31933, 501.557, 'L7.5+T0.5', '**', 0.06);
const FORTY_ERI_b = S('* omi02 Eri b', 63.81799, -7.65267, 199.608, '', 'err', 0.0);

describe('projected separation', () => {
	// THE MEASUREMENT THAT DROVE THIS MODULE. Sirius A and B differ by 1.2% in parallax; differencing
	// their 3D positions turns that into 6,856 AU of separation for a pair genuinely ~20 AU apart.
	// Projected separation cancels it. Never subtract two parallax positions to find a companion.
	it('recovers the true separation where 3D differencing cannot', () => {
		expect(projectedSeparationAu(SIRIUS_A, SIRIUS_B)).toBeLessThan(60);      // truth ~20 AU
		expect(projectedSeparationAu(ALF_CEN_A, ALF_CEN_B)).toBeLessThan(60);    // truth ~23 AU
		expect(projectedSeparationAu(EPS_IND, EPS_IND_B)).toBeGreaterThan(1000); // truth ~1,460 AU
		expect(projectedSeparationAu(EPS_IND, EPS_IND_B)).toBeLessThan(2500);
	});

	it('is symmetric and zero for a body against itself', () => {
		expect(projectedSeparationAu(ALF_CEN_A, ALF_CEN_B)).toBeCloseTo(projectedSeparationAu(ALF_CEN_B, ALF_CEN_A), 6);
		expect(angularSepRad(BARNARD, BARNARD)).toBeCloseTo(0, 12);
	});
});

describe('normaliseStarRows', () => {
	// SIMBAD is inconsistent: Alpha Centauri comes back as a container AND its two components;
	// Luhman 16 comes back as a container only. Keeping every row invents a star that is not there;
	// dropping every container loses Luhman 16 entirely.
	it('drops a container whose components are present, and keeps one whose are not', () => {
		const { stars, dropped } = normaliseStarRows([ALF_CEN, ALF_CEN_A, ALF_CEN_B, LUHMAN16, BARNARD]);
		const ids = stars.map((s) => s.id);
		expect(ids).toContain('* alf Cen A');
		expect(ids).toContain('* alf Cen B');
		expect(ids).toContain('NAME Luhman 16');       // container, but the only record of its system
		expect(ids).not.toContain('* alf Cen');        // container with components present
		expect(dropped.map((d) => d.id)).toEqual(['* alf Cen']);
		expect(dropped[0].reason).toMatch(/container/);
	});

	// 40 Eridani b is a PLANET that SIMBAD returns with otype 'err'. The ADQL excludes 'Pl'/'Pl?';
	// this is the second net, because a planet imported as a star is a visible nonsense.
	it('drops a planet that the catalogue mislabelled', () => {
		const { stars, dropped } = normaliseStarRows([BARNARD, FORTY_ERI_b]);
		expect(stars.map((s) => s.id)).toEqual(["NAME Barnard's star"]);
		expect(dropped[0].reason).toMatch(/not a star/);
	});

	it('names every row it drops, and never drops silently', () => {
		const rows = [ALF_CEN, ALF_CEN_A, ALF_CEN_B, FORTY_ERI_b, S('no astrometry', NaN, NaN, 0, '', 'PM*', 0.2)];
		const { stars, dropped } = normaliseStarRows(rows);
		expect(stars.length + dropped.length).toBe(rows.length);
		for (const d of dropped) { expect(d.id).toBeTruthy(); expect(d.reason).toBeTruthy(); }
	});

	// ORDER MATTERS, and getting it wrong reintroduced the exact absence D18 exists to fix. A
	// container sits at essentially its primary's position, so running duplicate-detection FIRST let
	// "* alf Cen" swallow "* alf Cen A" — leaving a system called "alf Cen B" with A missing.
	it('never lets a container swallow its own component', () => {
		const { stars } = normaliseStarRows([ALF_CEN, ALF_CEN_A, ALF_CEN_B]);
		const ids = stars.map((s) => s.id);
		expect(ids).toContain('* alf Cen A');
		expect(ids).toContain('* alf Cen B');
		expect(ids).not.toContain('* alf Cen');
		expect(stars.length).toBe(2);
	});

	it('treats one object under two identifiers as one star', () => {
		const alias = { ...ALF_CEN_A, id: 'HD 128620' };
		expect(isSameObject(ALF_CEN_A, alias)).toBe(true);
		expect(isSameObject(ALF_CEN_A, ALF_CEN_B)).toBe(false);   // 23 AU apart — two real stars
		const { stars } = normaliseStarRows([ALF_CEN_A, alias, ALF_CEN_B]);
		expect(stars.length).toBe(2);
	});
});

describe('groupIntoSystems', () => {
	// The rule is the engine's existing period tier, not a new one: share a system when the mutual
	// orbit is short enough to matter. Same constant that makes Sgr A*'s S-stars one system.
	it('groups a close pair and leaves unrelated stars alone', () => {
		const groups = groupIntoSystems([ALF_CEN_A, ALF_CEN_B, BARNARD]);
		expect(groups.length).toBe(2);
		const pair = groups.find((g) => g.length === 2);
		expect(pair.map((s) => s.id).sort()).toEqual(['* alf Cen A', '* alf Cen B']);
		expect(groups.find((g) => g.length === 1)[0].id).toBe("NAME Barnard's star");
	});

	// THE CALIBRATION CHECK, and nothing was tuned to make it pass: with projected separation and the
	// existing 1 Myr tier, Proxima joins Alpha Centauri at ~0.98 Myr — which is where a human put it
	// in the hand-curated bundled map (sys-alphacen).
	it('puts Proxima in Alpha Centauri, as the hand-curated map does', () => {
		const groups = groupIntoSystems([ALF_CEN_A, ALF_CEN_B, PROXIMA]);
		expect(groups.length).toBe(1);
		expect(groups[0].length).toBe(3);
	});

	it('leads each group with its heaviest star', () => {
		const [g] = groupIntoSystems([ALF_CEN_B, ALF_CEN_A]);
		expect(g[0].id).toBe('* alf Cen A');     // 1.1 Msun before 0.9
	});

	// The threshold is a PARAMETER, per the owner's instruction — tighten it and the widest pair falls
	// out first, which is the behaviour a GM tuning it would expect.
	it('honours a tightened period threshold', () => {
		const wide = groupIntoSystems([ALF_CEN_A, ALF_CEN_B, PROXIMA], { maxPeriodYr: ORBIT_AUTHOR_MAX_PERIOD_YR });
		const tight = groupIntoSystems([ALF_CEN_A, ALF_CEN_B, PROXIMA], { maxPeriodYr: 1000 });
		expect(wide.length).toBe(1);
		expect(tight.length).toBe(2);            // Proxima splits off; A+B (84 yr) stay together
	});

	// Projected separation deliberately ignores the line of sight — which is what makes it immune to
	// parallax noise, and what would otherwise pair any two stars that happen to line up. Wolf 28 and
	// HD 4628 were grouped exactly that way before the parallax-agreement gate went in.
	it('does not pair a chance line-of-sight alignment', () => {
		const near = S('near star', 100.0, -20.0, 300, 'M3V', 'PM*', 0.3);
		const farBehind = { ...near, id: 'far star', plxMas: 120 };   // same sky spot, 2.5x further away
		expect(groupIntoSystems([near, farBehind]).length).toBe(2);
	});

	it('returns every star exactly once', () => {
		const rows = [ALF_CEN_A, ALF_CEN_B, PROXIMA, BARNARD, SIRIUS_A, SIRIUS_B, EPS_IND, EPS_IND_B];
		const groups = groupIntoSystems(rows);
		expect(groups.flat().length).toBe(rows.length);
		expect(new Set(groups.flat().map((s) => s.id)).size).toBe(rows.length);
	});
});
