# Universe Sandbox (.ubox) Import — Implementation Design

Companion to `ubox-import-spec.md` (the WHAT/WHY — read it first; its §4a teardown findings are
the schema ground truth). This document is the HOW: module layout, interfaces, algorithms and the
test matrix, written to be implemented mechanically without re-deriving decisions. Where this
document and the spec disagree, the spec's policies win.

## Phase 1 — IMPLEMENTED (2026-07-07)

The module (`src/lib/import/ubox/`), CLI (`scripts/ubox2ssg.mjs`) and tests (`ubox.spec.ts`, 21 cases)
are built and green; both real saves convert end-to-end with zero unexplained audit mismatches.
Notes from the build that differ from or refine this design:

- **Two test fixtures, horses-for-courses.** `sol-realistic.json` (from the OFFICIAL default save) is
  trusted for per-body accuracy (composition, obliquity — Jupiter 3.12° ≈ real 3.13°, atmosphere,
  orbits). `moons.json` (from the older hand-built "Whole Solar System" save) is used ONLY for
  structure (moon→planet hierarchy, rings, the Sgr A* far-field guard) — its composition is unreliable
  (its Earth has a hydrogen atmosphere), so no composition assertions run against it.
- **Greenhouse fixed point needs iteration.** A freshly imported ocean world settles its
  greenhouse⇄temperature fixed point over ~4 process passes (Earth climbs 277→289 K as the implied
  ocean-vapour greenhouse converges — SSG iterates it BETWEEN passes, not within one). The CLI (and any
  caller) therefore processes to convergence before presenting/auditing. Not a converter bug; a
  candidate SSG improvement (converge greenhouse in one pass, like albedo) noted for later.
- **CLI runs via vite-node** (`npx vite-node scripts/ubox2ssg.mjs -- <file>`) so `$lib` + `.ts` resolve;
  plain `node` can't. `--out` writes the AUTHORED (pre-process) system; the review reflects the
  converged one.
- **Magnetic field is always "explained"** in the audit — US stores a surface gauss value, SSG derives
  the magnetosphere; they diverge by design (Jupiter US 6220 G vs SSG 4.3 G). `makeup` IS imported from
  depots (stable, idempotent, Earth 0.25/0.75 matches) — the earlier idempotence worry was the
  greenhouse, not makeup.
- **Phase 2 (in-app dialogue wiring + review modal) is NOT done** — deliberately deferred. The feature
  is CLI-testable only until Phase 2 lands.

## 0. Ground rules for the implementer

- Emit AUTHORED INPUTS ONLY (spec §5). Never copy a US-computed environment value onto the system;
  it goes in the reference snapshot for the Import Review instead.
- Never clamp an unbound orbit into an ellipse — skip + review-list (spec §7.1).
- All converter logic lives in `src/lib/import/ubox/` and must be browser-safe (no `node:` imports,
  no `fs`); the CLI wrapper owns file IO.
- UK English in every user-facing string. No emoji in docs or strings.
- The Sol `physics-baseline.test.ts` must stay green; converter tests are additive.
- Version bump + changelog entry on every push, per repo convention.

## 1. Dependency

Add `fflate` (prod dependency) in Phase 1. It runs in Node AND the browser, so the same module
serves the CLI now and the dialogues later. Use `unzipSync` on a `Uint8Array`.

## 2. Files

Phase 1:

```
src/lib/import/ubox/types.ts        // US-side + result interfaces (below)
src/lib/import/ubox/parse.ts        // zip -> manifest -> simulation JSON (tolerant parse)
src/lib/import/ubox/kepler.ts       // state vectors -> Keplerian elements (+ round-trip check)
src/lib/import/ubox/hierarchy.ts    // local-root selection + Hill-sphere parent inference
src/lib/import/ubox/convert.ts      // entities -> SSG System + reference snapshot
src/lib/import/ubox/review.ts       // processed system + snapshot -> ImportReview
src/lib/import/ubox/index.ts        // public API re-exports
src/lib/import/ubox/ubox.spec.ts    // unit tests (matrix in §10)
scripts/ubox2ssg.mjs                // CLI wrapper
tests/fixtures/ubox/                // trimmed fixtures (§10.1)
```

Phase 2 (separate change): dialogue wiring + review modal (§9).

