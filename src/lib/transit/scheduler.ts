import type { CelestialBody, System } from '$lib/types';
import type { TransitPlan, Vector2 } from '$lib/transit/types';
import { AU_KM, G } from '$lib/constants';
import { getGlobalState } from '$lib/transit/physics';
import { parkingOrbitRadiusKm, circularElementsAtState } from '$lib/physics/orbits';
import { satelliteTiltRad, toParentEquator } from '$lib/system/satelliteFrame';
import { samplePathAtTime } from '$lib/transit/pathSampling';
import { deriveCoOrbitalOrbit, LAGRANGE_POINT_IDS } from '$lib/physics/lagrange';
import type { LagrangePointId } from '$lib/types';
import { driftAt } from '$lib/physics/driftIntegrator';
import { coastConicAt } from '$lib/physics/twoBodyCoast';
import { systemGravityField, G_AU } from '$lib/physics/systemGravity';

const AU_M = AU_KM * 1000;

// Incremental coast cache: the ship's last resolved coast state, keyed by its anchor (cancel point). Lets
// us step FORWARD from the last frame's result by a tiny delta instead of re-integrating the whole span
// from the anchor every redraw (which was O(elapsed) → the orrery overload + clock-jumps). Scrubbing back
// past the cached time falls back to an exact recompute from the anchor.
type CoastState = { tEndMs: number; x: number; y: number; z: number; vx: number; vy: number; vz: number };
const coastIncrCache = new Map<string, CoastState>();

// Coast a cut-loose ship under the system's REAL gravity — full N-body: every massive body pulls (the
// same perturber set the transit integrator uses, calculator.ts), so the ship can be slung past a planet,
// not only fall round the sun. A residual velocity traces a real trajectory (bound ellipse, hyperbola
// above escape, bent by close encounters) instead of the old straight line. Belts/rings are distributed
// debris-density, not point masses — excluded (mirrors transits); barycenters are abstract points whose
// mass already lives on their child bodies — excluded to avoid double-counting. Falls back to a straight
// line if there's nothing massive. AU + sec, matching the orrery + G_AU; attractors move (orbiting
// planets, binary stars) via getGlobalState.
export function coastUnderGravity(
  system: System,
  startPos_au: Vector2,
  startVel_ms: { x: number; y: number; z?: number },
  t0Ms: number,
  tMs: number
): { position_au: Vector2; velocity_ms: { x: number; y: number; z?: number } } {
  const dtSecRaw = (tMs - t0Ms) / 1000;
  // Guard pathological gaps: a non-finite span, or a journey/abort timestamped in a different epoch than
  // the clock (e.g. flights at 2300 vs a 2323 calendar) yields an enormous dt. Integrating that EVERY frame
  // is the freeze; the runaway integral is the "teleport". Hold at the anchor for garbage, and CAP the span
  // so an old-but-valid adrift ship still resolves cheaply (~bounded step count) instead of grinding.
  if (!(dtSecRaw > 0) || !Number.isFinite(dtSecRaw)) {
    return { position_au: { ...startPos_au }, velocity_ms: { ...startVel_ms } };
  }
  const MAX_COAST_SEC = 3.15e10; // ~1000 years — beyond this we just hold the last coasted state
  const tEndMs = Math.min(tMs, t0Ms + MAX_COAST_SEC * 1000);
  const tEndSec = tEndMs / 1000;
  const t0Sec = t0Ms / 1000;
  const bodies = system.nodes
    .filter((n) => n.kind === 'body' && ((n as any).massKg || 0) > 0 && (n as any).roleHint !== 'belt' && (n as any).roleHint !== 'ring' && (n as any).roleHint !== 'moon')
    .map((n) => ({ id: n.id, massKg: (n as any).massKg as number }));
  if (!bodies.length) {
    const dt = (tEndMs - t0Ms) / 1000;
    return {
      position_au: {
        x: startPos_au.x + (startVel_ms.x / AU_M) * dt,
        y: startPos_au.y + (startVel_ms.y / AU_M) * dt,
        z: (startPos_au.z ?? 0) + ((startVel_ms.z ?? 0) / AU_M) * dt
      },
      velocity_ms: { ...startVel_ms }
    };
  }
  const field = systemGravityField(bodies, (id, t) => {
    const node = system.nodes.find((n) => n.id === id);
    if (!node) return [0, 0, 0];
    const s = getGlobalState(system, node as any, t * 1000); // field time is seconds; getGlobalState wants ms
    return [s.r.x, s.r.y, s.r.z ?? 0];
  });

  // Incremental: continue from the last cached state when stepping FORWARD (cheap delta); recompute from the
  // anchor only on a cache miss or a backward scrub. This is the perf fix — no more O(elapsed) per frame.
  const key = `${t0Ms}|${startPos_au.x},${startPos_au.y},${startPos_au.z ?? 0}|${startVel_ms.x},${startVel_ms.y},${startVel_ms.z ?? 0}`;
  const prev = coastIncrCache.get(key);
  const from = (prev && prev.tEndMs <= tEndMs && prev.tEndMs >= t0Ms)
    ? { t0: prev.tEndMs / 1000, x: prev.x, y: prev.y, z: prev.z, vx: prev.vx, vy: prev.vy, vz: prev.vz }
    : { t0: t0Sec, x: startPos_au.x, y: startPos_au.y, z: startPos_au.z ?? 0,
        vx: startVel_ms.x / AU_M, vy: startVel_ms.y / AU_M, vz: (startVel_ms.z ?? 0) / AU_M };
  const spanSec = tEndSec - from.t0;
  const r = spanSec <= 0
    ? { x: from.x, y: from.y, z: from.z, vx: from.vx, vy: from.vy, vz: from.vz }
    : driftAt(from, field, tEndSec, Math.max(600, spanSec / 2000)); // ≤~2000 steps for the (now small) span

  if (Number.isFinite(r.x) && Number.isFinite(r.y)) {
    if (coastIncrCache.size > 256) coastIncrCache.clear(); // cheap bound; entries are tiny
    coastIncrCache.set(key, { tEndMs, x: r.x, y: r.y, z: r.z, vx: r.vx, vy: r.vy, vz: r.vz });
  }
  const safe = (v: number, fb: number) => (Number.isFinite(v) ? v : fb);
  return {
    position_au: { x: safe(r.x, startPos_au.x), y: safe(r.y, startPos_au.y), z: safe(r.z, startPos_au.z ?? 0) },
    velocity_ms: {
      x: safe(r.vx * AU_M, startVel_ms.x),
      y: safe(r.vy * AU_M, startVel_ms.y),
      z: safe(r.vz * AU_M, startVel_ms.z ?? 0)
    }
  };
}

