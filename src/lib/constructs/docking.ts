// DOCKING - where a ship can attach to a structure, and where it IS once attached (G53 phase 5).
//
// THE OWNER'S REQUIREMENT (2026-09-03, mega-constructs-design.md 7c): stations up the elevator at
// LO/MO/GO that turn with the world so docked ships ride with them; rings and spheres that take a
// ship at the nearest point ("docking ports everywhere") and carry it round; and ONE answer for
// the GM map, the holo and the player views. That last clause decides the architecture: an
// attachment is DATA the propagator owns. A construct carries `attachedTo` - a structure id and a
// point in the structure's ROTATING frame - and `attachedOffsetAu` turns it into a world offset
// that every consumer reads. Nothing here touches THREE or a canvas (E7): it is all arithmetic,
// and all of it is gated.
//
// CO-ROTATION IS NOT ORBIT. A ship docked to a tether moves at the WORLD's spin rate at every
// level - slower than a circular orbit below geostationary (attached, not orbiting: let go and it
// falls), exactly orbit at GEO (free fall), faster above (let go and it is flung). A ship on a
// ring's rim moves at the rim speed the rotation knob sets. `dockMatchSpeedMs` states the gap
// between a circular orbit at that radius and riding the structure, so the planner can say what
// docking COSTS - steer, never stop: it tags and explains, it never refuses.
//
// THE SPIN MIRRORS THE RENDERER, TO THE SIGN. holo/scene.ts updateSpin turns a globe by
// angle = -(tSec / spinPeriodSec) * 2pi about its local pole and then tilts the pole by
// `axial_tilt_deg` about the scene Z axis (mesh.quaternion = tilt x spin). The scene maps physics
// (x, y, z) to scene (x, z, y), so that spin is a PROGRADE rotation by +(tSec/P)*2pi about physics
// +z, and that tilt is a rotation of the physics (x, z) pair by tiltRad. `hostFrameDir` performs
// exactly those two steps - the gate pins both - so an anchor computed here stands where the
// renderer's globe turns, and the ribbon and the ships on it are one answer.
import type { CelestialBody, System } from '../types';
import { AU_KM, G } from '../constants';
import { megaTypeDef, instanceMegaParams, type MegaTypeDef } from './megaTypes';
import { tetherAltitudesKm } from './megaGeometry';
import type { ExoticDocking } from './exotics';
import { parkingOrbitRadiusKm } from '../physics/orbits';

export interface Vec3 { x: number; y: number; z: number; }

const TWO_PI = Math.PI * 2;
const DEG = Math.PI / 180;
const AU_M = AU_KM * 1000;

/** The rungs of a ladder structure, bottom to top. */
export const LADDER_LEVELS = ['anchor', 'lo', 'mo', 'geo', 'counterweight'] as const;
export type LadderLevel = (typeof LADDER_LEVELS)[number];
export const LADDER_LABELS: Record<LadderLevel, string> = {
  anchor: 'Anchor (surface)',
  lo: 'Low-orbit level',
  mo: 'Medium-orbit level',
  geo: 'Geostationary dock',
  counterweight: 'Counterweight'
};

/** A construct's attachment: WHICH structure, and WHERE on it, in the structure's own frame.
 *  ladder: `level`; anywhere: `angleRad` (about the structure's axis, at its epoch) and `latRad`;
 *  point: the id alone. Authored on the node, or derived by the journey sampler from an arrival. */
export interface Attachment { id: string; level?: LadderLevel; angleRad?: number; latRad?: number; }

export interface DockPort { id: LadderLevel; label: string; radiusKm: number; }

/** The record's docking capability, or null for a node that is not an exotic (a plain station
 *  docks as a point by the scheduler's standing rule - it needs no record to say so). */
export function dockingOf(node: any): ExoticDocking | null {
  const def = megaTypeDef(node?.megaType);
  return def ? def.capabilities.docking : null;
}

/** What places this construct, if anything does: its authored `attachedTo`, or - for a ladder
 *  structure - ITSELF at the anchor, because a beanstalk stands on its anchor ray whatever
 *  placeholder orbit the create path gave it. Null for everything else. */
export function effectiveAttachment(node: any): Attachment | null {
  if (node?.attachedTo?.id) return node.attachedTo as Attachment;
  if (dockingOf(node) === 'ladder') return { id: node.id, level: 'anchor' };
  return null;
}

