# Composition editor redesign — anchored composition, envelope bars, small bodies

Status: AGREED design (2026-07-16); stages 1-3 implemented, then REVISED after review
(see section 11) — the hardcoded preset row is replaced by a classifier-driven type list.
Scope: the body editor's Composition tab (planets/moons path), the makeup physics,
the classifier's interaction with editing, and small-body (asteroid/comet) support
down through the renderer.

## 1. Problem

Editing Radius/Mass/Density feels like the app "snatches control". Three distinct
mechanisms cause it (none of them is the classifier moving sliders):

1. **Radius/density edits silently rewrite composition.** `editRadius`/`editDensity`
   (`src/lib/physics/bodyEdit.ts`) hold mass and re-infer `makeup` from the new
   geometric density (`makeupForGeomDensity`). The user's chosen mix is overwritten
   as a side effect of a size tweak.
2. **Every composition-panel edit re-arms `autoClassify`** (`commit()` in
   `BodyBasicsTab.svelte`). The next reprocess may then relabel the Type *and swap
   the body image*, even over a hand-pinned class. Slider positions do not move,
   but the body's identity changes.
3. **2 degrees of freedom across 3 sliders, no feedback.** With
   `rho = 5.513 * M / R^3`, one slider always drags another and nothing shows
   which, why, or where a type boundary sits.

## 2. Design principle: composition is the anchor

For a fixed composition, mass alone determines radius and density (self-compression).
The one genuinely independent physical parameter missing from the model is
**porosity** for solids (macro-voids; rubble piles are underdense because of voids,
not exotic composition). Gas bodies already have the analogous parameter:
**thermal inflation** (`gasThermalInflationFactor`, `makeup.ts`).

New model:

```
composition (anchor)  +  mass (primary)  +  trim (porosity | inflation)
        -> radius & density (derived, within a physical band)
```

- **Presets set the makeup anchor.** After that, composition never changes silently.
- **Mass drag**: radius/density follow the composition's mass–radius curve.
- **Radius or density drag**: adjusts the *trim* within the composition's band.
  Density and radius remain visible, directly draggable sliders — they just move
  the honest free parameter instead of rewriting makeup.
- **Makeup sliders / presets**: as today (radius held, mass re-derived), but now
  they are the ONLY way composition changes.

### Porosity physics (makeup.ts)

Extend `compressionFactor` (currently `1 + 0.67*(1 - e^(-M/0.8))`, floor 1.0) with a
porosity term for non-gas-dominated bodies:

```
effectiveDensity = bulkDensity * compression(M) * (1 - porosity)
```

- `porosity` in [0, maxPorosity(M)]: mass-dependent ceiling — self-gravity crushes
  voids. Roughly: up to ~0.5 below ~1e-8 Me (few-km rubble), tapering to ~0 above
  ~1e-3 Me (Ceres-ish, hydrostatic). Smooth curve, not a step.
- Stored on the body as `porosity?: number` (0 default). Serialises like any other
  optional field; older saves unaffected.
- Gas-dominated bodies ignore porosity; their trim is the existing inflation factor
  (exposed on the same slider semantics).

## 3. Envelope bars (the user feedback)

Over the radius and density sliders, render a highlighted band = the allowable range
for the CURRENT composition at the CURRENT mass:

- density band: `[bulk*compression*(1-maxPorosity), bulk*compression]` intersected
  with the preset's declared band (`COMPOSITION_PRESETS[].band`);
- radius band: the same limits pushed through `R = cbrt(5.513*M/rho)`.

Inside the band: nothing flips — type, image and composition all stay. The bars are
read from the real physics/preset data, not hand-authored.

### Crossing the edge — flow-through with feedback (AGREED)

A drag may continue past the band edge. When it does:

- the neighbouring preset's band lights up on the slider;
- a transition chip appears ("→ becomes Ice giant");
- makeup morphs toward the neighbouring preset's mix only while OUTSIDE the band
  (this is the one remaining case where a size slider changes composition, and it
  is explicit and announced);
- the class change commits on slider RELEASE, never mid-drag.

Rejected alternative: hard-stop at the edge requiring an explicit preset click —
safer but makes exploring the space clunky.

## 4. Classification during editing

- `commit()` STOPS setting `autoClassify = true`. Slider edits keep whatever
  classify mode the body already has; a pinned type stays pinned.
- The classifier runs *advisory* during editing: the panel shows a small
  "physics reads this as: X" line (data already available via
  `body.classification` / `explainClassification`).
- The flow-through transition (3 above) is what changes `classes` from the editor,
  on release. Bodies with `autoClassify === true` (generated, untouched) behave as
  today.

## 5. Presets

Gas is NOT split further (hot/puffy is temperature-driven; inflation covers it).
Additions are the low-mass solid family:

