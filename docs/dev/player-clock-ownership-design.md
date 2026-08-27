# Who owns the clock on a player view — design note (G49)

Status: **ROUTE (A) SHIPPED at v3.0.102** — the clock-ownership rule, answered by the owner in the session that produced this note. Q1, Q2, Q4 and Q5 are settled (see section 7); Q3 is settled by construction. **Route (B) — the compact parked descriptor, which closes [[B96]] — is NOT started.**
Written 2026-08-27 from measurement and from reading the four surfaces that already touch this, not
from impression.

The owner, 2026-08-27, on a ship that had arrived at Earth on his map and sat motionless on the
players': *"The time on the player view is just to be illustrative — to show orbits — which is why we
DON'T have a time showing. On GM view it 'holds the time', and the 'view time' is what is shown on the
player view. So when the GM is advancing time on the GM view, we need to wrest control of the view and
align it — as the Roci probably thinks it hit Earth but Earth moved on in the player view. When the GM
is updating time we effectively need to lock out the time controls on the player view... and on 'follow
GM' the user view has no time controls at all."*

And then the part that decides the shape of the fix: *"Keplerian dynamics means we should be able to
set time on the player view easily enough. We just need to indicate to the players they cannot mess
with time when it is actually relevant — i.e. transits, GM control, and the GM actually advancing the
clock."*

He also named the real problem: *"we are wrestling an unclear and undefined user interface issue we
have kinda skipped over without thinking."*

## 1. The clock model that exists today

Most of it is already built, and built deliberately. This is not a hole so much as an unfinished idea.

| mode | time controls | clock readout | what it runs on |
|---|---|---|---|
| `followGM` | **hidden** | campaign time, in the campaign's own calendar | the GM's absolute time AND rate; snaps on >1 s drift |
| interactive, not following | play/pause, a rate ladder (1 s .. 10 y per second), a `↺` reset | **none, deliberately** | its own rate |
| non-interactive, not following | **none at all** | none | its own default rate, and no way home |

`followGMActive = (overrideFollowGM ?? activePreset.followGM) ?? false` — so the GM can force it live
from the Player Views modal, or bake it into a preset. `SYNC_TIME` carries `{currentTime, isPlaying,
timeScale}` on a 1 Hz heartbeat; the player advances locally between beats and snaps when it drifts.
The clock deliberately does NOT ride the campaign snapshot (a few dozen bytes against ~400 KB), and
`masterTimeSec`/`displayTimeSec` are in `VOLATILE_KEYS` so a running clock does not re-broadcast the
whole starmap.

The free-running case is documented as intentional, in the code: *"A free-running local clock diverges
from the GM's by design (this is the mess-about mode)"*, and the readout is deliberately omitted
because *"naming an arbitrary time would dress the mess-about mode up as the campaign's"*. There is
even a divergence indicator: `clockAdrift = |local - campaign| > 1 hour`, which lights the reset
button.

**So the intent is right and the plumbing is right.** What is missing is that "adrift" does not mean
the same thing for everything on the screen.

## 2. What is actually wrong

**A FREE CLOCK IS EXACTLY RIGHT FOR A WORLD AND EXACTLY WRONG FOR A SHIP, AND NOTHING SAYS SO.**

The owner's Keplerian point is the whole of it. A body's position is closed-form in time: give the
player any clock at all and every planet, moon, belt and ring is drawn CORRECTLY FOR THAT CLOCK.
Nothing is lost. That is why the mess-about mode is a good idea.

A construct is not closed-form. Its truth is the GM's `scheduled_journeys`, and `slimNode` strips those
from every player snapshot — for good reasons (huge `pathPoints` arrays, and a forward plan that must
not cross). Two compact substitutes are published in their place, and the note beside them states the
principle exactly: *"The player evaluates them against their own clock, so the plume stays live between
snapshots."*

- `driveBurns` — when, how hard, which way. Live at any clock.
- `route` — the flight's own segment boundaries. Live at any clock, **for the duration of the flight**.

