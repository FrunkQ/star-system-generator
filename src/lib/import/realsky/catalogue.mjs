// Real-sky import — catalogue loading with an offline fallback.
//
// The importer prefers the LIVE NASA Exoplanet Archive (fresh confirmations
// arrive weekly), but the dialogue must work at the table with no network, so
// on any fetch failure it falls back to the bundled snapshot published at
// /realsky/pscomppars.json (the build kit's committed cache, all confirmed
// planets within 12.7 pc / ~41.4 light years). The result says which source
// answered and what the fallback can and cannot cover, and the UI must show
// that rather than pretending the snapshot is live.

import { LY_PER_PC } from './constants.mjs';
import { archivePlanetsAdql, simbadStarsAdql, simbadStarFluxAdql, simbadStarTeffAdql, simbadComponentsOfAdql, runTap } from './query.mjs';
import { isContainerRow } from './census.mjs';
import { inSphere, radecToXyzLy } from './positions.mjs';

export const BUNDLED_CACHE_URL = '/realsky/pscomppars.json';
export const BUNDLED_STARS_URL = '/realsky/stars.json';
export const BUNDLED_CACHE_MAX_LY = 12.7 * LY_PER_PC; // ~41.4 — the snapshot's own query bound

// THE STELLAR CENSUS — the importer's PRIMARY query since D18.
//
// Unlike the archive, SIMBAD sends `Access-Control-Allow-Origin: *` and answers a browser
// DIRECTLY, so there is no proxy step here and the live path is the ordinary one (DATA-R6 measured
// both). The bundled snapshot exists for the table-with-no-network case, and is cut to the region
// client-side because it is a whole-sky file rather than a query result.
//
// Returns { rows, source, warning } with the same contract as `loadArchiveRows`: the UI must SHOW
// which source answered, because a stale snapshot must never read as live data.
export async function loadStarRows(region, { fetchImpl = fetch, signal } = {}) {
  try {
    const rows = await runTap('simbad', simbadStarsAdql(region), { fetchImpl, signal });
    return { rows, source: 'live', warning: null };
  } catch (liveError) {
    if (liveError?.name === 'AbortError') throw liveError;
    const res = await fetchImpl(BUNDLED_STARS_URL, { signal });
    if (!res.ok) {
      throw new Error(
        `Live star query failed (${liveError?.message ?? liveError}) and the bundled star snapshot could not be read (HTTP ${res.status}).`
      );
    }
    const all = await res.json();
    const centreXyz = (region.centre?.distLy ?? 0) > 0
      ? radecToXyzLy(region.centre.raDeg, region.centre.decDeg, region.centre.distLy)
      : { x: 0, y: 0, z: 0 };
    const rows = all.filter((r) => {
      if (!(r.plx_value > 0)) return false;
      return inSphere(radecToXyzLy(r.ra, r.dec, (1000 / r.plx_value) * LY_PER_PC), centreXyz, region.radiusLy);
    });
    const reachLy = (region.centre?.distLy ?? 0) + region.radiusLy;
    const warning = reachLy > BUNDLED_CACHE_MAX_LY
      ? `Live star catalogue unreachable — using the bundled snapshot, which only covers ${Math.round(BUNDLED_CACHE_MAX_LY)} light years from Sol. This region reaches ${Math.round(reachLy)} ly, so distant stars will be missing.`
      : 'Live star catalogue unreachable — using the bundled snapshot (complete for this region, but only as fresh as this build).';
    return { rows, source: 'bundled', warning };
  }
}

// WHAT THE CATALOGUE MEASURES ABOUT EACH STAR'S SIZE (D29).
//
// PURE ENRICHMENT, AND IT MUST NEVER BREAK AN IMPORT. SIMBAD's `basic` carries no mass, radius or
// temperature, so these two extra queries fetch what it DOES measure - a temperature, a surface
// gravity, two magnitudes and, for about one star in seven, a direct diameter. If either fails, or
// the service is slow, or the GM is offline, the import proceeds exactly as it did before and every
// star falls back to its class band. That is why this returns a Map and swallows its own errors
// rather than throwing: a missing size is a less good star, not a failed import.
//
// THE TWO REDUCTIONS THAT MATTER, both measured against the live service:
//  1. `mesFe_h` is one row per PUBLICATION - 43 for Sirius, 117 for Arcturus, 1,661 rows for a
//     16.5 ly census. The rows arrive ordered by `mespos`, so the FIRST one seen per star wins and
//     the rest are dropped. Proxima's second measurement says 5554 K, which is not Proxima.
//  2. `mesDiameter.unit` arrives PADDED ('km  '), and it varies per row rather than per table, so
//     it is trimmed and read every time rather than assumed.
export async function loadStarSizes(region, { fetchImpl = fetch, signal } = {}) {
  const sizes = new Map();
  const get = (id) => {
    if (!sizes.has(id)) sizes.set(id, { main_id: id });
    return sizes.get(id);
  };
  try {
    const [flux, teff] = await Promise.all([
      runTap('simbad', simbadStarFluxAdql(region), { fetchImpl, signal }),
      runTap('simbad', simbadStarTeffAdql(region), { fetchImpl, signal })
    ]);
    for (const r of flux) {
      const e = get(r.main_id);
      if (Number.isFinite(r.mag_v) && e.magV == null) e.magV = r.mag_v;
      if (Number.isFinite(r.mag_k) && e.magK == null) e.magK = r.mag_k;
      const unit = String(r.diameter_unit ?? '').trim();
      if (r.diameter > 0 && (unit === 'mas' || unit === 'km') && e.diameter == null) {
        e.diameter = { value: r.diameter, unit };
      }
    }
    // Ordered by mespos, so the first row for a star is its preferred measurement.
    for (const r of teff) {
      const e = get(r.main_id);
      if (e.teffK == null && r.teff > 0) e.teffK = r.teff;
      if (e.logG == null && Number.isFinite(r.log_g)) e.logG = r.log_g;
    }
    return { sizes, source: 'live', warning: null };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return {
      sizes,
      source: 'none',
      warning: `Star sizes could not be fetched (${error?.message ?? error}); every star will use its class band instead.`
    };
  }
}

