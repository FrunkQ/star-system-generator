# Deep time: age, origin, and the road to stellar and galactic evolution

Started 2026-09-08 at the owner's word: *"This is all the beginnings of useful stuff for 3.2 and 4 for
galactic/stellar evolution. So feel free to start a NEW system to store and work with this stuff."*

It began as a bug — a brown dwarf that would not keep a temperature you typed ([[B150]]) — and grew into a
model, because the honest fix for that bug is the same machinery V4 needs. This file is where the model lives.
The board rows ([[B150]], [[G94]]) are the capture and the decisions; this is the design they add up to.

---

## 1. The one idea

**A body has two independent histories, and the engine should be able to state both.**

| axis | question | tag family | today |
|---|---|---|---|
| **WHEN** | when did this thing form? | `age/` | new, [[G94]] |
| **WHERE FROM** | where did it come from? | `origin/` | exists: `captured`, `migrated`, `generated`, the hub pair |

They are separate on purpose, and keeping them separate is the whole design. **Their composition is what says
something interesting**: a body tagged `origin/captured` *and* `age/primordial` is a primordial rock this
system picked up, and neither half had to know about the other to say so.

**This split is also the test every later feature has to pass.** A galactic merger and a stellar collision must
each be a NEW MEMBER OF `origin/` and touch the age model not at all. A star flung in by a merger keeps its own
formation time and gains an origin; a planet smashed and rebuilt moves its own formation time forward and its
age tags follow by themselves. *If a new feature needs the age model reopened to describe it, the split is
wrong — stop and say so.*

---

## 2. The time axis

[[G62]] already put a stake in the sand: the master clock is absolute, seconds from the big bang, and
`temporal/utre.ts` carries `BIG_BANG_TO_UNIX_EPOCH_T` = 435084631200000000 — **13.787 Gyr**, the real age of
the universe. Everything here rides that axis rather than inventing one.

- **t = 0** is the big bang.
- **The comparison point** is the host star's formation.
- **The right-hand end** is the campaign's own reference date — so a far-future campaign has more room, and
  nothing may be older than the universe was on the day the campaign is set. The bound is DERIVED, never typed.

**No clock is changed by any of this** (the owner, settling it): a body's age is stored and independently
editable. Sliding an age does not move the clock; scrubbing the clock does not change an age. The trap — physics
depending on the display clock, which the transit work deliberately separated — is not guarded against, it is
never created.

---

## 3. A body's age

**It is a PROPERTY, not an override, and it fires the TAG engine rather than the anomaly engine.** A body older
than its system is a *history*, not a cheat: a captured object formed elsewhere, a second-generation body, a
planet rebuilt after a collision. All of V4's cases are histories, so none of them is an anomaly.

This is also why it is the right fix for [[B150]]. Pinning a temperature *fights* the cooling track — the number
sits on top of a model that goes on disagreeing with it. An age *drives* it: an older brown dwarf really is
cooler, by the same law, and the value survives a reprocess because it is an INPUT rather than a derivation.
**Give the GM the cause, not the consequence.**

**ABSENT MEANS INHERIT.** A body with no age of its own uses the system's, and the system's age is *never*
stamped onto bodies when saving — do that and a GM who later ages the system finds it no longer reaches
anything, which is exactly the fault the rule-pack deltas exist to avoid.

**Store a formation time on the absolute axis**, and derive the age. A duration would need migrating the moment
V4 tracks formation properly, and a rebuilt planet simply moves its own formation time forward.

---

## 4. The slider, and the floor

The owner's design, with the refinements agreed on the [[G94]] row:

```
 big bang                        floor        ★ formation                     campaign date
    |------------ (blocked) -------|~~~~~~~~~~~|▓▓▓▓|===========================|
                                   ^ fourth     ^red  ^orange      ^green
                                     zone             accretion     lifetime
```

- **RED point** — the host star's formation. For a captured body this is deliberately *not* where it formed;
  that is what the tag is for.
- **ORANGE band** — the accretion phase. Landing here is the ordinary case: the body formed with its system.
- **GREEN line** — the star's lifetime to the campaign's reference date. A body here is `age/young`.
- **The fourth zone** — from the composition floor up to stellar formation. This is where captured, ancient and
  primordial bodies live, so it must be drawn and labelled: it is the most interesting part of the scale and
  leaving it blank would be the one thing this design got wrong.