## 3. Public API (index.ts)

```ts
export interface UboxImportOptions {
  simulation?: number | string;   // index or Name when the manifest lists several; default: EntryPoint
  minBodyMassKg?: number;         // the user slider; default 5e20 (RECOMMENDED_MIN_MASS_KG)
}
export interface UboxListing { simulations: { name: string; path: string; entityCount?: number }[]; buildName: string; buildRevision: number; }
export interface UboxImportResult {
  system: System;                 // UNPROCESSED authored-inputs system (caller runs fixUpImportedSystem + systemProcessor.process)
  snapshot: UsReferenceSnapshot;  // discarded US values, keyed by node id (for the review)
  skipped: SkippedEntity[];       // { name, reason }  reasons in §8
  assumptions: string[];          // human-readable, UK English
}
export function listUboxSimulations(bytes: Uint8Array): UboxListing;
export function importUbox(bytes: Uint8Array, options?: UboxImportOptions): UboxImportResult;
export function buildImportReview(processed: System, result: UboxImportResult): ImportReview;
```

Caller contract (CLI and, later, the dialogues):

```ts
const result = importUbox(bytes, opts);
const processed = systemProcessor.process(fixUpImportedSystem(result.system, pack), pack);
const review = buildImportReview(processed, result);
```

## 4. parse.ts

1. `unzipSync(bytes)` → member map. Missing/garbled zip → `UboxError('not-a-zip')`.
2. Read `manifest.json` (tolerant parse, §4.1). Entries with `BaseType === 'Simulation'` are the
   simulations; `Header.EntryPoint` picks the default. No manifest → legacy fallback: scan members
   for JSON with an `Entities` array; none found → `UboxError('no-simulation')`.
3. Resolve the chosen simulation by `Path`; tolerant-parse it; must contain `Entities: []`.
4. Return `{ manifest, sim, buildRevision, buildName }`.

### 4.1 Tolerant JSON parse (REQUIRED — real saves contain bare NaN)

```ts
const sanitised = text.replace(/(?<=[:,\[\s])(NaN|-?Infinity)(?=\s*[,}\]])/g, 'null');
return JSON.parse(sanitised);
```

### 4.2 Value parsers

- `parseVec3('x;y;z') -> [number, number, number]` — split on `;`, `Number()` each (handles
  E-notation). Length !== 3 → throw.
- `parseQuat('x;y;z;w') -> [x,y,z,w]`.
- `cleanHorizonId('85;') -> '85'` — strip trailing semicolons; may be null.

## 5. kepler.ts — state vectors → elements

```ts
export interface StateVectorResult { elements: OrbitElements | null; unbound: boolean; }
export function stateVectorsToElements(rRel: V3, vRel: V3, mu: number): StateVectorResult;
```

All SI in, SSG units out (`a_AU = a / 1.495978707e11`). Algorithm (spec §7.1):

1. `h = r × v`; `n = [-h[2]... ]` — node vector `n = ẑ × h` where ẑ is the ORBIT-FRAME up.
   NOTE the US frame: orbits lie in the XZ plane, Y is "up" (Earth's position has Y ≈ 0, its spin
   axis is −Y). Use ŷ = (0,1,0) as the reference normal and measure inclination against it; i.e.
   swap the textbook z-role for y. Equivalently: transform US (x,y,z) → work frame (x, z, y) once
   on input and use textbook formulas unchanged — DO THIS (single, testable transform).
2. `e_vec = ((|v|² − µ/|r|)·r − (r·v)·v)/µ`; `e = |e_vec|`.
3. `ε = |v|²/2 − µ/|r|`. If `ε >= 0` or `e >= 0.999` → `{ elements: null, unbound: true }`.
4. `a = −µ/(2ε)`.
5. `i = acos(h_z/|h|)` (work frame). Degeneracies:
   - `e < 1e-6`: `ω := 0`; true anomaly measured from the node (or x-axis if also equatorial).
   - `i < 1e-6` or `i > π − 1e-6`: `Ω := 0`; `ω` measured from the x-axis.
