// THE OBSERVED STAR, WHERE IT REACHES A READER (G54 phase 2) — the map colour, the viewpoint, and
// the two tags the physics stamps on the star itself.
//
// The seam this file guards: `observedStar.ts` decides what an observer MEASURES, `systemStars.ts`
// applies it to whatever colour that star already had, and neither invents a second answer. The
// three assertions that matter are that a clear star does not move at all, that a dimmed one moves
// in the right direction without changing hue, and that a ringworld gives two honest and different
// answers to two observers.
import { describe, it, expect } from 'vitest';
import { systemVisualStars, visualStarOf, starmapViewBearing } from './systemStars';
import { STAR_DIMMED_TAG, STAR_IR_EXCESS_TAG, observedStarTags, DUST_OVERRIDE_KEY } from '$lib/physics/observedStar';
import { formatTagValue, describeTag } from '$lib/tags/tagPresentation';
import { SOLAR_RADIUS_KM } from '$lib/constants';
import { SOLAR_TEFF_K } from '$lib/physics/luminosity';
import type { CelestialBody } from '$lib/types';

const sun = (over: Record<string, unknown> = {}): CelestialBody => ({
	id: 'sun', name: 'Sun', kind: 'body', roleHint: 'star', parentId: null, classes: ['star/G2V'],
	massKg: 1.989e30, radiusKm: SOLAR_RADIUS_KM, temperatureK: SOLAR_TEFF_K, tags: [], ...over
} as unknown as CelestialBody);

const mega = (megaType: string, iDeg = 0, id = 'm1'): CelestialBody => ({
	id, name: megaType, kind: 'construct', roleHint: 'mega', parentId: 'sun', tags: [], megaType,
	orbit: { hostId: 'sun', hostMu: 1.327e20, elements: { a_AU: 1, e: 0, i_deg: iDeg, Omega_deg: 0, omega_deg: 0, M0_rad: 0, t0_ms: 0 } }
} as unknown as CelestialBody);

const lum = (hex: string): number => {
	const n = parseInt(hex.slice(1), 16);
	return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
};

describe('the colour a starmap draws is the colour an observer measures', () => {
	it('leaves an ordinary star EXACTLY where it was', () => {
		// The regression that would have shipped with this feature: every star on every map moving
		// slightly, on the day a swarm nobody built became possible.
		const s = sun();
		const withSystem = visualStarOf(s, [s]);
		const alone = visualStarOf(s);
		expect(withSystem.color).toBe(alone.color);
		expect(withSystem.color).toBe(withSystem.intrinsicColor);
		expect(withSystem.observed).toBeUndefined();
	});

	it('dims a star behind a swarm without moving its hue', () => {
		const s = sun();
		const v = systemVisualStars({ nodes: [s, mega('dyson-swarm')] } as never, { viewDir: [1, 0, 0] })[0];
		expect(v.intrinsicColor).toBe(visualStarOf(s).color);
		expect(v.color).not.toBe(v.intrinsicColor);
		expect(lum(v.color)).toBeLessThan(lum(v.intrinsicColor));
		expect(v.observed?.reddened).toBe(false);
		expect(v.observed?.anomalous).toBe(true);
		// NO HUE CHANGE means the three channels kept their proportions — the §2 correction, on a map.
		const g = v.observed!.colourGain;
		expect(g[0]).toBeCloseTo(g[1], 10);
		expect(g[1]).toBeCloseTo(g[2], 10);
	});

	it('reddens a star behind authored dust', () => {
		const s = sun({ overrides: { [DUST_OVERRIDE_KEY]: 2 } });
		const v = visualStarOf(s, [s]);
		expect(v.observed?.reddened).toBe(true);
		const g = v.observed!.colourGain;
		expect(g[0]).toBeGreaterThan(g[2]);
		expect(lum(v.color)).toBeLessThan(lum(v.intrinsicColor));
	});

	it('gives two observers of one ringworld two honest and different answers', () => {
		// Design §2b, as the acceptance case: two crews in different systems disagree, both right.
		const sys = { nodes: [sun(), mega('ringworld')] } as never;
		const inPlane = systemVisualStars(sys, { viewDir: [1, 0, 0] })[0];
		const overPole = systemVisualStars(sys, { viewDir: [0, 0, 1] })[0];
		expect(inPlane.color).not.toBe(inPlane.intrinsicColor);
		expect(overPole.color).toBe(overPole.intrinsicColor);
		expect(overPole.observed).toBeUndefined();
	});

	it('does not silently apply a band when nobody has said where they are looking from', () => {
		const sys = { nodes: [sun(), mega('ringworld')] } as never;
		expect(systemVisualStars(sys)[0].color).toBe(systemVisualStars(sys)[0].intrinsicColor);
	});
});

