// MEGA-CONSTRUCT PREVIEWS — the primitives, not the pixels. (G53 phase 1, picker previews.)
//
// The picker draws a small portrait of each mega type, and the portrait is DERIVED from the same
// `shape()` spec the real renderer will one day consume: a shell's arc follows its coverage, a
// swarm's dot count follows its density, a band's thickness follows its width-to-radius ratio.
// That is the physics→data→visuals chain in miniature — the preview cannot disagree with the
// registry because it is computed from it.
//
// PURE AND HEADLESS ON PURPOSE (E7): this module returns primitive DATA (circles, arcs, dots,
// lines in a 64×64 box); `MegaPreview.svelte` maps them to SVG elements and owns nothing but
// colour. So every proportion here is an ordinary assertion, and the Svelte file has no maths to
// get wrong. Deterministic throughout — the swarm dots use the golden angle, never RNG, so the
// same record always draws the same portrait (the §3.7 determinism rule).
//
// HONESTY FLOORS: real proportions are often invisible (a ringworld band subtends 0.01 rad — a
// hairline), so strokes are clamped into a legible range. A preview is a portrait, not a plot;
// the honest NUMBERS live in `derive()` and the summary line, not in the stroke widths.
import type { CelestialBody } from '$lib/types';
import type { MegaTypeDef, MegaDerived } from './megaTypes';
import { defaultMegaParams } from './megaTypes';

export const PREVIEW_BOX = 64;

export type PreviewPrim =
  | { kind: 'circle'; cx: number; cy: number; r: number; width: number; role: PreviewRole; dashed?: boolean }
  | { kind: 'disc'; cx: number; cy: number; r: number; role: PreviewRole }
  | { kind: 'arc'; cx: number; cy: number; r: number; startRad: number; sweepRad: number; width: number; role: PreviewRole }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; width: number; role: PreviewRole }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; role: PreviewRole }
  | { kind: 'dots'; points: { x: number; y: number }[]; r: number; role: PreviewRole };

/** 'structure' takes the template's own colour; 'host' is the world/star it attends; 'faint' is
 *  scaffolding (the un-built remainder of a shell, a dashed guide). */
