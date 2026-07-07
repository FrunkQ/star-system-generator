// Bidirectional construct interaction log. When an autopilot ship visits another construct — a station,
// depot or tanker — the visit shows up on THAT construct's log too, not only the ship's. We don't persist a
// mirrored copy: every visit is already recorded on the visiting ship's flight_log (each event carries the
// placeId it happened at), so a target construct's incoming log is DERIVED on demand by scanning the fleet.
// That keeps it correct through time scrubbing (the pane's own past/future split filters by the display
// clock) and means there is no second copy to dedup, prune or keep in step — the ship's log is the single
// source of truth.
import type { CelestialBody, ConstructLogEvent, System, ID } from '$lib/types';

// A ship flight-log event counts as an INTERACTION with the construct it happened at only for these kinds:
// a delivery, a pickup, a refuel, or holding station (escort). Mining targets natural bodies, and
// depart/arrive/stuck/disengage are the ship's own doings — none of those get mirrored onto a counterparty.
const INTERACTION_KINDS = new Set<string>(['load', 'unload', 'refuel', 'loiter']);

export interface IncomingVisit extends ConstructLogEvent {
  incoming: true;
  fromConstructId: ID;
  fromName: string;
}

// Every visit MADE TO `targetId` by any other construct, read from those ships' flight logs. Returns the
// synthesised incoming events oldest-first; the visiting ship is carried on fromConstructId/fromName so the
// log can name it. Empty when nothing visits (including a plain body, which owns no flight_log).
export function deriveIncomingVisits(system: System | null | undefined, targetId: ID): IncomingVisit[] {
  if (!system?.nodes || !targetId) return [];
  const out: IncomingVisit[] = [];
  for (const n of system.nodes as CelestialBody[]) {
    if (n.kind !== 'construct' || n.id === targetId) continue;
    const log = n.flight_log;
    if (!log?.length) continue;
    for (const ev of log) {
      if (ev.placeId !== targetId || !INTERACTION_KINDS.has(ev.kind)) continue;
      out.push({
        ...ev,
        id: `in-${n.id}-${ev.id}`, // stable + unique per source event, so re-derivation is idempotent
        incoming: true,
        fromConstructId: n.id,
        fromName: n.name || 'A ship'
      });
    }
  }
  out.sort((a, b) => Number(a.atSec) - Number(b.atSec));
  return out;
}
