// Real-sky import — turning a raw stellar cone into SYSTEMS (D18).
//
// "This is a STARMAP importer — clue is in the name. The planets are just a nice add-on." (owner,
// 2026-08-07.) The importer used to select from the NASA Exoplanet Archive, so a star with no
// confirmed planet was never in the result set: no Sol, no Alpha Centauri A or B. Stars are the
// primary object now, and this module is the step between "rows from a star catalogue" and "systems
// on a map".
//
// A raw cone is NOT a census, and the two things wrong with it are both measured, not assumed
// (SIMBAD, everything within 16.5 ly, 2026-08-13):
//
//  1. IT CONTAINS CONTAINERS AS WELL AS STARS. SIMBAD returns a multiple-star SYSTEM entry and its
//     COMPONENTS, inconsistently: Alpha Centauri comes back as three rows ("* alf Cen", "* alf Cen A",
//     "* alf Cen B") where only two are stars, and Kruger 60 and G 272-61 do the same — while Luhman
//     16 and Ross 614 come back as a container only, with no component rows at all. Keeping every row
//     invents phantom stars; dropping every container loses the ones that are the only record of
//     their system. Rule: drop a container ONLY when its components are present.
//
//  2. ITS 3D POSITIONS CANNOT BE SUBTRACTED. Two stars in one system have independently measured
//     parallaxes, and differencing them turns a small measurement error into a huge fake separation.
//     Sirius A and B differ by 1.2% in parallax, which at 8.6 ly fabricates 6,856 AU of separation
//     for a pair genuinely about 20 AU apart; eps Ind and its brown-dwarf pair read 11,698 AU against
//     a true ~1,460. PROJECTED separation — angular separation times the mean distance — cancels the
//     parallax error and recovers both (16 AU and 1,475 AU). Never difference two parallax positions
//     to decide whether stars are companions.
//
// WHAT DECIDES A SYSTEM: the rule the engine ALREADY has, not a new one. `clusterGate.mjs` defines
// the period tiers, and the owner's instruction was to use them and keep them parametrised: bodies
// whose MUTUAL ORBITAL PERIOD is short enough to matter gravitationally share a system;
// longer-period pairs are separate map nodes. `ORBIT_AUTHOR_MAX_PERIOD_YR` (1 Myr) is that line —
// the same constant that makes Sgr A*'s S-stars a single system rather than a starmap.
//
// THE CALIBRATION IS NOT ASSERTED, IT IS CHECKED: with projected separation and the 1 Myr tier, the
// 16.5 ly cone reproduces the hand-curated bundled map's groupings — Alpha Cen A+B (84 yr), Sirius
// A+B, 61 Cygni, Struve 2398, Groombridge 34, Kruger 60, 40 Eridani — and **Proxima joins Alpha
// Centauri at 0.977 Myr**, just inside the tier, exactly as a human placed it. Nothing was tuned to
// make that happen.
import { periodYr, ORBIT_AUTHOR_MAX_PERIOD_YR } from './clusterGate.mjs';
import { AU_PER_LY, LY_PER_PC, SOLAR_MASS_KG } from './constants.mjs';

// SIMBAD object types that are a MULTIPLE-STAR CONTAINER rather than a star.
const CONTAINER_OTYPES = /^(\*\*|SB\*)$/;

// Object types that are not stellar at all. SIMBAD's `otype` occasionally mislabels — 40 Eridani b,
// a planet, comes back as 'err' — so the planet exclusion is belt-and-braces: the ADQL excludes
// 'Pl'/'Pl?' and this drops anything whose identifier ends in a lowercase planet letter.
const PLANET_OTYPES = /^Pl\??$/;
const PLANET_NAME = /\s[a-z]$/;

/** Distance in light years from a parallax in milliarcseconds. */
export const distanceLyFromParallax = (plxMas) => (1000 / plxMas) * LY_PER_PC;

/** Angular separation of two {ra, dec} in degrees, in RADIANS. */
export function angularSepRad(a, b) {
  const r = Math.PI / 180;
  const d1 = a.dec * r, d2 = b.dec * r;
  const cos = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos((a.ra - b.ra) * r);
  return Math.acos(Math.max(-1, Math.min(1, cos)));
}

