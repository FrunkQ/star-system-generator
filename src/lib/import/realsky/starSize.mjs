// DERIVING A STAR'S SIZE FROM WHAT A CATALOGUE ACTUALLY MEASURES (D29, stream U).
//
// THE FAULT THIS EXISTS TO FIX: every real star imported from the stellar census carried its class
// BAND MIDPOINT as its mass, radius and temperature. Sirius B came in at 1.000 Msun because that is
// the middle of the white-dwarf band, Proxima at 0.400 Rsun against a true 0.154. The owner's report
// was "the importer still not adding the radii or masses for real stars", and he was right.
//
// AND THE OBVIOUS FIX DOES NOT EXIST. The brief asked for "the mass/radius/temperature columns
// SIMBAD exposes". MEASURED 2026-09-08 against TAP_SCHEMA: SIMBAD's `basic` table HAS NO SUCH
// COLUMNS, and SIMBAD carries no stellar mass anywhere at all. Gaia DR3 would have them and is a
// dead end for this region - the nearby stars are too bright for it and Sirius is absent outright.
// So a size is DERIVED here, from quantities that ARE measured, or it is not claimed.
//
// WHAT IS MEASURED, over the 74 stars of the Local Neighbourhood census (`skyFixtures.ts`):
//   parallax        74/74   `basic.plx_value`
//   temperature     64/74   `mesFe_h.teff`        - a direct measurement, used as one
//   surface gravity 62/74   `mesFe_h.log_g`       - MEASURED AND DELIBERATELY NOT USED, see below
//   K magnitude     63/74   `allfluxes.K`
//   V magnitude     59/74   `allfluxes.V`
//   diameter        10/74   `mesDiameter`         - the only direct radius there is
//
// THE SHAPE IS A TABLE OF RELATIONS, EACH WITH A DECLARED DOMAIN, AND NOT ONE FORMULA. That is not
// tidiness: a single relation applied everywhere is exactly how this goes wrong. Flower's
// bolometric correction recovers Sirius A to 1.740 Rsun against a true 1.711, and hands Proxima
// 0.887 Rsun against a true 0.154 - four hundred and seventy-six per cent out, and confidently so.
// Every relation below therefore states where it is allowed to answer, and OUTSIDE ALL OF THEM THE
// CLASS BAND STAYS, flagged as typical. A band midpoint that says it is a band midpoint is honest;
// a derived figure outside its calibration is not.
//
// WHY `log_g` IS FETCHED AND NOT USED FOR MASS. M = gR^2/G is exact and the temptation is obvious.
// Measured against the truth set in `starSize.spec.ts` it is the worst of the three options:
// Procyon +70%, eps Ind -40%, eps Eri -36%, against a class band that is consistently within about
// 15%. The error is not in the algebra - it is that a spectroscopic log g carries ~0.1-0.2 dex of
// scatter and R^2 multiplies whatever the radius got wrong. The mass-luminosity relation, on the
// same stars, gives Procyon +6.8% and alf Cen A +2.7%. So log_g is carried for provenance and
// diagnostics and the mass comes from luminosity. An ASTEROSEISMIC log g would flip that judgement.
//
// DEGENERATE AND SUBSTELLAR OBJECTS ARE EXCLUDED FROM EVERY RELATION HERE, and that is a physics
// decision rather than caution. A white dwarf is supported by electron degeneracy and sits nowhere
// near any main-sequence relation - Sirius B comes out 99% wrong through Flower. A brown dwarf's
// radius is set by degeneracy too, which is why DATA-R24 records that the identical 80,006 km on
// every L, T and Y dwarf is HONEST rather than a bug. Both keep their bands, which are right.
//
// PLAIN ESM, NO IMPORTS BEYOND `constants.mjs` - DATA-R5. The build kit runs this under bare node.
import { SOLAR_RADIUS_KM, SOLAR_MASS_KG, SOLAR_TEMPERATURE_K, AU_KM } from './constants.mjs';

/** The Sun's absolute bolometric magnitude - IAU 2015 Resolution B2. */
export const SOLAR_BOLOMETRIC_MAGNITUDE = 4.74;

// ---------------------------------------------------------------- the relations, as DATA
//
// BOLOMETRIC CORRECTION IN V, as a polynomial in log10(Teff): Flower (1996) with the corrected
// coefficients from Torres (2010) Table 1, which is the standard form. The published validity is
// 3.5 <= log10(Teff) <= 4.7, and that bound IS the domain below - outside it the polynomial does
// not degrade gracefully, it diverges.
export const BOLOMETRIC_CORRECTION_V = {
  minTeffK: 3162, // 10^3.5
  maxTeffK: 50119, // 10^4.7
  branches: [
    { maxLogTeff: 3.7, c: [-0.190537291496456e5, 0.155144866764412e5, -0.421278819301717e4, 0.381476328422343e3] },
    { maxLogTeff: 3.9, c: [-0.370510203809015e5, 0.385672629965804e5, -0.150651486316025e5, 0.261724637119416e4, -0.170623810323864e3] },
    { maxLogTeff: Infinity, c: [-0.118115450538963e6, 0.137145973583929e6, -0.636233812100225e5, 0.147412923562646e5, -0.170587278406872e4, 0.788731721804990e2] }
  ]
};

