// AEROBRAKING: what the atmosphere will take off you, what it costs, and how long it takes.
//
// The original model was a single number — the ship's heatshield rating — subtracted from the arrival
// burn wherever the target had any atmosphere at all. That was written before the engine derived
// atmospheric structure, and it had three faults: it ignored WHERE the ship was arriving (an L-point
// half an AU away got the same free braking as a low orbit), it ignored WHAT the atmosphere could
// actually deliver (Mars scrubbed as freely as Venus), and it was free — no time, no circularisation.
//
// THE MODEL NOW, and every part of it is data the engine already derives:
//
//  1. WHAT THE AIR CAN DELIVER. The braking one pass extracts scales with the column of gas flown
//     through, so the measure is pressure x scale height. Anchored on Earth and saturating there:
//     anything Earth-thick or better is limited by the SHIP, not the sky — which is why a gas giant
//     is effectively free braking. It reproduces the real anchor: Mars comes out at about 1.06 km/s
//     per pass against Mars Odyssey's measured ~1.2 km/s, and Triton or Pluto give essentially
//     nothing, which is correct.
//  2. YOU MUST ACTUALLY GO THERE. Aerobraking is a manoeuvre: drop periapsis into the corridor, let
//     the air do the work, then raise and circularise at the orbit you wanted. Arriving HIGH is still
//     allowed — it just costs the circularisation. Arriving somewhere that is not an orbit around the
//     body at all (a Lagrange point) cannot aerobrake, because there is no periapsis to drop.
//  3. IT COSTS TIME. One pass takes an orbit of the capture ellipse, and shedding more than a pass
//     can survive takes more passes. That is the trade the GM is choosing between: aerobraking saves
//     propellant and spends days; a torch ship with fuel to burn may rightly refuse it.
//
// SIMPLIFICATION STATED: the first pass is assumed sufficient to CAPTURE. A real mission has to shed
// enough on entry to become bound at all, and a craft arriving too fast for its shield would sail
// through instead. The engine does not model that failure yet; it is on the board rather than
// pretended away.
import type { CelestialBody } from '../types';
import { G, AU_KM } from '../constants';

const AU_M = AU_KM * 1000;

/** Earth's braking column, bar x km — the anchor everything else is measured against. */
export const EARTH_BRAKING_COLUMN = 1.013 * 8.5;

/** How much of a ship's heatshield rating this sky can actually use, 0..1. Saturates at Earth-thick,
 *  so gas giants, Venus and Titan are limited by the SHIP rather than by the air. */
export function atmosphericBrakingFactor(body: CelestialBody | undefined | null): number {
  const atm = body?.atmosphere as { pressure_bar?: number; scaleHeightKm?: number } | undefined;
  const pressureBar = atm?.pressure_bar ?? 0;
  if (!(pressureBar > 0.001)) return 0;
  // Scale height is derived by the processor; fall back to a thin-air default rather than assume.
  const scaleKm = atm?.scaleHeightKm ?? 8;
  const column = pressureBar * Math.max(1, scaleKm);
  return Math.max(0, Math.min(1, Math.sqrt(column / EARTH_BRAKING_COLUMN)));
}

/** The altitude a ship brakes at: the top of the sensible atmosphere. Uses the derived
 *  minimum-safe-orbit altitude when the body has one (that IS where drag stops mattering), else a
 *  few scale heights. Returned in km above the surface. */
export function brakingCorridorKm(body: CelestialBody | undefined | null): number {
  const declared = body?.orbitalBoundaries?.minLeoKm;
  if (declared && declared > 0) return declared;
  const scaleKm = (body?.atmosphere as { scaleHeightKm?: number } | undefined)?.scaleHeightKm ?? 8;
  return Math.max(1, scaleKm * 5);
}

export interface AerobrakeSolution {
  /** Delta-v the ATMOSPHERE takes off, m/s — propellant not spent. */
  applied_ms: number;
  /** Delta-v the ENGINE must still supply at arrival, m/s. */
  remaining_ms: number;
  /** Delta-v to climb out of the corridor and circularise where the ship meant to be, m/s. */
  circularise_ms: number;
  /** Passes through the corridor; more than one when the shield cannot take it all at once. */
  passes: number;
  /** Wall-clock the manoeuvre adds, seconds — the reason a torch ship might decline it. */
  timeSec: number;
  /** Altitude of the dip, km above the surface. */
  corridorKm: number;
  /** What a GM or player should be told, in plain words. Empty when nothing was used. */
  note: string;
  /** How much of the shield's rating this sky could use, 0..1. */
  factor: number;
}

const none = (dv: number): AerobrakeSolution => ({
  applied_ms: 0, remaining_ms: dv, circularise_ms: 0, passes: 0,
  timeSec: 0, corridorKm: 0, note: '', factor: 0
});

