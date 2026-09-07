# Time architecture — clocks, units, and "where is this ship?"

There are several clocks in SSE and the bugs come from using the wrong one at a boundary (e.g. the
interstellar-ship-hide that read a unix clock as a universe clock). This is the map. **When in doubt,
convert explicitly at the boundary — never pass a raw number across layers.**

## 1. Two SEMANTIC clocks (the model)

Per the derive-from-clock principle, the journey/transit log is the single source of truth and a body's
position is *derived*; only persistent commits use the master clock.

- **`masterTimeSec` — ACTUAL / "now".** The real campaign clock. Persistent state changes (a construct's
  node actually relocating into a destination system, a ship moving to the adrift list, reconcile) commit
  **only** when master time passes the relevant boundary. Never rewound.
- **`displayTimeSec` — DISPLAY / scrub.** What the user is currently looking at; the time-scrubber moves
  this freely (past/future). Everything *shown* (orrery positions, ship placement on the starmap, the
  interstellar hide) is derived from this, so scrubbing is fully reversible. Usually equals master, but
  diverges while scrubbing/previewing.

Both live on `TemporalState` (`src/lib/types.ts`) as **strings of MASTER/UNIVERSE seconds** (see §2).

## 2. The numeric REPRESENTATIONS (units) — this is where bugs live

| Representation | Type | Zero point | Where it's used | Get it from |
|---|---|---|---|---|
| **Master/universe seconds** | `bigint` (stored as string) | the Big Bang | `temporal.masterTimeSec` / `displayTimeSec`; **interstellar** journey `startTimeSec`, `durationSec`, `endedAtSec`; `constructDisplayPlacement(…, displaySec)` | `parseClockSeconds(temporal.displayTimeSec)` |
| **Unix-epoch milliseconds** | `number` | 1970-01-01 | the **orrery** render clock (`currentTime` in SystemView/SystemVisualizer), orbital `propagate(node, tMs)`, `orbit.t0`, the in-system **scheduler** (`startMs`/`endMs`, `resolveConstructCurrentHostId(…, displayTimeMs)`) | the component's `currentTime` |
| **Calendar (human)** | `ResolvedTemporal` | derived from the ANCHOR plus the calendar's own `epoch_utc` — see below | display strings only | `resolveTemporalDisplay(temporal)` / `resolveCalendar(masterSec, cal)` |

**The offset, and it is now a DEFAULT rather than THE answer (G62).** `BIG_BANG_TO_UNIX_EPOCH_T =
435084631200000000n` is master-seconds at the unix epoch on the *built-in* anchor, and it is what
`DEFAULT_TEMPORAL_ANCHOR` expresses. The live conversion goes through the **runtime anchor**, so a
campaign on a different stake in the sand converts differently:

- unix-ms → master-seconds: **`unixMsToMasterSeconds(currentTime)`**, which reads `anchorMasterSeconds()`
  (the runtime anchor) and NOT the constant directly.
- master-seconds → unix-ms: subtract `anchorMasterSeconds()`, then `* 1000`.
- **A calendar's zero is derived, not authored.** `calendarEpochOffset(cal)` = the anchor's unix-epoch
  master value plus the calendar's own `epoch_utc`. The stored `epoch_offset_t` survives ONLY as the
  fallback for a calendar with no `epoch_utc`. That is the whole point of the change: three of the four
  shipped calendars each carried an independent absolute correction and each was wrong by a different
  amount (Gregorian 297 years early, Haab 294 early, Chinese 144 late), which is how a clock seeded at
  1 January 2026 displayed the year 2323. **Move the anchor and every calendar moves with it** — that is
  the invariant to preserve, and the reason nothing may convert with the bare constant any more.

### The trap (worked example — the v2.0.104 fix)
The interstellar layer is in **master seconds** (`startTimeSec`…). The orrery's `currentTime` is **unix-ms**.
The interstellar-hide in SystemView did `interstellarConstructIds(starmap, currentTime / 1000)` — feeding
*unix seconds* (~1.7e9) where *master seconds* (~4.35e17) were expected. Every journey then read as "not
departed yet", so no ship ever hid. Fix: `interstellarConstructIds(starmap, unixMsToMasterSeconds(currentTime))`.
**Rule: anything crossing from the orrery/scheduler (unix-ms) into the interstellar layer (master-sec) must
go through `unixMsToMasterSeconds`; the Starmap component is already in master-sec via `displayTimeSec`.**

## 3. "Where is this construct?" — ONE place, derived, consistent across both scales

A construct is in **exactly one** location-state at a given display time, resolved from its journey log +
the clock. Interstellar and in-system are the *same idea* at two scales:

| | Interstellar (between systems) | In-system (between bodies) |
|---|---|---|
| resolver | `constructDisplayPlacement(starmap, id, displaySec)` — **master sec** | `resolveConstructCurrentHostId(construct, displayTimeMs)` — **unix-ms** |
| at rest | `system` (in its origin/destination system) | docked / orbiting its host body — **or ATTACHED to a structure, which is a third thing (G53 phase 5)** |

**ATTACHED IS NOT ORBITING, and the table above hid that until this sweep.** A construct docked to a
megastructure carries `attachedTo` — a structure id plus a point in that structure's ROTATING frame —
and `constructs/docking.ts` turns it into a world offset every consumer reads. It moves at the
structure's rate, not at an orbital one: slower than a circular orbit below geostationary on a tether
(let go and it falls), exactly orbital at GEO, faster above (let go and it is flung), and at the rim
speed the rotation knob sets on a ring. `dockMatchSpeedMs` states the gap between riding and orbiting,
which is what lets the planner price a docking without refusing one. **The rule this adds to §3's "one
place per construct": the attachment is the authority while it exists — a docked ship departs from
where the structure has carried it, not from the orbit it held before docking, and the GM map, the
holo and every player view read that one answer rather than each deriving their own.**
| moving | `transit` (lerp between system positions; or coasting `adrift` w/ velocity) | in transit between bodies (mid scheduled-journey leg) |
| arrived | `system` = destination (committed at actual time) | parked/orbiting at the destination body |
| undone | journey removed → back at source | leg removed → back at origin host |

Both: the log is authoritative; the displayed place is derived (reversible); the persistent move commits
only when **master** time passes the leg/journey end. A construct must never appear in two places — e.g.
SystemView hides a construct from a system orrery exactly when its interstellar placement is `transit`/
`adrift` (so it's not both "in the void" and "in its origin system").

## 4. Rules of thumb

1. **Name the unit in the variable** where it crosses a layer: `…Sec` (master) vs `…Ms` (unix) vs
   `…MasterSec`. A bare `time`/`now` is a future bug.
2. **Interstellar / temporal / journeys → master seconds.** Convert `currentTime` with
   `unixMsToMasterSeconds` before handing it to anything interstellar.
3. **Orrery / propagate / orbits / in-system scheduler → unix-ms** (`currentTime`, `orbit.t0`).
4. **Derive from `displayTimeSec`; commit against `masterTimeSec`.** If you're changing stored data, gate
   on master; if you're only drawing, use display.
5. **One place per construct.** New location logic must resolve a single state and hide the others.

## 5. Known boundary to audit
The in-system scheduler returns `startMs`/`endMs` (unix-ms) while some call sites compare against
`displayTimeSec` (master-sec) after only dividing by 1000 — verify each such site converts epochs, not just
units. (The interstellar hide was one instance; sweep for `/ 1000` near a `displayTimeSec` comparison.)
