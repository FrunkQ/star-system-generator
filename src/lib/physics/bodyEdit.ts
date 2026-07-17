// The Size & Composition editor's INTERACTION CHAIN (Phase D). Pure functions over the existing makeup.ts
// physics — no new modelling. Mass, radius and density are bound by ρ = M/(4/3·π·R³) (only 2 degrees of
// freedom), so each edit HOLDS one quantity and DERIVES another; the interior makeup is slaved to the density
// (auto-inferred to match) unless the GM edits makeup directly. A per-field LOCK overrides which quantity is
// held. Density-lock ≡ composition-lock (makeup is what a locked density freezes).
//
// Units are Earth-relative (massMe, radiusRe) + normalised makeup; the component converts to/from kg/km.
import type { Makeup } from '$lib/types';
import {
  normalizeMakeup, compressionFactor, compressedDensityFromMakeup, maxPorosity,
  radiusReFromMassMakeup, massMeFromRadiusMakeup, inferMakeupFromDensity
} from './makeup';

export type EditLock = 'mass' | 'radius' | 'density' | null;
export interface BodyEditState { massMe: number; radiusRe: number; makeup: Required<Makeup>; }

// Earth calibration: 1 M⊕ in a 1 R⊕ sphere ⇒ 5.513 g/cc. So the geometric (measured, gravity-compressed)
// density ρ = 5.513 · M / R³.
const EARTH_RHO = 5.513;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const MIN_M = 1e-12, MAX_M = 1e5;  // small comet (~6e12 kg) → well past brown dwarf, in Earth masses
export const MIN_R = 5e-5, MAX_R = 40;    // ~0.3 km → Earth radii
const MIN_D = 0.05, MAX_D = 30;           // g/cc

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
export function editMass(s: BodyEditState, newMassMe: number, lock: EditLock, heldDensity?: number, inflation = 1): BodyEditState {
  const massMe = clamp(newMassMe, MIN_M, MAX_M);
  if (lock === 'radius') {
    return { massMe, radiusRe: s.radiusRe, makeup: makeupForGeomDensity(densityGcc(massMe, s.radiusRe), massMe) };
  }
  if (lock === 'density' && heldDensity) {
    return { massMe, radiusRe: clamp(radiusFromMassDensity(massMe, heldDensity), MIN_R, MAX_R), makeup: s.makeup };
  }
  return { massMe, radiusRe: clamp(radiusReFromMassMakeup(massMe, s.makeup, inflation), MIN_R, MAX_R), makeup: s.makeup };
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
export function editMakeup(s: BodyEditState, makeup: Required<Makeup>, lock: EditLock, inflation = 1): BodyEditState {
  if (lock === 'mass') {
    return { massMe: s.massMe, radiusRe: clamp(radiusReFromMassMakeup(s.massMe, makeup, inflation), MIN_R, MAX_R), makeup };
  }
  return { massMe: clamp(massMeFromRadiusMakeup(s.radiusRe, makeup, inflation), MIN_M, MAX_M), radiusRe: s.radiusRe, makeup };
}

// ——— ANCHORED editing (composition is the anchor — docs/dev/composition-editor-redesign.md) ————————————
//
// For a fixed composition, mass determines radius & density; the one honest extra freedom is a radius
// TRIM about the zero-trim radius r0: macroporosity for solids (voids, r = r0·(1−p)^(−1/3)) and thermal
// inflation for gas-dominated bodies. The trim envelope is what the UI draws as range bars: inside it a
// radius/density drag varies only the trim (composition, type and image all hold); outside it the edit
// flows through to the classic behaviour (makeup re-inferred from density) so planetary types morph —
// announced by the UI, committed on release.

// Solids also get a small symmetric tolerance so planet-mass bodies (porosity ceiling ≈ 0) still have a
// usable in-band range — real worlds vary by core fraction, hydration and temperature at fixed "mix".
const SOLID_TRIM_TOL = 0.08;                 // ±8% density
const GAS_TRIM_LO = 0.85, GAS_TRIM_HI = 1.7; // deflated cold giant → maximally irradiated hot Jupiter

export interface TrimEnvelope {
  kind: 'porosity' | 'inflation';
  r0: number;                    // zero-trim radius (Re) for this mass + makeup
  trimLo: number; trimHi: number; // radius multipliers about r0
  radLo: number; radHi: number;  // Re
  denLo: number; denHi: number;  // g/cc (denHi corresponds to radLo)
}

export function trimEnvelope(massMe: number, makeup: Required<Makeup>): TrimEnvelope {
  const gas = makeup.gas > 0.5;
  const r0 = radiusReFromMassMakeup(massMe, makeup, 1);
  const trimLo = gas ? GAS_TRIM_LO : Math.pow(1 + SOLID_TRIM_TOL, -1 / 3);
  const trimHi = gas
    ? GAS_TRIM_HI
    : Math.pow(1 - Math.max(maxPorosity(massMe), SOLID_TRIM_TOL / (1 + SOLID_TRIM_TOL)), -1 / 3);
  const radLo = clamp(r0 * trimLo, MIN_R, MAX_R);
  const radHi = clamp(r0 * trimHi, MIN_R, MAX_R);
  return {
    kind: gas ? 'inflation' : 'porosity', r0, trimLo, trimHi, radLo, radHi,
    denLo: densityGcc(massMe, radHi), denHi: densityGcc(massMe, radLo)
  };
}

export interface AnchoredResult extends BodyEditState { outOfBand: boolean; }

// Edit RADIUS with composition anchored: inside the envelope only the trim moves (makeup held);
// outside, classic flow-through (mass held, makeup re-inferred from the new density).
export function editRadiusAnchored(s: BodyEditState, newRadiusRe: number): AnchoredResult {
  const r = clamp(newRadiusRe, MIN_R, MAX_R);
  const env = trimEnvelope(s.massMe, s.makeup);
  if (r >= env.radLo && r <= env.radHi) return { massMe: s.massMe, radiusRe: r, makeup: s.makeup, outOfBand: false };
  return { ...editRadius(s, r, null), outOfBand: true };
}

// Edit DENSITY with composition anchored. Mass is held either way (density ↔ radius at fixed mass):
// inside the envelope the trim moves; outside, makeup re-inferred, radius follows.
export function editDensityAnchored(s: BodyEditState, newDensity: number): AnchoredResult {
  const d = clamp(newDensity, MIN_D, MAX_D);
  const env = trimEnvelope(s.massMe, s.makeup);
  if (d >= env.denLo && d <= env.denHi) {
    return { massMe: s.massMe, radiusRe: clamp(radiusFromMassDensity(s.massMe, d), MIN_R, MAX_R), makeup: s.makeup, outOfBand: false };
  }
  return { ...editDensity(s, d, 'mass'), outOfBand: true };
}

// Edit MASS with composition anchored: radius follows the composition's mass–radius curve PRESERVING
// the current relative trim — a rubble pile dragged up in mass keeps its void fraction until the
// shrinking porosity ceiling squeezes it out. Never leaves the envelope.
export function editMassAnchored(s: BodyEditState, newMassMe: number): AnchoredResult {
  const m = clamp(newMassMe, MIN_M, MAX_M);
  const envOld = trimEnvelope(s.massMe, s.makeup);
  const t = envOld.r0 > 0 ? clamp(s.radiusRe / envOld.r0, envOld.trimLo, envOld.trimHi) : 1;
  const envNew = trimEnvelope(m, s.makeup);
  const radiusRe = clamp(envNew.r0 * clamp(t, envNew.trimLo, envNew.trimHi), MIN_R, MAX_R);
  return { massMe: m, radiusRe, makeup: s.makeup, outOfBand: false };
}

// ——— composition presets, gated by DENSITY (bands overlap — several are plausible at one density) ————————
// Low-mass presets (rubble pile, comet) also gate on mass — they are small-body mixes, not planet types —
// and carry a default porosity the UI applies on selection (clamped by the mass ceiling).
export interface CompositionPreset {
  name: string; makeup: Makeup; band: [number, number];
  maxMassMe?: number; defaultPorosity?: number;
}
export const COMPOSITION_PRESETS: CompositionPreset[] = [
  { name: 'Iron-rich', makeup: { metal: 0.7, rock: 0.3 },  band: [5.0, 8.0] },
  { name: 'Rocky',     makeup: { rock: 0.85, metal: 0.15 },band: [3.0, 6.0] },
  { name: 'Carbon',    makeup: { carbon: 0.5, rock: 0.5 }, band: [2.3, 4.0] },
  { name: 'Ocean',     makeup: { rock: 0.5, ice: 0.5 },    band: [1.0, 3.0] },
  { name: 'Icy',       makeup: { ice: 0.6, rock: 0.4 },    band: [1.2, 2.5] },
  { name: 'Ice giant', makeup: { gas: 0.7, ice: 0.3 },     band: [1.0, 3.5] },
  { name: 'Gas giant', makeup: { gas: 0.95, ice: 0.05 },   band: [0.3, 1.6] },
  { name: 'Rubble pile', makeup: { rock: 0.75, carbon: 0.15, metal: 0.1 }, band: [1.0, 3.0], maxMassMe: 1e-4, defaultPorosity: 0.35 },
  { name: 'Comet',       makeup: { ice: 0.55, carbon: 0.25, rock: 0.2 },   band: [0.3, 1.5], maxMassMe: 1e-4, defaultPorosity: 0.4 }
];

export function presetValidAt(p: CompositionPreset, density: number, massMe?: number): boolean {
  if (p.maxMassMe !== undefined && massMe !== undefined && massMe > p.maxMassMe) return false;
  return density >= p.band[0] && density <= p.band[1];
}

// Apply a preset with composition anchored: radius held, mass re-derived from the mix (classic), then —
// for presets carrying a default porosity — the radius is puffed to the default void fraction (clamped
// by the mass ceiling) so a fresh rubble pile/comet lands mid-envelope, not fully compacted.
export function applyPresetAnchored(s: BodyEditState, p: CompositionPreset, inflation = 1): BodyEditState {
  const makeup = normalizeMakeup(p.makeup);
  const out = editMakeup(s, makeup, null, inflation);
  if (p.defaultPorosity && makeup.gas <= 0.5) {
    const porosity = Math.min(p.defaultPorosity, maxPorosity(out.massMe));
    const r0 = radiusReFromMassMakeup(out.massMe, makeup, 1);
    return { ...out, radiusRe: clamp(r0 * Math.pow(1 - porosity, -1 / 3), MIN_R, MAX_R) };
  }
  return out;
}
// A preset is "active" when the current makeup essentially matches its mix.
export function presetActive(p: CompositionPreset, makeup: Required<Makeup>): boolean {
  const target = normalizeMakeup(p.makeup);
  return (['metal', 'rock', 'carbon', 'ice', 'gas'] as const).every((k) => Math.abs(target[k] - makeup[k]) < 0.02);
}
