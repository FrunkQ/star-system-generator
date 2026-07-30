// Interstellar distance units, for INPUT and DISPLAY only.
//
// A campaign stores every distance in its own unit (`Starmap.scale.unit`), and that does not change: this
// module exists so a GM can TYPE a distance in whichever of light years or parsecs they think in, and read
// it back the same way, while the map underneath keeps storing exactly what it always stored.
//
// Campaigns may also use an abstract, made-up unit — a diagrammatic map's "jumps" or "sectors" — which
// cannot be converted to anything. `unitKind` returns null for those, and callers must then offer no unit
// choice at all rather than pretending a made-up unit is light years.

export type LinearUnit = 'ly' | 'pc';

/** IAU: 1 parsec = 3.26156378... light years. */
export const LY_PER_PC = 3.2615637769;

export const UNIT_LABELS: Record<LinearUnit, string> = { ly: 'Light years', pc: 'Parsecs' };
export const UNIT_SHORT: Record<LinearUnit, string> = { ly: 'ly', pc: 'pc' };

/**
 * Which real unit a campaign's unit string means, or null when it is the campaign's own invention.
 * Matching is deliberately generous about spelling and case — GMs type "LY", "Light Years", "parsec".
 */
export function unitKind(unit: string | null | undefined): LinearUnit | null {
  const u = String(unit ?? '').trim().toLowerCase();
  if (!u) return null;
  if (u === 'ly' || u === 'l.y.' || u.startsWith('light')) return 'ly';
  if (u === 'pc' || u.startsWith('parsec')) return 'pc';
  return null;
}

/** Convert between light years and parsecs. Same unit in and out is exact, not a round trip through a float. */
export function convertDistance(value: number, from: LinearUnit, to: LinearUnit): number {
  if (!Number.isFinite(value) || from === to) return value;
  return from === 'pc' ? value * LY_PER_PC : value / LY_PER_PC;
}

/**
 * The unit choices to offer for a campaign — both real units when its own unit is one of them, and NOTHING
 * when it is abstract. An empty list is the signal to hide the picker entirely.
 */
export function unitOptionsFor(campaignUnit: string | null | undefined): LinearUnit[] {
  return unitKind(campaignUnit) ? (['ly', 'pc'] as LinearUnit[]) : [];
}

/**
 * The `pixelsPerUnit` a map needs after its distance UNIT changes, so that nothing on it moves and every
 * distance converts properly.
 *
 * Changing the unit is a change of ruler, not of layout. Positions are stored in map units, and a distance
 * is `mapUnits / pixelsPerUnit` — so leaving `pixelsPerUnit` alone when the unit changes keeps every NUMBER
 * the same and simply relabels it, which is how "Alpha Centauri, 3.8 ly away" silently became "3.8 pc".
 * Scaling the ruler instead means the map is untouched and 3.8 ly correctly reads 1.2 pc.
 *
 * Returns the value unchanged when either side is an abstract unit: an invented unit has no defined size,
 * so there is no honest conversion factor and inventing one would corrupt the map's scale.
 */
export function rescaleForUnitChange(
  pixelsPerUnit: number,
  fromUnit: string | null | undefined,
  toUnit: string | null | undefined
): number {
  const from = unitKind(fromUnit);
  const to = unitKind(toUnit);
  if (!from || !to || from === to || !(pixelsPerUnit > 0)) return pixelsPerUnit;
  // One OLD unit is this many NEW units; the ruler scales by its reciprocal.
  return pixelsPerUnit / convertDistance(1, from, to);
}
