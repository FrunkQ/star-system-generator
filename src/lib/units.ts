// In-system measurement-unit formatting. The app ALWAYS stores and computes in SI (km, km/s, AU internally);
// this layer only decides how a distance/speed is DISPLAYED — metric (km) by default, or imperial (miles)
// when the GM flips the starmap's `measurementUnits`. Pure functions (no store) so they're trivially
// testable; the reactive `fmt`/`measurementUnit` wrappers live in stores.ts.
//
// NOTE: the interstellar STARMAP unit (ly / pc / diagrammatic, `starmap.distanceUnit`) is a SEPARATE
// concept and is not touched here — this is only in-system km/miles.
import { AU_KM, EARTH_MASS_KG, JUPITER_MASS_KG, SOLAR_MASS_KG, LY_M, PC_M } from './constants';

export type MeasurementUnits = 'metric' | 'imperial';
// Temperature is its OWN switch (independent of metric/imperial): °C, °F, or scientific Kelvin.
export type TemperatureUnit = 'C' | 'F' | 'K';

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

// AN ORBITAL RADIUS, in AU → the display string, with the unit chosen by MAGNITUDE.
//
// This is the one question "how far out does this orbit sit?" and it had four answers: the info
// panel picked its unit by the body's ROLE (km for a `roleHint: 'moon'`, AU for everything else),
// while `bodyFacts.orbitDist`, `ai/curate` and the visualiser each switched on size at their own
// threshold. Role is the wrong axis and it shipped a visible bug: Pluto is a PLANET orbiting the
// Pluto–Charon barycentre at 1.4e-5 AU, so it took the AU branch and read "0.000 AU". Every
// barycentre member had the same problem, and so did Rocheworld's two lobes at 2.25e-5 AU.
//
// The threshold is not a new opinion — 0.05 AU is what `bodyFacts` and `curate` had both already
// chosen independently, so this promotes the existing answer rather than adding a fifth. It keeps
// every one of Sol's major moons in km (Iapetus, the widest, is 0.0238 AU) and every planetary
// orbit in AU.
export const ORBIT_KM_BELOW_AU = 0.05;

