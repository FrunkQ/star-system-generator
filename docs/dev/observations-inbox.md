# Observations inbox

Raw observations land here as they are noticed, get triaged, and are handed to a worker session as a
grounded prompt. This file is the source of truth between sessions — an item that is only in a chat
transcript is an item that will be lost.

**How to use it.** Add anything to CAPTURED, however rough, without stopping to diagnose. Triage moves an
item into a bucket with a verdict. When a bucket is worth a session, a prompt is written from it and the
items are marked with the version that fixed them.

**Status vocabulary:** `captured` (raw) · `triaged` (understood, not started) · `assigned` (a session has
it) · `fixed vX.Y.Z` · `wont-fix` (with the reason).

Last triage: 2026-07-30, at v2.1.283-beta.

---

## A — UI bugs (self-contained, no physics)

| # | Observation | Status |
|---|---|---|
| A1 | Headers/footers break when the window is resized in the player catalogue view. Screenshot exists. Suspected same class as the earlier HUD re-measure bug: a canvas sized against a stale viewport. | triaged |
| A2 | Player-view construct panel is anaemic — Blip-A shows Type / Orbit distance / Atmosphere, i.e. BODY fields, while the data holds crew, engines, fuel tanks, cargo and delta-v. Constructs need their own block in the document / DocPanel builder. | triaged |

| A4 | **GM starmap labels grow with zoom.** System-name font should stay a constant screen size as you zoom, not scale with the map transform. `Starmap.svelte` — the labels are inside the world transform, so they scale with it. Same class as the depth-label and route-label text. (Compare: the 3D starmap uses sprites with an explicit `setLabelSize`, which is why it does not have this.) | captured |

## F — Player Views: preset editor (one batch, 2026-07-30)

All from a single pass over the preset editor. Several may share a root — F4/F5 are both "the preview
re-frames when it should not", F2/F3 are both "true-scale mode breaks proportion".

| # | Observation | Status |
|---|---|---|
| F1 | **Body graphics were being drawn on the SYSTEM MAP itself. They must NEVER be.** Body graphics (photo / disc / sphere) are for the INFO BLOCK only; the map always uses the 2D or 3D render. This was stated once before during the D5/E2 work and fixed for the 3D list — so this is either a regression or the fix never covered 2D. **Highest priority in this bucket: it is a rule, not a preference.** Cause of the recurrence: the earlier fix (f947826) forced sphere for `holo3d` only and deliberately LEFT the control on the 2D map, because a flat body sprite was then considered a legitimate 2D-map look. Fixed at the source instead — `bodyGfx` is gone from `HoloStyle` and from the scene entirely (type, setter, render branch, `buildBodyDisc`), so no map style can carry one. | fixed v2.1.286-beta |
| F2 | At TRUE scale, the "glow" points are far too large and do not stay in proportion to the orbit lines — an oversaturated field of giant blobs. Probably affects 3D as well as 2D. | captured |
| F3 | Same at true scale for RINGS and BELTS — they lose proportion when zoomed to actual sizes rather than readable sizes. Likely the same root as F2: a minimum-size floor that is right for readable mode and wrong for true scale. | captured |
| F4 | Changing a general setting (e.g. belt type) re-zooms the preview to the star. Appearance settings should never move the camera. | captured |
| F5 | "Frame whole system (never zoom to a body)" did not show the whole system in the preview. | captured |
| F6 | 2D low-poly / wireframe render styles apply to the STAR but not to the bodies. Same root as F1: those styles only exist on the sphere path, and the 2D map's bodies were flat sprites. The star is never a sprite, which is why it alone obeyed. | fixed v2.1.286-beta |
| F7 | Body Graphics → photo: nothing appears in the preview until you leave the tab and come back. | captured |
| F8 | Info-block appearance settings were tested on 2D — but the info block is meant to be ONE shared 2D/3D component (D6 unified them onto `DocPanel`). Verify the settings reach both, and that there is still only one builder. | captured |
| F9 | The selected font COLOUR should carry through to the headings in the info box, **including Rainbow**. Rainbow headings were built for the document engine (v2.1.266) — they appear not to have reached `DocPanel`. | captured |
| F10 | The info-panel WIDTH slider should show its effect live as you drag, and should read as a percentage of the screen rather than a raw pixel count. | captured |
| F11 | **FEATURE, not a bug.** Pin the info panel to top / bottom / left / right to change the look and feel, with the view sliding to re-frame around it the way it already does when the panel appears. | captured, feature |