describe('where the map is being looked at from', () => {
	const map = {
		gridCenterId: 'b',
		systems: [
			{ id: 'a', position: { x: 0, y: 0, z: 0 } },
			{ id: 'b', position: { x: 3, y: 4, z: 0 } },
			{ id: 'c', position: { x: 0, y: 0, z: 0 } }
		]
	} as never;

	it('points from the system being drawn to the map centre', () => {
		expect(starmapViewBearing(map, 'a')).toEqual([3, 4, 0]);
	});

	it('has no answer for the centre itself, or with no centre chosen', () => {
		expect(starmapViewBearing(map, 'b')).toBeUndefined();
		expect(starmapViewBearing({ systems: [] } as never, 'a')).toBeUndefined();
		expect(starmapViewBearing(null, 'a')).toBeUndefined();
	});

	it('has no answer for two systems in the same place, rather than a zero vector', () => {
		expect(starmapViewBearing({ ...(map as object), gridCenterId: 'c' } as never, 'a')).toBeUndefined();
	});

	it('reads depth, because a band is a latitude question and z is the latitude axis', () => {
		const deep = { gridCenterId: 'b', systems: [{ id: 'a', position: { x: 0, y: 0 } }, { id: 'b', position: { x: 0, y: 0, z: 5 } }] } as never;
		expect(starmapViewBearing(deep, 'a')).toEqual([0, 0, 5]);
	});
});

describe('the tags a star earns from what stands in front of it', () => {
	it('none at all when nothing does', () => {
		const s = sun();
		expect(observedStarTags(s, [s])).toEqual([]);
	});

	it('names the dimming in magnitudes and the excess as a share of output', () => {
		const s = sun();
		const tags = observedStarTags(s, [s, mega('dyson-swarm')]);
		expect(tags.map((t) => t.key)).toEqual([STAR_DIMMED_TAG, STAR_IR_EXCESS_TAG]);
		// A 0.3 swarm: -2.5 log10(0.7) = 0.3875 mag, and 30% of the star's output re-emitted. The
		// values are ROUNDED for a reader (two places on a magnitude, three on a fraction) rather than
		// carrying float noise into a chip - a tag value is a thing someone reads, not a working figure.
		expect(tags[0].value).toBe('0.39');
		expect(tags[1].value).toBe('0.300');
	});

	it('reports a band as the covered observer sees it, because a tag has no bearing', () => {
		// A ringworld encloses its star completely WITHIN ITS PLANE. The tag is the star's own fact
		// and cannot depend on who is asking; the per-observer half is the map's, and is tested above.
		const tags = observedStarTags(sun(), [sun(), mega('ringworld')]);
		expect(tags.map((t) => t.key)).toEqual([STAR_DIMMED_TAG, STAR_IR_EXCESS_TAG]);
		expect(Number(tags[0].value)).toBe(99);   // total occlusion, capped so a chip stays readable
	});

	it('says nothing for a collector too small to be a technosignature', () => {
		const tiny = { ...mega('energy-collector') };   // registry default density 0.05
		const tags = observedStarTags(sun(), [sun(), tiny]);
		// Dimming is 0.056 mag — under the photometric threshold — but 5% of the output coming back
		// out in the far infrared is a real excess, and the tags say exactly that and nothing more.
		expect(tags.map((t) => t.key)).toEqual([STAR_IR_EXCESS_TAG]);
	});

	it('gives both tags a unit, so a chip never shows a bare float', () => {
		// The A33/B27/B28 rule: a number published without saying what it measures is a lie waiting.
		expect(formatTagValue(STAR_DIMMED_TAG, '0.39')).toBe('0.39 mag fainter');
		expect(formatTagValue(STAR_IR_EXCESS_TAG, '0.300')).toBe('30.0% of output');
	});

	it('explains itself, and the explanation carries the correction', () => {
		const dimmed = describeTag(STAR_DIMMED_TAG);
		expect(dimmed.label).toBe('Dimmed');
		// The one thing the description must not get wrong: a swarm does NOT redden.
		expect(dimmed.description.toLowerCase()).toContain('not redder');
		expect(describeTag(STAR_IR_EXCESS_TAG).description.toLowerCase()).toContain('waste heat');
	});
});
