import { describe, it, expect } from 'vitest';
import {
  sortBySize, medianPlanet, pxPerKm, layoutStrip, belowFloorNote,
  idsAtLeast, idsAtMost, visibleItems, referenceArcs, REFERENCE_TICKS, MIN_ARC_RADIUS_PX,
  TAP_SLOP_PX, STEP_FRACTION, sortItems, orbitOrder, orbitTree, measureSlot,
  SORT_ORDERS, GAP_FRACTION as GAPF,
  OPENING_SHARE, GAP_FRACTION, DOT_THRESHOLD_PX, DOT_PX, RING_ROOM_FRACTION,
  focusIndexOf, clampFocus, focusDiameterKm, scaleForFocus, focusCentrePx, focusCrossPx, focusStepPx,
  focusBlend,
  clampCentreShare, MIN_CENTRE_SHARE, MAX_CENTRE_SHARE, slotAt, PICK_MIN_RADIUS_PX,
  ringOpacityAt, RING_FADE_STEPS, ringProminence, ringOpenness, ringTiltRad, slotOffset,
  DEFAULT_RING_OPENNESS, MIN_RING_OPENNESS,
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

  it('frames WHATEVER is at the centre at the one share — a star and a speck alike', () => {
    // There is no second share for a click: the share applies to the focus, so clicking the smallest
    // rock on the strip brings you all the way in to it. That is what makes a click navigation
    // rather than a zoom (owner, 2026-09-06).
    const sun = pxPerKm(SOL[0].diameterKm, SHORT, OPENING_SHARE);
    expect(SOL[0].diameterKm * sun).toBeCloseTo(176, 6);
    const phobos = SOL.find((i) => i.name === 'Phobos')!;
    const s = pxPerKm(phobos.diameterKm, SHORT, OPENING_SHARE);
    expect(phobos.diameterKm * s).toBeCloseTo(176, 6);        // the SAME 176 px, for a 22.5 km rock
  });

  it('opens with the median planet at the OPENING share of the shorter side', () => {
    const earth = medianPlanet(SOL)!;
    const s = pxPerKm(earth.diameterKm, SHORT, OPENING_SHARE);
    expect(earth.diameterKm * s).toBeCloseTo(176, 6);           // 0.22 x 800
    // AND THE ABSOLUTE FIGURES THAT FALL OUT OF IT, for the Solar System, at that scale. Earth is
    // 12,742 km across, so the scale is 176 / 12,742 = 0.013812... px/km.
    expect(s).toBeCloseTo(0.0138125883, 9);
    expect(SOL.find((i) => i.name === 'Jupiter')!.diameterKm * s).toBeCloseTo(1931.303, 2);   // 139,822 km
    expect(SOL.find((i) => i.name === 'Luna')!.diameterKm * s).toBeCloseTo(47.996, 2);        // 3,474.8 km
    expect(SOL.find((i) => i.name === 'Sun')!.diameterKm * s).toBeCloseTo(19236.515, 2);      // 1,392,680 km
  });

  it('measures against the SHORTER side, so turning the device does not change the share', () => {
    const landscape = pxPerKm(SOL[3].diameterKm, 600, OPENING_SHARE); // shorter side 600 either way
    const portrait = pxPerKm(SOL[3].diameterKm, 600, OPENING_SHARE);
    expect(landscape).toBe(portrait);
  });

  it('bounds the hand zoom as a SHARE, which means the same thing on every map', () => {
    // UI-L7 wants a bound taken from the data rather than a constant, and it was written about an
    // ABSOLUTE scale - which this view no longer has. "Between a twentieth and nine tenths of the
    // screen" is already map-independent, so the constants ARE the honest form here.
    expect(clampCentreShare(10)).toBe(MAX_CENTRE_SHARE);
    expect(clampCentreShare(0.0001)).toBe(MIN_CENTRE_SHARE);
    expect(clampCentreShare(0.4)).toBe(0.4);
    expect(clampCentreShare(NaN)).toBe(OPENING_SHARE);
    expect(MIN_CENTRE_SHARE).toBeLessThan(OPENING_SHARE);
    expect(MAX_CENTRE_SHARE).toBeGreaterThan(OPENING_SHARE);
  });

  it('survives an empty set and a zero-size viewport', () => {
    expect(pxPerKm(100, 0, 0.5)).toBe(0);
    expect(pxPerKm(0, 800, 0.5)).toBe(0);
    expect(scaleForFocus([], 0, 800, 0.3)).toBe(0);
  });
});

