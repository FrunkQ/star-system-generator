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

// Volume-additive bulk density from mass fractions: 1/ρ = Σ fᵢ/ρᵢ.
export function bulkDensityFromMakeup(m: Makeup): number {
  const n = normalizeMakeup(m);
  let inv = 0;
  for (const k of KEYS) inv += n[k] / GRAIN_GCC[k];
  return inv > 0 ? 1 / inv : 5.513;
}

// Radius (Earth radii) implied by a mass (Earth masses) + makeup (uncompressed; good enough
// for procedural generation). Earth: mass 1, ρ 5.513 → radius 1.
export function radiusReFromMassMakeup(mass_Me: number, m: Makeup): number {
  const rho = bulkDensityFromMakeup(m);
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
  return normalizeMakeup(inferMakeupFromDensity(density_gcc));
}
