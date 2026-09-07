// The visible stars of a system, for starmap glyphs (2D + 3D). A multi-star system returns MULTIPLE
// entries so it renders as multiple stars, not one — the source-of-truth fix for "binaries shown as
// single". Returns just what a glyph needs — and since G26 that includes everything a glyph DRAWS:
// the size band, and the tag-read decorations (activity/flares, jets, shedding). Both renderers read
// these fields and nothing else, which is how the 2D and 3D maps cannot disagree about a star.
import type { System, CelestialBody, Barycenter, Starmap } from '$lib/types';
import { getPlanetColor } from '$lib/rendering/colors';
import { activityStrength, flaresVisibly } from '$lib/physics/stellarActivity';
import { jetStrength, sheddingStrength } from '$lib/physics/stellarOutflows';
import { sizeBandOf, spectralLetterOfBody, floorGlyphGain, type SizeBand } from './starGlyphLaw';
import { observedStarOf, type ObservedStarReading } from '$lib/physics/observedStar';
import { scaleHexLinear } from '$lib/physics/spectrum';

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
  /** Spectral letter (O..M) when the designation states one — the dwarf band's tilt at the scaler. */
  letter?: string;
  /** Magnetic activity 0..1 from `stellar/activity` — corona size and the flare timer. */
  activity: number;
  /** Timed limb flares, from the same tag (active / flare-star). */
  flares: boolean;
  /** `stellar/jets`: 0 none, 1 moderate, 2 strong. */
  jets: 0 | 1 | 2;
  /** `stellar/shedding`: 0 none, 1 wind, 2 shell. */
  shedding: 0 | 1 | 2;
  /**
   * G54: WHAT THE STAR WOULD LOOK LIKE WITH A CLEAR LINE OF SIGHT. `color` above is what an
   * observer actually MEASURES — the same colour when nothing is in the way, and dimmed (or, behind
   * dust, reddened) when something is. Both are published rather than one, because "both sides of
   * the story" is the whole feature and a surface that had to re-derive either would be the leak.
   */
  intrinsicColor: string;
  /** The three measurements, present ONLY when something intervenes. Absent = an ordinary star. */
  observed?: ObservedStarReading;
  /**
   * G54: THE SHARE OF THE STAR'S LIGHT SOMETHING IS TAKING, 0..1, from where this map is looking.
   * The renderers draw the occlusion RING from this and nothing else — its gaps are the light still
   * getting out — exactly as they draw the jet and the shed shell from one number each. 0 = clear.
   */
  occluded: number;
}

/**
 * WHERE THE MAP IS BEING LOOKED AT FROM, as a unit bearing from `systemId` to the map's grid centre.
 *
 * The starmap carries true 3D positions and `gridCenterId` is the one place it already records "the
 * star everything is measured from", so it is the honest viewpoint rather than a new setting nobody
 * would find. Returns undefined with no centre chosen, or for the centre system itself — and the
 * reading then falls back to the isotropic answer and says which bands it could not test
 * (design §2b: "fall back to the isotropic answer and say so").
 */
export function starmapViewBearing(
  starmap: Pick<Starmap, 'systems' | 'gridCenterId'> | null | undefined,
  systemId: string
): [number, number, number] | undefined {
  const centreId = starmap?.gridCenterId;
  if (!centreId || centreId === systemId) return undefined;
  const from = starmap?.systems?.find((s) => s.id === systemId)?.position;
  const to = starmap?.systems?.find((s) => s.id === centreId)?.position;
  if (!from || !to) return undefined;
  const v: [number, number, number] = [to.x - from.x, to.y - from.y, (to.z ?? 0) - (from.z ?? 0)];
  return Math.hypot(v[0], v[1], v[2]) > 0 ? v : undefined;
}

/** What a caller may tell the glyph law about who is looking. */
export interface VisualStarOptions {
  /** The bearing from this system to the observer — see `starmapViewBearing`. */
  viewDir?: readonly [number, number, number];
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

/**
 * One star's glyph record from its node.
 *
 * `allNodes` is its system's, and it is what lets the observed half exist: a megastructure between
 * this star and the reader is a fact about the SYSTEM, not about the star's own record. Omit it and
 * the star reads intrinsically, which is exactly right for a caller that has no system in hand.
 *
 * THE COLOUR SHIFT IS APPLIED, NOT RECOMPUTED. `getPlanetColor` stays the one authority on what
 * colour a star is; the map SCALES that answer by what the light lost. A second spectral
 * colour derivation would disagree with the orrery, the summary cards and the info panel the moment
 * either moved — and it would move every star on the map the day this shipped.
 */
export function visualStarOf(
  s: CelestialBody,
  allNodes: (CelestialBody | Barycenter)[] = [],
  opts: VisualStarOptions = {}
): VisualStar {
  const intrinsicColor = getPlanetColor(s);
  const observed = allNodes.length ? observedStarOf(s, allNodes, opts).reading : undefined;
  // Absent rather than a clear reading on every ordinary star: `observed` present MEANS something is
  // in the way, so a surface can test it without knowing the thresholds.
  const seen = observed && observed.anomalous ? observed : undefined;
  // THE FLOOR IS THE MAP'S, NOT THE PHYSICS'. `observedStarHex` is handed a gain lifted just enough
  // that a completely enclosed star still shows an ember of its own colour: at transmission 0 the
  // honest hex is #000000, and a black mark on a black map is not a dim star, it is an absence — the
  // owner reported exactly that, and read it as a black hole. The true figure is untouched
  // everywhere it is a FIGURE: the reading below, the `stellar/dimmed` tag, the star panel.
  return {
    id: s.id, name: s.name,
    color: observed ? scaleHexLinear(intrinsicColor, floorGlyphGain(observed.colourGain)) : intrinsicColor,
    intrinsicColor,
    observed: seen,
    occluded: observed ? Math.min(1, Math.max(0, 1 - observed.transmission)) : 0,
    bh: blackHoleState(s), edd: (s as any).accretionEddington,
    band: sizeBandOf(s),
    letter: spectralLetterOfBody(s),
    activity: activityStrength(s.tags),
    flares: flaresVisibly(s.tags),
    jets: jetStrength(s.tags),
    shedding: sheddingStrength(s.tags)
  };
}

export function systemVisualStars(
  system: System | null | undefined,
  opts: VisualStarOptions = {}
): VisualStar[] {
  if (!system?.nodes) return [];
  const all = system.nodes as (CelestialBody | Barycenter)[];
  const stars = system.nodes.filter((n) => n.kind === 'body' && n.roleHint === 'star') as CelestialBody[];
  if (stars.length) {
    return stars
      .slice()
      .sort((a, b) => (b.massKg || 0) - (a.massKg || 0)) // primary first
      .map((s) => visualStarOf(s, all, opts));
  }
  // No explicit stars (e.g. a rogue world / lone body): use the root body if there is one.
  const root = system.nodes.find((n) => n.parentId === null);
  if (root && root.kind === 'body') return [visualStarOf(root as CelestialBody, all, opts)];
  return [];
}