// THE MEMBERS A CONTAINER DOES NOT RESOLVE (D29 - "completely forgets luhman 16").
//
// A multiple-star container whose components are absent from the census is kept as the only record
// of its system and imports as ONE body. Luhman 16 is the owner's example: `NAME Luhman 16`, a
// single row typed `L7.5+T0.5`, so a famous binary brown dwarf arrived as one object.
//
// ITS COMPONENTS EXIST, IN `h_link`, WITH NO PARALLAX OF THEIR OWN - which is exactly why no query
// the importer could make ever returned them, because every star query carries `plx_value > 0`.
// Fetching them and giving them the PARENT'S parallax is not a fudge: two members of one system are
// at the same distance, which is the same reasoning `projectedSeparationAu` already rests on.
// Once they are in the row set the census does the rest by itself - the container is dropped
// because its components are now present, and they group into one system on their real separation.
//
// THREE GUARDS, AND EVERY ONE OF THEM IS SOMETHING THE LIVE SERVICE ACTUALLY RETURNED:
//  1. A COMPONENT MUST CARRY A SPECTRAL TYPE. Ross 614's children are two untyped `Gaia DR3 ...`
//     rows 17 arcsec away - field detections, not the 1.2 arcsec companion. Importing them would
//     invent two stars out of the rule pack's default band, which is the one thing DATA-R4 forbids.
//     The point of recovering a member is that the catalogue SAYS what it is.
//  2. NOT ALREADY IN THE CENSUS. Alpha Centauri's children are A and B, which are already rows.
//  3. NOT TWICE. `h_link` returned one of Ross 614's children twice in a single answer.
export async function loadContainerComponents(rows, { fetchImpl = fetch, signal } = {}) {
  const present = new Set((rows ?? []).map((r) => r.main_id));
  const containers = (rows ?? []).filter((r) => isContainerRow({ otype: r.otype, sp: r.sp_type }));
  if (!containers.length) return { rows: [], source: 'live', warning: null };
  try {
    const children = await runTap('simbad', simbadComponentsOfAdql(containers.map((c) => c.main_id)), { fetchImpl, signal });
    const parentPlx = new Map(containers.map((c) => [c.main_id, c.plx_value]));
    const seen = new Set();
    const recovered = [];
    for (const child of children) {
      if (!child.main_id || present.has(child.main_id) || seen.has(child.main_id)) continue;
      if (!String(child.sp_type ?? '').trim()) continue;
      const plx = child.plx_value > 0 ? child.plx_value : parentPlx.get(child.parent_id);
      if (!(plx > 0) || !Number.isFinite(child.ra) || !Number.isFinite(child.dec)) continue;
      seen.add(child.main_id);
      recovered.push({
        main_id: child.main_id, ra: child.ra, dec: child.dec,
        plx_value: plx, sp_type: child.sp_type, otype: child.otype
      });
    }
    return { rows: recovered, source: 'live', warning: null };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    // Enrichment again: without it a container simply imports as one body, as it did before.
    return { rows: [], source: 'none', warning: null };
  }
}

// Load the archive rows for a region. Returns { rows, source, warning }.
// `source` is 'live', 'live-proxy' or 'bundled'; `warning` is set when the
// bundled snapshot cannot fully cover the requested region.
//
// Order of attack, measured rather than assumed (2026-08-03): a DIRECT
// browser query is always CORS-blocked by the archive (no ACAO header), so
// in the app the real live path is the same-origin proxy /api/realsky-tap.
// Direct is still tried first because it is the right path for node
// (tests, the build kit) where CORS does not exist and no server is running.
export async function loadArchiveRows(region, { fetchImpl = fetch, signal } = {}) {
  const adql = archivePlanetsAdql(region);
  try {
    const rows = await runTap('archive', adql, { fetchImpl, signal });
    return { rows, source: 'live', warning: null };
  } catch (directError) {
    if (directError?.name === 'AbortError') throw directError;
    try {
      const res = await fetchImpl(`/api/realsky-tap?${new URLSearchParams({ query: adql })}`, { signal });
      if (res.ok) return { rows: await res.json(), source: 'live-proxy', warning: null };
    } catch (proxyError) {
      if (proxyError?.name === 'AbortError') throw proxyError;
    }
    return loadBundledSnapshot(region, { fetchImpl, signal, liveError: directError });
  }
}

async function loadBundledSnapshot(region, { fetchImpl, signal, liveError }) {
  {
    const res = await fetchImpl(BUNDLED_CACHE_URL, { signal });
    if (!res.ok) {
      throw new Error(
        `Live archive query failed (${liveError?.message ?? liveError}) and the bundled snapshot could not be read (HTTP ${res.status}).`
      );
    }
    const rows = await res.json();
    const reachLy = (region.centre?.distLy ?? 0) + region.radiusLy;
    const warning = reachLy > BUNDLED_CACHE_MAX_LY
      ? `Live archive unreachable — using the bundled snapshot, which only covers ${Math.round(BUNDLED_CACHE_MAX_LY)} light years from Sol. This region reaches ${Math.round(reachLy)} ly, so distant hosts will be missing.`
      : 'Live archive unreachable — using the bundled snapshot (complete for this region, but only as fresh as this build).';
    return { rows, source: 'bundled', warning };
  }
}
