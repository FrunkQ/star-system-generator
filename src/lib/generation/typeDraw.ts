// Type-draw weighting — the rarity filter the GM's RARITY slider drives. Physics decides what's
// VIABLE at an orbit (viableTypesAt); this decides which of those plausible types actually gets drawn.
//
//   rarity 0  → only basic rock (airless terrestrial / barren / desert / ice)
//   rarity ↑  → standard habitable (ocean, earth-like), then uncommon (carbon, eyeball), then exotic
//
// The other knobs (metallicity / disk-mass / dynamical) keep shaping STANDARD worlds the old way — only
// the rarity dial reaches for the strange. Star TYPE adds an affinity bonus (eyeballs around M dwarfs).
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

// Loot-box-style rarity tiers — colour + label for the type picker, so the GM reads at a glance which
// worlds are mundane (common) vs eccentric (legendary). Tiers map the same rarity the draw uses.
export interface RarityTier { key: string; label: string; color: string; }
const RARITY_TIERS: { max: number; tier: RarityTier }[] = [
  { max: 0.2, tier: { key: 'common', label: 'Common', color: '#b8c0cc' } },      // white/grey
  { max: 0.4, tier: { key: 'uncommon', label: 'Uncommon', color: '#4caf50' } },  // green
  { max: 0.6, tier: { key: 'rare', label: 'Rare', color: '#3b82f6' } },          // blue
  { max: 0.8, tier: { key: 'epic', label: 'Epic', color: '#a855f7' } },          // purple
  { max: 1.01, tier: { key: 'legendary', label: 'Legendary', color: '#f5a623' } }, // orange/gold
];
export function rarityTier(rarity: number): RarityTier {
  return (RARITY_TIERS.find((t) => rarity < t.max) ?? RARITY_TIERS[RARITY_TIERS.length - 1]).tier;
}
// The rarity (0..1) of a class, table-or-fallback — exported so the picker can colour by tier.
export function rarityOf(cls: string, pack?: RulePack): number {
  return infoFor(cls, pack).rarity;
}

// Fallback rarity for any type not in the table (keeps the draw robust if the fingerprint set grows).
function infoFor(cls: string, pack?: RulePack): TypeDrawInfo {
  const override = (pack as any)?.type_draw?.[cls];
  if (override) return override;
  if (RARITY[cls]) return RARITY[cls];
  if (/barren|terrestrial|desert|ice|crater|dwarf|planetesimal|protoplanet/.test(cls)) return { rarity: 0.1 };
  if (/giant|neptune|jupiter/.test(cls)) return { rarity: 0.3 };
  return { rarity: 0.5 };
}

/**
 * THE RARITY WEIGHTING — a LADDER, not a gate.
 *
 * This used to be a step function: every type at or below the dial got weight 1, and anything above
 * it fell off a Gaussian cliff. So at the default dial of 0.5 an airless terrestrial (rarity 0.05),
 * a superhabitable (0.5) and an eyeball (0.45) were all EQUALLY likely, and a hot-eyeball at 0.6 —
 * only just over the line — still kept 46% weight. Measured at v2.1.763, that put `hot-eyeball` on
 * 31% of every planet generated around a Sun-like star and `helium` on 13%: one exotic class taking
 * a third of the population, because "allowed" and "likely" were the same thing.
 *
 * The replacement is the standard one-parameter family (exponential tempering, the Boltzmann
 * "temperature" trick), expressed so the pack number means something a person can read:
 *
 *     w(r) = ratio ^ r
 *
 * where `r` is the type's rarity 0..1 and `ratio` is simply HOW LIKELY THE RAREST TYPE IS COMPARED
 * WITH THE MOST COMMON ONE. ratio < 1 favours the mundane, ratio = 1 is a flat draw, ratio > 1
 * inverts it so the exotica lead. `ln(ratio)` moves linearly with the dial, which keeps each step of
 * the slider a constant multiplicative change rather than a lurch.
 *
 * NOTHING IS EVER EXCLUDED at any dial setting — a legendary world stays possible at rarity 0, just
 * very unlikely, which is the "possible, just unlikely" the band vocabulary asks for ([[G24]]).
 */
