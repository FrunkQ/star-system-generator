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

**Design rule: grab as little as possible from the ubox; post-process everything in SSE; then
refer back to the save file and AUDIT that the two align.** The import converts US state into SSG
*authored inputs only* and lets the existing pipeline do the rest — the same contract as loading
any system JSON: the app already runs `fixUpImportedSystem()` + `systemProcessor.process()` on
every load, and `importFixup` strips derived fields anyway, so anything copied beyond the authored
set would be discarded or recomputed on first load. **Do not fight the pipeline.** The values we
deliberately did NOT import are not thrown away, though — they are retained as a reference
snapshot and compared against SSG's derived results in the Import Review (§9), with misalignments
highlighted and explained where we can.

## 2. User-facing behaviour (target end state)

Two existing entry points gain `.ubox` support (both currently accept `.json` only):

1. **New System dialogue** — `GenerationWizard.svelte` "load a system file" input
   (`accept="application/json,.json"` at ~line 229, handler `loadSystemFile()`).
2. **File menu in-system** — `SystemView.svelte` rail upload input
   (`accept="application/json,.json"` at ~line 2150, handler `handleUploadJson()`).

Behaviour:

- File pickers accept `.json,.ubox`. Selecting a `.ubox` routes through the converter, then joins
  the identical code path a JSON pick uses (`fixUpImportedSystem` → `systemProcessor.process`).
- On success, show a short **Import Review** (see §9) before/alongside the loaded system: what was
  imported, what was skipped, and where SSG's derived values will intentionally differ from what
  Universe Sandbox displayed.
- On failure (not a zip, no recognisable simulation data, zero convertible bodies), a clear error:
  "Could not read that Universe Sandbox file" plus the specific reason. Never a half-imported
  system.
- The starmap-level load on the home page is OUT OF SCOPE — `.ubox` maps to a single system, not a
  starmap. (A converted system can be saved/added to a starmap through the normal flows.)

## 3. Build shape and phases

**Phase 0 — Discovery (blocking).** Sample `.ubox` files are available on request (a licensed US
install is on hand to churn out test saves). The shopping list — each saved fresh from the current
US version, noting the version number:

1. The default Sol simulation (baseline: known bodies, known answers). — RECEIVED 2026-07-07,
   torn down; findings in §4a. NOTE: it contains no moons.
2. Jupiter + Galilean moons focus (moon representation + hierarchy). — COVERED by "The Whole
   Solar System" sample (212 moons; §4a second-sample findings).
3. A binary/multi-star system (barycentre question).
4. An O- or B-type star with planets (age-cap exercise, §7.4).
5. A planet with a hand-edited atmosphere and surface water (which edits are stored, and how).
6. A body mid-flyby / on a hyperbolic trajectory (unbound-body policy exercise).
7. A sim containing an asteroid group (skippability + practical size). — COVERED: the whole-system
   sample carries 7,687 ring/fragment particles (§4a).
8. An **object** save (single body preset) as well as simulation saves, to see that variant.
9. If any pre-update legacy `.ubox` files still exist, one of those too (old-format best effort).

Rename to `.zip`, inspect, and answer the open questions in §10. Produces: a confirmed field map
(fills the TBC column of §6) and 2–3 SMALL representative samples checked into
`tests/fixtures/ubox/` (small assets only, per repo conventions).

**Phase 1 — Converter module + CLI.** A pure TypeScript module, `src/lib/import/ubox.ts`
(+ `uboxToSystem.spec.ts`), with a thin CLI wrapper `scripts/ubox2ssg.mjs` (Node) so conversion can
be run/iterated without touching the UI: `node scripts/ubox2ssg.mjs input.ubox > system.json`.
The module must be browser-compatible (no Node-only APIs in `src/lib/`); the CLI handles file IO.
Keeping the logic in `src/lib/` from day one means Phase 2 is wiring, not porting.

**Phase 2 — In-app integration.** Add a zip inflater dependency (`fflate` recommended: tiny,
tree-shakeable, browser-native; the project currently has NO zip library), extend the two file
inputs, route `.ubox` picks through the module, add the Import Review UI. Version-bump + changelog
per convention.

