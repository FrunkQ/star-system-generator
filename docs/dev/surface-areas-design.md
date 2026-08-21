# Surface areas — one record for "part of a world", inside and out

*Pre-V4 groundwork: the seam V4's generation builds on, including the third dimension.*

Owner, 2026-08-17: *"we want this to be simple and extensible... defaulting to whole surface but can
work in readable (sunward half, poles, equatorial belt, etc) terms and area — so we can have an area
of the planet at a bearing and distance and a size. They may represent tectonic plates, a city, a
quadrant, a hemisphere, etc."*

> **STATUS: PRE-V4 GROUNDWORK.** Owner, 2026-08-18: *"this is Pre-V4 work as it lays groundwork for
> the advanced generation to work off."* Reclassified from the previous day's "deferred whole to V4"
> — the record lands BEFORE V4 so that V4's generation has something to build on rather than a
> design to do first. **Each phase in §8 carries its own verdict**: the record and its maths are
> pre-V4 and schedulable; the consumers and the renderer are V4.
>
> The measurements in §1 and §5.3 were taken at v2.1.764-beta and v2.1.775-beta and should be re-taken
> rather than trusted if this sits for long.

**THE POINT OF WRITING THIS DOWN IS THE SEAM, NOT THE FEATURE.** Every derivation in the engine today
assumes a body has ONE surface. That assumption is cheap to hold and expensive to unpick, and it is
being written into more code every week. This document fixes the shape of the record that replaces
it, and specifies the smallest change that puts the seam in place without moving a single number.

---

## 1. What is already true, measured rather than assumed

### 1.1 The engine already has four frames — it just spells each one separately

A "where" vocabulary exists; it is scattered as one-off booleans and biases:

| axis | where it lives today | what it expresses |
|---|---|---|
| spin | `surfaceTempProfile`'s `latitude` component; `climate/polar-ice` | poles vs equator |
| stellar | `planetAppearance`'s `EyeballSpec` (`substellarK` / `antistellarK`) | sunward vs anti-sunward |
| primary | `planetAppearance.farSideBias` — the parent occults impactors | near vs far side of a locked moon |
| orbital | named in the crater comment ("leading (apex) hemisphere"), not modelled | leading vs trailing |

So the frame vocabulary below is not invented. It NAMES the axes the engine already re-derives one
at a time, which is the same move the tag vocabulary made.

### 1.2 Cratering is already surface age — the "simple rule" is one line

`planetAppearance.ts:281`: `ageDensity = surfaceAgeGyr / 4.5`, gated by what cannot hold a crater
(icy shell fractures instead, thick air ablates, a rubble pile slumps), with `farSideBias` as a
geometric modifier. **Crater density IS a chronometer, and the engine already treats it as one.** A
terrain model does not introduce a new idea here; it feeds the existing one a better input.

### 1.3 THE MEASURED BLOCKER: surface age has almost no resolution

`geoActivity.deriveSurfaceAgeGyr` answers in two different ways:

- **An ACTIVE world gets a per-regime CONSTANT** — `RESURFACE_GYR`: tidal-volcanic 0.002,
  cryovolcanic 0.05, plate-tectonics 0.2, episodic 0.7, stagnant-lid 1.0, plutonic 2.0. Every
  cryovolcanic world in the game has a surface age of exactly 0.05 Gyr.
- **A DEAD world gets a continuous vigor inversion** — which, for every body in the bundled Solar
  System, saturates at the system age (4.6).

Measured across the 40 bundled Sol bodies: **five distinct surface ages.** Any law keyed on it can
produce five answers.

**This is why terrain alone would not fix Ganymede, and it is worth stating because Ganymede is the
motivating case.** Splitting it 60% at 2 Gyr / 40% at 4.5 Gyr and running both through the shipped
ice-lag curve gives **0.153** against a measured 0.35 — barely better than the 0.13 it gets now. The
curve's half-age (0.22 Gyr) is forced short because the three young icy moons all sit at exactly
0.05, and that makes 2 Gyr and 4.5 Gyr indistinguishable to it. **Adding a second sample of a
five-valued quantity adds no information.** Age resolution is the prerequisite; see §8 phase 2.

