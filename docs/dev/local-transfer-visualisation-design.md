# Local transfers and how a journey is drawn — design note (G46)

Status: **PASS 1 SHIPPED at v3.0.82, 2026-08-26 — see section 6.** Q1 and Q2 are answered (both as
recommended); Q3, Q4 and Q5 are still open and pass 2 has not started. Sections 1-5 are left exactly
as written so the before-figures stay readable; section 1's faults (a) and (b) are FIXED, (c) and (d)
are not. Written 2026-08-26 from measurement, not impression — every number below was taken off the
Sol Expanse fixture through the real solver.

The owner, 2026-08-26: *"this seems a good time to actually properly tidy up local transfers -
orbit changes and transits to moons, etc. That code IS a bit broken... I think the maths kinda
works but the visualisation is a bit rubbish - and the ship along the path is a 'bit haphazard' -
I gave it up as 'too hard' but that was 3 models ago."* Relaying a user: *"could burns be
visualised, like having your orbit change during it, since the current one looks a bit confusing.
Also ship paths should be visible, and it starts glitching out when you speed up time."*

The instinct is right on both counts, and the causes are now measured rather than guessed.

## 1. What is actually wrong

### (a) A burn is drawn with borrowed path points, and they are physically impossible

`calculateTransitPlan` generates ONE path of `totalPoints` samples spread uniformly over the whole
journey (one point per two days: `max(300, ceil(durationSec / 172800))`), then slices it into
Accel / Coast / Brake by comparing each sample's time against the phase boundaries. A burn lasting
under an hour inside a three-year transfer therefore catches NO samples, and a fallback stuffs the
last two coast samples into it instead. Measured, Jupiter transfer, 0.3 g:

| segment | points | duration | chord between them | implied speed |
|---|---|---|---|---|
| Accel (Most Efficient) | 2 | 0.68 h | 3,356,198 km | **1,371 km/s** |
| Accel (Efficient Now) | 2 | 1.50 h | 3,255,065 km | **603 km/s** |
| Brake (Most Efficient) | 2 | 0.43 h | 1,880,904 km | **1,215 km/s** |

A 0.3 g ship reaches about 10 km/s in an hour. So during its burn the ship is drawn sprinting
across three million kilometres in forty minutes, in a straight line. That is the "haphazard"
motion, and it is worst exactly where the eye is drawn — at the moments the engine is lit.

### (b) The sampler assumes points are evenly spaced in TIME, and interpolates straight lines

`samplePlanPathAtTime` takes the fraction through a segment and indexes
`fraction x (points.length - 1)`, then linearly interpolates between neighbours. Two consequences:

- Any segment whose points are not uniform in time places the ship at the wrong moment. The
  borrowed burn points above are the extreme case.
- Between samples the ship moves along a CHORD, not the arc. On the coast that is one point per
  **48 hours** and a gap of up to **4.1 million km** — invisible at 1x, and exactly what "starts
  glitching out when you speed up time" looks like, because the eye can follow the chord-to-chord
  stepping once the clock moves fast enough.

### (c) There is no orbit-change picture at all

The user's request — *"having your orbit change during it"* — has no representation today. A
transfer between two orbits of the same body is drawn as a path to the body's CENTRE, and the ship
then appears in a parking orbit at a deterministic phase ([[B92]]: measured 90,884 km of step at
Jupiter). The classic Hohmann picture the owner sent — initial orbit, transfer ellipse, final
orbit, burn 1, burn 2 — is the mental model users arrive with, and the app draws none of it.

### (d) The aerobrake dip has nowhere to be drawn

v3.0.78 made aerobraking a real manoeuvre with passes, a dip altitude and a circularisation burn,
and the plan carries `aeroNote`, `aeroTimeSec` and `aeroCirculariseDeltaV_ms`. But the dip itself
has no geometry: there are no path points for it, so the requested purple line has nothing to
follow. It belongs in this design rather than bolted on, because it is the same problem — an
arrival manoeuvre that is real in the numbers and absent from the picture.

## 2. The shape of the fix

**One principle: a segment owns its own path, sampled at its own resolution, in its own frame.**
Everything above follows from one uniform heliocentric sample set being sliced by time.

1. **Per-phase path generation.** Each phase generates its own points over its own duration, with a
   resolution set by what it needs to look right — a burn arc wants tens of points over an hour, a
   three-year coast wants hundreds over years. Cost is bounded because short phases are short.
2. **Time-stamped samples.** Each path point carries its own time instead of being assumed
   uniform. The sampler then interpolates between the two points that actually bracket the query,
   which fixes (b) for every segment at once and removes a whole class of future drift.
