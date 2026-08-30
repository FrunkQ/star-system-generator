// In-system measurement-unit formatting. The app ALWAYS stores and computes in SI (km, km/s, AU internally);
// this layer only decides how a distance/speed is DISPLAYED — metric (km) by default, or imperial (miles)
// when the GM flips the starmap's `measurementUnits`. Pure functions (no store) so they're trivially
// testable; the reactive `fmt`/`measurementUnit` wrappers live in stores.ts.
//
// NOTE: the interstellar STARMAP unit (ly / pc / diagrammatic, `starmap.distanceUnit`) is a SEPARATE
// concept and is not touched here — this is only in-system km/miles.
import { AU_KM, EARTH_MASS_KG, JUPITER_MASS_KG, SOLAR_MASS_KG, LY_M, PC_M } from './constants';
// The power ladder's L☉ stop. B110 left the engine with ONE luminosity function; this is a display
// ladder reading its constant, never a fourth hardcoded 3.8e26.
import { SOLAR_LUMINOSITY_W } from './physics/luminosity';

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
  | 't' | 'kt' | 'Mt' | 'Gt'                     // mass, tonnage ladder (SI base: kg)
  | 'M-Earth' | 'M-Jup' | 'M-Sol'                // mass, relative to a reference body
  | 'm' | 'km' | 'mi' | 'AU' | 'ly' | 'pc'       // distance (SI base: km)
  | 'm3' | 'km3'                                 // volume (SI base: m³)
  | 'MW' | 'GW' | 'TW' | 'L-Sol'                 // power (SI base: W)
  | 'km/s' | 'mi/s'                              // speed (SI base: km/s)
  | 'auto';                                      // not a unit: "pick one by magnitude" (see resolveAutoUnit)

export type UnitDimension = 'temperature' | 'mass' | 'distance' | 'volume' | 'power' | 'speed';

// How a quantity's 'auto' stop resolves. TWO rules, and they are NOT interchangeable:
//  - 'orbit-threshold' is the pinned ORBIT_KM_BELOW_AU rule (km below 0.05 AU, AU above), which
//    keeps every one of Sol's major moons in km. It is a chosen threshold, not a magnitude walk.
//  - 'ladder' walks the quantity's own stops for the one that reads at human scale.
// THEY DISAGREE, and Iapetus is where: at 0.0238 AU the general walk prefers AU (it is the nearer
// of the two to a human-scale number) while the orbit rule holds it in km, which is the whole point
// of the threshold — "keeps every one of Sol's major moons in km" is a stated promise, not an
// accident of arithmetic. The tempting fold is therefore refused, and a gate pins the difference.
// (Luna, at 0.00257 AU, happens to land on km under BOTH rules — by a margin of half a percent.
// Checking the fold against Luna alone would have said the two rules agreed. They do not.)
export type UnitAutoRule = 'orbit-threshold' | 'ladder';

export interface UnitQuantitySpec {
  dimension: UnitDimension;
  stops: readonly UnitId[];
  autoRule?: UnitAutoRule; // required (and only meaningful) when 'auto' is one of the stops
}

// The quantity vocabulary. The display sweep tags each field with one of these keys; adding a key
// here is cheap, forking cycle behaviour in a component is the thing this table exists to prevent.
//  - `radius`   body/feature sizes (planet radius, ring extents, a construct's host radius)
//  - `dimensions` a CONSTRUCT's hull extent, which spans a 46 m corvette and a 2 AU Dyson sphere and
//               therefore needs stops a body radius never wants (A80). The three axes share one
//               pref because they are one reading, so one click moves all three.
//  - `orbit`    orbital separations. Its default stop is 'auto' — km below ORBIT_KM_BELOW_AU, AU
//               above — because the unit follows the DISTANCE, not the role (the Pluto-about-the-
//               barycentre lesson pinned in units.spec.ts stays pinned through the ladder era).
//  - `distance` free lengths that can span scales (sensor ranges, journey legs)
//  - `volume`   fuel and hold volumes, authored in m³
//  - `power`    reactor output and surplus. L☉ is the top stop because a mega-construct's harvest
//               is a stellar-scale figure; see the note on POWER_W_PER before wiring G53 to it.
export const UNIT_QUANTITIES = {
  temperature: { dimension: 'temperature', stops: ['K', 'C', 'F'] },
  mass: { dimension: 'mass', stops: ['auto', 't', 'kt', 'Mt', 'Gt', 'M-Earth', 'M-Jup', 'M-Sol'], autoRule: 'ladder' },
  radius: { dimension: 'distance', stops: ['km', 'mi'] },
  dimensions: { dimension: 'distance', stops: ['auto', 'm', 'km', 'mi', 'AU'], autoRule: 'ladder' },
  orbit: { dimension: 'distance', stops: ['auto', 'km', 'mi', 'AU'], autoRule: 'orbit-threshold' },
  distance: { dimension: 'distance', stops: ['km', 'mi', 'AU', 'ly', 'pc'] },
  volume: { dimension: 'volume', stops: ['auto', 'm3', 'km3'], autoRule: 'ladder' },
  power: { dimension: 'power', stops: ['auto', 'MW', 'GW', 'TW', 'L-Sol'], autoRule: 'ladder' },
  speed: { dimension: 'speed', stops: ['km/s', 'mi/s'] }
} as const satisfies Record<string, UnitQuantitySpec>;