export type PreviewRole = 'structure' | 'host' | 'faint';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** The golden angle, radians — even angular coverage with no RNG (§5b.4's Fibonacci note). */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * The portrait for one registry record, derived from `shape()` at default params for this host.
 * A host that cannot take the type still gets a portrait (the row is dimmed as a whole); where a
 * derivation honestly has no answer there (an elevator with no geostationary) the generic form is
 * drawn rather than nothing, because a blank square reads as a bug, not a refusal.
 */
export function megaPreviewPrimitives(def: MegaTypeDef, host: CelestialBody): PreviewPrim[] {
  const params = defaultMegaParams(def, host);
  const spec = def.shape(params, host);
  const c = PREVIEW_BOX / 2;

  if (spec.family === 'tether') {
    // Ground arc along the bottom, ribbon up to the geostationary anchor, counterweight above it.
    return [
      { kind: 'arc', cx: c, cy: 92, r: 46, startRad: Math.PI * 1.28, sweepRad: Math.PI * 0.44, width: 3, role: 'host' },
      { kind: 'line', x1: c, y1: 47, x2: c, y2: 17, width: 2, role: 'structure' },
      { kind: 'disc', cx: c, cy: 17, r: 2.2, role: 'structure' },
      { kind: 'rect', x: c - 4, y: 6, w: 8, h: 6, role: 'structure' }
    ];
  }

  if (spec.family === 'spheroid') {
    const prims: PreviewPrim[] = [
      { kind: 'circle', cx: c, cy: c, r: 19, width: 2, role: 'structure' },
      // The equatorial trench line — a chord, slightly south, so it reads as a sphere not a ring.
      { kind: 'line', x1: c - 17.5, y1: c + 6, x2: c + 17.5, y2: c + 6, width: 1.2, role: 'structure' }
    ];
    if (def.dished) {
      prims.push({ kind: 'circle', cx: c - 7, cy: c - 7, r: 6, width: 1.5, role: 'structure' });
    }
    return prims;
  }

  // sphere-section: shell / ringworld / torus / swarm — all one family (§5b.4).
  const hostIsStar = def.requires.hard?.hostIsStar === true;
  const hostDot: PreviewPrim = hostIsStar
    ? { kind: 'disc', cx: c, cy: c, r: 4, role: 'host' }       // a star: small and bright
    : { kind: 'disc', cx: c, cy: c, r: 9, role: 'host' };      // a world: the ring hugs it
  const R = 23;

  if (spec.drawnAs === 'points') {
    // Collector count follows the density knob — the same number that drives occlusion and power.
    const n = 8 + Math.round((spec.pointDensityFrac ?? 0) * 24);
    const points = Array.from({ length: n }, (_, i) => {
      const a = i * GOLDEN_ANGLE;
      // Two shells of orbits so a dense swarm reads as a cloud, not a necklace. Deterministic.
      const r = R - (i % 3) * 3;
      return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
    });
    return [hostDot, { kind: 'dots', points, r: 1.6, role: 'structure' }];
  }

  const fullPhi = spec.phiLengthRad >= 2 * Math.PI - 1e-9;
  if (!fullPhi) {
    // A growing shell: the built arc spans the coverage; the remainder is a dashed promise.
    return [
      hostDot,
      { kind: 'circle', cx: c, cy: c, r: R, width: 1, role: 'faint', dashed: true },
      { kind: 'arc', cx: c, cy: c, r: R, startRad: -Math.PI / 2, sweepRad: spec.phiLengthRad, width: 5, role: 'structure' }
    ];
  }

  // A closed band or shell. Thickness follows the latitude extent: a ringworld's sliver draws as a
  // fine hoop, a full sphere as a heavy shell — clamped legible, never zero.
  const bandFrac = clamp(spec.thetaLengthRad / Math.PI, 0, 1);
  const width = clamp(1.5 + bandFrac * 9, 1.5, 10);
  return [hostDot, { kind: 'circle', cx: c, cy: c, r: R, width, role: 'structure' }];
}

const shortNum = (v: number): string => {
  if (v >= 1e6) return `${(v / 1e6).toPrecision(2)} million`;
  if (v >= 1e3) return `${(v / 1e3).toPrecision(2)} thousand`;
  return v.toPrecision(2);
};

/**
 * One line of honest numbers for the picker footer, from `derive()` at defaults on THIS host.
 * At most two figures, human framing on the OUTPUT only (the standing rule): "about Earth
 * gravity" is welcome here; nothing anthropocentric fed the derivation.
 */
export function megaSummaryLine(derived: MegaDerived): string {
  const parts: string[] = [];
  if (derived.spinGravityMs2 !== undefined) {
    parts.push(`spin gravity ~${(derived.spinGravityMs2 / 9.80665).toFixed(2)} g`);
  }
  if (derived.areaEarths !== undefined && derived.areaEarths >= 0.01) {
    parts.push(`${shortNum(derived.areaEarths)} Earths of floor`);
  }
  if (derived.tetherSpecificStrengthGPa !== undefined) {
    parts.push(`ribbon needs ~${derived.tetherSpecificStrengthGPa.toPrecision(3)} GPa·cm³/g here`);
  } else if (derived.geoAltitudeKm === null) {
    parts.push('no real geostationary here');
  }
  if (derived.starOcclusion !== undefined && derived.starOcclusion > 0) {
    // A band's shadow is directional (G53 phase 4): "dims the star 100%" would be true only for
    // worlds in its own plane, so say the directional thing instead of the misleading number.
    parts.push(derived.occlusionBandWidthKm !== undefined
      ? 'shadows worlds in its own plane'
      : `dims the star ${(derived.starOcclusion * 100).toFixed(0)}%`);
  }
  if (derived.surfaceGravityMs2 !== undefined) {
    parts.push(`surface pull ~${(derived.surfaceGravityMs2 / 9.80665).toPrecision(2)} g`);
  }
  return parts.slice(0, 2).join(' · ');
}