3. **Local frames for local transfers.** An orbit change around a planet should be generated and
   drawn in the PLANET's frame — initial orbit, transfer ellipse, final orbit — and composed onto
   the planet's heliocentric motion at draw time, the way `worldPositions` already composes
   everything else. This is what makes the Hohmann picture possible at all.
4. **Manoeuvres as first-class drawable geometry.** A burn arc, an aerobrake dip and a
   circularisation are each a piece of path with a type. Given (1)-(3) the purple dip line is then
   a few points with `type: 'Aerobrake'`, not a special case.

## 3. What this touches

`transit/calculator.ts` (path generation, both plan builders), `transit/scheduler.ts`
(`samplePlanPathAtTime`, `samplePostJourneyState`), `transit/types.ts` (the segment/point shape),
`components/SystemVisualizer.svelte` (`drawTransitPlan`), and `constructs/shipBurn.ts` reads
segment types so a new type must be classified there. `physics/aerobrake.ts` already produces the
numbers the dip needs.

Care: the transit specs pin Δv and timing, NOT path geometry, so they will not catch a regression
here. New gates have to come with the change — the useful ones are "the drawn speed between
consecutive points never exceeds what the ship can do" and "the sampled position at time t is
within one sample of the analytic position".

## 4. Questions for the owner

**Q1 — SCOPE.** Is this the full refresh (per-phase paths + time-stamped samples + local frames +
the Hohmann picture), or the smallest honest fix first (per-phase paths + time stamps), leaving
the orbit-change picture for a second pass? **Recommendation: the smallest honest fix first.** It
removes the impossible burn geometry and the speed-up glitching — the two things users actually
report — without a redesign, and it is the foundation the orbit-change picture needs anyway.

**Q2 — HOW MUCH PATH.** Per-phase resolution costs memory in every saved journey and every
broadcast snapshot. Cap total points per plan (say 1500, distributed by phase), or let each phase
take what it needs? **Recommendation: a cap, distributed by phase**, because journeys ride the
player snapshot and the frame-limit rule already bit once ([[project_dmr_datachannel_frame_limit]]
is the sister-project version of the same lesson).

**Q3 — THE ORBIT-CHANGE PICTURE.** Draw the full Hohmann figure (initial / transfer / final orbit
with both burns marked), or just the transfer arc plus burn markers? **Recommendation: the full
figure** — it is what the user asked for and what makes the manoeuvre legible, and the initial and
final orbits are already known.

**Q4 — THE AEROBRAKE DIP.** Purple line for the dip, as asked. Should the drawn dip show every
pass (a dozen loops for Mars) or one representative dip with the pass count in the label?
**Recommendation: one representative dip, labelled**, since a dozen overlapping loops would be
noise, and the log already says how many passes.

**Q5 — SHIP PATHS ALWAYS VISIBLE.** The user asks for ship paths to be visible generally, not only
for a selected ship. Always on, on a toggle, or only for the selected ship and its neighbours (the
rule we settled for Hill spheres and L-zones)? **Recommendation: the neighbourhood rule**, for
consistency with the two overlays already using it.

## 5. Note on sequencing

This is a workstream, not a patch, and it deserves its own session with the browser available —
every fault in section 1 is a VISUAL fault, and the gates that prove it fixed are numeric but the
verdict is an eyeball. The measurements above are the "before" numbers to beat.

## 6. What pass 1 actually did, and what it found (2026-08-26, v3.0.82)

PASS 1 SHIPPED: per-phase paths and time-stamped samples, in all three plan builders. Q1 answered as
recommended — smallest honest fix first. Q2 answered as recommended — a cap of 1500 points per plan,
distributed by phase, with each phase naming the cadence it wants (`PhaseWindow.spacingSec`) so a
torch plan keeps its two-hour cadence and a Hohmann coast keeps its two-day one. Q3, Q4 and Q5 are
UNANSWERED and pass 2 has not started.

### Before and after, same fixture, same solver

| segment | before | after |
|---|---|---|
| Most Efficient accel (0.68 h) | 2 points, 1,365.8 km/s | 24 points, 19.4 km/s |
| Most Efficient brake (0.43 h) | 2 points, 1,223.1 km/s | 24 points, 10.9 km/s |
| Efficient Now accel (1.50 h) | 2 points, 602.6 km/s | 24 points, 18.8 km/s |
| Efficient Now brake (1.06 h) | 2 points, 496.7 km/s | 24 points, 11.0 km/s |
| Assist arrival brake (1.24 h) | 2 points, 109.6 km/s | 24 points, 13.9 km/s |
| Interplanetary coast | 607 points, 4,106,963 km max gap | 608 points, 4,106,807 km max gap |
| Jupiter-local coast, max turn per point | 56.84 deg | 3.90 deg |

