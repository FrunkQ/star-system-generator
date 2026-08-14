// Real-sky import — STAR NAMES, and it works in BOTH directions on purpose (inbox D24).
//
// SIMBAD writes for astronomers, in shorthand: Antares is `* alf Sco`. That is honest — it is what
// the catalogue calls the object — but "alf Sco" on a starmap is a database key, not a name.
//
// TWO-WAY FROM THE START, AND THAT IS NOT TIDINESS. A display-only prettifier produces an app that
// shows a name it cannot then find: a user copies "α Scorpii" out of the app, pastes it into the
// Resolve box, and gets an HTTP 400, because SIMBAD's TAP service REJECTS NON-ASCII OUTRIGHT
// ("Impossible to normalise the identifier ... unsupported character encoding"). So the Greek symbol
// is for DISPLAY and must never be SENT, and the two halves ship together or not at all.
//
// WHAT IS DELIBERATELY *NOT* HERE, because it was measured rather than assumed:
// SIMBAD already resolves the friendly forms. `Antares`, `alpha Scorpii`, `Alpha Sco`, `alf Scorpii`,
// `61 Cygni`, `Lalande 21185` and `Gliese 411` were all tried against the live service and all
// return the right object. So rewriting a user's query into the catalogue's own designation - which
// the inbox entry proposed - buys NOTHING, and would add a coverage risk and a table to maintain for
// it. The query side needs exactly one thing: ASCII.
//
// SOURCE AND ATTRIBUTION. The proper names below were extracted once from SIMBAD's own `ident`
// table (the `NAME` entries for objects whose canonical identifier is a Bayer or Flamsteed
// designation) and baked in, so the importer needs no extra network call. This research has made use
// of the SIMBAD database, operated at CDS, Strasbourg, France. Component designations and
// double-star catalogue entries that SIMBAD files as `NAME` were filtered out; where SIMBAD lists
// more than one name, the IAU Working Group on Star Names' choice was taken.
//
// SURVEY DESIGNATIONS ARE LEFT ALONE. `2MASS J09205549+4539058` has no friendly name, and showing it
// as it is is honest where mangling it would be inventing.

import { PROPER_NAMES } from './properNames.mjs';

// The 24 Bayer letters, in SIMBAD's three-letter abbreviation. Fixed forever.
export const GREEK = {
  alf: ['Alpha', 'α'], bet: ['Beta', 'β'], gam: ['Gamma', 'γ'], del: ['Delta', 'δ'],
  eps: ['Epsilon', 'ε'], zet: ['Zeta', 'ζ'], eta: ['Eta', 'η'], the: ['Theta', 'θ'],
  iot: ['Iota', 'ι'], kap: ['Kappa', 'κ'], lam: ['Lambda', 'λ'], mu: ['Mu', 'μ'],
  nu: ['Nu', 'ν'], ksi: ['Xi', 'ξ'], omi: ['Omicron', 'ο'], pi: ['Pi', 'π'],
  rho: ['Rho', 'ρ'], sig: ['Sigma', 'σ'], tau: ['Tau', 'τ'], ups: ['Upsilon', 'υ'],
  phi: ['Phi', 'φ'], chi: ['Chi', 'χ'], psi: ['Psi', 'ψ'], ome: ['Omega', 'ω']
};