## 4. UBOX extraction (Universe Sandbox side — to confirm in Phase 0)

Known/assumed: a `.ubox` is a ZIP archive containing the simulation's serialised state (JSON
and/or XML members, possibly plus screenshots/assets).

**Two format generations exist.** Universe Sandbox's "New Save File Structure" update reworked the
format: a single new-format save can contain **multiple simulations and objects** (the basis for
future shareable presets such as life species), old saves still open in current US, but new saves
do not open in old versions. The public doc describing this is a changelog only — it specifies no
schema, member names or data format (verified 2026-07-07), so Phase 0 discovery against real
samples remains the source of truth for BOTH generations. Since a current US install produces
new-format saves, the new format is the primary target; old-format support is best-effort based on
whatever legacy samples exist.

The converter should:

1. Inflate the archive in memory.
2. Detect the format generation, then locate simulation-state member(s) **by content, not by
   hard-coded filename**: scan members for those that parse as JSON/XML and contain an array of
   body-like records (fields resembling mass/radius/position). US versions differ; tolerant
   discovery beats a brittle path.
3. If the archive contains **multiple simulations**, enumerate them: the CLI takes a selection
   flag (default: first, list the rest); the in-app flow shows a simple picker. A member that is a
   single **object** preset rather than a simulation is out of scope for import (skipped and named
   in the Import Review).
4. Ignore all other members (images, thumbnails, settings).

