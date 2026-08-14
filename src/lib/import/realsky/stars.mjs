// Real-sky import — star classification helpers shared by the build kit and
// the in-app importer. Spectral-type string → SSE star classes + type image.

// The class for a star the catalogue gives no usable spectral type for. Mirrors `planet/unknown`
// (system/typeRanges.ts) — a real class that says "not known", rather than a plausible guess.
export const UNKNOWN_STAR_CLASS = 'star/unknown';

export const STAR_IMAGE = {
  O: '/images/star_types/O.webp', B: '/images/star_types/B.webp', A: '/images/star_types/A.webp',
  F: '/images/star_types/F.webp', G: '/images/star_types/G.webp', K: '/images/star_types/K.ebp.webp',
  M: '/images/star_types/M.webp', L: '/images/star_types/L.png', T: '/images/star_types/T.png',
  Y: '/images/star_types/Y.jpg', WD: '/images/star_types/WD.webp',
  // Reachable from a catalogue row for the first time (B44): a pulsar or a black hole used to be
  // classified `star/M` and handed the red-dwarf picture with everything else.
  NS: '/images/star_types/NS.webp', BH: '/images/star_types/BH.webp',
  magnetar: '/images/star_types/magnetar.jpg',
  // Keyed by the FULL band key, not a letter, so the lookup below can try the specific class first.
  // Antares and Betelgeuse classified as `star/M-I` from v2.1.585 and still drew the red-dwarf
  // picture, because a destination that exists is not a destination anything reaches (DATA-R12) —
  // here the class was specific and the image lookup was not. Art: the red supergiant WOH G64,
  // ESO / L. Calcada, credited in AboutModal.
  'M-I': '/images/star_types/M-I.jpg'
};

// "G2V" → { classes: ['star/G', 'star/G2V'], image }. White dwarfs (any D
// type, or an explicit "(white dwarf)" suffix) collapse to star/WD; subdwarf
// prefixes (sdM1) classify by their temperature letter.
// A star's MASS, RADIUS and TEMPERATURE when the catalogue does not carry them.
//
// The Exoplanet Archive gives all three for a planet host. A general star catalogue does not:
// SIMBAD gives a spectral TYPE and astrometry, and nothing else this engine needs — so without a
// per-class table, `starNodeFromRow` skips every planetless star for want of a mass, and D18's whole
// point (every star in the region arrives) cannot be delivered.
//
// NOTHING IS INVENTED HERE. The bands are `statTemplates` from the RULE PACK — the same data the
// generator draws its own stars from (`generation/star.ts`), so an imported M dwarf and a generated
// one come from one table, which a GM can retune per starmap. The midpoint of the band is taken
// rather than a random draw: this is "typical for its class", a statement about the class, and a
// die-roll would imply a measurement that was never made.
//
// HONESTY, per DATA-R4 ("the importer never invents and never overwrites"): the return carries
// `typicalForClass: true`, and the caller must both keep any real catalogue value in preference and
// say in the body's description that the figures are typical rather than measured. A value that
// arrives from the archive always wins.
//
// THE LUMINOSITY CLASS IS PART OF "ITS CLASS" (inbox D19). It used to be dropped, and the letter
// alone was treated as the class — so Antares (M1.5Iab, a red SUPERGIANT) resolved to `star/M`, the
// red-DWARF band, and imported at 0.265 M(sun) against a real ~12-15. An M dwarf and an M supergiant
// share a temperature and share nothing else, so the band key names both axes: `star/M-I`.
export function starParamsFromType(type, statTemplates, { otype } = {}) {
  if (!statTemplates) return null;
  const { classes } = starClasses(type ?? '', { otype });
  const letter = (classes[0] ?? 'star/M').split('/')[1][0];
  // `star/unknown` has no letter band to fall back to, so it lands on the pack's `star/default` —
  // which is what the pack itself calls "a star we know nothing else about".
  const lum = luminosityClassOf(type ?? '');
  // ORDER MATTERS AND IT IS NOT THE ORDER THE COMMENT USED TO CLAIM. `starClasses` returns the
  // LETTER first, so the old `classes.map(...).find(Boolean)` always matched `star/M` and never
  // reached the full MK string behind it (which could not match anything anyway — the pack has no
  // full-MK-string keys). A luminosity lookup inserted after that find would therefore never fire.
  // It goes FIRST. `V` and "no class parsed" both fall through to the letter, which is the
  // main-sequence band and the right guess for a star picked at random: the galaxy is mostly dwarfs.
  const band = (lum && lum !== 'V' ? statTemplates[`star/${letter}-${lum}`] : null)
    ?? classes.map((c) => statTemplates[c]).find(Boolean)
    ?? statTemplates[`star/${letter}`]
    ?? statTemplates['star/default'];
  if (!band) return null;
  const mid = (b) => (Array.isArray(b) ? (b[0] + b[1]) / 2 : b);
  return {
    massMsun: mid(band.mass_solar),
    radiusRsun: mid(band.radius_solar),
    temperatureK: Math.round(mid(band.temp_k)),
    luminosity: band.radiation_output ? mid(band.radiation_output) : undefined,
    ...(lum ? { luminosityClass: lum } : {}),
    typicalForClass: true
  };
}

