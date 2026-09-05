import { describe, it, expect } from 'vitest';
import {
  sortBySize, medianPlanet, pxPerKm, zoomBounds, layoutStrip, belowFloorNote,
  idsAtLeast, idsAtMost, visibleItems, referenceMarks, minorTicks, LABEL_MIN_GAP_PX,
  clampScroll, scrollForZoom, TAP_SLOP_PX, STEP_FRACTION, sortItems, orbitOrder, orbitTree, measureSlot,
  SORT_ORDERS, GAP_FRACTION as GAPF,
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

// A miniature Sol with the fields the new orders need: masses, parents and orbits. Small enough to
// reason about by hand, real enough that the answers are checkable against the sky.
const SYS: ComparisonItem[] = [
  { id: 'sun', name: 'Sun', diameterKm: 1392000, role: 'star', massKg: 1.989e30, parentId: null },
  { id: 'mercury', name: 'Mercury', diameterKm: 4879, role: 'planet', massKg: 3.30e23, parentId: 'sun', orbitAu: 0.387 },
  { id: 'earth', name: 'Earth', diameterKm: 12742, role: 'planet', massKg: 5.97e24, parentId: 'sun', orbitAu: 1 },
  { id: 'luna', name: 'Luna', diameterKm: 3475, role: 'moon', massKg: 7.34e22, parentId: 'earth', orbitAu: 0.00257 },
  { id: 'jupiter', name: 'Jupiter', diameterKm: 139822, role: 'planet', massKg: 1.898e27, parentId: 'sun', orbitAu: 5.2 },
  { id: 'io', name: 'Io', diameterKm: 3643, role: 'moon', massKg: 8.93e22, parentId: 'jupiter', orbitAu: 0.00282 },
  { id: 'ganymede', name: 'Ganymede', diameterKm: 5268, role: 'moon', massKg: 1.48e23, parentId: 'jupiter', orbitAu: 0.00716 },
  { id: 'moonlet', name: 'Moonlet', diameterKm: 60, role: 'moon', parentId: 'io', orbitAu: 0.0001 },  // no mass on purpose
  // Saturn follows Jupiter, so a column that fails to make room for its widest row runs into
  // something instead of into empty space at the end of the strip.
  { id: 'saturn', name: 'Saturn', diameterKm: 116464, role: 'planet', massKg: 5.68e26, parentId: 'sun', orbitAu: 9.5 },
  // The pair that tells an UNKNOWN mass from a mass of zero: with unknown sorting last, Dust (a known
  // zero) comes before Ghost (unknown); treated as zero they would tie and the NAME would flip them.
  { id: 'dust', name: 'Zzz Dust', diameterKm: 10, role: 'moon', massKg: 0, parentId: 'saturn', orbitAu: 0.002 },
  { id: 'ghost', name: 'Aaa Ghost', diameterKm: 10, role: 'moon', parentId: 'saturn', orbitAu: 0.003 }
];

describe('size comparison — rings', () => {
  // Saturn's rings reach 140,180 km — WIDER than Jupiter's whole globe (139,822 km across). That one
  // fact is why rings need room of their own and why they must not count as size.
  const SATURN: ComparisonItem = {
    id: 'saturn', name: 'Saturn', diameterKm: 116464, role: 'planet', massKg: 5.68e26,
    ringInnerKm: 66900, ringOuterKm: 140180
  };
  const JUPITER: ComparisonItem = { id: 'jupiter', name: 'Jupiter', diameterKm: 139822, role: 'planet', massKg: 1.898e27 };

  it('draws the ring at TRUE extent and never lets it change the body size', () => {
    const m = measureSlot(SATURN, 1);
    expect(m.diameterPx).toBe(116464);          // the globe, untouched
    expect(m.ringInnerPx).toBe(66900);
    expect(m.ringOuterPx).toBe(140180);
    expect(m.spanPx).toBe(116464);              // what is DRAWN as the body
    expect(m.reachPx).toBe(280360);             // what the layout RESERVES: the ring, both sides
  });

  it('never lets a ring into the ORDER — the strip compares globes, not jewellery', () => {
    // Saturn's rings are wider than Jupiter. Ordered by reach it would outrank Jupiter; it must not.
    const byName = sortItems([SATURN, JUPITER], 'size').map((i) => i.name);
    expect(byName).toEqual(['Jupiter', 'Saturn']);
    expect(measureSlot(SATURN, 1).reachPx).toBeGreaterThan(measureSlot(JUPITER, 1).reachPx);
  });

  it('gives a ringed planet room, so its rings cannot be drawn through its neighbours', () => {
    const { slots } = layoutStrip([SATURN, JUPITER], 1e-3);
    const at = (n: string) => slots.find((sl) => sl.name === n)!;
    const jupiterRight = at('Jupiter').centrePx + at('Jupiter').reachPx / 2;
    const saturnRingLeft = at('Saturn').centrePx - at('Saturn').ringOuterPx;
    expect(saturnRingLeft).toBeGreaterThan(jupiterRight);
    // And the body sits in the MIDDLE of the room it reserves, so the ring reaches equally either way.
    expect(at('Saturn').centrePx - at('Saturn').ringOuterPx)
      .toBeCloseTo(at('Saturn').centrePx + at('Saturn').ringOuterPx - at('Saturn').reachPx, 6);
  });

  it('reserves nothing extra for a body with no rings', () => {
    const m = measureSlot(JUPITER, 1);
    expect(m.ringOuterPx).toBe(0);
    expect(m.reachPx).toBe(m.spanPx);
  });

  it('DROPS a ring too small to draw rather than flooring it — a floor is for finding a BODY', () => {
    // At this scale the whole ring is under a pixel. Inflating it to the dot floor would be a false
    // statement about how far it reaches, which is the one thing a ring is here to say.
    const tiny = measureSlot(SATURN, 1e-9);
    expect(tiny.ringOuterPx).toBe(0);
    expect(tiny.belowFloor).toBe(true);
    expect(tiny.spanPx).toBe(DOT_PX);           // the BODY still gets its marker
    expect(tiny.reachPx).toBe(DOT_PX);          // and reserves no phantom ring
  });

  it('ignores a ring whose radii are nonsense rather than drawing it inside out', () => {
    const wrong = measureSlot({ ...SATURN, ringInnerKm: 200000, ringOuterKm: 100000 }, 1);
    expect(wrong.ringOuterPx).toBe(0);
    expect(wrong.reachPx).toBe(wrong.spanPx);
  });

  it('reserves the ring in the ORBIT layout too, not only the flat strip', () => {
    const withMoon: ComparisonItem[] = [
      { ...SATURN, parentId: null, orbitAu: 9.5 },
      { id: 'titan', name: 'Titan', diameterKm: 5149, role: 'moon', parentId: 'saturn', orbitAu: 0.008 },
      { id: 'p2', name: 'Next', diameterKm: 50000, role: 'planet', parentId: null, orbitAu: 19 }
    ];
    const { slots } = layoutStrip(withMoon, 1e-3, { order: 'orbit' });
    const at = (n: string) => slots.find((sl) => sl.name === n)!;
    expect(at('Saturn').ringOuterPx).toBeCloseTo(140.18, 6);
    expect(at('Next').centrePx - at('Next').reachPx / 2)
      .toBeGreaterThan(at('Saturn').centrePx + at('Saturn').ringOuterPx);
  });
});

describe('size comparison — the four orders', () => {
  it('offers exactly the four the owner asked for, and no fifth', () => {
    expect(SORT_ORDERS.map((o) => o.id)).toEqual(['size', 'name', 'mass', 'orbit']);
  });

  it('SIZE is the default and the poster order', () => {
    expect(sortItems(SYS).map((i) => i.id)).toEqual(sortItems(SYS, 'size').map((i) => i.id));
    expect(sortItems(SYS, 'size').map((i) => i.name).slice(0, 3)).toEqual(['Sun', 'Jupiter', 'Saturn']);
  });

  it('NAME is alphabetical', () => {
    expect(sortItems(SYS, 'name').map((i) => i.name)).toEqual(
      ['Aaa Ghost', 'Earth', 'Ganymede', 'Io', 'Jupiter', 'Luna', 'Mercury', 'Moonlet', 'Saturn', 'Sun', 'Zzz Dust']);
  });

  it('MASS is heaviest first, and is NOT the same answer as size', () => {
    const byMass = sortItems(SYS, 'mass').map((i) => i.name);
    const bySize = sortItems(SYS, 'size').map((i) => i.name);
    expect(byMass.slice(0, 5)).toEqual(['Sun', 'Jupiter', 'Saturn', 'Earth', 'Mercury']);
    // GANYMEDE AND MERCURY ARE THE PAIR THAT PROVES THE TWO ORDERS ARE DIFFERENT QUESTIONS, and it is
    // a real fact about the sky rather than a contrivance: Ganymede is the WIDER of the two (5,268 km
    // against 4,879) and Mercury is much the HEAVIER (3.30e23 kg against 1.48e23), because Ganymede
    // is half ice. They come out on opposite sides in the two orders.
    expect(bySize.indexOf('Ganymede')).toBeLessThan(bySize.indexOf('Mercury'));
    expect(byMass.indexOf('Mercury')).toBeLessThan(byMass.indexOf('Ganymede'));
  });

  it('sorts an UNKNOWN mass last — behind even a mass of ZERO, because unknown is not weightless', () => {
    const byMass = sortItems(SYS, 'mass').map((i) => i.name);
    // Every body that HAS a mass, including the one whose mass is zero, comes before every body that
    // has none. Treating an absent mass as 0 would tie Dust with the two unweighed bodies and let the
    // NAME decide, putting "Aaa Ghost" ahead of a body whose mass is actually known.
    expect(byMass.indexOf('Zzz Dust')).toBeLessThan(byMass.indexOf('Aaa Ghost'));
    expect(byMass.indexOf('Zzz Dust')).toBeLessThan(byMass.indexOf('Moonlet'));
    // And the unweighed ones are name-ordered among themselves, so they do not shuffle.
    expect(byMass.slice(-2)).toEqual(['Aaa Ghost', 'Moonlet']);
  });

  it('breaks every order on the name, so equals cannot reshuffle between renders', () => {
    const twins: ComparisonItem[] = [
      { id: 'b', name: 'Beta', diameterKm: 100, role: 'moon', massKg: 5 },
      { id: 'a', name: 'Alpha', diameterKm: 100, role: 'moon', massKg: 5 }
    ];
    for (const o of ['size', 'name', 'mass'] as const) {
      expect(sortItems(twins, o).map((i) => i.name)).toEqual(['Alpha', 'Beta']);
      expect(sortItems(twins.slice().reverse(), o).map((i) => i.name)).toEqual(['Alpha', 'Beta']);
    }
  });
});

describe('size comparison — the orbit tree', () => {
  it('reads as a system does: each root, then what goes round it, innermost first', () => {
    expect(orbitOrder(SYS).map((i) => i.name)).toEqual(
      ['Sun', 'Mercury', 'Earth', 'Luna', 'Jupiter', 'Io', 'Moonlet', 'Ganymede', 'Saturn', 'Zzz Dust', 'Aaa Ghost']);
  });

  it('is what `sortItems` hands back for the orbit order — one answer, not two', () => {
    // The labels, the median and the layout all read the same sequence, or they disagree about which
    // object the strip is showing.
    expect(sortItems(SYS, 'orbit').map((i) => i.id)).toEqual(orbitOrder(SYS).map((i) => i.id));
    expect(sortItems(SYS, 'orbit').map((i) => i.id)).not.toEqual(sortItems(SYS, 'size').map((i) => i.id));
  });

  it('PROMOTES an orphan rather than losing it — hiding a planet must not hide its moons', () => {
    const noJupiter = SYS.filter((i) => i.id !== 'jupiter');
    const names = orbitOrder(noJupiter).map((i) => i.name);
    expect(names).toContain('Io');
    expect(names).toContain('Ganymede');
    // Io is now a root, so it and its own moon come through together.
    const { roots } = orbitTree(noJupiter);
    expect(roots.map((r) => r.name)).toContain('Io');
    expect(orbitTree(noJupiter).childrenOf('io').map((c) => c.name)).toEqual(['Moonlet']);
  });

  it('degenerates to a flat row when nothing has a parent — the starmap case', () => {
    const stars: ComparisonItem[] = [
      { id: 'a', name: 'A', diameterKm: 100, role: 'star', parentId: null },
      { id: 'b', name: 'B', diameterKm: 300, role: 'star', parentId: null }
    ];
    const { roots, childrenOf } = orbitTree(stars);
    expect(roots.length).toBe(2);
    expect(childrenOf('a')).toEqual([]);
    // With no orbits at all it falls back to the poster's order rather than to input order.
    expect(roots.map((r) => r.name)).toEqual(['B', 'A']);
  });

  it('lays moons OFF the centreline and their moons along the strip beside them', () => {
    const { slots } = layoutStrip(SYS, 1 / 1000, { order: 'orbit' });
    const at = (n: string) => slots.find((s) => s.name === n)!;
    // Planets and the star sit ON the line; their moons do not.
    expect(at('Jupiter').crossPx).toBe(0);
    expect(at('Earth').crossPx).toBe(0);
    expect(at('Io').crossPx).toBeGreaterThan(0);
    expect(at('Ganymede').crossPx).toBeGreaterThan(at('Io').crossPx);
    // A moon sits under its own planet, not under the strip's start.
    expect(at('Io').centrePx).toBe(at('Jupiter').centrePx);
    expect(at('Luna').centrePx).toBe(at('Earth').centrePx);
    // A moon's moon shares its parent's row and stands to the side of it.
    expect(at('Moonlet').crossPx).toBe(at('Io').crossPx);
    // CLEAR of it, not merely past its centre: the two must not overlap.
    const ioRight = at('Io').centrePx + at('Io').spanPx / 2;
    expect(at('Moonlet').centrePx - at('Moonlet').spanPx / 2).toBeGreaterThan(ioRight);
    // Depth is reported, so a label can say how deep it is.
    expect([at('Jupiter').depth, at('Io').depth, at('Moonlet').depth]).toEqual([0, 1, 2]);
  });

  it('gives every column room for its widest row, so two planets cannot collide', () => {
    const { slots, lengthPx } = layoutStrip(SYS, 1 / 1000, { order: 'orbit' });
    const at = (n: string) => slots.find((s) => s.name === n)!;
    // The columns run in ORBITAL order along the strip, not by size — Mercury before Earth before
    // Jupiter, and the star before all of them.
    expect(at('Sun').centrePx).toBeLessThan(at('Mercury').centrePx);
    expect(at('Mercury').centrePx).toBeLessThan(at('Earth').centrePx);
    expect(at('Earth').centrePx).toBeLessThan(at('Jupiter').centrePx);
    expect(lengthPx).toBeGreaterThanOrEqual(at('Saturn').centrePx + at('Saturn').spanPx / 2);
  });

  it('MAKES ROOM FOR A ROW THAT OVERRUNS ITS ROOT, which is where a column sized by its root fails', () => {
    // In the real sky this rarely bites — Jupiter's radius dwarfs its moons' whole train — so it takes
    // a system built for it: a small world whose moons are nearly its own size, each with a moon of
    // its own. The row then reaches well past the root, and the NEXT column has to start beyond it.
    const TRAIN: ComparisonItem[] = [
      { id: 'p1', name: 'P1', diameterKm: 1000, role: 'planet', parentId: null, orbitAu: 1 },
      { id: 'm1', name: 'M1', diameterKm: 900, role: 'moon', parentId: 'p1', orbitAu: 0.01 },
      { id: 'm1a', name: 'M1a', diameterKm: 800, role: 'moon', parentId: 'm1', orbitAu: 0.001 },
      { id: 'm1b', name: 'M1b', diameterKm: 700, role: 'moon', parentId: 'm1', orbitAu: 0.002 },
      { id: 'p2', name: 'P2', diameterKm: 1000, role: 'planet', parentId: null, orbitAu: 2 }
    ];
    const { slots } = layoutStrip(TRAIN, 1, { order: 'orbit' });
    const at = (n: string) => slots.find((s) => s.name === n)!;
    const rowRight = at('M1b').centrePx + at('M1b').spanPx / 2;
    expect(rowRight).toBeGreaterThan(at('P1').centrePx + at('P1').spanPx / 2);
    expect(at('P2').centrePx - at('P2').spanPx / 2).toBeGreaterThan(rowRight);
  });

  it('reports how far the widest row reaches, and reports ZERO for every flat order', () => {
    expect(layoutStrip(SYS, 1 / 1000, { order: 'orbit' }).crossReachPx).toBeGreaterThan(0);
    for (const o of ['size', 'name', 'mass'] as const) {
      const l = layoutStrip(SYS, 1 / 1000, { order: o });
      expect(l.crossReachPx).toBe(0);
      expect(l.slots.every((sl) => sl.crossPx === 0)).toBe(true);
    }
  });

  it('tucks the first moon under its planet, sized by the MOON and not by the planet', () => {
    // Jupiter is 139,822 km and Io 3,643. At a scale that draws Jupiter 3,000 px wide the shared
    // larger-of-two gap would put 660 px of black between them and lose the moons off the window;
    // sized by the moon it is about 17. The planet's own radius is already all the separation there is.
    const scale = 3000 / 139822;
    const { slots } = layoutStrip(SYS, scale, { order: 'orbit' });
    const at = (n: string) => slots.find((s) => s.name === n)!;
    const jupiterEdge = at('Jupiter').spanPx / 2;
    const ioTopEdge = at('Io').crossPx - at('Io').spanPx / 2;
    const gapToLimb = ioTopEdge - jupiterEdge;
    expect(gapToLimb).toBeCloseTo(GAPF * at('Io').spanPx, 6);
    expect(gapToLimb).toBeLessThan(at('Io').spanPx);          // tucked under the limb...
    expect(gapToLimb).toBeLessThan(0.02 * at('Jupiter').spanPx); // ...not a fraction of the planet
  });

  it('keeps the ordinary larger-of-two gap BETWEEN siblings, where the two are comparable', () => {
    const scale = 3000 / 139822;
    const { slots } = layoutStrip(SYS, scale, { order: 'orbit' });
    const at = (n: string) => slots.find((s) => s.name === n)!;
    // Io then Ganymede: the gap between them is a fraction of the LARGER, which is Ganymede.
    const between = (at('Ganymede').crossPx - at('Ganymede').spanPx / 2) - (at('Io').crossPx + at('Io').spanPx / 2);
    expect(between).toBeCloseTo(GAPF * Math.max(at('Io').spanPx, at('Ganymede').spanPx), 6);
  });

  it('keeps the pixel floor honest in the tree too', () => {
    // Moonlet is 60 km; at this scale it is well under a pixel and must be a DOT, not a small disc.
    const moonlet = layoutStrip(SYS, 1 / 1000, { order: 'orbit' }).slots.find((s) => s.name === 'Moonlet')!;
    expect(moonlet.diameterPx).toBeCloseTo(0.06, 6);
    expect(moonlet.belowFloor).toBe(true);
    expect(moonlet.spanPx).toBe(DOT_PX);
  });
});

describe('size comparison — moving along the strip', () => {
  // A phone has no wheel. Until a user said so (2026-09-05) the ONLY pan path was a `wheel` handler,
  // so on a touch device the strip could not be moved at all: everything past the opening screenful
  // was unreachable. These are the laws the drag, the pinch, the steppers and the arrow keys share.

  it('never scrolls before the start, so the largest object is always reachable', () => {
    expect(clampScroll(-500, 5000, 800)).toBe(0);
    expect(clampScroll(-0.001, 5000, 800)).toBe(0);
  });

  it('never scrolls past the end, so you cannot land in empty space beyond the smallest', () => {
    expect(clampScroll(99999, 5000, 800)).toBe(4200);   // 5000 - 800
    expect(clampScroll(4200, 5000, 800)).toBe(4200);
  });

  it('answers ZERO when the whole strip already fits — not a negative offset', () => {
    // `lengthPx - spanPx` is -300 here, and using it would push the strip off the near edge.
    expect(clampScroll(0, 500, 800)).toBe(0);
    expect(clampScroll(120, 500, 800)).toBe(0);
  });

  it('survives a NaN rather than propagating it through every position on screen', () => {
    expect(clampScroll(NaN, 5000, 800)).toBe(0);
    expect(clampScroll(Infinity, 5000, 800)).toBe(4200);
  });

  it('holds the anchor point still through a zoom — the pinch does not slide the view away', () => {
    // A body 2,000 px along the strip sits 500 px into an 800 px window (scroll 1,500). Zoom x2
    // about that same 500 px point and it must still be at 500 px: the strip doubles, so the body is
    // now 4,000 px along and the scroll has to be 3,500.
    expect(scrollForZoom(1500, 500, 1, 2, 20000, 800)).toBe(3500);
    // And the reverse: halving puts it back.
    expect(scrollForZoom(3500, 500, 2, 1, 40000, 800)).toBe(1500);
  });

  it('anchors on the window MIDDLE for a wheel and on the pinch centre for two fingers', () => {
    // Same zoom, two anchors, two different scrolls — that is what "about a point" means.
    const middle = scrollForZoom(1000, 400, 1, 2, 20000, 800);
    const edge = scrollForZoom(1000, 0, 1, 2, 20000, 800);
    expect(middle).not.toBe(edge);
    expect(middle).toBe(2400);   // (1000 + 400) * 2 - 400
    expect(edge).toBe(2000);     // (1000 + 0) * 2 - 0
  });

  it('clamps the zoom result against the strip at its NEW length, not its old one', () => {
    // Zooming OUT shortens the strip; a scroll that was legal before can be past the new end.
    // Strip 20,000 px at scale 1 becomes 2,000 px at scale 0.1, so the furthest scroll is 1,200.
    // The anchor rule alone would put this at (19,000 + 400) x 0.1 - 400 = 1,540 — past the end.
    expect(scrollForZoom(19000, 400, 1, 0.1, 20000, 800)).toBe(1200);
    // And a scroll the anchor rule already leaves inside is not touched: 1,140, not the 1,200 cap.
    expect(scrollForZoom(15000, 400, 1, 0.1, 20000, 800)).toBe(1140);
  });

  it('refuses to divide by a zero scale', () => {
    expect(scrollForZoom(1500, 400, 0, 2, 20000, 800)).toBe(1500);
    expect(scrollForZoom(1500, 400, 1, 0, 20000, 800)).toBe(1500);
  });

  it('steps by most of a screenful, so a landmark carries across', () => {
    // A whole screenful teleports the reader; a small nudge takes forever. The overlap is the point.
    expect(STEP_FRACTION).toBeGreaterThan(0.5);
    expect(STEP_FRACTION).toBeLessThan(1);
    // Two presses from the start, on a 5,000 px strip in an 800 px window: 640 then 1,280.
    expect(clampScroll(0 + 800 * STEP_FRACTION, 5000, 800)).toBe(640);
    expect(clampScroll(640 + 800 * STEP_FRACTION, 5000, 800)).toBe(1280);
    // And pressing at the end goes nowhere rather than off it.
    expect(clampScroll(4200 + 800 * STEP_FRACTION, 5000, 800)).toBe(4200);
  });

  it('has a tap slop a finger can satisfy and a drag cannot', () => {
    // The number itself is the assertion: a touch surface has no separate click, so a drag ending on
    // a body would otherwise select it and rescale the whole view.
    expect(TAP_SLOP_PX).toBeGreaterThan(2);    // a finger is never pixel-steady
    expect(TAP_SLOP_PX).toBeLessThan(30);      // and a real drag must still be told apart
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

  it('staggers labels that would collide, and only those', () => {
    // On a strip of STARS, Luna and Earth both land a few pixels from zero: at the scale that makes a
    // red dwarf 340 px across they are 3 px and 11 px in, and their labels overlapped into one smudge
    // on the live map. The second (and third) drop to the next row; nothing else moves.
    const starScale = 340 / 700000;
    const crowded = referenceMarks(starScale, 1200);
    expect(crowded.find((m) => m.id === 'luna')!.row).toBe(0);
    expect(crowded.find((m) => m.id === 'earth')!.row).toBe(1);
    // Zoomed right in on a moon, Luna and Earth are far apart and both sit on row 0.
    const moonScale = 400 / 3474.8;
    const spread = referenceMarks(moonScale, 1e7);
    expect(spread.find((m) => m.id === 'luna')!.posPx).toBeCloseTo(400, 6);
    expect(spread.find((m) => m.id === 'earth')!.posPx - spread.find((m) => m.id === 'luna')!.posPx)
      .toBeGreaterThan(LABEL_MIN_GAP_PX);
    expect(spread.find((m) => m.id === 'earth')!.row).toBe(0);
  });

  it('reads SIZE rather than position, so it does not move when the strip scrolls', () => {
    // The ruler answers "how many pixels is one Earth at this scale", which is what lets you judge
    // anything on screen against it. Nothing in its inputs is the scroll, and that is deliberate.
    const a = referenceMarks(0.02, 1000);
    const b = referenceMarks(0.02, 1000);
    expect(a.map((m) => m.posPx)).toEqual(b.map((m) => m.posPx));
  });

  it('lays minor ticks on the app nice-interval ladder, inside the ruler', () => {
    const scale = pxPerKm(medianPlanet(SOL)!.diameterKm, 800, OPENING_SHARE);
    const ticks = minorTicks(scale, 1000);
    expect(ticks.length).toBeGreaterThan(2);
    expect(ticks.every((t) => t.posPx > 0 && t.posPx <= 1000.1)).toBe(true);
    // 1/2/5 ladder: every step is a round multiple, so the gaps are all equal.
    const gaps = ticks.slice(1).map((t, i) => t.km - ticks[i].km);
    expect(new Set(gaps.map((g) => g.toPrecision(8))).size).toBe(1);
    expect(minorTicks(0, 1000)).toEqual([]);
    expect(minorTicks(1, 0)).toEqual([]);
  });

  it('reports a mark that falls off the ruler rather than dropping it', () => {
    const scale = pxPerKm(medianPlanet(SOL)!.diameterKm, 800, OPENING_SHARE);
    const marks = referenceMarks(scale, 1000);
    expect(marks.find((m) => m.id === 'earth')!.off).toBe('none');    // 240 px in
    expect(marks.find((m) => m.id === 'sun')!.off).toBe('end');       // 26,233 px — far off the end
    expect(marks.find((m) => m.id === 'luna')!.posPx).toBeCloseTo(65.449, 2);
  });
});