/**
 * Resolve an aerobraking arrival. `dv2Required_ms` is the arrival burn before any help from the air.
 * `parkingRadiusAU` is the orbit actually wanted; `isOrbitalArrival` is false when the ship is not
 * entering an orbit around this body at all (a Lagrange arrival), which is what makes aerobraking
 * impossible there rather than merely expensive.
 */
export function aerobrakeSolution(opts: {
  target: CelestialBody | undefined | null;
  shipLimitKms: number;
  dv2Required_ms: number;
  parkingRadiusAU?: number;
  isOrbitalArrival: boolean;
}): AerobrakeSolution {
  const { target, shipLimitKms, dv2Required_ms, parkingRadiusAU, isOrbitalArrival } = opts;
  if (!target || !isOrbitalArrival) return none(dv2Required_ms);
  if (!(shipLimitKms > 0) || !(dv2Required_ms > 0)) return none(dv2Required_ms);

  const factor = atmosphericBrakingFactor(target);
  if (factor <= 0) return none(dv2Required_ms);

  const perPass_ms = shipLimitKms * 1000 * factor;
  if (!(perPass_ms > 0)) return none(dv2Required_ms);

  // THE SHIELD RATING IS A MAXIMUM ENTRY SPEED, NOT A DELTA-V ALLOWANCE — the panel has always said
  // 'Max N km/s' and it means exactly that. A ship closing at 600 km/s cannot dip at all; it must
  // burn down to a survivable entry speed FIRST and the air takes over from there. Getting this
  // backwards let a torch arrival claim 606 km/s of free braking, which is worse than the flat cap
  // it replaced: no heatshield survives that, and no number of passes helps something that was never
  // captured. So the air's share is bounded by what the ship can survive entering at.
  const survivable_ms = shipLimitKms * 1000;
  const applied_ms = Math.min(dv2Required_ms, survivable_ms);
  const preEntryBurn_ms = Math.max(0, dv2Required_ms - applied_ms);
  // Once inside, how many trips round it takes to shed that much is set by what this sky delivers
  // per pass — thick air, one pass; thin air, many.
  const passes = Math.max(1, Math.ceil(applied_ms / perPass_ms));

  const corridorKm = brakingCorridorKm(target);
  const bodyRadiusM = (target.radiusKm || 0) * 1000;
  const rPeri = bodyRadiusM + corridorKm * 1000;
  const rTarget = parkingRadiusAU && parkingRadiusAU > 0 ? parkingRadiusAU * AU_M : rPeri;
  const mu = G * (target.massKg || 0);

  let circularise_ms = 0;
  let periodSec = 0;
  if (mu > 0 && rPeri > 0 && rTarget >= rPeri) {
    // Burn at apoapsis to lift periapsis out of the air and circularise where you meant to be.
    const a = (rPeri + rTarget) / 2;
    const vApo = Math.sqrt(Math.max(0, mu * (2 / rTarget - 1 / a)));
    const vCirc = Math.sqrt(mu / rTarget);
    circularise_ms = Math.max(0, vCirc - vApo);
    periodSec = 2 * Math.PI * Math.sqrt((a * a * a) / mu);
  }
  const timeSec = passes * periodSec;

  const km = (v: number) => (v / 1000).toFixed(1);
  const days = timeSec / 86400;
  const timeWords = days >= 1 ? days.toFixed(1) + ' days' : (timeSec / 3600).toFixed(1) + ' hours';
  const passWords = passes === 1 ? '1 pass' : passes + ' passes';
  const note =
    (preEntryBurn_ms > 1
      ? 'Too fast to enter the air directly: burn ' + km(preEntryBurn_ms) + ' km/s first to slow to the '
        + km(survivable_ms) + ' km/s the heatshield can take. Then aerobraking at '
      : 'Aerobraking at ')
    + (target.name ?? 'the target') + ': the atmosphere absorbs ' + km(applied_ms)
    + ' km/s of the arrival over ' + passWords + ' through the upper air (about ' + timeWords
    + ', dipping to roughly ' + Math.round(corridorKm) + ' km altitude). '
    + (circularise_ms > 1
      ? 'Climbing back out and circularising costs ' + km(circularise_ms) + ' km/s of propellant.'
      : 'The orbit wanted is low enough that no climb-out burn is needed.')
    + (factor < 0.99
      ? ' The air here is thin — only ' + km(perPass_ms) + ' km/s per pass, so this takes patience.'
      : ' The air is thick enough that the heatshield is the limit, not the sky.');

  return { applied_ms, remaining_ms: preEntryBurn_ms, circularise_ms, passes, timeSec, corridorKm, note, factor };
}
