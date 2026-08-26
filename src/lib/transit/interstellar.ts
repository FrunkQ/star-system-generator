// Resolving an in-flight interstellar journey to an end state. Pure Starmap → Starmap transforms so
// they're easy to test and can't half-mutate live data. A journey's construct lives in its origin
// system until it's resolved; these three functions decide where it ends up:
//   - endJourneyAtSource:      cancel — it never left, stays in the origin system.
//   - endJourneyAtDestination: it arrives — relocate the construct into the destination system.
//   - strandJourney:           end mid-flight — pull it out into interstellar space (adrift).
import type { Starmap, ActiveJourney, CelestialBody, AdriftConstruct, ID } from '$lib/types';
import { G, SOLAR_MASS_KG, AU_KM } from '$lib/constants';
import { hyperbolicFlyby } from '$lib/physics/flyby';
import { distanceToMeters } from '$lib/interstellar/transit';
import { mapSeparation, posZ, zCounts } from '$lib/map/systemDistance';

const AU_M = AU_KM * 1000;
const isStarNode = (n: any) =>
  n?.roleHint === 'star' || (Array.isArray(n?.classes) && n.classes.some((c: string) => String(c).startsWith('star/')));

// Stage 3 — a fly-by that can't stop whips around the destination star (an honest 2-body slingshot).
// Returns the signed turn (radians) to rotate the post-arrival drift by, 0 when there's nothing to wrap
// (a deep-space point target, no star, or degenerate maths). The ship aimed at a body whose solar
// distance is the periapsis; by arrival that body has moved on, so the ship reaches that radius and
// slings round the star. Negligible for a normal star at interstellar speed, real for a black hole or a
// slow craft — exactly what the physics gives.
const GRAZE_AU = 0.02; // a star-aimed pass (no specific body) grazes this close — "very close to the sun"
export function flybyTurn(
  starmap: Starmap,
  j: ActiveJourney,
  from: { x: number; y: number },
  to: { x: number; y: number }
): number {
  if (j.toX != null && j.toY != null) return 0; // deep-space point target — no central mass to wrap
  const dest = starmap.systems.find((s) => s.id === j.toSystemId);
  const nodes = dest?.system?.nodes ?? [];
  let starMassKg = 0;
  for (const n of nodes) if (isStarNode(n)) starMassKg = Math.max(starMassKg, (n as any).massKg || 0);
  if (!(starMassKg > 0)) return 0;
  let a_AU = 0;
  if (j.toBodyId) {
    const body = nodes.find((n) => n.id === j.toBodyId) as any;
    a_AU = body?.orbit?.elements?.a_AU || 0;
  }
  const rp_m = Math.max(a_AU, GRAZE_AU) * AU_M;
  // WS7: separation counts DEPTH (unless the campaign opted out) — this feeds the scalar cruise speed,
  // so the 3D magnitude is the right input. Shared module keeps it consistent with route/measure.
  const coordDist = mapSeparation(to, from, !zCounts(starmap));
  const dur = j.durationSec || 0;
  if (!(coordDist > 0) || !(dur > 0)) return 0;
  const vinf = distanceToMeters(coordDist, starmap.distanceUnit) / dur; // m/s, outside-observer cruise speed
  const turn = hyperbolicFlyby([vinf, 0], rp_m, G * starMassKg).turn;
  // Vary the wrap side per ship so a fleet doesn't all bend identically.
  const side = (j.shipId || '').length % 2 === 0 ? 1 : -1;
  return side * turn;
}

// --- Derive-from-clock placement -----------------------------------------------------------------
// Where a construct *appears* at a given game time, derived purely from its interstellar journey
// record + the clock (no mutation). The same evaluator backs rendering, the routes panel, and (later)
// autopilot. Persistent node moves are a separate reconcile step, keyed to ACTUAL time.
// WS7 depth: a placement carries `z` wherever it is EXACTLY derivable — the endpoints of an
// interstellar hop are systems with a known depth, and the path between them is a straight line, so the
// depth at fraction f is the same lerp as x and y. It is optional because a POINT origin/destination
// (`fromX/fromY`, `toX/toY` — a course replotted from where an adrift ship sits) records no depth at
// all: the journey schema has no fromZ/toZ, so there is nothing honest to report and `posZ` reads the
// absent value as the reference plane. Note what is deliberately NOT here: a coasting drift keeps the
// depth it had when it was stranded and does not gain more. Giving the drift a vz would mean deciding
// how the slingshot deflection (a planar rotation of vx/vy, below) behaves out of the plane, which is a
// transit-physics question and not a display one.
export type ConstructPlacement =
  | { kind: 'system'; systemId: ID }
  | { kind: 'transit'; fromSystemId: ID; toSystemId: ID; x: number; y: number; z?: number; frac: number }
  | { kind: 'adrift'; x: number; y: number; z?: number; vx?: number; vy?: number; fromSystemId?: ID; toSystemId?: ID };