export interface RarityWeighting {
  /**
   * WHERE THE REALISTIC MIX SITS ON THE DIAL — and it is deliberately NOT the middle.
   * The useful travel is asymmetric: below the realistic point a system only gets duller, and few
   * GMs will ever go there, while everything interesting lies above it. Putting the default at 0.25
   * therefore buys three quarters of the slider for the fun and lets the realistic anchor be as
   * steep as reality actually is, instead of compromising it to keep headroom. It is also the
   * marker the banded slider ([[G24]]) needs: green sits here, amber and red above.
   */
  realistic_dial: number;
  /** Weight of the rarest type (r=1) against the most common (r=0), at dial 0 / realistic / 1. */
  exotic_ratio_at_min: number;
  exotic_ratio_at_realistic: number;
  exotic_ratio_at_max: number;
}
// Fallback only — the shipped pack carries these; a pack that declares none gets the same curve.
const DEFAULT_RARITY_WEIGHTING: RarityWeighting = {
  realistic_dial: 0.25,
  exotic_ratio_at_min: 0.0005, exotic_ratio_at_realistic: 0.02, exotic_ratio_at_max: 5,
};

export function rarityGate(typeRarity: number, dial: number, weighting?: RarityWeighting): number {
  const w = weighting ?? DEFAULT_RARITY_WEIGHTING;
  const d = Math.max(0, Math.min(1, dial));
  const anchor = Math.min(0.999, Math.max(0.001, w.realistic_dial ?? 0.25));
  // Interpolate in LOG space: the dial should feel the same at every point of its travel.
  const lnMin = Math.log(Math.max(1e-9, w.exotic_ratio_at_min));
  const lnMid = Math.log(Math.max(1e-9, w.exotic_ratio_at_realistic));
  const lnMax = Math.log(Math.max(1e-9, w.exotic_ratio_at_max));
  const lnRatio = d <= anchor
    ? lnMin + (lnMid - lnMin) * (d / anchor)
    : lnMid + (lnMax - lnMid) * ((d - anchor) / (1 - anchor));
  return Math.exp(lnRatio * Math.max(0, Math.min(1, typeRarity)));
}

/**
 * METALLICITY — how much rock and metal the disc had to build with, 0..1 on the dial.
 *
 * The physics this rests on, in the order it matters:
 *
 *   1. GIANT OCCURRENCE IS STRONGLY METALLICITY-DEPENDENT. Fischer & Valenti (2005): P(giant) rises
 *      roughly as 10^(2·[Fe/H]) — a star at three times solar metals is about ten times likelier to
 *      host a giant than one at solar. Core accretion has to build a solid core fast enough to grab
 *      gas before the disc dissipates, and a metal-poor disc starves it. So LOW metallicity means
 *      FEWER giants, not more: the gas is there in every disc; what is missing is the solid material
 *      to seed a core. A metal-poor system is small rocky worlds, few of them, and dull.
 *   2. THERE IS A FLOOR ON GIANTS EVEN SO. Gravitational instability — the disc collapsing directly,
 *      no core needed — is metallicity-blind, so even a metal-poor disc can throw a wide-orbit giant.
 *      That is the pack's `giant_floor`, and it is why the bottom of the dial is not "no giants ever".
 *   3. ROCK AND IRON WORLDS RIDE THE SAME CURVE UPWARD, more gently: more metals, denser and more
 *      iron-rich small worlds. Ice-dominated worlds move the other way, weakly — an ice world needs
 *      the disc's volatiles, which every disc has, and a metal-poor one has proportionally more.
 *   4. THE SUN IS SOMEWHAT METAL-RICH against the local median, which is why the wizard's default
 *      sits above the midpoint (`realistic_dial`, pack data) rather than on it.
 *
 * The factor is per CLASS SENSITIVITY declared in the pack (`type_metallicity_sensitivity`), applied
 * as w × f where f = floor + (1 − floor) × 10^(sensitivity × (dial − anchor) × decades). Sensitivity
 * +1 is a full giant-strength response, 0 is indifferent, negative favours the metal-poor end. It
 * multiplies into the same draw the rarity ladder feeds — position (the frost line) has already
 * decided WHERE a giant is viable; this decides how likely one is drawn there.
 *
 * These dials are meant as broad inputs a wider generator will one day set automatically (a cluster
 * shares its metallicity); set by hand here they give a system its flavour.
 */