There is no third one. **After the route ends there is nothing**, and the player falls back to
`vector_position_au`: a single position the GM stamped at one instant. The plume stays live; the
position does not.

### Measured, on the owner's own Rocinante

His save, replayed through the real code. The ship has completed a 243-day flight to Earth low orbit.

| | at t | one hour later | moved |
|---|---|---|---|
| GM (has the journeys) | 0.99531 AU, `Orbiting` | 0.99539 AU | **112,105 km** |
| Player (journeys stripped) | 0.99529 AU | 0.99529 AU | **0 km** |

Both are 6,536 km from Earth at the same instant, so the player has it in the right PLACE. It simply
never moves again. The GM sees it orbiting because `samplePostJourneyState` gives it a live parking
orbit; the player has no such thing.

Then add the clock divergence the owner suspected — Earth moving on while the ship stands still:

| player clock lags the GM by | frozen ship → Earth |
|---|---|
| 0 | 7,000 km (correctly in orbit) |
| 1 day | 2,585,000 km |
| 7 days | 18,103,000 km |
| 30 days | 76,986,000 km |
| 182 days | 299,134,000 km |

**One day of drift puts the ship 2.6 million km from the world it is parked at.** The existing
`clockAdrift` threshold of one hour is therefore well chosen — but it is wired only to the visibility
of a reset button, not to the thing that actually breaks.

### The third case, which nothing covers at all

A preset that is neither interactive nor following has NO time controls and does not follow: it
free-runs at its default rate forever, with no readout, no reset, and no way for the reader to know
their sky is not the GM's. That is the projector/table-display tier — the one most likely to be left
running all evening.

## 3. The two routes, and why they are not alternatives

**(A) LOCK THE CLOCK when something time-sensitive is on screen.** The owner's instinct, and it is a
presentation rule: while the GM is running the scene, everyone looks at the same instant. Cheap,
honest, and it makes "we are all in the same moment" visible.

**(B) MAKE A CONSTRUCT AS TIME-FREE AS A WORLD.** Publish a compact PARKED descriptor beside
`driveBurns` and `route` — host, radius, mean motion, phase, epoch — so the player can compute a parked
ship's position at any clock, exactly as it already computes a burn and a route. This is the third
instance of a rule the codebase already applies twice, and it is small.

They are not competing. **(B) is correctness** — without it a parked ship is frozen even when the
clocks agree, which is the bug as reported. **(A) is presentation** — with (B) done, a free clock
becomes merely a different moment rather than a wrong picture, and the lock is then about attention
rather than about truth. Doing (A) alone would hide the fault rather than fix it: the ship would still
be frozen, it would just be frozen at the GM's instant.

## 4. What "time-sensitive" means, precisely

The owner's three, made testable:

1. **A construct is placed by something the player cannot recompute.** After (B) this shrinks to: a
   ship in FLIGHT whose route the player holds — still fine — versus one whose placement needs the
   journeys. If (B) is complete, this condition may empty out entirely.
2. **The GM is driving** (`followGM`, from the preset or the live override). Already handled: controls
   hidden, campaign clock shown.
3. **The GM is actively advancing the clock.** Currently invisible to a non-following player. This is
   the one with no representation at all — `SYNC_TIME` carries `isPlaying`, so the player already
   KNOWS, and does nothing with it.

## 5. Questions for the owner

**Q1 — DOES A FREE CLOCK SURVIVE AT ALL?** Keep the mess-about mode (a player scrubbing their own sky,
which Kepler makes free and correct), or is the player view always the GM's instant?
**Recommendation: keep it.** It is the only way a table display is useful when the GM is not driving,
and after (B) it costs nothing in correctness.

**Q2 — WHAT DOES THE LOCK LOOK LIKE?** When the GM starts advancing, do the player's controls
disappear, or grey out with a reason? **Recommendation: grey out, with the reason.** A control that
vanishes reads as a bug; one that greys with "the GM is running the clock" teaches the rule once.
Disappearing is right for `followGM`, where the mode is the whole point and the campaign clock takes
the same space.

