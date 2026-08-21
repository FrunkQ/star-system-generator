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

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
// Shared real-sky core — the same modules the in-app importer uses
// (src/lib/import/realsky/). Plain ESM so this script stays `node`-runnable.
import {
  G, SOLAR_MASS_KG, SOLAR_RADIUS_KM, EARTH_MASS_KG, EARTH_RADIUS_KM,
  JUPITER_MASS_KG, AU_KM, LY_PER_PC
} from '../../src/lib/import/realsky/constants.mjs';
import { hash01, round, mapPositionFromAstrometry } from '../../src/lib/import/realsky/positions.mjs';
import { starClasses } from '../../src/lib/import/realsky/stars.mjs';
import { estimateRadiusRe, defaultMakeup, planetDescription } from '../../src/lib/import/realsky/planets.mjs';
import { EPOCH, MAP_CENTRE, systems, MAP_A } from './data/systems-real.mjs';
import { MAP_B, fiction } from './data/systems-fiction.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');

// `--out <dir>` builds somewhere other than the shipped location. Only the
// reproducibility test uses it (buildKit.spec.mjs), which rebuilds into a temp
// directory and compares byte for byte against what ships; a build with no
// argument still writes the real files, so the documented usage is unchanged.
const outFlag = process.argv.indexOf('--out');
const outDir = outFlag > -1 ? resolve(process.argv[outFlag + 1]) : join(repo, 'static', 'example-starmaps');
mkdirSync(outDir, { recursive: true });

