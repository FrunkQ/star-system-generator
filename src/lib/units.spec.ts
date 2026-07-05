import { describe, it, expect } from 'vitest';
import { formatDistanceKm, formatDistanceAu, formatSpeedKmS, formatSpeedAuto, MILE_PER_KM } from './units';
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

  it('non-finite is dashed, never NaN', () => {
    expect(formatDistanceKm(NaN, 'metric')).toBe('—');
    expect(formatSpeedAuto(Infinity, 'imperial')).toBe('—');
  });
});
