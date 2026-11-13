// Substellar self-luminosity — brown dwarfs and their heavier "planemo" cousins are NOT passive
// planets: they radiate their OWN heat (gravitational contraction + early deuterium/lithium fusion),
// glowing in the infrared and cooling over gigayears from L-dwarf (~2000 K) through T to Y (~250 K).
// They never sustain hydrogen fusion (that needs ~80 M_jup / 0.075 M_sun → a real star). This module
// gives a brown-dwarf-MASS body an age-dependent effective temperature + luminosity so it self-heats
// (its surface reads ~its own Teff, not the distant star's equilibrium temperature) AND can act as a
// heat/radiation source for its own moons.
//
// The cooling law is a CALIBRATED HEURISTIC fit to the Burrows/Baraffe cooling-track envelope, not a
// structural model — good enough to be plausible (a young 70 M_jup dwarf ~2000 K, an old 13 M_jup one
// ~300 K), documented as such on /physics.

import { luminositySolarFromRT } from './luminosity';

const JUPITER_MASS_KG = 1.898e27;
// (Stefan-Boltzmann and the solar luminosity used to live here as local constants, next to a second
// copy of the same law in the star editor. Both moved to physics/luminosity.ts — one law, one place.)

// Self-heating engages from the sub-brown-dwarf floor (~8 M_jup, where contraction/deuterium heat
// starts to dominate a body's own budget) up to the hydrogen-burning limit (~80 M_jup). Below 8 M_jup
// an ordinary gas giant keeps only its modest residual internal heat; at/above 80 M_jup it's a star.
export const SUBSTELLAR_MIN_MJUP = 8;
export const SUBSTELLAR_MAX_MJUP = 80;
const TEFF_FLOOR_K = 250; // coldest known Y dwarf (WISE 0855 ≈ 250 K)
const TEFF_CAP_K = 2800; // hottest young L dwarfs
const MIN_TRACK_AGE_GYR = 0.005; // the track is not run younger than ~5 Myr, the typical formation lag

// Cooling tracks: T0 = effective temperature at a 1 Gyr reference age; alpha = cooling exponent
// (Teff ∝ age^-alpha). Higher mass ⇒ hotter and cools more slowly. Interpolated linearly by mass.
const TRACKS: { mjup: number; t0: number; alpha: number }[] = [
  { mjup: 8, t0: 450, alpha: 0.3 },
  { mjup: 13, t0: 650, alpha: 0.24 },
  { mjup: 25, t0: 1050, alpha: 0.18 },
  { mjup: 45, t0: 1600, alpha: 0.13 },
  { mjup: 80, t0: 2200, alpha: 0.08 }
];

function trackFor(mjup: number): { t0: number; alpha: number } {
  if (mjup <= TRACKS[0].mjup) return { t0: TRACKS[0].t0, alpha: TRACKS[0].alpha };
  for (let i = 1; i < TRACKS.length; i++) {
    if (mjup <= TRACKS[i].mjup) {
      const a = TRACKS[i - 1], b = TRACKS[i];
      const f = (mjup - a.mjup) / (b.mjup - a.mjup);
      return { t0: a.t0 + f * (b.t0 - a.t0), alpha: a.alpha + f * (b.alpha - a.alpha) };
    }
  }
  const last = TRACKS[TRACKS.length - 1];
  return { t0: last.t0, alpha: last.alpha };
}

// A body that irradiates others with its OWN light: a real star, or a self-luminous brown-dwarf-mass
// body (flagged `isSelfLuminous` by the processor's substellar pass). Used by the temperature and
// radiation models to decide what counts as a flux/radiation source.
export function isLuminousSource(n: { kind?: string; roleHint?: string; isSelfLuminous?: boolean }): boolean {
  return n.kind === 'body' && (n.roleHint === 'star' || !!n.isSelfLuminous);
}

export interface SubstellarThermal {
  isSubstellar: boolean;
  teffK: number; // self-luminous effective (photosphere) temperature
  luminositySolar: number; // total luminosity in L☉ (for irradiating moons)
  mjup: number;
}

