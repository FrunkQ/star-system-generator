# Geo foundations — activity ladder, volatile retention, surface age, irradiation

Status: DESIGN (2026-07-18). Physics-first foundations for the banked "make bodies more
convincing" appearance backlog in `v2.2-player-view-visual-overhaul.md`. Nothing here is a visual
feature; this defines the four derived quantities every one of those features consumes, so each
lands later as a pure consumer of physics rather than a hand-tuned effect.

Guiding rule (the whole point): **generalised natural physics only**. Four continuous quantities,
all derived from inputs the engine already has (mass, radius, composition, orbit, system age, star,
magnetosphere) — no per-feature dials, no per-body authoring. A generated system grows Plutos and
Europas because the physics says so.

---

## Current state (grounded)

| Piece | Where | State |
| --- | --- | --- |
| Geothermal vigor (radiogenic + age decay + size cooling, Earth ≈ 1) | `physics/geoActivity.ts` `geothermalVigor()` | DONE, calibrated |
| Mechanism regimes: plate-tectonics / stagnant-lid / tidal-volcanic / cryovolcanic / inactive | `deriveGeoActivity()` | DONE — `mobile` and `stagnant-lid` from the wish-list already exist under these names |
| Per-species thermal (Jeans) escape, λ = GMm/RkT | `physics/atmosphere.ts` `applyAtmosphericEscape()` | DONE for atmospheres |
| Pressure-phase model per substance (triple/critical points, sublimation) | `physics/liquids.ts`, `fluidLayers.ts` | DONE (liquids overhaul, v2.1.123–125) |
| Tidal heat (numeric `tidalHeatK`), resonance pumping | classifier + `geoActivity` inputs | DONE |
| Stellar radiation components, magnetosphere shielding | `physics/radiation.ts`, `magnetism.ts` | DONE |
| Frozen-former-ocean signal | `fluidLayers` / hydrosphere state | Partially — state exists, "history" reading defined below |

`deriveGeoActivity` is called from one place (`core/SystemProcessor.ts:712`), so the expansion is a
single-seam change.

---

## Foundation 1 — the activity LADDER (unlocks `plutonic` + `episodic`)

Today the radiogenic path is binary: `vigor < 0.35 → inactive`, else water picks
plate-tectonics vs stagnant-lid. Venus's "episodic catastrophic resurfacing" is only a note string.

Replace the binary with a graded ladder over the SAME continuous vigor (no new physics inputs):

```
vigor < 0.35            → inactive        (Moon, Mars today)
0.35 ≤ vigor < 0.60     → plutonic        (melt at depth, too little to erupt: intrusive only —
                                           dykes/batholiths, no surface volcanism, slow resurfacing)
0.60 ≤ vigor, dry       → stagnant-lid    (Venus band, quiet phase)
      vigor ≥ ~1.3, dry → episodic        (heat builds under the rigid dry lid until catastrophic
                                           global resurfacing — Venus's ~700 Myr cycle, promoted
                                           from a note to a real regime)
0.60 ≤ vigor, wet       → plate-tectonics (mobile lid; unchanged)
```

- New `TectonicRegime` members: `'plutonic' | 'episodic'`; new `VolcanismStyle`: `'intrusive'`.
- Tags follow the pattern: `geology/plutonic`, `geology/episodic` (value = vigor), with Newton
  notes explaining the mechanism as the existing branches do.
- Tidal/resonance/solar-seasonal branches are untouched — they already precede the radiogenic path.
- Thresholds calibrated on anchors (below), and asserted in tests so drift is caught.

Nothing downstream breaks: `active` stays `regime !== 'inactive'` (plutonic counts as active —
its heat is real), and every existing regime keeps its name.

## Foundation 2 — volatile-ice RETENTION, per species  ✅ SHIPPED (v2.1.165-beta)

