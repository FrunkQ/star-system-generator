import { describe, it, expect } from 'vitest';
import { offsetToMapPos, mapPosToOffset, wrapBearing, clampElevation, compassName, elevationName } from './spherical';

const ORIGIN = { x: 100, y: 100, z: 0 };
const PPU = 10; // 10 map units per distance unit

describe('spherical placement — the map frame', () => {
  // The four cardinals, spelled out: these are the assertions that catch a sign flip, which is the one
  // mistake in this module that produces a plausible-looking map that is quietly mirrored.
  it('puts due north UP the screen (negative y)', () => {
    const p = offsetToMapPos(ORIGIN, { bearingDeg: 0, elevationDeg: 0, distance: 5 }, PPU);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(50);
    expect(p.z).toBeCloseTo(0);
  });

  it('puts due east to the RIGHT (positive x)', () => {
    const p = offsetToMapPos(ORIGIN, { bearingDeg: 90, elevationDeg: 0, distance: 5 }, PPU);
    expect(p.x).toBeCloseTo(150);
    expect(p.y).toBeCloseTo(100);
  });

  it('puts due south DOWN the screen and west to the LEFT', () => {
    const s = offsetToMapPos(ORIGIN, { bearingDeg: 180, elevationDeg: 0, distance: 5 }, PPU);
    expect(s.y).toBeCloseTo(150);
    const w = offsetToMapPos(ORIGIN, { bearingDeg: 270, elevationDeg: 0, distance: 5 }, PPU);
    expect(w.x).toBeCloseTo(50);
  });

  it('lifts a positive elevation ABOVE the plane, and shortens its in-plane reach', () => {
    const p = offsetToMapPos(ORIGIN, { bearingDeg: 0, elevationDeg: 30, distance: 10 }, PPU);
    expect(p.z).toBeCloseTo(50); // 100 map units * sin 30
    expect(p.y).toBeCloseTo(100 - 100 * Math.cos(Math.PI / 6));
  });

  it('sends straight up entirely into z, with no in-plane movement at all', () => {
    const p = offsetToMapPos(ORIGIN, { bearingDeg: 123, elevationDeg: 90, distance: 4 }, PPU);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(100);
    expect(p.z).toBeCloseTo(40);
  });

  it('offsets from the origin DEPTH, not from the plane', () => {
    const p = offsetToMapPos({ x: 0, y: 0, z: 25 }, { bearingDeg: 0, elevationDeg: -90, distance: 1 }, PPU);
    expect(p.z).toBeCloseTo(15);
  });
});

describe('spherical placement — round trip', () => {
  const cases = [
    { bearingDeg: 0, elevationDeg: 0, distance: 5 },
    { bearingDeg: 37, elevationDeg: 12, distance: 8.25 },
    { bearingDeg: 200, elevationDeg: -44, distance: 3 },
    { bearingDeg: 359, elevationDeg: 89, distance: 12 }
  ];
  for (const c of cases) {
    it(`recovers ${c.bearingDeg}° / ${c.elevationDeg}° / ${c.distance}`, () => {
      const back = mapPosToOffset(ORIGIN, offsetToMapPos(ORIGIN, c, PPU), PPU);
      expect(back.bearingDeg).toBeCloseTo(c.bearingDeg, 4);
      expect(back.elevationDeg).toBeCloseTo(c.elevationDeg, 4);
      expect(back.distance).toBeCloseTo(c.distance, 6);
    });
  }

  it('reports no bearing for a system directly overhead, rather than noise', () => {
    const back = mapPosToOffset(ORIGIN, { x: 100, y: 100, z: 40 }, PPU);
    expect(back.bearingDeg).toBe(0);
    expect(back.elevationDeg).toBeCloseTo(90);
  });

  it('treats a missing z as the reference plane', () => {
    const back = mapPosToOffset({ x: 0, y: 0 }, { x: 0, y: -10 }, PPU);
    expect(back.elevationDeg).toBeCloseTo(0);
    expect(back.distance).toBeCloseTo(1);
  });
});

describe('spherical placement — guards and wording', () => {
  it('wraps bearings and clamps elevations', () => {
    expect(wrapBearing(-10)).toBeCloseTo(350);
    expect(wrapBearing(370)).toBeCloseTo(10);
    expect(clampElevation(140)).toBe(90);
    expect(clampElevation(-140)).toBe(-90);
  });

  it('collapses to the origin when the scale is unusable, instead of flinging the system away', () => {
    const p = offsetToMapPos(ORIGIN, { bearingDeg: 45, elevationDeg: 10, distance: 5 }, 0);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(100);
    expect(p.z).toBeCloseTo(0);
  });

  it('never places a system at a negative distance', () => {
    const p = offsetToMapPos(ORIGIN, { bearingDeg: 0, elevationDeg: 0, distance: -5 }, PPU);
    expect(p.y).toBeCloseTo(100);
  });

  it('names the compass points a GM would expect', () => {
    expect(compassName(0)).toBe('N');
    expect(compassName(46)).toBe('NE');
    expect(compassName(180)).toBe('S');
    expect(compassName(359)).toBe('N');
    expect(elevationName(0)).toContain('level');
    expect(elevationName(20)).toContain('above');
    expect(elevationName(-20)).toContain('below');
  });
});