6. `Ω = atan2(n_y, n_x)`; `ω` = signed angle n→e_vec; `ν` = signed angle e_vec→r (sign of `r·v`).
7. `E = 2·atan(tan(ν/2)·sqrt((1−e)/(1+e)))`; `M0_rad = E − e·sinE` (normalise to [0, 2π)).
8. `mu` for the call = `G·(massParent + massChild)`; the EMITTED `orbit.hostMu` = `G·massParent`
   (SSG convention — see the Sol fixture).

Round-trip guard (test-time, not runtime): propagate the emitted elements at `t0` with SSG's
`propagate()` and require < 0.1% of |r| deviation.

### 5.1 Obliquity + rotation (verified against the sample, spec §4a)

```ts
axisWorld = quatRotate(parseQuat(e.Orientation), parseVec3(e.RotationAxis));
orbitNormal = normalize(cross(rRel, vRel));            // per body, not a global constant
obliquityDeg = acos(clamp(dot(axisWorld, orbitNormal) / |axisWorld|, -1, 1)) * 180/π;
rotationHours = 2π / |parseVec3(e.AngularVelocity)| / 3600;   // |ω| = 0 → omit the field
```

`quatRotate(q, v)` = the standard `v + 2·s·(u×v) + 2·(u×(u×v))` with `q = [u, s]` (implementation
verified in the teardown: Earth 23.4°, Uranus 97.8°, Jupiter 2.2°). Emit `axial_tilt_deg` (and
`obliquity_deg` — SSG uses both names; set both to the same value).

## 6. hierarchy.ts

### 6.1 Local root selection (guards against Sagittarius A*)

1. Candidates = entities with Category `star`, `planet`, `blackhole`.
2. Compute the mass-weighted centroid of the `star` + `planet` positions ONLY.
3. Root = the most massive candidate within `LOCAL_RADIUS_M = 1e15` (≈ 6,700 AU) of that centroid.
4. Every candidate outside `LOCAL_RADIUS_M` → skipped, reason `far-field` ("Sagittarius A* —
   galactic-context object, not part of the local system").

### 6.2 Parent inference (every body — US stores no hierarchy)

Process bodies in descending mass. For body B:

1. Candidates = already-placed bodies more massive than B (root always qualifies).
2. For each candidate C: `rRel = pos(B)−pos(C)`, `vRel = vel(B)−vel(C)`,
   `ε = |vRel|²/2 − G·(mC+mB)/|rRel|`. Bound iff `ε < 0` AND `|rRel| < hillRadius(C)`, where
   `hillRadius(C) = a_C·(1−e_C)·(mC/(3·mRoot))^(1/3)` for a non-root C (use C's already-inferred
   orbit), and ∞ for the root.
3. Parent = the bound candidate with the smallest `|rRel| / hillRadius` (deepest relative binding);
   none bound → parent = root.

`roleHint`: parent is a star/barycentre → `planet` (Category `sso` also becomes `planet` — SSG's
classifier handles dwarf planets); parent is a planet → `moon`; the root star → `star`; a LOCAL
`blackhole` → `star` with `classes: ['star/BH']` and `temperatureK: 0`.

Multi-star (untested — no sample yet): if two `star` entities are mutually bound with mass ratio
< 10:1, emit a `barycenter` node as both stars' parent (combined-mass elements for the pair
members), and run planet parenting against star vs barycentre by the same Hill logic. Gate this
behind a sample teardown before trusting it.

## 7. convert.ts — entity → node mapping