### 1.4 And the resurfacing RATE is already the thing terrains sample

`RESURFACE_GYR` is a *timescale*, and a timescale implies a DISTRIBUTION, not a single age. A world
resurfacing on a 0.2 Gyr cycle does not have a surface that is uniformly 0.2 Gyr old — it has fresh
ground and old ground in proportions that follow from the rate. Earth is the obvious case: ocean
floor under 0.2 Gyr, continental crust over 2. **The single number is that distribution flattened**,
which means a generated world's terrains are not new data — they are a sampling of a rate the engine
already states.

---

## 2. The record

```ts
/** WHERE a surface area sits. The frame is the load-bearing half. */
export type AreaFrame =
  | 'body'      // fixed to the surface and rotates with it — a plate, a mare, a city
  | 'spin'      // anchored on the rotation axis — polar caps, latitude bands
  | 'stellar'   // anchored on the sub-stellar point — the sunward half, an eyeball's eye
  | 'primary'   // anchored on the sub-parent point — the near/far side of a locked moon
  | 'orbital';  // anchored on the apex of motion — leading/trailing hemispheres

export type AreaShape =
  | { kind: 'cap';  centre?: [number, number]; radiusDeg: number;
      minorDeg?: number; bearingDeg?: number }   // minorDeg present ⇒ ellipse
  | { kind: 'band'; fromLatDeg: number; toLatDeg: number }
  | { kind: 'lune'; fromLonDeg: number; toLonDeg: number };

export interface SurfaceArea {
  frame: AreaFrame;
  shape: AreaShape;
}
```

`centre` is **within the frame**, and defaults to `[0, 0]` — the frame's own anchor point. That
default is what makes the readable terms free:

| readable term | record | coordinates authored |
|---|---|---|
| the whole surface | *absent* | — |
| sunward half | `{ frame: 'stellar', shape: { kind: 'cap', radiusDeg: 90 } }` | **none** |
| leading hemisphere | `{ frame: 'orbital', shape: { kind: 'cap', radiusDeg: 90 } }` | **none** |
| far side of a locked moon | `{ frame: 'primary', shape: { kind: 'cap', centre: [0, 180], radiusDeg: 90 } }` | **none** |
| north polar cap | `{ frame: 'spin', shape: { kind: 'cap', centre: [90, 0], radiusDeg: 30 } }` | **none** |
| equatorial belt | `{ frame: 'spin', shape: { kind: 'band', fromLatDeg: -23, toLatDeg: 23 } }` | **none** |
| a quadrant | `{ frame: 'body', shape: { kind: 'lune', fromLonDeg: 0, toLonDeg: 90 } }` | 2 |
| a tectonic plate | `{ frame: 'body', shape: { kind: 'cap', centre: [12, -40], radiusDeg: 35, minorDeg: 18, bearingDeg: 70 } }` | 5 |
| a city | `{ frame: 'body', shape: { kind: 'cap', centre: [51, 0], radiusDeg: 0.2 } }` | 3 |

**Every physics-relevant area is coordinate-free.** Only hand-placed features need lat/lon, and those
are the ones a GM would place by hand anyway.

**This is the standard construction, not a bespoke one.** Spherical caps, zones and lunes are the
classical primitives of spherical geometry, and anchoring a region to a named frame rather than to
inertial coordinates is what planetary ephemeris toolkits (SPICE and its kin) do with body-fixed vs
sun-fixed frames. Anything that is not a cap, band or lune is a spherical polygon, and a polygon is a
content-authoring system rather than a datum — see the guards in §7.

### 2.1 Why ellipses rather than triangles

An ellipse is a cap with two extra numbers and degenerates back to a cap when they match, so ONE
primitive covers a city, a basin, a plate and a hemisphere. A spherical triangle needs six numbers
and describes none of those well — natural features are blobby. Straight-edged authored regions
(quadrants, sectors) are what the lune is for, at two numbers.

