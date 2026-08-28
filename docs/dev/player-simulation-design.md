# Send what changes; simulate the rest from a timestamp — design note (G51)

Status: **PHASE 0 — DESIGN ONLY. NO CODE WRITTEN.** Section 10 holds the questions for the owner;
nothing is built until they are answered.
Written 2026-08-27 at v3.0.138 from reading the shipped code and from measurements taken in the
[[B108]] session, not from impression. Where a claim is unmeasured this note says so.

The owner, 2026-08-27: *"send what changes, tell the player view to simulate the rest from a time
stamp. It is only stuff that can't be easily predicted that has to be sent. Make it ALL tiny."*

And his diagnosis of why it is not already so: *"Player Views were shipped without animation
tracking, so there is a legit need for a better approach rather than patching up a bad idea."*

---

## 1. The asymmetry, in one table

| object | what crosses the wire per tick | why |
|---|---|---|
| a planet | **nothing** | elements + `t`, computed independently at both ends |
| a moon | **nothing** | same |
| a barycentre pair | **nothing** | same |
| an adrift interstellar ship | **nothing** | stored position + velocity + epoch; the receiver extrapolates |
| **a ship in transit** | **the entire campaign** | the GM stamps its instantaneous state onto the node and re-sends everything |

The last row is the whole item. It is not that a ship costs more than a planet — a ship's state is
five numbers and a word. It is that those five numbers are **nested inside a multi-megabyte
document**, so changing them re-sends the document.

Measured in the [[B108]] session on the bundled Local Neighbourhood (Science Fiction) map at
v3.0.132: `SYNC_STARMAP` averages **~765 KB per send** (1,530,061 bytes over 2 sends) and
`SYNC_SYSTEM` **~245 KB per send** (489,642 over 2). The owner's [[B94]] capture has the receiving
end of the same story: `rx.SYNC_STARMAP` 4 → 54 and `rx.SYNC_SYSTEM` 3 → 43 while the clock ran,
driving 59 full 3D scene rebuilds at ~103 ms each and a heap from 120 MB to 3.3 GB.

`worldPositions.ts:82-90` states the boundary on purpose: *"the ship therefore steps with the GM's
clock rather than running one of its own, which is the intended boundary (transit is GM land)"*.
**That boundary is right and this note does not move it.** The GM still decides where every ship is.
What changes is that the GM stops re-stating it thirty times a minute in a document that also
contains every world in the campaign.

---

## 2. The player can already simulate a flight. It already does — and almost nobody noticed

This is the most important finding in this note, because it changes the work from "build animation
tracking" to "finish wiring the animation tracking that shipped".

`slimNode` already publishes two compact, time-parameterised descriptions of a ship's course on
every player snapshot:

- **`route`** (`constructs/shipRoute.ts`) — at most **16 knots**, each `{t, x, y, z}`, read as a
  centripetal Catmull-Rom. It is fitted so the **curve** tracks the flown path to within
  `FIT_TOL_FRAC = 0.002` of the route's own extent, and the knots carry TIME, so it is not a shape:
  it is a **time-to-position function over the whole flight window**.
- **`driveBurns`** (`constructs/shipBurn.ts`) — `{s, e, a, b, dx?, dy?}` per thrusting segment: when,
  how hard, which way, braking or not. Enough to light the plume correctly at any `t`.

And `routeStateAt(routeOf(node), tMs)` is exactly the query a player needs. It returns null outside
`[route.s, route.e]`, so it answers only while the ship is genuinely under way.

**It is already wired into the 3D view**, gated by one flag:

```
src/routes/catalogue/+page.svelte:1292   <HoloView ... transitMotion={followGMActive} ... />
src/lib/holo/scene.ts:4289               computeWorldPositions3D(currentSystem, timeMs, transitMotion ? routeSampler : undefined)
```

So a **following** player view already animates a transiting ship locally, from the route and its
own clock. A free-scrubbing one deliberately does not (the owner's rule, 2026-08-08: scrubbing is
for looking around, not for replaying live traffic against a clock the GM does not control).

`flight_state` is derivable too, and by the same signal — `scene.ts:4391` already computes "is this
construct actually flying its course at the moment being drawn" as `routeStateAt(...) !== null`.

