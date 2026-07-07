# SpaceEngine (.sc / .pak) Import — Design

Sibling to the Universe Sandbox importer (`ubox-import-design.md`). SpaceEngine is a MUCH closer fit to
SSG than Universe Sandbox: it stores **Keplerian orbital elements** (like us) and an **explicit
parent** per body, so the import is close to 1:1 — no state-vector conversion, no hierarchy inference.

Status: DESIGN — needs real `.sc` / `.pak` samples before the parser + mapping are built (units are the
main unknown; see §7).

## 1. What's reused vs new

Reused from the ubox importer (refactor the shared bits into `src/lib/import/shared/`):

- **The `.pak` archive reader** — `.pak` is a ZIP. The ZIP64-safe central-directory reader already
  written for `.ubox` (parse.ts `inflate`) reads it as-is; just filter to `.sc` members instead of
  `.json`. Move it to `src/lib/import/shared/zip.ts`.
- **The Import Review / diff** — `buildImportReview` + `reviewToText` + the aligned/explained/needs-a-look
  buckets. SpaceEngine gives us MORE authored data (composition, sometimes temperature), so there's less
  to derive and fewer differences, but the audit is still worth showing.
- **The modal** — generalise `UboxImportModal.svelte` into an `ImportModal` that takes a source adapter
  (preview → optional mass slider → import → review → copy → load). SpaceEngine has far fewer bodies per
  file, so the mass slider may be unnecessary / hidden.
- **Process-to-convergence** on load, and the authored-inputs-only principle.

New for SpaceEngine:

- **`src/lib/import/spaceengine/parse.ts`** — a tokeniser/parser for the `.sc` brace format.
- **`src/lib/import/spaceengine/convert.ts`** — the near-1:1 `.sc` → SSG `System` mapping.
- Wiring: the file pickers also accept `.sc` and `.pak`.

## 2. The `.sc` format (from knowledge — CONFIRM against samples)

A `.sc` file is a hierarchical script, NOT JSON. Grammar, roughly:

```
// line comments like this
BodyType "Name"
{
    Key            Value            // scalar: number, quoted string, or bareword
    Key2           "quoted value"
    NestedBlock
    {
        Key        Value
    }
    Vector         ( x, y, z )       // parenthesised tuples occur (colours, positions)
}
```

- **Body types** (each a top-level or nested block): `Star`, `Planet`, `Moon`, `DwarfMoon`, `Asteroid`,
  `Comet`, `Barycenter`, and catalogue variants. Multiple bodies per file; a `.pak` bundles many `.sc`.
- **Hierarchy**: `ParentBody "Name"` names the parent explicitly (may reference a body in another file
  within the same `.pak`, or a built-in SpaceEngine catalogue body — see §7 open questions).
- **Comments** `//`; possibly `/* */`. Keys are case-sensitive barewords. Strings are `"quoted"`.
- Whitespace/newline separated; a value runs to end-of-line or the next token.

## 3. Body → SSG node mapping (first pass — units TBC in §7)