| Preset | Makeup | Default trim | Band (g/cc) |
|---|---|---|---|
| Rubble pile | rock 0.75, metal 0.10, carbon 0.15 | porosity ~0.35 | 1.0 – 3.0 |
| Comet | ice 0.55, carbon 0.25, rock 0.20 | porosity ~0.4 | 0.3 – 1.5 |

Existing presets double as asteroid spectral classes at low mass — no new buttons:
C-type = Carbon, S-type = Rocky, M-type = Iron-rich.

Rubble pile is BOTH a preset and an auto-derived classification (AGREED): the
classifier also tags any sufficiently porous low-mass body as a rubble pile
however it was built.

## 6. Small-body floors

- Planet/moon editor + `bodyEdit` clamps: mass floor 1e-4 Me -> **1e-12 Me**
  (~6e12 kg, small comet); radius floor 0.02 Re -> **~5e-5 Re** (~0.3 km); density
  floor stays 0.05 g/cc. Sliders are already log-mapped so the bottom end remains
  finely tunable; typed values already bypass slider granularity.
- Physics verified to survive tiny masses (`makeupFractions` guards zero mass;
  classification bands handle it); only the clamps block them today.

## 7. Classifier additions (classification.json)

New fingerprints in the existing MEAN-fit system, keyed on makeup fractions +
mass band (< ~1e-4 Me) + porosity:

- `asteroid/c-type` (carbon-dominant), `asteroid/s-type` (rock-dominant),
  `asteroid/m-type` (metal-dominant), `asteroid/comet` (ice-dominant);
- `asteroid/rubble-pile` as a modifier (high porosity, low mass);
- existing `planet/planetesimal` / `planet/dwarf-planet` bands adjusted so the
  asteroid classes win below their mass range instead of everything collapsing
  into planetesimal.

Tag vocabulary gains the matching entries so Find-by-tag can search them.

## 8. Renderer

- `PlanetDisc.svelte`: when classed asteroid/comet/rubble-pile (or radius below
  ~300 km), replace the `circle r=30` with a **seeded irregular polygon** —
  deterministic LCG seeded from `body.id`, the same idiom as the belt-rock and
  crater generators, so each body keeps a repeatable shape. Oblate squash and the
  existing clip/crater layers wrap it unchanged.
- Colour continues to come from `apparentColorHex` (already derived from makeup):
  C-types render dark, S-types stony, M-types metallic, comets icy, for free.
- Theme imagery: gallery images for asteroid classes to be added separately
  (photo themes); The Guide theme uses the procedural disc.

## 9. Cross-section diagram

A small layered SVG disc beside the makeup sliders, computed from makeup + porosity:
metal core, rock mantle, ice shell, gas envelope, void speckle when porous.
Purely presentational; makes the coupling legible while dragging.

## 10. Implementation stages (separate commits)

1. **Engine**: porosity in `makeup.ts` + new trim-based `editRadius`/`editDensity`
   in `bodyEdit.ts` + envelope-band computation helpers + unit tests.
2. **UI**: `BodyBasicsTab` — bars over sliders, transition chip, advisory
   classification line, stop re-arming `autoClassify`, new presets, floor drop.
3. **Classifier**: asteroid fingerprints + tags + tests (fixture: Ceres, Bennu-ish
   rubble pile, 67P-ish comet, 16 Psyche-ish M-type).
4. **Renderer**: PlanetDisc irregular shapes + cross-section component.

Gate per stage: `npx vitest run` + `npm run build` (svelte-check is not a gate —
pre-existing errors).

## 11. REVISION (agreed 2026-07-16, after stages 1-3): roll the classifier in

Direction from review: the preset row should BE the classifier. The fingerprints already
carry mass/radius/density bands per type — use them as the band source instead of
hand-authored preset envelopes, and give the GM direct type selection:

- **The "Composition preset" row becomes a "Planet type" list**: every base fingerprint
  whose mass band admits the CURRENT mass (the "picker under mass", generalised), ranked
  by the classifier's own candidate score against the full current state. Types that fit
  now render bright; types reachable at this mass (but needing radius/density moved)
  render dim.
- **Clicking a type pins it** (`classes[0]` + `autoClassify = false` + type image),
  **sliders do not move**, and that type's fingerprint bands (mass_Me / radius_Re /
  density) appear as accent-coloured range bands on the three sliders. The GM tunes
  into the bands to realise the type; the "physics reads:" advisory tracks agreement.
- The thin green trim tick (this mix's physical envelope) stays as a secondary marker.
- The hardcoded `COMPOSITION_PRESETS` buttons are removed from the UI (the engine
  presets remain for tests/generation). Composition is set via the makeup sliders.
- **Typed values are respected**: number boxes apply on change (Enter/blur), never
  per keystroke — a typed value must survive exactly, not be fought by re-derivation.
