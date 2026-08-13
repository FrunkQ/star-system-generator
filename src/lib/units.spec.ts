import { describe, it, expect } from 'vitest';
import {
  formatDistanceKm, formatDistanceAu, formatSpeedKmS, formatSpeedAuto, MILE_PER_KM,
  kmToDisplayNum, displayNumToKm, kmsToDisplayNum, displayNumToKms,
  formatTempC, formatTempK, cToDisplayTemp, displayTempToC,
  formatOrbitRadiusAu, ORBIT_KM_BELOW_AU
} from './units';
import { AU_KM } from './constants';

describe('units — metric vs imperial display (SI stays internal)', () => {
  it('distance in km stays km for metric, converts to miles for imperial', () => {
    expect(formatDistanceKm(1000, 'metric')).toBe('1,000 km');
    expect(formatDistanceKm(1000, 'imperial')).toBe(`${(1000 * MILE_PER_KM).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} mi`);
  });

  it('AU distances render in km/miles (for local orbits) — 1 AU = AU_KM km', () => {
    expect(formatDistanceAu(1, 'metric')).toBe(`${Math.round(AU_KM).toLocaleString()} km`);
    expect(formatDistanceAu(1, 'imperial').endsWith(' mi')).toBe(true);
  });

  it('honours decimals', () => {
    expect(formatDistanceKm(12.34, 'metric', 1)).toBe('12.3 km');
  });

  it('speed km/s converts to mi/s for imperial', () => {
    expect(formatSpeedKmS(10, 'metric')).toBe('10.0 km/s');
    expect(formatSpeedKmS(10, 'imperial')).toBe(`${(10 * MILE_PER_KM).toFixed(1)} mi/s`);
  });

  it('auto speed picks m/s vs km/s (metric) and ft/s vs mi/s (imperial) by magnitude', () => {
    expect(formatSpeedAuto(500, 'metric')).toBe('500 m/s');
    expect(formatSpeedAuto(9000, 'metric')).toBe('9.0 km/s');
    expect(formatSpeedAuto(500, 'imperial').endsWith(' ft/s')).toBe(true);
    expect(formatSpeedAuto(9000, 'imperial').endsWith(' mi/s')).toBe(true);
  });

  it('temperature: °C / °F / K switch, from either K or C', () => {
    expect(formatTempC(0, 'C')).toBe('0 °C');
    expect(formatTempC(0, 'F')).toBe('32 °F');
    expect(formatTempC(100, 'F')).toBe('212 °F');
    expect(formatTempC(0, 'K')).toBe('273 K');
    expect(formatTempK(273.15, 'C')).toBe('0 °C');
    expect(formatTempK(373.15, 'F')).toBe('212 °F');
    expect(formatTempK(300, 'K')).toBe('300 K');
    // input round-trip for each unit
    for (const u of ['C', 'F', 'K'] as const) {
      expect(displayTempToC(cToDisplayTemp(25, u), u)).toBeCloseTo(25, 6);
    }
  });

  it('input converters round-trip cleanly (edit in the display unit, store in SI)', () => {
    // metric is identity
    expect(kmToDisplayNum(6371, 'metric')).toBe(6371);
    expect(displayNumToKm(6371, 'metric')).toBe(6371);
    // imperial converts and round-trips back to the same km
    const mi = kmToDisplayNum(6371, 'imperial');
    expect(mi).toBeCloseTo(6371 * MILE_PER_KM, 6);
    expect(displayNumToKm(mi, 'imperial')).toBeCloseTo(6371, 6);
    // speed converters likewise
    const mis = kmsToDisplayNum(11, 'imperial');
    expect(displayNumToKms(mis, 'imperial')).toBeCloseTo(11, 6);
  });

  it('non-finite is dashed, never NaN', () => {
    expect(formatDistanceKm(NaN, 'metric')).toBe('—');
    expect(formatSpeedAuto(Infinity, 'imperial')).toBe('—');
  });
});

// The unit follows the DISTANCE, not the body's ROLE.
//
// The bug this pins, reported by the owner 2026-08-12: the info panel chose km for a
// `roleHint: 'moon'` and AU-to-3dp for everything else, so Pluto — a PLANET, orbiting the
// Pluto–Charon barycentre 2,100 km out — rendered as "0.000 AU". Every barycentre member had it.
// Three other readouts already switched on MAGNITUDE, each at its own threshold; this is now the
// single answer they all call.
describe('orbital radius — the unit follows the distance, not the role', () => {
  it('never renders a real orbit as zero', () => {
    const closeIn: [string, number][] = [
      ['Pluto about the barycentre', 1.405886379192334e-5],
      ['Charon about the barycentre', 1.1594113620807666e-4],
      ['Rocheworld lobes', 2.25e-5],
      ['Luna', 0.00257]
    ];
    for (const [name, au] of closeIn) {
      const s = formatOrbitRadiusAu(au, 'metric');
      expect(s, name).not.toMatch(/^0(\.0+)?\s/);
      expect(s, name).toMatch(/km$/);
    }
  });

  it('gives Pluto its real separation rather than 0.000 AU', () => {
    expect(formatOrbitRadiusAu(1.405886379192334e-5, 'metric')).toBe('2,103 km');
  });

  it('keeps planetary orbits in AU', () => {
    expect(formatOrbitRadiusAu(1, 'metric')).toBe('1.000 AU');
    expect(formatOrbitRadiusAu(39.48, 'metric')).toBe('39.480 AU');
    expect(formatOrbitRadiusAu(5.2, 'metric', 2)).toBe('5.20 AU');
  });

  it('switches at the documented threshold and nowhere else', () => {
    expect(formatOrbitRadiusAu(ORBIT_KM_BELOW_AU * 0.999, 'metric')).toMatch(/km$/);
    expect(formatOrbitRadiusAu(ORBIT_KM_BELOW_AU, 'metric')).toMatch(/AU$/);
  });

  it('honours the imperial switch below the threshold, and AU stays AU above it', () => {
    expect(formatOrbitRadiusAu(0.00257, 'imperial')).toMatch(/mi$/);
    expect(formatOrbitRadiusAu(1, 'imperial')).toBe('1.000 AU');
  });

  it('is defensive about rubbish', () => {
    expect(formatOrbitRadiusAu(NaN, 'metric')).toBe('—');
    expect(formatOrbitRadiusAu(Infinity, 'metric')).toBe('—');
  });
});
