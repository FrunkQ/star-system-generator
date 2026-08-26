# Local transfers and how a journey is drawn — design note (G46)

Status: DESIGN, awaiting the owner's answers to Q1-Q5 at the end. Nothing implemented from this
note yet. Written 2026-08-26 from measurement, not impression — every number below was taken off
the Sol Expanse fixture through the real solver.

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
