// In-system measurement-unit formatting. The app ALWAYS stores and computes in SI (km, km/s, AU internally);
// this layer only decides how a distance/speed is DISPLAYED — metric (km) by default, or imperial (miles)
// when the GM flips the starmap's `measurementUnits`. Pure functions (no store) so they're trivially
// testable; the reactive `fmt`/`measurementUnit` wrappers live in stores.ts.
//
// NOTE: the interstellar STARMAP unit (ly / pc / diagrammatic, `starmap.distanceUnit`) is a SEPARATE
// concept and is not touched here — this is only in-system km/miles.
import { AU_KM } from './constants';

export type MeasurementUnits = 'metric' | 'imperial';

export const KM_PER_MILE = 1.609344;
export const MILE_PER_KM = 1 / KM_PER_MILE; // ≈ 0.621371

function fmtNum(v: number, decimals: number): string {
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Distance given in KILOMETRES → display string with unit suffix.
export function formatDistanceKm(km: number, units: MeasurementUnits, decimals = 0): string {
  if (!Number.isFinite(km)) return '—';
  if (units === 'imperial') return `${fmtNum(km * MILE_PER_KM, decimals)} mi`;
  return `${fmtNum(km, decimals)} km`;
}

// Distance given in AU → display in the chosen unit (km or miles). Use for LOCAL orbits (around a
// planet/moon/construct) which the spec wants in km, never AU. Planet-around-star orbits keep AU and
// don't call this.
export function formatDistanceAu(au: number, units: MeasurementUnits, decimals = 0): string {
  return formatDistanceKm(au * AU_KM, units, decimals);
}

// Speed given in KM/S → display string. Imperial shows mi/s.
export function formatSpeedKmS(kmps: number, units: MeasurementUnits, decimals = 1): string {
  if (!Number.isFinite(kmps)) return '—';
  if (units === 'imperial') return `${fmtNum(kmps * MILE_PER_KM, decimals)} mi/s`;
  return `${fmtNum(kmps, decimals)} km/s`;
}

// Speed given in KM/H → display string. Imperial shows mph.
export function formatSpeedKmH(kmph: number, units: MeasurementUnits, decimals = 0): string {
  if (!Number.isFinite(kmph)) return '—';
  if (units === 'imperial') return `${fmtNum(kmph * MILE_PER_KM, decimals)} mph`;
  return `${fmtNum(kmph, decimals)} km/h`;
}

// Magnitude-aware speed from a value in M/S. Small speeds read in m/s (metric) / ft/s (imperial); larger
// ones in km/s (metric) / mi/s (imperial). Replaces the ad-hoc inline `fmtSpeed` helpers.
export function formatSpeedAuto(ms: number, units: MeasurementUnits): string {
  if (!Number.isFinite(ms)) return '—';
  if (units === 'imperial') {
    return ms >= KM_PER_MILE * 1000
      ? `${fmtNum((ms / 1000) * MILE_PER_KM, 1)} mi/s`
      : `${fmtNum(ms * 3.28084, 0)} ft/s`;
  }
  return ms >= 1000 ? `${fmtNum(ms / 1000, 1)} km/s` : `${fmtNum(ms, 0)} m/s`;
}

// The short unit label for a bare axis/column header ("km" or "mi").
export function distanceUnitLabel(units: MeasurementUnits): string {
  return units === 'imperial' ? 'mi' : 'km';
}

export function speedUnitLabel(units: MeasurementUnits): string {
  return units === 'imperial' ? 'mi/s' : 'km/s';
}

// TEMPERATURE. Stored internally in kelvin; displayed °C (metric) or °F (imperial). Two entry points because
// sites hold either a kelvin value or an already-computed Celsius value.
export function formatTempC(celsius: number, units: MeasurementUnits, decimals = 0): string {
  if (!Number.isFinite(celsius)) return '—';
  if (units === 'imperial') return `${fmtNum(celsius * 9 / 5 + 32, decimals)} °F`;
  return `${fmtNum(celsius, decimals)} °C`;
}
export function formatTempK(kelvin: number, units: MeasurementUnits, decimals = 0): string {
  return Number.isFinite(kelvin) ? formatTempC(kelvin - 273.15, units, decimals) : '—';
}
export function tempUnitLabel(units: MeasurementUnits): string {
  return units === 'imperial' ? '°F' : '°C';
}
// Editable temperature inputs: a Celsius value shown/edited in the display unit, converted back on input.
export function cToDisplayTemp(celsius: number, units: MeasurementUnits): number {
  return units === 'imperial' ? celsius * 9 / 5 + 32 : celsius;
}
export function displayTempToC(v: number, units: MeasurementUnits): number {
  return units === 'imperial' ? (v - 32) * 5 / 9 : v;
}

// NUMERIC converters for editable INPUTS — a value stored in km/km·s, shown/edited in the display unit and
// converted back on input (so an imperial GM edits in miles). No formatting, just the number.
export function kmToDisplayNum(km: number, units: MeasurementUnits): number {
  return units === 'imperial' ? km * MILE_PER_KM : km;
}
export function displayNumToKm(v: number, units: MeasurementUnits): number {
  return units === 'imperial' ? v * KM_PER_MILE : v;
}
export function kmsToDisplayNum(kmps: number, units: MeasurementUnits): number {
  return units === 'imperial' ? kmps * MILE_PER_KM : kmps;
}
export function displayNumToKms(v: number, units: MeasurementUnits): number {
  return units === 'imperial' ? v * KM_PER_MILE : v;
}
