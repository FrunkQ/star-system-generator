// The Size & Composition editor's INTERACTION CHAIN (Phase D). Pure functions over the existing makeup.ts
// physics — no new modelling. Mass, radius and density are bound by ρ = M/(4/3·π·R³) (only 2 degrees of
// freedom), so each edit HOLDS one quantity and DERIVES another; the interior makeup is slaved to the density
// (auto-inferred to match) unless the GM edits makeup directly. A per-field LOCK overrides which quantity is
// held. Density-lock ≡ composition-lock (makeup is what a locked density freezes).
//
// Units are Earth-relative (massMe, radiusRe) + normalised makeup; the component converts to/from kg/km.
import type { Makeup } from '$lib/types';
import {
  normalizeMakeup, compressionFactor, radiusReFromMassMakeup, massMeFromRadiusMakeup, inferMakeupFromDensity
} from './makeup';

export type EditLock = 'mass' | 'radius' | 'density' | null;
export interface BodyEditState { massMe: number; radiusRe: number; makeup: Required<Makeup>; }

// Earth calibration: 1 M⊕ in a 1 R⊕ sphere ⇒ 5.513 g/cc. So the geometric (measured, gravity-compressed)
// density ρ = 5.513 · M / R³.
const EARTH_RHO = 5.513;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const MIN_M = 1e-4, MAX_M = 1e5;      // moonlet → well past brown dwarf, in Earth masses
const MIN_R = 1e-3, MAX_R = 40;       // Earth radii
const MIN_D = 0.05, MAX_D = 30;       // g/cc

export function densityGcc(massMe: number, radiusRe: number): number {
  return radiusRe > 0 ? (EARTH_RHO * massMe) / (radiusRe ** 3) : 0;
}
export function radiusFromMassDensity(massMe: number, density: number): number {
  return density > 0 ? Math.cbrt((EARTH_RHO * massMe) / density) : 0;
}
export function massFromRadiusDensity(radiusRe: number, density: number): number {
  return (density * radiusRe ** 3) / EARTH_RHO;
}

// Composition to match a MEASURED (geometric) density: decompress by mass first (a small dense body is iron,
// not compressed rock — mirrors makeup.ts makeupFractions), then invert the grain-density blend.
function makeupForGeomDensity(geomDensity: number, massMe: number): Required<Makeup> {
  const uncompressed = geomDensity / compressionFactor(massMe, { rock: 1 });
  return normalizeMakeup(inferMakeupFromDensity(uncompressed));
}

// Set one makeup component to `frac` (0..1) and rescale the others proportionally so the mix stays normalised.
export function setMakeupComponent(m: Required<Makeup>, key: keyof Makeup, frac: number): Required<Makeup> {
  const v = clamp(frac, 0, 1);
  const keys = ['metal', 'rock', 'carbon', 'ice', 'gas'] as const;
  const others = keys.filter((k) => k !== key);
  const otherSum = others.reduce((a, k) => a + m[k], 0);
  const out: any = { [key]: v };
  if (otherSum > 1e-9) others.forEach((k) => (out[k] = m[k] * (1 - v) / otherSum));
  else others.forEach((k) => (out[k] = (1 - v) / others.length));
  return normalizeMakeup(out);
}

// ——— the chain ———————————————————————————————————————————————————————————————————————————————————————

// Edit MASS. Default: composition held → radius follows. radius-lock: mass drags, radius held, so density &
// composition shift. density-lock: density held → radius follows, composition held.
export function editMass(s: BodyEditState, newMassMe: number, lock: EditLock, heldDensity?: number): BodyEditState {
  const massMe = clamp(newMassMe, MIN_M, MAX_M);
  if (lock === 'radius') {
    return { massMe, radiusRe: s.radiusRe, makeup: makeupForGeomDensity(densityGcc(massMe, s.radiusRe), massMe) };
  }
  if (lock === 'density' && heldDensity) {
    return { massMe, radiusRe: clamp(radiusFromMassDensity(massMe, heldDensity), MIN_R, MAX_R), makeup: s.makeup };
  }
  return { massMe, radiusRe: clamp(radiusReFromMassMakeup(massMe, s.makeup), MIN_R, MAX_R), makeup: s.makeup };
}

