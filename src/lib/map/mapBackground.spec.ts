import { describe, it, expect } from 'vitest';
import {
  normaliseMapBackground, resolveMapBackground, backgroundRectMap, backgroundCornersMap,
  mapPointToImageUV, backgroundPixelsPerUnit, suggestAnchor, DEFAULT_BACKGROUND_URL,
  DEFAULT_MAP_BACKGROUND
} from './mapBackground';
import type { MapBackground } from '$lib/types';

const bg = (over: Partial<MapBackground> = {}): MapBackground =>
  normaliseMapBackground({ ...DEFAULT_MAP_BACKGROUND, ...over });

describe('mapBackground - defaults and normalisation', () => {
  it('an absent background is the shipped Milky Way, screen-fixed and opaque (today exactly)', () => {
    const b = normaliseMapBackground(undefined);
    expect(b.source).toBe('default');
    expect(b.attach).toBe('screen');
    expect(b.opacity).toBe(1);
  });

  it('a hand-edited save cannot collapse the picture to nothing', () => {
    expect(normaliseMapBackground({ widthUnits: 0 }).widthUnits).toBeGreaterThan(0);
    expect(normaliseMapBackground({ widthUnits: NaN }).widthUnits).toBe(DEFAULT_MAP_BACKGROUND.widthUnits);
    expect(normaliseMapBackground({ opacity: 5 }).opacity).toBe(1);
    expect(normaliseMapBackground({ opacity: -2 }).opacity).toBe(0);
  });

  it('an unknown attach or source falls back to the harmless answer', () => {
    expect(normaliseMapBackground({ attach: 'sideways' as any }).attach).toBe('screen');
    expect(normaliseMapBackground({ source: 'nonsense' as any }).source).toBe('default');
  });
});

describe('mapBackground - resolution and credit', () => {
  it('default credits ESO and is flagged as the shipped image', () => {
    const r = resolveMapBackground({ mapBackground: bg({ source: 'default' }) }, []);
    expect(r?.url).toBe(DEFAULT_BACKGROUND_URL);
    expect(r?.isDefault).toBe(true);
    expect(r?.credit).toMatch(/ESO/);
  });

  it('none resolves to nothing at all', () => {
    expect(resolveMapBackground({ mapBackground: bg({ source: 'none' }) }, [])).toBeNull();
  });

  it('an upload carries its OWN credit and never the default one', () => {
    const assets = [{ id: 'a1', name: 'Sector map', dataUrl: 'data:image/png;base64,xx', credit: 'Cartographer' }];
    const r = resolveMapBackground({ mapBackground: bg({ source: 'asset', assetId: 'a1' }) }, assets);
    expect(r?.isDefault).toBe(false);
    expect(r?.credit).toBe('Cartographer');
    expect(r?.credit).not.toMatch(/ESO/);
  });

  it('a DELETED asset shows nothing rather than silently re-crediting ESO', () => {
    const r = resolveMapBackground({ mapBackground: bg({ source: 'asset', assetId: 'gone' }) }, []);
    expect(r).toBeNull();
  });
});

describe('mapBackground - map units are the CAMPAIGN unit, never light years by assumption', () => {
  it('reads the campaign ruler, falling back only when there is none', () => {
    expect(backgroundPixelsPerUnit({ scale: { pixelsPerUnit: 8 } })).toBe(8);
    expect(backgroundPixelsPerUnit({ scale: { pixelsPerUnit: 0 } })).toBe(25);
    expect(backgroundPixelsPerUnit(null)).toBe(25);
  });

  it('the SAME width in units gives different map coordinates under a different ruler', () => {
    const b = bg({ widthUnits: 40 });
    expect(backgroundRectMap(b, 2, 10).w).toBe(400); // 40 units at 10 map-coords per unit
    expect(backgroundRectMap(b, 2, 25).w).toBe(1000); // ...and the same 40 "units" in parsecs
  });

  it('height follows the bitmap aspect, so a georeferenced picture cannot be stretched out of shape', () => {
    const r = backgroundRectMap(bg({ widthUnits: 40 }), 4, 10);
    expect(r.w).toBe(400);
    expect(r.h).toBe(100);
  });

  it('the offset places the CENTRE, in campaign units', () => {
    const r = backgroundRectMap(bg({ offsetX: 3, offsetY: -2 }), 1, 10);
    expect(r.cx).toBe(30);
    expect(r.cy).toBe(-20);
  });
});

