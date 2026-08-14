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
import { stellarRotationHours } from '$lib/physics/stellarRotation';

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
      // AND ITS ROTATION (inbox B43). This was deliberately absent, and `processed.spec.js` pinned
      // the absence so a fresh import could not go toroidal — a real hazard when a missing period
      // used to read as an unknown rather than as no spin. That pin has been kept and rewritten
      // rather than deleted: it now asserts that every imported star HAS a period and that none of
      // them deforms past `oblate`, which is the property it was actually protecting.
      //
      // Derived below the Kraft break from the system's age and the star's mass; drawn above it,
      // where there is nothing to derive from. The roll is seeded from the star's id in the same
      // recipe as the field and the tilt, so one person's Vega is everyone's.
      //
      // AND THE AGE MUST BE A MEASURED ONE (inbox B47c). The importer falls back to 4.6 Gyr — the
      // Sun's — for a system the catalogue gives no age for, which was harmless until gyrochronology
      // started reading it. A star with an unknown age would otherwise get a confidently-derived
      // spin-down borrowed from the Sun. Left UNDERIVED instead: the same shape as `star/unknown`
      // and as the giants excluded above, and absence reads as no spin rather than as a guess.
      if (star.rotation_period_hours == null) {
        const estimated = (entry.system as any).ageEstimated === true;
        const p = stellarRotationHours({
          massKg: star.massKg,
          radiusKm: star.radiusKm,
          ageGyr: estimated ? undefined : (entry.system as any).age_Gyr,
          roll: new SeededRNG(`${star.id}-spin`).nextFloat(),
          isRemnant: /star\/(WD|NS|BH|BH_active|magnetar)/.test(cls),
        isEvolved: /star\/([OBAFGKM]-(I|III)|red-giant)/.test(cls)
        });
        if (p != null) star.rotation_period_hours = Math.round(p * 100) / 100;
      }
    }
  }
}
