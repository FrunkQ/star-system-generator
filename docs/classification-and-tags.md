# Classification, Tags & Barycentres — how they layer

This is the coherent model after the Phase‑04 rewrite. It exists because the project drifted
from *classification* → *tags* (a half‑measure) → back to *classification*, leaving the two
overlapping. The rule now: **classification owns the planet TYPE; tags are orthogonal
conditions/history; neither derives from the other.**

## The three layers (in processing order)

1. **Generation** (`lib/generation/*`)
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

### The other three keys on a fingerprint, and who reads them

`match` and `gate` are the classifier's. The rest of the record is read by other passes entirely,
and a pack author needs to know which is which.

- **`formation` is a ONE-WAY BIRTH WINDOW, and the classifier never reads it.** It says what a slot
  may be *given* when a system is generated — a protoplanet is young, a chthonian core or a helium
  remnant needs time to be stripped, a cratered world needs time to accumulate the record — and it
  is read by `generation/generateBodyOfType.ts`, from `fp.formation`, never from `fp.match`. **A
  body that exists classifies as what it is regardless of whether it could have formed yet:** a
  hand-placed chthonian in a million-year-old system still classifies as a chthonian. Four types
  declare one today (`protoplanet`, `crater`, `helium`, `chthonian`). Omit it and the type is
  birthable at any age.
- **`range` is EDITOR METADATA and the scorer never reads it either** (`system/typeRanges.ts`). It
  gives `mass_Me` / `radius_Re` / `density` / `Teq_K` spans for slider extents, for which types the
  "Add planet/moon here…" picker offers, and for filtering by the orbit's temperature. Because it is
  separate from `match`, ranging can be retuned without recalibrating classification. **A base type
  with no `range` is not offered in a picker** — that is how the specialist and derived classes stay
  out of it — though it still classifies normally.
- **`note` is prose for the panel.** Nothing derives from it.

**`classifier.rules[]` and `classifier.minScore` ARE NO LONGER READ** (inbox B67, v2.1.889). There
was a second, additive classification seam beside the fingerprint engine; every shipped pack already
used fingerprints, so no bundled body changed class when it went. A pack that still ships `rules` is
told so once, on the console. **A pack with no fingerprints at all falls back to one base class by
mass** rather than to the old rule path. Describe the rule-pack classification format as fingerprints
only.

### The zones the generator places into — all derived from LUMINOSITY

`physics/zones.ts` is the single source for these, and every one of them is a property of the
**star's luminosity asked at a heliocentric distance** — never of a mass, and never of the immediate
host, so a moon's zone question is answered by walking the parent chain up to the star. A `sqrt(M)`
form is not a rough approximation of `sqrt(L)`: for main-sequence stars `L ∝ M³·⁵`, so the two curves
are wrong in *opposite* directions at the two ends (engine map **GEN-4** carries the measurements —
12.9× too far out for an M8 dwarf, 10× too close for a hot B star, and near enough right for Sol,
which is why it survived).

**There are TWO frost lines and they answer different questions**, both drawn on the system map when
Zones is on:

| line | at | means |
|---|---|---|
| **formation frost line** | ~170 K, at the star's luminosity when the system was *born* | what a body could have formed as. This is the one the placement chain starts inside, and the one beyond which giants become likely. |
| **current frost line** | ~125 K, at the star's luminosity *now* | where ice is stable today. |

Also derived rather than constant: the silicate and soot lines, the CO₂ and CO ice lines, the
Goldilocks zone, and the **kill and danger zones** — the kill zone being the mean of two independent
hazards relative to Sol, the star's **surface ultraviolet share** and its **coronal ionising
output**, which is why an active M dwarf is dangerous and a quiet one of the same size is not
(inbox B81). The danger zone is a pack multiple of the kill zone.

**Where planets go between them** is a ratio chain rather than a table of AU: successive orbits are
drawn as a *ratio*, floored by a few mutual Hill radii, starting inside the formation frost line and
running out at twice the CO ice line. Nothing about the Sun's own orbits is carried to another star.
The full account, with the numbers, is on `/physics#generation`; the pack blocks are
`generation_parameters.orbital_spacing`, `planet_mass_band_me`, `type_rarity_weighting`,
`type_metallicity_sensitivity` and `realism_bands`, all GM-editable.

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

**Two of those features are easy to read as something they are not:**

- **`stellarIrradiation` means STARLIGHT, not total incident flux** (inbox B34, v2.1.685). It changed
  meaning: a rule keyed on it that was seeing 26,279 on Io now sees 0.037, because Io's environment is
  dominated by Jupiter's belt rather than by the Sun. If a pack rule wants the radiation environment,
  it wants `radiation_flux`.