export function formatOrbitRadiusAu(au: number, units: MeasurementUnits, decimals = 3): string {
  if (!Number.isFinite(au)) return '—';
  return Math.abs(au) < ORBIT_KM_BELOW_AU ? formatDistanceAu(au, units) : `${fmtNum(au, decimals)} AU`;
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

// TEMPERATURE. Stored internally in kelvin; displayed °C / °F / K per the temperature switch. Two entry
// points because sites hold either a kelvin value or an already-computed Celsius value.
export function formatTempC(celsius: number, t: TemperatureUnit, decimals = 0): string {
  if (!Number.isFinite(celsius)) return '—';
  if (t === 'F') return `${fmtNum(celsius * 9 / 5 + 32, decimals)} °F`;
  if (t === 'K') return `${fmtNum(celsius + 273.15, decimals)} K`;
  return `${fmtNum(celsius, decimals)} °C`;
}
export function formatTempK(kelvin: number, t: TemperatureUnit, decimals = 0): string {
  return Number.isFinite(kelvin) ? formatTempC(kelvin - 273.15, t, decimals) : '—';
}
export function tempUnitLabel(t: TemperatureUnit): string {
  return t === 'F' ? '°F' : t === 'K' ? 'K' : '°C';
}
// Editable temperature inputs: a Celsius value shown/edited in the display unit, converted back on input.
export function cToDisplayTemp(celsius: number, t: TemperatureUnit): number {
  return t === 'F' ? celsius * 9 / 5 + 32 : t === 'K' ? celsius + 273.15 : celsius;
}
export function displayTempToC(v: number, t: TemperatureUnit): number {
  return t === 'F' ? (v - 32) * 5 / 9 : t === 'K' ? v - 273.15 : v;
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

// ———————————————————————————————————————————————————————————————————————————————————————————————
// G34: click-to-cycle unit ladders, remembered per quantity × body type.
//
// Storage stays SI everywhere (K, kg, km, km/s); a unit pref never touches a stored value — these
// ladders RELABEL a display, they never convert stored data (A43's convert-vs-relabel lesson). The
// interstellar STARMAP unit (`starmap.scale.unit`, DATA-R19, `map/distanceUnits.ts`) is a separate
// concept and stays out of this vocabulary.
//
// ONE cycle order per ladder, defined here and nowhere else. A QUANTITY names a kind of reading
// (a temperature, a mass, an orbital separation); it exposes the stops of its dimension's ladder
// that make sense for it, in ladder order. The chosen stop is remembered per quantity × body type
// in `unitPrefs` ON THE STARMAP — campaign data, so it rides save, bundle and the player snapshot
// (players inherit the GM's units); a skin, by contrast, is per-viewer chrome.

export type UnitBodyType = 'star' | 'planet' | 'moon' | 'construct';

export type UnitId =
  | 'K' | 'C' | 'F'                              // temperature (SI base: kelvin)
  | 't' | 'M-Earth' | 'M-Jup' | 'M-Sol'          // mass (SI base: kg)
  | 'km' | 'mi' | 'AU' | 'ly' | 'pc' | 'auto'    // distance (SI base: km); 'auto' = orbit magnitude rule
  | 'km/s' | 'mi/s';                             // speed (SI base: km/s)

export type UnitDimension = 'temperature' | 'mass' | 'distance' | 'speed';

export interface UnitQuantitySpec {
  dimension: UnitDimension;
  stops: readonly UnitId[];
}

// The quantity vocabulary. The display sweep tags each field with one of these keys; adding a key
// here is cheap, forking cycle behaviour in a component is the thing this table exists to prevent.
//  - `radius`   body/feature sizes (planet radius, ring extents, construct dimensions)
//  - `orbit`    orbital separations. Its default stop is 'auto' — km below ORBIT_KM_BELOW_AU, AU
//               above — because the unit follows the DISTANCE, not the role (the Pluto-about-the-
//               barycentre lesson pinned in units.spec.ts stays pinned through the ladder era).
//  - `distance` free lengths that can span scales (sensor ranges, journey legs)
export const UNIT_QUANTITIES = {
  temperature: { dimension: 'temperature', stops: ['K', 'C', 'F'] },
  mass: { dimension: 'mass', stops: ['t', 'M-Earth', 'M-Jup', 'M-Sol'] },
  radius: { dimension: 'distance', stops: ['km', 'mi'] },
  orbit: { dimension: 'distance', stops: ['auto', 'km', 'mi', 'AU'] },
  distance: { dimension: 'distance', stops: ['km', 'mi', 'AU', 'ly', 'pc'] },
  speed: { dimension: 'speed', stops: ['km/s', 'mi/s'] }
} as const satisfies Record<string, UnitQuantitySpec>;

export type UnitQuantity = keyof typeof UNIT_QUANTITIES;

// SI-per-unit factors for the linear dimensions (temperature is affine and handled explicitly,
// through the SAME formulae as the legacy helpers above — one source for each conversion).
const KM_PER_LY = LY_M / 1000;
const KM_PER_PC = PC_M / 1000;
const MASS_KG_PER: Record<string, number> = {
  't': 1000,
  'M-Earth': EARTH_MASS_KG,
  'M-Jup': JUPITER_MASS_KG,
  'M-Sol': SOLAR_MASS_KG
};
const DIST_KM_PER: Record<string, number> = {
  km: 1,
  mi: KM_PER_MILE,
  AU: AU_KM,
  ly: KM_PER_LY,
  pc: KM_PER_PC
};
const SPEED_KMS_PER: Record<string, number> = {
  'km/s': 1,
  'mi/s': KM_PER_MILE
};

// 'auto' (the orbit ladder's default stop) resolves to a concrete unit by magnitude before any
// conversion or label. Same threshold as formatOrbitRadiusAu; metric flavour.
export function resolveAutoUnit(unit: UnitId, siKm: number): UnitId {
  if (unit !== 'auto') return unit;
  return Math.abs(siKm) < ORBIT_KM_BELOW_AU * AU_KM ? 'km' : 'AU';
}

// Display value in `unit` → SI (K / kg / km / km·s⁻¹). Temperature pivots through the legacy
// °C round-trip helpers so the formula exists once.
export function unitToSI(unit: UnitId, v: number): number {
  if (unit === 'K' || unit === 'C' || unit === 'F') return displayTempToC(v, unit) + 273.15;
  if (unit in MASS_KG_PER) return v * MASS_KG_PER[unit];
  if (unit in DIST_KM_PER) return v * DIST_KM_PER[unit];
  if (unit in SPEED_KMS_PER) return v * SPEED_KMS_PER[unit];
  throw new Error(`unitToSI: '${unit}' is not a concrete unit (resolve 'auto' first)`);
}

// SI → the value expressed in `unit`.
export function unitFromSI(unit: UnitId, si: number): number {
  if (unit === 'K' || unit === 'C' || unit === 'F') return cToDisplayTemp(si - 273.15, unit);
  if (unit in MASS_KG_PER) return si / MASS_KG_PER[unit];
  if (unit in DIST_KM_PER) return si / DIST_KM_PER[unit];
  if (unit in SPEED_KMS_PER) return si / SPEED_KMS_PER[unit];
  throw new Error(`unitFromSI: '${unit}' is not a concrete unit (resolve 'auto' first)`);
}

// The label rendered on the click target. Temperature reuses tempUnitLabel; masses use the
// symbols the panels already speak (M⊕ / M♃ / M☉).
export function unitIdLabel(unit: UnitId): string {
  switch (unit) {
    case 'K': case 'C': case 'F': return tempUnitLabel(unit);
    case 'M-Earth': return 'M⊕';
    case 'M-Jup': return 'M♃';
    case 'M-Sol': return 'M☉';
    default: return unit; // t, km, mi, AU, ly, pc, km/s, mi/s read as themselves
  }
}

// Number formatting per unit stop, WITHOUT the label. Relative masses use significant figures
// (Jupiter must read "1.000" at M-Jup, "317.8" at M⊕, "9.54e-4" at M☉ — fixed decimals cannot
// serve all three); everything else keeps the existing per-unit conventions.
export function formatUnitNum(unit: UnitId, displayValue: number, decimals?: number): string {
  if (!Number.isFinite(displayValue)) return '—';
  if (unit === 'M-Earth' || unit === 'M-Jup' || unit === 'M-Sol') {
    const a = Math.abs(displayValue);
    if (a !== 0 && (a >= 1e4 || a < 1e-3)) return displayValue.toExponential(2);
    if (a >= 100) return fmtNum(displayValue, decimals ?? 1);
    return displayValue.toPrecision(4);
  }
  // Tonnes stay plain for cargo-scale figures but a planet at the t stop is 5.97e+21, not a
  // 22-digit locale number.
  if (unit === 't' && Math.abs(displayValue) >= 1e7) return displayValue.toExponential(2);
  return fmtNum(displayValue, decimals ?? DEFAULT_DECIMALS[unit] ?? 0);
}
const DEFAULT_DECIMALS: Partial<Record<UnitId, number>> = {
  AU: 3, ly: 2, pc: 2, 'km/s': 1, 'mi/s': 1
};

// SI value → "<number> <label>" in one call, resolving 'auto'. The formatting counterpart of
// unitFromSI; <UnitValue> renders number and label separately so only the label is a button.
export function formatSIInUnit(si: number, unit: UnitId, decimals?: number): string {
  if (!Number.isFinite(si)) return '—';
  const concrete = resolveAutoUnit(unit, si);
  return `${formatUnitNum(concrete, unitFromSI(concrete, si), decimals)} ${unitIdLabel(concrete)}`;
}

// Pref-resolved string formatting for the surfaces that cannot host a component — tooltips,
// document/report builders, curate. Interactive panels use <UnitValue> instead so the unit label
// is the click target.
export function formatPref(prefs: UnitPrefs | undefined, q: UnitQuantity, b: UnitBodyType, si: number, decimals?: number): string {
  return formatSIInUnit(si, resolveUnitPref(prefs, q, b), decimals);
}

// The magnitude-aware formatSpeedAuto (m/s ↔ km/s by size — B37's Phobos lesson) still wants a
// metric/imperial flavour; ONE derivation of it from the speed pref, used by every caller.
export function speedFlavour(prefs: UnitPrefs | undefined, b: UnitBodyType): MeasurementUnits {
  return resolveUnitPref(prefs, 'speed', b) === 'mi/s' ? 'imperial' : 'metric';
}
// Same idea for the km/mi axis (canvas rulers and other bespoke magnitude formatters that keep
// their own structure and only take the flavour from the prefs).
export function distanceFlavour(prefs: UnitPrefs | undefined, b: UnitBodyType): MeasurementUnits {
  return resolveUnitPref(prefs, 'radius', b) === 'mi' ? 'imperial' : 'metric';
}

// ——— prefs: which stop each quantity × body type sits on ———

// Sparse: an absent key means the default below. Values are validated on read, so an unknown or
// out-of-ladder id (older save, future ladder change) falls back to the default instead of lying.
export type UnitPrefs = Record<string, string>;

export function unitPrefKey(q: UnitQuantity, b: UnitBodyType): string {
  return `${q}:${b}`;
}

// The owner's defaults: stars read kelvin, worlds read celsius; masses read the unit the panels
// already used (M☉ stars, M⊕ worlds, tonnes constructs); orbits follow the magnitude rule.
export function defaultUnitFor(q: UnitQuantity, b: UnitBodyType): UnitId {
  switch (q) {
    case 'temperature': return b === 'star' ? 'K' : 'C';
    case 'mass': return b === 'star' ? 'M-Sol' : b === 'construct' ? 't' : 'M-Earth';
    case 'radius': return 'km';
    case 'orbit': return 'auto';
    case 'distance': return 'km';
    case 'speed': return 'km/s';
  }
}

export function resolveUnitPref(prefs: UnitPrefs | undefined, q: UnitQuantity, b: UnitBodyType): UnitId {
  const stored = prefs?.[unitPrefKey(q, b)];
  const stops: readonly string[] = UNIT_QUANTITIES[q].stops;
  return stored !== undefined && stops.includes(stored) ? (stored as UnitId) : defaultUnitFor(q, b);
}

// The next stop for this quantity, in ladder order, wrapping. THE one cycle order.
export function cycleUnit(q: UnitQuantity, current: UnitId): UnitId {
  const stops = UNIT_QUANTITIES[q].stops;
  const i = stops.indexOf(current);
  return stops[(i + 1) % stops.length];
}

export const UNIT_BODY_TYPES: readonly UnitBodyType[] = ['star', 'planet', 'moon', 'construct'];

// THE mapping from a node to its pref bucket — defined once, structural so this file stays free of
// the types module. `roleHint` is required on every CelestialBody; belts, rings and barycentres
// bucket with planets (they are system furniture read at planet scale), ships with constructs.
export function unitBodyTypeFor(b: { kind?: string; roleHint?: string } | null | undefined): UnitBodyType {
  if (!b) return 'planet';
  if (b.kind === 'construct' || b.roleHint === 'construct' || b.roleHint === 'ship') return 'construct';
  if (b.roleHint === 'star') return 'star';
  if (b.roleHint === 'moon') return 'moon';
  return 'planet';
}

// Load-time migration from the two legacy starmap-wide fields. PRESENCE of `unitPrefs` on the
// starmap (even empty) marks a map as migrated — callers only invoke this when the record is
// absent. The legacy fields governed every body type at once, so an explicit non-default legacy
// choice carries into every body type it governed; an unset or default legacy value contributes
// nothing, which is how existing maps pick up the new stars-K default. Two conscious losses, both
// noted on the G34 row: a map explicitly saved with °C now shows stars in K (the owner's default
// wins), and an imperial map's sub-threshold PLANET orbit (a barycentre member) shows km via
// 'auto' rather than miles — moon and construct orbits, which are always short, do migrate to mi.
export function migrateUnitPrefs(legacy: { measurementUnits?: MeasurementUnits; temperatureUnit?: TemperatureUnit }): UnitPrefs {
  const prefs: UnitPrefs = {};
  if (legacy.temperatureUnit === 'F' || legacy.temperatureUnit === 'K') {
    for (const b of UNIT_BODY_TYPES) prefs[unitPrefKey('temperature', b)] = legacy.temperatureUnit;
  }
  if (legacy.measurementUnits === 'imperial') {
    for (const b of UNIT_BODY_TYPES) {
      prefs[unitPrefKey('radius', b)] = 'mi';
      prefs[unitPrefKey('distance', b)] = 'mi';
      prefs[unitPrefKey('speed', b)] = 'mi/s';
    }
    prefs[unitPrefKey('orbit', 'moon')] = 'mi';
    prefs[unitPrefKey('orbit', 'construct')] = 'mi';
  }
  return prefs;
}
