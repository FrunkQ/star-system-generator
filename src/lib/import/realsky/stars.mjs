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
export function starParamsFromType(type, statTemplates) {
  if (!statTemplates) return null;
  const { classes } = starClasses(type ?? '');
  // Prefer the most specific band the pack defines, then the letter, then its default.
  const band = classes.map((c) => statTemplates[c]).find(Boolean)
    ?? statTemplates[`star/${(classes[0] ?? 'star/M').split('/')[1][0]}`]
    ?? statTemplates['star/default'];
  if (!band) return null;
  const mid = (b) => (Array.isArray(b) ? (b[0] + b[1]) / 2 : b);
  return {
    massMsun: mid(band.mass_solar),
    radiusRsun: mid(band.radius_solar),
    temperatureK: Math.round(mid(band.temp_k)),
    luminosity: band.radiation_output ? mid(band.radiation_output) : undefined,
    typicalForClass: true
  };
}

export function starClasses(type) {
  if (/white dwarf|^D/i.test(type)) return { classes: ['star/WD'], image: STAR_IMAGE.WD };
  const m = type.match(/^(sd)?([OBAFGKMLTY])/i);
  const letter = m ? m[2].toUpperCase() : 'M';
  const full = type.replace(/\s*\(.*\)$/, '');
  return { classes: [`star/${letter}`, ...(full && full !== letter ? [`star/${full}`] : [])], image: STAR_IMAGE[letter] };
}
