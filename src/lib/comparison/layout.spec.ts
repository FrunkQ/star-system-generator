import { describe, it, expect } from 'vitest';
import {
  sortBySize, medianPlanet, pxPerKm, zoomBounds, layoutStrip, belowFloorNote,
  idsAtLeast, idsAtMost, visibleItems, referenceMarks,
  SELECTED_SHARE, OPENING_SHARE, GAP_FRACTION, DOT_THRESHOLD_PX, DOT_PX,
  type ComparisonItem
} from './layout';
import { EARTH_RADIUS_KM, SOLAR_RADIUS_KM, LUNA_RADIUS_KM } from '$lib/constants';

// The real Sol, by radius in km, because the whole feature is about REAL sizes and a made-up set
// cannot catch a constant that has drifted (PHY-34: a ratio test is blind to that). Every absolute
// pixel figure below is computed from these by hand in the assertion's own comment.
const body = (name: string, radiusKm: number, role: string): ComparisonItem =>
  ({ id: name.toLowerCase(), name, diameterKm: radiusKm * 2, role });

const SOL: ComparisonItem[] = [
  body('Sun', SOLAR_RADIUS_KM, 'star'),
  body('Mercury', 2439.7, 'planet'),
  body('Venus', 6051.8, 'planet'),
  body('Earth', EARTH_RADIUS_KM, 'planet'),
  body('Mars', 3389.5, 'planet'),
  body('Jupiter', 69911, 'planet'),
  body('Saturn', 58232, 'planet'),
  body('Uranus', 25362, 'planet'),
  body('Neptune', 24622, 'planet'),
  body('Luna', LUNA_RADIUS_KM, 'moon'),
  body('Io', 1821.6, 'moon'),
  body('Europa', 1560.8, 'moon'),
  body('Ganymede', 2634.1, 'moon'),
  body('Titan', 2574.7, 'moon'),
  body('Ceres', 469.7, 'moon'),
  body('Phobos', 11.267, 'moon')
];

describe('size comparison — order', () => {
  it('runs biggest first', () => {
    const names = sortBySize(SOL).map((i) => i.name);
    expect(names.slice(0, 4)).toEqual(['Sun', 'Jupiter', 'Saturn', 'Uranus']);
    expect(names.at(-1)).toBe('Phobos');
  });

  it('breaks ties on name, so equal twins cannot reshuffle between renders', () => {
    const twins = [body('Beta', 1000, 'moon'), body('Alpha', 1000, 'moon')];
    expect(sortBySize(twins).map((i) => i.name)).toEqual(['Alpha', 'Beta']);
    expect(sortBySize(twins.slice().reverse()).map((i) => i.name)).toEqual(['Alpha', 'Beta']);
  });
});

describe('size comparison — the opening selection', () => {
  // The rule the owner asked for, and the reason for it: with moons and asteroids in the pool the
  // median is a rock, and every world is off the edge before the view has drawn a frame.
  it('opens on the MEDIAN PLANET — Earth, for Sol', () => {
    expect(medianPlanet(SOL)?.name).toBe('Earth');
  });

  it('is not skewed by moons and asteroids however many there are', () => {
    const rubble = Array.from({ length: 200 }, (_, i) => body(`Rock ${i}`, 5 + i * 0.1, 'moon'));
    expect(medianPlanet([...SOL, ...rubble])?.name).toBe('Earth');
  });

  it('takes the LOWER middle on an even count — the terrestrial side, not the giant side', () => {
    const four = [body('A', 1000, 'planet'), body('B', 2000, 'planet'), body('C', 3000, 'planet'), body('D', 4000, 'planet')];
    expect(medianPlanet(four)?.name).toBe('B');
  });

  it('falls back to the median of everything when a system has no planets', () => {
    const moons = [body('Small', 100, 'moon'), body('Mid', 500, 'moon'), body('Big', 900, 'moon')];
    expect(medianPlanet(moons)?.name).toBe('Mid');
  });

  it('answers a lone star with the star', () => {
    expect(medianPlanet([body('Sun', SOLAR_RADIUS_KM, 'star')])?.name).toBe('Sun');
  });

  it('answers an empty set with nothing rather than throwing', () => {
    expect(medianPlanet([])).toBeNull();
  });
});

