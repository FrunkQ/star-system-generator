// Real-sky import — TAP query layer (design doc §1b, §2, §5b).
//
// Builds ADQL for the three services and translates the GM's mental model
// ("everything within N light years of X") into what TAP can answer (a
// parallax distance shell intersected with a sky cone), leaving the exact
// 3D-sphere cut to positions.mjs so filtering and placement share one maths.
//
// Everything here is a pure function except runTap, whose fetch is
// injectable: the browser passes nothing (native fetch), tests pass a stub,
// and a future proxy fallback swaps the transport without touching a query.
//
// Counts before data, always: countAdql variants exist so the UI can show
// live cost as the controls move without ever fetching rows (§5b).

import { LY_PER_PC } from './constants.mjs';
import { radecToXyzLy } from './positions.mjs';

export const TAP_SERVICES = {
  // NASA Exoplanet Archive: every confirmed planet + host-star parameters.
  archive: 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync',
  // SIMBAD: name resolution + astrometry for any catalogued star.
  simbad: 'https://simbad.cds.unistra.fr/simbad/sim-tap/sync',
  // Gaia DR3: the bulk stellar population.
  gaia: 'https://gea.esac.esa.int/tap-server/tap/sync'
};

// The archive columns the converter consumes (kept in step with convert.mjs).
export const ARCHIVE_COLUMNS = [
  'pl_name', 'hostname', 'sy_dist', 'ra', 'dec',
  'st_spectype', 'st_teff', 'st_rad', 'st_mass', 'st_lum', 'st_age', 'st_rotp',
  'pl_orbper', 'pl_orbsmax', 'pl_orbeccen', 'pl_orbincl', 'pl_orblper',
  'pl_bmasse', 'pl_bmassprov', 'pl_rade', 'pl_dens', 'pl_eqt',
  'discoverymethod', 'disc_year', 'cb_flag'
];

const num = (v, name) => {
  if (!Number.isFinite(v)) throw new Error(`region: ${name} must be a finite number, got ${v}`);
  return v;
};

// A REGION is { centre, radiusLy } where centre is either SOL_CENTRE or
// { raDeg, decDeg, distLy } (a resolved star or a bare RA/Dec + distance).
export const SOL_CENTRE = Object.freeze({ raDeg: 0, decDeg: 0, distLy: 0 });
export const isSolCentred = (centre) => (centre?.distLy ?? 0) <= 0;

// Translate a true 3D sphere into TAP-queryable bounds: a parallax distance
// shell, plus (for an off-Sol centre farther away than the radius) a sky cone
// of half-angle asin(R/(d-R)) around the centre's direction. The bounds
// OVER-fetch slightly; positions.inSphere applies the exact cut afterwards.
// When the sphere contains Sol the cone degrades to the plain shell (§1b).
export function regionBounds(region) {
  const { centre, radiusLy } = region;
  num(radiusLy, 'radiusLy');
  if (radiusLy <= 0) throw new Error(`region: radiusLy must be positive, got ${radiusLy}`);
  const dLy = isSolCentred(centre) ? 0 : num(centre.distLy, 'centre.distLy');
  const shellMinLy = Math.max(0, dLy - radiusLy);
  const shellMaxLy = dLy + radiusLy;
  const sphereContainsSol = dLy <= radiusLy;
  return {
    shellMinPc: shellMinLy / LY_PER_PC,
    shellMaxPc: shellMaxLy / LY_PER_PC,
    // null = whole sky (Sol-centred, or the sphere swallows Sol's origin).
    coneHalfAngleDeg: sphereContainsSol
      ? null
      : (Math.asin(Math.min(1, radiusLy / shellMinLy)) * 180) / Math.PI,
    centreXyzLy: isSolCentred(centre) ? { x: 0, y: 0, z: 0 } : radecToXyzLy(centre.raDeg, centre.decDeg, dLy)
  };
}

// Shared WHERE clause for a region against a table exposing ra/dec (deg) and
// a distance in PARSECS via `distExprPc` (archive: sy_dist; Gaia/SIMBAD:
// 1000/parallax). ADQL's CONTAINS/CIRCLE does the sky cone.
function regionWhere(region, distExprPc) {
  const b = regionBounds(region);
  const clauses = [
    `${distExprPc} >= ${b.shellMinPc.toFixed(6)}`,
    `${distExprPc} <= ${b.shellMaxPc.toFixed(6)}`
  ];
  if (b.coneHalfAngleDeg != null) {
    const { centre } = region;
    clauses.push(
      `CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', ${centre.raDeg.toFixed(6)}, ${centre.decDeg.toFixed(6)}, ${b.coneHalfAngleDeg.toFixed(6)})) = 1`
    );
  }
  return clauses.join(' AND ');
}