// Edit RADIUS. Default (and mass-lock): mass held → density & composition shift. density-lock: density held →
// mass follows, composition held.
export function editRadius(s: BodyEditState, newRadiusRe: number, lock: EditLock, heldDensity?: number): BodyEditState {
  const radiusRe = clamp(newRadiusRe, MIN_R, MAX_R);
  if (lock === 'density' && heldDensity) {
    return { massMe: clamp(massFromRadiusDensity(radiusRe, heldDensity), MIN_M, MAX_M), radiusRe, makeup: s.makeup };
  }
  return { massMe: s.massMe, radiusRe, makeup: makeupForGeomDensity(densityGcc(s.massMe, radiusRe), s.massMe) };
}

// Edit DENSITY directly (infers composition to match). Default (and radius-lock): mass follows. mass-lock:
// radius follows.
export function editDensity(s: BodyEditState, newDensity: number, lock: EditLock): BodyEditState {
  const density = clamp(newDensity, MIN_D, MAX_D);
  const makeup = makeupForGeomDensity(density, s.massMe);
  if (lock === 'mass') {
    return { massMe: s.massMe, radiusRe: clamp(radiusFromMassDensity(s.massMe, density), MIN_R, MAX_R), makeup };
  }
  return { massMe: clamp(massFromRadiusDensity(s.radiusRe, density), MIN_M, MAX_M), radiusRe: s.radiusRe, makeup };
}

// Set the makeup to a given mix (a preset or a full composition). Default (and radius-lock): radius held →
// mass follows. mass-lock: mass held → radius follows. NOT valid when density is locked (composition held).
export function editMakeup(s: BodyEditState, makeup: Required<Makeup>, lock: EditLock): BodyEditState {
  if (lock === 'mass') {
    return { massMe: s.massMe, radiusRe: clamp(radiusReFromMassMakeup(s.massMe, makeup), MIN_R, MAX_R), makeup };
  }
  return { massMe: clamp(massMeFromRadiusMakeup(s.radiusRe, makeup), MIN_M, MAX_M), radiusRe: s.radiusRe, makeup };
}

// ——— composition presets, gated by DENSITY (bands overlap — several are plausible at one density) ————————
export interface CompositionPreset { name: string; makeup: Makeup; band: [number, number]; }
export const COMPOSITION_PRESETS: CompositionPreset[] = [
  { name: 'Iron-rich', makeup: { metal: 0.7, rock: 0.3 },  band: [5.0, 8.0] },
  { name: 'Rocky',     makeup: { rock: 0.85, metal: 0.15 },band: [3.0, 6.0] },
  { name: 'Carbon',    makeup: { carbon: 0.5, rock: 0.5 }, band: [2.3, 4.0] },
  { name: 'Ocean',     makeup: { rock: 0.5, ice: 0.5 },    band: [1.0, 3.0] },
  { name: 'Icy',       makeup: { ice: 0.6, rock: 0.4 },    band: [1.2, 2.5] },
  { name: 'Ice giant', makeup: { gas: 0.7, ice: 0.3 },     band: [1.0, 3.5] },
  { name: 'Gas giant', makeup: { gas: 0.95, ice: 0.05 },   band: [0.3, 1.6] }
];

export function presetValidAt(p: CompositionPreset, density: number): boolean {
  return density >= p.band[0] && density <= p.band[1];
}
// A preset is "active" when the current makeup essentially matches its mix.
export function presetActive(p: CompositionPreset, makeup: Required<Makeup>): boolean {
  const target = normalizeMakeup(p.makeup);
  return (['metal', 'rock', 'carbon', 'ice', 'gas'] as const).every((k) => Math.abs(target[k] - makeup[k]) < 0.02);
}