// Predict a coasting ship's FUTURE path — a polyline of `steps` points so the orrery can draw the trajectory
// it's about to follow (a slow fall to the star, an ellipse, a hyperbola escaping, or a bend at a planet).
// The forecast just SAMPLES the same deterministic coastConicAt the adrift ship actually follows — one model
// for the line AND the ship, so they can never disagree. Auto-sizes the horizon to ~a quarter orbital period
// at the ship's distance so the arc is visibly curved at any scale. Returns AU positions (oldest→newest),
// empty if there's no star to fall to.
export function coastPathUnderGravity(
  system: System,
  startPos_au: Vector2,
  startVel_ms: { x: number; y: number; z?: number },
  t0Ms: number,
  steps = 40
): Vector2[] {
  if (!Number.isFinite(startPos_au?.x) || !Number.isFinite(startPos_au?.y)) return [];
  if (!coastConicAt(system, startPos_au, startVel_ms, t0Ms, t0Ms)) return []; // no star — nothing to pull on
  // Horizon ≈ a couple of characteristic times at the ship's distance from the root mass — a good arc
  // ahead, short enough that a near-radial plunge doesn't whip clear through the star.
  const root: any = system.nodes.find((n: any) => n.parentId == null);
  const rootMass = root?.massKg ?? root?.effectiveMassKg ?? 0;
  const r = Math.max(1e-6, Math.hypot(startPos_au.x, startPos_au.y, startPos_au.z ?? 0));
  const mu = G_AU * rootMass;
  const charSec = mu > 0 ? Math.sqrt((r * r * r) / mu) : 3.15e7; // √(r³/μ) = T/2π (≈1 rad of arc)
  const horizonSec = Math.max(86400, charSec * 2);
  const stepSec = horizonSec / steps;
  const pts: Vector2[] = [];
  for (let k = 0; k <= steps; k++) {
    const c = coastConicAt(system, startPos_au, startVel_ms, t0Ms, t0Ms + k * stepSec * 1000);
    pts.push(c ? c.position_au : { x: startPos_au.x, y: startPos_au.y, z: startPos_au.z ?? 0 });
  }
  return pts;
}

// arrivalPlacement code -> human label and parking-altitude factor (radii above surface),
// matching samplePostJourneyState's visual parking orbit.
import { dockingOf, nearestAttachment, attachedOffsetAu, LADDER_LABELS, type Attachment } from '../constructs/docking';

const PLACEMENT_LABELS: Record<string, string> = {
  lo: 'Low Orbit',
  mo: 'Medium Orbit',
  ho: 'High Orbit',
  geo: 'Geostationary Orbit',
  surface: 'Surface',
  l4: 'L4',
  l5: 'L5'
};
// THE PARKING RADIUS IS DERIVED, AND `physics/orbits.ts` DERIVES IT. What used to be here was a table
// of radius multipliers - and the same four numbers again as a ternary chain beside the sampler that
// wanted them - while the planner panel offered the DERIVED figures. Two answers to 'how high is a
// high orbit', and they disagreed by up to a factor of ninety-five (see `parkingOrbitRadiusKm`). That
// disagreement is what [[B92]] measured as an arrival snap: the solver aimed at one orbit, the sampler
// parked the ship in another, and the ship stepped between them at the completion instant.

export interface JourneyBounds {
  startMs: number;
  endMs: number;
}

export interface JourneyKinematics {
  journeyId: string;
  position_au: Vector2;
  velocity_ms: { x: number; y: number; z?: number };
  state: 'Transit' | 'Deep Space' | 'Orbiting' | 'Docked' | 'Landed';
}

// The journey-log element type, structurally. `ScheduledJourneyLog` is declared in the types module
// but not exported, and exporting it is not this change's business.
type JourneyLogOf = NonNullable<CelestialBody['scheduled_journeys']>[number];

export function getJourneyBounds(plans: TransitPlan[]): JourneyBounds | null {
  if (!plans || plans.length === 0) return null;
  const ordered = [...plans].sort((a, b) => a.startTime - b.startTime);
  const startMs = ordered[0].startTime;
  const last = ordered[ordered.length - 1];
  const endMs = last.startTime + (last.totalTime_days * 86400 * 1000);
  return { startMs, endMs };
}

/**
 * The host a construct is *currently* at, derived from its scheduled journeys at a
 * given display time - NOT its authored `parentId`. After a construct transits to and
 * is captured by a target body, its persistent parentId/orbit still describe its
 * authored placement (e.g. a heliocentric orbit around the star); the live location is
 * derived from the journey. Returns the id of the body it should be treated as
 * orbiting/landed at:
 *   - mid-journey (in transit): null (not captured by any host)
 *   - after a captured (non-flyby) arrival: that journey's target
 *   - before any journey, or only flyby arrivals: the authored parentId
 */
export function resolveConstructCurrentHostId(
  construct: CelestialBody,
  displayTimeMs: number
): string | null {
  const logs = Array.isArray(construct.scheduled_journeys) ? construct.scheduled_journeys : [];
  let captured: { endMs: number; targetId: string } | null = null;
  for (const log of logs) {
    if (log.status === 'cancelled') continue;
    const bounds = getJourneyBounds(log.plans);
    if (!bounds) continue;
    // Currently flying this journey -> in transit, not captured by any host.
    if (displayTimeMs >= bounds.startMs && displayTimeMs < bounds.endMs) return null;
    if (displayTimeMs >= bounds.endMs) {
      const lastPlan = log.plans[log.plans.length - 1];
      if (!lastPlan) continue;
      const isFlyby =
        (lastPlan.interceptSpeed_ms || 0) > 0 ||
        (lastPlan.segments || []).some((s) => (s.warnings || []).includes('Flyby'));
      // Keep the latest captured arrival (chained journeys end at the final target).
      if (!isFlyby && lastPlan.targetId && (!captured || bounds.endMs > captured.endMs)) {
        captured = { endMs: bounds.endMs, targetId: lastPlan.targetId };
      }
    }
  }
  if (captured) return captured.targetId;
  return construct.parentId ?? null;
}