### 2.2 The frame is physics, not presentation

An area in the `body` frame ROTATES with the world. One in the `stellar` frame does NOT — it is
always sunward, whatever the body does. **That single distinction is tidal locking, eyeball worlds
and leading-face sweep-up.** Put it in the data and those stop being a special case per body: the
engine answers "is this ground always in sunlight?" by comparing the area's frame with the body's
spin state, which is a property it already derives (`starTidallyLocked`, corrected in B69).

---

## 3. Area fractions are DERIVED, never authored

The fraction of the sphere an area covers has a closed form for each shape:

| shape | fraction of the sphere |
|---|---|
| cap, angular radius θ | `(1 − cos θ) / 2` |
| ellipse, semi-axes a, b | `√((1 − cos a)(1 − cos b)) / 2` |
| band, latitudes φ₁ → φ₂ | `(sin φ₂ − sin φ₁) / 2` |
| lune, longitudes α wide | `α / 360` |

Checked numerically rather than asserted — the first ellipse form written here was wrong and did not
degenerate: a cap at θ=90° is 0.5, at θ=180° it is 1, a 30° polar cap is 0.067, a ±23° belt is 0.391
and a 90° lune is 0.25.

**The ellipse form is chosen so that it degenerates EXACTLY to the cap when a = b** (verified to six
decimal places at 5°, 30°, 90° and 180°) and approaches the planar `a·b/4` for small axes — 0.00076
against 0.00076 at 5°×2°, drifting to 0.0338 against 0.0343 by 30°×15°, which is the honest limit of
a small-angle approximation and is why the √ form is used rather than the planar one. One primitive,
one implementation, no branch on "is this circular".

**So the geometry is authored and the weight falls out of it.** One number fewer per area, and — the
real reason — no way for a stated fraction and a stated shape to disagree six months later. That is
the same rule B57 applied to luminosity: a band carries only what cannot be computed.

---

## 4. Overlap: LAYERS of ordered paint, not set algebra

Areas overlap. Proper spherical set intersection is expensive and unnecessary:

> **Later areas paint over earlier ones. The effective weight of an area is what remains unpainted
> above it.**

This is exactly how `deriveAlbedo` already composites cloud decks — *"composited bottom-up, so the
top deck has the last and largest say"* — applied one layer down, to the ground. Weights still sum to
1 without anyone computing an intersection.

**Areas do not nest and do not parent. They stack, and there may be several stacks.** A LAYER is one
ordered list with one purpose:

```ts
export interface SurfaceLayer {
  purpose: 'terrain' | 'deposit' | 'authored';
  areas: Array<SurfaceArea & { /* purpose-specific payload */ }>;
}
```

`terrain` carries ages (what the ground IS and how long it has sat there); `deposit` carries what has
settled on it (dust, frost, lag); `authored` is the GM's own — a city, a claimed territory, a
plot location. Layers are independent: a deposit does not need to know which terrain it lies on, it
only needs its own weight. Three flat lists, no tree.

---

## 5. The third dimension — depth, and height

Owner, 2026-08-18: *"if we had a z-axis we can define zones within the planet to be used on
composition (iron core and layering — we could spin the core and get the mag field properly sized).
We could leave large masses as chunks... which may feed well into V4 generation where planets may not
be 'fully mixed' after formation. Not needed by default, but it appears this system could be
optionally extensible to include depth (and height for beanstalks)."*

**Yes — and it is ONE system rather than two, because the maths factorises.**

### 5.1 A region is an ANGULAR extent times a RADIAL extent

Volume separates exactly: `V = ∫∫∫ r² dr dΩ`, so the angular and radial parts never interact.

```
solidAngleFraction = f(angular)                          ← §3, today's surface case
volumeFraction     = f(angular) × (r₂³ − r₁³)            ← the same angular term, reused
```

