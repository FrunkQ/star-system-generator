// System / star / world naming. Three strategies the GM picks, leading with scientifically-plausible
// designations (rename anything afterwards):
//   catalogue  → cold survey IDs (HD 184738, GJ 412, GD 3735)
//   scientific → Bayer-style Greek-letter + constellation (Epsilon Eridani, Tau Vethrae)
//   named      → evocative proper names (Vega, Kaelith, Hogan's Star)
//
// Names are mostly COINED procedurally (see coinName) rather than drawn from a fixed list, so you don't
// see the same handful over and over. The recipe is phonotactic — assemble pronounceable syllables from
// onset (consonant/cluster) + vowel + an optional coda (ending consonant), 2–3 per name, capitalise.
// That's a near-infinite, pronounceable namespace; a few real-world anchors are sprinkled in for taste.
//
// Bodies are still DESIGNATED even when named: stars take the system name + A/B/C, planets are numbered
// b/c/d by their host. A planet earns a PROPER name by chance scaled to its rarity (legendary worlds
// almost always, common ones rarely) — and a habitable world almost always (it'd be charted & settled).
import { SeededRNG } from '../rng';

export type NamingStrategy = 'catalogue' | 'scientific' | 'named';

const pick = <T>(rng: SeededRNG, arr: T[]): T => arr[Math.floor(rng.nextFloat() * arr.length)];

// --- Phonotactic coining ---------------------------------------------------------------------------
const ONSETS = ['b', 'br', 'c', 'ch', 'd', 'dr', 'f', 'fr', 'g', 'gr', 'h', 'j', 'k', 'kr', 'l', 'm',
  'n', 'p', 'pr', 'r', 's', 'sh', 'sk', 'sl', 'st', 't', 'th', 'tr', 'v', 'vr', 'x', 'z', 'ph', 'kal', 'vor', 'zen', 'thal'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'ae', 'ai', 'ea', 'io', 'ou', 'y', 'ya', 'eo', 'ei'];
const CODAS = ['', '', 'n', 'r', 's', 'l', 'x', 'th', 'rn', 'll', 'sh', 'nd', 'rk', 'st', 'm', 'k', 'z', 'ph'];

function syllable(rng: SeededRNG, withCoda: boolean): string {
  return pick(rng, ONSETS) + pick(rng, VOWELS) + (withCoda ? pick(rng, CODAS) : '');
}
// A coined, pronounceable proper name (2–3 syllables, coda only on the last).
export function coinName(rng: SeededRNG, minSyl = 2, maxSyl = 3): string {
  const n = minSyl + Math.floor(rng.nextFloat() * (maxSyl - minSyl + 1));
  let s = '';
  for (let i = 0; i < n; i++) s += syllable(rng, i === n - 1);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// --- Anchors (sprinkled in among the coined names) -------------------------------------------------
const CATALOGUES = ['HD', 'HIP', 'GJ', 'GD', 'HR', 'LHS', 'BD', 'TYC', 'Wolf', 'Ross', 'Gliese', 'TOI', 'Kepler', '2MASS'];
const GREEK = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa',
  'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega'];
const REAL_CONSTELLATIONS = ['Centauri', 'Eridani', 'Ceti', 'Cygni', 'Draconis', 'Orionis', 'Lyrae', 'Aquilae',
  'Pegasi', 'Tauri', 'Leonis', 'Hydrae', 'Ursae', 'Cassiopeiae', 'Persei', 'Aurigae', 'Bootis', 'Carinae'];
const GEN_SUFFIX = ['ae', 'is', 'i', 'ii', 'ara', 'eus', 'onis', 'aris', 'orum'];   // Latin-genitive flavour
const REAL_STAR_NAMES = ['Vega', 'Altair', 'Rigel', 'Tarazed', 'Mirach', 'Izar', 'Maia', 'Naos', 'Atria', 'Suhail'];
const NAMED_SUFFIX = ["'s Star", "'s Beacon", "'s Hope", "'s Light", "'s Reach", "'s Lantern", "'s Rest"];
const REAL_WORLD_NAMES = ['Eden', 'Arcadia', 'Avalon', 'Elysium', 'Halcyon', 'Aurora', 'Haven', 'Thalassa', 'Verdant', 'Sanctuary'];

// A coined Latin-genitive "constellation" (Tau Vethrae) — mixed with a few real ones.
const coinConstellation = (rng: SeededRNG) =>
  rng.nextFloat() < 0.45 ? pick(rng, REAL_CONSTELLATIONS) : coinName(rng, 2, 3) + pick(rng, GEN_SUFFIX);

// The base system name (no "System" prefix) for the chosen strategy.
export function makeSystemName(strategy: NamingStrategy, rng: SeededRNG): string {
  if (strategy === 'catalogue') {
    const prefix = pick(rng, CATALOGUES);
    const big = ['HD', 'HIP', 'TYC', 'BD', 'Kepler'].includes(prefix);
    return `${prefix} ${big ? 1000 + Math.floor(rng.nextFloat() * 998999) : 1 + Math.floor(rng.nextFloat() * 8999)}`;
  }
  if (strategy === 'scientific') return `${pick(rng, GREEK)} ${coinConstellation(rng)}`;
  // named — mostly coined, some real anchors, some possessive "<coined>'s Star"
  const r = rng.nextFloat();
  if (r < 0.45) return coinName(rng, 2, 3);
  if (r < 0.7) return pick(rng, REAL_STAR_NAMES);
  return `${coinName(rng, 2, 2)}${pick(rng, NAMED_SUFFIX)}`;
}

// A proper name for a world (mostly coined, some curated), unique within a system.
export function makeWorldName(rng: SeededRNG, used: Set<string>): string {
  for (let i = 0; i < 40; i++) {
    const n = rng.nextFloat() < 0.65 ? coinName(rng, 2, 3) : pick(rng, REAL_WORLD_NAMES);
    if (!used.has(n)) { used.add(n); return n; }
  }
  return coinName(rng, 2, 3);
}

// Whether the strategy gives worlds proper names at all (catalogue stays cold).
export const namesWorlds = (s: NamingStrategy) => s === 'scientific' || s === 'named';

// Chance a planet earns a proper name, scaled to its rarity tier — rarer worlds are far likelier to be
// notable enough to name; a habitable world almost always is (charted & settled). Keyed by tier name.
const TIER_NAME_CHANCE: Record<string, number> = { common: 0.04, uncommon: 0.12, rare: 0.3, epic: 0.62, legendary: 0.92 };
export function planetNameChance(tierKey: string, habitable: boolean): number {
  const base = TIER_NAME_CHANCE[tierKey] ?? 0.1;
  return habitable ? Math.max(base, 0.85) : base;
}
