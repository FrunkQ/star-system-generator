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

1. **Extend the round-trip test to stars** — it will fail, because there is nothing to classify
   against. That failure is the specification for step 2.
2. **Author `star/*` fingerprints** in the pack, with match bands taken from the temperature ladder
   that already works (it is the de facto classifier and it agrees with the editor).
3. **Fold `SPECTRAL_DATA` into the pack** as generation bands, constrained to sit inside the match
   bands from step 2. The editor reads the pack.
4. **Point `starClasses()` and `updateClassFromTemp` at the vocabulary** so the two ad-hoc ladders
   become one lookup.
5. **Delete the legacy `baseArchetypes` path** — a hardcoded 17-entry list against the pack's 65,
   dormant only because the starter pack ships fingerprints, and the shape that produced D11's
   fossils.
6. **Lock it**: the round-trip test runs over the whole vocabulary, planets and stars.

Steps 1 and 6 are the ones that stop it re-diverging. Everything between is mechanical.

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

**(i) Do `BH`/`NS`/`magnetar` want match bands, or stay PINNED?** RECOMMEND PINNED, and it is not
just the cheaper option: a remnant's identity is its HISTORY, not its present spectrum. Two objects
of the same mass and temperature can be a neutron star and a white dwarf depending on what they came
from, so no envelope over present-day physics can separate them — the classification is genuinely an
authored fact. Pinning also preserves the existing early-return behaviour, so it changes nothing
today. **The one thing pinning must not do is exempt them from the round-trip test:** assert that a
pinned class survives a classify pass unchanged, which is a real and cheap assertion.

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

Related: [[B48]], [[B49]], [[D11]], [[D18]], [[D19]], [[D22]], [[G21]], DATA-R8, [[DATA-R10]], [[DATA-R13]],
[[DATA-R17]], `docs/dev/v4-scope.md`, `docs/dev/mk-luminosity-patch-spec.md`,
`docs/dev/architecture-physics-tags-visuals.md`, `docs/dev/generation-duplication-map.md`.