// The 88 constellations, abbreviation to the GENITIVE form a designation uses: alpha OF Scorpius is
// "Alpha Scorpii". Fixed forever — the IAU settled the list in 1922 and the boundaries in 1930.
export const CONSTELLATION = {
  And: 'Andromedae', Ant: 'Antliae', Aps: 'Apodis', Aqr: 'Aquarii', Aql: 'Aquilae', Ara: 'Arae',
  Ari: 'Arietis', Aur: 'Aurigae', Boo: 'Bootis', Cae: 'Caeli', Cam: 'Camelopardalis', Cnc: 'Cancri',
  CVn: 'Canum Venaticorum', CMa: 'Canis Majoris', CMi: 'Canis Minoris', Cap: 'Capricorni',
  Car: 'Carinae', Cas: 'Cassiopeiae', Cen: 'Centauri', Cep: 'Cephei', Cet: 'Ceti',
  Cha: 'Chamaeleontis', Cir: 'Circini', Col: 'Columbae', Com: 'Comae Berenices',
  CrA: 'Coronae Australis', CrB: 'Coronae Borealis', Crv: 'Corvi', Crt: 'Crateris', Cru: 'Crucis',
  Cyg: 'Cygni', Del: 'Delphini', Dor: 'Doradus', Dra: 'Draconis', Equ: 'Equulei', Eri: 'Eridani',
  For: 'Fornacis', Gem: 'Geminorum', Gru: 'Gruis', Her: 'Herculis', Hor: 'Horologii', Hya: 'Hydrae',
  Hyi: 'Hydri', Ind: 'Indi', Lac: 'Lacertae', Leo: 'Leonis', LMi: 'Leonis Minoris', Lep: 'Leporis',
  Lib: 'Librae', Lup: 'Lupi', Lyn: 'Lyncis', Lyr: 'Lyrae', Men: 'Mensae', Mic: 'Microscopii',
  Mon: 'Monocerotis', Mus: 'Muscae', Nor: 'Normae', Oct: 'Octantis', Oph: 'Ophiuchi', Ori: 'Orionis',
  Pav: 'Pavonis', Peg: 'Pegasi', Per: 'Persei', Phe: 'Phoenicis', Pic: 'Pictoris', Psc: 'Piscium',
  PsA: 'Piscis Austrini', Pup: 'Puppis', Pyx: 'Pyxidis', Ret: 'Reticuli', Sge: 'Sagittae',
  Sgr: 'Sagittarii', Sco: 'Scorpii', Scl: 'Sculptoris', Sct: 'Scuti', Ser: 'Serpentis',
  Sex: 'Sextantis', Tau: 'Tauri', Tel: 'Telescopii', Tri: 'Trianguli', TrA: 'Trianguli Australis',
  Tuc: 'Tucanae', UMa: 'Ursae Majoris', UMi: 'Ursae Minoris', Vel: 'Velorum', Vir: 'Virginis',
  Vol: 'Volantis', Vul: 'Vulpeculae'
};

