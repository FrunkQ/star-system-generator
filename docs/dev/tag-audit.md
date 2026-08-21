# Tag audit — does every tag report the quantity its name claims?

Inbox **B29**, swept 2026-08-02 at v2.1.363-beta. **Every** tag-emission site in the engine, including
the ones that are fine — the value of this table is as much in the clean rows as the broken ones, so
that nobody has to re-derive it.

The question asked at each site is one question: **what quantity is this tag bucketed off, and is
that the quantity a reader would think the tag describes?**

Three faults of this family were already known — [A33] (a relative ratio printed beside an absolute
dose), [B27] (a belt peak labelled "orbital") and [B28] (an appearance driver published as a hazard
reading) — and every one was found by accident rather than by looking.

> **The durable half is `src/lib/tags/tagConsistency.spec.ts`, not this table.** A corrected label
> drifts again the moment the physics moves; an assertion does not. Five assertions now run over
> every bundled body, freshly PROCESSED rather than read out of stored JSON, so they audit the engine
> as it is rather than a snapshot serialised months ago.

---

## `core/SystemProcessor.ts`

| tag | bucketed off | a reader assumes | verdict |
|---|---|---|---|
| `hazard/flaring` | `flareActivity > 0.4` (star class + system age) | this star flares | **fine** |
| `stellar/activity` | `flareActivity`, bucketed | how magnetically active the star is | **fine** |
| `thermal/self-luminous` | `substellar.teffK`, as a raw number | …something numeric, unit unstated | **FIXED** — the value is an effective temperature and now renders `1,500 K` |
| `tidal/hotspots` | `hasTidalHotspots()` (tidal flexing vs host) | localised tidal heating | **fine** |
| `orbit/spin-orbit-resonance` | `lockedSpin()` ratio, e.g. `3:2` | a captured spin–orbit ratio | **fine** |
| `orbit/tidally-locked` | `predictTidalLock()` vs system age | one face permanently toward something | **fine** |
| `orbit/locked-star` / `locked-planet` | the same, plus what it orbits | *which* body it is locked to | **fine** — this pair exists precisely because "locked" alone was ambiguous |
| temperature-profile tags | `surfaceTempProfile()` (latitude, seasonal, day–night, locked faces) | how the surface temperature varies | **fine** |
| `magnetic/*` | `deriveMagnetism()` + the committed field | how shielded the body is | **fine** |
| `structure/icy-shell` | makeup ice + surface phase; value = the species | a frozen crust, of that substance | **fine** |
| `structure/subsurface-ocean` | a conductive subsurface fluid layer | liquid under the ice | **fine** |
| `hydrosphere/ocean` · `brine` | surface phase = liquid; value = solvent | standing liquid of that solvent | **fine** |
| `hydrosphere/frozen` | surface phase = solid | the recorded solvent is ice | **fine** |
| `structure/supercritical-envelope` | surface phase = supercritical | neither sea nor sky | **fine** |
| `hydrosphere/boiled-off` | surface phase = gas | the inventory has gone to vapour | **fine** |
| `climate/steam-world` | boiled solvent still held by real pressure | a steam atmosphere | **fine** |
| `activity/sublimating` | surface ice below its triple pressure, warming | ice passing straight to vapour | **fine** |
| `activity/cryovolcanism` | icy makeup + interior heat + a real crust | melt eruptions | **fine** |
| `climate/polar-ice` | liquid at the mean, solid at the cold extreme | partial frozen caps | **fine** |
| `geology/*` | `deriveGeoActivity()` regime | tectonic / volcanic regime | **fine** |
| `surface/age` | `geoActivity.surfaceAgeGyr`, bucketed | how long the visible surface has been exposed | **fine** |
| `surface/irradiation` | `irradiationDose` (cumulative weathering) | *used to read as a dose* | **fine since [A33]/[B28]** — labelled "Space weathering", and the description says outright that it is not a dose per year |
| `hazard/radiation` | `surfaceRadiation`, as time-to-lethal-dose | how dangerous standing there is | **fine** — and now asserted against the dose it claims to describe |
| `hazard/orbital-radiation` | `orbitalRadiation`, same ladder | the hazard where a ship parks | **fine** — emitted only when its bucket word differs from the surface one |
| `feature/polar-vortex` | a procedural side count | …a number | **FIXED** — renders `6-sided` |
| `ring/system` · `ring/multiple` | ring children in the geometry | this body has rings | **fine** |
| `ring/light` · `medium` · `heavy` | ring debris **mass**, log-scaled | brightness or thickness | **fine, but the description carries it** — "light" is mass, and the registered description says "faint, low-mass" |
| `shape/*` | `rotationalDeform()` from spin + density | flattened by its own spin | **fine** |
| `aurora/*` | tier from `deriveAurora()`; **value a raw 0..1 float** | "Brilliant aurora: 0.78" — 0.78 of what? | **FIXED** — the tier is already in the key, so the value is suppressed for readers and kept for the renderer |
| `volatiles/ices` | retained species, joined with `+` | one tag naming several ices | **FIXED** — one tag per species; the joined form was a delimited mini-format the architecture doc bans, and unreadable as a chip |
| `surface/oxidised` | `deriveOxidation()` grade | rust, and how much | **fine** |
| `flight/ascent` | `loDeltaVBudget_ms`, bucketed | what it costs to leave | **fine** |
| `habitability/*` | the habitability tier gates | which habitability tier | **fine** |