// THE COOL-DWARF RELATIONS, in absolute K magnitude: Mann et al. (2015) for radius and Mann et al.
// (2019) for mass. K band because a cool dwarf emits most of its light there and the bolometric
// correction is nearly flat across the M sequence - which is precisely why the V-band route fails on
// exactly these stars. Published domain 4.6 < M_K < 9.8; widened to 10.5 here so the very latest M
// dwarfs in the local sample are covered rather than dropped to a band, and no further.
export const COOL_DWARF_RELATION = {
  minAbsK: 4.6,
  maxAbsK: 10.5,
  radius: [1.9515, -0.352, 0.0168], // R/Rsun, in powers of M_K
  massLog10: [-0.642, -0.208, -8.43e-4, 7.87e-3, 1.42e-4, -2.13e-4], // log10(M/Msun), in powers of (M_K - pivot)
  massPivot: 7.5
};

// MASS FROM LUMINOSITY, main sequence only. The classic piecewise mass-luminosity relation; the
// branch is chosen by the mass it produces, so no piece is applied outside its own range.
// GIANTS ARE EXCLUDED AT THE CALL SITE and that is not optional: Arcturus is 224 Lsun and 1.08 Msun,
// and this relation would call it 4.2 - a giant is bright because it is HUGE, not because it is heavy.
export const MASS_LUMINOSITY = [
  { maxMassMsun: 0.43, coefficient: 0.23, exponent: 2.3 },
  { maxMassMsun: 2.0, coefficient: 1.0, exponent: 4.0 },
  { maxMassMsun: Infinity, coefficient: 1.4, exponent: 3.5 }
];

// ---------------------------------------------------------------- the primitives

/** Absolute magnitude from an apparent magnitude and a parallax in milliarcseconds. */
export function absoluteMagnitude(apparentMag, plxMas) {
  if (!Number.isFinite(apparentMag) || !(plxMas > 0)) return null;
  return apparentMag + 5 * Math.log10(plxMas / 100);
}

/** Bolometric correction in V. Returns null OUTSIDE the published domain rather than a wrong number. */
export function bolometricCorrectionV(teffK) {
  if (!(teffK >= BOLOMETRIC_CORRECTION_V.minTeffK) || !(teffK <= BOLOMETRIC_CORRECTION_V.maxTeffK)) return null;
  const logT = Math.log10(teffK);
  const branch = BOLOMETRIC_CORRECTION_V.branches.find((b) => logT < b.maxLogTeff);
  return branch.c.reduce((sum, k, i) => sum + k * logT ** i, 0);
}

/**
 * THE INVERSE OF THE LUMINOSITY LAW: how big must a body be to emit this much at this temperature.
 *
 * L/Lsun = (R/Rsun)^2 (T/Tsun)^4, solved for R. It is the same relation `luminositySolarFrom` in
 * `stars.mjs` writes forwards, against the same SOLAR_TEMPERATURE_K, and `starSize.spec.ts` pins the
 * two as a round trip so neither can drift. See PHY-34: the engine's own copy of this law lives in
 * `physics/luminosity.ts`, which this file may not import (DATA-R5 - the build kit runs it under
 * bare node), so the constant is shared through `constants.mjs` and the equivalence is gated instead.
 */
export function radiusRsunFromLT(luminositySolar, teffK) {
  if (!(luminositySolar > 0) || !(teffK > 0)) return null;
  return Math.sqrt(luminositySolar) / (teffK / SOLAR_TEMPERATURE_K) ** 2;
}

/** Solar luminosities from an absolute bolometric magnitude. */
export const luminositySolarFromBolometric = (mBol) => 10 ** ((SOLAR_BOLOMETRIC_MAGNITUDE - mBol) / 2.5);

/** Main-sequence mass from luminosity, picking the branch that owns the answer. */
export function massMsunFromLuminosity(luminositySolar) {
  if (!(luminositySolar > 0)) return null;
  for (const branch of MASS_LUMINOSITY) {
    const m = (luminositySolar / branch.coefficient) ** (1 / branch.exponent);
    if (m <= branch.maxMassMsun) return m;
  }
  const last = MASS_LUMINOSITY[MASS_LUMINOSITY.length - 1];
  return (luminositySolar / last.coefficient) ** (1 / last.exponent);
}

/**
 * A DIRECT diameter, in whichever of SIMBAD's two units this row happens to carry.
 *
 * `mesDiameter.unit` holds 'mas' OR 'km' PER ROW - HD 95735 carries one of each - so the unit is
 * never assumed. An angular diameter of D mas at a parallax of P mas subtends D/P AU across, which
 * is the parallax definition and needs no distance conversion of its own.
 */
export function radiusRsunFromDiameter(diameter, plxMas) {
  if (!diameter || !(diameter.value > 0)) return null;
  if (diameter.unit === 'km') return diameter.value / 2 / SOLAR_RADIUS_KM;
  if (diameter.unit !== 'mas' || !(plxMas > 0)) return null;
  return ((diameter.value / plxMas) * AU_KM) / 2 / SOLAR_RADIUS_KM;
}

