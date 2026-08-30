import { describe, it, expect } from 'vitest';
import {
  formatDistanceKm, formatDistanceAu, formatSpeedKmS, formatSpeedAuto, MILE_PER_KM,
  kmToDisplayNum, displayNumToKm, kmsToDisplayNum, displayNumToKms,
  formatTempC, formatTempK, cToDisplayTemp, displayTempToC,
  formatOrbitRadiusAu, ORBIT_KM_BELOW_AU,
  UNIT_QUANTITIES, UNIT_BODY_TYPES, unitToSI, unitFromSI, unitIdLabel, formatUnitNum,
  formatSIInUnit, resolveAutoUnit, cycleUnit, defaultUnitFor, resolveUnitPref, unitPrefKey,
  migrateUnitPrefs, formatPref,
  type UnitId, type UnitQuantity
} from './units';
import {
  AU_KM, EARTH_MASS_KG, JUPITER_MASS_KG, SOLAR_MASS_KG, LY_M, PC_M,
  EARTH_RADIUS_KM, SOLAR_RADIUS_KM
} from './constants';
import { SOLAR_LUMINOSITY_W } from './physics/luminosity';

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
    // tonnes format like plain quantities at cargo scale, exponential at planet scale
    expect(formatUnitNum('t', unitFromSI('t', 2.5e6))).toBe('2,500');
    expect(formatUnitNum('t', unitFromSI('t', EARTH_MASS_KG))).toBe('5.97e+21');
  });

  it('long distances: AU, ly and pc stops agree with the astronomical constants', () => {
    expect(unitFromSI('AU', AU_KM)).toBeCloseTo(1, 12);
    expect(unitFromSI('ly', LY_M / 1000)).toBeCloseTo(1, 12);
    expect(unitFromSI('pc', PC_M / 1000)).toBeCloseTo(1, 12);
    // 1 pc = 3.2616 ly, through the ladder
    expect(unitToSI('pc', 1) / unitToSI('ly', 1)).toBeCloseTo(3.2616, 3);
    expect(formatSIInUnit(AU_KM, 'AU', 'distance')).toBe('1.000 AU');
    expect(formatSIInUnit(4.13 * (LY_M / 1000), 'ly', 'distance')).toBe('4.13 ly');
  });

  it("the orbit ladder's auto stop follows the magnitude rule (Pluto stays in km)", () => {
    const plutoKm = 1.405886379192334e-5 * AU_KM; // Pluto about the Pluto–Charon barycentre
    expect(resolveAutoUnit('auto', plutoKm, 'orbit')).toBe('km');
    expect(resolveAutoUnit('auto', AU_KM, 'orbit')).toBe('AU');
    expect(resolveAutoUnit('auto', ORBIT_KM_BELOW_AU * AU_KM, 'orbit')).toBe('AU'); // same threshold, same side
    expect(resolveAutoUnit('km', AU_KM, 'orbit')).toBe('km'); // concrete stops pass through
    expect(formatSIInUnit(plutoKm, 'auto', 'orbit')).toBe('2,103 km'); // never "0.000 AU"
  });

  // A80 added a SECOND auto rule, and this is the line that keeps them apart. IAPETUS is where they
  // disagree: the general ladder walk prefers AU for it, while ORBIT_KM_BELOW_AU holds it in km
  // because "keeps every one of Sol's major moons in km" is a promise this threshold makes. Folding
  // orbit onto the general walk would quietly break that promise.
  //
  // Luna is NOT the test, and that is worth saying out loud: at 0.00257 AU it lands on km under
  // both rules, by half a percent. Checked against Luna alone, the fold looks harmless.
  it('the orbit threshold is NOT the ladder walk, and Iapetus is where they disagree', () => {
    const iapetusKm = 0.0238 * AU_KM; // the widest of Sol's major moons
    expect(resolveAutoUnit('auto', iapetusKm, 'orbit')).toBe('km');
    expect(resolveAutoUnit('auto', iapetusKm, 'dimensions')).toBe('AU'); // the same value, the other rule
    expect(resolveAutoUnit('auto', 0.00257 * AU_KM, 'orbit')).toBe('km'); // Luna, where they agree
    expect(UNIT_QUANTITIES.orbit.autoRule).toBe('orbit-threshold');
    expect(UNIT_QUANTITIES.dimensions.autoRule).toBe('ladder');
  });

  it('labels: masses use the symbols the panels already speak; non-finite is dashed', () => {
    expect(unitIdLabel('M-Earth')).toBe('M⊕');
    expect(unitIdLabel('M-Jup')).toBe('M♃');
    expect(unitIdLabel('M-Sol')).toBe('M☉');
    expect(unitIdLabel('L-Sol')).toBe('L☉');
    expect(unitIdLabel('m3')).toBe('m³');
    expect(unitIdLabel('km3')).toBe('km³');
    expect(unitIdLabel('C')).toBe('°C');
    expect(unitIdLabel('K')).toBe('K');
    expect(formatSIInUnit(NaN, 'km', 'radius')).toBe('—');
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
    // A80: a construct's mass now defaults to the LADDER, not tonnes — a mega-construct at the t
    // stop is a twenty-digit number. Bodies keep their concrete stops.
    expect(defaultUnitFor('mass', 'construct')).toBe('auto');
    expect(defaultUnitFor('orbit', 'planet')).toBe('auto');
    expect(defaultUnitFor('dimensions', 'construct')).toBe('auto');
    expect(defaultUnitFor('volume', 'construct')).toBe('auto');
    expect(defaultUnitFor('power', 'construct')).toBe('auto');
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

// ——————————————————————————————————————————————————————————————————————————————————————————————
// A80 — the construct ladders. The report was one mega-construct card: `DRY MASS
// 100,000,000,000,000,010,0… t` overflowing its tile and `DIMENSIONS 300000000000 x … m`, which is
// 2 AU written in metres. TWO faults, and the second is the sneaky one — the trailing `…010` is
// kg→t float dust that `toLocaleString` printed as if it had been measured. A unit system owns
// BOTH: pick the unit AND the honest significant figures.

describe('A80 — the auto ladders read at human scale', () => {
  it('the Dyson Sphere card from the report reads sanely, in one call each', () => {
    // the mass the card actually showed: 1e20 t carrying the kg→t division's float dust
    const dysonKg = 1.0000000000000001e23;
    const mass = formatPref({}, 'mass', 'construct', dysonKg);
    expect(mass).toBe('0.01674 M⊕');
    // and the dust is GONE — no run of digits a double could not have carried
    expect(mass).not.toMatch(/\d{7}/);

    // 3e11 m of hull, handed in as km (SI), is 2 AU and now says so
    expect(formatPref({}, 'dimensions', 'construct', 3e11 / 1000)).toBe('2.005 AU');
  });

  it('a 46 m corvette still reads in metres and tonnes — the ladder must not inflate small craft', () => {
    expect(formatPref({}, 'dimensions', 'construct', 46 / 1000)).toBe('46 m');
    expect(formatPref({}, 'mass', 'construct', 500 * 1000)).toBe('500 t');
    // an authored four-digit tonnage stays exact through the ladder rather than rounded away
    expect(formatPref({}, 'mass', 'construct', 2547 * 1000)).toBe('2.547 kt');
    expect(formatPref({}, 'mass', 'construct', 50000 * 1000)).toBe('50 kt');
  });

  it('the tonnage ladder crosses the twelve-decade gap to M-Earth rather than printing 1e11 Gt', () => {
    expect(resolveAutoUnit('auto', 1e13, 'mass')).toBe('Gt');       // 10 Gt: a big station
    expect(resolveAutoUnit('auto', 1e23, 'mass')).toBe('M-Earth');  // over every tonnage stop
    expect(resolveAutoUnit('auto', 5e5, 'mass')).toBe('t');         // a corvette
    expect(resolveAutoUnit('auto', SOLAR_MASS_KG, 'mass')).toBe('M-Sol');
  });

  it('an auto walk stays METRIC — miles are the same magnitude as km and would win on arithmetic alone', () => {
    // 6,371 km is 3,959 mi, which sits NEARER 1,000; without the imperial guard the walk would
    // hand an unsuspecting metric GM miles.
    expect(resolveAutoUnit('auto', 6371, 'dimensions')).toBe('km');
    for (const q of ['mass', 'dimensions', 'volume', 'power'] as const) {
      for (const si of [1e-3, 1, 1e6, 1e13, 1e23, 1e30]) {
        expect(resolveAutoUnit('auto', si, q), `${q} @ ${si}`).not.toBe('mi');
      }
    }
  });

  it('volume and power ladders reach both ends of the construct range', () => {
    expect(formatPref({}, 'volume', 'construct', 500)).toBe('500 m³');           // a corvette's tanks
    expect(formatPref({}, 'volume', 'construct', 1e12)).toBe('1,000 km³');       // a mega-construct's
    expect(formatPref({}, 'power', 'construct', 25e6)).toBe('25 MW');            // a ship's surplus
    expect(formatPref({}, 'power', 'construct', 4e12)).toBe('4 TW');
    // 7.5% of the Sun's output — the scale a Dyson swarm's harvest lands on
    expect(formatPref({}, 'power', 'construct', 0.075 * SOLAR_LUMINOSITY_W)).toBe('0.075 L☉');
  });

  it('zero and rubbish never pick an absurd rung', () => {
    expect(formatPref({}, 'mass', 'construct', 0)).toBe('0 t');
    expect(formatPref({}, 'dimensions', 'construct', 0)).toBe('0 m');
    expect(formatPref({}, 'volume', 'construct', 0)).toBe('0 m³');
    expect(formatPref({}, 'power', 'construct', 0)).toBe('0 MW');
    expect(formatPref({}, 'mass', 'construct', NaN)).toBe('—');
    expect(formatPref({}, 'dimensions', 'construct', Infinity)).toBe('—');
  });

  it('every quantity offering an auto stop declares WHICH rule it uses', () => {
    for (const [q, spec] of Object.entries(UNIT_QUANTITIES)) {
      const hasAuto = (spec.stops as readonly string[]).includes('auto');
      expect(hasAuto === ('autoRule' in spec), q).toBe(true);
    }
  });
});

describe('A80 — significant figures live in the ONE formatter', () => {
  it('float dust is never printed as if it were measured', () => {
    // the exact fault: a kg→t division leaves 1.0000000000000001e20 and toLocaleString prints
    // "100,000,000,000,000,010,000". A pinned tonne stop must not do that either.
    expect(formatUnitNum('t', 1.0000000000000001e20)).toBe('1.00e+20');
    expect(formatUnitNum('Gt', 1.0000000000000001e11)).toBe('1.00e+11');
    // and the universal ceiling catches the stops with no ladder rule of their own
    expect(formatUnitNum('m', 3.0000000000000004e17)).toBe('3.00e+17');
    expect(formatUnitNum('km', 6371)).toBe('6,371'); // …while ordinary readings are untouched
  });

  it('an auto-chosen stop prints significant figures with the fixed-precision zeros trimmed', () => {
    expect(formatUnitNum('m', 46, undefined, true)).toBe('46');          // not "46.00"
    expect(formatUnitNum('km', 2.4, undefined, true)).toBe('2.4');       // not "2" — the 0-decimal km rule
    expect(formatUnitNum('AU', 2.00537, undefined, true)).toBe('2.005');
    expect(formatUnitNum('kt', 2.547, undefined, true)).toBe('2.547');   // four figures keep it exact
    // an explicit decimals from the caller still wins over the ladder's own choice
    expect(formatUnitNum('km', 2.4, 2, true)).toBe('2.40');
  });

  it('a pinned stop far off its own scale still says something rather than "0"', () => {
    // 25 MW pinned to GW used to be the "0.000 AU" fault in another dimension
    expect(formatUnitNum('GW', 0.025)).toBe('0.02500');
    expect(formatUnitNum('L-Sol', 7.9e-26)).toBe('7.90e-26');
  });
});

// ACCEPTANCE (4): the body panels must be UNCHANGED by all of the above. These are strings a GM
// reads on a body card today, pinned here so drift is CAUGHT rather than eyeballed.
describe('A80 — the body panels are untouched by the construct ladders', () => {
  it('renders the same body readings it rendered before the construct ladders existed', () => {
    expect(formatPref({}, 'radius', 'planet', EARTH_RADIUS_KM)).toBe('6,371 km');
    expect(formatPref({}, 'radius', 'star', SOLAR_RADIUS_KM)).toBe('696,340 km');
    expect(formatPref({}, 'mass', 'planet', EARTH_MASS_KG)).toBe('1.000 M⊕');
    expect(formatPref({}, 'mass', 'planet', JUPITER_MASS_KG)).toBe('317.8 M⊕');
    expect(formatPref({}, 'mass', 'star', SOLAR_MASS_KG)).toBe('1.000 M☉');
    expect(formatPref({}, 'temperature', 'star', 5778)).toBe('5,778 K');
    expect(formatPref({}, 'temperature', 'planet', 288.15)).toBe('15 °C');
    expect(formatPref({}, 'orbit', 'planet', AU_KM)).toBe('1.000 AU');
    expect(formatPref({}, 'speed', 'planet', 29.78)).toBe('29.8 km/s');
  });

  it('leaves the stops a body actually cycles through alone', () => {
    expect([...UNIT_QUANTITIES.radius.stops]).toEqual(['km', 'mi']);
    expect([...UNIT_QUANTITIES.temperature.stops]).toEqual(['K', 'C', 'F']);
    expect([...UNIT_QUANTITIES.speed.stops]).toEqual(['km/s', 'mi/s']);
    expect([...UNIT_QUANTITIES.distance.stops]).toEqual(['km', 'mi', 'AU', 'ly', 'pc']);
  });
});