Constants: `AU_M = 1.495978707e11`, `G = 6.674e-11` (use SSG's `constants.ts` G), `L_SUN = 3.846e26`,
`GYR_S = 3.156e16`, `RECOMMENDED_MIN_MASS_KG = 5e20`.

Filtering order: drop `Name === 'dummy'`; drop uncategorised entities (particles/fragments —
count + ring aggregation §7.6); apply the mass slider to star/planet/moon/sso (stars in practice
always pass); far-field skip from §6.1; unbound skip from §5.

Per surviving entity:

| SSG field | Source |
|---|---|
| `id` | `us-<simHash>-<entity.Id>` (simHash = 8-hex FNV/djb2 of the sim JSON text) |
| `name` | `Name` (trimmed; duplicates allowed, review-noted) |
| `kind` | `'body'` |
| `roleHint` | §6.2 |
| `massKg` / `radiusKm` | `Mass` / `Radius/1000` |
| `orbit` | §5 (skip for the root) |
| `rotation_period_hours` | §5.1 |
| `axial_tilt_deg` + `obliquity_deg` | §5.1 |
| `age (system)` | §7.4 |
| `atmosphere` | §7.2 |
| `hydrosphere` | §7.3 |
| `makeup` | §7.1 |
| `magneticField.strengthGauss` | `Celestial.MagneticField` ONLY if user-pinned (a `UserChanged`/`LockedProperties` marker names it); otherwise omit — SSG derives. Snapshot always records it. |
| `temperatureK` (STARS only) | `HeatComponent.SurfaceTemperature` |
| `radiationOutput` (stars) | `Celestial.Luminosity / L_SUN` |
| `classes` (stars) | temperature → letter: O ≥ 30000, B ≥ 10000, A ≥ 7500, F ≥ 6000, G ≥ 5200, K ≥ 3700, else M → `['star/<letter>']` |
| `tags`, `areas` | `[]` |

Snapshot per body (review-only): US `SurfaceTemperature`, `Albedo`, `MagneticField` (gauss),
`Luminosity`, `Density`, `Age`, and pressure-input intermediates.

### 7.1 Makeup from depots

Depot-name map: `Iron→metal`, `Silicate→rock`, `Carbon→carbon`, ices (`Water Ice`? TBC) → `ice`.
Sum mapped INTERIOR depot masses (gases and `Water` excluded); normalise to fractions; emit
`makeup` when the mapped sum ≥ 90% of `Mass − atmosphereMass − waterMass`, else OMIT makeup
entirely (density inference takes over). Unknown depot names: review-noted, excluded.

### 7.2 Atmosphere from gas depots

Gas map + molecular weights: `Nitrogen→N2 (28)`, `Oxygen→O2 (32)`, `Argon→Ar (40)`,
`Carbon Dioxide→CO2 (44)`, `Hydrogen→H2 (2)`, `Helium→He (4)`, `Methane→CH4 (16)`,
`Ammonia→NH3 (17)`, `Sulfur Dioxide→SO2 (64)`. Mole fractions = (mass/MW) normalised.
`pressure_bar = Celestial.AtmosphereMass · g / (4π·R²) / 1e5` with `g = G·M/R²`.
Emit `atmosphere = { composition, pressure_bar, main: <largest fraction> }` when
`AtmosphereMass > 0` and at least one gas depot maps; pure-unknown-gas atmospheres → emit pressure
with composition `{}` + review note. (Earth sanity: fractions ≈ N2 0.78/O2 0.21, pressure ≈ 1.1 bar.)

### 7.3 Hydrosphere from the Water depot (heuristic — flagged in review)

`depth_m = WaterMass / (1000 · 4π·R²)`; `coverage = clamp(0.71 · sqrt(depth_m / 2790), 0, 1)`
(Earth-anchored: 1.43e21 kg on Earth's radius → depth ≈ 2,790 m → coverage 0.71). Emit
`hydrosphere = { composition: 'water', coverage }` when coverage ≥ 0.02. Always review-noted as a
heuristic. (Cold worlds: emit anyway — SSG's fluid/phase pass decides ice vs liquid.)

### 7.4 System age

`age_Gyr = rootStar.Age / GYR_S`, validated: if it exceeds `getStarLifespanGyr(rootStar.massKg)`,
clamp to `min(4.6, 0.5 × lifespan)` + review flag. Age missing/0/null → the spec §7.4 fallback.

### 7.5 System shell

`{ id: 'us-<simHash>', name: sim.Name || filename, seed: 'us-<simHash>', epochT0: Date.now() at
conversion, age_Gyr, nodes }` — plus `assumptions[]` entries for every §7.x heuristic applied.

### 7.6 Ring aggregation (cheap win — include in Phase 1)

Group skipped particles named `<Host> Ring Particle` by `<Host>`. If the host body was imported
and the group has ≥ 50 members: compute each particle's orbit radius `|pos − hostPos|`; emit a
child node `{ roleHint: 'ring', parentId: host, radiusInnerKm: p5 percentile, radiusOuterKm: p95
percentile }` (SSG's existing ring shape). Fewer than 50 → review count only.

## 8. Errors and skip reasons

`UboxError(code)` codes: `not-a-zip`, `no-simulation`, `unrecognised-format`, `empty-system`
(zero importable bodies). Skip reasons (enum, used in review): `particle`, `dummy`, `far-field`,
`unbound`, `below-mass-threshold`, `object-preset`, `unparseable-entity`.

## 9. Phase 2 wiring (separate change, after CLI proves the module)

- `GenerationWizard.svelte` (~line 229) and `SystemView.svelte` (~line 2150): extend `accept` to
  `"application/json,.json,.ubox"`; in the handlers, branch on `file.name.endsWith('.ubox')` →
  `new Uint8Array(await file.arrayBuffer())` → `listUboxSimulations` (>1 → picker; a tiny modal
  listing names, radio + OK) → `importUbox` → the existing `fixUpImportedSystem → process` path →
  `buildImportReview` → show `UboxImportReviewModal.svelte`.
- `UboxImportReviewModal.svelte`: compact popup (repo popup conventions) with three sections —
  counts/assumptions, the audit table (aligned collapsed by default; explained + unexplained
  expanded), skipped list. A "mass slider" control on the picker step showing the live body count
  (re-run the filter client-side; conversion is fast, the zip is already inflated) and the §4a
  performance advisory below the recommended default.
- Version bump + changelog on push.

## 10. Test matrix (ubox.spec.ts — all against trimmed fixtures)

### 10.1 Fixtures (build once, by hand-trimming the real saves)

`tests/fixtures/ubox/sol-trimmed.json` — from the "Whole Solar System" sim JSON, keep VERBATIM
entities: Sun, the 8 planets (+ "Planet Nine"), Moon, Io/Europa/Ganymede/Callisto, Ceres, Pluto,
Sagittarius A*, the `dummy`, ~60 "Saturn Ring Particle" entities and 2 "Fragment"s; keep the sim
top-level fields; delete the rest. Target < 300 KB. `tests/fixtures/ubox/minimal.ubox` — a real
zip built by a tiny script (checked in as binary, a few KB): manifest + a 3-body sim
(star/planet/moon), including one bare `NaN` token on purpose.

### 10.2 Cases (expected values from the verified teardowns)

parse: zip+manifest resolution; multi-sim listing; NaN tolerated; not-a-zip / no-simulation errors.
kepler: circular-equatorial, eccentric-inclined, retrograde synthetic cases; unbound → null;
round-trip vs `propagate()` < 0.1% for every fixture body.
frame/obliquity: Earth 23.4° ± 0.5, Uranus 97.8° ± 1, Jupiter 2.2° ± 0.5; Earth rotation
23.93 h ± 0.02.
hierarchy: Moon→Earth; Io/Europa/Ganymede/Callisto→Jupiter; Ceres+Pluto→Sun; root = Sun;
Sgr A* skipped `far-field`; ring particles skipped `particle`; dummy skipped `dummy`.
convert: Earth atmosphere N2 0.76–0.80 / O2 0.19–0.23, pressure 0.9–1.3 bar; Earth makeup metal
0.22–0.28; Earth hydrosphere coverage 0.65–0.77; age 4.6–4.7 Gyr; star class `star/G`;
radiationOutput 0.95–1.05; Saturn gets a ring node with sane radii; slider at 5e20 keeps
Ceres+Pluto, drops a 4e20 synthetic.
end-to-end: converted fixture → `fixUpImportedSystem` → `process` runs clean; second `process` is
stable (idempotence, matches heat-model-wiring invariant); Earth classifies terrestrial and lands
`habitability/human` or better.
review: US Earth temp 286.9 K vs SSG derived → within explained tolerance; a synthetic mismatch
lands `unexplained`; snapshot never leaks onto the emitted system (assert no `temperatureK` on
planets pre-process).

## 11. CLI (scripts/ubox2ssg.mjs)

```
node scripts/ubox2ssg.mjs <input.ubox> [--sim <index|name>] [--min-mass <kg>]
                          [--out <system.json>] [--review <review.json>] [--list]
```

Node file IO + `fflate`; imports the module and the rule pack the same way the tests load it
(`static/rulepacks/starter-sf` deep-merge, as in `heat-model-wiring.test.ts`); prints the review
summary to stdout in a readable table; non-zero exit on `UboxError`. `--list` prints the
simulations and exits.