function authoredRibbonKm(node: any): number | undefined {
  const dims = (node?.physical_parameters?.dimensionsM ?? []) as number[];
  const km = Math.max(0, ...dims.map((d) => Math.abs(Number(d)) || 0)) / 1000;
  return km > 0 ? km : undefined;
}

/**
 * The ports up a ladder structure, radii from the HOST's centre. Anchor = the host's surface; the
 * low and medium levels are the planner's own parking radii for that world (`parkingOrbitRadiusKm`,
 * so "LO - Elevator" is the same height as "LO"), kept only when they fall between the anchor and
 * geo; geo = the dock the shape publishes; counterweight = the ribbon's top.
 */
export function ladderPorts(structure: CelestialBody, host: CelestialBody, system?: System): DockPort[] {
  const def = megaTypeDef(structure?.megaType);
  if (!def || def.capabilities.docking !== 'ladder') return [];
  const spec = def.shape(instanceMegaParams(structure, def, host), host);
  if (spec.family !== 'tether') return [];
  const alt = tetherAltitudesKm(spec, authoredRibbonKm(structure));
  const R = host.radiusKm || 0;
  if (!alt || !(R > 0)) return [];
  const geoR = R + alt.dockKm;
  const out: DockPort[] = [{ id: 'anchor', label: LADDER_LABELS.anchor, radiusKm: R }];
  const lo = parkingOrbitRadiusKm(host, 'lo', undefined, system);
  const mo = parkingOrbitRadiusKm(host, 'mo', undefined, system);
  if (lo && lo > R && lo < geoR) out.push({ id: 'lo', label: LADDER_LABELS.lo, radiusKm: lo });
  if (mo && mo > (lo ?? R) && mo < geoR) out.push({ id: 'mo', label: LADDER_LABELS.mo, radiusKm: mo });
  out.push({ id: 'geo', label: LADDER_LABELS.geo, radiusKm: geoR });
  out.push({ id: 'counterweight', label: LADDER_LABELS.counterweight, radiusKm: R + alt.topKm });
  return out;
}

export function ladderLevelRadiusKm(level: LadderLevel, structure: CelestialBody, host: CelestialBody, system?: System): number | null {
  return ladderPorts(structure, host, system).find((p) => p.id === level)?.radiusKm ?? null;
}

/** A stable site on the unit sphere from an id - the hash the renderer has always used for a
 *  surface construct with no authored site (scene.ts surfacePointFromId), kept identical here so
 *  the propagator and the renderer land the same construct on the same spot. */
export function hashedSurfaceSite(id: string): { lonRad: number; latRad: number } {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  const lonRad = (((h >>> 0) % 65536) / 65536) * TWO_PI;
  const latRad = Math.asin((((h >>> 11) % 65536) / 65536) * 2 - 1);
  return { lonRad, latRad };
}

/**
 * The anchor's direction in the host's LOCAL frame (pole = +z, longitude from +x in the equatorial
 * plane). An authored `surface_anchor { latDeg, lonDeg }` wins; else the id hash. A shape that
 * declares an anchor latitude (the tether: 0, the equator) overrides the latitude - physics of
 * the structure, not a preference.
 */
export function anchorLocalDir(structure: any, spec?: { anchorLatitudeDeg?: number } | null): Vec3 {
  const authored = structure?.surface_anchor;
  let lon: number, lat: number;
  if (authored && typeof authored.lonDeg === 'number') {
    lon = authored.lonDeg * DEG;
    lat = (typeof authored.latDeg === 'number' ? authored.latDeg : 0) * DEG;
  } else {
    const h = hashedSurfaceSite(String(structure?.id ?? ''));
    lon = h.lonRad; lat = h.latRad;
  }
  if (spec && typeof spec.anchorLatitudeDeg === 'number') lat = spec.anchorLatitudeDeg * DEG;
  const cl = Math.cos(lat);
  return { x: cl * Math.cos(lon), y: cl * Math.sin(lon), z: Math.sin(lat) };
}

/** The host's spin angle at `timeMs`, radians, prograde about its pole - the renderer's
 *  -(tSec/P)*2pi about the scene pole, expressed in the physics frame (see the header). A
 *  negative rotation period turns it retrograde for free. */
export function hostSpinAngleRad(host: any, timeMs: number): number {
  const P = (host?.rotation_period_hours || 0) * 3600;
  if (!P) return 0;
  return ((timeMs / 1000) / P) * TWO_PI;
}

