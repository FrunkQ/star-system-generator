// Real-sky import — star classification helpers shared by the build kit and
// the in-app importer. Spectral-type string → SSE star classes + type image.

export const STAR_IMAGE = {
  O: '/images/star_types/O.webp', B: '/images/star_types/B.webp', A: '/images/star_types/A.webp',
  F: '/images/star_types/F.webp', G: '/images/star_types/G.webp', K: '/images/star_types/K.ebp.webp',
  M: '/images/star_types/M.webp', L: '/images/star_types/L.png', T: '/images/star_types/T.png',
  Y: '/images/star_types/Y.jpg', WD: '/images/star_types/WD.webp'
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
export function starParamsFromType(type, statTemplates) {
  if (!statTemplates) return null;
  const { classes } = starClasses(type ?? '');
  const letter = (classes[0] ?? 'star/M').split('/')[1][0];
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
  const primary = primaryComponent(type);
  // A leading `d`/`sd` is SIMBAD's own shorthand for a dwarf (dM6 = Wolf 359) and is an explicit
  // class V. It is stripped here so the scan below anchors on the temperature letter.
  const body = primary.replace(/^(sd|d)(?=[OBAFGKMLTY])/, '');
  // Anchored after the letter and its subclass, never a bare /[IV]+/ search: a loose scan finds the
  // V in a peculiarity suffix and the I in anything at all. The subclass may itself be a RANGE, and
  // SIMBAD repeats the letter inside it — Betelgeuse is `M1-M2Ia-Iab`, which has a range in both
  // positions and is the string that breaks a naive pattern.
  const m = body.match(
    /^[OBAFGKMLTY]\s*\d*(?:\.\d+)?(?:\s*-\s*[OBAFGKMLTY]?\s*\d*(?:\.\d+)?)?\s*([IV]+[ab]{0,2}(?:\s*-\s*[IV]*[ab]{0,2})?)/
  );
  if (!m) return /^(sd|d)(?=[OBAFGKMLTY])/.test(primary) ? 'V' : undefined;
  // A range takes the FIRST, more luminous reading: `IV-V` -> `IV`, `Ia-Iab` -> `Ia`. A star bright
  // enough to have been catalogued with a range is more likely the brighter one.
  const token = m[1].replace(/\s+/g, '').split('-')[0];
  return LUMINOSITY_BAND[token];
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

export function starClasses(type) {
  const s = String(type ?? '');
  // The D-type test is case-SENSITIVE on the letter, and that is the whole point. `/^D/i` also
  // matched SIMBAD's LOWERCASE dwarf prefix, so `dM6` (Wolf 359), `dM4` (Ross 128) and `dM3`
  // (AD Leo) were all classified `star/WD` and imported as white dwarfs — 1.0 M(sun) and 24,000 K
  // for a 0.11 M(sun), 2,800 K red dwarf. Four stars in a 74-row Local Neighbourhood census.
  if (/white dwarf/i.test(s) || /^D/.test(s)) return { classes: ['star/WD'], image: STAR_IMAGE.WD };
  const m = s.replace(/^(sd|d)(?=[OBAFGKMLTY])/, '').match(/^([OBAFGKMLTY])/i);
  const letter = m ? m[1].toUpperCase() : 'M';
  const full = s.replace(/\s*\(.*\)$/, '');
  return { classes: [`star/${letter}`, ...(full && full !== letter ? [`star/${full}`] : [])], image: STAR_IMAGE[letter] };
}