Failure at any step → the §2 error path with the specific reason ("not a zip", "no simulation data
found", "unrecognised format version").

## 4a. Phase 0 findings — confirmed against a real sample (Update 36.2.1, BuildRevision 48569)

Teardown of a fresh default "Solar System" save (28.9 MB) from Universe Sandbox Update 36.2.1
(released 2026-06-29 — the current release at time of writing) confirmed the following. All of
this is the NEW format; legacy remains unknown.

**Archive layout.** Standard ZIP. Members: `manifest.json` (container index),
`simulation-<Name>.json` (the state — 3.2 MB here), `simulation-<Name>-info.json` (workshop
metadata), `-ui-state.json` (camera; ignore), `-thumbnail.png` / `-large.jpg` (ignore), and
`-surface.zip` (26.7 MB of surface data; ignore). **Resolution is manifest-driven, not sniffed**:
`manifest.json` → `Entries[]` with `BaseType: "Simulation"` → `Path`; `Header.EntryPoint(s)` names
the primary simulation by ID. Multiple simulations/objects = more entries. `Header.BuildRevision`
+ `BuildName` give exact version detection. (Content-sniffing survives only as the legacy-format
fallback.)

**Simulation JSON.** Top level: `Name`, `Date` (in-sim date — Import Review only), `TimePassed`,
integrator settings (ignore), and `Entities: []` — 632 in the default save: 1 star, 8 planets,
622 `sso` (asteroids/TNOs), 1 `"dummy"` utility entity (skip it).

**Entity schema (all confirmed SI).** Key fields per entity: `Name`, `Id` (int),
`Category` (`star`/`planet`/`sso`), `Mass` (kg), `Radius` (m), `Density` (kg/m³),
`Age` (SECONDS — Sun reads 4.66 Gyr), `Position`/`Velocity`/`AngularVelocity`/`RotationAxis`
(vectors serialised as `"x;y;z"` STRINGS with E-notation; positions in m, velocities m/s, angular
velocity rad/s), `Orientation` (quaternion `"x;y;z;w"`), `HorizonID` (JPL Horizons reference —
sometimes with a trailing `;`), `Flags`, and `Components: []`.

**Hierarchy: NOT stored.** `Parent` and `CustomOrbitParentId` are `-1` on every body including
planets — §7.3 Hill-sphere inference is REQUIRED, not a fallback. (Caution: names repeat across
categories — the save's "Io" is asteroid 85 Io, not the moon.)

**Components per body** (the environment data): `Celestial` — `AtmosphereMass` (kg),
`MeanMolecularWeightDryAir`, `CustomScaleHeight`, `Luminosity` (W; Sun 3.846e26), `StarType`
(enum, meaning TBC), `MagneticField` (**gauss** — Earth reads 0.31869) + `MagPoleAngle`, and
`SurfaceTemperatureOverride` (≠0 presumably when user-pinned). `HeatComponent` —
`SurfaceTemperature` (K; Sun 5779.6, Earth 286.9), `Albedo` (Earth 0.306), `EmitsLight`.
`CompositionComponent.depots` — **a full mass inventory by material**: Earth carries
`Iron` 1.47e24 kg, `Silicate` 4.50e24 kg, `Water` 1.43e21 kg (the ocean, to the digit), plus
per-gas atmosphere masses (`Nitrogen`, `Oxygen`, `Argon`, `Carbon Dioxide`).

**Consequences for the field map (§6):**

- `makeup` CAN be imported directly after all: Iron/Silicate(/Carbon/ices) depot masses → SSG
  metal/rock fractions (Earth: 0.25/0.75 — matches SSG's Earth). Better than density inference;
  keep density inference as the fallback when depots are absent.
- `atmosphere.composition`: gas depot masses ÷ molecular weights → mole fractions.
  `atmosphere.pressure_bar`: from `AtmosphereMass·g/(4πR²)` (Earth computes ~1.1 bar; the gas-depot
  sum is ~5.15e18 kg vs `AtmosphereMass` 5.95e18 — the gap is likely water vapour; note in review).
- `hydrosphere`: the `Water` depot gives MASS; SSG wants COVERAGE — needs a depth/hypsometry
  heuristic (design detail for Phase 1), flagged in the Import Review.
- **Obliquity** is NOT in `RotationAxis` (that is ±Y for every planet): it is recovered by rotating
  `RotationAxis` by the `Orientation` quaternion and measuring against the orbit normal —
  numerically verified: Earth 23.4°, Uranus 97.8° (its retrograde flip encoded as the +Y axis
  sign), Jupiter 2.2°. Rotation period from `|AngularVelocity|` (Earth 23.93 h sidereal ✓).
- **Per-body `Age` is stored** — §7.4 upgrades from "assume" to "import": take the primary star's
  `Age`; the lifespan cap becomes a VALIDATION (stored age > `getStarLifespanGyr` → clamp + flag).
- **User edits are distinguishable** (open question 8 answered): `SurfaceTemperatureOverride`,
  `UserChanged*` / `UserSet*` flags and `LockedProperties` mark hand-set values — a US-pinned
  temperature can map to review context (and potentially SSG overrides where one exists).
- **Small-body policy — a USER-CONTROLLED mass slider** (622 sso in the default save; 41 sso +
  212 moons in the "whole" save): always import `star`, `planet`, `moon` above the slider, and
  `sso` above the slider. The slider starts at a recommended default (≥ 5e20 kg keeps Ceres + the
  major TNOs) and runs down to "include everything" — the cutoff is the user's call, since their
  browser takes the hit; the UI shows a body-count preview and a performance advisory as the
  slider goes down. Remainder summarised as a count in the Import Review (belt aggregation is the
  future refinement). Skip `"dummy"` utility entities.

### Second sample: "The Whole Solar System" (same build, torn down 2026-07-07)

A 19.6 MB save with a 30.6 MB simulation JSON and **7,951 entities** — 1 star, 9 planets
(including the hypothetical "Planet Nine"), 41 sso, **212 `moon`**, 1 `blackhole`, and 7,687
uncategorised. Findings:

- **Moon representation confirmed**: `Category: "moon"` is a dedicated category; moons carry the
  full component set (Celestial / CompositionComponent.depots / HeatComponent) like planets. The
  Moon (7.346e22 kg) and Europa (4.80e22 kg) verify. `HorizonID` is `null` on moons here — not a
  reliable lookup key.
- **`Parent` is `-1` even for moons** (Phobos, Europa, all 212) — Hill-sphere hierarchy inference
  (§7.3) is confirmed as THE mechanism for every body, not a fallback.
- **The uncategorised 7,687 are simulation particles** — "Saturn Ring Particle", "Sun Ring
  Particle", "Fragment", masses from 0.4 kg to ~5e19 kg. NEVER imported as bodies regardless of
  the slider; counted in the Import Review. Future nicety: the presence of "X Ring Particle"
  entities implies a ring on X — could set SSG's ring flag on the host.
- **Galactic-context guard needed**: the save includes Sagittarius A* (`Category: "blackhole"`,
  7.9e36 kg at 4.4e20 m ≈ 46,000 ly). Naive "most massive = root" hierarchy inference would parent
  the Sun to it. Policy: pick the LOCAL system root (the dominant mass among bodies within a sane
  radius of the populated cluster, e.g. ≤ 1e15 m spread); supermassive far-field objects are
  skipped with an Import Review note. A genuinely LOCAL black hole (within the system scale)
  imports as an SSG black-hole primary — SSG supports those.
- **The JSON is not strictly valid JSON**: bare `NaN` (and presumably `Infinity`) tokens occur
  (e.g. a `Cohesion` field). The converter MUST use a tolerant parse — sanitise `:NaN` /
  `:±Infinity` token positions to `null` before `JSON.parse`.
- **Scale check**: 30.6 MB / 7,951 entities parses fine in Node; browser import at this size is
  viable but is exactly why the §4a slider exists. Fictional/hypothetical bodies (Planet Nine)
  arrive as ordinary planets — imported like any other.

**Still unconfirmed (samples wanted, §3 list):** multi-star saves, object-preset members,
evolved-star distinguishability, the `StarType` enum, and the legacy format.

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

For the NEW format most of the TBC column is now resolved — see §4a for the confirmed entity
schema, units and the depot-derived mappings (makeup, atmosphere, hydrosphere, magnetic field,
obliquity, age). This table remains the intent summary; §4a wins where they differ.

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
| Planet/moon surface temperature    | — (Import Review only)           | discard; SSG derives — used as sanity cross-check |
| Magnetic field (if stored)         | — (or `magneticField.strengthGauss` if explicitly user-set in US) | prefer discard; SSG derives |
| Composition percentages            | — (omit `makeup`)                | discard; density inference derives it. Revisit only if US data proves richer than density implies |
| Luminosity, temperature maps, sim settings, time-step state | —               | discard |
| Non-astronomical objects (spacecraft, humans, fictional) | —                | skip + list in Import Review (constructs mapping = possible future phase) |
| Asteroid/particle groups           | —                                | skip + list in Import Review (belt mapping = possible future phase) |

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
   cosmetic and noted in the Import Review only).

Degeneracies (must be handled, with unit tests):
- Near-circular (`e < 1e-6`): `ω := 0`, measure `ν` from the node (or from x-axis if also equatorial).
- Near-equatorial (`i < 1e-6` or `> 180−1e-6`): `Ω := 0`, `ω` measured from x-axis.
- Retrograde (`i > 90°`): carried as-is; SSG elements support it.
- **Unbound (`e ≥ 1` or `ε ≥ 0`)**: SSG orbits are elliptical only (negative-`a` inputs crash-guarded,
  not simulated). Policy: skip the body, list it in the Import Review as "unbound — not imported". Do NOT
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

### 7.4 System age — must be consistent with the stellar type

SSG physics leans on `age_Gyr` (geology decay, atmospheric escape, belt grinding, brown-dwarf
cooling), and a flat default is physically wrong for hot stars: an O or B star cannot be 4.6 Gyr
old (O-type main-sequence lifetimes are a few Myr). SSG already has the tool for this —
`getStarLifespanGyr(massKg)` in `physics/stellar-evolution.ts` (Sun ≈ 10 Gyr, 10 M☉ ≈ 30 Myr).

CONFIRMED (§4a): new-format saves store a per-body `Age` in seconds (the default save's Sun reads
4.66 Gyr) — so the PRIMARY policy is to **import** it: `age_Gyr = primary star's Age / 3.156e16`,
validated against `getStarLifespanGyr` (stored age exceeding the star's lifespan → clamp to the
§7.4 default below + flag in the Import Review).

Fallback policy when a save carries no usable age (legacy format, or Age missing/zero):

- `age_Gyr = min(4.6, 0.5 × getStarLifespanGyr(massKg of the shortest-lived star present))` —
  i.e. Sun-like and cooler systems default to 4.6 Gyr as before; a B-star system defaults to
  mid-main-sequence for that star (e.g. ~50 Myr), never to an impossible age.
- If the save contains an evolved star (red giant / remnant, if US distinguishes them —
  Phase 0 question), the age must instead be ≥ that star's main-sequence lifetime; SSG's
  giant phase runs to ~1.3 × t_MS, so seed within that window.
- Whatever is chosen is flagged prominently in the Import Review ("system age assumed X Gyr from
  the primary's stellar type — set it in System Settings"). Never guess from the US in-sim clock.

## 8. IDs, naming, collisions

- `system.id` / node `id`s: slugified names + short hash of the file, guaranteeing uniqueness and
  stable re-import (re-importing the same file twice yields identical ids → easy to spot dupes).
- Duplicate body names within the save are allowed (ids disambiguate), but noted in the Import Review.

## 9. Import Review — the audit

The audit is a first-class output, not an afterthought. During conversion the module keeps a
**reference snapshot** of every US value it deliberately did not import (planet/moon surface
temperatures, magnetic fields, luminosities, any US-computed environment values found in Phase 0).
After `systemProcessor.process()` completes, the importer compares SSG's derived results against
that snapshot and produces the Import Review (Phase 1: CLI output; Phase 2: a modal shown after
import).

Each compared value lands in one of three buckets:

- **Aligned** — within tolerance (temperature ±30 K or ±10%, whichever is larger; field strengths
  within an order of magnitude; radii/masses within 1%). Listed compactly, no noise.
- **Misaligned — explained** — outside tolerance with a canned explanation attached. The
  explainable causes we know up front: albedo/cloud model differences (SSG derives Bond albedo
  from makeup + condensing cloud decks), greenhouse model differences, the assumed system age
  (§7.4) driving atmospheric escape and geology, magnetosphere being derived from
  rotation + interior rather than stored, and SSG treating brown-dwarf-mass "planets" as
  self-luminous.
- **Misaligned — unexplained** — outside tolerance with no known cause. Highlighted prominently;
  these are either converter bugs or genuinely interesting physics disagreements, and both are
  worth a look.

The review also carries the bookkeeping: counts of imported stars/planets/moons, skipped entities
with reasons (unbound, non-astronomical, asteroid groups, unparseable), and every assumption
applied (system age, inferred hierarchy, normalised atmosphere fractions, format generation
detected).

## 10. Open questions (Phase 0 exit criteria)

1. Exact member name(s) and schema of the simulation state inside the archive (JSON? XML? both?),
   for BOTH format generations — the public "New Save File Structure" doc is a changelog with no
   schema, so this is sample-driven.
2. Explicit parent/child references vs inference required (affects §7.3 effort).
3. How moons are represented — children or free bodies with close orbits.
4. Atmosphere storage: composition percentages, pressure, or a coarse flag? Units?
5. Rotation period and axial tilt presence + units.
6. Multi-star saves: barycentre data or raw star states only?
7. In-sim epoch/date storage (Import Review interest only).
8. Whether user-edited properties are distinguishable from simulated ones (would let us honour a
   deliberately-set magnetic field while discarding simulated ones).
9. Practical size of a typical save (body count; asteroid particle counts can be huge — confirm
   they are groupable/skippable cheaply).
10. New-format container layout: how multiple simulations and objects are distinguished inside one
    archive, and how a simulation member differs from an object-preset member.
11. Whether evolved stars (red giants, remnants) are distinguishable from main-sequence stars —
    needed for the age floor in §7.4.
12. What US actually computes vs stores for planet environments (temperature, magnetic field,
    luminosity) — determines the reference-snapshot fields the Import Review (§9) can audit.

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
  The Import Review (§9) is the mitigation — frame differences as SSG's physics pass, not data loss.
- **Licence**: reading a user's own save file locally is fine; we ship no US assets. Do not commit
  large `.ubox` fixtures (small hand-made saves only, per the small-assets convention).
- **Non-goals for now**: asteroid fields → belts, spacecraft → constructs, ring systems, starmap
  batch import. All listed in the Import Review as skipped so the user knows they existed.
