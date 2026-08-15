# One TYPE VOCABULARY, forward and inverse (DESIGN OUTLINE, 2026-08-13)

Status: **PROMOTED FROM PRE-V4 TO ACTIVE, 2026-08-15 — this is [[B48]]**, the star classification
rewrite, scoped by the owner: *"totally rewrite the star classification engine as we have always HAD
luminosity as a value just never rolled up into the definition. So rebasing on SIMBAD-style
definitions"*, with the star-ageing lifecycle rolled in. Extended in section 9 with what was measured
on 2026-08-15; the outline above section 9 is as written on 2026-08-13 except where marked CORRECTED.
Originally owner-initiated.

Owner, 2026-08-13: *"I think there is a pre-V4 refactor required to better integrate the various
planet and star types (the picker) and their inverse use cases (the classifier). I think we have
allowed a couple of systems to evolve independently."* And, on what actually matters: *"They should
be unified — otherwise if you 'pick something' it may not register as what you picked. That is the
only real danger."*

That second sentence is the whole specification. Everything below serves it.

## 1. The invariant

> **For every type T in the vocabulary, a body created AS T must classify back AS T.**

One line, testable, and it is the only acceptance criterion this work needs. Picking is the forward
direction; classifying is the inverse; a vocabulary is sound when they compose to identity.

## 2. What is actually true today — measured, not assumed

Do not take the "two systems evolved independently" framing at face value. It is half right, and the
half that is wrong changes the priority.

**THE PLANET SIDE ALREADY DOES THIS, AND IT WORKS.** `classification.json` holds one fingerprint
table used FORWARD by `generateBodyOfType` (its own comment: "the fingerprint bands ARE the recipe")
and INVERSE by `classifyByFingerprint`. The round trip is already tested by
`classification.audit.spec.ts`, which builds a prototype per fingerprint and reports any type that
classifies as something else. **Measured 2026-08-13: 63 of 64 base types round-trip.** The single
exception is `gas-giant -> super-jupiter`, documented and accepted (the generic fallback's band
centre legitimately IS a super-Jupiter).

So this refactor is not inventing a pattern. It is applying the one that already works to the half
that never got it.

**THE STAR SIDE HAS NO CLASSIFIER AT ALL.** Of 70 fingerprints in the pack, 65 are `planet/*`, 5 are
belt/ring, and **0 are `star/*`**. A star's class is authored input; the processor never re-derives
it (`importFixup` preserves `star/*` explicitly, and wiping it leaves a star colourless). The inverse
exists only as ~~two~~ **THREE** ad-hoc ladders:

- `starClasses(spectralType)` in `import/realsky/stars.mjs` — catalogue string to classes.
- `updateClassFromTemp(k)` in `components/BodyStarTab.svelte` — the editor's temperature ladder.
- **CORRECTED 2026-08-15 — `classifyStar(...)` in `physics/stellar-evolution.ts:209`**, which takes
  (Teff, L, M, age) and returns a category AND a luminosity class. It was missed here because its
  output barely escapes the physics layer. **It is the only one of the three that looks like a real
  classifier, and it is WRONG — see section 9.** That matters for step 2 of section 6: the match
  bands cannot be lifted from it.

**AND THERE ARE THREE TABLES OF PER-CLASS FIGURES**, in three different homes:

| | where | kind | used by |
|---|---|---|---|
| `SPECTRAL_DATA` | `BodyStarTab.svelte` | CODE | the star editor's picker |
| `statTemplates` | `rulepacks/starter-sf/stars.json` | DATA | the generator, and the real-sky importer since D18 |
| `baseArchetypes` | `system/classification.ts` | CODE | the LEGACY classifier path, dormant |

Class lists now match 16 for 16 (the pack was missing `star/L`, `star/T` and `star/Y` until
v2.1.546 — a brown dwarf the generator had to fill in came out at 0.92 solar masses and 5,600 K).
**But the VALUES disagree for 8 of the 16.**

## 3. Why the danger is not live today, and why that is not reassuring

This matters for sequencing, so it is worth stating plainly rather than implying urgency that is not
there.

`updateClassFromTemp` classifies on TEMPERATURE ALONE, and all three tables agree on temperature for
9 of 10 main-sequence classes (`star/M` differs 2000 vs 2400 K, `star/Y` 0 vs 300 K — band-edge
slack; a 2,000 K star still comes back M). The 8 classes whose figures disagree — `WD`, `NS`,
`magnetar`, `BH`, `BH_active`, `red-giant`, `O` — disagree on MASS and RADIUS, which nothing
classifies on. Better still, `updateClassFromTemp` returns early for exactly those exotic classes:
once picked, they are pinned.

