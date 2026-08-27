# Player simulation — session notes (G51, retired 2026-08-27)

What the next person would otherwise re-derive. The DESIGN is in
`player-simulation-design.md`; the RULES are engine-map SYNC-1 to SYNC-5; this file is the
things that cost time to find and are invisible from the code.

Status: **G51 CLOSED.** Phases 1, 2 and Q6 all shipped to beta (v3.0.144, v3.0.145, and the Q6
flip). What is deliberately not done is listed at the bottom.

---

## 1. The finding that changed the shape of the work: the route was already a time function

Everything about G51 got easier the moment this was noticed, and it was noticed by reading
`shipRoute.ts` rather than by planning.

`slimNode` has published a compact `route` since P3c — at most 16 knots, each `{t, x, y, z}`, read
as a centripetal Catmull-Rom fitted so the CURVE tracks the flown path to 0.2% of its own extent.
**The knots carry TIME.** So a route is not a shape, it is a time-to-position function over the
whole flight, and `routeStateAt(routeOf(node), t)` is the query. A receiver holding one can place
the ship at any instant for itself. It never needed to be told.

That single fact decided four things:

- **The work was not "build animation tracking".** It already existed and was already wired for a
  following view (`catalogue/+page.svelte` passes `transitMotion={followGMActive}` into the sampler
  at `scene.ts`). The work was to stop the GM re-stating a position the player was already
  computing.
- **The message could be an EVENT message rather than a tick message.** Per-tick ship cost went to
  zero, the same as a planet's.
- **Q6 became answerable.** The owner's 2026-08-08 ruling — live traffic is the GM's clock to run —
  was made when a view could not work a ship out for itself. Once it could, [[G49]]'s rule applied
  on its own terms and the ruling was reversed.
- **Integrating on the player was ruled out.** Shipping the RK4 propagator to every phone so two
  integrators could silently disagree is a bug factory; interpolating a fitted curve both ends
  already agree on is not. That was Q1.

**If you are ever tempted to send a position, ask what the receiver already holds first.** It held
the answer for three months.

## 2. The trap that nearly shipped: the scene HOLDS the object you are merging into

Phase 1 merged the flight update in place. That is wrong, and wrong in a way no test written before
it would have caught.

`displaySystem` is `starmap.systems[i].system` **by reference**, and `setSystem` stores that same
object as `currentSystem`. So an in-place merge mutates the very object B94's motion-only gate
compares against — `onlyFlightVectorsDiffer(currentSystem, system)` was being handed one object
twice. It reports "nothing moved", falls through, and full-rebuilds the scene for five numbers.
**B94's rebuild storm, returning through the front door, for the one case G51 still transmits.**

The merge is copy-on-write now: a changed ship gets a new node object, an unchanged one keeps its
identity, and an update that changes nothing returns the same map. Pinned by
`flightState.spec.ts` > *"THE MERGE MUST NOT MUTATE"*, which was run against the mutating version
and seen to go red.

**The general rule, worth more than the instance: on the receive side, treat anything the renderer
has been handed as owned by the renderer.** Svelte will re-run a reactive statement on the same
object reference, so a mutation *looks* like it works — the ship even moves, because
`updatePositions()` reads `currentSystem` live every frame. What breaks is every gate downstream
that wanted to compare before with after.

## 3. Redaction and slimming are different jobs, and one path only does the first

Engine-map SYNC-2 states it; this is why it cost time. `computePlayerSnapshot` REDACTS (hidden
nodes, secret tags, GM notes) and nothing more. Everything that makes a snapshot SMALL lives in
`slimNode`, which only `computePlayerStarmapSnapshot` calls.

Both functions are named for the player and both return something a player may see, so the
per-system path reads as a smaller version of the whole-map one. It is not — it is the
**unslimmed** one. `SYNC_SYSTEM` was therefore broadcasting the dense `pathPoints` arrays that
`shipRoute.ts` opens by explaining must never be broadcast, at ~245 KB per send, **to a handler
registered as `() => {}`**.

