// REFUSE TO PRODUCE, NEVER REFUSE TO ACCEPT. These pin that a hand-authored impossibility is KEPT
// and explained, never rejected — and that a plausible star stays silent, which matters more, because
// a tag that fires on ordinary stars is noise a GM learns to ignore.
import { describe, it, expect } from 'vitest';
import { starImplausibilities, STAR_IMPLAUSIBLE_TAG, HYDROGEN_BURNING_LIMIT_SOLAR, DEUTERIUM_BURNING_LIMIT_SOLAR } from './starPlausibility';
import { isLegacyTag, tagSource, describeTag } from '$lib/tags/tagPresentation';
import { loadStarterPack } from '$lib/import/realsky/testPack';

const pack = loadStarterPack() as any;
const SOL = 1.989e30;
const RSUN = 696340;

const star = (over: any = {}) => ({
	id: 's', name: 'S', kind: 'body', roleHint: 'star', parentId: null,
	classes: ['star/G'], massKg: 1 * SOL, radiusKm: 1 * RSUN, temperatureK: 5778,
	radiationOutput: 1, tags: [], ...over
}) as any;

const laws = (b: any) => starImplausibilities(b, pack).map((x) => x.law);

describe('a plausible star says nothing at all', () => {
	it.each([
		['the Sun', {}],
		['a red dwarf', { classes: ['star/M'], massKg: 0.27 * SOL, radiusKm: 0.4 * RSUN, temperatureK: 3050, radiationOutput: 0.0124 }],
		['a red supergiant', { classes: ['star/M-I'], massKg: 16.5 * SOL, radiusKm: 750 * RSUN, temperatureK: 3500, radiationOutput: 75825 }],
		['a white dwarf', { classes: ['star/WD'], massKg: 1 * SOL, radiusKm: 0.014 * RSUN, temperatureK: 24000, radiationOutput: 0.058 }],
		['a neutron star', { classes: ['star/NS'], massKg: 1.8 * SOL, radiusKm: 0.000021 * RSUN, temperatureK: 550000, radiationOutput: 5500 }],
		['a black hole', { classes: ['star/BH'], massKg: 51 * SOL, radiusKm: 0.0002 * RSUN, temperatureK: 0, radiationOutput: 0.05 }],
		['a brown dwarf', { classes: ['star/L'], massKg: 0.07 * SOL, radiusKm: 0.115 * RSUN, temperatureK: 1650, radiationOutput: 0.000088 }]
	])('%s', (_name, over) => {
		expect(laws(star(over))).toEqual([]);
	});

	it('tolerates a GM nudging past a band edge, because bands are typical not fences', () => {
		// star/G is 0.8..1.04 solar. Half again over the top is ordinary GM behaviour, not a fault;
		// the complaint threshold is an ORDER OF MAGNITUDE out.
		expect(laws(star({ massKg: 1.5 * SOL }))).toEqual([]);
	});
});

// THE OWNER'S OWN CASE, 2026-08-15: "when I change spectral type to B and I move it down to 0.01
// solar masses it is obviously wrong."
describe('a B star dragged down to 0.01 solar masses', () => {
	const b = () => star({ classes: ['star/B'], massKg: 0.01 * SOL, radiusKm: 4.2 * RSUN, temperatureK: 20000, radiationOutput: 2532 });

	it('is KEPT, and told exactly what is wrong with it', () => {
		const found = starImplausibilities(b(), pack);
		expect(found.length).toBeGreaterThan(0);
		// It is not a star at all — below deuterium burning, so it cannot fuse anything.
		expect(found.map((f) => f.law)).toContain('no-fusion');
		// ...and it is nothing like the class it claims.
		expect(found.map((f) => f.law)).toContain('mass-outside-class');
	});

	it('names the law and the size of the discrepancy, never just "invalid"', () => {
		const found = starImplausibilities(b(), pack);
		const fusion = found.find((f) => f.law === 'no-fusion')!;
		expect(fusion.detail).toContain('deuterium-burning limit');
		expect(fusion.detail).toContain(String(DEUTERIUM_BURNING_LIMIT_SOLAR));
		expect(fusion.detail).not.toMatch(/invalid/i);
		const band = found.find((f) => f.law === 'mass-outside-class')!;
		expect(band.detail).toMatch(/2\.1.*16 solar masses/); // the pack's own B band, quoted back
	});
});