**So the animation tracking exists. What does not exist is the consequence: because the GM still
stamps `vector_position_au` / `vector_velocity_ms` / `vector_epoch_ms` onto the node every tick, the
campaign payload changes every tick, `sendIfChanged` cannot dedupe it, and the whole document goes
out anyway — to a receiver that was going to compute the ship's position for itself.**

### What the route does NOT cover, and this is the honest edge list

| moment | covered by the route? | what actually places the ship |
|---|---|---|
| before departure | no (`t < route.s`) | parked: parent + orbit. Time-free already |
| under way | **yes** | `routeStateAt` |
| after arrival | no (`t > route.e`) | parked: parent + orbit, after the [[B97]] repair. Time-free already |
| adrift in deep space after an abort | no | position + velocity + epoch, extrapolated inertially |
| a plan committed but not yet broadcast | no | nothing — this is the genuinely unpredictable case |

Both parked cases were closed by [[B97]] / DATA-R27: *"a repaired ship is an ordinary Keplerian
orbiter"*, which is why route (B) of [[G49]] turned out to be unnecessary. **The stamped vector is
therefore not needed for the ordinary life of a ship at all.** It is needed for the deep-space
drifter, and the GM's own code already treats that case as extrapolable — `SystemView.svelte`
advances an adrift ship as `pos + v·dt` rather than re-solving anything.

---

## 3. What genuinely cannot be predicted

The test the owner set is the only test used below: **can the receiver work it out itself?** Three
things fail it, and they are all events rather than states.

1. **A new committed plan.** A GM commits a transit; until the plan crosses, no receiver can invent
   it. Rare — once per journey.
2. **An abort or a replan.** The ship stops thrusting at a moment nothing in the old plan predicts,
   or starts flying a different one. Rare — and the existing compact forms already model it:
   `compactRoute` truncates at `cancelledAtSec` and `compactBurns` stops thrusting there.
3. **A GM edit.** Renaming, retagging, moving, deleting — anything the GM does by hand. Rare, and
   must reach the player IMMEDIATELY (this is an acceptance criterion, not a nicety).

