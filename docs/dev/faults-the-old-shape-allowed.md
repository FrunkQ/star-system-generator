# FAULTS THE OLD SHAPE ALLOWED — the IMPLEMENTATION bucket, read the useful way round

Written 2026-08-28 by the carry-forward sort, at v3.0.149, from the 205 entries in `engine-map.md`.
Criterion: `engine-map-carry-forward.md`.

**WHAT THIS IS.** `engine-map.md` now carries a `BUCKET:` field on every entry. Three of the four
buckets carry forward as content — DOMAIN verbatim, ARCHITECTURE as requirements, PLATFORM labelled
by platform. The fourth, IMPLEMENTATION, is true of this code and probably not of the next, and the
criterion doc is explicit that **nothing from it ships into the new map as a rule.**

That does not make it worthless. It makes it the most interesting bucket, read backwards. For each
entry the question is not *what does this say* but:

> **WHAT SHAPE WOULD HAVE MADE THIS IMPOSSIBLE?**

Four implementations of one tag pill. Two pickers that are not duplicates. A store one generation
behind its own names. As a set these are not a list of bugs — they are a description of the
**pressures this architecture put on the people working in it**, and that is the input the new engine
should be designed against.

**THE STANDARD TO AIM AT IS ALREADY IN THE FILE.** `RENDER-S12` replaced six mechanisms sitting
between "here is where the camera goes" and the camera going there, and its own words are the bar:

> *"Four of them become impossible here rather than merely fixed."*

A moving subject cannot outrun the shot, because the base IS its position. A rebuild cannot disturb
it, because a rebuild is just a new base. That is what a good shape does, and it is what every
section below is measured against. Where SSE already reached that bar, it is named — those are the
proofs the fix is available rather than aspirational.

**HOW TO READ IT.** Nine shapes. Each names its exhibits by engine-map id, says what the shape made
people DO (not what went wrong — what it made them do, repeatedly, while behaving reasonably), then
proposes the shape that removes the possibility. The proposals are design input, not decisions.

---

## 1. One concept, N implementations, because there was nowhere to put the one

**Exhibits:** `TAG-18` (the tag pill — FOUR), `UI-C3` (one shape table, two emitters), `TAG-20` /
`RENDER-B2` (four renderers of one badge, five with the document), `RENDER-S35` (the band-contrast
rule, once per projection), `RENDER-S38` (four literal slate blues across two painters),
`RENDER-S28` (the gallery keeps its own corona), `UI-E1` (the GM block is not built from `bodyFacts`),
`DATA-R17` (one lookup, three copies), `M7` (five Hill radii), `PHY-13` (eight belt exclusions),
`M2` (thirty sites, one expression).

**What the shape made people do.** Not one of these was written by someone being careless. Each was
written by someone who had a thing to draw and no reachable authority to draw it from. The tag pill
is the clearest: the four surfaces are in four *languages* — a CSS chip, a canvas rect, an SVG rect,
a three.js label sprite — and **CSS and TypeScript cannot import from each other**. There was no
shared runtime for "what shape is a pill", so four people each wrote the shape they needed. The
starmap's version sized itself by `label.length * 3.6 + 6`, a CHARACTER COUNT, so `WWWWWWWW`
overflowed its own rect by 50% and `iiiiiiii` sat in one 45% too wide. Nobody chose that; it is what
you write when the alternative is unreachable.

`UI-C3` shows what the duplication then costs and where it shows first. Four copies of a glyph table
"agreed today, nothing enforces it" — except they did not agree: the SVG copy fell back to a DIAMOND
where the resolver and both canvas copies fell back to a TRIANGLE, so **the commonest case in the
product — a construct with no authored icon — drew differently on the starmap than everywhere else,
and nobody had noticed.** Its own line is the general law and deserves to survive this document:

> *"When you duplicate a lookup, the branch that diverges FIRST is the one no author ever selects.
> Review of a duplicated table looks at the entries; the drift is under them."*

**What would have made it impossible.**

- **One medium, or one authority in data and thin emitters per medium.** `TAG-18` eventually got
  there — geometry as em proportions in `tagPill.ts`, CSS consumers reading tokens, canvas and SVG
  consumers calling `tagPillMetrics(fontPx)` — but the seam is held shut by a spec that PARSES
  `tokens.css` and asserts four numbers still match. **A red test is the only thing standing between
  two languages.** A new engine whose presentation layer is one medium never has that seam. If it
  must have two, the second is GENERATED from the first, not tested against it.
