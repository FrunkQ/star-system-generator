// Build the two bundled Local Neighbourhood starmaps from real astronomy data.
//
//   node scripts/starmap-build/build-starmaps.mjs
//
// Inputs:
//   data/cache/archive-pscomppars.json  — NASA Exoplanet Archive (run fetch-sources.mjs)
//   data/cache/simbad-roster.json       — SIMBAD astrometry     (run fetch-sources.mjs)
//   data/systems-real.mjs               — curated roster, binaries, descriptions
//   data/systems-fiction.mjs            — science-fiction overlay for map B
//   data/starmap-shell.json             — shared top-level starmap fields (temporal etc.)
//   static/examples/Sol_2030-System.json — canonical hand-authored Sol (read-only)
//
// Outputs:
//   static/example-starmaps/Local_Neighbourhood-Starmap.json
//   static/example-starmaps/Local_Neighbourhood_SciFi-Starmap.json
//   static/example-starmaps/manifest.json
//
// Positions are TRUE positions in a right-handed equatorial Cartesian frame:
// +z toward the north celestial pole, +x toward RA 0h Dec 0, +y toward RA 6h
// Dec 0, converted from ICRS RA/Dec/parallax and scaled by scale.pixelsPerUnit
// (43.30127 px per light year, unchanged from the previous map). Sol stays at
// pixel (400, 300), z = 0.

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { EPOCH, PIXELS_PER_LY, MAP_CENTRE, systems, MAP_A } from './data/systems-real.mjs';
import { MAP_B, fiction } from './data/systems-fiction.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const outDir = join(repo, 'static', 'example-starmaps');

const G = 6.6743e-11;
const SOLAR_MASS_KG = 1.989e30;
const SOLAR_RADIUS_KM = 695700;
const EARTH_MASS_KG = 5.972e24;
const EARTH_RADIUS_KM = 6371;
const JUPITER_MASS_KG = 1.898e27;
const AU_KM = 149597870.7;
const LY_PER_PC = 3.2615637769;

const appVersion = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf-8')).version;
const BASE_MAP_VERSION = 2; // v1 = the hand-placed 20-system map; v2 = true-position rebuild

// ---------------------------------------------------------------- source data
const archive = JSON.parse(readFileSync(join(here, 'data', 'cache', 'archive-pscomppars.json'), 'utf-8'));
const simbad = JSON.parse(readFileSync(join(here, 'data', 'cache', 'simbad-roster.json'), 'utf-8'));
const shell = JSON.parse(readFileSync(join(here, 'data', 'starmap-shell.json'), 'utf-8'));
const solBase = JSON.parse(readFileSync(join(repo, 'static', 'examples', 'Sol_2030-System.json'), 'utf-8'));

const planetsByHost = new Map();
for (const row of archive) {
  if (!planetsByHost.has(row.hostname)) planetsByHost.set(row.hostname, []);
  planetsByHost.get(row.hostname).push(row);
}
for (const rows of planetsByHost.values()) rows.sort((a, b) => (a.pl_orbsmax ?? 1e9) - (b.pl_orbsmax ?? 1e9));

