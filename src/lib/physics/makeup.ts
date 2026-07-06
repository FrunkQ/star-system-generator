// Planetary interior makeup (Phase 04 / proposal §2a). A body's bulk composition is the
// first-class control; density and (with mass) radius are DERIVED from it — Option A. Bodies
// without an explicit makeup get one inferred from their density, so classification and display
// always have composition to work with.
import type { CelestialBody, Makeup } from '$lib/types';
import { EARTH_MASS_KG, EARTH_RADIUS_KM } from '$lib/constants';

// Representative grain densities (g/cc) for each component.
const GRAIN_GCC: Required<Makeup> = { metal: 7.9, rock: 3.3, carbon: 2.3, ice: 0.95, gas: 0.12 };
const KEYS = ['metal', 'rock', 'carbon', 'ice', 'gas'] as const;

export function normalizeMakeup(m: Makeup | undefined): Required<Makeup> {
  const out: Required<Makeup> = { metal: 0, rock: 0, carbon: 0, ice: 0, gas: 0 };
  let sum = 0;
  for (const k of KEYS) { const v = Math.max(0, m?.[k] ?? 0); out[k] = v; sum += v; }
  if (sum <= 0) return { metal: 0, rock: 1, carbon: 0, ice: 0, gas: 0 };
  for (const k of KEYS) out[k] /= sum;
  return out;
}

// Volume-additive bulk density from mass fractions: 1/ρ = Σ fᵢ/ρᵢ. This is the UNCOMPRESSED
// (grain) density — what the interior would be without self-gravity squeezing it.
export function bulkDensityFromMakeup(m: Makeup): number {
  const n = normalizeMakeup(m);
  let inv = 0;
  for (const k of KEYS) inv += n[k] / GRAIN_GCC[k];
  return inv > 0 ? 1 / inv : 5.513;
}

// Gravitational COMPRESSION factor: a larger interior is squeezed denser by its own gravity, so
// bulk density climbs with mass. Calibrated so an Earth-mass rocky world (uncompressed ~3.7 g/cc)
// reaches its real ~5.5 — and small bodies (Moon, Mercury, Mars) are barely compressed, while
// super-Earths are markedly denser. Gas-dominated bodies follow a different (degeneracy) relation,
// so they are left uncompressed here.
export function compressionFactor(mass_Me: number, m: Makeup): number {
  const n = normalizeMakeup(m);
  if (n.gas > 0.5) return 1;
  return 1 + 0.67 * (1 - Math.exp(-Math.max(0, mass_Me) / 0.8));
}

// Compressed bulk density (g/cc) — the realistic value, ≈ measured density. Earth ≈ 5.5.
export function compressedDensityFromMakeup(mass_Me: number, m: Makeup): number {
  return bulkDensityFromMakeup(m) * compressionFactor(mass_Me, m);
}

const JUPITER_ME = 317.8;
const JUPITER_RE = 11.2;

// THERMAL INFLATION: insolation puffs a gas giant's envelope. A cold/temperate giant sits near 1 R_J;
// an irradiated hot Jupiter inflates (bigger radius, lower density). Negligible below ~600 K, climbing
// to ~+70% for the most irradiated (~2200 K+). Terrestrials don't do this (rock/metal don't thermally
// expand), so it's applied ONLY to the gas-giant radius model. Returns a radius MULTIPLIER (≥1).
const INFLATE_T0 = 600, INFLATE_T1 = 2200, INFLATE_MAX = 0.7;
export function gasThermalInflationFactor(teqK: number): number {
  const t = Math.max(0, Math.min(1, (teqK - INFLATE_T0) / (INFLATE_T1 - INFLATE_T0)));
  return 1 + INFLATE_MAX * t;
}

// Gas giants don't follow the rocky compression — degeneracy pressure makes their radius roughly
// CONSTANT (~1 Rjup) across a wide mass range: sub-Jovians are smaller, super-Jovians/brown dwarfs
// slowly shrink as gravity wins. The `inflation` multiplier then puffs a hot giant up. A measured giant
// usually has its radius set directly; this is for derive-from-makeup. (Chen–Kipping-ish.)
function gasGiantRadiusRe(mass_Me: number, inflation = 1): number {
  const Mj = Math.max(0.001, mass_Me / JUPITER_ME);
  const base = Mj < 0.4
    ? JUPITER_RE * Math.pow(Mj / 0.4, 0.45)  // sub-Saturn: grows with mass
    : JUPITER_RE * Math.pow(Mj, -0.04);      // Jovian → brown dwarf: gently shrinks
  return base * Math.max(0.5, inflation);
}

