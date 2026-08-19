// "1 square = 1 AU" — the grid's scale, said in words.
//
// A grid is only a measure if the reader is told what one cell is worth, and the system lattice's cell
// is a real distance (G10) that a GM can now pin. This is the sentence that closes that loop.
//
// PURE, and in map/ rather than inside the view, for the reason every string like this ends up here
// eventually: the 3D player view, the 2D view and the GM's own map all want the same sentence, and
// three copies of it would disagree about the hex the first time anyone touched one.


import { formatDistanceAu, ORBIT_KM_BELOW_AU, type MeasurementUnits } from '$lib/units';

/** Which shape the lattice is drawing. `null` = no lattice, so there is nothing to say. */
export type GridCellKind = 'square' | 'hex' | null;

// WHY THIS THRESHOLD AND NOT A NEW ONE. `units.ts` already answers "below what AU figure does a reader
// stop being able to picture the distance?" — and its comment records that 0.05 was NOT invented there
// either: `bodyFacts` and `ai/curate` had both landed on it independently, and the constant exists to
// promote that answer rather than add a fifth. A grid cell is the same question about the same reader,
// so it gets the same number. It also comfortably covers the 0.01 AU the owner asked about.
//
// The DIFFERENCE from `formatOrbitRadiusAu` is presentation, not judgement: that one REPLACES the AU
// figure with km, while the legend must keep it — the cell was chosen in AU, off a picker labelled in
// AU, so dropping the AU would leave a GM unable to connect the caption to the control they set.

/**
 * The legend for a cell of `au` astronomical units.
 *
 * A SQUARE's cell is its side, so "1 square = 1 AU" is unambiguous. A HEX's is NOT: `hexLattice` takes
 * `cell` as the corner-to-corner width (`size = cell / 2` is the circumradius), and a hex is only
 * `√3/2` of that across the flats — about 0.87. Traveller players habitually measure a hex across the
 * flats, so "1 hex = 1 AU" would be read as the wrong number by exactly the audience most likely to
 * pick hexes. Hence the qualifier: it is four words that stop the sentence being a lie.
 *
 * Returns null when there is nothing to caption, so a view can render it or not on one test.
 */
export function gridLegend(au: number | null, kind: GridCellKind, units: MeasurementUnits = 'metric'): string | null {
	if (kind === null || au === null || !Number.isFinite(au) || au <= 0) return null;
	const n = fmtAu(au);
	const head = kind === 'hex' ? `1 hex = ${n} AU corner to corner` : `1 square = ${n} AU`;
	// Below the threshold an AU figure stops meaning anything to a reader — "0.005 AU" is a number, not
	// a distance — so the km (or miles) goes in brackets ALONGSIDE it rather than instead of it.
	if (au >= ORBIT_KM_BELOW_AU) return head;
	return `${head} (${formatDistanceAu(au, units)})`;
}

/**
 * NOT `formatNice`. That formatter takes its precision from the DECADE, which is exactly right for the
 * 1/2/5 ladder it serves — 0.1, 0.2 and 0.5 all want one decimal — and wrong here, because it rounds
 * 0.25 to "0.3". The offered cells include a quarter AU precisely because a GM choosing by hand is not
 * bound to that ladder, so the legend cannot borrow a formatter that is.
 */
function fmtAu(au: number): string {
	if (au < 0.001) return au.toPrecision(2);
	return String(Math.round(au * 1000) / 1000);
}

/** Flat-to-flat width of a hex whose corner-to-corner width is `au` — the other number a GM may want. */
export function hexAcrossFlats(au: number): number {
	return (au * Math.sqrt(3)) / 2;
}
