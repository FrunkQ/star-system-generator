// Real-sky import — planet-building helpers shared by the build kit and the
// in-app importer: mass-radius estimation for radial-velocity planets (no
// measured radius), bulk-makeup defaults SystemProcessor derives density from,
// and the catalogue-facts description line.

import { hash01, round } from './positions.mjs';

// Chen & Kipping (2017)-style mass-radius estimate for planets without a
// measured radius (radial-velocity discoveries). Earth units in, Earth radii out.
export function estimateRadiusRe(massMe) {
  if (massMe < 2.04) return 1.008 * massMe ** 0.279;
  if (massMe < 131.6) return Math.min(0.808 * massMe ** 0.589, 12);
  return 12; // giants: ~Jupiter-sized regardless of mass
}

// The same relation read the other way: Earth radii in, Earth masses out. Used ONLY when the
// catalogue has a measured radius and no mass (see `planetMassFromRow`). Each branch is the exact
// inverse of the one above, so a mass estimated here reproduces its radius through
// `estimateRadiusRe` (to 0.1% at the join, where the two published branches do not quite meet). PAST THE PLATEAU THE RELATION CANNOT BE INVERTED - every giant is about
// Jupiter-sized whatever it weighs - so a giant-sized radius answers with the mass at which the
// plateau begins (about Saturn's), the LIGHTEST mass that explains the size.
const MR_BREAK_RE = 1.008 * 2.04 ** 0.279;
const MR_PLATEAU_RE = 12;
export function estimateMassMe(radiusRe) {
  if (!(radiusRe > 0)) return null;
  if (radiusRe < MR_BREAK_RE) return (radiusRe / 1.008) ** (1 / 0.279);
  return (Math.min(radiusRe, MR_PLATEAU_RE) / 0.808) ** (1 / 0.589);
}

// WHAT A ROW'S MASS FIGURE ACTUALLY IS, decided once (the Kepler-32 f report, 2026-09-24).
//
// `pl_bmasse` is the archive's "best mass", and `pl_bmasselim` says whether it is a VALUE or a
// LIMIT: 1 is an UPPER limit ("lighter than this"), which is all a transit-timing or stability
// study can say about a small planet. Kepler-32 f is 0.82 Earth radii and its only published mass
// is "< 969 Earth masses" - three Jupiters. Read as a value, a sub-Earth imported as a
// super-Jupiter the size of Venus.
//
// So an upper limit is never used as the mass while anything better exists:
//  - with an independently MEASURED radius, the mass is estimated from that radius by the same
//    relation the importer already trusts in the other direction, and never above the limit;
//  - with no such radius there is nothing else to go on, so the limit stays as the figure and the
//    description says it is a ceiling (the planet is confirmed; dropping it would be worse).
// The archive's density for such a row was computed FROM the limit, so it is not evidence either
// and `densityGcc` comes back null.
//
// Rows from the committed cache and the bundled snapshot predate the column and carry no flag;
// an absent flag reads as "a value", which is what every one of them was already treated as.
export const MASS_SOURCE = { VALUE: 'value', FROM_RADIUS: 'from-radius', UPPER_LIMIT: 'upper-limit' };
export function planetMassFromRow(row) {
  const quoted = row.pl_bmasse;
  if (quoted == null) return { massMe: null, source: MASS_SOURCE.VALUE, densityGcc: row.pl_dens ?? null };
  if (Number(row.pl_bmasselim) !== 1) return { massMe: quoted, source: MASS_SOURCE.VALUE, densityGcc: row.pl_dens ?? null };
  const fromRadius = radiusIsBackFilled(quoted, row.pl_rade) ? null : estimateMassMe(row.pl_rade);
  if (fromRadius == null) return { massMe: quoted, source: MASS_SOURCE.UPPER_LIMIT, limitMe: quoted, densityGcc: null };
  return { massMe: Math.min(fromRadius, quoted), source: MASS_SOURCE.FROM_RADIUS, limitMe: quoted, densityGcc: null };
}

// Above this mass a planet is an ENVELOPE, whatever its bulk density says.
// Owner, 2026-08-12: "planets that large are more likely to be gas giants than
// terrestrial — even a super-Earth is smaller than 4 M⊕ — so just a gas giant
// profile, any in the range". So mass alone decides here, and it decides ONCE:
// there is no second, heavier threshold below which a giant could still be read
// as rock. That is what makes D17 structurally impossible rather than guarded
// against — the density is simply never consulted for a giant.
const TERRESTRIAL_MASS_CEILING_ME = 4;

// And above THIS mass nothing can make a body rocky, not even a measured
// density: a super-Jupiter is dense because it is compressed (D17, DATA-R7).
const GIANT_MASS_ME = 40;

// The envelope fractions the app ALREADY uses for a giant with nothing declared,
// and this range is deliberately not a new model: `makeupFractions` infers
// {gas: 0.80, ice: 0.20} for any body over 8 M⊕ below 2.5 g/cc, and
// `generateBodyOfType` falls back to {gas: 0.92, ice: 0.08} for a generated
// giant. Those are the two answers already in the engine, so an imported giant
// is drawn BETWEEN them rather than being given a third one.
const GIANT_GAS_MIN = 0.80;
const GIANT_GAS_MAX = 0.92;
const GIANT_ROCK = 0.05;

