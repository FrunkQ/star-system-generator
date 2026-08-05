// Real-sky import — confirmed-only converter (design doc §4, phase 2).
//
// NASA Exoplanet Archive pscomppars rows → SSE starmap system nodes: one
// system per hostname, star parameters from the archive's stellar columns,
// planets exactly as confirmed, positions true and centre-relative. Nothing
// is invented: a host missing a mass or radius is SKIPPED with a reason the
// UI must show, never guessed into existence.
//
// Collision protection is about the TARGET MAP, not about the bundled maps.
// A host is skipped only when the system it would produce is ALREADY ON THE
// MAP being imported into — either under the same id, or under the stable id
// the bundled starmaps give that star (`GJ 887` is `sys-lacaille9352` there).
// Adding a second copy of a star the GM already has is the fault worth
// preventing; refusing to import a star merely because some OTHER map curates
// it is not, and shipped as a bug — the Local Neighbourhood preset produced an
// empty map, because every host in it is curated somewhere the GM was not
// looking. Callers pass `existingSystemIds`; a new map passes none.

import { EARTH_MASS_KG, EARTH_RADIUS_KM, EPOCH, G, LY_PER_PC, SOLAR_MASS_KG, SOLAR_RADIUS_KM, AU_KM, DEFAULT_MAP_CENTRE_PX } from './constants.mjs';
import { hash01, radecToXyzLy, round, xyzToMapPx, inSphere } from './positions.mjs';
import { starClasses } from './stars.mjs';
import { defaultMakeup, estimateRadiusRe, planetDescription } from './planets.mjs';

// Archive hostnames already curated into the bundled Local Neighbourhood.
//
// D15 — this list is NOT maintained here. It is GENERATED from the build
// kit's roster (`scripts/starmap-build/data/systems-real.mjs`, every
// `planetsFrom` entry) whenever the bundled maps are rebuilt, because the
// roster is the one place that actually knows which hosts are curated. It was
// briefly a hand-kept mirror, which is this codebase's most recurring fault:
// one question answered in two places, waiting to drift.
//
// Why generated rather than imported or fetched:
//   - a direct import would make the APP depend on `scripts/**`, which it
//     must not;
//   - reading it from the shipped manifest at runtime would make this
//     synchronous converter async, and a failed fetch would silently drop the
//     protection — the worst failure mode, because the import would look like
//     it worked while quietly overwriting curated systems.
// Generated source has neither problem, and follows the existing precedent of
// `src/lib/generated/exampleSystems.ts`.
//
// Staleness is caught, not trusted: `convert.spec.js` walks the roster and
// fails naming the host if the generated file disagrees with it. Add a planet
// host to a bundled system and the suite goes red until the kit is re-run.
// Relative, not `$lib` — this module stays runnable under plain node like the
// rest of the shared core, so it must not depend on Vite's aliases.
import { BUNDLED_ARCHIVE_HOSTS } from '../../generated/bundledArchiveHosts.mjs';
export { BUNDLED_ARCHIVE_HOSTS };

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
//   collisions — hosts the TARGET MAP already holds (never duplicated), each
//                naming the system id it is already there under
//   skipped    — hosts/planets dropped, each with a human-readable reason
export function convertArchiveRows(rows, { region, mapCentrePx = DEFAULT_MAP_CENTRE_PX, mutualIncMax = 1.2, generated = 'real-sky import', existingSystemIds = [] } = {}) {
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
  const existing = new Set(existingSystemIds);

  for (const [hostname, hostRows] of byHost) {
    hostRows.sort((a, b) => (a.pl_orbsmax ?? 1e9) - (b.pl_orbsmax ?? 1e9));
    const first = hostRows[0];
    const distLy = first.sy_dist * LY_PER_PC;
    const xyz = radecToXyzLy(first.ra, first.dec, distLy);
    if (!inSphere(xyz, centreXyz, region.radiusLy)) continue; // outside the true sphere

    let slug = hostSlug(hostname);
    if (usedSlugs.has(slug)) slug = `${slug}-${hash01(hostname).toFixed(4).slice(2)}`;
    usedSlugs.add(slug);

    // Already on the target map? Either under the id this import would mint, or
    // under the bundled maps' stable id for the same star — the catalogue calls
    // it `GJ 887`, a bundled map calls it `sys-lacaille9352`, and importing a
    // second copy beside it is what this prevents. With no target map (a new
    // starmap) nothing is present, so nothing is skipped.
    const ownId = `sys-${slug}`;
    const bundledId = BUNDLED_ARCHIVE_HOSTS[hostname];
    const presentAs = existing.has(ownId) ? ownId : (bundledId && existing.has(bundledId) ? bundledId : null);
    if (presentAs) {
      collisions.push({ hostname, systemId: presentAs, bundledSystemId: bundledId, planets: hostRows.length });
      continue;
    }

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
