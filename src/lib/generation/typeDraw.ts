// Type-draw weighting — the "rarity filter" the GM's WEIRDNESS slider drives. Physics decides what's
// VIABLE at an orbit (viableTypesAt); this decides which of those plausible types actually gets drawn.
//
//   weirdness 0  → only basic rock (airless terrestrial / barren / desert / ice)
//   weirdness ↑  → standard habitable (ocean, earth-like), then uncommon (carbon, eyeball), then exotic
//
// The other knobs (metallicity / disk-mass / dynamical) keep shaping STANDARD worlds the old way — only
// weirdness reaches for the strange. Star TYPE adds an affinity bonus (eyeballs around M dwarfs, etc.).
import type { Fingerprint, RulePack } from '$lib/types';
import { SeededRNG } from '../rng';

export interface TypeDrawInfo { rarity: number; stars?: Record<string, number>; }

// rarity 0 = mundane, 1 = exotic. stars = per-spectral-class weight multipliers.
const RARITY: Record<string, TypeDrawInfo> = {
  // --- basic rock (weirdness ~0) ---
  'planet/barren': { rarity: 0.05 }, 'planet/terrestrial': { rarity: 0.05 }, 'planet/planetesimal': { rarity: 0.05 },
  'planet/dwarf-planet': { rarity: 0.08 }, 'planet/protoplanet': { rarity: 0.1 }, 'planet/sub-earth': { rarity: 0.1 },
  'planet/desert': { rarity: 0.1 }, 'planet/ice': { rarity: 0.1 }, 'planet/crater': { rarity: 0.1 }, 'planet/mesoplanet': { rarity: 0.15 },
  // --- common giants & bigger rock ---
  'planet/gas-giant': { rarity: 0.15 }, 'planet/ice-giant': { rarity: 0.15 }, 'planet/super-earth': { rarity: 0.2 },
  'planet/mini-neptune': { rarity: 0.25 }, 'planet/sub-neptune': { rarity: 0.25 }, 'planet/mega-earth': { rarity: 0.3 },
  // --- standard habitable (low-moderate: appear by mid-slider, not max weirdness) ---
  'planet/ocean': { rarity: 0.3, stars: { G: 1.4, K: 1.3, F: 1.1 } },
  'planet/earth-analogue': { rarity: 0.3, stars: { G: 1.5, K: 1.3 } },
  'planet/earth-like': { rarity: 0.3, stars: { G: 1.4, K: 1.3, F: 1.1 } },
  'planet/forest': { rarity: 0.4, stars: { G: 1.4, K: 1.3 } }, 'planet/jungle': { rarity: 0.4, stars: { G: 1.3, K: 1.2 } },
  'planet/swamp': { rarity: 0.4, stars: { G: 1.3, K: 1.2 } }, 'planet/superhabitable': { rarity: 0.5, stars: { K: 1.6, G: 1.2 } },
  // --- uncommon ---
  'planet/iron': { rarity: 0.45 }, 'planet/silicate': { rarity: 0.45 }, 'planet/carbon': { rarity: 0.55 },
  'planet/coreless': { rarity: 0.6 }, 'planet/supermassive-terrestrial': { rarity: 0.6 },
  'planet/eyeball': { rarity: 0.45, stars: { M: 3, K: 2 } }, 'planet/cold-eyeball': { rarity: 0.5, stars: { M: 3, K: 2 } },
  'planet/hot-eyeball': { rarity: 0.6, stars: { M: 2.5, K: 1.5 } },
  'planet/methane': { rarity: 0.5 }, 'planet/ammonia-planet': { rarity: 0.55 }, 'planet/subsurface-ocean': { rarity: 0.5 },
  'planet/mini-jupiter': { rarity: 0.4 }, 'planet/super-jupiter': { rarity: 0.45 }, 'planet/super-neptune': { rarity: 0.4 },
  'planet/water-clouds-gas-giant': { rarity: 0.45 }, 'planet/ammonia-clouds-gas-giant': { rarity: 0.5 },
  // --- rare / exotic ---
  'planet/hycean': { rarity: 0.7, stars: { M: 2, K: 1.5 } }, 'planet/lava': { rarity: 0.6 }, 'planet/chthonian': { rarity: 0.75 },
  'planet/hot-neptune': { rarity: 0.6 }, 'planet/hot-jupiter': { rarity: 0.6 }, 'planet/cloudless-gas-giant': { rarity: 0.55 },
  'planet/helium': { rarity: 0.8 }, 'planet/puffy': { rarity: 0.7 }, 'planet/super-puff': { rarity: 0.9 },
  'planet/rogue': { rarity: 0.6 }, 'planet/ultra-cool-dwarf': { rarity: 0.7 }, 'planet/brown-dwarf': { rarity: 0.6 }, 'planet/sub-brown-dwarf': { rarity: 0.65 },
  // --- very exotic (top of the slider) ---
  'planet/sulfur': { rarity: 0.85 }, 'planet/chlorine': { rarity: 0.9 }, 'planet/fluorine': { rarity: 0.95 }, 'planet/phosphorus': { rarity: 0.9 },
  'planet/alkali-metal-clouds-gas-giant': { rarity: 0.85 }, 'planet/silicate-clouds-gas-giant': { rarity: 0.9 },
  'planet/ultra-hot-neptune': { rarity: 0.85 }, 'planet/ultra-hot-jupiter': { rarity: 0.85 },
};

// Fallback rarity for any type not in the table (keeps the draw robust if the fingerprint set grows).
function infoFor(cls: string, pack?: RulePack): TypeDrawInfo {
  const override = (pack as any)?.type_draw?.[cls];
  if (override) return override;
  if (RARITY[cls]) return RARITY[cls];
  if (/barren|terrestrial|desert|ice|crater|dwarf|planetesimal|protoplanet/.test(cls)) return { rarity: 0.1 };
  if (/giant|neptune|jupiter/.test(cls)) return { rarity: 0.3 };
  return { rarity: 0.5 };
}

// The weirdness gate: full weight (with a mild exotic BOOST at high weirdness) when a type's rarity is
// at/below the slider; a steep Gaussian falloff for types rarer than the current setting.
export function weirdnessGate(rarity: number, weirdness: number): number {
  if (rarity <= weirdness) return 1 + 0.6 * weirdness * rarity;
  const over = rarity - weirdness;
  return Math.exp(-(over * over) / (2 * 0.08 * 0.08)); // ~0 by +0.2 over the slider
}

// Pick one viable type, weighted by weirdness (rarity gate) × star-class affinity. Null if nothing
// survives (caller falls back to the basic broad-type generator).
export function drawTypeForSlot(
  viable: Fingerprint[], weirdness: number, starClass: string, rng: SeededRNG, pack?: RulePack
): Fingerprint | null {
  const sp = (starClass || '').split('/')[1]?.[0] ?? '';
  const weighted = viable
    .map((fp) => {
      const info = infoFor(fp.class, pack);
      const w = weirdnessGate(info.rarity, weirdness) * (info.stars?.[sp] ?? 1);
      return { fp, w };
    })
    .filter((x) => x.w > 1e-4);
  if (!weighted.length) return null;
  let r = rng.nextFloat() * weighted.reduce((s, x) => s + x.w, 0);
  for (const x of weighted) { if (r < x.w) return x.fp; r -= x.w; }
  return weighted[weighted.length - 1].fp;
}
