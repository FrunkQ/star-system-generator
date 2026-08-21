import { describe, it, expect } from 'vitest';
import {
  formatDistanceKm, formatDistanceAu, formatSpeedKmS, formatSpeedAuto, MILE_PER_KM,
  kmToDisplayNum, displayNumToKm, kmsToDisplayNum, displayNumToKms,
  formatTempC, formatTempK, cToDisplayTemp, displayTempToC,
  formatOrbitRadiusAu, ORBIT_KM_BELOW_AU,
  UNIT_QUANTITIES, UNIT_BODY_TYPES, unitToSI, unitFromSI, unitIdLabel, formatUnitNum,
  formatSIInUnit, resolveAutoUnit, cycleUnit, defaultUnitFor, resolveUnitPref, unitPrefKey,
  migrateUnitPrefs,
  type UnitId, type UnitQuantity
} from './units';
import { AU_KM, EARTH_MASS_KG, JUPITER_MASS_KG, SOLAR_MASS_KG, LY_M, PC_M } from './constants';

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

// ——————————————————————————————————————————————————————————————————————————————————————————————
// G34 — the click-to-cycle ladders. Storage stays SI (K, kg, km, km/s); every stop must round-trip
// through unitToSI/unitFromSI without drift, because the edit half of the sweep rides exactly that.

describe('unit ladders — every stop round-trips SI without drift', () => {
  it('every concrete stop of every quantity round-trips', () => {
    for (const [q, spec] of Object.entries(UNIT_QUANTITIES)) {
      for (const stop of spec.stops) {
        if (stop === 'auto') continue; // resolved before conversion, tested separately
        for (const si of [0.001, 1, 273.15, 5972, 1.898e27]) {
          const rt = unitToSI(stop as UnitId, unitFromSI(stop as UnitId, si));
          expect(rt, `${q} @ ${stop}`).toBeCloseTo(si, si > 1e20 ? -14 : 6);
        }
      }
    }
  });

  it('temperature: typing 100 into a field showing °F stores 310.9 K', () => {
    expect(unitToSI('F', 100)).toBeCloseTo(310.928, 3);
    // flip the field to K and back — no drift
    expect(unitFromSI('F', unitToSI('F', 100))).toBeCloseTo(100, 9);
    expect(unitFromSI('K', unitToSI('K', 310.93))).toBeCloseTo(310.93, 9);
    // ladder conversions agree with the legacy °C helpers (one formula, two doors)
    expect(unitFromSI('C', 300)).toBeCloseTo(cToDisplayTemp(300 - 273.15, 'C'), 12);
    expect(unitToSI('C', displayTempToC(80.33, 'F'))).toBeCloseTo(unitToSI('F', 80.33), 9);
  });

  it('mass: Jupiter reads exactly 1.000 at the M-Jup stop, 317.8 at M-Earth', () => {
    expect(formatUnitNum('M-Jup', unitFromSI('M-Jup', 1.898e27))).toBe('1.000');
    expect(formatUnitNum('M-Earth', unitFromSI('M-Earth', 1.898e27))).toBe('317.8');
    expect(formatUnitNum('M-Earth', unitFromSI('M-Earth', EARTH_MASS_KG))).toBe('1.000');
    expect(formatUnitNum('M-Sol', unitFromSI('M-Sol', SOLAR_MASS_KG))).toBe('1.000');
    // Jupiter in solar masses is small — significant figures, not a page of zeros
    expect(formatUnitNum('M-Sol', unitFromSI('M-Sol', JUPITER_MASS_KG))).toBe('9.54e-4');
    // tonnes format like plain quantities
    expect(formatUnitNum('t', unitFromSI('t', 2.5e6))).toBe('2,500');
  });

  it('long distances: AU, ly and pc stops agree with the astronomical constants', () => {
    expect(unitFromSI('AU', AU_KM)).toBeCloseTo(1, 12);
    expect(unitFromSI('ly', LY_M / 1000)).toBeCloseTo(1, 12);
    expect(unitFromSI('pc', PC_M / 1000)).toBeCloseTo(1, 12);
    // 1 pc = 3.2616 ly, through the ladder
    expect(unitToSI('pc', 1) / unitToSI('ly', 1)).toBeCloseTo(3.2616, 3);
    expect(formatSIInUnit(AU_KM, 'AU')).toBe('1.000 AU');
    expect(formatSIInUnit(4.13 * (LY_M / 1000), 'ly')).toBe('4.13 ly');
  });

  it("the orbit ladder's auto stop follows the magnitude rule (Pluto stays in km)", () => {
    const plutoKm = 1.405886379192334e-5 * AU_KM; // Pluto about the Pluto–Charon barycentre
    expect(resolveAutoUnit('auto', plutoKm)).toBe('km');
    expect(resolveAutoUnit('auto', AU_KM)).toBe('AU');
    expect(resolveAutoUnit('auto', ORBIT_KM_BELOW_AU * AU_KM)).toBe('AU'); // same threshold, same side
    expect(resolveAutoUnit('km', AU_KM)).toBe('km'); // concrete stops pass through
    expect(formatSIInUnit(plutoKm, 'auto')).toBe('2,103 km'); // never "0.000 AU"
  });

  it('labels: masses use the symbols the panels already speak; non-finite is dashed', () => {
    expect(unitIdLabel('M-Earth')).toBe('M⊕');
    expect(unitIdLabel('M-Jup')).toBe('M♃');
    expect(unitIdLabel('M-Sol')).toBe('M☉');
    expect(unitIdLabel('C')).toBe('°C');
    expect(unitIdLabel('K')).toBe('K');
    expect(formatSIInUnit(NaN, 'km')).toBe('—');
    expect(formatUnitNum('AU', Infinity)).toBe('—');
  });
});