**So the tables disagree precisely where it does not bite.** Pick a white dwarf and you get a white
dwarf. What you do not get is the same white dwarf a GENERATED one would be.

**The reason to do this before V4 is therefore prophylactic, and it is the strongest argument
available:** V4 rewrites the generators. The moment stars are derived from physics the way planets
are, a star vocabulary with match bands is REQUIRED — and if it does not exist, a fourth table gets
invented under deadline. That is when "pick X, get Y" starts happening, silently, in the one release
where nobody is looking for it.

## 4. The shape

**One record per type, in RULE-PACK DATA, carrying three faces of the same thing:**

- **match bands** — what the classifier tests against (the inverse).
- **generation bands** — what the picker and generator draw from (the forward).
- **presentation** — label, image, description (the UI).

Three consumers, one source: classifier, generator/picker, editor. Stars gain fingerprints for the
first time; planets keep theirs.

**THE RESOLUTION RULE FOR THE 8 DISAGREEMENTS IS MECHANICAL, NOT A JUDGEMENT PER CLASS:**

> Generation bands must lie INSIDE match bands.

Because the classifier decides what a body registers as, the generator may only produce values that
classify correctly. That derives the answer wherever the two tables differ, rather than asking
someone to prefer the editor's wider ranges or the pack's tighter ones. Where a generation band
cannot fit inside its match band, the vocabulary itself is wrong and the test says so.

## 5. Type and tags — the one place the owner's framing wants qualifying

The proposal included "integrate tagging into their base morphology as the primary info carrier
after fixed physical data". Agreed in direction, with one qualification worth building in rather
than discovering:

**Tags are ADDITIVE and unordered. Type is EXCLUSIVE.** `classifyByFingerprint` deliberately pushes
one base and then only modifiers, and that guarantee is load-bearing: D11 was an entire item spent
establishing that four bodies apparently carrying two base types at once were not doing so. Collapse
type into tags and the exclusivity has nowhere to live.

So: **tags carry the derived, additive, quantified facts; TYPE is the single exclusive summary drawn
from the same vocabulary.** One vocabulary, two shapes — not one shape for everything. This is
consistent with `architecture-physics-tags-visuals.md`, which already says physics decides and tags
record; type becomes another thing physics decides.

## 6. Order of work

**RECONCILED 2026-08-15. This section predates sections 9 to 12 and its step 2 said "AUTHOR `star/*`
fingerprints", which everything since contradicts** — [[B50]] established that the bands are regions
on a surface that already exists, and [[B55]] brought in the full MK designation space, which is only
affordable BECAUSE the designation is computed from position rather than authored as a cell.
**If you find yourself hand-filling a table, stop: you have rebuilt the thing [[B46]](b) warned
against.** The steps below are the reconciled order; the numbered list is the same shape, and steps 1
and 6 are still the ones that stop it re-diverging.

1. **The ten reference stars (9.1) as a FIXTURE, and extend the round-trip test to stars** — it will
   fail, because there is nothing to classify against. That failure is the specification for step 2,
   and the fixture is what stops any replacement being argued rather than measured.
2. **DERIVE the `star/*` match regions from the HR relation, do not author them.** The single source
   is the main-sequence law plus the branch offsets (section 10); a designation is a POSITION on it.
   **The law must be exported ONCE** — it is currently spelled five times, including one inverted
   inline at `GenerationWizard.svelte:95`. Replacing `msExpectedLogL` is free: it is a first pass,
   never revised, fitted to nothing ([[B51]]).
   **Remnants are the exception and need their own axes** — field and spin, plus progenitor mass and
   age, because their identity is a TRACK rather than a position (9.5(i)).
