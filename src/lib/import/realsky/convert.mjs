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
import { starClasses, starParamsFromType, parseStellarType } from './stars.mjs';
import { displayStarName, systemStarName } from './starNames.mjs';
import { defaultMakeup, estimateRadiusRe, planetDescription } from './planets.mjs';
import { normaliseStarRows, groupIntoSystems, projectedSeparationAu, angularSepRad, distanceLyFromParallax } from './census.mjs';

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
  // No `otype` here: the Exoplanet Archive has no such column, and every row in it is a confirmed
  // PLANET HOST, so the object is a star by construction.
  const type = (row.st_spectype ?? '').trim() || 'M';
  const { classes, image } = starClasses(type);
  const stellarType = parseStellarType(type);
  return {
    node: {
      id: `${slug}-star`, parentId: null, name: row.hostname, kind: 'body', roleHint: 'star',
      classes,
      ...(stellarType ? { stellarType } : {}),
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
      makeup: defaultMakeup(massMe, row.pl_dens, id, row.pl_rade),
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

// ============================================================================
// THE INVERTED PIPELINE (D18) — stars first, planets as an enrichment join.
//
// "This is a STARMAP importer — clue is in the name. The planets are just a nice add-on." The old
// entry point below selects from the EXOPLANET ARCHIVE, so a star with no confirmed planet is not
// in the result set: no Sol, no Alpha Centauri A or B, while Proxima arrives because it happens to
// have planets. Same census, three absences, one category error.
//
// Here the STAR CATALOGUE is the source and the archive is joined onto it.
// ============================================================================

// Match a planet host to a star by POSITION AND DISTANCE, never by name. The archive calls Alpha
// Centauri's faint companion "Proxima Cen" where SIMBAD says "NAME Proxima Centauri"; GJ 876 is
// "BD-15 6290". A name table needs maintaining and fails silently when it drifts.
//
// THE ANGULAR TOLERANCE IS LARGE ON PURPOSE, AND MEASURING IT WAS THE POINT (DATA-R9). The two
// catalogues quote positions at different EPOCHS, and the stars a local map is made of are exactly
// the ones with the largest PROPER MOTION — so the nearest stars are the worst offenders, not the
// best. Measured across every matched host: Barnard's star is out by 161 arcsec, Kapteyn's by 134,
// Proxima by 60. An arcsecond-scale tolerance silently drops precisely the famous stars, which is
// how Alpha Centauri came back with none of Proxima's three planets on the first run.
//
// DISTANCE does the discriminating instead: every true match agreed to better than 1.5%, so 10% is
// a wide margin, and two unrelated stars agreeing on distance to 10% AND lying within five arcmin
// of one another does not happen in a volume this sparse. Closest match wins.
const HOST_MATCH_ARCSEC = 300;
const HOST_MATCH_DIST_FRAC = 0.10;

function matchHostToStar(hostRow, stars) {
  const hostLy = hostRow.sy_dist * LY_PER_PC;
  let best = null, bestSep = Infinity;
  for (const s of stars) {
    const sepArcsec = (angularSepRad({ ra: hostRow.ra, dec: hostRow.dec }, s) * 180 * 3600) / Math.PI;
    if (sepArcsec > HOST_MATCH_ARCSEC) continue;
    const starLy = distanceLyFromParallax(s.plxMas);
    if (Math.abs(starLy - hostLy) / hostLy > HOST_MATCH_DIST_FRAC) continue;
    if (sepArcsec < bestSep) { best = s; bestSep = sepArcsec; }
  }
  return best;
}

// A star node from a CATALOGUE row that carries no mass/radius/temperature — the normal case for a
// star with no planets, since a general star catalogue gives a spectral type and astrometry only.
// The figures are TYPICAL FOR THE CLASS, from the rule pack's own bands (see `starParamsFromType`),
// and the description says so: DATA-R4 forbids inventing silently, not estimating openly.
// What "its class" means once the luminosity class is read (D19). A supergiant's figures are typical
// for SUPERGIANTS OF ITS TYPE, not for M stars in general — an M dwarf and an M supergiant share a
// temperature and nothing else — and the description should say which statement it is making.
const LUMINOSITY_WORD = { I: 'TYPE AND LUMINOSITY CLASS (a SUPERGIANT)', III: 'TYPE AND LUMINOSITY CLASS (a GIANT)', V: 'CLASS' };

function starNodeFromCensus(star, id, statTemplates) {
  // `otype` is the catalogue's own statement about WHAT THE OBJECT IS, and it was already being
  // fetched and used only as a filter. A pulsar has no spectral type at all, so without this it
  // classified `star/M` and imported as a red dwarf (B44).
  const otype = star.otype;
  const params = starParamsFromType(star.sp ?? '', statTemplates, { otype });
  if (!params) return { missing: ['no stellar parameters for this spectral type'] };
  const { classes, image } = starClasses(star.sp ?? '', { otype });
  const typeText = (star.sp ?? '').trim();
  // Parsed ONCE, here, at import. Every consumer downstream reads the structured form.
  const stellarType = parseStellarType(star.sp ?? '');
  return {
    node: {
      id, parentId: null, name: cleanStarName(star.id), kind: 'body', roleHint: 'star',
      classes,
      ...(stellarType ? { stellarType } : {}),
      massKg: params.massMsun * SOLAR_MASS_KG,
      radiusKm: Math.round(params.radiusRsun * SOLAR_RADIUS_KM),
      temperatureK: params.temperatureK,
      ...(params.luminosity != null ? { radiationOutput: params.luminosity } : {}),
      image: { url: image },
      tags: [],
      description: `${cleanStarName(star.id)}: a real star imported from SIMBAD${typeText ? ` (spectral type ${typeText})` : ''}. `
        + `No mass, radius or temperature has been measured for it, so those figures are TYPICAL FOR ITS `
        + `${LUMINOSITY_WORD[params.luminosityClass] ?? 'CLASS'} rather than observed.`
    }
  };
}

// The name a starmap node carries (inbox D24). SIMBAD identifiers are written for astronomers in
// shorthand — "* alf Sco" is Antares — and stripping the catalogue furniture only got as far as
// "alf Sco", which is still a database key rather than a name. `displayStarName` goes the rest of
// the way: a proper name where the catalogue has one, otherwise the expanded designation
// ("eps Ind" -> "Epsilon Indi"), otherwise the identifier untouched, because a survey designation
// like "2MASS J09205549+4539058" has no friendly name and mangling it would be inventing.
//
// The WORD style, not the symbol: "Epsilon Indi" rather than "ε Indi". A starmap name is copied,
// typed and searched for, and SIMBAD's TAP service rejects non-ASCII outright — so the plain form is
// the one that survives a round trip through the user. Every name this produces was checked against
// the live service and resolves back to the object it came from.
export function cleanStarName(mainId) {
  return displayStarName(mainId);
}

/**
 * Convert a REGION into starmap systems, stars first.
 *
 * `starRows` are raw catalogue rows ({main_id|id, ra, dec, plx_value|plxMas, sp_type|sp, otype});
 * `planetRows` are Exoplanet Archive rows, joined on by position where they match a star.
 * `solPreset`, when given and when the region contains the origin, is the shipped Sol system —
 * because Sol is not in an exoplanet archive (our planets are not exoplanets) and must never be
 * handed an invented one.
 */
export function convertRegion(
  { starRows = [], planetRows = [], solPreset = null, statTemplates = null },
  { region, mapCentrePx = DEFAULT_MAP_CENTRE_PX, mutualIncMax = 1.2, generated = 'real-sky import', existingSystemIds = [] } = {}
) {
  if (!region) throw new Error('convertRegion: a region {centre, radiusLy} is required');
  const centreXyz = (region.centre?.distLy ?? 0) > 0
    ? radecToXyzLy(region.centre.raDeg, region.centre.decDeg, region.centre.distLy)
    : { x: 0, y: 0, z: 0 };
  const existing = new Set(existingSystemIds);
  const systems = [], collisions = [], skipped = [];

  // 1. The census: rows in, stars out, with every drop named.
  const normalised = normaliseStarRows(starRows.map((r) => ({
    id: r.main_id ?? r.id,
    ra: r.ra, dec: r.dec,
    plxMas: r.plx_value ?? r.plxMas,
    sp: r.sp_type ?? r.sp,
    otype: r.otype
  })));
  for (const d of normalised.dropped) skipped.push({ hostname: d.id, reason: d.reason });

  // Typical mass per star, so the grouping can weigh a pair. Class bands again — a companion's mass
  // is not in the catalogue any more than a primary's is.
  const stars = normalised.stars.map((s) => ({
    ...s,
    massMsun: starParamsFromType(s.sp ?? '', statTemplates, { otype: s.otype })?.massMsun ?? 0.4
  }));

  // 2. Group by the engine's existing period tier (clusterGate), NOT by a bare distance.
  const groups = groupIntoSystems(stars);

  const usedSlugs = new Set();
  for (const group of groups) {
    const primary = group[0];
    const distLy = distanceLyFromParallax(primary.plxMas);
    const xyz = radecToXyzLy(primary.ra, primary.dec, distLy);
    if (!inSphere(xyz, centreXyz, region.radiusLy)) continue;

    // The SYSTEM's name, not the primary's: Alpha Centauri, whose primary star is Rigil Kentaurus.
    const name = systemStarName(primary.id);
    let slug = hostSlug(name);
    if (usedSlugs.has(slug)) slug = `${slug}-${hash01(primary.id).toFixed(4).slice(2)}`;
    usedSlugs.add(slug);

    // 3. Join the archive on by POSITION. A group can hold several hosts (Alpha Centauri's planets
    //    are Proxima's), so every member is offered to the join.
    const hostsHere = [];
    for (const [hostname, hostRows] of groupPlanetRowsByHost(planetRows)) {
      const match = matchHostToStar(hostRows[0], group);
      if (match) hostsHere.push({ hostname, hostRows, star: match });
    }

    const ownId = `sys-${slug}`;
    const bundledId = hostsHere.map((h) => BUNDLED_ARCHIVE_HOSTS[h.hostname]).find(Boolean);
    const presentAs = existing.has(ownId) ? ownId : (bundledId && existing.has(bundledId) ? bundledId : null);
    if (presentAs) {
      collisions.push({ hostname: name, systemId: presentAs, bundledSystemId: bundledId, planets: hostsHere.reduce((n, h) => n + h.hostRows.length, 0) });
      continue;
    }

    // 4. Build the nodes. The heaviest star is the root; companions orbit IT rather than a
    //    hand-built barycentre, because the processor's `reconcileBarycenters` promotes a
    //    comparable-mass pair into a real barycentre on load — one implementation, not two.
    const nodes = [];
    const starNodeById = new Map();
    group.forEach((s, i) => {
      const isPrimary = i === 0;
      const starId = `${slug}-${isPrimary ? 'star' : String.fromCharCode(97 + i)}`;
      // A matched archive row carries MEASURED parameters and always beats the class estimate.
      const archiveHost = hostsHere.find((h) => h.star === s);
      const built = archiveHost
        ? starNodeFromRow(archiveHost.hostRows[0], slug)
        : starNodeFromCensus(s, starId, statTemplates);
      if (built.missing) { skipped.push({ hostname: cleanStarName(s.id), reason: `missing ${built.missing.join(', ')} — not invented` }); return; }
      built.node.id = starId;
      built.node.name = cleanStarName(s.id);
      if (!isPrimary) {
        const aAU = projectedSeparationAu(group[0], s);
        const hostMassKg = (group[0].massMsun ?? 0.4) * SOLAR_MASS_KG;
        built.node.parentId = `${slug}-star`;
        built.node.orbit = {
          hostId: `${slug}-star`, hostMu: G * hostMassKg, t0: EPOCH,
          elements: {
            a_AU: Math.max(0.01, round(aAU, 3)),
            e: 0,
            i_deg: round(hash01(starId + '|i') * mutualIncMax, 2),
            omega_deg: round(hash01(starId + '|w') * 360, 1),
            Omega_deg: round(hash01(starId + '|W') * 360, 1),
            M0_rad: round(hash01(starId + '|M') * 2 * Math.PI, 4)
          }
        };
      }
      nodes.push(built.node);
      starNodeById.set(s, built.node);
    });
    if (!nodes.length) continue;

    // 5. Planets hang off the star they actually orbit.
    for (const h of hostsHere) {
      const hostNode = starNodeById.get(h.star);
      if (!hostNode) continue;
      h.hostRows.sort((a, b) => (a.pl_orbsmax ?? 1e9) - (b.pl_orbsmax ?? 1e9));
      for (const row of h.hostRows) {
        const p = planetNodeFromRow(row, slug, hostNode, mutualIncMax);
        if (p.skip) skipped.push({ hostname: h.hostname, reason: p.skip });
        else nodes.push(p.node);
      }
    }

    const ageGyr = hostsHere[0]?.hostRows?.[0]?.st_age ?? 4.6;
    systems.push({
      id: ownId,
      name,
      position: xyzToMapPx(xyz, centreXyz, mapCentrePx),
      system: {
        id: `${slug}-system`, name, seed: `realsky-${slug}`,
        epochT0: EPOCH, age_Gyr: ageGyr,
        nodes, rulePackId: '', rulePackVersion: '', tags: [],
        credits: { author: 'Star System Explorer', created: `real-sky import, ${generated}`, version: '1' }
      }
    });
  }

  // 6. SOL. Not a row in any exoplanet archive — our planets are not exoplanets — and it is the
  //    coordinate ORIGIN, so "is Sol in the region" is "does the region contain the origin", which
  //    the existing sphere maths already answers. Filled from the shipped preset and NEVER from the
  //    generator: the one outcome nobody wants is an invented Solar System.
  if (solPreset && inSphere({ x: 0, y: 0, z: 0 }, centreXyz, region.radiusLy)) {
    const solId = 'sys-sol';
    if (existing.has(solId)) {
      collisions.push({ hostname: 'Sol', systemId: solId, bundledSystemId: solId, planets: 0 });
    } else {
      systems.push({
        id: solId, name: 'Sol',
        position: xyzToMapPx({ x: 0, y: 0, z: 0 }, centreXyz, mapCentrePx),
        system: solSystemFromPreset(solPreset, generated)
      });
    }
  }

  return { systems, collisions, skipped };
}

/**
 * Shape the shipped Sol preset into a system for an imported map.
 *
 * The same two adjustments the build kit makes when it puts Sol on a bundled map (`buildSol`): the
 * ids are fixed so campaign tooling can find it, and the ASCENSION HEAVY LIFTER is dropped — it is a
 * fictional demo ship, and a real-sky import is a real map, where the ISS, Tiangong and the Lunar
 * Gateway are all real programmes and it is not.
 */
export function solSystemFromPreset(preset, generated = 'real-sky import') {
  const sol = JSON.parse(JSON.stringify(preset));
  sol.id = 'solar-system';
  sol.seed = 'solar-system-real-data';
  sol.nodes = (sol.nodes ?? []).filter((n) => n.id !== 'construct-ssto-heavy');
  sol.credits = { author: 'Star System Explorer', created: `real-sky import, ${generated}`, version: '1' };
  return sol;
}

function groupPlanetRowsByHost(planetRows) {
  const byHost = new Map();
  for (const row of planetRows) {
    if (!byHost.has(row.hostname)) byHost.set(row.hostname, []);
    byHost.get(row.hostname).push(row);
  }
  return byHost;
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