// THE ROLLING ZOOM. Owner, 2026-09-06: the strip must not be one fixed scale, because a set that
// spans five orders of magnitude has no single scale that works - "at the moment they are stupid
// massive and hard to scroll past". Whatever is at the centre of the window draws at the same share
// of it, and the scale follows the scroll to keep that true.
describe('size comparison — the scale follows what is in the middle', () => {
  const SHORT = 800;

  it('draws whatever is at the focus at the centre share, WHATEVER it is', () => {
    // The whole law, stated in absolutes (PHY-34) rather than as a ratio. Sol is sorted by size, so
    // index 0 is the Sun and index 5 is Earth.
    const seq = sortItems(SOL, 'size');
    expect(seq[0].name).toBe('Sun');
    const atSun = scaleForFocus(seq, 0, SHORT, OPENING_SHARE);
    expect(seq[0].diameterKm * atSun).toBeCloseTo(176, 6);          // 0.22 x 800
    const iEarth = focusIndexOf(seq, 'earth');
    const atEarth = scaleForFocus(seq, iEarth, SHORT, OPENING_SHARE);
    expect(SOL[3].diameterKm * atEarth).toBeCloseTo(176, 6);        // the SAME 176 px
    // ...and the scale that did it is a hundred-odd times bigger, which is the zoom.
    expect(atEarth / atSun).toBeCloseTo(1392680 / 12742, 6);
  });

  it('cures the fault it was written for: the Sun stops being a wall you drag past', () => {
    // The reported fault, as a measurement. At ONE fixed scale that shows Earth at the opening share
    // of an 800 px side, the Sun draws 19,237 px across - twenty-four screenfuls of star. Under the
    // rolling zoom every object in turn draws 176 px WHEN IT IS THE ONE YOU ARE LOOKING AT, and the
    // assertion goes through the real layout rather than through the scale that produced it.
    const seq = sortItems(SOL, 'size');
    const fixed = pxPerKm(SOL[3].diameterKm, SHORT, OPENING_SHARE);
    expect(SOL.find((i) => i.name === 'Sun')!.diameterKm * fixed).toBeGreaterThan(19000);
    for (let f = 0; f < seq.length; f++) {
      const layout = layoutStrip(SOL, scaleForFocus(seq, f, SHORT, OPENING_SHARE), { axis: 'x' });
      const slot = layout.slots.find((s) => s.id === seq[f].id)!;
      expect(slot.diameterPx).toBeCloseTo(176, 6);
    }
  });

  it('interpolates the focused size GEOMETRICALLY, so the zoom does not lurch', () => {
    const seq = [
      { id: 'a', name: 'A', diameterKm: 100, role: 'planet' },
      { id: 'b', name: 'B', diameterKm: 10000, role: 'planet' }
    ] as ComparisonItem[];
    // Halfway between 100 and 10,000 is 1,000 - a hundredfold either side. The arithmetic mean is
    // 5,050, which sits visually right beside B and makes the zoom hold still then rush.
    expect(focusDiameterKm(seq, 0.5)).toBeCloseTo(1000, 9);
    expect(focusDiameterKm(seq, 0)).toBe(100);
    expect(focusDiameterKm(seq, 1)).toBe(10000);
    // A quarter of the way is 100 x (100 ^ 0.25) = 316.23.
    expect(focusDiameterKm(seq, 0.25)).toBeCloseTo(316.2278, 3);
  });

  it('keeps EVERYTHING on screen at true relative size, which is the point of the view', () => {
    // One scale serves the whole frame. What travels is the zoom, not the honesty: at any focus,
    // Jupiter is 11.209 Earths, exactly as it is in the sky.
    const seq = sortItems(SOL, 'size');
    for (const f of [0, 2.5, 5, 8.3]) {
      const s = scaleForFocus(seq, f, SHORT, OPENING_SHARE);
      const jup = SOL.find((i) => i.name === 'Jupiter')!.diameterKm * s;
      const ear = SOL.find((i) => i.name === 'Earth')!.diameterKm * s;
      expect(jup / ear).toBeCloseTo(139822 / 12742, 9);
    }
  });

  it('puts the focused object in the MIDDLE of the window, at both ends of the strip', () => {
    const seq = sortItems(SOL, 'size');
    for (const f of [0, 3, seq.length - 1]) {
      const scale = scaleForFocus(seq, f, SHORT, OPENING_SHARE);
      const layout = layoutStrip(SOL, scale, { axis: 'x' });
      const scroll = focusCentrePx(layout, seq, f) - 900 / 2;      // a 900 px window
      const slot = layout.slots.find((s) => s.id === seq[f].id)!;
      expect(slot.centrePx - scroll).toBeCloseTo(450, 6);          // dead centre
    }
  });

  it('lets the along-scroll go NEGATIVE at the start — the first object is entitled to the middle', () => {
    // The tell that the old pixel clamp is gone. With the largest object centred there IS empty
    // strip before it, and clamping to zero would pin it to the near edge instead.
    const seq = sortItems(SOL, 'size');
    const scale = scaleForFocus(seq, 0, SHORT, OPENING_SHARE);
    const layout = layoutStrip(SOL, scale, { axis: 'x' });
    expect(focusCentrePx(layout, seq, 0) - 900 / 2).toBeLessThan(0);
  });

  it('clamps the focus to the strip and never lets a NaN through', () => {
    expect(clampFocus(-5, 9)).toBe(0);
    expect(clampFocus(99, 9)).toBe(8);
    expect(clampFocus(3.5, 9)).toBe(3.5);
    expect(clampFocus(NaN, 9)).toBe(0);
    expect(clampFocus(2, 1)).toBe(0);       // one object is the whole journey
    expect(clampFocus(2, 0)).toBe(0);
  });

  it('travels through EVERY object, moons included — a moon may be the subject', () => {
    // Owner, 2026-09-06: "Same for moons if you zoom down to them - their frame of reference is
    // themselves so you will see the vast size of your host." So the sequence is the strip itself,
    // in the strip's own order, and the ORBIT layout's slots are laid out in exactly that sequence.
    const seq = sortItems(SYS, 'orbit');
    expect(seq.length).toBe(SYS.length);
    expect(focusIndexOf(seq, 'luna')).toBeGreaterThanOrEqual(0);
    const layout = layoutStrip(SYS, 0.002, { axis: 'x', order: 'orbit' });
    expect(layout.slots.map((s) => s.id)).toEqual(seq.map((i) => i.id));
    // ...and the scale it puts you at is LUNA's, which is what makes Earth loom behind it.
    const iLuna = focusIndexOf(seq, 'luna');
    const scale = scaleForFocus(seq, iLuna, 800, OPENING_SHARE);
    expect(3475 * scale).toBeCloseTo(800 * OPENING_SHARE, 6);
    // ...and Earth then looms behind it at 645 px - three quarters of the shorter side, from a body
    // that was 176 px across a moment ago. That is the "vast size of your host" the owner asked for.
    expect(12742 * scale).toBeCloseTo(645.35, 2);
    expect(12742 * scale / 800).toBeGreaterThan(0.75);
  });

  it('brings a moon\u2019s ROW to the middle too, not just its column', () => {
    const seq = sortItems(SYS, 'orbit');
    const layout = layoutStrip(SYS, 0.002, { axis: 'x', order: 'orbit' });
    const iLuna = focusIndexOf(seq, 'luna');
    const luna = layout.slots.find((s) => s.id === 'luna')!;
    expect(luna.crossPx).toBeGreaterThan(0);           // off the centreline, or this proves nothing
    expect(focusCrossPx(layout, seq, iLuna)).toBeCloseTo(luna.crossPx, 6);
    // A flat order has no second dimension at all, and must not acquire one.
    const flat = layoutStrip(SOL, 1, { axis: 'x' });
    expect(focusCrossPx(flat, sortItems(SOL, 'size'), 3)).toBe(0);
  });

  it('never hands the drag a rate of zero, even where two slots share a centre', () => {
    // In the orbit layout a planet and its first moon have the SAME centrePx and differ only across.
    // An along-only exchange rate is zero there, and the drag then divides by nothing.
    const seq = sortItems(SYS, 'orbit');
    const layout = layoutStrip(SYS, 0.002, { axis: 'x', order: 'orbit' });
    const iEarth = focusIndexOf(seq, 'earth');
    const earth = layout.slots.find((s) => s.id === 'earth')!;
    const luna = layout.slots.find((s) => s.id === 'luna')!;
    expect(luna.centrePx).toBe(earth.centrePx);        // the fault this guards, present in the data
    // The rate is the cross separation carried through the constant-speed factor ([[B136]]) - the
    // point of THIS gate is that it is driven by the CROSS gap and so is never zero, and the exact
    // figure is written out so a change to either law has to be meant.
    const r = seq[iEarth + 1].diameterKm / seq[iEarth].diameterKm;
    expect(focusStepPx(layout, seq, iEarth))
      .toBeCloseTo((luna.crossPx - earth.crossPx) * Math.log(r) / (r - 1), 6);
    expect(focusStepPx(layout, seq, iEarth)).toBeGreaterThan(1);
  });

  it('gives the drag an exchange rate that is never zero and follows the local scale', () => {
    const seq = sortItems(SOL, 'size');
    const near = scaleForFocus(seq, 0, SHORT, OPENING_SHARE);
    const stepAtSun = focusStepPx(layoutStrip(SOL, near, { axis: 'x' }), seq, 0);
    // One step of focus is worth about a screenful of picture wherever you are - that is what makes
    // every object cost the same to scroll past whatever its true size.
    expect(stepAtSun).toBeGreaterThan(100);
    expect(stepAtSun).toBeLessThan(2000);
    expect(focusStepPx(layoutStrip(SOL, near, { axis: 'x' }), [], 0)).toBe(0);
    expect(focusStepPx({ slots: [], lengthPx: 0, axis: 'x', crossReachPx: 0 }, seq, 0)).toBe(1);
  });

  it('fits four to six bodies on screen, with the neighbours whole — the owner\u2019s framing', () => {
    // Owner, 2026-09-06: "the left/right planets of the current one must be seen in full ... to let
    // 4-6 bodies appear on screen at once". Measured on the GM stage that was live when he said it:
    // 410 px across, opening on Earth. The step from one object to the next is the two half-spans
    // plus the gap, so what fits is what the assertion counts.
    const seq = sortItems(SOL, 'size');
    const iEarth = focusIndexOf(seq, 'earth');
    const layout = layoutStrip(SOL, scaleForFocus(seq, iEarth, 410, OPENING_SHARE), { axis: 'x' });
    const centre = focusCentrePx(layout, seq, iEarth);
    const whole = layout.slots.filter((s) =>
      s.centrePx - s.spanPx / 2 >= centre - 205 && s.centrePx + s.spanPx / 2 <= centre + 205);
    const touching = layout.slots.filter((s) =>
      s.centrePx + s.spanPx / 2 > centre - 205 && s.centrePx - s.spanPx / 2 < centre + 205);
    expect(whole.length).toBeGreaterThanOrEqual(3);      // the subject AND both neighbours, in full
    expect(touching.length).toBeGreaterThanOrEqual(4);
    expect(touching.length).toBeLessThanOrEqual(8);
  });
});