## `physics/stability.ts`

| tag | bucketed off | a reader assumes | verdict |
|---|---|---|---|
| `stability/*` | the instability-timescale assessment | how long this orbit lasts | **fine** |
| `fate/*` | the predicted end-state | how it ends | **fine** |

## `physics/surfaceTemperature.ts`

| tag | bucketed off | a reader assumes | verdict |
|---|---|---|---|
| `tidal/lava-flows` | tidal peak temperature ≥ 1300 K | molten surface from tidal heating | **fine as a reading** — see the finding below on it being a *second* answer to a question geology also answers |
| `tidal/volcanism` | tidal peak temperature ≥ 1000 K | tidally driven volcanism | as above |

## `physics/accrete-adapter.ts`

| tag | bucketed off | a reader assumes | verdict |
|---|---|---|---|
| `climate/runaway-greenhouse` | accrete's own greenhouse flag, at generation | a runaway greenhouse | **fine, but generation-time only** — never re-derived, so it does not follow an edit |
| `atmosphere/breathable` | accrete's breathability code, at generation | you can breathe it | **finding below** — a second answer to the question `breathable-human` answers from the rule pack |

## `physics/cloudDecks.ts`

| tag | bucketed off | a reader assumes | verdict |
|---|---|---|---|
| `weather/precipitation` | deck species + precip form, as `"<species> <form>"` | what falls out of the sky | **fine** — the one delimited form the architecture doc sanctions |
| `weather/lightning` | convective vigour + deck coverage + volcanism | how often the sky fires | **fine since [B13]** — it reads geology tags, which used to be emitted *after* it |
| `weather/dust-storms` | dry loose surface + air to lift it | how far dust storms spread | **fine** |
| `weather/monsoon` | seasonal rainfall swing | a seasonal rain cycle | **fine** |

## `physics/resonance.ts` · `physics/reasonsToVisit.ts`

| tag | bucketed off | a reader assumes | verdict |
|---|---|---|---|
| `resonance/*` | the detected period ratio | a whole-number period ratio with a neighbour | **fine** |
| PoI rule tags | a user-authored rule condition + a seeded roll | whatever the rule says | **out of scope** — pack data, described by the rule's own label and hover text |

## Rule-pack `gasPhysics` tags (un-namespaced)

`inert`, `greenhouse`, `reducing`, `oxidizer`, `lifting-gas`, `toxic-human`, `asphyxiant`,
`crushing-atmosphere`, `breathable-human`, `prebiotic-precursor` and the rest: each fires on a gas
partial-pressure or percentage trigger in the pack, and each says what it means. **Fine as a set**,
and deliberately left un-namespaced (see `classification-and-tags.md`).

**Three were emitted with no registry entry at all** and reached a reader as bare title-cased words
with no description: `high-humidity`, `biosignature` and `exotic-biology`. **FIXED** — registered.
The last two fire on the same trigger for the same gas, so a world showed "Biosignature" beside
"Exotic biology" with nothing to say they were one observation seen twice; the descriptions now
distinguish them.

---

## Findings recorded, not fixed

These are model questions, and this audit changes labels, buckets and tests — not models.

1. **Two independent answers to "is this world tidally volcanic?"** `tidal/volcanism` comes from a
   tidal peak **temperature** threshold in `surfaceTemperature.ts`; `geology/volcanic-tidal` comes
   from the `deriveGeoActivity` **regime**. They agree today — Io is the only body carrying either,
   and it carries both — but nothing enforces that, and two evaluations of one question will disagree
   at the margins ([B1] is the precedent). Unifying is a physics change.
2. **`atmosphere/breathable` vs `breathable-human`.** The first is written once at generation by the
   accrete adapter and never re-derived; the second is a rule-pack trigger re-evaluated every pass.
   Editing a world's air updates one and not the other.
3. **`body.stellarRadiation` has not been stellar since [B17]** — captured separately during D5. It
   is `components.total` and carries the belt, and it is fed to the classifier as the feature
   `stellarIrradiation`.

[A33]: observations-inbox.md
[B27]: observations-inbox.md
[B28]: observations-inbox.md
[B13]: observations-inbox.md
[B17]: observations-inbox.md
[B1]: observations-inbox.md