describe('unit prefs — one cycle order, remembered per quantity × body type', () => {
  it('cycles every quantity through its stops in ladder order and wraps', () => {
    for (const [q, spec] of Object.entries(UNIT_QUANTITIES)) {
      let u = spec.stops[0] as UnitId;
      const seen = [u];
      for (let i = 1; i < spec.stops.length; i++) { u = cycleUnit(q as UnitQuantity, u); seen.push(u); }
      expect(seen, q).toEqual([...spec.stops]);
      expect(cycleUnit(q as UnitQuantity, u), `${q} wraps`).toBe(spec.stops[0]);
    }
  });

  it("owner's defaults: stars in kelvin, worlds in celsius; masses as the panels showed them", () => {
    expect(defaultUnitFor('temperature', 'star')).toBe('K');
    expect(defaultUnitFor('temperature', 'planet')).toBe('C');
    expect(defaultUnitFor('temperature', 'moon')).toBe('C');
    expect(defaultUnitFor('mass', 'star')).toBe('M-Sol');
    expect(defaultUnitFor('mass', 'planet')).toBe('M-Earth');
    expect(defaultUnitFor('mass', 'construct')).toBe('t');
    expect(defaultUnitFor('orbit', 'planet')).toBe('auto');
  });

  it('a stored pref wins; an absent or out-of-ladder pref falls back to the default', () => {
    expect(resolveUnitPref({ 'temperature:planet': 'F' }, 'temperature', 'planet')).toBe('F');
    expect(resolveUnitPref({}, 'temperature', 'planet')).toBe('C');
    expect(resolveUnitPref(undefined, 'temperature', 'star')).toBe('K');
    // 'ly' is a distance-ladder stop but NOT on the radius quantity — never lie with it
    expect(resolveUnitPref({ 'radius:planet': 'ly' }, 'radius', 'planet')).toBe('km');
    expect(resolveUnitPref({ 'mass:planet': 'stone' }, 'mass', 'planet')).toBe('M-Earth');
  });
});

describe('unit prefs migration — the two legacy map-wide fields, once', () => {
  it('a default or unset legacy map contributes nothing (the sparse record IS the migration mark)', () => {
    expect(migrateUnitPrefs({})).toEqual({});
    expect(migrateUnitPrefs({ measurementUnits: 'metric', temperatureUnit: 'C' })).toEqual({});
    // …so stars pick up the new K default even on a map explicitly saved with °C
    expect(resolveUnitPref(migrateUnitPrefs({ temperatureUnit: 'C' }), 'temperature', 'star')).toBe('K');
  });

  it('an explicit °F/K choice governed every body type, and carries to every body type', () => {
    const prefs = migrateUnitPrefs({ temperatureUnit: 'F' });
    for (const b of UNIT_BODY_TYPES) expect(prefs[unitPrefKey('temperature', b)]).toBe('F');
    expect(Object.keys(prefs)).toHaveLength(4);
  });

  it('imperial carries to radii, free distances and speeds everywhere, but orbits only where they are short', () => {
    const prefs = migrateUnitPrefs({ measurementUnits: 'imperial' });
    for (const b of UNIT_BODY_TYPES) {
      expect(prefs[unitPrefKey('radius', b)]).toBe('mi');
      expect(prefs[unitPrefKey('distance', b)]).toBe('mi');
      expect(prefs[unitPrefKey('speed', b)]).toBe('mi/s');
    }
    expect(prefs[unitPrefKey('orbit', 'moon')]).toBe('mi');
    expect(prefs[unitPrefKey('orbit', 'construct')]).toBe('mi');
    // planet/star orbits keep the magnitude rule — AU above the threshold, exactly as imperial showed them
    expect(resolveUnitPref(prefs, 'orbit', 'planet')).toBe('auto');
    expect(resolveUnitPref(prefs, 'orbit', 'star')).toBe('auto');
  });
});
