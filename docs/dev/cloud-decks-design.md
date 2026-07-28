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

- **E1 deck temperature:** decks form aloft, colder than the surface (Venus: 737 K ground,
  ~300 K deck). Until a real adiabat exists, ONE lapse approximation in the emitter, tuned so
  Venus/Earth/Mars/Titan land correctly, pinned by fixtures. This is the seam the phase-2 T(P)
  profile later replaces.
- **E5 no feedback:** decks are visual/descriptive only; they do not enter temperature/albedo.
  Idempotence test: two passes ⇒ identical tags.
- **E6 giants — DONE for Jupiter/Uranus/Neptune, SATURN STILL WRONG.** Giants now take their colour
  from their deck stack, weighted deepest-heaviest (a warm-condensing deck forms far down where the
  atmosphere is dense and holds vastly more material; a cold-condensing species on top is a thin
  haze). Measured against reality: Jupiter dist 24, Neptune 47, Uranus 81 (right hue, too saturated
  — the real planet has a pale haze layer we do not model), Saturn 74 and GREY rather than gold.
  Saturn's fault is upstream: our condensation model gives it a methane deck that the real planet
  does not visibly have, because we test condensation at one notional "deck temperature" rather than
  at a real pressure level. That is precisely what the phase-2 adiabat fixes; do not paper over it
  in the renderer.
- **E6 original note, giants sequenced separately:** terrestrials first (giants keep the legacy ramp), then
  giants swap onto the deck stack in their own commit with Jupiter/Saturn/Uranus/Neptune
  fixtures (NH3 over NH4SH over H2O; same-but-deeper for Saturn; CH4-topped ice giants).
- **E8 legacy values:** old saves' cloud-deck tags held a colour word ("white"); auto tags
  self-heal on reprocess, manual tags parse leniently (unknown species ⇒ re-emit).
- **E10 display blind spot:** the atmosphere summary hides gases <0.5%, which hid Mars's
  0.1% deck-driving water — always show a gas currently driving a deck.

## Known limitation — coverage is read from VAPOUR

Deck coverage derives from the species' partial pressure, i.e. how much of it is still gaseous. That
under-counts a deck whose substance is almost entirely CONDENSED: Venus's sulphuric acid is a few
ppm of vapour but wraps the planet completely, and reads "broken" rather than "veil". Getting this
right needs the total inventory (vapour + condensed), which the atmosphere model does not track.
Banked with the phase-2 adiabat, which needs the same quantity.

Related trap, learned the hard way: inflating a trace gas in the example data to force a deck also
inflates its GREENHOUSE. Adding H2SO4 at 0.2% (100x its real ppm) to make Venus cloudy quietly put
+110 K on its surface temperature. Fix the model, not the data.

## Weather flavour tags (IN SCOPE for the v2.1.4 cut — Alex 2026-07-28)

- `weather/lightning` — thick warm deck + vigorous convection or volcanism. RENDERED in 3D as
  brief flashes lighting the deck shell from within (strongest on the night side); a subtle
  flicker on the 2D disc.
- `weather/dust-storms` — dry surface + thin-but-real atmosphere + no ocean (Mars).
- `climate/monsoon` — strong axial tilt + ocean + rain-bearing deck (seasonal precipitation swing).

## Phase 2 (banked)

Adiabatic T(P) profile + per-species saturation crossing → decks at computed depths; giants'
whole look from their stack (Saturn pale because its decks sit deeper — derived, not authored).
Miscibility beyond reactions (water–ammonia solution) only if demanded; helium rain out of scope.

## Handoff notes for the retagging workstream

- Multi-tag-per-key is now a real pattern (`structure/cloud-deck` × N) — the lifecycle
  strip/dedupe helpers should accept it.
- Tag-as-decision / data-as-description is the idiom this feature commits to; buckets over
  floats in values (user-facing).
- `Tag.data` (structured payload) was CONSIDERED AND DEFERRED — clouds are the motivating case
  if per-body numeric overrides are ever demanded. Value stays `"<species> <bucket>"` until then.
