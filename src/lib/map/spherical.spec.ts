import { describe, it, expect } from 'vitest';
import {
  offsetToMapPos, mapPosToOffset, wrapBearing, clampElevation, compassName, elevationName,
  bearingToRa, raToBearing, elevationToDec, decToElevation, formatRa, formatDec
} from './spherical';
import { unitKind, convertDistance, unitOptionsFor, LY_PER_PC } from './distanceUnits';

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

describe('sexagesimal notation — R.A. style bearing', () => {
  it('maps the cardinals to the hours a GM would expect', () => {
    expect(bearingToRa(0)).toEqual({ h: 0, m: 0, s: 0 });
    expect(bearingToRa(90)).toEqual({ h: 6, m: 0, s: 0 });   // due east
    expect(bearingToRa(180)).toEqual({ h: 12, m: 0, s: 0 });
    expect(bearingToRa(270)).toEqual({ h: 18, m: 0, s: 0 });
  });

  it('round trips an awkward value', () => {
    const ra = bearingToRa(37.4213);
    expect(raToBearing(ra)).toBeCloseTo(37.4213, 3);
  });

  it('carries rounding instead of ever printing 60 seconds', () => {
    // 23h 59m 59.97s must roll up to 0h, not display a 60 in a field that stops at 59.
    const ra = bearingToRa(359.999999);
    expect(ra.s).toBeLessThan(60);
    expect(ra.m).toBeLessThan(60);
    expect(ra.h).toBeLessThan(24);
  });

  it('tolerates out-of-range parts while someone is still typing', () => {
    expect(raToBearing({ h: 0, m: 75, s: 0 })).toBeCloseTo(raToBearing({ h: 1, m: 15, s: 0 }), 9);
  });

  it('wraps rather than running off the end of the clock', () => {
    expect(raToBearing({ h: 25, m: 0, s: 0 })).toBeCloseTo(15);
  });

  it('formats readably', () => {
    expect(formatRa(90)).toBe('6h 00m 00.0s');
  });
});

describe('sexagesimal notation — Dec style elevation', () => {
  it('keeps the sign separate so below the plane is unambiguous', () => {
    expect(elevationToDec(30)).toEqual({ sign: 1, d: 30, m: 0, s: 0 });
    expect(elevationToDec(-30)).toEqual({ sign: -1, d: 30, m: 0, s: 0 });
    // The case a plain negative number cannot express: half an arcdegree BELOW the plane.
    const small = elevationToDec(-0.5);
    expect(small).toEqual({ sign: -1, d: 0, m: 30, s: 0 });
    expect(decToElevation(small)).toBeCloseTo(-0.5, 9);
  });

  it('round trips arcminutes and arcseconds', () => {
    const dec = elevationToDec(-12.3456);
    expect(decToElevation(dec)).toBeCloseTo(-12.3456, 3);
  });

  it('carries rounding instead of printing 60 arcseconds', () => {
    const dec = elevationToDec(44.999999);
    expect(dec.s).toBeLessThan(60);
    expect(dec.m).toBeLessThan(60);
    expect(decToElevation(dec)).toBeCloseTo(45, 3);
  });

  it('stays inside the poles', () => {
    expect(decToElevation({ sign: 1, d: 120, m: 0, s: 0 })).toBe(90);
    expect(decToElevation({ sign: -1, d: 120, m: 0, s: 0 })).toBe(-90);
  });

  it('formats readably, always signed', () => {
    expect(formatDec(30)).toBe('+30° 00′ 00.0″');
    expect(formatDec(-30)).toBe('−30° 00′ 00.0″');
  });
});

describe('distance units', () => {
  it('recognises how GMs actually spell the units', () => {
    expect(unitKind('ly')).toBe('ly');
    expect(unitKind('LY')).toBe('ly');
    expect(unitKind('Light Years')).toBe('ly');
    expect(unitKind('pc')).toBe('pc');
    expect(unitKind('Parsecs')).toBe('pc');
  });

  it('returns null for a campaign’s own invented unit, so no conversion is offered', () => {
    expect(unitKind('jumps')).toBeNull();
    expect(unitKind('')).toBeNull();
    expect(unitOptionsFor('sectors')).toEqual([]);
    expect(unitOptionsFor('ly')).toEqual(['ly', 'pc']);
  });

  it('converts both ways and round trips', () => {
    expect(convertDistance(1, 'pc', 'ly')).toBeCloseTo(LY_PER_PC, 9);
    expect(convertDistance(LY_PER_PC, 'ly', 'pc')).toBeCloseTo(1, 9);
    expect(convertDistance(convertDistance(8.6, 'ly', 'pc'), 'pc', 'ly')).toBeCloseTo(8.6, 9);
  });

  it('leaves a value exactly alone when the unit does not change', () => {
    expect(convertDistance(8.6, 'ly', 'ly')).toBe(8.6);
  });
});
