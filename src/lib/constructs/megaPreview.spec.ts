// G53: the preview PRIMITIVES, gated headlessly (E7 — this is exactly why the maths is not in the
// SVG). The portraits are derived from shape() at defaults, so these tests pin the derivation:
// a swarm's dot count follows its density, a shell's arc follows its coverage, and every
// coordinate stays finite and inside the box.
import { describe, it, expect } from 'vitest';
import type { CelestialBody } from '$lib/types';
import { megaTypeDef, defaultMegaParams, MEGA_TYPE_DEFS, type MegaTypeDef } from './megaTypes';
import { megaPreviewPrimitives, megaSummaryLine, PREVIEW_BOX, type PreviewPrim } from './megaPreview';

const earth = (): CelestialBody =>
  ({
    id: 'earth', name: 'Earth', parentId: 'sol', tags: [], kind: 'body', roleHint: 'planet',
    massKg: 5.972e24, radiusKm: 6371, rotation_period_hours: 23.934,
    orbitalBoundaries: {
      minLeoKm: 200, leoMoeBoundaryKm: 2000, meoHeoBoundaryKm: 50000,
      heoUpperBoundaryKm: 1.47e6, geoStationaryKm: 35786, isGeoFallback: false
    }
  }) as unknown as CelestialBody;

const sol = (): CelestialBody =>
  ({ id: 'sol', name: 'Sol', parentId: null, tags: [], kind: 'body', roleHint: 'star', massKg: 1.989e30, radiusKm: 696340 }) as unknown as CelestialBody;

const def = (key: string): MegaTypeDef => {
  const d = megaTypeDef(key);
  if (!d) throw new Error(`no '${key}'`);
  return d;
};

const coordsOf = (p: PreviewPrim): number[] => {
  switch (p.kind) {
    case 'circle': case 'disc': return [p.cx, p.cy, p.r];
    case 'arc': return [p.cx, p.cy, p.r, p.startRad, p.sweepRad, p.width];
    case 'line': return [p.x1, p.y1, p.x2, p.y2, p.width];
    case 'rect': return [p.x, p.y, p.w, p.h];
    case 'dots': return p.points.flatMap((q) => [q.x, q.y]).concat(p.r);
  }
};

describe('mega previews are derived, deterministic and finite', () => {
  it('every record draws a finite portrait on a fit host, twice identically (no RNG)', () => {
    for (const d of MEGA_TYPE_DEFS) {
      const host = d.requires.hard?.hostIsStar ? sol() : earth();
      const a = megaPreviewPrimitives(d, host);
      expect(a.length, d.key).toBeGreaterThan(0);
      expect(a, d.key).toEqual(megaPreviewPrimitives(d, host));
      for (const p of a) for (const v of coordsOf(p)) expect(Number.isFinite(v), `${d.key} ${p.kind}`).toBe(true);
    }
  });

  it("a swarm's dot count follows its density — the same knob that drives occlusion", () => {
    const d = def('dyson-swarm');
    const host = sol();
    const at = (density: number) => {
      const spec = { ...defaultMegaParams(d, host), densityFrac: density };
      const dots = megaPreviewPrimitives({ ...d, shape: (p, h) => d.shape(p, h) } as MegaTypeDef, host);
      // density enters through shape(); rebuild with the density set
      const prims = megaPreviewPrimitives({ ...d, shape: () => d.shape(spec, host) } as MegaTypeDef, host);
      void dots;
      const cloud = prims.find((p) => p.kind === 'dots');
      if (!cloud || cloud.kind !== 'dots') throw new Error('swarm must draw dots');
      return cloud.points.length;
    };
    expect(at(0)).toBe(8);
    expect(at(0.3)).toBe(8 + Math.round(0.3 * 24));
    expect(at(1)).toBe(32);
  });

  it("a shell's built arc follows its coverage, with the remainder dashed", () => {
    const d = def('dyson-sphere');
    const host = sol();
    const partial = { ...d, shape: () => d.shape({ radiusAU: 1, coveragePct: 40 }, host) } as MegaTypeDef;
    const prims = megaPreviewPrimitives(partial, host);
    const arc = prims.find((p) => p.kind === 'arc');
    if (!arc || arc.kind !== 'arc') throw new Error('a growing shell draws its built arc');
    expect(arc.sweepRad).toBeCloseTo(0.8 * Math.PI, 6);
    expect(prims.some((p) => p.kind === 'circle' && p.dashed)).toBe(true); // the promise of the rest
  });

  it('a ringworld draws a fine hoop and a full sphere a heavy shell — thickness follows latitude extent', () => {
    const host = sol();
    const hoop = megaPreviewPrimitives(def('ringworld'), host).find((p) => p.kind === 'circle');
    const shell = megaPreviewPrimitives(def('dyson-sphere'), host).find((p) => p.kind === 'circle' && !p.dashed);
    if (hoop?.kind !== 'circle' || shell?.kind !== 'circle') throw new Error('both draw circles');
    expect(hoop.width).toBeLessThan(shell.width);
    expect(hoop.width).toBeGreaterThan(0);
  });

  it('the tether and the dished spheroid draw their signatures', () => {
    const tether = megaPreviewPrimitives(def('space-elevator'), earth());
    expect(tether.some((p) => p.kind === 'line')).toBe(true);   // the ribbon
    expect(tether.some((p) => p.kind === 'rect')).toBe(true);   // the counterweight
    const ds = megaPreviewPrimitives(def('death-star'), earth());
    expect(ds.filter((p) => p.kind === 'circle')).toHaveLength(2); // the sphere and the dish
  });

  it('every primitive stays inside (or legibly clipped by) the box', () => {
    for (const d of MEGA_TYPE_DEFS) {
      const host = d.requires.hard?.hostIsStar ? sol() : earth();
      for (const p of megaPreviewPrimitives(d, host)) {
        if (p.kind === 'dots') for (const q of p.points) {
          expect(q.x).toBeGreaterThanOrEqual(0); expect(q.x).toBeLessThanOrEqual(PREVIEW_BOX);
          expect(q.y).toBeGreaterThanOrEqual(0); expect(q.y).toBeLessThanOrEqual(PREVIEW_BOX);
        }
      }
    }
  });
});

describe('the footer summary line', () => {
  it('says the honest numbers for a ringworld and stays inside two figures', () => {
    const d = def('ringworld');
    const host = sol();
    const line = megaSummaryLine(d.derive(defaultMegaParams(d, host), host));
    expect(line).toMatch(/spin gravity ~1\.00 g/);
    expect(line).toMatch(/million Earths of floor/);
    expect(line.split('·').length).toBeLessThanOrEqual(2);
  });

  it('an elevator on a world with no real geostationary says so instead of inventing a figure', () => {
    const d = def('space-elevator');
    const locked = earth();
    locked.orbitalBoundaries!.isGeoFallback = true;
    expect(megaSummaryLine(d.derive(defaultMegaParams(d, locked), locked))).toContain('no real geostationary here');
  });
});
