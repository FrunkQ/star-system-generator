// Same-origin proxy for the NASA Exoplanet Archive TAP service.
//
// MEASURED 2026-08-03 (from the deployed beta origin and confirmed in the
// owner's console): the archive sends no Access-Control-Allow-Origin header,
// so browsers ALWAYS block direct queries — not intermittently, by policy.
// SIMBAD sends CORS and needs no proxy. This route forwards a read-only ADQL
// query server-side, where CORS does not apply, so the importer can use live
// archive data instead of only the bundled snapshot.
//
// Deliberately NOT an open proxy: only SELECT queries against the pscomppars
// table are forwarded, with a length cap. Usage is a handful of queries per
// import — well inside the archive's public-service expectations, and the
// About dialogue carries the archive's requested acknowledgment.
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const ARCHIVE_TAP = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';
const MAX_QUERY_LENGTH = 2000;

export const GET: RequestHandler = async ({ url, fetch }) => {
  const query = url.searchParams.get('query') ?? '';
  const q = query.trim().toLowerCase();
  if (!q || query.length > MAX_QUERY_LENGTH) throw error(400, 'missing or oversized query');
  if (!q.startsWith('select') || !q.includes('from pscomppars')) {
    throw error(400, 'only SELECT queries against pscomppars are forwarded');
  }
  const upstream = await fetch(`${ARCHIVE_TAP}?${new URLSearchParams({ query, format: 'json' })}`, {
    headers: { 'User-Agent': 'star-system-explorer real-sky import (same-origin proxy)' }
  });
  if (!upstream.ok) throw error(502, `archive TAP: HTTP ${upstream.status}`);
  return json(await upstream.json());
};
