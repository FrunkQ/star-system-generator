// A STAR'S EFFECTIVE TEMPERATURE, PINNED (G96: "direct temp control is now in overrides").
//
// The owner, 2026-09-11: "On stars it REPLACES the temp control which also shows temp... direct temp
// control is now in overrides" and, of what the pin means, "the physics just uses the actual values -
// even if they don't make a huge amount of sense."
//
// WHY A STAR NEEDS ITS OWN KEY. `surfaceTempK` is a planet's MEAN SURFACE pin, banded on its distance
// from an equilibrium temperature and carried as an anomalous flux through the thermal solve. A star
// has no equilibrium temperature and no thermal solve: its temperature is a photosphere, it is what
// everything else in the system is lit BY, and its brightness follows from it and the radius.
//
// HOW IT IS APPLIED, AND WHY IT IS ONE FUNCTION CALLED FROM TWO PLACES. A fusing star's temperature
// is AUTHORED INPUT today - nothing derives it (what a star's age does to it is G97, undecided) - so
// there is no derivation to feed the pin INTO. The pin is therefore applied to the stored figure
// itself: the processor does it at the top of the stellar pass, before anything reads the star, and
// the roster record's `commit` calls the same function so the Overrides tab shows the effect at once.
// The figure the pin displaced is kept beside it (`temperature0K`, the `atmosphere0` pattern), which
// is what makes reset hand the star back exactly as it was and makes re-processing a no-op.
//
// THE BRIGHTNESS FOLLOWS, BY THE ONE LAW. `radiationOutput` is Stefan-Boltzmann over the radius and
// the pinned temperature (`physics/luminosity.ts`, PHY-34), rounded the way the star editor rounds
// it, so a pinned star is not also flagged as disagreeing with its own numbers.
//
// WHO IS NOT OFFERED IT, each asked of the physics rather than of a label where the physics can say:
//   - A BROWN DWARF (the 8-80 Jupiter-mass window, asked of the cooling model). Its temperature is
//     its cooling track and its handle is its AGE (B150, G94). Offering a pin there would rebuild
//     the control that was removed.
//   - A BLACK HOLE, A NEUTRON STAR, A MAGNETAR. Their output is a disc or a magnetosphere, not a
//     surface, so there is no photosphere for a temperature to be the temperature OF.
import type { CelestialBody } from '$lib/types';
import { brownDwarfThermal } from './substellar';
import { luminositySolarFromRT } from './luminosity';

/** The coolest a fusing star gets. The M/L overlap sits here - see the ignition note in
 *  `SystemProcessor.applySubstellarSelfLuminosity`, which raises an UNPINNED star below it. */
export const STELLAR_FLOOR_K = 1900;

/** The classes whose output is not their own surface. One spelling, shared with the star editor. */
export const NON_THERMAL_STAR_CLASSES: readonly string[] = ['star/BH', 'star/BH_active', 'star/NS', 'star/magnetar'];

export function isNonThermalStar(body: Pick<CelestialBody, 'classes'> | null | undefined): boolean {
  return NON_THERMAL_STAR_CLASSES.includes(body?.classes?.[0] ?? '');
}

/** True for a star with a photosphere that nothing else is already deriving. */
export function hasPinnablePhotosphere(body: CelestialBody | null | undefined): boolean {
  if (!body || body.kind !== 'body' || body.roleHint !== 'star') return false;
  if (isNonThermalStar(body)) return false;
  return !brownDwarfThermal(body.massKg || 0, 1, body.radiusKm || 0).isSubstellar;
}

/** The pinned temperature, or undefined when there is none or it does not apply to this body. */
export function effectiveTempPin(body: CelestialBody | null | undefined): number | undefined {
  const pin = body?.overrides?.effectiveTempK;
  return typeof pin === 'number' && Number.isFinite(pin) && hasPinnablePhotosphere(body) ? pin : undefined;
}

/**
 * Bring the star's stored temperature and brightness into line with its pin - or, when the pin has
 * gone, hand back what it displaced. IDEMPOTENT: a second call changes nothing, which is what lets
 * the processor run it on every pass.
 */
export function applyEffectiveTempPin(body: CelestialBody): void {
  const pin = effectiveTempPin(body);
  if (pin === undefined) {
    if (body.temperature0K !== undefined) {
      body.temperatureK = body.temperature0K;
      if (body.radiationOutput0 !== undefined) body.radiationOutput = body.radiationOutput0;
      delete body.temperature0K;
      delete body.radiationOutput0;
    }
    return;
  }
  if (body.temperature0K === undefined) {
    body.temperature0K = body.temperatureK ?? pin;
    if (body.radiationOutput !== undefined) body.radiationOutput0 = body.radiationOutput;
  }
  body.temperatureK = pin;
  if ((body.radiusKm ?? 0) > 0) {
    body.radiationOutput = parseFloat(luminositySolarFromRT(body.radiusKm as number, pin).toPrecision(3));
  }
}