export type UnitQuantity = keyof typeof UNIT_QUANTITIES;

// SI-per-unit factors for the linear dimensions (temperature is affine and handled explicitly,
// through the SAME formulae as the legacy helpers above — one source for each conversion).
const KM_PER_LY = LY_M / 1000;
const KM_PER_PC = PC_M / 1000;
const MASS_KG_PER: Record<string, number> = {
  't': 1000,
  'kt': 1e6,
  'Mt': 1e9,
  'Gt': 1e12,
  'M-Earth': EARTH_MASS_KG,
  'M-Jup': JUPITER_MASS_KG,
  'M-Sol': SOLAR_MASS_KG
};
const DIST_KM_PER: Record<string, number> = {
  m: 0.001,
  km: 1,
  mi: KM_PER_MILE,
  AU: AU_KM,
  ly: KM_PER_LY,
  pc: KM_PER_PC
};
const VOL_M3_PER: Record<string, number> = {
  m3: 1,
  km3: 1e9
};
// L☉ is a POWER, so it is an ordinary stop on this ladder: SOLAR_LUMINOSITY_W comes from the one
// luminosity function B110 unified the engine onto, never a fourth hardcoded 3.8e26.
// NOTE FOR G53: `megaTypes.ts` publishes `powerHarvestedLstarFrac`, which is a fraction of the HOST
// STAR's output — NOT of L☉ and NOT a value in watts. It must be multiplied by that host's
// luminosity before it can be shown through this ladder; feeding the bare fraction in would read a
// K-dwarf's harvest as if it were the Sun's.
const POWER_W_PER: Record<string, number> = {
  MW: 1e6,
  GW: 1e9,
  TW: 1e12,
  'L-Sol': SOLAR_LUMINOSITY_W
};
const SPEED_KMS_PER: Record<string, number> = {
  'km/s': 1,
  'mi/s': KM_PER_MILE
};

// Stops that belong to the IMPERIAL flavour. An 'auto' stop is a MAGNITUDE rule and stays metric:
// km and mi are the SAME magnitude in two systems, so letting the ladder walk choose between them
// would put a 6,371 km radius in miles purely because 3,959 sits nearer 1,000. An imperial GM pins
// the stop instead — the same shape as the orbit auto rule, whose equivalent migration loss is
// already recorded on the G34 row.
const IMPERIAL_STOPS: ReadonlySet<string> = new Set(['mi', 'mi/s']);

// A LADDER auto stop: the stop that puts the reading at human scale — a number between 1 and 1,000.
// Walk the quantity's own metric stops and take the one nearest that window, preferring the SMALLER
// stop when two tie, so a value stays in the unit it was authored in until it actually overflows
// (2,547 t reads as tonnes; 50,000 t becomes 50 kt).
//
// The nearest-window rule rather than "the largest stop below 1,000" is load-bearing, and the
// mega-constructs are why: the tonnage ladder tops out at Gt (1e12 kg) and the next stop is M⊕
// (5.97e24 kg), twelve decades further on. A Dyson shell at 1e23 kg is over EVERY tonnage stop, so
// "largest stop still ≥ 1" would print 1e11 Gt. Nearest-window picks M⊕ and reads 0.01674 M⊕,
// which is exactly the Earth-mass comparison the A80 report asked for.
const AUTO_WINDOW_TOP = 3; // log10(1000)

function ladderAutoStop(q: UnitQuantity, si: number): UnitId {
  const stops = (UNIT_QUANTITIES[q].stops as readonly UnitId[]).filter(
    (u) => u !== 'auto' && !IMPERIAL_STOPS.has(u)
  );
  const a = Math.abs(si);
  if (!Number.isFinite(a) || a === 0) return stops[0]; // zero has no magnitude: the ladder's base
  let best = stops[0];
  let bestScore = Infinity;
  for (const u of stops) {
    const l = Math.log10(Math.abs(unitFromSI(u, si)));
    const score = l > AUTO_WINDOW_TOP ? l - AUTO_WINDOW_TOP : l < 0 ? -l : 0;
    if (score < bestScore) { best = u; bestScore = score; } // strict <: ties keep the smaller stop
  }
  return best;
}

