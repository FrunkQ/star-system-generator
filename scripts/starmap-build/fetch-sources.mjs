// Fetch authoritative astronomy source data for the example starmaps.
// - NASA Exoplanet Archive (TAP, pscomppars): every confirmed planet within ~12.7 pc,
//   with host-star parameters.
// - SIMBAD (TAP): astrometry (ICRS RA/Dec, parallax) + spectral types for the full
//   star roster, including planetless stars the Exoplanet Archive doesn't cover.
// Results are cached as JSON under data/cache/ so build-starmaps.mjs runs offline.
//
// Usage: node scripts/starmap-build/fetch-sources.mjs

import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, 'data', 'cache');
mkdirSync(cacheDir, { recursive: true });

async function tap(url, label) {
  console.log(`Fetching ${label}...`);
  const res = await fetch(url, { headers: { 'User-Agent': 'star-system-explorer starmap build' } });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

// --- NASA Exoplanet Archive: confirmed planets within 12.7 pc ---------------
const psCols = [
  'pl_name', 'hostname', 'sy_dist', 'ra', 'dec',
  'st_spectype', 'st_teff', 'st_rad', 'st_mass', 'st_lum', 'st_age', 'st_rotp',
  'pl_orbper', 'pl_orbsmax', 'pl_orbeccen', 'pl_orbincl', 'pl_orblper',
  'pl_bmasse', 'pl_bmassprov', 'pl_rade', 'pl_dens', 'pl_eqt',
  'discoverymethod', 'disc_year', 'cb_flag'
].join(',');
const psQuery = encodeURIComponent(
  `select ${psCols} from pscomppars where sy_dist < 12.7 order by sy_dist, pl_orbsmax`
);
const psUrl = `https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=${psQuery}&format=json`;

// --- SIMBAD: astrometry for the full roster ---------------------------------
// One query per identifier (SIMBAD's ident table resolves any alias).
const simbadIds = [
  'Sirius A', 'Sirius B', 'Procyon A', 'Procyon B', 'Vega', 'Altair',
  '61 Cyg A', '61 Cyg B', 'GJ 860 A', 'GJ 860 B',
  'BL Cet', 'UV Cet', 'Luhman 16', 'Wolf 359', 'Ross 154', 'Ross 248',
  'zet01 Ret', 'zet02 Ret', 'GJ 166 A', '40 Eri B', '40 Eri C',
  'GJ 725 A', 'GJ 725 B', "Kapteyn's star", 'eps Ind',
  'alf Cen A', 'alf Cen B', 'Proxima Centauri',
  "Barnard's star", 'Lalande 21185', 'eps Eri', 'Ross 128',
  "Teegarden's star", "Luyten's star", 'tau Cet', 'TRAPPIST-1',
  'Lacaille 9352', 'GJ 1061', 'YZ Cet', 'GJ 15 A', 'GJ 15 B',
  'Wolf 1061', 'GJ 876', 'GJ 1002',
  'EZ Aqr', 'DX Cnc', 'WISEA J085510.74-071442.5', 'SCR J1845-6357',
  'GJ 9066', 'GJ 674', 'GJ 687', 'eps Ind B', 'GJ 832', 'GJ 682'
];

async function fetchSimbad() {
  let out = {};
  try {
    out = JSON.parse(readFileSync(join(cacheDir, 'simbad-roster.json'), 'utf-8'));
  } catch { /* no cache yet */ }
  for (const id of simbadIds) {
    if (out[id]) continue; // already cached
    const q = encodeURIComponent(
      `select b.main_id, b.ra, b.dec, b.plx_value, b.sp_type, b.pmra, b.pmdec, b.rvz_radvel ` +
      `from basic b join ident i on i.oidref = b.oid where i.id = '${id.replace(/'/g, "''")}'`
    );
    const url = `https://simbad.cds.unistra.fr/simbad/sim-tap/sync?request=doQuery&lang=adql&format=json&query=${q}`;
    try {
      const j = await tap(url, `SIMBAD ${id}`);
      out[id] = j.data?.[0] ?? null;
      if (!out[id]) console.warn(`  !! no SIMBAD row for "${id}"`);
    } catch (e) {
      console.warn(`  !! SIMBAD ${id} failed: ${e.message}`);
      out[id] = null;
    }
  }
  return out;
}

const archive = await tap(psUrl, 'NASA Exoplanet Archive pscomppars (<12.7 pc)');
writeFileSync(join(cacheDir, 'archive-pscomppars.json'), JSON.stringify(archive, null, 1));
// Also published as a static asset: the in-app real-sky importer falls back to
// it when the live TAP service is unreachable (src/lib/import/realsky/catalogue.mjs).
writeFileSync(join(here, '..', '..', 'static', 'realsky', 'pscomppars.json'), JSON.stringify(archive, null, 1));
console.log(`  ${archive.length} planet rows cached (+ static/realsky copy).`);

const simbad = await fetchSimbad();
writeFileSync(join(cacheDir, 'simbad-roster.json'), JSON.stringify(simbad, null, 1));
console.log(`  ${Object.values(simbad).filter(Boolean).length}/${simbadIds.length} SIMBAD rows cached.`);
console.log('Done. Caches written to scripts/starmap-build/data/cache/');
