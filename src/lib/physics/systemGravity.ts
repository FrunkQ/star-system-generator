// Stage 3 — REAL-units gravity for a coasting/adrift construct inside a system. The construct is a test
// particle in the system's own field; the star (and other bodies) attract it with true G, so a stationary
// ship genuinely falls toward the star and a fly-by that arrives at a planet's old slot (the planet has
// since moved on its orbit) whips around the star at that solar distance — the slingshot. Positions are in
// AU and time in SECONDS, matching the orrery, so this drops straight onto the integrator.
import { G } from '../constants';
import { inverseSquareField, type Attractor, type AccelField } from './driftIntegrator';

const AU_M = 1.495978707e11;
// G converted to AU³ / (kg · s²) so an inverse-square field over AU positions yields AU/s².
export const G_AU = G / (AU_M * AU_M * AU_M);

// One attractor from a body's mass + a (time → AU position) function. Belts/rings are distributed debris,
// not point masses, so the caller should exclude them.
export function gravAttractor(massKg: number, posAt: (t: number) => [number, number]): Attractor {
  return { mu: G_AU * Math.max(0, massKg), posAt };
}

// Real-units gravity field for a system from its massive bodies. `positionAt(id, t)` supplies each body's
// AU world-position at game time t (the orrery already derives these from the clock); pass the star(s) and
// planets. soften ~ a small AU² so a near-direct hit slings hard but doesn't blow up (the "threw out mass
// to miss the sun" hand-wave for a star-targeted fly-by).
export function systemGravityField(
  bodies: { id: string; massKg: number }[],
  positionAt: (id: string, t: number) => [number, number],
  soften = 1e-6
): AccelField {
  const attractors = bodies
    .filter((b) => (b.massKg || 0) > 0)
    .map((b) => gravAttractor(b.massKg, (t) => positionAt(b.id, t)));
  return inverseSquareField(attractors, soften);
}
