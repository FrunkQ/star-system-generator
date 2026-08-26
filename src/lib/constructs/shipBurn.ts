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
  /** Unit vector the DRIVE is pushing along, in the same frame as the ship's drawn position.
   *  Absent on journeys planned before G46, where the caller falls back to the route tangent and
   *  the `braking` flip. Orientation only matters while the engines are lit, and a burn's Delta-v
   *  is not generally parallel to the course it is changing - which is the whole reason this is
   *  published rather than inferred. */
  thrustDir?: { x: number; y: number };
}

const NONE: ShipBurn = { thrusting: false, braking: false, accelMs2: 0 };

/** A burn, reduced to what a PLUME needs: when, how hard, which way. Four numbers.
 *  The player's snapshot carries these INSTEAD of the journeys it strips (those hold huge
 *  pathPoint arrays and the ship's forward plan, neither of which may cross), so a player's
 *  map can light the same torch the GM sees - evaluated against the player's OWN clock, so it
 *  stays live between snapshots instead of freezing at whatever it was when one was sent. */
export interface CompactBurn { s: number; e: number; a: number; b: 0 | 1; dx?: number; dy?: number }
const AU_M = 1.495978707e11;

/** HOW HARD, AND WHICH WAY, one burn segment pushes.
 *
 * PREFERS THE PUBLISHED FIGURES. `deltaV_ms` and `thrustDir` are written by the solver that sized the
 * phase, so they are the phase's own truth. The fallback below - differencing the segment's start and
 * end state velocities - is what this used to do unconditionally, and it is wrong far more often than
 * it looks: most builders leave `endState.v` as a literal zero placeholder, so the difference is the
 * ship's whole orbital velocity rather than the burn's Delta-v. MEASURED against the commanded 0.3 g:
 * the Hohmann departure came out at 2.4x, its brake 2.8x, and a 57-hour torch burn at 0.03x - a plume
 * that was effectively dark through the longest burn in the game. The fallback stays only for journeys
 * committed before G46, which carry no published figures. */
function burnEffort(seg: any): { accelMs2: number; thrustDir?: { x: number; y: number } } | null {
  const durSec = (seg.endTime - seg.startTime) / 1000;
  if (!(durSec > 0)) return null;
  const dir = seg.thrustDir && Number.isFinite(seg.thrustDir.x) && Number.isFinite(seg.thrustDir.y)
    ? { x: seg.thrustDir.x, y: seg.thrustDir.y }
    : undefined;
  if (Number.isFinite(seg.deltaV_ms) && seg.deltaV_ms > 0) {
    return { accelMs2: seg.deltaV_ms / durSec, thrustDir: dir };
  }
  const dvx = ((seg.endState?.v?.x ?? 0) - (seg.startState?.v?.x ?? 0)) * AU_M;
  const dvy = ((seg.endState?.v?.y ?? 0) - (seg.startState?.v?.y ?? 0)) * AU_M;
  const dvz = ((seg.endState?.v?.z ?? 0) - (seg.startState?.v?.z ?? 0)) * AU_M;
  const accelMs2 = Math.hypot(dvx, dvy, dvz) / durSec;
  if (!(accelMs2 > 0)) return null;
  return { accelMs2, thrustDir: dir };
}

/** Does this segment's Delta-v oppose the ship's motion? Only asked of a `Correction`, whose label
 *  does not say which way it pushes. */
function opposesMotion(seg: any): boolean {
  const d = seg.thrustDir
    ? seg.thrustDir
    : { x: (seg.endState?.v?.x ?? 0) - (seg.startState?.v?.x ?? 0),
        y: (seg.endState?.v?.y ?? 0) - (seg.startState?.v?.y ?? 0) };
  return (d.x * (seg.startState?.v?.x ?? 0) + d.y * (seg.startState?.v?.y ?? 0)) < 0;
}

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
        const effort = burnEffort(seg);
        if (!effort) continue;
        const braking = seg.type === 'Brake' || (seg.type !== 'Accel' && opposesMotion(seg));
        out.push({
          s: seg.startTime, e: end, a: effort.accelMs2, b: braking ? 1 : 0,
          ...(effort.thrustDir ? { dx: effort.thrustDir.x, dy: effort.thrustDir.y } : {})
        });
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
      return {
        thrusting: true, braking: c.b === 1, accelMs2: c.a,
        ...(Number.isFinite(c.dx) && Number.isFinite(c.dy) ? { thrustDir: { x: c.dx!, y: c.dy! } } : {})
      };
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
        const effort = burnEffort(seg);
        if (!effort) return NONE;
        const { accelMs2, thrustDir } = effort;
        if (seg.type === 'Brake') return { thrusting: true, braking: true, accelMs2, thrustDir };
        if (seg.type === 'Accel') return { thrusting: true, braking: false, accelMs2, thrustDir };
        // Correction: the label does not say which way, so ask the geometry - a dv opposing the
        // ship's own motion is a retrograde burn however it is labelled.
        return { thrusting: true, braking: opposesMotion(seg), accelMs2, thrustDir };
      }
    }
  }
  return NONE;
}