- **The authority is the only way to obtain the value.** `RENDER-S11` is the shape done right: the
  size law is a pure module taking an explicit `{bodySize, rMax, gridRadius}` context, and *"a caller
  that cannot pass the context is a caller that is about to disagree about scale."* There is no
  ambient version to read instead.
- **Where a second copy is unavoidable, bind it BEFORE there is anything to reconcile.** `RENDER-S24`
  did this deliberately — the depth-curtain constants were shared while only one surface had a dial
  and there was no bug to report — and its line is worth carrying: *"that is the cheapest moment to
  bind two surfaces."*

---

## 2. Two answers to one question, held in agreement by something incidental

**Exhibits:** the whole `## OPEN MISALIGNMENTS` section by construction — `M1` (a repair that happens
to run first), `M2` (a shared constant), `M4` (a fold that HID the sharing), `M5` (nothing replays
it), `M7` (the two never had to agree) — plus `SYNC-1` (two stores holding "the same" system),
`DATA-R19` (two unit fields safe only because a load-time fold makes them agree), `PHY-11` (two
writers of one mean motion, two formulas one ulp apart), `RENDER-S25` (two writers of one GPU
channel), `DATA-R26` (a host from one source joined to a number from another).

**What the shape made people do.** Nothing. That is the point, and it is why this class is so
expensive. Every one of these works today. `M1` holds because `reconcileGiantMakeup` runs twice
before either helper is consulted. `DATA-R19` holds because sixteen files read `.distanceUnit`, six
read `scale.unit`, and only three ever implemented the precedence — the other nineteen are safe
**only** because a load-time fold makes the two agree, and the entry has to say *"do not delete that
fold thinking it is redundant."* That sentence is the shape's whole signature: a load-bearing
coincidence that reads as tidy-up bait.

`SYNC-1` is the one that reached users. Two containers held something that looked like the right
system; every screen a GM can see reads the live one, so **a divergence is invisible on the GM side
by construction** and showed up only in what players received — three tags appearing and
disappearing on every snapshot as the two copies took turns.

**What would have made it impossible.**

- **A derived quantity has exactly one PUBLISHER, and consumers read the published field.** `PHY-30`
  is this done right and should be the template: a barycentre publishes `circumbinary.innerAU` and
  `outerAU`, and *"nothing may re-derive either edge"* — precisely because a boundary that is DRAWN
  from one formula and JUDGED by another puts a condemned planet visibly inside the safe zone.
  `LGR-1` is the same move for L-points, after five rival conventions had shipped.
- **Where two answers are genuinely wanted, make that a first-class, named fact.** `PHY-29` is the
  counter-example done properly: two Hill-sphere questions, two wrappers, two deliberately different
  floors, both stated, and an explicit *"do not re-merge them."* The fault is never "there are two";
  it is "there are two and nothing says so."
- **Identity, not equality, where one object is held twice** — and note that `SYNC-1` names the
  instrument gap itself: *"a repetition test is the wrong instrument for a two-copy fault."*
  `idempotence.test.ts` was green throughout. If the new engine ever lets one model be held by two
  containers, it needs the identity invariant on day one, and it is a DIFFERENT test from PHY-1's.

---

## 3. Engine behaviour keyed to a vocabulary the engine does not own

**Exhibits:** `TRANSIT-1` (autopilot reads flight parameters out of user-editable tag data, by slug),
`TRANSIT-2` (three status slugs and a readiness number are engine constants living in user data),
`TAG-12` (SYSTEM means undeletable, not undisableable), `DATA-R12` (a destination that exists is not
a destination anything reaches), `RENDER-S28`'s BLAST (`star/` was unusable as a namespace because a
legacy detector strips it).

**What the shape made people do.** `TRANSIT-1` is the sharpest sentence in the map on this:

> *"`readiness` looks like a display property on a status chip; it is a thrust multiplier. A GM
> editing the CoI list is editing ship performance."*

Readiness 0 refuses a journey outright; a fractional readiness MULTIPLIES `maxG` so a damaged ship
limps. And the matches are silent on failure: delete `purpose/mining` and `suggestedAction()` simply
returns a different default. **Nothing says a capability stopped being recognised.**