// Bulk makeup from the catalogue's mass — and from its density only where the
// density means something.
//
// WHY MASS ALONE ABOVE THE CEILING, AND WHY THIS DISSOLVES D7 RATHER THAN
// PATCHING IT: pscomppars BACK-FILLS `pl_rade` from `pl_bmasse` for three
// quarters of its rows, then computes `pl_dens` from that pair (DATA-R7). So for
// most planets the density is a re-encoding of the mass and carries no
// independent information — which is why every 4–40 M⊕ planet used to come out
// at exactly 55% ice, and why the map could not express any other answer. Not
// consulting a circular number is the fix; there is nothing to weigh it against.
//
// The variation is DETERMINISTIC, seeded on the body's own id with the same
// `hash01` that already fixes its orbital elements — so a re-import reproduces
// the same worlds (DATA-R2), and a starmap of imported giants varies the way a
// generated one does instead of repeating one figure down the whole map.
// Did the catalogue MEASURE this radius, or compute it from the mass? pscomppars
// back-fills `pl_rade` with essentially the Chen-Kipping relation `estimateRadiusRe`
// implements above, so a row whose radius reproduces that estimate is telling us
// the mass a second time. 135 of the 182 rows in the committed cache match it to
// within 1%, most to within 0.3% — this is a measurement, not a guess (DATA-R7).
export function radiusIsBackFilled(massMe, radiusRe) {
  if (massMe == null || radiusRe == null) return true;   // nothing measured to trust
  const est = estimateRadiusRe(massMe);
  return est > 0 && Math.abs(radiusRe - est) / est < 0.01;
}

export function defaultMakeup(massMe, densityGcc, seed, radiusRe) {
  // A MEASURED density outranks the mass rule — but only a measured one, and
  // only below the giant threshold.
  //
  // WHY IT WINS: three rows in the catalogue are 4-40 M⊕ with a genuinely
  // measured radius and a density over 4 g/cc (HD 219134 b and c, and 55 Cancri
  // e, a well-characterised lava world). Calling those gas giants would discard
  // real evidence in favour of a rule of thumb, and the rule of thumb exists
  // only BECAUSE the usual density is circular.
  //
  // WHY IT STOPS AT THE GIANT THRESHOLD, which is D17 and cost this exception a
  // regression before the tests caught it: eps Ind A b has a measured radius too
  // (12.7 R⊕ against the estimator's 12) and a real 5.54 g/cc, so "measured and
  // dense" is TRUE for it — and it is a 6.5 Jupiter-mass super-Jupiter. Past the
  // threshold a high density means hydrogen squeezed by self-gravity, never rock
  // (DATA-R7), so no evidence about density can make a giant rocky.
  const rockyByMeasurement = massMe < GIANT_MASS_ME
    && densityGcc != null && densityGcc > 4
    && !radiusIsBackFilled(massMe, radiusRe);
  if (massMe >= TERRESTRIAL_MASS_CEILING_ME && !rockyByMeasurement) {
    const gas = round(GIANT_GAS_MIN + hash01(`${seed ?? ''}|makeup`) * (GIANT_GAS_MAX - GIANT_GAS_MIN), 2);
    return { gas, ice: round(1 - gas - GIANT_ROCK, 2), rock: GIANT_ROCK };
  }
  if (densityGcc != null && densityGcc > 4) return { rock: 0.62, metal: 0.33, ice: 0.05 };
  return { rock: 0.65, metal: 0.30, ice: 0.05 };
}

// Compose the honest catalogue-facts description for a pscomppars row, unless
// a curated override supplies its own prose. msini masses are always labelled
// "minimum mass" (a published value can still lie by omission — see the
// standing rule on what a quantity measures).
export function planetDescription(row, override) {
  if (override?.desc) return override.desc;
  const bits = [];
  const method = (row.discoverymethod ?? '').replace('Radial Velocity', 'radial velocity').replace('Transit', 'transit').replace('Imaging', 'direct imaging').replace('Astrometry', 'astrometry');
  bits.push(`Confirmed ${row.disc_year ?? ''} (${method}).`.replace('  ', ' '));
  if (row.pl_bmasse != null) {
    const isMsini = /msini/i.test(row.pl_bmassprov ?? '');
    const massText = (m) => (m >= 100 ? `${round(m / 317.8, 2)} Jupiter masses` : `${round(m, 2)} Earth masses`);
    const mass = planetMassFromRow(row);
    if (mass.source === MASS_SOURCE.FROM_RADIUS) {
      bits.push(`Mass NOT MEASURED: the archive gives only an upper limit (under ${massText(mass.limitMe)}), so the ${massText(mass.massMe)} here is estimated from its measured radius.`);
    } else if (mass.source === MASS_SOURCE.UPPER_LIMIT) {
      bits.push(`Mass no more than ${massText(mass.limitMe)}: an UPPER LIMIT, used here as the figure because nothing else about its mass or size is measured.`);
    } else {
      bits.push(isMsini ? `Minimum mass ${massText(row.pl_bmasse)}.` : `Mass ${massText(row.pl_bmasse)}.`);
    }
  }
  if (row.pl_rade != null) bits.push(`Measured radius ${round(row.pl_rade, 2)} Earth radii.`);
  if (row.pl_orbper != null) bits.push(`Orbital period ${row.pl_orbper < 100 ? round(row.pl_orbper, 1) + ' days' : round(row.pl_orbper / 365.25, 1) + ' years'}.`);
  return bits.join(' ');
}
