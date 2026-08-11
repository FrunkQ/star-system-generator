// Real-sky import — planet-building helpers shared by the build kit and the
// in-app importer: mass-radius estimation for radial-velocity planets (no
// measured radius), bulk-makeup defaults SystemProcessor derives density from,
// and the catalogue-facts description line.

import { round } from './positions.mjs';

// Chen & Kipping (2017)-style mass-radius estimate for planets without a
// measured radius (radial-velocity discoveries). Earth units in, Earth radii out.
export function estimateRadiusRe(massMe) {
  if (massMe < 2.04) return 1.008 * massMe ** 0.279;
  if (massMe < 131.6) return Math.min(0.808 * massMe ** 0.589, 12);
  return 12; // giants: ~Jupiter-sized regardless of mass
}

// Above this mass a planet is an envelope, whatever its bulk density says.
// One constant, used twice on purpose: the ceiling on the density test IS the
// giant threshold, not a second number that happens to match it.
const GIANT_MASS_ME = 40;

// Bulk makeup from the catalogue's mass and density.
//
// The density test is a sound proxy for "rocky" only BELOW the giant threshold.
// Past about one Jupiter mass a giant stops growing and then compresses, so
// mass keeps climbing into a near-constant volume: eps Ind A b is 6.5 Jupiter
// masses at 1.16 Jupiter radii, a genuine 5.56 g/cc, and the catalogue figure is
// RIGHT. Without the ceiling the first branch fired on it and returned 62% rock
// while the classifier — reading the same mass and radius — correctly called it
// a super-Jupiter, and the last branch, which already held the right answer, was
// never reached. An ordering fault, not a missing model (D17).
export function defaultMakeup(massMe, densityGcc) {
  if (densityGcc != null && densityGcc > 4 && massMe < GIANT_MASS_ME) return { rock: 0.62, metal: 0.33, ice: 0.05 };
  if (massMe < 4) return { rock: 0.65, metal: 0.30, ice: 0.05 };
  if (massMe < GIANT_MASS_ME) return { ice: 0.55, gas: 0.25, rock: 0.20 };
  return { gas: 0.85, ice: 0.10, rock: 0.05 };
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
    const m = row.pl_bmasse;
    const mStr = m >= 100 ? `${round(m / 317.8, 2)} Jupiter masses` : `${round(m, 2)} Earth masses`;
    bits.push(isMsini ? `Minimum mass ${mStr}.` : `Mass ${mStr}.`);
  }
  if (row.pl_rade != null) bits.push(`Measured radius ${round(row.pl_rade, 2)} Earth radii.`);
  if (row.pl_orbper != null) bits.push(`Orbital period ${row.pl_orbper < 100 ? round(row.pl_orbper, 1) + ' days' : round(row.pl_orbper / 365.25, 1) + ' years'}.`);
  return bits.join(' ');
}
