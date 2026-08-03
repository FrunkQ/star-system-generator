// Real-sky import — complete the star parameters the catalogues do not carry.
//
// The catalogues give a star's mass, radius, temperature and luminosity;
// they do NOT give its magnetic field or spin-axis tilt, and the physics
// reads both (the field drives shielding tags and the radiation model, the
// tilt drives satellite frames and seasons — inbox B9a and B10 are the
// record of what silently-absent values did to the OTHER creation routes).
//
// So imported stars are completed exactly the way the generator completes
// its own: the same pack-band functions, seeded from the star's id with the
// generator's own seed recipe — deterministic, so one person's import is
// everyone's, and consistent, so an imported M dwarf and a generated one
// draw from the same band. Values already present are never overwritten
// (a future catalogue column wins over a fill-in).

import type { CelestialBody, RulePack, System } from '$lib/types';
import { starFieldFromPack, starTiltFromPack } from '$lib/generation/star';
import { SeededRNG } from '$lib/rng';

export function completeImportedStars(systems: { system: System }[], pack: RulePack): void {
  for (const entry of systems) {
    for (const node of entry.system.nodes) {
      if (node.kind !== 'body') continue;
      const star = node as CelestialBody;
      if (star.roleHint !== 'star') continue;
      const cls = star.classes?.[0] ?? 'star/M';
      if (!star.magneticField) {
        // Same seed recipe as generateFromConfig.starSeedToBody — its own
        // stream per star so nothing else's draws shift.
        star.magneticField = starFieldFromPack(pack, cls, new SeededRNG(`${star.id}-mag`));
      }
      if (star.axial_tilt_deg == null) {
        star.axial_tilt_deg = starTiltFromPack(pack, new SeededRNG(`${star.id}-tilt`));
      }
    }
  }
}