// Whether a journey's drive coasts (keeps momentum) when interrupted, vs stops dead. A jump/gate/field
// drive just stops; anything with real momentum (relativistic, torch, sublight…) keeps drifting.
function coasts(mode: string | undefined): boolean { return !/jump|gate|warp|hyper/i.test(mode || ''); }

// The journey's effective end (early GM resolution wins over the natural arrival time), in game seconds.
export function journeyEffectiveEndSec(j: ActiveJourney): number {
  const start = Number(j.startTimeSec || 0);
  const natural = start + (j.durationSec || 0);
  const ended = j.endedAtSec != null ? Number(j.endedAtSec) : natural;
  return Math.min(natural, ended);   // can't "end" after it would have naturally arrived
}
// Progress 0..1 at a given game time (clamped; uses the natural duration as the scale).
function fracAt(j: ActiveJourney, sec: number): number {
  const start = Number(j.startTimeSec || 0);
  const dur = j.durationSec || 0;
  if (dur <= 0) return 1;
  return Math.max(0, Math.min(1, (Math.min(sec, journeyEffectiveEndSec(j)) - start) / dur));
}
const sysPos = (s: Starmap, id?: ID) => s.systems.find((x) => x.id === id)?.position;

// Resolve where a construct is at a display time. Looks at its live journey first, then the adrift
// list, then falls back to whichever system actually holds its node.
export function constructDisplayPlacement(starmap: Starmap, constructId: ID, displaySec: number): ConstructPlacement {
  const j = (starmap.activeJourneys ?? []).find((x) => x.shipId === constructId);
  if (j) {
    // A POINT origin (e.g. a course replotted from where an adrift ship sits) overrides the origin system.
    const pointOrigin = j.fromX != null && j.fromY != null;
    const from = pointOrigin ? { x: j.fromX as number, y: j.fromY as number } : sysPos(starmap, j.fromSystemId);
    // A POINT destination (e.g. a stranded ship) overrides the destination system's position.
    const pointTarget = j.toX != null && j.toY != null;
    const to = pointTarget ? { x: j.toX as number, y: j.toY as number } : sysPos(starmap, j.toSystemId);
    const start = Number(j.startTimeSec || 0);
    const endSec = journeyEffectiveEndSec(j);
    if (from && to) {
      // Depth of the two ends. `posZ` is the one reader of an absent z (= the reference plane), so a
      // point override with no recorded depth behaves the same here as it does in every distance.
      const fz = posZ(from), tz = posZ(to);
      // Before departure: in the origin system, or adrift at the point it's being replotted from.
      if (displaySec < start) return pointOrigin
        ? { kind: 'adrift', x: from.x, y: from.y, z: fz, fromSystemId: j.fromSystemId, toSystemId: j.toSystemId }
        : { kind: 'system', systemId: j.fromSystemId };
      if (displaySec < endSec) {
        const f = fracAt(j, displaySec);
        return { kind: 'transit', fromSystemId: j.fromSystemId, toSystemId: j.toSystemId, x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f, z: fz + (tz - fz) * f, frac: f };
      }
      // Ended: outcome decides the resting place.
      const outcome = j.outcome ?? 'arrive';
      if (outcome === 'return') return pointOrigin
        ? { kind: 'adrift', x: from.x, y: from.y, z: fz, fromSystemId: j.fromSystemId, toSystemId: j.toSystemId }
        : { kind: 'system', systemId: j.fromSystemId };
      if (outcome === 'strand') {
        const f = fracAt(j, endSec);
        const sx = from.x + (to.x - from.x) * f, sy = from.y + (to.y - from.y) * f;
        const sz = fz + (tz - fz) * f;
        // Coast on in a straight line, or stop dead. The GM's explicit choice (strandCoast) wins; otherwise
        // the drive mode decides (momentum drives coast, jump/field drives stop).
        if ((j.strandCoast ?? coasts(j.mode)) && (j.durationSec || 0) > 0) {
          const vx = (to.x - from.x) / j.durationSec, vy = (to.y - from.y) / j.durationSec;
          const dt = displaySec - endSec;
          // Depth is held at the strand point, not extrapolated — see the note on ConstructPlacement.
          return { kind: 'adrift', x: sx + vx * dt, y: sy + vy * dt, z: sz, vx, vy, fromSystemId: j.fromSystemId, toSystemId: j.toSystemId };
        }
        return { kind: 'adrift', x: sx, y: sy, z: sz, fromSystemId: j.fromSystemId, toSystemId: j.toSystemId };
      }
      // Natural end (no explicit GM resolution): a "realistic" plan that couldn't brake reaches the
      // destination but coasts ON past it — a fly-by that becomes adrift with velocity. (A GM who forces
      // 'arrive' via the panel overrides this and stops it there.)
      if (j.outcome == null && j.cannotStop && (j.durationSec || 0) > 0) {
        let vx = (to.x - from.x) / j.durationSec, vy = (to.y - from.y) / j.durationSec;
        // Slingshot: whip the onward drift around the destination star (honest 2-body deflection).
        const turn = flybyTurn(starmap, j, from, to);
        if (turn) {
          const c = Math.cos(turn), s = Math.sin(turn);
          [vx, vy] = [vx * c - vy * s, vx * s + vy * c];
        }
        const dt = displaySec - endSec;
        return { kind: 'adrift', x: to.x + vx * dt, y: to.y + vy * dt, z: tz, vx, vy, fromSystemId: j.fromSystemId, toSystemId: j.toSystemId };
      }
      // Arrived: at a point destination it rendezvouses there (sits adrift at the spot — e.g. reaching a
      // stranded ship); at a system it's in that system.
      if (pointTarget) return { kind: 'adrift', x: to.x, y: to.y, z: tz, fromSystemId: j.fromSystemId, toSystemId: j.toSystemId };
      return { kind: 'system', systemId: j.toSystemId };   // arrive
    }
  }
  const adrift = (starmap.adriftConstructs ?? []).find((a) => a.construct?.id === constructId);
  if (adrift) {
    const vx = adrift.vx ?? 0, vy = adrift.vy ?? 0;
    const t0 = Number(adrift.t0Sec ?? adrift.strandedAtSec ?? displaySec);
    const dt = (vx || vy) ? displaySec - t0 : 0;   // stationary unless it has a drift velocity
    // No z: `AdriftConstruct` stores only x/y, so a ship stranded in interstellar space has no recorded
    // depth to report. Reads as the reference plane, like any absent z.
    return { kind: 'adrift', x: adrift.x + vx * dt, y: adrift.y + vy * dt, vx, vy, fromSystemId: adrift.fromSystemId, toSystemId: adrift.toSystemId };
  }
  const holding = starmap.systems.find((s) => (s.system?.nodes ?? []).some((n) => n.id === constructId));
  return { kind: 'system', systemId: holding?.id ?? '' };
}

