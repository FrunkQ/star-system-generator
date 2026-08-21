# Cloud decks — data-driven design (v2.1.4 line)

Genericise cloud formation out of code into rule-pack data, following
`architecture-physics-tags-visuals.md`. Replaces five hardcoded tables and two magic numbers
scattered over three files, and is the root fix for the Mars borderline-clouds bug class.

## Data model

**Gas** (`gasPhysics`, optional blocks — absence = not cloud-forming / not a reaction product):

```json
"H2O":   { "cloud": { "condensesTo": "water", "minFraction": 0.001 } },
"NH4SH": { "colorHex": "#b8845a",
           "reaction": { "from": ["NH3", "H2S"], "yield": 1 },
           "cloud": { "condensesTo": "ammonium-hydrosulfide", "minFraction": 0.0001 } }
```

`reaction.yield` (0..1, default 1) scales the conversion of the limiting constituent — bulk
thermochemistry (NH4SH, yield 1) vs photochemical trace (Titan's HCN from N2 + CH4, yield 0.002;
without it min(0.95, 0.05) would put HCN at 5% of the sky). NOT a chemistry database: only
reactions someone cares about are defined, and users add their own ("Krypton + Unobtanium =
pink bubblegum" is a legitimate rule-pack entry).

**Pre-populated examples** (chosen to show the mechanism's range): NH4SH ← NH3 + H2S y1 (the
Jupiter belt chromophore); H2SO4 ← SO2 + H2O y0.5 (Venus — an acid deck derived from precursors
alone); HCN ← N2 + CH4 y0.002 (Titan's polar HCN ice, a genuine ppm trace).

**Editor**: reactions get their OWN TAB in the Atmospheres modal (Gas Physics | Atmosphere Mixes |
Reactions) — a reaction is conceptually "A + B → C" and users think of the table of reactions, not
of C's config. The tab lists each recipe as a row: three DROPDOWNS (gas A, gas B, product) + a
yield slider. ALL THREE must already be fully defined on the Gas Physics tab — the tab creates
reactions, never gases ("simplify and reuse": if the product isn't in the dropdown, define it
under Gas Physics first). The DATA still lives on the product gas; the tab is just the view. The
per-gas cloud fieldset stays on the Gas Physics tab beside aurora bands.

**Liquid** (`liquids`): existing `colorHex` is the cloud colour; new `cloudOpacity` (0..1 veil
strength). Ice-crystal vs droplet look derives from existing `meltK` vs deck temperature.

**Tag** (type unchanged): `structure/cloud-deck`, value `"<species> <bucket>"`, one tag per deck.
Buckets: `wisps | scattered | broken | overcast | veil`. Stack order is NOT stored — it re-derives
by condensation temperature.

## Emitter (processor)

`cloudDecks(body, pack)` — the single evaluation:

1. Effective composition = declared gases + reaction products (product fraction = min of
   constituents, 1:1, constituents depleted; ONE generation only, no chains).
2. Evaporation source: a liquid surface solvent injects an implied vapour fraction (scaled by
   T vs boilK) via the reverse `condensesTo` mapping — Earth's N2/O2 composition still yields
   water clouds; Titan's sea and its atmospheric CH4 dedupe to one methane deck.
3. Per cloud-capable gas: partial pressure = fraction × surface pressure; condensation tested
   with `phaseAtP` at DECK temperature (lapse approximation — see E1), gated on the exosphere
   floor (>=1e-6 bar) and below the liquid's critical point.
4. PRECIPITATION (revised E3): the ground-level phase does not suppress a deck — the original
   "snow-out kills the deck" rule would have deleted Mars's real water-ice clouds over frozen
   ground. Instead it drives a flavour tag, `weather/precipitation` value "<species> rain|snow|
   virga": liquid in the surface melt–boil span lands as rain (Earth water, Titan methane, a hot
   Jupiter's iron), below melt lands as snow (Mars water), above boil evaporates aloft as virga
   (Venus's sulphuric-acid rain famously never reaches the ground). Surfaced for future systems
   (reasons-to-visit, weather) to build on.
5. Coverage from fraction+pressure → bucket; emit auto tags, preserve manual, dedupe by species
   (manual wins).

## Renderers

Read tags + liquid look-data only. 2D disc paints decks bottom-up (bucket → coverage range,
seeded within band). 3D holo: one translucent shell per deck, altitude exaggerated ~3–5% of
radius per stack step, top deck turbulent, deeper decks banded, top 3–4 rendered. Apparent
colour's cloud contribution reads the same tags.

**Deleted:** `GAS_CLOUD`, `CLOUD_COLOUR` (fluidLayers.ts), `CLOUD_VEIL` (apparentColor.ts),
`GAS_TINT`, `waterClouds` special case (planetAppearance.ts), the `boilK × 1.6` fudge, and —
phase 2 — `gasGiantCloudColor`'s hardcoded ramp.

## Edge cases (agreed resolutions)

- **E1 deck temperature — RESOLVED, the fudge is deleted.** Decks form aloft, colder than the
  surface. This was a tuned lapse approximation; it is now `atmosphereProfile.ts`, a real
  temperature profile (see "The profile" below), and every deck is placed at a computed pressure
  level rather than tested at one notional temperature.
- **E5 no feedback:** decks are visual/descriptive only; they do not enter temperature/albedo.
  Idempotence test: two passes ⇒ identical tags.
- **E6 giants — RESOLVED.** Giants take their colour from their deck stack, weighted
  deepest-heaviest (a warm-condensing deck forms far down where the atmosphere is dense and holds
  vastly more material; a cold-condensing species on top is a thin haze). Saturn was the holdout:
  grey rather than gold, because our model gave it a methane deck the real planet does not visibly
  have. The profile fixes it upstream, exactly as predicted — Saturn's air reaches its skin
  temperature before its methane ever reaches saturation, so there is no methane deck, and the
  ammonium hydrosulphide beneath makes it gold. Pinned by a test whose subject is an ABSENCE.
  Uranus's over-saturation went with the same change: coverage no longer reads from vapour.
- **E6 original note, giants sequenced separately:** terrestrials first (giants keep the legacy ramp), then
  giants swap onto the deck stack in their own commit with Jupiter/Saturn/Uranus/Neptune
  fixtures (NH3 over NH4SH over H2O; same-but-deeper for Saturn; CH4-topped ice giants).
- **E8 legacy values:** old saves' cloud-deck tags held a colour word ("white"); auto tags
  self-heal on reprocess, manual tags parse leniently (unknown species ⇒ re-emit).
- **E10 display blind spot:** the atmosphere summary hides gases <0.5%, which hid Mars's
  0.1% deck-driving water — always show a gas currently driving a deck.

## The profile (was phase 2, now shipped) — `src/lib/physics/atmosphereProfile.ts`

Two pieces of textbook physics and NO new rule-pack data:

1. A convecting atmosphere follows its dry adiabat, `T = T_surf (P/P_surf)^K`, with `K = R/c_p`
   computed from the gases present (the per-gas `specificHeat` and `molarMass` the greenhouse model
   already carries). It comes out at 0.29 for air, 0.22 for CO2, 0.29 for a hydrogen giant.
2. Convection stops. Above the tropopause the air settles at the SKIN TEMPERATURE, `T_eq / 2^(1/4)`
   — the grey-atmosphere result, and a good one: Earth 214 K (real ~210), Jupiter 104 K (real ~110),
   Venus 195 K (real ~190).

Condensation is then the crossing of two curves: a well-mixed gas keeps its mole fraction with
height so its partial pressure falls with the total, while saturation pressure falls far faster as
the profile cools. Where they cross is the deck BASE. Saturation pressure is the exact INVERSE of
the existing `boilKAt` above the triple point, continued by Clausius-Clapeyron below it — one curve
read both ways, so a substance can never be boiling and condensing at once. The latent heat that
needs is not new data either: the triple point and the boiling point are two points already on the
curve and determine it exactly (water 43.3 kJ/mol, methane 8.17 against a real 8.19, ammonia 24.2
against 23.3).

Coverage comes from the condensate column integrated above the base, turned into an optical depth.
Two further consequences, both of which used to be special cases:

- **Precipitation** is now one question the profile can answer: is the air at the SURFACE saturated
  in this species? Close to it and what falls lands (rain, or snow below the melt point); far from
  it and the drops evaporate on the way down (virga). Mars's water-ice turns out to be virga, not
  snow — which is right.
- **Coverage is no longer read from vapour**, the old known limitation. A deck that rains out is
  drained and leaves gaps; one that recycles keeps everything. Venus is a total veil on a few ppm
  and Earth is broken cloud on far more water, from the same rule rather than a bonus term.
- A body WITH A SURFACE cannot hold more of a substance in its air than the ground temperature
  allows — the excess frosts out and stays there. Without that, 100 ppm of hydrogen cyanide, solid
  everywhere on Titan including the ground, read as an overcast sky. Giants are exempt: their
  reservoir is the hot interior below.

Measured against the real solar system after the change: Earth's cloud base 0.75 bar (real ~0.9),
Venus's 4 bar (real ~1.5), Mars's 0.004 bar, Titan's 0.82 bar (real ~0.8), Jupiter's ammonia 0.41
bar (real ~0.7), and Saturn correctly has no methane deck at all.

Still not modelled, deliberately: anything below the anchor pressure. We only need to see as far as
we can see.

## Known trap

Related trap, learned the hard way: inflating a trace gas in the example data to force a deck also
inflates its GREENHOUSE. Adding H2SO4 at 0.2% (100x its real ppm) to make Venus cloudy quietly put
+110 K on its surface temperature. Fix the model, not the data.

## Weather flavour tags (IN SCOPE for the v2.1.4 cut — Alex 2026-07-28)

- `weather/lightning` — thick warm deck + vigorous convection or volcanism. RENDERED in 3D as
  brief flashes lighting the deck shell from within (strongest on the night side); a subtle
  flicker on the 2D disc.
- `weather/dust-storms` — dry surface + thin-but-real atmosphere + no ocean (Mars).
- `climate/monsoon` — strong axial tilt + ocean + rain-bearing deck (seasonal precipitation swing).

## Banked

Miscibility beyond reactions (water-ammonia solution) only if demanded; helium rain out of scope.
Photochemical hazes (Uranus's pale upper veil, Titan's tholins above the methane) are made ALOFT
rather than mixed up from below, so they need a source model this does not have.

## The giant lab

`buildGiantLab()` in `galleryExamples.ts`, rendered by both galleries under the live-Sol row. Every
body in it is nothing but a composition, a pressure and a temperature; each row sweeps ONE variable
and shows the model's own answer. Label the rows by their INPUTS — on its first run the lab
contradicted three of the labels it had been given, which is the entire point of it.

## Handoff notes for the retagging workstream

- Multi-tag-per-key is now a real pattern (`structure/cloud-deck` × N) — the lifecycle
  strip/dedupe helpers should accept it.
- Tag-as-decision / data-as-description is the idiom this feature commits to; buckets over
  floats in values (user-facing).
- `Tag.data` (structured payload) was CONSIDERED AND DEFERRED — clouds are the motivating case
  if per-body numeric overrides are ever demanded. Value stays `"<species> <bucket>"` until then.

## Albedo joined up (v2.1.282-beta)

`albedo.ts` used to be a SECOND cloud model. It carried its own `CONDENSE_BOIL` table and decided a
deck existed if `teqK < boil * 1.6` with the gas over 2% — no column, no saturation, no profile.
Two models therefore described the same sky two different ways on the same body, and the GM's panel
showed both at once: Adrian (Tau Ceti, 8 bar of 91% CO₂) read "CO₂ cloud deck, albedo 0.649" from
one and "no decks" from the other. Venus's deck read CO₂ there and sulphuric acid here.

The crude model was also UPSTREAM: albedo sets equilibrium temperature, which sets the greenhouse,
the surface temperature, the classification bands and the profile that this file's decks come out
of. Everything downstream was being judged against it, including the better model.

**Why it had grown its own test.** The problem is circular:

    albedo → equilibrium temp → greenhouse → surface temp → profile → cloud decks → albedo

The decks genuinely do not exist yet at the moment albedo is first needed. The fix is not a second
cheaper model; it is to solve the loop. `solveThermalState()` in `physics/temperature.ts` does that
— a bounded, damped fixed-point iteration on one scalar, evaluated against a non-mutating probe so
the answer never depends on what a previous `process()` left on the body. Over all 260 bodies in the
bundled starmaps and the Solar System it settles in at most 5 passes, none unconverged.

**What albedo keeps.** Optics only: how bright each layer is and how they stack. Decks arrive
deepest-first and are composited bottom-up (`A = a·cov + A·(1−cov)` per layer), so the top deck has
the last and largest say. Per-condensate reflectivity is rule-pack DATA — `LiquidDef.cloudAlbedo`,
beside the `cloudOpacity` that was already there. Opacity is what a deck HIDES; albedo is what it
RETURNS; they are not the same number and Venus needs both.

**Calibration.** The reflectivities are fitted to measured Bond albedos using this model's own
coverages, which is why they moved: at Earth's real 66% cloud cover, water clouds reflect ~0.42, not
the 0.50 the old table used against a 50% cover invented from the pressure.

| Body | measured Bond | before | after |
|---|---|---|---|
| Venus | 0.76 | 0.689 (as CO₂) | 0.757 (as sulphuric acid) |
| Earth | 0.306 | 0.293 | 0.308 |
| Jupiter | 0.503 | 0.34 | 0.490 |
| Saturn | 0.342 | 0.34 | 0.343 |
| Uranus | 0.300 | 0.30 | 0.285 |
| Neptune | 0.290 | 0.30 | 0.288 |
| Titan | 0.265 | 0.30 | 0.285 |

Giants lost their hardcoded temperature bands with everything else: a giant is now its deck stack
over a deep atmosphere, which is bright while the air is clear (Rayleigh) and dark once it is hot
enough for alkali metals and metal oxides to absorb. Jupiter going 0.34 → 0.49 is that change.

**Known consequence — Mars.** Mars's real 210 ppm water-ice wisp is gone from the bundled Sol file.
It is not a cloud-model regression: the wisp survives up to Teq ≈ 214.5 K and Mars now sits at 216.7
(it was 211.3). Mars got warmer because it lost a CO₂ deck it never had, and that fake deck had been
carrying its albedo at 0.236 — close to the measured 0.25 for entirely the wrong reason. The real
gap is the SURFACE model: rock + metal makeup alone gives 0.154, and Mars is bright because of
ferric dust and polar caps. `deriveOxidation()` already grades exactly that rust, but it reads
`geoActivity.surfaceAgeGyr`, derived after the thermal solve — so wiring it into surface albedo
means moving the geology derivation too, and reintroduces the one-pass lag this change removed.
Left as its own piece of work.