The coast row is the one to read twice: it is the control. The fix adds points to the burns and to
anything that bends, and leaves an ordinary interplanetary transfer alone.

### Two faults that only became visible once the drawing was honest

1. **The display integrator's step was set by the clock.** A flat two-day RK4 march is fine on a
   gentle arc and falls off an eccentric one entirely, because angular rate peaks at periapsis. A
   valid long-way-round Lambert leg with e=0.9986 was being drawn as a 53 AU excursion at 313 km/s.
   The step is now capped by swept ANGLE (0.01 rad), which binds only where the path turns fast.
   FIXED HERE, because it is a drawing fault.
2. **The gravity assist drew leg 2 from a state it was never solved for** — the Bezier's end point,
   over a shortened span, rather than the flyby centre over the solved span. FIXED HERE.

### Structural notes for [[G47]] — the running list asked for

These are seams, not bugs. Each is a place where the subsystem could answer one question two ways.

**S1. FOUR readers each re-derived 'where is the ship at time t' from `pathPoints`.**
`scheduler.samplePlanPathAtTime` (the flight), `constructs/shipRoute.ts` (the drawn route line),
`transit/telemetry.ts` (the HUD) and `TransitPlannerPanel.svelte` (the preview marker) — four
separate pieces of index arithmetic, all assuming even spacing, one of which had a comment asserting
the assumption as a fact. They now share `samplePathAtTime`. This is the clearest instance of the
duplication rule in the subsystem and it is worth asking what ELSE is derived four times.

**S2. `pathPoints` is edited in two places after the solver has finished with it, and neither is in
`transit/`.** `SystemView.svelte` prunes a completed journey to three points to save memory;
`starmapSanitizer.ts` filters unreadable ones on the way in. Both had to be taught to carry
`pathTimes` in lockstep. A parallel-array contract that anything outside the module may edit is
fragile by construction — the honest shape is a point that carries its own time, not two arrays.

**S3. The drawn gravity-assist flyby is a cosmetic cubic Bezier, not the flown hyperbola.** Its
parameter is not time, so its stamps are an even spread rather than a truth. Its implied speed
measures 2.9 km/s average against a 4.4 km/s peak — inside what the ship can do, so it is not lying
loudly — but the app draws a curve there that no part of the physics computed. The flyby body's own
frame is where that arc belongs, which is exactly the 'own frame' half of the principle this item
was built on and the one part of it pass 1 did not need.

**S4. Segment states are widely zero.** `calculateFastPlan` writes literal `{r:{x:0,y:0},
v:{x:0,y:0}}` for accel-end, coast-start, coast-end and brake-start; `calculateLambertPlan` writes
`v:{x:0,y:0}` on most of its segment states. `shipRoute.ts` already carries a long comment about
having been burned by reading them. So a segment does NOT reliably know where it starts or ends, and
every consumer has learned to route around that rather than through it. Whoever reviews this should
decide whether a segment's states are truth or decoration, because at the moment they are both.

**S5. Three plan builders, three conventions for the same job.** Lambert slices phases from one
integration; Fast did the same with different arithmetic (`makePoints`); assist carved phases out of
a leg with an interpolating `sliceAt`. All three have been brought onto `buildPathSchedule` +
`slicePhase`, but they still differ in how they choose a frame, whether they run past their own end
for a drift target, and how they handle non-finite guards (Fast sanitises; the other two do not).

**S6. Drift correction is a linear lerp that hides solver error rather than reporting it.** When the
integration misses the target, the whole path is smeared to close the gap. It is applied by time now
rather than by index, which is correct, but it still means a badly-solved leg is drawn as a
well-solved one and only the endpoint is honest. The 'straight transit lines' bug noted in
`calculator.ts` was this interacting with n-body perturbers. This is the mechanism that concealed
[[B93]] for as long as it existed.

**S7. The specs measure cost, never shape.** Recorded as RENDER-S33. Worth deciding whether the
review's deliverable should include a standing geometric gate for every plan family rather than the
one this item shipped.

### Documentation debt

None of the four user-facing explainer surfaces describe path sampling — this is a rendering
contract, not a physics term, tag or threshold — so none needed updating and none were. Recorded
here rather than left silent. `docs/dev/transit-architecture.md` does NOT yet describe the
per-phase contract; the engine-map entries RENDER-S32 and RENDER-S33 are the authority meanwhile,
and folding them into the architecture doc belongs with the [[G47]] review that may reshape it.