// The MK luminosity class, normalised to the three bands the pack carries: 'I' (supergiant),
// 'III' (giant), 'V' (main sequence). Returns undefined when the string does not state one — the
// common case, and the caller must then keep today's main-sequence behaviour exactly.
//
// TWO CLASSES ARE FOLDED, and both are approximations rather than truths:
//   II  (bright giant) -> I. Bright giants sit between III and Ib and are much nearer Ib. Canopus
//       (F0II, 8 M(sun), 71 R(sun)) is comfortably inside an F supergiant band and nowhere near an
//       F dwarf, so folding UP is the smaller error.
//   IV  (subgiant) -> V. A subgiant is ~2x the radius of its dwarf and within ~30% on mass —
//       Procyon A (F5IV-V) is 1.5 M(sun) / 2.05 R(sun) against an F dwarf band of 1.04-1.4 /
//       1.15-1.4. Wrong, but by a factor, not by orders of magnitude.
//   VI/VII (subdwarf, and the old name for a white dwarf) -> V. The pack has no subdwarf band and
//       inventing one is out of scope; a real white dwarf is caught by the D-type test below.
// Giving II and IV their own bands later is a clean incremental change.
const LUMINOSITY_BAND = {
  I: 'I', Ia: 'I', Iab: 'I', Ib: 'I', II: 'I',
  III: 'III',
  IV: 'V', V: 'V', VI: 'V', VII: 'V'
};

export function luminosityClassOf(type) {
  return parseStellarType(type)?.band;
}

// THE FORWARD MAP: a catalogue designation -> the three facts it states.
//
// `M1.5Iab+B2Vn` -> { spectral: 'M', subclass: 1.5, luminosity: 'Iab', band: 'I', companion: 'B2Vn' }
//
// This is the ONLY place an MK string is read. Everything downstream takes the structured form, so
// no second site learns to parse these badly — which is the whole reason the classification is
// carried natively rather than re-derived (owner, 2026-08-14).
//
// Returns undefined only for a string that states no spectral letter at all. A remnant (`DA2.9`,
// `star/NS`) is a classification too and comes back with `spectral` set and no luminosity class,
// because a white dwarf's MK class VII is vestigial and nothing here needs it.
export function parseStellarType(type) {
  const raw = String(type ?? '').trim();
  if (!raw) return undefined;
  if (/white dwarf/i.test(raw) || /^D/.test(raw)) {
    // The letters after the D (DA, DZ, DQZ) name which absorption lines dominate — a real fact, and
    // kept so the designation can be rebuilt. It is NOT a luminosity class: a white dwarf's MK
    // class VII is vestigial and nothing here needs it.
    const m = /^D([A-Z]*)\s*(\d+(?:\.\d+)?)?/.exec(raw);
    return {
      spectral: 'WD',
      ...(m?.[1] ? { variant: m[1] } : {}),
      ...(m?.[2] != null ? { subclass: Number(m[2]) } : {})
    };
  }
  const [primary, ...rest] = String(raw).replace(/\s*\(.*\)$/, '').split('+');
  const companion = rest.join('+').trim();
  // A leading `d`/`sd` is SIMBAD's own shorthand for a dwarf (dM6 = Wolf 359, dM4 = Ross 128) and is
  // an explicit class V. Case-sensitive: an uppercase D is a white dwarf and was caught above.
  const dwarfPrefix = /^(sd|d)(?=[OBAFGKMLTY])/.exec(primary.trim());
  const body = dwarfPrefix ? primary.trim().slice(dwarfPrefix[0].length) : primary.trim();

  // Anchored on the letter, never a bare /[IV]+/ search: a loose scan finds the V in a peculiarity
  // suffix and the I in anything at all. The subclass may itself be a RANGE and SIMBAD repeats the
  // letter inside it — Betelgeuse is `M1-M2Ia-Iab`, a range in BOTH positions, which is the string
  // that breaks a naive pattern.
  const m = body.match(
    /^([OBAFGKMLTY])\s*(\d+(?:\.\d+)?)?(?:\s*-\s*[OBAFGKMLTY]?\s*\d+(?:\.\d+)?)?\s*([IV]+[ab]{0,2}(?:\s*-\s*[IV]*[ab]{0,2})?)?/
  );
  if (!m || !m[1]) return undefined;
  // A range takes the FIRST, more luminous reading: `IV-V` -> `IV`, `Ia-Iab` -> `Ia`. A star bright
  // enough to have been catalogued with a range is more likely the brighter one.
  const written = m[3] ? m[3].replace(/\s+/g, '').split('-')[0] : (dwarfPrefix ? 'V' : undefined);
  return {
    spectral: m[1].toUpperCase(),
    ...(m[2] != null ? { subclass: Number(m[2]) } : {}),
    ...(written && LUMINOSITY_BAND[written] ? { luminosity: written, band: LUMINOSITY_BAND[written] } : {}),
    ...(companion ? { companion } : {})
  };
}