A surface area is the degenerate case `radial = [1, 1]` — a shell of zero thickness at the surface.
That is why this is an extension rather than a second system: **the angular half is untouched, and
the radial half multiplies it.**

Checked numerically rather than asserted: a core at `{0, 0.55}` is 0.1664 of the volume and its
mantle at `{0.55, 1}` is 0.8336, summing to exactly 1; a subsurface ocean at `{0.9, 0.98}` is 0.2122,
which is the right order for an icy moon whose shell holds most of its water; and a 20° plume over
`{0.5, 1}` is 0.0264, the angular and radial terms multiplying cleanly.

```ts
export interface SurfaceArea {
  frame: AreaFrame;
  shape: AreaShape;
  /** In body radii: 0 = centre, 1 = surface, > 1 = above it. ABSENT = the surface. */
  radial?: { fromR: number; toR: number };
}
```

Absent means the surface, which is exactly today's meaning, so nothing that exists has to say anything.

| thing | record |
|---|---|
| the surface | `radial` absent |
| iron core | whole-sphere angular, `radial: { fromR: 0, toR: 0.55 }` |
| mantle | whole-sphere, `{ fromR: 0.55, toR: 1 }` |
| subsurface ocean | whole-sphere, `{ fromR: 0.9, toR: 0.98 }` |
| a mantle plume under a hotspot | `body`-frame cap × `{ fromR: 0.5, toR: 1 }` |
| a tidal bulge | `primary`-frame cap × a radial range |
| a beanstalk | a tiny `body`-frame cap × `{ fromR: 1, toR: 6.6 }` |
| an orbital ring | a `spin`-frame band × `{ fromR: 1, toR: 6.6 }` |

### 5.2 The radial vocabulary ALREADY EXISTS, exactly as the frames did

`types.ts:51` — `FluidLayer { liquid, location, ... }` where `FluidLocation` is
`'surface' | 'subsurface' | 'interior'`. Three coarse shells, spelled once, informal, and read by
`deriveMagnetism` to find its conductive layer. **This is the same finding as §1.1**: the concept is
already in the engine as a one-off vocabulary, and the record NAMES it rather than inventing it.

### 5.3 The evidence that it pays: the dynamo sizes a core it cannot see

`physics/magnetism.ts:114`:

```ts
const sizeF = Math.min(1.4, Math.max(0.3, Math.cbrt(massMe))); // bigger core → stronger
```

**The core's size is proxied by the cube root of the whole body's mass**, because the model carries a
bulk metal fraction and no core radius. And it needed an escape hatch to survive contact with
Mercury: the iron-core branch only fires via `mk.metal > 0.5`, added because "the layer model calls
the core solid". **A proxy plus a special case is the signature of a missing datum** — the same shape
as B68's one constant standing for a whole class (PHY-20).

A radial zone carrying a real core radius, with the rotation the engine already derives, replaces
both with a scaling law. That is the owner's *"spin the core and get the mag field properly sized"*,
and it is the strongest single argument for the radial extent.

### 5.4 THREE measures, never one `fraction`

Solid angle, volume and mass are three different questions about one region, and a field called
`fraction` that means whichever the caller assumed is PHY-2 exactly — correct for its purpose,
published as a lie. So: `solidAngleFraction()` and `volumeFraction()` as separate named functions,
and **no mass measure until there is a density profile to compute it from**. Mass fraction is not
volume fraction on any differentiated body, which is every body this feature is for.

### 5.5 Chunk first, refine later — a property, not a plan

Owner: *"we would do maths on basic chunks and chunk finer for detail over time."* That already
falls out: a coarse chunk is a region with wide extents, refining it means splitting one record into
several, and **no consumer changes**, because they all read derived fractions rather than counting
regions. An unmixed post-formation body from V4 generation is simply a body whose chunks were never
merged.

## 6. What V4 adds — the drift seam

A tectonic plate IS a terrain area with a velocity:

