// System / star / world naming. Three strategies the GM picks, leading with scientifically-plausible
// designations (the user can always rename afterwards for their story):
//   catalogue  → cold survey IDs (HD 184738, GJ 412, GD 3735)
//   scientific → Bayer-style Greek-letter + constellation (Epsilon Eridani, Alpha Bariai)
//   named      → evocative proper names (Vega, Hogan's Star)
// Planets are numbered by their host (HD 184738 A b) UNLESS habitable — a charted, social world earns
// a proper name on the scientific & named strategies (catalogue stays cold). See makeWorldName.
import { SeededRNG } from '../rng';

export type NamingStrategy = 'catalogue' | 'scientific' | 'named';

const CATALOGUES = ['HD', 'HIP', 'GJ', 'GD', 'HR', 'LHS', 'BD', 'TYC', 'Wolf', 'Ross', 'Gliese', 'TOI'];
const GREEK = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa',
  'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega'];
// Real constellation genitives + a few invented, for flavour.
const CONSTELLATIONS = ['Centauri', 'Eridani', 'Ceti', 'Cygni', 'Draconis', 'Orionis', 'Lyrae', 'Aquilae',
  'Pegasi', 'Tauri', 'Leonis', 'Hydrae', 'Ursae', 'Cassiopeiae', 'Andromedae', 'Persei', 'Aurigae', 'Bootis',
  'Corvi', 'Crucis', 'Carinae', 'Velorum', 'Phoenicis', 'Serpentis', 'Bariai', 'Tholani', 'Vesperae', 'Calanae'];
const STAR_NAMES = ['Vega', 'Altair', 'Rigel', 'Tarazed', 'Hadar', 'Mirach', 'Alkaid', 'Sabik', 'Izar', 'Saiph',
  'Maia', 'Elnath', 'Caph', 'Aludra', 'Wezen', 'Mirfak', 'Naos', 'Atria', 'Gacrux', 'Suhail'];
const SURNAMES = ['Hogan', 'Tycho', 'Bell', 'Vance', 'Sato', 'Okonkwo', 'Reyes', 'Larsson', 'Okoye', 'Mercer', 'Adekunle', 'Novak'];
const NAMED_SUFFIX = ["'s Star", "'s Beacon", "'s Hope", "'s Light", "'s Reach", "'s Lantern"];
// Evocative habitable-world names (charted & settled).
const WORLD_NAMES = ['Eden', 'Arcadia', 'Avalon', 'Elysium', 'Nyssa', 'Halcyon', 'Aurora', 'Haven', 'Concordia',
  'Verdance', 'Pellucid', 'Meridian', 'Solace', 'Lyria', 'Thalassa', 'Caelum', 'Cibola', 'Verdant', 'Tellus',
  'Promise', 'Sanctuary', 'Demeter', 'Ceres Nova', 'Greenfall', 'Mistral', 'Anchorage'];

const pick = <T>(rng: SeededRNG, arr: T[]): T => arr[Math.floor(rng.nextFloat() * arr.length)];

// The base system name (no "System" prefix) for the chosen strategy.
export function makeSystemName(strategy: NamingStrategy, rng: SeededRNG): string {
  if (strategy === 'catalogue') {
    const prefix = pick(rng, CATALOGUES);
    const big = ['HD', 'HIP', 'TYC', 'BD'].includes(prefix);
    return `${prefix} ${big ? 1000 + Math.floor(rng.nextFloat() * 998999) : 1 + Math.floor(rng.nextFloat() * 8999)}`;
  }
  if (strategy === 'scientific') return `${pick(rng, GREEK)} ${pick(rng, CONSTELLATIONS)}`;
  // named
  return rng.nextFloat() < 0.55 ? pick(rng, STAR_NAMES) : `${pick(rng, SURNAMES)}${pick(rng, NAMED_SUFFIX)}`;
}

// A proper name for a habitable world, avoiding repeats within a system.
export function makeWorldName(rng: SeededRNG, used: Set<string>): string {
  for (let i = 0; i < 40; i++) {
    const n = pick(rng, WORLD_NAMES);
    if (!used.has(n)) { used.add(n); return n; }
  }
  return pick(rng, WORLD_NAMES);
}

// Whether the strategy gives habitable worlds proper names (catalogue stays cold).
export const namesHabitableWorlds = (s: NamingStrategy) => s === 'scientific' || s === 'named';