// ---------------------------------------------------------------- the decision

/** Provenance of one published figure. `typical` means the caller must use its class band. */
export const FIGURE_SOURCE = Object.freeze({
  MEASURED: 'measured', // the catalogue states this quantity for this object
  DERIVED: 'derived', // computed from other measured quantities of this object
  TYPICAL: 'typical' // the rule pack's band for its class - nothing about THIS object
});

/**
 * What can honestly be said about this star's size.
 *
 * `measurements` are the catalogue's own numbers ({ teffK, plxMas, magV, magK, logG, diameter });
 * `luminosityClass` is the parsed MK class ('V', 'III', 'I'), and `degenerate` / `substellar` mark
 * the objects every relation here refuses. Returns ONLY the figures it can stand behind - the caller
 * fills the rest from the class band and marks them TYPICAL.
 */
export function deriveStarSize(measurements = {}, { luminosityClass = null, degenerate = false, substellar = false } = {}) {
  const { teffK = null, plxMas = null, magV = null, magK = null, diameter = null } = measurements;
  const out = { provenance: {}, relations: [] };

  // TEMPERATURE - the one figure a catalogue simply states.
  const teff = Number.isFinite(teffK) && teffK > 0 ? teffK : null;
  if (teff) {
    out.temperatureK = Math.round(teff);
    out.provenance.temperatureK = FIGURE_SOURCE.MEASURED;
    out.relations.push('temperature: measured (SIMBAD mesFe_h)');
  }

  // A direct diameter outranks everything, for any object - it is the only measured radius there is,
  // and it is as true of a white dwarf as of a supergiant.
  const rDirect = radiusRsunFromDiameter(diameter, plxMas);
  if (rDirect > 0) {
    out.radiusRsun = rDirect;
    out.provenance.radiusKm = FIGURE_SOURCE.MEASURED;
    out.relations.push(`radius: measured (SIMBAD mesDiameter, ${diameter.unit})`);
  }

  // Degeneracy sets the size of white dwarfs and brown dwarfs, so no relation below may speak for
  // them. Their bands are right (DATA-R24) and a derived figure would be worse than the band.
  if (degenerate || substellar) return out;

  const isDwarf = luminosityClass == null || luminosityClass === 'V';
  const absK = absoluteMagnitude(magK, plxMas);

  // COOL DWARFS FIRST, in K. They are most of the sky, and they are exactly where the V route fails.
  if (isDwarf && absK != null && absK > COOL_DWARF_RELATION.minAbsK && absK < COOL_DWARF_RELATION.maxAbsK) {
    const r = COOL_DWARF_RELATION.radius.reduce((s, a, i) => s + a * absK ** i, 0);
    const m = 10 ** COOL_DWARF_RELATION.massLog10.reduce((s, a, i) => s + a * (absK - COOL_DWARF_RELATION.massPivot) ** i, 0);
    if (r > 0 && out.radiusRsun == null) {
      out.radiusRsun = r;
      out.provenance.radiusKm = FIGURE_SOURCE.DERIVED;
      out.relations.push('radius: derived from the absolute K magnitude (cool-dwarf relation)');
    }
    if (m > 0) {
      out.massMsun = m;
      out.provenance.massKg = FIGURE_SOURCE.DERIVED;
      out.relations.push('mass: derived from the absolute K magnitude (cool-dwarf relation)');
    }
    return out;
  }

  // EVERYTHING ELSE: luminosity from V and the parallax, then the size that emits it.
  const bc = bolometricCorrectionV(teff);
  const absV = absoluteMagnitude(magV, plxMas);
  if (bc == null || absV == null) return out;
  const luminositySolar = luminositySolarFromBolometric(absV + bc);
  if (!(luminositySolar > 0)) return out;
  out.luminositySolar = luminositySolar;
  out.provenance.radiationOutput = FIGURE_SOURCE.DERIVED;
  out.relations.push('luminosity: derived from the V magnitude, the parallax and a bolometric correction');

  if (out.radiusRsun == null) {
    const r = radiusRsunFromLT(luminositySolar, teff);
    if (r > 0) {
      out.radiusRsun = r;
      out.provenance.radiusKm = FIGURE_SOURCE.DERIVED;
      out.relations.push('radius: derived from the luminosity and the temperature');
    }
  }

  // Mass from luminosity - MAIN SEQUENCE ONLY. A giant is bright because it is huge.
  if (isDwarf) {
    const m = massMsunFromLuminosity(luminositySolar);
    if (m > 0) {
      out.massMsun = m;
      out.provenance.massKg = FIGURE_SOURCE.DERIVED;
      out.relations.push('mass: derived from the luminosity (mass-luminosity relation)');
    }
  }
  return out;
}

/** Convenience for callers that want engine units. */
export const solarRadiiToKm = (rSun) => rSun * SOLAR_RADIUS_KM;
export const solarMassesToKg = (mSun) => mSun * SOLAR_MASS_KG;