| SpaceEngine `.sc`                    | SSG field                         | Notes |
|--------------------------------------|-----------------------------------|-------|
| Block type (`Star`/`Planet`/`Moon`…) | `roleHint` (`star`/`planet`/`moon`) + `kind:'body'` | `Barycenter` → SSG `barycenter` node |
| `"Name"` (block label)               | `name`                            | direct |
| `ParentBody "X"`                     | `parentId` / `orbit.hostId`       | resolve name → node id (the easy hierarchy) |
| `Class "G2V"` (star)                 | `classes: ['star/G']`             | map SpaceEngine spectral class → SSG star class |
| `MassSol` / `MassJup` / `MassEarth` / `Mass` | `massKg`                  | convert by the unit the KEY implies |
| `Radius` / `RadiusSol` / `RadiusEarth` | `radiusKm`                      | convert by key unit (Radius likely km) |
| `Orbit { SemiMajorAxis }`            | `orbit.elements.a_AU`             | **unit? AU default — CONFIRM** |
| `Orbit { Eccentricity }`             | `orbit.elements.e`                | direct |
| `Orbit { Inclination }`              | `orbit.elements.i_deg`            | degrees (relative to `RefPlane` — see §7) |
| `Orbit { AscendingNode }`            | `orbit.elements.Omega_deg`        | degrees |
| `Orbit { ArgOfPericen }`             | `orbit.elements.omega_deg`        | degrees |
| `Orbit { MeanAnomaly }`              | `orbit.elements.M0_rad`           | degrees → radians (or `MeanLongitude` → derive) |
| `Orbit { Period }`                   | (cross-check `a` via Kepler's 3rd)| don't need it if `a` given; use for the audit |
| `Orbit { Epoch }`                    | Import Review only                | SSG uses one epoch (conversion time) |
| `RotationPeriod` / `Rotation{Period}`| `rotation_period_hours`          | unit? hours/days — CONFIRM |
| `Obliquity`                          | `axial_tilt_deg` + `obliquity_deg`| degrees |
| `Atmosphere { Composition {…}, Pressure }` | `atmosphere`                | map species names + pressure unit |
| Surface temperature (if present)     | — (Import Review only)            | discard; SSG derives, audit against it |
| Interior composition (if present)    | `makeup` if clean, else omit      | let density inference handle otherwise |

Everything SSG derives (temperature, classification, geology, magnetism, habitability, colour) is NOT
emitted — same authored-inputs-only contract as the ubox importer.

## 4. Why the hard parts vanish

- **No state vectors** → `kepler.ts` (the US import's biggest module) is not needed at all; the elements
  map straight across.
- **Explicit parent** → `hierarchy.ts` (local-root selection + Hill inference) is not needed. We just
  resolve `ParentBody` names to ids. A body whose parent isn't in the file/pak (references a built-in SE
  catalogue body) is either re-rooted or flagged — §7.
- **Barycenters are explicit** → the multi-star case the ubox importer had to GATE is just a
  `Barycenter` block here (SSG already has a barycenter node type + `reconcileBarycenters`).

## 5. `.pak` handling

A `.pak` is a ZIP of `.sc` files (and textures we ignore). Reuse the shared ZIP64 reader, filter to
`.sc`. One `.pak` may define a whole system across several `.sc` files; parse all `.sc` members, merge
their body definitions into one namespace, then resolve `ParentBody` across them.

## 6. Reference frame + units — the ONE real risk

SSG stores `a_AU` in AU and angles in degrees, orbits in a single ecliptic-like plane. SpaceEngine:

- `SemiMajorAxis` is (probably) AU for planets but may be km for close moons — CONFIRM whether a unit
  suffix or a separate key (`SemiMajorAxisKm`?) is used.
- `RefPlane` (Ecliptic / Equator / Laplace) sets the plane inclination is measured against — SSG has one
  plane, so we map everything to it (Ecliptic ≈ SSG's plane; Equatorial/Laplace need care or a note).
- `Period` in days vs years; `RotationPeriod` in hours vs days.
- Angles: SpaceEngine degrees → SSG degrees (M0 → radians).

These are exactly the things a real sample settles in five minutes and a guess gets wrong.

## 6a. Phase 0 findings — confirmed against 3 real .sc files (2026-07-07)

Torn down: `SolarSys.sc` (catalogue Sol), `Random.sc` (procedural single-star + 258 bodies),
`Binary-life.sc` (procedural binary, 2 stars + 720 bodies). All facts below verified.

- **Format**: `BodyType "Name" { ... }` blocks; `//` line comments; `Key Value` (value to end of line)
  and `Key { nested }`. Values: numbers (incl. `9e-6`), quoted strings (may contain `/` aliases and
  spaces), parenthesised tuples `( r g b )` (colours), and numeric arrays (rotation `PeriodicTerms`).
  Top-level non-body directives exist (`LogLevel 0`) — skip anything that isn't a known body block.
- **Body types seen**: `Star`, `Planet`, `Moon`, `DwarfMoon`, `Comet`, `Barycenter`. (Asteroid likely
  exists too.) Comets/DwarfMoons dominate procedural files (180–650 each) → the mass slider applies here
  too.
- **Hierarchy**: `ParentBody "Name"` is explicit and ALIAS-AWARE — the Sun is `Star "Sun/Sol"` and
  Mercury's `ParentBody "Sun"` must match it. Index every `/`-separated alias. ROOT = a body whose
  `ParentBody` names something not defined in the file (Sol's `"Solar System"`) OR references itself
  (the binary's root `Barycenter` has `ParentBody` = its own name). A root `Star` → SSG star root (no
  orbit); a root `Barycenter` → SSG barycenter root.
- **Orbit — TWO conventions, both present**:
  - Procedural: `Eccentricity`, `Inclination`, `AscendingNode` (Ω°), `ArgOfPericenter` (ω°),
    `MeanAnomaly` (M0°) — map straight across (M0° → rad).
  - Catalogue: `AscendingNode` (Ω°), `LongOfPericen` (ϖ°) → ω = ϖ − Ω, `MeanLongitude` (L°) →
    M0 = L − ϖ.
  - `SemiMajorAxis` = AU; **`SemiMajorAxisKm` = km** (close moons — divide by AU_KM). `Period` = years
    (cross-check only). `AnalyticModel "…-DE"` present alongside elements → use the elements; if ONLY
    AnalyticModel and no `SemiMajorAxis` → treat as root (the Sun).
  - `RefPlane`: `"Ecliptic"` (catalogue) or `"Equator"` (procedural). SSG has ONE plane, so map the
    numbers directly and note RefPlane in the review — mixed frames are a minor visual inaccuracy, not
    worth reconstructing.
- **Units confirmed**: star `MassSol`/`RadSol`, `Temperature` (K), `Luminosity`/`LumBol` (L☉),
  `Age` (Gyr), `Class` (spectral, e.g. "G2V", "K1.9 V"); planet/moon `Mass` (Earth masses),
  `Radius` (km); `RotationPeriod` (hours; Mercury 1407.5 h ✓); `Obliquity` (deg). Also-possible variants
  to accept: `MassJup`/`MassEarth`/`MassKg`, `RadiusSol`/`RadiusKm`. `RotationModel "IAU"{ RotationRate
  deg/day }` → period = 360/rate × 24 h when `RotationPeriod` absent.
- **Environment blocks**:
  - `Interior { Composition { Silicates, Metals, Ice, Hydrogen, … } }` — mass-fraction PERCENT →
    SSG makeup (Silicates→rock, Metals→metal, ices→ice, H/He→gas). Normalise to fractions.
  - `Atmosphere { Pressure (atm), Composition { N2, O2, … } (percent) }` → SSG atmosphere (species %/100
    → fractions; pressure atm ≈ bar). `NoAtmosphere true` → none.
  - `Ocean { Height, Composition { H2O, NaCl } }` → SSG hydrosphere water. NO coverage given → assume a
    default (~0.7) and flag, or leave for the user. Height is depth, not coverage.
  - Discard (SSG derives; audit against them): `AlbedoBond`, `Greenhouse` (K), planet `Temperature`,
    planet `Luminosity`. `Life { … }` block exists (Earth, the "life-bearing" binary) — note only.
- **Multi-system**: a file is normally ONE connected tree (one root). If several roots appear, treat as
  several systems → a picker (reuse the ubox multi-sim pattern).

## 7. Open questions (mostly ANSWERED above — remaining nuances)

1. Exact unit conventions per key (SemiMajorAxis, Radius, Period, RotationPeriod, the Mass* variants).
2. Full set of body-type block names actually used, and how `Barycenter` nests its members.
3. How `ParentBody` references resolve when the parent is a built-in SpaceEngine object not in the file
   (re-root under a synthesised star? flag + skip? let the user pick a root?).
4. `RefPlane` handling — is Ecliptic the norm, and how often Equatorial/Laplace appears.
5. Atmosphere/composition representation (species keys, pressure units, whether interior layers appear).
6. `.pak` layout — how many `.sc` per system, textures/other members to skip, any manifest/index.
7. Comment styles (`//` only, or `/* */` too), and whether values ever span lines or use unit suffixes.
8. Whether a single `.sc`/`.pak` can hold MANY unrelated systems (→ a picker, like ubox multi-sim).

## 8. Samples wanted

Ideally, from the current SpaceEngine version (note the version):

1. A hand-authored single-system `.sc` (a star + planets + a moon) — the common case.
2. A `.sc` using a `Barycenter` (binary star) — confirms the multi-star path.
3. A real addon `.pak` (a downloaded system pack) — confirms `.pak` layout + cross-file `ParentBody`.
4. Anything with an `Atmosphere`/`Composition` block and a `Rotation` block — confirms those mappings.

## 9. Phases

- **Phase 0** — samples + confirm §7. (Blocking, like ubox.)
- **Phase 1** — refactor shared bits (`import/shared/zip.ts`, generalise the review + modal), build the
  `.sc` parser + convert, CLI (`scripts/sc2ssg.mjs`), tests against trimmed sample fixtures.
- **Phase 2** — wire `.sc` + `.pak` into the file pickers (the modal is already generalised).

Because there's no state-vector or hierarchy code, Phase 1 here is a good deal smaller than the ubox one.
