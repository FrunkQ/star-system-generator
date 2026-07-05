# Autopilot — User Guide

This is the GM-facing guide to the construct autopilot: what each option does and how the ship
decides where to go. (The design/implementation spec lives in `autopilot-spec.md`; this document
describes behaviour as shipped.)

## What the autopilot is

You give a ship a standing route — mine ice and deliver it, patrol three stations, survey outward,
shadow another ship — engage it, and the ship flies that route indefinitely. Everything it does is
derived from the clock: scrub time backwards and forwards and the ship, its fuel, its cargo and its
log all resolve to the same state every time. There is no hidden simulation running; the itinerary
IS the state.

Find it on the **Autopilot** tab of any construct's side panel. Build the route, set the behaviour
sliders, press **Engage**. The ship plans its first legs immediately and keeps topping the plan up
as the clock advances. Press Engage again to disengage — you'll be offered a graceful set of
options (finish the current leg, cut thrust and drift, or emergency stop).

## The five actions

Each leg of a route has an action. Two of them name a **place**; two of them name a **resource**
and let the ship search; one names another **ship**.

| Action | Targets | What the ship does |
|---|---|---|
| **Transport** | a place | Load cargo (or passengers) somewhere, deliver it somewhere else. |
| **Patrol** | a place | Go there and hold for the loiter time. Loiter 0 = a flyby — it races past without stopping. |
| **Mine** | a resource | SEARCH for the best source of that resource, fly there, fill the hold, deliver. |
| **Explore** | a resource (optional) | SEARCH for a source it hasn't visited, go and survey it, then push on to the next new one. |
| **Escort** | a construct | Rendezvous with a moving ship and stay with it. |

### Searching, not listing

Mine and Explore legs do not name a body — they name a **resource** (or, for Explore, optionally
nothing, meaning "anything interesting"). The ship chooses the destination itself:

- Every natural body in the system carrying the resource is a candidate — planets, moons, belts,
  rings. Ships are never mining targets, even if they carry the same resource tag as cargo.
- Candidates are scored on **richness** (the deposit's abundance), **closeness** (from wherever the
  ship is at that point in the route), and a bonus if the body can also **refuel** the ship — a
  source that does both saves a separate fuel detour. When the tanks are low that bonus grows
  sharply: a hungry ship will accept a slightly poorer deposit to fill its tanks at the same stop.
- The choice is re-made as the route repeats: each time the planner tops the route up, "nearest
  source" is judged from where the ship actually is, at the time it will actually be there.

**Explore** adds one more rule: with *don't revisit logged places* on (the default), any body
already in the ship's log is excluded — so a surveyor works outward through a system, visiting
somewhere new each circuit, rather than orbiting its favourite rock forever.

The **Avoid** list (bottom of the tab) removes places from the search entirely — a ship will never
auto-choose an avoided body as a source or fuel stop. Naming an avoided place explicitly as a leg
still works: your explicit order beats the ship's politics.

## Route order — three traversals

- **All — in order**: fly the legs exactly as listed, loop (or stop, see *Then*).
- **All — best order**: the ship may reorder its next few legs (up to the Planning depth) to
  minimise total cost, judged by REAL transfer solutions at the projected departure times. "Wait
  for the planets to align" and "don't cross the sun twice" emerge naturally from this — good
  geometry simply costs less. Every leg still gets visited; a long-neglected one accrues a
  staleness bonus so it can't be starved forever.
- **Any — as needed**: the ship greedily picks whichever leg is best next, with a freshness bias.
  For "service whichever station needs it" style routes.

Resource legs and escorts always fly in the listed order (their targets move or are chosen live,
so there is nothing fixed to reorder).

## The behaviour sliders

- **Discipline** — how punctual the crew is. Slack is added to *stopped* time only (loading,
  loitering, refuelling): a military crew (0) departs on schedule, Bob's trading outfit (1) loses
  days at every port. Transits are never padded, and a flyby is never late — it doesn't stop.
  Defaults from the ship's Owner tag if you don't set it.
- **Planning** — how far ahead the ship commits, in legs. Low = reactive, plans the next hop only;
  high = commits several legs and gives *best order* its reordering window.
