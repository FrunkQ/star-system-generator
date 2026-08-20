// WHEN THE BODY GRAPHIC SITS BESIDE THE FACTS RATHER THAN ABOVE THEM.
//
// One rule, in one place, because three callers build this document (the player document view, the
// GM's DocPanel and the catalogue's own page) and a threshold spelled out at each of them is three
// thresholds that drift — the same fault C14 recorded for the grid fade and M4 for the overlay sets.
//
// WIDTH ALONE IS THE WRONG TEST, and it is the interesting part of this file. A phone held sideways
// is WIDE — an iPhone 14 Pro Max in landscape is 932 CSS px, wider than plenty of desktop windows —
// and it is emphatically not a page that wants a picture in a side column, because what it has none
// of is HEIGHT. Ask for both and a landscape phone falls out on the second test, which is exactly
// where the owner put it: "on phones and horizontal views have them on top of one another".
//
// So: enough width to carry two columns without either becoming a gutter, AND enough height that a
// column is a column rather than one line of facts beside a picture.

/** Column width below which two columns leaves neither with usable measure. */
export const DOC_TWO_COL_MIN_W = 640;
/** Viewport height below which a side-by-side split has nothing to fill the second column with. */
export const DOC_TWO_COL_MIN_H = 520;

/**
 * Does this page get the body graphic beside the facts?
 *
 * `width` is the DOCUMENT COLUMN's width, not the window's — a document in a narrow aside inside a
 * wide window is a narrow document, and it is the measure available to the text that decides whether
 * splitting it helps. `height` is the surface's, since it is the vertical room that is in question.
 */
export function docSideBySide(width: number, height: number): boolean {
	if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
	return width >= DOC_TWO_COL_MIN_W && height >= DOC_TWO_COL_MIN_H;
}

/**
 * The picture's share of the width when it does sit beside the facts.
 *
 * Narrower than the photo sliver's 0.34: a globe is roughly square, so a third of a wide page makes a
 * picture taller than the facts beside it and the page reads as an illustration with a caption. The
 * facts are the subject here; the picture accompanies them.
 */
export function docGraphicStripFrac(width: number): number {
	if (!(width > 0)) return 0.3;
	// Wider pages give the picture proportionally less: past a point a bigger globe adds nothing and
	// the measure it costs the facts is real.
	return width >= 1100 ? 0.26 : 0.3;
}
