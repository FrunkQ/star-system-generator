// Is this ship burning right now, how hard, and which way is it pointing (G3 drive plume)?
//
// READS THE PUBLISHED DECISION rather than re-deriving it. The transit planner already labels
// every segment `Accel | Brake | Coast | Correction` and carries its start/end state vectors, so
// thrust is `|dv| / duration` off the segment and the flip is the LABEL - no inference needed.
//
// THIS REPLACED A VELOCITY-DIFFERENCING HACK THAT COULD NEVER HAVE WORKED, and the reason is
// worth keeping: `sampleJourneyKinematicsAtTime` interpolates position between a segment's
// pathPoints and reports the velocity of the sub-interval it lands in, so that velocity is
// PIECEWISE CONSTANT. Differencing it across a minute returns exactly zero almost everywhere
// (and a meaningless spike at a sample boundary), so the plume never lit and the brake flip
// never fired. The fault was invisible in tests because no bundled construct carries a journey.
export interface ShipBurn {
  /** Under thrust at this instant. */
  thrusting: boolean;
  /** Pointing retrograde: a Brake segment, or a Correction whose dv opposes the motion. */
  braking: boolean;
  /** Magnitude, m/s^2 - the numerator of the plume's thrust fraction. */
  accelMs2: number;
}

const NONE: ShipBurn = { thrusting: false, braking: false, accelMs2: 0 };

/** A burn, reduced to what a PLUME needs: when, how hard, which way. Four numbers.
 *  The player's snapshot carries these INSTEAD of the journeys it strips (those hold huge
 *  pathPoint arrays and the ship's forward plan, neither of which may cross), so a player's
 *  map can light the same torch the GM sees - evaluated against the player's OWN clock, so it
 *  stays live between snapshots instead of freezing at whatever it was when one was sent. */
export interface CompactBurn { s: number; e: number; a: number; b: 0 | 1 }
const AU_M = 1.495978707e11;

/** Reduce a construct's committed journeys to the compact burns above. Pure; safe on a node
 *  with no journeys (returns an empty list, and the caller then attaches nothing). */
export function compactBurns(construct: any): CompactBurn[] {
  const out: CompactBurn[] = [];
  for (const log of construct?.scheduled_journeys ?? []) {
    if (log?.status === 'cancelled') continue;
    const cancelledAtMs = log?.cancelledAtSec ? Number(BigInt(log.cancelledAtSec) * 1000n) : null;
    for (const plan of log?.plans ?? []) {
      for (const seg of plan?.segments ?? []) {
        if (seg?.type === 'Coast') continue;
        const durSec = (seg.endTime - seg.startTime) / 1000;
        if (!(durSec > 0)) continue;
        // A journey cancelled mid-flight stops thrusting THERE, whatever its segments say.
        const end = cancelledAtMs !== null ? Math.min(seg.endTime, cancelledAtMs) : seg.endTime;
        if (!(end > seg.startTime)) continue;
        const dvx = ((seg.endState?.v?.x ?? 0) - (seg.startState?.v?.x ?? 0)) * AU_M;
        const dvy = ((seg.endState?.v?.y ?? 0) - (seg.startState?.v?.y ?? 0)) * AU_M;
        const dvz = ((seg.endState?.v?.z ?? 0) - (seg.startState?.v?.z ?? 0)) * AU_M;
        const accelMs2 = Math.hypot(dvx, dvy, dvz) / durSec;
        if (!(accelMs2 > 0)) continue;
        const dot = dvx * (seg.startState?.v?.x ?? 0) + dvy * (seg.startState?.v?.y ?? 0) + dvz * (seg.startState?.v?.z ?? 0);
        const braking = seg.type === 'Brake' || (seg.type !== 'Accel' && dot < 0);
        out.push({ s: seg.startTime, e: end, a: accelMs2, b: braking ? 1 : 0 });
      }
    }
  }
  return out;
}

/** The burn state of `construct` at `timeMs`. Reads the committed journey segments where they
 *  are present (the GM), and the compact burns where they are not (a player, whose snapshot has
 *  had the journeys stripped). Pure. */
export function shipBurnAt(construct: any, timeMs: number): ShipBurn {
  const compact: CompactBurn[] | undefined = construct?.driveBurns;
  if (compact?.length) {
    for (const c of compact) {
      if (timeMs < c.s || timeMs > c.e) continue;
      return { thrusting: true, braking: c.b === 1, accelMs2: c.a };
    }
    // Compact burns are the WHOLE truth on a player's node: no match means coasting.
    if (!construct?.scheduled_journeys?.length) return NONE;
  }
  const logs = construct?.scheduled_journeys ?? [];
  for (const log of logs) {
    if (log?.status === 'cancelled') continue;
    // A cancelled-mid-flight journey stops thrusting at the moment it was cancelled, whatever
    // its segments still say - the ship is adrift from there (the sampler's own rule).
    const cancelledAtMs = log?.cancelledAtSec ? Number(BigInt(log.cancelledAtSec) * 1000n) : null;
    if (cancelledAtMs !== null && timeMs >= cancelledAtMs) continue;
    for (const plan of log?.plans ?? []) {
      for (const seg of plan?.segments ?? []) {
        if (!(timeMs >= seg.startTime && timeMs <= seg.endTime)) continue;
        if (seg.type === 'Coast') return NONE;
        const durSec = (seg.endTime - seg.startTime) / 1000;
        if (!(durSec > 0)) return NONE;
        // States are in AU/s about the segment's host; the plume only needs the magnitude and
        // the sign of the projection, both of which survive the unit conversion unchanged.
        const dvx = ((seg.endState?.v?.x ?? 0) - (seg.startState?.v?.x ?? 0)) * AU_M;
        const dvy = ((seg.endState?.v?.y ?? 0) - (seg.startState?.v?.y ?? 0)) * AU_M;
        const dvz = ((seg.endState?.v?.z ?? 0) - (seg.startState?.v?.z ?? 0)) * AU_M;
        const accelMs2 = Math.hypot(dvx, dvy, dvz) / durSec;
        if (!(accelMs2 > 0)) return NONE;
        if (seg.type === 'Brake') return { thrusting: true, braking: true, accelMs2 };
        if (seg.type === 'Accel') return { thrusting: true, braking: false, accelMs2 };
        // Correction: the label does not say which way, so ask the geometry - a dv opposing the
        // ship's own motion is a retrograde burn however it is labelled.
        const vx = (seg.startState?.v?.x ?? 0), vy = (seg.startState?.v?.y ?? 0), vz = (seg.startState?.v?.z ?? 0);
        const dot = dvx * vx + dvy * vy + dvz * vz;
        return { thrusting: true, braking: dot < 0, accelMs2 };
      }
    }
  }
  return NONE;
}