// ---------------------------------------------------------------- helpers
// Deterministic 0..1 hash (same recipe as SystemProcessor.hash01) — used for
// orbital phase angles so builds are reproducible.
function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}
const round = (v, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

// SIMBAD row: [main_id, ra, dec, plx_value, sp_type, pmra, pmdec, rvz_radvel]
function positionFor(simbadId) {
  const row = simbad[simbadId];
  if (!row) throw new Error(`No SIMBAD cache row for "${simbadId}"`);
  const [, raDeg, decDeg, plxMas] = row;
  const dLy = (1000 / plxMas) * LY_PER_PC;
  const ra = (raDeg * Math.PI) / 180, dec = (decDeg * Math.PI) / 180;
  const x = dLy * Math.cos(dec) * Math.cos(ra);
  const y = dLy * Math.cos(dec) * Math.sin(ra);
  const z = dLy * Math.sin(dec);
  return {
    distanceLy: dLy,
    position: {
      x: round(MAP_CENTRE.x + PIXELS_PER_LY * x),
      y: round(MAP_CENTRE.y + PIXELS_PER_LY * y),
      z: round(PIXELS_PER_LY * z)
    }
  };
}

const STAR_IMAGE = {
  O: '/images/star_types/O.webp', B: '/images/star_types/B.webp', A: '/images/star_types/A.webp',
  F: '/images/star_types/F.webp', G: '/images/star_types/G.webp', K: '/images/star_types/K.ebp.webp',
  M: '/images/star_types/M.webp', L: '/images/star_types/L.png', T: '/images/star_types/T.png',
  Y: '/images/star_types/Y.jpg', WD: '/images/star_types/WD.webp'
};
function starClasses(type) {
  if (/white dwarf|^D/i.test(type)) return { classes: ['star/WD'], image: STAR_IMAGE.WD };
  const m = type.match(/^(sd)?([OBAFGKMLTY])/i);
  const letter = m ? m[2].toUpperCase() : 'M';
  const full = type.replace(/\s*\(.*\)$/, '');
  return { classes: [`star/${letter}`, ...(full && full !== letter ? [`star/${full}`] : [])], image: STAR_IMAGE[letter] };
}

function starNode(spec, sysDef, parentId, hostInfo) {
  const st = spec.star;
  const id = st.starId ?? `${sysDef.slug}-${st.key}`;
  // Planet hosts may omit stellar params — fill from the archive's stellar columns.
  const arch = st.planetsFrom ? (planetsByHost.get(st.planetsFrom) ?? [])[0] : undefined;
  const massKg = st.massMsun != null ? st.massMsun * SOLAR_MASS_KG
    : st.massMjup != null ? st.massMjup * JUPITER_MASS_KG
    : arch?.st_mass != null ? arch.st_mass * SOLAR_MASS_KG
    : (() => { throw new Error(`${id}: no mass`); })();
  const radiusKm = st.radiusKm ?? (st.radiusRsun != null ? st.radiusRsun * SOLAR_RADIUS_KM
    : arch?.st_rad != null ? arch.st_rad * SOLAR_RADIUS_KM
    : (() => { throw new Error(`${id}: no radius`); })());
  const teff = st.teff ?? arch?.st_teff ?? (() => { throw new Error(`${id}: no Teff`); })();
  // pscomppars st_lum is log10(L/Lsun)
  const lum = st.lumLsun ?? (arch?.st_lum != null ? 10 ** arch.st_lum : undefined);
  const { classes, image } = starClasses(st.type);
  const node = {
    id, parentId, name: st.name, kind: 'body', roleHint: 'star',
    classes, massKg, radiusKm: Math.round(radiusKm), temperatureK: Math.round(teff),
    ...(lum != null ? { radiationOutput: lum } : {}),
    ...(st.rotationHours != null ? { rotation_period_hours: st.rotationHours } : {}),
    image: { url: image },
    tags: [],
    description: st.desc ?? ''
  };
  const children = [];
  if (st.planetsFrom) children.push(...planetNodes(st, sysDef, node));
  for (const belt of st.belts ?? []) children.push(beltNode(belt, node));
  for (const extra of st.extraPlanets ?? []) children.push(manualPlanetNode(extra, sysDef, node));
  hostInfo?.stars.push(node);
  return { node, children, massKg };
}

// Chen & Kipping (2017)-style mass-radius estimate for planets without a
// measured radius (radial-velocity discoveries). Earth units in, Earth radii out.
function estimateRadiusRe(massMe) {
  if (massMe < 2.04) return 1.008 * massMe ** 0.279;
  if (massMe < 131.6) return Math.min(0.808 * massMe ** 0.589, 12);
  return 12; // giants: ~Jupiter-sized regardless of mass
}
function defaultMakeup(massMe, densityGcc) {
  if (densityGcc != null && densityGcc > 4) return { rock: 0.62, metal: 0.33, ice: 0.05 };
  if (massMe < 4) return { rock: 0.65, metal: 0.30, ice: 0.05 };
  if (massMe < 40) return { ice: 0.55, gas: 0.25, rock: 0.20 };
  return { gas: 0.85, ice: 0.10, rock: 0.05 };
}

function planetDescription(row, override) {
  if (override?.desc) return override.desc;
  const bits = [];
  const method = (row.discoverymethod ?? '').replace('Radial Velocity', 'radial velocity').replace('Transit', 'transit').replace('Imaging', 'direct imaging').replace('Astrometry', 'astrometry');
  bits.push(`Confirmed ${row.disc_year ?? ''} (${method}).`.replace('  ', ' '));
  if (row.pl_bmasse != null) {
    const isMsini = /msini/i.test(row.pl_bmassprov ?? '');
    const m = row.pl_bmasse;
    const mStr = m >= 100 ? `${round(m / 317.8, 2)} Jupiter masses` : `${round(m, 2)} Earth masses`;
    bits.push(isMsini ? `Minimum mass ${mStr}.` : `Mass ${mStr}.`);
  }
  if (row.pl_rade != null) bits.push(`Measured radius ${round(row.pl_rade, 2)} Earth radii.`);
  if (row.pl_orbper != null) bits.push(`Orbital period ${row.pl_orbper < 100 ? round(row.pl_orbper, 1) + ' days' : round(row.pl_orbper / 365.25, 1) + ' years'}.`);
  return bits.join(' ');
}

function planetNodes(st, sysDef, hostNode) {
  const rows = planetsByHost.get(st.planetsFrom) ?? [];
  if (!rows.length) console.warn(`!! no archive planets for host "${st.planetsFrom}"`);
  usedHosts.add(st.planetsFrom);
  const mutualIncMax = st.mutualIncMax ?? 1.2;
  return rows.map((row) => {
    const override = st.planetOverrides?.[row.pl_name] ?? {};
    const letter = row.pl_name.trim().split(/\s+/).pop();
    const id = override.id ?? `${st.planetIdPrefix ?? sysDef.slug}-${letter}`;
    const name = override.name ?? `${st.planetNameBase ?? sysDef.name} ${letter}`;
    const massMe = row.pl_bmasse ?? 1;
    const radiusRe = row.pl_rade ?? estimateRadiusRe(massMe);
    let aAU = row.pl_orbsmax;
    if (aAU == null && row.pl_orbper != null) {
      const mu = G * hostNode.massKg;
      const T = row.pl_orbper * 86400;
      aAU = Math.cbrt((mu * T * T) / (4 * Math.PI * Math.PI)) / (AU_KM * 1000);
    }
    if (aAU == null) throw new Error(`${row.pl_name}: no semi-major axis or period`);
    return {
      id, parentId: hostNode.id, name, kind: 'body', roleHint: 'planet',
      massKg: massMe * EARTH_MASS_KG,
      radiusKm: Math.round(radiusRe * EARTH_RADIUS_KM),
      makeup: defaultMakeup(massMe, row.pl_dens),
      autoClassify: true,
      orbit: {
        hostId: hostNode.id, hostMu: G * hostNode.massKg, t0: EPOCH,
        elements: {
          a_AU: aAU,
          e: row.pl_orbeccen ?? 0,
          // MUTUAL inclination within the system plane (near-coplanar), never the
          // sky-plane inclination — see data file header.
          i_deg: round(hash01(id + '|i') * mutualIncMax, 2),
          omega_deg: round(hash01(id + '|w') * 360, 1),
          Omega_deg: round(hash01(id + '|W') * 360, 1),
          M0_rad: round(hash01(id + '|M') * 2 * Math.PI, 4)
        }
      },
      tags: [],
      description: planetDescription(row, override)
    };
  });
}

// Hand-authored planet/moon (used by the fiction overlay; also available to the
// real roster for special cases). spec: { id, name, role, massMe|massKg, radiusRe|radiusKm,
// aAU, e, i_deg, makeup, atmosphere, hydrosphere, desc, rotationHours, tilt, classes, autoClassify }
function manualPlanetNode(spec, sysDef, hostNode) {
  const massKg = spec.massKg ?? spec.massMe * EARTH_MASS_KG;
  const radiusKm = spec.radiusKm ?? Math.round((spec.radiusRe ?? estimateRadiusRe(massKg / EARTH_MASS_KG)) * EARTH_RADIUS_KM);
  return {
    id: spec.id, parentId: hostNode.id, name: spec.name, kind: 'body', roleHint: spec.role ?? 'planet',
    massKg, radiusKm,
    // Authored classes must be PINNED (autoClassify: false) or the on-load
    // fix-up wipes them for re-derivation (importFixup.ts stripBody).
    ...(spec.classes ? { classes: spec.classes, autoClassify: false } : { autoClassify: true }),
    ...(spec.makeup ? { makeup: spec.makeup } : {}),
    ...(spec.atmosphere ? { atmosphere: spec.atmosphere } : {}),
    ...(spec.hydrosphere ? { hydrosphere: spec.hydrosphere } : {}),
    ...(spec.rotationHours != null ? { rotation_period_hours: spec.rotationHours } : {}),
    ...(spec.tilt != null ? { axial_tilt_deg: spec.tilt, obliquity_deg: spec.tilt } : {}),
    orbit: {
      hostId: hostNode.id, hostMu: G * hostNode.massKg, t0: EPOCH,
      elements: {
        a_AU: spec.aAU, e: spec.e ?? 0, i_deg: spec.i_deg ?? round(hash01(spec.id + '|i') * 1.2, 2),
        omega_deg: round(hash01(spec.id + '|w') * 360, 1),
        Omega_deg: round(hash01(spec.id + '|W') * 360, 1),
        M0_rad: round(hash01(spec.id + '|M') * 2 * Math.PI, 4)
      }
    },
    tags: [], description: spec.desc ?? ''
  };
}

function beltNode(belt, hostNode) {
  const innerAU = belt.aAU - belt.widthAU / 2, outerAU = belt.aAU + belt.widthAU / 2;
  return {
    id: belt.id, parentId: hostNode.id, name: belt.name, kind: 'body', roleHint: 'belt',
    classes: belt.classes ?? ['belt/asteroid'],
    radiusInnerKm: Math.round(innerAU * AU_KM), radiusOuterKm: Math.round(outerAU * AU_KM),
    massKg: belt.massKg,
    orbit: {
      hostId: hostNode.id, hostMu: G * hostNode.massKg, t0: EPOCH,
      elements: { a_AU: belt.aAU, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: round(hash01(belt.id) * 2 * Math.PI, 4) }
    },
    tags: [], description: belt.desc ?? ''
  };
}

// Recursively build a component spec (star or barycentre pair). Returns
// { node, children, massKg }. Members of a pair orbit the shared barycentre
// with semi-major axes split by the mass ratio, mirrored ellipses (omega + 180)
// and a shared phase so they stay in anti-phase for any eccentricity.
function buildComponent(spec, sysDef, parentId, hostInfo) {
  if (spec.star) return starNode(spec, sysDef, parentId, hostInfo);
  if (!spec.bary) throw new Error(`Bad component spec in ${sysDef.id}`);
  const baryId = spec.baryId ?? `${sysDef.slug}-${spec.id}-barycenter`;
  const a = buildComponent(spec.bary[0], sysDef, baryId, hostInfo);
  const b = buildComponent(spec.bary[1], sysDef, baryId, hostInfo);
  const total = a.massKg + b.massKg;
  const M0 = round(hash01(baryId + '|M') * 2 * Math.PI, 4);
  const mkOrbit = (frac, flip) => ({
    hostId: baryId, hostMu: G * total, t0: EPOCH,
    elements: {
      a_AU: spec.aAU * frac, e: spec.e ?? 0, i_deg: 0,
      omega_deg: flip ? 180 : 0, Omega_deg: 0, M0_rad: M0
    }
  });
  a.node.orbit = mkOrbit(b.massKg / total, false);
  b.node.orbit = mkOrbit(a.massKg / total, true);
  const bary = {
    id: baryId, parentId, name: spec.name ?? `${sysDef.name} Barycentre`, kind: 'barycenter',
    memberIds: [a.node.id, b.node.id], tags: [],
    ...(spec.desc ? { description: spec.desc } : {})
  };
  return { node: bary, children: [a.node, ...a.children, b.node, ...b.children], massKg: total };
}

const usedHosts = new Set();

function buildSystem(sysDef) {
  if (sysDef.special === 'sol') return buildSol();
  const { position } = positionFor(sysDef.simbad);
  const hostInfo = { stars: [] };
  const root = buildComponent(sysDef.root, sysDef, null, hostInfo);
  root.node.parentId = null;
  // Root node carries the system-level description (single stars merge theirs).
  if (root.node.kind === 'barycenter') root.node.description = sysDef.description;
  else if (root.node.description && root.node.description !== sysDef.description) {
    root.node.description = `${sysDef.description}\n\n${root.node.description}`;
  } else root.node.description = sysDef.description;
  const nodes = [root.node, ...root.children];
  return {
    id: sysDef.id, name: sysDef.name, position,
    system: {
      id: sysDef.systemId ?? `${sysDef.slug}-system`, name: sysDef.name,
      seed: sysDef.seed ?? sysDef.slug, epochT0: EPOCH, age_Gyr: sysDef.age_Gyr,
      nodes, rulePackId: '', rulePackVersion: '', tags: [],
      credits: { author: 'Star System Explorer', created: '2026-07-30', version: `${BASE_MAP_VERSION}` }
    }
  };
}

function buildSol() {
  const sysDef = systems.find((s) => s.id === 'sys-sol');
  const sol = JSON.parse(JSON.stringify(solBase));
  sol.id = 'solar-system';
  sol.seed = 'solar-system-real-data';
  // The Ascension Heavy Lifter is a fictional demo ship — the real map carries
  // only real hardware (ISS, Tiangong, Lunar Gateway are all real programmes).
  sol.nodes = sol.nodes.filter((n) => n.id !== 'construct-ssto-heavy');
  const sun = sol.nodes.find((n) => n.id === 'solar-system-sun');
  if (sun) sun.description = sun.description || sysDef.description;
  sol.credits = { author: 'Star System Explorer', created: '2026-07-30', version: `${BASE_MAP_VERSION}` };
  return {
    id: 'sys-sol', name: 'Sol',
    position: { x: MAP_CENTRE.x, y: MAP_CENTRE.y, z: 0 },
    system: sol
  };
}

// ---------------------------------------------------------------- map A (real)
const mapASystems = systems.map(buildSystem);

// Completeness check: any archive host within 13 ly that we did NOT include?
for (const [host, rows] of planetsByHost) {
  const dLy = rows[0].sy_dist * LY_PER_PC;
  if (dLy < 16.5 && !usedHosts.has(host)) console.warn(`!! unused nearby archive host: ${host} (${round(dLy, 2)} ly, ${rows.length} planets)`);
}

function makeStarmap(meta, systemNodes) {
  return {
    id: meta.id, name: meta.name, description: meta.description,
    appVersion, baseMapVersion: BASE_MAP_VERSION,
    ...shell,
    systems: systemNodes, routes: []
  };
}

const mapA = makeStarmap(MAP_A, mapASystems);

// ---------------------------------------------------------------- map B (fiction overlay)
function nodeById(sys, id) {
  const n = sys.system.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`${sys.id}: fiction references missing node "${id}"`);
  return n;
}