3. **Fold `SPECTRAL_DATA` into the pack** as generation bands, constrained to sit inside the match
   regions from step 2. The editor reads the pack — this CONTINUES [[D22]]'s unification (the pack
   wins, `BodyStarTab` reads it) rather than reversing it.
   **A BAND CARRIES ONLY WHAT CANNOT BE COMPUTED ([[B57]]).** Radius, temperature and mass are
   ANCHORS; **luminosity is DERIVED** (`L = 4(pi)R^2(sigma)T^4`, exact) and must stop being stored;
   colour is derived from temperature; field and spin are DRAWN, because they genuinely are not
   computable from anything else. This SHRINKS each entry to three anchored numbers, which is what
   makes the owner's *"add more star types in there"* cheap — and a derived quantity cannot drift,
   because it is not stored. **`radiation_output` is the proof it drifts when stored: `star/G` agrees
   with its own R and T exactly and nothing else does, out to 60,000x on `star/M`.**
   **Bands declare their own SCALE ([[B56]]).** `randomFromRange` is linear, 23 shipped bands span
   100x or more, and a linear draw's median sits at about hi/2 however many decades it covers.
   **The magnetar merge and the log draw are ONE change**: merging NS and magnetar into 1e8..1e15
   with a linear draw makes ~90% of neutron stars magnetars. The fix is a `scale` on the band, not
   "make everything log" — mass 1.4..2.2 is honestly linear.
4. **Point `starClasses()` and `updateClassFromTemp` at the vocabulary** so the two ad-hoc ladders
   become one lookup.
5. **Delete the legacy `baseArchetypes` path** — a hardcoded 17-entry list against the pack's 65,
   dormant only because the starter pack ships fingerprints, and the shape that produced D11's
   fossils.
6. **Lock it**: the round-trip test runs over the whole vocabulary, planets and stars.

Steps 1 and 6 are the ones that stop it re-diverging. Everything between is mechanical.

### 6b. What the vocabulary must ACCEPT, which is not what it may PRODUCE

Owner, 2026-08-15: *"Hand authoring is hand authoring. We let the GM do what they want and then try
and make sense of it. If they have a 100 year old black hole then fine. Our job is to show the
problems (in tags) and allow it."*

> **REFUSE TO PRODUCE. NEVER REFUSE TO ACCEPT.**

**This looks like it contradicts [[B47]](a) and does not, and the distinction must be written down or
someone will "fix" one of them.** B47(a) says the engine must refuse to AGE a sub-0.8-solar star onto
the giant branch — that governs what the engine PRODUCES on its own. This governs what it ACCEPTS
from a GM. A GM may hand-author a hundred-year-old black hole and gets a tag saying no progenitor
could produce it in that time; the engine will simply never generate one.

**Two consequences that are implementation constraints rather than philosophy:**

- **The round-trip test is asserted over the GENERATOR'S OUTPUT ONLY.** `classify(generate(X)) == X`.
  A hand-authored impossibility must not fail the suite — if it does, the test enforces a rule the
  product has just rejected.
- **Implausibility tags say WHICH LAW, never "invalid".** The pattern is already set by
  `ageEstimated`, where `physicsTrace` names which of three reasons applies. Per [[TAG-6]] this
  namespace needs exactly ONE owning pass, named in the spec — and it is [[B52]]'s tag face doing
  real work, because "implausible, and here is which law it breaks" is re-derivable every pass and is
  therefore a tag rather than stored truth.

### 6c. DYNAMIC AGEING IS A V4 FEATURE — build the seam, do not build the machinery

Owner, 2026-08-15: *"dynamically aging a system with system events will be a V4 feature — system
evolution is a key feature... no need to do much just now other than reflect the current truth. But
KNOWING the V4 feature is coming will avoid you coding yourself into a dead end."*

**THE CURRENT TRUTH, VERIFIED 2026-08-15 rather than assumed:** `ageStar` is called from
`generateFromConfig`, `accrete-adapter`, and the wizard/timeline PREVIEWS only. **The campaign clock
does not age stars.** Ageing is a generation-time event, so the four routes into a star's type are
today only three — dropdown, sliders, import.

**WHAT THAT SETTLES NOW.** The "does a pin survive ageing" question does not arise yet, and should
not be answered speculatively. It becomes live the moment V4 lands, and the options are recorded in
[[B55]] so it is decided rather than rediscovered: a pin blocking an AUTOMATIC process is a different
thing from a pin blocking a slider the GM is holding.

**THE SEAM, AND WHY THE ARROW IS THE WHOLE OF IT.** Section 9.4's rule — ageing PRODUCES state,
classification READS state, nothing reads the class back out — is exactly what makes dynamic ageing a
drop-in later. If classification is a pure function of (present state, progenitor mass, age), then
moving the clock changes its inputs and the designation follows for free: **V4 needs no change to the
classifier at all.** Every shortcut that reads the class to decide a physical value closes that door,
which is why `starCategory = categoryForClass(classes[0])` ([[B51]]) and `stardefaults.ts:27`
([[B49]]) are worth removing even though neither is visibly broken today.

