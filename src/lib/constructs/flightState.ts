/**
 * A SHIP'S FLIGHT SITUATION, as its own tiny message — G51.
 *
 * The owner's principle, 2026-08-27: *"send what changes, tell the player view to simulate the rest
 * from a time stamp. It is only stuff that can't be easily predicted that has to be sent. Make it
 * ALL tiny."*
 *
 * WHY THIS MODULE EXISTS AT ALL. A planet costs ZERO bytes per tick: elements plus time, computed
 * independently at both ends. A ship used to cost THE ENTIRE CAMPAIGN per tick, not because its
 * state is large — it is five numbers — but because those five numbers were stamped onto a node
 * inside a multi-megabyte document, so changing them re-sent the document. `sendIfChanged` could
 * never dedupe it, and every connected player paid for it (~765 KB per send on the bundled SciFi
 * map, measured at v3.0.132).
 *
 * WHAT MAKES THE SPLIT POSSIBLE, and it was already in the tree: `slimNode` has published a compact
 * `route` since P3c — at most 16 knots of `{t,x,y,z}` read as a centripetal Catmull-Rom, fitted so
 * the CURVE tracks the flown path to 0.2% of its own extent. The knots carry TIME, so a route is not
 * a shape: it is a time-to-position function over the whole flight (`routeStateAt`). A receiver
 * holding one can place the ship at any instant for itself. It did not need to be told.
 *
 * SO THIS IS AN EVENT MESSAGE, NOT A TICK MESSAGE. It changes when the GM commits, replans, aborts,
 * strands or parks a ship — and at no other time. While a ship flies a committed plan to schedule
 * the payload is byte-identical from tick to tick and `sendIfChanged` drops it, which is the whole
 * point: per-tick ship cost becomes zero, exactly like a planet's.
 *
 * ONE MODULE, BOTH ENDS. `build` runs on the GM and `apply` on the player, and they are here
 * together so the two cannot answer "what is this ship doing" differently — the fault the standing
 * rules call this codebase's most recurring.
 *
 * WHAT STILL CANNOT BE PREDICTED, and is therefore the one thing still stamped: a ship ADRIFT after
 * an abort. It is not on any route, and the owner's ruling (2026-08-27) is that the GM re-states it
 * rather than letting the player extrapolate: *"a drifter still falls under gravity, and the GM uses
 * patched conics while a naive player would extrapolate linearly — those diverge."* The rate is
 * bounded by `sendIfChanged`'s own 500 ms floor rather than by a second timer here; a drift stamp is
 * ~150 bytes, so up to 2 Hz of it is nothing against the document it replaces, and re-stating MORE
 * often is more correct rather than less.
 */
import type { Starmap, System } from '../types';
import { compactBurns, type CompactBurn } from './shipBurn';
import { routeOf, routeStateAt, type CompactRoute } from './shipRoute';

/** One ship's flight situation. Absent fields mean "nothing to say", never "unchanged". */
export interface FlightShip {
  id: string;
  /** The system whose nodes hold this construct — a starmap-level receiver files by it. */
  sys: string;
  /** The committed course, if any. Knots carry time, so this IS the ship's motion. */
  route?: CompactRoute;
  /** The plume timeline that goes with the course. */
  burns?: CompactBurn[];
  /** GM-stamped position (AU) — present ONLY when the ship is not on its route at this instant. */
  r?: { x: number; y: number };
  /** GM-stamped velocity (m/s), alongside `r`. */
  v?: { x: number; y: number };
  /** The game-clock ms `r` and `v` were sampled at. */
  e?: number;
}

/**
 * The whole flight picture. No timestamp of its own, DELIBERATELY: a `t` that moved every tick would
 * make the payload "changed" every tick and defeat the dedupe this message exists to enable — which
 * is the exact fault `VOLATILE_KEYS` was invented for. Every time this message needs is already
 * inside it (`route.s`/`route.e`, `e`), and the current instant arrives on `SYNC_TIME`.
 */
export interface FlightUpdate {
  ships: FlightShip[];
}

/** The node fields this message owns. `slimNode` strips them; `apply` writes them back. */
export const FLIGHT_NODE_FIELDS = [
  'route', 'driveBurns', 'vector_position_au', 'vector_velocity_ms', 'vector_epoch_ms'
] as const;