## B — Physics engine (needs someone holding that context)

| # | Observation | Status |
|---|---|---|
| B1 | `albedo.ts` derives its OWN clouds (`CONDENSE_BOIL`, `teqK < boil * 1.6`) while `cloudDecks.ts` is documented as "THE single evaluation". They disagree on Adrian: albedo declares a CO2 deck, the column physics reports none. The crude model is UPSTREAM of everything. **Circular** — albedo → Teq → profile → decks → albedo. | fixed v2.1.282-beta |
| B2 | Greenhouse looks strong: Adrian +337 K from 8 bar CO2, vs Venus +505 K from 92 bar. Checked while fixing B1: **not downstream of it.** Adrian's greenhouse is +336.8 K before AND after — B1 moved the Teq underneath it (246 → 304 K), not the greenhouse term. The ratio is the model's own shape: forcing goes as `log(1 + sqrt(100·pp))`, then the response is `log` again, so partial pressure enters twice-logarithmically and saturates hard (Adrian pp 7.3 → 3.33, Venus pp 88.8 → 4.56, a ratio of 0.73 on 8.7% of the pressure). `broadening = min(1, sqrt(P))` is also pinned at 1 for anything over 1 bar, so it distinguishes nothing above that. Then CHECKED against every anchor the Solar System offers, not just Venus: Mars 0.006 bar +5.8 K (measured 6), Earth 1.013 bar +32.8 (33), Titan 1.45 bar +14.1 (12), Venus 92 bar +523.6 (505). It hits all four across four orders of magnitude of pressure. There is no measurement anywhere near 8 bar, so the apparent anomaly is an intuition with nothing to check it against, and re-shaping the curve to satisfy it would put the four anchors it does hit at risk. **Recommend no change** unless a real anchor turns up. | wont-fix — model matches every anchor there is |
| B5 | Mars's surface albedo is 0.154 from rock + metal makeup alone; the measured Bond albedo is 0.25, because Mars is bright with ferric dust and polar caps. Exposed by B1: the bogus CO2 deck had been carrying Mars to 0.236, right for the wrong reason. Costs Mars its real 210 ppm water-ice wisp (it survives to Teq ≈ 214.5 K; Mars now sits at 216.7). Same class: Io 0.153 vs measured 0.63 (SO2 frost), Luna 0.15 vs 0.11, Mercury 0.169 vs 0.088. `deriveOxidation()` already grades the rust but reads `geoActivity.surfaceAgeGyr`, derived AFTER the thermal solve — so this needs the geology derivation moved too, or it reintroduces the one-pass lag v2.1.282 removed. **Plan when it gets a session:** it is a surface-albedo model, not a Mars patch — the measurements point three different ways at once. Bare rock wants to be DARKER than the current flat 0.15 (Mercury 0.088, Luna 0.11 — the model is too bright for both), while bodies with surface DEPOSITS want to be brighter (Mars 0.25 from ferric dust, Io 0.63 from SO2 frost). So: lower the bare-rock constant, then add brightening from the deposits the engine already derives — `surface/oxidised` for rust, frost/cap coverage for the rest. The blocker is ordering: everything that grades those deposits (`deriveOxidation`, `deriveGeoActivity`) runs after the thermal solve, and `deriveGeoActivity` itself takes `teqK`, so it cannot simply move — either the non-thermal part of geology splits out ahead of the solve, or surface deposits join the fixed point. Expect real classification movement; needs the same before/after diff B1 used. | triaged, planned |
| B3 | Classification keys on EQUILIBRIUM temperature, not surface — a 309 °C runaway greenhouse can be labelled "cold eyeball". The eyeball family is fixed: all three fingerprints describe the GROUND ("molten/dry dayside", "icy except the substellar point", "temperate oasis") and now match `SurfaceTemp_K`. Pinned by a test; no bundled body changed, because every star-locked world in the shipped maps is airless and its two temperatures agree. | fixed v2.1.283-beta |
| B6 | The REST of B3. 26 more fingerprints key on `Teq_K`, and they split cleanly in two. Types whose note describes the surface should follow the eyeballs to `SurfaceTemp_K`: desert, ice ("Frozen surface"), lava ("Molten surface"), ocean, methane, ammonia-planet, hycean, subsurface-ocean, earth-analogue, earth-like, superhabitable, forest, jungle, swamp. Types about the RADIATION ENVIRONMENT or a giant's cloud-top chemistry are right as they are: hot-jupiter, ultra-hot-jupiter, hot-neptune, ultra-hot-neptune, chthonian, ice-giant, ultra-cool-dwarf, and all five gas-giant cloud classes. Evidence the bands were authored as surface temperatures in the first place: earth-analogue wants Teq 255–300 and Earth's Teq is 254.1, just outside — its SURFACE is 287, mid-band. Not done here because it is ~14 fingerprints and would move real classifications; wants its own pass with a before/after diff. | triaged |
| B4 | The ice-shell rule (ices float → visible crust) has no temperature gate; it will paint an ice crust on a 582 K world. The makeup branch (`mk.ice > 0.3`) now also requires water to be SOLID at the surface T and P. Ice-rich interior and icy shell are different claims. Three bundled bodies lost a false `structure/icy-shell` (Lacaille 9352 c at 303 K, GJ 674 b at 488 K, GJ 876 d at 523 K); nothing else moved. | fixed v2.1.283-beta |