// THE INVERSE MAP: the three facts -> the designation that states them.
//
// `{ spectral: 'M', subclass: 1.5, luminosity: 'Iab' }` -> `M1.5Iab`.
//
// This is the direction `docs/dev/type-vocabulary-prev4.md` exists to protect. Without it there is
// no way to ask "does this body still classify as what it was created as", and D19 is exactly what
// happens when nobody can ask: Antares went in as a supergiant and came back a dwarf, with no test
// in a position to notice.
//
// WHAT IT DOES AND DOES NOT CLAIM, because the difference matters and an overclaim here would be
// the same kind of fault this work is fixing:
//   - EXACT for every type in the vocabulary: `parseStellarType(formatStellarType(T))` deep-equals T.
//   - IDEMPOTENT for a catalogue string: `parse(format(parse(s)))` deep-equals `parse(s)`.
//   - NOT byte-identical to an arbitrary catalogue string, and it should not be. Peculiarity
//     suffixes (`e` emission, `n` broad lines, `p` peculiar, `:` uncertain, `Fe-1`) and range
//     notation (`M1-M2`) are ASTRONOMERS' annotations, not classification: `M5.5Ve` formats back as
//     `M5.5V`, which states the same type. Reproducing the annotation would mean storing the string,
//     which is precisely what carrying the classification natively exists to stop.
export function formatStellarType(t) {
  if (!t?.spectral) return '';
  const companion = t.companion ? `+${t.companion}` : '';
  if (t.spectral === 'WD') return `D${t.variant ?? ''}${t.subclass ?? ''}${companion}`;
  return `${t.spectral}${t.subclass ?? ''}${t.luminosity ?? ''}${companion}`;
}

// The first component of a spectral type, with any trailing parenthetical removed.
//
// `M1.5Iab+B2Vn` -> `M1.5Iab`. THIS DISCARDS THE COMPANION AND MUST HAPPEN BEFORE THE CLASS SCAN,
// or B2Vn's `V` wins and turns a supergiant back into a dwarf — the exact bug, re-introduced.
// Caution seen in the real data: `+` is not always a companion. SIMBAD returns `M2+V` for
// Lalande 21185, meaning "M2 or later, V". Taking the first component gives `M2`, no class, main
// sequence — the correct outcome anyway. Do not try to be cleverer than this.
function primaryComponent(type) {
  return String(type ?? '').replace(/\s*\(.*\)$/, '').split('+')[0].trim();
}

// A COMPACT OBJECT HAS NO SPECTRAL TYPE, AND THE CATALOGUE SAYS SO IN A FIELD WE ALREADY FETCH.
//
// SIMBAD's `otype` was being used only as a FILTER (census.mjs drops planets with it, clusterGate
// trips on containers) and never reached the classifier, which derives everything from `sp_type`.
// A pulsar's `sp_type` is EMPTY, and an empty string does not fall to `star/default` — it falls to
// `star/M`, because the letter regex fails and the letter defaults to M. So every neutron star,
// pulsar and black hole in range imported as a 0.265 M(sun), 750 L(sun) RED DWARF.
//
// Confirmed reachable rather than theoretical: PSR B1929+10 sits at 152 ly with an empty spectral
// type, RX J1856.6-3754 at 400 ly, and six compact objects lie within ~326 ly.
//
// The codes are SIMBAD's own, read from its `otypedef` table rather than guessed. CANDIDATES map
// too: "candidate black hole" is not a certain black hole, but it is enormously closer to `star/BH`
// than to `star/M`, and the alternative is to state something far more wrong.
//
// NOTE `star/magnetar` STAYS UNREACHABLE FROM A CATALOGUE STRING, and that is not an oversight:
// SIMBAD has no magnetar object type — magnetars are filed as `Psr` — so nothing here can honestly
// route to it. It remains reachable from the editor and the generator.
const OTYPE_CLASS = {
  'Psr': 'star/NS',   // a pulsar IS a neutron star, seen beaming
  'N*': 'star/NS',
  'N*?': 'star/NS',
  'BH': 'star/BH',
  'BH?': 'star/BH',
  'WD*': 'star/WD',
  'WD?': 'star/WD'
};

