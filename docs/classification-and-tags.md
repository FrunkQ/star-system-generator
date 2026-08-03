# Classification, Tags & Barycentres — how they layer

This is the coherent model after the Phase‑04 rewrite. It exists because the project drifted
from *classification* → *tags* (a half‑measure) → back to *classification*, leaving the two
overlapping. The rule now: **classification owns the planet TYPE; tags are orthogonal
conditions/history; neither derives from the other.**

## The three layers (in processing order)

1. **Generation** (`lib/generation/*`, `lib/physics/accrete-adapter.ts`)
   Produces raw physical bodies (mass, radius, orbit, atmosphere, hydrosphere) plus a few
   **provenance tags** the physics can't re‑derive later: `origin/migrated`, `origin/captured`,
   `orbit/retrograde`, `orbit/double`.

2. **SystemProcessor** (`lib/core/SystemProcessor.ts`) — derives everything else from physics,
   in passes. **The pass list changed at v2.1.356 (inbox B13) and the old three‑pass description
   was wrong in a way that mattered** — radiation is no longer part of the environment pass:

   | pass | what it does |
   |---|---|
   | 0a/0b | barycentre reconcile, then barycentre orbits (**effective masses deepest‑first**) |
   | 1 | physical basics (gravity, orbital period), then resonances, then substellar self‑luminosity |
   | 2a | environment — tidal lock, the thermal solve, atmospheric escape, atmosphere derivations, temperature profile |
   | **2b** | **interior fluid layers + magnetism**, iterated **parent before child** |
   | **2c** | **radiation** — its own pass, after every body has its field, spin and scale height |
   | 3 | life & classification (tags, classes, habitability) |
   | 4 | flight dynamics (orbital boundaries, Δv budgets) — and the `flight/ascent` tag |
   | 5/6 | stability, then reasons‑to‑visit |

   It re‑derives on every `process()`, so it owns:
   - **`body.classes`** — the planet TYPE, via the fingerprint classifier (below).
   - **condition tags** — `tidal/*`, `habitability/*`, `stability/*`, `magnetic/*`, `geology/*`,
     `surface/*`, `structure/*`, `hazard/radiation`, `flight/ascent`, plus the atmosphere tags
     from `gasPhysics`.

3. **Consumers** (UI, `rendering/colors.ts`, `viewPresets`) read classes for the type/image and
   tags for conditions. They must NOT write back into either.

Classification reads **raw physics features, not tags**, so there is no circular dependency.

> **AND NOTHING MAY READ A VALUE A LATER PASS WRITES.** The pass split above exists because that
> rule was being broken in seven places at once (inbox B13): radiation read a magnetic field derived
> a pass later, so the dose a GM saw depended on how many times `process()` had run — and since the
> app processes on load *and* after every edit, a freshly imported Earth reported a hundred times its
> real surface dose. `src/lib/system/idempotence.test.ts` now enforces it: process, process the
> result, process that, and nothing anywhere may change. Two corollaries that each cost a real bug —
> **a derived class is never a physics input** (internal heat asked `body.classes` for the word
> "ice-giant" while the classifier runs later and reads the temperature that produces), and **a
> quantity that depends on another body is iterated parent before child**, never in file order.

## Classification = fingerprints

Each planet type (the keys of `classifier.planetImages` ≈ the `static/images/planet_types/`
set) is described by a **fingerprint**: the parameter bands that DEFINE it. See
`classifier.fingerprints` in `static/rulepacks/starter-sf/classification.json` and the engine in
`lib/system/classification.ts`.

- A body's fit to a band is `1` inside, decaying over a **relative** soft edge (15% of the
  boundary — never an absolute band‑width margin, or a tiny moon would half‑match a giant), `0`
  beyond. Fully outside any band → that type is **disqualified**.
- **A type the body matches COMPLETELY outranks one it matches partially — score only decides
  within a tier.** If the body sits inside every band a type defines, no type it falls outside of
  can beat it, however that type is weighted. This is an ordering, not a number, and it exists
  because the alternative was hand‑derived: B15 had to pick weight 1.45 rather than 1.5 purely
  because 1.5 let a *partial* `earth-analogue` (one band at fit 0.689) beat a *perfect* `jungle`,
  which would have meant re‑deriving the same inequality on every future weight change.
- Type score = **mean band fit × (1 + 0.1 × band count) × weight**, applied within a tier. Among
  clean matches more matched bands still wins (specific beats generic), but a band‑rich catch‑all
  whose extra bands are barely‑true edge slivers can no longer out‑score a perfect match on fewer
  bands. (It used to be the *sum* of band fits, which let padding win; changed with B15.) The best
  **base** archetype wins (mutually exclusive); **modifiers** (`ringed`, `ultra-short-period`,
  `toroidal`, `ellipsoid`, `disrupted`) stack — they are chosen by a score threshold, not by rank,
  so the tier rule does not apply to them.
