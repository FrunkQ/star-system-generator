import { describe, it, expect } from 'vitest';
import { drawStripChrome, slotScreenPos, bodyTypeOf, CHROME, type StripChromeSpec } from './stripChrome';
import { makeChromeRecorder } from './chromeRecorder';
import { layoutStrip, referenceArcs, sortItems, scaleForFocus, focusCentrePx, focusIndexOf, OPENING_SHARE, belowFloorNote, type ComparisonItem } from './layout';
import { formatPrefValues } from '$lib/units';

// THE STRIP'S CHROME, drawn into a canvas instead of the DOM (B126). Everything the picture SAYS is
// here now, so this is where it is pinned: the exact strings, at the exact coordinates, with the
// font that was set when they were drawn. The DOM never told us any of that.

const body = (name: string, radiusKm: number, role: string): ComparisonItem =>
  ({ id: name.toLowerCase(), name, diameterKm: radiusKm * 2, role });

const SOL: ComparisonItem[] = [
  body('Sun', 696340, 'star'),
  body('Jupiter', 69911, 'planet'),
  body('Earth', 6371, 'planet'),
  body('Mars', 3389.5, 'planet'),
  body('Luna', 1737.4, 'moon'),
  body('Phobos', 11.267, 'moon')
];

const VW = 1200, VH = 800;

/** The chrome as the view assembles it: focused on `name`, in a VW x VH window. */
function spec(name: string, over: Partial<StripChromeSpec> = {}): StripChromeSpec {
  const seq = sortItems(SOL, 'size');
  const f = focusIndexOf(seq, name.toLowerCase());
  const scale = scaleForFocus(seq, f, Math.min(VW, VH), OPENING_SHARE);
  const layout = layoutStrip(SOL, scale, { axis: 'x' });
  return {
    layout,
    info: new Map(SOL.map((i) => [i.id, { role: i.role, diameterKm: i.diameterKm }])),
    arcs: referenceArcs(scale, VW, VH),
    scrollPx: focusCentrePx(layout, seq, f) - VW / 2,
    crossScrollPx: 0,
    vw: VW, vh: VH, axis: 'x',
    selectedId: null, hoveredId: null, prefs: undefined,
    ...over
  };
}

function draw(s: StripChromeSpec) {
  const ctx = makeChromeRecorder();
  drawStripChrome(ctx, s);
  return ctx;
}