/**
 * HEAL A SHIP THAT IS STILL CARRYING THE ORBIT IT DEPARTED FROM - AND COUNT THE REPAIR.
 *
 * After a ship transits to a body, its parentId/orbit/placement can still describe its *authored*
 * home (a heliocentric orbit around the star, say). That one stale record is the source of four
 * separate symptoms - a panel reading "Earth: Far Orbit" beside an orbital period of 5.33 YEARS, a
 * picker that says Sol while the panel says Earth, a ship frozen in space on every player view, and
 * the need to lock players to the GM's clock for any of it to look right ([[B96]], [[B97]]).
 *
 * So: once a captured (non-flyby) arrival has passed, rewrite parentId + orbit (a circular parking
 * orbit around the real host) + placement to match, and drop the stamped vector that would otherwise
 * pin the ship to the spot it stopped at. The journey log is left intact. Idempotent - a no-op once
 * healed, returning the same reference so callers can cheaply detect a change.
 *
 * AND "ARRIVAL" INCLUDES AN ORBIT CHANGE, which ends at the host it started from. That case has to be
 * judged on the RADIUS, not the host, or every high-to-low transfer reads as "already healed".
 *
 * KEYED TO DISPLAY TIME, which is a deliberate reversal. Owner, 2026-08-27: *"Actual Time we ignore
 * for now - that is a GM checkpoint to advance his campaign... Display Time is our main 't' for
 * player/GM visualisation."* It used to key off actual time, on the reasoning that scrubbing must not
 * mutate saved state - but `masterTimeSec` is written by exactly one control in Settings, so in
 * ordinary play the heal NEVER FIRED and a stale ship was the normal case rather than the edge one.
 * The cost of the reversal is honest and small: scrub forward past an arrival and it is committed, so
 * a later scrub back to before the departure draws the ship at its destination. The journeys still
 * carry the truth for every moment in between.
 *
 * AND IT IS INSTRUMENTED. `placementHealCount` counts the repairs. Owner: *"Record how many times you
 * do this on the ship - a useful debug for us if we get user files. If it happens loads of times we
 * still have outstanding issues; once fixed it should not be >0 (or not populated)."* Because the heal
 * is idempotent the count can only climb when something UPSTREAM writes the ship wrong again - which
 * makes it a direct read on whether the real fault is still live.
 */
