// Interstellar distance units.
//
// A campaign stores every distance in its own unit (`Starmap.scale.unit`). This module exists so a GM can
// TYPE a distance in whichever of light years or parsecs they think in, and read it back the same way,
// while the map underneath keeps storing exactly what it always stored.
//
// IT IS ALSO THE ONE PLACE THAT CHANGES A CAMPAIGN'S UNIT (A43). The header used to say the stored unit
// never changes; that was never true of the running app, and the gap between the claim and the code is
// what the fault grew in. TWO code paths changed it, with OPPOSITE conventions and neither asking:
// Settings CONVERTED (rescaled the ruler) while the Traveller hex grid STAMPED (relabelled, then took its
// ruler from hex geometry). Relabel-then-convert is a factor of 3.26 — Alpha Centauri reading 14.33 ly
// against a true 4.37. Both operations are legitimate and the app cannot guess which is meant, so the
// choice belongs to the GM and the ARITHMETIC belongs here. See `applyUnitChange`.
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

/**
 * THE ONE FIELD THAT ANSWERS "what unit is this campaign in".
 *
 * `Starmap.distanceUnit` and `Starmap.scale.unit` are two fields holding one concept, and they CAN
 * disagree on a save written before `normaliseCampaignUnit` existed. Everything that needs the answer
 * calls this rather than restating the precedence — which was written out by hand in at least three
 * places, each free to drift (A43). `scale.unit` wins because it sits beside the `pixelsPerUnit` it must
 * change with; a unit apart from its ruler is how this fault happens in the first place.
 */
export function campaignUnit(starmap: { distanceUnit?: string | null; scale?: { unit?: string | null } | null } | null | undefined): string {
  return starmap?.scale?.unit || starmap?.distanceUnit || 'LY';
}

/**
 * Fold a loaded campaign's two unit fields into agreement, so nothing downstream has to care which one
 * it read. Load-time only, and it changes NO geometry: it copies the winning label onto the loser.
 *
 * Returns the same object when they already agree, so it is safe to call on every load and costs nothing.
 */
export function normaliseCampaignUnit<T extends { distanceUnit?: string; scale?: { unit?: string } | null }>(starmap: T): T {
  const unit = campaignUnit(starmap);
  if (starmap.distanceUnit === unit && (!starmap.scale || starmap.scale.unit === unit)) return starmap;
  return {
    ...starmap,
    distanceUnit: unit,
    ...(starmap.scale ? { scale: { ...starmap.scale, unit } } : {})
  };
}

/**
 * The two things a GM can mean by "change the unit", named. THE APP MUST NOT GUESS — see the header.
 *
 * `relabel` — the numbers were right and the unit was wrong. Alpha Centauri goes on reading 4.37; the
 *   suffix changes. This is the case a mis-stamped import produces, and until A43 it was UNREACHABLE:
 *   every unit change converted.
 * `convert` — the map was right and the GM wants it expressed the other way. Alpha Centauri's 4.37 pc
 *   becomes 14.25 ly. Nothing on the map moves; only the ruler changes.
 */
export type UnitChangeMode = 'relabel' | 'convert';

/**
 * Apply a unit change to a campaign's scale. **The only supported way to change a stored unit.**
 *
 * Geometry is never touched by either mode — positions stay in map units and a distance is
 * `mapUnits / pixelsPerUnit`, so converting the whole map is a change of RULER, not a rewrite of every
 * coordinate. That is why this is cheap enough to offer as a choice, and it applies to the z/depth
 * annotation for free rather than needing its own pass.
 */
export function applyUnitChange(
  scale: { unit?: string; pixelsPerUnit?: number; showScaleBar?: boolean } | null | undefined,
  toUnit: string,
  mode: UnitChangeMode
): { unit: string; pixelsPerUnit: number; showScaleBar?: boolean } {
  const ppu = scale?.pixelsPerUnit && scale.pixelsPerUnit > 0 ? scale.pixelsPerUnit : 25;
  return {
    ...(scale ?? {}),
    unit: toUnit,
    pixelsPerUnit: mode === 'convert' ? rescaleForUnitChange(ppu, scale?.unit, toUnit) : ppu
  };
}

/**
 * What a distance READING becomes under each choice — the numbers a prompt must show, because the GM
 * decides on outcomes ("should it read 4.37?") and never on the word "convert".
 */
export function unitChangeOutcomes(reading: number, fromUnit: string | null | undefined, toUnit: string | null | undefined): { relabel: number; convert: number } {
  const from = unitKind(fromUnit);
  const to = unitKind(toUnit);
  return {
    relabel: reading,
    convert: from && to ? convertDistance(reading, from, to) : reading
  };
}