describe('the strip’s chrome — what the picture says', () => {
  it('clears first and names every body that is on screen', () => {
    const s0 = spec('Earth');
    const ctx = draw(s0);
    expect(ctx.clears).toBe(1);                       // one writer, one clear
    const names = ctx.texts.filter((t) => t.font === CHROME.nameFont).map((t) => t.text);
    expect(names).toContain('Earth');
    expect(names).toContain('Mars');
    // The Sun is 109 Earths across at this scale, so its LIMB fills the window - but its centre is
    // thousands of px off it, and a name drawn there is a name nobody can read. The overlap test
    // decides the marks; the centre test decides the label.
    expect(names).not.toContain('Sun');
    expect(s0.layout.slots.find((x) => x.name === 'Sun')!.spanPx).toBeGreaterThan(VW);
  });

  it('puts a name over its own body, and its size directly under the name', () => {
    const s = spec('Earth');
    const ctx = draw(s);
    const slot = s.layout.slots.find((x) => x.name === 'Earth')!;
    const p = slotScreenPos(slot, s);
    // BY FONT, not by string: the ruler has an arc called Earth too, and it is drawn first.
    const name = ctx.texts.find((t) => t.font === CHROME.nameFont && t.text === 'Earth')!;
    expect(name.x).toBeCloseTo(p.x, 6);
    expect(name.x).toBeCloseTo(VW / 2, 6);            // it IS the focus, so it is dead centre
    expect(name.textAlign).toBe('center');
    // Clear of the limb by the gap, and the size one line below it.
    expect(name.y).toBeCloseTo(p.y + slot.spanPx / 2 + CHROME.labelGapPx, 6);
    const size = ctx.texts.find((t) => t.font === CHROME.sizeFont && t.x === name.x)!;
    expect(size.y).toBeCloseTo(name.y + CHROME.lineHeightPx, 6);
  });

  it('draws the size through the SAME unit chain every panel uses, and follows a pref change', () => {
    // DATA-R20: stored values never leave SI, a pref RELABELS. `formatPrefValues` is the string
    // counterpart of the `UnitValue` component and runs the identical chain, so a size drawn here
    // and the same size in a panel cannot disagree - which is what let the strip's labels stop
    // being buttons in the first place.
    const sizeUnder = (ctx: ReturnType<typeof draw>) => {
      const n = ctx.texts.find((t) => t.font === CHROME.nameFont && t.text === 'Earth')!;
      return ctx.texts.find((t) => t.font === CHROME.sizeFont && Math.abs(t.x - n.x) < 0.001)!;
    };
    const km = sizeUnder(draw(spec('Earth')));
    expect(km.text).toBe(formatPrefValues(undefined, 'radius', 'planet', [12742]));
    expect(km.text).toContain('km');
    // Cycle the planet-radius pref to miles and the drawn string moves with it.
    const prefs = { 'radius:planet': 'mi' };
    const mi = sizeUnder(draw(spec('Earth', { prefs })));
    expect(mi.text).toBe(formatPrefValues(prefs, 'radius', 'planet', [12742]));
    expect(mi.text).toContain('mi');
    expect(mi.text).not.toBe(km.text);
    // And the bucket is the body's ROLE, so a star and a moon can carry different units at once.
    expect(bodyTypeOf('star')).toBe('star');
    expect(bodyTypeOf('moon')).toBe('moon');
    expect(bodyTypeOf('asteroid')).toBe('planet');
  });

  it('marks a sub-pixel object as a DOT with the note that says so, never as an inflated body', () => {
    // RENDER-S43: a floor is a legibility device and never a size. Phobos is 22.5 km across; looking
    // at Luna it is well under a pixel.
    const s = spec('Luna');
    const ctx = draw(s);
    const phobos = s.layout.slots.find((x) => x.name === 'Phobos')!;
    expect(phobos.belowFloor).toBe(true);
    const note = ctx.texts.find((t) => t.font === CHROME.floorFont)!;
    expect(note.text).toBe(belowFloorNote(phobos.diameterPx));
    expect(note.text).toMatch(/^below [12] px at this scale$/);
    // A filled dot of the marker's own span, at the object's place - not a circle of its size.
    const p = slotScreenPos(phobos, s);
    const dot = ctx.arcs.find((a) => !a.stroked && Math.abs(a.x - p.x) < 0.001)!;
    expect(dot.r).toBeCloseTo(3, 6);
    expect(dot.r).toBeGreaterThan(phobos.diameterPx);   // the marker is bigger than the truth, and says so
  });

  it('draws the ruler as circles about the MIDDLE of the window, labelled on their own arc', () => {
    const s = spec('Earth');
    const ctx = draw(s);
    expect(s.arcs.length).toBeGreaterThan(1);
    for (const a of s.arcs) {
      const drawn = ctx.arcs.find((c) => c.stroked && Math.abs(c.r - a.radiusPx) < 0.001)!;
      expect(drawn).toBeTruthy();
      expect(drawn.x).toBeCloseTo(VW / 2, 6);
      expect(drawn.y).toBeCloseTo(VH / 2, 6);
      // ...and its name is drawn, just outside the circle it names.
      const label = ctx.texts.find((t) => t.font === CHROME.arcFont && t.text === a.label)!;
      expect(label).toBeTruthy();
      const rLabel = Math.hypot(label.x - VW / 2, label.y - VH / 2);
      expect(rLabel).toBeGreaterThan(a.radiusPx);
      expect(rLabel).toBeLessThanOrEqual(a.radiusPx + CHROME.arcLabelOffsetPx + 0.001);
    }
  });

  it('thins the labels where they would stack into a smudge, keeping the selected one', () => {
    // The far end of a real system is dozens of moons inside a hundred pixels. A name you cannot
    // read is worse than none, because it hides the one beside it too. The rule is WIDTH-AWARE: a
    // long name asks for the room it needs and a short one does not pay for it.
    // One big world and a train of specks behind it: at the big one's scale the specks are a few
    // pixels apart, which is exactly the far end of a real system.
    const crowd: ComparisonItem[] = [body('Host', 900, 'planet')]
      .concat(Array.from({ length: 24 }, (_, i) => body(`M${i}`, 40 - i * 0.5, 'moon')));
    const seq = sortItems(crowd, 'size');
    const scale = scaleForFocus(seq, 0, Math.min(VW, VH), OPENING_SHARE);
    const layout = layoutStrip(crowd, scale, { axis: 'x' });
    const s: StripChromeSpec = {
      layout, info: new Map(crowd.map((i) => [i.id, { role: i.role, diameterKm: i.diameterKm }])),
      arcs: [], scrollPx: focusCentrePx(layout, seq, 0) - VW / 2, crossScrollPx: 0,
      vw: VW, vh: VH, axis: 'x', selectedId: null, hoveredId: null, prefs: undefined
    };
    const names = draw(s).texts.filter((t) => t.font === CHROME.nameFont);
    expect(names.length).toBeGreaterThan(2);
    // Whatever survives is readable: no two names on the same side have overlapping BOXES. The
    // recorder's `measureText` is the same one the drawing used, so this is the real test.
    const boxes = names.map((t) => ({ x: t.x, half: t.text.length * 3 }));
    for (let i = 1; i < boxes.length; i++) {
      const gaps = boxes.slice(0, i).map((b) => Math.abs(boxes[i].x - b.x) - b.half - boxes[i].half);
      // At least one of the earlier labels is on the other side, so only the NEAREST need clear it.
      expect(Math.max(...gaps)).toBeGreaterThan(0);
    }
    // Some were dropped - or the crowd was never a crowd and this proves nothing.
    expect(names.length).toBeLessThan(layout.slots.length);
    // AND THE SELECTED ONE IS NEVER DROPPED: it is the object the reader asked about. Pick one that
    // is genuinely ON SCREEN and genuinely was thinned out, or the assertion proves nothing.
    const shown = new Set(names.map((t) => t.text));
    const buried = layout.slots.find((sl) => {
      const x = sl.centrePx - s.scrollPx;
      return x > 0 && x < VW && !shown.has(sl.name);
    })!;
    expect(buried, 'a crowd with something thinned out of it').toBeTruthy();
    const withPick = draw({ ...s, selectedId: buried.id }).texts
      .filter((t) => t.font === CHROME.nameFont).map((t) => t.text);
    expect(withPick).toContain(buried.name);
  });

  it('strokes the arcs SOLID — a dash pattern costs per segment over the whole circle', () => {
    // Owner, 2026-09-06: "dashed lines billions of km across kill the renderer", which is the
    // standing rule the starmap's orbit lines already carry (engine map RENDER-S31). A ruler circle's
    // radius is whatever the zoom makes it, so it is exactly the wrong path to dash.
    const ctx = makeChromeRecorder();
    let dashed: number[] | null = null;
    (ctx as any).setLineDash = (p: number[]) => { if (p && p.length) dashed = p; };
    drawStripChrome(ctx, spec('Earth'));
    expect(ctx.arcs.some((a) => a.stroked)).toBe(true);   // it did draw arcs, or this proves nothing
    expect(dashed).toBeNull();
    expect((CHROME as Record<string, unknown>).arcDash).toBeUndefined();
  });

  it('draws no ruler at all when it is switched off, and every body still reads', () => {
    const ctx = draw(spec('Earth', { arcs: [] }));
    expect(ctx.texts.some((t) => t.font === CHROME.arcFont)).toBe(false);
    expect(ctx.arcs.some((a) => a.stroked)).toBe(false);
    expect(ctx.texts.some((t) => t.text === 'Earth')).toBe(true);
  });

  it('rings the selected object OUTSIDE its limb, so the edge being measured is never hidden', () => {
    const s = spec('Earth', { selectedId: 'earth' });
    const ctx = draw(s);
    const slot = s.layout.slots.find((x) => x.id === 'earth')!;
    const ring = ctx.arcs.find((a) => a.stroked && a.strokeStyle === CHROME.selectedColor)!;
    expect(ring.r).toBeCloseTo(slot.spanPx / 2 + CHROME.ringOutsetPx, 6);
    expect(ring.r).toBeGreaterThan(slot.diameterPx / 2);
    // Hover is the same ring in the other colour, and neither is drawn for a body that is neither.
    expect(draw(spec('Earth', { hoveredId: 'earth' })).arcs
      .some((a) => a.strokeStyle === CHROME.hoverColor)).toBe(true);
    expect(draw(spec('Earth')).arcs
      .some((a) => a.strokeStyle === CHROME.selectedColor || a.strokeStyle === CHROME.hoverColor)).toBe(false);
  });

  it('lays the labels BESIDE the bodies on a phone, where the strip runs down the screen', () => {
    // A phone's strip runs DOWN the window, so a label under its body would sit on the next one.
    // Focus the median so at least one name is anchored inside a 420x900 window.
    const seq = sortItems(SOL, 'size');
    const f = focusIndexOf(seq, 'earth');
    const scale = scaleForFocus(seq, f, 420, OPENING_SHARE);
    const layout = layoutStrip(SOL, scale, { axis: 'y' });
    const ctx = draw({
      layout,
      info: new Map(SOL.map((i) => [i.id, { role: i.role, diameterKm: i.diameterKm }])),
      arcs: [], scrollPx: focusCentrePx(layout, seq, f) - 900 / 2, crossScrollPx: 0,
      vw: 420, vh: 900, axis: 'y', selectedId: null, hoveredId: null, prefs: undefined
    });
    const name = ctx.texts.find((t) => t.font === CHROME.nameFont && t.text === 'Earth')!;
    expect(name).toBeTruthy();
    expect(name.textBaseline).toBe('middle');
    expect(['left', 'right']).toContain(name.textAlign);
    // Off the limb sideways, not above or below it.
    const slot = layout.slots.find((x) => x.id === 'earth')!;
    expect(Math.abs(name.x - 420 / 2)).toBeCloseTo(slot.spanPx / 2 + CHROME.labelGapPx, 6);
  });
});