// Compute a body's self-luminous thermal state from its mass, the system age, and its radius (brown
// dwarfs are all ~1 R_jup thanks to electron degeneracy, so radius barely varies). Returns
// isSubstellar=false for anything outside the brown-dwarf mass window — callers should then fall back
// to the ordinary giant internal-heat model.
export function brownDwarfThermal(massKg: number, ageGyr: number, radiusKm: number): SubstellarThermal {
  const mjup = (massKg || 0) / JUPITER_MASS_KG;
  if (mjup < SUBSTELLAR_MIN_MJUP || mjup >= SUBSTELLAR_MAX_MJUP) {
    return { isSubstellar: false, teffK: 0, luminositySolar: 0, mjup };
  }
  const { t0, alpha } = trackFor(mjup);
  // Clamp age to ~5 Myr (typical formation lag) so a very young object doesn't diverge, and cap the
  // hot start at the L-dwarf ceiling.
  const ageEff = Math.max(MIN_TRACK_AGE_GYR, ageGyr || 0);
  const teffK = Math.min(TEFF_CAP_K, Math.max(TEFF_FLOOR_K, t0 * Math.pow(ageEff, -alpha)));
  // ONE Stefan-Boltzmann, shared with the stellar side — see physics/luminosity.ts. A brown dwarf
  // handing over to a star at 80 M_jup must not change brightness just because a different file
  // computed it.
  return {
    isSubstellar: true, teffK, mjup,
    luminositySolar: luminositySolarFromRT(Math.max(1, radiusKm || 0), teffK)
  };
}

// THE SAME TRACK, ASKED THE OTHER WAY ROUND (G94 job 4): how old is a dwarf of this mass when it is
// THIS temperature? It is what answers the GM who typed a temperature into a brown dwarf and watched
// it snap back (B150) - he gets to say the number he wanted, and the physics stays the single
// source, because what comes back is an AGE to set and never a temperature to pin.
//
// It is a rearrangement of the law above and reads the same track and the same three bounds, so the
// two cannot drift: `substellar.spec.ts` runs every answer back through `brownDwarfThermal` and
// requires the temperature it started from. Same pattern as `worlds/orbitSolver.ts`.
//
// WHAT IT DOES NOT KNOW is how old the universe is - that belongs to the campaign, not to a cooling
// law. It returns the age honestly even when that age is 30 Gyr, and the caller says so.
export type BrownDwarfAgeFit =
  | { kind: 'not-substellar' }
  /** Reached at exactly one age. */
  | { kind: 'age'; ageGyr: number }
  /** Hotter than a dwarf of this mass is even when newly formed; `hottestK` is where it starts. */
  | { kind: 'too-hot'; hottestK: number }
  /** Colder than any brown dwarf gets; `coldestK` is the floor and `ageGyr` is when this one reaches it. */
  | { kind: 'too-cold'; coldestK: number; ageGyr: number };

export function brownDwarfAgeForTeff(massKg: number, teffK: number): BrownDwarfAgeFit {
  const mjup = (massKg || 0) / JUPITER_MASS_KG;
  if (mjup < SUBSTELLAR_MIN_MJUP || mjup >= SUBSTELLAR_MAX_MJUP || !(teffK > 0)) return { kind: 'not-substellar' };
  const { t0, alpha } = trackFor(mjup);
  const ageAt = (k: number) => Math.pow(t0 / k, 1 / alpha);
  const hottestK = Math.min(TEFF_CAP_K, t0 * Math.pow(MIN_TRACK_AGE_GYR, -alpha));
  if (teffK > hottestK) return { kind: 'too-hot', hottestK };
  if (teffK < TEFF_FLOOR_K) return { kind: 'too-cold', coldestK: TEFF_FLOOR_K, ageGyr: ageAt(TEFF_FLOOR_K) };
  // At the ceiling every age up to the one where the track drops below it gives the same answer;
  // the OLDEST of them is the one returned, because it is the one a slider can leave in one direction.
  return { kind: 'age', ageGyr: Math.max(MIN_TRACK_AGE_GYR, ageAt(teffK)) };
}