describe('mapBackground - rotation: corners land where the maths says', () => {
  it('unrotated corners are the plain rectangle, clockwise from top-left', () => {
    const c = backgroundCornersMap({ cx: 0, cy: 0, w: 200, h: 100, rotationDeg: 0 });
    expect(c).toEqual([
      { x: -100, y: -50 }, { x: 100, y: -50 }, { x: 100, y: 50 }, { x: -100, y: 50 }
    ]);
  });

  it('90 degrees turns the picture CLOCKWISE on screen (map y runs downward)', () => {
    const c = backgroundCornersMap({ cx: 0, cy: 0, w: 200, h: 100, rotationDeg: 90 });
    // The top-left corner swings to the TOP-RIGHT of the map: (-100,-50) -> (50,-100).
    expect(c[0].x).toBeCloseTo(50, 10);
    expect(c[0].y).toBeCloseTo(-100, 10);
  });

  it('15 degrees on a rectangle - the acceptance case, checked against hand maths', () => {
    const c = backgroundCornersMap({ cx: 100, cy: 100, w: 400, h: 200, rotationDeg: 15 });
    const t = (15 * Math.PI) / 180;
    const ex = 100 + -200 * Math.cos(t) - -100 * Math.sin(t);
    const ey = 100 + -200 * Math.sin(t) + -100 * Math.cos(t);
    expect(c[0].x).toBeCloseTo(ex, 10);
    expect(c[0].y).toBeCloseTo(ey, 10);
    // A rotation is rigid: every side keeps its length.
    const side = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y);
    expect(side(c[0], c[1])).toBeCloseTo(400, 10);
    expect(side(c[1], c[2])).toBeCloseTo(200, 10);
    // ...and the centre is still the centre.
    expect((c[0].x + c[2].x) / 2).toBeCloseTo(100, 10);
    expect((c[0].y + c[2].y) / 2).toBeCloseTo(100, 10);
  });
});

describe('mapBackground - registration: a system sits on ONE image pixel, whatever the view', () => {
  // THE ACCEPTANCE CRITERION, stated view-independently. Every surface draws this same rectangle
  // and then applies only its own pan/zoom/camera, so if the u,v here is right, "the same system on
  // the same image feature at every zoom, on the GM map, the player map and the 3D plane" follows.
  it('the centre of an unrotated image is u=0.5, v=0.5', () => {
    const r = backgroundRectMap(bg({ widthUnits: 40, offsetX: 0, offsetY: 0 }), 2, 10);
    expect(mapPointToImageUV(r, 0, 0)).toEqual({ u: 0.5, v: 0.5 });
  });

  it('a corner is (0,0) and the opposite corner is (1,1)', () => {
    const r = backgroundRectMap(bg({ widthUnits: 40, offsetX: 0, offsetY: 0 }), 2, 10);
    const c = backgroundCornersMap(r);
    const tl = mapPointToImageUV(r, c[0].x, c[0].y);
    const br = mapPointToImageUV(r, c[2].x, c[2].y);
    expect(tl.u).toBeCloseTo(0, 10); expect(tl.v).toBeCloseTo(0, 10);
    expect(br.u).toBeCloseTo(1, 10); expect(br.v).toBeCloseTo(1, 10);
  });

  it('rotation is undone exactly - a rotated image still reports the pixel a system sits on', () => {
    const r = backgroundRectMap(bg({ widthUnits: 40, offsetX: 5, offsetY: -3, rotationDeg: 15 }), 1.6, 10);
    const c = backgroundCornersMap(r);
    for (const [i, expected] of ([[0, [0, 0]], [1, [1, 0]], [2, [1, 1]], [3, [0, 1]]] as const)) {
      const uv = mapPointToImageUV(r, c[i].x, c[i].y);
      expect(uv.u).toBeCloseTo(expected[0], 10);
      expect(uv.v).toBeCloseTo(expected[1], 10);
    }
  });

  it('ZOOM IS NOT IN THIS MATHS AT ALL - which is why registration holds at every zoom', () => {
    // The rectangle is a function of the anchor and the campaign ruler only. No surface passes its
    // pan or zoom in, so no surface can put the picture out of register by changing them.
    const r = backgroundRectMap(bg({ widthUnits: 40 }), 2, 10);
    const again = backgroundRectMap(bg({ widthUnits: 40 }), 2, 10);
    expect(r).toEqual(again);
  });
});

describe('mapBackground - suggested first anchor', () => {
  it('lands the image over the charted systems rather than somewhere off-map', () => {
    const map: any = {
      scale: { pixelsPerUnit: 10 },
      systems: [
        { position: { x: 0, y: 0 } },
        { position: { x: 100, y: 50 } }
      ]
    };
    const a = suggestAnchor(map);
    expect(a.offsetX).toBeCloseTo(5, 6);   // map centre (50, 25) at 10 coords/unit
    expect(a.offsetY).toBeCloseTo(2.5, 6);
    expect(a.widthUnits).toBeCloseTo(12, 6); // 100-coord spread * 1.2 / 10
  });

  it('an empty map falls back to the shipped default rather than dividing by nothing', () => {
    expect(suggestAnchor({ systems: [] } as any).widthUnits).toBe(DEFAULT_MAP_BACKGROUND.widthUnits);
  });
});
