// SpaceEngine (.sc) import — map parsed blocks to an SSG System (authored inputs only). Design §3/§6a.
import { G, AU_KM, EARTH_MASS_KG, SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '$lib/constants';
import type { System, CelestialBody, Barycenter, Kepler, Makeup } from '$lib/types';
import { parseSc, readScSources, type ScBlock } from './parse';
import type { ReferenceSnapshot, SkippedEntity, ImportCounts } from '../shared/review';

export const SE_RECOMMENDED_MIN_MASS_KG = 1e20; // keeps major moons + dwarf planets; below = small bodies

export interface ScImportOptions { minBodyMassKg?: number; }
export interface ScImportResult {
  system: System;
  snapshot: ReferenceSnapshot;
  skipped: SkippedEntity[];
  assumptions: string[];
  counts: ImportCounts;
}
export interface ScBodyPreview { name: string; mass: number; type: string; }

const DEG = Math.PI / 180;
const num = (s: string | undefined): number | undefined => { if (s == null) return undefined; const v = Number(s); return Number.isFinite(v) ? v : undefined; };
const sub = (b: ScBlock, type: string) => b.blocks.find((x) => x.type === type);

function hash8(text: string): string {
  let h = 5381; for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

// Interior composition species → SSG makeup component.
const MAKEUP_MAP: Record<string, keyof Makeup> = {
  Metals: 'metal', Iron: 'metal', Silicates: 'rock', Rock: 'rock', Carbonates: 'rock', Carbon: 'carbon',
  Ice: 'ice', Ices: 'ice', Water: 'ice', WaterIce: 'ice', Hydrogen: 'gas', Helium: 'gas', Gas: 'gas'
};

function starClassFromSpectral(cls: string | undefined): string {
  const letter = (cls ?? '').trim().charAt(0).toUpperCase();
  return 'OBAFGKM'.includes(letter) ? `star/${letter}` : 'star/G';
}

function massKgOf(b: ScBlock): number {
  const k = b.keys;
  if (b.type === 'Star') { const ms = num(k.MassSol) ?? num(k.MassSun); if (ms != null) return ms * SOLAR_MASS_KG; }
  if (num(k.MassKg) != null) return num(k.MassKg)!;
  if (num(k.MassSol) != null) return num(k.MassSol)! * SOLAR_MASS_KG;
  if (num(k.MassJup) != null) return num(k.MassJup)! * 1.898e27;
  if (num(k.MassEarth) != null) return num(k.MassEarth)! * EARTH_MASS_KG;
  if (num(k.Mass) != null) return num(k.Mass)! * EARTH_MASS_KG; // planets/moons: Earth masses
  return 0;
}

function radiusKmOf(b: ScBlock): number | undefined {
  const k = b.keys;
  if (b.type === 'Star' && num(k.RadSol) != null) return num(k.RadSol)! * SOLAR_RADIUS_KM;
  if (num(k.RadiusSol) != null) return num(k.RadiusSol)! * SOLAR_RADIUS_KM;
  if (num(k.RadiusKm) != null) return num(k.RadiusKm)!;
  if (num(k.RadiusEarth) != null) return num(k.RadiusEarth)! * 6371;
  if (num(k.Radius) != null) return num(k.Radius)!; // km
  return undefined;
}

function orbitElements(b: ScBlock): Kepler | null {
  const o = sub(b, 'Orbit'); if (!o) return null;
  const k = o.keys;
  let aAU = num(k.SemiMajorAxis);
  if (aAU == null && num(k.SemiMajorAxisKm) != null) aAU = num(k.SemiMajorAxisKm)! / AU_KM;
  if (aAU == null || !(aAU > 0)) return null; // no usable orbit (root / analytic-only)
  const e = num(k.Eccentricity) ?? 0;
  const i = num(k.Inclination) ?? 0;
  const Omega = num(k.AscendingNode) ?? 0;
  // arg of pericentre: direct (two spellings) or from longitude of pericentre
  let omega = num(k.ArgOfPericen) ?? num(k.ArgOfPericenter);
  const longPeri = num(k.LongOfPericen);
  if (omega == null && longPeri != null) omega = longPeri - Omega;
  omega = omega ?? 0;
  // mean anomaly: direct, or from mean longitude
  let M0deg = num(k.MeanAnomaly);
  if (M0deg == null && num(k.MeanLongitude) != null) M0deg = num(k.MeanLongitude)! - (longPeri ?? Omega + omega);
  M0deg = M0deg ?? 0;
  return {
    a_AU: aAU, e: Math.max(0, Math.min(0.999, e)), i_deg: i, Omega_deg: Omega, omega_deg: omega,
    M0_rad: ((M0deg * DEG) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)
  };
}

function rotationHours(b: ScBlock): number | undefined {
  const rp = num(b.keys.RotationPeriod); if (rp != null && rp !== 0) return Math.abs(rp);
  const rm = sub(b, 'RotationModel'); const rate = rm ? num(rm.keys.RotationRate) : undefined; // deg/day
  if (rate != null && rate !== 0) return Math.abs(360 / rate * 24);
  return undefined;
}

function makeupFromInterior(b: ScBlock, assumptions: string[], name: string): Makeup | undefined {
  const interior = sub(b, 'Interior'); const comp = interior ? sub(interior, 'Composition') : undefined;
  if (!comp) return undefined;
  const acc: Record<string, number> = {}; let total = 0, unknown = 0;
  for (const [species, val] of Object.entries(comp.keys)) {
    const pct = num(val); if (pct == null || pct <= 0) continue;
    const key = MAKEUP_MAP[species];
    if (!key) { unknown += pct; continue; }
    acc[key] = (acc[key] ?? 0) + pct; total += pct;
  }
  if (total <= 0) return undefined;
  const mk: Makeup = {};
  for (const [key, pct] of Object.entries(acc)) (mk as Record<string, number>)[key] = +(pct / (total + unknown)).toFixed(4);
  return mk;
}

const GAS_NAMES = new Set(['N2', 'O2', 'Ar', 'CO2', 'H2O', 'CH4', 'NH3', 'H2', 'He', 'CO', 'SO2', 'Ne', 'Kr', 'Xe']);
function atmosphereFrom(b: ScBlock): CelestialBody['atmosphere'] | undefined {
  if (b.keys.NoAtmosphere === 'true') return undefined;
  const atm = sub(b, 'Atmosphere'); if (!atm) return undefined;
  const pressureAtm = num(atm.keys.Pressure);
  const comp = sub(atm, 'Composition');
  const composition: Record<string, number> = {};
  if (comp) {
    let total = 0; const raw: Record<string, number> = {};
    for (const [sp, v] of Object.entries(comp.keys)) { const p = num(v); if (p != null && p > 0 && GAS_NAMES.has(sp)) { raw[sp] = p; total += p; } }
    if (total > 0) for (const [sp, p] of Object.entries(raw)) composition[sp] = +(p / total).toFixed(4);
  }
  if (!(pressureAtm != null && pressureAtm > 0) && !Object.keys(composition).length) return undefined;
  let main = ''; let best = 0; for (const [sp, f] of Object.entries(composition)) if (f > best) { best = f; main = sp; }
  return { name: '', composition, ...(pressureAtm != null ? { pressure_bar: +pressureAtm.toFixed(4) } : {}), ...(main ? { main } : {}) };
}

export function convertSc(sources: string[], options: ScImportOptions = {}): ScImportResult {
  const minMass = options.minBodyMassKg ?? SE_RECOMMENDED_MIN_MASS_KG;
  const simHash = hash8(sources.join('\n').slice(0, 100000));
  const bodies: ScBlock[] = sources.flatMap((s) => parseSc(s));
  const skipped: SkippedEntity[] = [];
  const assumptions: string[] = [];
  const snapshot: ReferenceSnapshot = {};

  // id + alias index (ParentBody references a name; names carry "/" aliases)
  const idOf = new Map<ScBlock, string>();
  const aliasToId = new Map<string, string>();
  bodies.forEach((b, i) => {
    const id = `se-${simHash}-${i}`; idOf.set(b, id);
    for (const alias of (b.name ?? '').split('/')) { const a = alias.trim(); if (a) aliasToId.set(a, id); }
  });
  const bodyById = new Map<string, ScBlock>(bodies.map((b) => [idOf.get(b)!, b]));

  // parent resolution + role
  const parentIdOf = new Map<string, string | null>();
  for (const b of bodies) {
    const id = idOf.get(b)!;
    const pName = (b.keys.ParentBody ?? '').trim();
    const pid = pName ? aliasToId.get(pName) ?? null : null;
    parentIdOf.set(id, pid && pid !== id ? pid : null); // self-reference / unknown → root
  }
  const roleOf = (id: string): 'star' | 'planet' | 'moon' | 'barycenter' => {
    const b = bodyById.get(id)!;
    if (b.type === 'Star') return 'star';
    if (b.type === 'Barycenter') return 'barycenter';
    const pid = parentIdOf.get(id);
    const pt = pid ? bodyById.get(pid)?.type : undefined;
    return pt === 'Star' || pt === 'Barycenter' || pt === undefined ? 'planet' : 'moon';
  };

  // masses (barycentre effective mass = sum of its members)
  const massOf = new Map<string, number>();
  for (const b of bodies) massOf.set(idOf.get(b)!, massKgOf(b));
  const memberIdsOf = new Map<string, string[]>();
  for (const b of bodies) { const pid = parentIdOf.get(idOf.get(b)!); if (pid) { (memberIdsOf.get(pid) ?? memberIdsOf.set(pid, []).get(pid)!).push(idOf.get(b)!); } }
  for (const b of bodies) if (b.type === 'Barycenter') { const id = idOf.get(b)!; massOf.set(id, (memberIdsOf.get(id) ?? []).reduce((s, cid) => s + (massOf.get(cid) ?? 0), 0)); }

  // mass slider: never skip a body that is someone's parent (would orphan children)
  const isParent = new Set<string>(); for (const pid of parentIdOf.values()) if (pid) isParent.add(pid);

  const nodes: (CelestialBody | Barycenter)[] = [];
  const counts: ImportCounts = { stars: 0, planets: 0, moons: 0, other: 0, rings: 0 };
  let belowThreshold = 0;
  const kept = new Set<string>();

  for (const b of bodies) {
    const id = idOf.get(b)!;
    const role = roleOf(id);
    const mass = massOf.get(id) ?? 0;
    if (role !== 'star' && role !== 'barycenter' && !isParent.has(id) && mass > 0 && mass < minMass) { belowThreshold++; continue; }
    kept.add(id);
  }
  if (belowThreshold) skipped.push({ name: `${belowThreshold} small bodies below ${minMass.toExponential(1)} kg`, reason: 'below-mass-threshold' });

  for (const b of bodies) {
    const id = idOf.get(b)!; if (!kept.has(id)) continue;
    const role = roleOf(id);
    const pid = parentIdOf.get(id);
    const parentId = pid && kept.has(pid) ? pid : null;
    const name = (b.name ?? id).split('/')[0].trim();

    if (role === 'barycenter') {
      const bary: Barycenter = { id, name, kind: 'barycenter', parentId, memberIds: (memberIdsOf.get(id) ?? []).filter((c) => kept.has(c)), tags: [] } as any;
      const el = orbitElements(b);
      if (el && parentId) bary.orbit = { hostId: parentId, elements: el, t0: 0, hostMu: G * (massOf.get(parentId) ?? 0) };
      nodes.push(bary); counts.other++; continue;
    }

    const node: CelestialBody = { id, parentId, name, kind: 'body', roleHint: role, massKg: massOf.get(id) || undefined, tags: [] };
    const r = radiusKmOf(b); if (r) node.radiusKm = r;

    const el = orbitElements(b);
    if (el && parentId) {
      node.orbit = { hostId: parentId, elements: el, t0: 0, hostMu: G * (massOf.get(parentId) ?? 0) };
      if (el.i_deg > 90) node.orbit.isRetrogradeOrbit = true;
    }

    const rot = rotationHours(b); if (rot != null) node.rotation_period_hours = rot;
    const obl = num(b.keys.Obliquity); if (obl != null) { (node as any).axial_tilt_deg = +obl.toFixed(2); node.obliquity_deg = +obl.toFixed(2); }

    if (role === 'star') {
      node.temperatureK = num(b.keys.Temperature) ?? 5778;
      node.classes = [starClassFromSpectral(b.keys.Class)];
      const lum = num(b.keys.Luminosity) ?? num(b.keys.LumBol);
      if (lum != null) (node as any).radiationOutput = lum;
      counts.stars++;
    } else {
      const mk = makeupFromInterior(b, assumptions, name); if (mk) node.makeup = mk;
      const atm = atmosphereFrom(b); if (atm) node.atmosphere = atm;
      if (sub(b, 'Ocean')) { node.hydrosphere = { composition: 'water', coverage: 0.6 }; assumptions.push(`${name}: ocean present in the source but coverage isn't stored — assumed 60%.`); }
      if (role === 'planet') counts.planets++; else counts.moons++;
    }

    // reference snapshot (source values we did not import) for the audit
    snapshot[id] = { name, roleHint: role, albedo: num(b.keys.AlbedoBond), densityKgM3: undefined };
    nodes.push(node);
  }

  // system age from a star's Age (Gyr)
  let ageGyr = 4.6;
  const starAges = bodies.filter((b) => b.type === 'Star').map((b) => num(b.keys.Age)).filter((a): a is number => a != null && a > 0);
  if (starAges.length) ageGyr = +Math.max(...starAges).toFixed(3);
  else assumptions.push('System age assumed 4.6 Gyr (no star age in the source) — set it in System Settings.');

  const rootBody = bodies.find((b) => parentIdOf.get(idOf.get(b)!) === null);
  const system: System = {
    id: `se-${simHash}`, name: (rootBody?.name ?? 'SpaceEngine import').split('/')[0].trim(),
    seed: `se-${simHash}`, epochT0: Date.now(), age_Gyr: ageGyr, nodes, rulePackId: '', rulePackVersion: '', tags: []
  };
  return { system, snapshot, skipped, assumptions, counts };
}

/** Cheap pre-scan of body masses for the slider (heaviest first). */
export function previewSc(sources: string[]): { name: string; bodies: ScBodyPreview[] } {
  const bodies = sources.flatMap((s) => parseSc(s));
  const list: ScBodyPreview[] = bodies
    .filter((b) => b.type !== 'Barycenter')
    .map((b) => ({ name: (b.name ?? '').split('/')[0].trim(), mass: massKgOf(b), type: b.type }))
    .filter((x) => x.mass > 0)
    .sort((a, b) => b.mass - a.mass);
  const root = bodies.find((b) => !b.keys.ParentBody || b.keys.ParentBody === b.name);
  return { name: (root?.name ?? 'SpaceEngine system').split('/')[0].trim(), bodies: list };
}

export { readScSources };
