// CALIBRATE THE BUNDLED SOL TO REALITY AT THE DATUM (G62 part 2).
//
// Owner: "before there was no point in aligning the planets to reality as time was arbitrary - not
// now." Every planet shipped with Omega_deg 0 and omega_deg 0 - placeholders, because until the
// anchor existed there was no instant for them to be right AT.
//
// WHAT IS TOUCHED: the eight planets, Luna, and the Pluto-Charon barycentre's heliocentric orbit
// where one exists. NOTHING ELSE MOVES - every other moon, belt, ring, station and ship keeps its
// own t0 and M0_rad exactly as authored.
//
// THE SOURCES ONLY. The two bundled starmaps are GENERATED - scripts/starmap-build builds their Sol
// FROM Sol_2030-System.json - so writing to them directly is work the next `build-starmaps.mjs`
// would silently undo. That is exactly the failure buildKit.spec.mjs exists to catch (D4), and it
// caught it here: a first pass of this script edited all four files and the spec went red.
// Calibrate the sources, update the shell, then regenerate.
//
// Idempotent: running it twice leaves the files byte-identical.
const fs = require('fs');
const path = require('path');
const { planetElements, lunaElements } = require('./solElements.cjs');

const DATUM_ISO = '2026-09-01T12:00:00Z'; // the anchor's stake_utc
const DATUM_MS = Date.parse(DATUM_ISO);

const PLANET_BY_NAME = {
  mercury: 'Mercury', venus: 'Venus', earth: 'Earth', mars: 'Mars',
  jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune'
};

const FILES = [
  'static/examples/Sol_2030-System.json',
  'static/examples/Sol_Expanse-System.json'
];

/** The generator's shell carries the campaign clock and a copy of the shipped calendars. */
const SHELL = 'scripts/starmap-build/data/starmap-shell.json';
const CALENDARS = 'static/temporal/calendars.json';

const CRLF = String.fromCharCode(13) + String.fromCharCode(10);
const LF = String.fromCharCode(10);
const TAB = String.fromCharCode(9);

function round(v, dp) { const f = Math.pow(10, dp); return Math.round(v * f) / f; }

function writeElements(node, el, label, log) {
  const before = { ...node.orbit.elements };
  node.orbit.elements.a_AU = round(el.a_AU, 9);
  node.orbit.elements.e = round(el.e, 8);
  node.orbit.elements.i_deg = round(el.i_deg, 6);
  node.orbit.elements.omega_deg = round(el.omega_deg, 5);
  node.orbit.elements.Omega_deg = round(el.Omega_deg, 5);
  node.orbit.elements.M0_rad = round(el.M0_rad, 10);
  node.orbit.t0 = DATUM_MS;
  // PHY-33's BLAST: orbitMeanMotion respects a stored n_rad_per_s, and SystemProcessor prefers it
  // for the displayed period too, so the motion and the readout cannot disagree. It is NOT optional
  // here: sqrt(mu/a^3) uses the PRIMARY's mass alone, which gives Luna a 27.45179 d sidereal month
  // against the real 27.32166 - 0.13 d of drift every lunation.
  node.orbit.n_rad_per_s = el.n_rad_per_s;
  log.push('    ' + label.padEnd(10) +
    ' a=' + node.orbit.elements.a_AU +
    '  e=' + node.orbit.elements.e +
    '  i=' + node.orbit.elements.i_deg +
    '  Om=' + node.orbit.elements.Omega_deg +
    '  om=' + node.orbit.elements.omega_deg +
    '  M0=' + node.orbit.elements.M0_rad +
    '   (was Om=' + before.Omega_deg + ' om=' + before.omega_deg + ')');
}

