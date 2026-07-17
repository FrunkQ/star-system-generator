// How SOLID a belt or ring is drawn — one definition, every renderer.
//
// massKg is the debris-density proxy; the fraction is a log scale over 1e-5..1 Earth masses (mirrors
// getBeltDensityDescription). This rule was copy-pasted into the 2D orrery, the catalogue browser and
// the procedural planet disc, and the holo was about to gain a fourth — so a belt could read "dense"
// in one view and "sparse" in another. Import it instead.
import { EARTH_MASS_KG } from '$lib/constants';

/**
 * Debris density as 0..1 from the body's massKg. Legacy data carrying no mass reads as the median —
 * visible, and the same everywhere (the three old copies each invented their own default: 0.3/0.5/0.35).
 */
export const DEBRIS_DENSITY_FALLBACK = 0.35;

export function debrisDensityFrac(massKg: number | undefined): number {
  if (!massKg || massKg <= 0) return DEBRIS_DENSITY_FALLBACK;
  const me = massKg / EARTH_MASS_KG;
  return Math.max(0, Math.min(1, (Math.log(me) - Math.log(1e-5)) / (Math.log(1) - Math.log(1e-5))));
}

/**
 * The GM orrery's band opacity for a belt/ring of this density — shared so the player views' "grey
 * bands" read exactly like the GM's map. Rings are tighter and denser-looking than scattered belts:
 * Saturn's read solid while a thin belt is barely a smudge.
 */
export function debrisBandAlpha(roleHint: string | undefined, density: number): number {
  return roleHint === 'ring' ? 0.05 + density * 0.5 : 0.02 + density * 0.18;
}

/** The orrery's band colours: grey for a ring, white-ish for a scattered belt. */
export const DEBRIS_RING_COLOR = 0xc8c8c8; // rgb(200,200,200)
export const DEBRIS_BELT_COLOR = 0xffffff;