**SO THE ONE RULE FOR THIS WORKSTREAM IS:** classification must never take "when" as an implicit
constant. Age is a parameter, and it is already in `classifyStar`'s signature. Keep it there, pass it
honestly, and do not cache a designation anywhere the clock could later contradict.

## 7. Non-goals

- **Not** a change to how tags are STORED. That is the tagging workstream's live territory.
- **Not** a generator rewrite — that is V4 itself; this exists to hand V4 a clean vocabulary.
- **Not** a re-tuning of the physics. Where bands move, they move to satisfy the invariant, not to
  make anyone's favourite world come out differently.

## 8. Open questions for the detailed design

- Do exotic classes (`BH`, `NS`, `magnetar`) want match bands at all, or should they stay PINNED and
  never re-derived? They have no meaningful spectral type, and the current early-return treats them
  as authored. Pinning is defensible and cheaper; deciding it deliberately is the point.
- Does `star/red-giant` belong in the same vocabulary as the main sequence, given it is an
  evolutionary STATE rather than a spectral class? B40 (the Hayashi limit) touches the same seam.
- Should the round-trip test assert on modifiers too, or bases only? Bases only is the invariant the
  owner stated; modifiers are additive and a weaker claim.

## 9. Measured 2026-08-15, when the owner promoted this to [[B48]]

Added by the custom-image-block session after landing [[G21]]. Everything here is a MEASUREMENT or a
file-and-line sweep, not a proposal — the proposals above still stand.

### 9.1 `classifyStar` is wrong for every hot main-sequence star

This is the one finding that changes the order of work. Against published MK standards, five of ten
reference stars come back wrong:

| Star | Truth | `classifyStar` returns |
|---|---|---|
| Sun | G2V | V Main Sequence |
| **Vega** | **A0V** | **III Giant** |
| **B0V** | **V** | **I Blue Supergiant** |
| **O5V** | **V** | **I Blue Supergiant** |
| **B2V** | **V** | **II Bright Giant** |
| **Proxima** | **M5.5V** | **VI Subdwarf** |
| Rigel | B8Ia | I Blue Supergiant |
| Betelgeuse | M1Ia | I Red Supergiant |
| Arcturus | K1.5III | III Giant |
| Aldebaran | K5III | III Giant |

The cause is ORDERING: absolute `logL` cuts (`> 4.0` supergiant, `> 1.5` giant) fire before the
relative main-sequence test the function already computes, so anything intrinsically bright is called
evolved regardless of where it actually sits. It survives because `lumClass` leaves the function only
inside `StarSeed.luminosityClass` via `deriveStarFromHR`, and almost nothing reads it. **Rolling
luminosity up into the vocabulary is exactly what would make it matter** — it would stamp "Vega is a
giant" into every star's recorded class and pack key.

**THE CHEAP FIX WAS TRIED AND MEASURED AND DOES NOT WORK.** Reordering needs a ZAMS proxy; both
candidates fail at opposite ends. `dlogL` above each proxy's main sequence:

| Star | Truth | vs `6.5*logT-24.5` | vs `L~M^3.5` |
|---|---|---|---|
| Proxima | V | **-0.91** | -0.03 |
| Vega | V | 0.22 | 0.47 |
| Arcturus | III | 3.12 | 2.11 |
| Rigel | **I** | 3.04 | **0.45** |
| Betelgeuse | **I** | 6.48 | **0.84** |

The linear-in-`logT` line breaks Proxima into a false subdwarf; the mass-luminosity relation fixes
Proxima exactly and collapses Rigel and Betelgeuse below any threshold that keeps Vega at V. **No
single relative threshold classifies all ten**, because the main sequence and the giant branch
converge at the hot end. That is the positive argument for section 4's match bands: a 2D envelope per
type is not over-engineering here, it is the minimum that works.

**Do not patch `classifyStar` ahead of this work** — a reorder trades five wrong dwarfs for two wrong
supergiants and looks like progress. The reference table above should land as a fixture FIRST
(section 6 step 1), so any replacement is measured rather than argued.

### 9.1b The deciders DIVERGE — [[B50]]'s measurement, run 2026-08-15

The table above measures `classifyStar` against published truth. [[B50]] asks a different and sharper
question: **do `classifyStar` and the PACK BANDS agree with each other?** Measured by taking every
`statTemplates` star band, computing its midpoint (the value the editor actually applies when a GM
picks that class), deriving L from the band's own radius and temperature, and asking `classifyStar`
what it is. **They diverge on 9 of 29 keys — 7 of 24 non-remnant bands plus 2 remnants.** Not latent.