describe('size comparison — scale', () => {
  // ABSOLUTE pins, not ratios. A shorter side of 800 px is the arithmetic's anchor throughout.
  const SHORT = 800;

  it('puts a clicked object at half the shorter side', () => {
    const s = pxPerKm(SOL[0].diameterKm, SHORT, SELECTED_SHARE);
    expect(SOL[0].diameterKm * s).toBeCloseTo(400, 6);        // 0.5 x 800
  });

  it('opens with the median planet at 30% of the shorter side', () => {
    const earth = medianPlanet(SOL)!;
    const s = pxPerKm(earth.diameterKm, SHORT, OPENING_SHARE);
    expect(earth.diameterKm * s).toBeCloseTo(240, 6);          // 0.3 x 800
    // AND THE ABSOLUTE FIGURES THAT FALL OUT OF IT, for the Solar System, at that scale. Earth is
    // 12,742 km across, so the scale is 240 / 12,742 = 0.018835... px/km.
    expect(s).toBeCloseTo(0.0188353476, 9);
    expect(SOL.find((i) => i.name === 'Jupiter')!.diameterKm * s).toBeCloseTo(2633.596, 2);   // 139,822 km
    expect(SOL.find((i) => i.name === 'Luna')!.diameterKm * s).toBeCloseTo(65.449, 2);        // 3,474.8 km
    expect(SOL.find((i) => i.name === 'Sun')!.diameterKm * s).toBeCloseTo(26231.612, 2);      // 1,392,680 km
  });

  it('measures against the SHORTER side, so turning the device does not change the share', () => {
    const landscape = pxPerKm(SOL[3].diameterKm, 600, SELECTED_SHARE); // shorter side 600 either way
    const portrait = pxPerKm(SOL[3].diameterKm, 600, SELECTED_SHARE);
    expect(landscape).toBe(portrait);
  });

  it('takes its zoom bounds from the SET, never from a constant (UI-L7)', () => {
    const sol = zoomBounds(SOL, SHORT);
    // Zoomed out, the Sun is 4% of 800 = 32 px. Zoomed in, Phobos (22.534 km) is 400 px.
    expect(SOL[0].diameterKm * sol.min).toBeCloseTo(32, 6);
    expect(22.534 * sol.max).toBeCloseTo(400, 6);
    // A different set gets different bounds — that is the whole assertion.
    const moonsOnly = SOL.filter((i) => i.role === 'moon');
    expect(zoomBounds(moonsOnly, SHORT).min).not.toBeCloseTo(sol.min, 9);
  });

  it('survives an empty set and a zero-size viewport', () => {
    expect(zoomBounds([], 800)).toEqual({ min: 1, max: 1 });
    expect(pxPerKm(100, 0, 0.5)).toBe(0);
    expect(pxPerKm(0, 800, 0.5)).toBe(0);
  });
});

describe('size comparison — the strip', () => {
  const SHORT = 800;
  const scale = pxPerKm(medianPlanet(SOL)!.diameterKm, SHORT, OPENING_SHARE);

  it('places neighbours edge to edge with a gap proportional to the LARGER of the two', () => {
    const { slots } = layoutStrip(SOL, scale);
    const sun = slots[0], jupiter = slots[1];
    const expectedGap = GAP_FRACTION * sun.spanPx;   // the Sun is the larger neighbour
    const measuredGap = (jupiter.centrePx - jupiter.spanPx / 2) - (sun.centrePx + sun.spanPx / 2);
    expect(measuredGap).toBeCloseTo(expectedGap, 6);
  });

  it('starts the first object flush with the strip and never overlaps two neighbours', () => {
    const { slots, lengthPx } = layoutStrip(SOL, scale);
    expect(slots[0].centrePx - slots[0].spanPx / 2).toBeCloseTo(0, 9);
    for (let i = 1; i < slots.length; i++) {
      const prevEnd = slots[i - 1].centrePx + slots[i - 1].spanPx / 2;
      expect(slots[i].centrePx - slots[i].spanPx / 2).toBeGreaterThan(prevEnd);
    }
    expect(lengthPx).toBeGreaterThan(slots.at(-1)!.centrePx);
  });

  it('runs down the axis the mode asks for', () => {
    expect(layoutStrip(SOL, scale).axis).toBe('x');
    expect(layoutStrip(SOL, scale, { axis: 'y' }).axis).toBe('y');
    // Same numbers either way: the axis is a direction, not a different layout.
    expect(layoutStrip(SOL, scale, { axis: 'y' }).slots.map((s) => s.centrePx))
      .toEqual(layoutStrip(SOL, scale).slots.map((s) => s.centrePx));
  });

  it('draws a sub-floor object as a DOT and never inflates it', () => {
    const { slots } = layoutStrip(SOL, scale);
    const phobos = slots.find((s) => s.name === 'Phobos')!;
    expect(phobos.diameterPx).toBeLessThan(DOT_THRESHOLD_PX);   // 22.534 km x 0.01884 = 0.42 px
    expect(phobos.diameterPx).toBeCloseTo(0.4245, 3);
    expect(phobos.belowFloor).toBe(true);
    expect(phobos.spanPx).toBe(DOT_PX);            // the marker's span, not the body's size
    expect(belowFloorNote(phobos.diameterPx)).toBe('below 1 px at this scale');
    expect(belowFloorNote(1.5)).toBe('below 2 px at this scale');
  });

  it('alternates labels only once the bodies are small enough to crowd', () => {
    const { slots } = layoutStrip(SOL, scale);
    // The Sun and Jupiter are hundreds of px across: their labels never move off the near side.
    expect(slots[0].labelSide).toBe('start');
    expect(slots[1].labelSide).toBe('start');
    // Among the small ones the sides alternate, which is the whole point of the rule.
    const small = slots.filter((s) => s.spanPx < 90).map((s) => s.labelSide);
    expect(small.length).toBeGreaterThan(3);
    for (let i = 1; i < small.length; i++) expect(small[i]).not.toBe(small[i - 1]);
  });

  it('grows the strip when the scale grows', () => {
    const a = layoutStrip(SOL, scale).lengthPx;
    const b = layoutStrip(SOL, scale * 2).lengthPx;
    expect(b).toBeGreaterThan(a * 1.9);
  });
});