// An X-ray binary's `sp_type` describes the DONOR star, not the compact object — `* gam Cas` is
// `B0.5IVpe` and `RX J2130.6+4710` is `DA+M3.5/4Ve`. Classifying those by spectral type is right:
// the visible star is what the type describes. So XB*/LXB/HXB are deliberately absent above.

export function starClasses(type, { otype } = {}) {
  const s = String(type ?? '');
  // The catalogue's own statement about WHAT THE OBJECT IS beats anything inferred from a spectral
  // string — but only when there is no spectral type to read, so an X-ray binary or a pulsar with a
  // measured companion still classifies by the star we can actually see.
  const byType = OTYPE_CLASS[String(otype ?? '').trim()];
  if (byType && (!s.trim() || byType === 'star/WD')) {
    return { classes: [byType], image: STAR_IMAGE[byType.split('/')[1]] ?? STAR_IMAGE.WD };
  }
  // The D-type test is case-SENSITIVE on the letter, and that is the whole point. `/^D/i` also
  // matched SIMBAD's LOWERCASE dwarf prefix, so `dM6` (Wolf 359), `dM4` (Ross 128) and `dM3`
  // (AD Leo) were all classified `star/WD` and imported as white dwarfs — 1.0 M(sun) and 24,000 K
  // for a 0.11 M(sun), 2,800 K red dwarf. Four stars in a 74-row Local Neighbourhood census.
  if (/white dwarf/i.test(s) || /^D/.test(s)) return { classes: ['star/WD'], image: STAR_IMAGE.WD };
  const m = s.replace(/^(sd|d)(?=[OBAFGKMLTY])/, '').match(/^([OBAFGKMLTY])/i);
  // AN UNKNOWN TYPE IS NOT AN M DWARF. The letter used to DEFAULT to 'M' when the regex failed, so a
  // star the catalogue gives no type for — 54 of 851 rows in a 41 ly census, 6% — arrived as a
  // 0.265 Msun red dwarf, with red-dwarf art, red-dwarf luminosity and red-dwarf flare rates. That
  // is DATA-R4 broken quietly: the importer never invents, and a confident wrong answer is the worst
  // kind of invention because nothing downstream can tell it from a measurement.
  //
  // `star/unknown` takes the pack's own `star/default` band (see starParamsFromType) and NO IMAGE,
  // because a wrong picture is a claim too. The caller says in the description that the type is
  // unknown rather than typical-for-class.
  if (!m) return { classes: [UNKNOWN_STAR_CLASS], image: undefined };
  const letter = m[1].toUpperCase();
  const full = s.replace(/\s*\(.*\)$/, '');
  // THE LUMINOSITY CLASS BECOMES A CLASS, not just a field (inbox B44). Until it did, the classes
  // read `star/M` and `star/M1.5Iab+B2Vn` — the letter and the raw string, with nothing between —
  // so every consumer keyed on classes saw "an M star" and Antares was described as a red dwarf
  // while its own numbers said supergiant.
  //
  // MOST SPECIFIC FIRST, so `classes[0]` is the real answer, with the LETTER still in the array for
  // anything that only cares about colour. That ordering is the shape `starParamsFromType` already
  // proved, reused rather than reinvented.
  //
  // THE KEY IS THE PACK'S BAND KEY, EXACTLY — `star/M-I`, not `star/M-supergiant`. One spelling for
  // one thing: the same string is the pack's stat template, the editor's picker entry, the
  // description key and now the class. A second spelling would be the duplication this whole line of
  // work has been removing.
  const band = luminosityClassOf(s);
  const specific = band && band !== 'V' ? [`star/${letter}-${band}`] : [];
  const classes = [...specific, `star/${letter}`, ...(full && full !== letter ? [`star/${full}`] : [])];
  return {
    classes,
    // MOST SPECIFIC IMAGE FIRST, THEN THE LETTER — the same fallback chain the classes and the pack
    // bands already use. Without this the class was specific and the picture was not, so a supergiant
    // drew the red-dwarf art (DATA-R12 again). Only bands with art of their own need an entry; every
    // other class falls through to its letter exactly as before, so nothing else moves.
    image: classes.map((c) => STAR_IMAGE[c.slice(5)]).find(Boolean) ?? STAR_IMAGE[letter]
  };
}