export function reconcileConstructArrival(
  system: System,
  construct: CelestialBody,
  atTimeMs: number
): CelestialBody {
  if (construct.kind !== 'construct') return construct;
  const logs = Array.isArray(construct.scheduled_journeys) ? construct.scheduled_journeys : [];

  // Latest captured (non-flyby) arrival whose end has passed.
  let best: { endMs: number; plan: TransitPlan; log: JourneyLogOf } | null = null;
  for (const log of logs) {
    if (log.status === 'cancelled') continue;
    const bounds = getJourneyBounds(log.plans);
    if (!bounds || atTimeMs < bounds.endMs) continue;
    const lastPlan = log.plans[log.plans.length - 1];
    if (!lastPlan) continue;
    const isFlyby =
      (lastPlan.interceptSpeed_ms || 0) > 0 ||
      (lastPlan.segments || []).some((s) => (s.warnings || []).includes('Flyby'));
    if (isFlyby) continue;
    if (!best || bounds.endMs > best.endMs) best = { endMs: bounds.endMs, plan: lastPlan, log };
  }
  if (!best) return construct;

  const hostId = best.plan.targetId;
  const target = system.nodes.find((n) => n.id === hostId) as any;
  if (!target) return construct;

  // G53 PHASE 5 - A DOCKED ARRIVAL STAMPS THE ATTACHMENT, NOT AN ORBIT. From here the propagator's
  // attachment pass places the ship on its structure (worldPositions.ts); the placement string
  // says where in words, and `construct-logic` prints a 'Docked' placement as it stands.
  const dock = best.plan.arrivalDock;
  if (dock) {
    const structure = system.nodes.find((n) => n.id === dock.structureId) as any;
    if (structure) {
      const kind = dockingOf(structure);
      const level = kind === 'ladder' ? (dock.level ?? 'geo') : undefined;
      const already = construct.attachedTo?.id === structure.id
        && (construct.attachedTo?.level ?? undefined) === level
        && construct.flight_state === 'Docked';
      if (already) return construct;
      let att: Attachment = level ? { id: structure.id, level } : { id: structure.id };
      if (!level && kind === 'anywhere') {
        const at = samplePostJourneyState(system, best.log, best.endMs, best.endMs);
        const hostNode = system.nodes.find((n) => n.id === structure.parentId) as any;
        if (at && hostNode) {
          const h = getGlobalState(system, hostNode, best.endMs);
          att = nearestAttachment(structure, hostNode,
            { x: at.position_au.x - h.r.x, y: at.position_au.y - h.r.y, z: ((at.position_au as any).z ?? 0) - (h.r.z ?? 0) },
            best.endMs, system) ?? att;
        }
      }
      const where = level ? ` - ${LADDER_LABELS[level]}` : '';
      return {
        ...construct,
        parentId: structure.parentId ?? construct.parentId,
        attachedTo: att,
        placement: `Docked: ${structure.name}${where}`,
        flight_state: 'Docked',
        vector_position_au: undefined,
        vector_epoch_ms: undefined,
        placementHealCount: (construct.placementHealCount ?? 0) + 1
      } as CelestialBody;
    }
  }

  const placementKey = best.plan.arrivalPlacement || 'lo';
  const label = PLACEMENT_LABELS[placementKey] || construct.placement || 'Orbit';
  const targetRadiusKm = target.radiusKm || 1000;
  const targetMassKg = target.massKg || target.effectiveMassKg || 0;
  const hostMu = G * targetMassKg;
  // The fallback radius, for a landed ship and for the case where the sampler cannot answer. Note the
  // `system` argument: `getOrbitOptions` reads it, so omitting it derives a DIFFERENT high orbit from
  // the one the sampler parks at - which is precisely the two-answers-to-one-question fault [[B92]]
  // was about, and it was worth 1,163 km on an Earth low orbit.
  let a_AU =
    placementKey === 'surface'
      ? targetRadiusKm / AU_KM
      : (parkingOrbitRadiusKm(target as any, placementKey, undefined, system) ?? targetRadiusKm * 1.3) / AU_KM;

  // A RADIUS WITHOUT A PHASE IS THE RIGHT ORBIT AND THE WRONG POINT ON IT. The elements used to keep
  // whatever `M0_rad`/`i_deg`/`Omega_deg` the ship was authored with, so the stored orbit and the
  // journey sampler agreed about the circle and disagreed about where on it the ship was - by up to a
  // DIAMETER. That did not show while a stamped vector was overriding the orbit; it is exactly what
  // would show the moment the vector is dropped.
  //
  // So ask the sampler where it puts the ship AT THE ARRIVAL INSTANT and store the circular orbit that
  // passes through that state. One derivation of the arrival axes, not two kept in step by hand -
  // the same rule G43 P4 used on the Lagrange arrivals, and the one [[B92]] was about. Landed and
  // Docked are exempt: they snap to the host centre and have no phase to get wrong.
  //
  // AND THE RADIUS COMES FROM THE SAMPLER TOO, not from a second derivation that has to be kept in
  // step with it by hand. Reading `parkingOrbitRadiusKm` here as well left the stored orbit and the
  // drawn ship on two different circles.
  let phase: { i_deg: number; Omega_deg: number; omega_deg: number; M0_rad: number } | null = null;
  if (placementKey !== 'surface') {
    const atArrival = samplePostJourneyState(system, best.log, best.endMs, best.endMs);
    if (atArrival && atArrival.state === 'Orbiting') {
      const host = getGlobalState(system, target as any, best.endMs);
      const rRel = {
        x: atArrival.position_au.x - host.r.x,
        y: atArrival.position_au.y - host.r.y,
        z: (atArrival.position_au.z ?? 0) - (host.r.z ?? 0)
      };
      const vRel = {
        x: atArrival.velocity_ms.x - host.v.x * AU_M,
        y: atArrival.velocity_ms.y - host.v.y * AU_M,
        z: (atArrival.velocity_ms.z ?? 0) - (host.v.z ?? 0) * AU_M
      };
      // ...AND IN THE FRAME THE ELEMENTS WILL BE READ IN. A satellite's elements are quoted in its
      // PARENT'S EQUATORIAL frame (C3/C9, `satelliteFrame.ts`), so `computeWorldPositions3D` rotates
      // every propagated offset by the parent's axial tilt on the way out. The sampler's answer is
      // absolute, in the system plane. Handing it over unrotated stored elements that came out 23.44
      // degrees wrong around Earth - the planet's tilt exactly, and a 1,163 km miss on a 6,536 km
      // orbit. Going in, apply the INVERSE of that rotation; the two then compose to identity.
      //
      // Rotating rather than declaring `frame: 'ecliptic'` on the healed orbit, which would also have
      // worked: one convention for every satellite beats a second one that only constructs use, and
      // the ship's inclination then still reads against the world it is orbiting.
      const tilt = satelliteTiltRad(construct, target);
      const intoHostFrame = (v: { x: number; y: number; z: number }) =>
        tilt ? toParentEquator(v.x, v.y, v.z, -tilt, { x: 0, y: 0, z: 0 }) : v;
      const rHost = intoHostFrame(rRel);
      phase = circularElementsAtState(rHost, intoHostFrame(vRel));
      const rMag = Math.hypot(rHost.x, rHost.y, rHost.z);
      if (phase && rMag > 0) a_AU = rMag;
    }
  }

  const aM = a_AU * AU_M;
  const n_rad_per_s = hostMu > 0 && aM > 0 ? Math.sqrt(hostMu / (aM * aM * aM)) : undefined;

  // TWO REASONS TO LEAVE A SHIP ALONE, and asking only the first one is what let an ORBIT CHANGE slip
  // through. This used to read "already pointing at the right host -> nothing to do", which is true of
  // every high-to-low transfer ever flown: an orbit change ENDS AT THE HOST IT STARTED FROM. So the
  // radius, the placement and the epoch were never touched, and a ship that had just lowered itself to
  // 6,536 km kept a stored orbit of 767,944 km - a hundred and seventeen times out. On a map scaled to
  // the planet that orbit line is simply off the side of the screen, which is what the owner saw as
  // "parked in low orbit but no orbital line".
  //
  // (1) THE RECORD ALREADY DESCRIBES THIS ARRIVAL - host AND radius, not host alone. This is what
  //     makes the heal idempotent, so `placementHealCount` counts repairs rather than ticks.
  const near = (v: unknown, target: number) =>
    typeof v === 'number' && Math.abs(v - target) <= Math.max(1e-15, Math.abs(target) * 1e-9);
  const describesThisArrival =
    construct.parentId === hostId &&
    construct.orbit?.hostId === hostId &&
    near(construct.orbit?.elements?.a_AU, a_AU) &&
    // ...and the PHASE, or a healed ship would be re-healed on every tick and the counter would read
    // in the thousands within a minute instead of meaning what it is supposed to mean.
    (!phase || (
      near(construct.orbit?.elements?.M0_rad, phase.M0_rad) &&
      near(construct.orbit?.elements?.i_deg, phase.i_deg) &&
      near(construct.orbit?.t0, best.endMs)
    ));

  // (2) SOMEONE PUT THE SHIP THERE AFTER THE JOURNEY ENDED. An orbit whose epoch is LATER than the
  //     arrival was written by a GM who knew what they wanted, and a journey that finished before they
  //     did does not get to undo it. Without this, "heal on sight" becomes "overwrite on sight": the
  //     repair would fight a hand-placed ship on every tick and send the counter climbing, which is
  //     meant to mean something quite different.
  const t0 = construct.orbit?.t0;
  const placedSinceArrival = typeof t0 === 'number' && Number.isFinite(t0) && t0 > best.endMs;

  if (describesThisArrival || placedSinceArrival) return construct;

  // THE STAMPED VECTOR HAS TO GO WITH THE STALE ORBIT, or the repair is invisible. It is the GM's
  // frozen answer for "where is this ship right now", and `computeWorldPositions3D` prefers it OVER
  // the orbit - so a re-parented ship still hung motionless at the spot it stopped, which is the
  // visible half of [[B96]]. But only for a ship that is PARKED: a drifter's vector is the honest
  // answer (it must not snap back to an orbit it abandoned), and a ship under way is being placed by
  // the GM's tick from its journey. SystemView clears the vector on exactly this condition one step
  // earlier; matching it here is what lets the heal be correct wherever else it is called from.
  const parked = construct.flight_state !== 'Transit' && construct.flight_state !== 'Deep Space';
  const parkedFields = parked
    ? {
        vector_position_au: undefined,
        vector_epoch_ms: undefined,
        flight_state: placementKey === 'surface' ? 'Landed' : 'Orbiting'
      }
    : {};

  return {
    ...construct,
    parentId: hostId,
    placement: label,
    ...parkedFields,
    placementHealCount: (construct.placementHealCount ?? 0) + 1,
    orbit: {
      ...(construct.orbit || {}),
      hostId,
      hostMu: hostMu || construct.orbit?.hostMu,
      n_rad_per_s,
      t0: best.endMs,
      elements: { ...(construct.orbit?.elements || {}), ...(phase || {}), a_AU, e: 0 }
    }
  } as CelestialBody;
}