export interface MetallicityWeighting {
  realistic_dial: number;                    // where solar-ish sits on the dial
  decades_across_dial: number;               // how many decades of [Fe/H] the full travel spans
  giant_floor: number;                       // the metallicity-blind (instability) share of giant weight
  sensitivity: Record<string, number>;       // regex-key → sensitivity; first match wins
}
const DEFAULT_METALLICITY_WEIGHTING: MetallicityWeighting = {
  realistic_dial: 0.65, decades_across_dial: 1.4, giant_floor: 0.12,
  sensitivity: {
    'giant|jupiter|neptune|puff|helium': 1.0,
    'iron|silicate|carbon|supermassive-terrestrial|mega-earth': 0.5,
    'super-earth|terrestrial|desert|barren|crater|lava|earth': 0.25,
    'ice|ocean|hycean|methane|ammonia|subsurface|cold': -0.35,
  },
};
export function metallicityFactor(cls: string, dial: number, weighting?: MetallicityWeighting): number {
  const w = weighting ?? DEFAULT_METALLICITY_WEIGHTING;
  const d = Math.max(0, Math.min(1, dial));
  let sens = 0;
  for (const [pattern, v] of Object.entries(w.sensitivity ?? {})) {
    if (new RegExp(pattern).test(cls)) { sens = v; break; }
  }
  if (sens === 0) return 1;
  // Decades of [Fe/H] away from the realistic point, signed; the response is 10^(sens × Δ).
  const delta = (d - (w.realistic_dial ?? 0.65)) * (w.decades_across_dial ?? 1.4);
  const response = Math.pow(10, sens * delta);
  // Giants keep a metallicity-blind floor (gravitational instability); everything else scales fully.
  const isGiant = /giant|jupiter|neptune|puff|helium/.test(cls);
  const floor = isGiant ? Math.max(0, Math.min(1, w.giant_floor ?? 0)) : 0;
  return floor + (1 - floor) * response;
}

// Pick one viable type, weighted by the rarity gate × star-class affinity. Null if nothing survives
// (caller falls back to the basic broad-type generator).
export function drawTypeForSlot(
  viable: Fingerprint[], dial: number, starClass: string, rng: SeededRNG, pack?: RulePack,
  metallicity?: number
): Fingerprint | null {
  const sp = (starClass || '').split('/')[1]?.[0] ?? '';
  const weighting = (pack as any)?.generation_parameters?.type_rarity_weighting as RarityWeighting | undefined;
  const metalW = (pack as any)?.generation_parameters?.type_metallicity_sensitivity as MetallicityWeighting | undefined;
  const weighted = viable
    .map((fp) => {
      const info = infoFor(fp.class, pack);
      // Three multiplicative terms, each a separate question. Rarity: how strange should this be.
      // Star affinity: a PHYSICAL bias (eyeballs really are commoner round M dwarfs). Metallicity:
      // did the disc have the material — giants and iron worlds need it, ice worlds do not.
      const w = rarityGate(info.rarity, dial, weighting)
        * (info.stars?.[sp] ?? 1)
        * (typeof metallicity === 'number' ? metallicityFactor(fp.class, metallicity, metalW) : 1);
      return { fp, w };
    })
    .filter((x) => x.w > 1e-4);
  if (!weighted.length) return null;
  let r = rng.nextFloat() * weighted.reduce((s, x) => s + x.w, 0);
  for (const x of weighted) { if (r < x.w) return x.fp; r -= x.w; }
  return weighted[weighted.length - 1].fp;
}
