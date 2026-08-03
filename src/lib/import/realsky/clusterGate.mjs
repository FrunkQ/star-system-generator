// Real-sky import — the cluster gate (design doc §5c).
//
// Decides, mass-aware, whether a region should import as a starmap or be
// OFFERED as a single SSE system with stars as orbiting bodies. Density is
// only a cheap pre-fetch tripwire; the decision is the region's dynamical
// time, because mass — not separation — sets the behaviour: two red dwarfs
// 0.25 ly apart orbit in ~a million years (a starmap is honest), while S2
// sits 970 AU from Sgr A* and completes an orbit in 16 years (a system).
//
// Orbital STRUCTURE follows the three period tiers: watchable (the offer),
// author-the-orbit (an ellipse costs nothing up to ~1 Myr), static beyond —
// where a Keplerian ellipse would be false precision, not honesty.

import { AU_PER_LY, G, SECONDS_PER_YEAR, SOLAR_MASS_KG, AU_KM } from './constants.mjs';

// Thresholds, all first guesses recorded in the design doc and configurable
// by callers; the constants are the single source for both the gate and the
// UI copy that quotes them.
export const WATCHABLE_TDYN_YR = 10_000;      // offer "watch them move" below this
export const ORBIT_AUTHOR_MAX_PERIOD_YR = 1_000_000; // author an ellipse below this
export const DENSITY_TRIPWIRE_LY = 0.25;      // mean separation → "worth checking"
export const RESOLUTION_FLOOR_LY = 0.1;       // closer than this cannot be two map nodes

// SIMBAD otypes that fire the identity tripwire (clusters and black holes).
const CLUSTER_OTYPES = /^(GlC|OpC|Cl\*|BH\??\*?)$/i;

export const meanSeparationLy = (nStars, radiusLy) => {
  if (!(nStars > 0)) return Infinity;
  return Math.cbrt(((4 / 3) * Math.PI * radiusLy ** 3) / nStars);
};

// Characteristic orbital period at scale aAU around massKg: 2π√(a³/GM), years.
export function periodYr(aAU, massKg) {
  const aM = aAU * AU_KM * 1000;
  return (2 * Math.PI * Math.sqrt(aM ** 3 / (G * massKg))) / SECONDS_PER_YEAR;
}

// The region's dynamical time: the characteristic period at its radius for
// its enclosed mass.
export const dynamicalTimeYr = (radiusLy, massKgEnclosed) =>
  periodYr(radiusLy * AU_PER_LY, massKgEnclosed);

export function periodTier(pYr) {
  if (pYr <= WATCHABLE_TDYN_YR) return 'watchable';
  if (pYr <= ORBIT_AUTHOR_MAX_PERIOD_YR) return 'author-orbit';
  return 'static';
}

// Stage 1 — pre-fetch tripwire, from the COUNT query + resolved centre only.
// Decides whether to EVALUATE, never what to offer (masses are unknown here).
export function tripwire({ nStars, radiusLy, centreOtype = null }) {
  if (centreOtype && CLUSTER_OTYPES.test(centreOtype.trim())) {
    return { fired: true, reason: 'identity', detail: `centre object type ${centreOtype.trim()}` };
  }
  const sepLy = meanSeparationLy(nStars, radiusLy);
  if (sepLy <= DENSITY_TRIPWIRE_LY) {
    return { fired: true, reason: 'density', detail: `mean separation ${sepLy.toFixed(3)} ly` };
  }
  return { fired: false, reason: null, detail: null };
}

// Stage 2 — the real decision, once the preview fetch has masses. Returns the
// offer plus the numbers the UI quotes ("typical orbital period here is X").
//   'system'          — dynamical time in the watchable band: offer the
//                       cluster-as-system import.
//   'starmap-crowded' — dense but slow (the case pure density gets wrong):
//                       starmap with a crowding note.
//   'starmap'         — nothing special; the ordinary path.
// Borderline (within 10× of the band) is surfaced so the UI can say the
// number and let the GM choose rather than deciding silently.
export function gateDecision({ nStars, radiusLy, massKgEnclosed, centreOtype = null }) {
  const trip = tripwire({ nStars, radiusLy, centreOtype });
  const tDynYr = dynamicalTimeYr(radiusLy, massKgEnclosed);
  const sepLy = meanSeparationLy(nStars, radiusLy);
  if (!trip.fired) return { offer: 'starmap', tDynYr, meanSeparationLy: sepLy, borderline: false, tripwire: trip };
  if (tDynYr <= WATCHABLE_TDYN_YR) {
    return { offer: 'system', tDynYr, meanSeparationLy: sepLy, borderline: false, tripwire: trip };
  }
  return {
    offer: 'starmap-crowded',
    tDynYr,
    meanSeparationLy: sepLy,
    borderline: tDynYr <= WATCHABLE_TDYN_YR * 10,
    tripwire: trip
  };
}

// Convenience for callers estimating enclosed mass before per-star masses are
// known: N stars at an assumed mean stellar mass, plus any known central mass
// (SMBH). Solar masses in, kg out.
export const enclosedMassKg = ({ nStars, meanStellarMassMsun = 0.4, centralMassMsun = 0 }) =>
  (nStars * meanStellarMassMsun + centralMassMsun) * SOLAR_MASS_KG;