```ts
{ frame: 'body', shape: { kind: 'cap', ... }, ageGyr: 2.1,
  drift: { bearingDeg: 115, rateMmPerYr: 34 } }        // ← V4 adds this field
```

**Stated honestly: `drift` is a new field on an existing record, and V4 will also widen `centre` from
a static pair to a time-evolving one.** This document is not claiming a slot that V4 drops into
untouched — it is claiming that the *record* is the stable thing and the *consumers* get written
against "a body has areas" rather than "a body has one surface". That second assumption is the one
that is expensive to unpick, and it is what this catches.

Drift needs one more thing V3 need not build: a clock. An area's centre at time *t* is its authored
centre advanced along its bearing — pure, cheap, and reversible, so it belongs beside the orbital
propagator rather than inside the derivation passes.

---

## 7. Guards — the ways this stops being cheap

1. **AREAS ARE WEIGHTS UNTIL THE RENDERER SAYS OTHERWISE.** Every physics consumer (albedo,
   cratering, weathering) wants an area-weighted mix and never asks where. The geometry can be
   authored and stored while nothing reads it directionally. Do not block phase 1 on the renderer.
2. **NO PER-AREA CLIMATE.** An area carries history and material — age, what has settled. It does
   NOT carry its own temperature. The temperature profile already answers "how hot is the pole" as a
   named swing (PHY-19), and a per-area temperature would be a second model of one question, which
   is this codebase's most recurring fault.
3. **NO POLYGONS, NO NESTING, NO PARENTING.** Cap, band, lune. If something needs an arbitrary
   outline it is a content system and wants its own design, not a wider `AreaShape`.
4. **DO NOT BUILD THE INTERIOR MODEL WITH THE RECORD.** Layered composition and a real dynamo
   scaling are their own design with their own anchors — Earth's core at 0.55 R, Mercury's at ~0.83,
   Ganymede's field, Venus's absence. The record is cheap; the physics needs calibrating, and a
   generalised consumer with nothing to calibrate against is a framework rather than a model.
5. **CONSTRUCTS REFERENCE REGIONS; THEY DO NOT BECOME THEM.** A beanstalk is a construct anchored to
   a region, not a region that grew construct fields. There is already a constructs system, and the
   two must not grow into each other.
6. **`toR > 1` IS FOR THINGS ANCHORED TO THE BODY** — a beanstalk, a ring, a shell. Not for
   free-flying things: those have orbits, which the engine already models properly.

