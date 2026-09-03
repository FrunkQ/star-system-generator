# Mega-constructs — design

STATUS: DESIGN ONLY, 2026-08-28. Nothing is built. Written to be handed to an agent, so it carries
the code reading already done (file:line throughout) rather than making the next session pay for it
again — the entry fee in `docs/process-templates/PLAYBOOK.md` is measured at about a fifth of a
session's context, and this document is that fee pre-paid.

Owner's ask, in full: *"Mega-constructs - a special category of constructs that only appears on the
picker under their own tab when available - options greyed out otherwise. These are placement
sensitive objects that can be gravitationally significant (so a construct with some body
clothing)... or have to be placed on planet or habitable zone from planet. Space Elevator /
Planetary toruses / Ringworlds / Dyson spheres/swarms / Massive energy collectors / Death Stars /
Add others? Each will need its own specialised render path on 2D and 3D - and probably can be docked
against - so needs properties for the transit planner to work against."*

**TWO OWNER CORRECTIONS THE SAME DAY, both of which changed the design rather than decorating it.**

On the greying, overruling an earlier draft of §3.5: *"i cant have a space elevator as an option in
deep space - only relevant on a planet. You cant put a death star on a planet. That simple."*

On the architecture, replacing an earlier §3 entirely: *"maybe create a hybrid object - one that is
processed as a body but has construct chrome."* Followed by: *"Anticipate any issues with planet
sized constructs like a death star having their own gravity for ships to orbit, etc."* — which §3.4
answers in nine numbered items.

**AND TWO MORE, which between them simplified the hardest part and generalised the whole mechanism.**
On the moving Death Star: *"have a function that docks (lands) every orbiting construct while moving
and drops them out at destination. Narratively sound and saves a LOT of work :)"* — §3.6. On
asteroids: *"Small bodies like asteroids are available as constructs or bodies... by choice... they
do bridge - I guess we could just hybrid them too like a death star"* — §3.7, and it corrected a
naming error in §3.3.

**AND THE STRUCTURE ITSELF, which is §5b:** *"These are a special 'subsection' of special constructs
rather than a bunch of if thens... i.e. proper structure for mega-constructs"*, with programmatic
models, the ship shader pipeline reused, and parameters that DO something — a swarm density slider
showing power harvested as well as occlusion, shell coverage to 100% *"seeing it grow"*, an asteroid
counterweight for a beanstalk. **Plus three simplifications, each cheaper than the draft before it:**
*"a swarm will not be lots of objects just 1 shaded appropriately... practical rather than
realistic"*; *"zooming for rings will be like belts/rings"*; and the one that collapsed the render
work outright — *"effectively a swarm would be a simple polygon (dyson sphere/part sphere/ring) but
only the apexes are drawn. A ring is just an unfinished sphere - they can all use the same draw
call."* **Six render paths became one parametric generator and a line.** And with it: *"The INSIDE of
a ringworld or sphere will be 'livable' and show living world parameters and are drawn in 3D - An
inside out planet with green life"* — §5b.4b, which is the strongest argument in this document for
the hybrid being a body.

**AND TWO CORRECTIONS AFTER THAT, the first of which withdrew a claim this document had made.** On
carrying a fleet: *"if we can travel objects with a death star then that is better - one use case
catches a fleet, moons, etc... surely everything stays kepler[ian], the origin for orbiting
ships/moons is the planet which is 'stationary to them'... orbits stay and we only have to transmit
position of the host?"* — **verified in the code and correct; §3.6 is rewritten and the earlier
objection is recorded as a DEAD END rather than deleted.** On the asteroid migration: *"just bring
them all into the new system - we have a mass... keep imported ones in low bounds of spin so we
don't need to determine when they fall apart, etc and wreck their intent"* — §3.7, where it turns
out the data already has the spin and the engine already has the breakup model.

---

## 1. What a mega-construct IS, and why the category needs a boundary

A construct today is a thing the engine carries but does not physically believe in. It has a
position, an extent and a log; it has no gravity, no zones, and nothing in the system responds to
it. That is correct for a station and wrong for a ringworld.

**A mega-construct is a construct the rest of the engine has to notice.** That is the category test,
and it is worth stating as a test because "big" is not one — Ceres Station is 940 km across and is
an ordinary construct, while a space elevator masses almost nothing and is unambiguously a
mega-construct. Three ways an object earns the category:

1. **It constrains where it can be.** Its existence depends on the host: a space elevator needs a
   real geostationary altitude, a ringworld needs a star to circle.
2. **It is gravitationally significant.** Enough mass that the system's physics is wrong if it is
   ignored — the owner's *"a construct with some body clothing"*.
3. **It changes what the physics produces for everything else.** A Dyson swarm dims its star, and
   every insolation, temperature, habitability and colour downstream of that star is different
   because it is there.

**Any ONE of the three qualifies.** A space elevator has (1) alone. A Death Star has (2) alone. A
Dyson swarm has all three. Keeping the test explicit is what stops the category becoming "big
things" and swallowing the O'Neill cylinder that is already a perfectly good `habitat` template.

**AND THE CATEGORY HAS TWO ENTRANCES, not one — see §3.7, which is what turns this from a set of
exotic megastructures into one seam worth building.** A Death Star arrives from the CONSTRUCT side,
wanting body physics it never had. An asteroid arrives from the BODY side, wanting construct chrome
it never had. Both want the same thing: **body physics with construct chrome.** The mega-constructs
are the loud half of a split the product already has.

---

## 2. What is already true — the probe, so nobody reads it twice

### 2.1 Data model

A construct is `kind: 'construct'` on the same `CelestialBody` interface as a body
([types.ts:496](../../src/lib/types.ts)), with `roleHint` from a fixed union already containing
`'construct'` and `'ship'` ([types.ts:498](../../src/lib/types.ts)). Templates are plain
`CelestialBody` objects in the rule pack, grouped by category key —
`constructTemplates?: Record<string, CelestialBody[]>` ([types.ts:1035](../../src/lib/types.ts)).
The shipped pack has seven keys (`small_body`, `station`, `habitat`, `infrastructure`, `anomaly`,
`ship`, `traveller`) and the picker builds a tab per key.

A template already carries most of what a mega-construct needs: `physical_parameters.dimensionsM`
(a 3-vector), `massKg`, `spinRadiusM`, `rotation_period_hours`, `cargoCapacity_tonnes`, plus `crew`,
`systems.power_plants` and a tag list. **`spinRadiusM` and `rotation_period_hours` together already
express spin gravity** — a torus and a ringworld need no new field for the thing that makes them
habitable.

`placement?: string` ([types.ts:32](../../src/lib/types.ts)) is a loose string ('L4', 'L5',
'Surface'). It is display-legacy; `coOrbital` is the load-bearing record for L-points
([types.ts:117](../../src/lib/types.ts)). Mega placements should NOT extend the loose string without
deciding which of the two they are.

### 2.2 The picker is already a placement-availability engine

`src/lib/components/AddConstructModal.svelte` (283 lines) reads the pack's category keys reactively
(line 26), lists that key's templates (line 28), and computes legal placements for the host in one
reactive block (lines 30-60): `Surface` unless the host is a gas giant; the orbit bands from
`OrbitalBoundaries`; `Geostationary Orbit` only when `geoStationaryKm && !isGeoFallback`; all five
Lagrange points when the host has a parent; an AU distance for a star or barycentre.

**That is the machinery this feature needs, already built and already correct.** It is per-HOST and
unaware of the template. Mega-constructs grow it exactly one axis: per-HOST **and** per-TEMPLATE.

### 2.3 Rendering, 3D — the gap is the stand-in, not the pipeline

A construct is not only a glyph; that was fixed. `scene.ts` gives every construct real geometry: a
loaded GLB via `loadShipModel` ([scene.ts:2633](../../src/lib/holo/scene.ts), attached at 4244), or
with no model an **ellipsoid at the authored `dimensionsM`** via `attachHullVolume`
([scene.ts:2670](../../src/lib/holo/scene.ts), attached at 4260). The icon sprite
([scene.ts:4045](../../src/lib/holo/scene.ts)) is the far-away marker, and the hull replaces it as
soon as it is big enough to read (the pixel LOD, [scene.ts:2985](../../src/lib/holo/scene.ts)).

The comment at scene.ts:4244 explains the ellipsoid and should be read before anything replaces it:
*"an ellipsoid reads as 'we know how big this is, not what it looks like'"* — it has no front, so it
makes no claim about heading the data cannot back.

**The render gap in one sentence: the stand-in geometry is a blob, and every mega-construct in the
list is defined by a shape a blob cannot express.** A ring is not an ellipsoid, a tether is not an
ellipsoid, and a swarm is not one object. The pipeline around it — LOD, framing, min-zoom, the
plume, the screen floor — is all reusable and none of it should be rebuilt.

### 2.4 Rendering, 2D

`SystemVisualizer.svelte` draws constructs with the shared glyph (`traceConstructIcon`, line 797) at
a 12 px minimum (line 821). The glyph vocabulary is five shapes in ONE module,
`src/lib/constructs/constructIcon.ts`, unified at v2.1.367 after the same glyph existed four times
and one copy had drifted (inbox A34). **Adding a shape falls out of one table**
(`CONSTRUCT_ICON_SHAPES`); the canvas tracer and the SVG emitter both come from that case block.
Do not add a sixth copy of the vocabulary — the file's header comment says so and it was written
after this codebase paid for ignoring it.

### 2.5 Physics: constructs are invisible to it, and one gate is why

Every place mass matters tests `kind === 'body'`:

| what | where |
|---|---|
| n-body acceleration | [gravity.ts:92](../../src/lib/physics/gravity.ts) |
| barycentre effective mass | [SystemProcessor.ts:210, 458, 488](../../src/lib/core/SystemProcessor.ts) |
| hierarchy rebuild | [hierarchyRebuild.ts:90](../../src/lib/physics/hierarchyRebuild.ts) |
| barycentre member mass | [barycentres.ts:26](../../src/lib/system/barycentres.ts) |

A construct's `massKg` is authored, saved and displayed — and read by nothing that computes gravity.
Ceres Station's template carries 9e20 kg and the engine has never once used it.

### 2.6 THE TRAP THAT WILL BITE FIRST, and it is live today

`worldPositions.ts:105` reads a construct's mass for something else entirely:

```ts
const isStationary = node.kind === 'construct' && (node.physical_parameters?.massKg || 0) === 0;
const timeToPropagate = isStationary ? node.orbit.t0 : timeMs;
```

**SOLVED BY THE HYBRID (§3), and left here because it still governs ORDINARY constructs.** This line
tests `kind === 'construct'`, so a hybrid never enters it. For an ordinary construct it stands: a
zero-mass construct is pinned at its epoch instead of propagating on the live clock, so **the
moment such a construct is given a real mass it stops being stationary and starts orbiting** — which
is usually the right answer and is never what the author of that line was deciding. Whatever the
mass design becomes, this line must be revisited in the same change, and "does it move" must stop
being inferred from "does it weigh anything".

---

## 3. The architecture: a HYBRID — processed as a body, wearing construct chrome

Owner, 2026-08-28: *"maybe create a hybrid object - one that is processed as a body but has construct
chrome."* **That is the design, and it replaces an earlier draft of this section that kept
mega-constructs on `kind: 'construct'` and taught the physics to see them.** The reversal is worth
recording with its reason, because the reason is measurable.

### 3.1 The measurement that settles it

Counted across `src/`, excluding specs:

| gate | sites | what it is |
|---|---|---|
| `kind === 'body'` / `kind !== 'body'` | **209** | physics, processing, classification, hierarchy |
| `kind === 'construct'` / `kind !== 'construct'` | **154** | overwhelmingly presentation |

