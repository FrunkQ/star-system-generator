# Generation rebalance — B58 + G24 + G18: handoff for a fresh session

Written 2026-08-17 by the coordinator from inbox [[B58]], [[G24]] and [[G18]], every code claim below
re-verified in the tree at v2.1.740-beta the same day. This is the brief; the inbox rows are the history
and carry the owner's own words.

**Why this is first.** `WelcomeModal.svelte`'s feature list is the V3 release-scope statement, and its
"Sharper generation" line — *procedural systems retuned to sit inside the new physics* — is the ONE
unpending claim the build cannot currently back. It is also the only generation complaint a user has
made unprompted: *"generated planets around red dwarfs should orbit much closer in than they do"* and
*"planets around brown dwarfs spawn EXTREMELY far out."* Both are one fault.

**Sequence, and it matters:** B58 first; then MEASURE the sliders (G24 part 1) because B58 may fix
half of it; then G18 as a DESIGN NOTE that stops for owner sign-off before any moon code; G24's banded
slider last, or hand it back. Do not start G18's implementation from its inbox entry — the owner asked
for the design first.

## Read first, in this order

1. `docs/dev/observations-inbox.md` — the standing rules at the bottom (worktree per session; stage
   explicit files, never `git add -A`; `changelog.md` is tracked lowercase; bump the patch version on
   every push; `npm run build` green before push; commit as FrunkQ <frunk@frunk.net>; the two GENERATED
   fixtures churn under vitest and are never committed; the two load-bearing rules — FLEXIBLE SYSTEMS
   OVER POINT SOLUTIONS with Sol as a CALIBRATION ANCHOR not a target, and NEVER ASSUME A SOL BASELINE
   IN DERIVATION). Then the [[B58]], [[G24]] and [[G18]] rows in full — the owner's research for the
   moon system is IN the G18 row and must be used, not re-derived.
2. `docs/dev/generation-duplication-map.md` — TWO live system generators, three body-creation routes.
   Ask which entry point reaches the code you are changing before you change it.
3. `docs/dev/engine-map.md` — grep `GEN-` and `DATA-R` before touching a pack or a generator. GEN-1 is
   a preservation order on the Accrete path; DATA-R14 says never load-and-re-dump a rule pack (one key
   cost a 6,385-line diff — edit pack JSON as targeted text).
4. `docs/dev/v4-scope.md` — V4 replaces this generation wholesale with an accretion engine. **Fix
   cheaply here; do not design the final form.**
5. `docs/dev/debug-tools.md` — measure, then change.

## What is true in the tree today (verified 2026-08-17)

**The wizard runs `generateSystemFromConfig`** (`GenerationWizard.svelte:9`, called at `:192`) with
`knobs: { metallicity, diskMass, dynamicalHistory, rarity }` (`:32`), which are the four sliders. The
legacy path is `planet-generation.ts`. **Both call the same `calculateOrbitalSlots`** from
`src/lib/generation/placement-strategy.ts` (`generateFromConfig.ts:14`, `planet-generation.ts:6`), so
one fix reaches both. (`placement.ts` is a different, unrelated 37-line file — classification validity.)

