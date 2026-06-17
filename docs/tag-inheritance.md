# Tag inheritance — definitions confer tags, entities inherit them

Status: **DESIGN / agreed direction (Alex, 2026-06-17), not yet built.**

## The idea
Tags need not all be hand-set (CoI) or physics-derived (PoI). A **definition** — an atmosphere gas, a
fuel, an engine — can **declare the tags it confers**, and any **entity** that contains or uses that
definition **inherits** those tags. This ties the tag vocabulary directly to the *tech and chemistry a thing
is actually made of*, and it's a third way (besides hand-set and physics-derived) that a construct or body
gets tags.

Inherited tags are **derived** (computed, not stored, not hand-removable), exactly like PoI tags. A thing's
effective tag set = hand-set CoI ∪ physics-derived PoI ∪ **inherited-from-definitions**.

## The three channels

| Definition | Confers | Inherited by | Example |
|---|---|---|---|
| **Atmosphere gas** (`atmospheres.json`) | `resource/*` | **Bodies** (if the atmosphere contains it above a threshold) | Ar/Kr/Xe → `resource/noble-gases`; O₂ → `resource/oxidizer`; CH₄ → `resource/hydrocarbons`; He → `resource/helium-3`; H₂O → `resource/water-ice` |
| **Fuel** (`fuel-definitions.json`) | `resource/*` (its source) + an availability class | **Constructs** (via their fuel tanks — what it burns / can source) | `fuel-helium3` → `resource/helium-3`; `fuel-xenon` → `resource/noble-gases`; `fuel-exotic-matter` → `resource/exotic-matter` |
| **Engine** (`engine-definitions.json`) | `drive/*` | **Constructs** (via their engines) | `engine-fusion-epstein` → `drive/torch`; `engine-warp-drive` → `drive/warp`; chemical/ion/NTR/pulse → `drive/sublight` |

This **full-circles fuel sourcing**: a gas-giant atmosphere (H₂/He) confers resource tags → those resources
source fuels (hydrogen, helium-3) → a ship burning those fuels knows where it can refuel. The abstract fuel
names resolve to definite `resource/*` tags that real places carry.

## Concrete mappings

### Engine → drive (a construct's drive = the most capable among its engines: warp > torch > sublight)
- `engine-fusion-epstein` → `drive/torch`
- `engine-antimatter-beam` → `drive/torch` (relativistic torch)
- `engine-warp-drive` → `drive/warp`
- `engine-chemical-methalox`, `-metallic`, `-ntr-solid`, `-ntr-gas`, `-orion-pulse`, `-ion-gridded`, `-vasimr`, `-rcs-hydrazine` → `drive/sublight`

### Fuel → source resource + availability
Each fuel already links its engine (`fuel_type_id`). Add the source + class:
- **common** (any `service/refuel` stocks it): hydrazine→`volatiles`, methalox→`hydrocarbons`+`oxidizer`,
  hydrogen→`water-ice`, water→`water-ice`, xenon→`noble-gases`, argon→`noble-gases`, uranium→`fissiles`,
  fusion-dt→`deuterium`, helium3→`helium-3`.
- **manufactured** (needs a factory/shipyard + the raw): pulse-units→`fissiles`, metallic-hydrogen→hydrogen.
- **exotic** (only where its own resource tag is present): antimatter→`resource/antimatter`,
  exotic-matter→`resource/exotic-matter`.

### Atmosphere gas → resource (Alex's examples: Argon, Krypton, Oxygen)
O₂→`oxidizer`; Ar/Kr/Xe/Ne→`noble-gases`; CH₄→`hydrocarbons`; CO₂/NH₃→`volatiles`; He→`helium-3`;
H₂O→`water-ice`. A body inherits the tag if the gas is present above a small threshold.