The counts are close. **Where they live is not.** Of the 97 `kind === 'construct'` sites, roughly
nine in ten are in view layers — `SystemView.svelte` (27), `SystemVisualizer.svelte` (16),
`catalogue/+page.svelte` (9), `routes/+page.svelte` (9), `scene.ts` (8), `Starmap.svelte` (5),
`ReportDocument.svelte` (5), `BodyPicker.svelte` (4), `guideDocument.ts` (4). The `kind === 'body'`
sites are `SystemProcessor`, `gravity`, `hierarchyRebuild`, `barycentres`, `classification`.

**And the two failure modes are not symmetric, which is the whole argument:**

> **A chrome site that has not been taught about the hybrid degrades GRACEFULLY — the object renders
> as a sphere and lists as a body, which is wrong-looking but not wrong. A physics site that has not
> been taught about it is SILENTLY INCORRECT — the gravity sum simply omits it and nothing anywhere
> says so.**

So the hybrid goes on the side of the fence where the misses are visible. `kind: 'body'`, and the
chrome is what gets taught. That is the owner's proposal and it is right.

### 3.2 What being a body buys, for free

Every one of these works with no edit at all, where the earlier draft would have had to change each
one and risk missing one:

- **`orbits.ts:156` — the propagation cliff.** `if (hostMu === 0 || !a_AU) return null`. A construct
  has no mass in any gravity path, so `hostMu` is 0, so propagation returns null — and in
  `worldPositions` a null propagate leaves `relative` at zero. **A ship "orbiting" a construct is
  therefore drawn at the construct's exact centre**: no error, no warning, everything stacked on one
  point. This is the single most concrete answer to "can ships orbit a Death Star", and as a body it
  simply does not arise.
- **`worldPositions.ts:105` — the stationary trap is GONE, not worked around.** That line tests
  `kind === 'construct'`; a hybrid never enters it. §2.6 flagged it as the trap that would bite
  first; the hybrid deletes it. Keep §2.6 for ordinary constructs, which still live under it.
- **`gravity.ts:92`, `SystemProcessor.ts:210/458/488`, `hierarchyRebuild.ts:90/112`,
  `barycentres.ts:26`, `barycenterReconcile.ts:184`** — all pass, unedited.
- **`hostMu` on children.** A child's `orbit.hostMu = G * hostMass` is set at creation from the
  host's mass; a hybrid host has one, so its satellites propagate correctly.
- **No new gravity predicate is needed at all.** The earlier draft proposed
  `gravitationalMassKg()` in one module to avoid five rival conventions (the G43 lesson). The hybrid
  removes the need for the module rather than centralising it, which is strictly better.

**One site is already half-wired and shows the seam is in the wrong place today.**
`SystemProcessor.ts:602` computes `hostMass` as `host?.kind === 'barycenter' ? effectiveMassKg :
(host as CelestialBody)?.massKg` — **no body gate.** So the orbital PERIOD of something orbiting a
construct already reads that construct's authored mass, while its POSITION does not. Two answers to
one question, which is the duplication test this codebase names as its most recurring fault.

### 3.3 How the chrome is switched — ONE predicate, and the migration is safe

Do not re-point 154 sites. Add one module and let the chrome layers migrate to it as they are
touched:

**TWO ORTHOGONAL FACTS, and conflating them was a real error in an earlier draft of this section.**
It called the flag `artificial`, which is wrong the moment asteroids join the mechanism (§3.7): an
asteroid is entirely natural and still wants construct chrome. The two facts are:

```ts
// src/lib/constructs/chrome.ts — the ONLY place that knows a body can wear construct chrome.
/** Present and handle this as a PLACE, not a world: glyph, dock, construct lists. */
export function showsAsConstruct(node: CelestialBody): boolean;   // reads `constructChrome`
/** BUILT, not formed — so its composition is DECLARED, never derived (§3.4 item 1). */
export function isArtificial(node: CelestialBody): boolean;       // reads `artificial`
```

|  | `kind` | `constructChrome` | `artificial` |
|---|---|---|---|
| Death Star, ringworld, Dyson shell | `body` | yes | **yes** |
| asteroid as a PLACE (§3.7) | `body` | yes | no — it is a real rock, derive it |
| ordinary station (ISS, Ceres) | `construct` | n/a | n/a — needs no body physics |
| planet | `body` | no | no |

**`artificial` governs the PHYSICS chain; `constructChrome` governs the VIEW.** An asteroid gets full
classification because deriving a rock's composition is correct; a Death Star does not. **A chrome site not yet migrated
shows a sphere in a body list — legible, and obviously wrong to a human eye, which is exactly the
kind of wrong that gets fixed.** Migration order should follow visibility: `scene.ts` and
`SystemVisualizer.svelte` first, then the catalogue and reports, then the long tail.

**The chrome that must be taught, in priority order:** the 3D render (sphere → GLB or shaped
geometry, `scene.ts` 4045/4244/4260), the 2D glyph (`SystemVisualizer.svelte:797`), the info card
and body picker, docking (`constructInteractions.ts` gates `kind !== 'construct'` and would miss a
hybrid — see §7), and the catalogue/report groupings.

### 3.4 Anticipating the problems — what a gravitationally significant hybrid actually breaks

The owner asked directly. Nine issues, in the order they will be met.

**1. The classifier will try to classify it, and most of that is nonsense.** As a body it enters
composition, makeup, radiogenic heat, tidal heating, atmosphere and temperature, and comes out with
`classes`. Some of that is genuinely wanted — a real radius, a real surface gravity, possibly an
internal atmosphere. Much is not: radiogenic heat from an artificial shell, a `makeup` model, a
chance of reading "ice-giant". **The fix is not to skip the chain silently** (the standing rules
forbid exactly that). It is that **an artificial body's composition is DECLARED, not derived** —
the same shape as `typicalForClass`, where a guess must not wear a measurement's clothes. Where a
derivation has no meaning, say so on the card rather than printing a number.

**2. Idempotence, and it is the test that will catch the mistake.** `src/lib/system/idempotence.test.ts`
enforces that nothing reads a value a later pass writes, and its two corollaries both apply here: a
derived CLASS is never a physics input, and **when one quantity depends on another body, iterate
PARENT BEFORE CHILD.** A hybrid that hosts satellites must be processed before them. Run this test
early and do not relax it.

**3. `hierarchyRebuild.ts:112` changes behaviour the moment a hybrid exists.** The walk currently
breaks on `parent.kind !== 'body'`; a hybrid parent now continues it. That is a change to EXISTING
hierarchy walks, not a new path, so it needs its own gate run with the hybrid removed.

**4. Barycentres may form, and it will surprise someone.** If a Death Star is massive relative to
its host, `SystemProcessor`'s barycentre pass can produce a planet–DeathStar barycentre. Probably
correct; definitely startling. Bound it or declare it.

**5. The Roche limit does not apply, and the engine will compute one anyway.** A rigid artificial
body is held by structure, not self-gravity, so a Death Star parked inside a planet's Roche limit is
fine. `generation/placement.ts:21` computes a Roche limit for any body host. This is a genuine
*steer-and-explain*: say the number, say why it does not bind here, change nothing.