// ---------------------------------------------------------------- archive
export function archivePlanetsAdql(region) {
  return `select ${ARCHIVE_COLUMNS.join(',')} from pscomppars where ${regionWhere(region, 'sy_dist')} order by sy_dist, pl_orbsmax`;
}
export function archiveCountAdql(region) {
  // Distinct hosts = systems; pl_name rows = planets. Both in one query.
  return `select count(distinct hostname) as systems, count(*) as planets from pscomppars where ${regionWhere(region, 'sy_dist')}`;
}

// ---------------------------------------------------------------- SIMBAD
// Name resolution: any alias through the ident table. Returns astrometry the
// caller turns into a region centre.
export function simbadResolveAdql(name) {
  const safe = name.replace(/'/g, "''");
  return (
    `select b.main_id, b.ra, b.dec, b.plx_value, b.sp_type, b.otype ` +
    `from basic b join ident i on i.oidref = b.oid where i.id = '${safe}'`
  );
}

// THE STELLAR CENSUS — the query that makes this a STARMAP importer (D18).
//
// The archive query above returns PLANET HOSTS, so a star with no confirmed planet was never in the
// result set: no Sol, no Alpha Centauri A or B, while Proxima arrived because it happens to have
// planets. This is the primary query now, and `archivePlanetsAdql` becomes an enrichment join.
//
// SIMBAD rather than Gaia for the near field, and the reason is measured (DATA-R6): SIMBAD sends
// `Access-Control-Allow-Origin: *` and answers a browser directly, while the archive is always
// CORS-blocked and Gaia is unverified. Gaia's cone stays below for the wide-field presets, where its
// depth is the point.
//
// Planets are excluded in the query AND again in `census.normaliseStarRows`, because SIMBAD's own
// `otype` is not reliable here: 40 Eridani b, a planet, is typed 'err'.
export const SIMBAD_STAR_COLUMNS = ['main_id', 'ra', 'dec', 'plx_value', 'sp_type', 'otype'];

export function simbadStarsAdql(region, { count = false } = {}) {
  const distPc = '(1000.0/plx_value)';
  const clauses = [
    'plx_value > 0',
    'ra is not null',
    "otype not in ('Pl', 'Pl?')",
    regionWhere(region, distPc)
  ];
  const cols = count ? 'count(*) as systems' : SIMBAD_STAR_COLUMNS.join(', ');
  return `select ${cols} from basic where ${clauses.join(' AND ')}${count ? '' : ' order by plx_value desc'}`;
}

// ---------------------------------------------------------------- Gaia
// The bulk population. parallax_over_error guards the distance shell against
// junk parallaxes; the magnitude cut is the "Bright stars" preset's lever.
export function gaiaConeAdql(region, { magLimit = null, count = false } = {}) {
  const distPc = '(1000.0/parallax)';
  const clauses = [
    'parallax > 0',
    'parallax_over_error > 5',
    regionWhere(region, distPc)
  ];
  if (magLimit != null) clauses.push(`phot_g_mean_mag <= ${num(magLimit, 'magLimit').toFixed(2)}`);
  const cols = count
    ? 'count(*) as systems'
    : 'source_id, ra, dec, parallax, phot_g_mean_mag, bp_rp, radial_velocity';
  return `select ${cols} from gaiadr3.gaia_source where ${clauses.join(' AND ')}`;
}

// ---------------------------------------------------------------- transport
export function tapUrl(service, adql, { format = 'json' } = {}) {
  const base = TAP_SERVICES[service];
  if (!base) throw new Error(`Unknown TAP service "${service}"`);
  const params = new URLSearchParams(
    service === 'simbad' || service === 'gaia'
      ? { request: 'doQuery', lang: 'adql', format, query: adql }
      : { query: adql, format }
  );
  return `${base}?${params}`;
}

// Run a TAP query. fetchImpl is injectable for tests and for a future proxy
// fallback; signal supports the UI's debounced live counts (abort the stale
// count when the slider moves again).
// NO CUSTOM HEADERS, AND `User-Agent` IN PARTICULAR. A browser ignores an attempt to set it, so it
// never did anything — but where a browser DOES allow it, it stops being a simple request and the
// browser sends a CORS preflight first. SIMBAD answers `OPTIONS` with an HTTP 400 and no
// `Access-Control-Allow-Headers`, so the preflight fails and every query dies as a bare
// "Failed to fetch" with nothing useful reaching the app. Measured against the live service, and it
// is the only mechanism found that produces exactly the message D24 reports.
export async function runTap(service, adql, { fetchImpl = fetch, signal, format = 'json' } = {}) {
  const res = await fetchImpl(tapUrl(service, adql, { format }), { signal });
  if (!res.ok) throw new Error(`${service} TAP: HTTP ${res.status} ${await res.text()}`);
  const body = await res.json();
  // The archive returns a plain array of row objects; SIMBAD and Gaia return
  // the VOTable-JSON envelope { metadata|columns, data: [[...]] }. Normalise
  // to an array of objects keyed by column name.
  if (Array.isArray(body)) return body;
  const cols = (body.metadata ?? body.columns ?? []).map((c) => c.name);
  return (body.data ?? []).map((row) => Object.fromEntries(row.map((v, i) => [cols[i], v])));
}