## C — Rendering / appearance

| # | Observation | Status |
|---|---|---|
| C1 | `condensateTint` (cloudDecks.ts ~165) pulls every deck to within 60/255 of white. Right for scattering droplets, wrong for a pigmented suspension — the ceiling is pastel for ANY deck, whatever the data says. Now `LiquidDef.cloudTintDistance`, rule-pack data with the old 60 as the default, so nothing shipped changes look unless its data says so. The physics is that a clean SCATTERER goes white however dark the liquid (water) while an ABSORBING suspension keeps its colour however finely divided (Jupiter's brown hydrosulphide, martian dust). Set on the five genuinely pigmented condensates. **No visible change on the bundled maps** — the only bodies carrying a pigmented deck are giants, and giants take their look from gas chemistry rather than the deck path (E6). It bites the moment someone authors one, or when giants join the deck stack. | fixed v2.1.283-beta |
| C2 | `planetAppearance.ts` resolves deck liquids via `liquidDef(species)` with NO rulepack argument, so a campaign's own custom liquids never reach the 3D deck renderer. Worked around by putting `taumoeba-bloom` / `iron-oxide-dust` in the global list. If custom liquids are a real authoring surface, this needs fixing. | triaged |

## D — Content / data

| # | Observation | Status |
|---|---|---|
| D1 | Adrian's green: the physics currently says nothing in its air condenses. Needs the Taumoeba fraction and the bloom's boil point tuned until a deck forms — DATA, not code. Blocked visually by C1 even once it does. | triaged |

## E — Known-not-ours

| # | Observation | Status |
|---|---|---|
| E1 | `src/routes/page.spec.ts` — 4 failures (jsdom cannot fetch a relative URL). Verified failing at 255768a via a detached worktree, so NOT from the v2.1.277 work despite being attributed there. Likely origin `371f649`. | triaged |

---

## Captured, not yet triaged

_(new observations go here — rough is fine)_

| # | Observation | Status |
|---|---|---|
| A3 | **Player view 2D loses every surface feature — Mars has no craters, Io no volcanism — while the GM view renders them correctly. DIAGNOSED, one line.** Both views mount the SAME `SystemVisualizer`. It draws plain canvas discs and only promotes a body to the feature-rich `PlanetDisc` SVG overlay (the one that consumes craters / lava / plumes / iceCracks) when `trueColorOn && sR >= DISC_OVERLAY_MIN_R` — `SystemVisualizer.svelte:1014`. `trueColorOn` reads the `trueColorMode` store, and that store is **only ever SET in `SystemView.svelte`**, the GM system view. The player route (`src/routes/catalogue/+page.svelte:1025`) mounts `SystemVisualizer` directly inside a `FilterFrame` and never goes through `SystemView` — so nothing sets the store, the promotion never fires, and every body is a flat disc. Nothing wrong with the tags or `deriveAppearance`. **The diagnosis above was for the LEGACY Field Guide skins, and it is not what was being looked at.** In a new Player View the 2D map is not `SystemVisualizer` at all — it is the holo scene locked overhead (`effectiveSystemTier` maps `diagram2d` to `holo`). The flat bodies were the body-graphics sprites of F1: Datapad stores `bodyGfx: 'photo'` and Console `'flat'`, and the sprite path drew a plain class-colour disc with no surface features. With F1 fixed, Mars in the Datapad player view renders fully cratered. No `trueColorMode` change was needed. **Still open, as a separate smaller thing (see A5):** the legacy console skin really does read a GM-local store, and `DISC_OVERLAY_MIN_R = 11` px still means nothing is promoted at whole-system zoom in the GM 2D orrery. | fixed v2.1.286-beta |
| D2 | **CORRECTED — narrower than first written. Craters and volcanism DO auto-spawn on the new worlds; only the air-and-water features cannot.** The first version of this entry claimed the 22 rebuilt systems "can't accumulate surface features because the inputs aren't there". That is wrong for the geological ones: `craterDensity` reads `ageDensity = surfaceAgeGyr / 4.5`, and `surfaceAgeGyr` is DERIVED by `geoActivity` from mass, makeup and system age — all of which a bare `massKg + radiusKm + makeup` body has. Volcanism/lava comes off the geology regime and tidal heat, likewise derived. So those bodies will crater and resurface correctly the moment A3 is fixed. What genuinely cannot appear without authored data: **clouds and haze** (need `atmosphere`), **oceans and ice caps** (need `hydrosphere`), **banding** (needs `rotation_period_hours` — `bandCount()` reads it directly). Original observation below, kept for the survey numbers. | corrected, captured |
| D2a | **Original text (survey still valid, conclusion superseded by D2 above).** Sol's bodies carry 35+ authored fields (`atmosphere`, `hydrosphere`, `biosphere`, `rotation_period_hours`, `axial_tilt_deg`, `magneticField`, `image`, `areas`…). Tau Ceti f/g/h carry FOUR: `massKg, radiusKm, makeup, tags`. Across the 22 systems added in the rebuild, 93% have `makeup` and 0% have atmosphere, hydrosphere or rotation period. So there is nothing for the appearance pipeline to work with — no atmosphere means no clouds/haze/greenhouse, no `rotation_period_hours` means `bandCount()` gives no banding, no hydrosphere means no oceans or caps. **Not a rendering bug**; the renderer is correctly drawing "almost nothing is known". And the data is honest — nobody has measured Tau Ceti f's air. **The question is what a GENERATOR should do about it.** The engine already infers a lot from nothing (makeup from density, classification, temperature, `tidallyLocked` from the despinning timescale). Rotation period is the obvious next inference — a locked body's period is known outright, an unlocked one can take a plausible primordial spin. Atmosphere is harder but volatile retention already gates what a world can hold at its mass and temperature. **Hard constraint if this is built: inferred must be distinguishable from measured** — a tag saying so — or the map starts quietly asserting invented facts about real planets, which is worse than looking plain. Alex noticed via Tau Ceti; Sol looks fine because Sol has been visited. | captured |

---

## Standing rules any worker session must follow

- **Physics and data drive tags; tags drive the image.** Do not add rendering code to make something look a
  particular way. If a look needs a new lever, the lever is rule-pack DATA.
- `tests/fixtures/solar-system-input.json` and `tests/output/solar-system-derived.json` are GENERATED by
  `physics-baseline.test.ts` on every `vitest run`. Never hand-edit; expect churn; last runner wins.
- Commit as **FrunkQ <frunk@frunk.net>**, never ac@epsis.com.
- `npm run build` must be green before any push — svelte-check alone is not enough (runes-mode issues pass
  dev and fail the vite build).
- Bump the patch version every push. `beta` auto-pushes on a green build; production needs explicit approval.
- Stage explicit files, never `git add -A` — parallel sessions share this tree.
- UK English in UI, docs and new code. No emoji in docs. No personal names in shipped files.