/** A host-local direction turned into the physics frame at `timeMs`: spin about the pole, then
 *  the axial tilt - the two steps the renderer composes, in the same order, with the same signs. */
export function hostFrameDir(local: Vec3, host: any, timeMs: number): Vec3 {
  const th = hostSpinAngleRad(host, timeMs);
  const c = Math.cos(th), s = Math.sin(th);
  const x1 = local.x * c - local.y * s;
  const y1 = local.x * s + local.y * c;
  const z1 = local.z;
  const tau = (host?.axial_tilt_deg || 0) * DEG;
  const ct = Math.cos(tau), st = Math.sin(tau);
  return { x: x1 * ct - z1 * st, y: y1, z: x1 * st + z1 * ct };
}

/** A host-centred structure's own rotation rate, rad/s: its rotation knob when the record has
 *  one (a ring's `rotationPeriodHours`), else its node's mean motion about the host (a shell's
 *  strips orbit), else none. */
export function structureSpinRadPerSec(structure: any, def: MegaTypeDef, host: any): number {
  const params = instanceMegaParams(structure, def, host) as Record<string, number>;
  const h = params.rotationPeriodHours;
  if (typeof h === 'number' && h > 0) return TWO_PI / (h * 3600);
  const aAU = structure?.orbit?.elements?.a_AU;
  const M = host?.massKg || 0;
  if (aAU > 0 && M > 0) { const aM = aAU * AU_M; return Math.sqrt((G * M) / (aM * aM * aM)); }
  return 0;
}

// The structure's orbital plane: R = Rz(Omega) . Rx(i), the standard perifocal-to-inertial turn
// with the argument of periapsis folded into the angle the caller supplies.
function toPlane(x: number, y: number, z: number, el: any): Vec3 {
  const i = (el?.i_deg || 0) * DEG, O = (el?.Omega_deg || 0) * DEG;
  const ci = Math.cos(i), si = Math.sin(i), cO = Math.cos(O), sO = Math.sin(O);
  const y1 = y * ci - z * si, z1 = y * si + z * ci;
  return { x: x * cO - y1 * sO, y: x * sO + y1 * cO, z: z1 };
}
function fromPlane(v: Vec3, el: any): Vec3 {
  const i = (el?.i_deg || 0) * DEG, O = (el?.Omega_deg || 0) * DEG;
  const ci = Math.cos(i), si = Math.sin(i), cO = Math.cos(O), sO = Math.sin(O);
  const x1 = v.x * cO + v.y * sO, y1 = -v.x * sO + v.y * cO;
  return { x: x1, y: y1 * ci + v.z * si, z: -y1 * si + v.z * ci };
}

/** The latitude band a sphere-section actually covers, radians (a ring is a thin band about 0). */
function latitudeBand(spec: any): { min: number; max: number } {
  if (spec?.family !== 'sphere-section') return { min: -Math.PI / 2, max: Math.PI / 2 };
  const t0 = spec.thetaStartRad ?? 0, t1 = t0 + (spec.thetaLengthRad ?? Math.PI);
  return { min: Math.PI / 2 - t1, max: Math.PI / 2 - t0 };
}

/**
 * THE ONE ANSWER: a docked construct's offset from the structure's HOST centre, AU, at `timeMs`.
 * ladder: the level radius along the anchor ray, turned with the world. anywhere: the stored
 * frame point turned by the structure's own rotation, in its orbital plane. point: null - the
 * structure's own position is the answer and every caller already has it.
 */
export function attachedOffsetAu(att: Attachment, structure: any, host: any, timeMs: number, system?: System): Vec3 | null {
  const def = megaTypeDef(structure?.megaType);
  if (!def) return null;
  const docking = def.capabilities.docking;
  if (docking === 'ladder') {
    const level: LadderLevel = att.level ?? 'geo';
    const R = ladderLevelRadiusKm(level, structure, host, system);
    if (!(R && R > 0)) return null;
    const spec = def.shape(instanceMegaParams(structure, def, host), host) as any;
    const d = hostFrameDir(anchorLocalDir(structure, spec), host, timeMs);
    const k = R / AU_KM;
    return { x: d.x * k, y: d.y * k, z: d.z * k };
  }
  if (docking === 'anywhere') {
    const el = structure?.orbit?.elements;
    const aAU = el?.a_AU;
    if (!(aAU > 0)) return null;
    const w = structureSpinRadPerSec(structure, def, host);
    const psi = (att.angleRad ?? 0) + w * (timeMs / 1000);
    const lat = att.latRad ?? 0, cl = Math.cos(lat);
    return toPlane(aAU * cl * Math.cos(psi), aAU * cl * Math.sin(psi), aAU * Math.sin(lat), el);
  }
  return null;
}