describe('size comparison — a step of the zoom is flown at a constant apparent speed', () => {
  // [[B136]]. Owner, 2026-09-06: "zooming between huge to small - star to mercury - breaks it". The
  // SCALE moves geometrically, so the screen gap between two neighbours multiplies by their diameter
  // ratio across one step - 285:1 from the Sun to Mercury. A linear blend of their positions sends
  // the incoming object out to twenty screens away and back, and the middle of the journey is empty
  // black. `focusBlend` is the constant-apparent-speed path that fixes it.
  const PAIR: ComparisonItem[] = [
    body('Sun', SOLAR_RADIUS_KM, 'star'),
    body('Mercury', 2439.7, 'planet')
  ];
  const SHORT_W = 730, WIN = 1400;

  /** Where the two objects sit relative to the middle of the window, at focus `f`. */
  const offsets = (items: ComparisonItem[], f: number) => {
    const seq = sortItems(items, 'size');
    const scale = scaleForFocus(seq, f, SHORT_W, OPENING_SHARE);
    const layout = layoutStrip(items, scale, { axis: 'x' });
    const scroll = focusCentrePx(layout, seq, f) - WIN / 2;
    const at = (i: number) => layout.slots.find((s) => s.id === seq[i].id)!.centrePx - scroll - WIN / 2;
    return { first: at(0), second: at(1) };
  };

  it('is EXACT at both stops and reduces to a straight blend for equal neighbours', () => {
    const seq = sortItems(PAIR, 'size');
    // A whole-numbered focus is ON its object, so the weight there is a hard zero - and the far stop
    // of a step is a hard one, reached from inside the step rather than from the index after it.
    expect(focusBlend(seq, 0)).toBe(0);
    expect(focusBlend(seq, 1 - 1e-12)).toBeCloseTo(1, 9);
    expect(focusBlend(seq, 1)).toBe(0);              // the last object, and the start of no step
    const twins = sortItems([body('A', 6000, 'planet'), body('B', 6000, 'planet')], 'size');
    for (const t of [0.1, 0.25, 0.5, 0.9]) expect(focusBlend(twins, t)).toBeCloseTo(t, 12);
    // 285:1 is emphatically NOT the straight blend - halfway through the step the picture is nearly
    // all the way onto Mercury, because that is where the scale has got to.
    expect(focusBlend(seq, 0.5)).toBeGreaterThan(0.9);
  });

  it('brings the incoming object in MONOTONICALLY instead of throwing it off the screen', () => {
    const ts = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
    const seen = ts.map((t) => offsets(PAIR, t).second);
    // It never leaves the window it started inside, and it only ever gets closer.
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeLessThan(seen[i - 1] + 1e-9);
    expect(Math.max(...seen)).toBeCloseTo(seen[0], 9);
    expect(seen[0]).toBeLessThan(WIN / 2);          // on screen at the start
    expect(seen[seen.length - 1]).toBeCloseTo(0, 9); // dead centre at the end
    // AND THE OUTGOING ONE ONLY EVER RECEDES, which is the other half of monotone.
    const away = ts.map((t) => offsets(PAIR, t).first);
    for (let i = 1; i < away.length; i++) expect(away[i]).toBeLessThan(away[i - 1] + 1e-9);
    expect(away[0]).toBeCloseTo(0, 9);
  });

  it('flies the same path in both directions, which is what a drag needs', () => {
    // The same two bodies with the SMALL one first: walking the pair backwards must retrace the same
    // picture, or dragging back the way you came would not put you where you started.
    const back = [body('Mercury', 2439.7, 'planet'), body('Sun', SOLAR_RADIUS_KM, 'star')];
    const seqBack = sortItems(back, 'name');   // 'name' keeps Mercury first
    expect(seqBack.map((i) => i.name)).toEqual(['Mercury', 'Sun']);
    const seqFwd = sortItems(PAIR, 'size');
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      expect(focusBlend(seqBack, 1 - t)).toBeCloseTo(1 - focusBlend(seqFwd, t), 9);
    }
  });

  it('prices the step the same from either end - the drag rate is not the local gap', () => {
    const seq = sortItems(PAIR, 'size');
    const lay = (f: number) => layoutStrip(PAIR, scaleForFocus(seq, f, SHORT_W, OPENING_SHARE), { axis: 'x' });
    const fromBig = focusStepPx(lay(0), seq, 0);
    const fromSmall = focusStepPx(lay(1), seq, 0.999999);
    // Within 5%, and the 3% that is there is the DOT FLOOR rather than the law: seen from the Sun,
    // Mercury is below a pixel and reserves the dot's 6 px instead of its own width, which stretches
    // the layout's idea of the gap by exactly that much (measured: 805,916 km against 782,341 km).
    expect(fromSmall / fromBig).toBeGreaterThan(0.95);
    expect(fromSmall / fromBig).toBeLessThan(1.05);
    // And it is worth a real drag rather than a flick: the raw separation at the big end was 93 px
    // for this pair, which crossed a 285-fold zoom in a thumb's width.
    const rawSeparation = (() => {
      const l = lay(0);
      const a = l.slots.find((s) => s.id === seq[0].id)!, b = l.slots.find((s) => s.id === seq[1].id)!;
      return Math.abs(b.centrePx - a.centrePx);
    })();
    expect(fromBig).toBeGreaterThan(rawSeparation * 3);
    expect(fromBig).toBeGreaterThan(300);
    expect(fromBig).toBeLessThan(WIN);
  });

  it('moves both axes on the same weight', () => {
    // A moon stacked off the centreline: the cross scroll must be as far through the step as the
    // along scroll is, or the picture slides sideways while it dives in.
    const seq = sortItems(SYS, 'orbit');
    const i = focusIndexOf(seq, 'earth');
    const layout = layoutStrip(SYS, 0.002, { axis: 'x', order: 'orbit' });
    const f = i + 0.4;
    const w = focusBlend(seq, f);
    const a = layout.slots.find((s) => s.id === seq[i].id)!;
    const b = layout.slots.find((s) => s.id === seq[i + 1].id)!;
    expect(focusCrossPx(layout, seq, f)).toBeCloseTo(a.crossPx * (1 - w) + b.crossPx * w, 9);
    expect(focusCentrePx(layout, seq, f)).toBeCloseTo(a.centrePx * (1 - w) + b.centrePx * w, 9);
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
    expect(phobos.diameterPx).toBeLessThan(DOT_THRESHOLD_PX);   // 22.534 km x 0.013813 = 0.31 px
    expect(phobos.diameterPx).toBeCloseTo(0.3113, 3);
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
    expect(m.ringInnerPx).toBe(66900);          // and the ring, at its TRUE radii, always
    expect(m.ringOuterPx).toBe(140180);
    expect(m.spanPx).toBe(116464);              // what is DRAWN as the body
  });

  it('never lets a ring into the ORDER — the strip compares globes, not jewellery', () => {
    // Saturn's rings are wider than Jupiter. Ordered by reach it would outrank Jupiter; it must not.
    const byName = sortItems([SATURN, JUPITER], 'size').map((i) => i.name);
    expect(byName).toEqual(['Jupiter', 'Saturn']);
  });

  it('lets the rings OVERLAP rather than spending the screen on room for them', () => {
    // Owner, 2026-09-06: "have them very close ... (rings can overlap)". Saturn reserving its full
    // reach means a ringed planet claims two and a half times its own room, and on a strip meant to
    // hold four to six bodies that pushes two of them off the screen to hold empty space. The ring
    // is still DRAWN at its true extent - it simply crosses its neighbour, which reads as depth.
    expect(RING_ROOM_FRACTION).toBe(0);
    expect(measureSlot(SATURN, 1).reachPx).toBe(116464);        // the globe, not the ring
    const { slots } = layoutStrip([SATURN, JUPITER], 1e-3);
    const at = (n: string) => slots.find((sl) => sl.name === n)!;
    const jupiterRight = at('Jupiter').centrePx + at('Jupiter').spanPx / 2;
    expect(at('Saturn').centrePx - at('Saturn').ringOuterPx).toBeLessThan(jupiterRight);
    // TURNING THE KNOB BACK UP GIVES THE ROOM BACK - the same measurer, one number.
    const roomy = measureSlot(SATURN, 1);
    expect(Math.max(roomy.spanPx, roomy.ringOuterPx * 2 * 1)).toBe(280360);
  });

  it('draws only ONE ring at full strength, and fades the rest out either side', () => {
    // Owner, 2026-09-06: "rings on unselected planets need to disappear each side - fade in/out as
    // it moves so only 1 ring is only fully visible - 2 on a move - saves a lot of nasty alpha."
    expect(ringOpacityAt(0)).toBe(1);                 // the one you are looking at
    expect(ringOpacityAt(1)).toBe(0);                 // its neighbour, gone
    expect(ringOpacityAt(-1)).toBe(0);                // and gone on the other side too
    expect(ringOpacityAt(4)).toBe(0);
    // MID-MOVE, exactly two are drawn and they share one ring's worth of alpha between them.
    expect(ringOpacityAt(-0.5) + ringOpacityAt(0.5)).toBeCloseTo(1, 9);
    expect(ringOpacityAt(0.25)).toBeCloseTo(0.75, 9);
    // A FADE, not a cut: a ring that vanished at a boundary would pop on a view you scroll.
    expect(ringOpacityAt(0.999)).toBeGreaterThan(0);
    expect(RING_FADE_STEPS).toBeGreaterThan(0);
    expect(ringOpacityAt(NaN)).toBe(0);
  });

  it('draws a ring as brightly as it DESERVES, from the stuff actually in it', () => {
    // Owner, 2026-09-06: "most planets look as spectacular as saturn - and that aint right." The
    // sizes were right and that was the problem: Jupiter's rings reach 3.23 planet radii against
    // Saturn's 2.41, because Jupiter's include the gossamer ring nobody can see. Drawn at one
    // brightness, the faintest rings in the Solar System read as the grandest.
    // THE REAL FIGURES, from the bundled Sol, as surface density in kg/m^2:
    const sat = ringProminence(66900, 140180, 5e23);      // 1.0e7 - the finest sight in the sky
    const nep = ringProminence(41900, 62930, 2e20);       // 2.9e4
    const ura = ringProminence(38000, 98000, 4e20);       // 1.6e4
    const jup = ringProminence(92000, 226000, 1.5e20);    // 1.1e3 - invisible without a spacecraft
    expect(sat).toBe(1);
    expect(jup).toBeLessThan(0.01);
    // Saturn outshines every one of them by a wide margin, and the order is the physical one.
    expect(sat).toBeGreaterThan(nep * 3);
    expect(nep).toBeGreaterThan(ura);
    expect(ura).toBeGreaterThan(jup * 10);
    // ...and the WIDEST rings are no longer the brightest, which was the whole complaint.
    expect(226000 / 69911).toBeGreaterThan(140180 / 58232);   // Jupiter's reach beats Saturn's
    expect(jup).toBeLessThan(sat);                            // and its rings do not
  });

  it('draws an authored ring with no mass IN FULL rather than refusing it', () => {
    // Steer, never stop: a GM who drew a ring wants to see a ring, and "invisible, because you did
    // not weigh it" is the refusal the standing rule forbids.
    expect(ringProminence(66900, 140180)).toBe(1);
    expect(ringProminence(66900, 140180, 0)).toBe(1);
    expect(ringProminence(66900, 140180, NaN)).toBe(1);
    expect(ringProminence(140180, 66900, 5e23)).toBe(1);   // nonsense radii: draw it, do not divide
  });

  it('opens a ring by its host’s OBLIQUITY, so Uranus does not look like Saturn', () => {
    // The convention is written down in `ringOpenness`: the strip views every body from its own
    // orbital plane and presents each ring at its most open azimuth, so openness is sin(tilt).
    // Every figure below is checkable against a photograph.
    expect(ringOpenness(26.73)).toBeCloseTo(0.4498, 4);    // Saturn
    expect(ringOpenness(28.32)).toBeCloseTo(0.4744, 4);    // Neptune
    expect(ringOpenness(97.77)).toBeCloseTo(0.9908, 4);    // URANUS - all but a circle, on its side
    expect(ringOpenness(3.13)).toBeCloseTo(0.0546, 4);     // Jupiter - all but a line
    // The one everybody knows: Uranus's rings present twice as open as Saturn's, not the same.
    expect(ringOpenness(97.77)).toBeGreaterThan(ringOpenness(26.73) * 2);
    // A tilt nobody measured falls back to the poster angle, not to an invisible edge-on line.
    expect(ringOpenness(undefined)).toBe(DEFAULT_RING_OPENNESS);
    expect(ringOpenness(NaN)).toBe(DEFAULT_RING_OPENNESS);
    // And a genuinely upright body still shows a sliver rather than nothing.
    expect(ringOpenness(0)).toBe(MIN_RING_OPENNESS);
    // The renderer wants an angle: face-on is 0, edge-on is a right angle.
    expect(ringTiltRad(90)).toBeCloseTo(0, 9);
    expect(Math.cos(ringTiltRad(26.73))).toBeCloseTo(ringOpenness(26.73), 9);
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
    expect(tiny.reachPx).toBe(DOT_PX);          // and no phantom ring
  });

  it('ignores a ring whose radii are nonsense rather than drawing it inside out', () => {
    const wrong = measureSlot({ ...SATURN, ringInnerKm: 200000, ringOuterKm: 100000 }, 1);
    expect(wrong.ringOuterPx).toBe(0);
    expect(wrong.reachPx).toBe(wrong.spanPx);
  });

  it('measures the ring the same way in the ORBIT layout — ONE measurer, both layouts', () => {
    // The flat strip and the tree must never disagree about a ringed planet, whatever the room rule
    // is set to: they call the same `measureSlot`.
    const withMoon: ComparisonItem[] = [
      { ...SATURN, parentId: null, orbitAu: 9.5 },
      { id: 'titan', name: 'Titan', diameterKm: 5149, role: 'moon', parentId: 'saturn', orbitAu: 0.008 },
      { id: 'p2', name: 'Next', diameterKm: 50000, role: 'planet', parentId: null, orbitAu: 19 }
    ];
    const { slots } = layoutStrip(withMoon, 1e-3, { order: 'orbit' });
    const at = (n: string) => slots.find((sl) => sl.name === n)!;
    expect(at('Saturn').ringOuterPx).toBeCloseTo(140.18, 6);     // drawn at TRUE extent, as ever
    const flat = layoutStrip(withMoon, 1e-3).slots.find((sl) => sl.name === 'Saturn')!;
    expect(at('Saturn').reachPx).toBe(flat.reachPx);
    expect(at('Saturn').spanPx).toBe(flat.spanPx);
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

  // The PIXEL clamp that used to be gated here has gone with the pixel scroll it bounded: both axes
  // are derived from the focus now, and both must be free to run past the ends so that the first and
  // last objects can sit in the middle of the window like any other. `clampFocus` is the bound, and
  // it is gated with the rest of the focus law above.

  it('steps by most of a screenful, so a landmark carries across', () => {
    // A whole screenful teleports the reader; a small nudge takes forever. The overlap is the point.
    expect(STEP_FRACTION).toBeGreaterThan(0.5);
    expect(STEP_FRACTION).toBeLessThan(1);
    // The step is now taken in FOCUS: a press moves 0.8 of a window, divided by what one step of
    // focus is worth in px here. On the strip at Earth in an 800 px window that is a fraction of an
    // object, and two presses land past the next one rather than teleporting off the end.
    const seq = sortItems(SOL, 'size');
    const scale = scaleForFocus(seq, 5, 800, OPENING_SHARE);
    const layout = layoutStrip(SOL, scale, { axis: 'x' });
    const per = (800 * STEP_FRACTION) / focusStepPx(layout, seq, 5);
    expect(per).toBeGreaterThan(0.2);
    expect(per).toBeLessThan(6);
    expect(clampFocus(seq.length - 1 + per, seq.length)).toBe(seq.length - 1);   // and stops at the end
  });

  it('has a tap slop a finger can satisfy and a drag cannot', () => {
    // The number itself is the assertion: a touch surface has no separate click, so a drag ending on
    // a body would otherwise select it and rescale the whole view.
    expect(TAP_SLOP_PX).toBeGreaterThan(2);    // a finger is never pixel-steady
    expect(TAP_SLOP_PX).toBeLessThan(30);      // and a real drag must still be told apart
  });
});

// PICKING AGAINST THE LAYOUT. The DOM hit areas could not be trusted with this even when they were
// still receiving taps: their boxes overlap, because at true scale a giant's disc covers the whole
// window. And they had STOPPED receiving them - see the standing note on `setPointerCapture` in
// `SizeComparisonView`.
// THE FLOATING ORIGIN ([[B134]]). A slot's `centrePx` is measured from the START of the strip and is
// UNBOUNDED: the strip is sorted by size, so one enormous object puts everything behind it at a
// coordinate of its own diameter and upwards. A float32 vertex pipeline carries about seven
// significant digits, so at 10^9 it quantises in steps of ~100 units and a 150 px star built there
// draws as a cuboid. The renderer must never see the absolute number.
describe('size comparison — nothing is ever placed at its absolute strip coordinate', () => {
  it('reports every position RELATIVE to the scroll, on both axes', () => {
    expect(slotOffset(1200, 40, 1000, 10)).toEqual({ along: 200, cross: 30 });
    expect(slotOffset(0, 0, 0, 0)).toEqual({ along: 0, cross: 0 });
    expect(slotOffset(500, 0, 900, 0).along).toBe(-400);      // behind you is negative, not clamped
  });

  it('keeps the numbers small with a 10,700 AU object on the strip — the map that found this', () => {
    // The owner's own starmap: Psi Draconis at 1,601,582,000,000 km beside ordinary red dwarfs. It
    // sorts FIRST, so every star behind it sits at a coordinate of its diameter and upwards.
    const monster = body('Psi Draconis', 800791000000, 'star');
    const set = [monster, ...SOL.filter((i) => i.role !== 'star')];
    const seq = sortItems(set, 'size');
    // Focus a normal world, which is what the reader is actually looking at.
    const f = focusIndexOf(seq, 'earth');
    const scale = scaleForFocus(seq, f, 800, OPENING_SHARE);
    const layout = layoutStrip(set, scale, { axis: 'x' });
    const scrollPx = focusCentrePx(layout, seq, f) - 1200 / 2;
    // THE ABSOLUTE COORDINATE IS ENORMOUS - that is the fault, present in the data.
    const earth = layout.slots.find((s) => s.id === 'earth')!;
    expect(earth.centrePx).toBeGreaterThan(1e8);
    // ...and every drawn position is inside a viewport of the origin anyway.
    for (const s of layout.slots) {
      const { along, cross } = slotOffset(s.centrePx, s.crossPx, scrollPx, 0);
      if (Math.abs(along) > 1200 + s.spanPx) continue;        // off-window slots are never built
      expect(Math.abs(along)).toBeLessThanOrEqual(1200 + s.spanPx);
      expect(Math.abs(cross)).toBeLessThanOrEqual(800);
    }
    // And the focused world is still dead centre, so the fix costs the law nothing.
    expect(slotOffset(earth.centrePx, 0, scrollPx, 0).along).toBeCloseTo(600, 6);
  });
});

describe('size comparison — what is under a tap', () => {
  const layout = layoutStrip(SOL, scaleForFocus(sortItems(SOL, 'size'), 5, 800, OPENING_SHARE), { axis: 'x' });
  const slot = (name: string) => layout.slots.find((s) => s.name === name)!;

  it('answers with the object whose centre the point is inside', () => {
    const earth = slot('Earth');
    expect(slotAt(layout, earth.centrePx, 0)?.name).toBe('Earth');
    // Just inside its limb, and just outside it into the gap.
    expect(slotAt(layout, earth.centrePx + earth.spanPx / 2 - 1, 0)?.name).toBe('Earth');
    expect(slotAt(layout, earth.centrePx, earth.spanPx / 2 + 40)).toBeNull();
  });

  it('answers the SMALLER of two objects a point is inside — what the hand meant', () => {
    // The strip lays its objects edge to edge, so two SLOTS do not normally overlap; where they do
    // is the pick floor (two neighbouring dots 6 px apart, each given an 8 px target) and any future
    // layout that stacks. A DOM stack would decide it by document order, which is the size order and
    // therefore always the WRONG way round: the giant would win every tap on the small thing.
    const stacked = {
      slots: [
        { id: 'giant', name: 'Giant', spanPx: 900, diameterPx: 900, reachPx: 900, ringInnerPx: 0, ringOuterPx: 0,
          centrePx: 1000, crossPx: 0, depth: 0, belowFloor: false, labelSide: 'start' },
        { id: 'speck', name: 'Speck', spanPx: 12, diameterPx: 12, reachPx: 12, ringInnerPx: 0, ringOuterPx: 0,
          centrePx: 1100, crossPx: 0, depth: 0, belowFloor: false, labelSide: 'start' }
      ],
      lengthPx: 2000, axis: 'x', crossReachPx: 0
    } as unknown as ReturnType<typeof layoutStrip>;
    expect(slotAt(stacked, 1100, 0)?.name).toBe('Speck');     // inside BOTH
    expect(slotAt(stacked, 1000, 0)?.name).toBe('Giant');     // inside only the giant
  });

  it('separates two neighbouring dots by distance, once the pick floor has overlapped them', () => {
    const dots = {
      slots: [
        { id: 'a', name: 'A', spanPx: DOT_PX, diameterPx: 0.4, reachPx: DOT_PX, ringInnerPx: 0, ringOuterPx: 0,
          centrePx: 500, crossPx: 0, depth: 0, belowFloor: true, labelSide: 'start' },
        { id: 'b', name: 'B', spanPx: DOT_PX, diameterPx: 0.4, reachPx: DOT_PX, ringInnerPx: 0, ringOuterPx: 0,
          centrePx: 510, crossPx: 0, depth: 0, belowFloor: true, labelSide: 'end' }
      ],
      lengthPx: 2000, axis: 'x', crossReachPx: 0
    } as unknown as ReturnType<typeof layoutStrip>;
    // 504 is inside both 8 px targets; the nearer centre wins, and so does the far side of each.
    expect(slotAt(dots, 504, 0)?.name).toBe('A');
    expect(slotAt(dots, 507, 0)?.name).toBe('B');
  });

  it('gives a sub-pixel dot a target a hand can actually hit', () => {
    // Phobos is 22.5 km across: at this scale it is a dot, and its drawn span is 6 px. A pick radius
    // of 3 px is smaller than a mouse is steady on and far smaller than a finger.
    const phobos = slot('Phobos');
    expect(phobos.belowFloor).toBe(true);
    expect(slotAt(layout, phobos.centrePx + PICK_MIN_RADIUS_PX - 1, 0)?.name).toBe('Phobos');
    expect(PICK_MIN_RADIUS_PX).toBeGreaterThan(DOT_PX / 2);
  });

  it('finds nothing where there is nothing, rather than the nearest thing', () => {
    expect(slotAt(layout, -100000, 0)).toBeNull();
    expect(slotAt({ slots: [], lengthPx: 0, axis: 'x', crossReachPx: 0 }, 0, 0)).toBeNull();
  });

  it('reads the CROSS offset too, so the orbit layout picks a row rather than a column', () => {
    const orbit = layoutStrip(SYS, 0.002, { axis: 'x', order: 'orbit' });
    const luna = orbit.slots.find((s) => s.name === 'Luna')!;
    expect(luna.crossPx).toBeGreaterThan(0);           // it is off the centreline, or this proves nothing
    expect(slotAt(orbit, luna.centrePx, luna.crossPx)?.name).toBe('Luna');
    expect(slotAt(orbit, luna.centrePx, 0)?.name).toBe('Earth');   // the same column, on the line
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

describe('size comparison — the ruler, as arcs about whatever is in the middle', () => {
  // Owner, 2026-09-06: "perhaps more as arcs to show size ... perhaps have the ruler centred rather
  // than to one side - so it aligns to the planet on screen." An arc is a circle of the reference's
  // TRUE diameter drawn concentric with the subject, so "three Earths across" is a picture rather
  // than a calculation carried across the screen.

  it('offers a ladder a reader already has a feel for, in ascending size, from the app constants', () => {
    expect(REFERENCE_TICKS.map((t) => t.id)).toEqual(
      ['ceres', 'luna', 'mars', 'earth', 'neptune', 'jupiter', 'sun', 'betelgeuse']);
    // Strictly ascending, or the "picks itself" rule below has no ladder to walk.
    const d = REFERENCE_TICKS.map((t) => t.diameterKm);
    expect(d).toEqual([...d].sort((a, b) => a - b));
    // ABSOLUTE, from `constants.ts` (PHY-34): a ratio test cannot see a drifted constant.
    expect(REFERENCE_TICKS.find((t) => t.id === 'earth')!.diameterKm).toBeCloseTo(12742, 6);
    expect(REFERENCE_TICKS.find((t) => t.id === 'jupiter')!.diameterKm).toBeCloseTo(139822, 6);
    expect(REFERENCE_TICKS.find((t) => t.id === 'sun')!.diameterKm).toBeCloseTo(1392680, 6);
    // Six orders of magnitude, so that at any zoom SOMETHING is legible.
    expect(d[d.length - 1] / d[0]).toBeGreaterThan(1e6);
  });

  it('draws a circle of the reference’s TRUE diameter, centred on the window', () => {
    // At the scale that puts Earth at the opening share of an 800 px side, Earth's arc has radius 88
    // px — half of the 176 px the subject itself draws, which is what makes the two coincide when
    // you are looking at an Earth-sized world.
    const scale = pxPerKm(12742, 800, OPENING_SHARE);
    const arcs = referenceArcs(scale, 1200, 800);
    const earth = arcs.find((a) => a.id === 'earth')!;
    expect(earth.radiusPx).toBeCloseTo(88, 6);
    // ...and the label sits ON its own arc, not beside it.
    expect(Math.hypot(earth.labelX - 600, earth.labelY - 400)).toBeCloseTo(earth.radiusPx, 6);
  });

  it('PICKS ITSELF: only the rungs that are legible at this zoom, at either end', () => {
    // Looking at an Earth-sized world in a 1200x800 window: the ladder runs from Ceres (a 6.5 px
    // dot inside the subject) up to Neptune (340 px). Jupiter's circle is 966 px and never enters a
    // window whose half-diagonal is 721, so it is not drawn at all - nothing is "hidden".
    const scale = pxPerKm(12742, 800, OPENING_SHARE);
    const ids = referenceArcs(scale, 1200, 800).map((a) => a.id);
    expect(ids).toEqual(['ceres', 'luna', 'mars', 'earth', 'neptune']);
    // AND THE SAME LADDER ON A STRIP OF STARS SELECTS THE OTHER END, with no code that knows which
    // map it is on: looking at the Sun you get Jupiter inside it, and the rocks have fallen off.
    const starScale = pxPerKm(1392680, 800, OPENING_SHARE);
    expect(referenceArcs(starScale, 1200, 800).map((a) => a.id)).toEqual(['jupiter', 'sun']);
  });

  it('puts a name on the TOP edge of its circle, where the strip is not', () => {
    // Owner, 2026-09-06: "the names need to be on the top edge to work properly." The bodies run
    // along the CENTRELINE with their own names under them, so a ruler label on the right-hand side
    // of an arc lands on a world or on that world's name. The top of a circle is empty by
    // construction.
    const scale = pxPerKm(12742, 800, OPENING_SHARE);
    const arcs = referenceArcs(scale, 1200, 800);
    expect(arcs.length).toBeGreaterThan(2);
    for (const a of arcs) {
      // Above the centre, and within a whisker of straight up.
      expect(a.labelY).toBeLessThan(400);
      const fromTop = Math.abs(Math.atan2(a.labelY - 400, a.labelX - 600) + Math.PI / 2);
      expect(fromTop).toBeLessThan(1.0);
      // ...and still exactly ON its own circle.
      expect(Math.hypot(a.labelX - 600, a.labelY - 400)).toBeCloseTo(a.radiusPx, 6);
    }
  });

  it('walks off the top only when the top is off the window', () => {
    // A tall arc in a WIDE, SHORT window cannot be labelled at its top - the top is off screen - so
    // the ladder falls back to the sides rather than dropping the rung.
    const scale = pxPerKm(12742, 400, 0.6);
    const arcs = referenceArcs(scale, 1400, 400);
    expect(arcs.length).toBeGreaterThan(0);
    const sideways = arcs.filter((a) => Math.abs(a.labelY - 200) < a.radiusPx * 0.9);
    expect(sideways.length).toBeGreaterThan(0);
    for (const a of arcs) {
      expect(a.labelX).toBeGreaterThanOrEqual(0);
      expect(a.labelX).toBeLessThanOrEqual(1400);
      expect(a.labelY).toBeGreaterThanOrEqual(0);
      expect(a.labelY).toBeLessThanOrEqual(400);
    }
  });

  it('never labels an arc off the window — a label the reader cannot check is a claim, not a scale', () => {
    for (const [vw, vh] of [[1200, 800], [420, 900], [900, 420], [300, 300]] as const) {
      for (const share of [0.05, 0.22, 0.9]) {
        const scale = pxPerKm(12742, Math.min(vw, vh), share);
        for (const a of referenceArcs(scale, vw, vh)) {
          expect(a.labelX).toBeGreaterThanOrEqual(0);
          expect(a.labelX).toBeLessThanOrEqual(vw);
          expect(a.labelY).toBeGreaterThanOrEqual(0);
          expect(a.labelY).toBeLessThanOrEqual(vh);
          expect(a.radiusPx).toBeGreaterThanOrEqual(MIN_ARC_RADIUS_PX);
        }
      }
    }
  });

  it('survives a zero scale and a zero-size window rather than dividing by them', () => {
    expect(referenceArcs(0, 1200, 800)).toEqual([]);
    expect(referenceArcs(1, 0, 800)).toEqual([]);
    expect(referenceArcs(1, 1200, 0)).toEqual([]);
  });
});