function calibrateSystem(sol, log) {
  const byId = new Map(sol.nodes.map((n) => [n.id, n]));
  let touched = 0;
  sol.epochT0 = DATUM_MS;

  for (const node of sol.nodes) {
    if (!node.orbit || !node.orbit.elements) continue;
    const nm = String(node.name || '').trim().toLowerCase();

    if (PLANET_BY_NAME[nm]) {
      writeElements(node, planetElements(PLANET_BY_NAME[nm], DATUM_MS), node.name, log);
      touched++;
      continue;
    }
    if (nm === 'luna') {
      writeElements(node, lunaElements(DATUM_MS), 'Luna', log);
      touched++;
      continue;
    }
    // The Pluto-Charon barycentre carries the heliocentric orbit; the pair MEMBERS are owned by the
    // coupling pass (PHY-33), so their own elements are deliberately left alone.
    const isBary = node.kind === 'barycenter' || node.roleHint === 'barycenter';
    if (isBary && /pluto/i.test(node.name || '')) {
      const host = node.orbit.hostId ? byId.get(node.orbit.hostId) : null;
      if (host && (host.roleHint === 'star' || /^(sol|sun)$/i.test(host.name || ''))) {
        writeElements(node, planetElements('Pluto', DATUM_MS), 'Pluto-bary', log);
        touched++;
      }
    }
  }
  return touched;
}

/**
 * Each bundled file has its OWN indent. Re-serialising at the wrong one reflows the WHOLE file:
 * doing exactly that turned a ten-body change into a 15,596-line diff on one map and 20,840 on
 * another, caught by the diff stat and reverted. DATA-R14.
 */
function detectIndent(raw, rel) {
  const bare = raw.split(CRLF).join(LF).replace(/\n+$/, '');
  for (const cand of [1, 2, 3, 4, TAB]) {
    if (JSON.stringify(JSON.parse(raw), null, cand) === bare) return cand;
  }
  // Sol_2030 spells exponents e-09 where JSON.stringify writes e-9: 26 lines of the same NUMBER
  // written differently. Indent 2 is still its shape, so take it and say so out loud.
  console.log('  NOTE: ' + rel + ' does not round-trip byte-for-byte (exponent style); indent 2.');
  return 2;
}

function writeJson(rel, obj, raw) {
  const crlf = raw.indexOf(CRLF) !== -1;
  const indent = detectIndent(raw, rel);
  let out = JSON.stringify(obj, null, indent);
  if (crlf) out = out.split(LF).join(CRLF);
  out += crlf ? CRLF : LF;
  fs.writeFileSync(path.join(process.cwd(), rel), out, 'utf8');
  return indent;
}

let grand = 0;
for (const rel of FILES) {
  const raw = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
  const j = JSON.parse(raw);
  const log = [];
  let touched = 0;
  for (const entry of (j.systems ? j.systems : [j])) {
    const sys = entry.system || entry;
    if (!/^(sol|sun)$/i.test(String(sys.name || ''))) continue;
    log.push('  system "' + sys.name + '"');
    touched += calibrateSystem(sys, log);
  }
  const indent = writeJson(rel, j, raw);
  console.log(rel + '   (' + touched + ' bodies calibrated, indent ' + JSON.stringify(indent) + ')');
  console.log(log.join(LF));
  grand += touched;
}

// The generated maps take their clock and their calendar library from the shell. Park the clock ON
// the datum so an opened map shows the sky its elements were calibrated for, and re-sync the
// calendars so the maps stop shipping the 297-years-wrong epoch this batch fixed.
{
  const calendars = JSON.parse(fs.readFileSync(CALENDARS, 'utf8'));
  const anchor = calendars.temporal_anchor;
  const unixEpochMaster = BigInt(anchor.master_t) - BigInt(Math.floor(Date.parse(anchor.utc) / 1000));
  const tick = (unixEpochMaster + BigInt(Math.floor(DATUM_MS / 1000))).toString();
  const raw = fs.readFileSync(path.join(process.cwd(), SHELL), 'utf8');
  const shell = JSON.parse(raw);
  shell.temporal.masterTimeSec = tick;
  shell.temporal.displayTimeSec = tick;
  shell.temporal.temporal_registry = calendars.temporal_registry;
  writeJson(SHELL, shell, raw);
  console.log(LF + SHELL);
  console.log('  clock -> ' + tick + ' (' + DATUM_ISO + '); calendars re-synced from ' + CALENDARS);
}

console.log(LF + 'TOTAL bodies calibrated: ' + grand + ' at datum ' + DATUM_ISO);
console.log('NOW REGENERATE THE MAPS:  node scripts/starmap-build/build-starmaps.mjs');