describe('the fusion limits, which are the lines a mass slider crosses first', () => {
	it('calls a sub-deuterium object no-fusion, and a sub-hydrogen one a brown dwarf', () => {
		expect(laws(star({ massKg: 0.005 * SOL }))).toContain('no-fusion');
		expect(laws(star({ massKg: 0.05 * SOL }))).toContain('brown-dwarf-mass');
		// Just above the hydrogen limit is a real, if feeble, star.
		expect(laws(star({ classes: ['star/M'], massKg: (HYDROGEN_BURNING_LIMIT_SOLAR + 0.01) * SOL,
			radiusKm: 0.12 * RSUN, temperatureK: 2500, radiationOutput: 0.0005 }))).not.toContain('brown-dwarf-mass');
	});

	it('exempts the objects the limits do not apply to', () => {
		// A brown dwarf is SUPPOSED to be under the hydrogen limit; saying so would be noise.
		expect(laws(star({ classes: ['star/T'], massKg: 0.045 * SOL, radiusKm: 0.115 * RSUN, temperatureK: 1000, radiationOutput: 0.000012 })))
			.not.toContain('brown-dwarf-mass');
		// A white dwarf is not fusing and never will be — the limit is meaningless for it.
		expect(laws(star({ classes: ['star/WD'], massKg: 0.6 * SOL, radiusKm: 0.014 * RSUN, temperatureK: 24000, radiationOutput: 0.058 })))
			.not.toContain('brown-dwarf-mass');
	});
});

describe('the other laws', () => {
	it('catches a luminosity that contradicts the size and temperature beside it', () => {
		// B57's fault, now only reachable by hand: generation cannot produce it any more.
		expect(laws(star({ radiationOutput: 1500 }))).toContain('luminosity-mismatch');
		// A black hole is exempt: its output is its accretion disc, not its surface.
		expect(laws(star({ classes: ['star/BH_active'], temperatureK: 0, radiationOutput: 50000 })))
			.not.toContain('luminosity-mismatch');
	});

	it('catches a neutron star too heavy to hold itself up', () => {
		expect(laws(star({ classes: ['star/NS'], massKg: 4 * SOL, radiusKm: 0.000021 * RSUN, temperatureK: 550000, radiationOutput: 5500 })))
			.toContain('above-tov');
	});

	it('catches a star brighter than its own Eddington limit', () => {
		// One solar mass swollen to 250 solar radii at solar temperature: L = 250^2 = 62,500, against
		// an Eddington limit of 32,000 for that mass. Kept SELF-CONSISTENT (L really is R^2 T^4) so
		// this trips Eddington alone and not luminosity-mismatch as well — otherwise the test would
		// pass for the wrong reason.
		const overlit = star({ massKg: 1 * SOL, radiusKm: 250 * RSUN, temperatureK: 5778, radiationOutput: 62500 });
		expect(laws(overlit)).toContain('above-eddington');
		expect(laws(overlit)).not.toContain('luminosity-mismatch');
	});
});

describe('it reads present state only, so V4 dynamic ageing cannot break it', () => {
	it('takes no clock, no age and no history', () => {
		// The signature is (body, pack). Nothing here caches a verdict or asks what time it is, so
		// when ageing moves T, L, M and R the answer simply follows.
		const aged = star({ classes: ['star/G'], massKg: 1 * SOL, radiusKm: 10 * RSUN, temperatureK: 4500, radiationOutput: 36.8 });
		expect(laws(aged)).toEqual([]); // a swollen G is fine; it is the numbers that matter, not when
		expect(starImplausibilities.length).toBe(2); // (body, pack)
	});

	it('says nothing about a non-star', () => {
		expect(starImplausibilities(star({ roleHint: 'planet' }), pack)).toEqual([]);
	});
});

// THE TAG KEY IS LOad-BEARING, and the first version got it wrong in two ways at once. Both were
// silent: the tag worked in-session because the processor re-emits it every pass.
describe('the tag key survives a load and reads as derived', () => {
	it('is NOT stripped as a legacy V1 tag', () => {
		// `isLegacyTag` strips anything under `star/`, because a V1 classification stored AS a tag used
		// that prefix. A `star/implausible` key would have vanished on load.
		expect(isLegacyTag(STAR_IMPLAUSIBLE_TAG)).toBe(false);
		expect(isLegacyTag('star/implausible')).toBe(true); // the shape that was wrong, pinned
	});

	it('reports as PHYSICS-derived rather than as free text the player typed', () => {
		// An unregistered namespace falls through to "manual", which offers a GM a delete button for a
		// tag the engine puts straight back.
		expect(tagSource(STAR_IMPLAUSIBLE_TAG)).toBe('physics');
	});

	it('is red, because it is a complaint', () => {
		expect(describeTag(STAR_IMPLAUSIBLE_TAG).color.toLowerCase()).toBe('#d04a44');
	});
});