`TRANSIT-2` shows what it costs to make this safe, and how rare that is: the engine RE-ADDS three
status slugs on every normalise and re-writes `status/adrift`'s `readiness: 0` each time, *"repairing
the vocabulary it depends on rather than trusting the file"* — and the entry has to add that **this
repair is the only one of its kind.** `purpose/*`, `drive/*` and `resource/*` have no equivalent.

`DATA-R12` is the same shape seen from the data side: `star/red-giant`, `star/NS`, `star/BH` and
`star/magnetar` were defined with real figures for a long time and **nothing could reach any of them
from a catalogue row.** An unreachable destination does not error; the lookup falls through to
something plausible, and *"the plausible answer is the whole problem"* — every neutron star, pulsar
and black hole inside 326 ly imported as a 0.265-solar-mass red dwarf.

**What would have made it impossible.**

- **The engine DECLARES its own keys and projects them into the user's vocabulary; it never reads
  them back out of user storage.** A GM's tag list should be able to say "call this one Adrift" and
  never "this one means readiness 0". Where behaviour must be tunable, it is a typed field on an
  engine-owned record that the UI edits, not a slug the engine greps for.
- **Every slug the engine matches on is REGISTERED, and an unmatched engine slug is loud.** Even
  keeping the current coupling, a registry plus a startup assertion turns `TRANSIT-1`'s silence into
  a message. `TRANSIT-2`'s repair is the manual version of this; a registry makes it structural.
- **Reachability is a property with a test, not a review question.** `DATA-R12`'s rule —
  *"before adding a band, a class or a template, ask WHAT ROUTES TO IT"* — is a question a human must
  remember to ask. Enumerating declared destinations and asserting each is reachable from some input
  is a test that does not go stale, which is `DATA-R13`'s law applied to `DATA-R12`'s fault.

---

## 4. A flag every writer honours separately

**Exhibits:** `UI-C4` (`ImageRef.custom`, read by three unrelated passes), `TAG-1`'s CAVEAT
(`survivesRederive` honoured by the one owner AND by a hand-rolled namespace strip),
`PHY-22` (`-1` as a sentinel, read four ways by four consumers).

**What the shape made people do.** `UI-C4` names the trap exactly, and it is a REVIEWER's trap rather
than an author's:

> *"a reviewer checks the processor, finds `custom` honoured, and concludes the flag is respected
> everywhere. It is not; each writer honours it separately."*

The star's writer runs from an effect that re-fires every pass by design, *"so an unguarded custom
star image is overwritten before the GM lets go of the mouse"* — a feature that appears to work and
silently does not.

`PHY-22` is the same shape in a numeric field. `-1` meant "this body has no surface, so an ascent
budget is meaningless" — and **-1 is truthy**, so two of four consumers published "Ascent Δv −0.0
km/s" for every belt and ring, a third printed "−1.0 m/s", and only the tag gated properly. Four
consumers, four ideas of what one number meant.

**What would have made it impossible.**

- **Do not publish permission; publish the GATED OPERATION.** Not `image.custom` for three writers to
  check, but `setDerivedImage(node, value)` which no-ops when a custom one is set. The flag then has
  exactly one reader and cannot be forgotten, because forgetting it means not writing the image at
  all. `PHY-28` is this move done right for a comparison — one predicate, so *"the helper turns that
  coincidence into a guarantee."*
- **A sentinel is a type, not a value.** `PHY-22`'s own fix is the predicate `ascentBudgetApplies`
  with a `reason`; a discriminated union (`{applies: true, ms} | {applies: false, reason}`) makes the
  four-way misreading unrepresentable rather than forbidden. And note `PHY-9` is the same fault one
  level up — *"a placeholder zero is a CLAIM, not an absence"* — and `UI-C8` is it one type over:
  **an empty list is not an absent key**, and writing `[]` into a record pinned 17 of 33 gases to
  that day's rule pack for a GM who merely opened the editor and pressed save.

---

## 5. A name that means two things depending on who is asking

**Exhibits:** `RENDER-B2` and `TAG-20` ("the 2D system view", "the player's 2D starmap"),
`SYNC-2` (`computePlayerSnapshot` vs `computePlayerStarmapSnapshot`), `DATA-R19`
(`distanceUnit` beside `scale.unit`), `M3` (three word-vocabularies in one info block),
`DATA-R8` (a stored field that is not what the app reads).

**What the shape made people do.** `RENDER-B2` cost a whole work item: A37 asked for every grid style
to be added to `Starmap2DView`, *"the larger half of the item"* — a component **mounted nowhere**.
That work could never have appeared on screen. One level down, a previous session wired
`SystemVisualizer` believing it was the player's 2D map; it is the GM's orrery. The name was right
for one audience and wrong for the other, and nothing in either name says which.