// Radius (Earth radii) implied by a mass (Earth masses) + makeup. Rocky/icy bodies use compression
// (Earth: rock/metal mix → ρ ≈ 5.5 → radius ≈ 1); gas-dominated bodies use the giant mass–radius
// relation (Jupiter mass → ~11.2 R⊕) with an optional thermal-inflation multiplier (rocky bodies
// ignore it — no thermal expansion).
export function radiusReFromMassMakeup(mass_Me: number, m: Makeup, inflation = 1): number {
  if (normalizeMakeup(m).gas > 0.5) return gasGiantRadiusRe(mass_Me, inflation);
  const rho = compressedDensityFromMakeup(mass_Me, m);
  return Math.cbrt((Math.max(0, mass_Me) / rho) * 5.513);
}

// Inverse of radiusReFromMassMakeup: the mass (Earth masses) whose makeup-derived radius matches a
// target radius. radiusReFromMassMakeup is monotonic in mass for rocky/icy/carbon bodies, so a
// geometric bisection over log-mass converges cleanly. (Gas-dominated bodies are degeneracy-flat in
// radius — the caller should keep those mass-driven; this still returns a best-effort value.)
export function massMeFromRadiusMakeup(radius_Re: number, m: Makeup, inflation = 1): number {
  const target = Math.max(1e-6, radius_Re);
  let lo = 1e-7, hi = 1e6; // tiny moonlet → well past brown-dwarf
  for (let i = 0; i < 60; i++) {
    const mid = Math.sqrt(lo * hi);
    if (radiusReFromMassMakeup(mid, m, inflation) < target) lo = mid; else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

// Reverse: a representative makeup for an UNCOMPRESSED grain density (g/cc), by inverting the
// volume-additive blend between the two bracketing grain densities. Physically grounded — a density
// of 5.4 lands at ~⅔ metal (Mercury), not a coarse "rocky" bucket.
export function inferMakeupFromDensity(density_gcc: number): Makeup {
  const d = Math.max(0.12, density_gcc);
  const blend = (heavy: keyof Makeup, hDen: number, light: keyof Makeup, lDen: number): Makeup => {
    // 1/d = f/hDen + (1−f)/lDen  →  solve the heavy fraction f
    const f = Math.max(0, Math.min(1, ((1 / lDen) - (1 / d)) / ((1 / lDen) - (1 / hDen))));
    return { [heavy]: f, [light]: 1 - f } as Makeup;
  };
  if (d >= GRAIN_GCC.metal) return { metal: 1 };
  if (d >= GRAIN_GCC.rock) return blend('metal', GRAIN_GCC.metal, 'rock', GRAIN_GCC.rock);  // metal↔rock
  if (d >= GRAIN_GCC.ice) return blend('rock', GRAIN_GCC.rock, 'ice', GRAIN_GCC.ice);        // rock↔ice
  return blend('ice', GRAIN_GCC.ice, 'gas', GRAIN_GCC.gas);                                  // ice↔gas
}

// The normalised makeup fractions for a body: explicit if present, else inferred from its bulk
// density. The measured density is gravity-COMPRESSED, so we decompress by mass first — a small,
// dense body is iron (Mercury), not compressed rock. Used by the classifier + the body panel.
export function makeupFractions(body: CelestialBody): Required<Makeup> {
  if (body.makeup) return normalizeMakeup(body.makeup);
  const massKg = body.massKg || 0;
  const radiusM = (body.radiusKm || 0) * 1000;
  const volM3 = radiusM > 0 ? (4 / 3) * Math.PI * radiusM ** 3 : 0;
  const density_gcc = volM3 > 0 ? (massKg / volM3) / 1000 : 5.513;
  const massMe = massKg / EARTH_MASS_KG;
  // A massive, low-density body is a gas/ice giant — its bulk density (≈1.3 for Jupiter) would
  // otherwise read as "icy" and miss the gas envelope.
  if (massMe > 8 && density_gcc < 2.5) return normalizeMakeup({ gas: 0.8, ice: 0.2 });
  // Recover the uncompressed grain density (assume a rocky body for the compression factor).
  const uncompressed = density_gcc / compressionFactor(massMe, { rock: 1 });
  return normalizeMakeup(inferMakeupFromDensity(uncompressed));
}