// 'auto' resolves to a concrete unit by magnitude before any conversion or label. WHICH rule it
// uses is the quantity's own data (`autoRule`), which is why the quantity has to be passed: the
// orbit threshold and the ladder walk disagree about Luna, and silently picking one of them for a
// new quantity is how a second cycle behaviour gets forked. Metric flavour, both rules.
export function resolveAutoUnit(unit: UnitId, si: number, q: UnitQuantity): UnitId {
  if (unit !== 'auto') return unit;
  if (UNIT_QUANTITIES[q].autoRule === 'ladder') return ladderAutoStop(q, si);
  return Math.abs(si) < ORBIT_KM_BELOW_AU * AU_KM ? 'km' : 'AU';
}

// Display value in `unit` → SI (K / kg / km / km·s⁻¹). Temperature pivots through the legacy
// °C round-trip helpers so the formula exists once.
export function unitToSI(unit: UnitId, v: number): number {
  if (unit === 'K' || unit === 'C' || unit === 'F') return displayTempToC(v, unit) + 273.15;
  if (unit in MASS_KG_PER) return v * MASS_KG_PER[unit];
  if (unit in DIST_KM_PER) return v * DIST_KM_PER[unit];
  if (unit in VOL_M3_PER) return v * VOL_M3_PER[unit];
  if (unit in POWER_W_PER) return v * POWER_W_PER[unit];
  if (unit in SPEED_KMS_PER) return v * SPEED_KMS_PER[unit];
  throw new Error(`unitToSI: '${unit}' is not a concrete unit (resolve 'auto' first)`);
}

// SI → the value expressed in `unit`.
export function unitFromSI(unit: UnitId, si: number): number {
  if (unit === 'K' || unit === 'C' || unit === 'F') return cToDisplayTemp(si - 273.15, unit);
  if (unit in MASS_KG_PER) return si / MASS_KG_PER[unit];
  if (unit in DIST_KM_PER) return si / DIST_KM_PER[unit];
  if (unit in VOL_M3_PER) return si / VOL_M3_PER[unit];
  if (unit in POWER_W_PER) return si / POWER_W_PER[unit];
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
    case 'L-Sol': return 'L☉';
    case 'm3': return 'm³';
    case 'km3': return 'km³';
    default: return unit; // t, kt, Mt, Gt, m, km, mi, AU, ly, pc, MW, GW, TW, km/s, mi/s read as themselves
  }
}

// SIGNIFICANT FIGURES, IN ONE PLACE. Three rules, and every caller gets all three:
//
// 1. `SIG_FIG_STOPS` are the stops that carry SCALE-REDUCED readings — a mass relative to a
//    reference body, or a prefixed rung of a ladder. Fixed decimals cannot serve them (Jupiter must
//    read "1.000" at M-Jup, "317.8" at M⊕ and "9.54e-4" at M☉), and a fixed 0 decimals would print
//    a 25 MW surplus pinned to GW as "0" — the "0.000 AU" fault in another dimension.
// 2. A value shown through an 'auto' stop has ALREADY had its magnitude chosen, so what is left to
//    decide is how many digits are meaningful: SIG_FIGS of them, trailing zeros trimmed.
// 3. Nothing is ever printed with more digits than a double can carry. That is the second fault in
//    the A80 report and the sneaky one: a kg→t division leaves float dust in the low digits and
//    toLocaleString prints every spurious one as if it had been measured
//    ("100,000,000,000,000,010,000 t"). Above FIXED_NOTATION_MAX a fixed print is both a wall of
//    digits and a lie, so it goes exponential.
//
// SIG_FIGS is 4 rather than 3 because 4 is what the shipped relative-mass rule already used
// (`toPrecision(4)`, pinned in units.spec.ts as "317.8" and "1.000"), and it keeps a four-digit
// authored tonnage exact through the ladder: 2,547 t reads "2.547 kt", not "2.55 kt".
export const SIG_FIGS = 4;
const FIXED_NOTATION_MAX = 1e15;
const SIG_FIG_STOPS: ReadonlySet<string> = new Set([
  'M-Earth', 'M-Jup', 'M-Sol', 'L-Sol', 'kt', 'Mt', 'Gt', 'km3', 'MW', 'GW', 'TW'
]);

// ONE spelling of "too big or too small for fixed notation" — 3 significant figures, the exponential
// convention this file has always used.
function expNum(v: number): string {
  return v.toExponential(2);
}

