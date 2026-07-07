// Liquid physics helper — the single place that answers "what phase is this substance at temp T?"
// and "which liquids are liquid here?". Water is NOT special: every solvent has its own melt/boil
// points and physical characteristics (colour, density, conductivity, bio-solvent quality). The
// fluid-layer model, the hydrosphere editor, apparent colour and the biosphere all read from here.
import type { LiquidDef, RulePack } from '$lib/types';
import { LIQUIDS } from '$lib/constants';

export type Phase = 'solid' | 'liquid' | 'gas';

export function allLiquids(pack?: RulePack | null): LiquidDef[] {
  return pack?.liquids && pack.liquids.length ? pack.liquids : LIQUIDS;
}

export function liquidDef(name: string | undefined, pack?: RulePack | null): LiquidDef | undefined {
  if (!name) return undefined;
  return allLiquids(pack).find((l) => l.name === name);
}

// Phase of a named substance at a temperature, from its melt/boil points.
export function phaseAt(name: string | undefined, tempK: number, pack?: RulePack | null): Phase {
  const def = liquidDef(name, pack);
  if (!def) return 'liquid';            // unknown → assume liquid (don't over-constrain)
  if (tempK < def.meltK) return 'solid';
  if (tempK > def.boilK) return 'gas';
  return 'liquid';
}

export function isLiquidAt(name: string | undefined, tempK: number, pack?: RulePack | null): boolean {
  return phaseAt(name, tempK, pack) === 'liquid';
}

// The liquids that are actually LIQUID at a given temperature — what the hydrosphere selector should
// offer. `bufferK` allows a small margin near a phase boundary (default 0 = strict).
export function liquidsLiquidAt(tempK: number, pack?: RulePack | null, bufferK = 0): LiquidDef[] {
  return allLiquids(pack).filter((l) => tempK >= l.meltK - bufferK && tempK <= l.boilK + bufferK);
}

// Suitability of a solvent for life (0..1): water is ideal; ammonia / hydrocarbons / water-ammonia
// are plausible alternatives; everything else cannot host life as we model it.
export function biosolventScore(name: string | undefined, pack?: RulePack | null): number {
  const q = liquidDef(name, pack)?.biosolvent;
  return q === 'ideal' ? 1 : q === 'alternative' ? 0.6 : 0;
}

// Presence-weighted coverage for the liquid-solvent habitability factor. A standing surface liquid is
// high-value the MOMENT it exists (extract, purify, irrigate, and a place for chemistry to run), so the
// amount matters far less than the presence — a 2% sea and a 70% ocean are both "this world has water".
// Presence alone is therefore worth most of the marks (the FLOOR), with the rest ramping in linearly up
// to full marks by ~FULL coverage. This replaces a hard step (any liquid → full marks) that made a 2%
// puddle score identical to an ocean world. Returns a 0..1 weight; multiply it into the solvent score.
export function solventCoverageWeight(coverage: number): number {
  const FLOOR = 0.6;   // presence alone = 60% of the solvent marks...
  const FULL = 0.18;   // ...rising to 100% by ~18% surface coverage
  const cov = Math.max(0, coverage || 0);
  return Math.max(FLOOR, Math.min(1, FLOOR + (1 - FLOOR) * (cov / FULL)));
}

// How a substance is distributed across a body's temperature RANGE (not just its mean). With the
// decomposed profile we know a volatile can be frozen at the poles, liquid in the temperate band,
// AND boiling off at the hotspots — all on the same world.
export interface PhaseSpread {
  atMean: Phase;
  freezes: boolean;         // some region is below the melt point → ice (caps / shell)
  liquidSomewhere: boolean; // the range overlaps [meltK, boilK] → standing liquid somewhere
  vaporizes: boolean;       // some region is above the boil point → vapour / clouds
}
export function phaseSpread(
  name: string | undefined, meanK: number, rangeMinK: number, rangeMaxK: number, pack?: RulePack | null
): PhaseSpread {
  const def = liquidDef(name, pack);
  if (!def) return { atMean: 'liquid', freezes: false, liquidSomewhere: true, vaporizes: false };
  const lo = Math.min(rangeMinK, meanK), hi = Math.max(rangeMaxK, meanK);
  return {
    atMean: phaseAt(name, meanK, pack),
    freezes: lo < def.meltK,
    liquidSomewhere: hi >= def.meltK && lo <= def.boilK,
    vaporizes: hi > def.boilK
  };
}

// Liquids that are LIQUID somewhere within a temperature range — what the selector should offer for
// a body whose surface spans [minK, maxK] (e.g. liquid at the equator even if the mean is below freezing).
export function liquidsLiquidInRange(minK: number, maxK: number, pack?: RulePack | null): LiquidDef[] {
  return allLiquids(pack).filter((l) => maxK >= l.meltK && minK <= l.boilK);
}
