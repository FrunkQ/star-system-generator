// Real-sky import — confirmed-only converter (design doc §4, phase 2).
//
// NASA Exoplanet Archive pscomppars rows → SSE starmap system nodes: one
// system per hostname, star parameters from the archive's stellar columns,
// planets exactly as confirmed, positions true and centre-relative. Nothing
// is invented: a host missing a mass or radius is SKIPPED with a reason the
// UI must show, never guessed into existence.
//
// Bundled-map protection: the bundled Local Neighbourhood carries deliberate
// curation — stable ids, hierarchy, descriptions, conventions recorded in
// scripts/starmap-build/. A host that belongs to a bundled system is
// therefore returned as a COLLISION, not converted: overwriting curation
// with raw catalogue rows is exactly the drift the build kit's pinning test
// exists to prevent. The caller decides what to do with collisions (typically
// "already on the bundled map — nothing to import").

import { EARTH_MASS_KG, EARTH_RADIUS_KM, EPOCH, G, LY_PER_PC, SOLAR_MASS_KG, SOLAR_RADIUS_KM, AU_KM, DEFAULT_MAP_CENTRE_PX } from './constants.mjs';
import { hash01, radecToXyzLy, round, xyzToMapPx, inSphere } from './positions.mjs';
import { starClasses } from './stars.mjs';
import { defaultMakeup, estimateRadiusRe, planetDescription } from './planets.mjs';

// Archive hostnames already curated into the bundled Local Neighbourhood.
// MIRRORS the `planetsFrom` entries in scripts/starmap-build/data/
// systems-real.mjs — convert.spec.js imports the roster and fails if the two
// ever disagree, so this cannot silently drift.
export const BUNDLED_ARCHIVE_HOSTS = {
  'Proxima Cen': 'sys-alphacen',
  "Barnard's star": 'sys-barnard',
  'GJ 411': 'sys-lalande',
  'eps Eri': 'sys-epseri',
  'GJ 887': 'sys-lacaille9352',
  'Ross 128': 'sys-ross128',
  'Gl 725 A': 'sys-struve2398',
  'GJ 15 A': 'sys-groombridge34',
  'tau Cet': 'sys-tauceti',
  'eps Ind A': 'sys-epsindi',
  'GJ 1061': 'sys-gj1061',
  'YZ Cet': 'sys-yzceti',
  "Teegarden's Star": 'sys-teegarden',
  'Kapteyn': 'sys-kapteyn',
  'Wolf 1061': 'sys-wolf1061',
  'GJ 9066': 'sys-gj9066',
  'GJ 674': 'sys-gj674',
  'GJ 687': 'sys-gj687',
  'GJ 876': 'sys-gj876',
  'GJ 1002': 'sys-gj1002',
  'GJ 273': 'sys-luyten',
  'TRAPPIST-1': 'sys-trappist',
  'GJ 832': 'sys-gj832',
  'GJ 682': 'sys-gj682'
};

// "HD 219134" → "hd-219134"; collision-proofed by the caller only if two
// distinct hostnames slug identically (rare; then the catalogue id joins it).
export const hostSlug = (hostname) =>
  hostname.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function starNodeFromRow(row, slug) {
  const missing = [];
  if (row.st_mass == null) missing.push('stellar mass');
  if (row.st_rad == null) missing.push('stellar radius');
  if (row.st_teff == null) missing.push('effective temperature');
  if (missing.length) return { missing };
  const type = (row.st_spectype ?? '').trim() || 'M';
  const { classes, image } = starClasses(type);
  return {
    node: {
      id: `${slug}-star`, parentId: null, name: row.hostname, kind: 'body', roleHint: 'star',
      classes,
      massKg: row.st_mass * SOLAR_MASS_KG,
      radiusKm: Math.round(row.st_rad * SOLAR_RADIUS_KM),
      temperatureK: Math.round(row.st_teff),
      // pscomppars st_lum is log10(L/Lsun)
      ...(row.st_lum != null ? { radiationOutput: 10 ** row.st_lum } : {}),
      image: { url: image },
      tags: [],
      description: `${row.hostname}: a real star imported from the NASA Exoplanet Archive${row.st_spectype ? ` (spectral type ${row.st_spectype.trim()})` : ''}.`
    }
  };
}