/**
 * IS THIS SAMPLED STATE ONE THAT NEEDS A STAMPED POSITION?
 *
 * Only a ship with nowhere to be described FROM does. In transit it is between hosts; adrift in deep
 * space it has abandoned its orbit and must not snap back to it. Parked - Orbiting, Landed, Docked -
 * it has a host and an orbit, and `reconcileConstructArrival` has written that orbit to reproduce
 * this very sampler, phase included.
 *
 * WHY IT MATTERS MORE THAN IT LOOKS. The sampler answers FOREVER: past its last arrival it returns a
 * live parking orbit, which moves. Stamping that made every arrived ship rewrite its own node several
 * times a second for the rest of the campaign, and a changed node is a changed broadcast snapshot -
 * so a player's 3D scene rebuilt about twice a second and never held still. Three reported faults,
 * one cause: models that never attached, a camera that reset every few seconds while following a
 * ship, and a ship placed at a GM instant instead of orbiting on the player's own clock.
 */
export function needsStampedPosition(state: JourneyKinematics['state'] | undefined | null): boolean {
  return state === 'Transit' || state === 'Deep Space';
}

export function countFutureJourneys(construct: CelestialBody, timeMs: number): number {
  const logs = construct.scheduled_journeys || [];
  let count = 0;
  for (const log of logs) {
    if (log.status === 'cancelled') continue;
    const bounds = getJourneyBounds(log.plans);
    if (!bounds) continue;
    if (bounds.startMs > timeMs) count += 1;
  }
  return count;
}

export function sampleJourneyKinematicsAtTime(
  system: System,
  construct: CelestialBody,
  timeMs: number
): JourneyKinematics | null {
  const logs = [...(construct.scheduled_journeys || [])].sort((a, b) => {
    const ab = getJourneyBounds(a.plans);
    const bb = getJourneyBounds(b.plans);
    return (ab?.startMs || 0) - (bb?.startMs || 0);
  });
  let candidateAfterCompletion: JourneyKinematics | null = null;

  for (const log of logs) {
    const bounds = getJourneyBounds(log.plans);
    if (!bounds) continue;

    const cancelledAtMs = log.cancelledAtSec ? Number(BigInt(log.cancelledAtSec) * 1000n) : null;
    const effectiveEndMs = cancelledAtMs === null ? bounds.endMs : Math.min(bounds.endMs, cancelledAtMs);

    if (timeMs < bounds.startMs) break;

    if (cancelledAtMs !== null && log.cancelState && timeMs >= cancelledAtMs) {
      // Adrift: coast under the star(s)' real gravity — a slow conic round the sun, not a straight line.
      // This drift only governs UNTIL a later journey begins. A ship that was stranded and then given a
      // NEW journey (logs are sorted by start, so the new one is processed later) must not stay pinned to
      // the old drift — otherwise the ship's log reads right but the orrery still shows "Adrift · coasting".
      // Stash the coast as the running candidate (like a completed journey) and keep scanning: a subsequent
      // journey that has already started overwrites it; if none has, this is what we return.
      // Deterministic conic (exact through perihelion, no step-integration drift); the old integrator is only a
      // fallback for a system with no star to fall toward.
      const coasted = coastConicAt(system, log.cancelState.position_au, log.cancelState.velocity_ms, cancelledAtMs, timeMs)
        ?? coastUnderGravity(system, log.cancelState.position_au, log.cancelState.velocity_ms, cancelledAtMs, timeMs);
      candidateAfterCompletion = {
        journeyId: log.id,
        state: 'Deep Space',
        position_au: coasted.position_au,
        velocity_ms: coasted.velocity_ms
      };
      continue;
    }

    if (timeMs > effectiveEndMs) {
      const post = samplePostJourneyState(system, log, timeMs, effectiveEndMs);
      if (post) candidateAfterCompletion = post;
      continue;
    }

    const sampled = samplePlanPathAtTime(log.plans, timeMs);
    if (sampled) {
      return {
        journeyId: log.id,
        state: 'Transit',
        position_au: sampled.position_au,
        velocity_ms: sampled.velocity_ms
      };
    }

    // Waiting between legs: hold at the origin host position.
    const firstPlan = log.plans[0];
    const originNode = system.nodes.find((n) => n.id === firstPlan.originId);
    if (originNode) {
      const s = getGlobalState(system, originNode as any, timeMs);
      return {
        journeyId: log.id,
        state: 'Transit',
        position_au: s.r,
        velocity_ms: { x: s.v.x * AU_M, y: s.v.y * AU_M, z: (s.v.z ?? 0) * AU_M }
      };
    }
  }
  return candidateAfterCompletion;
}

export function clearFutureJourneys(construct: CelestialBody, timeMs: number): CelestialBody {
  const logs = construct.scheduled_journeys || [];
  const filtered = logs.filter((log) => {
    const bounds = getJourneyBounds(log.plans);
    if (!bounds) return false;
    return bounds.startMs <= timeMs;
  });
  return { ...construct, scheduled_journeys: filtered };
}

// Trim the heavy FLOWN-past JOURNEY data of a repeat autopilot route so the committed chain (and the orrery
// it draws) stays bounded over a long run — a repeat ship tops up forever, so otherwise the past grows without
// bound (a huge journey list + a spider-web of stale paths). Keeps the last `keepFlown` autopilot legs that
// finished before ACTUAL time, plus all manual journeys, anything cancelled/adrift, and the active + future
// legs. The lightweight FLIGHT LOG is deliberately NOT trimmed — it's the permanent history (kept forever);
// only the regenerable path/journey data is dropped, and the forward advance-planning is never touched.
// Keyed off ACTUAL time so scrubbing the display never deletes. Returns the same object when nothing changed.
export function trimFlownAutopilotPast(construct: CelestialBody, actualMs: number, keepFlown = 2): CelestialBody {
  const logs = construct.scheduled_journeys || [];
  if (!logs.length) return construct;
  // Autopilot legs that have finished (relative to actual time), oldest → newest.
  const flown = logs
    .map((log) => ({ log, end: getJourneyBounds(log.plans)?.endMs ?? Infinity }))
    .filter((x) => (x.log as any).autopilot && x.log.status !== 'cancelled' && x.end < actualMs)
    .sort((a, b) => a.end - b.end);
  if (flown.length <= keepFlown) return construct;
  const drop = new Set(flown.slice(0, flown.length - keepFlown).map((x) => x.log.id));
  const kept = logs.filter((log) => !drop.has(log.id));
  if (kept.length === logs.length) return construct;
  return { ...construct, scheduled_journeys: kept }; // flight_log kept forever
}

