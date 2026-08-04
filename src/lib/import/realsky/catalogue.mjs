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
import { archivePlanetsAdql, runTap } from './query.mjs';

export const BUNDLED_CACHE_URL = '/realsky/pscomppars.json';
export const BUNDLED_CACHE_MAX_LY = 12.7 * LY_PER_PC; // ~41.4 — the snapshot's own query bound

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
