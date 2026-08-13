# Pre-V4: one TYPE VOCABULARY, forward and inverse (DESIGN OUTLINE, 2026-08-13)

Status: PROPOSED, outline only — detailed design to follow. Owner-initiated.

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
exists only as two ad-hoc ladders:

- `starClasses(spectralType)` in `import/realsky/stars.mjs` — catalogue string to classes.
- `updateClassFromTemp(k)` in `components/BodyStarTab.svelte` — the editor's temperature ladder.

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

Related: [[D11]], [[D18]], DATA-R8, `docs/dev/v4-scope.md`,
`docs/dev/architecture-physics-tags-visuals.md`, `docs/dev/generation-duplication-map.md`.