export function cancelActiveJourney(
  system: System,
  construct: CelestialBody,
  timeMs: number,
  coast = true   // true = keep current velocity (drift on under gravity); false = stop dead (then falls)
): CelestialBody {
  const logs = construct.scheduled_journeys || [];
  let changed = false;
  const updated = logs.map((log) => {
    if (log.status === 'cancelled') return log;
    const bounds = getJourneyBounds(log.plans);
    if (!bounds) return log;
    if (timeMs < bounds.startMs || timeMs > bounds.endMs) return log;

    const sampled = samplePlanPathAtTime(log.plans, timeMs);
    const cancelState = sampled
      ? {
          position_au: sampled.position_au,
          velocity_ms: sampled.velocity_ms
        }
      : (() => {
          const first = log.plans[0];
          const originNode = system.nodes.find((n) => n.id === first.originId);
          if (!originNode) return undefined;
          const s = getGlobalState(system, originNode as any, timeMs);
          return {
            position_au: s.r,
            velocity_ms: { x: s.v.x * AU_M, y: s.v.y * AU_M, z: (s.v.z ?? 0) * AU_M }
          };
        })();

    changed = true;
    // "Stop dead" zeroes the velocity at the cut point; the gravity coast then takes over from rest
    // (it falls toward the star). "Drift" keeps the current velocity (coasts on along its arc).
    const finalCancelState = cancelState && !coast
      ? { ...cancelState, velocity_ms: { x: 0, y: 0 } }
      : cancelState;
    return {
      ...log,
      status: 'cancelled',
      cancelledAtSec: BigInt(Math.floor(timeMs / 1000)).toString(),
      cancelState: finalCancelState
    };
  });

  if (!changed) return construct;
  return { ...construct, scheduled_journeys: updated };
}

function samplePlanPathAtTime(
  plans: TransitPlan[],
  timeMs: number
): { position_au: Vector2; velocity_ms: { x: number; y: number } } | null {
  for (const plan of plans) {
    const planEndMs = plan.startTime + (plan.totalTime_days * 86400 * 1000);
    if (timeMs < plan.startTime || timeMs > planEndMs) continue;
    for (const segment of plan.segments) {
      if (timeMs < segment.startTime || timeMs > segment.endTime) continue;
      // ONE reader for 'where is the ship at t' (transit/pathSampling.ts). It brackets the query by
      // the samples' OWN times rather than assuming they are evenly spaced — the assumption that put
      // the ship at the wrong moment for the whole of a burn, and that three other call sites were
      // independently making with their own arithmetic.
      const hit = samplePathAtTime(segment, timeMs);
      if (!hit) continue;
      return hit;
    }
  }
  return null;
}

// First moment at/after `fromMs` at which `construct` is under thrust exceeding `accelCap_ms2`, scanning its
// committed journey segments (Accel/Brake Δv ÷ duration). Null if it never out-pulls the cap. Pure function
// of the journey data, so the formation-break moment is deterministic and scrub-safe.
function firstThrustAboveMs(construct: any, fromMs: number, accelCap_ms2: number): number | null {
  let earliest: number | null = null;
  for (const log of (construct?.scheduled_journeys ?? []) as any[]) {
    if (log.status === 'cancelled') continue;
    for (const plan of log.plans ?? []) {
      for (const seg of plan.segments ?? []) {
        if (seg.type !== 'Accel' && seg.type !== 'Brake') continue;
        if (!(seg.endTime > fromMs)) continue;
        const durSec = (seg.endTime - seg.startTime) / 1000;
        if (!(durSec > 0)) continue;
        const dvx = ((seg.endState?.v?.x ?? 0) - (seg.startState?.v?.x ?? 0)) * AU_M;
        const dvy = ((seg.endState?.v?.y ?? 0) - (seg.startState?.v?.y ?? 0)) * AU_M;
        const accel = Math.hypot(dvx, dvy) / durSec;
        if (accel > accelCap_ms2) {
          const at = Math.max(seg.startTime, fromMs);
          if (earliest === null || at < earliest) earliest = at;
        }
      }
    }
  }
  return earliest;
}

/** IS THIS PLAN A PASS-THROUGH RATHER THAN AN ARRIVAL? Exported because the MAP has to ask the same
 *  question the flight does: the sampler uses it to decide whether the ship coasts on past its
 *  destination or parks there, and `drawTransitPlan` uses it to decide whether the path ends in a
 *  stop marker or carries on past the target. Two answers to that would be a picture that lies about
 *  what the ship is going to do. A flyby still BRAKES — it sheds speed to reach its intercept
 *  velocity — so the brake segment is not the tell; the intercept speed is. */
export function isFlybyPlan(plan: { interceptSpeed_ms?: number; segments?: Array<{ warnings?: string[] }> }): boolean {
  return (plan.interceptSpeed_ms || 0) > 0 ||
    (plan.segments ?? []).some((s) => (s.warnings || []).includes('Flyby'));
}