const mapBSystems = JSON.parse(JSON.stringify(mapASystems)).map((sys) => {
  const fx = fiction[sys.id];
  if (!fx) return sys;
  if (fx.removeNodeIds) sys.system.nodes = sys.system.nodes.filter((n) => !fx.removeNodeIds.includes(n.id));
  for (const [id, desc] of Object.entries(fx.nodeDescriptions ?? {})) nodeById(sys, id).description = desc;
  for (const spec of fx.addNodes ?? []) {
    let node;
    if (spec.raw) {
      node = spec.raw;
      if (spec.orbitSpec) {
        const host = nodeById(sys, spec.orbitSpec.hostId);
        const hostMass = spec.orbitSpec.hostMassKg ?? host.massKg ?? host.effectiveMassKg ?? sys.system.nodes.filter((n) => host.memberIds?.includes(n.id)).reduce((s, n) => s + (n.massKg ?? 0), 0);
        node.orbit = {
          hostId: host.id, hostMu: G * hostMass, t0: EPOCH,
          elements: {
            a_AU: spec.orbitSpec.aAU, e: spec.orbitSpec.e ?? 0, i_deg: spec.orbitSpec.i_deg ?? 0,
            omega_deg: round(hash01(node.id + '|w') * 360, 1),
            Omega_deg: round(hash01(node.id + '|W') * 360, 1),
            M0_rad: spec.orbitSpec.M0_rad ?? round(hash01(node.id + '|M') * 2 * Math.PI, 4)
          }
        };
      }
    } else {
      const host = nodeById(sys, spec.hostId);
      node = manualPlanetNode(spec, { slug: sys.id }, host);
    }
    sys.system.nodes.push(node);
  }
  if (fx.systemDescription) {
    const root = sys.system.nodes.find((n) => n.parentId == null);
    if (root) root.description = fx.systemDescription;
  }
  return sys;
});

