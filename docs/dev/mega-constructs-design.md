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

```ts
// src/lib/constructs/artificial.ts — the ONLY place that knows a body can be artificial.
export function isArtificial(node: CelestialBody): boolean;   // built, not formed
export function showsAsConstruct(node: CelestialBody): boolean; // draw it with construct chrome
```

The node carries `artificial?: true` plus the existing `megaType`. **A chrome site not yet migrated
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

> **RESOLUTION: the position model follows the object's STATE, not its type. Parked, it is a body —
> Keplerian, and it may host satellites. Under way, it is a construct — kinematics, and it may NOT
> host orbiting satellites.**

That restriction is physically honest rather than a limitation: **you cannot drag an orbiting fleet
along under thrust.** Ships must undock and fly, which is a good bit of play and exactly the kind of
consequence this engine is for. It also avoids a player-view fault of the [[B94]] shape — on a
free-scrubbing player view no sampler runs, so a moving attractor would sit at its stamped position
while its children propagated from it, and the two would disagree with nobody noticing.

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

## 4. Data model

### 4.1 On the node

```ts
/** THE HYBRID (§3). `kind` is 'body', so every physics path already works; this is what the CHROME
 *  layers read to know they should not draw a world. Absent = an ordinary body, unchanged. */
artificial?: true;
megaType?: MegaConstructType;
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

**Suggested `requires` vocabulary (complete for the six, extensible):** `hostKind`, `hasSurface`,
`needsGeostationary`, `geoBelowHillFraction`, `minHostMassKg`, `maxHostMassKg`, `inHabitableZone`,
`hostIsStar`, `minHostLuminosityLsun`, `clearOrbitBand` (nothing else may occupy the band it would
fill), `minTechLevel`.

---

## 5. Render — the shape families, 2D and 3D

The owner said each type needs its own specialised path. **They do not need six paths; they need
five SHAPE FAMILIES**, and every named type falls into one. That is the difference between a feature
that ships and one that becomes six half-finished renderers.

| family | 3D | 2D | types |
|---|---|---|---|
| `tether` | line/thin cylinder, surface → counterweight, spinning with the host | radial line from the host glyph, length to scale | space elevator, skyhook, star lifter |
| `ring` | torus in a declared plane, `megaRadiusKm` × `megaWidthKm` | circle at true scale (reuse the ORBIT-line renderer, not the glyph) | orbital ring, planetary torus, ringworld, Bishop ring, Halo |
| `shell` | sphere at `megaRadiusKm`, back-face visible from inside, occluding the star | circle with a distinct stroke, at true scale | Dyson sphere, supramundane shell, Matrioshka brain |
| `swarm` | instanced particles on a shell distribution — **reuse the belt/ring particle renderer** | stippled annulus, exactly as belts already draw | Dyson swarm, collector array, statite cloud |
| `spheroid` | today's `attachHullVolume` ellipsoid, or a GLB | today's glyph | Death Star, anything moon-shaped |

**Two of the five already exist.** `swarm` is the belt renderer (`beltStyle: 'rocks' | 'band'` and
its particle path); `spheroid` is `attachHullVolume` unchanged. `ring` is close to the existing
planetary-ring path. **Genuinely new: `tether` and `shell`.** Scoping it this way turns "six
specialised renderers" into two, and that is the single biggest cost saving in this document.

**Scale-law consequence, and it is not optional.** P4 put ships, bodies and stars on ONE kind-blind
span map so a physically larger object can never render smaller than a smaller one (R9,
`src/lib/rendering/scaleLaw.ts`, gates in `scaleLaw.spec.ts`). **A ringworld is 300 million km
across and would sit at the top of that map.** Before any mega geometry is drawn, `scaleLaw.ts` must
be shown a mega-construct and the R9 ordering block must still pass. Expect this to be the hardest
part of the render work, and do it FIRST — a shape that cannot be sized honestly is not finished.

Note also that these objects break the *"a construct's model contributes no radius anywhere"* rule at
[scene.ts:2991](../../src/lib/holo/scene.ts). A ringworld absolutely contributes a radius: framing,
`minDistance` and the system extent (A78 now counts each member's own radius —
`src/lib/holo/systemExtent.spec.ts`) all have to see it, or zooming out on a ringworld system will
frame the star and clip the ring.

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

## 10. Phasing

Each phase is shippable on its own and none of them is wasted if the next is dropped.

**Phase 1 — the category exists and is honest.** `artificial` + `megaType`, the `artificial.ts`
predicate module, the `mega` pack category, the placement vocabulary with its hard/steer split, and
the picker tab. **Hybrids are still `kind: 'construct'` in this phase** — no physics change at all,
so the whole of phase 1 carries no risk to any existing system. Every type renders with today's
ellipsoid.

**Phase 2 — the scale law learns about them.** Put a mega-construct on P4's span map and keep R9
green; give the shapes a real extent so framing, `minDistance` and the system extent see them. Do
this BEFORE any new geometry (§5).

**Phase 3 — the two new shape families.** `tether` and `ring` in 3D and 2D. These are the two most
visually striking and they cover four of the seven named types.

**Phase 4 — starlight occlusion.** `starOcclusion` into the insolation chain, with the explainers
updated in the same batch. `shell` and `swarm` rendering. **This is the phase that makes the feature
matter**, and it is deliberately after the cheap ones because it is the one that can break existing
systems.

**Phase 5 — THE HYBRID FLIP, and it is the risky one.** Move mega-constructs to `kind: 'body'` and
migrate the chrome sites behind `showsAsConstruct`. Run `idempotence.test.ts` first and often; gate
`hierarchyRebuild.ts:112`'s changed walk with the hybrid removed; answer the redaction question
(§3.4 item 7) BEFORE starting. Then `DockNode` through the planner. Parked-only satellites (§3.4
item 6) ship with it, not after.

**Phase 6 — the catalogue widens.** Shkadov, soletta, Birch, aerostat. All are parameter sets on
families that exist by now.

---

## 11. Open questions for the owner

Answers change the work; they are not blocking Phase 1.

1. **Can a mega-construct be a PARENT?** Can a moon orbit a Death Star, or a shuttle orbit a
   ringworld? **§3.4 item 6 answers the mechanics** — yes while PARKED, no while under way, because
   you cannot drag an orbiting fleet along under thrust. What is still yours to say is whether that
   restriction is acceptable play, or whether a moving Death Star should carry a docked fleet with it
   as cargo rather than as satellites.
2. **Does a ringworld's interior get a "from the surface" view?** It has a surface, a sky, a
   day/night cycle from shadow squares, and no horizon curvature in one axis. The surface view
   already exists for bodies; this would be its strangest case and possibly its best.
3. **Is a mega-construct redacted from player views like a ship, or always visible like a world?**
   A ringworld is not a secret. The redaction boundary currently keys off `kind === 'construct'`.
4. **Should the generator ever PLACE one?** The standing rule says the generator is the opposite
   case from the editor — it may place where physics allows, because that is the engine choosing for
   itself. A "advanced civilisation" generation flag is a natural fit but is its own scope.
5. **Tech level as a gate?** `requires.minTechLevel` is in the vocabulary above; nothing in the
   engine currently carries a system tech level. Drop it, or is that a wanted concept?