**6. THE REAL COLLISION: a hybrid that MOVES.** This is the hard one and it deserves its own
paragraph. A body's position is `parent + Keplerian propagation`. A construct's position is journey
kinematics or a stamped vector, **and which sampler runs is CALLER POLICY** (`worldPositions.ts`
60-90: the orrery passes journey kinematics, a followed player view passes the route sampler, and a
free-scrubbing player view passes *none at all*, deliberately — the owner's rule, 2026-08-08). A
hybrid needs both models and they cannot both be authoritative.

> **THIS ITEM IS WITHDRAWN. §3.6 SHOWS THE PREMISE WAS WRONG.** A child is composed as
> `parentPos + relative` unconditionally (`worldPositions.ts:112`), so it is computed FROM its parent
> and cannot drift away from it. Everything comes along, orbits intact, for free.

Left on the page rather than deleted, because "children of a moving parent diverge across views" is a
plausible-sounding claim that cost a draft and would cost the next reader the same hour. **It is
false.** What remains is a physics tag, not a mechanism: you cannot hold an orbit around a thrusting
primary, so an assembly that stays together under power gets a sentence saying so — and keeps
flying.

**7. Redaction.** A player snapshot's `slimNode` strips `scheduled_journeys`, and the redaction
boundary keys off `kind === 'construct'`. A hybrid is `kind: 'body'` and would be redacted like a
world. For a ringworld that is right; for a Death Star it may be exactly wrong. **This is open
question 3 in §11 and it should be answered before phase 5, not after.**

**8. The scale law.** P4 put ships, bodies and stars on one kind-blind span map, and R9 says a
physically larger object never renders smaller than a smaller one
(`src/lib/rendering/scaleLaw.ts`, gates in `scaleLaw.spec.ts`). A hybrid enters that map on the
BODY branch, which is what we want — but a ringworld is 300 million km across and will sit at the
top of it. **Put a mega-construct on the span map and keep R9 green before drawing any new
geometry.** Also note `scene.ts:2991` — *"the model contributes no radius anywhere"* — which is true
of constructs and must NOT be true of a hybrid: framing, `minDistance` and the system extent (A78,
`systemExtent.spec.ts`) all have to see its radius, or zooming out on a ringworld system frames the
star and clips the ring.

**9. A pre-existing fault this uncovers, worth its own row.** The construct templates author
`roleHint` as `'small_body'`, `'station'`, `'infrastructure'` — **none of which are in the declared
union at `types.ts:498`**, so the shipped data already contradicts the type. Worse: an **asteroid**
is authored `kind: 'construct'`, and the picker never rewrites `kind`. So every asteroid, comet and
captured moonlet placed from the pack is a construct: no gravity, no classification, and no spin
axis (`importFixup.ts:302` says so in as many words). **That is the hybrid problem inverted and
already shipped** — natural objects wearing construct clothing — and the same `artificial` flag is
what fixes both ends. Do not fix it inside this feature; record it and let it be scoped.

### 3.5 "Greyed out" — the owner corrected this, and the correction is the rule

An earlier draft argued that greying an option collides with *steer, do not stop*, and proposed that
grey stay clickable. **The owner overruled it, 2026-08-28:** *"i cant have a space elevator as an
option in deep space - only relevant on a planet. You cant put a death star on a planet. That
simple."*

He is right, and the earlier draft misapplied the rule. **The distinction the design needs is
RELEVANCE versus PLAUSIBILITY, and only one of them is a physics criterion:**

- **RELEVANCE — a hard gate, no escape hatch.** The option has no referent. A space elevator anchors
  to a surface; in deep space there is no surface to anchor to, so the option is not implausible, it
  is meaningless. A Death Star sits in space; "on a planet's surface" is not a hard version of the
  option, it is a category error. **Not offering a nonsense option is not refusing a creative
  choice**, and *steer, do not stop* was never about this. Grey it, or do not list it.
- **PLAUSIBILITY — steer and explain, never refuse.** The placement is meaningful and the physics
  says it is hard: a tether whose taper ratio needs unobtanium, a rigid Dyson shell, a ringworld
  needing eternal station-keeping, a hybrid parked inside a Roche limit. **This is where alien tech,
  unobtanium and PlotDevice live.** Tag it, publish the number, change nothing.

**The test, so an implementer can apply it without asking:** does the placement have a HOST FEATURE
the object attaches to or depends on — a surface, a star to circle, an orbital band to occupy? If
that feature is absent, it is relevance and it is a hard gate. If the feature is present and only
the numbers are bad, it is plausibility and it steers. The `requires` vocabulary in §4.2 therefore
carries two kinds of clause, and each is tagged in the data:

```jsonc
"requires": {
  "hard":  { "hostKind": ["planet", "moon"], "hasSurface": true },   // relevance — greyed, final
  "steer": { "geoBelowHillFraction": 0.5, "minTetherStrengthGPa": 50 } // plausibility — tag and explain
}
```

A whole TAB still hides when nothing in it passes its HARD clauses — which is what the owner asked
for ("only appears… when available").

### 3.6 A hybrid that moves: EVERYTHING COMES ALONG, and it costs nothing

**CORRECTED 2026-08-28 by the owner, and the correction is load-bearing.** An earlier draft of this
section argued that a moving hybrid could not host satellites and proposed carry-and-release as the
way round it. He challenged it: *"surely everything stays kepler[ian], the origin for orbiting
ships/moons is the planet which is 'stationary to them' - they all still run keplerian - orbits stay
and we only have to transmit position of the host?"*

**He is right, it was verified in the code, and the earlier objection was over-called.**
`worldPositions.ts:112` composes every position as:

```ts
const abs = ops.add(parentPos, relative);   // parent's resolved position + own Keplerian offset
```

**Unconditionally, for every node, however the parent's own position was obtained** — sampler,
GM-stamped vector, or its own orbit. A child is computed FROM its parent, so it cannot drift away
from it. Move the host and the whole assembly moves, orbits intact, with no new machinery and
nothing extra to transmit but the host's position.

**Where the earlier draft went wrong, recorded so nobody re-derives it.** The concern was that a
moving hybrid's position comes from a sampler whose choice is caller policy, and a free-scrubbing
player view passes none — so the host would sit at its GM-stamped position rather than one derived
from the player's own clock. **That is true and it is not a fault:** it is the owner's own rule of
2026-08-08, deliberately chosen, and the assembly stays SELF-CONSISTENT because the children are
added to whatever the host resolved to. What varies between views is where the whole assembly is —
which is already the accepted behaviour for every transiting construct. **A dead end worth its row:
"children of a moving parent diverge" is FALSE, and the reason is one line of vector addition.**

**So carrying a fleet, moons and stations along is the DEFAULT, and it is free.** Owner: *"if we can
travel objects with a death star then that is better - one use case catches a fleet, moons, etc."*

**THE ONE HONEST OBJECTION LEFT IS PHYSICS, NOT IMPLEMENTATION, AND IT IS A TAG RATHER THAN A
BLOCK.** You cannot hold a Keplerian orbit around a primary that is under thrust: the orbiting
objects are in free fall and a thrusting host simply accelerates out from under them. So an assembly
that stays together under power is doing something remarkable. **Steer, do not stop** — say so, name
it, and let the GM keep it. Unobtanium, inertial compensation, a plot device: all valid, and the tag
is the interesting part rather than the obstacle. The engine's job is the sentence *"this fleet is
being carried; something is holding it together"*, not a refusal.

**AND THE TWO FOLD TOGETHER INTO ONE THING, which is the owner's own framing, 2026-08-28:** *"We are
not TELLING the GM to dock everything - just to have a reason they come as they are and we don't
leave them behind. OR ask them to dock them or poke the magic button 'unobtanium'. We can always
create lost moons later."*

> **SO: ONE OFFER AT DEPARTURE, THREE BUTTONS, NO ENFORCEMENT ANYWHERE.** The engine never docks
> silently, never leaves anything behind silently, and never refuses the burn. What it does is ask
> once, and then record which answer it was given.

| choice | what happens | what it is for |
|---|---|---|
| **They come as they are** (default) | nothing at all — the vector addition already does it | the common case, and it is free |
| **Dock them first** | carry-and-release: positions suspended, a `carried`/`released` pair on each craft's own log | a fleet you want accounted for, or craft that should not sit in an orbit |
| **Unobtanium** | same as the default, but the *reason* is named and tagged | the GM saying "something holds them, do not ask" |

**The magic button is not a joke setting; it is the honest one.** The engine's only real objection —
that you cannot hold a Keplerian orbit around a primary under thrust — is a statement about physics,
not about what a GM may do. Pressing the button is the GM answering it. **The tag is the interesting
part:** a moon orbiting a battle station under way, with `unobtanium` on the assembly, is a story
hook sitting on the map waiting to be found.

**And that tag wants [[G54]]'s disclosure ladder, which is why the two items should stay aware of
each other.** At rung 2 (`anonymous`) the players see that *something* is holding the fleet together
and not what — which is exactly the shape this wants and costs nothing extra once G54's middle rung
exists.

**Default is "they come".** It is what is free, it is what the owner asked for, and it is the least
surprising thing: a GM who moves a battle station expects its fleet to still be there.

**BANKED, NOT BUILT: LOST MOONS.** The owner: *"We can always create lost moons later."* A fourth
choice — leave them behind, re-parented to the old host, possibly on disturbed orbits — is a real
feature and a good one, and it is deliberately not in this design. Recorded here so it is not
re-derived: the mechanism is a re-parent plus an orbit that no longer closes, and it wants its own
item when someone wants the story.

### 3.7 Asteroids come through the same seam — and the migration is a SWEEP, not an opt-in

Owner, 2026-08-28: *"Small bodies like asteroids are available as constructs or bodies... by
choice... they do bridge - I guess we could just hybrid them too like a death star"*, and then:
*"Existing asteroids - just bring them all into the new system - we have a mass... just giving them
spin, etc makes sense - keep imported ones in low bounds of spin so we don't need to determine when
they fall apart, etc and wreck their intent."*

**Verified: they genuinely are available both ways today.** The pack's `small_body` category holds
'Asteroid (C-Type)', 'Asteroid (M-Type)', 'Comet (Active)' and 'Captured Rock (Moonlet)', all
authored `kind: 'construct'`; and the classifier side carries `asteroid`, `dwarf-planet`,
`rubble-pile` and `planetesimal` as real body classes. A GM picks a lane and the lanes behave
completely differently — see [[B109]].

**So the hybrid is not a mega-construct special case. It is one mechanism with two entrances:**

| | comes from | wants |
|---|---|---|
| **Death Star, ringworld** | a CONSTRUCT the physics must treat as real | body physics it never had |
| **asteroid, comet, moonlet** | a BODY a GM wants to treat as a place | construct chrome it never had |

**That framing is what makes this worth building** — it stops being "six exotic megastructures" and
becomes one seam that also fixes a split the product already has.

#### The data is further along than the ask assumes

**The templates ALREADY carry mass, dimensions AND spin.** `massKg`, `dimensionsM` and
`rotation_period_hours` (8 h, 5 h, 12 h, and 0 for the moonlet) are all authored. Nothing needs
inventing: `importFixup.ts:302` simply refuses a construct a spin axis, so the authored rotation has
never been read.

**And the engine ALREADY determines when a body falls apart** — the thing the owner hoped to avoid
needing. `src/lib/physics/rotation.ts` is a complete, calibrated model:
`breakupPeriodHours(densityGcc)` (T_min = sqrt(3π/Gρ)), `spinFraction`, `oblateness`, and named
bands `OBLATE_AT` 0.25 / `ELLIPSOID_AT` 0.5 / `NEAR_BREAKUP_AT` 0.8 / `BREAKUP_AT` 1.0, calibrated so
Earth reads spherical and Jupiter and Saturn read oblate.

> **SO THE GUARD IS NOT A HAND-PICKED HOUR RANGE. Clamp a migrated rock to
> `spinFraction < OBLATE_AT` — the engine's own constant, the top of its 'spherical' band — and no
> imported asteroid changes shape on migration.** That is the "do not wreck their intent" requirement
> expressed in a number the engine already owns, per the standing rule that thresholds are DATA and
> not hand-tuned inline.

**DETERMINISM IS NOT OPTIONAL.** Where a value must be invented (the moonlet's `rotation_period_hours`
is 0), seed it from the object's STABLE ID — never `Math.random()`. A rock that spins differently on
each load is a value a later pass writes and an earlier one read, which is what
`src/lib/system/idempotence.test.ts` exists to catch, and it would also make every save non-
reproducible. This codebase already holds that line elsewhere (`makePresetId` is documented as
"deterministic — no RNG").

#### THE MIGRATION WILL EXPOSE AUTHORED VALUES NOBODY HAS EVER CHECKED

Because a construct's `massKg` is read by nothing, the bundled small-body templates have never been
validated against their own dimensions. Computing bulk density from the authored mass and
`dimensionsM`:

| template | ρ (g/cc) | T_breakup | T authored | spin fraction | on migration |
|---|---|---|---|---|---|
| Asteroid (C-Type) | 4.8 | 1.5 h | 8 h | 0.19 | spherical — fine, though dense for a C-type (real ≈1.4) |
| Asteroid (M-Type) | **127** | 0.3 h | 5 h | 0.06 | **impossible** — osmium, the densest element, is 22.6 |
| Comet (Active) | 0.07 | 12.8 h | 12 h | **1.07** | **UNSTABLE** — already past mass-shedding as authored |
| Captured Rock (Moonlet) | **32** | 0.6 h | 0 h | — | **impossible**, and no spin authored |

**Three of the four are physically impossible or unstable, and none of it matters today.** The
moment they become bodies, the M-type gets a density five times any real material, and the comet
classifies as `unstable` and is clamped to `oblateness` 0.95 — it would render as a flat disc.

**Fix the PACK data; that is not what steer-do-not-stop protects.** The rule is about not correcting
a GM's authored map. These are our own shipped templates, and shipping a rock denser than osmium is
a defect rather than a creative choice. **A GM's own asteroids are the opposite case:** migrate them,
tag whatever the physics finds, and change nothing.

**Add a gate while doing it:** every bundled template's authored mass and dimensions must yield a
plausible bulk density and a stable spin. That is a cheap test over pack JSON and it would have
caught all three of these before they shipped.

## 4. Data model

### 4.1 On the node

```ts
/** THE HYBRID (§3). `kind` is 'body', so every physics path already works. These two are ORTHOGONAL
 *  and §3.3 has the table: chrome governs the VIEW, artificial governs the PHYSICS chain. Both
 *  absent = an ordinary body, unchanged. */
constructChrome?: true;   // present and handle as a PLACE — glyph, dock, construct lists
artificial?: true;        // BUILT, not formed → composition DECLARED, never derived
megaType?: MegaConstructType;   // absent on an asteroid-as-place; present on a megastructure
/** Carried aboard a moving hybrid (§3.6). Set on departure, cleared on release; while set the node
 *  has NO independent position and must not be resolved or drawn in space. */
carriedBy?: ID;
/** The shape family the renderers switch on. Derived from megaType; stored so a GM can override. */
megaForm?: 'tether' | 'ring' | 'shell' | 'swarm' | 'spheroid';
/** Ring/shell/torus geometry, in km, where dimensionsM cannot express it (§5). */
megaRadiusKm?: number;        // ring/shell radius, or tether top altitude
megaWidthKm?: number;         // ring/ribbon width along the spin axis
megaThicknessKm?: number;
/** Occlusion fraction of the host star's output, 0..1 — the load-bearing number for a swarm (§6). */
starOcclusion?: number;
/** Docking (§7). */
dockNodes?: DockNode[];
```

`radiusInnerKm` / `radiusOuterKm` already exist for belts and rings ([types.ts:517](../../src/lib/types.ts))
and an orbital ring should reuse them rather than adding a parallel pair. **Decide this once and
write it down** — two names for one radius is the duplication fault this codebase names as its most
recurring, and the tell is exactly "could these two answer the same question differently".

### 4.2 On the template — the placement predicate, as DATA

The standing rule: *"scattered constants and hand-tuned numbers are data in the wrong place… the
test is about the NUMBER: will a human want to change this after using the product?"* Yes, obviously,
for every one of these. So the predicates live in the rule pack, not in a switch inside the modal:

```jsonc
"mega": [
  {
    "name": "Space Elevator",
    "megaType": "space-elevator",
    "requires": {
      "hostKind": ["planet", "moon"],
      "hasSurface": true,               // not a gas giant
      "needsGeostationary": true,       // a real one, not OrbitalBoundaries' fallback
      "geoBelowHillFraction": 0.5       // geo must sit well inside the Hill sphere
    },
    "explain": "A space elevator hangs from a geostationary orbit. {host} has none within its Hill sphere."
  }
]
```

`requires` is a small declarative vocabulary evaluated by ONE function
(`src/lib/constructs/megaPlacement.ts`), which returns `{ ok, reason }`. The picker greys and prints
`reason`; nothing else in the UI knows the rules. `explain` is the GM-facing sentence with `{host}`
interpolated — prose in data, so a pack author can write their own.

**Suggested `requires` vocabulary (complete for the six, extensible), SPLIT BY CLAUSE KIND (§3.5):**

- **`hard`** — relevance; the option has no referent without it, so it greys and that is final:
  `hostKind`, `hasSurface`, `hostIsStar`, `needsGeostationary`.
- **`steer`** — plausibility; tag, publish the number, change nothing:
  `geoBelowHillFraction`, `minHostMassKg`, `maxHostMassKg`, **`inHabitableZone`**,
  `minHostLuminosityLsun`, `clearOrbitBand`, `minTechLevel`.

**`inHabitableZone` IS A STEER CLAUSE AND MUST NEVER BE HARD** — owner, 2026-08-28: it is a
*"goldilocks zone recommendation"*. A ring at 3 AU is legitimate and cold, and the engine owes it a
temperature rather than a refusal. **The zone is also species-relative** (*"maybe aliens can have
hotter/colder ones"*), so the clause must name WHOSE zone it measured — see §5b.4b and [[G19]].

---

## 5. Render — the shape families, 2D and 3D

The owner said each type needs its own specialised path. **They do not need six paths; they need
five SHAPE FAMILIES**, and every named type falls into one. That is the difference between a feature
that ships and one that becomes six half-finished renderers.

**SUPERSEDED BY §5b.4 — read that instead.** The table that stood here listed five families with separate renderers. The owner collapsed them: a swarm is one object with only its apexes drawn, and *"a ring is just an unfinished sphere - they can all use the same draw call"*. **What survives is THREE families and ONE new generator** — a parametric sphere section (faces or points) covering shell, swarm, ringworld and orbital ring; a `tether`, which is a line; and `spheroid`, which already exists as `attachHullVolume`.

`spheroid` is `attachHullVolume` unchanged; the sphere-section family reuses the belt/ring ZOOM
semantics (§5b.5) but NOT `buildPlanetRingBand`'s sizing (warning below). **Genuinely new: the
sphere-section generator and the tether, and those two cover all seven named types.** Scoping this way turns "six specialised renderers" into two, and that is the single
biggest cost saving in this document.

> **WARNING, CHECKED 2026-08-28 — `ring` IS ONLY HALF-REUSABLE, AND AN EARLIER DRAFT OVERSTATED IT.**
> `buildPlanetRingBand` (`scene.ts:5647`) does give you a working annulus: `THREE.RingGeometry` at
> `scene.ts:5662`, rotated into the pivot's ground plane, with vertex colours already carrying the
> planet's shadow arc. **Reuse that geometry and that shadow machinery.** But do NOT reuse the
> BUILDER: it sizes the ring RELATIVE TO ITS PARENT's rendered radius (`planetRenderedR`) and then
> clamps hard — `innerScene >= planetRenderedR * 1.08` and **`outerScene <= planetRenderedR * 4.5`,
> commented "don't let a ring dominate"**. A ringworld is roughly 200x its star's radius, so that
> clamp would draw it as a modest Saturn-like band around the star. **A mega ring must be sized
> ABSOLUTELY through `scaleLaw`, never through `planetRenderedR`.** Note too that `RingGeometry` is a
> flat annulus — correct for a Niven ribbon, wrong for a planetary TORUS, which wants
> `TorusGeometry`. The `ring` family therefore has two shapes in it, not one.

**SCALE LAW: MEASURED 2026-08-28, AND THE EARLIER WARNING IN THIS SECTION WAS WRONG.** It said a
ringworld "would sit at the top of the span map", that R9 was at risk, and that this would be the
hardest part of the render work. **Mega-scale objects were run through the real law and R9 holds
perfectly — ZERO violations, at every dial position.** Ordering is monotonic from a ringworld's
9.4e11 m circumference down to a 46 m corvette. There is no pre-work to do and phase 2 does not need
to exist as a risk item.

**THE REAL CONSEQUENCE IS THE OPPOSITE ONE, and it is a design problem rather than a correctness
one.** Measured at `rMax` 30, `GRID_RADIUS` 12:

| | ringworld (1 AU) | Sol | Earth | ringworld / Sol |
|---|---|---|---|---|
| `bodySize` 1 (readable) | 1.414 | 0.849 | 0.441 | **1.67x** |
| `bodySize` 0.5 | 1.885 | 0.056 | 0.0039 | 33x |
| `bodySize` 0 (true) | 2.513 | 0.0037 | 0.000034 | **675x** |

**At the readable end a ringworld draws barely wider than its own star**, despite being some 675
times larger. That is the log compression doing exactly what it is designed to do, and it is not a
bug — but it means a megastructure does not LOOK mega at the dial position most presets ship at.

**SO MEGA-CONSTRUCTS MAKE THE SIZE DIALS MATTER FAR MORE THAN THEY DID, AND [[S2c]] IS ALREADY THE
CONTROL FOR IT** — shipped v3.0.166, before this was known. A GM can pull CONSTRUCTS toward true
scale while leaving bodies readable, which is exactly the ringworld case. **But note the ceiling,
because it is a real limit and not a tuning problem:** with `bodySize` 1 and the construct offset
driven fully negative, the construct dial reaches 0 and the ringworld draws 2.513 against Sol's
0.849 — **about 3x, and that is the most contrast the law can give while bodies stay readable.**
A system with a megastructure in it probably wants a LOWER `bodySize` default, and that is a
preset-authoring recommendation rather than a code change.

Note also `scene.ts:2991` — *"the model contributes no radius anywhere"* — which is true of
constructs and must NOT be true of a hybrid: framing, `minDistance` and the system extent (A78,
`systemExtent.spec.ts`) all have to see its radius, or zooming out on a ringworld system frames the
star and clips the ring. **That one still stands and was not measured.**

Note also that these objects break the *"a construct's model contributes no radius anywhere"* rule at
[scene.ts:2991](../../src/lib/holo/scene.ts). A ringworld absolutely contributes a radius: framing,
`minDistance` and the system extent (A78 now counts each member's own radius —
`src/lib/holo/systemExtent.spec.ts`) all have to see it, or zooming out on a ringworld system will
frame the star and clip the ring.

---

## 5b. THE REGISTRY — proper structure, not a switch

Owner, 2026-08-28: *"These will all have to have unique 3d models produced programmatically - maybe
let the user do the same shader stuff as a ship... along with things like a swarm density slider
(showing power harvested from star as well as occlusion). Dyson shell coverage up to 100% for a
sphere (seeing it grow). Asteroid counterweight for beanstalk/space elevator, etc... These are a
special 'subsection' of special constructs rather than a bunch of if thens... i.e. proper structure
for mega-constructs."*

**THE PATTERN ALREADY EXISTS IN THIS CODEBASE, IT IS PROVEN, AND ITS OWN FILE ARGUES THE CASE BETTER
THAN THIS SECTION CAN.** `src/lib/physics/overrides.ts` (G37) is one record per quantity a GM may
pin, and it replaced exactly the shape the owner is trying to avoid. Its header:

> *"WHY A REGISTRY RATHER THAN A ROW PER QUANTITY IN THE EDITOR. The overrides were four scattered
> implementations before this... Each had its own seed, its own clamp, its own reset and its own
> wording, and the info panel listed a hand-written subset of them that had already drifted... One
> record per quantity means the tab, the info-panel strip, the Newton trace and the warnings all read
> the SAME description, and a ninth override is a new record rather than a new copy of the pattern."*

**Copy it.** A mega type is a record; adding a Shkadov thruster is a new record, not a new branch.

### 5b.1 The record

Deliberately shaped like `OverrideDef`, because a mega-construct's tunables ARE overrides in every way
that matters — and that means the existing override ROW, badge, warning colours and Newton-trace
rendering already know how to display them.

```ts
export interface MegaTypeDef {
  key: MegaType;                     // 'space-elevator' | 'ringworld' | 'dyson-swarm' | …
  label: string;
  family: ShapeFamily;               // 'tether' | 'ring' | 'shell' | 'spheroid'
  hint: string;                      // one line: what this thing IS
  icon: ConstructIconShape;          // 2D chrome, from the ONE glyph table (§2.4)

  /** Placement, as DATA (§3.5): `hard` clauses grey it, `steer` clauses tag and explain. */
  requires: MegaRequires;

  /** The knobs. Each record is OverrideDef-shaped: label, unit, hint, soft/hard, plausible, absurd. */
  params: readonly MegaParamDef[];

  /** PURE. params + host → the NUMBERS. No THREE, no DOM, no globals. §5b.3. */
  derive(params: MegaParams, host: CelestialBody): MegaDerived;

  /** PURE. params + host → a geometry SPEC: radii, profiles, segment counts. Still no THREE. §5b.3. */
  shape(params: MegaParams, host: CelestialBody): ShapeSpec;

  /** Where a ship may dock, from the same params (§7). */
  dockNodes(params: MegaParams, spec: ShapeSpec): DockNode[];
}
```

**The two-tier warning transfers exactly and it is worth keeping.** `OverrideDef` distinguishes
*amber* (no known mechanism, but breaks no law) from *red* (breaks conservation or contradicts the
quantity's own definition) — the owner's own distinction, 2026-08-22, and **neither is a refusal**.
Mega parameters land on it perfectly: a Dyson shell at 100% coverage is amber (materially impossible,
physically coherent); a swarm harvesting more power than the star emits is red.

### 5b.2 The parameters are PHYSICS INPUTS that happen to also drive geometry

**This is what stops them being cosmetic sliders, and it is the house rule rather than a preference:
physics and data drive tags; tags drive the image.** Every knob the owner named has a derivation
hanging off it, and the geometry is the *second* consumer, never the first.

| parameter | physics it drives | geometry it drives |
|---|---|---|
| **swarm density** 0..1 | `starOcclusion` → insolation → temperature, habitability, colour (§6); **power harvested** = density × L\* × efficiency | shell patchiness / fill (§5b.4) |
| **shell coverage** 0..100% | occlusion; re-radiated waste heat (W and T); shell mass | how much of the sphere is closed — *watch it grow* |
| **counterweight mass** | the tether's taper ratio, and whether the elevator stands up at all | the mass at the top of the ribbon |
| **ring radius / width** | spin gravity ω²r; orbital band occupied; ring-instability tag | the annulus itself |

**Power harvested is the owner's own addition and it is the best one**, because it closes a loop the
engine already has: `systems.power_plants[].output_MW` exists on every construct template. A swarm's
harvest is not a new field — it is that field, derived instead of authored. A GM sliding density up
watches the star dim, the worlds cool, and the output climb, all from one number. **That is the
physics→tags→visuals chain doing real work rather than illustrating itself.**

### 5b.3 `derive` and `shape` are PURE and return DATA — and this is the load-bearing decision

**THREE.js appears at ONE edge and nowhere else.** `shape()` returns radii, profiles, segment counts
and vertex positions; a thin builder turns that spec into geometry.

**THE REASON IS VERIFICATION, and it is a standing rule rather than taste.** [[E7]], measured
2026-08-08: *a canvas surface cannot be verified by a worker session AT ALL* — the pane runs
`document.hidden === true`, so `requestAnimationFrame` never fires. **If the shape maths lives inside
the geometry construction, no agent can ever gate a ringworld's dimensions, and the owner's eye is
the only test that exists.** Pure `shape()` puts the maths in the ordinary headless suite: a
ringworld's circumference, a tether's taper profile, a shell's area at 40% coverage are all just
numbers, asserted like any other.

**And the same split is what let the scale law be trusted.** `scaleLaw.ts` is pure, `scene.ts` calls
it, and that is why R9 is a test rather than a hope — §5's mega-scale measurement was possible only
because of it.

**Corollary: `derive()` must be idempotent and clock-derived, never accumulated.** See §5b.6.

### 5b.4 ONE GEOMETRY: a parametric sphere section, with a render-mode switch

Owner, 2026-08-28, two messages that between them collapsed this further than any draft had:

> *"a swarm will not be lots of objects just 1 shaded appropriately... they may move but together -
> practical rather than realistic."*
>
> *"effectively a swarm would be a simple polygon (dyson sphere/part sphere/ring) but only the apexes
> are drawn. A ring is just an unfinished sphere - they can all use the same draw call."*

**He is right, and THREE already has the primitive.** `THREE.SphereGeometry(radius, widthSegments,
heightSegments, phiStart, phiLength, thetaStart, thetaLength)` takes longitude AND latitude extents
directly, so "an unfinished sphere" is not a metaphor — it is two arguments.

| what | latitude (`theta`) | longitude (`phi`) | drawn as |
|---|---|---|---|
| Dyson sphere (complete) | full | full | faces |
| Dyson shell, partial | full | partial, growing to full | faces |
| **Ringworld** | **narrow band at the equator** | full | faces |
| Orbital ring / planetary torus | narrow band | full | faces |
| **Dyson swarm** | full | full | **points — the apexes only** |
| Collector array | partial | partial | points |

**ONE generator, ONE draw call, and the differences are arguments rather than branches.** That is the
"proper structure rather than a bunch of if thens" applied at the geometry layer as well as the
registry layer.

**A ringworld as a latitude band is geometrically honest, not a fudge.** A 1 AU ring 1,000 km wide
subtends about 4e-6 radians of latitude; the difference between that sphere band and a true cylinder
ribbon is far below a pixel at any zoom. Niven's ribbon and an unfinished sphere are the same object
at this scale.

**SO THE FAMILY LIST COLLAPSES TO THREE, AND ONLY ONE IS A NEW GENERATOR:**

| family | what it is | new? |
|---|---|---|
| `sphere-section` | the parametric section above, faces or points | **yes — the one new generator** |
| `tether` | a line/thin cylinder, surface to counterweight | **yes — but it is a line, not a mesh problem** |
| `spheroid` | today's `attachHullVolume` ellipsoid, or a GLB | no, exists |

From "six specialised render paths" in the owner's original ask, to **one parametric generator plus a
line.** Everything else is parameters.

**DENSITY IS THE SEGMENT COUNT, and that is an honest mapping rather than a convenient one.** A
swarm's density slider drives `widthSegments × heightSegments` — more collectors, more apexes drawn —
AND drives `starOcclusion` and the harvested power (§5b.2). One number, three consumers, no
duplication.

> **ONE RENDERING TRAP, worth naming before somebody ships it.** A UV sphere's vertices CLUSTER AT
> THE POLES: `SphereGeometry`'s apexes are dense at top and bottom and sparse at the equator. Drawn
> as points, a swarm would visibly bunch at its poles for no physical reason. **Use an even
> distribution for the points path — a Fibonacci sphere is about six lines and needs no library** —
> and keep `SphereGeometry` for the faces path, where the clustering does not show. Same family, same
> parameters, one honest difference in how the vertices are chosen.

### 5b.4b THE INSIDE IS A WORLD — and this is the strongest argument yet for the hybrid

> **ROLLED INTO THE SURFACE-AREAS SYSTEM, owner decision 2026-08-28 — see `surface-areas-design.md` §10 ([[G56]]) before building any of this section.** The interior is a `SurfaceArea` band with an inward facing; gravity comes from a CALCULATED SPIN (never a fake g) through one region-gravity provider; the atmosphere is the same model with retention restated (rim walls in scale heights; a spun sphere pools its air into an equatorial band — a sphere is atmospherically a ring, which is why honest catalogues grow many rings and spheres read amber off-equator). The seven derivations below stand; §10 names the record they hang from.

Owner, 2026-08-28: *"The INSIDE of a ringworld or sphere will be 'livable' and show living world
parameters and are drawn in 3D - An inside out planet with green life."*

**This is the payoff for §3.1's decision, and it goes further than gravity did.** A ringworld is not
`kind: 'body'` merely so the n-body sum sees its mass. **It is a body because it has a SURFACE, and
this engine's entire surface stack — temperature, atmosphere, hydrosphere, biosphere,
classification, apparent colour — already exists and already runs on bodies.** Making a ringworld a
construct would have meant rebuilding every one of those for it. Making it a body means the inner
surface gets them for free.

**What is genuinely the same, and should be reused without modification:** atmosphere and pressure,
hydrosphere and liquids, biosphere and vegetation tint, apparent colour, the tag chain, the info card,
the from-the-surface view.

**What is genuinely DIFFERENT, and each of these is a derivation change rather than a new subsystem:**

| quantity | on a planet | on the inner surface |
|---|---|---|
| **gravity** | GM/r² from its own mass | **spin: ω²r** — `spinRadiusM` and `rotation_period_hours` already exist |
| **insolation** | 1/d² from a star at varying distance | fixed distance from a star **at the centre**; no eccentricity, no seasons |
| **day/night** | axial rotation, tilt-driven seasons | **shadow squares** (a ringworld) or the far side of the shell; no tilt, no seasons at all |
| **lighting direction** | lit from outside, one terminator | **lit from the middle** — the concave side is lit everywhere the star sees |
| **horizon** | curves away in every direction | curves **UP** along the ring and is flat across it |
| **surface area** | 4πr² | band circumference × width — **and it is the headline number** |
| **composition** | derived from makeup | **DECLARED** — it is built, not formed (`artificial`, §3.3) |

**"Artificial structure, real climate"** is the line to hold, and the owner stated it directly,
2026-08-28: *"'habitable' is the standard parameters - although spheres and rings WILL be subject to
actual temps based on distance - hence the goldilocks zone recommendation (maybe aliens can have
hotter/colder ones)."*

**So: the habitability stack is used UNCHANGED — no special case, no parallel model — and the
temperature feeding it is DERIVED, not authored.** A ring at 0.5 AU is hot, one at 2 AU is cold, and
the engine says so. The floor is built; the climate on it is real. That keeps the honesty rule intact
while refusing to pretend a built world condensed out of a disc.

**AND THAT IS EXACTLY WHY THE HABITABLE ZONE IS A *STEER* CLAUSE AND NOT A HARD GATE (§3.5).** A
ringworld needs A STAR TO CIRCLE — that is relevance, and it is hard. **Sitting in the goldilocks
zone is plausibility**: building one at 3 AU is a perfectly legitimate thing a GM may do, and what
the engine owes them is the number (*"the inner surface sits near 160 K"*), not a refusal. It is a
recommendation, which is the word the owner used.

**AND THE ZONE ITSELF IS A DEFAULT THAT CAN BE SWAPPED — *"maybe aliens can have hotter/colder
ones"*.** This is the standing rule about never assuming an Earth, Sol or human baseline, arriving
exactly where it always does: the goldilocks band is HUMAN-habitable by default, and the honest
general answer is the SOLVENT'S OWN liquid range ([[G19]]). A ring built by something living in
liquid ammonia wants a colder ring, and the engine should say *whose* zone it is measuring against
rather than presenting one band as "the" habitable zone.

**A NOTE FOR WHOEVER BUILDS IT:** the inner-surface temperature is `calculateEquilibriumTemperature`
with a FIXED distance and no eccentricity — which means it runs through the second of the two
luminosity sites [[B110]] names. **Unify that first**, or the two sites will disagree the moment anything dims a star — a world
orbiting OUTSIDE a swarm could have its habitable zone drawn from the dimmed star while its
temperature comes from the undimmed one: silent, and physically incoherent. (Direction of the
rule, corrected 2026-08-28 — this sentence originally had it backwards: an occluder never dims
ITSELF, its sunward face takes the raw star and that is the harvest; a body INSIDE an occluder's
radius is likewise undimmed; only a body with the occluder between it and the star sees less.)

**PUBLISH THE AREA, because it is the number that makes a ringworld land.** CORRECTED during the
phase-1 build (the original sentence conflated the circumference with the area): a 1 AU ring's
circumference is 9.4e8 km; at 1,000 km wide that is 9.4e11 km² — about **1,800 Earths**. The
**three million Earths** headline needs Niven's width, ~1.6 million km: 9.4e8 km × 1.6e6 km ≈
1.5e15 km² ≈ 2.9e6 Earth surface areas — which is why the shipped template seeds that width, and
`megaDerive.spec.ts` pins the figure. That single number does more to convey what a megastructure
IS than any render, and the engine states it exactly.

**THE TEXTURE CANNOT BE A TEXTURE — OWNER, 2026-08-28, and this is the sharpest constraint in the
whole interior problem.** *"how would it scale - as it may be 1 pixel per AU... we may need to
deterministically procgen it with LOD camera view to have continents of 'our scale' across its
surface - giving people a HINT of how truly massive it would be."*

**He is right, and the arithmetic is brutal.** A 1 AU ring 1.6 million km wide is 9.4e8 km around.
An 8192-pixel map along its length gives **115,000 km per pixel** — nine Earth diameters in one
texel. A 16k map gives four. There is no fixed image that is not a lie at this scale: the moment a
GM zooms toward the floor, an authored texture is either a blur or a repeat.

**So the interior surface is PROCEDURAL AND LOD-DRIVEN, not painted, and that is a requirement
rather than an optimisation.** The shape of it:

- **Deterministic from the node's stable id**, never RNG and never frame-dependent — same seed rule
  as everything else here (§3.7), and doubly required because the GM and every player must see the
  SAME continents. A procedurally-detailed surface that differs per client is a shared-fiction bug.
- **TWO SCALES, AND THEY COME FROM DIFFERENT PLACES, which is the part worth getting right.** The
  LARGE-scale pattern is DERIVED: where sea lies against land, the ice at the cold end of the band,
  the cloud cover, the vegetation tint — all of it already computed by the surface stack this design
  reuses (`apparentColor.ts` and its inputs). The SMALL-scale detail is INVENTED: coastline
  crinkle, mountain grain, river-scale texture, generated in the shader at whatever level the camera
  is asking for. **Physics decides what is there; procedure decides what it looks like up close.**
  That keeps the physics-drives-tags-drives-visuals rule intact at a scale where an artist cannot go.
- **The LOD is the point, not a performance trick.** The intended experience is the owner's: pull in
  from the whole ring to a coastline and have CONTINENTS OF OUR SCALE keep resolving, so the size of
  the thing lands on someone by making them travel it. A single-resolution surface cannot give that
  at any resolution.
- **Cost note for whoever builds it:** procedural noise in the fragment shader carries no texture
  memory at all, which is what makes an object this large affordable — and `buildDisplayModel`
  already takes any `Object3D`, so a custom interior material sits beside the seven hull finishes
  rather than replacing them.

**RENDERING THE INTERIOR — three concrete notes.**
- **Normals face inward.** The interior needs `side: THREE.BackSide` (or flipped normals) on the
  faces path; the camera lives inside the shell, not outside it.
- **The star is inside the geometry**, so the usual "is the star occluded" logic runs backwards.
  Interior lighting comes from the centre outward.
- **The livable band is a TEXTURE on the section, not new geometry** — the same green/blue/cloud
  treatment `apparentColor.ts` already derives for a planet, mapped along the band. Which is the
  other reason §5b.6's UV note matters: real UVs running along the ring's length make this work and a
  box projection does not.

**AND IT ANSWERS AN OPEN QUESTION.** §11 asked whether a ringworld's interior should get a
"from the surface" view. **The owner has answered it: yes, drawn in 3D, showing living-world
parameters.** Struck from the open list.

### 5b.5 Zoom for rings follows belts and rings

Owner, 2026-08-28: *"zooming for rings will be like belts/rings."* So a mega ring does NOT take the
ship pixel-LOD (a screen-size floor that hands back to a glyph). It takes the belt/ring behaviour the
engine already has — `beltStyle: 'rocks' | 'band'` and `beltDetail` — a band at distance resolving
into structure as the camera comes down. **That is a third existing renderer partly reused, and it
also answers what a ringworld does under zoom, which was open.**

### 5b.6 The shader reuse is FREE — with one caveat found

`buildDisplayModel(source: THREE.Object3D, { hadMaterials, tintHex, finish, seed, … })`
(`modelViewer.ts:303`) takes **any** `Object3D`, and `HullFinish` is already seven finishes:
`flat` · `cel` · `matcap` · `blueprint` · `plated` · `patina` · `iridescent` (`modelViewer.ts:61`).
**Procedural geometry gets the whole ship treatment with no changes to that pipeline** — which is
exactly what the owner asked for, and it costs nothing.

> **THE CAVEAT, `modelViewer.ts:340`:** *"The livery finishes need UVs a printing mesh never has -
> box-project them from the shape"*, and `boxProjectUVs` is the fallback. That fallback exists for
> imported hulls with no UVs, and it will be WRONG on a 1 AU hoop — a box projection across a
> ringworld smears the texture across its whole circumference. **A procedural generator should emit
> real UVs** (running along a ring's length, around a shell's latitude, along a tether's rise), which
> is nearly free when you are generating the vertices anyway and is the difference between `plated`
> looking like plating and looking like a stretched smear.

`seed` is already a parameter, so deterministic per-object variation is available — and **must** be
used rather than RNG, for the same reason as §3.7.

### 5b.7 Parts are NOT nodes — with one deliberate exception

A ringworld has shadow squares; an elevator has a ground station, a ribbon and a counterweight; a
swarm has notional collectors. **None of those become `System.nodes`.** They are geometry plus dock
nodes on ONE node. Making them nodes would put them into the hierarchy, the transit planner, the
redaction path and the position walk, for no gain.

**THE EXCEPTION IS THE OWNER'S OWN, AND IT IS THE GOOD ONE:** *"Asteroid counterweight for
beanstalk/space elevator"*. A counterweight that is a **real captured asteroid** is already a node —
a GM put it there — so the elevator REFERENCES it rather than owning it:

```ts
counterweightId?: ID;      // a real body in this system; its mass feeds the taper derivation
counterweightMassKg?: number;  // fallback when there is no such node — a notional mass
```

**And this is where §3.7's asteroid work pays off in a way nobody designed for:** grab a rock, make
it your counterweight, and its actual mass — now that asteroids are real bodies with real mass —
feeds whether the beanstalk stands up. Two features meeting is worth more than either alone.

### 5b.8 Growth over time — the first genuinely TEMPORAL mega feature

*"Dyson shell coverage up to 100% for a sphere (seeing it grow)"* implies coverage may be a function
of the campaign clock, not only a stored scalar. That is new for this family and it points straight
at the owner's evolution-engine work.

**Phase it: a scalar first, a schedule later.** A stored `coverage` is phase 1 and gives the slider.
A completion curve (start, rate, target) is a later item and is genuinely an EVENT — the same driver
[[G41]] says it needs.

> **WHICHEVER IT IS, IT MUST BE DERIVED FROM THE CLOCK AND NEVER ACCUMULATED PER TICK.**
> `src/lib/system/idempotence.test.ts` enforces that nothing reads a value a later pass writes, and a
> coverage that increments each frame is precisely that fault. `coverage(t)` from a stored start and
> rate is idempotent; `coverage += rate` is not, and it would also make a save non-reproducible and
> break time-scrubbing backwards.


---

## 6. The physics that makes these worth having

This is the part that is not decoration, and it is where the category earns itself. **Each of these
is an existing engine chain the mega-construct feeds — no new physics subsystem is required.**

**Starlight occlusion — the big one.** A Dyson swarm at `starOcclusion: 0.4` means every body
outside it receives 60% of the insolation it otherwise would. The engine already runs
luminosity → insolation → temperature → habitability → colour on every pass. Feeding one multiplier
into that chain gives a Dyson swarm real consequences on every world in the system, and it is
arguably a dozen lines. **This is the highest-value hook in the whole feature.** It is also the
honest one: building a swarm and having nothing get colder would be the engine lying.

> **THE GEOMETRY OF WHO IS SHADOWED — owner refinement, 2026-08-28, and it is data already in
> hand.** The one-multiplier rule above is the ISOTROPIC case: a full shell, or a swarm spread
> over the whole sphere, dims every body outside its radius equally. **A BAND does not.** A
> ringworld, torus or narrow swarm band occludes another body only when that body is ALIGNED
> with it — the star→body ray must pass through the band, i.e. the body's direction from the
> star lies within the band's latitude extent. That extent is exactly `shape()`'s
> `thetaStartRad`/`thetaLengthRad`, and the engine already resolves every body's position, so
> the test is one angle comparison per body per occluder — *"we have that geometry handy to
> use"* (owner). Three rules, then: an occluder never dims ITSELF; a body radially INSIDE the
> occluder is undimmed; a body outside it is dimmed by the fraction (isotropic occluder) or
> only when aligned (band). The same directionality feeds [[G54]]'s observable end: from most
> directions a thin ring does not dim its star at all, so the anomaly badge is a function of
> the OBSERVER'S bearing for bands — see that design's §2b.

**Waste heat.** A shell re-radiates in the infrared at a temperature set by its radius and the
star's output. That is a one-line Stefan-Boltzmann result and it is the observable that makes a
Dyson sphere findable — directly adjacent to [[G31]] (the one-spectral-system investigation), which
already wants full-EM rather than visible-only.

**Spin gravity.** `spinRadiusM` and `rotation_period_hours` already exist; surface gravity on a
torus or ringworld is ω²r and belongs on the same card as a body's `g`, in the same units, with the
same "you would weigh…" framing. Do not invent a second gravity display.

**Ring instability — a lovely honest tag.** A rigid ring around a mass is gravitationally UNSTABLE
(the classic result: it has no restoring force against lateral displacement). A ringworld therefore
requires active station-keeping, forever. That is exactly the *steer, do not stop* shape: tag it,
explain it, name the correction the ring must run, and let the GM keep their ringworld.

**Elevator feasibility.** The taper ratio of a tether is set by the host's surface gravity, spin
rate and the material's specific strength. It is a closed-form expression and it produces the most
useful sentence in the feature: *"on this world, at this spin, the tether needs about 50 GPa·cm³/g —
steel is 2, carbon nanotube is around 50."* And on a tidally-locked or very slow rotator,
geostationary lies outside the Hill sphere and the elevator genuinely cannot exist — a real,
computable steer rather than a taste judgement.

**NEVER ASSUME AN EARTH OR HUMAN BASELINE** (standing rule). Spin gravity "comfortable for humans"
is a human default you can swap, not the model. A habitat's target g belongs beside its
biochemistry, and the framing goes on the OUTPUT (*"about Earth gravity"*), never in the derivation.

---

## 7. Docking and the transit planner

The owner: *"probably can be docked against - so needs properties for the transit planner to work
against."*

**What exists.** Constructs already interact: `src/lib/transit/constructInteractions.ts` derives a
target's incoming visits from the visiting ships' flight logs, with no mirrored copy — the ship's
log is the single source of truth, which keeps it correct through time-scrubbing. The interaction
kinds are `load`, `unload`, `refuel`, `loiter`. The autopilot planner
(`src/lib/transit/autopilotPlanner.ts`) already routes ships to constructs.

**What a mega-construct adds is that it is not a point.** A ship does not arrive "at" a ringworld;
it arrives at a named place ON one, and those places are hundreds of thousands of km apart. So:

```ts
interface DockNode {
  id: ID;
  name: string;               // "Ground Terminal", "Geostationary Platform", "Hub 4"
  /** Where on the parent's own geometry, so the renderer and the planner agree. */
  at: { kind: 'surface'; latDeg: number; lonDeg: number }
    | { kind: 'ring'; angleDeg: number }
    | { kind: 'altitude'; km: number };
  services?: ('refuel' | 'resupply' | 'repair' | 'cargo' | 'passenger')[];
  capacityTonnes?: number;
  /** Elevator only: reaching this node from the surface costs almost no delta-v. THE POINT. */
  deltaVFreeFrom?: ID;
}
```

**The transit consequence worth designing for, and it is a genuinely good bit of play:** a space
elevator makes surface-to-orbit nearly free. A planner that knows this routes a cargo run through
the elevator instead of burning to orbit, and the ship's log then reads differently. `deltaVFreeFrom`
is how the planner learns it without a special case for elevators.

**Do not mirror docking state onto the mega-construct.** The existing design derives a target's log
from the fleet on demand for good reasons stated at the top of `constructInteractions.ts`; a second
copy would need dedup, pruning and time-scrub handling. Derive per dock node the same way.

---

> **THE ELEVATOR'S DOCK LADDER — owner, 2026-09-01, captured for the phase-5 `dockNodes` work:**
> *"in the transit planner we need to have new options - LO - Elevator, MO - Elevator, GO -
> Elevator - as there will be multiple docks - kinda why it is so useful. And that would just be a
> destination tweak - the ship will still be in orbit but aligned with the mast."* So: one dock
> OPTION per orbit band the ribbon crosses, each an ordinary orbit at that band with an alignment
> constraint (same longitude as the anchor), not a new flight mechanic. The 2D glyph already says
> it: the mast's knob IS the geostationary dock.

## 8. The catalogue

The six named, plus what each one's presence buys.

| type | family | requires | gravitationally significant | what it changes |
|---|---|---|---|---|
| **Space elevator** | tether | planet/moon with a surface; real geostationary inside the Hill sphere | no | surface↔orbit at near-zero delta-v; taper-ratio steer |
| **Planetary torus / orbital ring** | ring | any body with a surface (gas giants allowed) | marginal — declare | many dock nodes; can carry tethers down |
| **Ringworld** | ring | a star; radius in or near the habitable zone; clear orbital band | **yes** | spin gravity; ring-instability tag; occupies a whole band |
| **Dyson sphere** | shell | a star | **yes** (shell mass) | occlusion; waste-heat IR; no gravity on the inner surface |
| **Dyson swarm** | swarm | a star | no (distributed) | occlusion, tunable 0..1; the physically plausible sibling |
| **Massive energy collector** | swarm | a star; within some AU | no | partial occlusion; power output feeds `systems.power_plants` |
| **Death Star** | spheroid | anywhere; it MOVES | **yes** | a mobile mass; can host its own satellites |

**"Add others?" — the ones the engine can already make mean something.** These are ranked by how
much existing machinery they light up, not by how impressive they are:

1. **Shkadov thruster / stellar engine** — a statite mirror that accelerates the star itself. This
   is the standout suggestion: it is a slow, continuous **event driver on the star's own motion**,
   which is precisely what the new n-body/REBOUNDx work is for. [[G41]] already says outright it
   needs an event driver.
2. **Soletta / orbital mirror** — redirects light onto ONE world. Same occlusion machinery with the
   sign flipped, and it makes terraforming a thing a GM can build and watch work.
3. **Birch planet** — a habitat around a black hole. Black holes are already modelled, with lensing
   and accretion in the renderer, and this puts them to use.
4. **Aerostat mega-habitat** — a floating city in a gas giant's atmosphere. The cloud-deck and T(P)
   model is already there and would drive the altitude directly.
5. **Matrioshka brain** — nested shells. Waste heat at several temperatures; a pure win for the
   full-EM work in G31, and almost free once `shell` exists.
6. **Topopolis** — a tube looped many times around the star. Family `ring`, one parameter more.
7. **Alderson disc** and **Bishop ring** — `shell` and `ring` with different numbers. Cheap once
   the families exist, which is the point of designing families rather than types.

**The picker should show the swarm before the sphere.** A Dyson swarm is the buildable one; a rigid
shell is not materially possible and the engine can say so pleasantly while still letting a GM have
one.

---

## 9. Compliance with the standing rules

Named explicitly, because each of these has cost this project real work at least once:

- **Steer, do not stop** — §3.5, and note the owner's own correction there: RELEVANCE is a hard gate
  (a space elevator in deep space has no referent), PLAUSIBILITY steers (a tether needing unobtanium).
  Only the second is a physics criterion, and tags never rewrite authored data.
- **Physics and data drive tags; tags drive the image** — occlusion, spin gravity, ring instability
  and taper ratio are physics; the tags follow; the renderer reads tags. No renderer computes a
  physical fact.
- **Constants are data** — every placement predicate and every threshold lives in the rule pack (§4.2).
- **Duplicated functionality is this codebase's most recurring fault** — one `artificial` predicate
  (§3.3) rather than 154 edited chrome gates, and note `SystemProcessor.ts:602` in §3.2, where the
  orbital PERIOD around a construct already reads a mass its POSITION does not — two answers to one
  question, found by this design rather than fixed by it. Also:
  one glyph vocabulary (§2.4), one radius field for rings (§4.1), one docking source of truth (§7).
- **Never assume an Earth/Sol/human baseline** — §6.
- **A physics change is not finished until the explanations follow it** — the physics page,
  `physicsTrace.ts`, `docs/tags-guide.md` and `docs/classification-and-tags.md` all describe this
  engine and all drift silently. Occlusion changing a world's temperature MUST show up in the Newton
  explainer, which claims to show the working.
- **Nothing may read a value a later pass writes** — `src/lib/system/idempotence.test.ts`. Occlusion
  is a system-level quantity feeding per-body insolation, so **iterate the star's occlusion before
  any body that reads it**, and expect this test to be the one that catches a mistake here.

---

### 7b. How the dock is DRAWN (shipped v3.0.291) - the promise the LO/MO/GO ladder can rely on

The geostationary dock is placed by the SATELLITE LAW (`scaleLaw.ts satelliteDrawDistance`, engine
map RENDER-S50) - the same call, with the same inputs, that places a moon or a station. So a
station whose orbit is at geostationary sits ON the dock at every body-size and compression
setting, and the ribbon can never reach past the Moon: the law is monotonic in distance. The
ribbon's base is the host's drawn surface, its width and knobs are host fractions floored in
screen pixels, and when the whole structure falls inside a floored true-scale globe it hides and
the mast glyph carries it. The anchor is on the EQUATOR (the shape declares `anchorLatitudeDeg:
0`), so the ribbon sweeps the equatorial plane with the planet's spin and a geostationary station
authored in the parent's equatorial frame (C3) rides its top. The plan view draws the same
structure through its own scale (`scaleBoxCox`) as a radial from the disc edge - `render2d.structure
'radial'`. When the ladder's dock nodes land (phase 5), the destination "GO - Elevator" is this
point.

## 10. Phasing

Each phase is shippable on its own and none of them is wasted if the next is dropped.

**Phase 1 — the category exists and is honest.** `artificial` + `megaType`, the `artificial.ts`
predicate module, the `mega` pack category, the placement vocabulary with its hard/steer split, and
the picker tab. **Hybrids are still `kind: 'construct'` in this phase** — no physics change at all,
so the whole of phase 1 carries no risk to any existing system. Every type renders with today's
ellipsoid.

**Phase 2 — the scale law learns about them. DONE 2026-08-28, AND MOSTLY IT WAS ALREADY TRUE —
this phase turned out to be a MEASUREMENT rather than a build, and it corrected itself.** The ask
was: put a mega on P4's span map and keep R9 green; give the shapes a real extent so framing,
`minDistance` and the system extent see them. Measured on the bundled ringworld:

- **The span map already carries mega scale.** A 1 AU ringworld draws 1.315 scene units against
  Sol's 0.424 and Earth's 0.220 — ordered, R9 intact, nothing to do. (Confirms §5's own measurement.)
- **THE EXTENT ASK WAS WRONG AND IS WITHDRAWN.** A body's radius reaches BEYOND its orbital
  position, which is why A78 adds it; a ring, shell or swarm is CENTRED ON ITS HOST, so its orbit IS
  its radius and the position term already carries its whole reach. Lone star + 1 AU ringworld:
  rMax is 1 AU and correct; adding the radius gives 2.005 AU, and `trueScaleFactor` being
  `gridRadius / rMax` means every object in that system would draw at **0.499x**. `RENDER-S2`
  therefore SURVIVES — it was expected to be falsified here — and `systemExtent.spec.ts` now guards
  the wrong change with the measurement on it.
- **`frameDistance` passing a construct's FULL length where the solver documents a HALF-extent is
  DELIBERATE**, reasoned at the code (a half-length close-up "read as zoomed in too much"). Not a
  bug; left alone.
- **What WAS real:** three spellings of "how big is this visual" and one of them wrong — the
  occlusion site read `radiusScene ?? shipLen`, and a construct's `radiusScene` is a hard `0` rather
  than undefined, so `??` never fell through and every construct was a point there. Unified onto one
  `renderedSpanScene` accessor in `scene.ts`.

**The one thing phase 2 hands forward:** at the phase-5 flip a mega becomes `kind: 'body'` and
starts answering `physicalRadiusAu` on the body branch — which for a CENTRED ring is exactly the
double count above. Decide what a centred body's extent means before the kind changes.

**Phase 3 — the two new shape families.** `tether` and `ring` in 3D and 2D. These are the two most
visually striking and they cover four of the seven named types.

**Phase 3 — the two new shape families. THE GENERATOR IS BUILT AND GATED (2026-08-28); the LOOK is
the only part still unseen.** `constructs/megaGeometry.ts` is the one builder: `SphereGeometry`'s
phi/theta window makes shell, growing shell, ringworld, torus and swarm one draw call with
different arguments, exactly as the owner said; the points path uses a golden-angle distribution
so a swarm does not bunch at its poles (the named trap, now a test that measures equal-area
latitude bands); the faces path emits real UVs so a livery cannot smear round a 1 AU hoop. Wired
into `scene.ts` as `attachMegaVolume`, which keeps `attachHullVolume`'s whole contract — unit long
axis, `shipModel`, emissive, the same `shipLenScene` SIZE — so ONLY THE SHAPE CHANGES and no
framing, LOD or scale-law behaviour moves. A type with no generator (the Death Star spheroid)
returns null and keeps the ellipsoid, undluplicated.

> **THE ONE THING MEASURED AND NOT SOLVED, because solving it blind would be the renderer
> inventing a fact.** A ring's band is genuinely a sliver of its own diameter: measured in the
> shipped bundle, a default ringworld is **0.0053** of its diameter thick and a planetary torus
> **0.0039**. That is geometrically honest (§5b.4 says so) and it means that at most zoom levels
> the band is SUB-PIXEL — a 1 AU hoop drawn one pixel wide, or aliased away entirely. The
> existing pixel floor scales the WHOLE object and cannot thicken a band. Whether a ring needs a
> minimum DRAWN thickness (the same honest device as RENDER-S43's screen-space floor, applied to
> one axis) is a decision that needs an eye on it first: it is the difference between a ring you
> can see and a ring that is technically correct and invisible. **Phase 3's first eyeball item.**

### Phase 3b — THE 2D ORRERY, SELECTION AND FRAMING. OWNER NOTES, 2026-08-28, from the GM screen.

Captured verbatim-ish and NOT acted on — his words: *"no need to do now - just notes for when you
get there."* All four came from looking at a Dyson sphere on the 2D GM view, where it drew as a
single dot on an orbit line.

1. **DRAW IT AS A THICKISH ORBITAL RING, not a dot and not a disc.** *"for clarity I guess we should
   draw it like a thickish orbital ring."* The 2D orrery has no mega path at all today — a
   megaconstruct takes the ordinary construct glyph (`traceConstructIcon`, one shape from the A34
   vocabulary), which says nothing about it being a structure that encircles the star.
2. **ITS TRUE SIZE WILL NOT READ UNTIL YOU ARE CLOSE IN, AND THAT IS ACCEPTED.** *"which will not
   show the right size until close in - not going to happen."* So the 2D ring is a
   READABILITY device with a deliberate, stated departure from scale — the same honesty the size
   dials already carry (RENDER-S42). Do not chase true scale in the plan view.
3. **A NAMED CIRCLE IS THE SELECTION TARGET, AND IT MUST BEAT A BELT FOR EASE.** *"Having a circle
   with the name is also helpful as a selection item as the whole ring is cumbersome and we want it
   to be easier to select than a belt/ring as it will be used."* Two things in one sentence: the
   click target is a MARKER (circle + label) rather than the ring itself, and the bar is explicitly
   set ABOVE the belt/ring experience because a mega is a place a GM will actually visit. Note the
   ring stays selectable too — the marker is an easier handle, not a replacement.
4. **THE FRAMING IS WRONG AND THE RIGHT SHOT IS THE RING PLUS ITS STAR.** *"that image shows first
   click but we would select the ring and star framing."* Concretely, and this is implementable as
   stated: a `megaCentred` construct must frame its HOST at the ring's own drawn radius, not itself
   at its `shipLen`. Today `frameDistance` reads the node's own position and hull length, so the
   first click flies to a POINT ON the ring with the star out of frame — which is exactly what the
   screenshot shows. The pieces already exist: the host visual and the ring's drawn radius are both
   computed every frame for the centring fix (v3.0.204), so the shot wants that radius as its
   half-extent and the host as its target.

> **MORE OWNER NOTES, 2026-08-30, on seeing the 2D rings live at v3.0.224 - captured, not yet
> acted on.** The 2D treatment is CONFIRMED right by his eye ("perfect"): ring-as-orbit-line in
> the construct's colour, glyph on top as the click target. Two 3D asks added: **(e) a Dyson
> SPHERE must not draw as the occluding shell it really is ON THE GM VIEW** - his words: a "not
> get in the way" visualisation, "rendering as a band rather than an occluding disc (the
> reality)", "with an easily clickable handle for selection" (the same named-circle target as
> (b)). PROPOSAL AWAITING HIS CALL: GM view draws the band plus an honest sphere hint (coverage
> strip or faint wireframe); the PLAYER view keeps the honest closed shell, because the lights
> going out is the drama the players are owed. **(f) the GM view should let you SENSE THE SPEED
> OF ROTATION** from the band. The honest form derives the spin angle from the campaign clock x
> rotationPeriodHours (derived, never accumulated), so rotation becomes visible under time
> compression exactly as orbits do - but a ~215 h ringworld is imperceptible at real time, and an
> exaggerated indicator spin would be the renderer inventing a fact. Decide BY EYE whether
> honest-under-compression reads well enough before any indicator is considered.

### Phase 3c — WHAT IS STILL VISUALLY WRONG, owner-reported 2026-08-28. NOT FIXED, ON PURPOSE.

His call, and it is the right one: *"no point in trying to fix all visual bugs before visuals
finished... best to finish and we loop back with fixes."* So these are CAPTURED, not chased. Each
is a real observation from a running build, with what is known about the cause.

1. **THE SPACE ELEVATOR MUST BE EQUATORIAL.** Today its anchor is `surfacePointFromId` - a stable
   pseudo-random point on the sphere, deterministic per construct, which is right for a station and
   WRONG for a beanstalk: a tether only works at the equator, because anywhere else the ribbon is
   not in the plane it is being spun about. The fix is a placement rule, not a render one - the
   anchor latitude for a `tether` family should be 0 by construction, and the LONGITUDE may stay
   seeded from the id.
2. **A TETHER SHOULD STAY VISIBLE AS A CONSTRUCT UNTIL YOU ARE CLOSE.** Owner: *"at least
   'construct visible' until zoomed in."* Reported as showing only its label high above the planet.
   The suspect is the pixel LOD plus the surface-construct path: the marker is placed on the
   surface (`updateSurfaceConstructs`) while the ribbon is a separate group, so at system zoom the
   label survives and the thing itself does not read.
3. **THE GM VIEW STILL SHOWS THE OLD CROSS.** Same report as (2) from the GM side.
4. **AND THE ONE THAT BLOCKS DIAGNOSIS, now instrumented rather than argued about.** Megas were
   observed drawing as the textured ellipsoid on v3.0.210 in a fresh player view - i.e. NOT stale.
   Measured against that report: the shipped pack templates all resolve (`megaTypeDef` finds every
   one), the builder produces ring/shell/points geometry in the live bundle, a freshly created node
   persists `megaType: "ringworld"` and `artificial: true` to IndexedDB, and every serialisation
   path on the way to a player (`computePlayerSnapshot` deep-copies, `slimNode` is a deny-list,
   `sanitizeSystem` spreads) preserves the field. So the data and the builder are both innocent and
   the fault is in the ATTACH, which no headless test can reach. `attachMegaVolume` therefore now
   WARNS ONCE per node when it declines, naming the megaType and whether the registry knew it
   (RENDER-S7: never silent on the path that decides whether a thing renders). The next report
   carries its own diagnosis.

   > IT DID, AND THE FAULT IS FIXED (2026-08-30, v3.0.224). The owner's console line read
   > `ReferenceError: nodesById is not defined` on every attach: the helper had followed
   > RENDER-S45's "ask nodesById" advice from OUTSIDE the build scope that owns the map, so the
   > lookup was a free variable, the catch ate the throw, and every mega wore the ellipsoid on
   > every path. Esbuild ships free variables without complaint (the build does not typecheck);
   > svelte-check names the fault in one line and was seen red-then-green on it. The host now
   > arrives as a PARAMETER. RENDER-S46 carries the trap; RENDER-S45 carries the correction.

**Phase 4 — starlight occlusion. DONE 2026-08-30 (core chain).** `starOcclusion` into the
luminosity→insolation→temperature chain, with the explainers in the same batch. **Built as
designed, one correction and one honest gap:**

- `physics/starlightOcclusion.ts` is the ONE who-shades-whom site; `receivedLuminosityWatts` sits
  beside the intrinsic form in `luminosity.ts` exactly as its header demanded; both equilibrium
  functions in `temperature.ts` read the received form; `deriveStarlightDimming` stamps
  `body.starlightDimming` (commit-or-delete) for the trace; the physics page and the trace both
  speak megastructure now. Engine map: **PHY-36**. Gate: `starlightOcclusion.spec.ts`, absolute
  233 K anchor (PHY-34), seen red first.
- **§6's band rule needed a time-free form** — the whole distance chain is a_AU sums, so "the
  star→body ray passes through the band" became *the share of its orbit the body spends inside the
  band's latitude extent*: (2/π)·asin(sin w / sin i), 1 when i ≤ w. A coplanar world beyond a
  solid ringworld honestly freezes (transmission 0); a 30°-inclined one loses under 1%. The RANGE
  takes the envelope (aphelion in deepest shadow, perihelion in clearest sky, each end running its
  own inside/outside test). A ringworld/torus band publishes `occlusionBandWidthKm` beside a
  `starOcclusion` of 1; the ANGLE is computed at the instance's real ORBIT, not the param seed
  (RENDER-S44's argument, applied to flux). Planetary torus publishes nothing — it circles a
  planet and shades nothing at system scale (its host's moons are a real unbuilt question).
- **THE ZONES HALF LANDED THE SAME DAY (v3.0.218): every zone line follows the dimming.** One
  walk (`occludedZoneDistance`) re-solves each flux threshold with occluded light removed and pins
  an edge AT an occluder's radius when the flux jump steps over the threshold — beyond a solid
  ringworld, in-plane, there is no more habitable zone to draw. For zones every occluder applies
  its FULL fraction beyond its radius, bands included, because the zone circles live in the system
  plane — the aligned direction. Companion flux stays undimmed. A swarm inside the kill zone is
  honestly a radiation shield. PHY-36 carries the correction.

`shell` and `swarm` RENDERING was already phase 3's generator; nothing further needed here.

> **ROUTING, 2026-08-31 ([[G58]]):** the owner called a stop/think - phases 5, 5b, 5c and 6, and the
> remaining §Phase 3b/3c visual tweaks, now route through `nonstandard-objects-design.md`: ONE
> capability record, consumers that stop guessing. Phase 5 becomes that design's N3 - the flip
> rides declarations instead of hand-wiring the thirteen seams its probe counts.

**Phase 5 — THE HYBRID FLIP, and it is the risky one.** Move mega-constructs to `kind: 'body'` and
migrate the chrome sites behind `showsAsConstruct`. Run `idempotence.test.ts` first and often; gate
`hierarchyRebuild.ts:112`'s changed walk with the hybrid removed; answer the redaction question
(§3.4 item 7) BEFORE starting. Carry-and-release (§3.6) ships WITH this phase, not after it — it is
what makes a moving hybrid safe rather than a follow-up nicety. Then `DockNode` through the planner.

> **THE FLIP SHIPS WITH AN HONESTY GATE ON THE SURFACE CHAIN, added 2026-08-28 with [[G56]].** The
> moment a ringworld is a body, the atmosphere/habitability chain runs on it — and until phase 5c
> it would read gravity as GM/r² of the ring's own mass at its own radius, which for the bundled
> ringworld is ~6 microgees: the model would confidently derive "cannot hold an atmosphere", a
> wrong number wearing a derivation's clothes (§3.4 item 1's exact case). So at the flip, an
> `artificial` body's atmosphere, temperature-range and habitability lines SAY "not yet derived
> for a built world" instead of printing a figure, and a test pins that no such figure is emitted.
> The gate is removed IN THE SAME COMMIT as phase 5c's provider — a stale gate is a stale lie.

**Phase 5b — asteroids through the same seam (§3.7). A SWEEP, not an opt-in** — the owner's call:
*"just bring them all into the new system"*. Clamp migrated rocks to `spinFraction < OBLATE_AT` so
none changes shape; seed any invented value from the stable id, never RNG; **fix the three impossible
bundled templates first** and add the pack-plausibility gate that would have caught them. Deliberately
NOT a separate feature: doing it twice would be two conventions for one idea.

**Phase 5c — THE INTERIOR SURFACE BREATHES ([[G56]], `surface-areas-design.md` §10).** The
owner-approved mechanism, in his words: *"no fake g - but a calculated spin."* One
region-effective-gravity provider (bodies answer GM/r² pinned bit-for-bit; a spun interior answers
ω²·r·cos²(lat) from `spinRadiusM` + `rotation_period_hours`); the interior floor as a
`SurfaceArea` band with `facing: 'inward'` (needs surface-areas phase 1 — schedulable now, its
spec §8); the WHOLE atmosphere model reused with g_eff swapped in; retention restated and
published (rim walls in scale heights; a spun sphere pools its air into an equatorial band with a
derivable edge latitude — off-equator sphere interiors are AMBER magic tech, which is why honest
catalogues grow many rings). Temperature uses the star's output at the interior's own radius, and THE OCCLUDER NEVER DIMS
ITSELF: a ring or swarm's sunward face receives the RAW star — that interception IS the harvest —
so the interior climate is driven by the undimmed flux at its radius. Occlusion applies to OTHER
bodies, per §6's rule: only occluders sitting radially INSIDE a body's own orbit stand between it
and the star. Acceptance is §10.4. **After
this phase — and not before — atmospheres on ring and torus interiors are CORRECT: declared
composition, derived pressure, scale height and breathability at the spin gravity, honest
retention figures, and the goldilocks steer's promised temperature actually delivered.**

**Phase 6 — the catalogue widens.** Shkadov, soletta, Birch, aerostat. All are parameter sets on
families that exist by now.

---

## 11. Open questions for the owner

Answers change the work; **none of them blocks Phase 1**, and two of the original five have since
been answered by the owner and are struck rather than deleted.

1. ~~**Can a mega-construct be a PARENT?**~~ **ANSWERED 2026-08-28, §3.6: yes, and a moving one
   CARRIES its orbiting constructs and releases them at the destination.** Left here so nobody
   reopens it. The one loose end is natural satellites, which cannot be docked and are therefore
   LEFT BEHIND — say so before the burn; do not silently drag or delete a moon.
2. ~~**Does a ringworld's interior get a "from the surface" view?**~~ **ANSWERED 2026-08-28, §5b.4b:
   YES** — *"The INSIDE of a ringworld or sphere will be 'livable' and show living world parameters
   and are drawn in 3D - An inside out planet with green life."* Struck rather than deleted. The
   surface stack is reused wholesale; what changes is seven derivations (gravity from spin,
   insolation from a star at the centre, day/night from shadow squares, lighting from the middle, a
   horizon that curves UP, area as the headline number, and composition DECLARED not derived).
3. **Is a mega-construct redacted from player views like a ship, or always visible like a world?**
   **THIS IS NOW THE ONLY QUESTION THAT BLOCKS PHASE 5** and it should be answered before that phase
   starts, not during. A hybrid is `kind: 'body'`, so it redacts like a planet by default: right for
   a ringworld, which is not a secret; possibly exactly wrong for a warship parked behind a moon.
4. **Should the generator ever PLACE one?** The standing rule says the generator is the opposite
   case from the editor — it may place where physics allows, because that is the engine choosing for
   itself. A "advanced civilisation" generation flag is a natural fit but is its own scope.
5. **Tech level as a gate?** `requires.minTechLevel` is in the vocabulary above; nothing in the
   engine currently carries a system tech level. Drop it, or is that a wanted concept?
