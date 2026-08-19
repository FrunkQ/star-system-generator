// The visible stars of a system, for starmap glyphs (2D + 3D). A multi-star system returns MULTIPLE
// entries so it renders as multiple stars, not one — the source-of-truth fix for "binaries shown as
// single". Returns just what a glyph needs — and since G26 that includes everything a glyph DRAWS:
// the size band, and the tag-read decorations (activity/flares, jets, shedding). Both renderers read
// these fields and nothing else, which is how the 2D and 3D maps cannot disagree about a star.
import type { System, CelestialBody } from '$lib/types';
import { getPlanetColor } from '$lib/rendering/colors';
import { activityStrength, flaresVisibly } from '$lib/physics/stellarActivity';
import { jetStrength, sheddingStrength } from '$lib/physics/stellarOutflows';
import { sizeBandOf, type SizeBand } from './starGlyphLaw';

// The cluster layout moved to the glyph law (G26/C17) — re-exported so nothing that imported it here
// has to move.
export { starClusterOffsets } from './starGlyphLaw';

export interface VisualStar {
  id: string;
  name: string;
  color: string;
  bh?: 'quiescent' | 'active';  // a black hole — colour is #000000; the glyph renderer draws the schematic instead
  edd?: number;                 // accretion level (Eddington fraction) — sizes a feeding hole's disc blaze
  /** Size band from the luminosity class (B60) — the GM scaler spreads these. */
  band: SizeBand;
  /** Magnetic activity 0..1 from `stellar/activity` — corona size and the flare timer. */
  activity: number;
  /** Timed limb flares, from the same tag (active / flare-star). */
  flares: boolean;
  /** `stellar/jets`: 0 none, 1 moderate, 2 strong. */
  jets: 0 | 1 | 2;
  /** `stellar/shedding`: 0 none, 1 wind, 2 shell. */
  shedding: 0 | 1 | 2;
}

// A black hole reads black-on-black as a plain colour dot, so flag it for glyph rendering — and note
// whether it's FEEDING (accretion disc) or quiescent. Classes carry "star/BH" / "star/BH_active",
// sometimes bare. The ONE copy — the GM map used to hold its own `getBlackHoleType`.
export function blackHoleState(b: CelestialBody): 'quiescent' | 'active' | undefined {
  const cs = b.classes ?? [];
  if (cs.some((c) => c === 'star/BH_active' || c === 'BH_active')) return 'active';
  if (cs.some((c) => c === 'star/BH' || c === 'BH')) return 'quiescent';
  return undefined;
}

/** One star's glyph record from its node. */
export function visualStarOf(s: CelestialBody): VisualStar {
  return {
    id: s.id, name: s.name, color: getPlanetColor(s), bh: blackHoleState(s), edd: (s as any).accretionEddington,
    band: sizeBandOf(s),
    activity: activityStrength(s.tags),
    flares: flaresVisibly(s.tags),
    jets: jetStrength(s.tags),
    shedding: sheddingStrength(s.tags)
  };
}

export function systemVisualStars(system: System | null | undefined): VisualStar[] {
  if (!system?.nodes) return [];
  const stars = system.nodes.filter((n) => n.kind === 'body' && n.roleHint === 'star') as CelestialBody[];
  if (stars.length) {
    return stars
      .slice()
      .sort((a, b) => (b.massKg || 0) - (a.massKg || 0)) // primary first
      .map(visualStarOf);
  }
  // No explicit stars (e.g. a rogue world / lone body): use the root body if there is one.
  const root = system.nodes.find((n) => n.parentId === null);
  if (root && root.kind === 'body') return [visualStarOf(root as CelestialBody)];
  return [];
}
