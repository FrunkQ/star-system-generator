# Non-standard objects — ONE capability record, and consumers that stop guessing

STATUS: DESIGN ONLY (inbox G58). Nothing in this document is built. It exists because the owner
called a stop/think on 2026-08-31, mid-way through G53, at exactly the right moment: the mega
machinery is half-constructed, every hook it needs has now been touched once, and the next four
queued features would each have been wired by hand into the same dozen seams.

## 1. The case, in the owner's words

*"User will ask for things like Solettas which will require 2d/3d drawing options, a decision of
which elements of the physics system [apply] and whether it is classed as a ring, body or construct
for selection framing. In addition some megaconstructs need a subset of body edit panels and
potentially vice versa. So we have all the elements but we are combining them haphazardly."*

*"We should create a flexible system for 'non-standard' objects — a standalone config with a
matrix of which physics engines to turn on and off... Otherwise I think we are building an
if/then/else rat's nest — rather than take the opportunity to create a new manageable subsystem.
May be used to create black hole stars and other rare/theorised celestial objects and alien
constructs... These files can even hold the object drawing logic to allow total visual
objectification alongside how to edit/descriptions, etc. And we can build a 'how to make your own
non-standard objects' [guide]... Abstract now — save a ton of problems going forward."*

And the example that makes it concrete (same day): *"normally a construct has a spin (separate) to
determine apparent G. On a ring/construct you will actually be using ITS orbital period to work
this out. An example of a system needing to be wired differently IF the megaconstruct config file
can describe [it]."* One quantity — apparent gravity — three honest wirings: a station reads its
own spin section (`spinRadiusM` + `rotation_period_hours`); a ringworld reads its rotation KNOB at
its own radius; an orbital ring around a world reads its rotation about the host **with the host's
pull netted off** (net g = ω²r − GM/r², exactly zero at orbital rate — free fall — which is the
number the engine owes rather than either term alone). Today the crew tab assumes every construct
is a station, which is how the 12,967,908 g ringworld happened to be possible at all: a mega's
figures were mirrored into station-shaped fields so an old panel could read them. The fix shipped;
the SMELL is the subject of this document.

## 2. The probe — where per-type decisions actually live today

Measured against the tree at v3.0.233, during the session that built most of them. This is the
"haphazard combining": THIRTEEN seams, five ad-hoc flags, four keyed switches. A new object type
today touches most of these by hand, and three of them have already produced shipped faults
(RENDER-S45/S46, the crew-tab g figure).

