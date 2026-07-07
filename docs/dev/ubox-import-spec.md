# Universe Sandbox (.ubox) Import — Specification

Status: DRAFT for review — no code yet. Phase 0 (discovery) cannot complete without a real
sample `.ubox` file; everything in the "Universe Sandbox side" sections is to be confirmed
against one.

## 1. Purpose

Let a user load a Universe Sandbox simulation save (`.ubox`) into SSG as a playable system.
Universe Sandbox is a physics-sandbox simulator: its saves carry instantaneous **state vectors**
(position/velocity), masses, radii and some environmental properties per body. SSG is a
**derivation engine**: given minimal authored inputs (mass, radius, orbit, atmosphere), it derives
temperature, classification, geology, magnetism, habitability and tags itself.

The import therefore converts US state into SSG *authored inputs only* and lets the existing
pipeline do the rest. This is the same contract as loading any system JSON: the app already runs
`fixUpImportedSystem()` + `systemProcessor.process()` on every load, and `importFixup` strips
derived fields anyway — so anything the converter copied beyond the authored set would be
discarded or recomputed on first load. **Do not fight the pipeline.**

## 2. User-facing behaviour (target end state)

Two existing entry points gain `.ubox` support (both currently accept `.json` only):

1. **New System dialogue** — `GenerationWizard.svelte` "load a system file" input
   (`accept="application/json,.json"` at ~line 229, handler `loadSystemFile()`).
2. **File menu in-system** — `SystemView.svelte` rail upload input
   (`accept="application/json,.json"` at ~line 2150, handler `handleUploadJson()`).

Behaviour:

- File pickers accept `.json,.ubox`. Selecting a `.ubox` routes through the converter, then joins
  the identical code path a JSON pick uses (`fixUpImportedSystem` → `systemProcessor.process`).
- On success, show a short **import report** (see §9) before/alongside the loaded system: what was
  imported, what was skipped, and where SSG's derived values will intentionally differ from what
  Universe Sandbox displayed.
- On failure (not a zip, no recognisable simulation data, zero convertible bodies), a clear error:
  "Could not read that Universe Sandbox file" plus the specific reason. Never a half-imported
  system.
- The starmap-level load on the home page is OUT OF SCOPE — `.ubox` maps to a single system, not a
  starmap. (A converted system can be saved/added to a starmap through the normal flows.)

## 3. Build shape and phases

**Phase 0 — Discovery (blocking).** Obtain sample `.ubox` files (ideally: Sol default sim, a
custom multi-star sim, one with moons, one with an edited atmosphere). Rename to `.zip`, inspect,
and answer the open questions in §10. Produces: a confirmed field map (fills the TBC column of §6)
and 2–3 sample files checked into `tests/fixtures/ubox/` (small ones only, per repo conventions).

**Phase 1 — Converter module + CLI.** A pure TypeScript module, `src/lib/import/ubox.ts`
(+ `uboxToSystem.spec.ts`), with a thin CLI wrapper `scripts/ubox2ssg.mjs` (Node) so conversion can
be run/iterated without touching the UI: `node scripts/ubox2ssg.mjs input.ubox > system.json`.
The module must be browser-compatible (no Node-only APIs in `src/lib/`); the CLI handles file IO.
Keeping the logic in `src/lib/` from day one means Phase 2 is wiring, not porting.

**Phase 2 — In-app integration.** Add a zip inflater dependency (`fflate` recommended: tiny,
tree-shakeable, browser-native; the project currently has NO zip library), extend the two file
inputs, route `.ubox` picks through the module, add the import-report UI. Version-bump + changelog
per convention.

## 4. UBOX extraction (Universe Sandbox side — to confirm in Phase 0)

Known/assumed: a `.ubox` is a ZIP archive containing the simulation's serialised state (JSON
and/or XML members, possibly plus screenshots/assets). The converter should:

1. Inflate the archive in memory.
2. Locate the simulation-state member **by content, not by hard-coded filename**: scan members for
   the one that parses as JSON/XML and contains an array of body-like records (fields resembling
   mass/radius/position). US versions differ; tolerant discovery beats a brittle path.
3. Ignore all other members (images, thumbnails, settings).

