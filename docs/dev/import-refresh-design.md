# Import refresh — one infill, one age model, one star ladder (design note)

Written 2026-08-18. Owner's brief: the importers (Traveller, Universe Sandbox, SpaceEngine, the
real-sky catalogue, and our own generate-after-star-pick) predate the new star classes, planetary
compositions, tagging and physics, and each has its own private copy of things that should be one.
Refresh them to share ONE infill system with the same four dials the wizard has, ONE age model that
guesses an age from the star rather than assuming 4.6 Gyr, and ONE star-class ladder. Every claim
about the tree below was checked at v2.1.786-beta.

**This is a design note first, per the standing rule for anything that changes what generation IS.
Nothing here is implemented.**

## 1. The user's ubox report — read carefully, it is not an age bug

*"Out of 34 objects, 30 unbound including the main star ... sets the age to 4.6 Gyr ... sets the
system around one of the gas giants as a red dwarf while making its moons planets."*

The user's own conclusion is that the 4.6 Gyr default is what prevents the system loading. **It is not,
and the age is a symptom.** `ubox/convert.ts:300 resolveAge` is already star-aware: it takes the
file's stored age if the primary has one, else `min(4.6, half the primary's lifespan)`. For an A star
that is about 0.4 Gyr, not 4.6. The user saw 4.6 because the importer **found no star at all** — the
"no star found to date the system" branch is the only one that returns a flat 4.6.

Everything else follows from that one miss, in this order:

1. `ubox/hierarchy.ts:47` picks the root as the most massive body among candidates whose
   `Category` is `'star'`, `'planet'` or `'blackhole'`, within 6,700 AU of the mass-weighted centroid.
   The A star was either **not in that set** or **far-field**. Given "sets the system around one of the
   gas giants", the most massive *surviving* candidate was a giant, so the star was excluded.
2. With a giant as root, its moons bind to it as "planets" (`roleHint` is `parent.roleHint === 'star'
   ? 'planet' : 'moon'`, and the root is always tagged star) — *"making its moons planets"*.
3. Every other body tries to bind to the giant with `mu = G × (giant + body)`; most fail the bound test
   against a host that light — *"30 of 34 unbound"*.
4. `convert.ts:105` sets `rootStarEntity` only if `e.Category === 'star'`; a giant root fails that,
   so `resolveAge` gets `null` → **4.6 Gyr**.
5. A root with a giant's temperature and no luminosity classifies as the coldest thing the ladder knows
   — *"a red dwarf"*.

So the single question for that file is: **what `Category` does Universe Sandbox write on the user's
A star, and where does it sit relative to the rest?** Two likely answers, both fixable here:

- The user made the star by editing a body up (a common US workflow) and it carries `Category:
  'planet'` or something else. Fix: **infer stellarhood from physics when the file's label is
  absent or contradicted** — a body above ~0.075 M☉ (or with a stated luminosity) is a star whatever
  the file says. Today `Category` is read straight from the file with no fallback (`parse.ts`).
- The star sits beyond 6,700 AU of the mass-weighted centroid — unlikely for a normal scene, but a
  scene with a distant massive object could shift the centroid. Fix: **the root candidate should be
  the most massive body, and the centroid should be re-derived after excluding nothing that is
  stellar** — or simply, when exactly one body is stellar-mass, it is the root.

Both belong in section 4 (ubox). Until the file is in hand, tell the user: *the age is downstream;
the importer did not recognise your star as a star. Check its category in Universe Sandbox, and send
the file.*

## 2. What exists today, importer by importer

| | star class | age | infill | tags |
|---|---|---|---|---|
| **ubox** | private ladder `starClassFromTemp` (`convert.ts:40`), stops at M | `resolveAge`: stored, else `min(4.6, ½ lifespan)`; flat 4.6 only when no star | none | `origin/imported`-style via review |
| **SpaceEngine** | private `starClassFromSpectral` (`convert.ts:34`): letter from the SE class string, **anything unrecognised → G** | max stated star age, else flat 4.6 | none | as above |
| **Traveller** | its own token parser (`importer.ts:149-171`): BD→L, D→WD, NS/PSR, BH, letter+digit assumed V | `rng.range(1, 10)` — **random** (`:658`) | **its own**: `_generatePlanetaryBody` + `calculateOrbitalSlots` directly (`:332`, `:435`, `:606`), no knobs | own |
| **real sky** | `starClasses(sp)` from the catalogue spectral type; falls to `UNKNOWN_STAR_CLASS`; B44 fixed the M default | measured, else 4.6 with `ageEstimated: true` (B47c) | **`fillOutSystem`** (`realsky/fillout.ts`) — the closest thing to unified infill that exists | `origin/generated` on fill |
| **generate after star pick** | wizard: `determineSpectralClass(T, pack)` — the one ladder that now knows L/T/Y (v2.1.785) | GM-chosen | `generateSystemFromConfig` with the four knobs | full |

Four private star ladders, all stopping at M, one defaulting to G. Three age policies (star-aware,
flat, random). Two infill paths that share nothing. That is the duplication rule firing four times
in one row.

## 3. The design — three shared pieces

### 3a. One star ladder

`physics/stellar-evolution.ts determineSpectralClass(tempK, pack)` already reads every letter from the
pack's `subclass_anchors` (v2.1.785). Every importer routes its temperature-to-letter through it, and
its spectral-string parse through `starDesignation.ts starClassParts` + `starClassKeyFor`. Delete the
four private ladders. **SpaceEngine's "unrecognised → G" becomes "unrecognised → derive from the stated
temperature, else `UNKNOWN_STAR_CLASS`"** — the real-sky importer already has that honest fallback
(B44), so this is a routing job.

Guard: `starFamily.spec.ts` gains a case per importer that a brown-dwarf temperature/class string
comes out L/T/Y, not M or G.

### 3b. One age model — `guessSystemAge(star, stated?)`

A single function, in `physics/stellar-evolution.ts` beside `ageStar`, returning
`{ ageGyr, band: [lo, hi], source, estimated }`:

- **stated** (file/catalogue carries an age): use it, clamped to the primary's lifespan; band is
  ±(a few %); `estimated: false`.
- **guessed** from the primary: the honest guess is *the middle of the main-sequence life* for a
  main-sequence star (`0.5 × t_MS`, capped at the age of the galaxy ~13 Gyr — which is what
  `resolveAge` already does for ubox), *near the end of it* for a giant (`t_MS × (1 + 0.15)`), *the
  cooling age* for a white dwarf if temperature is stated (Mestel: `t ∝ (T)^-7/5`, and the engine has
  a WD cooling track in `ageStar`), *young* for a pre-main-sequence indicator, and **for a brown dwarf,
  the age is genuinely unknown** because they cool forever — the band is wide and the guess is a
  galactic-median ~5 Gyr. `estimated: true`, and the band is what the UI shows as "reasonable for
  this star".
- **multi-star**: the most massive luminous member dates the system (they formed together), and it
  is a lower bound if any member is evolved.

Where it flows: **every importer calls it once** and stores `age_Gyr` + `ageEstimated` + `ageBand` on
the system. Traveller stops rolling a random age. SpaceEngine and ubox stop writing flat 4.6.
`ageEstimated` already exists on `System` (real-sky, B47c) — reuse it, do not add a second flag.

**Owner's rule, and it matters for what infill does NOT do:** on import we are *determining* an age
to associate with what was uploaded, so it aligns with the star. **We do not age the imported planets
from their number** — they are captured as current state and adopt the star's age. The generator's
`ageGyr` is passed to infill so *generated* worlds are born into the right era (formation windows,
escape, cratering); *imported* worlds are left alone.

### 3c. One infill — `infillSystem(system, pack, opts)`

Generalise `realsky/fillout.ts fillOutSystem` and move it to `generation/infill.ts`. It already
does the right thing: seed the wizard's generator from the star, drop generated worlds within a
mutual-Hill exclusion of any anchor, letter the survivors, tag them `origin/generated`, keep
determinism (`orbit.t0 = EPOCH`, seeded RNG). What changes:

1. **Takes the four knobs** (`{ metallicity, diskMass, dynamicalHistory, rarity }`) and passes them to
   `generateSystemFromConfig`. Today it passes none, so real-sky fill runs at defaults.
2. **Takes `ageGyr`** from 3b rather than reading `system.age_Gyr` blindly.
3. **Multi-star**: real-sky's is single-star only. `generateSystemFromConfig` already handles a
   hierarchy from multiple seeds; infill builds one seed per luminous member and lets the generator's
   own S-type/P-type placement do the rest. Anchors are checked per host.
4. **Anchor respect is the whole point** — a generated world never displaces an imported one, and the
   mutual-Hill exclusion is why. Keep it; make the multiplier pack data.
5. **Traveller** stops calling `_generatePlanetaryBody` and `calculateOrbitalSlots` directly and calls
   infill with its Main World as the anchor and its `W` count as a target. That is also where the
   owner's "the interesting-infill sliders could be added to the importer to give them control on
   number" lands: `diskMass` *is* that control.
6. **Rings, belts and moons of generated worlds** come along with them, as today.

Then **one UI**: an "Infill" step after every import (and after generate-from-star-pick, which is
just infill with zero anchors), showing the same four dials with the same one-line explainers, plus
the age with its band and an "estimated" marker. Skip is a first-class button — the owner does not
want infill forced.

## 4. Per-importer work, once the shared pieces exist

- **ubox**: (a) the Category/root fix from §1 — infer stellarhood from mass/luminosity, root = the
  stellar-mass body; (b) route the star ladder; (c) call `guessSystemAge`; (d) offer infill. Then
  the user's file, when it arrives, is a test fixture.
- **SpaceEngine**: (b), (c), (d); kill the "→ G" default.
- **Traveller**: (b) via `starClassKeyFor` on its parsed tokens (BD is a brown dwarf: L/T by the
  token's digit if present, else L); (c) replaces `rng.range(1,10)`; (d) replaces its private
  generation. Its own decoder tests stay; add an importer test — there is none today (noted at
  v2.1.751).
- **real sky**: already closest; (a) `fillOutSystem` becomes a thin call to `infillSystem`; the
  fill-out toggle on the import modal becomes the infill step.
- **generate after star pick**: already the wizard; the only change is that its knob panel and the
  infill panel are literally the same component.

## 5. What is deliberately NOT in scope

- **Re-ageing imported planets.** Owner's rule. They are current state.
- **Repairing bad orbits from ubox vectors.** The Kepler solve is honest about hyperbolic states and
  says `unbound`; the fix in §1 is about picking the right root, not about forcing a bound orbit.
- **The banded slider (G24 part 2).** The infill panel is exactly where it will be wanted, and
  `realistic_dial` on the rarity and metallicity blocks is the marker it needs — but it is its own
  item.
- **The moon system (G18).** Infill inherits whatever generation does for moons; when G18 lands,
  infill gets it for free because it calls the same generator.

## 6. Questions for the owner

1. **Should infill be offered on every import, or only when the import is sparse?** A ubox scene
   with 34 bodies probably does not want three more; a Traveller world with a Main World and a `W`
   count does. Proposal: always offer, default *off* when the import already has ≥ 3 planets around
   the primary, *on* otherwise — and say why in the panel.
2. **Age band presentation.** "Estimated 0.4 Gyr (reasonable range 0.1–0.8 for an A5V)" — is a
   band under the age slider enough, or should the UI insist on a click to confirm before proceeding?
   Owner's words were "force the user to determine it in the UI after import"; a pre-filled slider
   with the band shaded and a Continue button seems the honest middle.
3. **Traveller `W` count vs disk mass.** Should the Traveller importer *set* `diskMass` from the
   profile's world count and let the GM adjust, or leave the dial at default and treat `W` as a
   hard target? Proposal: set it, show it, let them move it.
4. **The user's ubox file.** Ask for it. Until then §1 is a strong diagnosis and not a fix.

## Sequence, if signed off

1. `guessSystemAge` + tests (small, self-contained, unblocks everything).
2. `generation/infill.ts` from `fillout.ts` + knobs + multi-star; real-sky routes through it.
3. Star ladder routing in ubox / SE / Traveller; delete the four private ladders.
4. ubox root/Category fix.
5. Traveller onto infill; its first importer test.
6. The infill panel (shared component with the wizard's knob rows).
7. Docs: physics page `#generation` gains an "Importing and infilling" paragraph; each importer's
   design doc gets a one-line pointer to this note.