/**
 * Is this construct placed ABSOLUTELY rather than by parent-plus-orbit at `atMs`?
 *
 * ONE predicate, because two were already disagreeing. `visibleNodes` asked "does it carry a stamped
 * vector", which was the same question `worldPositions` answers with "does it carry a course OR a
 * vector" — and once the per-tick stamp stops riding the campaign, the vector-only answer would make
 * every transiting ship INVISIBLE on a player view while it was being drawn perfectly well.
 *
 * `worldPositions.ts` keeps its own presence-only gate on purpose (it depends only on the
 * propagator, never on transit code); this one adds the WINDOW, because a ship that has finished its
 * journey still carries the route it flew and must go back to being an ordinary orbiter.
 */
export function isFreeFlying(node: any, atMs?: number): boolean {
  if (!node || node.kind !== 'construct') return false;
  if (node.vector_position_au) return true;
  if (atMs === undefined) return false;
  return routeStateAt(routeOf(node), atMs) !== null;
}

/**
 * Everything a player needs to place and light every ship in the campaign, at `atMs`.
 *
 * A ship with neither a course nor a stamp is PARKED and is omitted entirely — its orbit already
 * describes it ([[B97]] / DATA-R27 made a parked ship an ordinary Keplerian orbiter), so saying
 * anything about it here would be a second answer to a question the campaign already answers.
 */
export function buildFlightUpdate(map: Starmap | null, atMs: number): FlightUpdate {
  const ships: FlightShip[] = [];
  for (const sysNode of map?.systems ?? []) {
    const sysId = (sysNode as any)?.id;
    for (const node of ((sysNode as any)?.system?.nodes ?? []) as any[]) {
      if (node?.kind !== 'construct') continue;
      const route = routeOf(node) ?? undefined;
      const burns = compactBurns(node);
      const onRoute = routeStateAt(route ?? null, atMs) !== null;
      // The stamp travels only where the route cannot answer. On the route the player computes the
      // position itself and a stamp would be a rival answer to the same question.
      const stamped = !onRoute && node.vector_position_au ? node : null;
      if (!route && !burns.length && !stamped) continue;
      const ship: FlightShip = { id: node.id, sys: sysId };
      if (route) ship.route = route;
      if (burns.length) ship.burns = burns;
      if (stamped) {
        ship.r = { x: stamped.vector_position_au.x, y: stamped.vector_position_au.y };
        if (stamped.vector_velocity_ms) {
          ship.v = { x: stamped.vector_velocity_ms.x, y: stamped.vector_velocity_ms.y };
        }
        if (Number.isFinite(stamped.vector_epoch_ms)) ship.e = stamped.vector_epoch_ms;
      }
      ships.push(ship);
    }
  }
  // Stable order, so two builds of one unchanged campaign are byte-identical and the dedupe holds.
  ships.sort((a, b) => (a.sys < b.sys ? -1 : a.sys > b.sys ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { ships };
}

/** Write one ship's entry onto a construct node. Absent fields are DELETED, never left standing. */
function applyToNode(node: any, ship: FlightShip | undefined): void {
  if (!node) return;
  if (ship?.route) node.route = ship.route; else delete node.route;
  if (ship?.burns?.length) node.driveBurns = ship.burns; else delete node.driveBurns;
  if (ship?.r) {
    node.vector_position_au = ship.r;
    if (ship.v) node.vector_velocity_ms = ship.v; else delete node.vector_velocity_ms;
    if (ship.e !== undefined) node.vector_epoch_ms = ship.e; else delete node.vector_epoch_ms;
  } else {
    delete node.vector_position_au;
    delete node.vector_velocity_ms;
    delete node.vector_epoch_ms;
  }
}

/**
 * Merge a flight update into a received starmap, IN PLACE.
 *
 * A construct the update does not mention has PARKED: its fields are cleared so it falls back to
 * parent-plus-orbit, which is the whole of [[B96]]'s fix. Silence therefore means something
 * definite here, which is why `build` must always describe every non-parked ship rather than only
 * the ones that changed.
 */
export function applyFlightUpdate(map: Starmap | null, update: FlightUpdate | null): void {
  if (!map || !update) return;
  const byId = new Map<string, FlightShip>();
  for (const s of update.ships ?? []) byId.set(s.id, s);
  for (const sysNode of (map as any).systems ?? []) {
    for (const node of (sysNode?.system?.nodes ?? []) as any[]) {
      if (node?.kind !== 'construct') continue;
      applyToNode(node, byId.get(node.id));
    }
  }
}

/** The same merge against a single System — the shape the per-system surfaces want. */
export function applyFlightUpdateToSystem(system: System | null, update: FlightUpdate | null): void {
  if (!system || !update) return;
  const byId = new Map<string, FlightShip>();
  for (const s of update.ships ?? []) byId.set(s.id, s);
  for (const node of (system.nodes ?? []) as any[]) {
    if (node?.kind !== 'construct') continue;
    applyToNode(node, byId.get(node.id));
  }
}