Four places were checked before that send was stopped, and checking rather than assuming is the
point: the SSE receiver, `/bridge` (which only ever sends `REQUEST_HELLO` / `REQUEST_REMOTE`),
`vtt-integration-design.md`'s message list, and **Mappadux's own `Sse2Bridge.ts`**, which handles
discover/announce and no per-system message at all. The type and the receiver handler were kept: a
shim may reasonably expect the contract, and a deleted handler fails silently where a live one does
not.

## 4. Two gates that agreed only by accident

`visibleNodes` decided a construct was free-floating by asking *"does it carry a stamped vector"*.
`worldPositions` answers the same question with *"a course OR a vector"*. They agreed for one
reason only: the GM stamped a vector on every transiting ship. Take the stamp off the campaign and
a transiting ship goes **invisible on a player view while being drawn perfectly well**.

Found by reading, before it shipped. `isFreeFlying` is the one predicate now, and it needs the
CLOCK — a ship keeps the route it flew after arriving, so presence alone would leave it free-flying
for ever. `worldPositions` keeps its own presence-only gate deliberately (that module depends only
on the propagator and must not import transit code); two gates, one stated difference.

**The detector, which is free and worth running on any change like this: when you remove a field,
grep for everything that tests its PRESENCE, not just everything that reads its VALUE.**

## 5. Silence has to mean something definite

`applyFlightUpdate` CLEARS the flight fields of any construct the update does not mention. So
silence means PARKED, not "unchanged" — which is why `buildFlightUpdate` must describe every
non-parked ship every time rather than only the ones that changed. A diff-shaped message here would
park every ship it omitted.

That is also why the payload carries **no timestamp of its own**. A `t` that moved every tick would
make it "changed" every tick and defeat the dedupe the message exists to enable — the exact fault
`VOLATILE_KEYS` was invented for. Every time it needs is already inside it (`route.s`, `route.e`,
`e`), and the current instant arrives on `SYNC_TIME`.

## 6. How the acceptance was measured without a browser

The pane was displayed for two captures across the whole item and hidden for every other attempt
(E7: `document.hidden === true`, zero rAF callbacks, screenshots time out). The two-window repro
was never run.

What was done instead, and it is what E7 asks for: `flightBroadcast.spec.ts` drives the **real**
`BroadcastService` over the same in-process channel shim `broadcastContract.spec.ts` uses, host and
receiver as two instances, and asserts the counters the owner reads in `__ssePerf.report()`. With a
ship under way across twelve clock ticks, `bc.SYNC_STARMAP.sent` is 1 and `.unchanged` is 11.

**What a test still cannot see: the player's heap and `holo.setSystem`.** Those are half of what
B94 measured and they remain unverified by a human. The eyeball list is on the G51 row.

## 7. What is deliberately not done

- **The heap/rebuild half of the acceptance is unverified.** See above.
- **Scrubbing past the end of a ship's plan** shows it at the orbit stored on its node — which for a
  ship in flight is the one it DEPARTED from. The arrival re-parenting is a GM event a player cannot
  derive, so this is a genuine limit rather than an oversight. Clamping to the plan's end would be
  the fix if it is ever judged worth one. Pinned in `routeClock.spec.ts` as a KNOWN LIMIT so it is
  not rediscovered as a bug.
- **Requirement (b) of the original row — stripping time-varying derived fields — was never built,
  and should not be without a capture first.** The code contradicts its premise:
  `distanceToHost_km` is built from the SEMI-MAJOR AXIS at `SystemProcessor.ts:1746`, not from an
  instantaneous radius, so the SOI does not breathe with eccentricity. If `orbitalBoundaries`
  appears in a `whyChanged` line **more than once** it is real; once is a post-load settle. And even
  if confirmed, the fix belongs at source under [[G52]] — making the receiver re-derive is two
  evaluations of one question against rule packs that may differ.
- **Tag churn remains and is not G51's.** Three tags flip at a threshold as a body moves ([[B108]]);
  tags are legitimate content, so the payload genuinely changed and genuinely must be re-sent.
  Stopping the flip is [[G52]], owner-bucketed pre-V4.

## 8. Related

`player-simulation-design.md` (the design and the owner's seven answers) · engine-map SYNC-1 to
SYNC-5 · `player-clock-ownership-design.md` ([[G49]], with a superseded-note on section 2) ·
inbox [[G51]] [[B94]] [[B96]] [[B97]] [[B108]] [[G49]] [[G52]].