**And the general form of guards 4-6, because the owner raised it directly** (*"do one system to
suit all future use cases"*): that instinct is right for the RECORD and wrong for the CONSUMERS.
Generalising the datum now is nearly free and saves unpicking later. Generalising the consumers
produces something nobody can check against anything. Add consumers one at a time, each with an
anchor that says it works.

---

## 8. THE SPEC — what to build, in what order, with the blast area of each

### Phase 1 — the seam. **PRE-V4.** Blast area: ZERO behaviour change.

**Goal: the record exists, the maths exists, the aggregate is preserved, and no derived number
moves.** The fixture being byte-identical is the acceptance test. It is written as a standalone step
so that it CAN be taken on its own if V4 wants the seam before the rest — not because it should be.

1. `src/lib/physics/surfaceAreas.ts` — the `AreaFrame` / `AreaShape` / `SurfaceArea` types from §2
   INCLUDING the optional `radial` extent from §5, plus `solidAngleFraction(shape)` implementing §3,
   `volumeFraction(area)` implementing §5.1, and `stackWeights(areas)` implementing §4.
2. `surfaceAreas.spec.ts` — the closed forms against the sanity values in §3 (hemisphere 0.5, whole
   sphere 1, 30° cap 0.067, ±23° band 0.391, 90° lune 0.25), the ellipse degenerating EXACTLY to the
   cap when its axes match, the paint-over rule, the readable-term table in §2 round-tripping to the
   fractions it should, and the radial factorisation of §5.1 — a whole-sphere shell of `{0, 0.55}` is
   0.1664 of the volume and its complement 0.8336, and `radial` absent leaves every surface answer unchanged.
3. `GeoActivity` gains `terrains?: Array<{ area: SurfaceArea; ageGyr: number }>` — OPTIONAL.
4. `deriveSurfaceAgeGyr` unchanged. Where `terrains` is present, `surfaceAgeGyr` becomes the
   stack-weighted mean of the terrain ages; where it is absent — which is every body today — the
   existing value stands untouched.

**Blast area, measured.** `surfaceAgeGyr` has **eleven** production readers, and phase 1 changes none
of them because the aggregate is preserved:

- `physics/albedo.ts:148,178,220` — ice lag (B68) and, via `deriveOxidation`, the dust deposit
- `physics/cloudDecks.ts:309,369` — oxidation grade, and the deck age term
- `physics/radiation.ts:80,83` — irradiation dose accumulates with exposure (B65's fluence)
- `physics/temperature.ts:297,347` — the solve computes it on the probe and passes it to both
- `rendering/planetAppearance.ts:258,281` — crater density = age / 4.5
- `rendering/planetTexture.ts:740,829` — texture cache keys
- `core/SystemProcessor.ts:1190` — the `surface/age` tag
- `physics/physicsTrace.ts:545,581` — the Newton explainer

### Phase 2 — age resolution. **PRE-V4, and stands alone.** The measured prerequisite for anything downstream.

Nothing in phase 3 changes a number until this lands (§1.3). The work: an ACTIVE world's surface age
is currently its regime's constant; it should be **sampled from the regime's resurfacing RATE** and
the body's own vigor, so that two cryovolcanic moons of different vigor differ. The dead-world vigor
inversion is already continuous and stays.

**Blast area: every one of the eleven readers above, and the fixture will churn heavily.** This is
the risky phase, and it is risky because it is real. It also carries the one open design question, for
whoever builds it rather than for now: does the resurfacing rate produce a DISTRIBUTION of terrain
ages (§1.4), or still one number? Earth is the case that argues for a distribution — ocean floor
under 0.2 Gyr against continental crust over 2, which a single figure flattens.

### Phase 3 — consumers mix over the stack. **V4.**

Albedo, crater density and weathering weight per terrain instead of reading the aggregate. Roughly
ten lines each. Ganymede is the acceptance case and only becomes reachable after phase 2.

**Blast area: albedo is inside the thermal fixed point.** Per-terrain albedo still yields ONE number,
so no new coupling — but read the whole derived diff, because everything downstream of equilibrium
temperature moves (B68 moved five bodies and four tags this way).

### Phase 4 — the renderer, the interior model, and generation. **V4.**

The renderer paints the stack; the interior model gives the dynamo a real core radius instead of
`cbrt(massMe)` (§5.3); generation derives terrain fractions — and, for an unmixed body, interior
chunks — from the history it already invents (a tidally heated moon resurfaces a fraction recently; an episodic-lid world is
catastrophically bimodal, which is the two-terrain shape the engine already classifies ~24 bodies
into). Scope deliberately: this is where the cost is, and it is separable from all of the above.

---

## 9. What this does NOT do

- It does not fix Ganymede. Phase 2 does (§1.3).
- It does not change any number on any body in phase 1, by construction.
- It does not build the interior model, only the record that will hold one. The dynamo keeps sizing
  its core with `cbrt(massMe)` until phase 4 (§5.3).
- It does not give mass fractions. Volume and mass differ on any differentiated body, which is every
  body this is for, and mass needs a density profile that does not exist yet (§5.4).
- It does not model dust sources, E-ring coating or exogenous resurfacing — Mimas is the largest
  albedo error left in the Solar System (0.496 against a measured 0.96) and its cause is Enceladus's
  E-ring plating it, which is a whole-body coating rather than an area. Iapetus (0.531 against 0.20)
  IS an area case — leading-hemisphere dust — and is the best phase-3/4 acceptance body after
  Ganymede.
