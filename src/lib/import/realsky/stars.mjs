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
export function starClasses(type) {
  if (/white dwarf|^D/i.test(type)) return { classes: ['star/WD'], image: STAR_IMAGE.WD };
  const m = type.match(/^(sd)?([OBAFGKMLTY])/i);
  const letter = m ? m[2].toUpperCase() : 'M';
  const full = type.replace(/\s*\(.*\)$/, '');
  return { classes: [`star/${letter}`, ...(full && full !== letter ? [`star/${full}`] : [])], image: STAR_IMAGE[letter] };
}