// A SIMBAD identifier stripped of its catalogue furniture: "* alf Cen A" -> "alf Cen A",
// "NAME Proxima Centauri" -> "Proxima Centauri", "*  61 Cyg A" -> "61 Cyg A".
export function stripCatalogueFurniture(mainId) {
  return String(mainId ?? '')
    .replace(/^(NAME|V\*|\*+)\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim() || String(mainId ?? '').trim();
}

// Split a Bayer or Flamsteed designation into its parts, or null if it is not one.
// "alf Sco" -> { bayer: 'alf', superscript: '', constellation: 'Sco', component: '' }
// "bet01 Cyg A" -> { bayer: 'bet', superscript: '01', constellation: 'Cyg', component: 'A' }
// "61 Cyg" -> { flamsteed: '61', constellation: 'Cyg', component: '' }
export function splitDesignation(designation) {
  const s = stripCatalogueFurniture(designation);
  const m = /^([A-Za-z]+)\.?(\d*)\s+([A-Za-z]{2,3})(?:\s+([A-Za-z]{1,3}))?$/.exec(s);
  if (m && GREEK[m[1].toLowerCase()] && CONSTELLATION[m[3]]) {
    return { bayer: m[1].toLowerCase(), superscript: m[2], constellation: m[3], component: m[4] ?? '' };
  }
  const f = /^(\d+)\s+([A-Za-z]{2,3})(?:\s+([A-Za-z]{1,3}))?$/.exec(s);
  if (f && CONSTELLATION[f[2]]) {
    return { flamsteed: f[1], constellation: f[2], component: f[3] ?? '' };
  }
  return null;
}

// EXPAND THE ABBREVIATION. Pure lookup, no query, no coverage risk: it works for every
// Bayer-designated star by construction, which is essentially every bright star — exactly the ones
// that read badly today. `style: 'symbol'` gives "α Scorpii" for display; 'word' gives
// "Alpha Scorpii", which is also what the search box will accept back.
export function expandDesignation(designation, { style = 'word' } = {}) {
  const p = splitDesignation(designation);
  if (!p) return null;
  const constellation = CONSTELLATION[p.constellation];
  const component = p.component ? ` ${p.component}` : '';
  if (p.flamsteed) return `${p.flamsteed} ${constellation}${component}`;
  const letter = GREEK[p.bayer][style === 'symbol' ? 1 : 0];
  // A superscript numbers one of a pair sharing a Bayer letter (bet01 Cyg is Albireo A). NO SPACE
  // before it in either style: "Omicron 2 Eridani" is not an identifier SIMBAD knows, "Omicron2
  // Eridani" is, and a name the app shows has to be one it can find again.
  const sup = p.superscript ? (style === 'symbol' ? superscriptDigits(p.superscript) : String(Number(p.superscript))) : '';
  return `${letter}${sup} ${constellation}${component}`;
}

const SUPERSCRIPT = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function superscriptDigits(digits) {
  return String(Number(digits)).split('').map((d) => SUPERSCRIPT[d] ?? d).join('');
}

// NORMALISE FOR THE QUERY. SIMBAD's TAP service rejects non-ASCII with an HTTP 400, so a Greek
// symbol must be turned back into a word before it goes near the service. This is the inverse of
// the display side and the reason the map has to be two-way: without it, prettifying the display
// actively CREATES a bug for anyone who copies the name the app just showed them.
const SYMBOL_TO_WORD = Object.fromEntries(Object.values(GREEK).map(([word, symbol]) => [symbol, word]));
const SUPERSCRIPT_TO_DIGIT = Object.fromEntries(Object.entries(SUPERSCRIPT).map(([d, s]) => [s, d]));

export function toAsciiQuery(query) {
  let out = String(query ?? '');
  for (const [symbol, word] of Object.entries(SYMBOL_TO_WORD)) out = out.split(symbol).join(word);
  for (const [symbol, digit] of Object.entries(SUPERSCRIPT_TO_DIGIT)) out = out.split(symbol).join(digit);
  // Final-sigma and the two lunate variants that turn up in pasted text.
  out = out.split('ς').join('Sigma').split('ϑ').join('Theta').split('ϕ').join('Phi');
  // Curly quotes and dashes, which a user pasting from a web page will bring with them.
  out = out.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[‐-―]/g, '-');
  // Anything still outside ASCII is stripped rather than sent: the service would only reject it.
  return out.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim();
}

// Whether the query had to be changed to be sendable — so the UI can SAY so rather than silently
// searching for something the user did not type.
export function needsAsciiRewrite(query) {
  const ascii = toAsciiQuery(query);
  return ascii !== String(query ?? '').trim() ? ascii : null;
}

// THE SAME TABLES, READ THE OTHER WAY: what a person typed -> the form the catalogue FILES it under.
//
// This is for the BROWSE path, not the resolve path, and the difference matters. SIMBAD's `=` on
// `ident.id` is not a literal comparison — it runs through their own identifier normaliser, which is
// why `Epsilon Eridani`, `epsilon eridani` and `alf Eri` all match — so an exact lookup needs no
// help. But `LIKE` IS literal, and the stored form is `* eps Eri`, so `LIKE 'Epsilon Erid%'` matches
// nothing at all. A prefix search therefore has to be given the catalogue's own spelling.
//
// "Epsilon" -> "eps"   "Epsilon Eridani" -> "eps Eri"   "alpha Cen" -> "alf Cen"   "Wolf" -> "Wolf"
const WORD_TO_GREEK = Object.fromEntries(Object.entries(GREEK).map(([abbr, [word]]) => [word.toLowerCase(), abbr]));

