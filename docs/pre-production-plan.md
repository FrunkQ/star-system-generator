# Pre-Production Plan

A sequenced plan for the pre-production bug-fix and improvement list. Grouped so that each phase touches a
coherent slice of the codebase, foundations land before the things that depend on them, and blockers get
cleared before polish. Every item has an ID so we can tick them off piece by piece.

Effort: **S** (hours) / **M** (a day-ish) / **L** (multi-day or design-gated). Risk is the chance of
regressions elsewhere.

---

## Cross-cutting foundations (build these once, reuse everywhere)

Several list items are really the same underlying mechanism wearing different hats. Deciding these up front
stops us implementing them three inconsistent ways:

- **F-OVR — the GM manual-override pattern.** "Derived by default, but the GM can pin a manual value that is
  saved in the file and fed to the classifier/physics; with a one-click reset to calculated." This underpins
  Albedo (F3), the magnetic-field edit (E3), and the density/mass/radius editing (D). Define ONE small
  mechanism — e.g. `body.overrides: { albedo?, magneticField?, ... }` that the derivation layer checks before
  computing — plus a shared "overridden (reset ↺)" control. Everything else plugs into it.
- **F-RECLASS — reclassify on settle.** The classifier "not re-running" is a recurring root cause (type
  won't change, tags go stale). Establish one reliable "recompute derived + reclassify + reconcile tags on
  mouse-release / commit" path that all body edits call. D, E2, E3, E4 and the terrestrial-to-gas-giant bug
  all lean on it.
- **F-UNITS — the unit formatter.** One `formatDistance()/formatSpeed()` layer reading a single km/miles
  store; SI stays internal (Phase B). Every distance/speed readout goes through it.
- **F-BARY — barycentre/binary hierarchy.** The two legacy crashes (Phase A) are both V1 binary/barycentre
  data. Likely one root cause and one migration/sanitiser fix serving both.
- **Hill-sphere infra — already shipped.** `hillSpheresAu()` and the patched-conic coast (v2.0.242) already
  give us the star/planet gravitational boundaries; C1 and C2 build straight on them.
- **F-VIZTAGS — visualisation reads TAGS, not physics.** Cosmetic render features are driven off the
  pre-calculated tag layer, never by recomputing physics in the draw loop. Auroras, for instance, are just
  magnetic-field + atmosphere gas + stellar/gas-giant XUV — all already derived — so aurora presence becomes
  one or more TAGS (e.g. `fx/aurora`, or gas-specific variants) emitted by the tag engine, and the renderer
  reads them; the aurora COLOUR is derived from the driving gas tag(s) (oxygen greens/reds, etc.). Same for
  atmosphere glow. This keeps the orrery cheap and makes every effect inspectable/editable via tags, and it
  ties C5/C6 to the tag work in E3 (magnetic tags must be correct first).

---

## Phase A — Stop the bleeding: legacy-data crashes  ✅ DONE (v2.0.244-beta)

Real users on real V1 files. One crashes on load, one silently mis-places bodies. Both are
binary/barycentre (F-BARY) and probably share a root cause. Approach for both: reproduce → diagnose (agents
running) → fix the code and/or add a load-time migration/sanitiser → freeze the real file as a regression
fixture.

- **A1 — Procyon load crash** (`Cannot read properties of undefined (reading 'x')`). File:
  `C:\Development\Procyon-System.json`. **Diagnosed:** a binary system with a real barycentre root
  (`bary-auto-…`, two member stars orbiting it). No orphan parentIds — so it is an orbit-shape problem, not
  a missing node. Root-cause hypothesis: a node in the barycentre chain has an `orbit` object whose
  `elements` is missing/undefined, so `propagateState` ([orbits.ts:112](../src/lib/physics/orbits.ts)) blows
  up destructuring `const { M0_rad } = elements`, and/or `getGlobalState`
  ([physics.ts](../src/lib/transit/physics.ts)) returns a bad state that surfaces as `parentPos.x` undefined
  at [SystemVisualizer.svelte:530](../src/lib/components/SystemVisualizer.svelte). Fix = (1) defensively guard
  `propagateState` against a missing `elements` (return the trivial state, like the `hostMu===0` case), (2)
  heal in the sanitiser — backfill/repair or drop a malformed `orbit` so the load is clean not just
  non-crashing, (3) confirm the exact culprit node when we start the phase. **Effort M, Risk Med.**
- **A2 — Sirius binary planets collapse to the barycentre / inside the star.** File:
  `C:\Development\Sirius-System.json`; nodes "Sirius Ab" and "Sirius Ab I". **Diagnosed:** the stored data is
  actually FINE — a nested auto-barycentre (`bary-auto-…`, tag `barycenter/auto`) parented to Sirius A with a
  valid `a_AU ≈ 4.44` and non-zero `hostMu`, with the two planets orbiting it at ~0.001–0.0018 AU. The
  collapse happens in the LOAD PIPELINE: `importFixup` deletes auto-barycentres on load
  ([importFixup.ts:104](../src/lib/system/importFixup.ts)) and `reconcileBarycenters` regenerates them
  ([barycenterReconcile.ts:29–117](../src/lib/physics/barycenterReconcile.ts)) — but the regenerated
  barycentre gets a near-zero `a_AU` (rebuilt from the tiny child separation instead of the stored 4.44 AU),
  so `propagateState` returns (0,0) at [orbits.ts:132](../src/lib/physics/orbits.ts) and the pair collapses to
  the parent star's centre. Root cause = **the reconcile drops a nested binary barycentre's own orbital
  radius.** Fix = preserve a valid stored auto-barycentre orbit through reconcile (don't delete-and-rebuild
  one that already carries a good `a_AU`/`hostMu`), or rebuild its radius from member positions rather than
  separation. Confirm at runtime + fixture. **Effort M, Risk Med** (barycentre reconcile is load-critical —
  regression-test other binary example systems).

Deliverable: both example files load correctly and are added to the load regression set.

**Revised F-BARY read:** the two crashes are in the SAME subsystem (the barycentre load pipeline —
`importFixup` -> `barycenterReconcile` -> `propagateState`) but look like **two distinct bugs**: Procyon = a
throw on a malformed/missing `orbit.elements`; Sirius = a nested auto-barycentre losing its radius on
reconcile. Plan them together (one code area, shared fixtures + `propagateState` hardening) but expect two
fixes, not one.

---

## Phase B — Units (miles / km + °C/°F)  ✅ DONE (v2.0.245–248-beta)

Distance/speed (km/miles) AND temperature (°C/°F) both follow one `measurementUnits` toggle; Kelvin/AU stay
as scientific/astronomical units. Formatter + `fmt` store, Settings toggle, sweeps across app + report +
catalogue + unit-aware inputs. KNOWN FOLLOW-UPS: body Radius editor (deferred to Phase D); the stored
habitability-breakdown temp string (SystemProcessor ~906) + LLM curate temp are generation-time strings that
won't react to the toggle (fix render-side if wanted); a separate Kelvin option (3-way °C/°F/K) if sci-fi GMs
want it.


Foundation + display sweep shipped: `units.ts` formatter + `fmt`/`measurementUnit` store, Settings→Starmap
toggle (default metric), ~16 display sites across 14 components routed through `$fmt`. v2.0.246 extended it to
the **printed report + Companion catalogue/guide** (units threaded as a prop/URL param since those render on
separate routes). REMAINING (B3-inputs): editable orbit inputs around a planet/moon should accept km
(construct a_AU input, belt/ring inputs stay as authored units for now); the Δv budgets now read km/s in
metric too (consider speedAuto for small values); the Companion guide reads the unit at launch (won't live-
update if the GM toggles mid-session — add to SYNC_GUIDECONFIG if wanted).

Mechanical once the formatter exists; big call-site surface. Independent of every other phase — a clean
stand-alone chunk.

- **B1 — Master unit setting.** Settings -> Starmap -> "Distance / scaling units" (km | miles), default km.
  Persisted like other starmap settings; broadcast to projector/player views.
- **B2 — Formatter sweep.** Build `F-UNITS` (`formatDistance`, `formatSpeed` for km/s and km/h) reading the
  store; SI internal only. Audit and route every distance/speed readout through it (orrery labels, panels,
  ruler/Measure, transit/ship's-log speeds, reports). **Effort M, Risk Low** (visual only).
- **B3 — Orbit radii always km, never AU.** All orbits around planets and moons (bodies AND constructs) read
  in km (or miles), never AU. Falls out of the formatter plus a "local orbit uses km" rule. **Effort S.**

Note: keep serialised values SI; this is presentation only ([[feedback_full_dev_no_migration]] not engaged).

---

## Phase C — Orrery & the system boundary  ✅ DONE (C2/C3 v2.0.251, C1 v2.0.252)

C1 handoff: a construct coasting beyond the root star's Hill limit (~2 ly) is pulled out of the system and
added to starmap.adriftConstructs at the departure system's position, drifting at its real speed along its
in-system heading angle (per the design decision). Detected in the system reconcile; reuses the existing
adrift infrastructure. NOTE: physically it takes centuries to reach 2 ly, so the GM scrubs forward to see it.
Possible future tweak: a smaller configurable "system edge" if the Hill limit feels too far.

- **C2 — Star Hill limit line + label.** Extend the Hill-sphere overlay: draw the STAR's Hill sphere as an
  unshaded line (planets stay shaded bubbles) with a frost-line-style text label "[Star name] Hill Limit".
  Reuses `hillSpheresAu` (extend to include the root) and the existing frost-line label renderer.
  **Effort S, Risk Low.** *(Quick win.)*
- **C3 — Zones key close button.** The "Stellar Zones Key" panel gets a close control; re-picking Zones in
  View Options brings it back. **Effort S, Risk Low.** *(Quick win.)*
- **C1 — Leave-system handoff to the starmap.** When a construct coasts beyond the star's Hill limit
  (C2 gives us the boundary), transfer it from the system orrery to the starmap, preserving its vector
  (position + velocity). This is the seed of interstellar transit — needs a starmap representation of a
  free-flying construct and a handoff record. **Effort L, Risk Med** (touches the system/starmap boundary;
  may want its own mini-design). Depends on C2.

---

## Phase D — Body editing: mass / radius / density  (design-gated flagship)

The largest item and the one you asked to see designed before it is built. Likely also fixes the
"can't turn a terrestrial into a gas giant / classifier doesn't re-run" bug, because it forces a clean
reclassify-on-settle (F-RECLASS) and lets mass/radius move independently of composition.

- **D0 — UI & interaction proposal (design only, for sign-off).** ✅ DRAFTED → `docs/body-editing-design.md`
  (+ an interactive panel mock published as an Artifact). Awaiting Alex's sign-off + the open decisions at the
  end of that doc. Key finding: the physics already exists in `makeup.ts` (reuse, don't recreate); the
  terrestrial→gas-giant bug is 3 gates (radius can't grow without gas-dominated makeup; giant presets are
  mass-gated so hidden; `autoClassify=false` sticks the type). Original brief covered:
  - An **average-density slider** above the Interior-makeup sliders.
  - **Composition presets as buttons** (Iron-rich, Rocky, Carbon, Icy, Ocean, **+ Gas/Giant** which is
    currently missing), each with a default makeup and a density BAND; only presets whose band contains the
    current density are enabled.
  - The **conflict resolution model.** You proposed two options; my recommendation is a **hybrid**:
    default to the preservation chain (edit mass -> radius follows; edit radius -> mass held, density +
    preset selection follow; edit density/makeup -> mass follows), PLUS an optional **lock toggle** per
    field (Universe-Sandbox style) that overrides the chain when the GM wants, e.g., "hold composition, let
    density change." Chain = automatic and clash-free; lock = manual control when wanted.
  - **Reclassify on release** (F-RECLASS), not on every drag.
  - How makeup "fine-tunes itself" to a chosen mass/radius, and how simpler types (gas giants) expose fewer
    knobs than terrestrials.
  Output: a short design doc + a mock of the panel. **No code until signed off.**
- **D1 — Implementation.** Build to the agreed D0 design on top of F-OVR + F-RECLASS. **Effort L, Risk High**
  (core body model + classifier interaction). Gate behind D0.

---

## Phase E — Generation, classification & tags  (correctness bugs)

- **E2 — Moons wrongly classified "Cold Eyeball".** A moon can never be an eyeball; it has a day/night cycle
  (the far side still gets stellar thermal input). Guard: eyeball classes require star-lock, not
  planet-lock; moons are excluded. (Already noted in [[project_sse_v2_backlog]].) Add a fixture. **Effort S,
  Risk Low.**
- **E3 — Magnetic-field tag reconciliation on manual edit.** Setting the field to 0 (or from 0 to non-zero)
  must add/remove the magnetic tags. First real consumer of F-OVR (magnetic field becomes an overridable
  derived value) + F-RECLASS (tags reconcile on settle). **Effort S–M, Risk Low.**
- **E1 — Moon sizing & the add-moon picker.** Generation and manual "Add moon" should default to an
  appropriate (not gravitationally significant) size, and the type picker must be MASS-GATED by the host:
  a terrestrial offers only the few plausible moons (airless rock the common default), a gas giant offers
  more. Audit the generator's moon-mass draw and the picker's option filter. **Effort M, Risk Med**
  (touches generation; verify against the calibration fixtures).
- **E4 — Ellipsoid / toroidal classification.** Add a deformation data point (from rotation period and/or
  tidal pull from a close companion) so fast rotators read as oblate/ellipsoid and extreme cases as
  toroidal. New classifier input + render hint. **Effort M–L, Risk Med** (additive; needs calibration so it
  doesn't relabel normal planets). Lower urgency than the correctness bugs above.

---

## Phase F — GM overrides & general UI

- **F1 — "Load saved system" on the New System screen.** A button beside the preset loader that does what
  File -> Load System does. **Effort S, Risk Low.** *(Quick win — independent, pull forward anytime.)*
- **F3 — Albedo (and friends) manual override.** Bring back the Albedo slider: derived by default, but the
  GM can set a manual value that is SAVED and fed to temperature/classification, with a reset-to-calculated
  control. First clean instance of F-OVR. Then audit which other derived properties deserve the same
  treatment (candidates: magnetic field [E3], and review temperature, rotation-derived values). **Effort M,
  Risk Med** (feeds the physics chain — must respect the override without corrupting derivation).
- **F2 — Custom images for bodies & constructs.** Upload/replace an image; constructs default to no image
  (only shown once added). Bodies: under "Type / Image". Constructs: "Add / Replace" under "Basic". Storage
  follows [[feedback_small_assets_local]] / the existing asset approach. **Effort M, Risk Low.**

---

## Phase G — Visualisation polish  (last; depends on some of the above)

- **C4 — Gas-giant bands from rotation period.** Faster rotation -> stronger Coriolis -> more, tighter
  east-west bands; slow rotators (Saturn, Neptune) -> broader, smeared bands, not simply fewer. Drive the
  band shader/params off rotation period. **Effort M, Risk Low** (cosmetic).
- **C5 — Atmosphere glow.** Limb glow driven off atmosphere tags (F-VIZTAGS), not recomputed. **Effort S–M,
  Risk Low.**
- **C6 — Auroras.** Driven off pre-calculated tags (F-VIZTAGS): the tag engine emits aurora tag(s) from
  magnetic-field + atmosphere gas + stellar/gas-giant XUV (all already derived); the renderer reads them and
  derives the glow COLOUR from the driving gas tag(s). Needs E3 (correct magnetic tags) first, and possibly a
  small tag-engine addition to emit the aurora tag(s). **Effort M, Risk Low** (cosmetic, tag-driven).

---

## Suggested order

1. **Phase A** (crashes) — unblock real files. In progress: diagnostics.
2. **Phase B** (units) — high-value, low-risk, self-contained; good momentum.
3. **Phase C quick wins** (C2, C3), then **C1** (leave-system handoff).
4. **Phase E correctness** (E2, E3, E1).
5. **F-OVR + F3** (override foundation via Albedo), then **D0 design -> D1**.
6. **Phase F remainder** (F1 anytime, F2), **E4**, **Phase G** polish.

Quick wins pullable at any point regardless of phase: **F1, C3, C2**.

## Open decisions (need your call before the relevant phase)

- **D-model:** confirm the hybrid (chain + optional per-field lock), or pick pure-chain vs pure-lock.
- **C1 scope:** is the leave-system handoff a full interstellar-transit start, or just "park it on the
  starmap with its vector for now"? That sets whether C1 is M or L.
- **E4 priority:** ellipsoid/toroidal is additive flavour — confirm it belongs in this pass, or bank it.
- **F3 breadth:** which derived properties beyond albedo/magnetic should become GM-overridable now vs later.
