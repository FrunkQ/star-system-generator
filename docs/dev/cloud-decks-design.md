# Cloud decks — data-driven design (v2.1.4 line)

Genericise cloud formation out of code into rule-pack data, following
`architecture-physics-tags-visuals.md`. Replaces five hardcoded tables and two magic numbers
scattered over three files, and is the root fix for the Mars borderline-clouds bug class.

## Data model

**Gas** (`gasPhysics`, optional blocks — absence = not cloud-forming / not a reaction product):

```json
"H2O":   { "cloud": { "condensesTo": "water", "minFraction": 0.001 } },
"NH4SH": { "colorHex": "#b8845a",
           "reaction": { "from": ["NH3", "H2S"] },
           "cloud": { "condensesTo": "ammonium-hydrosulfide", "minFraction": 0.0001 } }
```

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
4. Snow-out: condensable at the SURFACE too ⇒ precipitates, no deck (hands off to volatile
   retention/frost). Deck requires condensable-aloft but not at ground.
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
- **E6 giants sequenced separately:** terrestrials first (giants keep the legacy ramp), then
  giants swap onto the deck stack in their own commit with Jupiter/Saturn/Uranus/Neptune
  fixtures (NH3 over NH4SH over H2O; same-but-deeper for Saturn; CH4-topped ice giants).
- **E8 legacy values:** old saves' cloud-deck tags held a colour word ("white"); auto tags
  self-heal on reprocess, manual tags parse leniently (unknown species ⇒ re-emit).
- **E10 display blind spot:** the atmosphere summary hides gases <0.5%, which hid Mars's
  0.1% deck-driving water — always show a gas currently driving a deck.

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