| Pack key | claims | `classifyStar` says | |
|---|---|---|---|
| `star/O` | V | **I** Blue Supergiant | the pack's own O MAIN-SEQUENCE band |
| `star/B` | V | **II** Bright Giant | likewise |
| `star/O-I` | I | **0** Hypergiant | overshoot |
| `star/B-I` | I | **0** Hypergiant | overshoot |
| `star/O-III` | III | **0** Hypergiant | a GIANT called a hypergiant |
| `star/B-III` | III | **II** Bright Giant | |
| `star/G-I` | I | **II** Bright Giant | |
| `star/NS` | X | **VII** White Dwarf | see below |
| `star/magnetar` | X | **VII** White Dwarf | see below |

The seventeen that agree are the cool and middle main sequence (`A F G K M L T Y`), the cool giants
and supergiants (`A/F/G/K/M-III`, `A/F/K/M-I`), `WD` and `BH`. **Every disagreement is at the hot end
or in a remnant** — the same systematic shape as 9.1, arriving from a completely different direction,
which is what makes it evidence rather than coincidence.

**AND A SEPARATE BUG FALLS OUT, worth its own line because it is not the ordering fault.**
`classifyStar`'s remnant branch tests `mSolar > 8.0 => Neutron Star` and `> 25 => Black Hole`. Those
are **PROGENITOR** masses applied to the **REMNANT's own** mass. A real neutron star is 1.4-2.2 solar
masses, so it can never satisfy `> 8` — every neutron star and magnetar falls through to White Dwarf.
The pack's `star/NS` band midpoint is 1.80, and it classifies as `VII White Dwarf`. `star/BH` only
passes because its band midpoint happens to be 51.5. **This is the same class of error as [[B49]] and
mk-lum 6.4: a quantity used in the wrong frame, silently.**

**So B50's answer is DIVERGENT, not latent** — and that settles its own instruction: this is a bug to
fix as part of the rewrite, not an engine-map note to defer.

### 9.2 Four creation paths, and two of them invent a category

Section 2 covers the inverse; the forward has the same problem. `generation/star.ts:119` draws a pack
key then derives `starCategory` with its own letter/band logic (`:101-114`); `generateFromConfig.ts`
builds the key from an ageing PHASE switch (`:96-107`) then derives `starCategory` from a hardcoded
letter LIST (`:109-115`); the real-sky importer parses the true MK string; and `BodyBasicsTab:587`
ignites a star by setting `classes[0]` outright. **`starCategory` is written by two of them, is a
third vocabulary alongside `classifyStar`'s, and NOTHING in `src/` reads it** — it is serialised into
saved systems and never consumed. It becomes the object-type axis or it is deleted; it must not stay
a third opinion nobody asks for.

Also: `StellarDance` mergers and `ageStar` MUTATE temperature and luminosity, so they change what a
star IS, and nothing re-classifies afterwards. The round-trip invariant in section 1 should extend to
"and still classifies as T after ageing", or explicitly not.

### 9.3 The data sets are incomplete, and there are two of them

`stars.json` `statTemplates` carries **30** star keys — ten bare letters, seven `-I`, seven `-III`,
five remnants, `star/default`. `classification.json` `starImages` carries **19**, a different set,
still holding `star/red-giant` which [[B46]](a) retired. Two maps keyed by one concept with nothing
keeping their membership in step ([[B47]](d), one layer up). [[G21]] insulated the image side behind
`resolveStarImage`, which is the seam the rekeying can move behind.

**The gap that blocks the luminosity roll-up: there is no `-II`, `-IV` or `-VI` band, while
`classifyStar` emits all three** (plus `0`, `VII` and `X`). And there is no explicit `-V` — the bare
letter IS the main-sequence band by convention, which is precisely what makes `luminosity` versus
`band` ambiguous at every use site. Completing the vocabulary means deciding whether bare-letter stays
the V shorthand or becomes explicit. `StellarType` (`types.ts:264-286`) already models the
distinction correctly and should be the guide: `luminosity` is AS STATED and absent when unstated;
`band` is the normalised I/III/V the pack key is built from. Derive `band`; never invent `luminosity`.

### 9.4 THE DIRECTION OF THE ARROW — settle this before writing any code

The lifecycle roll-in puts ageing and classification in the same room, and the standing rule that
**a derived CLASS is never a physics input** (PHY-1's corollary — internal heat once asked
`body.classes` for "ice-giant" while the classifier ran later) is what that room threatens.

