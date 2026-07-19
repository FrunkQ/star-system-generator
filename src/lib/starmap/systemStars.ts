// The visible stars of a system, for starmap glyphs (2D + 3D). A multi-star system returns MULTIPLE
// entries so it renders as multiple stars, not one — the source-of-truth fix for "binaries shown as
// single". Mirrors the logic in Starmap.svelte's getVisualNodes but returns just what a glyph needs.
import type { System, CelestialBody } from '$lib/types';
import { getPlanetColor } from '$lib/rendering/colors';

export interface VisualStar {
  id: string;
  name: string;
  color: string;
  bh?: 'quiescent' | 'active';  // a black hole — colour is #000000; the glyph renderer swaps in the BH / accretion-disc image
}

// A black hole reads black-on-black as a plain colour dot, so flag it for image rendering — and note
// whether it's FEEDING (accretion disc) or quiescent. Matches getBlackHoleType in Starmap.svelte
// (classes carry "star/BH" / "star/BH_active", sometimes bare).
function blackHoleState(b: CelestialBody): 'quiescent' | 'active' | undefined {
  const cs = b.classes ?? [];
  if (cs.some((c) => c === 'star/BH_active' || c === 'BH_active')) return 'active';
  if (cs.some((c) => c === 'star/BH' || c === 'BH')) return 'quiescent';
  return undefined;
}

export function systemVisualStars(system: System | null | undefined): VisualStar[] {
  if (!system?.nodes) return [];
  const stars = system.nodes.filter((n) => n.kind === 'body' && n.roleHint === 'star') as CelestialBody[];
  if (stars.length) {
    return stars
      .slice()
      .sort((a, b) => (b.massKg || 0) - (a.massKg || 0)) // primary first
      .map((s) => ({ id: s.id, name: s.name, color: getPlanetColor(s), bh: blackHoleState(s) }));
  }
  // No explicit stars (e.g. a rogue world / lone body): use the root body if there is one.
  const root = system.nodes.find((n) => n.parentId === null);
  if (root && root.kind === 'body') return [{ id: root.id, name: root.name, color: getPlanetColor(root as CelestialBody), bh: blackHoleState(root as CelestialBody) }];
  return [];
}

// Offsets (in glyph-radius units) for laying out 1..4+ stars around a system point — same arrangement
// the 2D editor map uses, shared so 2D and 3D read identically.
export function starClusterOffsets(n: number): { dx: number; dy: number }[] {
  if (n <= 1) return [{ dx: 0, dy: 0 }];
  if (n === 2) return [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
  if (n === 3) return [{ dx: 0, dy: -1.2 }, { dx: -1.2, dy: 1 }, { dx: 1.2, dy: 1 }];
  // 4+: diamond (first four); any extra stack on the centre.
  const base = [{ dx: 0, dy: -1.2 }, { dx: 0, dy: 1.2 }, { dx: -1.4, dy: 0 }, { dx: 1.4, dy: 0 }];
  const out = base.slice();
  for (let i = 4; i < n; i++) out.push({ dx: 0, dy: 0 });
  return out;
}