export function toCatalogueTerm(query) {
  const s = toAsciiQuery(query);
  if (!s) return '';
  const [head, ...tail] = s.split(/\s+/);
  const lower = head.toLowerCase();
  const abbr = WORD_TO_GREEK[lower] ?? (GREEK[lower] ? lower : null);
  // A FLAMSTEED NUMBER IS A DESIGNATION TOO. "61 Cygni" is as much a designation as "Alpha Scorpii",
  // and folding only the Greek half left it as "61 Cygni" against a stored "*  61 Cyg" — a prefix
  // search that could never match, so the most famous Flamsteed star in the sky found nothing.
  const isFlamsteed = /^\d+$/.test(head);
  if (!abbr && !isFlamsteed) return s; // a catalogue name like "Wolf" is already its own prefix
  const stem = abbr ?? head;
  const rest = tail.join(' ');
  if (!rest) return stem;
  const con = constellationAbbrev(rest);
  return con ? `${stem} ${con}` : `${stem} ${rest}`;
}

// "Eri" / "Eridani" / "Eridan" -> "Eri". Already an abbreviation, or a genitive reached by prefix so
// a half-typed constellation still lands.
function constellationAbbrev(text) {
  const lower = text.toLowerCase();
  return Object.keys(CONSTELLATION).find((k) => k.toLowerCase() === lower)
    ?? Object.entries(CONSTELLATION).find(([, genitive]) => genitive.toLowerCase().startsWith(lower))?.[0]
    ?? null;
}

// THE NAME A STARMAP SHOULD SHOW, in the order the value falls off:
//   1. A proper name where one exists          "alf Sco"  -> "Antares"
//   2. Otherwise the expanded designation      "eps Ind"  -> "Epsilon Indi"
//   3. Otherwise the identifier, tidied        "2MASS J09205549+4539058" unchanged
//
// Step 3 is the important one for honesty: a survey designation has no friendly name, and showing it
// as it is beats inventing. `style: 'symbol'` renders the Bayer letter as α rather than Alpha — and
// note that either way the result is something SIMBAD will accept back, because `toAsciiQuery`
// exists and the search box runs it.
export function displayStarName(mainId, { style = 'word' } = {}) {
  const stripped = stripCatalogueFurniture(mainId);
  const parts = splitDesignation(stripped);
  if (parts) {
    // A proper name is used ONLY where the catalogue has one for THIS exact object, component letter
    // and all. Sticking the letter onto the parent's name reads well and breaks the two-way property:
    // "Keid B" and "Achird B" are names SIMBAD does not know, so the app would be showing something
    // it could not then find — the very bug this file exists to avoid. `alf Cen A` keeps Rigil
    // Kentaurus because that IS its own entry; `omi02 Eri B` falls through to Omicron 2 Eridani B,
    // which resolves. Measured against the live service over a 25 ly census plus the bright anchors.
    return PROPER_NAMES[stripped] ?? expandDesignation(stripped, { style });
  }
  return PROPER_NAMES[stripped] ?? stripped;
}

// THE NAME OF THE SYSTEM, which is not the name of its primary star. A system is "Alpha Centauri";
// the star at its centre is Rigil Kentaurus, and the next one out is Toliman. Naming the system
// after the primary gives "Rigil Kentaurus" for the most familiar system in the sky, which is
// correct and useless — so the component letter comes off first and the bare designation is what
// gets expanded. Reads the way an atlas does: system Alpha Centauri, stars Rigil Kentaurus, Toliman
// and Proxima Centauri.
// The DESIGNATION to show beside a proper name, or null when the name already is the designation.
//
// A candidate list that offers "Ran" to someone who typed "Epsilon Eri" has answered a question they
// did not ask. Both together — "Ran (Epsilon Eridani)" — confirms they found the right star AND
// teaches them the name the app will use from then on.
export function designationFor(mainId) {
  const stripped = stripCatalogueFurniture(mainId);
  const expanded = expandDesignation(stripped);
  if (!expanded) return null;
  return expanded === displayStarName(mainId) ? null : expanded;
}

export function systemStarName(mainId, options) {
  const stripped = stripCatalogueFurniture(mainId);
  const parts = splitDesignation(stripped);
  if (!parts?.component) return displayStarName(mainId, options);
  return displayStarName(stripped.replace(/\s+[A-Za-z]{1,3}$/, ''), options);
}
