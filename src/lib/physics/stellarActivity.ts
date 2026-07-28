// Stellar magnetic ACTIVITY — the one judgement behind everything a star's surface shows.
// (physics→tags→visuals: docs/dev/architecture-physics-tags-visuals.md.)
//
// A star's spots, its bright faculae and its flares all come from the same thing: magnetic field
// tangled by rotation. Young, fast-spinning and low-mass stars are covered in spots and flare
// constantly; an old sun-like star shows a handful of small ones. The processor derives
// `flareActivity` from spectral class and age; this buckets it, publishes it as a tag, and gives
// the renderers ONE place to ask "how active is this star" so the 2D disc and the 3D globe can
// never disagree about it.
import type { CelestialBody, Tag } from '$lib/types';

export const STELLAR_ACTIVITY_TAG = 'stellar/activity';
export const ACTIVITY_BUCKETS = ['quiet', 'moderate', 'active', 'flare-star'] as const;
export type ActivityBucket = (typeof ACTIVITY_BUCKETS)[number];

export function stellarActivityBucket(flareActivity: number | undefined): ActivityBucket {
	const a = flareActivity ?? 0;
	if (a >= 0.55) return 'flare-star';
	if (a >= 0.25) return 'active';
	if (a >= 0.08) return 'moderate';
	return 'quiet';
}

/**
 * The renderers' view: a 0..1 strength per bucket. NOT the raw flareActivity — the buckets are the
 * published decision, and the mapping deliberately gives even a QUIET star a visible surface. The
 * Sun's flareActivity is 0.05, which as a raw multiplier produced three specks nobody could see; a
 * quiet star should still read as a textured sphere with a few real spot groups on it.
 */
export function activityStrength(tags: Tag[] | undefined): number {
	const t = (tags ?? []).find((x) => x.key === STELLAR_ACTIVITY_TAG);
	switch (t?.value as ActivityBucket | undefined) {
		case 'flare-star': return 1;
		case 'active': return 0.7;
		case 'moderate': return 0.42;
		case 'quiet': return 0.22;
		default: return 0.22;   // untagged (hand-made body, old save) — draw a quiet star, not a blank one
	}
}

/** Convenience for callers holding a body rather than its tags. */
export function bodyActivityStrength(body: CelestialBody | null | undefined): number {
	return activityStrength(body?.tags);
}

/** Does this star flare visibly? Drives the timed limb flares in 3D. */
export function flaresVisibly(tags: Tag[] | undefined): boolean {
	return activityStrength(tags) >= 0.65;
}
