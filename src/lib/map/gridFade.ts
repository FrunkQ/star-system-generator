// THE GRID'S EDGE FADE, as ONE rule for every map that draws a grid.
//
// It existed twice with different constants — `starmap/starmapScene.ts` and `holo/scene.ts` — and the
// two disagreed badly enough to be a bug rather than a difference (C14): on the system map the dial
// DELETED the grid instead of fading it. Measured across a real system (rMax 30 AU, the shipped 0.65
// compression, the six `niceSeries` rings), the holo's window put the outer rings at alpha
// 0.07/0.20/0.33 with the rim at 0.07 by three-quarter dial, and at full dial four of six rings and
// the rim were EXACTLY ZERO. The starmap's window held the rim at 0.52 over the same range.
//
// The cause is not a typo, it is a window calibrated for the wrong extent: `compressRadius` maps the
// outermost body to EXACTLY `gridRadius`, so a system map's content fills the disc right out to the
// rim, and a fade that has finished at 0.7 R has finished inside the content. The starmap's numbers
// were already calibrated to start beyond the field, which is why the same dial reads as a fade
// there and as a delete here.
//
// So the starmap's shape wins on evidence and both callers bind THIS. G10's lesson about the 1/2/5
// ladder, applied to the other shared grid quantity: two vocabularies for one idea is how the next
// one drifts.

export interface GridFadeWindow {
	/** Radius at which the fade STARTS. Inside this, alpha is 1. */
	from: number;
	/** Radius at which the fade has reached zero. */
	to: number;
}

/** Below this the dial counts as OFF and the window is pushed past any content. */
export const GRID_FADE_OFF = 0.001;

/**
 * The fade window at a given dial strength, in the same units as `gridRadius`.
 *
 * At 0 the grid never fades (the window sits far past the field); at 1 it starts a quarter of the
 * way out. `to` trails `from` so the dissolve stays gradual rather than a hard ring.
 *
 * WHERE THE TUNABLE PART LIVES (G4 asks for constants in DATA): the DIAL is preset data
 * (`gridFalloff` / `starmapGridFalloff`) and that is what a GM changes. The four numbers here are
 * the SHAPE of the dial — the near radius shrinking with strength, the span tightening with it —
 * not tuning.
 */
export function gridFadeWindow(falloff: number, gridRadius: number): GridFadeWindow {
	const f = Math.max(0, Math.min(1, falloff));
	if (f <= GRID_FADE_OFF) return { from: gridRadius * 100, to: gridRadius * 200 }; // effectively none
	const from = gridRadius * (1.6 - 1.35 * f); // 1.6 R at the gentlest, 0.25 R at the hardest
	return { from, to: from + gridRadius * (1.5 - 0.85 * f) };
}

/** Per-vertex alpha for a point `d` from the grid's centre. 1 inside the window, 0 past it. */
export function gridFadeAlpha(d: number, w: GridFadeWindow): number {
	if (d <= w.from) return 1;
	return Math.max(0, 1 - (d - w.from) / Math.max(1e-6, w.to - w.from));
}
