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
   in passes: barycentres → physical basics → environment (temp/radiation) → **classification**
   → flight dynamics → stability. It re‑derives on every `process()`, so it owns:
   - **`body.classes`** — the planet TYPE, via the fingerprint classifier (below).
   - **condition tags** — `tidal/*`, `habitability/*`, `stability/*`, plus the atmosphere tags
     from `gasPhysics`.

3. **Consumers** (UI, `rendering/colors.ts`, `viewPresets`) read classes for the type/image and
   tags for conditions. They must NOT write back into either.

Classification reads **raw physics features, not tags**, so there is no circular dependency.

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
| `hazard/*` | hazards (`flaring`) | star generation |
| `tidal/*` | `tidal/hotspots` | processor (environment) |
| `habitability/*` | habitability tier | processor (habitability) |
| `stability/*` | n‑body instability risk | processor (stability) |
| `barycenter/auto` | auto‑generated barycentre marker | barycentre reconcile |

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
