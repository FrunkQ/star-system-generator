// The eccentricity a DRAWING may use. One place, because four sites in the 2D orrery take an
// authored `e` and ask a closed-ellipse question of it.
//
// An eccentricity of 1 or more is not a closed orbit at all - it is a parabola or a hyperbola, and
// it has no apoapsis and no semi-minor axis. Ask for either and the arithmetic answers honestly and
// uselessly: `a * (1 + e)` runs away with e, and `a * sqrt(1 - e*e)` is NaN. That is how a belt with
// `e > 1` put its label a long way outside the belt it names (owner, 2026-09-08: "if the eccentricity
// of a belt is greater than 1 the label of the belt spirals outward from the belt itself").
//
// THE DATA IS NOT TOUCHED, and that is the point (the steer-don't-stop rule): a GM may author an
// unbound belt for whatever in-fiction reason, the physics keeps saying so, and only the RENDERER -
// which has to put a label somewhere on screen - borrows a value it can draw with.
export const MAX_DRAW_ECC = 0.99;

/** An authored eccentricity, made safe for a closed-ellipse drawing. Absent or negative reads as circular. */
export function drawEccentricity(e: number | undefined | null): number {
  const v = Number(e);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(v, MAX_DRAW_ECC);
}