**Q3 — WHO WINS WHEN THE LOCK ENGAGES AND THE PLAYER IS SCRUBBED AWAY?** Snap them to the GM's
instant, or hold and offer a "catch up" affordance? **Recommendation: snap.** The lock exists because
the GM wants everyone looking at the same thing; leaving a reader behind at their own time defeats it.
The existing `↺` already does this by hand.

**Q4 — DOES THE NON-INTERACTIVE TIER FOLLOW BY DEFAULT?** A projector preset that neither follows nor
offers controls free-runs forever today. **Recommendation: yes, follow by default** — a display with
no controls has no way to be wrong on purpose, so it should be right by default.

**Q5 — DOES THE PLAYER GET A CLOCK READOUT WHEN NOT FOLLOWING?** Today it is deliberately blank, so an
arbitrary time is not dressed up as the campaign's. **Recommendation: show it, but marked** — "your
time, not the campaign's", or the campaign time with an offset. The current blank is the reason a
reader cannot tell the mess-about mode from the real one, which is the fault the owner is describing.

## 6. Scope note

(B) is a contained change with a clear precedent and a spec-able surface — it is the one to do first,
and it fixes the reported bug on its own. (A) is a UI pass across three surfaces (`catalogue/+page`,
the preset editor, the Player Views modal) and wants the Q1-Q5 answers before anything is written.

`[[B96]]` is the bug this note came out of and should be closed by (B). `[[G47]]`'s question — "who
owns a segment's truth and can any two answer the same question differently" — is this note's question
with a different noun: the GM and the player can both answer "where is that ship", and they do not have
to agree.

## 7. What the owner settled, and what shipped as route (A)

Answered in the same conversation, and tighter than the questions were:

> *"Unless the GM says time is important by RUNNING TIME, or it is follow GM — so the GM view and
> player view align. Otherwise the players are free to play with it as a tool; ships will not MOVE
> on their version, as it is not 'true time'."*

> *"When the players can't scrub time it shows the GM time."*

**Q1 — does a free clock survive? YES.** It is a tool, and Kepler makes it correct for every world.
**Q2 — what does the lock look like?** Controls away; `followGM` needs no explanation because the
mode is the explanation, a RUNNING clock does because a control that was there a second ago has
gone. **Q4 — does the display-only tier follow? YES**, when there is a GM to follow. **Q5 — a
readout when not following? YES, whenever the reader cannot scrub** — that is the owner's own rule,
and it makes the controls and the readout exact complements.

Q3 (who wins when the lock engages mid-scrub) is settled by construction: the view snaps to the
GM's absolute time on the next heartbeat, which is what `followTime` already did.

### The rule, as shipped

`player/clockOwnership.ts` — outside the component so it can be tested without a DOM, and so its
two faces cannot drift apart:

```
canScrub  = presetInteractive && !followGM && !gmRunning
onGmClock = followGM || gmRunning || (!presetInteractive && gmTime !== null)
```

**`onGmClock` is deliberately NOT `!canScrub`.** A display-only view with no GM connected has no
controls and no GM clock to be on: it keeps its own and the readout stays blank, rather than naming
a campaign time it is not actually showing. Reading one off the other would have reintroduced the
exact lie the blank readout exists to prevent.

`SYNC_TIME` has carried `isPlaying` all along and nothing read it — the player knew the GM was
running and did nothing with the fact.

### Still open

**Does selecting a ship IN TRANSIT force the lock?** The owner raised it — *"the only way the
transit line makes sense, i.e. you see where it ends, and the time is forced to the current GM view
time"* — and then qualified it with the RUNNING TIME / follow-GM rule above, which reads as the
narrower answer. The two readings differ materially: a selection-triggered lock is a real behaviour
and would take the clock away from a reader who was mid-scrub, on a click. Not built; asked.

**Route (B) is untouched**, and it is the half that fixes the reported bug: even perfectly aligned,
a parked ship is frozen on a player view, because nothing publishes where it is after its route
ends. Route (A) makes the clocks agree; it does not make the ship move.