- **Drive** — the speed–economy axis. It does two things:
  1. Picks the plan: fast ships take the quickest transfer, thrifty ships the cheapest — and a
     thrifty ship will happily commit a **delayed launch window** if waiting a month makes the
     transfer far cheaper (the wait shows in its log as time at the port).
  2. Sets the **burn profile**: how much of each leg is under thrust. Thrifty end = 20% accelerate,
     60% coast, 20% brake; speed end = 50/50 continuous burn with no coast at all, the classic
     flip-and-burn. You can read this directly off the orrery — see *Reading the map* below.

  **Fuel is a second limit on top**: if the chosen profile would cost more fuel than is aboard, the
  ship automatically steps down to a longer coast — it goes slower rather than stranding itself.
  Only if even the thriftiest profile won't fit does it stop and raise the stuck flag.

## Limits and safety

- **Max acceleration** — cap thrust below the drive's ceiling, for crew comfort (1–1.5 g is a sane
  ceiling for humans) or so slower escorts can keep up. The readout shows the drive's real range
  from fully-fuelled to empty tanks.
- **Max time per leg** — a hard cap on any single leg. Prevents the zero-fuel fifty-year crawl.
- **Ignore fuel / Ignore life support** — modelling shortcuts declaring the ship simply doesn't
  consume these. (Life-support supplies aren't yet modelled; the switch is there for when they
  are.)

When the ship cannot proceed — no route, over the leg cap, out of fuel with no top-up available —
it stops and shows a red **stuck** banner on the Autopilot tab with the exact reason. The Routes
panel and the rail dot mirror this: red = stuck, orange = needs your decision, green = a run-once
route finished (the ship auto-disengages).

## Fuel and cargo

Both are **derived over time**, not stored — scrub the clock and watch them move.

- **Refuelling** is automatic where possible: instant at ports/depots; at a rate when harvesting on
  a frontier body. A ship whose fuel can be sourced from a resource it's mining **self-fuels as it
  works** — an ice hauler with a Deuterium-Tritium drive refills its tanks from the same ice it's
  loading (which fuels — pun intended — the search preference for sources that do both).
- **Cargo**: a mine/load leg with no amount set fills the hold to capacity; a typed amount is a
  cap. Loads never overfill, unloads never over-deliver, and dwell time is sized from the amount
  actually moved (a full ship mines nothing and doesn't idle). A ship engaged while already loaded
  delivers its cargo first before gathering more.

## The Ship's Log and Totals

The log is the ship's whole story: the active journey at the top, planned trips below it in order,
then recent history (with *Show full history* for everything back to launch). Work events —
loaded, mined, unloaded, refuelled — sit with their journeys, updating live across their duration
so a half-finished loading run reads as such. Each journey is badged with its action
(mine/load/unload/patrol/explore/escort). **Totals & averages** at the bottom reduces the whole
log: tonnes delivered by resource, tonnes per annum, stops, refuels, time span.

## Escort

An escort leg shadows another construct. The target's position is always known (the whole sim is
deterministic), so the escort resolves where its charge is and goes there, re-resolving as it
moves — it follows host to host. The **km standoff** is honoured at arrival: the escort parks at
its charge's own orbital radius plus the standoff, so at deep zoom the pair sit visibly apart
(0 = tight formation, large = a covert tail outside sensor range). Velocity-matched shadowing
*during* the target's transits is a planned refinement; today the escort catches up at the next
port of call.

## Reading the map

Committed routes draw on the orrery in burn colours: **green** = accelerating, **yellow** =
coasting, **red** = braking. The active leg is bright, the next leg faded; only the current and
next legs draw, so a twenty-leg route doesn't cobweb the map. A Drive-maxed ship shows almost no
yellow (continuous burn); a thrifty one is mostly yellow with short green/red caps.

**Orange** is different: an orange line is an *uncontrolled* coast — a ship abandoned or adrift,
falling under gravity alone. Its path bends (or is captured) at planets; switch on **Hill
spheres** in the View options to see each planet's gravitational grab radius as a light-yellow
bubble — the orange line kinks exactly at that boundary, because the overlay and the physics share
one definition.

## Known simplifications

- Flyby legs (loiter 0) don't yet carry momentum into the next leg — each leg still starts and
  ends at rest. Banked with the slingshot planner.
- Escorts hold at their charge's host between its transits rather than flying formation mid-burn.
- Life-support supplies are not yet modelled.
- Moons inside a planet's Hill sphere don't get a nested sphere of their own (either for the
  overlay or for adrift ships).
