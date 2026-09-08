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
  'discoverymethod', 'disc_year', 'cb_flag',
  // D28(3): the system's own star count, so an import can SAY when the census resolved fewer.
  'sy_snum'
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
function regionWhere(region, distExprPc, prefix = '') {
  const b = regionBounds(region);
  const clauses = [
    `${distExprPc} >= ${b.shellMinPc.toFixed(6)}`,
    `${distExprPc} <= ${b.shellMaxPc.toFixed(6)}`
  ];
  if (b.coneHalfAngleDeg != null) {
    const { centre } = region;
    clauses.push(
      `CONTAINS(POINT('ICRS', ${prefix}ra, ${prefix}dec), CIRCLE('ICRS', ${centre.raDeg.toFixed(6)}, ${centre.decDeg.toFixed(6)}, ${b.coneHalfAngleDeg.toFixed(6)})) = 1`
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

// WHEN AN EXACT LOOKUP FAILS. Deliberately NOT a catalogue browser: listing a hundred stars is
// impractical and not much use to anyone (owner, 2026-08-14). The order of preference is
//   1. resolve the FOLDED form exactly    — "Epsilon Eridani" -> "eps Eri", one star, no list
//   2. offer a system's COMPONENTS        — "61 Cygni" -> 61 Cygni A and B, two rows
//   3. offer a SHORT list, up to 20
//   4. past 20, ask for more instead of listing
// and only step 3 shows anything list-shaped at all.
//
// EVERY SHAPE HERE WAS TIMED AGAINST THE LIVE SERVICE, because the fast and slow ones are not
// distinguishable by reading them:
//   - `id = '<term>'` (the resolve path)                        70-310 ms   <- SIMBAD normalises here
//   - `main_id like 'eps%'` + order by, top 15-21               ~200 ms
//   - `main_id like '* alf Cen%'` + order by  (SPACE IN TERM)   **18 SECONDS**
//   - `select count(*)` over the same prefixes                  ~6 s
//   - the `ident` alias join, `like 'eps%'` / `like '61 Cyg%'`  1.1 s / **120 s**
// A LIKE prefix containing a SPACE defeats SIMBAD's index, and a count costs as much as the rows.
// So: a term with a space is never sent as a LIKE, and the "more than 20?" question is answered by
// asking for 21 rows rather than by counting.
export const SUGGEST_LIMIT = 20;

// A short list of stars whose identifier starts with `term`, nearest first. SINGLE-TOKEN TERMS ONLY
// — see the timings above. Asks for one more than it will show, so the caller can tell "20" from
// "at least 21" without a second query.
export function simbadSearchAdql(term, { limit = SUGGEST_LIMIT } = {}) {
  const safe = String(term ?? '').replace(/'/g, "''");
  const where = ['', '* ', 'V* ', 'NAME '].map((p) => `main_id like '${p}${safe}%'`).join(' or ');
  return (
    `select top ${limit + 1} main_id, ra, dec, plx_value, sp_type, otype from basic ` +
    `where (${where}) and plx_value > 0 and otype not in ('Pl', 'Pl?') order by plx_value desc`
  );
}

// THE STARS THAT MAKE UP A SYSTEM. `61 Cygni` resolves — to `*  61 Cyg`, the PAIR, which carries no
// parallax of its own, so it cannot be a region centre and the search dead-ends on a hit. Its
// components each have one. This is the useful answer to that, and it is two rows rather than a
// list: SIMBAD's `h_link` hierarchy, which is what the relationship actually is.
//
// Via h_link and NOT `main_id like '<id> %'`, and the difference is measured: 177 ms against 3.2 s,
// because that pattern has the same space in it as everything else slow here.
// EVERY COLUMN IS ALIASED, and that is not style. SIMBAD's ADQL parser rejects a QUALIFIED name in
// `order by` ("Encountered '.'"), but an UNqualified `plx_value` is ambiguous across this join
// ("It may be (at least) c.plx_value or …") — so the only shape that parses is to alias the columns
// in the select and order by the alias. Aliasing them all also keeps the row shape identical to
// `simbadSearchAdql`'s, so the caller handles both lists the same way.
export function simbadComponentsAdql(mainId, { limit = 8 } = {}) {
  const safe = String(mainId ?? '').replace(/'/g, "''");
  return (
    `select top ${limit} c.main_id as main_id, c.ra as ra, c.dec as dec, ` +
    `c.plx_value as plx_value, c.sp_type as sp_type, c.otype as otype ` +
    `from h_link h join basic c on c.oid = h.child join basic p on p.oid = h.parent ` +
    `where p.main_id = '${safe}' and c.plx_value > 0 and c.otype not in ('Pl', 'Pl?') order by plx_value desc`
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

// ---------------------------------------------------- SIMBAD: what a star's SIZE is measured to be
//
// D29. THE CENSUS QUERY ABOVE CANNOT CARRY A SIZE, and the reason is not that somebody forgot the
// column: `basic` HAS no mass, radius or temperature column, measured against TAP_SCHEMA on
// 2026-09-08. SIMBAD keeps measurements in separate `mes*` tables, and there is no mass table at all.
// So these two queries fetch what the catalogue DOES measure and `starSize.mjs` turns it into a size.
//
// TWO QUERIES RATHER THAN ONE, AND THAT IS DELIBERATE. `mesFe_h` holds one row per PUBLICATION - 43
// for Sirius, 117 for Arcturus - so joining it beside `allfluxes` and `mesDiameter` in a single
// select multiplies the row count by that. They are kept apart and reduced caller-side.
//
// BOTH ARE ENRICHMENT AND NEITHER MAY BREAK AN IMPORT. A star with no measured size still imports on
// its class band, exactly as it did before this existed - see `loadStarSizes`.

// One row per object: the magnitudes, and a direct diameter where SIMBAD has one.
// `allfluxes` is one row per object; `mesDiameter` is rare enough (10 of 74 locally) that its
// multiplicity costs nothing. THE `unit` COLUMN IS FETCHED BECAUSE IT VARIES PER ROW - SIMBAD writes
// 'mas' for an interferometric diameter and 'km' for a derived one, and HD 95735 carries one of each.
export function simbadStarFluxAdql(region) {
  const distPc = '(1000.0/b.plx_value)';
  const clauses = [
    'b.plx_value > 0',
    'b.ra is not null',
    "b.otype not in ('Pl', 'Pl?')",
    regionWhere(region, distPc, 'b.')
  ];
  return (
    `select b.main_id as main_id, x.V as mag_v, x.K as mag_k, ` +
    `d.diameter as diameter, d.unit as diameter_unit ` +
    `from basic b left join allfluxes x on x.oidref = b.oid ` +
    `left join mesDiameter d on d.oidref = b.oid ` +
    `where ${clauses.join(' AND ')}`
  );
}

// The effective temperature and surface gravity, newest measurement first.
// `teff is not null` IS LOAD-BEARING: the lowest `mespos` for a star is often a metallicity-only
// row with no temperature in it, so ordering without this filter hands back a null for a star that
// has sixty published temperatures. Barnard's star is the local example.
export function simbadStarTeffAdql(region) {
  const distPc = '(1000.0/b.plx_value)';
  const clauses = [
    'b.plx_value > 0',
    'b.ra is not null',
    "b.otype not in ('Pl', 'Pl?')",
    'f.teff is not null',
    regionWhere(region, distPc, 'b.')
  ];
  return (
    `select b.main_id as main_id, f.teff as teff, f.log_g as log_g, f.mespos as mespos ` +
    `from mesFe_h f join basic b on b.oid = f.oidref ` +
    `where ${clauses.join(' AND ')} order by main_id, mespos`
  );
}

// -------------------------------------------- SIMBAD: the members a container does not resolve
//
// D29. A multiple-star container that the census keeps - because none of its components came back -
// is the ONLY record of its system, and it imports as one body. Luhman 16 is the owner's example.
//
// ITS COMPONENTS DO EXIST. `NAME Luhman 16A` (L7.5) and `NAME Luhman 16B` (T0.5) are in SIMBAD's
// `h_link` hierarchy with their own positions and their own K magnitudes - and with NO PARALLAX,
// which is precisely why no query the importer could make ever returned them: every star query
// carries `plx_value > 0`. That clause is right for a whole-sky census (a row with no parallax
// cannot be placed) and wrong here, where the parent's parallax is the answer: two members of one
// system are at the same distance, which is the same reasoning `census.projectedSeparationAu`
// already relies on.
//
// SO THIS QUERY DELIBERATELY OMITS `plx_value > 0`, and the caller supplies the distance. It is the
// one place in the importer that does, and the reason is the whole point of the query.
export function simbadComponentsOfAdql(mainIds, { limit = 40 } = {}) {
  const list = (Array.isArray(mainIds) ? mainIds : [mainIds])
    .map((id) => `'${String(id).replace(/'/g, "''")}'`)
    .join(',');
  return (
    `select top ${limit} p.main_id as parent_id, c.main_id as main_id, c.ra as ra, c.dec as dec, ` +
    `c.plx_value as plx_value, c.sp_type as sp_type, c.otype as otype ` +
    `from h_link h join basic c on c.oid = h.child join basic p on p.oid = h.parent ` +
    `where p.main_id in (${list}) and c.otype not in ('Pl', 'Pl?')`
  );
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
