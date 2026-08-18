// Universe Sandbox (.ubox) import — entities → SSG System (authored inputs only). Design §7.
import { G, AU_KM } from '$lib/constants';
import { guessSystemAge } from '$lib/physics/systemAge';
import { resolveImportedStarClass } from '$lib/physics/importedStarClass';
import type { System, CelestialBody } from '$lib/types';
import { parseVec3, parseQuat, cleanHorizonId } from './parse';
import { obliquityDeg, rotationHoursFromAngularVelocity, type V3 } from './kepler';
import { inferHierarchy, type BodyInput, type Placement } from './hierarchy';
import type {
  ParsedUbox, UsEntity, UsComponent, UboxImportOptions, UboxImportResult,
  UsReferenceSnapshot, SkippedEntity
} from './types';

export const RECOMMENDED_MIN_MASS_KG = 5e20;
const GYR_S = 3.156e16;
const L_SUN = 3.846e26;
const AU_M = AU_KM * 1000;

// depot name → makeup component (interior only; gases + liquid Water excluded)
const MAKEUP_MAP: Record<string, keyof import('$lib/types').Makeup> = {
  Iron: 'metal', Silicate: 'rock', Carbon: 'carbon',
  'Water Ice': 'ice', Ice: 'ice', 'Ammonia Ice': 'ice', 'Methane Ice': 'ice',
  'Nitrogen Ice': 'ice', 'Carbon Dioxide Ice': 'ice'
};
// gas depot name → [SSG species, molecular weight]
const GAS_MAP: Record<string, [string, number]> = {
  Nitrogen: ['N2', 28], Oxygen: ['O2', 32], Argon: ['Ar', 40], 'Carbon Dioxide': ['CO2', 44],
  Hydrogen: ['H2', 2], Helium: ['He', 4], Methane: ['CH4', 16], Ammonia: ['NH3', 17],
  'Sulfur Dioxide': ['SO2', 64]
};

const component = (e: UsEntity, type: string): UsComponent | undefined => (e.Components ?? []).find((c) => c.$type === type);

