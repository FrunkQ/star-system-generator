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

const JUPITER_MASS_KG = 1.898e27;
const STEFAN_BOLTZMANN = 5.670374419e-8; // W·m⁻²·K⁻⁴
const SOLAR_LUMINOSITY_W = 3.828e26;

// Self-heating engages from the sub-brown-dwarf floor (~8 M_jup, where contraction/deuterium heat
// starts to dominate a body's own budget) up to the hydrogen-burning limit (~80 M_jup). Below 8 M_jup
// an ordinary gas giant keeps only its modest residual internal heat; at/above 80 M_jup it's a star.
export const SUBSTELLAR_MIN_MJUP = 8;
export const SUBSTELLAR_MAX_MJUP = 80;
const TEFF_FLOOR_K = 250; // coldest known Y dwarf (WISE 0855 ≈ 250 K)
const TEFF_CAP_K = 2800; // hottest young L dwarfs

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
  const ageEff = Math.max(0.005, ageGyr || 0);
  const teffK = Math.min(TEFF_CAP_K, Math.max(TEFF_FLOOR_K, t0 * Math.pow(ageEff, -alpha)));
  const rM = Math.max(1, radiusKm || 0) * 1000;
  const lumW = 4 * Math.PI * rM * rM * STEFAN_BOLTZMANN * Math.pow(teffK, 4);
  return { isSubstellar: true, teffK, luminositySolar: lumW / SOLAR_LUMINOSITY_W, mjup };
}
