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

## How each action decides its route

For every action, three questions have the same shape: **what destinations are considered**, **how
one is chosen**, and **when the choice is reconsidered**. This is the whole decision procedure —
there is nothing hidden beyond it.

### Transport (place-driven haul)

- **Considered:** exactly the places you named — the pick-up and the deliver-to. No search.
- **Chosen:** the destinations are yours; only the flight between them is the ship's to solve
  (see *How a leg becomes a flight plan* below).
- **Reconsidered:** never — but under *best order* / *any* traversal the SEQUENCE of your transport
  legs may be rearranged (cargo pick-up always precedes its drop-off).

### Patrol (place-driven presence)

- **Considered:** the place you named.
- **Chosen:** yours. Loiter time is yours too; loiter 0 makes it a flyby.
- **Reconsidered:** never, apart from traversal reordering.

### Mine (resource-driven — the ship SEARCHES)

- **Considered:** every **natural body** in the system carrying the named resource tag — planets,
  moons, belts, rings. Never a ship (a tanker full of ice is cargo, not a deposit), never the body
  it is currently sitting at, never anything on the **Avoid** list.
- **Chosen:** each candidate is scored on three things — **richness** (the deposit's abundance
  value, which also sets how fast the hold fills), **closeness** (from wherever the ship will be
  when this leg comes up, not from where it is now), and a **refuelling bonus** if the body can
  also top up the ship's tanks (a source that does both saves a whole fuel detour). When the tanks
  are below half, that bonus grows sharply — a hungry ship accepts a poorer deposit to refuel while
  it works. Highest score wins. The deliver-to you named is then appended as the drop-off.
- **Reconsidered:** every time the planner tops the route up (each time a leg completes and a new
  one is committed). A repeating mine route therefore re-runs the search from the ship's actual
  position each circuit — if a richer or closer source has become sensible, it switches.

### Explore (resource-driven survey — searches for somewhere NEW)

- **Considered:** as Mine — every natural body carrying the sought resource (or, with no resource
  set, ANY body carrying any resource) — minus the Avoid list, and minus **every place already in
  the ship's log** when *don't revisit* is on (the default).
- **Chosen:** same scoring as Mine. Because visited places are excluded, the "best" source is
  always somewhere new — the effect is a survey that works outward through the system, one fresh
  body per circuit, rather than orbiting its favourite rock.
- **Reconsidered:** at every top-up, against a log that has grown by one — that's what drives the
  outward sweep. When every carrier of the resource has been visited, the leg finds nothing and
  the ship raises the orange needs-your-decision flag.

### Escort (construct-driven — the target MOVES)

- **Considered:** only the one construct you named. If it no longer exists, the leg yields nothing.
- **Chosen:** the escort targets the construct ITSELF — not its host. The transit solver flies a
  real rendezvous to it **wherever it is, in port or in open space**, arriving velocity-matched.
  From then on the escort is in genuine FORMATION: it mirrors its charge's motion moment to moment
  through everything the charge subsequently does, trailing it along its velocity vector by your
  **km standoff** (0 = wingtip formation; large = a shadowing tail outside sensor range).
  Formation is CAPABILITY-CHECKED: the moment the charge commits a burn harder than the escort's
  own thrust ceiling, formation breaks — the escort keeps the velocity it held at that instant and
  coasts on, visibly left behind, until its next planning top-up commits a fresh chase (a charge
  that keeps outrunning it ends in an honest stuck flag). If you want a mixed flotilla to hold
  together, cap the LEAD ship's Max acceleration to the slowest escort's ceiling.
- **Reconsidered:** at every top-up — if the escort ever finds itself away from its charge (you
  redeployed it, or it was engaged late), the next leg is a fresh intercept.