### The floor is a function of what the body is made of

This is the metallicity argument, made out of data that already exists: `physics/makeup.ts makeupFractions`
gives every body `metal / rock / carbon / ice / gas`, inferred from density when it is not authored.

| what it is made of | how far back | why |
|---|---|---|
| **gas** (H/He) | cosmic dawn — the first stars, ~100–250 Myr after the big bang, **not** the big bang | hydrogen and helium are primordial |
| **ice** (C, N, O) | ~one generation | those come from the first massive stars |
| **rock / metal** | ~three to four generations (the owner's figure) | a substantial rocky body needs enough Si, Mg and Fe to have ACCUMULATED — a threshold on abundance, not a switch on availability |
| **a black hole** | the big bang itself | a primordial black hole forms from density fluctuations in the first second, before any star |

So the floor is a **curve over the makeup fractions, plus a read of KIND** — not a two-way test. And every
number in it (generation length, the cosmic-dawn offset, the per-makeup thresholds) is **pack data**, because
these are precisely the figures a human will want to tune.

### The floor resists; it does not refuse

Passing the floor corrupts nothing — it is merely implausible — so this is the case STEER, DON'T STOP was
written for, and "alien tech / unobtanium / plot device" is the owner's own list. **Detent at the floor, take a
deliberate push to pass it, and tag the body that is beyond it.** [[G45]] is the precedent: two authored-wrong
worlds read *Very Unstable* and the map was not touched.

*(Contrast [[A102]], where the ruled-out solvents ARE disabled — there the objection is not "the physics
disagrees" but "the data model would break", because hydrosphere and atmosphere are coupled. The distinction
matters: refuse only when a choice would corrupt a neighbour.)*

---

## 5. The `age/` family

| tag | band | kind |
|---|---|---|
| `age/young` | younger than the host star | relative |
| `age/old` | older than the host star | relative |
| `age/ancient` | older than the host by ≥2 stellar generations (the owner's "2–3 stars ago") | relative, in generations |
| `age/primordial` | formed in the early universe | absolute |

Two are relative and two are absolute, and the difference is load-bearing: the relative pair keeps working for
a young host, the absolute pair keeps meaning something whatever it orbits.

**What is NOT here: metallicity.** The engine has none — no `metallicity`, no `[Fe/H]`, no population field.
So `ancient` and `primordial` are derived from age alone today. That is honest but incomplete: a primordial rock
should also be metal-poor. **Word the tag descriptions to say the age is what was measured**, and treat
metallicity as the cross-check these tags will one day get. The composition floor above is the nearest thing to
it that exists, and it is a good deal better than nothing.

---

## 6. Where this is going

The owner: *"as we move on to galactic mergers and stellar collisions we need a robust system."*

Each of these should be an addition, not a redesign. If one is not, this document is wrong and wants fixing.

- **Formation times** — already the storage choice above.
- **Captured bodies** — `origin/captured` exists and is emitted by generation today.
- **Rebuilding planets smashed in-system** — the body's formation time moves forward; its age tags follow.
- **Rogue planets** — no host, so no red pin and only the cosmic axis. Falls out for free.
- **Primordial black holes** — the one floor that is the big bang. Falls out for free.
- **Galactic mergers** — a new `origin/` member. A star keeps its own age and gains a provenance.
- **Stellar collisions** — a new `origin/` member, and a formation time that moves.

---

## 7. Open

- The `age/` band edges, and the generation length, as pack data — first values want a human's eye.
- Whether a STAR carries its own age too. It should: `flareActivity` reads age, and a captured companion is a
  real case.
- Metallicity, whenever it arrives, and the cross-check against `age/ancient` and `age/primordial`.
- Where the control lives on the body's panel, and its label — **Age**, not "time", which in this app means the
  campaign date and already has a clock, a calendar and transit times attached to it.

---

## 8. If this document is wrong

Correct it in the same commit as the work that proved it wrong. A design note that is trusted and stale is worse
than none — the same rule the engine map lives by, for the same reason.
