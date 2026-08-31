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
import { STAR_DIMMED_TAG, STAR_IR_EXCESS_TAG, STAR_ANOMALOUS_TAG, observedStarTags, DUST_OVERRIDE_KEY } from '$lib/physics/observedStar';
import { occlusionRingArcs, ringArcPath, floorGlyphGain, GLYPH_DIM_FLOOR, OCCLUSION_RING } from './starGlyphLaw';
import { rollUpMarkers } from '$lib/tags/mapHighlights';
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
		// The VERDICT leads, so it takes the first marker slot when the cap collapses the rest.
		expect(tags.map((t) => t.key)).toEqual([STAR_ANOMALOUS_TAG, STAR_DIMMED_TAG, STAR_IR_EXCESS_TAG]);
		expect(tags[0].value).toBe('structure');
		tags.shift();
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
		expect(tags.map((t) => t.key)).toEqual([STAR_ANOMALOUS_TAG, STAR_DIMMED_TAG]);
		expect(Number(tags[1].value)).toBe(99);   // total occlusion, capped so a chip stays readable
		// AND NO INFRARED TAG, which is the honest answer and not an omission. A ringworld blacks its
		// star out for anyone in its plane, and intercepts about half a per cent of the star's SKY —
		// so there is nothing like an infrared excess to report. The two questions are different and
		// the ring is the case where they diverge hardest: a bearing answer of 1, a sky share of
		// sin(0.31 degrees). Reading the sky share off the bearing answer gave a ringworld an excess
		// of 100% of its star's output, which is energy from nowhere.
	});

	it('says nothing for a collector too small to be a technosignature', () => {
		const tiny = { ...mega('energy-collector') };   // registry default density 0.05
		const tags = observedStarTags(sun(), [sun(), tiny]);
		// Dimming is 0.056 mag — under the photometric threshold — but 5% of the output coming back
		// out in the far infrared is a real excess, so the verdict stands on the infrared alone and the
		// photometric tag is correctly absent. The tags say exactly that and nothing more.
		expect(tags.map((t) => t.key)).toEqual([STAR_ANOMALOUS_TAG, STAR_IR_EXCESS_TAG]);
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

/** A swarm at an explicit density — the registry default is 0.3, and the invariant below has to be
 *  checked across the whole range with total occlusion included. */
const swarmAt = (frac: number): CelestialBody => ({
	id: 'sw', name: 'Swarm', kind: 'construct', roleHint: 'mega', parentId: 'sun', tags: [],
	megaType: frac >= 1 ? 'dyson-sphere' : 'dyson-swarm',
	orbit: { hostId: 'sun', hostMu: 1.327e20, elements: { a_AU: 1, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0, t0_ms: 0 } }
} as unknown as CelestialBody);

describe('a star with something around it is drawn with the thing around it', () => {
	// THE REPORT THAT PRODUCED ALL OF THIS, in the owner's words: he put a Dyson SPHERE around a star
	// and "it looks like a black hole". Coverage 100% means transmission 0 means #000000, which is
	// honest photometry and an absence on a black map — the wrong object entirely.

	it('never lets a glyph go black, however completely the star is enclosed', () => {
		const sys = { nodes: [sun(), mega('dyson-sphere')] } as never;
		const v = systemVisualStars(sys, { viewDir: [1, 0, 0] })[0];
		expect(v.observed!.transmission).toBeCloseTo(0, 12);   // the PHYSICS is still zero
		expect(v.color).not.toBe('#000000');                   // the MARK is not
		expect(lum(v.color)).toBeGreaterThan(60);
		// ...and still obviously dimmed, or the floor would have thrown the feature away.
		expect(lum(v.color)).toBeLessThan(lum(v.intrinsicColor) * 0.75);
	});

	it('floors the brightness WITHOUT moving the hue, which is why it is one factor and not three', () => {
		// Per channel would floor the blue first and turn a reddened star grey at exactly the depths
		// where the reddening matters most.
		const g = floorGlyphGain([0.07, 0.048, 0.023]);
		expect(Math.max(...g)).toBeCloseTo(GLYPH_DIM_FLOOR, 12);
		expect(g[0] / g[1]).toBeCloseTo(0.07 / 0.048, 12);
		expect(g[1] / g[2]).toBeCloseTo(0.048 / 0.023, 12);
	});

	it('leaves a gain that is already above the floor completely alone', () => {
		expect(floorGlyphGain([0.7, 0.7, 0.7])).toEqual([0.7, 0.7, 0.7]);
		expect(floorGlyphGain([1, 1, 1])).toEqual([1, 1, 1]);
	});

	it('THE INVARIANT: a glyph dark enough to be mistaken for a hole is ALWAYS ringed', () => {
		// The two halves of the fix are coupled by construction rather than by remembering. Anything
		// dim enough to read as an absence is far past the anomaly threshold, so it carries a ring;
		// and anything ringed is something the map is admitting to.
		for (const f of [0.1, 0.3, 0.5, 0.8, 0.95, 1]) {
			const v = visualStarOf(sun(), [sun(), swarmAt(f)], { viewDir: [1, 0, 0] });
			if (lum(v.color) < lum(v.intrinsicColor) * 0.9) {
				expect(v.occluded).toBeGreaterThan(0);
				expect(occlusionRingArcs(v.occluded)).not.toBeNull();
			}
		}
	});

	it('publishes the occluded share as one number the renderers draw, and zero when clear', () => {
		expect(visualStarOf(sun(), [sun()]).occluded).toBe(0);
		expect(visualStarOf(sun(), [sun(), mega('dyson-swarm')], { viewDir: [1, 0, 0] }).occluded).toBeCloseTo(0.3, 10);
		expect(visualStarOf(sun(), [sun(), mega('dyson-sphere')], { viewDir: [1, 0, 0] }).occluded).toBeCloseTo(1, 10);
		// A ring seen over its own pole takes nothing, so there is nothing to draw.
		expect(visualStarOf(sun(), [sun(), mega('ringworld')], { viewDir: [0, 0, 1] }).occluded).toBe(0);
	});
});

describe('the ring, whose gaps are the light still getting out', () => {
	it('draws nothing at all for a clear star', () => {
		expect(occlusionRingArcs(0)).toBeNull();
		expect(occlusionRingArcs(-1)).toBeNull();
		expect(occlusionRingArcs(NaN)).toBeNull();
	});

	it('closes completely at total occlusion, as ONE arc rather than six meeting end to end', () => {
		// Six touching arcs leave hairline seams at exactly the moment the picture must say "sealed".
		const full = occlusionRingArcs(1)!;
		expect(full).toHaveLength(1);
		expect(full[0].sweepRad).toBeCloseTo(2 * Math.PI, 12);
	});

	it('closes exactly the fraction it is given, which is what makes it a reading', () => {
		for (const f of [0.05, 0.3, 0.5, 0.85, 0.999]) {
			const arcs = occlusionRingArcs(f)!;
			expect(arcs).toHaveLength(OCCLUSION_RING.segments);
			const closed = arcs.reduce((a, x) => a + x.sweepRad, 0) / (2 * Math.PI);
			expect(closed).toBeCloseTo(f, 12);
		}
	});

	it('spaces the gaps evenly and does not lean', () => {
		const arcs = occlusionRingArcs(0.5)!;
		const step = (2 * Math.PI) / OCCLUSION_RING.segments;
		for (let i = 1; i < arcs.length; i++) {
			expect(arcs[i].startRad - arcs[i - 1].startRad).toBeCloseTo(step, 12);
		}
		expect(arcs[0].startRad).toBeCloseTo((step - arcs[0].sweepRad) / 2, 12);
	});

	it('gives the two SVG maps a path that survives a sweep past a half turn', () => {
		// The large-arc flag is the classic thing to get wrong, and it only shows up past 180 degrees
		// — which is precisely the heavily-occluded case this ring exists to draw.
		expect(ringArcPath(0, 0, 10, { startRad: 0, sweepRad: Math.PI * 1.5 })).toContain(' 1 1 ');
		expect(ringArcPath(0, 0, 10, { startRad: 0, sweepRad: Math.PI * 0.5 })).toContain(' 0 1 ');
		// A full turn cannot be one arc at all — start and end coincide and it would draw nothing.
		expect(ringArcPath(0, 0, 10, { startRad: 0, sweepRad: 2 * Math.PI }).match(/A /g)).toHaveLength(2);
	});
});

describe('the verdict tag, which is the one a GM pins', () => {
	it('says SOMETHING SOLID when the star dims without reddening', () => {
		// Dust cannot dim without reddening and a solid occluder cannot redden, so this is a verdict
		// the physics can honestly make rather than a guess dressed as one.
		const tags = observedStarTags(sun(), [sun(), mega('dyson-swarm')]);
		expect(tags.find((t) => t.key === STAR_ANOMALOUS_TAG)!.value).toBe('structure');
	});

	it('says DUST when it dims and reddens', () => {
		const s = sun({ overrides: { [DUST_OVERRIDE_KEY]: 2 } });
		expect(observedStarTags(s, [s]).find((t) => t.key === STAR_ANOMALOUS_TAG)!.value).toBe('dust');
	});

	it('says nothing at all about an ordinary star', () => {
		expect(observedStarTags(sun(), [sun()])).toEqual([]);
	});

	it('reads as a sentence in a chip rather than a token to decode', () => {
		expect(formatTagValue(STAR_ANOMALOUS_TAG, 'structure')).toContain('something solid');
		expect(formatTagValue(STAR_ANOMALOUS_TAG, 'dust')).toContain('dust');
	});

	it('is pinnable like any other tag, which is the whole point of it being a tag', () => {
		// The GM drags it into the highlight tray and every anomalous star badges itself on both maps.
		const s = sun();
		const tagged = { ...s, tags: observedStarTags(s, [s, mega('dyson-swarm')]) } as never;
		const cats = [{ id: 'stellar', shortName: 'Stellar', longName: 'Stellar', color: '#888', appliesTo: ['planet'], enabled: true, tags: [], rules: [] }] as never;
		const marks = rollUpMarkers([tagged], [{ ref: STAR_ANOMALOUS_TAG }], cats);
		expect(marks.map((m) => m.key)).toEqual([STAR_ANOMALOUS_TAG]);
		expect(marks[0].label).toBe('Anomalous star');
	});
});
