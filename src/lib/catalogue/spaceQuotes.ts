// Hold-screen interstitial data: space quotes + a curated backdrop image pool.
// The quotes live in static/space-quotes.txt (editable without a rebuild) as numbered lines of
//   N. "quote text" — Attribution
// under [SECTION] headers; we parse every quoted line and ignore the rest. Fetched once, cached.

export interface SpaceQuote { text: string; by: string }

let cache: SpaceQuote[] | null = null;

export async function loadSpaceQuotes(): Promise<SpaceQuote[]> {
  if (cache) return cache;
  try {
    const res = await fetch('/space-quotes.txt');
    if (!res.ok) return (cache = []);
    const raw = await res.text();
    const out: SpaceQuote[] = [];
    // Straight or curly quotes; em-dash / hyphen attribution separator; trailing spaces tolerated.
    const re = /^\s*\d+\.\s*[“"](.+?)[”"]\s*[—–-]\s*(.+?)\s*$/;
    for (const line of raw.split(/\r?\n/)) {
      const m = re.exec(line);
      if (m) out.push({ text: m[1], by: m[2] });
    }
    return (cache = out);
  } catch {
    return (cache = []);
  }
}

export function pickQuote(quotes: SpaceQuote[]): SpaceQuote | null {
  if (!quotes.length) return null;
  return quotes[Math.floor(Math.random() * quotes.length)];
}

// Curated full-frame backdrops (the most photogenic of the stock planet/star art).
export const INTERSTITIAL_IMAGES: string[] = [
  '/images/planet_types/web20earth-like20planet.jpg',
  '/images/planet_types/web20gas20giant.jpg',
  '/images/planet_types/web20ammonia20clouds20gas20giant.jpg',
  '/images/planet_types/web20eyeball20planet.jpg',
  '/images/planet_types/web20desert20planet.jpg',
  '/images/planet_types/web20forest20planet.jpg',
  '/images/planet_types/web20crater20planet.jpg',
  '/images/planet_types/web20brown20dwarf.jpg',
  '/images/planet_types/web20carbon20planet.jpg',
  '/images/star_types/G.webp',
  '/images/star_types/M.webp',
  '/images/star_types/O.webp',
  '/images/star_types/WD.webp',
  '/images/star_types/BH_accretion_disk.png'
];

export function pickImage(): string {
  return INTERSTITIAL_IMAGES[Math.floor(Math.random() * INTERSTITIAL_IMAGES.length)];
}