// "THE SIZE COMPARISON IN ORBIT'S PUTS THE MOON'S NAME ON TOP OF THE PLANET'S NAME" (Discord, 10-03:
// a GM mislabelled his own planet and moon in a post because of it). In the orbit order a planet's
// moons hang off one side of it, and both names used to point into the gap between the planet and
// its first moon: the planet's hung down onto the moon, the moon's stood up onto the planet. The
// thinning rule was also one-dimensional, and a column of moons shares one position along the strip,
// so only the FIRST moon of each planet was ever named at all.
describe('the orbit order names a planet and its moons without one covering the other', () => {
  // A planet with a readable train of moons, one of which has a moon of its own.
  const FAMILY: ComparisonItem[] = [
    { id: 'host', name: 'Hostworld', diameterKm: 12000, role: 'planet', parentId: null, orbitAu: 1 },
    { id: 'm1', name: 'Firstmoon', diameterKm: 3000, role: 'moon', parentId: 'host', orbitAu: 0.001 },
    { id: 'm2', name: 'Secondmoon', diameterKm: 2600, role: 'moon', parentId: 'host', orbitAu: 0.002 },
    { id: 'm3', name: 'Thirdmoon', diameterKm: 2200, role: 'moon', parentId: 'host', orbitAu: 0.003 },
    { id: 'sub', name: 'Submoon', diameterKm: 900, role: 'moon', parentId: 'm2', orbitAu: 0.0001 },
    { id: 'lone', name: 'Loneworld', diameterKm: 9000, role: 'planet', parentId: null, orbitAu: 2 }
  ];
  const SCALE = 0.02; // 240 px planet, 60/52/44 px moons: every one of them readable, none a dot

  function orbitSpec(axis: 'x' | 'y', over: Partial<StripChromeSpec> = {}): StripChromeSpec {
    const layout = layoutStrip(FAMILY, SCALE, { axis, order: 'orbit' });
    const host = layout.slots.find((s) => s.id === 'host')!;
    const vw = axis === 'x' ? 1200 : 800, vh = axis === 'x' ? 800 : 1200;
    return {
      layout, info: new Map(FAMILY.map((i) => [i.id, { role: i.role, diameterKm: i.diameterKm }])),
      arcs: [], scrollPx: host.centrePx - (axis === 'x' ? vw : vh) / 2, crossScrollPx: 0,
      vw, vh, axis, selectedId: null, hoveredId: null, prefs: undefined, ...over
    };
  }

  /** The box a recorded string occupies, from the alignment and baseline it was drawn with. */
  const boxOf = (t: { text: string; x: number; y: number; textAlign: string; textBaseline: string }) => {
    const w = t.text.length * 6, h = CHROME.lineHeightPx;
    const x0 = t.textAlign === 'center' ? t.x - w / 2 : t.textAlign === 'right' ? t.x - w : t.x;
    const y0 = t.textBaseline === 'top' ? t.y : t.textBaseline === 'bottom' ? t.y - h : t.y - h / 2;
    return { text: t.text, x0, x1: x0 + w, y0, y1: y0 + h };
  };
  const overlap = (a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>) =>
    a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

  for (const axis of ['x', 'y'] as const) {
    it(`names every readable moon, and no two strings share ground (${axis === 'x' ? 'desktop' : 'phone'})`, () => {
      const s = orbitSpec(axis);
      const ctx = draw(s);
      const names = ctx.texts.filter((t) => t.font === CHROME.nameFont).map((t) => t.text);
      // ABSOLUTE: more than one moon is named. With the one-dimensional lane only the first ever was.
      // On a desktop the moons stack down the screen and every one of them has a line to itself; on
      // a phone they run ACROSS it, side by side, so a name wider than the room between two moons is
      // thinned out exactly as it is on the flat strip - and the middle one here is.
      const want = axis === 'x' ? ['Hostworld', 'Firstmoon', 'Secondmoon', 'Thirdmoon'] : ['Hostworld', 'Firstmoon', 'Thirdmoon'];
      for (const n of want) expect(names, n).toContain(n);
      const boxes = ctx.texts.map(boxOf);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        expect(overlap(boxes[i], boxes[j]), `"${boxes[i].text}" over "${boxes[j].text}"`).toBe(false);
      }
    });

    it(`keeps each name off the rest of its own family (${axis === 'x' ? 'desktop' : 'phone'})`, () => {
      const s = orbitSpec(axis);
      const ctx = draw(s);
      const slotOf = (id: string) => s.layout.slots.find((x) => x.id === id)!;
      const disc = (id: string) => { const sl = slotOf(id); return { ...slotScreenPos(sl, s), r: sl.spanPx / 2 }; };
      const hits = (b: ReturnType<typeof boxOf>, d: { x: number; y: number; r: number }) => {
        const cx = Math.max(b.x0, Math.min(d.x, b.x1)), cy = Math.max(b.y0, Math.min(d.y, b.y1));
        return Math.hypot(cx - d.x, cy - d.y) < d.r;
      };
      const family = ['host', 'm1', 'm2', 'm3'];
      for (const id of family) {
        const sl = slotOf(id);
        const mine = ctx.texts.filter((t) => t.font === CHROME.nameFont && t.text === sl.name).map(boxOf);
        if (axis === 'y' && id === 'm2') { expect(mine.length).toBe(0); continue; } // thinned: see above
        expect(mine.length, `${sl.name} is named once`).toBe(1);
        for (const other of family) if (other !== id) {
          expect(hits(mine[0], disc(other)), `${sl.name}'s name on ${slotOf(other).name}`).toBe(false);
        }
      }
      // The planet's name is on the side its moons are NOT, measured rather than read off a flag.
      const host = disc('host'), moon = disc('m1');
      const hostName = boxOf(ctx.texts.find((t) => t.font === CHROME.nameFont && t.text === 'Hostworld')!);
      if (axis === 'x') { expect(moon.y).toBeGreaterThan(host.y); expect(hostName.y1).toBeLessThanOrEqual(host.y - host.r); }
      else { expect(moon.x).toBeGreaterThan(host.x); expect(hostName.x1).toBeLessThanOrEqual(host.x - host.r); }
    });
  }

  it('leaves a planet with no moons named where every flat order names it', () => {
    const s = orbitSpec('x', { scrollPx: 0 });
    s.scrollPx = s.layout.slots.find((x) => x.id === 'lone')!.centrePx - s.vw / 2;
    const lone = s.layout.slots.find((x) => x.id === 'lone')!;
    expect(lone.labelSide).toBe('start');
    const p = slotScreenPos(lone, s);
    const name = draw(s).texts.find((t) => t.font === CHROME.nameFont && t.text === 'Loneworld')!;
    expect(name.y).toBeCloseTo(p.y + lone.spanPx / 2 + CHROME.labelGapPx, 6);
  });

  it('thins a column of specks box against box, and never starts a name above its own moon', () => {
    // Twelve dots under one planet, a few pixels apart: the names cannot all fit, and the ones that
    // are drawn must not climb back onto the planet the dots hang from.
    const specks: ComparisonItem[] = [{ id: 'host', name: 'Hostworld', diameterKm: 12000, role: 'planet', parentId: null, orbitAu: 1 }]
      .concat(Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, name: `Speck${i}`, diameterKm: 40, role: 'moon', parentId: 'host', orbitAu: 0.001 * (i + 1) })));
    const layout = layoutStrip(specks, SCALE, { axis: 'x', order: 'orbit' });
    const host = layout.slots.find((x) => x.id === 'host')!;
    const s: StripChromeSpec = {
      layout, info: new Map(specks.map((i) => [i.id, { role: i.role, diameterKm: i.diameterKm }])),
      arcs: [], scrollPx: host.centrePx - 600, crossScrollPx: 0, vw: 1200, vh: 800, axis: 'x',
      selectedId: null, hoveredId: null, prefs: undefined
    };
    const ctx = draw(s);
    const names = ctx.texts.filter((t) => t.font === CHROME.nameFont && t.text.startsWith('Speck'));
    expect(names.length).toBeGreaterThanOrEqual(2);
    expect(names.length).toBeLessThan(12);
    const hostBottom = slotScreenPos(host, s).y + host.spanPx / 2;
    for (const n of names) expect(boxOf(n).y0).toBeGreaterThanOrEqual(hostBottom);
    const boxes = ctx.texts.map(boxOf);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      expect(overlap(boxes[i], boxes[j]), `"${boxes[i].text}" over "${boxes[j].text}"`).toBe(false);
    }
  });
});