/**
 * Where a ship at `shipOffsetAu` (from the structure's host centre) docks at `timeMs`: the nearest
 * port. ladder: the nearest level by radius. anywhere: the ship's own bearing in the structure's
 * plane, stored at the structure's epoch so the point is under the ship NOW and rides with the
 * structure afterwards; the latitude is clamped to the band the structure actually covers.
 */
export function nearestAttachment(structure: any, host: any, shipOffsetAu: Vec3, timeMs: number, system?: System): Attachment | null {
  const def = megaTypeDef(structure?.megaType);
  if (!def) return null;
  const docking = def.capabilities.docking;
  if (docking === 'ladder') {
    const ports = ladderPorts(structure, host, system);
    if (!ports.length) return null;
    const r = Math.hypot(shipOffsetAu.x, shipOffsetAu.y, shipOffsetAu.z) * AU_KM;
    let best = ports[0];
    for (const p of ports) if (Math.abs(p.radiusKm - r) < Math.abs(best.radiusKm - r)) best = p;
    return { id: structure.id, level: best.id };
  }
  if (docking === 'anywhere') {
    const el = structure?.orbit?.elements;
    const w = structureSpinRadPerSec(structure, def, host);
    const v = fromPlane(shipOffsetAu, el);
    const r = Math.hypot(v.x, v.y, v.z);
    const psiNow = Math.atan2(v.y, v.x);
    const band = latitudeBand(def.shape(instanceMegaParams(structure, def, host), host));
    const lat = r > 0 ? Math.max(band.min, Math.min(band.max, Math.asin(Math.max(-1, Math.min(1, v.z / r))))) : 0;
    return { id: structure.id, angleRad: psiNow - w * (timeMs / 1000), latRad: lat };
  }
  return { id: structure.id };
}

/** The docked point's own speed, m/s - |omega x r|: the world's spin at a ladder level, the
 *  structure's rotation at a rim or shell point, nothing at a hull. */
export function dockSpeedMs(att: Attachment, structure: any, host: any, timeMs: number, system?: System): number {
  const def = megaTypeDef(structure?.megaType);
  if (!def) return 0;
  if (def.capabilities.docking === 'ladder') {
    const R = ladderLevelRadiusKm(att.level ?? 'geo', structure, host, system);
    const P = Math.abs((host?.rotation_period_hours || 0) * 3600);
    return R && P ? (TWO_PI / P) * R * 1000 : 0;
  }
  if (def.capabilities.docking === 'anywhere') {
    const aAU = structure?.orbit?.elements?.a_AU;
    if (!(aAU > 0)) return 0;
    return structureSpinRadPerSec(structure, def, host) * aAU * AU_M * Math.cos(att.latRad ?? 0);
  }
  return 0;
}

/** WHAT DOCKING COSTS beyond arriving: the gap between a circular orbit at the docked radius and
 *  riding the structure there, m/s. Near zero at a geostationary dock; a near-landing at a low
 *  level; the rim speed less orbit for a Niven ring. Null when the radius or mass is unknown. */
export function dockMatchSpeedMs(att: Attachment, structure: any, host: any, timeMs: number, system?: System): number | null {
  const def = megaTypeDef(structure?.megaType);
  if (!def) return null;
  const M = host?.massKg || 0;
  let Rm = 0;
  if (def.capabilities.docking === 'ladder') Rm = (ladderLevelRadiusKm(att.level ?? 'geo', structure, host, system) ?? 0) * 1000;
  else if (def.capabilities.docking === 'anywhere') Rm = (structure?.orbit?.elements?.a_AU ?? 0) * AU_M * Math.cos(att.latRad ?? 0);
  if (!(Rm > 0) || !(M > 0)) return null;
  const vCirc = Math.sqrt((G * M) / Rm);
  return Math.abs(vCirc - dockSpeedMs(att, structure, host, timeMs, system));
}