`SYNC-2` is the version that costs bytes rather than days, and its self-diagnosis is the transferable
part:

> *"both are named for the player and both return something a player may see, so the per-system path
> reads as a smaller version of the whole-map one. It is not: it is the UNSLIMMED one."*

`SYNC_SYSTEM` therefore publishes the dense `pathPoints` arrays that `slimNode` exists to keep off
the wire — ~245 KB per send, on the hottest path in the app, in a file whose own header explains why
those arrays must never be broadcast.

**What would have made it impossible.**

- **Name a function for what it DOES, not for whom it is for.** `redactForAudience` and `slimForWire`
  cannot be confused; two things both called "the player snapshot" always will be. `SYNC-2`'s durable
  half — redacting and slimming are different jobs — only becomes visible once the names say so.
- **A view has an AUDIENCE parameter, not an audience-specific name.** Where two surfaces genuinely
  differ, the difference is a value (`audience: 'gm' | 'player'`) resolved at one call site, which is
  `TAG-21`'s rule already: *"resolve markers where the AUDIENCE is known, not in the renderer."*
- **Delete the dead one in the same commit.** `Starmap2DView` was left in place and annotated because
  *"whether it is a discarded prototype or an intended lighter renderer is not a docs decision"* —
  which is correct, and is exactly how a wrong destination survives long enough to absorb a work item.

---

## 6. A store one generation behind its own names

**Exhibits:** `TAG-11` (`coiCategories` / `poiPacks` / `reasonsConfig` are read-only views awaiting
their last consumer), `GEN-1` (`Starmap.generationEngine` survives as a dead untyped key),
`CLASS-1` (`ClassifierSpec.rules` survives as `unknown[]`, read by nothing),
`M4` (a preset field shared by two stages, closed once WRONGLY before it was closed properly).

**What the shape made people do.** `TAG-11`'s history is the honest bit: PoI and CoI were *"the same
shape in two stores with two file formats and two disagreeing definitions of 'core'."* Unifying them
was right. But the unification left derived views standing so existing consumers kept working, and
those views are still there — mutating them does nothing, silently. **Every reader has to know that
the obvious write is a no-op.**

`M4` shows the second-order cost, and its lesson generalises past migrations:

> *"A SHARED FIELD AND AN INCOMPATIBLE VOCABULARY ARE TWO FAULTS THAT LOOK LIKE ONE. Fixing the
> vocabulary made the sharing MORE visible, not less — before, the fold hid it. When a symptom has
> two candidate causes and one is cheaper to fix, check whether the cheap one merely stops the
> symptom being OBSERVABLE."*

**What would have made it impossible.**

- **Version the format at the LOAD BOUNDARY, never in a live store.** An old file is upgraded once,
  on the way in, by an adapter that has a version number and a deletion date. A live read-only view
  that shadows the real store has neither, so it acquires new consumers instead of losing old ones.
- **A shim declares its remaining consumers, and nothing new may bind it.** `TAG-11` already says
  *"these views are the deletion target once their last consumer moves"* — a count in the code (or a
  test asserting the consumer list only shrinks) turns that from an intention into a ratchet.
- **Finish the migration in the release that starts it, or do not start it.** Every entry in this
  section is a half-finished move that was correct on the day and became a trap by surviving.

---

## 7. Verification that could not see the thing it was verifying

**Exhibits:** `RENDER-S19` (a path that had never RENDERED), `RENDER-S23` (a working mouse path is no
evidence about touch), `TAG-19` (a canvas cannot be verified in a hidden document), `UI-E3` (a bad
identifier survives the build and 2840 tests), `RENDER-S9` (the test measured the one thing no caller
does), `RENDER-S17` (the fixture was kinder than the producer), `RENDER-S33` (the specs pinned Δv;
nothing pinned the drawn path), `RENDER-S8` (the instrument reported intent and reconciled to five
figures against a picture that was plainly wrong), `DATA-R17` (a latent fallback fault produces NO
DIFF), `UI-C8` (found only by reading the SAVED CAMPAIGN after a save).

**What the shape made people do.** Trust green. Every one of these was green.

