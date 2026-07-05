import { describe, it, expect } from 'vitest';
import {
  formatDistanceKm, formatDistanceAu, formatSpeedKmS, formatSpeedAuto, MILE_PER_KM,
  kmToDisplayNum, displayNumToKm, kmsToDisplayNum, displayNumToKms,
  formatTempC, formatTempK, cToDisplayTemp, displayTempToC
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