> **Ageing PRODUCES state. Classification READS state. Nothing may read the class back out.**

Concretely: the ageing profile may NOT be selected by `body.classes`, and classification may NOT
consult anything ageing wrote downstream of it. If the loop closes,
`src/lib/system/idempotence.test.ts` is the only thing that will notice, and it will notice late.

**This is the constraint that decides the shape of the ageing profile.** "Each star has an ageing
profile" (owner, [[B47]]a) reads naturally as *profile keyed by star type* — which is exactly the
forbidden direction. The profile must be keyed by the star's PHYSICS (mass, and metallicity if it is
ever added), not by its class. A star does not evolve the way it does because it is a G dwarf; it is
a G dwarf because of the mass that also determines how it evolves. Keying on mass is both the correct
physics and the only shape that keeps the arrow one-way.

### 9.5 The three open questions in section 8 — recommendations, not decisions

Surfaced for the owner with a recommendation each, per the coordinator's routing.

**(i) Do `BH`/`NS`/`magnetar` want match bands, or stay PINNED?** ~~RECOMMEND PINNED~~ —
**OVERRULED BY THE OWNER 2026-08-15 ([[B55]]). REMNANTS GET MATCH BANDS. Do not act on the struck
recommendation below; it is kept only so a successor can see what was wrong with it.**

My objection was that nothing separates a magnetar from a neutron star except an authored field
strength, so the classification is an authored fact. **The owner's answer dissolves the objection
rather than overriding it: the field is not authored, it is DRAWN as a physical property, and the
classifier reads it.** *"Magnetars would just be fast spinning neutron stars... they are spawned as
neutron stars with a physical property that the classification engine defines them as magnetars — ie
it is a sub-category of neutron star, as they are in reality."* One spawn type, parameters, derived
label. That is the flexible-systems mantra applied to remnants, and it is better than pinning.

**Where I was half-right, and it is the half that matters for the axes:** (mass, luminosity, colour,
radius) is genuinely NOT sufficient for a remnant — a magnetar and a neutron star are identical on
all four. **The match space needs FIELD and SPIN axes for remnants**, which the HR surface does not
carry. And the owner sharpened the larger half himself: *"the HR surface alone can't do stellar
remnants as that requires star type + TIME"*. So:

> **Present state (T, L, R, M) is a POSITION. (Initial mass, age) is a TRACK. Field and spin are
> properties on neither.**

Main-sequence and giant designations are readable from position alone — a 1 solar-mass star is `G2V`
at 4 Gyr and a K giant at 12 Gyr, and those ARE different places on the map. **Remnant identity is
not, and neither is `magnetar`.**

**AND THIS IS THE ROOT OF THE REMNANT BUG IN 9.1b, not merely adjacent to it:** testing `mSolar > 8`
for a neutron star is a PROGENITOR threshold applied to the REMNANT'S OWN mass — the two frames
conflated, which is exactly the confusion the owner's sentence names. The signatures already carry
what is needed: `deriveStarFromHR(..., progenitorMassKg)` already takes the progenitor mass and
`classifyStar({..., ageGyr, isRemnant})` already takes age and remnant-ness. The inputs are present;
the remnant branch simply read the wrong one.

> **HARD REQUIREMENT: progenitor mass must SURVIVE generation and be readable at classify time, or
> the round-trip fails for every remnant.**

**The one thing I got right and which survives the overrule:** remnants must not be exempt from the
round-trip test.

**(ii) Does `star/red-giant` belong in the vocabulary?** NO, and this is now largely answered rather
than open. [[B46]](a) already deleted it from the pack and made the ageing path emit
`star/<letter>-III`. With lifecycle rolled in, the reason becomes structural: **an evolutionary state
is a POSITION ON A TRACK, not a class** — the same star is a dwarf then a giant, and a vocabulary
entry that means "somewhere along its life" cannot round-trip against physics that only knows where
it is now. Keep `(letter, luminosity class)` as the vocabulary and let the track supply the rest.
**But `starStatTemplate`'s `star/red-giant` alias MUST survive** ([[B46]]a): a saved campaign still
holding that key has to resolve, or it silently becomes a G dwarf.

**(iii) Round-trip on modifiers or bases only?** BASES ONLY, as the owner stated the invariant.
Modifiers are additive and unordered (section 5), so "did every modifier come back" is a different
and much weaker claim that would couple this test to the tagging workstream's live territory. Assert
bases; report modifier drift as information rather than failure.

