// Stage 3 — analytic 2-body hyperbolic flyby (gravity assist / slingshot) for an interstellar fly-by that
// arrives at a system it cannot stop in. The ship aimed at a body whose distance from the star is rp (the
// planet has since moved on its orbit, so it actually reaches that solar distance and whips round the
// star). Given the hyperbolic-excess velocity v∞, the periapsis rp, and the star's μ = G·M, the turn is
// closed-form — no integration. At starmap scale the periapsis loop is sub-pixel, so the visible effect is
// a KINK: the track comes in along vIn and leaves along vOut, rotated by the deflection angle.
//
// Units are self-consistent: feed (AU/s, AU, AU³/s²) or any other matched triple.

export interface FlybyResult {
  e: number; // hyperbolic eccentricity (>1; ∞ if degenerate)
  turn: number; // deflection of the velocity vector, radians (0 = no bend, →π for a slow close pass)
  vOut: [number, number]; // outgoing velocity — same speed as vIn, rotated by side·turn
}

// vIn = incoming velocity (its magnitude is the hyperbolic-excess speed v∞ far from the star).
// rp   = periapsis distance (the targeted body's solar distance; a star-aimed pass uses a tiny rp).
// mu   = G·M of the star. side = which way it wraps the star (+1 / -1) — pick from the impact side.
export function hyperbolicFlyby(
  vIn: [number, number],
  rp: number,
  mu: number,
  side: 1 | -1 = 1
): FlybyResult {
  const vinf = Math.hypot(vIn[0], vIn[1]);
  if (!(vinf > 0) || !(rp > 0) || !(mu > 0)) return { e: Infinity, turn: 0, vOut: [vIn[0], vIn[1]] };
  // For a hyperbola with excess speed v∞ and periapsis rp:  e = 1 + rp·v∞² / μ.
  const e = 1 + (rp * vinf * vinf) / mu;
  // Total turn of the asymptote: sin(turn/2) = 1/e.
  const turn = 2 * Math.asin(Math.min(1, 1 / e));
  const c = Math.cos(side * turn);
  const s = Math.sin(side * turn);
  const vOut: [number, number] = [vIn[0] * c - vIn[1] * s, vIn[0] * s + vIn[1] * c];
  return { e, turn, vOut };
}
