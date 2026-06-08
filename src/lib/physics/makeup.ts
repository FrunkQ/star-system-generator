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

// Radius (Earth radii) implied by a mass (Earth masses) + makeup, INCLUDING compression. Earth:
// mass 1, rock/metal mix → ρ ≈ 5.5 → radius ≈ 1.
export function radiusReFromMassMakeup(mass_Me: number, m: Makeup): number {
  const rho = compressedDensityFromMakeup(mass_Me, m);
  return Math.cbrt((Math.max(0, mass_Me) / rho) * 5.513);
}

// Reverse: a representative makeup for a bulk density (g/cc) when none is set.
export function inferMakeupFromDensity(density_gcc: number): Makeup {
  const d = density_gcc;
  if (d >= 6.5) return { metal: 0.6, rock: 0.4 };          // iron-rich
  if (d >= 3.0) return { rock: 0.8, metal: 0.2 };          // silicate / rocky (Earth, Venus, Mars)
  if (d >= 1.3) return { rock: 0.4, ice: 0.6 };            // icy
  if (d >= 0.5) return { ice: 0.3, gas: 0.7 };             // sub-neptune / puffy
  return { gas: 0.95, ice: 0.05 };                         // gas giant
}

// The normalised makeup fractions for a body: explicit if present, else inferred from its
// bulk density (mass/radius). Used by the classifier feature vector + the body panel.
export function makeupFractions(body: CelestialBody): Required<Makeup> {
  if (body.makeup) return normalizeMakeup(body.makeup);
  const massKg = body.massKg || 0;
  const radiusM = (body.radiusKm || 0) * 1000;
  const volM3 = radiusM > 0 ? (4 / 3) * Math.PI * radiusM ** 3 : 0;
  const density_gcc = volM3 > 0 ? (massKg / volM3) / 1000 : 5.513;
  const massMe = massKg / EARTH_MASS_KG;
  // A massive, low-density body is a gas/ice giant — its bulk density (≈1.3 for Jupiter)
  // would otherwise read as "icy" and miss the gas envelope.
  if (massMe > 8 && density_gcc < 2.5) return normalizeMakeup({ gas: 0.8, ice: 0.2 });
  return normalizeMakeup(inferMakeupFromDensity(density_gcc));
}