- **Caveats:** a charge that is mid-BURN at solve time is aimed at via a straight-line projection
  of its current velocity — catching a coasting, adrift or parked ship is accurate; a long chase
  of a hard-accelerating target closes with a visible correction at arrival (aiming against the
  target's committed flight plan is the planned refinement). Escort legs are never reordered by
  *best order* — a moving target is not a fixed waypoint. And if you want to BUZZ a ship rather
  than stay with it, that's the manual planner's Flyby arrival (set an intercept speed); autopilot
  escorts always match velocity.

The **Avoid** list (bottom of the tab) applies to every SEARCH above — a ship never auto-chooses
an avoided body as a source or fuel stop. Naming an avoided place explicitly as a leg still works:
your explicit order beats the ship's politics.

## How a leg becomes a flight plan

Once a destination is fixed, the flight to it is solved by the SAME transit solver you use in Plan
Transit — the autopilot has no separate, simpler maths that could disagree with it. Each hop, the
solver offers up to four plan families:

- **Most Efficient** — a minimum-fuel transfer that may include a **delayed launch window** (it
  sweeps departure dates up to ~1000 days ahead looking for cheap geometry);
- **Efficient Now** — the best minimum-fuel transfer departing immediately;
- **Direct Burn** — the torch solution: flip-and-burn, fast and thirsty;
- **Flyby Assist** — a gravity-assist route via a heavyweight planet, where geometry allows.

The **Drive** slider picks the winner: fast ships take the least TIME (usually Direct Burn),
thrifty ships the least FUEL (usually Most Efficient) — which is why a thrifty ship will sit in
port waiting for an alignment window: that IS its cheapest route, and the wait shows in its log.
Drive also sets the burn profile within the leg (20/60/20 coast-heavy up to 50/50 continuous
burn), fuel shortage steps that profile automatically toward longer coasts, and *Max time per leg*
strikes out any plan whose WHOLE elapsed leg — launch-window wait included — exceeds your cap.

The *best order* / *any* traversals cost their candidate orderings with a lightweight quote from
the **same solver** at the projected departure times — so "wait for the planets to align" and
"don't cross the sun for the far one" fall out of real transfer costs, not rules of thumb.

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
- **Drive** — the speed–economy axis, doing two things. First it **picks the plan**: fast ships
  take the quickest transfer, thrifty ships the cheapest — and a thrifty ship will happily commit a
  **delayed launch window** if waiting a month makes the transfer far cheaper (the wait shows in its
  log as time at the port). Second it sets the **burn profile** — how much of each leg is under
  thrust: thrifty end 20% accelerate / 60% coast / 20% brake, speed end 50/50 continuous burn with
  no coast at all (the classic flip-and-burn), which you can read straight off the orrery (see
  *Reading the map*). **Fuel is a second limit on top:** if the chosen profile would cost more fuel
  than is aboard, the ship steps down to a longer coast — it goes slower rather than stranding
  itself, and only stops if even the thriftiest profile won't fit.

## Limits and safety

- **Max acceleration** — cap thrust below the drive's ceiling, for crew comfort (1–1.5 g is a sane
  ceiling for humans) or so slower escorts can keep up. The readout shows the drive's real range
  from fully-fuelled to empty tanks.
- **Max time per leg** — a hard cap on any single leg, counting the WHOLE leg: a delayed launch
  window is part of the leg, so a plan that waits 300 days and flies 200 busts a 250-day cap.
  When the cheap-but-waiting plan is over the cap, the ship takes a faster family instead of
  stranding; only if nothing fits does it stop with the over-cap reason. Prevents the zero-fuel
  fifty-year crawl.
- **Ignore fuel** — a modelling shortcut declaring the ship simply doesn't consume fuel.
- **Ignore life support** — shown ticked and locked: supplies aren't modelled yet, so every ship
  currently behaves as if this is on. It will unlock when the supplies model lands.

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
- Escort INTERCEPTS aim at a straight-line projection of the charge's current velocity — accurate
  for parked/coasting/adrift charges, off for a target mid-burn (once caught, formation tracks it
  through anything).
- Life-support supplies are not yet modelled.
- Moons inside a planet's Hill sphere don't get a nested sphere of their own (either for the
  overlay or for adrift ships).