// Indentation of the generated JSON. The pin test compares BYTES, so the shipped
// files must carry exactly what this writes — including JavaScript's own number
// formatting. `0.00002` here is `2e-05` from Python's json.dump, and
// `4.3e-9` is `4.3e-09`: the same values, bytes the pin test rejects. So the
// maps can only ever be written by THIS script. Re-saving them from another
// language silently makes them unreproducible (see DATA-R1).

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
// SIMBAD row: [main_id, ra, dec, plx_value, sp_type, pmra, pmdec, rvz_radvel]
function positionFor(simbadId) {
  const row = simbad[simbadId];
  if (!row) throw new Error(`No SIMBAD cache row for "${simbadId}"`);
  const [, raDeg, decDeg, plxMas] = row;
  return mapPositionFromAstrometry(raDeg, decDeg, plxMas, undefined, MAP_CENTRE);
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

function planetNodes(st, sysDef, hostNode) {
  const rows = planetsByHost.get(st.planetsFrom) ?? [];
  if (!rows.length) console.warn(`!! no archive planets for host "${st.planetsFrom}"`);
  usedHosts.add(st.planetsFrom);
  // D15: the roster is the SINGLE source of "which archive hosts are already
  // curated into a bundled system". The in-app importer needs the same answer
  // to avoid overwriting curation with raw catalogue rows, but it must not
  // import from scripts/**, so the mapping is EMITTED as generated source
  // below rather than mirrored by hand.
  hostToBundledSystemId.set(st.planetsFrom, sysDef.id);
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
      makeup: defaultMakeup(massMe, row.pl_dens, id, row.pl_rade),
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
// aAU, e, i_deg, frame, makeup, atmosphere, hydrosphere, desc, rotationHours, tilt, classes, autoClassify }
//
// `frame: 'ecliptic'` declares that this body's inclination is quoted in the
// SYSTEM plane rather than its parent's equator (C3). Satellites are normally
// equatorial and need no flag; a moon far enough out that the Laplace plane has
// handed over to the system plane does. It is written FIRST inside orbit to
// match the shipped maps.
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
    ...(spec.tilt != null ? { axial_tilt_deg: spec.tilt } : {}),
    orbit: {
      ...(spec.frame ? { frame: spec.frame } : {}),
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
const hostToBundledSystemId = new Map();

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
// A node id is a STABLE REFERENCE, not a label: parents, barycentre members, orbits, routes,
// constructs and the WS8 campaign rebase all key off it, and `nodeById` is a `.find()`, so when two
// nodes in one system share an id the second is simply unreachable — you cannot select it, and
// anything pointing at that id silently resolves to the other one. Two such pairs shipped for four
// months before anyone noticed (D3), because nothing was looking. This THROWS rather than
// de-duplicating: a generator that quietly renames a clash hides the next one exactly as well as
// silence did.
function assertUniqueIds(file, obj) {
  const clashes = [];
  for (const s of obj.systems ?? []) {
    const seen = new Map();
    for (const n of s.system?.nodes ?? []) {
      if (seen.has(n.id)) clashes.push(`${s.name} [${s.id}]: "${n.id}" is both "${seen.get(n.id)}" and "${n.name}"`);
      else seen.set(n.id, n.name);
    }
  }
  if (clashes.length) throw new Error(`${file}: ${clashes.length} duplicate node id(s)\n  ${clashes.join('\n  ')}`);
}

// A body with satellites and NO axial tilt silently disables the satellite-frame work: C3 settled
// that a regular moon's elements are quoted in its PARENT'S EQUATOR, and `satelliteTiltRad` reads
// the parent's `axial_tilt_deg` to get there — so a missing tilt resolves to zero and every moon is
// drawn in the system plane whatever its frame flag says. Nothing required a tilt and nothing said
// when one was absent, which is how six fiction hosts and eleven moons went four months unnoticed
// (D8). This WARNS rather than throwing, unlike the duplicate-id check: an absent tilt is missing
// AUTHORING, not a broken generator, and the roster must stay buildable while it is decided.
function warnMissingTilts(file, obj) {
  const gaps = [];
  for (const s of obj.systems ?? []) {
    const nodes = s.system?.nodes ?? [];
    const satsOf = new Map();
    for (const n of nodes) {
      if (!n.parentId || n.kind !== 'body') continue;
      if (n.roleHint !== 'moon' && n.roleHint !== 'planet') continue;
      satsOf.set(n.parentId, (satsOf.get(n.parentId) ?? 0) + 1);
    }
    for (const n of nodes) {
      if (n.kind !== 'body' || n.roleHint === 'star') continue;
      const sats = satsOf.get(n.id) ?? 0;
      if (sats && n.axial_tilt_deg == null) gaps.push(`${s.name} [${s.id}]: "${n.name}" has ${sats} satellite(s) and no axial_tilt_deg`);
    }
  }
  if (gaps.length) {
    console.warn(`!! ${file}: ${gaps.length} host(s) with satellites but no axial tilt — their moons render in the system plane (D8)`);
    for (const g of gaps) console.warn(`   ${g}`);
  }
}

function write(file, obj) {
  assertUniqueIds(file, obj);
  warnMissingTilts(file, obj);
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

// D15 — the bundled-host mapping, emitted as generated SOURCE.
//
// The in-app real-sky importer must know which archive hosts are already
// curated into a bundled system, so it can report them as collisions instead
// of overwriting curation with raw catalogue rows. That answer lives in the
// roster's `planetsFrom` entries, and it used to be MIRRORED by hand in
// convert.mjs — one question, two places, which is this codebase's most
// recurring fault. It cannot be a plain import (the app must never depend on
// `scripts/**`), and it cannot be read from the manifest at runtime (the
// converter is synchronous, and a failed fetch would silently drop the
// protection). So the roster emits it, exactly as `generate-examples-list.cjs`
// emits `src/lib/generated/exampleSystems.ts`, and `convert.spec.js` walks the
// roster to fail loudly if this file is ever stale.
//
// Skipped under `--out`: that mode is the pin test rebuilding into a temp
// directory, and a test must not rewrite repository source as a side effect.
if (outFlag === -1) {
  const entries = [...hostToBundledSystemId.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const body = entries.map(([host, sysId]) => `  ${JSON.stringify(host)}: ${JSON.stringify(sysId)}`).join(',\n');
  const generatedSource =
    `// This file is auto-generated by scripts/starmap-build/build-starmaps.mjs\n` +
    `// Do not edit this file directly.\n` +
    `//\n` +
    `// Archive hostname -> the bundled starmap system that already curates it.\n` +
    `// Derived from the roster's \`planetsFrom\` entries; see the D15 note in the\n` +
    `// generator for why this is emitted rather than imported or fetched.\n` +
    `\n` +
    `export const BUNDLED_ARCHIVE_HOSTS = {\n${body}\n};\n`;
  const generatedPath = join(repo, 'src', 'lib', 'generated', 'bundledArchiveHosts.mjs');
  mkdirSync(dirname(generatedPath), { recursive: true });
  writeFileSync(generatedPath, generatedSource);
  console.log(`bundledArchiveHosts.mjs written (${entries.length} hosts).`);
}