// Construct ids that are currently INTERSTELLAR at a display time — in transit OR stranded/adrift. While
// interstellar a ship belongs to no system map (its node still physically lives in its origin system, but
// it must not be shown there); it appears only at starmap level. Shared by the system-view hide, the
// transit destination chooser, and the find-by-tag scope.
export function interstellarConstructIds(starmap: Starmap, displaySec: number): Set<ID> {
  const out = new Set<ID>();
  for (const j of starmap.activeJourneys ?? []) {
    const p = constructDisplayPlacement(starmap, j.shipId, displaySec);
    if (p.kind === 'transit' || p.kind === 'adrift') out.add(j.shipId);
  }
  for (const a of starmap.adriftConstructs ?? []) if (a.construct?.id) out.add(a.construct.id);
  return out;
}

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const findJourney = (s: Starmap, id: string) => (s.activeJourneys ?? []).find((j) => j.id === id);
const dropJourney = (s: Starmap, id: string): Starmap => ({ ...s, activeJourneys: (s.activeJourneys ?? []).filter((j) => j.id !== id) });

// The construct node + where it sits (its origin system). null if we can't find it.
function locateShip(starmap: Starmap, journey: ActiveJourney) {
  const sysNode = starmap.systems.find((s) => s.id === journey.fromSystemId);
  const nodes = sysNode?.system?.nodes;
  if (!nodes) return null;
  const idx = nodes.findIndex((n) => n.id === journey.shipId);
  return idx < 0 ? null : { sysNode, idx, node: nodes[idx] as CelestialBody };
}

// Cancel: the construct never actually left its origin system, so just drop the journey.
export function endJourneyAtSource(starmap: Starmap, journeyId: string): Starmap {
  return dropJourney(starmap, journeyId);
}