function planetNodeFromRow(row, slug, hostNode, mutualIncMax) {
  const letter = row.pl_name.trim().split(/\s+/).pop();
  const id = `${slug}-${letter.toLowerCase()}`;
  const massMe = row.pl_bmasse;
  if (massMe == null) return { skip: `${row.pl_name}: no mass in the archive` };
  let aAU = row.pl_orbsmax;
  if (aAU == null && row.pl_orbper != null) {
    const T = row.pl_orbper * 86400;
    aAU = Math.cbrt((G * hostNode.massKg * T * T) / (4 * Math.PI * Math.PI)) / (AU_KM * 1000);
  }
  if (aAU == null) return { skip: `${row.pl_name}: no semi-major axis or period` };
  return {
    node: {
      id, parentId: hostNode.id, name: row.pl_name, kind: 'body', roleHint: 'planet',
      massKg: massMe * EARTH_MASS_KG,
      radiusKm: Math.round((row.pl_rade ?? estimateRadiusRe(massMe)) * EARTH_RADIUS_KM),
      makeup: defaultMakeup(massMe, row.pl_dens),
      autoClassify: true,
      orbit: {
        hostId: hostNode.id, hostMu: G * hostNode.massKg, t0: EPOCH,
        elements: {
          a_AU: aAU,
          e: row.pl_orbeccen ?? 0,
          // MUTUAL inclination in the system plane, never the sky-plane value
          // (the bundled-map convention; sky-plane i stacks transiting systems).
          i_deg: round(hash01(id + '|i') * mutualIncMax, 2),
          omega_deg: round(hash01(id + '|w') * 360, 1),
          Omega_deg: round(hash01(id + '|W') * 360, 1),
          M0_rad: round(hash01(id + '|M') * 2 * Math.PI, 4)
        }
      },
      tags: [],
      description: planetDescription(row, undefined)
    }
  };
}

// Convert archive rows (already region-filtered by the query layer, but the
// exact sphere cut is applied again here — cheap, and it makes this function
// safe to hand a whole cache file). Returns:
//   systems    — StarSystemNode[] ready for a Starmap
//   collisions — hosts curated in the bundled maps (never converted)
//   skipped    — hosts/planets dropped, each with a human-readable reason
export function convertArchiveRows(rows, { region, mapCentrePx = DEFAULT_MAP_CENTRE_PX, mutualIncMax = 1.2, generated = 'real-sky import' } = {}) {
  if (!region) throw new Error('convertArchiveRows: a region {centre, radiusLy} is required');
  const centreXyz = (region.centre?.distLy ?? 0) > 0
    ? radecToXyzLy(region.centre.raDeg, region.centre.decDeg, region.centre.distLy)
    : { x: 0, y: 0, z: 0 };

  const byHost = new Map();
  for (const row of rows) {
    if (!byHost.has(row.hostname)) byHost.set(row.hostname, []);
    byHost.get(row.hostname).push(row);
  }

  const systems = [], collisions = [], skipped = [];
  const usedSlugs = new Set();

  for (const [hostname, hostRows] of byHost) {
    hostRows.sort((a, b) => (a.pl_orbsmax ?? 1e9) - (b.pl_orbsmax ?? 1e9));
    const first = hostRows[0];
    const distLy = first.sy_dist * LY_PER_PC;
    const xyz = radecToXyzLy(first.ra, first.dec, distLy);
    if (!inSphere(xyz, centreXyz, region.radiusLy)) continue; // outside the true sphere

    if (BUNDLED_ARCHIVE_HOSTS[hostname]) {
      collisions.push({ hostname, bundledSystemId: BUNDLED_ARCHIVE_HOSTS[hostname], planets: hostRows.length });
      continue;
    }

    let slug = hostSlug(hostname);
    if (usedSlugs.has(slug)) slug = `${slug}-${hash01(hostname).toFixed(4).slice(2)}`;
    usedSlugs.add(slug);

    const star = starNodeFromRow(first, slug);
    if (star.missing) {
      skipped.push({ hostname, reason: `missing ${star.missing.join(', ')} — not invented` });
      continue;
    }

    const nodes = [star.node];
    for (const row of hostRows) {
      const p = planetNodeFromRow(row, slug, star.node, mutualIncMax);
      if (p.skip) skipped.push({ hostname, reason: p.skip });
      else nodes.push(p.node);
    }

    systems.push({
      id: `sys-${slug}`,
      name: hostname,
      position: xyzToMapPx(xyz, centreXyz, mapCentrePx),
      system: {
        id: `${slug}-system`, name: hostname, seed: `realsky-${slug}`,
        epochT0: EPOCH, age_Gyr: first.st_age ?? 4.6,
        nodes, rulePackId: '', rulePackVersion: '', tags: [],
        credits: { author: 'Star System Explorer', created: `real-sky import, ${generated}`, version: '1' }
      }
    });
  }

  return { systems, collisions, skipped };
}