function samplePostJourneyState(
  system: System,
  log: { id: string; plans: TransitPlan[] },
  timeMs: number,
  completedAtMs: number
): JourneyKinematics | null {
  if (!log.plans || log.plans.length === 0) return null;
  const lastPlan = log.plans[log.plans.length - 1];
  const lastSeg = lastPlan.segments[lastPlan.segments.length - 1];
  const lastPts = lastSeg?.pathPoints || [];
  const finalPos = lastPts.length > 0 ? lastPts[lastPts.length - 1] : null;
  const isExplicitDockToConstruct = !!(lastPlan.arrivalPlacement && lastPlan.arrivalPlacement === lastPlan.targetId);
  const isFlybyIntent = isFlybyPlan(lastPlan);

  // If arrival is a flyby/deep-space pass, continue inertial drift from final path tangent.
  if (isFlybyIntent && finalPos) {
    let velMs = { x: 0, y: 0, z: 0 };
    if (lastPts.length >= 2) {
      const p0 = lastPts[lastPts.length - 2];
      const p1 = lastPts[lastPts.length - 1];
      const segDurationSec = Math.max(1e-6, (lastSeg.endTime - lastSeg.startTime) / 1000);
      const sampleDt = segDurationSec / Math.max(1, lastPts.length - 1);
      velMs = {
        x: ((p1.x - p0.x) * AU_M) / sampleDt,
        y: ((p1.y - p0.y) * AU_M) / sampleDt,
        z: (((p1.z ?? 0) - (p0.z ?? 0)) * AU_M) / sampleDt
      };
    }
    const dtSec = Math.max(0, (timeMs - completedAtMs) / 1000);
    return {
      journeyId: log.id,
      state: 'Deep Space',
      position_au: {
        x: finalPos.x + ((velMs.x / AU_M) * dtSec),
        y: finalPos.y + ((velMs.y / AU_M) * dtSec),
        z: (finalPos.z ?? 0) + ((velMs.z / AU_M) * dtSec)
      },
      velocity_ms: velMs
    };
  }

  // Captured arrivals: follow the destination body/construct global motion.
  const targetNode = system.nodes.find((n) => n.id === lastPlan.targetId);
  if (targetNode) {
    if (targetNode.kind === 'construct' && !isExplicitDockToConstruct && finalPos) {
      // It's a Rendezvous/Brake Burn with a Construct, but not a hard Dock: formation flying — the escort
      // mirrors its charge, trailing along the velocity vector by the km standoff (0 = wingtip formation).
      // CAPABILITY CHECK: formation only holds while the charge doesn't out-accelerate the escort. The plan
      // carries the escort's own thrust ceiling (escortMaxAccel_ms2, +5% grace so identical ships never
      // flap); the first committed charge burn above it BREAKS formation at that moment — the escort keeps
      // the matched state it had right then and coasts (deterministic patched conic), visibly left behind,
      // until the autopilot top-up commits a fresh chase.
      const formationStandoff = (s: { r: Vector2; v: Vector2 }) => {
        let px = s.r.x, py = s.r.y, pz = s.r.z ?? 0;
        const standKm = (lastPlan as any).escortStandoffKm || 0;
        const vmag = Math.hypot(s.v.x, s.v.y, s.v.z ?? 0);
        if (standKm > 0 && vmag > 1e-18) {
          const offAu = standKm / AU_KM;
          px -= (s.v.x / vmag) * offAu;
          py -= (s.v.y / vmag) * offAu;
          pz -= ((s.v.z ?? 0) / vmag) * offAu;
        }
        return { x: px, y: py, z: pz };
      };
      const cap = (lastPlan as any).escortMaxAccel_ms2;
      const breakMs = cap && cap > 0 ? firstThrustAboveMs(targetNode, completedAtMs, cap) : null;
      if (breakMs !== null && timeMs >= breakMs) {
        // LEFT BEHIND — freeze the formation state at the break moment and coast from there.
        const sB = getGlobalState(system, targetNode as any, breakMs);
        const posB = formationStandoff(sB);
        const velB = { x: sB.v.x * AU_M, y: sB.v.y * AU_M, z: (sB.v.z ?? 0) * AU_M };
        const coasted = coastConicAt(system, posB, velB, breakMs, timeMs)
          ?? coastUnderGravity(system, posB, velB, breakMs, timeMs);
        return { journeyId: log.id, state: 'Deep Space', position_au: coasted.position_au, velocity_ms: coasted.velocity_ms };
      }
      const s = getGlobalState(system, targetNode as any, timeMs);
      return {
        journeyId: log.id,
        state: 'Deep Space', // Matches Construct Rendezvous behavior
        position_au: formationStandoff(s),
        velocity_ms: { x: s.v.x * AU_M, y: s.v.y * AU_M, z: (s.v.z ?? 0) * AU_M }
      };
    }

    if (lastPlan.arrivalPlacement) {
      const isLagrange = LAGRANGE_POINT_IDS.includes(lastPlan.arrivalPlacement as LagrangePointId);
      if (isLagrange && (targetNode as any).orbit && targetNode.parentId) {
        // G43 P4: the point the ship is parked at is the SAME point the solver flew to — both come
        // from deriveCoOrbitalOrbit. Before this, the sampler rotated the target's ellipse rigidly
        // while the solver shifted its mean anomaly, so an eccentric arrival jumped up to ~0.5 AU
        // (and gained a several-km/s velocity step) at the instant the journey completed.
        const lagrangeHost = system.nodes.find((n) => n.id === targetNode.parentId);
        const lagrangeHostMassKg = lagrangeHost
          ? (((lagrangeHost as any).kind === 'barycenter'
              ? (lagrangeHost as any).effectiveMassKg
              : (lagrangeHost as any).massKg) || 0)
          : 0;
        const pointOrbit = deriveCoOrbitalOrbit(
          targetNode as any,
          lagrangeHostMassKg,
          lastPlan.arrivalPlacement as LagrangePointId
        );
        if (pointOrbit) {
          const synthNode = {
            id: 'synth-lpoint',
            kind: 'body',
            parentId: targetNode.parentId,
            orbit: pointOrbit
          };
          const lPointGlobal = getGlobalState(system, synthNode as any, timeMs);
          return {
            journeyId: log.id,
            state: 'Orbiting',
            position_au: lPointGlobal.r,
            velocity_ms: { x: lPointGlobal.v.x * AU_M, y: lPointGlobal.v.y * AU_M, z: (lPointGlobal.v.z ?? 0) * AU_M }
          };
        }
      }
    }

    // Captured arrival. Surface/Dock snap to the target centre. For an orbital
    // arrival, give the ship a real circular PARKING ORBIT that actually revolves
    // over time (this sampler is re-evaluated every tick, so the ship goes round
    // the planet and future-transit origins read its true orbiting state) rather
    // than locking it to the planet's centre.
    const s = getGlobalState(system, targetNode as any, timeMs);
    const placement = lastPlan.arrivalPlacement;
    const t: any = targetNode;
    const state = placement === 'surface' ? 'Landed' : (targetNode.kind === 'construct' ? 'Docked' : 'Orbiting');

    // G53 PHASE 5 - A JOURNEY THAT ENDS DOCKED TO A STRUCTURE parks the ship ON the structure: at
    // the level it aimed for (a ladder), or the nearest point of the rim it reached (anywhere),
    // riding the structure's own turn from then on. The SAME docking.ts arithmetic the propagator
    // uses for an authored attachment, so the GM map, the holo and the player views agree
    // (design 7c). The flight was solved to the HOST at the level's radius; this is the hand-over
    // from "arrived at that radius" to "attached at that radius" - a snap of at most the ribbon's
    // bearing, and `dockMatchSpeedMs` is what the planner says it costs.
    const dock = lastPlan.arrivalDock;
    if (dock) {
      const structure = system.nodes.find((n) => n.id === dock.structureId) as any;
      const hostNode = structure ? (system.nodes.find((n) => n.id === structure.parentId) as any) : undefined;
      if (structure && hostNode) {
        const kind = dockingOf(structure);
        let att: Attachment | null = null;
        if (kind === 'ladder') att = { id: structure.id, level: dock.level ?? 'geo' };
        else if (kind === 'anywhere' && finalPos) {
          const hostThen = getGlobalState(system, hostNode, completedAtMs);
          att = nearestAttachment(structure, hostNode,
            { x: finalPos.x - hostThen.r.x, y: finalPos.y - hostThen.r.y, z: (finalPos.z ?? 0) - (hostThen.r.z ?? 0) },
            completedAtMs, system);
        } else att = { id: structure.id };
        const off = att ? attachedOffsetAu(att, structure, hostNode, timeMs, system) : null;
        const base = off ? getGlobalState(system, hostNode, timeMs) : getGlobalState(system, structure, timeMs);
        const pos = off
          ? { x: base.r.x + off.x, y: base.r.y + off.y, z: (base.r.z ?? 0) + off.z }
          : base.r;
        return {
          journeyId: log.id,
          state: 'Docked',
          position_au: pos,
          velocity_ms: { x: base.v.x * AU_M, y: base.v.y * AU_M, z: (base.v.z ?? 0) * AU_M }
        };
      }
    }

    if (state === 'Orbiting') {
      const targetRadiusKm = t.radiusKm || 1000;
      const targetMassKg = t.massKg || t.effectiveMassKg || 0;
      // Parking-orbit radius: the derived one, the same figure the planner offered and the solver
      // aimed at. The fallback is only for a placement this body cannot actually support.
      const parkingRadiusKm = parkingOrbitRadiusKm(t, placement, undefined, system) ?? targetRadiusKm * 1.3;
      const aAU = parkingRadiusKm / AU_KM;
      const aM = parkingRadiusKm * 1000;
      const G_CONST = 6.6743e-11;
      const mu = G_CONST * targetMassKg;
      const n = mu > 0 && aM > 0 ? Math.sqrt(mu / (aM * aM * aM)) : 0; // mean motion, rad/s
      // THE PARKING ORBIT STARTS WHERE THE FLIGHT ENDED, IN THE PLANE THE SHIP ARRIVED ON.
      //
      // It used to be a circle in the reference plane, phased by a HASH OF THE JOURNEY'S ID —
      // deterministic, so re-sampling never jumped the ship, but unrelated to where the ship actually
      // got to. The flight therefore ended at the approach bearing and the parking began at an
      // arbitrary one, and the ship stepped across the orbit at the completion instant: measured at
      // 90,884 km on a Jupiter low orbit ([[B92]]).
      //
      // The circle is now built on two axes taken from the arrival itself — `u` toward the point the
      // flight ended at, `w` along the velocity it ended with — so at theta = 0 the ship is exactly
      // where its path left it, moving exactly as its last burn left it moving. Both position and
      // velocity close, and by construction: `resolveDesiredArrivalRelative` aims the arrival burn at
      // the circular velocity PERPENDICULAR to the radius, which is this orbit's velocity at this
      // bearing. That is the same device G43 P4 used on the Lagrange arrivals — one convention read
      // from both sides — rather than two derivations that have to be kept in step by hand.
      //
      // It also means a ship that came in from out of the plane STAYS out of it, instead of being
      // flattened onto the reference plane the moment it arrived.
      const hostAtArrival = getGlobalState(system, targetNode as any, completedAtMs);
      const norm = (v: { x: number; y: number; z: number }) => {
        const m = Math.hypot(v.x, v.y, v.z);
        return m > 1e-18 ? { x: v.x / m, y: v.y / m, z: v.z / m } : null;
      };
      let u = finalPos
        ? norm({ x: finalPos.x - hostAtArrival.r.x, y: finalPos.y - hostAtArrival.r.y, z: (finalPos.z ?? 0) - (hostAtArrival.r.z ?? 0) })
        : null;
      if (!u) {
        // No path to read: fall back to the reference plane, which is what this always did.
        let h = 0;
        for (let i = 0; i < log.id.length; i++) h = (h + log.id.charCodeAt(i) * 0.137) % (2 * Math.PI);
        u = { x: Math.cos(h), y: Math.sin(h), z: 0 };
      }
      // `w` completes the plane: the arrival velocity with its radial part removed. A purely radial
      // arrival leaves nothing to follow, so take the in-plane perpendicular instead.
      const arrV = lastSeg?.endState?.v;
      let w: { x: number; y: number; z: number } | null = null;
      if (arrV) {
        const rel = {
          x: arrV.x - hostAtArrival.v.x,
          y: arrV.y - hostAtArrival.v.y,
          z: (arrV.z ?? 0) - (hostAtArrival.v.z ?? 0)
        };
        const radial = rel.x * u.x + rel.y * u.y + rel.z * u.z;
        w = norm({ x: rel.x - u.x * radial, y: rel.y - u.y * radial, z: rel.z - u.z * radial });
      }
      if (!w) w = norm({ x: -u.y, y: u.x, z: 0 }) ?? { x: 0, y: 0, z: 1 };
      const theta = n * ((timeMs - completedAtMs) / 1000);
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const vTanAuSec = n * aAU; // tangential orbital speed, AU/s
      return {
        journeyId: log.id,
        state: 'Orbiting',
        position_au: {
          x: s.r.x + aAU * (u.x * cos + w.x * sin),
          y: s.r.y + aAU * (u.y * cos + w.y * sin),
          z: (s.r.z ?? 0) + aAU * (u.z * cos + w.z * sin)
        },
        velocity_ms: {
          x: (s.v.x + vTanAuSec * (-u.x * sin + w.x * cos)) * AU_M,
          y: (s.v.y + vTanAuSec * (-u.y * sin + w.y * cos)) * AU_M,
          z: ((s.v.z ?? 0) + vTanAuSec * (-u.z * sin + w.z * cos)) * AU_M
        }
      };
    }

    // Landed / Docked: snap to the target centre.
    return {
      journeyId: log.id,
      state,
      position_au: s.r,
      velocity_ms: { x: s.v.x * AU_M, y: s.v.y * AU_M, z: (s.v.z ?? 0) * AU_M }
    };
  }

  if (!finalPos) return null;
  return {
    journeyId: log.id,
    state: 'Orbiting',
    position_au: finalPos,
    velocity_ms: { x: 0, y: 0, z: 0 }
  };
}