// Arrive: move the construct node into the destination system, re-hosted on the target body (or the
// destination's primary star), then drop the journey.
// A SENSIBLE ARRIVAL ORBIT, because the ship's OLD elements mean nothing around a new star.
//
// Arrival used to keep whatever `a_AU` the ship had in the system it left, so a ship that departed a
// 0.002 AU moon orbit arrived 0.002 AU from a star — inside the corona — while one leaving a wide
// orbit arrived implausibly far out. The elements were never updated because only the HOST was.
//
// The rule follows what the GM actually chose as the destination:
//   a NAMED BODY  -> a high parking orbit around it, the same 4x-radius the in-system 'ho' arrival
//                    uses, so arriving from interstellar space and arriving from next door agree.
//   a STAR/BARYCENTRE (the default when no body was named) -> the SYSTEM EDGE, just beyond the
//                    outermost thing orbiting it, which is where a starship decelerating into a
//                    system actually finds itself rather than materialising among the planets.
//   nothing to measure -> a distance scaled off the host itself, so it is at least proportionate.
function arrivalOrbitAU(host: any, nodes: any[]): number {
  const hostRadiusAU = ((host?.radiusKm || 0) * 1) / AU_KM;
  const isCentral = host?.roleHint === 'star' || host?.kind === 'barycenter' || host?.parentId == null;
  if (!isCentral && hostRadiusAU > 0) return hostRadiusAU * 4;      // high parking orbit
  let outermost = 0;
  for (const n of nodes) {
    if (n?.id === host?.id || n?.parentId !== host?.id) continue;
    const a = n?.orbit?.elements?.a_AU || 0;
    const e = Math.max(0, Math.min(0.999, n?.orbit?.elements?.e || 0));
    if (a > 0) outermost = Math.max(outermost, a * (1 + e));
  }
  if (outermost > 0) return outermost * 1.1;                        // the system edge
  return Math.max(0.1, hostRadiusAU * 100);                         // bare star: proportionate
}


export function endJourneyAtDestination(starmap: Starmap, journeyId: string): Starmap {
  const journey = findJourney(starmap, journeyId);
  if (!journey) return starmap;
  const loc = locateShip(starmap, journey);
  const destNode = starmap.systems.find((s) => s.id === journey.toSystemId);
  if (!loc || !destNode?.system?.nodes) return dropJourney(starmap, journeyId);
  const dest = destNode.system.nodes as CelestialBody[];
  const host =
    (journey.toBodyId && dest.find((n) => n.id === journey.toBodyId)) ||
    dest.filter((n) => n.roleHint === 'star').sort((a, b) => (b.massKg || 0) - (a.massKg || 0))[0] ||
    dest[0];

  const ship = clone(loc.node);

  // LEAVE THE OLD SYSTEM'S SITUATION BEHIND, or the ship arrives and draws where it used to be.
  //
  // Re-parenting and rewriting hostId is not enough, because two of these fields OUTRANK `orbit` at
  // render time: `worldPositions` places a construct that has journeys by its kinematics sampler,
  // and `getGlobalState` prefers a stored vector while `flight_state` is Transit or Deep Space. Both
  // still described the system it just left — a completed journey names bodies that are not here, and
  // a cached vector is a position in another star's frame — so the ship rendered at the old
  // coordinates however correct its new orbit was. `ConstructSidePanel`'s SITUATION_FIELDS comment
  // records exactly this failure for the IMPORT path; interstellar arrival is the same move between
  // systems and was missed. The flight LOG is deliberately kept: it is the ship's history, not its
  // position. The autopilot goes because its route names places in the system it has left.
  delete (ship as any).vector_position_au;
  delete (ship as any).vector_velocity_ms;
  delete (ship as any).vector_epoch_ms;
  delete (ship as any).coOrbital;          // its secondary is in the other system
  delete (ship as any).placement;          // 'L4' etc. described a body that is not here
  delete (ship as any).ui_parentId;
  delete (ship as any).autopilot;
  delete (ship as any).autopilotStuckReason;
  (ship as any).scheduled_journeys = [];
  (ship as any).draft_transit_plan = [];
  (ship as any).flight_state = 'Orbiting';

  if (host) {
    ship.parentId = host.id;
    ship.orbit = {
      ...(ship.orbit || {}),
      hostId: host.id,
      hostMu: G * (host.massKg || SOLAR_MASS_KG),
      t0: ship.orbit?.t0 ?? 0,
      // FRESH elements sized on the destination — never the old system's (see arrivalOrbitAU).
      // Circular and in-plane: an arriving ship has just spent its budget matching this system, and
      // an inherited eccentricity or inclination would be a leftover from another star's geometry.
      elements: {
        a_AU: arrivalOrbitAU(host, dest),
        e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0,
        // Spread arrivals around the circle deterministically rather than stacking every ship on
        // the same spoke — seeded on the ship's id, so a reload puts it back in the same place.
        M0_rad: [...String(ship.id ?? '')].reduce((h, c) => (h + c.charCodeAt(0) * 0.137) % (2 * Math.PI), 0)
      }
    } as any;
    delete (ship.orbit as any).n_rad_per_s;   // a pinned rate from the old system's geometry
  }

  const systems = starmap.systems.map((s) => {
    if (s.id === journey.fromSystemId) return { ...s, system: { ...s.system, nodes: s.system.nodes.filter((_, i) => i !== loc.idx) } };
    if (s.id === journey.toSystemId) return { ...s, system: { ...s.system, nodes: [...s.system.nodes, ship] } };
    return s;
  });
  return { ...starmap, systems, activeJourneys: (starmap.activeJourneys ?? []).filter((j) => j.id !== journeyId) };
}