`RENDER-S9` is the purest: `buildDisplayModel` had a test asserting it *"normalises to a unit long
axis"*, and it stayed green while the bundled ISS drew 25.6× oversize — a 109 m station a fifth of an
AU long — because **the test measured the returned object without setting a scale on it, which is the
one thing every real caller does.** Its rule is the one to carry: *test the contract the caller relies
on, not the one the builder advertises.*

`RENDER-S33` is the same hole at the level of a whole subsystem: every transit spec was green while
a drawn accel implied 1,366 km/s for a ship that reaches about 10 km/s in an hour, because **a
correct Δv total says nothing about whether the line beside it is possible.** And `RENDER-S8` is the
worst kind, because the instrument agreed with the intent: it *"reported a serene 7 px while the hull
was really 204 px across, and its arithmetic reconciled to five figures"* — so "measure, don't judge
from a screenshot" produced a confident wrong answer and closed the investigation.

**What would have made it impossible.**

- **Fixtures are built by the PRODUCER, never by hand against the type.** `RENDER-S17` states it
  outright — *"a hand-written fixture is a claim about the producer, and a type is not that claim"* —
  and the fault was a route drawn origin → STAR → STAR → STAR → destination while the suite was green
  on a fixture that handed every segment real states the real planner never writes.
- **Every branch of a renderer has a bundled example that REACHES it.** `RENDER-S19`'s standing cost
  is that *"no bundled example carries a construct with a journey"*, so that path still cannot appear
  in any test or local preview without hand-building a transit. A coverage assertion over declared
  visual states — every one has a fixture — makes "has anyone's eye ever seen this" answerable.
- **Assert the PROPERTY, not the value.** `RENDER-S16` checks `|heading| == 1` across tilts and
  policies *and* `|heading|^600 == 1`, so the REASON (ten seconds of compounding at 60 fps) is guarded
  rather than one number. `DATA-R13`'s law is the same instinct: *a list of exceptions goes stale; a
  test for the property does not.*
- **A meter must not report intent, and must not add the cost class it measures.** Both halves are
  already in the map (`RENDER-S8`, `RENDER-S22`, `NET-1`) and both are portable. `RENDER-S22`'s
  always-recording event ring is the shape: an instrument you must switch on first arrives too late
  every time for an intermittent fault a refresh clears.

---

## 8. Derived state written back into the authored store

**Exhibits:** `TAG-2` (spare on strip, then push unconditionally, and every override doubles),
`RENDER-S36`\* (a parked ship rewrote its own node several times a second, for ever),
`DATA-R8` (sixteen derived fields the strip list had never heard of),
`OVR-6` (a reconciliation model wrote a correction to the body, so it was SAVED),
`UI-C8` (an editor default written into a record on open).

**What the shape made people do.** `OVR-6` is the one with teeth, because the damage is permanent:
a GM hollowing a heavy rocky world hit `reconcileGiantMakeup`'s two conditions **by construction**,
so their rock became 88% gas on the next pass — *"the exact contradiction the pin exists to state,
explained away, silently, and gone from every save thereafter."* Nothing distinguishes a derived
correction from an authored value once it has been written to the same field.

`RENDER-S36`\* shows the cost compounding across a whole system: a stamped position on a node meant a
changed node, which meant a changed broadcast snapshot, which meant a player's 3D scene rebuilding on
every one — discarding any ship-model load in flight. **One cause, three unrelated-looking reported
faults**: the model never appeared, the camera reset while following, and the ship sat at a GM instant
instead of orbiting on the player's clock.

**What would have made it impossible.**

- **Authored and derived are two stores, not two conventions over one.** `DATA-R8`'s drift —
  `DERIVED_FIELDS` eight releases behind the engine, so a reader checking the list would have
  concluded a stored value was authored and trusted it — is not fixable by maintaining the list
  better. It is fixable by making a derived field impossible to write into the authored object.
  `derivedFieldDrift.spec.ts` is the honest compensation for not having that separation, and the
  entry says so: *"the list is no longer the authority — the test is."*
- **This buys more than correctness.** `UI-C7` found the prize by accident: if derivation is a pure
  function of authored state, then **`process()` IS the redo function** and an undo stack needs only
  the authored slice. That is a whole feature falling out of the separation. A new engine that starts
  with authored ≠ derived gets undo, save, diff and idempotence from one property.
- **Stamp a derived value only while nothing else can describe the thing.** `RENDER-S36`\*'s rule —
  *ask the STATE, never merely whether the sampler answered* — is the narrower version for cases
  where a cache must exist.