- A fingerprint may also carry a **`gate`** block: preconditions that must hold or the type scores
  0, but which contribute **nothing** — no fit, no band count. Use `gate` for eligibility ("does
  this body have a surface at all") and `match` for the traits that define the type. **The two are
  not interchangeable.** A gate written as a match band is always‑true for every body that gets
  past it, and averaging an always‑1 band in *raises* a poor defining band: fit 0.11 gains 37%,
  fit 1.0 gains only 8%. It rewards the worst matches most, which is the opposite of what the
  scoring above is for.
- `eyeball` (and `hot-eyeball` / `cold-eyeball`) are **base** types, matched on tidal-lock to the
  **star** (`starTidallyLocked`) — a moon locked to its planet still turns relative to its star, so it
  is not an eyeball — and **gated on `makeup.gas` ≤ 0.5**. The eyeball notes are all about ground
  ("molten/dry dayside", "icy except the substellar point", "temperate oasis"), so a body with no
  surface cannot have one; the same test the geology and habitability models use (B18, B25).
- `gas-giant` is the explicit fallback (`weight 0.9`) so specific giant types win when they fit;
  it only fills the temperature gaps between the cloud‑type giants.

**Adding / tuning a type:** add a fingerprint with the bands that uniquely define it. Run
`npx vitest run classification.audit` — it classifies each type's own prototype and FAILS if a
specific type is shadowed by a catch‑all. Verify real systems with `physics-baseline` and
`classification.barycentre` specs.

### Feature inputs
`mass_Me, radius_Re, density (g/cc), Teq_K, SurfaceTemp_K, a_AU, eccentricity, age_Gyr,
stellarType, stellarIrradiation, escapeVelocity_kms, orbital_period_days, rotation_period_hours,
tidalHeating, tidallyLocked, starTidallyLocked, radiation_flux, has_ring_child, hasSubsurfaceOcean,
parentId, orbitsStar, makeup.metal, makeup.rock, makeup.carbon, makeup.ice, makeup.gas, atm.main,
atm.pressure_bar, atm.composition.<gas>, hydrosphere.coverage, hydrosphere.composition`. The
`makeup.*` interior fractions are how iron / silicate / coreless / carbon types classify. Missing
atmosphere / hydrosphere default to `None` / `0` so airless/dry bodies match (e.g. `barren`).

### GM‑only types (no fingerprint)
`forest, jungle, swamp, ecumenopolis` need biome / industrialisation data the engine doesn't
model (it computes a habitability *score* + tier, not vegetation), and they share the habitable
envelope with `earth-like` — so auto‑assigning is guessing. They stay in the vocab + images for
**manual** GM assignment. Revisit if/when a biome model lands.

## Tags = orthogonal conditions/history (namespaced)

| namespace | meaning | written by |
|---|---|---|
| `origin/*` | provenance (`migrated`, `captured`) | generation |
| `orbit/*` | orbital traits (`retrograde`, `double`) | generation |
| `atmosphere/*` | atmosphere conditions (`reducing`, `breathable`) | generation |
| `climate/*` | climate states (`runaway-greenhouse`) | accrete adapter |
| `hazard/*` | `hazard/flaring` (an active star) and `hazard/radiation` / `hazard/orbital-radiation` (the dose, as a survival time) | star generation **and** processor (classification) |
| `flight/*` | `flight/ascent` — what it costs to leave | processor (**flight dynamics, pass 4**) |
| `tidal/*` | `tidal/hotspots` | processor (environment) |
| `magnetic/*` | dynamo / induced / tenuous / unshielded | processor (**interior, pass 2b**) |
| `geology/*` | tectonic + volcanic regime | processor (classification) |
| `surface/*` | `surface/age`, `surface/irradiation` (space weathering), `surface/oxidised` | processor (classification) |

**`surface/oxidised` also feeds the ALBEDO, and that makes it load-bearing rather than flavour.**
Ferric dust is what makes Mars bright — 0.25 measured against 0.105 for its bare rock — so the rust
grade sets how much of the ground is covered by bright oxide fines. Two consequences worth knowing
before touching either end. First, it is graded and read *inside* the thermal solve, not after it: a
surface is repaved quickly where there is liquid water and slowly where there is not, so the rust
depends on the temperature and the temperature depends on the rust. Second, that is a real feedback
(colder → water freezes → the lid stops moving → the surface ages → more rust → brighter → colder),
so the solve reports any world where it does not settle instead of presenting a marginal answer as a
firm one. A world whose dominant atmospheric gas is below **its own** freezing point brightens the
same way, from frost rather than dust — Io's sulphur dioxide, Pluto's and Triton's nitrogen.
| `structure/*` | icy shell, subsurface ocean, cloud decks | processor (classification) |
| `volatiles/*` | which ices survive on the surface | processor (classification) |
| `weather/*` | lightning, dust storms, monsoon, precipitation | processor (classification) |
| `aurora/*` · `shape/*` · `ring/*` · `resonance/*` | polar glow, rotational deformation, ring tiers, period ratios | processor |
| `habitability/*` | habitability tier | processor (habitability) |
| `stability/*` | n‑body instability risk | processor (stability) |
| `barycenter/auto` | auto‑generated barycentre marker | barycentre reconcile |

> **The live registry is `src/lib/tags/tagPresentation.ts`**, which carries every tag's label and a
> plain‑English description of the physics behind it. This table is the map of *who writes what*;
> it is not the list, and it will go stale if treated as one.

> **TWO TAGS THAT READ ALIKE AND ARE NOT** (inbox B28): `hazard/radiation` is the **annual dose**,
> published as the time to a lethal one — Io reads *hours*. `surface/irradiation` is **cumulative
> space weathering**, which drives tholin darkening — Io reads *low*, correctly, because volcanism
> resurfaces it faster than anything can accumulate. Both are right; they answer different questions.
> Do not "fix" the second by feeding it the belt.

> **BELTS AND RINGS GET `hazard/radiation`, AND NOTHING ELSE FROM THE CLASSIFICATION PASS** (inbox
> B11). The tag used to live inside `processClassification`, which returns early for anything that
> is not a planet or a moon, so a ring carrying the loudest dose in its system — Jupiter's Rings at
> 360 Sv/day, above Io — had no tag to filter or warn on. It is now emitted ahead of that gate, for
> any body whose `radiationPlace()` names a real place: `surface` and `in the ring plane` qualify,
> a giant's `at 1 bar` does not. **The rest of the pass stays off for them on purpose** — a diffuse
> field has no dynamo, no tectonic regime, no cratering-sense surface age (so no
> `surface/irradiation`, which needs one) and no single surface for a habitability score. `radiationPlace`
> and `hasSolidSurface` moved to `physics/radiation.ts` so the processor and the info block cannot
> disagree; `catalogue/bodyFacts.ts` re-exports them.

> **`hazard/orbital-radiation` IS THE BELT FIGURE, NOT "THE DOSE IN ORBIT"** (inbox B27). It is
> evaluated at the inner edge of the trapped-particle belts — 1,263 km for Earth — so Earth reads
> *days* while the ISS at 400 km takes about 150 mSv/yr, four thousand times less, because low orbit
> sits **beneath** the belts. The physics is right and unchanged; what was wrong was the name. The
> row and the tag now say where the figure is (`Radiation (in the belts, from ~1,262 km)`), the
> altitude is derived per body by `orbitalRadiationPlace()`, and the wording follows the body type:
> an airless world's belt edge is its own surface so the two figures coincide and only one row shows,
> a giant keeps "above the cloud tops", a ring keeps the ring plane. Read the tag as "there is a
> hazardous shell around this world", not as "orbit is lethal".

Tags that merely **duplicated** a class were removed (`Ocean World`→`planet/ocean`,
`Ice World`→`planet/ice`, `Airless Rock`→`planet/barren`).

> Not yet namespaced: the bare `gasPhysics` atmosphere tags (`inert`, `reducing`, `greenhouse`,
> `lifting-gas`, …) come straight from the rulepack and form their own coherent set — left as‑is.

## Barycentres (arrived late — watch the interactions)

- Classification **skips** barycentres (only `planet`/`moon` are classified).
- `a_AU` / `orbital_period_days` / `eccentricity` are relative to a body's **immediate parent**,
  not the star. So **star‑relative modifiers** (`ultra-short-period`, `disrupted`) are gated on
  `orbitsStar` — true when the parent is a star OR a **star‑pair barycentre** (circumbinary
  planets count; Pluto–Charon‑style planet barycentres don't).
- Distance‑to‑star (temp/radiation) walks the parent chain to the star(s) via LCA, so it already
  handles barycentre hops; flight dynamics uses `barycenter.effectiveMassKg` for host mass.
- Guarded by `classification.barycentre.spec.ts` (the multi‑star examples must process without
  throwing and classify every planet).