### 9.6 Constraints on the implementation, gathered rather than invented

- **DATA-R14 — edit the rule pack as TEXT.** This job edits `classification.json` and `stars.json`
  heavily, and a load-and-re-dump once rewrote 6,385 lines for one key. It is the likeliest
  self-inflicted wound in the whole workstream.
- **Do not hand-author the grid.** Letter x subclass x luminosity class is order 700 cells, and hand
  filling invites exactly the transcription drift [[D22]] found (two tables disagreeing for 8 of 16
  classes). **ANCHOR AND INTERPOLATE** — the sequence is smooth within a luminosity class. Pecaut &
  Mamajek for the main-sequence branch. **And the grid is SPARSE in reality:** Wolf-Rayet, LBV,
  carbon and S types and Thorne-Zytkow objects are not points on it at all, but separate objects.
- **Preserve [[D22]]'s unification** — the pack wins and `BodyStarTab` reads it. Do not undo it while
  folding `SPECTRAL_DATA` in (section 6 step 3); that step IS the continuation of D22, not a reversal.
- **Stay out of `SystemProcessor`'s classification-adjacent lines** while [[B36]] is live with the
  positions session. Worktree per session; two sessions in that file is the shared-tree sweep that
  has already cost four sessions.
- **[[B49]] and mk-lum 6.4 are ONE fix, not two.** `stardefaults.ts:27` reads
  `star.classes?.[0] ?? 'star/M'`, so an unclassified star silently takes an M dwarf's magnetic field
  ([[B44]] fixed that same assumption in the classification path and this copy was never chased) —
  and the same line takes the LETTER, so a supergiant draws a dwarf's field. Two independent faults
  on one line, found for different reasons, fixed once.

### 9.7 A finding about THIS DOCUMENT, which is a finding for the board

Section 2 is titled *"What is actually true today — measured, not assumed"* and it said the star
inverse *"exists only as two ad-hoc ladders"*. **There are three.** `classifyStar` was missed, and it
is the one that most resembles a real classifier and is the one that is wrong.

That is worth recording as drift rather than fixing quietly, because it is the same failure mode
[[B36]] hit this week — an entry twelve days old that had drifted by three sites and 131 lines — and
because a section that ADVERTISES itself as measured is the worst place for it: a reader trusts it
precisely where it is weakest. **The lesson for this workstream: every claim in section 2 should be
re-run before it is built on, not read.** The measurements in 9.1-9.3 were taken on 2026-08-15 and
carry the same expiry.

## 10. The match bands are REGIONS ON THE HR SURFACE, not a table — [[B50]]

Owner, correcting the coordinator: *"is that not the calibrated HR diagram we already have — clicking
on there should provide luminosity class"*. He is right, and it **strikes the 700-cell grid from
[[B46]](b) as the wrong mental model.** The anchor surface is not something to build: `classifyStar`
is the forward map, `deriveStarFromHR` is the inverse, and `HRDiagram.svelte:70` already calls the
inverse on click. [[GEN-1]] preserves that path deliberately, so none of it is dead code to tidy.

**A designation does not need a cell in a table; it needs a POSITION on a surface that exists.**
Letter plus subclass gives a temperature along a smooth ladder; the luminosity class selects which
branch. **Two one-dimensional interpolations, not a two-dimensional grid** — and the branches are
already drawn. That also disposes of "do not hand-author ~700 cells": there is nothing to author.

**The consequence for section 4's three faces:** the HR relation becomes THE single source, and the
pack's bands are expressed as **regions on it** rather than as a second independent table. Section 4
says what the record's faces are; this says what the MATCH BANDS are MADE OF. And it explains 9.1b —
the pack and the classifier diverge precisely because they are two independent tables today.

**The relation is already spelled five times**, which is the same detector firing as everywhere else
in this document: `classifyStar` (HR position), the pack bands (mass/radius/temperature),
`SPECTRAL_DATA` in `BodyStarTab.svelte` (the editor), `determineSpectralClass` (temperature to
letter), and `GenerationWizard.svelte:95`, which inverts the main-sequence law INLINE with the
comment *"invert the main-sequence L(T) used by classifyStar"* — a fifth spelling, hand-reconciled at
a call site. **Whatever replaces `msExpectedLogL` must be exported once and consumed by all five.**