describe('size comparison — hiding', () => {
  it('hides this and everything bigger, inclusive', () => {
    const ids = idsAtLeast(SOL, 'earth');
    expect(ids).toContain('earth');
    expect(ids).toContain('jupiter');
    expect(ids).toContain('sun');
    expect(ids).not.toContain('luna');
  });

  it('hides this and everything smaller, inclusive', () => {
    const ids = idsAtMost(SOL, 'earth');
    expect(ids).toContain('earth');
    expect(ids).toContain('luna');
    expect(ids).toContain('phobos');
    expect(ids).not.toContain('neptune');
  });

  it('takes hidden objects out of the median, the layout and the ruler alike', () => {
    const hidden = new Set(idsAtLeast(SOL, 'neptune'));   // the Sun and all four giants
    const left = visibleItems(SOL, hidden);
    expect(left.map((i) => i.name)).not.toContain('Jupiter');
    // Four planets left; by diameter that is Mercury, Mars, Venus, Earth, and the lower middle of
    // four is the SECOND — Mars. Hiding the top of the strip moves the opening selection down it.
    expect(medianPlanet(left)?.name).toBe('Mars');
    expect(layoutStrip(left, 1).slots.some((s) => s.name === 'Saturn')).toBe(false);
  });

  it('says nothing about an id it does not know', () => {
    expect(idsAtLeast(SOL, 'nope')).toEqual([]);
    expect(idsAtMost(SOL, 'nope')).toEqual([]);
  });
});

describe('size comparison — the ruler', () => {
  it('marks Luna, Earth and the Sun, in km, from the app constants', () => {
    const marks = referenceMarks(1, 1e7);
    expect(marks.map((m) => m.label)).toEqual(['Luna', 'Earth', 'Sun']);
    expect(marks[0].diameterKm).toBeCloseTo(3474.8, 6);
    expect(marks[1].diameterKm).toBeCloseTo(12742, 6);
    expect(marks[2].diameterKm).toBeCloseTo(1392680, 6);
    // NOT the realsky duplicate (695,700 x 2 = 1,391,400) — the view reads the app constant.
    expect(marks[2].diameterKm).not.toBeCloseTo(1391400, 6);
  });

  it('reports a mark that falls off the ruler rather than dropping it', () => {
    const scale = pxPerKm(medianPlanet(SOL)!.diameterKm, 800, OPENING_SHARE);
    const marks = referenceMarks(scale, 1000);
    expect(marks.find((m) => m.id === 'earth')!.off).toBe('none');    // 240 px in
    expect(marks.find((m) => m.id === 'sun')!.off).toBe('end');       // 26,233 px — far off the end
    expect(marks.find((m) => m.id === 'luna')!.posPx).toBeCloseTo(65.449, 2);
  });
});