- **`density` is a bulk figure the engine derives from the makeup**, so it is internally consistent —
  but a density that came *in* from a catalogue is not the same kind of number. See below.

### GM‑only types (no fingerprint)
`forest, jungle, swamp, ecumenopolis` need biome / industrialisation data the engine doesn't
model (it computes a habitability *score* + tier, not vegetation), and they share the habitable
envelope with `earth-like` — so auto‑assigning is guessing. They stay in the vocab + images for
**manual** GM assignment. Revisit if/when a biome model lands.

## Stars are classified differently — by POSITION, not fingerprints

Added 2026-08-16. **The fingerprint machinery above is PLANETS ONLY.** There are no `star/*`
fingerprints in the pack and `classification.ts` has no star branch — a star's type is derived a
different way, and confusing the two is easy because both end in a `star/…` or `planet/…` class key.

A star's class comes from **where it sits**: the LETTER from its temperature, and the LUMINOSITY
CLASS from its radius *at* that temperature, matched against the pack's own `statTemplates` bands
(`system/starBandMatch.ts`). That is what makes classification the inverse of generation — the same
bands the generator draws from are the ones the classifier tests — and it is why "pick `G2V`, get
`G2V` back" holds.

**Why not brightness?** Because it does not work: cutting on absolute luminosity got five of ten
published reference stars wrong, calling Vega a giant and every O and B dwarf a supergiant. A B0V
genuinely *is* 10⁴·⁵ solar luminosities; only its size for its temperature says it is a dwarf. The
engine map's **PHY-17** carries the full rule and the measurements, including the cheaper fixes that
were tried and do not work.

Two consequences for anyone reading star classes:

- **The subclass (`G2`) is main-sequence only.** The temperature that means "K1.5" for a dwarf means
  something else for a giant, so giants get a letter and a luminosity class and no number.
- **Remnants are not positions.** A white dwarf's place on the diagram says hot and dim; it cannot say
  what made it. Their identity depends on the progenitor, which is why `classifyStar` takes a
  progenitor mass separately (**PHY-14**).

### One pack lookup a remnant depends on

A star's portrait resolves **exact key first, then the bare letter** — `star/BH` before `star/B`.
That is one lookup where there used to be three, and it means a pack that drops a remnant's own key
gets **no portrait for it rather than a wrong one**: `star/BH` will not borrow `star/B`. Every shipped
remnant carries its own key, which is why nothing moved when the three lookups became one. If you are
authoring a pack, add the remnant keys or expect a gap.

## What an IMPORTED number is worth

A catalogue value arrives as data, not as a measurement, and two of them mislead in ways that have
already changed a bundled body.

- **For about three quarters of the catalogue the quoted density is CALCULATED from the mass**
  rather than measured — 135 of the 182 rows in the committed cache reproduce the mass-radius
  estimator to within 1% (**DATA-R7**). Such a density is the mass a second time and is not an
  independent constraint on anything. `radiusIsBackFilled()` is the test.
- **Past the giant mass threshold, NO density evidence can make a body rocky** (inbox D17). A
  super-Jupiter is dense because hydrogen is squeezed by its own self-gravity. Epsilon Indi A b
  classified as 62% rock / 33% metal on a 5.54 g/cc reading — a *genuinely measured* one — and is
  85% gas; both bundled starmaps changed at v2.1.504, so any screenshot or worked example quoting
  its makeup from before then is wrong. Below the threshold a measured dense reading **does** win,
  and deliberately: HD 219134 b and c and 55 Cancri e are real dense small worlds, and discarding
  that would be throwing away evidence in favour of the rule of thumb that exists only because the
  usual density is circular.

A star's **luminosity class is read where the file states it**, not inferred from the letter alone,
which is why Antares imports as a red supergiant; where the file gives only a letter, the class is
inferred from temperature and radius when both are present, and otherwise defaults to main sequence
— never a guessed spectral type. Figures for a star with no measured parameters are **typical for its
class rather than observed**, and every surface that shows them says so.

## Tags = orthogonal conditions/history (namespaced)

### Provenance — the column that decides what may delete a tag

Every tag has an ORIGIN, and it is the origin, not the namespace, that says what happens to it on the
next pass. `tags/tagLifecycle.ts` is the only module that interprets this; everything else asks it.