**The gas PERCENTAGE rides along, and sets extraction time.** The inherited resource tag carries the gas's
abundance (its % of the atmosphere), so a trace gas (0.9 % Argon) extracts slowly and an abundant one fast.
This is the same **abundance × rate ⇒ time** shape as mining ore (source richness × ship rate ⇒ dwell), and
it feeds the autopilot dwell model: `extraction_time = amount ÷ (ship_extraction_rate × gas_fraction)`. So a
gas-skimmer parked at a He-3-rich gas giant fills fast; at a trace source it loiters. The abundance is a value
on the inherited tag (alongside the precedent of `tardiness` on Owner, `readiness` on Status, and the planned
`rate` on Service tags) — values-on-tags is now the consistent pattern for "anything that takes time".

## Rules / decisions
- **Two new resources** to make every fuel sourceable: `resource/noble-gases`, `resource/antimatter`.
- **Antimatter is MANUAL-ONLY** (Alex): never auto-generated (0 % on the rarity/generation sliders); a GM
  hand-adds it to a high-end starport. So there is **no PoI generation rule** for `resource/antimatter`.
- **Fusion power ⇒ He-3** (Alex): a fusion power plant implies a He-3 (or D-T) association — a softer
  power-plant→resource link (power-plant `type` is free text, so map known fusion types).
- **Inheritance reduces hand-tagging:** the `drive/*` baked on the ship templates can be **dropped** — derived
  from their engines instead; likewise the FTL Explorer's `resource/exotic-matter` comes from its warp fuel.

## Resolvers (derive, don't store)
- **Body** ← atmosphere: `SystemProcessor` adds inherited `resource/*` from the atmosphere composition
  (alongside the existing atmosphere flat-tag pass).
- **Construct** ← hardware: a resolver adds the `drive/*` (best engine) and surfaces fuel/resource needs from
  fuel tanks. Cheap, runs where tags are read.

## UI — one consistent pattern
"Attach a resource tag (or tags) to any gas/fuel, and a drive tag to any engine." A single editor idiom in
the rulepack/tech editors (Settings) — the tag becomes a property of the tech. Editing the definition
re-derives every entity that uses it.

## Resource reconciliation — atmosphere (deterministic) vs ground (prospect) — DONE v2.0.166
Key constraint found: `annotateReasonsToVisit` **clears + owns the `resource/*` namespace** (strips all
non-manual resource tags, then re-derives), so atmosphere resources can't be added in an earlier pass —
they'd be wiped. Resolution (Alex 2026-06-17):
- **Atmosphere-present resources are DETERMINISTIC (chance 1.0)** — the gas is measurably there, so the
  resource certainly is. Seeded by `applyAtmosphereResources` in SystemProcessor **right after** the reasons
  pass, from the gas `resourceTags` + composition, carrying the gas % as abundance.
- **Ground / subsurface resources stay SEMI-RANDOM PoI rules** (metals, fissiles, diamonds…) — a prospecting
  gamble, where the PoI rule is the only seeder.
- The duplicate atmosphere chance-rules were **removed** (O₂→oxidizer, giant→He-3, CH₄-atmosphere→
  hydrocarbons); the deterministic pass owns those. De-dup: an existing key (e.g. water-ice from surface ice)
  is **enriched** with abundance/provenance, not duplicated.
- **Provenance** (`Tag.source`): atmosphere tags carry `source:'atmosphere'`; rule tags carry
  `source:'rule:<id>'`. Drives the planned mouseover ("where did this resource come from?").

**Still TODO (UI):** the provenance **mouseover** display on a resource chip; and the per-rule **auto-seed
toggle** in Edit Rule (chance 1.0 = always/deterministic, 0–1 = random, OFF = manual-only), highlighting
which resource rules are deterministic vs random vs manual.

## Build sequence
1. Add `resource/noble-gases` + `resource/antimatter` to the CoI Resources category (antimatter: no gen rule).
2. Add the tag fields to the three definition files (gas→resource, fuel→resource+availability, engine→drive).
3. Inheritance resolvers (body←atmosphere; construct←engines/fuels).
4. Drop the now-derived hand-set tags from the templates.
5. UI: the attach-tag editors for gases / fuels / engines.
6. (Separately) the Purpose→Role+Services split with per-Service `rate` values; the cargo manifest+mass field.