Built as `physics/volatileRetention.ts`. Final model = three gates per species:
- **(0) Availability** — a body must HAVE the species before it can keep it (the refinement that
  stops a desiccated Io being frosted with water): condensed volatiles (water, N2, CH4, CO2) require
  an ice inventory (`makeup.ice > 0.05 || icyShell || hydrosphere`); SO2 requires active silicate
  volcanism (`regime === 'tidal-volcanic'`, Io's plume-sourced frost).
- **(1) Cold trap** — `surfaceTempK < meltK` (solid at all), from the liquids phase data.
- **(2) Gravity trap** — Jeans `λ = G·M·μ/(R·R_gas·T_esc) ≥ LAM_RETAIN` (15), with
  `T_esc = max(2·Teq, 50)` — deliberately NOT the 800 K near-star XUV floor, which would strip cold
  Kuiper ices. Fixed threshold at present age (age term = future refinement).

Result on the real solar system (baseline): Io → SO2; Europa/Ganymede/Callisto/Titan → CO2+water;
Pluto/Triton → CO2+N2+water+CH4. Emits `volatiles/ices` tag (value = species list) + Newton panel.
Mars gets nothing (bulk ice <5%; its polar caps are below our global-surface resolution, same as
Luna) — accepted. Ammonia dropped from the set (rarely a standalone surface ice; lives as
water-ammonia cryo). 8 anchor tests. `body.volatiles = { retained, lambda }`.

### Original design notes

Question answered: "can this body hold surface ice of species X?" for X in
N2, CH4, CO, CO2, SO2, NH3, H2O — the species the liquids model already defines.

A species is RETAINED when both hold at the body's surface temperature range:

1. **Cold trap** — the surface temperature keeps the species' sublimation vapour pressure
   negligible (from the existing per-substance phase data: below the sublimation curve by a
   margin, using `temperatureRangeK.max` so a body that bakes at perihelion loses the ice).
2. **Gravity trap** — sublimated vapour is recaptured rather than lost: Jeans λ for the species'
   molar mass at the surface (exobase-approximate) temperature is above the retention threshold —
   the same λ machinery `applyAtmosphericEscape` uses, pointed at ice-sourced vapour.

Output: `volatiles.retained: string[]` on the body (derived, like `geoActivity`), plus a tag
`volatiles/ices` whose value lists the retained species. The existing `volatile/sublimating` tag
(comets) is the complementary failure case and stays as-is.

Anchors: Pluto/Triton retain N2 + CH4 + CO; Titan retains CH4 (and has the atmosphere); Callisto/
Ganymede retain H2O only; Luna and Mercury retain nothing (polar-crater cold traps are below our
resolution — acceptable); Io retains SO2 (frost) but not H2O at the sub-solar point — SO2's curve
and Io's temperature range make that fall out naturally.

## Generation / classification fit (analysis 2026-07-19) — decision: leave gen ORGANIC

Do the two shipped foundations get the inputs they need from the current generator, with NO data
edits? Grounded audit verdict:
- **Solar data: no update needed.** The baseline runs the existing `solar-system-input.json` and the
  tags fire correctly (Io→SO2, Galileans→CO2+water, Pluto/Triton→CO2+N2+water+CH4, Venus→episodic).
  All derived from mass/radius/orbit/makeup already present.
- **Dry-episodic worlds: occur naturally AND reliably.** The `desert` class + dry inner terrestrials
  give dry ~Earth-mass vigor-≥0.7 bodies → episodic; smaller/older dry rockies → plutonic. No tweak.
- **Cold-icy-volatile worlds: occur naturally but NOT reliably.** Single-star limit = CO-ice-line×2
  (T_eq→~20–30 K) and cold ice worlds / icy moons / dwarf planets are offered there, so CO2+water
  fire on any cold icy body and N2/CH4 on massive-enough cold carriers — but which system gets a
  Pluto-analog is a rarity-weighted draw (luck), not guaranteed.
- **Classification: mostly covered.** Cold/icy classes exist (`planet/ice`, `methane`, `ice-giant`,
  `dwarf-planet`, `subsurface-ocean`, `cold-eyeball`, `comet`). Gap: no single class pins BOTH cold
  placement AND bulk-ice makeup for a KBO (`dwarf-planet` has neither Teq nor ice-makeup band; only
  `comet` bands on `makeup.ice`) — a KBO's iciness is emergent via density inference. No dedicated
  Venus/stagnant class (Venus reads `desert`), which is fine — regime is separate from class.

**Decision (Alex, 2026-07-19): leave generation organic** — cold-icy worlds appear at natural
frequency; revisit only if playtesting shows them too rare. BANKED robustness tweaks if wanted later:
(1) give `planet/ice` + `dwarf-planet` an explicit `makeup.ice` band (mirror `comet` at
classification.json:365) so a KBO is authentically icy, not luck-of-density; (2) bias outer typed
slots toward ice-bearing types / guarantee an outer giant (its icy moons carry the ices);
(3) optionally raise the 40 AU multi-star slot cap for N2/CH4 in binaries.

## Foundation 3 — SURFACE AGE  ✅ SHIPPED (v2.1.166-beta)

`deriveSurfaceAgeGyr(regime, vigor, systemAge)` in geoActivity.ts, stamped onto `geoActivity.surfaceAgeGyr`
+ a coarse `surface/age` tag (young/moderate/old/ancient) + Newton output. Active regimes read the
resurfacing timescale below (capped at system age); a dead world inverts the age-decay to recover
when vigor last crossed the active threshold. Baseline results are spot-on: Venus 0.70, Earth 0.20,
Io 0.002, Europa/Triton/Enceladus 0.05, Mars 3.85 (died early), Callisto/Luna/Mercury 4.60 Gyr.

### Original design notes

The quantity cratering, cracking and tholins all secretly need: how long has this surface been
exposed? Derived, not stored: each regime implies a resurfacing timescale, capped by system age.

```
plate-tectonics  → ~0.2 Gyr   (Earth's ocean floor)
episodic         → ~0.7 Gyr   (mid-cycle Venus)
tidal-volcanic   → ~0.001 Gyr (Io repaves constantly)
cryovolcanic     → ~0.05 Gyr  (Europa/Enceladus)
plutonic         → ~2 Gyr     (slow intrusive renewal)
stagnant-lid     → ~1 Gyr
inactive         → min(system age, time since activity ceased)
```

For `inactive` the interesting refinement is free: `geothermalVigor` is invertible in age, so we
can solve for WHEN vigor crossed below the active threshold — Mars's surface age comes out ~3.5+
Gyr because it died early, while a recently-dead larger world reads younger. Emitted as
`surface/age` (value in Gyr) + a Newton note showing the working.

Impact-flux modifier (coarse, optional in v1): proximity to a belt or a crowded region scales the
crater DENSITY for a given age; default 1 keeps it honest without orbital analysis.

## Foundation 4 — IRRADIATION DOSE

Tholin chemistry needs total high-energy exposure: dose = (stellar UV at the body's orbit from
`radiation.ts` + a cosmic-ray floor so far-out bodies still tholinise) × (1 − magnetosphere
shielding, and × parent shielding for a moon inside a giant's magnetosphere) × surface age
(Foundation 3). Emitted as `surface/irradiation` (relative, Earth-unshielded ≈ 1).

---

## What consumes the foundations (the banked backlog, restated as pure consumers)

| Feature | Consumes | Emits (later) |
| --- | --- | --- |
| Craters vs ICE CRACKS | surface age × impact flux, branch on crust material (rocky → craters, icy shell → fractures/ridges) | `surface/cratered` value up; `surface/ice-fractured` |
| Crustal rifts (Charon) | fluid-layer HISTORY: had subsurface ocean, now frozen → expansion cracking | `surface/crustal-rift` |
| Tholin colouring | retention(CH4/N2/CO) coverage × irradiation dose (darkens) × pressure + gas mix (colour: low-p dark red → high-p pale yellow) | feeds `apparentColor` engine directly |
| Io-like SO2 atmosphere | regime = tidal-volcanic × retention(SO2) | thin-atmosphere chance at generation |
| General emission plumes | regime + forcefulness × gravity (reach) | generalises the cryo plume |
| Rayed craters | young tail of the crater population on OLD surfaces | crater-model variant |
| Lop-sided cratering | tidallyLocked × surface age → leading-hemisphere bias | crater-model asymmetry param |

Each lands as physics → value-carrying tag → `deriveAppearance()` → both renderers (2D disc + 3D
holo), the established pipeline. None are in scope for the foundations build itself.

## Knock-on: the interior cutaway (CompositionCrossSection)

**No breaking effect.** The cutaway's molten-core glow is already driven by `geothermalVigor`, and
that number is unchanged — the ladder reinterprets the same continuum. Frozen oceans and ice
shells already render via `deriveFluidLayers`.

Optional follow-on polish (not in the foundations build): a `plutonic` world could draw intrusive
melt pockets in the mantle rather than a cleanly molten core; an `episodic` world a visibly
thickened lid. Both are small additive branches in the cutaway keyed off the regime tag.

## Build plan (physics-first, each step green before the next)

1. **Ladder** — extend `deriveGeoActivity` (types, thresholds, tags, notes); anchor tests
   (Moon/Mars inactive, Mercury plutonic, Venus episodic-band, Earth mobile, Io/Europa/Enceladus/
   Triton unchanged). Small diff, one seam.
2. **Retention** — new `physics/volatileRetention.ts` (phase data + Jeans λ); wire into
   SystemProcessor after temperature derivation; anchor tests (Pluto/Triton/Titan/Callisto/Luna/
   Io as above).
3. **Surface age** — derive + tag + Newton note; anchor tests (Luna ~4 Gyr, Earth ~0.2, Europa
   young, Venus sub-Gyr, Mars old via the vigor inversion).
4. **Irradiation** — derive + tag; anchor tests (Pluto high-dose-unshielded vs Earth shielded;
   moon-in-giant-magnetosphere case).
5. Editor/Newton surfacing pass: the new tags appear with explanations like every other derived
   quantity; sanity-check a generated spread for regime variety.

Calibration is Testion-style throughout: the solar-system fixture must come out right before any
visual feature is attempted.

## Open questions

- [GQ1] Ladder thresholds: the 0.60 plutonic/stagnant boundary and the ~1.3 episodic onset are
  first guesses — calibrate against the anchors, then freeze in tests.
- [GQ2] Retention margin: how far below the sublimation curve counts as "cold enough"? Propose
  vapour pressure < ~1 microbar at `temperatureRangeK.max`; tune on the Callisto-vs-Pluto N2 split.
- [GQ3] Does `plutonic` suppress or permit the existing magma-vent visuals? Proposal: suppress
  (intrusive means no surface vents) — the point of the regime.
- [GQ4] Surface-age impact flux: leave the belt-proximity modifier at 1 in v1, or derive a coarse
  factor from belt bands already in the system model?
