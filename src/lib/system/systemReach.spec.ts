// B23 - "why can't I set my stars at a distance of 1000000 AU and beyond from my central black
// hole?" Three limits answered "how far out does a system reach" separately; this is the one answer.
import { describe, it, expect } from 'vitest';
import { placementLimitAu, systemEdgeAu, rootMassKg, PLACEMENT_FLOOR_AU } from './systemReach';
import { rootStarHillAu } from '$lib/physics/twoBodyCoast';
import { setWidestView, minCameraZoom, clampZoom, MIN_CAMERA_ZOOM, WIDEST_VIEW_MARGIN } from '$lib/viewport/camera';

const M_SUN = 1.989e30;
const LY_AU = 63241.077;
const lone = (massKg: number): any => ({ nodes: [{ id: 'r', kind: 'body', roleHint: 'star', parentId: null, massKg }] });

describe('the reach is the root\'s Hill limit, raised by the GM\'s System edge, never under the legacy floor', () => {
  it('ABSOLUTE: a central black hole of ten thousand suns holds companions 2.72 million AU out', () => {
    // 2 ly x cbrt(1e4) = 43.09 ly = 2,724,953 AU
    expect(placementLimitAu(lone(1e4 * M_SUN))).toBeCloseTo(2 * LY_AU * Math.cbrt(1e4), 3);
    expect(placementLimitAu(lone(1e4 * M_SUN))).toBeGreaterThan(2.72e6);
    expect(placementLimitAu(lone(1e4 * M_SUN))).toBeLessThan(2.73e6);
  });
  it('the Sun keeps the 1e6 AU it always had: its own Hill limit (126,482 AU) is not a new, tighter wall', () => {
    expect(rootStarHillAu(M_SUN)).toBeCloseTo(126482.154, 2);
    expect(placementLimitAu(lone(M_SUN))).toBe(PLACEMENT_FLOOR_AU);
    expect(PLACEMENT_FLOOR_AU).toBe(1e6);
  });
  it('the GM\'s custom System edge raises it (the owner\'s own workaround: 20 ly) and a tight one never lowers it', () => {
    expect(placementLimitAu(lone(M_SUN), 20 * LY_AU)).toBeCloseTo(1264821.54, 1);
    expect(placementLimitAu(lone(M_SUN), 10000)).toBe(1e6);
    expect(placementLimitAu(lone(1e4 * M_SUN), 10000)).toBeGreaterThan(2.72e6);
  });
  it('a root barycentre answers with the pair\'s total mass, and no system at all still has the floor', () => {
    const pair: any = { nodes: [{ id: 'b', kind: 'barycenter', parentId: null, effectiveMassKg: 8e3 * M_SUN }] };
    expect(rootMassKg(pair)).toBe(8e3 * M_SUN);
    expect(placementLimitAu(pair)).toBeCloseTo(2 * LY_AU * 20, 3);
    expect(placementLimitAu(null)).toBe(1e6);
    expect(placementLimitAu({ nodes: [] } as any, NaN)).toBe(1e6);
  });
});

describe('the System edge setting has one reading', () => {
  it('custom when set, the root\'s Hill limit when not, and nothing ever leaves a massless system', () => {
    expect(systemEdgeAu(lone(M_SUN), 5000)).toBe(5000);
    expect(systemEdgeAu(lone(M_SUN))).toBeCloseTo(126482.154, 2);
    expect(systemEdgeAu(lone(M_SUN), 0)).toBeCloseTo(126482.154, 2);
    expect(systemEdgeAu(lone(0))).toBe(Infinity);
  });
});

describe('the orrery\'s widest view is fitted to the same reach, on any screen', () => {
  const halfWidthAu = (px: number) => (px / 2) / minCameraZoom();
  it('ABSOLUTE: a body at the limit is inside the widest view on a 2,000 px desktop AND a 400 px phone', () => {
    try {
      for (const px of [2000, 1200, 400]) {
        for (const sys of [lone(M_SUN), lone(1e4 * M_SUN)]) {
          const reach = placementLimitAu(sys);
          setWidestView(reach, px);
          expect(halfWidthAu(px)).toBeCloseTo(reach * WIDEST_VIEW_MARGIN, 3);
          expect(halfWidthAu(px)).toBeGreaterThan(reach);          // the one that was false
          expect(clampZoom(0)).toBe(minCameraZoom());              // and the default clamp follows it
        }
      }
      // the fixed floor showed exactly 1,000,000 AU either side on 2,000 px - the reported distance
      expect((2000 / 2) / MIN_CAMERA_ZOOM).toBe(1e6);
    } finally { setWidestView(0, 0); }
  });
  it('never NARROWER than the fixed floor, and nonsense input falls back to it', () => {
    try {
      expect(setWidestView(100, 2000)).toBe(MIN_CAMERA_ZOOM);       // a tiny reach does not shrink the view
      expect(setWidestView(NaN, 2000)).toBe(MIN_CAMERA_ZOOM);
      expect(setWidestView(1e6, 0)).toBe(MIN_CAMERA_ZOOM);
      expect(setWidestView(1e6, 400)).toBeCloseTo(1.6e-4, 10);
    } finally { setWidestView(0, 0); }
    expect(minCameraZoom()).toBe(MIN_CAMERA_ZOOM);
  });
});
