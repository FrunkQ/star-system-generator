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

A zero-mass construct is pinned at its epoch instead of propagating on the live clock. So **the
moment a mega-construct is given a real mass it stops being stationary and starts orbiting** — which
is usually the right answer and is never what the author of that line was deciding. Whatever the
mass design becomes, this line must be revisited in the same change, and "does it move" must stop
being inferred from "does it weigh anything".

---

## 3. The three decisions this design makes

### 3.1 A mega-construct stays `kind: 'construct'`

`kind` is load-bearing in dozens of branches across physics, rendering, redaction, transit and
serialisation. A third kind means auditing every one, and the failure mode is silent: a branch
written `kind === 'body' ? A : B` does not break when a third kind arrives — it quietly takes `B`.

So `kind` stays and the category is a new discriminator:

```ts
/** MEGA-CONSTRUCTS. Present = this construct is one; absent = an ordinary construct, unchanged. */
megaType?: MegaConstructType;
```

Absent means today's behaviour exactly, everywhere. Same discipline as S2c's `constructOffset`, and
the reason no saved campaign moves.

### 3.2 Gravitational significance goes through ONE predicate, in ONE module

Do NOT change the four mass gates to `kind === 'body' || node.megaType`. That is five rival
conventions waiting to happen, and this project has already paid for exactly that: G43 put L-point
conventions in five places and the result was an arrival teleport (memory
`project_sse_g43_lagrange`; the fix was ONE convention module).

**Add `src/lib/physics/gravitationalMass.ts` with one exported function**, and make every mass gate
call it:

```ts
/** The mass this node contributes to the system's gravity, in kg. 0 = invisible to gravity. */
export function gravitationalMassKg(node: CelestialBody | Barycenter): number;
```

The rule inside: a body contributes `massKg`; a barycentre contributes `effectiveMassKg`; a
construct contributes `massKg` **only when it declares itself gravitationally significant**, and
zero otherwise.

**That last clause is the honest design, not timidity.** Ceres Station's 9e20 kg is real, and
switching it on retroactively would move every belt orbit in every saved campaign that has one.
**Significance is a declaration, not a threshold** — so nothing changes for anyone who does not ask.

The declaration should be DERIVED-AND-SHOWN rather than a bare authored boolean: publish the
construct's mass as a fraction of its host's, so a GM can see WHY it does or does not matter. That is
what the physics page and the tag system already do for everything else, and it is the
physics → tags → visuals chain rather than a switch.

### 3.3 "Greyed out" must not become a refusal — the ask meets a standing rule here

The owner asked for options *"greyed out otherwise"*. The inbox's standing rules say:

> **STEER, DO NOT STOP. A PHYSICS CRITERION TAGS AND EXPLAINS; IT NEVER REFUSES AN EDIT, CLAMPS AN
> AUTHORED VALUE, OR QUIETLY CORRECTS SOMEBODY'S MAP.** […] *"the idea is that I steer you away from
> stuff that 'breaks physics'… but I don't stop you because: alien tech / reality breakdown /
> unobtanium / PlotDevice / IDontCare."* — owner, 2026-08-26

A greyed-out Dyson sphere on a moon is a refusal, and it is the one the rule's own examples name.
**The resolution is not to drop the greying — it is to make grey mean "we do not think so, and here
is why" rather than "no".** Concretely:

- An option failing its predicate renders greyed, **with the reason** in a line beneath it:
  *"A ringworld needs a star to circle. Luna has none."*
- **Greyed is still clickable.** Clicking explains and offers to place it anyway. The GM's reason is
  unobtanium and the engine cannot tell that from a mistake.
- Placed anyway, it is **TAGGED, not corrected** — the shape G45 used when it found two authored
  Uggi worlds inside their circumbinary stability limit and changed nothing.
- **A whole TAB may hide when nothing in it is placeable.** That is decluttering, not refusal: the
  category has no candidate here, and it is what the owner asked for ("only appears… when
  available"). **Individual options grey; empty tabs hide.**

This is the one place the design deliberately does not do exactly what was asked. It is a sentence
of difference, not a change of intent, and it is flagged rather than made silently.

---

## 4. Data model

### 4.1 On the node

```ts
megaType?: MegaConstructType;
/** Gravity: this construct's mass is fed to the n-body sum. Default false — see §3.2. */
gravitySignificant?: boolean;
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

- **Steer, do not stop** — §3.3. Grey explains and stays clickable; tags never rewrite authored data.
- **Physics and data drive tags; tags drive the image** — occlusion, spin gravity, ring instability
  and taper ratio are physics; the tags follow; the renderer reads tags. No renderer computes a
  physical fact.
- **Constants are data** — every placement predicate and every threshold lives in the rule pack (§4.2).
- **Duplicated functionality is this codebase's most recurring fault** — one gravity predicate (§3.2),
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

**Phase 1 — the category exists and is honest.** `megaType`, the `mega` pack category, the placement
predicate module and its `requires` vocabulary, the picker tab with explaining-grey. Every type
renders with today's ellipsoid. **Nothing is gravitationally significant yet and nothing occludes.**
Ships as a data-and-UI change with no physics risk.

**Phase 2 — the scale law learns about them.** Put a mega-construct on P4's span map and keep R9
green; give the shapes a real extent so framing, `minDistance` and the system extent see them. Do
this BEFORE any new geometry (§5).

**Phase 3 — the two new shape families.** `tether` and `ring` in 3D and 2D. These are the two most
visually striking and they cover four of the seven named types.

**Phase 4 — starlight occlusion.** `starOcclusion` into the insolation chain, with the explainers
updated in the same batch. `shell` and `swarm` rendering. **This is the phase that makes the feature
matter**, and it is deliberately after the cheap ones because it is the one that can break existing
systems.

**Phase 5 — gravity and docking.** `gravitationalMassKg`, the `worldPositions.ts:105` trap, and
`DockNode` through the planner.

**Phase 6 — the catalogue widens.** Shkadov, soletta, Birch, aerostat. All are parameter sets on
families that exist by now.

---

## 11. Open questions for the owner

Answers change the work; they are not blocking Phase 1.

1. **Can a mega-construct be a PARENT?** Can a moon orbit a Death Star, or a shuttle orbit a
   ringworld? The hierarchy allows it and the physics would need `gravitationalMassKg`. Cheap if
   decided now, expensive later.
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