/**
 * PROJECTED separation in AU — angular separation times the mean distance.
 *
 * This is the one that works. See the note at the top: differencing two parallax-derived positions
 * is dominated by parallax error for exactly the pairs we are trying to identify.
 */
export function projectedSeparationAu(a, b) {
  const dLy = (distanceLyFromParallax(a.plxMas) + distanceLyFromParallax(b.plxMas)) / 2;
  return angularSepRad(a, b) * dLy * AU_PER_LY;
}

/**
 * Are these two stars the same physical object seen twice? Position and type, not name — SIMBAD
 * identifiers for one star vary between catalogues and change over time, so a name match is both
 * fragile and prone to false positives ("HD 239960" vs "HD 239960A" are different stars).
 */
export function isSameObject(a, b, { maxSepAu = 1, maxParallaxFrac = 0.02 } = {}) {
  if (projectedSeparationAu(a, b) > maxSepAu) return false;
  const p = (a.plxMas + b.plxMas) / 2;
  return Math.abs(a.plxMas - b.plxMas) / p <= maxParallaxFrac;
}

/**
 * Drop the rows that are not stars: planets that leaked past the query, exact duplicates, and
 * multiple-star CONTAINERS whose components are also present.
 *
 * Returns { stars, dropped } — `dropped` names each row and why, because a census that silently
 * discards rows is indistinguishable from one that failed to fetch them (DATA-R4's habit).
 */
export function normaliseStarRows(rows, { resolutionFloorAu = 20000 } = {}) {
  const dropped = [];
  const withPos = rows.filter((r) => {
    if (r.plxMas > 0 && Number.isFinite(r.ra) && Number.isFinite(r.dec)) return true;
    dropped.push({ id: r.id, reason: 'no usable astrometry' });
    return false;
  });

  const notPlanets = withPos.filter((r) => {
    if (PLANET_OTYPES.test(r.otype ?? '') || PLANET_NAME.test(r.id ?? '')) {
      dropped.push({ id: r.id, reason: `not a star (type ${r.otype})` });
      return false;
    }
    return true;
  });

  // Exact duplicates — same object under two identifiers.
  const unique = [];
  for (const r of notPlanets) {
    const twin = unique.find((u) => isSameObject(u, r));
    if (twin) { dropped.push({ id: r.id, reason: `duplicate of ${twin.id}` }); continue; }
    unique.push(r);
  }

  // Containers, once we know which components survived.
  const stars = unique.filter((r) => {
    if (!CONTAINER_OTYPES.test(r.otype ?? '')) return true;
    const comps = unique.filter((o) => o !== r && !CONTAINER_OTYPES.test(o.otype ?? '')
      && projectedSeparationAu(o, r) < resolutionFloorAu);
    if (comps.length) {
      dropped.push({ id: r.id, reason: `multiple-star container; components present (${comps.map((c) => c.id).join(', ')})` });
      return false;
    }
    return true;   // the only record of its system — keep it
  });

  return { stars, dropped };
}

/**
 * Group stars into SYSTEMS by mutual orbital period, using the engine's existing tier.
 *
 * `maxPeriodYr` is the parameter: two stars share a system when they would orbit each other in less
 * than this. Defaults to `ORBIT_AUTHOR_MAX_PERIOD_YR`, which is also what decides whether an orbit
 * is worth authoring at all — one line, one meaning.
 */
export function groupIntoSystems(stars, { maxPeriodYr = ORBIT_AUTHOR_MAX_PERIOD_YR } = {}) {
  const parent = stars.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));

  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const aAu = projectedSeparationAu(stars[i], stars[j]);
      // Cheap reject before the sqrt: nothing this far apart orbits in under a Myr at stellar mass.
      if (aAu > 5e5) continue;
      const totalKg = ((stars[i].massMsun ?? 0.4) + (stars[j].massMsun ?? 0.4)) * SOLAR_MASS_KG;
      if (periodYr(aAu, totalKg) <= maxPeriodYr) parent[find(i)] = find(j);
    }
  }

  const byRoot = new Map();
  stars.forEach((s, i) => {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(s);
  });
  // Heaviest first within each group: the primary leads, which is what names the system and what
  // the barycentre split keys off.
  return [...byRoot.values()].map((g) => g.slice().sort((a, b) => (b.massMsun ?? 0) - (a.massMsun ?? 0)));
}