/** djb2 → 8 hex chars, deterministic for a stable re-import id. */
function hash8(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/**
 * WHAT KIND OF THING IS THIS ENTITY — and the top-level `Category` string is not the whole answer.
 *
 * Universe Sandbox writes category TWICE: a top-level string, and a numeric `Category` on the
 * Celestial component (observed: 2 = star, 3 = planet or moon; absent on ring/fragment particles,
 * which have no Celestial component at all). The top-level string can be BLANK on a real body. The
 * Hystrine file (inbox G32) carries a 1.68-solar-mass, 7.8-solar-luminosity A star with `Category: ""`
 * at the top and `Category: 2`, `StarType: 1`, `Luminosity: 2.97e27` underneath — and this importer
 * read only the string, took blank to mean particle, and DROPPED THE STAR before hierarchy inference
 * ran. The largest gas giant then became root, its moons became planets, thirty of thirty-four
 * bodies unbound against it, and the age fell to the no-star 4.6. The user diagnosed it as an age
 * bug; it was this line.
 *
 * Order of evidence, most explicit first: the top-level string if non-blank; the Celestial numeric
 * category; StarType; a stated luminosity; a stellar mass. A body with NO Celestial component and no
 * mass is a particle. Everything else with mass but no label is a body of unknown category, kept and
 * classified by mass so it is at least not thrown away.
 */
const STELLAR_MASS_KG = 0.075 * 1.989e30;   // the hydrogen-burning limit; a brown dwarf below it is still not a "particle"
export function resolveCategory(e: UsEntity): 'star' | 'planet' | 'moon' | 'sso' | 'blackhole' | null {
  const top = (e.Category ?? '').trim().toLowerCase();
  if (top === 'star' || top === 'planet' || top === 'moon' || top === 'sso' || top === 'blackhole') return top;
  const cel = e.Components?.find((c) => c.$type === 'Celestial');
  if (!cel) return null;                                        // no Celestial component: a particle
  if (cel.Category === 2 || (cel.StarType ?? 0) > 0 || (cel.Luminosity ?? 0) > 0) return 'star';
  if (typeof e.Mass === 'number' && e.Mass >= STELLAR_MASS_KG) return 'star';   // luminous or not, that mass is a star
  if (typeof e.Mass === 'number' && e.Mass > 0) return 'planet';                 // labelled or not, it is a body; hierarchy decides planet vs moon
  return null;
}


function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

export function convertUbox(parsed: ParsedUbox, options: UboxImportOptions = {}): UboxImportResult {
  const minMass = options.minBodyMassKg ?? RECOMMENDED_MIN_MASS_KG;
  const simHash = hash8(parsed.simText);
  const nodeId = (entId: string) => `us-${simHash}-${entId}`;
  const entities = parsed.sim.Entities;
  const skipped: SkippedEntity[] = [];
  const assumptions: string[] = [];
  const snapshot: UsReferenceSnapshot = {};

  // --- Filtering: dummy, particles (uncategorised, kept for ring aggregation), mass slider ---
  const particles: UsEntity[] = [];
  const bodyInputs: BodyInput[] = [];
  const entityById = new Map<string, UsEntity>();
  let belowThreshold = 0;

  for (const e of entities) {
    const name = (e.Name ?? '').trim();
    if (name === 'dummy') { skipped.push({ name: name || '(dummy)', reason: 'dummy' }); continue; }
    const category = resolveCategory(e);
    if (!category) { particles.push(e); continue; }                 // ring/fragment particles (no Celestial component)
    if (typeof e.Mass !== 'number' || !(e.Mass > 0)) { skipped.push({ name, reason: 'unparseable-entity' }); continue; }
    if (e.Mass < minMass) { belowThreshold++; continue; }
    let pos: V3, vel: V3;
    try { pos = parseVec3(e.Position); vel = parseVec3(e.Velocity); }
    catch { skipped.push({ name, reason: 'unparseable-entity' }); continue; }
    const id = String(e.Id);
    entityById.set(id, e);
    bodyInputs.push({ id, name, category, mass: e.Mass, pos, vel });
  }
  if (belowThreshold > 0) skipped.push({ name: `${belowThreshold} small bodies below ${minMass.toExponential(1)} kg`, reason: 'below-mass-threshold' });

  // --- Hierarchy (local root + Hill parenting) ---
  const { placements, farField, rootId } = inferHierarchy(bodyInputs);
  for (const id of farField) {
    const e = entityById.get(id);
    skipped.push({ name: e?.Name ?? id, reason: 'far-field' });
  }

  const placementById = new Map(placements.map((p) => [p.id, p]));
  const nodes: CelestialBody[] = [];
  const counts = { stars: 0, planets: 0, moons: 0, other: 0, rings: 0 };
  let rootStarEntity: UsEntity | null = null;

  for (const p of placements) {
    const e = entityById.get(p.id)!;
    if (p.unbound) { skipped.push({ name: e.Name ?? p.id, reason: 'unbound' }); continue; }
    nodes.push(buildNode(e, p, nodeId, snapshot, assumptions));
    if (p.roleHint === 'star') counts.stars++;
    else if (p.roleHint === 'planet') counts.planets++;
    else counts.moons++;
    if (p.isRoot && resolveCategory(e) === 'star') rootStarEntity = e;
  }

  if (!nodes.length) {
    // fall through to convert.ts caller which throws empty-system; keep the structured result too
  }

  // Pick the star that governs age: the most massive 'star' among survivors, else the root.
  if (!rootStarEntity) {
    let best: UsEntity | null = null;
    for (const p of placements) {
      if (p.unbound) continue;
      const e = entityById.get(p.id)!;
      if (resolveCategory(e) === 'star' && (!best || (e.Mass ?? 0) > (best.Mass ?? 0))) best = e;
    }
    rootStarEntity = best;
  }

  // --- System age (design §7.4) ---
  const age = resolveAge(rootStarEntity, assumptions);
  const age_Gyr = age.ageGyr;

  // --- Ring aggregation (design §7.6) ---
  aggregateRings(particles, entityById, placementById, nodeId, nodes, counts, skipped, assumptions);

  const name = parsed.sim.Name || 'Universe Sandbox import';
  const nowMs = Date.now();
  const system: System = {
    id: `us-${simHash}`,
    name,
    seed: `us-${simHash}`,
    epochT0: nowMs,
    age_Gyr,
    ageEstimated: age.estimated,
    ageBandGyr: age.band,
    nodes,
    rulePackId: '',           // NOT filled by fixUpImportedSystem (it never reads it) - the LOAD path stamps the current pack when this is blank; see SystemView.isLoadableSystem
    rulePackVersion: '',
    tags: []
  };

  return { system, snapshot, skipped, assumptions, counts };
}

function buildNode(
  e: UsEntity,
  p: Placement,
  nodeId: (id: string) => string,
  snapshot: UsReferenceSnapshot,
  assumptions: string[]
): CelestialBody {
  const heat = component(e, 'HeatComponent');
  const cel = component(e, 'Celestial');
  const comp = component(e, 'CompositionComponent');
  const depots = comp?.depots ?? {};
  const massKg = e.Mass ?? 0;
  const radiusKm = (e.Radius ?? 0) / 1000;
  const radiusM = e.Radius ?? 0;

  const node: CelestialBody = {
    id: nodeId(p.id),
    parentId: p.parentId ? nodeId(p.parentId) : null,
    name: e.Name ?? p.id,
    kind: 'body',
    roleHint: p.roleHint,
    massKg,
    radiusKm,
    tags: []
  };

  if (!p.isRoot && p.elements) {
    node.orbit = { hostId: node.parentId!, elements: p.elements, t0: 0, hostMu: p.hostMu };
    if (p.elements.i_deg > 90) node.orbit.isRetrogradeOrbit = true;
  }

  // Rotation + obliquity (design §5.1)
  try {
    if (e.AngularVelocity) {
      const rot = rotationHoursFromAngularVelocity(parseVec3(e.AngularVelocity));
      if (rot !== null) node.rotation_period_hours = rot;
    }
    if (e.Orientation && e.RotationAxis && e.Position && e.Velocity) {
      const tilt = obliquityDeg(parseQuat(e.Orientation), parseVec3(e.RotationAxis), parseVec3(e.Position), parseVec3(e.Velocity));
      // measured against the body's heliocentric orbit normal; good enough for planets/moons
      (node as CelestialBody & { axial_tilt_deg?: number }).axial_tilt_deg = +tilt.toFixed(2);
    }
  } catch { /* leave rotation/tilt unset on a malformed vector */ }

  // Stars: temperature + luminosity are authored inputs
  if (p.roleHint === 'star') {
    if (p.blackHole) {
      node.temperatureK = 0;
      node.classes = ['star/BH'];
    } else {
      const tempK = heat?.SurfaceTemperature ?? 5778;
      node.temperatureK = tempK;
      if (typeof cel?.Luminosity === 'number' && cel.Luminosity > 0) {
        (node as CelestialBody & { radiationOutput?: number }).radiationOutput = cel.Luminosity / L_SUN;
      }
      // ONE classifier for every importer (physics/importedStarClass.ts). Universe Sandbox states no
      // spectral type, so this is the pure inference path. The converter has no rule pack, so it
      // emits the honest BAND KEY (letter from temperature, L/T/Y aware; luminosity class from
      // temperature+radius where the fallback ladder can say, else main sequence) and leaves
      // `autoClassify` on; `importFixup.resolveLegacyStarClass`, which has the pack, then resolves the
      // full designation against the pack's own bands. Replaces a private ladder that stopped at M.
      const cls = resolveImportedStarClass({ temperatureK: tempK, radiusKm: node.radiusKm, massKg,
        luminositySolar: (node as any).radiationOutput });
      node.classes = [cls.bandKey];
      (node as any).autoClassify = true;
    }
  } else {
    // Planets/moons: makeup, atmosphere, hydrosphere from depots
    const atmosphereMass = cel?.AtmosphereMass ?? 0;
    const waterMass = depots['Water']?.Mass ?? 0;

    const makeup = makeupFromDepots(depots, massKg, atmosphereMass, waterMass, e.Name ?? p.id, assumptions);
    if (makeup) node.makeup = makeup;

    const atmosphere = atmosphereFromDepots(depots, atmosphereMass, massKg, radiusM);
    if (atmosphere) node.atmosphere = atmosphere;

    const hydro = hydrosphereFromWater(waterMass, radiusM);
    if (hydro) node.hydrosphere = hydro;

    // pressure snapshot for the review cross-check
    if (atmosphere?.pressure_bar) recordPressure(snapshot, node.id, atmosphere.pressure_bar);
  }

  // Reference snapshot (US values we did NOT import) — always recorded for the audit.
  snapshot[node.id] = {
    ...(snapshot[node.id] ?? {}),
    name: node.name,
    roleHint: p.roleHint,
    surfaceTemperatureK: heat?.SurfaceTemperature,
    albedo: heat?.Albedo,
    magneticFieldGauss: cel?.MagneticField,
    luminosityW: cel?.Luminosity,
    densityKgM3: e.Density,
    ageGyr: typeof e.Age === 'number' ? e.Age / GYR_S : undefined
  };

  return node;
}

function recordPressure(snapshot: UsReferenceSnapshot, id: string, pressureBar: number) {
  snapshot[id] = { ...(snapshot[id] ?? { name: id, roleHint: 'planet' }), pressureBar };
}

function makeupFromDepots(
  depots: Record<string, { Mass: number }>,
  massKg: number, atmosphereMass: number, waterMass: number,
  bodyName: string, assumptions: string[]
): import('$lib/types').Makeup | null {
  const acc: Record<string, number> = {};
  let mapped = 0;
  let unknown = 0;
  for (const [depotName, d] of Object.entries(depots)) {
    if (depotName === 'Water') continue;                 // liquid water → hydrosphere
    if (GAS_MAP[depotName]) continue;                    // gases → atmosphere
    const key = MAKEUP_MAP[depotName];
    if (!key) { unknown += d.Mass; continue; }
    acc[key] = (acc[key] ?? 0) + d.Mass;
    mapped += d.Mass;
  }
  const interiorMass = Math.max(0, massKg - atmosphereMass - waterMass);
  if (mapped <= 0 || interiorMass <= 0 || mapped < 0.9 * interiorMass) return null; // let density inference take over
  const total = mapped;
  const makeup: import('$lib/types').Makeup = {};
  for (const [k, m] of Object.entries(acc)) (makeup as Record<string, number>)[k] = +(m / total).toFixed(4);
  if (unknown > 0.02 * massKg) assumptions.push(`${bodyName}: some interior material (${(unknown / massKg * 100).toFixed(0)}%) had no SSG equivalent and was ignored for makeup.`);
  return makeup;
}

function atmosphereFromDepots(
  depots: Record<string, { Mass: number }>,
  atmosphereMass: number, massKg: number, radiusM: number
): import('$lib/types').Atmosphere | null {
  if (!(atmosphereMass > 0) || !(radiusM > 0)) return null;
  const moles: Record<string, number> = {};
  let totalMoles = 0;
  for (const [depotName, d] of Object.entries(depots)) {
    const gas = GAS_MAP[depotName];
    if (!gas) continue;
    const [species, mw] = gas;
    const m = d.Mass / mw;
    moles[species] = (moles[species] ?? 0) + m;
    totalMoles += m;
  }
  const g = (G * massKg) / (radiusM * radiusM);
  const pressureBar = (atmosphereMass * g) / (4 * Math.PI * radiusM * radiusM) / 1e5;
  const composition: Record<string, number> = {};
  if (totalMoles > 0) {
    for (const [s, m] of Object.entries(moles)) composition[s] = +(m / totalMoles).toFixed(4);
  }
  let main = ''; let best = 0;
  for (const [s, f] of Object.entries(composition)) if (f > best) { best = f; main = s; }
  return { name: '', composition, pressure_bar: +pressureBar.toFixed(4), ...(main ? { main } : {}) };
}

function hydrosphereFromWater(waterMass: number, radiusM: number): import('$lib/types').Hydrosphere | null {
  if (!(waterMass > 0) || !(radiusM > 0)) return null;
  const depthM = waterMass / (1000 * 4 * Math.PI * radiusM * radiusM);
  const coverage = Math.max(0, Math.min(1, 0.71 * Math.sqrt(depthM / 2790)));
  if (coverage < 0.02) return null;
  return { composition: 'water', coverage: +coverage.toFixed(3) };
}

function resolveAge(rootStar: UsEntity | null, assumptions: string[]): { ageGyr: number; estimated: boolean; band: [number, number] } {
  // ONE age model for every importer (physics/systemAge guessSystemAge). Universe Sandbox stores an
  // age on the star, so a stated age wins when the star can be that old; else the guess is from the
  // primary's own life with the band it makes reasonable. Both are surfaced to the GM.
  if (!rootStar || !(rootStar.Mass ?? 0 > 0)) {
    assumptions.push('NO STAR FOUND in this simulation, so nothing dates the system and nothing anchors the planets. If your scene has a star, check its Category in Universe Sandbox; otherwise add one in the infill step. The galactic-median age is used meanwhile.');
    const g = guessSystemAge(null);
    return { ageGyr: g.ageGyr, estimated: true, band: g.bandGyr };
  }
  const storedAge = typeof rootStar.Age === 'number' && rootStar.Age > 0 ? rootStar.Age / GYR_S : null;
  const heat = component(rootStar, 'HeatComponent');
  const g = guessSystemAge({
    massKg: rootStar.Mass!, temperatureK: heat?.SurfaceTemperature,
    classes: [], statedAgeGyr: storedAge,
  });
  if (g.source === 'stated-clamped' || g.estimated) assumptions.push(`System age: ${g.note} Set it in System Settings.`);
  return { ageGyr: g.ageGyr, estimated: g.estimated, band: g.bandGyr };
}

function aggregateRings(
  particles: UsEntity[],
  entityById: Map<string, UsEntity>,
  placementById: Map<string, Placement>,
  nodeId: (id: string) => string,
  nodes: CelestialBody[],
  counts: UboxImportResult['counts'],
  skipped: SkippedEntity[],
  assumptions: string[]
) {
  // group by "<Host> Ring Particle"
  const byHost = new Map<string, UsEntity[]>();
  let particleCount = 0;
  for (const e of particles) {
    particleCount++;
    const m = (e.Name ?? '').match(/^(.*) Ring Particle$/);
    if (!m) continue;
    const host = m[1].trim();
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host)!.push(e);
  }
  if (particleCount > 0) skipped.push({ name: `${particleCount} simulation particles (ring/fragment)`, reason: 'particle' });

  const nodeByName = new Map(nodes.map((n) => [n.name, n]));
  for (const [host, group] of byHost) {
    const hostNode = nodeByName.get(host);
    if (!hostNode || group.length < 50) continue;
    // find the host US entity position
    let hostPos: V3 | null = null;
    for (const [id, e] of entityById) { if ((e.Name ?? '') === host) { try { hostPos = parseVec3(e.Position); } catch { /* ignore */ } break; } }
    if (!hostPos) continue;
    const radiiKm: number[] = [];
    for (const pe of group) {
      try {
        const pp = parseVec3(pe.Position);
        const dx = pp[0] - hostPos[0], dy = pp[1] - hostPos[1], dz = pp[2] - hostPos[2];
        radiiKm.push(Math.sqrt(dx * dx + dy * dy + dz * dz) / 1000);
      } catch { /* skip a bad particle */ }
    }
    if (radiiKm.length < 50) continue;
    radiiKm.sort((a, b) => a - b);
    nodes.push({
      id: `${hostNode.id}-ring`,
      parentId: hostNode.id,
      name: `${host} Ring`,
      kind: 'body',
      roleHint: 'ring',
      radiusInnerKm: Math.round(percentile(radiiKm, 0.05)),
      radiusOuterKm: Math.round(percentile(radiiKm, 0.95)),
      tags: []
    } as CelestialBody);
    counts.rings++;
    assumptions.push(`${host}: a ring was reconstructed from ${radiiKm.length} US ring particles (inner/outer radii from their spread).`);
  }
}