| origin | written by | survives a re-process | survives export | removable by hand |
|---|---|---|---|---|
| `physics` | the processor, every pass | no — cleared and re-derived | no | no (it comes straight back) |
| `rule` | an automated tagging rule | no — cleared and re-rolled | no | no (edit the rule) |
| `authored` | **generation / import**, once | **yes** | **yes** | **yes, permanently** |
| `manual` | the GM, by hand (incl. overrides) | yes | yes | yes |
| `inherited` | construct hardware (drive, fuel) | yes | no — recomputed | no (change the hardware) |
| `derived` | runtime state (in transit, adrift) | yes | no — recomputed | no (it mirrors state) |

**Provenance is declared by the CATEGORY, not by the tag.** The tag carries only the simple half —
was a human responsible (`manual`) — and `tagDefaults.ENGINE_NAMESPACES` declares, per namespace,
what a tag there is when nothing else says. That table is the single place to add a new engine
namespace; miss it and the namespace's tags silently read as `physics` and get stripped. Exact keys
may override their namespace, which `orbit/` needs: `orbit/retrograde` is the generator's claim,
`orbit/tidally-locked` is re-derived every pass.

**`authored` is the class the UI used to get wrong.** A generated tag was shown under a red padlock
reading "derived from the physics — recomputed every run", which was false in every clause (inbox
A44). Nothing re-derives it, and a GM may delete it for good. An edit that makes an inferred value
real must also RETIRE the claim — typing an obliquity clears `spin/axis-inferred`.

**A hand-added tag in a physics namespace is an OVERRIDE.** It survives the pass that would have
re-derived the namespace, and the emitter's guard (`tagLifecycle.emit`) means it SUPPRESSES the
derived tag of the same key rather than sitting beside it. So the GM wins that key outright, and
every consumer — renderers, rules, the finder — reads the override exactly as it would the real one.