Two more that look like events and are not:
- **Arrival.** Predictable: it is `route.e`. The receiver knows when the ship parks because the
  route says so. (The *record* change — new `parentId` and `orbit` — is a campaign change and rides
  the campaign, once, at the moment the GM's reconcile makes it.)
- **Departure.** Predictable: `route.s`.

---

## 4. The message split

### 4.1 What the campaign payload keeps

Everything a GM authored and everything derived from it that does not move: nodes, orbits, masses,
atmospheres, **tags**, names, descriptions, images, routes between systems. This document becomes
genuinely static between GM edits, which is the point — `sendIfChanged` then dedupes it and
`bc.SYNC_STARMAP.unchanged` climbs instead of `.sent`.

### 4.2 What comes off it

Per construct, the fields the [[G51]] measurement named:
`vector_position_au`, `vector_velocity_ms`, `vector_epoch_ms`, `flight_state`, `driveBurns`,
`route`, and (on `SYNC_SYSTEM` only) `scheduled_journeys[].status`.

### 4.3 The new message

```
SYNC_FLIGHT {
  t: number,                    // GM display-clock ms this describes
  ships: [{
    id: string,
    sys: string,                // system id, so a starmap-level receiver can file it
    plan?: { route: CompactRoute, burns: CompactBurn[] } | null,   // null = plan withdrawn
    drift?: { r: {x,y}, v: {x,y}, e: number } | null,              // deep-space only
    park?: true                 // parked: use parent + orbit, drop any stamp
  }]
}
```

**It is an EVENT message, not a tick message.** Nothing fires it while a ship flies a committed plan
to schedule, because nothing the receiver cannot compute has happened. It fires on: commit, replan,
abort, strand, park, and the join burst. **Per-tick network cost for a ship therefore becomes zero —
the same as a planet.** That is the acceptance target, and it is what "make it ALL tiny" means.

Size, for scale: a 16-knot route is ~16 × 4 numbers; burns are a handful of 4-6 number records; a
drift stamp is 5 numbers. A ship's whole flight description is **hundreds of bytes**, against the
~765 KB document it is currently nested in. A campaign with five ships flying is comfortably under
2 KB, sent a handful of times per journey rather than twice a second.

### 4.4 The receiver

The player merges a `SYNC_FLIGHT` into the system it already holds **without replacing the system
object**, and calls the in-place update path rather than `setSystem`. [[B94]]'s fix already proved
that path works and already contains the reasoning: `updatePositions()` reads `currentSystem` LIVE
every frame via `computeWorldPositions3D`, and `worldPositions.ts:82-90` takes a construct's place
straight from the sampler or the vector. The motion-only gate at `holo/scene.ts` is the model for
what may be updated in place and what must rebuild.

**Rebuild policy, stated so it is not discovered later:** a `plan` change is a REBUILD (the drawn
course changes, the plume timeline changes, the ship may change parent) and that is correct, because
it is rare. A `drift` or `park` update is in-place. This is the same fail-open rule the B94 gate
uses: *"missing a rebuild that was needed is a far worse bug than doing one that was not"*.

---

## 5. How the GM keeps authority while sending almost nothing

Authority is not a stream of positions. It is ownership of **the plan and the clock**, and the GM
keeps both:

- **The plan is the GM's.** Only the GM commits, replans or aborts, and each of those is transmitted
  the moment it happens. A player cannot invent a course; it can only evaluate the one it was given.
- **The clock is the GM's whenever it matters.** `SYNC_TIME` already carries
  `{currentTime, isPlaying, timeScale}` at 1 Hz with a >1 s snap, and a following view runs on it.
- **The plan is authoritative even where the player's arithmetic differs.** `routeStateAt` agrees
  with the GM's dense-path placement to within the published fit tolerance — which is a declared
  re-estimate on the physics page, not an unmodelled error.
- **Silence is a positive statement.** No flight message means "the plan you hold is still the plan",
  which is exactly what silence already means for a planet's orbit.

What the GM gives up is re-stating a position the player can compute. That is not authority; it is
noise.

---

## 6. Requirement (b), the derived-field half — and a warning about its premise

The board's second requirement says time-varying derived data must come off the payload too:
*"A planet's instantaneous `distanceToHost_km` drives its SOI, which drives
`orbitalBoundaries.minLeoKm`, and surface temperature moves with it — so on an eccentric orbit these
wobble continuously."*

**I could not confirm that from the code, and what I did find contradicts it.** Stating this plainly
because [[B108]] has just cost the board a session built on a mechanism that was read rather than
measured, and this is the same shape of claim.

What I searched, and what it returned:

- `grep -rn "orbitalBoundaries"` across `src/` — **exactly one writer**, `SystemProcessor.ts:1767`,
  inside `processFlightDynamics`.
- `grep -rn "distanceToHost_km"` across `src/` — four non-spec sites. **All four build it from the
  SEMI-MAJOR AXIS**, not from an instantaneous radius:
  `SystemProcessor.ts:1746` (`body.orbit?.elements.a_AU`), `orbits.ts:674`,
  `BodyTechnicalDetails.svelte:243`, `traveller/importer.ts:525`.
- The SOI at `orbits.ts:426` is `distanceToHost_km × cbrt(m/3M)` — fed by that `a_AU` figure, so it
  does not breathe with eccentricity.
- `minLeoKm` for a body with an atmosphere is a scale-height calculation off `surfacePressurePa` and
  `meanSurfaceTempK(body)` — a MEAN, committed passes earlier.
- `system/idempotence.test.ts` compares every leaf field across three `process()` passes and is
  green, including on this exact bundled map. A field that moved on its own would show there.
- Measured in the [[B108]] session, on the live campaign with the clock running: **not one of
  Jupiter's 221 leaf fields moved between the two payload states.** `orbitalBoundaries.minLeoKm`
  was among them and did not move.

A grep returning nothing is not proof of absence, so here is the honest position: **the owner did
see `minLeoKm` in a `whyChanged` line, so something moved it — but I cannot reproduce it and the
code says it should not move.** One candidate that fits without contradicting any of the above: it
was part of a **one-time settle** rather than a continuous wobble. In my own B108 capture the first
`whyChanged` line after load was `generationEngine, systems[].system.nodes[].tags[] length 20 -> 17,
unitPrefs` — a single post-load reconciliation, never repeated. `minLeoKm` may have been the same
kind of event.

**And there is a second reason not to design around it yet, which stands even if it is confirmed.**
Stripping derived fields from the payload so the receiver recomputes them means **two evaluations of
one question** — the fault the standing rules name as this codebase's most recurring, and the exact
thing `architecture-physics-tags-visuals.md` forbids. The player's rule pack can differ from the
GM's, so the two ends could publish different numbers for the same world and nothing would report
it. If a derived field really does breathe, **the right fix is [[G52]]'s rule — anchor on a
statistic of the orbit rather than on this instant — which stops it moving at source, for the GM as
well as the player.** That is a fix; a send-side strip is a workaround that adds a rival derivation.

There is a cheap middle option if the owner wants the churn stopped before G52 lands: add the
offending field names to `VOLATILE_KEYS`, which is **fingerprint-only** — the field still crosses the
wire, so nothing on the player goes stale in the way the rejected vector patch would have. The
reason vectors were rejected for `VOLATILE_KEYS` (*"suppress them with no local animation and ships
FREEZE"*) does not transfer to a scalar nothing is placed from. **But this is only worth doing
against a field that has been seen to move.** Question Q4.

---

## 7. What this does NOT fix, stated in advance

**Tag churn.** Three tags flip as a body crosses a threshold ([[B108]] / [[G52]]). Tags are not
strippable derived data — they are content players are meant to see — so when they flip the payload
genuinely changed and genuinely must be re-sent. Stopping the flip is [[G52]], owner-bucketed
PRE-V4.

So the honest expectation after G51: **ship-motion churn gone (was constant), derived-field churn
gone or shown never to have existed, occasional tag churn remaining.** How occasional tracks
playback speed — rare at normal play, frequent at the fast-forward the original capture used. If the
payload still re-sends now and then, `__ssePerf.whyChanged = true` on the GM window names the field
in one line before anyone concludes anything.

**The `SYNC_CAMERA` flood** (4,389 messages with a burst of ~430/s in the B94 capture) is a separate
fault and is not in scope here.

---

## 8. One thing found while reading that the owner should decide on

**`SYNC_SYSTEM` has no consumer.** The only receiver in the app is `routes/catalogue/+page.svelte`,
and it registers `onSystemUpdate` as `() => {}` with the comment *"the per-system callbacks are
unused at the starmap level; we take the whole map via onStarmapUpdate below"*.

Meanwhile the GM sends it on every `systemStore` change, and — unlike the starmap path — it does
**not** go through `slimNode`. `computePlayerSnapshot` alone does not strip `scheduled_journeys`, so
`SYNC_SYSTEM` carries the full journeys **including the dense `pathPoints` arrays** that `slimNode`
exists to keep off the wire. Measured at ~245 KB per send on the bundled map, and the B94 capture
shows it going out 40 times in the window it covers.

I searched for other consumers: `grep -rn "initReceiver"` finds one call site;
`grep -rn "SYNC_SYSTEM"` across `src/` and `docs/` finds the type, the two send sites, the handler,
and no reader. It is not named in `vtt-integration-design.md`'s message list either. Question Q5.

---

## 9. Build order

Each phase its own green push. Phases 1 and 2 land together in effect but are separable in review.

1. **The tiny flight message, and the per-tick fields off the campaign payload.** At this point
   `sendIfChanged` finally dedupes the campaign. This is the owner's original concern and it scales
   with player count: one send saved is saved for every viewer.
2. **The player's animation tracking finished:** apply a flight update to ship transforms without
   calling `setSystem`, and let a non-following view animate the route as a following one already
   does (subject to Q6 — this touches the clock rule).
3. **[[G49]]'s clock gate becomes derivable:** extra ship data present means the player cannot
   simulate it and must follow the GM's clock; absent means the clock is their own; GM-follow ties
   it either way. **Confirm with the owner before wiring — it changes what players can do.**

### Acceptance, negatives included

- With a ship under way and a player attached, the campaign payload **stops being re-sent**:
  `bc.SYNC_STARMAP.unchanged` climbs, `.sent` does not, and `whyChanged` reports nothing but the
  occasional tag flip.
- The player's ship still moves smoothly and **arrives in the right place at the right time**.
- A GM edit mid-flight reaches the player **immediately**.
- A player joining mid-flight sees the ship **correctly placed**.
- Heap on the player stays flat; `holo.setSystem` stays near-static with `.motionOnly` (or the new
  in-place path) carrying the traffic. Compare against B94's before-figures: 120 MB → 3.3 GB,
  `setSystem` 61 of which 59 `.same`.
- **Negative:** aborting a plan mid-burn must stop the player's ship at the abort point, not let it
  fly on along a course it abandoned.
- **Negative:** a ship that parks must become a Keplerian orbiter on the player, not freeze at its
  last stamped point ([[B96]]'s fault, and the tripwire
  `transit/playerClockDivergence.spec.ts` already pins it).
- Every new gate is **run against the code with the fix removed and seen to go red** before it is
  believed.

---

## 10. Questions for the owner

Each has a recommendation. Nothing is built until these are answered.

### Q1. Does the player INTEGRATE the plan, or interpolate the published keyframes?

**Recommendation: interpolate the published route, which is what already ships — do not integrate.**

The route is not a naive polyline. It is a fitted centripetal Catmull-Rom whose knots are placed so
the **curve** matches the true integrated path to 0.2% of the route's extent, and the fit converges
as roughly the fourth power of knot spacing, so a whole transfer lands in a dozen knots. Integrating
instead would mean shipping the RK4 propagator, the drift-correction ramp and the burn schedule to
every player device, running it every frame on a phone, and accepting that **two integrators will
diverge** — at which point the ship on the player's screen is not the ship on the GM's, and nothing
reports the difference. That is the duplicated-derivation fault again, in the one place it would be
most expensive to debug.

Interpolation is cheaper, bounded, and **exact where it matters**: the knots include every segment
boundary, so departure, each burn start and end, and arrival are exact by construction; only the
interior of a coast is approximated, and there the tolerance is 0.2%.

*If you want tighter:* the knot cap is `MAX_KNOTS = 16` and the tolerance `FIT_TOL_FRAC = 0.002`.
Both are one-line changes and cost bytes linearly. I would not change them without a reason.

### Q2. What does a player joining mid-flight receive?

**Recommendation: the campaign snapshot plus one `SYNC_FLIGHT` covering every ship not parked,
sent in the join burst, before the campaign.**

The join burst already does exactly this shape for other state — [[A63]] deliberately sends the
one-line `SYNC_INCOMING` ahead of the multi-megabyte payload because the DataChannel is ordered, and
`onRequestStarmap` already re-states preset, overrides, branding, tag styles and GM level to a late
joiner for the same reason. A flight message is a few hundred bytes and belongs in the same burst.

The route carries its own window `[s, e]`, so a joiner needs no catch-up protocol: it evaluates the
route at its current clock and the ship is where it should be. **A joiner is not a special case —
it is the ordinary case with no history.**

### Q3. What happens when a plan is superseded mid-burn?

**Recommendation: the new plan replaces the old one wholesale, and the old one is not kept.**

A `SYNC_FLIGHT` carrying a `plan` for a ship is the complete current answer for that ship; there is
no patching and no merge. This is already how the compact forms behave — `compactRoute` truncates at
`cancelledAtSec` and `compactBurns` stops thrusting there, and the file says why: *"a route line
that outlived its burns would show a ship coasting along a path it had abandoned."*

**The seam to get right is the join between old and new**, and the rule should be: the superseding
message is stamped with the GM's display time `t`, and the player draws the old plan up to `t` and
the new one from `t`. Without that stamp a player whose clock is a second behind would briefly place
the ship on the new plan at a time the new plan does not describe.

*One consequence worth your ruling:* between the abort and the next commit a ship is **adrift**, not
following any plan. That is a `drift` stamp, extrapolated inertially by the player exactly as the GM
already extrapolates it. I recommend the player be allowed to extrapolate it (it is closed-form),
rather than the GM re-stamping it periodically — but a long drift accumulates error against the GM's
own arithmetic, and if you would rather the GM re-state a drifting ship every few seconds, say so
and it becomes a slow heartbeat on the small message instead of on the campaign.

### Q4. Requirement (b): do we strip derived fields, or wait for a capture?

**Recommendation: wait for one capture, and if it confirms, fix at source under [[G52]] rather than
stripping.** Section 6 has the full argument and the greps.

The specific ask: next time you run the clock with `__ssePerf.whyChanged = true`, if
`orbitalBoundaries` or `distanceToHost_km` appears **more than once**, send that line. Once is a
settle; repeatedly is the bug the row describes and I will design for it.

**This does not block G51.** The ship half is confirmed, is the constant cost, and is the whole of
what the measurement actually named. If (b) turns out to be real it is additive.

### Q5. `SYNC_SYSTEM` has no consumer — retire it, or keep it as a contract?

**Recommendation: stop SENDING it, keep the type and the handler.**

It is ~245 KB per send, carries the dense `pathPoint` arrays that `slimNode` exists to strip, and no
code in the app reads it. But it is a published message on a channel that third-party shims
(Mappadux StarMap, and the Foundry/Owlbear shims that are not started) may reasonably expect, so
deleting the type is a contract change and deleting the handler would make a future host silently
fail rather than loudly.

**This changes what the product broadcasts, so it is your call and I have not touched it.** If you
would rather keep sending it, it should at least go through `slimNode` first — carrying the raw
journeys to nobody is a cost with no reader on any reading.

### Q6. Phase 2 lets a non-following player see a ship move. Do you want that?

**Recommendation: yes, and it is the natural reading of your own clock rule — but it is a change to
what players can do, so I am asking rather than assuming.**

Today a free-scrubbing player deliberately gets a frozen ship, and the reason on the record is
yours, 2026-08-08: scrubbing is for looking around, not for replaying live traffic against a clock
the GM does not control. Once the player holds the plan, that reason weakens — a scrubbing player
evaluating the route at their own `t` is not inventing anything, they are reading the GM's own plan
at a different moment, exactly as they already do for every planet.

Your [[G49]] rule points the same way: *"if it is getting this extra ship data we force the time; if
there is no extra data we can let the players mess with time."* Under this design "extra ship data"
shrinks to a **drift stamp** — the one case a receiver genuinely cannot compute. So the gate becomes
narrow and precise: **a ship on a committed plan no longer needs to hold anyone's clock; only a
drifting one does.**

The counter-argument, and it is yours to weigh: a scrubbing player watching a ship fly a plan the GM
has since aborted would be watching a lie until the abort reaches them. That window is milliseconds
on a local channel and could be seconds on a bad remote link.

### Q7. Housekeeping: the Browser pane

The two-window live repro this item is verified by needs the Browser pane **displayed**. Measured in
this session: the pane is currently hidden (`document.hidden === true`, `innerWidth 0`, **0
requestAnimationFrame callbacks in 1500 ms**), which is standing-rule [[E7]] — the clock will not
advance and no canvas will render. The DOM is readable, so design work and message-level
measurement are unaffected, but **the acceptance criteria in section 9 cannot be met until the pane
is shown.**

---

## 10a. What the build phases will owe the reader

Recorded now so nobody has to re-find it. `src/routes/physics/+page.svelte`, in the "known fudges"
list, explains the compact transit route by its CAUSE:

> *"a ship under way rewrites what players receive about twice a second, and the whole snapshot is
> re-sent each time, so the full path would be thousands of numbers on the busiest channel in the
> app."*

**Phase 1 makes that sentence false.** The conclusion survives - the route stays compact - but its
reason changes completely: the compact route stops being a bandwidth apology and becomes the ship's
actual definition of where it is, evaluated by both ends. That paragraph wants rewriting rather than
appending to, and it is the surface that claims to SHOW THE WORKING, so it is the worst one to leave
wrong.

The same paragraph ends with a second claim that **Q6 would falsify**:

> *"a player scrubbing their own clock sees orbits move but transit traffic hold its last
> GM-reported position, because live traffic is the GM's clock to run, not the viewer's."*

`docs/dev/player-clock-ownership-design.md` states the same rule and wants the same correction.
Neither is touched in Phase 0.

## 11. Related

- `docs/dev/player-clock-ownership-design.md` — [[G49]], whose gate section 9 phase 3 derives.
- `docs/dev/transit-architecture.md` — where journeys, plans and segments are defined.
- `docs/dev/unified-player-view-design.md` — what a player view is for.
- `docs/dev/vtt-integration-design.md` §9.1 — the broadcast contract Q5 touches.
- Inbox: [[G51]] (this), [[B94]] (its symptom and its test), [[B96]] / [[B97]] (parked ships are
  Keplerian), [[B108]] and [[G52]] (the tag churn this does not fix), [[G49]] (the clock gate).