Failure at any step → the §2 error path with the specific reason ("not a zip", "no simulation data
found", "unrecognised format version").

## 5. Conversion principle: authored inputs only

The converter emits a **minimal** SSG `System` JSON — the same shape as the stripped save files
and `tests/fixtures/solar-system-input.json`:

- Top level: `id`, `name` (from the US sim name or filename), `seed` (deterministic hash of the
  file), `epochT0`, `age_Gyr` (see §7.4), `nodes`.
- Per body: `id`, `parentId`, `name`, `kind: 'body'`, `roleHint`, `massKg`, `radiusKm`, `orbit`
  (hostId, hostMu, t0, Keplerian elements), and the optional authored extras in §6.

Everything else — classification, interior makeup (density inference exists in
`SystemProcessor` when `body.makeup` is absent), greenhouse/escape/stripping, magnetosphere,
fluid layers, geology, habitability, temperatures, tags — is **deliberately not emitted**. SSG
derives it, and per the physics-honesty principle it will usually do so more defensibly than the
values US displays.

## 6. Field mapping

| Universe Sandbox (TBC Phase 0)     | SSG field                        | Treatment |
|------------------------------------|----------------------------------|-----------|
| Body name                          | `name`                           | direct |
| Mass (kg)                          | `massKg`                         | direct (unit-confirm) |
| Radius (m or km)                   | `radiusKm`                       | convert |
| Position + velocity vectors        | `orbit.elements` (Keplerian)     | convert — §7 |
| Parent/owner reference (if stored) | `parentId`, `orbit.hostId`       | direct; else infer — §7.3 |
| Body category (star/planet/moon)   | `roleHint`                       | map; else infer from mass + hierarchy |
| Rotation period                    | `rotation_period_hours`          | convert (needed for magnetism model) |
| Axial tilt / obliquity             | `axial_tilt_deg` / `obliquity_deg` | convert |
| Atmosphere composition             | `atmosphere.composition` (fractions, normalised to sum 1) | convert |
| Atmosphere pressure                | `atmosphere.pressure_bar`        | convert (Pa → bar likely) |
| Surface water fraction             | `hydrosphere { composition:'water', coverage }` | convert if present |
| Star surface temperature           | `temperatureK` (STARS ONLY — authored input for stars) | direct |
| Planet/moon surface temperature    | — (import report only)           | discard; SSG derives — used as sanity cross-check |
| Magnetic field (if stored)         | — (or `magneticField.strengthGauss` if explicitly user-set in US) | prefer discard; SSG derives |
| Composition percentages            | — (omit `makeup`)                | discard; density inference derives it. Revisit only if US data proves richer than density implies |
| Luminosity, temperature maps, sim settings, time-step state | —               | discard |
| Non-astronomical objects (spacecraft, humans, fictional) | —                | skip + list in report (constructs mapping = possible future phase) |
| Asteroid/particle groups           | —                                | skip + list in report (belt mapping = possible future phase) |

## 7. The hard part: state vectors → Keplerian elements

### 7.1 Per body (given its parent)

Inputs: relative position **r** and velocity **v** of body w.r.t. its parent (subtract parent's
vectors), and `mu = G × (parentMass + bodyMass)` (use the combined mass; for moons the body mass
is not always negligible).

Standard conversion, all in SI then converted at the end:

1. `h = r × v` (specific angular momentum); `n = ẑ × h` (node vector).
2. Eccentricity vector `e_vec = ((v²−µ/|r|)·r − (r·v)·v)/µ`; `e = |e_vec|`.
3. Specific energy `ε = v²/2 − µ/|r|`; semi-major axis `a = −µ/(2ε)`.
4. `i = acos(h_z/|h|)`; `Ω = atan2` on `n`; `ω` from angle between `n` and `e_vec`;
   true anomaly `ν` from angle between `e_vec` and `r` (sign via `r·v`).
5. `ν → E` (eccentric anomaly) `→ M0 = E − e·sinE` (mean anomaly at the save epoch).
6. Emit `a_AU = a/AU`, `e`, `i_deg`, `omega_deg`, `Omega_deg`, `M0_rad`, plus
   `hostMu = G × parentMass` and `t0 = epochT0` (SSG's convention: milliseconds; set the system
   `epochT0` to the conversion time and all `t0` equal to it — the US in-sim date, if stored, is
   cosmetic and noted in the report only).

Degeneracies (must be handled, with unit tests):
- Near-circular (`e < 1e-6`): `ω := 0`, measure `ν` from the node (or from x-axis if also equatorial).
- Near-equatorial (`i < 1e-6` or `> 180−1e-6`): `Ω := 0`, `ω` measured from x-axis.
- Retrograde (`i > 90°`): carried as-is; SSG elements support it.
- **Unbound (`e ≥ 1` or `ε ≥ 0`)**: SSG orbits are elliptical only (negative-`a` inputs crash-guarded,
  not simulated). Policy: skip the body, list it in the report as "unbound — not imported". Do NOT
  clamp silently: a US save mid-flyby is a real scenario and silent clamping fabricates an orbit.
- Adaptive-timestep concern (open question): instantaneous state vectors are valid regardless of
  the integrator that produced them; the only real risk is a save captured mid-close-encounter,
  which the unbound/parent checks will surface naturally.

### 7.2 Round-trip validation

For every converted body, propagate the emitted elements back to a position at `t0` (SSG's own
`propagate()`) and require it matches the US position to <0.1% of `|r|`. Any mismatch → converter
bug or degenerate case; fail loudly in tests.

### 7.3 Hierarchy: explicit if available, inferred if not

If US stores parent references, use them. Otherwise infer per body, most massive first:

1. Candidate parents = all more-massive bodies already placed (stars, then planets for moon
   candidates).
2. For each candidate, compute relative `ε`; keep candidates where the body is **bound** (`ε < 0`)
   and inside the candidate's Hill sphere (w.r.t. the candidate's own parent).