| namespace | meaning | written by |
|---|---|---|
| `origin/*` | provenance (`migrated`, `captured`) | generation |
| `orbit/*` | orbital traits (`retrograde`, `double`) | generation |
| `atmosphere/*` | atmosphere conditions (`reducing`, `breathable`) | generation |
| `climate/*` | climate states (`runaway-greenhouse`) | (was the accrete adapter, removed v2.1.898-beta) |
| `hazard/*` | `hazard/flaring` (an active star) and `hazard/radiation` / `hazard/orbital-radiation` (the dose, as a survival time) | star generation **and** processor (classification) |
| `stellar/*` | `stellar/activity` (the magnetic-activity bucket every star surface reads: quiet / moderate / active / flare-star), `stellar/jets` (moderate / strong — a relativistic well, an ordered field and a power source: a fed black hole, a neutron star, a magnetar), `stellar/shedding` (wind / shell — Reimers mass loss, L·R/M: giants and supergiants, hot O stars), `stellar/anomalous` (the VERDICT, and the one to pin if you pin one: `structure` = dimmed with no reddening, which dust cannot do, so something solid stands in the way; `dust` = dimmed AND reddened, which a solid occluder cannot do), `stellar/dimmed` (magnitudes fainter than its class should read, because something intercepts its light - as measured by an observer the obstruction actually covers), `stellar/ir-excess` (the share of the star's bolometric output coming back out as far-infrared waste heat from whatever intercepted it). The last two are what an OBSERVER measures rather than what the star is: grey attenuation cuts flux without touching colour or the absorption lines, so a swarmed G2V still reads G2V and the three measurements disagree | processor (the star pass, before pass 0) — **both starmaps and the system view draw exactly what these say**; remove the tag and the mark goes |
| `mega/*` | Megastructures, two provenances in one namespace: the CREATION STEERS (`mega/goldilocks` and friends - authored at placement, prose in the value, survive re-derive) and `mega/shadowed-by` (PHYSICS, explicit origin: the engine re-earns it every pass from the starlight-occlusion chain and strips it when the structure goes; value = the occluder names). The G54 rungs apply: anonymous shows players that something dims this world without saying what | placement steers: AddConstructModal at creation; shadowed-by: processor, beside the temperature commit |
| `flight/*` | `flight/ascent` — what it costs to leave; `flight/fuel-use` — what it costs a construct to STAY at a Lagrange point (`coasting` / `station-keeping` / `holding`) | processor (**flight dynamics, pass 4**; fuel-use in **co-orbital, pass 0c**) |
| `tidal/*` | `tidal/hotspots` | processor (environment) |
| `magnetic/*` | dynamo / induced / tenuous / **anomalous** / unshielded | processor (**interior, pass 2b**) |
| `anomaly/*` | the GM's stated REASON for a pinned value | processor (**anomaly, pass 7**), from `overrides.anomalies` |
| `geology/*` | tectonic + volcanic regime | processor (classification) |
| `surface/*` | `surface/age`, `surface/irradiation` (space weathering), `surface/oxidised` | processor (classification) |
| `spin/*` | `spin/axis-inferred`, `spin/period-inferred`, `spin/tipped` | **generation** (all three body-creation routes) |

**`spin/*` IS A PROVENANCE NAMESPACE, and it is the only one.** Every other tag says what a world
*is*; these say **who worked the number out**. A generated world's axial tilt and rotation period are
plausible values from the formation model, not measurements, so they are marked — and the mark is
worth having because its ABSENCE is the claim: Earth's 23.4° and Uranus's 97.8° were observed, and a
generated neighbour sitting beside them in the same starmap must not read as though somebody had
been there. `spin/tipped` is the other half and is physical rather than provenance: this world was
hit hard enough to re-point its axis instead of being nudged from the disc it condensed in.

**What qualifies is decided by one rule, not per field:** does the processor RE-DERIVE the value?
A value it replaces was never a claim the generator made. So `axial_tilt_deg` is marked (nothing
re-derives it), `rotation_period_hours` is marked *unless* the body is tidally locked (where the
lock sets it from the orbit), and the die-rolled `magneticField` is **not** marked at all — the
magnetism model overwrites it every pass, and a provenance tag there would be both untrue and
deleted. The decision lives in `generation/spinProvenance.ts` so all three body-creation routes
answer it identically; a fourth copy is how the rule stops holding.

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
| `feature/*` | a giant's polar vortex (one tag per pole; a side count for a polygonal jet, or `round` for a plain eyed cyclone) | processor — but SEEDED, not derived: see "known fudges" on the physics page |
| `aurora/*` · `shape/*` · `ring/*` · `resonance/*` | polar glow, rotational deformation, ring tiers, period ratios | processor |
| `habitability/*` | habitability tier | processor (habitability) |
| `biodiversity/*` | which pigment a world's life settled on, how much of the LAND shows life, and how far a settlement has spread | processor (classification, the surface-light pass) |
| `stability/*` | n‑body instability risk | processor (stability) |
| `stability/inside-circumbinary-limit` | orbits BOTH stars of a pair, but inside the P‑type critical radius (Holman & Wiegert 1999 — roughly 2–4x the pair separation, rising with the pair's eccentricity and mass ratio). Arrives with `stability/very-unstable` + `fate/eject`; the pair publishes both edges of the stable annulus as `Barycenter.circumbinary` | processor (stability) |
| `orbit/lagrange` | this node rides a Lagrange point of another body (value: `l1`..`l5`); the orbit is DERIVED from that secondary every pass. Breached trojan regimes read as `stability/*` + `fate/*` with the Gascheau margin in the reason | processor (**co-orbital, pass 0c**) |
| `barycenter/auto` | auto‑generated barycentre marker | barycentre reconcile |

> **The live registry is `src/lib/tags/tagPresentation.ts`**, which carries every tag's label and a
> plain‑English description of the physics behind it. This table is the map of *who writes what*;
> it is not the list, and it will go stale if treated as one.

> **`biodiversity/*` IS ONE PASS'S NAMESPACE AND IT CLEARS ONCE.** The surface-light pass owns it:
> it derives the spectrum reaching a world's ground, scores the pigments against it, draws a
> dominant, and resolves each morphology's colour. `biodiversity/land-cover` is the percentage of the
> **land** showing any life colour — the UNION of the painted layers, never the sum of the coverage
> sliders, which are independent and may total past 100%. The rest of the viable set is derived and
> kept on the body — the Bio tab's picker lists it — but deliberately NOT tagged: several pigments
> always work, and six tags per living world saying so is clutter a dropdown already covers.

> **WHICH PIGMENT WINS IS DRAWN, AND THE DRAW IS THE MODEL.** Without an evolutionary history a real
> biosphere's outcome is contingent, so the dominant is a weighted pick over everything scoring above
> the viability floor, seeded on the body id. The same world always gives the same answer; a similar
> world around a similar star may legitimately give a different one. It is not a placeholder for a
> model that has not been written.

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
- **A member's elements describe its orbit about the BARYCENTRE, in the system plane — not the pair's
  orbit about the star**, and reading them as the latter is the mistake the source data itself made
  (inbox D14). Pluto and Charon reported a mutual eclipse "every 6 d" on that reading; corrected, the
  event is dated and rare.
- **The eclipse epoch is not anchored** (`Omega_deg` is 0), so any write-up should say the mutual
  seasons are **in the right rhythm rather than on the right dates**. The row's own tooltip carries
  the same caveat, and it is the honest limit of holding the elements fixed with no nodal precession.