const mapB = makeStarmap(MAP_B, mapBSystems);
mapB.id = MAP_B.id;

// ---------------------------------------------------------------- write
function write(file, obj) {
  writeFileSync(join(outDir, file), JSON.stringify(obj, null, 1) + '\n');
  const count = obj.systems.length;
  const planets = obj.systems.reduce((s, x) => s + x.system.nodes.filter((n) => n.roleHint === 'planet').length, 0);
  console.log(`${file}: ${count} systems, ${planets} planets`);
}
write(MAP_A.file, mapA);
write(MAP_B.file, mapB);

// Manifest: consumed by the example-picker UI (when wired) and by the WS8
// campaign-rebase feature (stable base system ids per base-map version).
const manifest = {
  baseMapVersion: BASE_MAP_VERSION,
  appVersion,
  generated: '2026-07-30',
  maps: [MAP_A, MAP_B].map((m, i) => ({
    id: m.id, file: m.file, name: m.name, description: m.description,
    systemIds: (i === 0 ? mapA : mapB).systems.map((s) => s.id)
  })),
  // The pre-v2 hand-placed map's ids, for WS8 old-map detection.
  legacyBaseSystemIds: [
    'sys-sol', 'sys-alphacen', 'sys-barnard', 'sys-wolf359', 'sys-lalande', 'sys-sirius',
    'sys-ross154', 'sys-ross248', 'sys-epseri', 'sys-ross128', 'sys-teegarden', 'sys-luyten',
    'sys-tauceti', 'sys-trappist', 'sys-luyten726', 'sys-procyon', 'sys-61cygni',
    'sys-struve2398', 'sys-luhman16', 'sys-lacaille9352'
  ]
};
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log('manifest.json written.');