// Strand: pull the construct out of its system and park it adrift at the interstellar point it had
// reached (a lerp of the two systems' positions by frac 0..1), then drop the journey.
export function strandJourney(starmap: Starmap, journeyId: string, frac: number, atSec?: string): Starmap {
  const journey = findJourney(starmap, journeyId);
  if (!journey) return starmap;
  const loc = locateShip(starmap, journey);
  const fromSys = starmap.systems.find((s) => s.id === journey.fromSystemId);
  const toSys = starmap.systems.find((s) => s.id === journey.toSystemId);
  if (!loc || !fromSys || !toSys) return dropJourney(starmap, journeyId);

  const f = Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0.5));
  // A momentum drive keeps coasting from the strand point at its transit velocity (units per game-second);
  // a jump/field drive stops dead (no velocity stored).
  const coast = (journey.strandCoast ?? coasts(journey.mode)) && (journey.durationSec || 0) > 0;
  const adrift: AdriftConstruct = {
    construct: clone(loc.node),
    x: fromSys.position.x + (toSys.position.x - fromSys.position.x) * f,
    y: fromSys.position.y + (toSys.position.y - fromSys.position.y) * f,
    fromSystemId: journey.fromSystemId,
    toSystemId: journey.toSystemId,
    strandedAtSec: atSec,
    ...(coast ? {
      vx: (toSys.position.x - fromSys.position.x) / journey.durationSec,
      vy: (toSys.position.y - fromSys.position.y) / journey.durationSec,
      t0Sec: atSec
    } : {})
  };
  const systems = starmap.systems.map((s) =>
    s.id === journey.fromSystemId ? { ...s, system: { ...s.system, nodes: s.system.nodes.filter((_, i) => i !== loc.idx) } } : s
  );
  return {
    ...starmap,
    systems,
    adriftConstructs: [...(starmap.adriftConstructs ?? []), adrift],
    activeJourneys: (starmap.activeJourneys ?? []).filter((j) => j.id !== journeyId)
  };
}

// A construct that coasted BEYOND its star's Hill limit has left the system — turn its in-system kinematic
// state into an interstellar AdriftConstruct at the departure system's map position. Its real speed converts
// to starmap units/game-second; the drift heads along the in-system velocity ANGLE (the orrery and the
// starmap are unrelated 2-D frames, so the angle is a visual convention, per the design decision). A
// non-physical (diagrammatic) map or zero speed yields a stationary strand.
export function adriftFromSystemExit(
  construct: CelestialBody,
  systemPos: { x: number; y: number },
  velocity_ms: { x: number; y: number },
  atSec: string,
  distanceUnit: string,
  fromSystemId?: ID
): AdriftConstruct {
  const speed = Math.hypot(velocity_ms.x || 0, velocity_ms.y || 0);
  const angle = Math.atan2(velocity_ms.y || 0, velocity_ms.x || 0);
  const mPerUnit = distanceToMeters(1, distanceUnit);                // metres per 1 starmap unit
  const vUnits = mPerUnit > 0 && Number.isFinite(mPerUnit) ? speed / mPerUnit : 0; // units per game-second
  return {
    construct: clone(construct),
    x: systemPos.x,
    y: systemPos.y,
    fromSystemId,
    strandedAtSec: atSec,
    ...(vUnits > 0 ? { vx: vUnits * Math.cos(angle), vy: vUnits * Math.sin(angle), t0Sec: atSec } : {})
  };
}