**B58's root cause, exactly as recorded:** `placement-strategy.ts:21` reads
`pack.distributions.titius_bode_law`; the shipped pack `static/rulepacks/starter-sf/generation.json:405-409`
carries `a: 0.4, b: 0.3, c: 2.0` — the constants FITTED TO SOL, in ABSOLUTE AU, with no scaling by
anything about the star. Slots: 0.4, 0.7, 1.0, 1.6, 2.8, 5.2, 10.0, 19.6, 38.8 AU. They are filtered
to `> minOrbitAU && < systemLimitAu` (`:30`), SHUFFLED and SLICED to the planet count (`:55-56`, "this
simulates empty slots in the T-B sequence"), then jittered. So 0.4 AU is the innermost orbit any star
can have; because the list is shuffled then sliced, most systems never draw it, which is why the user
sees a floor near 0.5. TRAPPIST-1's seven planets sit between 0.011 and 0.062 AU. **The `Math.max(minOrbitAU, 0.2)` at `:34` is the FALLBACK branch, dead while the pack ships a T-B block — fixing it changes nothing.**

**The zones are already right and unused for spacing.** `src/lib/physics/zones.ts:11 getLuminosity`
computes L from radius and temperature by Stefan-Boltzmann; `calculateAllStellarZones` (`:284`) returns
silicate line, frost line, formation frost line, CO ice line, goldilocks band and `systemLimitAu =
coIceLine * 2` (`:312`). The placement uses these ONLY as min/max filters. So the engine already computes
the numbers a scaled spacing needs and then does not use them. **That is what makes B58 small.**

**The dim-star failure is the same fault, worse.** For an L dwarf, `systemLimitAu` is roughly 1.6 AU,
so slots 0.4–1.6 survive and planets land a hundredfold outside the habitable zone. For a Y dwarf the
limit falls near 0.15 AU, below every slot, so the slot list is EMPTY and the loop at
`planet-generation.ts:47` (`for i < slots.length`) simply makes zero planets. Measure that: zero
planets around a Y dwarf may be right, but it must be a decision, not an accident.

**Why the sliders look dead (G24 part 1) — the entanglement is real and I have the line numbers.**
`generateFromConfig.ts:392-393`: `countMultiplier = 0.4 + diskMass * 1.6` (0.4× to 2×); `:350` caps
the count at `min(12, base × multiplier)`; but T-B yields at most NINE slots, the zone filter removes
some, and `slice(0, numBodies)` cannot exceed the survivors. So "amount of material" moves a number
that is then clamped by the slot list. Metallicity and dynamical history DO act (`applyKnobBias`,
`:40-72`: makeup shift for planets, axial-tilt spread for stars — the star tilt is deliberately
UNCONDITIONAL, see the comment there and inbox B10; do not re-guard it). Rarity feeds the type draw.
Re-measure all four AFTER B58 before widening anything.

**G18's anchors have moved a few lines:** `planet.ts:371-372` count from
`pack.distributions[isGiant ? 'gas_giant_moon_count' : 'terrestrial_moon_count']` via `weightedChoice`;
`:374-377` a `log10(mass)` scaling for giants; `:380` the flat `Math.min(numMoons, 30)` cap; type
restriction by parent at `:141-164`; `planet.ts` recurses into itself for moons; `generateBodyOfType.ts`
and `generateFromConfig.ts` are the other two body-creation routes. B59's MASS half is fixed (satellite
mass budget, `:383` onward); counts and types are what remain.

## B58 — the fix, and the two rules on it

**Replace Titius-Bode with MUTUAL HILL RADIUS spacing.** Adjacent planets in observed multi-planet
systems are separated by a roughly constant number of mutual Hill radii,
`R_H,mut = ((m1 + m2) / (3 M*))^(1/3) × (a1 + a2) / 2`; Kepler multis cluster near ~20 (Weiss et al.
2018), gigayear stability needs roughly ≥10 (Pu & Wu 2015). The stellar mass is IN the expression, so
spacing scales with the star for free; the planet masses are in it, so a giant clears more room; and it
PACKS outward from the inner edge rather than sampling nine fixed slots, so a compact seven-planet
M-dwarf system inside 0.06 AU falls out instead of being impossible. Titius-Bode has no physical basis
and already fails for Neptune. **"Peas in a pod"** (same paper — adjacent planets tend to be similar in
size) is worth taking at the same time because it constrains what goes IN the slots.

**Rule 1 — no invented constants; the spacing parameters are PACK DATA.** Replace the `titius_bode_law`
block with a spacing block (e.g. mean and spread in mutual Hill radii, and the inner-edge rule) edited as
targeted text. Anchor the inner edge on zones the engine already computes (`minOrbitAU` from Roche and
soot line is already there at `:19`; the silicate line is available). Keep the T-B branch readable by a
pack that still declares it ONLY if that costs nothing; otherwise remove it and say so — DATA-R14
notes apply either way.

**Rule 2 — check against Sol, fit to nothing.** With a 1 M☉ star and Sol-like masses the sequence
should come out Sol-LIKE in scale (inner terrestrials inside ~2 AU, giants beyond the frost line) — not
Sol's exact numbers. If Sol comes out wildly wrong, the law is wrong; if it comes out exact, you have
fitted. Then check TRAPPIST-1-scale (0.09 M☉): planets inside 0.1 AU. Then an L dwarf: planets exist
and sit near its habitable zone, not at 1 AU. Then a Y dwarf: whatever it does, it does deliberately.