// An auto-chosen stop decides how many DECIMALS to show — it never rounds away integer digits.
// That distinction is the one this had to be corrected on, and the body-panel pin is what caught
// it: rounding to significant figures turned "1.000 AU" into "1 AU" for every planetary orbit, and
// a barycentre member at 0.04 AU from "7,465,000 km" into "7,400,000 km". So: show enough decimals
// to reach SIG_FIGS, never fewer than the stop's own convention asks for (AU keeps its three), and
// let the trailing zeros a fixed precision would have added simply not appear ("46 m", not
// "46.00 m"). Integer digits are always real digits — the dust guard is what handles the fake ones.
function autoDecimals(unit: UnitId, v: number): { min: number; max: number } {
  const min = DEFAULT_DECIMALS[unit] ?? 0;
  const a = Math.abs(v);
  const need = a > 0 ? Math.max(0, SIG_FIGS - 1 - Math.floor(Math.log10(a))) : 0;
  return { min, max: Math.max(min, Math.min(20, need)) };
}

// Number formatting per unit stop, WITHOUT the label. `viaAuto` says the stop was chosen by an
// 'auto' ladder rather than pinned by the GM; an explicit `decimals` from the caller always wins.
export function formatUnitNum(unit: UnitId, displayValue: number, decimals?: number, viaAuto = false): string {
  if (!Number.isFinite(displayValue)) return '—';
  const a = Math.abs(displayValue);
  if (viaAuto && decimals === undefined) {
    if (a !== 0 && (a >= 1e7 || a < 1e-3)) return expNum(displayValue); // the ladder ran out of stops
    const { min, max } = autoDecimals(unit, displayValue);
    return displayValue.toLocaleString(undefined, { minimumFractionDigits: min, maximumFractionDigits: max });
  }
  if (SIG_FIG_STOPS.has(unit)) {
    if (a !== 0 && (a >= 1e4 || a < 1e-3)) return expNum(displayValue);
    if (a >= 100) return fmtNum(displayValue, decimals ?? 1);
    return displayValue.toPrecision(SIG_FIGS);
  }
  // Tonnes stay plain for cargo-scale figures but a planet at the t stop is 5.97e+21, not a
  // 22-digit locale number.
  if (unit === 't' && a >= 1e7) return expNum(displayValue);
  if (a >= FIXED_NOTATION_MAX) return expNum(displayValue); // rule 3: never print float dust
  return fmtNum(displayValue, decimals ?? DEFAULT_DECIMALS[unit] ?? 0);
}
const DEFAULT_DECIMALS: Partial<Record<UnitId, number>> = {
  AU: 3, ly: 2, pc: 2, 'km/s': 1, 'mi/s': 1
};

// SI value → "<number> <label>" in one call, resolving 'auto'. The quantity is required because
// that is what says HOW 'auto' resolves (see resolveAutoUnit). The formatting counterpart of
// unitFromSI; <UnitValue> renders number and label separately so only the label is a button.
export function formatSIInUnit(si: number, unit: UnitId, q: UnitQuantity, decimals?: number): string {
  if (!Number.isFinite(si)) return '—';
  const concrete = resolveAutoUnit(unit, si, q);
  return `${formatUnitNum(concrete, unitFromSI(concrete, si), decimals, unit === 'auto')} ${unitIdLabel(concrete)}`;
}

// Pref-resolved string formatting for the surfaces that cannot host a component — tooltips,
// document/report builders, curate. Interactive panels use <UnitValue> instead so the unit label
// is the click target.
export function formatPref(prefs: UnitPrefs | undefined, q: UnitQuantity, b: UnitBodyType, si: number, decimals?: number): string {
  return formatSIInUnit(si, resolveUnitPref(prefs, q, b), q, decimals);
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
// already used (M☉ stars, M⊕ worlds); orbits follow the magnitude rule.
//
// A80 CHANGED ONE OF THESE, deliberately: a CONSTRUCT's mass defaulted to 't', which printed a
// mega-construct as a twenty-digit tonnage, so it now defaults to the ladder. Bodies keep the
// concrete stops they had, so every body panel reads exactly as before. Anyone who has explicitly
// cycled a construct to tonnes keeps tonnes — a stored pref still wins over the default.
export function defaultUnitFor(q: UnitQuantity, b: UnitBodyType): UnitId {
  switch (q) {
    case 'temperature': return b === 'star' ? 'K' : 'C';
    case 'mass': return b === 'star' ? 'M-Sol' : b === 'construct' ? 'auto' : 'M-Earth';
    case 'radius': return 'km';
    case 'dimensions': return 'auto';
    case 'orbit': return 'auto';
    case 'distance': return 'km';
    case 'volume': return 'auto';
    case 'power': return 'auto';
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
// A THIRD, added with A80's ladders and the same shape as the second: an imperial map's construct
// DIMENSIONS stay on 'auto' (metric) rather than migrating to miles. The ladder has no imperial
// small stop — there is no feet — so migrating a 46 m corvette to miles would read 0.0286 mi. An
// imperial GM pins the stop; volume and power have no imperial stops at all, so nothing migrates.
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