\* `RENDER-S36` is one of two live id collisions; here it means the sampler entry, not the methane one.
See `M6`.

---

## 9. Two things that LOOK like duplication and are not — and telling them apart is the hard part

**Exhibits:** `TAG-16` (two tag pickers), `PHY-29` (two Hill-sphere questions), `M2` (four questions
sharing one boundary), `M3` (three word-vocabularies in one block), `PHY-13`'s BLAST (four different
questions behind one expression), `DATA-R19` (a THIRD legitimate unit operation).

**This section is here because everything above pushes one way and this pushes back.** A document
about duplication read carelessly produces a unifier, and a unifier does real damage here.

`TAG-16` is the exhibit: two pickers that look like a refactor waiting to happen, where *"picking the
wrong one fails in BOTH directions. A manual-tagging picker filtered to what exists can never add the
first instance of anything; a highlight picker full of unused tags offers things that will never
appear on a map."* **The filtering IS the difference.** `M2` is the same warning about the most
duplicated-looking expression in the codebase: `makeup.gas` against 0.5, thirty sites, **four
questions that share a boundary and are not one question in four spellings.**

**What would have made it clear.**

- **A vocabulary has two extents and both are first-class.** What is DECLARED and what is
  INSTANTIATED are different sets, and naming them (`declaredTags` vs `presentTags`) makes `TAG-16`'s
  two pickers obviously different tools rather than obviously redundant ones.
- **Name the QUESTION, not the comparison.** `PHY-28` splits "has ground" out of `makeup.gas <= 0.5`
  and gives it a predicate; the other three questions stay inline **on purpose**, and the entry says
  so. Once each question has a name, sharing a threshold is a coincidence rather than an invitation.
- **Where two answers are deliberate, the deliberateness is written down beside both.** `PHY-29` does
  this — two wrappers, two floors, both stated, *"do not re-merge them"* — and it is the difference
  between a misalignment and a design. Every `M`-entry in this file exists because that sentence was
  missing.

---

## What I would most want the new architecture to avoid

Three, in the order I would design against them.

**1. Authored state and derived state in the same object.** Sections 4 and 8, and it reaches further
than either. It is why `DERIVED_FIELDS` could drift eight releases behind the engine and why a
reader checking it would have drawn the opposite conclusion; why a reconciliation model could
permanently destroy a GM's authored composition and ride it into every save; why a parked ship
rewrote its own node several times a second and took three visible faults with it; why an editor
opening and closing could pin a campaign to that day's rule pack. Separate them and `PHY-1`,
`DATA-R8`, `OVR-6`, `UI-C5`, `UI-C8` and half of `SYNC-3` stop being rules people must remember.
`UI-C7` shows the upside is bigger than the fix: undo comes free.

**2. A published quantity with more than one producer — or with none, so consumers infer it.** Section
2, and `RENDER-S34` is the sharpest single instance: nothing published how hard or which way a burn
pushed, so a renderer inferred it by differencing two velocity states, one of which was a placeholder
zero — the inferred thrust came out 2.4× on a Hohmann departure and 0.03× on a 57-hour torch burn,
and the published direction sits 61.7° off the course line the renderer was aiming down. The fix in
every case is the same and `PHY-30` is the model: **the owner PUBLISHES the derived field and nothing
re-derives it.** Not "agree on the formula" — publish the answer.

**3. A visual path that nothing can exercise, and an instrument that reports intent.** Section 7. This
is the one that decides how much the other two cost, because it is what makes everything else
findable. Three faults surfaced *at once* the first time a moving construct was ever rendered in 3D;
a 25.6× oversize hull sat behind a green test that measured what no caller does; a 1,366 km/s burn
shipped and stayed while every transit spec passed. **A new engine should be able to answer "has
anything ever exercised this on screen, and did a human look?" from its own fixtures** — and its
meters should report what was MEASURED beside what was intended, because `RENDER-S8` is proof that a
confident instrument closes an investigation faster than no instrument at all.

---

**A note on what is NOT here.** Sections 1–9 are read off the IMPLEMENTATION bucket, which is
21 entries as a primary bucket and 48 including the split halves. The DOMAIN and ARCHITECTURE
buckets carry forward as content and are not re-argued here. The single most important thing in the
whole carry-forward is not in this document at all: **`PHY-1` and its test.** See the sort section at
the head of `engine-map.md`, and read it beside `PHY-12`, `LGR-2` and `SYNC-1` before choosing a pass
model.