**Sparseness** — the owner's second observation — has two causes in the same function (nine slots
maximum; shuffle-and-slice discards the rest). Packing removes both. Whether to keep some deliberate
GAPS (Jupiter's neighbourhood is empty because a giant clears it, which the Hill term already gives you)
is physics, not a die roll.

## G24 — measure, then range, then banding

**Part 1, the range bug:** after B58, re-measure what each of the four knobs moves on a fixed seed
across its full travel — count, innermost/outermost orbit, mass spread, type mix, tilt. Report the
numbers. Widen or re-wire ONLY what measures dead or too small. [[B56]] is the precedent (a control
whose draw was concentrated in part of its range read as broken).

**Part 2, the realism band — a VOCABULARY, not a slider feature.** Owner: *"green zone in the middle
for realistic… orange/red for increasingly fantastical (but possible… just unlikely)."* Three rules
from the entry: **(a) band edges are PACK DATA, never constants in code;** **(b) amber reads as
"few real systems look like this", never "invalid"** — hand authoring is allowed, the band tells the
user which side of the physics they are on; **(c) build ONE banded-slider component with ranges
supplied as data**, because every generation control and several physics controls want the same
treatment — writing it for the material slider alone is the point-solution trap. This part can be
handed back if the session is running long; say so rather than half-shipping it.

## G18 — the moon system: DESIGN NOTE FIRST, then stop

Deliverable: `docs/dev/moon-generation-design.md`, short, then STOP for the owner's sign-off. Build on
the physics the owner supplied in the G18 row: **(1) the mass-scaling rule** — a giant's circumplanetary
disc aggregates ~1/10,000 of the host mass into satellites, which replaces the bolted-on cap with a
physical budget and is the single highest-value change; **(2) the ~1.6 R⊕ barrier** — fractionally
large moons (a Luna) form only around rocky worlds below it; **(3) distance and abundance** — cold
wide giants keep moons, hot Jupiters lose them to stellar tides, and the engine already derives Hill
radii and orbital distance. **ONE shared moon system across all three generators**, and it should share
its type vocabulary with the existing "Add moon here…" picker rather than drift from it — the owner
asked for that reuse explicitly. **Confirm with the owner, do not assume:** which slider feeds what
(his steer: Rarity biases moon TYPES up to "an Earth-like moon around a gas giant" at the top; disk
mass and dynamical history plausibly feed count and eccentricity/inclination spread). Related traps in
the row: [[C5]] (the Laplace plane — where a moon can orbit at all), [[C8]], [[D8]].

## Acceptance

- Fixed seed, 0.09 M☉ star: innermost planet inside 0.1 AU; several planets inside the frost line.
- Fixed seed, 1 M☉ star, Sol-like masses: terrestrials inside ~2 AU, giants beyond the frost line;
  NOT Sol's exact orbits.
- L dwarf: planets generated, near its own habitable zone. Y dwarf: deliberate result, no silent zero.
- Adjacent-pair spacing in mutual Hill radii lies in the pack's stated band for every generated system
  in a 200-seed sweep; no pair below the stability floor.
- Slot count is no longer hard-capped at nine; `diskMass` at 1.0 visibly produces more planets than at
  0.0 on the same seed, and the numbers are in the entry.
- The four knobs' measured effects, before and after, are written into the [[G24]] row.
- `generateFromConfig.spec.ts` extended (or a sibling added) so a regression to absolute-AU slots fails
  loudly. `idempotence.test.ts` and `physics-baseline.test.ts` still green (generation is not in the
  fixture, so they should not churn; if they do, find out why before committing anything).
- `docs/dev/moon-generation-design.md` exists, is short, and ends with the questions for the owner.
- No new constant in code that a pack could have carried.

## Deliverables

1. `placement-strategy.ts` on Hill-radius spacing; the pack's spacing block; tests. Both generators
   confirmed to route through it.
2. The G24 measurements in the inbox row; range/wiring fixes if measurement demands; the banded slider
   ONLY if there is room, else say so.
3. `docs/dev/moon-generation-design.md` — then stop and hand back for sign-off.
4. ONE engine-map entry per non-obvious rule you had to work out (`GEN-<next>`, the file's format:
   claim / WHERE / RULE / WHY / BLAST), same commit as the code. If you falsify an existing entry,
   correct it in the same commit.
5. Changelog line prepended AFTER "All notable changes are listed here:", version bumped, build green,
   push beta. Update the [[B58]]/[[G24]]/[[G18]] status cells with versions.
6. `WelcomeModal.svelte:65` carries a comment saying B58/B59/G24 are the named remaining faults behind
   the "Sharper generation" line — update that comment when B58 lands; the line's own wording is the
   owner's call after he has eyeballed a few generated systems.
7. Documentation-debt line in the inbox naming which user doc describes generation and needs the new
   spacing explained (the physics page and `docs/classification-and-tags.md` are the usual two).

## Rules that will bite here

- Two generators are LIVE. Test the wizard AND the legacy Generate path.
- Never load-and-re-dump a rule pack (DATA-R14). Targeted text edits only.
- A grep that returns nothing is not an absence — say what you searched.
- Sol is an anchor. Check every anchor (Sol, TRAPPIST-1, an L dwarf, a Y dwarf); fit to none.
- Anything that changes what generation IS (dropping T-B entirely, what a Y dwarf should get, which
  slider feeds which moon property) — recommend, then ask. Do not decide.
- If the browser pane is unavailable, say exactly what remains unseen. A generation change wants the
  owner's eyes on a handful of systems, and that is a thirty-second list you can hand him.