**And replacing it is free** ([[B51]]): `git log -S "msExpectedLogL"` over all branches returns
exactly two commits — `569e09f FEAT: HR-diagram Creation` and a documentation commit. `6.5*logT-24.5`
is a first pass, never revised, fitted to nothing. There is no calibration to preserve and no
regression to fear; the reference stars in 9.1 are the acceptance test.

## 11. The fourth face — non-physical star data becomes TAGS ([[B52]])

Owner: *"use tags to describe flaring behaviour and other star data that is not physical and can be
rederived from stellar properties — emission jets, etc."*

**This generalises a pattern that already works end to end; it does not design a new one.** Read the
worked example before writing anything: `SystemProcessor.ts:98` derives `flareActivity` for EVERY
star, `stellarActivityBucket()` buckets it, it rides as `STELLAR_ACTIVITY_TAG`, and
`galleryExamples.ts:231` records that *"spot groups, faculae and flares all read from that tag"*.
Physics drives tags drives visuals, running on a star today, for exactly one attribute.

**THE TEST, and without it tags become a second store:**

> **Re-derivable from stellar properties on every pass => TAG, never stored as truth.
> An INPUT => DATA.**

Flaring, emission jets, spot coverage and activity cycles are the first candidates. **[[B9]](b)'s
magnetism is the boundary case worth naming rather than assuming:** today it is pack data keyed on
the LETTER (`stardefaults.ts:27`, and see [[B49]]), and "derived or authored" is the same question in
a different hat. Decide it explicitly; do not let it fall out of whichever code gets written first.

**What this kills, concretely:** flare behaviour matched off the CLASS STRING — the `/[WNB]/`
collision in [[DATA-R13]] where a quiescent black hole drew a B-star flare rate. **That is the third
fault from the same letter**, after `star/BH`'s image lookup ([[G21]]) and the fabricated `star/B`
class. Deriving from properties rather than from the class string removes the whole family.

**HARD CONSTRAINTS.** Tag STORAGE is the tagging workstream's live territory and section 7 already
lists it as an explicit non-goal — use the existing machinery, do not invent a parallel one. And
[[TAG-6]]: **a namespace is cleared by the pass that owns it, ONCE**, so a derived `star/*` namespace
needs exactly one owning pass, NAMED in the spec. `SystemProcessor`'s stellar pass is the obvious
candidate since it already owns `STELLAR_ACTIVITY_TAG`.

## 12. Answers from the repo, not from memory ([[B51]])

**`starCategory`: DELETE, do not promote.** It was not aspirational — `587abd3` introduced it driving
`VISUAL_SCALING[body.starCategory]`, a real renderer consumer, and `ed82a6e "replaced render system"`
deleted that reader; the type declaration went with `43e2f4d`. Then `d5237d7 Phase A` RE-INTRODUCED
it as `categoryForClass(classes[0])`. **A fossil that was re-fossilised.** Deletion is a READ-PATH
removal plus tolerating the field on load, because it is serialised into saved systems. **And note
what the reintroduction derives from: `classes[0]`, the LETTER** — the class-from-class direction
section 9.4 forbids, so it is evidence for the arrow rather than a counter-example to it.

**`star/G`: a live contradiction between two shipped artefacts, and the fork DISSOLVES.**
`mk-luminosity-patch-spec.md` section 1.1 says *"`star/M` continues to mean 'M, main sequence'"*.
`stellarTypeForBand`'s comment says a bare letter means luminosity UNSTATED and *"must stay
distinguishable from one stated as V"*. Both shipped; both are right, about different things:

> The **KEY** `star/G` is a PARAMETER BAND and means G main sequence.
> The parsed **`stellarType.luminosity`** is PROVENANCE and records what the SOURCE stated —
> **absent is not 'V'.**

That is [[DATA-R4]] (the importer never invents and never overwrites) applied to the luminosity axis,
and it satisfies both comments without either giving way. **Still the owner's call, because it decides
what a figure CLAIMS — but the choice is whether to accept this reconciliation, not which artefact to
sacrifice.**

Related: [[B48]], [[B49]], [[B50]], [[B51]], [[B52]], [[D11]], [[D18]], [[D19]], [[D22]], [[G21]], DATA-R8, [[DATA-R4]], [[DATA-R10]], [[DATA-R13]], [[GEN-1]], [[TAG-6]],
[[DATA-R17]], `docs/dev/v4-scope.md`, `docs/dev/mk-luminosity-patch-spec.md`,
`docs/dev/architecture-physics-tags-visuals.md`, `docs/dev/generation-duplication-map.md`.
