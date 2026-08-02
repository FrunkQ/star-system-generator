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
- Type score = **sum of band fits** → more‑specific types (more matched bands) outrank generic
  ones automatically. The best **base** archetype wins (mutually exclusive); **modifiers**
  (`ringed`, `ultra-short-period`, `toroidal`, `ellipsoid`, `disrupted`) stack.
- `eyeball` (and `hot-eyeball` / `cold-eyeball`) are **base** types, gated on tidal-lock to the
  **star** (`starTidallyLocked`) — a moon locked to its planet still turns relative to its star, so it
  is not an eyeball.
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
