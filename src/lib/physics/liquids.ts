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