| # | Seam | Where | Decides |
|---|------|-------|---------|
| 1 | Chrome predicate | `constructs/chrome.ts` (DATA-R31) | wears construct chrome? physics-artificial? |
| 2 | THE REGISTRY | `constructs/megaTypes.ts` (G37 roster) | params, `derive()`, `shape()`, `requires`, icon, `skinnable`, `dished`, `allowedPlacements` |
| 3 | Placement | `constructs/megaPlacement.ts` (UI-B2) | hard greys vs steer notes |
| 4 | Geometry | `constructs/megaGeometry.ts` | family switch: sphere-section / tether / spheroid |
| 5 | 3D attach + per-frame | `holo/scene.ts` — attach ~2713, showModel ~3135, scale ~3235, position ~3251, stand-up ~4910 | `megaCentred` / `megaTether` flags, six branch sites |
| 6 | Selection framing | `holo/scene.ts` `computeBase` | FOUR shot kinds by flag: annulus (belt shot), surface-host close-up, point construct, whole-system |
| 7 | 2D structure | `SystemVisualizer.svelte` `isMegaRing` ~797 | orbit-line-as-structure vs glyph |
| 8 | Starlight | `physics/starlightOcclusion.ts` | occluder discovery keyed on `megaType`; isotropic vs band from two derived fields |
| 9 | Edit panels | tab rosters by `kind`; `ConstructCrewTab` | which panels exist; WHERE apparent g comes from (§1's example) |
| 10 | Zoom/LOD | hull pixel-LOD vs belt LOD (§5b.5) | how it degrades with distance |
| 11 | Extent/scale | RENDER-S2 + the phase-5 centred-body hazard | contributes radius to framing/extent? |
| 12 | Redaction | `kind`-based (phase 5 open question 3) | what players see |
| 13 | Labels | anchor + visibility by kind | the owner's 2026-08-30 tweak list: ring label centred on nothing; elevator label absent with Earth selected |

The registry (#2) is already 60% of the answer — G53 §5b built it precisely so a type is a RECORD.
What it does NOT yet own is everything downstream: the CONSUMERS still test flags and keys.

## 3. The instances already queued, and two shipped assumptions they falsify

G53 phases 5 (hybrid flip), 5b (asteroids — the category's second entrance), 5c (interior surfaces,
G56 §10), 6 (soletta, Shkadov, Birch ring, aerostat); G54's nebulae; the owner's black-hole stars
(quasi-stars) and alien constructs. Every one is a bundle of answers to the §2 matrix.

**The soletta already falsifies a shipped guard.** `physics/luminosity.ts
receivedLuminosityWatts` clamps transmission to ≤1, commented *"nothing between a star and a world
manufactures light"*. True of every occluder — and false of a MIRROR, whose whole point is that
its target receives more than bare inverse-square. The first new catalogue member breaks the
freshest seam in the engine. The flux capability must be typed (occludes / amplifies-target),
not hardcoded "dims only".

**The crew tab already falsified a display.** §1's spin example — the g figure read station-shaped
fields on a non-station. Fixed numerically (v3.0.234); structurally it is seam #9 waiting to
recur on the next type.

## 4. The proposal — widen the record; the consumers stop guessing

Keep `megaTypes.ts` and the G37 roster pattern — it is proven and its header already argues this
case. Add ONE `capabilities` block to the record, and migrate every §2 consumer to switch on a
DECLARED capability instead of a type key, a `kind`, or a scattered flag. Sketch (names
illustrative; the build decides final vocabulary):

```ts
capabilities: {
  physics: {
    classification: 'derived' | 'declared',            // today: `artificial` (DATA-R31)
    gravityWell: 'point-mass' | 'none',                //  may things orbit IT (phase 5)
    apparentG: 'spin-section' | 'own-rotation' | 'orbit-net-of-host' | 'surface',  // §1's example
    flux: { occludes?: 'isotropic' | 'band'; amplifies?: 'target' },               // §3's soletta
    emission: 'none' | 'waste-heat-ir',                // G54's observed end
    surfaceChain: 'body' | 'interior-band' | 'none',   // G56 §10; the phase-5 honesty gate
  },
  render3d: { generator: 'sphere-section'|'tether'|'hull'; anchor: 'host-centred'|'node'|'surface-stand'; lod: 'hull-px'|'belt' },
  render2d: { structure: 'orbit-line' | 'none'; glyph: ConstructIconShape },
  framing: 'annulus' | 'surface-host' | 'point',       // computeBase's three construct shots, named
  ui: { panels: readonly PanelId[]; menu: 'construct'|'body'|'both'; labelAnchor: 'node'|'structure' },
  disclosure: 'as-body' | 'as-construct' | 'anonymous', // phase 5 Q3 + G54's middle rung
  outputs: { tags?: readonly TagEmission[] },          // §4b
}
```

Rules carried over from the lessons that built the pieces:
- **Functions stay pure code** (`derive`/`shape`/generators) — E7's discipline, the load-bearing
  G53 decision. A pack file cannot carry a function and must never need to.
- **Packs pick and parameterise; code defines the vocabulary.** A pack template names a base record
  and overrides DATA (params, requires, capability choices among registered values). An unknown
  capability key PASSES WITH A WARNING (UI-B2's rule, applied to ourselves).
- **A capability earns an axis only when two types disagree on it.** Otherwise it is a constant,
  not a capability — the guard against the matrix becoming its own rat's nest.
- **Flags die as consumers flip** (`megaCentred`, `megaTether`, `isMegaRing`…) — clear-old-code:
  each seam's flip deletes the flag it replaces in the same commit.

### 4b. Declared outputs — the owner's tagging ask lands here

Owner, 2026-08-31: *"for recent deliverables i think we could have added some tagging to objects
affected — eg: occluded by ring."* Phase 4 stamps `starlightDimming` (structured, for the trace);
what it does not do is speak TAG — the engine's lingua franca for filters, pills, and G54's
disclosure ladder. Under this design a record DECLARES its tag emissions (e.g. the flux capability
emits `mega/shadowed-by` onto affected bodies, value = occluder name, share), the processor stamps
them exactly as other derived tags, and G54's `anon` rung can then hide the CAUSE while presence
survives — *something is dimming this world* — with zero extra machinery.

## 5. What this is NOT

- Not new physics: the migration changes no number anywhere.
- Not a plugin system: capabilities are a closed, code-owned vocabulary per build.
- Not a rewrite: phase N1 is declaration + parity, behaviour identical by gate.

## 6. Phasing (each shippable alone)

- **N1 — DECLARE + PARITY.** Records gain `capabilities`; the existing flags become DERIVED from
  declarations at the same sites they are set today. Gate: full suite green, plus a parity spec
  asserting the derived flags equal the old literals for every registry record. Zero behaviour
  change, by construction.
- **N2 — CONSUMERS FLIP, one seam per commit.** computeBase reads `framing`; the 2D reads
  `render2d`; attach reads `render3d`; occlusion reads `physics.flux`; the crew tab reads
  `apparentG` (§1). Each commit deletes the flag/switch it replaces and adds/corrects an
  engine-map entry.
- **N3 — G53 PHASE 5 RIDES THE RECORD.** The hybrid flip's kind change, chrome, redaction and the
  §10 honesty gate all become declarations. This is the payoff: the riskiest queued change becomes
  a data edit plus the already-flipped consumers.
- **N4 — EXTENSIBILITY PROOF + THE GUIDE.** Soletta (typed flux: amplifies-target; annulus
  framing; orbit-line 2D) and Shkadov (event driver, G41's hook) built as records. The authoring
  guide `docs/dev/authoring-nonstandard-objects.md` is written AGAINST these two builds, not from
  imagination.
- **N5 — THE BODY-SIDE ENTRANCE.** Quasi-stars / black-hole stars and friends: `menu: 'body'`,
  full classification, exotic capabilities. §3.7's "two entrances" generalised.

## 7. Gates and risks

Parity spec at N1 (red-first: flip one declaration, watch it catch the drift). Idempotence
untouched throughout — capabilities are static data, nothing derives from a prior pass. The two
real risks are named above as rules: capability explosion (two-types-disagree rule) and a
half-migrated engine living with two conventions (one seam per commit, engine-map entry each, and
N2 does not pause mid-seam).

## 8b. ANSWERED — the owner's calls, 2026-08-31, and N1's shipped shape

1. **The system is named EXOTICS.** `constructs/exotics.ts` holds the vocabulary; `MegaTypeDef`
   keeps its name until the N2/N3 flips touch its import sites (as-touched, the DATA-R31 pattern).
2. **Packs INSTANTIATE, they do not remix.** Capability blocks are code; a pack picks a registered
   type and sets params. A new behaviour combination is an app release, deliberately.
3. **Coarse panel groups**, split only when two types disagree.
4. **All four visual tweaks ride N2** — and the owner added: the record must own the PLACEMENT
   GATES — which menu/interface offers a type, and whether it shows available or greyed there
   (space elevator in deep space = greyed with its sentence). That is `requires` +
   `allowedPlacements` + `explain`, already record-owned (UI-B2); named part of the vocabulary now.

**N1 SHIPPED (v3.0.236): declare + parity.** Five axes on every record — `apparentG`, `flux`,
`render3d`, `render2d`, `framing` — each consumed from day one by `exoticsParity.spec.ts` (seen
red on a flipped declaration). Axes where all seven types agree are deliberately ABSENT until a
second value exists (the two-types-disagree rule, and the board's own `secretDefault` lesson):
`ui.menu` arrives with N5, panel groups with phase 5's honesty gate, LOD with N2's belt-LOD flip,
`disclosure` with N3, declared tag outputs with the N2 flux flip that emits them. Engine map:
DATA-R33. **The authoring guide exists from N1** (owner's call, same day - agent-friendly):
`docs/dev/authoring-exotics.md` - the map, the add-a-type recipe, the seam table (updated with
every flip), and the rules for growing the vocabulary. N2 flips next, one seam per commit,
tweaks riding their seams.

## 8. Open questions for the owner

1. **Naming** — "non-standard objects"? "exotics"? The word ends up in docs and the authoring guide.
2. **Pack authors** — may a pack REMIX capabilities on a template (recommended: yes, warn on
   unknown), or only instantiate registered types?
3. **Panels** — full per-tab roster in the record from N1, or coarse groups (crew/physical/orbit)
   first and split later?
4. **Sequencing vs the visual pass** — the remaining 2026-08-30 tweak list (ring tilt input +
   oriented render, label anchor, elevator label rule, 2D elevator glyph) sits EXACTLY on seams
   N2 flips. Recommended: fold them into N2 as the first flips rather than wiring them ad hoc now
   and migrating them a week later. The owner's call, since three of them are judgement-by-eye.