3. Choose the candidate with the deepest binding (most negative ε per unit µ — in practice the
   smallest bound `a` relative to Hill radius). Star wins by default when no planet qualifies.
4. `roleHint`: orbits a star → `planet`; orbits a planet → `moon`; the most massive luminous
   body/bodies → `star`. Substellar check: a "planet" of 8–80 M♃ is left as `planet` — SSG's own
   substellar pass flags it self-luminous (brown dwarf) automatically.

Multi-star: if two stars are mutually bound and neither dominates (mass ratio < ~10:1), emit an
SSG `barycenter` node as their parent with the pair's combined elements, and re-parent planets to
star or barycentre by the same Hill logic (S-type vs P-type falls out naturally).
`reconcileBarycenters()` runs on load and maintains the invariants after that.

### 7.4 System age

SSG physics leans on `age_Gyr` (geology decay, atmospheric escape, belt grinding, brown-dwarf
cooling). US saves may not carry a meaningful stellar age. Policy: if absent, default `4.6` and
flag prominently in the import report ("system age assumed 4.6 Gyr — set it in System Settings");
never guess from the US in-sim clock.

## 8. IDs, naming, collisions

- `system.id` / node `id`s: slugified names + short hash of the file, guaranteeing uniqueness and
  stable re-import (re-importing the same file twice yields identical ids → easy to spot dupes).
- Duplicate body names within the save are allowed (ids disambiguate), but noted in the report.

## 9. Import report

A compact, dismissible summary (Phase 1: printed by the CLI; Phase 2: shown in a modal):

- Counts: imported stars / planets / moons; skipped entities with reasons (unbound, non-astronomical,
  asteroid groups, unparseable).
- Assumptions applied: system age default, inferred hierarchy (which bodies), normalised
  atmosphere fractions.
- Sanity cross-check table: US surface temperature vs SSG derived temperature per body, flagged
  where they differ by >30 K — expected and explained ("SSG derives temperature from first
  principles; differences usually trace to albedo/greenhouse modelling"), not treated as an error.

## 10. Open questions (Phase 0 exit criteria)

1. Exact member name(s) and schema of the simulation state inside the archive (JSON? XML? both?
   version differences between US² releases?).
2. Explicit parent/child references vs inference required (affects §7.3 effort).
3. How moons are represented — children or free bodies with close orbits.
4. Atmosphere storage: composition percentages, pressure, or a coarse flag? Units?
5. Rotation period and axial tilt presence + units.
6. Multi-star saves: barycentre data or raw star states only?
7. In-sim epoch/date storage (report-only interest).
8. Whether user-edited properties are distinguishable from simulated ones (would let us honour a
   deliberately-set magnetic field while discarding simulated ones).
9. Practical size of a typical save (body count; asteroid particle counts can be huge — confirm
   they are groupable/skippable cheaply).

## 11. Testing

- **Unit**: state-vector → elements maths against textbook cases (circular equatorial, eccentric
  inclined, retrograde, near-parabolic rejection) + the §7.2 round-trip on every fixture body.
- **Fixture**: `tests/fixtures/ubox/` samples → convert → `fixUpImportedSystem` →
  `systemProcessor.process` must succeed with zero console errors; a Sol-like US save should
  land within loose bands of the physics-baseline expectations (same star class, Earth habitable,
  gas giants classified as giants).
- **Idempotence**: converted output re-processed twice is stable (matches the existing
  heat-model-wiring invariant).
- **Failure modes**: corrupt zip, zip-with-no-sim, empty system, all-unbound bodies → clean errors.

## 12. Risks / notes

- **Schema drift**: US updates may change the save format; content-based member discovery (§4) and
  fixtures pinned per US version mitigate.
- **Fidelity expectations**: users will notice SSG-derived values differing from what US showed.
  The import report (§9) is the mitigation — frame differences as SSG's physics pass, not data loss.
- **Licence**: reading a user's own save file locally is fine; we ship no US assets. Do not commit
  large `.ubox` fixtures (small hand-made saves only, per the small-assets convention).
- **Non-goals for now**: asteroid fields → belts, spacecraft → constructs, ring systems, starmap
  batch import. All listed in the report as skipped so the user knows they existed.
