# ENGINE MAP — the tricky details, one step up from reading the code

**AUDIENCE: an LLM agent about to change this codebase. Not a human tutorial.** Optimised for
grep-and-jump, not for reading front to back. If you want prose, translate it.

**WHAT THIS IS.** The non-obvious rules — the ones that are invisible in the code, expensive to
re-derive, and have already been got wrong at least once. Every entry is short, states an
INVARIANT or an ORDERING, and points at the file that enforces it. It does NOT restate what the
code says; it says what the code cannot.

**HOW TO USE IT.**
1. Before changing a subsystem, grep this file for its name. Read the entries. They are the traps.
2. `BLAST:` lines tell you what else to check. Follow every one.
3. If an entry is wrong, fix it in the same commit as the code. A wrong map is worse than none.
4. If you learn something that cost you more than ten minutes to work out, ADD IT. One entry, same
   shape. That is how this file gets built — nobody is writing it in one pass.

**DIAGNOSING RATHER THAN CHANGING? START AT `docs/dev/debug-tools.md`.** It indexes every instrument
that already exists — `[sse-perf]` counters and memory providers, `[sse-load]` stage stamps, the holo
scene's `__camDebug`/`__shipDebug`/`__routeDebug`/`__ringDebug` hooks, the memory gauge, and the user
diagnostic bundle — with the question each one answers and how to switch it on. Extend those; do not
invent a parallel instrument.

**ENTRY FORMAT** (keep it):
```
## Renumbering, 2026-08-26 — SEVEN IDS WERE CLAIMED TWICE

Parallel sessions appended entries on the same days and collided: `PHY-14`, `PHY-15`, `PHY-16`,
`DATA-R15`, `DATA-R16` and `RENDER-S22` were each claimed twice, and `PHY-17` three times. Where
two entries shared an id, the FIRST claim (by commit timestamp) kept it and the later one moved.
Older inbox rows and handover notes still cite the old numbers, so this is the translation:

| was | is now | the entry that MOVED |
|---|---|---|
| PHY-14 | **PHY-24** | The human eye enters at the END or it poisons the derivation |
| PHY-15 | **PHY-25** | A capture term that does not SATURATE is the naive maximiser |
| PHY-16 | **PHY-26** | Normalise a colour-matching result against the BAND |
| PHY-17 | **PHY-27** | Chromatic adaptation is BOUNDED |
| PHY-17 | **PHY-28** | "Has ground" is `hasSolidSurface` |
| DATA-R15 | **DATA-R21** | A class test anchored at the end excludes every subtype |
| DATA-R16 | **DATA-R22** | A brown dwarf has one definition, reachable from both roles |
| RENDER-S22 | **RENDER-S30** | A covered view is not an unmounted one |

The ids that KEPT their numbers are the star-classification and instrumentation entries:
PHY-14 (a remnant's mass and its progenitor's), PHY-15 (three things a body radiates),
PHY-16 (an ageing profile is keyed on mass), PHY-17 (a luminosity class is radius at a
temperature), DATA-R15 (two generators sharing an id namespace), DATA-R16 (a pack's
`liquids.json` is an optional override) and RENDER-S22 (the scene-rebuild path is instrumented).
Every live citation outside this file was checked and repointed where it had moved
(`biosphere-and-light-notes.md` was the only one affected).

**Before appending an entry, grep this file for the id in BOTH forms** — `### PHY-29` and
`PHY-29` — the way the inbox rule already requires for board ids. That is how these happened.



> **CARRYING THIS FILE INTO A NEW ENGINE:** see `engine-map-carry-forward.md`. The entries are not
> all the same KIND of truth - some are physics, some are properties a derivation engine must have,
> some are the browser's, and some are only true of this code. That file is the criterion for
> sorting them, and it exists because carrying a falsified entry into a new codebase breaks this
> file's own hardest rule: a wrong entry is worse than a missing one.

### <ID> <short imperative claim>
BUCKET: DOMAIN | ARCHITECTURE | PLATFORM (which platform) | IMPLEMENTATION — and where it splits,
which half is which. See THE CARRY-FORWARD SORT below.
WHERE: file:symbol (the code that enforces it)
RULE: the invariant, in one or two sentences.
WHY: the failure it prevents — ideally the one that actually happened, with its inbox id.
BLAST: what else to check when you change this.
```

**STATUS:** started 2026-08-04 by the tagging stream. TAGS, PHYSICS, RENDER, DATA and UI are written;
TRANSIT was opened 2026-08-07 by a backfill sweep over closed inbox items. Two RENDER candidates are
still unwritten and named in that section's stub. Coordinator owns the shape.

**CONTRADICTIONS ARE FINDINGS, NOT TIDY-UPS.** Two entries claiming single authority over one concept
means two implementations exist. Record it as a CAVEAT on the entry whose WHERE has been falsified —
PHY-4 carries the worked example — and route the fix to the inbox. Never resolve it by editing the
map to agree with itself.

**SOMETHING CAN WORK AND STILL BE A MISALIGNMENT.** `## OPEN MISALIGNMENTS` at the foot of this file
lists places where one concept has two implementations that currently AGREE. None of them is a bug
today; every one of them is where the next bug comes from, and the point of listing them is that the
next person to touch that area finds out before they add the third copy. Do NOT go and fix them
speculatively — record, and resolve when the area is open anyway.


## THE CARRY-FORWARD SORT, 2026-08-28 — EVERY ENTRY NOW CARRIES A BUCKET

**ID COLLISIONS RESOLVED BY THE COORDINATOR, 2026-08-28 (v3.0.155), flagged by the sort session and acted on the same day because one of them was actively misleading readers.** `RENDER-S36` and `RENDER-S37` were each used TWICE, and S37 was cited from code with BOTH meanings — `planetTexture.ts:667` meaning the aurora and `SystemVisualizer.svelte:1072` meaning the route, so anyone following a citation got a coin toss. **Settled by FIRST CLAIM, on commit timestamps, which split them one each:** S36 went to the METHANE entry (13:44) so the transit SAMPLER moved to **RENDER-S40**; S37 went to the transit ROUTE entry (14:25) so the AURORA moved to **RENDER-S41**. One code citation moved with it (the aurora's, in `planetTexture.ts`); the route's citation was already correct and was left alone. Headings are otherwise byte-identical and nothing else was renumbered or reordered.

Every entry has a `BUCKET:` line, first field after the heading, applying the criterion in
`engine-map-carry-forward.md`. **A BUCKET IS A FIELD, NOT A FILING SYSTEM.** Nothing was renumbered
and nothing was reordered — the ids are cited from a year of code comments, board rows and commit
messages. An entry that changes bucket keeps its id.

205 entries were sorted. (213 `###` headings, less six section stubs, the entry-format template and
the "checked and NOT a misalignment" note.)

| bucket | false when | primary | named anywhere |
|---|---|---|---|
| **DOMAIN** | physics, or the universe, changes | 61 | 73 |
| **ARCHITECTURE** | you build something that is not a staged derivation over a shared model | 106 | 159 |
| **PLATFORM** | you leave the browser, the GPU, the framework or the numeric type | 16 | 29 |
| **IMPLEMENTATION** | a file, a component or a store changes — dies with this code | 21 | 48 |

"Primary" is the bucket the field names first; "named anywhere" counts an entry once per bucket it
mentions. `M6` is neither — it is map apparatus, not a claim about an engine.

**HALF THIS FILE IS A SPLIT: 103 of 205 entries name two buckets or more.** That is the sort's
main finding and it should change how the carry-forward is planned. The criterion doc expected
splitting to be the exception ("if two answers feel true it is usually a domain truth wearing
implementation clothes"); in practice it is the rule, because the entries that were expensive enough
to write down are almost always a physical fact AND the structural decision that fact forced. Budget
for reading each one and taking half, not for moving files between four lists.

**ARCHITECTURE IS THE BIGGEST BUCKET BY A DISTANCE, AND THAT IS THE SECOND FINDING.** This reads as
a physics engine's notebook and is mostly a record of what a derivation engine must do to stay
honest. The new engine inherits far more of this file as REQUIREMENTS than as almanac.

**Three ARCHITECTURE sub-labels**, because two different obligations were landing in one bucket:
bare `ARCHITECTURE` is a property a derivation engine must have — inherit it as a requirement;
`ARCHITECTURE (product contract)` is an obligation to the people using it (consent, honesty about
what a file contains, a control that records the answer it was given) — inherit it as a promise;
`ARCHITECTURE (instrumentation)` is how a meter must behave to be worth having. PLATFORM entries
carry the platform in the label, so a future port to a native renderer knows which shelf to clear.

#### Read these together before designing the new pass model

`PHY-1` is not documentation. It is a property the new engine either has from its first commit or
spends a year discovering it needed, and **its test — `system/idempotence.test.ts` — is more portable
than the code it guards. Port the test first.** Three entries qualify it and all three are load-bearing:

- **`PHY-12`** — the circle field → escape → atmosphere → thermal → temperature → fluid layers → field
  is REAL. It cannot be ordered away, only broken, and breaking it is a design decision nobody has
  made. A staged-pass architecture cannot express it; know that before you choose one.
- **`LGR-2`** — a co-orbital body's orbit derives from a SIBLING, so parent-before-child says nothing
  about it. **The derivation graph of a star system is not a tree.**
- **`SYNC-1`** — PHY-1's blind spot, named by the entry itself: a repetition test is the wrong
  instrument for a TWO-COPY fault. `process()` was idempotent and green throughout while two holders
  of "the same" system took turns publishing different tag sets to players. The gate wanted is a
  one-line IDENTITY invariant, and it is a different test.

`DATA-G1` is the other one to build in on day one rather than retrofit: a draw takes its OWN
id-seeded stream, and anything that must survive re-processing uses a deterministic hash rather than
an rng at all.

#### What this pass found in the file itself

**TWO IDS ARE CLAIMED TWICE AND BOTH COLLISIONS ARE LIVE.** Flagged in place, deliberately NOT
renumbered — see the two things not to do in the criterion doc.

- `RENDER-S36` — "A SAMPLER THAT ANSWERS FOREVER" and "HOW MUCH METHANE YOU SEE". Cited as the
  sampler entry from `SystemVisualizer.svelte:764` and inbox B103.
- `RENDER-S37` — ""HAS A ROUTE" IS NOT "IS FLYING"" and "AN AURORAL OVAL". **This one is cited from
  code with BOTH meanings** — `planetTexture.ts:667` means the aurora, `SystemVisualizer.svelte:1072`
  means the route — so a reader following either citation reaches a coin toss. Inbox B101 and B104
  split the same way. `RENDER-S40` and up are free.

**Corrected, because each was cheap to verify** (marked `CORRECTED 2026-08-28` in place): `PHY-4`'s
caveat (its strict-`<` divergence is CLOSED — the rule DSL now routes through the shared predicate),
`PHY-12`'s BLAST (the dead local it names was deleted, and every GENERATED world now opts in), and
`M6`'s last bullet (the PHY-17 collision it reports was resolved by the 2026-08-26 renumbering).

**Marked SUSPECT:** `RENDER-S5` — the mechanism as stated is wrong. Left standing with what was
checked, because the fault it records really happened.

**Marked MISFILED:** `RENDER-S31`'s trailing CAVEAT is about the two Hill-radius formulas and belongs
on `PHY-29` / `M7`. Flagged, not moved.

**NOTHING WAS DROPPED.** Every entry can be restated without reading the code it describes, which is
this file's own bar and it clears it. The four closest calls, so the judgement is auditable: `UI-C1`
(thin — one authored colour, everything else derived; survives because it is the only thing stopping
a second colour field), `DATA-R14` (a working practice, not a trap, but restatable and still true),
`UI-P1` (one route's state machine; its durable half is that an unreachable branch renders the legacy
default) and `M6` (apparatus — the practice carries, the contents do not). `GEN-1` is the one entry
that is restatable and **DOES NOT CARRY**: it records an absence from this repo. It stays here because
it once said the opposite, which is the whole reason it exists.

**The IMPLEMENTATION bucket is read the useful way round in `faults-the-old-shape-allowed.md`** —
not "what does this say" but "what shape would have made this impossible?". That document, not this
sort, is the point of the exercise.

---

## ARCHITECTURE — ownership across SSE and the Labs

### ARCH-1 SSE orchestrates; System Lab resolves physical state; Evolution Lab owns every evolving mechanism
BUCKET: ARCHITECTURE (ownership boundary) - the split this entry states IS the plan the new work is
being built to. Carry it as requirement one, not as a note about this repo.
WHERE: the versioned contracts/adapters between SSE, System Lab and Evolution Lab. This is an
ownership boundary, not a runtime migration already implemented in this repository.
RULE: **Evolution Lab is domain-neutral and is the sole home of evolutionary mechanisms.** It owns
generic evolving-network primitives, classifiers and milestones, lineage/provenance/history,
recursive abstraction/wrapping, and domain presentation/scenario packs. Biology, first-life,
galaxy and social views are presentation modes over that engine, not separate engines. **System Lab
owns authoritative star, planet, accretion, orbital, geological and atmospheric physical state and
resolution**; it provides to, consumes from and receives results from Evolution Lab through
versioned contracts. **SSE owns product orchestration**: the master seed, global clock,
deterministic event ordering, persistence and the combined UI. SSE consumes versioned Lab outputs
and adapters; it does not duplicate either engine.
WHY: without this boundary, a host-specific UI or an evolutionary rule already present in SSE can
be mistaken for a new SSE-owned engine and expanded here, creating a third implementation instead
of a contract between the two Labs and the product shell.
BLAST: evolutionary logic currently in SSE is future migration scope, **not work authorised by this
entry**. Do not delete, move or refactor it merely because ownership is now settled. Any migration
needs its own scoped decision, compatibility/versioning plan and contract tests. Changes involving
generation, ageing, biospheres, first life, galaxy-scale evolution, societies, lineage, milestones
or recursive evolving structures must check this entry before assigning ownership.

---

## TAGS — lifecycle and provenance

### TAG-1 One module decides what may delete a tag
BUCKET: ARCHITECTURE + IMPLEMENTATION - durable: a destructive lifecycle operation has exactly ONE
owner, and provenance-sparing must be expressible there. The CAVEAT is this code's: a hand-rolled
namespace strip grew because the one owner could not express a SECOND exemption axis.
WHERE: `src/lib/tags/tagLifecycle.ts`
RULE: `stripForReprocess` / `stripRuleTags` are the ONLY ways engine code removes a tag by
provenance or namespace. Removing by exact key in response to a user action is not covered and is
allowed (`tagCategories.ts` edit ops, `coi.ts` toggle).
WHY: the rule used to be restated at 34 call sites and 25 of them deleted hand-added tags, so a GM
override could not exist. `importFixup` also deleted one on save.
BLAST: adding a strip anywhere → route it here. Grep `tags.filter` before assuming a site is new.
CAVEAT (2026-08-07, backfill sweep): "ONLY" is not literally true, and the exception is a NAMESPACE
strip. `SystemProcessor.ts:899` clears `structure/`, `hydrosphere/`, `climate/polar-ice`,
`climate/steam-world`, `activity/sublimating` and `activity/cryovolcanism` with a hand-written
exemption list, and its own comment gives the honest reason: it needs a SECOND exemption axis
`stripForReprocess` cannot express — keys another pass owns (`applyCloudDeckTags` strips its own) as
well as keys no pass can re-create. It does honour `survivesRederive`, so the manual-tag protection
this entry exists for is intact; what is not intact is "one module decides". Separately, FOUR sites
strip LEGACY tags (`SystemProcessor.ts:77`, `:899`, `starmapSanitizer.ts:12`, `importFixup.ts:134`)
against THREE different definitions of legacy — `LEGACY_DUPLICATE_TAGS` (SystemProcessor),
`isLegacyTag` (`tagPresentation.ts:400`), `isInterferingTag` (`importFixup.ts:64`). TAG-7's ordering
trap applies to whichever of them runs first on a given path, which is not the same one every time.

### TAG-2 Sparing a tag on strip is only half; the emit must be guarded
BUCKET: ARCHITECTURE - strip and emit are a PAIR. Guard one side only and you manufacture a
duplicate of every override, every pass.
WHERE: `tagLifecycle.emit`, used across `core/SystemProcessor.ts`
RULE: a pass that spares hand-added tags and then pushes unconditionally produces DUPLICATES. Strip
with `stripForReprocess`, emit with `emit()` — which no-ops when the key is already present, so a GM
override suppresses the derived twin rather than sitting beside it.
WHY: the idiom was invented twice by hand (B28 `hazard/radiation`, B31 `flight/ascent`) before it was
named. Without the guard an override doubles on every pass.
BLAST: multi-emit keys must NOT use `emit()` — see TAG-3.

### TAG-3 Some keys legitimately appear several times on one body
BUCKET: DOMAIN + ARCHITECTURE - domain: a world genuinely carries four ices, two decks, two
precipitations. Architecture: multiplicity is REPETITION, never a delimited value, and a global
dedupe-by-key deletes real data.
WHERE: `tagConsistency.spec.ts` ("packs no delimited list into a single tag value")
RULE: `volatiles/ices` (x4 on real bodies), `structure/cloud-deck` (x2), `weather/precipitation` (x2).
Several of a thing = several tags, never one delimited value. Do not dedupe tags by key globally.
WHY: a blanket dedupe silently deletes real data; the alternative (comma-joined values) is the
mini-format the consistency suite exists to forbid.
BLAST: any "clean up duplicate tags" idea. Any `emit()` added to a volatiles/cloud/weather push.

### TAG-4 Provenance is declared by the category; the tag carries only a flag
BUCKET: ARCHITECTURE - provenance is a property of the NAMESPACE, not of the record; one table, and
the same table feeds the override UI.
WHERE: `tagDefaults.ENGINE_NAMESPACES`, `tagLifecycle.namespaceProvenance`, `TagCategory.provenance`
RULE: the tag records whether a human added it (`manual`); the CATEGORY records what a tag in that
namespace is otherwise (`physics` = re-derived every pass, `authored` = written once at generation,
never re-derived). Exact keys may override their namespace — `orbit/` is mixed.
WHY: it was a hardcoded prefix list inside the lifecycle module; adding an engine namespace anywhere
else left its tags silently claiming to be physics-derived (A44).
BLAST: new engine namespace → add it to `ENGINE_NAMESPACES` or its tags read as physics. The same
table feeds the GM-override dropdown; do not add a second list.

### TAG-5 `authored` tags are removable and never come back
BUCKET: ARCHITECTURE - a value written once at generation is a real provenance class and must be
labelled honestly. Corollary worth carrying: an edit that makes an inferred value real must RETIRE
the inference claim.
WHERE: `tagLifecycle` origin table; `BodyTagsTab.svelte` "Generated" group
RULE: `spin/*`, `origin/*`, `traveller/*`, `orbit/retrograde|double` are written ONCE at
generation/import. Nothing re-derives them. They survive re-process AND export, and a GM may delete
one permanently.
WHY: they were shown under a red "derived from the physics, recomputed every run" lock, which was
false in every clause (A44). `spin/axis-inferred` is a promise that an inferred value is
distinguishable from a measured one (B10, C3c).
BLAST: an edit that makes an inferred value real must RETIRE the claim — typing an obliquity clears
`spin/axis-inferred` (`BodyBasicsTab.clearSpinProvenance`). Same applies to any future `*-inferred`.

### TAG-6 A namespace is cleared by the pass that owns it, ONCE
BUCKET: ARCHITECTURE - one clear per namespace, at the top of the owning pass, never per branch.
WHERE: `SystemProcessor.calculateHabitabilityAndBiosphere` (the fixed example)
RULE: one clear per namespace, at the top of the owning pass. Not per branch.
WHY: habitability cleared in two branches; the two then disagreed about sparing hand-added tags,
because a rule applied to one was silently absent from the other (B38).
BLAST: if you find a second clear of one namespace, hoist rather than add a third.

### TAG-22 `biodiversity/*` is the surface-light pass's namespace, and one tag there is a DRAW
BUCKET: DOMAIN + ARCHITECTURE - domain: land cover is the UNION of the layers and legitimately
totals past 100%, and a pigment is a contingent DRAW rather than a calculation. Architecture: one
owning pass, one clear, and an ordering between passes that consume each other's output.
WHERE: `SystemProcessor.processClassification` — the block that clears `biodiversity/` and calls
`deriveSurfaceSpectrum` + `deriveVegetation`.
RULE: one owning pass, one clear (TAG-6). It must run AFTER the cloud decks (they are the filter) and
BEFORE `deriveApparentColorParts` (it consumes the tint). Only the pigment a world SETTLED ON is
tagged; the rest of the viable set stays on `body.vegetation.ranked` for the picker, because six
tags per living world saying "this would also have worked" is clutter a dropdown already covers.
WHY: `biodiversity/pigment` is a WEIGHTED DRAW over the scored set, not a calculation, and it is
seeded `hash01(id + '|veg|pigment')` per DATA-G1. Using the shared per-run rng would re-roll every
saved seed the moment anyone inserted a draw above it. The contingency is the model, not a
placeholder — say so wherever it is explained, or a reader reads it as unfinished.
BLAST: `biodiversity/land-cover` is the UNION of the painted layers, never the sum of the coverage
sliders — those are coverage OF THE LAND, are independent, and legitimately total past 100%. Anything
that adds them is wrong.

### TAG-7 Tag keys are case-insensitive with ONE canonical spelling
BUCKET: ARCHITECTURE + IMPLEMENTATION - durable: canonicalise at CREATION, never by comparing
loosely at every site. The ordering trap - a legacy detector that recognises old data BY its
uncanonical spelling - is this migration's.
WHERE: `tagLifecycle.canonicalTagKey`, `tagSlugSegment`, `canonicaliseTags`
RULE: fold at creation, not by comparing loosely everywhere. Lowercase, spaces→hyphens. Display
casing is regenerated by `describeTag` (title-case), so storage stays canonical.
WHY: free text ("Smugglers", "Red Syndicate") became keys that the import strip read as V1
display-name tags and deleted on save.
BLAST: ORDERING TRAP — `isLegacyTag` recognises a V1 tag BY its capitals and spaces. Canonicalise
AFTER the legacy strip or you launder every V1 tag into a valid-looking user tag.

### TAG-8 Rule evaluation order is load-bearing
BUCKET: ARCHITECTURE - an authored rule list whose evaluation advances a seeded stream has an ORDER
that is output, not presentation. Named by the carry-forward criterion.
WHERE: `TagRule.seq`, consumed in `reasonsToVisit.poiPacks`
RULE: each body rolls a seeded random number PER RULE and the sequence advances every time. Changing
the ORDER rules run in changes which tags every world gets. `seq` preserves the authored order across
storage changes.
WHY: moving rules onto their categories grouped them by category and re-rolled the entire bundled
starmap. Caught only by the derived baseline moving.
BLAST: anything that re-orders, filters, or re-groups the rule list. Diff
`tests/output/solar-system-derived.json` after.

### TAG-9 Player redaction happens at exactly one point
BUCKET: ARCHITECTURE - audience redaction happens at exactly ONE point. A second site is how a leak
happens, and nothing reports the difference.
WHERE: `system/utils.computePlayerSnapshot` → `tagLifecycle.redactTagsForPlayers`
RULE: `secret` tags and `playerHidden` categories are stripped there. Every player surface
(catalogue, player views, holo, broadcast, report) reads that snapshot.
WHY: a second redaction site is how a leak happens — one surface gets the fix, another does not, and
nothing reports the difference.
BLAST: a new player-facing surface must consume the snapshot, not the raw system.

### TAG-10 Defaults live apart from the store that seeds from them
BUCKET: ARCHITECTURE - a registry seeds at MODULE LOAD from a type-only defaults module, so it
cannot cycle and cannot depend on who imported first. Write the test that does NOT import the store.
WHERE: `src/lib/tags/tagDefaults.ts`
RULE: `tagDefaults` has TYPE-ONLY imports and therefore cannot cycle. `tagCategories` and
`tagLifecycle` both seed from it AT MODULE LOAD, never lazily.
WHY: lazy seeding from "whoever imports first" meant a spec that never imported `coi.ts` ran against
an empty store — the B33 surface-resource assertions failed for a reason unrelated to B33. The same
trap recurred with the provenance registry a phase later.
BLAST: any new registry. Seed it at load; write a test that does NOT import the store.

### TAG-11 Storage is one store behind old names
BUCKET: IMPLEMENTATION - a store one generation behind its own names; the views are the deletion
target. The carry-forward criterion's own example, and exhibit 3 in faults-the-old-shape-allowed.md.
WHERE: `tags/tagCategories.ts`; `constructs/coi.ts` and `physics/reasonsToVisit.ts` export VIEWS
RULE: `coiCategories` / `poiPacks` / `reasonsConfig` are derived read-only views over
`tagCategories`. Mutating them does nothing. Write through the `tagCategories` mutators.
WHY: PoI and CoI were the same shape in two stores with two file formats and two disagreeing
definitions of "core".
BLAST: these views are the deletion target once their last consumer moves.

### TAG-12 SYSTEM means undeletable, NOT undisableable
BUCKET: ARCHITECTURE + IMPLEMENTATION - durable: a protection flag must name WHICH operation it
forbids, and an absent preference is not 'on'. The slug list is this code's.
WHERE: `tagCategories.SYSTEM_CATEGORY_IDS`, `normalizeTagCategories`
RULE: status, owner, purpose, resource, class, drive, frontier cannot be DELETED (the engine matches
those slugs by hand). They CAN be switched off.
WHY: `frontier` has always been user-toggleable; forcing it on during migration would have silently
re-seeded tags across an existing campaign.
BLAST: migration must copy enabled state verbatim; "absent preference" is NOT "on" — `intrigue`
ships off (caught by the derived baseline moving).


### TAG-13 Map markers read the snapshot, never the raw system
BUCKET: ARCHITECTURE - the marker builder is audience-BLIND by design; the caller hands in tags
already scoped to its audience.
WHERE: `tags/mapHighlights.markersFor` (takes tags, not a body id)
RULE: `markersFor` has no idea who is looking, deliberately. The caller passes tags that are ALREADY
redacted for that audience — player surfaces pass the snapshot (TAG-9), GM surfaces pass raw.
WHY: it makes "highlight the whole Faction category" safe to leave on: a secret faction cannot become
a player badge, because it was removed before markers were built. Teaching the marker builder about
audiences would put a second redaction rule next to the first.
BLAST: a new marker surface → confirm which tags it hands in.

### TAG-14 Highlight selection is live and shared, not per-surface
BUCKET: ARCHITECTURE - one live value drives the authoring surface and the published one. A separate
preview is a second source of truth about what the audience sees.
WHERE: `player/liveOverrides.mapHighlights`
RULE: ONE value drives the GM's maps and the players' windows. Momentary — never saved into a preset.
WHY: the GM must be looking at what they are about to push; a separate preview is a second source of
truth for "what shows on the map".
BLAST: do not add a GM-only copy. Persisting a favourite set is banked, not built.

### TAG-15 A player window has its OWN store instances
BUCKET: IMPLEMENTATION (durable half is PLATFORM) - the carry-forward criterion's example. The half
that survives: a separate browser document is a separate MODULE GRAPH, so nothing held in module
scope crosses it.
WHERE: `SystemVisualizer.highlights` prop; `broadcast.PresetOverrides.mapHighlights`
RULE: the player view runs in a separate document, so every Svelte store in it is a fresh empty
instance. Anything the GM sets locally reaches it ONLY over the broadcast. Components shared by both
take the value as a prop and fall back to the store.
WHY: a shared component reading `$liveOverrides` works on the GM's screen and silently does nothing
on the player's — no error, just a feature that never appears.
BLAST: any GM-side live control that a shared component consumes. Add it to `PresetOverrides` too.

### TAG-16 There are TWO tag pickers and they are not duplicates
BUCKET: IMPLEMENTATION - two pickers, not duplicates; the FILTERING is the difference. Carry-forward
criterion's example, and exhibit 2 in faults-the-old-shape-allowed.md.
WHERE: `components/TagFinder.svelte` (map-derived) vs `components/TagPicker.svelte` (full vocabulary)
RULE: TagFinder offers only tags something ACTUALLY carries, with counts — for finding, and for
choosing map highlights. TagPicker offers every category, engine namespace and declared tag whether
or not anything carries it — for adding a tag by hand, and for authoring.
WHY: picking the wrong one fails in BOTH directions. A manual-tagging picker filtered to what exists
can never add the first instance of anything; a highlight picker full of unused tags offers things
that will never appear on a map.
BLAST: new tag-choosing UI → pick deliberately and say which in the component header. Do not "unify"
them; the filtering IS the difference.

### TAG-17 A helper that reads a reactive value OUT OF SCOPE is invisible to the compiler, and `{@const}` will not re-run
BUCKET: PLATFORM (Svelte 4 legacy reactivity) - a {@const} re-runs only for values its own
expression MENTIONS. Durable half: a declarative surface needs its dependencies made explicit; an
imperative rAF one re-reads for free.
WHERE: `components/Starmap.svelte` — `systemMarkers` / `systemMatches`, called from
`{@const hl = systemMarkers(systemNode, activeHighlights, $tagCategories)}` inside the systems each-block.
RULE: pass reactive values as ARGUMENTS at the call site. A `{@const}` re-evaluates only when a value
its own expression MENTIONS changes; a helper that closes over `activeHighlights` hides that dependency,
so the const is computed once and never again.
WHY: the starmap roll-up markers (§9.4 of the tagging design) shipped at v2.1.4xx and had NEVER RENDERED.
`systemMarkers(systemNode)` closed over the selection, so every system's badges were computed against the
empty selection at mount and frozen there. The FADE worked throughout, because its expression names
`highlightsActive` directly — which is exactly what made it hard to see: the map visibly responded to a
highlight (31 of 42 systems dimmed) while the thing the feature is FOR never appeared. Measured after the
fix: 11 marker groups, 14 pills, matching the 42−31 that were not dimmed.
SECOND INSTANCE, SAME FILE, 2026-08-17: `labelColumn(systemNode)` closed over `labelK` to offset a
system's name past its star glyph. Every column was therefore computed once at mount, when `labelK` was
1, and frozen — so a gap meant to be 6 SCREEN px came out as 6 WORLD units, which is the
zoom-dependent offset the change existed to remove. Caught by MEASURING rather than by looking: 6.00
against an expected 15.11 at zoom 0.397. Fixed by passing `k` as an argument. **The tell both times was
a value that looked plausible at one zoom** — if a helper in this file reads anything reactive, check it
at two zooms before believing it.
BLAST: any `{@const}` calling a `const` helper in this file or another legacy-mode (`$:`) component — the
same shape appears wherever a helper is defined once and used in a template. A continuous
`requestAnimationFrame` renderer does NOT have this bug and is why the ORRERY was fine:
`SystemVisualizer` re-reads `activeHighlights` every frame. Declarative surfaces need the dependency
made explicit; imperative ones re-read for free. Do not "fix" the canvas by copying this.

### TAG-18 The tag pill is ONE shape, and two of its four implementations cannot share code
BUCKET: IMPLEMENTATION - one shape, four implementations, two of which cannot share code.
Carry-forward criterion's example, and exhibit 1 in faults-the-old-shape-allowed.md.
WHERE: `tags/tagPill.ts` (the authority), `styles/tokens.css` `--tag-pill-*`, guarded by `tagPill.spec.ts`
RULE: a panel chip and a map marker are the same object. Geometry is defined ONCE as proportions in em
(padX 0.625, padY/radius 0.3125, gap 0.46875) against a 12.8px base; every surface scales that, never
restates it. CSS consumers read the tokens; canvas and SVG consumers call `tagPillMetrics(fontPx)`.
WHY: there were FOUR shapes that merely resembled each other — CSS chips at radius 4/pad 8, the orrery's
canvas rect at radius 3/pad 4, the starmap's SVG rect at radius 2.5/pad 3, and the CSS chip itself
duplicated between `BodyTagsTab` and `TagFinder` with `0.8em` against `0.8rem`. The starmap's was worse
than merely different: its width was `label.length * 3.6 + 6`, a CHARACTER COUNT, so `WWWWWWWW`
overflowed its own rect by 17.5px (50%) while `iiiiiiii` sat in one 45% too wide.
BLAST: CSS and TS cannot import from each other, so the spec parses `tokens.css` and asserts the four
values still equal `TAG_PILL_BASE` — a red test is the only thing standing between them. Adding a fifth
surface → call `tagPillMetrics`, do not copy numbers. **A ZERO MEASUREMENT IS NOT A MEASUREMENT:**
`measureTagPillText` falls back to an estimate when a context answers 0 for non-empty text, because jsdom
and other stub 2D contexts do exactly that and a null check sails straight past them.

### TAG-20 The player's system view is HoloView at BOTH tiers, and a marker must be added in FOUR places
BUCKET: IMPLEMENTATION - four renderers of one badge plus a fifth document path, and 'the 2D system
view' names two different renderers depending on who is looking. Exhibit 4 in
faults-the-old-shape-allowed.md.
WHERE: `catalogue/+page.svelte:effectiveSystemTier` (holo3d AND diagram2d → `'holo'`), `holo/scene.ts`
`drawLabel`, `starmap/starmapScene.ts` `drawLabel`, `catalogue/document/guideDocument.ts`.
RULE: a tag badge has FOUR renderers and they are not interchangeable. GM 2D orrery =
`SystemVisualizer` canvas. GM starmap = `Starmap.svelte` SVG. PLAYER system view, 2D *and* 3D =
`holo/scene.ts` label sprites. PLAYER starmap, 2D *and* 3D = `starmapScene.ts` label sprites. The
textual guide is a fifth, through the document block model. `SystemVisualizer` NO LONGER APPEARS ON A
PLAYER VIEW AT ALL — it served the legacy Starship Console skin, which A42 removed at v2.1.702; the
`'static'` tier is now the document and list modules only.
WHY: a previous session wired `SystemVisualizer` believing it was the player's 2D map. It is not —
RENDER-B2 records the same trap one level up for the starmap. "The 2D system view" names two different
renderers depending on who is looking.
BLAST: adding anything per-body to a player view → all four, plus the document. The scene-side badges
ride the EXISTING label sprite rather than adding a second sprite, so they inherit position and
visibility for free; the cost is that the sprite grows downward, so `sprite.center` must be re-derived
from the NAME's share of the canvas or the name drifts away from its body.

### TAG-21 Resolve markers where the AUDIENCE is known, not in the renderer
BUCKET: ARCHITECTURE - resolve an audience-scoped value where the AUDIENCE is known, never inside
the renderer, and do not add an audience flag to the resolver.
WHERE: `starmapScene.SmSystem.markers` (handed in), vs `holo/scene.setHighlights` (resolved inside)
RULE: `markersFor`/`rollUpMarkers` are audience-blind (TAG-13). Whoever CALLS them decides whether GM
tags or a player's redacted snapshot go in, so resolve as close to that decision as possible.
`Starmap3DView` resolves and passes `SmSystem.markers`; the holo scene is handed the selection and
resolves per body only because it already owns the system it was given.
WHY: it keeps the scene modules free of tag imports and makes the redaction boundary greppable — one
call site per surface, each visibly holding either the snapshot or the raw system.
BLAST: do NOT add an audience flag to either function. If a new surface needs markers, give it the
tags it should badge and let it resolve, or resolve for it upstream.

### TAG-19 A canvas surface CANNOT be verified in a worker session, and the reason is not the screenshot
BUCKET: PLATFORM (browser: requestAnimationFrame does not fire in a hidden document) - declarative
surfaces (SVG, DOM) ARE verifiable headlessly; canvases are not, and the pane works while it is
DISPLAYED.
WHERE: any `requestAnimationFrame` renderer — `SystemVisualizer.drawSystem`, `holo/scene.ts`
RULE: the Browser pane runs with `document.hidden === true` / `visibilityState: 'hidden'`, so rAF never
fires. Measured 2026-08-08: **0 frames in 1500 ms**, and the whole 674x720 orrery canvas reads back
ZERO OPAQUE PIXELS. Nothing is drawn, so nothing can be read back either — `getImageData` is not a way
round it.
WHY: the standing rule says "screenshots time out", which reads as a capture problem and invites people
to keep trying. The mechanism is upstream of capture: the frame was never rendered. DECLARATIVE surfaces
(SVG, DOM) are unaffected and ARE verifiable headlessly — the starmap markers in TAG-17 were confirmed
live this way, by reading real `getBBox` widths against `measureText`.
BLAST: if your change lands on a canvas, verify the PRIMITIVE instead (import the real module from the
dev server, draw into your own context, probe pixels) and hand back an explicit list for a human eye.
Do not report a canvas change as visually confirmed.
UPDATE (2026-08-08, same session): the owner OPENED the pane on request and everything worked
immediately — 60 fps, `document.hidden === false`, screenshots fine, canvas readback fine, all three
marker shapes confirmed on the live 3D player view. So the pane is not permanently unavailable to
worker sessions; it is unavailable while it is not DISPLAYED. Measure `document.hidden` and say which
state you are in rather than assuming the pane is broken — and it is worth asking.

---

## OVERRIDES — what a GM pins, and where it is described

### OVR-1 An override is authored INPUT, and it is described in exactly ONE place
BUCKET: ARCHITECTURE - a pin is authored INPUT fed in before the solve, never poked into derived
output, and ONE roster record owns every presentation fact about it. House rule inside: a figure
that breaks physics is kept and LABELLED, never clamped.
WHERE: `src/lib/physics/overrides.ts` `OVERRIDE_DEFS`; the shape on `types.ts` `body.overrides`.
RULE: a key PRESENT in `body.overrides` means the GM pinned that value — it is fed into the derivation
BEFORE the solve, never poked into derived output (PHY-1 is the guard). Every label, unit, slider
range, absurd-but-allowed range, derived default and warning sentence comes from the roster record;
no editor, panel or trace may restate any of them. Reset DELETES the key and its anomaly assignment.
WHY: G37. There were four editors holding one override each — albedo and radiogenic heat in
`BodyTemperatureTab`, thermal inflation in `BodyBasicsTab`, the magnetosphere in `BodyAtmosphereTab`
under a convention of its OWN (`magneticField.manual`) — with four seeds, four clamps and four
spellings of "overridden", plus a fifth key (`flareActivity`) that had no editor at all. The info
panel's list of what the GM had pinned was hand-written and had already dropped two of them, so the
one surface whose job is to say what the physics does not own answered "nothing" for a pinned world.
BLAST: a new override is a RECORD, never a new row of UI. A new surface reads the roster, never a
literal. NEVER CLAMP TO `plausible()` — it produces a sentence, not a limit; the house rule is that a
figure which breaks physics is kept and labelled, and only the finite `hard` pair applies.

### OVR-3 An anomaly tag is DERIVED from an authored assignment, and its clear has two parts
BUCKET: ARCHITECTURE - an authored assignment and its derived tag are two objects; the clear must
cover both the derived twin and any manual twin, or a reset strands a reason for ever.
WHERE: `SystemProcessor.applyAnomalyTags` (pass 7); `body.overrides.anomalies`; the category seed in
`tags/tagDefaults.ANOMALY_CATEGORY_SEED`.
RULE: the ASSIGNMENT (override key -> anomaly tag) is authored and saved; the `anomaly/*` TAG is
re-emitted from it every pass and is stripped on load like any derived tag. The tag's VALUE is the
list of overrides it accounts for, in roster order — that list is the feature, not decoration. The
clear is BOTH `stripForReprocess(['anomaly/'])` AND a removal of any manual twin of a bound key:
the first is what lets a reset leave no orphan behind, the second is what stops `emit`'s duplicate
guard from keeping a bare hand-added twin and dropping the informative one.
WHY: with only the bound-key removal, resetting the LAST override on a body left its reason tag
stranded for ever — there was no bound key left to strip it by. Caught by a test, not by reading.
BLAST: a hand-added `anomaly/*` with no override behind it is a legitimate GM tag and must survive
(it is `manual`, so `survivesRederive` spares it in both the pass and the load-path strip). The
assignment map is GM bookkeeping and is deleted wholesale in `computePlayerSnapshot` — a secret
reason is redacted out of `tags` but would still be named in plain text there.

### OVR-4 A pinned surface temperature needs TWO composers, because the mean falls out of the hemispheres
BUCKET: DOMAIN + ARCHITECTURE - domain: the mean of two fourth-roots is not linear in flux, so only
a MULTIPLICATIVE scale lands a pinned mean. Architecture: a pin short-circuits a fixed point at
exactly one link, and a derived() reader must not hand the pin back as the physics' own answer.
WHERE: `temperature.composeBodySurfaceTemperature` (returns the pin outright) vs
`temperature.composeModelledSurfaceTemperature` (ignores it); the two-pass `buildProfile` in
`SystemProcessor.processEnvironment`.
RULE: the pinned composer is what SHORT-CIRCUITS the thermal solve — the surface is invariant across
the iteration, so the bright-condensate feedback (B5's bistable trap) is cut at its temperature link
and the clouds, greenhouse and geology read the GM's figure. But the PROFILE must not use it: PHY-19
says the mean falls out of the day and night sides, so a composer answering with the pin at every
equilibrium temperature hands it two identical hemispheres and flattens the world. The profile is
built through the MODELLED composer, its (unrounded) mean measured, and rebuilt with the composer
scaled by `pin / thatMean`. One closed-form factor, linear in temperature — the mean of the two
scaled hemispheres is exactly the pin, their ratio is untouched. Never an iteration toward the pin.
WHY: three implementations were tried. Returning the pin from every compose flattened an eyeball
world. Carrying the difference as a constant anomalous FLUX kept the swing but did NOT land on the
pin — the mean is an arithmetic average of two fourth-roots, so a flux offset does not survive it,
and a pin BELOW the modelled figure floored the night side at zero and came out 106 K high. Only a
multiplicative scale is linear in the quantity being averaged.
BLAST: `surfaceTempProfile` returns `meanExactK` beside the profile for this ONE caller —
`profile.meanK` is rounded to a whole kelvin, which is a 4 K error on a 1100 K pin. Anything else
reads `profile.meanK`. And an override whose pin is fed into a committed field (albedo, flare
activity, pressure, this) cannot report its own derived default while pinned; those `derived()`
readers return `undefined` rather than handing the pin back as the physics' answer.

### OVR-5 A pinned density must NOT re-infer the composition, and must read from the HELD quantity
BUCKET: DOMAIN + ARCHITECTURE - domain: mass, radius and density are ONE relation with two degrees
of freedom, and gravity falls out of the mass. Architecture: a pin holds the second degree of
freedom, something must say which is the other, and the derived default is measured from the HELD
quantity or reset is not a fixed point.
WHERE: the `densityGcm3` record in `physics/overrides.ts` — its `commit`, and
`densityOnCompositionCurve` / `curveMassMe` beside it.
RULE: mass, radius and density are one relation with two degrees of freedom, so a density pin pins
the SECOND and `overrides.densityHold` says which of mass and radius is the other (owner Q1, "pin
any two"). The COMPOSITION is held, never re-inferred — the plain relation from `bodyEdit`, NOT
`editDensity`, which also calls `makeupForGeomDensity`. And the derived default is measured from
the HELD quantity, through the mix's own mass-radius curve.
WHY, twice over. (1) `editDensity` re-infers the makeup, which is right for the composition editor
and wrong here: it turns "a rocky world that weighs a tenth of what rock weighs" into "a world made
of gas", explaining away the exact contradiction the GM asked for and the anomaly tag exists to
name. (2) Reading the derived default from the CURRENT mass instead of the held quantity left reset
one step short of the fixed point — a hollow Earth reset to 4.35 g/cm3 against the 5.76 its
composition implies, because the hollow mass compresses less. Caught by a test.
BLAST: gravity and escape velocity stay DERIVED (owner Q8) — a hollow world's low gravity falls out
of its mass, and a direct `g` pin would fight mass and radius. Barycentres follow the mass too, so a
density pin on a binary member moves the pair's centre; that is honest and intended.

### OVR-6 A pin SUPPRESSES the model that would reconcile the thing it pinned
BUCKET: ARCHITECTURE - any model whose job is to make two quantities AGREE must stand down when a
human has pinned one of them; and a pin that writes an authored field must not run before anything
that SNAPSHOTS that field.
WHERE: `makeup.reconcileGiantMakeup` (guarded on `overrides.densityGcm3`); the `atmosphere0`
snapshot hoisted above `applyPressurePin` in `SystemProcessor.processEnvironment`.
RULE: any model whose job is to make two quantities AGREE must stand down when a GM has pinned one
of them — the pin is a statement that they deliberately disagree. And a pin that writes into an
authored field must not run before anything that SNAPSHOTS that field.
WHY: both were found by a save/load test, not by reading, and both DESTROYED AUTHORED DATA
PERMANENTLY because the correction was written to the body and therefore saved.
(1) `reconcileGiantMakeup` fires on mass > 8 M⊕ AND density < 2.5 g/cc and rewrites `body.makeup` to
a gas envelope. A GM hollowing a heavy rocky world hits both conditions by construction, so their
rock became 88% gas on the next pass — the exact contradiction the pin exists to state, explained
away, silently, and gone from every save thereafter.
(2) `atmosphere0` is the primordial baseline atmospheric escape erodes FROM, snapshotted the first
time an opted-in world is processed. The pressure pin wrote into `atmosphere.pressure_bar` BEFORE
that snapshot, so pinning 40 bar on a world whose authored baseline was 1 bar recorded 40 bar as
that world's own history.
BLAST: `src/lib/system/override-persistence.test.ts` is the guard — it pins all eight at once and
asserts `process(load(save(process(x)))) === process(x)` on every leaf field. Any future pin that
moves an authored field (mass, radius, pressure, composition) must be added to its fixture, and any
future model that reconciles two quantities must ask whether either is pinned.

### OVR-7 A star's HAZARD card is its ionising output; its brightness is a different quantity
BUCKET: DOMAIN + ARCHITECTURE - domain: a star's brightness and its ionising output are physically
independent, which is why 'make this one dangerous' and 'make this one brighter' are two levers.
Architecture: PHY-2's lie, in one card.
WHERE: `BodyTechnicalDetails` star branch; `physics/ionisingOutput.bodyIonisingOutputSolar`;
`physics/stellarActivity.stellarActivityBucket`; the `flareActivity` term in `radiation.ts`.
RULE: `radiationOutput` is a star's LUMINOSITY. It must never be published as a radiation hazard.
The hazard quantity is `flareActivity` and the ionising output derived from it — that is what the
field feeds, what the map's zones follow, and what reaches a planet as a particle dose.
WHY: the star card read `radiationOutput` under the label "Radiation Level", in the hazard
colour, next to the magnetic field. Sol therefore read "Low (1.00)" — and it was the one figure
on the panel that COULD NOT MOVE when a GM wound the star's field up, because the engine
deliberately separates the two levers ("the lever for 'make this one dangerous' must not be the
lever for 'make this one brighter'"). It was also a second printing of the Luminosity card a few
rows below. Reported by the owner as "none of this seems to reflect on the info panel", which is
exactly what a mislabelled card looks like from the outside. PHY-2; same shape as B28.
BLAST: `ionisingOutputSolar` returns MULTIPLES OF THE QUIET SUN'S ionising output, not L(sol) —
the first version of the replacement card got that wrong too and printed "1.61e+0 L(sol)" for the
Sun. State what a figure measures and in what units before you put a suffix on it.

### OVR-2 `gasThermalInflation` is the one pin `process()` never reads
BUCKET: ARCHITECTURE + IMPLEMENTATION - durable: a pin whose target is AUTHORED input needs a commit
at edit time, and a pin on a DERIVED field must not have one. Which pin it happens to be is this
code's.
WHERE: `overrides.ts` — the `commit` on the `gasThermalInflation` record; `BodyBasicsTab.effInflation`.
RULE: inflation sizes a body at GENERATION and `radiusKm` is authored thereafter, so pinning it has
to move the radius AT EDIT TIME, through `bodyEdit.editMass` — the same chain the composition editor
uses. `OverrideDef.commit` is where that consequence lives, so the tab stays free of per-quantity
branches and pin and reset take the same path.
WHY: every other override is read by the processor on the next pass. Moving this one onto a generic
tab without the hook would have produced a slider that saved a number and changed nothing visible
until the next mass drag happened to read it.
BLAST: a pin whose target is AUTHORED input (radius, pressure, mass) needs a `commit`; a pin on a
DERIVED field must NOT have one — that would be an edit to derived output, which is exactly what
PHY-1 and `idempotence.test.ts` exist to catch.

## PHYSICS — ordering and honesty

### PHY-20 A surface property that VARIES BY AN ORDER OF MAGNITUDE is a process, not a constant
BUCKET: DOMAIN - carry-forward criterion's example. Move verbatim.
WHERE: `physics/albedo.frozenSurfaceAlbedo` and the `surface_albedo` block in `planets.json`
(`ice_clean`, `ice_lag`, `ice_lag_half_age_Gyr`); the rocky analogue is `deriveOxidation` + `dust`.
RULE: where one constant has to stand for a whole class of surface, check its SPREAD against
measurement before believing it. If the class spans a factor of several, the constant is standing in
for a process, and the process is almost always the same shape: a bare material, something that
settles on it, and TIME. Both deposit models here take their time from the surface age the solve
already computes, so a third one must read that same figure rather than adding an input.
WHY: `ice: 0.62` and `frost: 0.62` made Enceladus (measured 0.81, the brightest body in the solar
system) and Callisto (0.11, one of the darkest) the same number — a 5.6x error, and they are not
edge cases but the two ENDS of one process: fresh ice is bright, old ice is filthy, and only
resurfacing resets it. Ganymede sat ~15 K cold because of it.
BLAST: albedo is INSIDE the thermal fixed point, so anything here moves equilibrium temperature and
everything downstream — measured, five bodies moved and each of `equilibriumTempK`, the temperature
profile, `volatiles.lambda`, `surface/irradiation` and `activity/sublimating` followed. Keep the new
term keyed on SURFACE AGE and not on temperature, or it becomes a second feedback edge and B5's
bistability trap (bright condensate is self-reinforcing) has a new way in. TWO STATES OF ONE
MATERIAL ARE TWO NUMBERS: a frost condensing out of the air NOW is clean by definition and does not
age, while a shell that has been lying there since the last resurfacing does — conflating them made
Enceladus's own plume-fall darken Enceladus, and made Io and Pluto worse when the shared constant
was raised.

### PHY-19 An equilibrium temperature is a POWER balance and is never a mean
BUCKET: DOMAIN - carry-forward criterion's example. Move verbatim.
WHERE: `physics/temperature.calculateEquilibriumTemperature` and `composeBodySurfaceTemperature`
(which produce it) vs `physics/surfaceTemperature.surfaceTempProfile` (which produces the mean).
RULE: `equilibriumTempK` and `temperatureK` are the temperatures at which the body RADIATES what it
takes in. The MEAN surface temperature is the average of the day and night sides and is a different
number. Derive day and night from the balance and let the mean fall out of them; never hang a
symmetric swing off the balance figure and call the result a mean. Every reader-facing "mean
surface temperature" reads `temperatureProfile.meanK`; the classifier, the tags and the thermal
fixed point read `temperatureK`. Two quantities, both correct, and each must say which it is.
WHY: radiated power goes as T⁴, so a surface at 390 K noon and 100 K midnight radiates exactly as
much as a uniform 270 K one while AVERAGING 60 K below it. Treating the balance figure as the mean
made Luna read a mean of -3 °C, a noon of 209 °C (against a measured 120 °C) and a night of -214 °C
(against -173 °C) — three symptoms of ONE fault, and no value of the swing constant fixes any of
them, because the fault is the shape (B63). The corollary is the bound the old model lacked
entirely: the sunlit side cannot exceed √2·Teq, the temperature at which the ground alone
re-radiates light falling straight down on it.
BLAST: the swing terms scale on `equilibriumK` but hang off the DERIVED mean, so anything reading
`temperatureRangeK` moves when the mean does — `rendering/planetAppearance` (thermal glow, eyeball),
`activity/sublimating` and `climate/polar-ice` in `SystemProcessor`, `physics/vegetation`. A world
that is nearly isothermal (thick air, or simply cold — radiating is feeble at 70 K) correctly emits
NO day/night component at all. Do not add a rival day/night model in a display component: one was
deleted from `BodyTechnicalDetails.svelte` in the same commit, with its own constants, and nothing
had ever rendered it.

### PHY-1 Nothing may read a value a later pass writes
BUCKET: ARCHITECTURE - THE requirement. Not documentation: a property the new engine either has from
its first commit or spends a year discovering it needed. Its test (idempotence.test.ts) is MORE
PORTABLE THAN THE CODE IT GUARDS - port the test before the engine it guards.
WHERE: `src/lib/system/idempotence.test.ts`
RULE: process, process the result, process that — nothing on any body may change. If that test goes
red, find the read; do not relax the test.
WHY: seven such edges at once in B13; one put a hundredfold error on Earth's radiation card. Every
other test runs `process()` ONCE and therefore pins pass-1 values a GM never sees.
BLAST: corollaries — a derived CLASS is never a physics input (the classifier runs late); when a
quantity depends on another body, iterate PARENT BEFORE CHILD, not in file order.

### PHY-27 Chromatic adaptation is BOUNDED — never amplify a cone that has no photons in it
BUCKET: DOMAIN - adaptation is per-cone and BOUNDED by the photons actually present. The
low-pressure sodium lamp is the everyday proof.
WHERE: `physics/imageUnderLight.adaptationMatrix`, and any future re-lighting on the GPU.
RULE: the degree of adaptation is PER CONE, scaled by `sqrt(this cone's share of the light, here vs
at home)`. A starved channel is left as it arrived, not gained back up.
WHY: plain von Kries divides by the illuminant's own cone response, which assumes the eye can
discount any light however little of it there is. On Venus the S cones receive 0.5% of their home
share and the maths asked for a 134-fold gain. That does not recover the colour, it recovers the
noise: a white card came back `#ffcdc8` and a blue wire came back violet, so the whole world went
pink. The everyday proof of the bound is a low-pressure sodium street lamp — under one the world
looks orange-grey, NOT colour-corrected.
BLAST: the same physics used to be applied a SECOND time as a per-channel `snr` weight inside
`confusability()`. It is removed there. If it ever comes back, every dim world reads as more
confusing than it is, because the two mechanisms multiply.

### PHY-18 Visibility is the surface spectrum's optical depth turned on its side — derive it ONCE
BUCKET: DOMAIN + ARCHITECTURE - domain: a dim sky overhead and a lost horizon are ONE mechanism, and
Earth's ~340 km is the calibration. Architecture: one derivation, one export, or two plausible
answers drift silently.
WHERE: `physics/visibility.ts`, reading `surfaceSpectrum.rayleighTau550`.
RULE: extinction at the ground is `rayleighTau550 / scaleHeight`. Do not re-derive a column density,
a cross-section or a Rayleigh law anywhere else; that export exists so there is one of each.
WHY: a sky is dim overhead and a horizon is lost for the SAME reason — light scattered out of the
path. Two derivations of it would drift, and the drift would be silent because both would look
plausible. The check that it has not drifted: Earth must come out near 340 km, the textbook
clean-air Rayleigh limit.
BLAST: the visibility BAND keys on the atmospheric range, never on `seeM`. Clamped to the horizon,
Earth, Mars, Titan and Venus all read "murky", because a standing person's horizon is a few
kilometres everywhere and says nothing about the air.

### RENDER-B4 In the Surface view, a REFLECTANCE is re-lit and LIGHT is not
BUCKET: DOMAIN - which of the three layers a thing belongs to (reflectance, light, emission) is
PHYSICS, not convenience. Re-lighting a sky asks what it looks like lit by itself.
WHERE: `charts/surfaceScene.ts` (`drawMaterials` vs `drawSky` / `drawEmissive` / `drawMarkers`) and
`charts/UnderThisLight.svelte`'s draw path.
RULE: three layers, and which one a thing belongs to is physics, not convenience. Ground, water,
plants and buildings are reflectances and go through the operator. Sky and star are light and are
painted in their final colour. Lava, lit windows and AIRLIGHT are emission or added light and go on
the composite afterwards.
WHY: re-lighting a sky asks what it looks like when lit by itself. Painting the ground from the
palette's `hex` lights it twice AND makes the "at home" half of the wipe show the world under its own
sun, which is not a comparison. `ApparentColorStop.rawHex` exists for exactly this: `hex` is
appearance, `rawHex` is the material.
BLAST: `relightImage` skips fully transparent pixels, which is what lets the material layer be an
offscreen canvas composited over the sky with no mask of its own. Do not "optimise" that skip away.

### PHY-26 Normalise a colour-matching result against the BAND, never against its own peak channel
BUCKET: DOMAIN + PLATFORM (gamut/numeric) - domain: tristimulus values in the tails are numerically
meaningless, so per-sample normalisation manufactures full saturation where the eye has none.
Platform: the out-of-gamut repair turns a rounding error into a hue.
WHERE: `physics/spectrum.wavelengthHex` (the chart ribbon) and, by the same argument, anything else
that turns a narrow spectral feature into a colour.
RULE: divide by a shared scale across the whole grid, not by that sample's own maximum channel.
WHY: out in the tails the tristimulus values are vanishingly small AND numerically meaningless — the
ragged remains of a Gaussian fit to the colour-matching functions. Dividing them by their own maximum
scaled that noise to FULL SATURATION, so the ribbon came out bright cyan at 300 nm and mint green at
780 nm. Colour where the eye has none, and it looked deliberate. Owner spotted it on the chart.
BLAST: any new plot that colours by wavelength. Also keep the near-black floor: without it the
out-of-gamut repair in `xyzToHex` (which lifts negative channels) turns a rounding error into a hue.

### PHY-24 The human eye enters at the END or it poisons the derivation
BUCKET: DOMAIN - carry-forward criterion's example. Move verbatim.
WHERE: `physics/spectrum.ts` (everything below the PRESENTATION BRANCH divider), `physics/pigments.ts`,
`rendering/apparentColor.ts`.
RULE: a selection, score or ranking reads PHOTON COUNTS (`photonFlux` / `photonSpectrum`). Colour
matching (`spectrumToHex`, `reflectedHexUnderIlluminant`, `wavelengthHex`) is the LAST step and only
ever on the presentation branch. Anything that derives an RGB and then chooses from it is the bug.
WHY: the original pigment sketch measured "available light" with Rec. 709 luma, which weights green at
0.7152 because HUMAN retinas are green-sensitive — a fact about us inside a claim about alien biology
(B45). `apparentColor.ts` has the same fault one level up: it filters starlight in RGB, so every
absorption is projected onto three human primaries before anything is computed (B54).
BLAST: two colours exist for one reflected spectrum and they are NOT interchangeable —
`reflectedHex` is chromatically ADAPTED to the local star (the pigment's identity, right for a
legend) and `reflectedUnderStarHex` leaves the cast and brightness in (what a renderer must use, or a
world's vegetation is white-balanced while its oceans are not). Both must SAY WHOSE in any label.
Also: per-gas `colorHex` must never be read by the spectral filter for the same reason.

### PHY-25 A capture term that does not SATURATE is the naive maximiser, and Earth falsifies it
BUCKET: DOMAIN - carry-forward criterion's example. Move verbatim.
WHERE: `physics/pigments.ts` — `sufficiency = 1 - exp(-absorbedFlux / saturationFlux)`.
RULE: photon capture saturates, the three pressures MULTIPLY rather than adding, and the capture term
reads the PIGMENT's own absorption while the colour reads pigment PLUS tissue.
WHY: each of those three was got wrong first and each produced the same visible failure — melanin on
top under every star, i.e. black vegetation around a Sun-like star, which is the one case every
reader knows is wrong. (a) Unsaturated capture IS an argmax over available energy. (b) A weighted SUM
keeps each term discriminating where it has stopped meaning anything and the three sit on
incomparable scales, so whichever varies most wins by accident; a product lets protection go to 1
when there is no overload. (c) The tissue floor is shared by every pigment, so folding it into the
scoring drowns the pigment-specific differences and the ranking collapses to "whichever absorbs
least". Also: the steadiness weight is normalised on the PHOTON-WEIGHTED MEAN slope, not the maximum
— the maximum is in the far tail where there is no light, and normalising on it made the whole term
do nothing.
BLAST: `pigments.spec.ts` asserts melanin is NOT top around a G star and that chlorophyll is in the
leading group and reads green. It deliberately does NOT assert chlorophyll ranks first — Sol is a
calibration anchor, not a target, and fitting the constants to it is the forbidden move. If you
change a weight, that spec is the thing that catches you.

### PHY-2 A quantity correct for its purpose can still be published as a lie
BUCKET: ARCHITECTURE - carry-forward criterion's example. State WHAT a quantity measures, WHERE and
IN WHAT UNITS, and check its name and its neighbours agree.
WHERE: `tags/tagConsistency.spec.ts`
RULE: when you add a derived field or tag, state WHAT it measures, WHERE, and IN WHAT UNITS, and
check its name and its neighbours agree.
WHY: a relative ratio printed beside an absolute dose (A33); a belt peak labelled "orbital" (B27); an
appearance driver published as a hazard reading (B28).
BLAST: changing a quantity → grep every tag bucketed off it AND off any older proxy for it.

### PHY-3 The radiation bucket has exactly one implementation
BUCKET: ARCHITECTURE - ONE function turns a continuous quantity into a word, and the tag and the
panel both call it.
WHERE: `physics/radiation.radiationHazardBucket`, consumed by `SystemProcessor` and `catalogue/bodyFacts`
RULE: the tag and the info-block row must bucket with the same function.
WHY: two implementations called Mars and Io both "high", sixty thousand times apart (B28).
BLAST: any new place that turns a dose into a word.

### PHY-4 Surface-requiring claims are gated on makeup.gas
BUCKET: DOMAIN + ARCHITECTURE + IMPLEMENTATION - domain: you cannot mine, refuel or resupply where
there is no ground. Architecture: one predicate, and every caller CALLS it. The caveat's site list
is this code's - and its first bullet is now STALE, corrected below.
WHERE: `tagDefaults` rule DSL `SURFACE()`; eyeball fingerprints
RULE: mining/refuelling/resupply/eyeball claims require `makeup.gas <= 0.5`. NOT `isGiant`, NOT the
delta-v budget.
WHY: a helium giant offered "water ice" and "life-support resupply" from a supercritical envelope
with no ground (B33); `isGiant` misfires on bodies carrying both a rocky and a giant class; the
budget cannot separate giants from Earth (B25).
BLAST: new resource/frontier rules must use the same gate. Same test the geology model uses.
CAVEAT (2026-08-03, contradiction check): the RULE is single, the ENFORCEMENT is not. B36 records
the same question answered in at least three more places — `physics/radiation.ts hasSolidSurface`,
an inline `habMakeup.gas <= 0.5` at `SystemProcessor.ts:1302`, and another inline copy in B25's
classifier gate. B11 unified two of them. Until B36 closes, changing the threshold here changes
some callers and not others; fix B36 before trusting this entry's WHERE.
CAVEAT RECHECKED 2026-08-07 (backfill sweep), and B36's own "they now all use the same BOUNDARY, so
nothing is currently wrong" IS FALSE — TWO of the copies disagree at the edge, in opposite ways:
  - `SURFACE()` here is `{ lt: ['makeup.gas', 0.5] }` and `reasonsToVisit.ts:252` evaluates `lt` as
    STRICT `<`. `radiation.hasSolidSurface` (now at `:35`) and `SystemProcessor.ts:1345` are `<= 0.5`.
    A body at exactly gas 0.5 therefore HAS a surface for radiation, habitability and classification
    and HAS NOT for every resource/frontier claim. Authored makeup can land there; `reconcileGiantMakeup`
    clamps to [0.6, 0.92] so the inferred path cannot.
  - B25's classifier gate is a BAND `[0, 0.5]`, and `classification.bandFit` has a 15% relative soft
    edge, while `fingerprintScore` fails a gate only on `bandFit <= 0`. So the eyeball gate really
    admits gas up to **0.575**, not 0.5. That is a gate that does not close where it says it does —
    an eligibility test written in the vocabulary of a defining band inherits the band's tolerance
    (see PHY-10). No bundled body sat in 0.500–0.575 when B25 measured its diff; nothing keeps it
    that way. **STILL STANDING** — this pass re-checked the FIRST bullet only. This one is a
    different mechanism (`bandFit`'s soft edge, not a duplicated spelling) and was not re-measured.
Do not "harmonise" these by nudging one number: pick the boundary, then make every site CALL
`hasSolidSurface`, which is what B36 asks for and what would have made both divergences impossible.

#### Positions and eclipses (C3/C9/G8) — added 2026-08-04 by the frame/suite-hygiene session

### PHY-5 The 3D propagator returns satellites ALREADY in the parent's equator; nothing may rotate again
BUCKET: DOMAIN + IMPLEMENTATION - the carry-forward criterion's own SPLIT example. Domain: a regular
satellite's elements are quoted in its PARENT'S EQUATOR, and the ecliptic handover far out is the
real Laplace plane. Implementation: 'nothing may rotate them again' is a warning about one call
site.
WHERE: `physics/worldPositions.computeWorldPositions3D` (its `frame` op) → `system/satelliteFrame.ts`
RULE: a regular satellite's elements are quoted in its PARENT'S EQUATOR, and `computeWorldPositions3D`
applies that rotation itself. So the difference of two world positions is already the framed offset —
a consumer must NOT apply `toParentEquator` to it. `satelliteTiltRad(node, parent)` is the ONLY
spelling of the gate (star parent → 0; `orbit.frame: 'ecliptic'` → 0, which is the real Laplace
handover, not a data error). The flat `computeWorldPositions` deliberately does NOT frame: it
propagates ω-only in the reference plane, 2D is the plan view, and there is no out-of-plane axis to
tilt into.
WHY: C9. The rotation lived only in `holo/scene.ts`, so the propagator and the renderer answered
"where is this moon" differently by the parent's whole axial tilt — 25.19° at Mars, 97.77° at Uranus
— and G8's eclipse search was built on the propagator on the stated assumption the frames were
already correct. A `framedWorldPositions3D` wrapper that corrected the output afterwards was DELETED
rather than kept: a correction some callers apply and others do not is the same fault one layer up.
BLAST: `holo/scene.ts` is the trap in both directions. Its body placement must keep rotating NOTHING;
its `buildLocalOrbitRing` must keep rotating, because it samples `propagateState3D` directly and so
holds a raw parent-relative offset rather than a world position — same helper, different input.
Verify any change to this by reproducing the OLD path beside the new over the bundled maps: the
RENDERED offset must not move (it did not, to 1.1e-10 of an orbit radius), while world positions do.
CAVEAT: the gate reads the PARENT, so a CONSTRUCT orbiting a body is framed to that body's equator
too. Right for a low orbiter, wrong far out for the same reason C5 gave for moons — Sol_Expanse's
Phoebe station is `ecliptic`-less beside a moon that declares it. Authoring question, filed with C8.

### PHY-6 An eclipse prediction is a reader's question, and its cache is DIRECTIONAL
BUCKET: ARCHITECTURE + IMPLEMENTATION - durable: a forward SEARCH is a reader's question and never a
derivation pass (computing it in process() costs per pass AND breaks PHY-1), and a directional cache
must be sampled on WALL time. The three surfaces are this code's.
WHERE: `system/eclipses.nextEclipseCached`, `describeEclipse`; read by `catalogue/bodyFacts` and
`components/BodyTechnicalDetails.svelte`
RULE: the prediction is a forward search over the propagator. It is computed when a reader asks and
NEVER from `process()` or any derivation pass. The cache holds until the date it predicted has gone
by — but it is valid only FORWARD (`nowMs >= hit.from && nowMs < hit.validToMs`), so a clock moving
BACKWARDS misses on every frame and every miss is a real search (up to 250 ms cold). Any surface
reading it must therefore sample the clock on WALL time, not on the sim clock: a date only needs to
be right to the second, whatever the time scale.
WHY: B13 is the cautionary tale for the first half — a per-pass cost that also broke idempotence
(PHY-1). The second half is what a GM scrubbing the timeline backwards would do to a panel that
re-read per frame.
BLAST: a THIRD surface now words this row (GM panel, player document, printed report). All three must
build the string with `describeEclipse` — see UI-E1. Adding a fourth: sample the clock, reuse the
builder, and pass no `formatDate` unless the campaign calendar is genuinely available.

#### Backfilled from closed inbox items — added 2026-08-07 by the engine-map backfill session

### PHY-7 A module that declares itself THE single evaluation has no rival, upstream least of all
BUCKET: ARCHITECTURE - carry-forward criterion's example. Carries the fixed-point-not-pipeline rule
and the SHALLOW PROBE with it: a crude model upstream of a careful one sets the loop's answer.
WHERE: `physics/cloudDecks.ts` header ("THE single evaluation"); the only caller that matters is
`physics/temperature.solveThermalState`, which passes its result INTO `deriveAlbedo`.
RULE: `deriveAlbedo` takes `decks` as an argument. It does not, and must not, work out for itself
whether a world has clouds. Anything else that needs to know asks the published
`structure/cloud-deck` tags. One question, one function, one answer, and a caller that cannot obtain
it is a caller that is about to invent it.
WHY: B1. `albedo.ts` used to derive its own decks from a `teqK < boil * 1.6` shortcut while
`cloudDecks.ts` already claimed the title. They disagreed on Adrian — albedo declared a CO2 deck,
the column physics reported none — and because albedo feeds Teq feeds the profile feeds the decks,
the CRUDE model sat upstream of the careful one and set the loop's answer. The rival was not a second
opinion; it was the operative one.
BLAST: this is why the solve exists as a FIXED POINT rather than a pipeline, and why every evaluation
inside it runs against a SHALLOW PROBE (`{...body, equilibriumTempK, temperatureK: undefined}`) rather
than the body: reading the body would let a previous `process()` leak into this one (PHY-1). Same
shape as B13's residual — "a magnetism derived early for some bodies and late for others would be two
evaluations of one question". If you need a value the solve produces, move INTO the solve or read its
committed output; do not approximate it beside it. Commit anything the solve READS before calling it.

### PHY-8 Never write a second sum of a quantity that already has one
BUCKET: ARCHITECTURE - carry-forward criterion's example. One function, three inputs, so min <= mean
<= max holds by CONSTRUCTION rather than by luck.
WHERE: `physics/radiation.calculateStellarRadiationComponents` (takes a `'current' | 'near' | 'far'`
distance selector); `calculateSurfaceRadiation` calls it three times. The deletion is commented in
place at `radiation.ts:375`.
RULE: a mean and its endpoints must come from ONE function evaluated at different inputs. Then
`min <= mean <= max` holds by construction. Two functions that "use the same model" hold it by luck.
WHY: B8. `calculateTotalStellarRadiationRange` was the second sum and had no flare term, so the mean
carried a dose the endpoints did not. 105 of 420 ranged bodies sat outside their own range, worst
19.75%. B8's OWN suggested test refuted its own hypothesis — it blamed the spectral mix and asked for
a binary, and multi-star systems turned out to be the MILDER case (34 offenders vs 71); had it only
been checked on a binary it would have been closed as negligible on the wrong evidence.
BLAST: `calculateTotalStellarRadiation` still exists and is still a bare sum with no flare term and no
spectral split — that is deliberate, it answers a DIFFERENT question (atmospheric-escape forcing,
`SystemProcessor.ts:592`), and it must not be quietly promoted into a dose. Check what a sum is FOR
before reusing it. Any new min/max/mean triple: one function, three inputs.

### PHY-9 A placeholder zero is a CLAIM, not an absence
BUCKET: ARCHITECTURE - carry-forward criterion's example. Before adding a default, ask what the
value would be ASSERTING.
WHERE: `core/BodyFactory.ts` (the "NOT defaulted, deliberately" block); `physics/magnetism.rotationFactor`
(`if (!h) return 0.6; // unknown -> middling`); the star editor's "not set" note.
RULE: never default a physical field to 0 to avoid NaN. Zero rotation, zero tilt and zero field each
ASSERT something — this world does not spin, stands upright, has no magnetosphere — and a derivation
handed one cannot tell it from a measurement. Leave the field off. Readers already guard with `??`/`||`.
Clearing an input in the UI must DELETE the field, not write zero, or the honest state is unreachable
once you leave it.
WHY: B9a, and the shape of the investigation is the lesson. The triage's headline mechanism ("a zero
rotation produces a zero field by construction") was WRONG — `rotationFactor` has always had an
unknown branch and 0 is falsy, so it took it; and `deriveMagnetism` never runs on a star at all. The
real cause was **two star-creation paths and only one of them read the pack**: `generation/star.ts`
drew from the class's `mag_gauss` band, `generateFromConfig.starSeedToBody` — the path the generation
wizard uses — set nothing, so the placeholder survived to the screen. Both now go through
`starFieldFromPack`. The zeros were the visible symptom of a duplication.
BLAST: `starFieldFromPack` / `starTiltFromPack` now have THREE callers (`generation/star.ts`,
`generateFromConfig.ts`, `import/realsky/stardefaults.ts`); a fourth creation path that sets neither
repeats this exactly. Before adding a default, ask what the value would be ASSERTING. Also read
`docs/dev/generation-duplication-map.md` before touching generation at all.

### PHY-10 A precondition is not a defining trait, and writing one as the other inverts the score
BUCKET: ARCHITECTURE - carry-forward criterion's example. A gate written as a match band does not
merely fail to help, it INVERTS the score.
WHERE: `types.ts:Fingerprint.gate` vs `Fingerprint.match`; scored in `system/classification.fingerprintScore`;
prototypes built from BOTH in `classification.audit.spec.ts`.
RULE: `gate` = eligibility (failing rules the type out entirely, passing earns nothing). `match` =
what DEFINES the type. Never express a gate as a match band.
WHY: B25. The score is the MEAN fit across match bands, so a band that is always-true for every
survivor pulls a weak defining band UP by averaging — fit 0.11 gains 37%, a perfect fit gains 8%. It
rewards the worst matches most. Adding `makeup.gas` as a match band did remove the fifteen gas-dominated
eyeballs and turned SIX temperate rocky worlds INTO eyeballs (Ross 128 b at 292 K became a "hot
eyeball" whose band starts at 320). A weight cannot undo it: the distortion is fit-dependent and a
weight is a flat multiplier.
BLAST: the overlap audit builds each type's prototype from its bands, so a gated type scores 0 against
ITSELF and reports as shadowed unless the prototype satisfies the gate too — that fired the moment the
gate landed and is why `prototype()` spreads `fp.gate` as well as `fp.match`. And see PHY-4's second
caveat: a gate written as a numeric BAND inherits `bandFit`'s 15% soft edge, so `[0, 0.5]` does not
actually close at 0.5.

### PHY-11 A quantity that never SETTLES is non-idempotence, even when nothing physical moves
BUCKET: ARCHITECTURE + PLATFORM (IEEE 754) - durable: guard the ASSIGNMENT rather than chasing the
arithmetic, and compute a nested quantity in its own deepest-first pre-pass. Platform: a round trip
through double precision lands one ulp from where it started, for ever.
WHERE: `core/SystemProcessor.settled` (a 1e-12 relative no-change test), applied to every barycentre
semi-major axis and mean motion; the effective-mass pre-pass at the top of `processBarycenters`.
RULE: where a derivation is a ROUND TRIP — separation is the sum of the members' axes, each axis is
then re-derived from that sum — double precision lands one ulp from where it started, every pass,
for ever. Guard the assignment, do not chase the arithmetic. And where a value nests, compute it in
its OWN pre-pass, deepest-first, before anything reads it.
WHY: B13. Both faults are PHY-1's, but neither is a read-before-write and neither is findable by
reading the pass order. The ulp round trip alone blocks any idempotence test. The nesting one is worse
and silent: Alpha Centauri lists its OUTER barycentre first, so on a fresh load the system barycentre
summed Proxima plus a STALE AB total — 2.43e29 against the true 4.20e30 — which moved every orbit in
the system and flipped both primaries from no stability verdict to "Very Unstable" on the second pass.
BLAST: the pre-pass also breaks a genuine circularity, so do not fold it back into the main loop: an
inner barycentre needs its parent's mass for its own orbit while the parent needs the inner one's mass
for its total. One duplicate writer was DELETED rather than guarded — a barycentre that is a member of
another had its mean motion written twice, two formulas one ulp apart, last writer wins (Algol). Two
writers of one field is the fault; `settled()` is for a single writer that cannot converge.

### PHY-12 There is exactly ONE read-before-write edge left, it is opt-in, and it is not orderable
BUCKET: DOMAIN + IMPLEMENTATION - domain, and this is the entry a new pass model must read first:
the circle field -> escape -> atmosphere -> thermal -> temperature -> fluid layers -> field IS REAL.
It cannot be ordered away, only broken, and breaking it is a design decision nobody has made. Which
flag opts in is this code's.
WHERE: `SystemProcessor.ts:587-599` — the `body.evolveAtmosphere` branch in pass 2a reads
`body.magneticField`, which pass 2b derives.
RULE: turning `evolveAtmosphere` on for a body reintroduces the B13 class. The circle is real:
field → escape → atmosphere → thermal → temperature → fluid layers → field. It cannot be ordered away,
only broken, and breaking it needs a design decision nobody has made.
WHY: `idempotence.test.ts` is green ONLY because no bundled body, either starmap, or any shipped
example carries the flag, and Mars's field is 0 on both passes so the aging check passes either way.
The test does not cover this; it is silent about it. Deriving magnetism early for opted-in bodies and
late for the rest would be two evaluations of one question — PHY-7 — so the residual was documented
rather than papered over.
BLAST: any starmap or fixture that sets `evolveAtmosphere`. Any change that makes escape non-optional.
CORRECTED 2026-08-28 (the carry-forward sort), twice, and the second half changes how this entry
should be weighed:
  (1) The dead `retainsAtmosphere` local this line used to send you to is GONE — PHY-15's own
  CORRECTED note records deleting it, and only a comment survives (`SystemProcessor.ts:968`). The
  read-before-write branch itself has moved to `SystemProcessor.ts:804` / `:856`.
  (2) **"OPT-IN" NOW UNDERSTATES THE EXPOSURE.** `generateFromConfig.ts:474` and
  `generation/system.ts:25` set `evolveAtmosphere = true` on EVERY generated planet and moon, so every
  world the wizard makes carries the flag. The WHY above is still literally true — no bundled body,
  starmap or shipped example sets it, so `idempotence.test.ts` stays green and stays silent — but the
  uncovered edge is not a rare opt-in any more, it is the default for generated content. The FIXTURES
  are the unusual case here, not the flag.

### PHY-13 A belt's or ring's `massKg` is a debris-density proxy, never a point mass
BUCKET: DOMAIN + IMPLEMENTATION - carry-forward criterion's example. The eight hand-written
exclusions with no shared predicate are this code's, and are exhibit 7 in
faults-the-old-shape-allowed.md.
WHERE: `physics/stability.ts:413` (excluded from the mutual-Hill sibling set, pinned by
`stability.spec.ts`) and `:257`; `orbits.ts:528` `isDistributed` (gates the Lagrange points);
`resonance.ts:96`; `barycenterReconcile.ts:37,154,159`; `twoBodyCoast.ts:149`. Eight sites.
RULE: any consumer that treats mass GRAVITATIONALLY must skip `roleHint === 'belt' | 'ring'`. The
number is how much stuff is spread round the annulus, not what sits at a point.
WHY: an 80-Earth-mass "belt" would wreck Hill spacing and spuriously flag its neighbouring planet as
unstable — the spec's own subject. The failure is a plausible-looking verdict on an innocent body, so
nothing reports it.
BLAST: those eight carry the test by hand and there is no shared predicate, so a NINTH consumer
inherits the bug by default rather than by mistake. Grep `roleHint === 'belt'` before adding any
mass-consuming pass. Do not fold in the OTHER belt exclusions while unifying: `transit/scheduler.ts:46`
and `eclipses.ts:443` also skip belts, for unrelated reasons (not an independent transit target; not
an eclipsing body), and `twoBodyCoast.ts:149` additionally skips MOONS, which has nothing to do with
distributed mass. Same expression, four different questions.

---

## STUBS — owners, add your domain here

Keep the entry format. One entry per trap, not per file.

### RENDER-*  (appearance / planetAppearance / holo scene)
_Partly written. STILL UNWRITTEN: the floating-origin rule (scene coordinates are relative to camera
focus, so (0,0,0) is not the star); "a proximity test against a sampled curve must be against its
SEGMENTS, never its samples". A1 is now RENDER-B1._

#### Backfilled from closed inbox items — added 2026-08-07 by the engine-map backfill session

### RENDER-B3 There is ONE elevation field per world, and everything else is a threshold of it
BUCKET: DOMAIN + ARCHITECTURE - domain: land, sea, coast, vegetation, shallow water and ice are all
THRESHOLDS OF ONE FIELD, defined on the sphere and thresholded by AREA because coverage is derived.
Architecture: one field, many thresholds, never a second scatter.
WHERE: `rendering/landmass.ts`; consumed by `planetTexture.paintSurfaceField` (both projections) and
`physics/vegetation` via `vegetationBand`.
RULE: land, sea, coast, vegetation, shallow water and ice are all thresholds of the same field. Never
scatter a second set of shapes to represent any of them.
WHY: they used to be three independent scatters of circles. The coastline rolled one, the vegetation
rolled another and put plants in the SEA, and the 2D disc and the 3D globe rolled their own so a
world had two different geographies depending which way you looked at it. Three answers to "where is
the land".
BLAST: the field is defined on the SPHERE, not per projection — that is what makes the disc and the
globe agree, and a 2D-only field would silently undo it. It is thresholded by AREA (cos-latitude
weighted), not by height, because a world's hydrosphere coverage is derived and must come out as
asked. `landFieldFor` is the entry point; calling `buildLandField` from a draw path pays ~80 ms
twice. A morphology's `waterReach` says how far past dry land it holds — the sea AND the ice caps,
one number, because they are the same claim.

### RENDER-B1 GL texture storage is IMMUTABLE — a resized canvas silently never lands
BUCKET: PLATFORM (WebGL2 - texStorage2D allocates once) - carry-forward criterion's example.
Diagnostic half is portable: when a redraw demonstrably happens and the picture does not change,
suspect the UPLOAD before the trigger.
WHERE: `holo/scene.ts:setHud` (the `else` branch that recreates the texture), the label path at
`scene.ts:933-943`, and the same pair in `starmap/starmapScene.ts:setHud`.
RULE: swapping a canvas of a DIFFERENT PIXEL SIZE into a live `CanvasTexture` fails silently — WebGL2
allocates storage once (`texStorage2D`), so the upload lands against the old-size allocation and the
quad keeps stretching the stale bitmap. Dispose and recreate the texture whenever the canvas
dimensions change. Same size, changed pixels → `needsUpdate` is correct and cheap.
WHY: A1, and the diagnosis is the transferable part. The report was "the guide-tip banner does not
reflow, it is a bitmap being stretched", and three sessions went into the RE-MEASURE path — whether
`viewW/viewH` refreshed, whether the ResizeObserver fired, whether a hidden tab suppressed it. One
real mechanism was even found and fixed there (RO notifications deliver BEFORE paint) and it was not
the fault. **Every guard upstream was working and irrelevant: the rebuild always ran and never reached
the screen.** When a redraw demonstrably happens and the picture does not change, suspect the UPLOAD
before you suspect the trigger.
BLAST: anything that draws into a canvas backing a live texture and can change its size — labels
(font, text width), the HUD, any future sprite or badge. Note the DOCUMENT path was never affected
because `setSource` recreates per frame, so "it works in the document view" proves nothing about the
scenes. Textures are not the only immutable-once-allocated resource; the same reasoning applies to any
GPU buffer sized at creation.

### RENDER-B2 The player's "2D starmap" is the 3D renderer locked overhead, and `Starmap2DView` is mounted NOWHERE
BUCKET: IMPLEMENTATION - carry-forward criterion's example. One name, two renderers, decided by who
is looking. Exhibit 4 in faults-the-old-shape-allowed.md.
WHERE: `starmap/Starmap3DView.svelte` with `flat` set, over `starmap/starmapScene.ts` — the
`starmapView === 'holo3d' || 'diagram2d'` branch at `routes/catalogue/+page.svelte:1148`, which says so
in a comment and then sets `angleDeg` to 0 and `flat` to true for the 2D case.
`starmap/Starmap2DView.svelte` carries a header saying it is dead. (A37 quoted this as `:1021`; the
file has moved since, which is the general warning about a line number in a `.svelte` route.)
RULE: there is ONE starmap renderer, ONE lattice generator (`map/latticeGeometry.ts`) and ONE overlay
vocabulary (`map/mapOverlay.ts`, `normaliseOverlay` folding every persisted spelling). Neither
`components/Grid.svelte` (the GM's 2D SVG grid) nor `holo/scene.ts`'s ground-plane lattice is involved
in the player starmap. Establish WHICH surface a report is about before touching a grid.
WHY: A37 asked for every grid style to be added to `Starmap2DView` as "the larger half of the item".
That work could never have appeared on screen — the trap the item itself warned about one level up
("fixing the wrong square branch will look like a fix and change nothing"). The component is left in
place, annotated, because whether it is a discarded prototype or an intended lighter renderer is not a
docs decision.
ALSO, because it is the same shape one level down and the two are easy to swap: the PLAYER's 2D SYSTEM
map is likewise `holo/scene.ts` locked overhead + flat/unlit (`catalogue/+page.svelte:793`,
`effectiveSystemTier` maps both `holo3d` and `diagram2d` to `'holo'`) — NOT `SystemVisualizer.svelte`,
which is the GM's 2D orrery and is still very much mounted (SystemView, the projector, the `/p/` share
route — NOT the catalogue, whose SystemVisualizer mount and the `/projector` route both went with
A42 at v2.1.702). So "the 2D system view" names two different renderers
depending on who is looking; RENDER-S19's "a transiting ship drew PARKED on player views" lived on that
seam. Four surfaces, one grid vocabulary, and `components/Grid.svelte` is a fifth that shares neither.
BLAST: A PER-VERTEX EFFECT NEEDS GEOMETRY SEGMENTED TO ITS OWN SCALE. `addLattice` fades per vertex
and drops a segment whose BOTH ends have faded out; a square grid line spans the whole lattice
(half-extent 12 x 2.4 = 28.8, fade ends at 12 x 1.9 = 22.8), so every line was culled and squares
looked unimplemented while hex — whose edges are one hex wide — looked fine. That is what
`LatticeOpts.maxSegment` exists for, and `latticeGeometry.spec.ts` asserts an unsegmented square
lattice keeps ZERO edges through the real fade radius. Any new per-vertex fade, falloff or clip
inherits this. Squares take the THINNED cell and hexes the true one, deliberately: thinning a hex
lattice moves the centres a system is snapped to.

#### Ship models (G3) — added 2026-08-04 by the ship-appearance stream

### RENDER-S1 One builder dresses a ship model, everywhere it is drawn
BUCKET: ARCHITECTURE - one builder dresses a thing everywhere it is drawn; what a user APPROVED in a
dialog must be what every surface shows.
WHERE: `src/lib/constructs/modelViewer.ts:buildDisplayModel`
RULE: the import modal's preview, the info-block turntable and the holo scene's focused hull ALL
build through this one function (finish, tint, livery, normalise-to-unit-length, optional orient
bake). Never dress a model at a call site.
WHY: what the GM approves in the dialog must be what every surface shows. Three copies would drift
the first time a finish was added — the same fault A46 fixed for the body portrait.
BLAST: adding a finish, changing normalisation, or adding a fourth surface that draws a hull.

### RENDER-S2 A construct contributes NO radius, model or not
BUCKET: ARCHITECTURE - a marker with real geometry is not a body. Its visual extent must never reach
the physical model.
WHERE: `src/lib/holo/scene.ts` (`frameDistance`, the clearance branch in `updatePositions`)
RULE: a ship model is a MARKER with real geometry, not a body. It must never feed ring clearance or
the whole-system bounding sphere (F5). `frameDistance` may read its hull length to frame it; nothing
else may.
WHY: real extent in the clearance maths makes camera framing depend on zoom — F4's bug class — and
would push moons off their orbits around a station.
BLAST: any new use of `shipLen`. Any "make constructs act like bodies" change.

### RENDER-S3 Nozzles live in the model's own space, orientation applies at view time
BUCKET: ARCHITECTURE - store an authored placement in the frame that CANNOT be edited, and apply the
editable transform at read time. Orientation is editable for ever; the placement was made once.
WHERE: `ModelRef.nozzles` (`types.ts`), `modelViewer.setNozzles` / `setOrient`
RULE: authored drive positions are stored BEFORE `orient` is applied, and the plume rig hangs off
the same group the orientation fix rotates. Storing them post-orientation strands every drive the
moment the GM re-aligns the hull.
WHY: orientation is editable forever; the placement was made once.
BLAST: baking orient into the stored binary; moving the plume group out of `orientGroup`.

### RENDER-S4 Camera near-plane must follow the framed object all the way down
BUCKET: PLATFORM (3D pipeline: near plane and depth range) - the floor must suit the SMALLEST
framable thing, and below roughly 1e-4 the depth range collapses (see RENDER-S20).
WHERE: `src/lib/holo/scene.ts` (near-plane block in the render loop)
RULE: `near` tracks the camera-target distance with a floor low enough for the SMALLEST framable
thing. A ship at true scale frames at ~1e-9 scene units; the floor is 1e-11.
WHY: the floor was 1e-8 — written when the smallest framable thing was a body (~1e-7) — so focusing
a construct at true scale put the whole scene inside the near plane and the view went black.
BLAST: anything that can be framed smaller than a body (debris, a docked shuttle).

### RENDER-S5 An interface-declared method is not an implemented one
BUCKET: PLATFORM (TypeScript - unenforced) - SUSPECT, mechanism corrected below: the return IS
annotated and every member IS required, so the hole is not structural typing. The observed fault
stands.
WHERE: `modelViewer.ts` return object; guarded by `modelViewer.spec.ts` ("createModelViewer surface")
RULE: a method dropped from the viewer's returned object literal reaches the call site and fails
there, at runtime, with nothing upstream complaining.
SUSPECT 2026-08-28 (the carry-forward sort) — THE MECHANISM AS ORIGINALLY WRITTEN IS WRONG. It said
the loss "still type-checks against the interface". Checked at v3.0.149: `createModelViewer` IS
annotated `: ModelViewer` (`modelViewer.ts:379`) and every member of that interface is REQUIRED (no
`?`), so a dropped method is a genuine type error. What is true is that NOTHING RUNS THE TYPECHECKER —
`npm run build` is Vite and strips types, and `npm run check` is the only thing that would see it,
against the ~1357-error baseline RENDER-S7 records. So the hole is the TOOLCHAIN, not the type system,
and it closes the day that baseline is cleared. The observed fault and the surface test are unaffected.
WHY: a refactor replaced the span between two methods and silently deleted `setOrient` — Pitch/Yaw/
Roll died with "setOrient is not a function" and nothing else complained. The surface test now
asserts every declared method exists (mutation-checked: remove it again and the test fails).
BLAST: any range-based edit of that return object. Add new methods to the required list.

### RENDER-S25 EVERY FACTOR IN A FINAL PIXEL GETS EXACTLY ONE CHANNEL — MATERIAL OR VERTEX, NEVER BOTH
BUCKET: ARCHITECTURE + PLATFORM (three.js multiplies material by vertex attribute) - durable:
EXACTLY ONE WRITER PER CHANNEL (PHY-11's two-writers fault, one layer down), and COMPUTE WHAT A
CONTROL ACTUALLY DOES AT THE REPORTED SETTING before fixing anything in its code path.
WHERE: `map/gridGeometry.ts` (`buildLattice`, pinned in `gridGeometry.spec.ts`), bound by
`starmap/starmapScene.ts:addLattice` and `holo/scene.ts:addGridEdges`. Reported by the owner as "turn
falloff up at all and all the lines go super dim".
RULE: three.js multiplies the material by the vertex attribute — `diffuseColor *= vColor` in
`color_fragment`, colour AND alpha. So a grid material that uses vertex colours carries WHITE and the
attribute carries the colour; a per-frame updater may own `opacity` and then nothing else may write
it. Two writers to one channel is not a style difference, it is a multiplication nobody asked for.
WHY: TWO faults, one shape, and the SECOND is the one the owner saw — worth stating because the first
one was found, fixed, shipped and did not touch the symptom.
  (1) OPACITY. The builder wrote `cols[..] = a * mat.opacity` then set `mat.opacity = 1`, a consistent
  pair for exactly ONE frame: `updateGridLevels` reassigns that opacity every frame to crossfade the
  two lattice levels, so the level landed twice and the grid rendered at its square (0.42 to 0.18).
  Real, but it lives only on the metric lattice — the owner's grid was POLAR, where there is no
  crossfade and `updateGridLevels` returns immediately.
  (2) COLOUR. The material carried `base * 0.4` and the vertex attribute carried the SAME value, so
  the colour squared to 0.16 and the whole grid dropped to a sixth of its intensity. That is the
  reported fault. The starmap never had it because its grid materials specify no `color` at all.
BLAST: WHAT MADE THIS EXPENSIVE WAS BELIEVING THE DIAL. The symptom arrived attached to "Grid
falloff", the fade is the falloff's whole job, and there was a genuine bug in the falloff branch — so
the first pass fixed that and reported it. The arithmetic that would have killed the story in one
line was never run: `gridFadeWindow(0.1, 12)` starts at 17.58 on a grid of radius 12, so AT THE
SETTING IN THE SCREENSHOT NOTHING FADES AT ALL. A dial can be the trigger without being the cause —
it gates the branch, and the fault is anything else that branch also switches on. COMPUTE WHAT THE
CONTROL ACTUALLY DOES AT THE REPORTED SETTING BEFORE FIXING ANYTHING IN ITS CODE PATH; it is the same
lesson RENDER-S24 records one level down, where the obvious suspect also cost the first pass.
Corollary, and the reason the fix was a rewrite rather than a patch: the two grids already shared
their CONSTANTS (S24) and still looked different, because they emitted the geometry separately and
one of them emitted it wrongly. Sharing the numbers under two emitters buys nothing.

### RENDER-S27 A STARMAP GLYPH IS A SCREEN QUANTITY — its size AND its members' spread — never a world constant
BUCKET: ARCHITECTURE + PLATFORM (perspective projection) - durable: a MARK on a map is a SCREEN
quantity, converted to world units per frame. Platform: the conversion uses camera-space DEPTH,
because distance exceeds depth by 1/cos(off-axis angle).
WHERE: `starmap/starGlyphLaw.ts` (`clusterLayout`, `clusterHalfExtent`, `bandScale`, pinned in
`starGlyphLaw.spec.ts`), bound by `starmap/starmapScene.ts:updateStars` (per frame: group scale =
GLYPH_PX * worldPerPx(camera-space DEPTH), offsets along the camera's right/up) and by
`components/Starmap.svelte` (r and offsets times `labelK` = 1/zoom). Reported as C17; the same fault as
C15 on the holo's vertex dots and F2/F3 before it.
RULE: anything that is a MARK on a map — a star glyph, a multiple's cluster, a badge's clearance —
is sized and spread in PIXELS and converted to world units per frame at the thing's own depth. Never
`R = 0.22` scene units, never `r={5}` inside the `scale(zoom)` group. The conversion uses the point's
camera-space z (`applyMatrix4(camera.matrixWorldInverse).z`), NOT its Euclidean distance: distance
exceeds depth by 1/cos(off-axis angle), 15% in the corners at fov 45 and far more on a star the camera
is not looking at — measured as a triple 2.4x its proper spread before the depth was the depth.
WHY: the 3D starmap drew every star as a sprite 0.22 scene units across with members at `dx * 0.22`,
so zooming in made each star light-years wide and spread Alpha Centauri's three stars as far apart as
Sol is from them (owner screenshot, 2026-08-19) — and the whole-map view could never get dense,
because the glyph was tuned for one framing. The GM 2D map had the identical fault in SVG. Two world
constants, two surfaces, one law now: the 3D and 2D cluster spreads are 21.6 x 19.8 px and 12 x 11
viewBox-px at EVERY zoom (verified at three camera depths and six SVG zooms).
BLAST: the label clearance is a pixel figure too now (`placed.glyphPx`), so the per-frame
world-radius-over-distance conversion in `updateLabels` is gone — do not put it back. The black
hole's schematic glyph is the one member whose size the GM scaler never moves (`fixed` in
`clusterLayout`): its horizon, ring and blaze need their pixels to read as a hole at all.

### RENDER-S28 A STAR'S DECORATIONS ARE TAGS, AND THE LOOK IS BUILT ONCE
BUCKET: ARCHITECTURE - the house rule (physics -> tags -> visuals) in one entry: a renderer draws a
jet because the body CARRIES the tag, and may not test a class, a field or a threshold of its own.
The lever is the derivation.
WHERE: `holo/bodyFeatures.ts:buildStarLook` / `updateStarLook` (corona + flares + jet + shed shell),
called by `holo/scene.ts` (radius = the photosphere's scene radius) and `starmap/starmapScene.ts`
(unit radius, rescaled per frame — RENDER-S27). The tags: `physics/stellarOutflows.ts`
(`stellar/jets`, `stellar/shedding`) and `physics/stellarActivity.ts` (`stellar/activity`), emitted
in `SystemProcessor`'s star pass, read through `starmap/systemStars.ts:visualStarOf` by BOTH maps.
RULE: a renderer draws a jet, a flare or a shell because the body CARRIES the tag, and for no other
reason. It may not test a class, a field or a threshold of its own; the lever is the derivation (the
feed, the field, L R / M) and the Tags panel lists what is drawn. One builder for the look, sized by
an argument — the holo does not pass `jets`/`shedding` (its own star look was out of G26's scope), the
starmap does; neither holds a second copy of the corona.
WHY: the architecture rule (physics -> tags -> visuals) has no enforcement beyond discipline, and
"which star gets a jet" is exactly the kind of decision that ends up in a renderer's `if (isNS)` and
then differs between two maps. Deriving it from compactness + field + feed needs no class branch at
all — a quiescent hole and a magnetic white dwarf fall below the gate on their own numbers.
BLAST: `star/` is NOT a usable tag prefix — `isLegacyTag` strips it as a V1 class-stored-as-a-tag,
which is why these live under `stellar/` (the brief sketched `star/jets`; that name would have been
silently deleted on load). `stellar/` is in `importFixup.DERIVED_TAG_PREFIXES` (B82's rule) so a save
does not fossilise them. The gallery (`holo/galleryScene.ts`) still holds its OWN corona at
`R * (3.2 + 3a)` with its own breath — a deliberate tuning, recorded as a duplication finding in the
G26 row, not unified here.

### RENDER-S29 A LOCK OWNS THE ORIENTATION, AND THE TILT ONLY CHOOSES THE LOCKED POINT
BUCKET: DOMAIN - tidal locking means ONE FIXED SURFACE POINT faces the host; at tilt e that point
sits at latitude -e, and at e~90 it IS the pole. The same tides that despin also erode obliquity, so
a despun body cannot keep a formation tilt.
WHERE: `holo/scene.ts:faceParent` (spin(world-up) COMPOSED ONTO tilt — spin*tilt, never
tilt*spin); `physics/axialTilt.ts:inferAxialTilt` (`despun` collapses the draw to a <=5 deg
Cassini residual); `rendering/planetTexture.ts:paintLockedPointRamp` (the eye and the molten
glow paint at the locked point, latitude = MINUS the tilt, by ANGULAR distance).
RULE: "tidally locked" means ONE FIXED SURFACE POINT faces the host forever; at tilt e that
point sits at latitude -e off the sheet-centre meridian, and at e~90 it IS the pole (a pole can
be locked — the bulge is fixed, a true equilibrium). Orientation = yaw about the ORBIT NORMAL
tracking the host azimuth, composed onto the tilt: smooth and flip-free at every tilt. And a
body the engine DESPUN cannot keep a formation tilt: the same tides erode obliquity (Io 0.002,
Mercury 0.03 deg), so the derived draw is a small Rayleigh, never the two-population roll, and
never `spin/tipped`. Authored tilts stand (the mantra) and render as an honest pole-lock.
WHY: three coherent readings existed and two shipped wrong: aiming the meridian by projecting
the host into the equatorial plane DEGENERATES near 90 (the projection is a constant that flips
sign — the owner watched an eyeball sit motionless and snap 180 every half orbit), and spinning
about the TILTED pole rolls the painted ice through the sunrise (no static texture survives a
migrating substellar point).
BLAST: every tidally locked body's orientation, the derived tilt (and its seasonal temperature
terms) of every despun tilt-less body on every route (generation, import fixup), the eyeball and
molten emissive textures. Sol fixture unmoved — every Solar body carries a measured tilt.

### RENDER-S26 A RING DRAWN AS A `LineLoop` CAN CARRY NOTHING PER-EDGE
BUCKET: PLATFORM (GPU primitive topology) - a LineLoop is a vertex ring with NO PAIR STRUCTURE, so
anything per-edge has nowhere to attach and silently does not happen.
WHERE: `map/gridGeometry.ts:ringEdges`, bound by both scenes' polar grids.
RULE: build a ring as EDGES unless you are certain nothing will ever hang off its segments. A
`LineLoop` is a vertex ring with no pair structure, so any per-edge decoration — a curtain, a ribbon,
a per-segment cull — has nowhere to attach and silently does not happen.
WHY: "Grid depth" on the system map reached the 24 radial spokes and none of the 6 rings, because the
spokes were `LineSegments` and the rings were loops. The GM saw a glow where the spokes converge and
nothing anywhere else, and reported the dial as doing nothing. The starmap had always built its rings
as edges, which is the whole of why the same dial worked there.
BLAST: the spokes deliberately get NO curtain on either view now — 24 curtains meeting at the origin
is a solid cone, not a depth cue, and that cone was the "glow at the centre". Any future grid
primitive gets the same question asked of it before it is drawn as a loop.

### RENDER-S24 A shared LOOK needs a shared CONSTANT, or the copies diverge into a bug
BUCKET: ARCHITECTURE - two surfaces offering the SAME control bind one module. Bind them
PRE-EMPTIVELY, while there is nothing to reconcile and no bug to report - that is the cheapest
moment there will ever be.
WHERE: `src/lib/map/gridFade.ts` (`gridFadeWindow` / `gridFadeAlpha`, pinned in `gridFade.spec.ts`),
bound by `holo/scene.ts:addGridLines` and `starmap/starmapScene.ts:fadeWindow`. Reported as C14.
The DEPTH curtain joined it later (`skirtDepth` / `SKIRT_DEPTH_RATIO` / `SKIRT_TOP_ALPHA`, pinned in
`gridSkirt.spec.ts`, bound by `scene.ts:addGridSkirt` and `starmapScene.ts:addLattice`) — PRE-
EMPTIVELY, while the starmap still had the only copy and the system map had no dial at all. That is
the cheapest moment to bind two surfaces: there is nothing to reconcile yet and no bug to report.
RULE: when two surfaces offer the SAME control, the numbers behind it live in one module and both
bind it. A dial that reads identically in two preset editors and computes differently in two
renderers is not a difference, it is a defect waiting to be reported.
WHY: the grid's edge fade existed twice. On the starmap it faded; on the system map the same dial
DELETED the grid. Measured on a real system (rMax 30 AU, the shipped 0.65 compression, the six
`niceSeries` rings): at three-quarter dial the holo's outer rings sat at alpha 0.07/0.20/0.33 with
the rim at 0.07, and at full dial FOUR OF SIX RINGS AND THE RIM WERE EXACTLY ZERO, while the
starmap's window held the rim at 0.52 over the same range. Not a typo - a window calibrated for the
wrong extent. `compressRadius` maps the outermost body to EXACTLY `gridRadius`, so a system map's
content reaches the rim, and the holo's window had finished fading by 0.7 R, i.e. INSIDE the
content. The starmap's constants already started beyond the field, which is why only one view broke.
BLAST: THE OBVIOUS SUSPECT WAS WRONG AND COST THE FIRST PASS. The floating origin makes "is this
coordinate star-relative?" the natural first question, and the answer here was yes - the rings are
built by `ringPoints(compressScalar(au))` about the origin and `abs[]` is never rebased, exactly as
its comment claims; the materials are `transparent: true` and per-vertex alpha does apply. Both were
verified before the maths was touched. When a fade "deletes", COMPUTE THE ALPHA AT THE RADII THE
CONTENT ACTUALLY OCCUPIES before reaching for a coordinate-space explanation - it is six lines of
arithmetic and it names the fault outright. Also: a per-vertex fade on a full-width line judges the
whole line by its endpoints, which is why the plate grid segments itself when the dial is on
(inbox A37) - any new grid geometry needs the same treatment or it will fade in steps.

### RENDER-S23 A working MOUSE path is no evidence at all about TOUCH
BUCKET: ARCHITECTURE + PLATFORM (browser pointer/touch) - durable: name the SET of inputs a rule
admits, in one exported place, and never spell it as a test against ONE MEMBER. Platform: a pinch
fires no wheel event.
WHERE: `viewport/cameraRig.ts:ownsDistance` (exported, pinned in `cameraRig.spec.ts`), bound by the
pointer/wheel listeners in `holo/scene.ts`. Reported as C10.
RULE: name the SET of inputs a rule admits, in one exported place, and pin it. Never spell an input
rule as a test against ONE member (`kind !== 'wheel'`) — the member is the mouse, and the set is
what has to include touch. A pinch fires NO wheel event: it arrives as two pointers, and three's
OrbitControls consumes it as a dolly (`touches.TWO` defaults to `DOLLY_PAN`), so the camera really
does move and only the rig's own bookkeeping is missing.
WHY: RENDER-S15's rule (each camera quantity comes from the input that OWNS it) was RIGHT, and its
expression silently excluded every phone and tablet for as long as the rule has existed. On a
pinch, OrbitControls dollied, `pointermove` noted the gesture as `'drag'` — the ROTATE kind — and
the next frame's reconciliation restored the previous zoom. So pinch did nothing while rotate
worked, on mobile only, and a page REFRESH appeared to fix it: nothing was broken, the camera was
being politely corrected. A user reported it as "I can't zoom in or zoom out anymore".
BLAST: **DESKTOP DEVELOPMENT NEVER EXERCISES TOUCH, AND AGENT SESSIONS CANNOT EXERCISE IT AT ALL** —
the Browser pane emulates touch points but a genuine two-finger pinch is not reliably reproducible,
and the pane often will not composite for a worker session. This is RENDER-S19's lesson in a second
family: a path nothing has ever EXERCISED has never been tested, and the test suite passing says
nothing about it. Any new input path needs a real device in the loop, planned in rather than hoped
for. Check the OTHER surfaces when touching one: the 2D orrery and both starmaps share
`input/gestures.ts` (which handles pinch properly and wires `onZoom`), the 3D starmap has no
base/offset rig at all so nothing second-guesses its dolly, and `holo/scene.ts` was the sole
casualty precisely BECAUSE it is the only surface that reconciles the camera against intent.
ALSO: nothing listened for `webglcontextlost` until this entry's commit. It was investigated here
as a cause and refuted, but the blindness was real — a dropped context freezes the last frame,
throws nothing, and reaches no instrument. It is now counted into `[sse-perf]` (`holo.glContextLost`
/ `holo.glContextRestored`) and the `gl` provider. RECOVERY IS NOT BUILT: rebuild on restore when a
counter proves it happens, not before.

### RENDER-S22 The scene-rebuild path is INSTRUMENTED — switch the meters on before theorising about it
BUCKET: ARCHITECTURE (instrumentation) + IMPLEMENTATION - durable, and both halves are portable: an
ALWAYS-RECORDING event ring beats an instrument you must switch on first (an intermittent fault a
refresh clears outruns it every time), and NEVER LET A METER ADD THE COST CLASS IT IS FOR. The
counter names are this code's.
WHERE: `perfTrace.ts` (`?perf=1`, `localStorage['sse-perf']='1'`, or `window.__ssePerf.enable()`);
counters registered by `holo/scene.ts` and `broadcast.ts`. Full index: `docs/dev/debug-tools.md`.
RULE: `setSystem` rebuilds the WHOLE 3D scene, and a ship in transit rewrites the snapshot ~2x/second,
so rebuild pressure is the first thing to suspect for any holo-view slowness — and it is already
measured, so **never reason about it from a screenshot or a frame rate alone.** The meters that answer
this area, and the question each one actually answers:
- `holo.setSystem.same` — rebuilds of the system ALREADY on screen. **This is the wasted work**, and
  therefore the go/no-go number for a patch-instead-of-rebuild path. `.new` is legitimate.
- `holo.setSystem.ms` — total rebuild wall time; average is `.ms / (.same + .new)`.
- `renderer.info.memory` via the `perfProvider` registry — geometries / textures / programs beside the
  JS heap. **This is the leak detector for the rebuild path**: counts that climb with `.same` mean a
  rebuild is not releasing what it replaced.
- `bc.<TYPE>.strMs` / `.bytes` / `.sent` / `.unchanged` / `.throttled` — the payload cost. Note
  `sendIfChanged` stringifies the whole payload on EVERY reactive tick to fingerprint it, sent or
  not — **and that stringify is not even the expensive half.** The CALLER has already built the
  payload by then; for `SYNC_STARMAP` that is a deep clone plus a redaction pass over the whole
  campaign, so a gate that only declines to SEND cannot save you (P3: a playing clock reached 517
  sends, 989 MB, 33 s of stringify and a 3.8 GB heap before the tab died). **Three guards now, at
  three layers, and you need to know which one you are looking at.** (1) `.throttled` counts sends
  held back by the SIZE-AWARE floor — a type whose last payload exceeded 256 KB gets a 5 s minimum
  interval instead of 500 ms, trailing-send so the latest state still lands. A rising `.throttled`
  is the guard WORKING, not a fault. (2) The GM route strips `temporal` and the per-system `time`
  block out of the player snapshot: the clock travels as `SYNC_TIME`, and a player propagates its
  own view between snapshots. (3) `bc.SYNC_STARMAP.skippedWhilePlaying` counts ticks where the
  snapshot was not BUILT at all because playback was running — that is the one that saves the
  33 s, and if it is zero while a clock plays, the reactive gate has been bypassed.
  **SENDER-SIDE ONLY.** The receive-side half is `rx.<TYPE>` (below); you need both, and confusing
  one for the other is how "the GM sends more" and "this window rebuilds more per message" — two
  different bugs with one symptom — stay indistinguishable.
- `rx.<TYPE>` — inbound messages counted on a RECEIVER (`broadcast.handleMessage`). `rx.<TYPE>.bytes`
  is opt-in via `__ssePerf.rxBytes = true`, deliberately NOT implied by `?perf=1`: sizing a payload
  means stringifying it on the receive path, which is the cost class this area is chasing.
- `holo.setSystem.by.<reason>` and the EVENT RING — see the BLAST line; this is the WHY.
- `holo.ringRefineFrame` — should be quiet unless a ring is being refined.
WHY: a live player view measured 10.4 then 2.0 fps with `holo.setSystem: 4` and `sync.starmap: 3`
inside one 5-second window (inbox P1). The owner ruled that NOT A PROBLEM YET, with the standing
position "leave behaviour alone, keep the meters good, revisit only if it is actually SEEN or in a
dedicated tuning pass". **THAT CLAUSE HAS SINCE FIRED (inbox P2, 2026-08-17): `holo.setSystem.same`
= 146 of 148 in 20 s on a live player view, 23% of wall clock rebuilding an unchanged scene, GL
counts FLAT (so not a leak — the fix is to stop the retriggering, not to fix teardown), and a hard
refresh clears it.** The standing position otherwise holds: **still do not build a same-system PATCH
path speculatively** — capture first, and let the ring name the trigger.
BLAST: **THE METERING GAP THIS ENTRY USED TO NAME IS NOW CLOSED — `setSystem` records WHY.** Every
call takes a `reason` and lands a row in the `[sse-perf]` event ring (`perfEvent` in `perfTrace.ts`).
**Dump it with `window.__ssePerf.events(60, 'holo.setSystem')`** — the ring is ALWAYS recording, which
is the point: this fault is intermittent and a refresh clears it, so an instrument you must switch on
first arrives too late every time. Three fields separate the candidate causes and none costs anything:
- `sameRef` — the incoming object is the SAME REFERENCE already held. Nothing upstream re-cloned, so
  the trigger is a RE-FIRE (a remount, or a Svelte statement invalidated by something other than
  `system`). **An upstream content gate cannot help this case** — do not reach for one before reading
  this field.
- `sameId` without `sameRef` — same system, new object: something upstream re-cloned. A gate IS the
  candidate fix here.
- `reason` — `prop` / `mount` (`HoloView.svelte`, the player path) versus `style:<dial>` (a dial
  rebuilding its own content through `rebuildContent`). **These are different bugs and the counters
  could not tell them apart**; all seven style setters are guarded by an equality check, so a
  `style:*` row in a storm means a dial is being handed an alternating value.
`window.__rebuildDebug = true` adds `hash` / `sameHash` — the only thing that can prove a re-cloned
snapshot was byte-identical — and it is OPT-IN because hashing a several-hundred-KB system at 12 Hz
is exactly the cost class being hunted. `hashMs` is printed beside it so the instrument's own cost is
visible rather than smuggled into the measurement. **Never let a meter add the cost class it is for.**

### RENDER-S21 "The orbit line vibrates" was TWO mechanisms in one line, in two ring FAMILIES
BUCKET: PLATFORM (float32 GPU composition; 60 Hz sampling) + IMPLEMENTATION - durable diagnostic:
jitter still present when TIME IS STOPPED is precision; jitter that vanishes when time stops and
scales with rate is aliasing. Ask that before reading any refinement code.
WHERE: `holo/scene.ts` - `emitOrbitRing` (A23, heliocentric) and `updateOrbitRings`' near path
(f64 composition + the dense arc, local rings); `buildLocalOrbitRing` returns the `sample(u)`
closure the latter re-samples through.
RULE: THERE ARE TWO RING FAMILIES AND THEY SHARE ALMOST NO CODE. Heliocentric rings keep a float64
ABSOLUTE master and enter A23's focus-adaptive refinement. Local rings (a moon's, a barycentre
member's) are built in the PARENT's frame from a radial spread rule and are positioned at the
parent each frame. Ask which family a report is about BEFORE reading any refinement code: three of
four fixes for this one report were aimed at A23, which the reported ring never enters.
WHY: one symptom, four rounds, two real causes.
  (1) FLOAT32 COMPOSITION (fixed v2.1.484). A local ring's vertices carry the ring's own radius,
  and the GPU composes them with the parent's translation at single precision - measured live via
  `window.__ringDebug`: `f32JitterPx` 4.75 at a true-scale ISS close-up. Random per-frame stepping.
  Fix: near rings re-emit vertex+parent in FLOAT64, rounded once, object translation zeroed - the
  floating-origin discipline this family had been left out of. The near test IS that prediction
  (switch when the step would exceed a quarter pixel), so far rings keep the cheap path.
  (2) CHORD-SAG ALIASING (fixed v2.1.486). The followed body rides the TRUE curve while the line is
  a fixed 1024-gon, so ship-to-chord distance breathes zero-max-zero once per vertex crossing
  (~5.4 s of game time for the ISS: 92 min / 1024). A smooth sweep at 1 s = 1 s; at 1 s = 1 h the
  ~670 Hz crossing sampled at 60 fps aliases into a buzz. Fix: A23's dense arc, transplanted -
  local rings HAVE a propagator, they simply never got the machinery. Same warp, same sag budget,
  same fractional centre, re-emitted per frame so the arc SLIDES with the focus.
BLAST: the two look identical by eye and are told apart by the CLOCK - random jitter is present
when time is stopped, chord-sag aliasing vanishes when time is stopped and scales with rate. Ask
that first. Do not raise `ORBIT_SAMPLES` globally (A23's own argument: the count needed grows
without bound as you zoom, and costs the whole buffer at every zoom). Do not confuse either with
"re-emit less often" - a rarer re-emit is a BIGGER step; smoothness comes from continuity
(fractional centre, per-frame slide), not from cadence. `u = i/N` must reproduce the uniform master
exactly, or a ring changes shape as it crosses the near threshold.

### RENDER-S20 A far-field sprite must be DEPTH-TESTED; `renderOrder` cannot put it behind a body
BUCKET: PLATFORM (three.js render passes) - renderOrder sorts only WITHIN a pass, so a transparent
depthTest:false backdrop paints over every body no matter how negative its order.
WHERE: `src/lib/holo/scene.ts:rebuildSkyStars` (the sky dot / spike / label materials), and
`makeGridLabel`'s `depthTest` argument.
RULE: three draws the whole TRANSPARENT pass AFTER the opaque one, and `renderOrder` only sorts
WITHIN a pass. So a transparent backdrop sprite carrying `depthTest: false` paints over every body in
the scene no matter how negative its `renderOrder`. Far-field sprites use `depthTest: true` with
`depthWrite: false` - the same pair the generic starfield has always used - which cuts them at a
body's limb per pixel and lets them not occlude each other.
WHY: G9's charted stars were built `depthTest: false, renderOrder: -1` on the belief that made them a
backdrop, and Sol's diffraction flare rendered on top of Earth. Measured both ways: a bright star
placed directly behind the framed body changes 209 px with the test off and 0 with it on; through a
composer chain, 168 and 0. Labels take the same treatment for a different reason - a name still
floating over a planet whose star is hidden behind it is labelling empty sky - which is why
`makeGridLabel` takes the flag rather than assuming: an AU scale ring on the ground plane SHOULD stay
readable through a body, and defaults to `false` for exactly that.
BLAST: anything else added to `skyGroup`; any new "always on top" overlay reaching for
`depthTest: false`; and **the near-plane floor in RENDER-S4** - `near` is `min(0.01, dist*0.02)` with
a 1e-11 floor, and below roughly 1e-4 the depth range collapses so hard that everything past a few
units quantises onto the far plane and far-field sprites stop drawing at all. The generic starfield
shares that limit, so the two fail together rather than differently, but a change to that floor
should be checked against the sky.
FILTER: the occlusion happens in the RenderPass, so it is filter-independent - `EffectComposer`'s
render target carries a depth buffer (`renderTarget1.depthBuffer === true`), and the scene renders
identically down `composer.render()` and the bare `renderer.render()` branch.

### RENDER-S19 A code path that has never RENDERED has never been tested by anyone's eyes
BUCKET: ARCHITECTURE + PLATFORM (three.js) - durable: ask what has ever EXERCISED a path on screen,
and derive a heading from something that EXISTS WHEN NOTHING MOVES (a paused clock is not the rare
case). Platform: the lookAt argument swap, per-segment vertex-colour interpolation.
WHERE: the moving-construct path in `holo/scene.ts:updateConstructs` (facing, plume, route line);
first actually rendered v2.1.477, first faults v2.1.479.
RULE: before trusting visual code, ask what has ever EXERCISED it on screen. The GM system view is
the 2D orrery and player views drew transiting ships parked, so a moving construct had never been
rendered in 3D - and the moment one was, three faults surfaced at once (facing 180 out, colour
smear, zoom crawl), none catchable by the unit tests because all were about what the eye sees.
Concrete traps found on that first render, kept here because each will read as reasonable again:
- three's `Object3D.lookAt` SWAPS its arguments for a non-camera, so a MESH's PLUS-Z points at the
  target (`_m1.lookAt(_target, _position, up)` in Object3D.js) - `lookAt(pos + delta)` puts +Z on
  the motion, which is the ModelRef nose. A v2.1.479 "fix" inverted this to `pos - delta` on the
  CAMERA convention and was wrong; verify against three's source, not against intuition.
- ORIENTATION FROM MOTION FAILS WHEN NOTHING MOVES, which is not the rare case: a player view
  between snapshot stamps, or with the GM's clock paused, has zero frame-to-frame delta, so a
  motion-derived heading never fires and the hull holds its BUILD-DEFAULT pose. That, not the
  lookAt convention and not the nose axis, was what three successive "facing is wrong" reports
  actually were. Derive a heading from something that exists when still - here the route's tangent
  at the ship's own clock (`routeStateAt`, same curve the line draws); keep motion as the fallback
  for craft with no course.
- WHICH END OF A HULL IS THE NOSE is an authoring choice no importer can detect. `noseSign` reads
  it from the GM's placed nozzles (they mark the stern; mean z-sign, so a mid-hull RCS cannot flip
  a ship whose mains are aft). No nozzles = trust nose = +Z.
- vertex colours interpolate PER SEGMENT: a sparse polyline smears a colour change across half a
  span. A hard edge needs the boundary vertex written twice, once in each colour, and the phase
  sampled at the segment MIDPOINT (windows are inclusive at both ends).
- a fixed ratio-per-notch zoom is ~400 notches across this scene's ten decades, and the empty
  stretch reads as a DEAD WHEEL, not as slowness. `wheelZoomSpeed` (cameraRig) scales the notch
  with log-depth below scene scale; keep any new zoom gesture on the same curve.
BLAST: no bundled example carries a construct with a journey, so this path still cannot appear in
any test or local preview without hand-building a transit. Changes here need the owner's eyes on a
live player view - plan the round-trip in, not as an afterthought.

### RENDER-S18 A time WINDOW is only meaningful against the clock that issued it
BUCKET: ARCHITECTURE - a published time-judged quantity carries its EPOCH and a reader must run in
the same one. Its failure signature is the durable half: POSITIONS SURVIVE A WRONG CLOCK, so the
view looks entirely healthy and only time-judged things fail - silently and totally, never
approximately.
WHERE: `routes/catalogue/+page.svelte` (seeds from the system's `epochT0`, as `SystemView` does);
readable in `__shipDebug` as `clock` / `burnWindow` / `clockInBurn`.
RULE: any surface that judges published game-clock data - a burn window, a route's start and end,
a scheduled arrival - must run a clock in the SAME epoch the publisher used. Seed it from the
system's own `epochT0`, never from `Date.now()`.
WHY: the GM opens a system at `newSystem?.epochT0 || Date.now()`; the catalogue opened at
`Date.now()` and stayed there unless the active preset happened to follow the GM's clock. On any
system whose epoch is not about now, every window the GM published missed - the drive plume never
lit on a player view, and the P3c route line would have been invisible for the same reason.
BLAST: THIS IS WHY IT READ AS A REDACTION FAULT FOR WEEKS. The data crossed, `shipBurnPlayer.spec`
proved end to end that it crossed, and the torch stayed dark - so every suspect was on the
redaction path and none of them was the fault. POSITIONS SURVIVE A WRONG CLOCK (a construct in
transit is placed by a stamped vector, RENDER-S17's neighbour) so the view looks entirely healthy;
only time-judged things fail, and they fail SILENTLY and TOTALLY rather than approximately. Any
new published-with-timestamps field inherits this. Check the epoch before you check the pipe.

### RENDER-S17 Build a fixture the way the PRODUCER builds it, not the way the type allows
BUCKET: ARCHITECTURE - a TYPE is not a claim about what a producer WRITES. Fixture the worse case; a
hand-written fixture that hands every field a real value tests a producer that does not exist.
WHERE: `constructs/shipRoute.ts` (geometry from `pathPoints`), pinned in `shipRoute.spec.ts`.
RULE: `TransitSegment` declares `startState` and `endState`, so a route built from them type-checks
and reads correctly. But `calculateFastPlan` writes literal `{ r: {x:0,y:0}, v: {x:0,y:0} }` for
accel-end, coast-start, coast-end and brake-start, filling only the first start and the final end.
Geometry comes from `pathPoints`, which is the only description always populated - and which is
also what the SHIP is placed from (`samplePlanPathAtTime`), so the line and the vessel agree by
construction rather than by coincidence.
WHY: the published route ran origin -> STAR -> STAR -> STAR -> destination, straight through the
middle of the system, and the suite was green throughout: its fixture handed every segment real
states, which the real planner never writes. That is RENDER-S8's trap in DATA form - the instrument
agreeing with the intent rather than with the input.
BLAST: a hand-written fixture is a claim about the producer, and a type is not that claim. Two
planners fill the same interface differently here (`calculateLambertPlan` writes real positions),
so "it works on my test system" can mean "it works in Economy mode". When a field is optional in
practice but required by type, fixture the WORSE case. Also: chords between such points are not the
course - the flown path is an arc, so the knots are read as a centripetal Catmull-Rom, and A23's
refinement cannot help because A23 re-samples a propagator and a player has none.

### RENDER-S16 A direction that feeds back must be UNIT, and prove it
BUCKET: ARCHITECTURE + DOMAIN (geometry) - durable: any quantity that is both PRODUCED and
RE-MEASURED needs its invariant asserted, not assumed. A harmless expression becomes dangerous the
moment its result enters a loop.
WHERE: `viewport/shotSolver.ts:headingDirection` (normalised); pinned in `shotSolver.spec.ts`.
RULE: `UP*cos(t) + outward*sin(t)` is a unit vector ONLY when the two are orthogonal. In general its
length is `sqrt(1 + outward.y * sin(2t))`, so any subject off the plane yields a vector that is not
1. Normalise anything that is used as a DIRECTION, especially where it round-trips.
WHY: the base+offset camera (RENDER-S12) places the camera at `|heading| * dist` and then reads the
distance back as the zoom, so every frame multiplied the zoom by `|heading|`. Measured: Jupiter sits
just below the plane, |heading| = 0.993, and the view crept inward 0.72% per frame to the
min-distance clamp; the ISS on a host-relative heading gave |heading| = 1.28 and ran away outward -
1.25e-9, 8.8e-8, 6.2e-6, 0.031, 7.9 - to the max in under a second. ONE fault, opposite signs, which
is why it presented as two unrelated bugs and appeared to track the clock (the geometry moves as
bodies orbit).
BLAST: it hid for days because the old code used the same non-unit expression HARMLESSLY - it built
a position directly and never fed the result back. The danger appeared only when a value became part
of a loop. Any quantity that is both produced and re-measured needs its invariant asserted, not
assumed: the test here checks |heading| == 1 across tilts, policies and off-plane subjects, and also
asserts |heading|^600 == 1 so the REASON (ten seconds of compounding at 60fps) is guarded, not just
the value.

### RENDER-S15 Take each camera quantity from the input that OWNS it, not from the camera
BUCKET: ARCHITECTURE - take each quantity from the input that OWNS it. Infer it from shared state
instead and every other writer of that state becomes indistinguishable from the user.
WHERE: `holo/scene.ts:driveFocus` - rotation is derived from any drag, ZOOM only from the wheel.
RULE: a drag rotates; only the wheel changes distance. Never infer a quantity from the camera when
a specific input owns it, because then ANY other writer of the camera becomes indistinguishable
from the user for that quantity.
WHY: the rig read the whole offset - rotation AND distance - back out of the camera. Measured in the
field with `__camDebug`: while dragging, camera-to-target distance decayed a constant ~0.72% PER
FRAME (6.51e-4, 6.47e-4, 6.42e-4 ... 2.33e-4) and the derived zoom rode it down to the min-distance
clamp, so turning the view slowly zoomed in and a wheel-out was hauled back before the gesture
finished ("something fighting me to maintain the view"). The creep's own source was never found -
and did not need to be, which is the point: three separate writers had already broken the "only the
user moves the camera" assumption (a floating-origin rebase, an unfound writer, this creep), so the
fix is to stop that assumption carrying the distance at all.
BLAST: `targetDrift` in `__camDebug` disproved the obvious theory here (it read ~1e-20, so the
rotation centre was NOT the problem) - check it before blaming the centre again. If a future gesture
needs to change distance, give it its own input kind rather than widening what the camera is trusted
for.

### RENDER-S14 A heading policy needs the FULL sphere, or it can be handed an impossible shot
BUCKET: ARCHITECTURE + PLATFORM (OrbitControls damping; the pole singularity) - durable: clamp only
what the VIEW KIND requires, never what the geometry might need; A LIMIT SET IN TWO PLACES IS A
LIMIT YOU HAVE NOT CHANGED; and make an unsatisfiable policy SAY so.
WHERE: `holo/scene.ts:applyPolarLimits` (3D: epsilon off each pole; a flat map stays pinned).
RULE: any camera policy that derives a heading from REAL POSITIONS - host-relative framing, a
route, a surface construct - can legitimately ask for a direction below the plane. The controls must
be able to hold it. Clamp only what the VIEW KIND requires (a flat map is overhead by definition),
never what the geometry might need.
WHY: `maxPolarAngle` was `PI * 0.49`, so the camera could not go below the ecliptic at all - half of
every system was unreachable. Once the shot became host-aware (R2) that stopped being a limitation
and became a FAULT: for a moon or station on the underside of its world the wanted heading points
downward, the controls refused to hold it, and the framing never settled - which reads as the
autoframing "breaking" rather than as a clamp, because nothing reports it.
BLAST: A LIMIT SET IN TWO PLACES IS A LIMIT YOU HAVE NOT CHANGED. These are written at controls
construction AND in `applyPolarLimits`, which only runs on a framing change - so a view nobody
re-frames keeps whatever the constructor said. The first attempt at this fix edited only the
function and appeared to do nothing. Grep for every writer of a controls limit before believing an
edit landed.
ALSO: user input has a TAIL. OrbitControls damps a wheel or drag over many frames, so anything
gated on "the user acted THIS frame" catches the first damped step and overwrites the rest - the
wheel then moves erratically, and can go the same way whichever direction it is turned, because the
surviving fragment is whatever one frame held. Trust the camera for a window (~500 ms) after input,
not for a frame.
BLAST: epsilon off each pole, not zero - at exactly 0 or PI the up vector is parallel to the view
direction, the azimuth is undefined and OrbitControls resolves it by spinning. If a future policy
still cannot be satisfied, make it SAY so (`hostWouldOcclude` is the pattern) rather than letting
the camera chase a shot it can never reach.

### RENDER-S13 Every construct has an EXTENT, and anything self-drawn must be self-LIT
BUCKET: ARCHITECTURE + DOMAIN - architecture: the camera and the geometry take their extent from ONE
authored number, so they cannot disagree. Domain: a scene whose only real light is its star has no
fill, so anything self-drawn must be EMISSIVE or it draws black on black.
WHERE: `holo/scene.ts:attachHullVolume` (the ellipsoid stand-in), consumed by `frameDistance` and
`focusBody`'s min-zoom via `shipLen`.
RULE: a construct with no 3D model still gets a rendered hull - an ellipsoid at its authored
`dimensionsM`, normalised to a UNIT long axis (RENDER-S9's contract) and assigned to `shipModel` so
it inherits the pixel LOD, framing, min-zoom and drive plumes already built for real hulls. Its
material must be EMISSIVE, in the construct's `icon_color`.
WHY: a screen-fixed glyph is identical at every distance, so the close-up rung showed nothing; and
with no extent at all the solver fell through to `sizelessHalfExtent` (0.35 scene units, a number
with no physical meaning), so selecting one gave an arbitrary shot. Giving it an extent from the
same authored number the shape uses fixed BOTH at once - the camera and the geometry cannot
disagree. The emissive part is not cosmetic: THE SCENE'S ONLY REAL LIGHT IS ITS STAR, so a lit
material draws black-on-black in shadow or far out. The sprite it replaced never had that problem
because a sprite is unlit - any future self-drawn marker geometry inherits the same trap.
BLAST: a SURFACE construct is the exception and must NOT be framed to its own extent - its hull is
suppressed entirely (`showModel` under `surfaceLock`) and its own size would fly the camera inside
the planet. It frames its HOST along the line host->construct, so it sits centred on the disc.
Adding any new construct-visual goes through this function, not a sixth branch; and glyphs come
from `constructIcon.ts` (A34's one vocabulary), never a private copy.

### RENDER-S12 The camera is a BASE the system writes plus an OFFSET only the user writes
BUCKET: ARCHITECTURE - base + offset makes four fault classes IMPOSSIBLE rather than merely fixed,
which is the shape to copy. There is no third category of camera writer: a thing either proposes a
BASE or it is user input and writes the OFFSET.
WHERE: `src/lib/viewport/cameraRig.ts` (+ `cameraRig.spec.ts`), `shotSolver.ts` (+ its spec).
Phase P2 of `docs/dev/camera-framing-redesign.md`.
RULE: base = the shot the solver wants, RECOMPUTED EVERY FRAME from live positions. offset = what
the user did (a rotation and a distance RATIO), identity until they touch it. Rendered camera =
compose(base, offset); `deriveOffset` reads their manipulation back each frame before the base is
recomputed. Only an explicit re-frame resets the offset. Any transition is COSMETIC (`blendToward`)
and cannot change the destination.
WHY: six separate mechanisms used to sit between "here is where the camera goes" and the camera
going there, and by eye every one produced the same symptom - wrong size, wrong place. Four of them
become impossible here rather than merely fixed: a moving subject cannot outrun the shot (the base
IS its position), a scene rebuild cannot disturb it (a rebuild is just a new base), a blend cannot
strand the camera (interrupt it and the next frame still converges), and a policy floor cannot be
expressed independently of the subject (zoom is a ratio of the framed distance).
TESTS - what each is FOR, because they are regression tests for specific reported faults, not
coverage: `cameraRig.spec.ts` has one test per fault from section 1 of the design, each written to
fail against the OLD behaviour - a subject moving a million times its own framing distance per
frame; 50 consecutive base replacements; a blend from 1e10x out in both directions, with dropped
frames; a true-scale hull reachable through the zoom clamp. `shotSolver.spec.ts` holds the P1
equivalence column (old closure verbatim) plus R3 scale-blindness and R1's fill fraction.
SEE IT: `/scale-reference` renders the size law's whole table (RENDER-S11). `window.__camDebug`
prints the live shot, chosen ladder level, actual distance and whether the drive is armed;
`window.__shipDebug` prints intent AND measured size (read `ratio` - see RENDER-S8's caveat).
BLAST: do not add a second writer of the camera. If something needs to move the view, it either
proposes a BASE (a policy/solver input) or it is user input and writes the OFFSET - there is no
third category, and inventing one is how the six mechanisms happened. Also: a test tolerance here
must be relative to the shot's own scale, never an absolute epsilon - composing a 1e-9 offset onto
a target at 0.1 loses absolute precision to cancellation (the thing the floating origin exists to
prevent).

### RENDER-S11 The size law is one tested module; the scene binds it, never restates it
BUCKET: ARCHITECTURE - one pure law, an EXPLICIT context, no ambient state: a caller that cannot
pass the context is a caller about to disagree about scale. And a floor in WORLD units is the thing
true scale exists to avoid - legibility belongs to the screen.
WHERE: `src/lib/rendering/scaleLaw.ts` (pure) + `scaleLaw.spec.ts`; bound in `holo/scene.ts`
(`scaleCtx()`, `bodyRadiusScene`, `starRadiusScene`, `shipLenScene`, `markerScale`, `bodyRadius`).
RULE: how big anything draws is decided ONLY in scaleLaw.ts, from an explicit
`{bodySize, rMax, gridRadius}` context. The scene supplies the live dial and calls it. Do not
reintroduce sizing arithmetic in scene.ts, and do not read ambient dial state inside the law - a
caller that cannot pass the context is a caller that is about to disagree about scale.
WHY: the law was four closures inside `createHoloScene`: unreachable from outside, untestable, and
already drifted (the construct readable band 0.14-0.7 OVERLAPS the body band, so a 46 m frigate
out-draws a small moon at the readable end - the ordering inversion the redesign's R9 kills in P4).
Scale faults are invisible without measurement (RENDER-S8), so an untestable law is one nobody can
check.
TESTS, and what each is for: `scaleLaw.spec.ts` holds the OLD closure bodies verbatim beside the
new functions and demands EXACT equality across every dial stop x 4 system extents x real object
sizes - that is the P1 extraction guard, and it is what makes "no behaviour change" a fact rather
than a claim. It also carries `describe.skip('R9 ordering')`, the P4 acceptance test, written
before the work: a physically larger object must never render smaller, and a moon-sized construct
may read moon-sized (no construct cap - the owner's "you could construct a death star"). It is
skipped because today's law FAILS it on purpose. P4 turns it on; if you are changing the law and
it still fails, you are not done.
SEE IT: `/scale-reference` renders the canonical object set (star..46 m ship) at every dial stop
and four system widths, through the REAL law, and flags every ordering violation. Use it before and
after any change to the law - it is the "did the look move?" check that a diff cannot give you.
BLAST: changing a readable band moves saved presets' mid-dial looks (RENDER-S6). Delete the legacy
column in the same commit that changes the law, or it will fight you. TWO FLOORS ARE ONE TOO MANY:
bodies floor at 1e-7 scene units and constructs at 1e-10, so at TRUE scale a 10 km moonlet
(floored, 2.0e-7) out-draws a 22 km station (unfloored, 5.9e-8) - an inversion the dial cannot fix,
found by /scale-reference on its first render. A floor in SCENE units is the thing true scale
exists to avoid; legibility belongs to the screen-space pixel floor. Design:
`docs/dev/camera-framing-redesign.md` (S1/S2/S2b, phases P1/P4).

### RENDER-S10 Camera framing eases in LOG distance, and must travel with its target
BUCKET: ARCHITECTURE + PLATFORM (floating point over ten decades) - durable: close a constant
PROPORTION per frame, carry the shot by the target's own motion, and make arrival a RATIO test. At
1e-9 units every absolute epsilon is either unreachable or instantly true.
WHERE: `src/lib/holo/scene.ts:driveFocus` (`easeDistance`, `framedClose`, `_prevDesired`);
`window.__camDebug = true` prints the shot, the chosen ladder level and the live distance.
RULE: this scene spans ten orders of magnitude between a whole-system shot (~20 units) and a
true-scale hull (~1e-9). Any approach must close a constant PROPORTION per frame, never a fixed
fraction of an absolute gap, and must first carry the shot by the target's own motion.
WHY: a linear lerp from 20 units was still millions of times too far after its 48 frames, so the
drive never arrived. Three separate reports were that one arithmetic: "framed too far out" (it
stopped mid-flight), "it wrests the camera away as I pan" (the drive stayed armed and re-placed the
camera every frame - only the WHEEL escaped, because that sets userZoomOverride), and "it snaps
back when time moves". Separately the ease flew through ABSOLUTE space, so a small fast mover
outran it: measured, it closed to 1.3e-4 and found the target 6.5e-4 away on the next frame,
repeatedly - which is why a station in low orbit could only be viewed with the clock paused.
Measured after: settled distance 1.5e-3 -> 1.9e-8 scene units, hull 0.0002 px -> ~19 px.
BLAST: measure the ease against the BODY, not `controls.target` - the target lerps in at 18% a
frame and at close-up scales one of its steps dwarfs the camera's whole remaining distance, so the
two fight and the shot crawls. Arrival must be a RATIO test: at 1e-9 units every absolute epsilon
is either unreachable or instantly true, and an approach from below must not count as arrived.
Also: any framing input that keys off an ASYNC-loaded asset is a race - `frameDistance` and the
min-zoom both keyed off `shipModel`, so the same click gave a close-up or a system-wide shot
depending on whether the download had landed. Derive from the authored data, which is there at
once.

### RENDER-S9 A "normalised" model group is only normalised until someone sets its scale
BUCKET: ARCHITECTURE - a builder that normalises parks that scale on a CHILD and hands back an
identity wrapper. TEST THE CONTRACT THE CALLER RELIES ON, not the one the builder advertises - the
old test stayed green because it measured the one thing no real caller does.
WHERE: `src/lib/constructs/modelViewer.ts:buildDisplayModel` (returns an OUTER group whose own
transform is the caller's); consumed by `holo/scene.ts:attachShipModel` and the portrait viewer.
Guarded by `modelViewer.spec.ts` ("leaves its own transform free for the caller").
RULE: a builder that normalises geometry must park that scale on a CHILD and hand back a wrapper
with an identity transform. Every caller's natural move is `obj.scale.setScalar(wanted)`, which
overwrites - not composes with - a scale sitting on the returned object itself.
WHY: `buildDisplayModel` returned the normalised group directly when the ModelRef carried no
`orient`, and `scene.ts` then did `g.scale.setScalar(sceneLen)`, throwing the normalisation away
and drawing the hull at `native x sceneLen`. The bundled ISS normalises by 0.039, so it drew 25.6x
oversize - a 109 m station a fifth of an AU long. The factor is the model FILE's native size, so
each model was wrong by its own amount and in either direction, and a model WITH an orient took a
wrapper path and was correct: it presented as "sometimes too close, sometimes too far, erratic"
rather than as a plain constant error, which is what made it hard to name.
BLAST: the existing "normalises to a unit long axis" test stayed green through all of it, because
it measures the returned object WITHOUT setting a scale on it - the one thing every real caller
does. Test the contract the caller relies on, not the one the builder advertises. The portrait
viewer hid it too: it measures whatever it is handed and frames to that, so a 25x hull just gets
framed 25x further away and looks perfect - the only surface a human had ever checked.

### RENDER-S8 A ship's drawn size cannot be judged from a screenshot - measure it, and measure the OBJECT
BUCKET: ARCHITECTURE (instrumentation) + IMPLEMENTATION - durable: an instrument that reports what
the code INTENDS is not a measurement of what it DID. This one reconciled to five figures against a
picture that was plainly wrong, so 'measure, do not judge from a screenshot' produced a confident
wrong answer and closed the investigation.
WHERE: `src/lib/holo/scene.ts:updateConstructs` (`window.__shipDebug = true` logs the numbers)
RULE: the drawn size is `max(trueLength, minPx * f * cameraDistance)` - it depends on the
body-size dial, the camera distance AND the viewport height together. A hull that looks "AU
across" may be a correct 7 px on a screen you are not looking at, and one that looks right may
be wrong. Turn the hook on and read `onScreenPx` before changing anything.
CAVEAT, paid for the hard way: `drawn`/`onScreenPx` are only what the code INTENDS. Read
`measured`/`measuredPx` (the hull's real world extent) and check `ratio` is near 1. The hook once
reported a serene 7 px while the hull was really 204 px across, and its arithmetic reconciled to
five figures against a picture of a station spanning a fifth of an AU - so "measure, don't judge
from a screenshot" produced a CONFIDENT WRONG ANSWER and closed the investigation. A `ratio` well
off 1 means the fault is upstream of this maths (see RENDER-S9), not in the floor. `measured` is
an axis-aligned box around a hull that turns with its heading, so ~1.0-1.7 is healthy.
WHY: this was misdiagnosed four times from screenshots - visibility rules, LOD thresholds and
camera framing were all "fixed" while innocent. The one real fault (a division landing on the
divide-by-zero guard at true scale) was found in seconds once the numbers were printed.
BLAST: any change to the floor, the dial, or the framing. Note the floor RELEASES while the
camera frames that ship (otherwise zoom cannot change the apparent size at all).

### RENDER-S7 Never swallow an exception on the path that decides whether a thing renders
BUCKET: ARCHITECTURE - never swallow an exception on the path that decides whether a thing RENDERS:
the fallback is correct behaviour, so a silent failure is indistinguishable from a design decision
by looking at the screen.
WHERE: `src/lib/holo/scene.ts` (`attachShipModel`, `loadShipModel`) - both now `console.warn`
RULE: a try/catch around model building MUST report. The fallback (the glyph) is correct
behaviour, so a silent failure looks exactly like a design decision and cannot be distinguished
from one by looking at the screen.
WHY: `applyExhaustColour` was left reading the OLD single-rig shape (`fx.cone`) after `ShipFx`
became `{ rigs }`. It threw `undefined.material` for EVERY construct with a model, inside a
silent catch - so ships showed their icon everywhere, in every view, and three rounds of
diagnosis went into visibility rules, LOD thresholds and framing that were all innocent.
BLAST: `npm run build` does NOT typecheck (Vite strips types), and `svelte-check` currently
reports ~1357 pre-existing errors repo-wide, so neither would have caught it. Until that noise
is cleared, a refactor that changes a shared interface's SHAPE needs every reader grepped by
hand - `grep 'fx\.' ` would have found this in seconds.

### RENDER-S6 The body-size dial interpolates GEOMETRICALLY, not linearly
BUCKET: ARCHITECTURE - a control over a quantity spanning decades interpolates GEOMETRICALLY, so
each step multiplies by a constant ratio.
WHERE: `src/lib/holo/scene.ts:dialBlend` (bodies, stars and ship hulls all route through it)
RULE: size = true^(1-v) x readable^v, so each step of the dial multiplies size by a constant ratio.
WHY: linear blending let the readable term dominate a 1e-5 true radius immediately — 20%-90% of the
travel looked identical and the whole true-scale transition was crammed into 0-5%. Log spacing also
makes ships shed size faster than planets for free (bigger readable-to-true ratio), which is what
"constructs should be smaller" asked for.
BLAST: changing either endpoint; adding a new object class to the dial. Mid-dial looks in SAVED
presets move if this changes — endpoints do not.

### TRANSIT-*  (journeys, autopilot, routing)

_Belt mass is PHY-13. Route geometry and the ship's own clock are RENDER-S17 and RENDER-S18 — read
both before touching a published route._

#### Opened 2026-08-07 by the engine-map backfill session. Verified against the code, not the inbox.

### TRANSIT-1 Autopilot takes FLIGHT PARAMETERS out of user-editable tag data, by slug
BUCKET: IMPLEMENTATION + ARCHITECTURE - durable: engine behaviour keyed to a USER-EDITABLE
vocabulary by slug, with no repair and no report, fails silently by default - a GM editing a tag
list is editing ship performance and nothing says so. Exhibit 6 in faults-the-old-shape-allowed.md.
WHERE: `constructs/coi.constructReadiness` (STATUS tags' `readiness`) and `constructTardiness` (the
OWNER tag's `tardiness`); consumed in `transit/autopilotAdapter.ts:180` and `:333`. Slug matches also
sit in `components/AutopilotTab.svelte:92-100` and `constructs/inheritance.DRIVE_RANK`.
RULE: `readiness` and `tardiness` are NUMBERS ON TAG DEFINITIONS the GM can edit in Settings → CoIs,
and they travel inside the starmap. They are not cosmetic: readiness 0 refuses the journey outright
(`stuckReason: 'not operational'`), a fractional readiness MULTIPLIES `maxG` so a damaged ship limps,
and tardiness stretches dwell. A GM editing the CoI list is editing ship performance.
WHY: the coupling runs the wrong way round from how it reads. `readiness` looks like a display
property on a status chip; it is a thrust multiplier. And the slug matches are silent on failure —
delete `purpose/mining` and `suggestedAction()` simply returns a different default and `defaultRate()`
falls back to a size-scaled guess. Nothing says a capability stopped being recognised.
BLAST: TAG-12 protects the CATEGORIES from deletion, NOT the individual tags inside them, and
`coiCategories` deliberately does NOT filter on `enabled` — so disabling the Status category leaves
readiness working while deleting one status tag does not. `constructTardiness` returns the FIRST
matching owner tag in the CATEGORY's order, which is only unambiguous because `owner` is `single`.
Adding a new slug-coupled behaviour: give it the TRANSIT-2 repair, or accept that it fails silently.

### TRANSIT-2 Three status slugs and one readiness number are ENGINE CONSTANTS living in user data
BUCKET: IMPLEMENTATION + ARCHITECTURE - durable: where an engine depends on a vocabulary it does not
own, it must REPAIR that vocabulary on every normalise. That this is the ONLY place which does is
the finding, not the rule.
WHERE: `constructs/coi.normalizeCoIs` (the `def.id === 'status'` block); pinned by
`tags/tagCategories.spec.ts:85-88`.
RULE: `status/in-transit-interstellar`, `status/in-transit-system` and `status/adrift` are RE-ADDED on
every normalise if missing, stamped `derived: true`, and `status/adrift` has its `readiness: 0`
RE-WRITTEN each time. The engine repairs the vocabulary it depends on rather than trusting the file.
`status/active` is deleted on sight — operational is the absence of a blocker, not a tag.
WHY: `derivedStatusKey` MIRRORS journey state into these keys, so they are the engine writing to
itself through the user's tag store. A stale or hand-edited imported CoI set missing `status/adrift`
would leave an adrift ship with readiness 1 — fully operational, and freely dispatchable.
BLAST: this repair is the ONLY one of its kind. `purpose/*`, `drive/*` and `resource/*` are matched by
slug with no equivalent (TRANSIT-1). If you add an engine-meaningful tag, either add it to this block
or expect it to go missing. Do not "clean up" the re-add as redundant — it is load-bearing on import.

### TRANSIT-3 A leg's arrival is its OWN departure plus transit, never the requested start
BUCKET: DOMAIN + ARCHITECTURE - domain: a thrifty transfer legitimately WAITS for an alignment
window, and the wait is part of the schedule. Architecture: ONE solver both costs the search and
commits the legs, so they cannot disagree.
WHERE: `transit/autopilotAdapter.solveLeg` (the `departMs` line and the `elapsedDays` cap).
RULE: the Most Efficient family can commit a DELAYED launch window — `startTime` up to ~1000 days
after `startMs`, which IS the "wait for alignment" behaviour a thrifty ship deliberately chooses. So
arrival must be anchored on `chosen.startTime`, and any per-leg time cap must count the WAIT as well
as the flight.
WHY: anchoring on the requested `startMs` understated every delayed leg and stacked the following legs
on top of the wait — a schedule that is internally consistent and wrong, with no error anywhere. The
cap has the mirror trap: a plan that waits 300 days and flies 200 busts a 250-day limit.
BLAST: one solver both COSTS the reorder search and COMMITS the legs, so they cannot disagree — the
`light` flag selects a cheaper quote tier, not a different model. Do not add a second estimator for
the search. Tardiness slack (`autopilotPlanner.ts:268`) is a deterministic FNV hash of
`(construct id, leg index, arrival timestamp)` for the same reason a scrubbed timeline must replay
identically — see DATA-G1, and note `hash01` there is NOT the same constant as the engine's.

#### Load path and instruments (P1) — added 2026-08-07 by the performance/memory comb

### UI-L1 A progress bar at 100% is not a finished load, and the overlay outlives the work it reports
BUCKET: ARCHITECTURE (instrumentation) - a progress bar reports ONE STAGE of a load; the diagnostic
instrument is the stage. An overlay that never advanced looks identical to one that never started,
so the opening frame is not evidence of progress either.
WHERE: `routes/+page.svelte:recalcAllSystems` (the overlay is cleared AFTER the loop) + `handleLoadStarmap`
RULE: the physics overlay reports ONE stage of a load. It is torn down only after `starmapStore.set`
and the first render, so a hang in either of those leaves a completed bar on screen. When diagnosing
a stuck load, read the STAGE (`[sse-load]` / `window.__ssePerf.loadStages`), never the bar.
WHY: a user's phone froze showing "Running the physics… 2/2 systems, 100%" and the report — and the
requested fix — was "add a skip button for the loading screen". The physics had finished; the hang
was downstream, on a map whose two systems are 85,103 ly apart. A skip button would have fixed
nothing and the real suspect (first-render work scaling with map extent) would have been missed.
The first joke string is `PHYSICS_JOKES[0]`, so an overlay that never advanced looks identical to
one that never started — the opening frame is not evidence of progress either.
BLAST: any new load stage → add a `perfStage` call and a `loadGuardStage` label, or it becomes
another invisible place to hang. Anything that reads "the bar was at N%" as a diagnosis.

### UI-L2 A load guard must clear on a TIMER as well as on a painted frame
BUCKET: PLATFORM (browser: a hidden or non-compositing tab paints no frames) + ARCHITECTURE - a
guard needs TWO independent clears, and a timer cannot mask the fault it exists for, because a
genuinely hung render blocks both paths.
WHERE: `routes/+page.svelte:handleLoadStarmap` (double-rAF `clearOnce('painted')` + 15s `clearOnce('alive')`)
RULE: a guard that arms before an auto-load and blocks the next startup if unfinished MUST have two
independent clears: a painted frame AND a wall-clock timer. Never the paint alone.
WHY: a hidden or non-compositing tab paints NO frames, so a load that completed perfectly in a
background tab left the guard armed and the safe-mode screen appeared on the next visit — the guard
locking out the app it exists to protect. Found live within minutes of building it. A timer can only
fire if the main thread is alive, so it cannot mask the real fault: a genuinely hung render blocks
both paths, which is exactly the case the guard is for.
BLAST: any other "did this finish?" flag keyed on rendering. Note the symmetric trap in UI-L3 — a
hidden tab also changes TIMING, not just painting.

### UI-L3 A per-item yield in a loop costs 1s per item in a hidden tab
BUCKET: PLATFORM (browser: setTimeout clamped to ~1 Hz in a background tab) - a per-item repaint
yield becomes 1000 ms per item, so 2 s becomes 44 s with no slow code anywhere.
WHERE: `routes/+page.svelte:recalcAllSystems` (`if (!document.hidden) await setTimeout(30)`)
RULE: browsers clamp `setTimeout` to ~1 Hz in a background tab, so a `setTimeout(30)` yield inside a
per-item loop silently becomes 1000 ms per item. Gate any repaint yield on `!document.hidden` — with
nothing painting and no user able to click, there is nothing to yield FOR.
WHY: measured on the bundled 44-system map — 31-47 ms per system foreground, 1000 ms per system
hidden: 2 s becomes 44 s, and scales with the map. It presents as "loading takes far too long"
with no slow code anywhere, because the cost is entirely in the yields. Found by the `[sse-load]`
stage stamps on the first run, not by reading the code.
BLAST: every other progress loop that yields to repaint (imports, exports, batch processing).

### UI-L4 An emergency data path must not depend on anything that could be the fault
BUCKET: ARCHITECTURE (product contract) - the recovery route for un-loadable data must touch NOTHING
that could be the fault. The user's only exit was resetting browser data: the campaign was destroyed
by the workaround, not by the bug.
WHERE: `routes/+page.svelte:downloadStoredStarmap` (storage → JSON → download, no render, no engine)
RULE: the recovery route for un-loadable data reads storage and writes a file, touching no renderer,
no processor and no store. Plain JSON, which the ordinary `.json` load path reads back.
WHY: the user's only exit from a map that would not load was resetting Chrome data — the campaign
was destroyed by the workaround, not by the bug. A rescue that ran the same pipeline would hang the
same way. This is why it is offered on the safe-mode screen, BEFORE any retry.
BLAST: adding assets/bundling to this path would reintroduce the dependency. Keep it dumb.

### UI-L7 A loop sized in MAP units is unbounded, because zoom is fitted to the map's own extent
BUCKET: ARCHITECTURE - durable and general: a loop that steps in WORLD units under a FITTED zoom is
bounded by the DATA's extent, not by anything on screen. And a GATE and a CAP are two different
things - the cap must sit ABOVE honest use or it truncates real work instead of catching runaways.
WHERE: `components/Grid.svelte` (the `MIN_CELL_PX` gate + `MAX_CELLS` cap); pinned by `Grid.gate.spec.ts`
RULE: any draw loop that steps in MAP units over `view / zoom` runs a number of times set by the
DISTANCE BETWEEN THE FURTHEST TWO SYSTEMS, not by anything on screen. It must be gated on the cell's
SCREEN size before the loop is entered. `starmapScene.renderMapGrid` already does this for the 3D
map ("too dense to be useful"), which is why that view never had the fault.
WHY: measured on the reported map (two systems 85,103 ly apart, auto-fitted to zoom 2.6e-4): the
square grid asked for 61,422 x 46,066 lines and built a 4.95 MB path string; the HEX grid asked for
81,896 x 53,193 = **4.36 billion** iterations — at the 664k hexes/sec measured on a fast desktop,
1.8 hours of blocked main thread growing a ~670 GB string, so it OOMs on any device. The user could
never load the app again and cleared browser data to escape, destroying the campaign. THE GIVEAWAY
WAS A LIE: this runs after the physics pass, so the progress bar reads 100% and the fault reads as
"the physics is slow" — see UI-L1.
BLAST: the same shape is anywhere a loop steps in map/world units under a fitted zoom — grids,
lattices, rulers, scale bars, tick marks, snap overlays. Note `Starmap.svelte` passes Grid a
HARDCODED `viewWidth={800} viewHeight={600}` rather than the real viewport, so the loop bound is not
even the true visible area; that is a separate latent bug, left alone.
GATE VS CAP, and do not collapse them into one number: the gate is a judgement about what is worth
drawing, the cap is a guarantee no future gate change can reintroduce an unbounded loop — so the CAP
MUST SIT ABOVE HONEST USE or it silently truncates real grids instead of catching runaways. The
first pair tried here (3 px / 40,000) failed exactly that way: the densest legible hex view genuinely
wants 82,112 cells. The spec asserts the two constants against EACH OTHER for that reason.

### UI-L6 A load-failure bundle needs the STORED map and the LIVE one, and they answer different questions
BUCKET: ARCHITECTURE - ask whether the object you are exporting is the INPUT or the STATE, and say
which in the file. A mutating pipeline's in-memory copy is a state nobody can reproduce and no code
path ever created.
WHERE: `io/diagnosticBundle.ts` (`starmap` vs `liveStarmap`, `map.source`, `map.hasInMemoryCopy`)
RULE: `recalcAllSystems` rewrites `node.system` IN PLACE, so mid-load the in-memory map is a half
re-derived mixture that never existed on disk. Ship BOTH: the stored copy is the reproducible INPUT
(test-load it — if it loads elsewhere, the fault is the device or the scale, not the data); the live
copy shows how far the engine got and what it produced. `starmap.json` is ALWAYS the loadable one so
the file to reach for never depends on which failure produced the bundle.
WHY: shipping only the live map hands a debugger a state nobody can reproduce and that no code path
ever created; shipping only the stored map throws away the evidence of where processing stopped. The
first version of this bundled whichever map the caller happened to hold, which during a stop was the
half-derived one — presented as if it were the input.
BLAST: any new "here is the data" export from a mutating pipeline. Ask whether the caller's object
is the INPUT or the STATE, and say which in the file. If storage cannot be read, the live copy takes
the loadable name and `map.source` must say `in-memory` — never let a fallback impersonate the input.

### UI-L5 A diagnostic that carries a user's campaign is built on consent, not on convenience
BUCKET: ARCHITECTURE (product contract) - four consent properties, all pinned by a spec: built only
on ASK, nothing uploaded, a README that states what is inside, and the campaign confined to ONE
deletable file so a user can still send a useful report.
WHERE: `io/diagnosticBundle.ts` (+ `diagnosticBundle.spec.ts`); offered after Stop load, in safe mode,
and on demand from Settings → System
RULE: four properties, all load-bearing, all pinned by the spec: built ONLY when the user asks;
downloaded to their own device with NOTHING uploaded from here; a `README.txt` that states what is
inside; and the campaign confined to `starmap.json` so they can delete that one file and still send a
useful report. The per-system summary carries shapes and counts, never bodies.
WHY: the zip contains the whole campaign including GM notes, because the map IS the reproduction of a
load hang — there is no useful diagnostic without it. That makes the honesty of the README the thing
standing between "helpful" and "took their data", and it is why the campaign is one deletable file
rather than smeared through the report.
BLAST: adding a field → ask whether it belongs in `report.json` (shape, timing, environment) or is
campaign content (which already travels once, in `starmap.json`). Any upload, telemetry or "send it
for me" convenience breaks the consent property and needs the owner's decision, not a refactor.
Also: a missing map must degrade to a SMALLER bundle, never to no bundle — storage failing is when a
diagnostic matters most.

### DATA-*  (starmaps, import, rulepacks)
_Partly written. STILL UNWRITTEN: `tests/fixtures/*` and `tests/output/*` are GENERATED, never
hand-edited._

#### Backfilled from closed inbox items — added 2026-08-07 by the engine-map backfill session

### DATA-G1 A new random draw takes its OWN id-seeded stream, or every written-down seed stops reproducing
BUCKET: ARCHITECTURE - with PHY-1, the other property a generator has from its first commit or
retrofits for a year. A draw takes its OWN id-seeded stream; anything that must survive
re-processing uses a deterministic hash rather than an rng at all, because a per-run stream's order
depends on iteration order and that is not a promise.
WHERE: `generation/star.starTiltFromPack` / `starFieldFromPack` (callers pass
`new SeededRNG(\`${id}-tilt\`)` / `-mag`); `generation/planet.ts:269`; the deterministic
`hash01(body.id + '|…')` in `SystemProcessor.ts:37` and `import/realsky/positions.mjs:17`.
RULE: never add a draw to the SHARED per-run rng. Its stream position depends on how many draws ran
before it, so one insertion shifts every subsequent draw and silently re-rolls every planet in every
saved seed. Seed from the BODY ID. For anything that must also be stable across re-processing, use
`hash01(id + '|<purpose>')` rather than an rng at all — a per-run rng's order depends on iteration
order, which is not a promise this codebase makes.
WHY: B9a had to add a stellar field draw and verified byte-identical output for three legacy seeds
BEFORE shipping it; had it drawn from the system stream, every existing campaign's planets would have
moved and nothing would have reported it. Same family as TAG-8, different mechanism: TAG-8 is the rule
LIST re-ordering, this is the STREAM being displaced.
BLAST: DATA-R2 depends on this — `hash01(id + '|i')` is the SEED for inclination, argument, node and
phase, so the recipe is load-bearing for the bundled maps. THERE ARE THREE `hash01` COPIES AND THEY DO
NOT ALL AGREE: `SystemProcessor.ts` and `positions.mjs` are both `% 100000`, `transit/autopilotPlanner.ts`
is `% 1_000_000`. The first two MUST stay identical (DATA-R5 forbids `positions.mjs` importing from the
app, which is why it is copied — the comment says "same recipe", nothing enforces it). There are also
two DIFFERENT classes both exported as `SeededRNG` (`lib/rng.ts`, `lib/traveller/rng.ts`); check which
one an import resolves to before reasoning about a stream. `Math.random` is fine for one-shot AUTHORING
(a GM clicking "add a planet"), never on a path that must replay.

#### Ship-model binaries (G3) — added 2026-08-04 by the ship-appearance stream

### DATA-M1 A model binary never rides the node
BUCKET: ARCHITECTURE - the document carries a content-addressed REFERENCE; the bytes travel on
demand. Content addressing also means two things sharing a hull cost one entry.
WHERE: `src/lib/constructs/modelStore.ts`, `modelTransfer.ts`, `broadcast.ts` (`REQUEST_MODEL`)
RULE: the node carries a `ModelRef` (hash + attribution) ONLY. The GLB lives in a hash-addressed
IndexedDB store; it reaches a saved file by explicit embedding at export, and a remote player by an
on-demand fetch keyed on the hash. Inlining it as a data URL is the trap.
WHY: `sendIfChanged` re-stringifies and re-sends the WHOLE snapshot on any change. A photo (30-80 KB)
survives that; a 500 KB model multiplies every resend until the GM's tab stalls.
BLAST: any new place a model is attached; anything that puts bytes on a node. Content addressing
means two ships sharing a hull cost one entry — do not "clean up" the store per construct.

### DATA-M3 A save is a bundle or plain JSON, and the MAGIC NUMBER decides
BUCKET: ARCHITECTURE - format is decided by the BYTES, never by the extension, and the readable
document sits BESIDE the binaries rather than base64'd inside them.
WHERE: `src/lib/io/bundle.ts` (`sniffBundle` / `packBundle` / `unpackBundle`); callers in
`routes/+page.svelte` and `components/SystemView.svelte`
RULE: a campaign or system carrying assets saves as a zip (`.sse.zip`) - a readable
`starmap.json`/`system.json` beside `assets/models/<hash>.glb` and `assets/images/<nodeId>.<ext>`.
With no assets it stays plain `.json`. On load the format is decided by the zip signature, NEVER
the extension, so a renamed file still opens. `packBundle` returns null when nothing needs
extracting - that null IS the "write plain JSON" signal.
WHY: base64-in-JSON cost 33% on the biggest bytes in the file and made a save unreadable and
un-hand-editable, which is what GMs actually do with them. Owner decision, 2026-08-04.
BLAST: adding a new asset kind (extract it in `packBundle`, restore it in `unpackBundle`, add a
round-trip case, AND teach `io/attributions.ts` about it - an asset with no provenance path is one
nobody can credit). Only DATA-URL images are extracted - an http(s) url is someone else's server
and must survive untouched. `.ubox`/`.sc`/`.pak` are zips too: the importer adapters are matched
BEFORE the sniff, so do not reorder that check.

### DATA-M4 Provenance travels with the art, and the gaps are named
BUCKET: ARCHITECTURE (product contract) - provenance travels with the art, and a GAP is named as a
gap rather than omitted. CC-BY with no credit is called out as a breach, not left blank.
WHERE: `src/lib/io/attributions.ts`, written into every bundle as `ATTRIBUTIONS.md`
RULE: each uploaded model/image is listed once with what uses it and its credit/licence/source.
An asset with NOTHING recorded is listed as such; CC-BY with no credit is called out as a breach
rather than a gap. `collectAttributions` reads only assets the bundle CARRIES (an `assets/` path),
never a remote url or an unpacked data: url - so it must run AFTER packing has rewritten them.
WHY: a save gets handed to a player or posted publicly. Provenance buried in JSON is provenance
nobody honours, and CC-BY is an obligation, not a preference.
BLAST: changing the asset paths (the collector matches on the `assets/` prefix). Adding an upload
surface: fill the ImageRef/ModelRef provenance fields or every asset it creates reports blank.

### DATA-M6 What a save file IS is decided ONCE, before any validator speaks
BUCKET: ARCHITECTURE - classify the bytes ONCE, before any validator speaks. Classification NAMES a
sister file; it does not replace validation, and it must not stamp anything on a document it is only
inspecting.
WHERE: `src/lib/io/classify.ts` (`classifySaveFile` / `classifyJsonDoc`); callers in
`routes/+page.svelte` (Load Starmap), `components/SystemView.svelte` (Load System) and
`components/GenerationWizard.svelte` (load saved system)
RULE: every loader classifies the bytes FIRST — bundle kind from the zip member name, plain-JSON
kind from shape (`systems[]`+`routes[]` = starmap, `nodes[]` = system), else unknown — and only
then hands the doc to its own validator. Classification NAMES a sister file in plain words;
it never replaces `validateStarmap` or `isLoadableSystem`, which still gate what actually loads.
`classifyJsonDoc` is read-only by contract: it runs on files that are then refused, so unlike
`isLoadableSystem` it must never stamp anything on the doc.
WHY: each loader used to sniff for itself, so a file on the wrong loader died inside that
loader's validator — "Missing 'systems' array" for what was a perfectly good system save (G42:
"an esoteric error rather than identifying it as a sister file").
BLAST: any new loader or save shape. A fourth shape-sniff written inline in a component is this
rule being broken; extend `classify.ts` instead. If a new top-level save kind is added, teach
`classifyJsonDoc` its shape and every wrong-loader message names it for free.

### DATA-M7 A save screen names the world it saves, and there is ONE campaign save
BUCKET: ARCHITECTURE (product contract) + IMPLEMENTATION - durable: a save screen states in plain
words what IS and IS NOT in the file, and there is ONE live path per scope. A second, unreachable
save path had already grown and drifted.
WHERE: `src/lib/components/SaveSystemModal.svelte` (`scope` / `subjectName` / `showOptions`);
callers in `SystemView.svelte` (scope 'system') and `routes/+page.svelte` (scope 'starmap')
RULE: every save screen states in plain words what IS and IS NOT in the file — a system save is
that one system, explicitly not the campaign; a campaign save is everything — and shows the
filename stem it will write. `showOptions` is false for the campaign save because that path has
only ever written the full GM file: offering GM/Player there would promise a handout it does not
make. The LIVE campaign save is `handleDownloadStarmap` in `routes/+page.svelte` and nothing else;
`BaseMapUpgradeModal`'s backup calls it DIRECTLY, deliberately skipping the screen, because it is
already inside a modal that marks "Saved" the moment it fires.
WHY: G42, the owner's report — users "may save a system map thinking they are saving everything".
Nothing on either screen said which world it acted on. A second, unreachable campaign save had
also grown in `Starmap.svelte` and drifted (no `stripStarmapForExport`, no bundling, no models);
it was removed rather than synced.
BLAST: a new save surface must pass a scope, not default into 'system'. If the campaign save ever
gains a Player handout, `showOptions` becomes true there and the redaction must be implemented in
`handleDownloadStarmap` — the removed dead copy is NOT a working reference.

### DATA-M5 A map-fixed image lives INSIDE the world transform, and its anchor is campaign content
BUCKET: ARCHITECTURE - georeferenced content lives INSIDE the world transform and decoration lives
outside; every surface asks ONE function for the rectangle. Parity is a correctness requirement, not
polish: a player looking at borders in the wrong place is looking at a wrong map.
WHERE: `src/lib/map/mapBackground.ts` (the only place the rectangle is worked out), `Starmap.svelte`
(the `<image>` inside the `translate(pan) scale(zoom)` group), `starmapScene.ts` (`setMapBackground`,
the quad in the map plane), `starmapDocument.ts` (the figure at the foot), `types.ts` (`MapBackground`).
RULE: the GM's own picture behind the stars attaches one of TWO ways, and the difference is structural
rather than cosmetic. **screen-fixed** is decoration and lives OUTSIDE the world transform - a CSS
background on the `<svg>` element, which is why it holds still while the stars move. **map-fixed** is
GEOREFERENCED and must be drawn INSIDE the same transform the systems use, first, behind the grid and
the routes; registration is then automatic and free rather than something to maintain. Every surface
asks `backgroundRectMap` for the rectangle in MAP COORDINATES and then applies only its own view
transform - none of them re-derives it. The anchor (`widthUnits`, `offsetX/Y`, `rotationDeg`) is read
in the CAMPAIGN'S OWN unit via `pixelsPerUnit`, never light years by assumption (A43), and a unit
CONVERT must call `rescaleMapBackgroundForRuler` or the picture jumps while nothing on the map moved.
WHY: it is [[A4]] running in reverse - A4 had to DIVIDE zoom out of label fonts because they sat inside
the world transform, and this deliberately wants to be inside it. And in map-fixed mode a surface that
computes the rectangle even slightly differently is not "a bit off": a player looking at borders in the
wrong place is looking at a WRONG MAP, so parity is a correctness requirement, not a polish one. That
is also why the anchor is CAMPAIGN content (`Starmap.mapBackground`) rather than per-preset chrome - it
has to ride the save bundle, the player snapshot and the broadcast, and a second copy is a copy that
can disagree with the GM's own map.
BLAST: a new starmap surface must resolve through `resolveMapBackground` + `backgroundRectMap` rather
than reading the fields; the 3D form is a flat QUAD IN THE MAP PLANE and never a sky sphere (owner
decision - warping a sector map onto a sphere was refused, the sky stays procedural), rebuilt after
every `setData` because that is where the fit transform is recomputed. The starmap DOCUMENT has no map
coordinates at all, so both modes collapse there to one printed figure. The image rides `SYNC_STARMAP`,
NOT `SYNC_PRESET` - `SYNC_PRESET` carries `{presetId, overrides}` only, and a 2 MB background measured
2,097,819 bytes on the starmap message, gated by `sendIfChanged`'s fingerprint.

### DATA-M2 Imported model bytes are verified against their own key
BUCKET: ARCHITECTURE - content addressing means RE-HASH ON IMPORT and drop a mismatch, or a payload
filed under someone else's hash poisons every reference to it.
WHERE: `modelTransfer.importEmbeddedModels`; pinned by `modelTransfer.roundtrip.spec.ts`
RULE: an embedded blob is re-hashed on import and DROPPED if it does not match the key it arrived
under. A ref whose binary this machine never had exports ref-only and degrades to the icon glyph.
WHY: the store is content-addressed; mis-filing a payload under someone else's hash would poison
every construct pointing at it.
BLAST: adding another transport (the broadcast path shares this function deliberately).

#### Real-sky import and the bundled starmaps — added 2026-08-04 by the importer stream

### DATA-R1 A correction to a bundled map belongs in the KIT, never in the JSON
BUCKET: ARCHITECTURE + IMPLEMENTATION - durable: a GENERATED artefact is regenerated, and the
failure mode is a build that SUCCEEDS, prints its usual two lines, and quietly reverts twelve fixes.
WHERE: `scripts/starmap-build/build-starmaps.mjs`; pinned by `scripts/starmap-build/buildKit.spec.mjs`
RULE: the three files in `static/example-starmaps/` are GENERATED. The pin test rebuilds into a temp
directory and compares byte for byte, normalising only line endings and the `appVersion` stamp — so
indentation and key order count. Fix the roster, the fiction overlay or the generator, then rebuild.
The one honest exception is a stable-id rename, which cannot be regenerated (see DATA-R2).
WHY: the two drifted for a month unnoticed (D4). Twelve fixes were applied straight to the JSON, so a
routine `node build-starmaps.mjs` would have SUCCEEDED, printed its usual two lines, and silently
reverted C3's ecliptic frame flags, Adrian's radius, both Project Hail Mary drives and a re-parenting.
A working build that quietly undoes work is the failure mode here — not a broken one.
BLAST: anything under `src/lib/import/realsky/` that the kit imports changes generator output, so the
shipped maps must be regenerated in the SAME commit. Adding a planet host to the roster also
regenerates `src/lib/generated/bundledArchiveHosts.mjs` (D15) — never hand-edit that file.

### DATA-R25 A DESTRUCTIVE OFFER ITEMISES WHAT IT DESTROYS, or it is not informed consent
BUCKET: ARCHITECTURE (product contract) - a destructive offer ITEMISES what it destroys.
Over-warning costs a second look; under-warning costs the campaign - so name-based over-reporting is
the deliberate safe direction.
WHERE: `src/lib/map/rebase.ts` (`lossesOf`), shown by `BaseMapUpgradeModal.svelte`'s review stage
RULE: a screen that warns work will be lost must NAME the work. `lossesOf` reports constructs, a
GM-pinned name, GM notes, and — since B88 — every BODY the replacement has no counterpart for by
name. It still refuses to diff masses or orbits on a body both sides carry, because that difference
is indistinguishable from the data correction the rebuild exists to deliver.
WHY: B88, measured on a real campaign. The user's Procyon held eighteen bodies he had generated and
the bundled replacement holds one that matches; because none of them was a CONSTRUCT, the itemised
list came back EMPTY under a warning that said his work would be dropped. A scary sentence with no
evidence under it is worse than either half alone: it reads as boilerplate, so it gets clicked past.
BLAST: name-based, so a rebuild that RENAMES a body over-reports it. That is the deliberate safe
direction — over-warning costs a second look, under-warning costs the campaign. Anything that adds
a new node kind must decide whether its absence is a loss and say so here, not silently omit it.

### DATA-R23 A GM's answer about their OWN campaign is recorded ON the campaign
BUCKET: ARCHITECTURE (product contract) - an answer ABOUT a campaign is stamped ON the campaign, so
it rides saves and other devices. Every control that ends a conversation must record something: one
that closes a dialogue and stores nothing is an infinite loop with a polite face.
WHERE: `src/lib/map/upgradeOffer.ts` (`recordUpgradeAnswer`, the guards in `shouldOfferUpgrade`),
`types.ts` (`baseMapUpgradeDeclined` / `baseMapUpgradeDismissed`), `BaseMapUpgradeModal.svelte`
RULE: when the app asks the GM a question ABOUT THEIR CAMPAIGN, the answer is stamped on the
campaign, not filed in this browser. A decline then rides saves, bundles and other devices, exactly
as the campaign does. Every button that ends the conversation must record something: a control that
closes a dialogue while storing nothing is an infinite loop with a polite face. 'Not now' records
the edition declined (a LATER edition may ask again); the never-ask tick records a flat boolean.
WHY: B88. The decline lived only in `localStorage` keyed by campaign id, and 'Not now' dispatched a
bare `close` that stored nothing — so a user whose 51-system campaign matched the bundled map on
THREE ids was re-offered a work-destroying rebase on every single refresh, forever, and the only
control that ever silenced it was an easily-missed quiet checkbox.
BLAST: the localStorage key is still READ, additively — never swap it out, or everyone who already
dismissed gets re-asked once. Any new campaign-scoped question follows this rule rather than adding
a second preference key. `stripStarmapForExport` and the persist path both deep-clone, so top-level
fields ride for free; a future normaliser that PICKS fields instead of spreading would drop them.

### DATA-R2 Node ids are stable REFERENCES, and they feed the orbital phase hash
BUCKET: ARCHITECTURE + IMPLEMENTATION - durable: an id used as a SEED is content, not a label, so a
rename silently moves the body in its orbit; and a generator that quietly de-duplicates a clash
hides the next one exactly as well as silence did.
WHERE: `build-starmaps.mjs` (`hash01(id + '|i')` …), `assertUniqueIds`; WS8 rebase reads `sys-*`
RULE: `sys-sol`, `barnard-star` and friends are load-bearing: parents, barycentre members, orbits,
routes, constructs and the campaign rebase all key on them. They are also the SEED for each body's
inclination, argument, node and phase — so renaming an id silently moves the body in its orbit.
Never renumber; a rename is a deliberate, reviewed act, not tidying.
WHY: two duplicate-id pairs shipped for four months because nothing looked (D3) — `nodeById` is a
`.find()`, so the second node is simply unreachable and anything pointing at that id resolves to the
other one. The build now throws rather than de-duplicating, because a generator that quietly renames
a clash hides the next one exactly as well as silence did.
BLAST: any id change → expect element churn in the rebuilt map and check the pin-test diff is only
what you intended. Imported systems reuse a bundled id ONLY via the collision path (DATA-R4).

### DATA-R3 Inclinations are MUTUAL, never the catalogue's sky-plane value
BUCKET: DOMAIN - a published inclination is quoted against the SKY; a system's own plane is a
different frame, and the catalogue column is the wrong one. Move verbatim; any real-sky import in
any engine meets this.
WHERE: `src/lib/import/realsky/convert.mjs` (`mutualIncMax`), `data/systems-real.mjs` header
RULE: SSE's reference plane is the SYSTEM's own plane, so planets get a near-zero mutual inclination
(default spread 1.2°). Discovery papers quote inclination against the SKY, where a transiting system
reads ~90°. The two numbers are not interchangeable and the catalogue column is the wrong one.
WHY: importing the published value stands a transiting system on its edge — every TRAPPIST-1 planet
in a vertical line. Spotted in the old hand-built map by the owner before the rebuild.
BLAST: any new orbital-element source (Gaia, WDS, VizieR). Satellites are a separate question — see
`orbit.frame` and C3, which is about a moon's parent equator, not this.

### DATA-R24 A SKIP REASON NAMES THE CAUSE, and a class-typical figure is flagged as data
BUCKET: ARCHITECTURE + DOMAIN - architecture: a substituted figure carries its provenance as a
FIELD, not as prose, and a skip reason names WHICH cause. Domain: brown-dwarf radii really are
near-constant across L, T and Y because degeneracy sets them, so the identical number was honest and
the SILENCE was the fault.
WHERE: `convert.mjs` (`starNodeFromCensus`), `stars.mjs` (`starParamsFromType`), `types.ts`
(`CelestialBody.typicalForClass`), pinned by `substellarImport.spec.ts`
RULE: two halves of DATA-R4's honesty that were being lost on the way out.
  (1) When an import skips an object, the reason names WHICH cause. `no stellar parameters for this
      spectral type` was emitted both when the type was unusable AND when the rule pack simply was
      not loaded - so a whole import failing for a missing pack accused every object's spectral type.
  (2) `starParamsFromType` returns `typicalForClass: true` for figures taken from the pack's band,
      and the node must KEEP it. It was computed and dropped, so the only record that a mass or
      radius was class-typical rather than observed was prose in the description - which no numeric
      surface reads. Same convention as `ageEstimated` on the system.
WHY: B89. A user's two brown dwarfs carried the IDENTICAL radius, 80,006 km. That is the midpoint of
`radius_solar [0.08, 0.15]`, which `star/L`, `star/T` and `star/Y` all declare - and their masses are
their own bands' midpoints too. SIMBAD carries a spectral type and NO radius, so nothing was read and
dropped: the whole figure set is class-typical, and only the description said so.
NOT A PHYSICS BUG: brown-dwarf radii really are near-constant at about one Jupiter radius across L, T
and Y, because degeneracy pressure sets them rather than mass. Do not 'fix' the identical radius by
tuning the bands apart - the fault was the silence about where the number came from, not the number.
BLAST: an unresolved pair (`L7.5+T0.5`) is ONE catalogue row and imports as ONE body; the description
now names the companion it does not represent. Splitting it needs a mass ratio and separation the row
does not carry, so it stays unsplit rather than invented. If a real catalogue radius ever starts
arriving for these objects, it wins - and `typicalForClass` must not be set for it.

### DATA-R4 The importer never invents and never overwrites — and both must reach the user
BUCKET: ARCHITECTURE - an importer neither invents nor overwrites, and BOTH the skips and the
collisions must reach the user, or a silently short import reads as a complete survey.
WHERE: `convert.mjs` (`starNodeFromRow` skips, `BUNDLED_ARCHIVE_HOSTS` collisions), `RealSkyImportModal.svelte`
RULE: a host missing mass, radius or temperature is SKIPPED with a named reason rather than guessed
into existence, and a host is treated as a COLLISION only when the TARGET MAP already holds it —
under the id this import would mint, or under the bundled maps' stable id for the same star, which
callers supply via `existingSystemIds`. `convertArchiveRows` returns `{systems, collisions, skipped}`
and the caller must SHOW the last two; filtering them away to tidy the dialogue defeats the design.
WHY: a silently short import reads as a complete survey. And the first version got the collision test
wrong in the other direction — it skipped any host curated on a BUNDLED map whether or not the GM was
importing into one, so "Local Neighbourhood" into a new starmap imported ZERO systems and 16.5→18 ly
imported exactly one. Curation elsewhere is not a reason to withhold a star from a map that has none.
BLAST: any new consumer of `convertArchiveRows` — passing no `existingSystemIds` means "empty target",
which is right for a new map and wrong for an append. The host→bundled-id map is generated from the
roster, so it is only as current as the last kit run (D15).

### DATA-R5 The shared real-sky core must stay plain, dependency-free ESM
BUCKET: IMPLEMENTATION + ARCHITECTURE - durable: code shared by two runtimes must be written for the
POORER one, and a violation type-checks, bundles and passes every test on the richer one while
breaking the other.
WHERE: `src/lib/import/realsky/{constants,positions,stars,planets,convert,query,clusterGate}.mjs`
RULE: these files are imported by BOTH the Vite app and `scripts/starmap-build/build-starmaps.mjs`,
which runs under plain `node`. No TypeScript, no `$lib` alias, no Svelte imports — use relative
paths. App-only logic (`fillout.ts`, `stardefaults.ts`) is `.ts` and may use `$lib` freely.
WHY: a `$lib/…` import inside `convert.mjs` type-checks, bundles and passes every browser test while
breaking the build kit — and the kit is what regenerates the shipped maps, so the damage surfaces
later, as DATA-R1's failure mode.
BLAST: `node -e "import('./src/lib/import/realsky/convert.mjs')"` is the cheap check.

### DATA-R6 The Exoplanet Archive is ALWAYS CORS-blocked in a browser; the proxy is the live path
BUCKET: PLATFORM (browser CORS; a named external service) + ARCHITECTURE - the 'which source
answered' label must stay honest, because a stale offline snapshot must never read as live data. It
had been serving every browser import, silently.
WHERE: `src/routes/api/realsky-tap/+server.ts`, `src/lib/import/realsky/catalogue.mjs`
RULE: the archive's TAP endpoint sends no `Access-Control-Allow-Origin`, so a direct browser fetch
fails deterministically — SIMBAD does send it and works direct. `loadArchiveRows` tries direct (for
node, where CORS does not exist), then the same-origin proxy, then the bundled snapshot, and reports
which answered. The proxy forwards SELECT-on-`pscomppars` only; it is not an open proxy.
WHY: measured from the deployed origin after it looked like flaky availability. It was not
intermittent: every region import in the browser had been served by the offline snapshot, silently.
BLAST: adding Gaia or VizieR — check their CORS before assuming direct fetch works, and keep the
"which source answered" label honest, because a stale snapshot must never read as live data.

### DATA-R7 The archive's DENSITY is usually not evidence — it is the mass again, in disguise
BUCKET: DOMAIN + ARCHITECTURE - domain: above the giant threshold a high density means hydrogen
squeezed by self-gravity. Architecture, and this is the portable half: A CATALOGUE COLUMN CAN BE
COMPUTED FROM OTHER COLUMNS AND STILL LOOK INDEPENDENT - check provenance before treating it as
evidence.
WHERE: `src/lib/import/realsky/planets.mjs` (`defaultMakeup`, `estimateRadiusRe`); the `pl_dens` column
RULE: pscomppars BACK-FILLS `pl_rade` from `pl_bmasse` when no radius was measured, using essentially
the same Chen-Kipping relation `estimateRadiusRe` implements four lines above — 135 of the 182
committed cache rows reproduce it to within 1%, most to within 0.3%. `pl_dens` is then computed from
that pair (174 of the 179 rows carrying one reproduce exactly from the row's own mass and radius). So
for three quarters of the catalogue a density test is a MASS test wearing a density costume:
`pl_dens > 4` is true over 0.162–3.50 Me and false everywhere else below the giant threshold. Treat
`pl_dens` as evidence only once the radius is known to have been MEASURED, and never as a proxy for
"rocky" above the giant threshold, where a high density means hydrogen squeezed by self-gravity.
WHY: the density branch was tested before mass, so eps Ind A b — 6.5 Jupiter masses at 1.16 Jupiter
radii, a genuine 5.56 g/cc, all three figures correct — imported as 62% rock while the classifier,
reading the same mass and radius, called it a Super Jupiter (D17). The same circular number underlies
the uniform 55% ice every 4–40 Me planet receives (D7): the map cannot express a rocky super-Earth,
by construction, and no measurement in it disagrees.
BLAST: any new consumer of `pl_dens`, and any second catalogue — computed/back-filled columns are a
convention of these archives, not an accident of this one, so check provenance before trusting a
column that looks independent. `estimateRadiusRe` is currently DEAD for both bundled maps for the
same reason: every row already carries a `pl_rade`, so the fallback never fires.

### DATA-R8 NEVER CONCLUDE ANYTHING ABOUT A BODY FROM A FIELD YOU READ DIRECTLY — find who reads it
BUCKET: ARCHITECTURE + IMPLEMENTATION - durable and first-order for any engine with a load-path
strip and derive-on-absence accessors: A STORED FIELD IS NOT WHAT THE APP SEES. Also the map's best
lesson about ITSELF - a rule named after the field it was learned from only catches that field; name
it after the MISTAKE.
THE CUE, and it is the whole point of this entry: **you are about to say "field X is unset / wrong /
contradictory" on the strength of having read X out of a JSON file or off a node.** Stop there. Ask
who READS X in the running app. If the answer is "an accessor that derives X when it is missing", or
"nobody, the load path deletes it first", then what you measured is not what the app sees and the
conclusion is wrong — not approximately, but backwards.

AMENDED BY B82 (v2.1.851): STEP (1) WAS UNSAFE IN THE OTHER DIRECTION TOO. `DERIVED_FIELDS` had
drifted eight releases behind the engine, so "is it in the strip list?" answered NO for sixteen
fields the processor writes — a reader checking the list would have concluded the stored value was
authored and trusted it. Measured, not read: `orbitalRadiation`, `irradiationDose`, `volatiles`,
`surfaceSpectrum`, `vegetation`, `beltInnerEdgeRadii`, `auroraEmitters`, `flareActivity`, the three
`resonance*`, `starTidallyLocked`, `orbitalStability(+Details)`, `magneticField` and `tidallyLocked`,
plus the whole `hazard/*` tag namespace. All now stripped or declared. **The list is no longer the
authority — `derivedFieldDrift.spec.ts` is.** It diffs a body's key set across `process()`, both
added keys AND overwritten ones, and fails on anything neither stripped nor declared in
`NOT_STRIPPED` with a reason. So step (1) is now: read that test's two lists, not the strip list
alone, and if a field is in neither the test is already red.
AND THE CONVERSE BIT: three fields are derived for MOST bodies and authored for some, which no flat
list can express — a star's `magneticField` (never re-derived, so stripping it zeroes every star),
a GM's manual field or manual tidal lock, and `rotation_period_hours`, which the engine rewrites for
a locked body but which is INPUT for a spin-orbit resonance. Stripping that last one cost Mercury
its real 1407.6 h day and reclassified it `planet/terrestrial` -> `planet/hot-eyeball`. B82
recommended stripping it; the measurement said no.
THE TEST, in order: (1) does the load path STRIP this field (`DERIVED_FIELDS` in `importFixup.ts`)?
(2) is there an ACCESSOR — `makeupFractions(body)`, not `body.makeup` — that derives it when absent?
(3) only if both are no, is the stored value the answer.

THIS ENTRY EXISTS IN THIS FORM BECAUSE ITS FIRST FORM FAILED. It was written after the `classes`
case, titled and scoped around `classes`, and filed here in the DATA (import) section — so when the
same worker hit the identical fault ONE DAY LATER on `makeup`, none of that matched what they were
looking at, and they shipped a wrong finding and had to retract it (v2.1.532). A rule named after the
field it was learned from only catches that field. It is named after the MISTAKE now, and the two
instances are demoted to examples. There are pointer comments at `makeupFractions` and at
`DERIVED_FIELDS` for anyone who never reaches this file at all.

EXAMPLE 1 — a stored `classes` array is a FOSSIL.
WHERE: `src/lib/system/importFixup.ts` (`stripBody`, the `autoClassify` branch);
`src/lib/system/classification.ts` (`classifyByFingerprint`)
RULE: `fixUpImportedSystem` sets `body.classes = []` for every body EXCEPT one pinned with
`autoClassify: false`, and the processor re-derives from scratch. So the `classes` array sitting in
`static/example-starmaps/**` and `static/examples/**` records what some earlier build believed, not
what the app shows today — and the same goes for every other name in `DERIVED_FIELDS`. An audit of
classification MUST run the real load path (`systemProcessor.process(fixUpImportedSystem(sys, pack), pack)`),
because reading the file answers a different question. The one exception is a body pinned with
`autoClassify: false`, which really does keep what it was authored with.
WHY: D11 reported four bodies carrying a rocky AND a giant base class at once (`planet/desert +
planet/cloudless-gas-giant`, `planet/ice + planet/ice-giant`, …) and offered two candidate causes.
Measured on loaded data, all four contradictions turned out not to exist — the pairs are stale strings
the load path deletes, and Iota Horologii b loads as `planet/super-jupiter` alone. Both candidate
causes were also wrong: `classifyByFingerprint` takes `[0]` of the sorted bases and then appends only
`kind === 'modifier'`, so it cannot emit two bases at all.
EXAMPLE 2 — a stored FIELD where the app calls an ACCESSOR that derives when it is absent.
`body.makeup` is empty on 107 of the 226 non-star
bundled bodies including Jupiter — and it does not matter, because every consumer calls
`makeupFractions(body)` (`physics/makeup.ts`), which infers a composition from mass and radius when
the field is missing and returns gas 0.80 for all four Sol giants. An audit of `n.makeup?.gas ?? 0`
concluded the giant test was dead for Jupiter; through the accessor it is true for every giant. Before
concluding a field is unset, check whether anything reads it directly at all.
BLAST: any audit of `classes` or `image`. (The second answer to "which classes are mutually
exclusive" — a hand-maintained `baseArchetypes` Set in the legacy rules path listing ~17 of the
rulepack's 64 `kind: 'base'` fingerprints — is GONE with that path, v2.1.890-beta / B67.)

### DATA-R18 A BAND is a range to draw from; a DESIGNATION is what a star IS. Bodies hold designations
BUCKET: DOMAIN + ARCHITECTURE - domain: a BAND is a range to draw from and a DESIGNATION is what an
object turned out to be, and a designation is COMPUTED from position so there is nothing to author.
Architecture: one string is the template, the picker entry, the description key and the class.
WHERE: `physics/starDesignation` (`starClassKeyFor`, `isBandKey`, `bandKeyOf`); the pack's
`statTemplates`; `system/importFixup.resolveLegacyStarClass`.
RULE: the pack keeps BANDS — `star/G`, `star/K-III` — and a pick chooses one. A BODY holds the
designation the draw produced: `star/G2V`, `star/M6V`, and for an imported star its own catalogue
type, `star/M1.5Iab`. No body may hold a bare letter; owner, 2026-08-16: *"O is dead, O1a is valid."*
A GIANT KEEPS ITS BAND KEY and that is not an exception: the subclass ladder is main-sequence, so
`star/K-III` states everything that can honestly be said, and `K III` is exactly how it reads.
WHY: a bare letter as a body's class was two claims in one string — the range it came from and what
it turned out to be — so every G dwarf a GM placed was the same star, and the engine could not say
what any of them was. Splitting the two is what let the full designation space in without a 700-key
pack (B46b's grid trap): a designation is COMPUTED from position, so there is nothing to author.
BLAST: any lookup keyed on `classes[0]` must resolve through `bandKeyOf` — stat template, class
portrait and the editor's dropdown all do, and a supergiant that resolves by LETTER alone gets the
red dwarf's band and the red dwarf's picture (D19 by another route). `bandKeyOf` folds II up to I and
IV down to V through the importer's own `LUMINOSITY_BAND`, because the pack states three positional
bands per letter and not seven. The load path migrates saved files; an AUTHORED star keeps its letter
and gains only the digit, on the same `autoClassify` test `SystemProcessor` uses to decide whose data
a class is.

### DATA-R10 A star's class is (LETTER, LUMINOSITY CLASS). The letter alone determines nothing but colour
BUCKET: DOMAIN + ARCHITECTURE - domain: an M dwarf and an M supergiant share a temperature and share
NOTHING ELSE; and the catalogue's own notation is full of traps (a companion after '+', a lowercase
'd' that is not a white dwarf, '+V' meaning 'or later'). Architecture: parse ONCE at the boundary
into a structured field.
WHERE: `src/lib/import/realsky/stars.mjs` (`parseStellarType`, `starClasses`, `starParamsFromType`),
`static/rulepacks/starter-sf/stars.json` (`statTemplates`), `CelestialBody.stellarType`.
RULE: an M dwarf and an M supergiant share a temperature and share NOTHING ELSE. Mass, radius and
luminosity come from the letter AND the luminosity class together, which is why the pack key names
both — `star/M-I`, not `star/M`. Parse the class ONCE, at import, into the structured `stellarType`;
never re-read the MK string at a use site.
WHY: D19. Antares (`M1.5Iab+B2Vn`) imported at 0.265 Msun against a real ~12-15, 1.24e-2 Lsun against
~75,000, and 0.4 Rsun against ~680 — mass out ~50x, luminosity ~6 million, radius ~1,800. It lands on
exactly the stars a user will check, because bright stars are overwhelmingly NOT main sequence.
BLAST: **THREE TRAPS, ALL OF WHICH BITE SILENTLY.**
(a) **ORDER.** `starClasses` returns `[star/<letter>, star/<full MK string>]` — LETTER FIRST. So
`classes.map(...).find(Boolean)` matches the letter on element 0 and never reaches anything behind
it. A luminosity lookup inserted AFTER that find does nothing at all and looks like it works. It has
to go first.
(b) **THE COMPANION MUST BE SPLIT OFF BEFORE THE CLASS SCAN.** `M1.5Iab+B2Vn` read left to right
gives `V` from the companion and turns the supergiant back into a dwarf — the original bug, exactly.
And `+` is not always a companion: SIMBAD's `M2+V` for Lalande 21185 means "M2 or later, V".
(c) **CASE.** The white-dwarf test was `/^D/i`, and SIMBAD writes a LOWERCASE `d` prefix for an
ordinary dwarf. `dM6` (Wolf 359), `dM4` (Ross 128), `dM3` (AD Leo) were all classified `star/WD` —
four stars inside 16.5 ly imported as white dwarfs. An uppercase D is a white dwarf; a lowercase d is
a class-V marker. Never fold case on a spectral type.
ALSO: `starParamsFromType` has a SECOND caller inside `convertRegion` that feeds star mass to
`groupIntoSystems`, so changing a mass band can MERGE two map systems. Re-measure the system count
across a fixed set of census rows before and after — it was unchanged here (55 / 159 / 716 systems at
16.5 / 25 / 41 ly), but that was measured, not assumed.

### DATA-R15 TWO GENERATORS SHARING AN ID NAMESPACE WILL COLLIDE, AND IT FAILS SILENTLY
BUCKET: ARCHITECTURE - two id rules over one namespace must be UNABLE to collide, not merely
unlikely to. Nothing errors: one node wins, the other's relationships resolve to it, and the map
looks plausible and is quietly rearranged.
WHERE: `src/lib/import/realsky/convert.mjs` — the star id and the planet id.
RULE: if two different KINDS of node are given ids by two different rules, the rules must be unable
to produce the same string. Not unlikely to — UNABLE to.
WHY: companion stars were numbered by POSITION (`<slug>-b`, `<slug>-c`) and planets by their
catalogue LETTER (`<slug>-b`). **Proxima Cen b and Alpha Cen B are the same id**, so the most
recognisable system in the catalogue imported wrong.
BLAST: **NOTHING ERRORS.** A duplicate id throws nowhere. The processor's lookups are keyed by id, so
one of the two simply wins and the other's relationships resolve to the wrong node: measured, the
planet came out of `process()` re-parented onto the PRIMARY, 10,400 AU from the star it orbits, while
the companion was shunted into an auto-barycentre. The map looks plausible and is wrong. This is the
failure mode to fear from an id scheme — not a crash, a quietly rearranged system.
FIX SHAPE: make the collision impossible by construction (`<slug>-star-b` cannot be a planet letter),
then add a uniqueness assertion over a REAL import rather than a fixture — the fault only appears
when a multi-star group also has planets, which no hand-built fixture had. Keep a defensive
uniquifier that REPORTS: silently renaming would hide the next one.
ALSO: the primary keeps `<slug>-star`, so every `parentId` and `orbit.hostId` built from it is
unchanged — renaming the primary would have been a far larger change for no gain.

### PHY-17 A LUMINOSITY CLASS IS RADIUS AT A TEMPERATURE, never brightness
BUCKET: DOMAIN + ARCHITECTURE - domain: a luminosity class is RADIUS AT A TEMPERATURE, and
brightness alone can never tell you a B0V is a dwarf. Architecture, and this is the shape to copy:
THE CLASSIFIER TESTS THE SAME BANDS THE GENERATOR DRAWS FROM, so 'pick X, get X back' is structural
rather than hoped for.
WHERE: `system/starBandMatch.ts` (`matchStarBand`, `luminosityClassFromPosition`), consumed by
`classifyStar` when a pack is passed; pinned by `starBandMatch.spec.ts` and
`physics/starClassification.reference.spec.ts`.
RULE: classify a star by its POSITION against the pack's own bands — radius at a given temperature —
not by how luminous it is. That makes classification the exact INVERSE of generation: the same bands
the generator draws from are the ones the classifier tests, so "pick X, get X back" is structural
rather than hoped for. Radius comes from the pair already present: `R = sqrt(L) / (T/Tsun)^2`.
WHY: `classifyStar` cut on ABSOLUTE luminosity (`logL > 4` supergiant, `> 1.5` giant) and got FIVE OF
TEN published reference stars wrong — Vega came back "III Giant", B1V and O5V "I Blue Supergiant".
The fault is conceptual, not a bad threshold: **a B0V genuinely IS 10^4.5 Lsun, so brightness alone
can never tell you it is a dwarf.** What separates a K dwarf from a K giant is 40x in radius at the
same temperature, which is what surface gravity — and therefore a luminosity class — actually means.
BLAST: **THE CHEAP FIX WAS MEASURED AND DOES NOT WORK, so do not retry it.** Making the test relative
to a main-sequence line needs a ZAMS proxy, and of the two candidates the linear-in-logT line breaks
Proxima into a false subdwarf while the mass-luminosity relation collapses Rigel and Betelgeuse below
any threshold that keeps Vega on the main sequence. The failure modes sit at opposite ends of the
sequence; no single relative threshold classifies all ten. **The `pack` argument is OPTIONAL and the
legacy cuts still run without it** — every caller that can pass a pack should, and the reference
fixture asserts BOTH paths so the difference is provably the pack and nothing else.

### PHY-14 A REMNANT'S MASS AND ITS PROGENITOR'S ARE TWO FRAMES, AND ONE PARAMETER CARRIED BOTH
BUCKET: DOMAIN - present state (T, L, R, M) is a POSITION; (initial mass, age) is a TRACK; a
remnant's identity lives on the track and cannot be read off the position. Move verbatim - an
evolution engine meets this on day one.
WHERE: `physics/stellar-evolution.ts` — `classifyStar`'s remnant branch and `deriveStarFromHR`;
pinned by `starClassification.reference.spec.ts`.
RULE: `massKg` is the object's OWN mass, always. A remnant's IDENTITY is a fact about the star it
came from, so it is decided by `progenitorMassKg` when that survived generation — thresholds ~8
solar (supernova to a neutron star) and ~25 (collapse to a black hole). With no progenitor recorded,
fall back to the REMNANT limits: Chandrasekhar ~1.4 and Tolman-Oppenheimer-Volkoff ~2.2-3, which are
real physics and agree with the pack's own bands (WD 0.6..1.4, NS 1.4..2.2, BH 3..100).
WHY: the remnant branch tested the object's `massKg` against PROGENITOR thresholds. It was correct
for its only caller — `deriveStarFromHR` passes the progenitor mass as `massKg` — and wrong for the
reading every other caller would make. **Measured: hand it the pack's own `star/NS` band midpoint of
1.80 solar and it returns WHITE DWARF, because a real neutron star (1.4-2.2) can never satisfy
`> 8`.** `star/BH` passed only because its band midpoint happens to be 51.5.
BLAST: **this is the frame error the owner named — *"the HR surface alone can't do stellar remnants
as that requires star type + TIME"*.** Present state (T, L, R, M) is a POSITION; (initial mass, age)
is a TRACK; a remnant's identity lives on the track and cannot be read off the position. **Anything
that generates a remnant must carry the progenitor mass forward, or the round-trip fails for every
one of them.** The signatures already took the inputs; only the branch read the wrong one.

### PHY-15 THREE THINGS A BODY RADIATES, ONE SOURCE FIELD EACH — never conflate them
BUCKET: DOMAIN + ARCHITECTURE - domain: three independent radiative mechanisms, one source quantity
each, and A GAS GIANT IS A RADIATION SOURCE WITH ZERO LUMINOSITY. Architecture: one source FIELD is
not one source SET; and before fixing a physics branch, check that something READS its output.
WHERE: `radiationOutput` on a star; `physics/radiation.ts` (`calculateTotalStellarRadiation`,
`photonParticleSplit`, `beltParticleFlux`); `physics/ionisingOutput.ts`; `flareActivity` +
`overrides.flareActivity`.
RULE: a body irradiates its neighbours by THREE independent mechanisms, and each has exactly one
source quantity. Reading one where another is meant is the recurring fault here.

  1. **BOLOMETRIC LUMINOSITY** — `radiationOutput`, in L(sun). DERIVED from radius and temperature
     (`L = 4piR^2 sigma T^4`, exact) for every thermal emitter; a BAND states it only for the four
     non-thermal classes whose output is accretion- or magnetosphere-driven (`BH`, `BH_active`, `NS`,
     `magnetar`). Flux is `radiationOutput / d^2` and there is ONE function that sums it.
  2. **IONISING OUTPUT** — `L_bol x (L_X/L_bol)`, where the FRACTION is the magnetic dynamo's, not
     the star's size. Driven by `flareActivity` (class and age), spans 1e-7 (quiet Sun) to 1e-3
     (saturation, an observed ceiling). **This is why a flare barely changes brightness and changes
     ionising output a thousandfold**, and why the two have separate controls with a lock between.
  3. **TRAPPED-PARTICLE BELTS** — a magnetised, rotating host bombarding a close moon. The source is
     the host's FIELD STRENGTH and SPIN PERIOD, and NOT luminosity at all. **A gas giant is a
     radiation source with zero luminosity** — Io is not lit by Jupiter, it is bombarded by it.

WHY: three separate faults, all from conflating these. `radiation_output` was a free band that drifted
60,000x from the radius and temperature beside it (B57). The star editor labelled bolometric
luminosity "Ionising Radiation Level", so the only lever for "make this star dangerous" also made it
brighter — and taking a red giant up in it produced a contradiction complaint instead of a flare.
And the flare tag was once gated on LUMINOSITY, which is backwards: a luminous O star is not
especially flare-prone and an M dwarf, which is, is feeble.
BLAST: **one source field is not the same as one source SET, and that is the trap that survived
longest.** Two copies of `radiationOutput / d^2` existed, agreeing on the formula and disagreeing on
who counts: `isLuminousSource` (stars AND self-luminous brown dwarfs) against `roleHint === 'star'`.
A moon of a brown dwarf was irradiated for its temperature and radiation, and not for its
atmosphere-retention check. Deleted; `calculateTotalStellarRadiation` owns the set as well as the sum.
**CORRECTED 2026-08-16 — the "atmosphere retention reads starlight only" note above was WRONG, and
the way it was wrong is worth keeping.** That check computed `retainsAtmosphere` and NOTHING READ THE
RESULT: dead since the real model landed. It was convincing enough that the belt term was added to it
before anyone noticed the variable was unused — a fix to a dead branch, which would have looked like
progress and changed nothing. Deleted. **The live model is `physics/atmosphere.ts`** (Jeans escape
plus XUV and wind erosion, scaled by magnetic shielding), and that is where belt bombardment belongs
if it is ever modelled as a stripping term. **The lesson generalises: before fixing a physics branch,
check that something reads its output.**

### PHY-16 An ageing profile is keyed on MASS, never on the star's TYPE
BUCKET: DOMAIN + ARCHITECTURE - domain: a star does not evolve as it does BECAUSE it is a G dwarf;
it is a G dwarf because of the mass that also sets how it evolves. Architecture: ageing PRODUCES
state, classification READS state, nothing reads the class back out. First-order for an evolution
engine.
WHERE: the [[B48]] star-classification workstream; `docs/dev/type-vocabulary-prev4.md` section 9.4.
The pattern it protects is PHY-1's corollary — a derived CLASS is never a physics input.
RULE: **ageing PRODUCES state (T, L, mass, radius); classification READS state; nothing reads the
class back out.** An ageing profile is selected by the star's MASS, never by `body.classes`, and
classification may not consult anything ageing wrote downstream of it.
WHY: **THE REQUIREMENT'S OWN WORDING POINTS THE WRONG WAY, WHICH IS THE ONLY REASON THIS ENTRY
EXISTS.** The owner's form is *"each star has an ageing profile"*, which reads naturally as
profile-keyed-by-TYPE — and that closes the loop. The physics says otherwise and resolves it: a star
does not evolve as it does BECAUSE it is a G dwarf; it is a G dwarf because of the mass that also
sets how it evolves. Mass is upstream of both, so keying on it is both correct and one-way.
The same class-from-class direction is already the fault in three shipped places — `starCategory =
categoryForClass(classes[0])` ([[B51]]), `stardefaults.ts:27` reading `classes[0] ?? 'star/M'`
([[B49]]) and mk-lum 6.4 — so it is a habit, not a slip.
BLAST: rolling ageing into classification puts the two in one room. If the loop closes,
`src/lib/system/idempotence.test.ts` is the only thing that will tell you, and it will tell you late.
Settle the direction before writing code, not after.

### PHY-28 "Has ground" is `hasSolidSurface`, and it is the ONLY one of the four gas-threshold questions with a predicate
BUCKET: DOMAIN + ARCHITECTURE - domain: 'has ground', 'is a giant', 'draws as a giant' and 'has a
surface to rust' are FOUR questions sharing one boundary; and a dense star infers as rocky, so 103
of 141 stars passed the bare test. Architecture: one predicate turns a coincidence into a guarantee.
WHERE: `physics/makeup.hasSolidSurface` / `makeupHasSolidSurface` / `SOLID_SURFACE_MAX_GAS`
RULE: every site that asks "is there somewhere to stand" calls the helper — the habitability gate, the
geology/volatiles/cryo/ascent branches, the classifier feature zeroing, the cloud saturation floor, the
radiation place label, and the rule DSL via the `hasSolidSurface` FEATURE. A caller holding a bare
`Makeup` with no node uses `makeupHasSolidSurface`; that is the only other entry point, and
`hasSolidSurface` is defined in terms of it, so one comparison against 0.5 exists in the codebase.
It lives in `makeup.ts` beside `rendersAsGiant` deliberately: M1 records that those two can disagree
about an ice giant, and a reader comparing them needs both on one screen. It used to live in
`physics/radiation.ts`, which made the cloud model and the body editor import the RADIATION module to
ask a composition question.
WHY: B36 — nine inline copies of `makeupFractions(x).gas <= 0.5`, agreeing only by luck. The version
B11 replaced had been silently wrong for months. THE STAR EXCLUSION IS THE PART THAT MATTERS: a dense
star infers as ROCKY, so measured across every bundled map and example, **103 of 141 stars passed the
bare inline test as having solid ground** — including Sirius B and Proxima. None of them reaches those
gates today, because each caller happens to check `roleHint` first. The helper turns that coincidence
into a guarantee. Sol never showed it because the Sun is low-density enough to infer as a giant, which
is why the derived baseline is byte-identical and proves nothing on its own.
BLAST: **read M2 before adding a caller.** `makeup.gas` against 0.5 answers at least four questions —
*has ground*, *is a giant*, *draws as a giant*, *has a surface to rust*. They share a boundary; they
are not one question in four spellings. B36 closed the has-ground list ONLY; the other three are still
inline on purpose. Do not route them here on the strength of the shared constant, and never substitute
`isGiant` for this (different boundary, and B33 records what happens when the two are confused).

### DATA-R17 ONE spelling of "what is this star class", and 'B' is why it must be a SHAPE
BUCKET: ARCHITECTURE + DOMAIN - architecture: resolve EXACT first, then by SHAPE, and returning
undefined is a real answer. A LATENT FALLBACK FAULT PRODUCES NO DIFF, which is exactly why nobody
finds it by looking at output. Domain: 'B' begins both a spectral class and a black hole.
WHERE: `src/lib/system/starImage.ts` — `spectralLetterOf`, `resolveStarImage`; pinned by
`starImage.spec.ts`. Callers: `BodyStarTab.updateImage`, `generation/star.ts` (both the portrait and
the base-class derivation), `generation/generateFromConfig.ts`.
RULE: a star class key resolves EXACT FIRST, then its spectral letter, then nothing. Returning
undefined is a real answer — a remnant with no portrait of its own gets NO picture rather than a
misleading one. The letter is extracted by the DATA-R13 shape test and never by taking `[0]`.
WHY: the lookup existed three times and disagreed everywhere except the exact hit, so the drift sat
in the fallback that no test walks (UI-C3's lesson, different table). The editor missed subtype keys
entirely (`star/G5V` matched nothing, so it set no portrait while the generator resolved `star/G`);
`generateFromConfig` indexed `split('/')[1][0]` unguarded and THREW on any class with no slash.
**AND THE OBVIOUS FIX IS THE TRAP: 'B' begins "BH" and is also a real spectral class**, so
"first character in OBAFGKMLTY" maps `star/BH` onto `star/B` and pictures a black hole as a hot blue
star. DATA-R13 counts three shipped bugs from that one letter; this would have been the fourth.
BLAST: **no fixture moved when this landed, and that is the point to carry forward** — every remnant
has its own pack key, so the exact hit always won and the fault was one pack edit away rather than
live. A latent fallback fault produces no diff, which is exactly why nobody found it by looking at
output. Deleting a pack key is the move that would have exposed it.

### DATA-R13 A LIST OF EXCEPTIONS GOES STALE; A TEST FOR THE PROPERTY DOES NOT
BUCKET: ARCHITECTURE - a list of exceptions goes stale and a test for the PROPERTY does not;
categorise from the parsed SHAPE, never from membership. A hardcoded exclusion list is correct only
until someone adds a class, and nothing tells them the list exists.
WHERE: `generation/star.ts` (the base-spectral-class derivation and `starCategory`),
`physics/stellar-evolution.ts` (`flareActivity`).
RULE: when the question is "does this class have a spectral letter", ask THAT, rather than keeping a
list of the classes that do not. A hardcoded exclusion list is correct only until someone adds a
class, and nothing tells them the list exists.
WHY: B46a. `star.ts` built a body's class array as `[star/<first letter>, <class>]` unless the class
appeared in `['star/red-giant', 'star/brown-dwarf', 'star/sub-brown-dwarf', 'star/magnetar']` — a
list that never mentioned WD, NS, BH or BH_active. Measured over 2,000 generated stars: **1.8%
carried a class `star/W`, 0.5% `star/N`, and a feeding black hole carried `star/B`.** None of those
three classes exists anywhere in the engine.
BLAST: **`B` IS THE THIRD COLLISION OF THE SAME LETTER, AND IT IS WORTH RECOGNISING ON SIGHT.** 'B'
begins "BH" and is also a real spectral class. It has now caused: a quiescent black hole drawing a
B-star flare rate (`/[WNB]/` minus the spectral letters cancelled itself); a fabricated `star/B`
class on every generated feeding hole; and a prefix test that matched `star/BH_active` as a B star
while extracting a base letter. **A LETTER IS NOT A TYPE.** Test the whole name, or test a SHAPE —
`/^star\/([OBAFGKMLTY])(?:\d|-(?:I|III)$|$)/` says "a spectral letter followed by something that
continues a spectral type", which `star/BH_active` fails and `star/M-III` passes.
ALSO: the same file categorised `star/red-giant` as `main_sequence_star`, which it is by definition
not, and gave `star/M-III` no category at all because it matched no list. Categorise from the parsed
shape, not from membership.

### DATA-R16 A PACK'S `liquids.json` IS AN OPTIONAL OVERRIDE, AND ITS 404 IS THE DESIGN WORKING
BUCKET: ARCHITECTURE + IMPLEMENTATION - durable: an absence deliberately tolerated must SAY it is
deliberate somewhere a reader of the SYMPTOM will look; and shipping an empty override to silence
the noise SETS an override, which is worse than the noise.
WHERE: `src/lib/rulepack-loader.ts:73-79`, `src/lib/constants.ts:36-41`, `src/lib/data/liquids.json`.
RULE: the solvent definitions are a BUILT-IN engine default, `import`ed at build time from
`src/lib/data/liquids.json`. They are never fetched and cannot go missing. The loader's separate
`fetch` for a pack-level `liquids.json` is a speculative probe for an OVERRIDE that most packs do
not ship; it is already inside a `try/catch` and a miss is normal. **Do not "fix" the 404, and do
not make the pack ship a no-op override** — `mainPack.liquids = {}` SETS an override rather than
leaving the default, which is worse than the noise.
WHY: D20 was raised as a FIX-NOW bug reading "the file does not exist and 5+ loaders ask for it".
Every part of that was wrong: the file exists, the loaders are test harnesses and all of them are
`existsSync`-guarded, and the one real fetch is deliberately optional with a comment saying so.
The console line is the browser logging a failed request — `try/catch` cannot suppress it, so it
will keep reappearing in diagnostic bundles and keep looking like breakage to whoever reads one.
BLAST: any future "clean up the console" pass. The honest fix, if it is ever worth doing, is to
have a pack DECLARE its files in the manifest so nothing speculative is fetched at all — which is
a schema change, not a loader tweak. Same shape as PHY-9: **an absence deliberately tolerated is
not a fault, but it must SAY it is deliberate somewhere a reader of the symptom will look.**

### DATA-R21 A CLASS TEST ANCHORED AT THE END SILENTLY EXCLUDES EVERY SUBTYPE
BUCKET: ARCHITECTURE + DOMAIN - anchor a match on a hierarchical vocabulary at the START. Real
members carry subtypes, and the bare form is the one nothing actually holds.
WHERE: `physics/starPlausibility.starImplausibilities` (`isSubstellar`), and anything else matching a
class name with a regex.
RULE: anchor a class test at the START — `/^star\/[LTY]/` — never at the end. Classes carry a SUBTYPE
in real data (`star/L7.5`, `star/T6`, `star/Y4`, `star/M8.5V`) and `classes[0]` is the subtyped one;
the bare `star/T` is `classes[1]`.
WHY: `/star\/(L|T|Y)$/` required the name to stop at the letter, so it matched none of the brown
dwarfs in the bundled map. Every one of them was then told it was "a brown dwarf rather than an L7.5
star" — the fault the owner reported as "undermassed brown dwarfs, so they are either defined wrong or
we are tagging wrong". The bands were also wrong (B74), but fixing them alone would have changed
nothing: this law does not read the bands.
BLAST: the sibling `isRemnant` on the next line is UNANCHORED and so was never affected — two tests
one line apart, written to different rules. Check both when either changes.

### DATA-R22 A BROWN DWARF HAS ONE DEFINITION, REACHABLE FROM BOTH ROLES
BUCKET: DOMAIN + ARCHITECTURE - domain: the star/planet boundary for a brown dwarf is genuinely
DISPUTED and some definitions go by formation, so every PHYSICAL quantity keys on mass and none on
role. Architecture: one object reachable down two paths must be identical either way; PRESENTATION
is the only permitted difference.
WHERE: `physics/substellar.ts`, `physics/luminosity.ts`, `cloudDecks.spaceWeathering`, the
`star/L,T,Y` bands in `rulepacks/*/stars.json`, the `planet/*-dwarf` fingerprints in
`classification.json`.
RULE: a brown dwarf may legitimately be filed as EITHER a star or a planet — the boundary is disputed
and some definitions go by formation rather than mass — so every PHYSICAL quantity must key on mass
and none on role. Presentation is the only thing allowed to differ.
WHY: two definitions of one object is this codebase's most recurring fault, and a brown dwarf is the
one thing that can arrive down either path. Pinned by `brownDwarfDualRole.spec.ts`, which files a
35-M_Jup object at 1300 K both ways and requires Teff, luminosity and weathering to be identical.
BLAST: mass bands are GENERATION bands as well as match bands in `statTemplates` (stars have no
match/range split, planets do), so widening one widens the other. That is correct here — a brown
dwarf's type genuinely does not follow from its mass — but it is not correct in general.
BLAST: the PLANET side stops at ~20 M_Jup (6,400 M_E), the ceiling core accretion can build to.
Heavier companions are `star/L,T,Y` however they are filed. Do not widen it back to the hydrogen
limit: that would make the planet side claim objects that cannot have formed as planets.

### DATA-R28 A MOMENTARY EVENT CANNOT DRIVE A LASTING MODE WITHOUT A LATCH AND A NAMED WAY OUT
BUCKET: ARCHITECTURE + PLATFORM (Svelte reactive-block self-invalidation) - durable: a MOMENTARY
event driving a LASTING mode needs a latch and a NAMED way out, and prefer a release the reader
performs to an invented interval nobody can defend.
WHERE: `player/clockOwnership.ts` (`gmClockTouched`, `gmHoldsClock`, `canReclaim`) and the latch
beside `gmTime` in `routes/catalogue/+page.svelte`.
RULE: when a rule reads "X takes the controls" and X is INSTANTANEOUS, the rule is incomplete. State
the latch that remembers X happened AND the condition that releases it - and prefer a release the
reader performs to one on a timer, because an invented interval is a number nobody can defend.
WHY: "any GM clock activity disables the player's time controls" plus "a stationary GM clock frees
them" is unambiguous while a clock RUNS and a flicker for a single drag: the controls vanish and
return within one frame, because a scrub ends with a still clock. Three releases were put to the
owner - a quiet period, the player takes it back, snap-without-locking - and he chose the second.
See `docs/dev/player-clock-ownership-design.md` section 10 for the whole rule as a table.
BLAST: the detector needs the PREVIOUS heartbeat, so it cannot live in a `$:` block that also stores
that heartbeat - the assignment invalidates the block's own dependency and it re-runs itself. It
belongs at the single point the value is assigned.
BLAST: two cases must NOT count as activity, and both are load-bearing: the first heartbeat of a
session (no predecessor, and counting it would lock out every player the moment a GM connected) and a
repeat of an identical heartbeat (the beat is periodic; the lock would never lift).
BLAST: `gmTime` is never cleared when a GM disconnects, so the latch survives them leaving. That is
survivable ONLY because the release is a button. A timer-based release would have hidden it.

### DATA-R29 A STORED ORBIT DESCRIBES A SHIP ONLY IF IT CARRIES THE PHASE AS WELL AS THE RADIUS
BUCKET: DOMAIN + ARCHITECTURE - domain: a circle is not an orbit without a PHASE, and elements must
be derived in the frame they will be READ in. Architecture: when one thing is described twice,
derive the second FROM the first at a known instant, rather than again from the same inputs.
WHERE: `transit/scheduler.reconcileConstructArrival`, `physics/orbits.circularElementsAtState`,
`transit/scheduler.samplePostJourneyState`.
RULE: when one thing is described twice - here by the journey sampler, which the GM draws from, and
by the elements on the node, which is all a player has - the second description must REPRODUCE the
first, not merely resemble it. Derive it FROM the first at a known instant rather than deriving it
again from the same inputs.
WHY: the heal wrote a radius and kept whatever `M0_rad`/`i_deg`/`Omega_deg` the ship was authored
with, so the two agreed about the circle and disagreed about where on it the ship was - measured at
12,951 km on a 6,536 km orbit, very nearly a diameter. It stayed invisible while a stamped vector
overrode the orbit on both sides, and would have appeared the instant that vector was dropped.
Now: ask the sampler where it puts the ship at the arrival instant, and store the circular orbit
through that state. Measured agreement 0.0 km at arrival, +1 h, +1 day and +1 year.
BLAST: the elements must be derived IN THE FRAME THEY WILL BE READ IN. A satellite's are quoted in
its parent's EQUATORIAL frame (C3/C9, `system/satelliteFrame.ts`), and `computeWorldPositions3D`
rotates every propagated offset by the parent's axial tilt on the way out. Deriving in the system
plane and storing without the inverse rotation came out 23.44 degrees wrong around Earth - the
planet's tilt exactly, and a 1,163 km miss.
BLAST: the radius must come from the sampler too, not from a second `parkingOrbitRadiusKm` call -
and note that `getOrbitOptions` reads the `system` argument, so omitting it derives a DIFFERENT
orbit from the one the sampler parks at. Two answers to one question is the [[B92]] fault again.
BLAST: a MASSLESS construct is propagated at its epoch forever (`worldPositions`, `isStationary`),
so any fixture without `physical_parameters.massKg` has a ship that never moves - and every phase
check then passes for the wrong reason. It cost an afternoon here.

### DATA-R30 A REPAIR THAT ONLY CHECKS THE HOST CANNOT SEE A CHANGE OF ORBIT
BUCKET: ARCHITECTURE - an idempotence test must compare EVERYTHING THE OPERATION WRITES; a subset
makes it a no-op for exactly the cases where the rest of the state is what changed. And widening a
self-heal needs a second guard, or 'heal on sight' becomes 'overwrite on sight'.
WHERE: `transit/scheduler.reconcileConstructArrival`, the idempotence test.
RULE: an idempotence test must compare everything the operation WRITES. Comparing a subset makes it
a no-op for exactly the cases where the rest of the state is what changed.
WHY: the test read `parentId === hostId && orbit.hostId === hostId` - true of every orbit change
ever flown, because a high-to-low transfer ENDS AT THE HOST IT STARTED FROM. So a ship that had just
lowered itself to 6,536 km kept a stored orbit of 767,944 km, a hundred and seventeen times out, and
its panel read "Earth: High Orbit" beside a transfer whose own tags said LOWERING ORBIT.
BLAST: widening the test needs a second guard or "heal on sight" becomes "overwrite on sight" - an
orbit whose epoch is LATER than the arrival was written by a GM who knew what they wanted, and a
journey that finished before they did does not get to undo it. Without that the repair fights a
hand-placed ship every tick and `placementHealCount` climbs, which is meant to mean something else.

### RENDER-S40 A SAMPLER THAT ANSWERS FOREVER MUST NOT BE WRITTEN DOWN FOREVER
BUCKET: ARCHITECTURE - stamp a derived value onto a record only while NOTHING ELSE CAN DESCRIBE the
thing; ask the STATE, never merely whether the sampler answered. ** ID COLLISION: this id is claimed
again at the methane entry below (search 'HOW MUCH METHANE'). Code comments cite both. **
WHERE: `SystemView.syncScheduledJourneysAtDisplayTime`, `transit/scheduler.needsStampedPosition`,
`holo/scene.setSystemBuild`.
RULE: stamp a derived position onto a node only while nothing else can describe the thing. A parked
ship has a host and an orbit; a ship in transit or adrift does not. Ask the STATE, never merely
whether the sampler answered.
WHY: `sampleJourneyKinematicsAtTime` keeps answering past the last arrival - it returns a live
parking orbit, which MOVES. Stamping it meant every ship that had ever arrived anywhere rewrote its
own node several times a second for the rest of the campaign. A changed node is a changed broadcast
snapshot, and a player's 3D scene rebuilds on every one: `setSystem` bumps `buildGen`, which discards
any ship-model load still in flight. ONE cause, three reported faults - the model never appeared on
the player view, the camera reset while following, and the ship sat at a GM instant instead of
orbiting on the player's own clock. Pinned as a FIXED POINT: 200 ticks, 0 rewrites (was 200).
BLAST: dropping the stamp is only safe because DATA-R29 made the stored orbit reproduce the sampler.
Do them in that order or the ship teleports to the far side of its orbit the moment the stamp goes.

### RENDER-S39 DRAW AN ORBIT FROM WHATEVER PLACES THE BODY, NOT FROM ITS ELEMENTS BY DEFAULT
BUCKET: ARCHITECTURE + DOMAIN - architecture: draw a path from the same function that PLACES the
thing on it, and key on WHICH placer, never on the node's kind. Domain: an inclined circle projects
to an ellipse of semi-minor a*cos(i).
WHERE: `SystemVisualizer.drawSystem` (the orbit-ellipse pass), `physics/orbits.orbitPathProjected`,
`physics/worldPositions.computeWorldPositions`.
RULE: a drawn orbit must be sampled from the SAME function that places the thing on it. When a view
places different nodes by different means, the line has to key on WHICH - never on what kind of node
it is.
WHY: the plan view drew every orbit as an ellipse from `a`, `e` and OMEGA alone. That is right for
anything the FLAT propagator also places, which is what the plan-view convention means. But a
construct with journeys is not one of those: the orrery injects `sampleJourneyKinematicsAtTime`,
which parks a ship on the plane it actually ARRIVED on, inclination and all. So the ship rode an
inclined circle while its line was drawn as a flat one, and the two met at two points and nowhere
else. Owner: *"the only orbit line missing is when a construct establishes an orbit - it shows on the
3D player view but NOT on the GM view"*, with a station's line correct beside it because the station
had never flown anywhere and so WAS placed by the flat propagator. Measured, on one Earth low orbit:
projected line 0.0 km from the ship, flat ellipse 342.6 km; and for the station, flat 0.3 km,
projected 112.0 km. Both are needed, which is the point.
BLAST: `computeWorldPositions` (the flat walk) has NO `frame` step - it never applies the parent's
axial tilt, while `computeWorldPositions3D` always does. So a projected path is right only for a node
the SAMPLER places (whose answer is already absolute) and wrong by the tilt for anything else. That
asymmetry is why the choice is made on who places it.
BLAST: an inclined circle projects to an ellipse of semi-minor `a cos i`. For an Earth low orbit at
6,536 km and a 23.4-degree tilt that is 5,999 km - INSIDE the planet's 6,371 km disc - so part of a
correct line is behind the planet graphic, which is drawn after it. Not a fault; expect it.
BLAST: the path is 128 Kepler solves and the pass is per frame, so it is memoised on the ORBIT
OBJECT. That is only a sound key because a parked ship stopped rewriting its node (RENDER-S36).

### RENDER-S37 "HAS A ROUTE" IS NOT "IS FLYING", AND THE DIFFERENCE IS A CLOCK
BUCKET: ARCHITECTURE - state outlives the event that produced it, so a question about TIME must be
asked live rather than answered once at build time. ** ID COLLISION: this id is claimed again at the
auroral-oval entry below, and it is cited from code with BOTH meanings. **
WHERE: `holo/scene.setSystemBuild` (orbit-ring build), `holo/scene.updateOrbitRings`,
`constructs/shipRoute.routeStateAt`.
RULE: a construct's orbit ring is suppressed while it is ON its course, which is a question about
TIME and must be asked per frame. Build the ring whenever there is an orbit; decide visibility live,
exactly as the surface lock beside it already does.
WHY: the ring was omitted at BUILD time for any construct that HAD a route - but a route outlives the
journey that made it (`routeOf` packs the path whether or not the ship is still on it), so a ship
that had finished a course drew no orbit line for the rest of the campaign. Owner: *"parked in low
orbit but does not have an orbital line"*. `routeStateAt` already answers the live question by
returning null outside the window - ask it rather than writing the window test a second time.
BLAST: `compactRoute` packs EVERY journey into one window, gaps included, so a ship idle between two
journeys still reads as "on route" - see the board.

### DATA-R26 A DERIVED READING NEVER JOINS A HOST FROM ONE SOURCE TO A NUMBER FROM ANOTHER
BUCKET: ARCHITECTURE + DOMAIN - architecture: before joining a NAME from one source to a NUMBER from
another, check they DESCRIBE EACH OTHER; neither half looked wrong on its own, which is why it
survived. Domain: a semi-major axis is an altitude above the host it was measured from and above no
other.
WHERE: `construct-logic.calculateFullConstructSpecs` (`orbit_string`), and any derivation that takes
an entity from its caller and a measurement off a node.
RULE: before combining them, CHECK THEY DESCRIBE EACH OTHER. A semi-major axis is an altitude above
the host it was measured from and above no other; if `orbit.hostId` is not the host being named, the
altitude is unknown and must be left unclaimed rather than computed.
WHY: `altitudeKm = a_AU * AU_KM - hostBody.radiusKm` took the host from the panel's resolver (Earth)
and the axis from the ship's stale record (3.05 AU, heliocentric). The subtraction gave ~456 million
km, which falls past every band, so the panel read **"Earth: Far Orbit"** with complete confidence -
Earth's NAME beside the radius of the Sun orbit the ship left months earlier. Neither half looked
wrong on its own, which is why it survived so long. B97; pinned in `construct-logic.spec.ts` by
reinstating the join and requiring that exact string back.
BLAST: the star branch one line above blends the same two sources the other way round - it prints
`a_AU` raw, so a ship parked 6,536 km above Earth reads "Sol: 0.00 AU" to anything that asks against
the star. One guard covers both; do not fix only the branch you were looking at.
BLAST: the same function was handed a DIFFERENT host by each of its four callers (the ship panel
resolved it, the transit planner read `parentId` raw, two others passed null). That is the visible
"Callisto: High Orbit" against "Jupiter: High Orbit" for one ship at one moment. One resolver,
every caller - and note that passing null is fine for a caller that only reads fuel and thrust.

### DATA-R27 A REPAIR KEYED TO A CLOCK NOTHING MOVES NEVER RUNS - AND AN UNCOUNTED REPAIR HIDES ITS CAUSE
BUCKET: ARCHITECTURE - key a self-healing pass to the clock the app actually ADVANCES, and make the
repair COUNT ITSELF on the record it repairs. Idempotence is what makes the count mean something.
WHERE: `transit/scheduler.reconcileConstructArrival`, called from `SystemView`'s display-time tick.
RULE: key a self-healing pass to the clock the app actually advances - DISPLAY time - and make the
repair COUNT ITSELF on the record it repairs. Idempotence is what makes the count mean something: a
heal that fires every tick reads in the thousands within a minute and says nothing.
WHY: the reconcile existed, was correct, and had never once run in ordinary play. It read the
ACTUAL/master clock, and `temporal.masterTimeSec` is written by exactly one control in Settings -
playing or scrubbing moves `displayTimeSec` and never touches it. So every ship that had ever arrived
anywhere was still carrying the orbit it departed from, and that ONE stale record produced four
unrelated-looking symptoms: a five-year orbital period beside a low parking orbit, a picker and a
panel naming different hosts, a ship frozen in space on every player view (B96), and an apparent need
to lock players to the GM's clock for any of it to look right. Owner, 2026-08-27: *"Display Time is
our main 't' for player/GM visualisation"* and *"record how many times you do this on the ship - if
it happens loads of times we still have outstanding issues"*. `placementHealCount` is that record:
0 or absent is healthy, a climbing count means something upstream is still writing ships wrong.
BLAST: the cost of display-keying is real and was accepted deliberately - scrub forward past an
arrival and it is committed, so a later scrub back to before the departure draws the ship at its
destination. The journeys still carry the truth for every moment in between.
BLAST: re-parenting is not enough on its own. `computeWorldPositions3D` prefers a stamped
`vector_position_au` OVER the orbit, so a healed ship still hung motionless at the point it stopped -
exactly 0 km per hour. The heal must drop the vector too, but ONLY for a parked ship: a drifter's
vector is the honest answer and a ship under way is being placed from its journey.
BLAST: the run-once autopilot backstop and the flown-past trim in the same tick still key off ACTUAL
time, and should - they commit the campaign forward. Only the placement repair moved.

### DATA-R14 EDIT A RULE PACK AS TEXT
BUCKET: IMPLEMENTATION (repo practice) - durable half: a load-and-re-dump makes the diff the WHOLE
FILE, so a reviewer cannot see what changed. Check the diff stat against what you intended to add.
WHERE: `static/rulepacks/**/*.json`.
RULE: load-and-re-dump rewrites the whole file to change one key. It reflows every line, so the diff
is the entire pack and a reviewer cannot see what actually changed — and any formatting the pack
relies on for readability is gone. Do a targeted string replacement and CHECK THE DIFF STAT: adding
fourteen distribution entries should be about fifty lines, not six thousand.
WHY: it happened here (coordinator, 2026-08-14 — 6,385 lines rewritten to add one key), and the
pack is the file most likely to be edited by someone who is not looking at it closely.

### PHYS-S1 A MULTIPLIER IS NOT A LIMIT, AND A GATE IS NOT A GUARD
BUCKET: DOMAIN + ARCHITECTURE - domain: the Hayashi limit is a real floor, and rotational shape is
geometry from spin and density that a STAR has too. Architecture: when the physics says FLOOR the
code must contain a floor; A PHYSICAL MODEL SHOULD NEVER REACH ITS OWN SAFETY NET, and a measurement
landing on a guard means the model above it failed.
WHERE: `physics/stellar-evolution.ts` (`ageStar`'s giant branch, `hayashiLimitK`),
`core/SystemProcessor.ts` (`applyRotationalShape` and the planet/moon gate above it).
RULE: when the physics says "there is a floor", the code must contain a floor. A RATIO that happens
to land near the right value for one calibration case is not the same statement, and it fails
silently everywhere else.
WHY: B40. The giant branch cooled a star to `T = T_ms * (1 - 0.55e)`, with a comment claiming it
"cools toward ~2600-3500 K". True for a Sun-like progenitor and nonsense elsewhere, because the
endpoint scales with the STARTING temperature. Measured across 0.2-8 Msun before changing anything:
a 0.2 Msun progenitor reached **1,500 K**, a 0.5 Msun **2,019 K**. The Hayashi limit is the actual
rule — a fully convective star in hydrostatic equilibrium has a MINIMUM effective temperature, which
is why the red-giant branch is nearly vertical on an HR diagram and why real giants converge on
3,000-4,000 K whatever they grew from.
BLAST: **A PHYSICAL MODEL SHOULD NEVER REACH ITS OWN SAFETY NET, and that is the tell.** 1,500 K is
not a temperature the giant branch computed; it is the `Math.max(1500, T)` numerical guard inside the
HR call, which exists for the radius/class maths and carries no physical claim. When a measurement
lands exactly on a guard, the model above it has failed, not succeeded. Do not read a clamp as a law.
ALSO, the bound has to work at BOTH ends: a floor that can push a temperature UP is a new fault. A
giant is cooler than the star it grew from, so the floor is bounded above by the progenitor's own
temperature — they only conflict for a star that could never have become a giant at all.

AND THE SECOND HALF, same file family, same shape: **A GATE INHERITED BY SOMETHING THAT SHOULD NOT
BE BEHIND IT.** `rotationalDeform` sat below `processClassification`'s
`if (roleHint !== 'planet' && roleHint !== 'moon') return`, so no star ever reached it and Vega — 20%
oblate in reality — was drawn as a sphere. Rotational shape is not classification: it is geometry
from spin and density, and a star has both. `applyRadiationHazardTags` was hoisted above the same
gate for the same reason and its comment says so; that precedent is the pattern.
NOTE B43's own diagnosis names `processEnvironment`'s `roleHint === 'star'` early return as the
blocker. That return is real but it is NOT this one — trust the call graph over the report.

### DATA-R12 A DESTINATION THAT EXISTS IS NOT A DESTINATION ANYTHING REACHES
BUCKET: ARCHITECTURE + DOMAIN - architecture: before adding a class, a band or a template, ask WHAT
ROUTES TO IT. An unreachable destination never errors - the lookup falls through to something
plausible, and the plausible answer is the whole problem. Domain: the catalogue often already tells
us and we throw it away.
WHERE: `src/lib/import/realsky/stars.mjs` (`starClasses`, `OTYPE_CLASS`),
`static/rulepacks/starter-sf/stars.json`, and every consumer keyed on `classes[0]`.
RULE: before adding a band, a class or a template, ask WHAT ROUTES TO IT. The pack has defined
`star/red-giant`, `star/NS`, `star/BH`, `star/BH_active` and `star/magnetar` for a long time, with
real figures, and NOTHING COULD REACH ANY OF THEM from a catalogue row. The same shape three times:
D19 (the giant band unreachable from an MK string), B44 (the luminosity class parsed into a FIELD but
never emitted as a CLASS, so consumers still saw "an M star"), and the compact objects below.
WHY: it fails silently and confidently. An unreachable destination does not error — the lookup falls
through to something plausible, and the plausible answer is the whole problem. **A pulsar's spectral
type is EMPTY, and an empty string does not fall to `star/default`: it falls to `star/M`**, because
the letter regex fails and the letter defaults to M. Every neutron star, pulsar and black hole in
range imported as a 0.265 Msun red dwarf with the red-dwarf picture. Reachable, not theoretical:
PSR B1929+10 at 152 ly, RX J1856.6-3754 at 400 ly, six compact objects inside ~326 ly.
BLAST: **THE CATALOGUE OFTEN ALREADY TELLS US AND WE DROP IT.** SIMBAD's `otype` was fetched and used
ONLY as a filter (census.mjs drops planets, clusterGate trips on containers); it never reached the
classifier. That is the same fault as D19's luminosity class and D24's identifier — the third time a
field we already had was thrown away. When something classifies wrongly, check what the source said
before adding a model.
ALSO: `otype` must NOT override a real spectral type. An X-ray binary's `sp_type` describes the
DONOR (`* gam Cas` is `B0.5IVpe`), and the visible star is what it should classify as. And SIMBAD has
NO magnetar type — magnetars are filed as `Psr` — so `star/magnetar` stays unreachable from a
catalogue string, deliberately, rather than being routed to on a guess.
ONE SPELLING: the class emitted IS the pack's band key (`star/M-I`), not a parallel
`star/M-supergiant`. One string is the stat template, the picker entry, the description key and the
class. A second spelling for one thing is the duplication D22 existed to remove.
WATCH FOR: a first-LETTER test standing in for a class. `flareActivity` excluded remnants with
`/[WNB]/.test(sp) && !'BAFGKM'.includes(sp)` — and 'B' is both the initial of "BH" and a real
spectral class, so the exclusion cancelled itself and a BLACK HOLE drew the B-star flare rate. It sat
latent for as long as nothing routed to `star/BH`, and went live the moment something did.

### DATA-R11 A name the app SHOWS must be one it can FIND — and the catalogue service is ASCII-only
BUCKET: ARCHITECTURE + PLATFORM (browser CORS/preflight; a named external service) - architecture:
any prettifier ships with its INVERSE, or it creates a bug by existing - a user copies the name the
app just showed them. The measured query costs are a snapshot of a third-party service and will go
stale.
WHERE: `src/lib/import/realsky/starNames.mjs`, `properNames.mjs`, `query.mjs:runTap`.
RULE: any prettifying of a catalogue identifier must ship with its inverse. Build the map two-way
from the start; a display-only prettifier CREATES a bug, because a user copies the name the app just
showed them, pastes it into the search box, and gets an error.
WHY: SIMBAD's TAP service REJECTS NON-ASCII OUTRIGHT — `α Scorpii` returns HTTP 400, "Impossible to
normalise the identifier ... unsupported character encoding". So a Greek symbol is fine to DISPLAY
and must NEVER be SENT. Everything going to the service passes `toAsciiQuery` first.
BLAST: **NEVER SET A CUSTOM REQUEST HEADER ON A TAP CALL.** `runTap` used to set `User-Agent`, which
a browser must not let script set. Where a browser DOES allow it, the request stops being simple and
gets a CORS PREFLIGHT — and SIMBAD answers `OPTIONS` with HTTP 400 and no
`Access-Control-Allow-Headers`, so the whole query dies as a bare "Failed to fetch" with nothing
useful reaching the app. Chromium drops the header silently, which is why imports still worked and
the fault stayed invisible.
ALSO, TWO THINGS MEASUREMENT SETTLED THAT GUESSING WOULD NOT:
(a) **SIMBAD ALREADY RESOLVES THE FRIENDLY FORMS.** `Antares`, `alpha Scorpii`, `Alpha Sco`,
`alf Scorpii`, `61 Cygni`, `Lalande 21185` and `Gliese 411` all return the right object. Its `ident`
match is neither case- nor prefix-sensitive. So rewriting a query INTO the catalogue's designation
buys nothing — do not build it. The query side needs ASCII and nothing else.
(b) **A PARENT'S PROPER NAME PLUS A COMPONENT LETTER IS NOT A NAME.** "Keid B" and "Achird B" resolve
to nothing, though "Keid" and "omi02 Eri B" both do; and "Omicron 2 Eridani" fails where
"Omicron2 Eridani" works. Use a proper name only where the catalogue has one for THAT EXACT object,
and expand the designation otherwise. Verified by sending every displayed name back to the live
service: 434 of 434 resolve.
LEAVE SURVEY DESIGNATIONS ALONE. `2MASS J09205549+4539058` has no friendly name; showing it as it is
is honest, and mangling it would be inventing.

COST, WHICH IS NOT VISIBLE IN THE QUERY. SIMBAD's TAP is fast on some shapes and pathological on
others, and reading the ADQL will not tell you which. Measured against the live service:
`id = '<term>'` 70-310 ms; `main_id like 'eps%'` + order by 200 ms; **`main_id like '* alf Cen%'` +
order by EIGHTEEN SECONDS**; `select count(*)` over the same prefixes ~6 s; the `ident` alias join
1.1 s for `eps%` and **120 s** for `61 Cyg%`; `top 100` 1.3 s but `top 200` **16 s**.
THE RULE: a `LIKE` prefix CONTAINING A SPACE defeats the index. A count costs as much as the rows, so
answer "are there more than N?" by asking for N+1 rows. `top 100` is a cliff, not a round number.
And a prefix matching NOTHING can still scan: "zzznotastar" took 20 s, so any optional lookup needs a
timeout rather than a promise that it will be quick.

### DATA-R9 Cross-matching star catalogues: DISTANCE discriminates, POSITION does not — and never subtract two parallaxes
BUCKET: DOMAIN - positions disagree by ARCMINUTES and worst for the famous stars, because the offset
is proper motion times the epoch gap; and a 3D separation built from two parallaxes is NOISE. Move
verbatim.
WHERE: `src/lib/import/realsky/convert.mjs` (`matchHostToStar`), `census.mjs`
(`projectedSeparationAu`, `groupIntoSystems`)
RULE: two facts about the nearest stars, both measured (2026-08-13) and both counter-intuitive.
(a) POSITIONS DISAGREE BY ARCMINUTES, and worst for the famous stars. Catalogues quote positions at
different EPOCHS, so the offset is proper motion times the epoch gap — and the stars a local map is
made of are precisely the high-proper-motion ones. Measured against SIMBAD: Barnard's star is out by
161 arcsec, Kapteyn's by 134, Proxima by 60. Match on DISTANCE (every true match agreed to better
than 1.5%; 10% is a wide margin) with a GENEROUS angular gate of ~300 arcsec, and take the closest.
(b) A 3D SEPARATION BUILT FROM TWO PARALLAXES IS NOISE. Each star's distance carries its own
parallax error, so differencing two positions inside one system amplifies it: Sirius A and B differ
by 1.2% in parallax, which at 8.6 ly fabricates 6,856 AU of separation for a pair genuinely ~20 AU
apart, and eps Ind's brown-dwarf companion reads 11,698 AU against a true ~1,460. Use PROJECTED
separation — angular separation times the MEAN distance — which cancels the shared error and
recovers both (16 AU, 1,475 AU). Then require the parallaxes to AGREE (~10%) before calling two
stars companions at all, or a chance line-of-sight alignment becomes a binary (Wolf 28 + HD 4628 did).
WHY: an arcsecond-scale position tolerance silently drops exactly the stars a user would notice —
Alpha Centauri came back with none of Proxima's planets on the first run — and a distance-difference
grouping invents companions while missing real ones.
BLAST: any second catalogue (Gaia, VizieR, WDS) joined to another; anything deciding whether two
stars share a system. The period tier that makes that decision is `clusterGate`'s
`ORBIT_AUTHOR_MAX_PERIOD_YR`, and it is calibrated: with projected separation it reproduces the
hand-curated bundled groupings and puts Proxima in Alpha Centauri at 0.977 Myr.

### GEN-*  (generation engines, seeds, system creation)

### GEN-1 The evolutionary / Accrete generator is GONE, and the preservation order that kept it is SUPERSEDED
BUCKET: IMPLEMENTATION - DOES NOT CARRY: it records an absence from THIS repo. Its one durable
sentence: a stale in-code instruction to delete something is the most expensive kind of wrong
comment - and so is its inverse, which is why this entry is kept rather than deleted.
WHERE: nowhere in this repo any more. It lives on as its own project, https://system-lab.starsystemx.com/.
Removed at v2.1.898-beta: `physics/accrete-adapter.ts`, `vendor/accrete-js` (4.3 MB),
`components/EvolutionaryWizard.svelte`, `components/EvolutionTimeline.svelte`, the
`SettingsModal` option and its alpha disclaimer, and the `routes/+page.svelte` branch.
RULE: **THIS ENTRY USED TO SAY THE OPPOSITE, AND THE REVERSAL IS DELIBERATE.** It carried the owner's
2026-08-07 order that the whole chain be KEPT — "do not delete, prune, tree-shake or fold it into
another generator". The same owner superseded that on 2026-08-21 (inbox G35): *"ditch accrete, shrink
our program"*, because the work now has a home of its own where it can grow. Do not restore it here,
and do not read the old order in a git history as still standing.
WHY: the entry is kept rather than deleted precisely BECAUSE it once said the opposite. Two people in
one conversation had already believed the path was gone when it was not; an entry that simply vanished
would leave the next reader to rediscover the same question from an old comment or an old commit. The
lesson that produced it still holds — a stale in-code instruction to delete something is the most
expensive kind of wrong comment — and so does its inverse, which is this.
BLAST: `Starmap.generationEngine` survives in `types.ts` as a DEAD, untyped key so a starmap saved by
an older build still parses; `routes/+page.svelte` drops it on load, and marks the map changed when it
does so, or a map needing no other normalisation would take the early return and keep it forever.
Nothing reads it. `physics/tidalLock.ts` mentions "freshly-accreted" in a comment and is not a hit.
The Accrete.js attribution stays in `AboutModal.svelte`, reworded to point at the external project —
the code left, the credit did not. [[G17]]'s "builds WITH the accrete engine" now means that project.

### GEN-2 THE MASSES THAT SET PLANET SPACING ARE A PROXY, AND NOTHING RECONCILES THEM WITH THE MASSES ACTUALLY ASSIGNED
BUCKET: DOMAIN + ARCHITECTURE - domain: mutual Hill spacing needs the masses of BOTH neighbours, and
position is chosen before either body exists. Architecture: do not read a spacing MODEL as a
stability CONSTRAINT - the new code LOOKS like it enforces stability and the old code did not, which
is why this is written down.
WHERE: `generation/placement-strategy.ts` (`drawSpacingMassEarth`, and the packing loop that uses it)
vs the three callers that then create the bodies -- `generation/generateFromConfig.ts:352`,
`generation/planet-generation.ts:44`, `traveller/importer.ts:435`.
RULE: `calculateOrbitalSlots` sizes every gap in MUTUAL HILL RADII, which needs the masses of the two
planets either side of it. Those planets do not exist yet: position is chosen first, then the caller
draws a TYPE from the equilibrium temperature at that position and a mass from the type. So placement
draws its own PROXY masses purely to size the gaps, and the body that actually lands there may be a
hundred times heavier. DO NOT READ THE HILL SPACING AS A STABILITY GUARANTEE. It is a spacing MODEL,
not a constraint on the finished system.
WHY: measured over 200 seeds per anchor at v2.1.751, the closest adjacent pair in a generated system
sits at 0.1 to 1.7 mutual Hill radii against a stated stability floor of 10 -- because a gas giant
lands in a gap that was sized for a one-Earth-mass pair. THE SAME WAS TRUE BEFORE THIS CHANGE (0.8 to
1.4 under Titius-Bode), so it is a long-standing property of the engine and NOT a regression B58
introduced -- which is exactly why it is worth writing down: the new code LOOKS like it enforces
stability and the old code did not, so the next reader is far more likely to assume a guarantee that
was never there.
BLAST: the honest fix is to make the slot carry its proxy mass and have the body generators honour it
as a target -- which is also what "peas in a pod" wants, since it constrains what goes IN the slots as
well as where they go. That touches all three body-creation routes, so it is scoped work, not a
tidy-up. Until then, any plausibility tag or test asserting mutual-Hill stability on GENERATED systems
will fail, and it will be right to. See [[B58]], `generation-duplication-map.md`.

### GEN-3 PLANET SPACING IS A RATIO DRAWN ONCE PER SYSTEM; MUTUAL HILL RADII ARE THE FLOOR UNDER IT, NOT THE RULE
BUCKET: DOMAIN - spacing is far more uniform WITHIN a system than between systems, so a per-gap draw
averages two real populations into a third that matches neither; one drawn RATIO reproduces both Sol
and TRAPPIST-1 where one drawn Hill separation reproduces neither. Move verbatim - it took three
attempts, and each earlier one looked principled and passed its own tests.
WHERE: `generation/placement-strategy.ts` (`sysRatio`, the floor block); pack
`generation_parameters.orbital_spacing.spacing_ratio` + `stability_floor_hill_radii` (+ `separation_gap_spread`).
RULE: the spacing rule is the RATIO of successive orbits, drawn ONCE per system and varied modestly per
gap. The mutual Hill radius is kept only as a stability FLOOR: where the drawn ratio would put a pair
closer than the pack's floor, the gap widens to it. Two things here look like arbitrary implementation
choices and are not. (a) ONCE PER SYSTEM: spacing is far more uniform within a system than between
systems, and a per-gap draw averages two real populations into a third that matches neither. (b) RATIO,
NOT HILL SEPARATION: Sol's adjacent pairs run 8 (Jupiter-Saturn) to 63 (Mercury-Venus) mutual Hill radii
because the Hill term contains the planet masses and Sol's span four orders of magnitude -- but Sol's
successive orbit RATIOS are near-constant (1.85, 1.39, 1.52, 1.84, 1.86, 1.83, 2.02, 1.57, mean ~1.7),
and so are TRAPPIST-1's (~1.32). One drawn ratio reproduces both anchors; one drawn Hill separation
reproduces neither.
WHY: this entry has been rewritten once already, and the history is the lesson. First cut (v2.1.751):
constant mutual-Hill separation drawn per gap -- 13% of Sun-like systems had a giant, at a median 1.0 AU,
INSIDE the frost line, because a chain of typical gaps never reached it. Second cut (v2.1.760s):
separation drawn once per system -- 19% with a giant, but Sun-like systems still ended at a median
1.14 AU against Sol's 30, because a single separation cannot serve giants and terrestrials at once (the
giants blow the chain apart at k >= 1 while the terrestrials crowd). Third cut (v2.1.772): ratio with
Hill floor -- median 7 planets, outermost 10.8 AU, 45% with a giant beyond the frost line, and both the
compact and the Sol-shaped populations present. That is the version that stands, and it took three
attempts because each earlier one LOOKED principled and passed its own tests.
BLAST: anything that "simplifies" the ratio back to a Hill-radius spacing rule, or draws it per gap,
will not fail loudly -- Sun-like systems will just quietly compact and stop reaching their frost line.
`placement-strategy.spec.ts` guards the ratio band and the floor separately ("widening the pack band
widens the system"; "the mutual-Hill FLOOR still holds the chain apart when the ratio would crowd it"),
but the giant-occurrence and outermost-orbit numbers are the real signals. GEN-2 still applies: the
floor uses PROXY masses. See [[B58]].

### GEN-4 A FROST LINE IS A PROPERTY OF THE STAR'S LUMINOSITY, ASKED AT A HELIOCENTRIC DISTANCE — AND THE LEGACY PATH GOT BOTH HALVES WRONG
BUCKET: DOMAIN - d_frost is proportional to sqrt(L), and for main-sequence stars L goes as M^3.5, so
a sqrt(M) form is a DIFFERENT CURVE and wrong in opposite directions at the two ends. Two frost
lines exist by design (formation ~170 K, current ~125 K) and are not interchangeable.
WHERE: `physics/zones.ts` (`stellarContextFor`, `calculateAllStellarZones`) is the single source.
The faults were at `generation/planet.ts:133` and `generation/placement.ts:9`, both since routed.
RULE: never derive a frost line from a MASS, and never ask the question of the immediate host.
`d_frost ∝ sqrt(L)`; for main-sequence stars `L ∝ M^3.5`, so a `sqrt(M)` form is not a rough
approximation of it — it is a different curve (`M^0.5` against `M^1.75`) and it is wrong in opposite
directions at the two ends. Use `stellarContextFor(host, aAU, allNodes)`, which walks the parent
chain to the STAR and returns the body's distance from IT.
WHY: the legacy form was `frost_line_base_au * sqrt(M_host / M_sun)`. Measured against the
luminosity-derived line: 12.9x TOO FAR OUT for an M8 dwarf, 42.6x for an L dwarf, 2.3x for a K5, and
10x TOO CLOSE for a hot B star. Sol came out at 2.700 against a true 2.261 — 1.2x, near enough to
look right, which is exactly why it survived: THE ONE STAR ANYBODY CHECKS IS THE ONE STAR THE BUG
DOES NOT SHOW ON. The second fault compounded it: for a MOON the host is the PLANET, so the code
derived a frost line from Jupiter's mass (0.083 AU) and compared it against the moon's distance from
Jupiter (~0.003 AU) — so a moon was almost always "inside the frost line" and generated moons of cold
giants were essentially never icy.
BLAST: two frost lines exist by design and they are NOT interchangeable — `formationFrostLine`
(~170 K, disc ice during formation) decides what a body could form AS and is what the type draws
want; `currentFrostLine` (~125 K) is where ice is stable TODAY and is what present-day iciness wants.
Sol's are 2.26 and 4.97 AU, so picking the wrong one moves the giants. Guard:
`generation/frostLine.spec.ts`, whose load-bearing case is two stars of EQUAL MASS and different
luminosity — identical under any mass-based form. See [[B80]], [[B58]].

### GEN-5 THE STARS GREW ARMS AND LEGS; A CLASS-KEYED LOOKUP MUST READ THE LETTER, AND THE LETTER MUST COME FROM THE PACK
BUCKET: ARCHITECTURE + IMPLEMENTATION - durable: when a VOCABULARY GROWS, every class-keyed lookup
that predates the growth fails differently and silently, and none of them fails a test written
against the old members. Read the letter through one function, and take the letter from the DATA.
WHERE: `generation/star.ts` `starFamilyOf()` + `planetCountTableKey()`; `physics/stellar-evolution.ts`
`determineSpectralClass(tempK, pack)` and the temperature floor before `deriveStarFromHR`; consumers in
`generateFromConfig.ts`, `planet-generation.ts`, `setupStars.ts`.
RULE: the pack now carries `G-I`, `G-III`, `M-I` (luminosity-class suffixes) and `L`, `T`, `Y` (brown
dwarfs) beside the seven old letters, and every one of the three shapes of class-keyed code that predate
them was wrong in a different way. (1) A whole-string comparison -- `['A','F','G','K'].includes(cls)` --
is false for `G-III`, so it falls to whatever the last branch is; a G GIANT took the low-mass binary
odds. (2) A letter list with no branch for L/T/Y falls to the ELSE, which was the remnant table: brown
dwarfs got 95% zero planets. (3) `determineSpectralClass` was a hardcoded ladder ending at M, so every
brown-dwarf temperature came out `M`, and a `Math.max(1500, T)` floor in `ageStar` promoted every T and Y
to L on top of that. Read the LETTER through `starFamilyOf`; derive the letter from the pack's
`stellarClassification.subclass_anchors`, which already declared every letter's temperature range;
never floor a temperature at anything but zero.
WHY: none of it failed a test, because every existing test used a G, K or M seed. The wizard could
not generate a brown dwarf from a seed AT ALL, and every "L dwarf" and "Y dwarf" measurement quoted in
B58 and after was an M dwarf mislabelled -- the M results stand; the labels below M were wrong. Found
only because the owner said "stars recently grew many arms and legs and may need a data fix".
BLAST: the next new class -- a `D` white-dwarf subtype, an `S` or `C` carbon star, a Wolf-Rayet -- will
hit the same three shapes again unless it enters `LETTER_ORDER` in stellar-evolution.ts, gets a family
in `starFamilyOf`, and has anchors in the pack. `starFamily.spec.ts` pins the current set (L/T/Y from
the pack; a brown-dwarf seed GENERATES as one; -I/-III resolve to their letter; remnants stay remnants);
extend it when the pack grows. See [[B58]] (measurements to relabel).

### UI-*  (panels, editors, player views)
_Unwritten. Candidates: which surfaces read the player snapshot; the four explanation surfaces that
drift silently (physics page, Newton explainer, tags guide, classification doc)._

#### The player view (A42/A47) — added 2026-08-16 by the player-view closeout

### UI-P1 There is no preset-less path through `/catalogue`, and the FALLBACK is what makes that true
BUCKET: IMPLEMENTATION - one route's state machine. Durable half: an UNREACHABLE 'none' branch does
not render nothing, it renders whatever the legacy default happened to be.
WHERE: `routes/catalogue/+page.svelte` — `FALLBACK_PRESET`, `resolvedPreset`, `presetMissing`,
`pendingPreset`.
RULE: `activePresetId` defaults to `'guide'` when the URL carries no `?preset=`, and an id that fails
to resolve falls back to the same shipped preset. So `activePreset` is null in exactly ONE window: after
mount and before the first `SYNC_STARMAP`, and the page shows the waiting interstitial there anyway. Do
not add a branch for "no preset" — it is unreachable, and the last one that existed rendered the
retired Field Guide.
WHY: every preset-driven branch is guarded on `activePreset`, so a null one did not render nothing, it
rendered whatever the legacy default happened to be. That is how a broken custom-preset link opened a
different tool with no error (A47).
BLAST: the fallback DELIBERATELY WAITS FOR `starmap` rather than applying immediately, for two reasons
and both are load-bearing. (1) "Not yet arrived" is the normal state for the first second of every
CUSTOM-preset window — customs ride `starmap.playerPresets` — so warning before the campaign lands
would cry wolf on every open. (2) Applying it early would count as the FIRST application, and
`firstApply` is what lets a width this reader dragged outrank the preset's; the real preset would then
arrive second and overrule a drag it was never meant to touch (A32's rule, one indirection away).
A built-in id resolves with no data at all, so the ordinary no-URL case never waits.

#### Construct appearance (G3) — added 2026-08-04 by the ship-appearance stream

### TRANSIT-4 A TRANSIT IS PLANNED IN THREE DIMENSIONS, AND `z` IS OPTIONAL BUT NEVER IGNORED
BUCKET: DOMAIN + IMPLEMENTATION - domain: planning between two bodies' SHADOWS on the reference
plane is planning the wrong journey (Main Belt +2,390,850 km). Implementation: an optional z on a
type still called Vector2 is a convention every literal must remember, and forgetting it does not
throw - it draws a plausible wrong picture.
WHERE: `transit/types.ts` (`Vector2`, which carries an optional `z`), `transit/math.ts` (`zOf` and
every helper that goes through it), `transit/physics.ts` (`getGlobalState`), and by inheritance every
plan builder. `physics/driftIntegrator.ts` and `physics/systemGravity.ts` follow the same convention.
RULE: read a height as `v.z ?? 0`, never as `v.z`. Write one whenever you build a vector from
components — an object literal with x and y and no z is how a course gets silently flattened, and it
will not throw, it will just draw a plausible wrong picture. The type is still called `Vector2`
because renaming it would have touched several hundred literals for no gain; the optionality is what
makes a 2D caller and a 3D one interchangeable.
WHY: `getGlobalState` used to call `propagateState`, which applies ONLY the argument of periapsis —
the flat projection the 2D orrery draws — so every transit the engine ever planned was planned between
the SHADOWS of two bodies on the reference plane. `propagateState3D`, with the full Rz(Omega)Rx(i)Rz(omega)
rotation, had existed all along for the holo view. Owner, 2026-08-26: transit "didn't really think in
3D, so some distances may be a bit longer now, but the maths should be no different" — right on both
counts. MEASURED on Sol Expanse from a ship at 3 AU: Earth (i=0) unchanged at 0 km, Mars +79,242 km,
Jupiter +122,349 km, Saturn +633,416 km, and the Main Belt (i=10 deg) **+2,390,850 km**.
BLAST: only TWO places in the solver were ever dimensional. The transfer ANGLE in `solveLambert` was a
difference of `atan2(y, x)` bearings — a statement about the reference plane, not about the transfer —
and is now `atan2(|r1 x r2|, r1 . r2)` signed by that cross product's z, which is ALGEBRAICALLY
IDENTICAL for coplanar radii, so a flat system plans exactly the journeys it always did. The other was
the assembly of the final velocities. Everything else — Stumpff, the f and g series, the RK4, the phase
schedule, the time stamps — never asked how many components a vector had. The 2D orrery is a PLAN VIEW
and correctly reads x and y only; the holo view now receives real heights through `shipRoute`, which
had been reading a `z` that was always zero. A parking orbit rides in a plane PARALLEL to the reference
plane at its host's height — its own inclination is not modelled anywhere and must not be invented.
`starmapSanitizer` preserves z; stripping it would flatten a course on its way through a snapshot.

### TRANSIT-6 ONE DERIVATION SAYS HOW HIGH AN ORBIT IS, AND THE ARRIVAL IS BUILT FROM THE FLIGHT
BUCKET: DOMAIN + ARCHITECTURE - domain: orbit altitudes are DERIVED from the body (atmosphere sets
where drag stops, rotation sets geostationary), and a rendezvous with a world arrives at ORBITAL
speed because matching its velocity at low altitude is hovering. Architecture: one derivation read
by planner, aim point and sampler, and the parked orbit is built on the ARRIVAL so position and
velocity both close.
WHERE: `physics/orbits.ts` — `parkingOrbitRadiusKm`, sharing `getOrbitOptions`'s derivation. Read by
the planner panel, by `calculateTransitPlan` (the aim point) and by `scheduler.samplePostJourneyState`
(the parked orbit).
RULE: `lo` / `mo` / `ho` / `geo` are DERIVED from the body — its atmosphere sets where drag stops, its
rotation sets geostationary, its mass and host set how far its grip reaches. Never a multiple of its
radius. And a parking orbit is built on the ARRIVAL: one axis toward the point the flight ended at,
the other along the velocity it ended with, so position and velocity both close at the changeover.
WHY: this is [[B92]], and it was three disagreements at once. `transit/scheduler.ts` carried its own
table of radius multipliers — twice, a `Record` and the same four numbers as a ternary chain ten lines
from the sampler that used them — while the panel offered the derived figures. MEASURED: Earth low
orbit 6,536 km derived against 8,282 assumed, Jupiter low 70,076 against 90,884, Jupiter HIGH
26,668,664 against 279,644 — a factor of ninety-five; Luna, too small to have a high orbit at all, was
offered one at four times its own radius. The sampler then phased that orbit off a HASH OF THE
JOURNEY'S ID, unrelated to where the ship arrived, so the step was a chord of the parking orbit. And
the circle was drawn in the reference plane, which since TRANSIT-4 would have flattened any ship that
arrived from out of it. The measured seam went 90,884 km -> 0.0 km on every case tested.
BLAST: `geo` was missing from the aim-point test in BOTH plan builders, so a geostationary arrival
aimed at the planet's centre — a full 42,241 km at Earth. A rendezvous with a WORLD now correctly
arrives at ORBITAL speed rather than at rest (42,517 m/s at Jupiter low orbit, against sqrt(mu/r) =
42,519): matching a planet's velocity at low altitude is hovering, which is not a manoeuvre. A
rendezvous with no placement named still arrives at rest, because then there is no orbit to enter.
`arrivalSnap.spec.ts` is the tripwire and now asserts ZERO rather than pinning the size of a step.

### TRANSIT-5 THE FRAME IS THE LOWEST COMMON ANCESTOR, AND THE PATH IS COMPOSED ONTO IT PER SAMPLE
BUCKET: DOMAIN + ARCHITECTURE - domain: a moon-to-moon transfer solved heliocentrically is a
two-body problem with the WRONG TWO BODIES. Architecture: compose the local arc onto the parent's
motion PER SAMPLE at its own time, never by index.
WHERE: `calculateTransitPlan`'s frame block (`lcaId`, `frameParentId`, `frameMu`), and the `toGlobal`
composition in both `calculateLambertPlan` and `calculateFastPlan`.
RULE: a transfer is SOLVED in the frame of the lowest common ancestor that is a real body or
barycentre — the star for interplanetary, the planet for moon-to-moon — and the resulting local arc is
composed onto that parent's own motion SAMPLE BY SAMPLE, each at its own time. Never compose with a
uniform time step: per-phase sampling means index and time are no longer proportional, and the error
slides the whole local path along the parent's orbit.
WHY: a moon-to-moon transfer solved heliocentrically is a two-body problem with the wrong two bodies.
The composition-by-index bug was live until G46 and invisible while the grid was uniform.
BLAST: `hostId` on a segment records the frame, and `shipBurn`, the holo route and the arrival sampler
all assume it. The DRAWN path is global, which is why a local transfer looks like a long smear at
system zoom — Jupiter moves 11.9 million km during a 10-day moon hop — and why drawing an orbit change
in the body's own frame is a separate piece of work rather than a consequence of solving in it.

### TRANSIT-7 A MANOEUVRE IS A SHAPE, AND IT IS DRAWN IN THE FRAME IT HAPPENS IN
BUCKET: DOMAIN + ARCHITECTURE - domain: two radii determine a Hohmann transfer COMPLETELY, so there
is nothing to search for, and an aerobrake is a phase in which the drive is DARK. Architecture:
regenerate the PICTURE in the host's frame from radii; keep the FLOWN path global.
WHERE: `transit/orbitChange.ts` (the closed forms and the geometry), `buildOrbitChangePlan` and
`appendAerobrakeSegments` in `calculator.ts`, and the `plan.orbitChange` branch of `drawTransitPlan`.
The contract is `TransitPlan.orbitChange` and the `Aerobrake` segment type.
RULE: an orbit change and an aerobrake pass are CLOSED FORM - two radii determine a Hohmann transfer
completely, so there is nothing to search for - and both are drawn in the HOST's frame, regenerated
from radii and a plane against the host's live position. Do not bake point arrays for the context
orbits: the host moves, and journeys ride the player snapshot. The FLOWN path stays global, because
that is what the samplers read; only the PICTURE changes frame.
WHY: neither manoeuvre could be drawn, and the orbit change could not even be FLOWN. The general
solver treats every journey as a Lambert problem and sweeps departure windows, which has nothing
sensible to sweep between two points a few planetary radii apart - so a ship asking to raise its
Jupiter orbit was offered the torch at 45.44 km/s and no efficient option at all. The Hohmann answer
is 19.55. And a ship lowering its orbit over three days is, heliocentrically, a 3.6-million-km streak
trailing after Jupiter, because Jupiter travelled that far while the ship went round: drawn globally
the figure is a smear beside two rings it never touches. Host-frame drawing is exact rather than
approximate, because the map draws ONE instant and at that instant host-now plus host-relative is the
ship's global position - so the ship sits on the line it is flying.
BLAST: `Aerobrake` is a phase in which the ATMOSPHERE brakes, so anything deciding whether a ship is
thrusting must treat it like `Coast` and not like `Brake` (`shipBurn.ts`) - the drive is dark while
the ship decelerates hard. The dip EXTENDS the journey: the passes were costed in `aeroTimeSec` and
reported in the ship's log while `totalTime_days` stopped at the moment the ship reached the planet,
so a Mars arrival was drawn parked for the 615 days it was still aerobraking. Repeated passes draw as
one dip because the loops coincide, and the drawn count is CAPPED at 24 with the real count in the
label rather than silently truncated.

### UI-C12 A PLAYER EITHER STEERS THE CLOCK OR IS TOLD WHOSE CLOCK IT IS — NEVER NEITHER, NEVER BOTH
BUCKET: ARCHITECTURE (product contract) + DOMAIN - the domain enables the product: a body's position
is CLOSED-FORM IN TIME, so a scrubbing reader draws every world correctly and a free clock is
legitimate. onGmClock is not !canScrub and must not be simplified into it.
WHERE: `player/clockOwnership.ts` (`resolveClockOwnership`), read by `routes/catalogue/+page.svelte`
for both the time controls and the campaign readout.
RULE: gate the controls on `canScrub` and the readout on `onGmClock`, and decide neither anywhere
else. A running GM clock is the GM saying THIS MOMENT MATTERS and locks an interactive view;
pausing hands the freedom back. `followGM` locks standingly. A display-only view follows when there
is a GM to follow.
WHY: owner, 2026-08-27 — "unless the GM says time is important by RUNNING TIME, or it is follow GM,
so the GM view and player view align. Otherwise the players are free to play with it as a tool."
A free clock is ALLOWED because a body's position is closed-form in time, so a scrubbing reader
draws every world correctly for the time they chose. `SYNC_TIME` has carried `isPlaying` since it
was written and nothing read it: the player knew the GM was running and did nothing with the fact.
BLAST: **`onGmClock` IS NOT `!canScrub`** and must not be simplified into it. A display-only view
with no GM connected has neither controls nor a GM clock — it keeps its own, and the readout stays
BLANK rather than naming a campaign time it is not showing, which is the lie the blank readout was
put there to prevent. A ship standing still on a free clock is the honest consequence of a clock the
GM does not own, not a fault — its course lives in journeys the player snapshot does not carry. That
is [[B96]], and it is fixed by publishing a parked descriptor, not by locking the clock harder.

### UI-C11 ONE PICKER ANSWERS "WHICH BODY?", AND ITS LIST RULE IS A PURE FUNCTION
BUCKET: IMPLEMENTATION + ARCHITECTURE - durable: a list rule lives OUTSIDE its component so it can
be tested without a DOM; an ancestor of a surviving node is kept as unselectable CONTEXT; and a
search honours the same exclusions as the browse list, or typing hands back what the caller ruled
out.
WHERE: `ui/bodyPickerList.ts` (`buildPickerRows`, `buildCategoryChips`) and the one component that
reads it, `components/BodyPicker.svelte`. Mounted by `SystemView`, `Starmap`, `TransitPlannerPanel`
and `InterstellarTransitModal`.
RULE: every "which body?" is this component. It shows the system as a HIERARCHY with type toggles
above it, and the list rule lives OUTSIDE the component so it can be tested without a DOM. Do not
add a bespoke `<select>` for a body, a system or a ship; pass `filterItems` / `categorize` /
`excludeIds` instead. The origin of a journey is passed as `excludeIds`, never filtered out of the
node array — the picker needs it to keep placing whatever still hangs off it.
WHY: there were three answers. `BodyPicker` offered a flat list of categories you DRILLED INTO one
at a time, so finding a station meant knowing it was a Construct rather than knowing it was at
Earth, and only one category could be shown at once. The interstellar modal had no picker at all —
three bare `<select>`s, no search, no types, and a body list that faked a hierarchy with leading
spaces in the option text. Owner, 2026-08-26: "Reuse and refine, and ONE interface for the user to
learn."
BLAST: THE PART THAT IS EASY TO GET WRONG is what a filter does to a hierarchy. Toggling
"Constructs" must still show Sol > Earth > ISS, not a bare ISS with nothing to say where it is — so
an ancestor of a surviving node is kept as unselectable CONTEXT, rendered as a `div` rather than a
`button` so it cannot be tabbed to or clicked. The same applies to an excluded origin and to a
barycentre, which is not itself a destination but holds two bodies that are. A SEARCH is flat and
capped, and it honours the toggles and the exclusion — filtering the browse list but not the search
box would hand back by typing what the caller ruled out. Authored data can contain a parent LOOP;
anything the tree walk cannot reach is emitted at the top level, because an empty picker reads as
"nowhere to go" rather than "this map has a cycle in it".

### UI-C1 One colour drives a construct's whole look
BUCKET: IMPLEMENTATION - one authored colour, everything else derived. Durable half is one sentence:
before adding a second authored field, ask whether it can be DERIVED from the first.
WHERE: `ConstructBasicsTab.svelte` (Appearance block), `constructIcon.ts`, `modelViewer.ts`
RULE: `icon_color` is the single authored colour: the 2D marker, the hull tint for material-less
models, and the seeded livery all derive from it. The livery's CONTRAST accent is DERIVED from it
too (seeded complementary rotation) unless a GM pins `ModelRef.accentHex`.
WHY: an owner decision — one colour to set, variation for free. A second required slider was
considered and rejected; if per-faction control is ever wanted, the lever is pack DATA.
BLAST: adding another colour field to a construct. Ask whether it can be derived first.

### UI-C8 Lifting a control OUT of the component that owns the data breaks two things silently
BUCKET: PLATFORM (Svelte binding and scoped styles) + ARCHITECTURE - durable: AN EMPTY LIST IS NOT
AN ABSENT KEY, so strip before diffing (PHY-9's placeholder zero, one type over); and check a save
by reading STORAGE, not by looking at the screen.
WHERE: `components/AbsorptionBandsEditor.svelte` (+ its spec), used by `EditBiospheresModal` (pigment
bands) and `EditAtmospheresModal` (per-gas `absorptionBands`). Both traps are pinned by tests.
RULE: a shared editor bound to a list must (1) RE-ASSIGN on every edit, never mutate a member, and
(2) tell the parent it changed. Mutating `bands[i].centreNm` in place does not propagate out through
`bind:bands`, so the number in the box changes while everything derived from it goes stale; and a
parent whose reactivity keys off a CONTAINER (`pigments`, `gases`) has to nudge that container itself,
because only it knows what the container is. The inline version had neither problem — its bindings
reached the parent's own array directly — which is exactly why extracting it is where they appear.
WHY: A56. The pigment swatch and score stopped recomputing while a band was edited; the same shape
would have left the gas preview curve frozen. **AND A SECOND, WORSE ONE THAT REACHED THE SAVED DATA:**
`bind:bands` on a gas with NO authored bands wrote the editor's `[]` default into the record, and `[]`
is not the same JSON as an ABSENT key — so `handleSave`'s diff-against-the-pack judged 17 of 33 gases
changed and wrote overrides for every one of them. **A GM who merely OPENED the editor and pressed
save got a campaign pinned to today's pack for gases they never touched**, which is precisely what the
delta design exists to prevent (UI-C5). Nothing reported it: the build was green and the UI looked
right. It was found by reading the SAVED CAMPAIGN after a save, which is the only place it shows.
BLAST: any editor that binds to an optional list. Give the component a default of `[]` if you like,
but STRIP THE EMPTY LIST BEFORE DIFFING or absent and empty become two states of one thing. Check a
save by reading storage, not by looking at the screen. And when extracting a control, the STYLES must
travel with it — Svelte scopes per component, so markup lifted out of a parent loses the parent's CSS
silently and the acceptance test 'unchanged' quietly fails.
ALSO: **ONE CHART AT A TIME.** The gas cards are all expanded at once (no accordion, unlike the pigment
list), so a `SpectrumChart` per card renders 33 plots on open. The band ROWS are cheap; the plot is not.
The component takes its `absorbed` series as a PROP and derives nothing — same rule `SpectrumChart`
states for itself — which is also what lets the pigment curve keep its flat baseline term while the
gas curve, which has no such term, does not.

### UI-C10 A SKIN MOVES CHROME TOKENS ONLY; COLOUR-AS-INFORMATION NEVER RIDES A SKIN
BUCKET: ARCHITECTURE (product contract) - colour that ENCODES MEANING may never ride a theme. A skin
moves chrome tokens only, and the domain palette is off limits to every skin.
WHERE: `styles/skins.css` (the skin definitions), `styles/skinStore.ts` (data-skin on <html>,
localStorage, per viewer), `styles/tokens.css` (the CHROME/DOMAIN split it obeys, and the
`--group-*` related-data edge tokens), `rendering/colors.ts` (canvas caches invalidate on skin
change as well as palette change).
RULE: a skin is a set of CHROME-token values plus a density layer, selected by `data-skin` on
<html>. PER-VIEWER chrome, persisted locally - never campaign data (the asymmetry with unitPrefs,
which players inherit, is deliberate). The DOMAIN section of tokens.css (body types, spectral
classes, zones, hazard ramps, tiers) is colour that ENCODES MEANING and no skin may redefine it.
The `--group-*` edge tokens colour RELATEDNESS between info cards (bulk/orbit/climate/air/life/
hazard/infra) - decoration a skin may restyle, but one family = one colour on any given skin.
A user's /palette overrides are inline :root styles and therefore beat any skin.
WHY: G34 phase 4, owner direction 2026-08-21: modern (compact, light-blue, lighter grey) is the
DEFAULT; classic (the shipped orange-on-black) is the tokens.css defaults themselves, so absence
of overrides IS that skin and it stays pixel-familiar. The owner's hard rule in the same message:
"when colour is used to indicate something (rather than decoration) it cant be swept".
BLAST: a new BUILT-IN skin = a new `:root[data-skin=...]` block in skins.css + a SKINS entry in
skinStore.ts, nothing per-component. Density rules use `html[data-skin] body ...` to outrank
scoped styles WITHOUT !important, and control shrink-rules sit behind (pointer: fine) so the
coarse-pointer 44px floors (touch-overrides.css, UI-C6) stay honoured. Canvas/SVG reading tokens
goes stale on skin change unless it hangs off the THREE subscriptions in colors.ts (palette,
skin, customSkins). CUSTOM skins (skinStore createCustomSkin/updateCustomSkin, edited in
SkinEditorModal from Settings > Appearance) are name + BASE built-in + a token override map,
localStorage per device; applied as data-skin=<base> plus an injected `:root[data-skin]` style
element that TIES the base's specificity and wins by source order - /palette inline overrides
still beat both. Token names and values are regex-validated before injection. The two shell
columns are individually skinnable via --bg-rail / --bg-side (default: var(--bg-app), so classic
is untouched).
### UI-C9 A fragment link into ASYNC content silently does nothing, and a refresh hides it
BUCKET: PLATFORM (browser) - a fragment is resolved ONCE, early, so a deep link into async content
is simply dropped; and getElementById merely misses where querySelector THROWS on a
legal-but-unselectable id.
WHERE: `routes/discgallery/+page.svelte` (`scrollToHash`, called after `buildGiantLab`); the link that
needs it is the atmosphere tab's `/discgallery#giant-lab`.
RULE: the browser resolves `#anchor` ONCE, early. If the element it names is rendered from data fetched
in `onMount`, it does not exist yet and the scroll is simply dropped — no error, no console line. Any
deep link into content that arrives asynchronously must re-apply the fragment itself after the data
lands (`await tick()`, then `getElementById(...).scrollIntoView()`).
WHY: reported live. `/discgallery#giant-lab` landed at the top of the page on a first visit and worked
on a REFRESH — because by then the rule pack and the Sol example are cached and arrive before the
browser gives up. **That asymmetry is the tell, and it is why it reads as flaky rather than broken:**
the person who wrote the link tests it twice and it works the second time. Suspect load ordering
whenever a thing fails once and then behaves.
BLAST: every other in-app fragment link, and any new one into a page that fetches. Use
`getElementById`, NOT `querySelector`: a fragment is arbitrary text, and `#3-body` is a legal id but an
illegal selector, so `querySelector` THROWS where the id lookup merely misses. Note this is invisible
to a green build and to jsdom — nothing computes scroll position there — so it is an eyes-only fault,
like UI-C8's flex/grid mismatch found in the same hour.

### UI-C6 On a small screen an open dialog gets the screen; BOTH SIDES declare themselves
BUCKET: ARCHITECTURE - durable and one of the best shapes in the file: NEITHER SIDE KEEPS A LIST.
Both parties mark themselves and one CSS rule joins them, so next month's dialog and next month's
floating control are both covered at birth. The rejected first fix - a condition in each piece of
chrome - is a list of chrome by another name.
WHERE: `src/lib/ui/foreground.ts` (`foreground` and `chrome` actions, pinned by `foreground.spec.ts`),
joined by ONE rule at the foot of `styles/tokens.css`. Chrome markers: `AppShell.svelte` (strip, bar,
menu FAB, FAB layer), `BottomSheet.svelte` (so every use is covered at source), and the floating time
control in `Starmap.svelte` / `SystemView.svelte`.
RULE: a dialog marks its backdrop `use:foreground`, which sets `data-foreground` on `<html>`. Persistent
chrome marks itself `use:chrome`, which adds `.sse-chrome`. One CSS rule joins them:
`:root[data-foreground][data-app-mode='phone'] .sse-chrome { display: none }`. **NEITHER SIDE KEEPS A
LIST** - not of modal names, and not of chrome names either. A dialog added next month is covered
because it registers; a floating control added next month is covered because it marks itself.
**IT HIDES, IT DOES NOT UNMOUNT.** The bar carries the starmap description and the GM notes; destroying
it throws away whatever it was holding, and "take over the screen" only ever meant stop drawing it.
WHY: A52, user-reported with a screenshot showing TWO overlaps at once - the bottom bar over the foot of
the import dialog AND the floating time control across its middle. **THE FIRST FIX WROTE AN `{#if}` GATE
INTO EACH PIECE OF CHROME AND THE OWNER REJECTED IT, CORRECTLY: that is a list of chrome by another
name.** Every new floating control would have had to remember the condition, and it treated the time
control as a special case when it is not special - his words, "it can move ... it is just allowing a
modal to take over when it is more practical on mobile". The gates also UNMOUNTED the bar, which was
never asked for. Same fault on both sides of one problem: the modal side had already been de-listed and
the chrome side had not.
BLAST: **`data-app-mode` IS THE SHELL'S OWN DECISION MIRRORED ONTO `<html>`, AND IT REPLACES A SECOND
BREAKPOINT ON PURPOSE.** `AppShell.mode` already folds width, pointer type AND the `?mode=` override
together; a CSS media query beside it would be a 26th breakpoint value that disagrees the moment someone
forces phone on a wide screen - verified: forced phone at desktop width still yields, which a media query
would have missed. **DO NOT reach for "just hide `.app-shell`"** - measured, and it fails: the reported bar
and every modal are rendered OUTSIDE `<AppShell>` as siblings, so it would miss the one thing reported
while risking the canvas-resize trap (RENDER-B1). **A floating control takes `use:chrome`, never
`use:foreground`** - G28's undo/redo pill is the next one; registering it as foreground would make the
chrome hide itself whenever it was visible. The foreground count is a COUNT, not a flag (modals stack -
Settings opens the A43 unit confirmation) and it clamps at zero, because chrome stuck hidden is worse than
the bug: two GM fields become unreachable.
ALSO: the z-index ladder is now NAMED in `styles/tokens.css` (`--z-map` < `--z-chrome` < `--z-panel` <
`--z-modal` < `--z-toast`). Components still carry raw values - measured at 1, 1400, 1500, 2000 (nineteen
of them), 2100, 2200, 2300, 3000, 5000 up to 99999 - and adopt the tokens as each surface is touched.
Reach for the tier whose NAME fits; never invent a bigger number to win a fight.

### UI-C7 The undo history is GM-PRIVATE: it lives in the local autosave, and every path OUT strips it
BUCKET: ARCHITECTURE (product contract) + IMPLEMENTATION - durable and first-order: IF DERIVATION IS
A PURE FUNCTION OF AUTHORED STATE, process() IS THE REDO FUNCTION and undo needs only the authored
slice. Also: ship memory-only first and persist second - the only order that cannot leak.
WHERE: `lib/undo/` - `undoHistory.ts` (the stack, copied from Mappadux's `CanvasUndoManager`),
`systemUndo.ts` and `starmapUndo.ts` (the two bindings), `campaignHistory.ts` (persistence),
`describeChange.ts` (the labels), `historyKey.ts` (the ONE name and the ONE strip);
`components/UndoPill.svelte`. The strip is called from `system/importFixup.stripSystemForExport` and
`stripStarmapForExport` (both save paths) and from `system/utils.computePlayerSnapshot` and
`computePlayerStarmapSnapshot` (the player redaction, [[TAG-9]]). Pinned by
`undo/historyStrip.spec.ts`, `undo/campaignHistory.spec.ts` and a case in `io/bundle.spec.ts`.
RULE: an undo log is a record of what a GM CHANGED, including what they deliberately DELETED. A save
in this product is a SHARED ARTEFACT and the project itself ships bundled example starmaps, so the
history is treated exactly as `gmNotes` is: it rides the campaign object into IndexedDB (the owner's
"last 20 undos in the save file") and the four outbound paths strip `undoHistory` before anything
leaves the browser. If you add a fifth outbound path, call `stripUndoHistory`.
**IT SHIPPED MEMORY-ONLY FIRST AND WAS PERSISTED SECOND, DELIBERATELY** - every strip was in place
and tested before the first entry was ever written, which is the only order that cannot leak.
WHY: G28. The cost of getting it wrong is publishing the very edits a GM backed out, in a file they
hand to another GM. Two measured consequences shape the persistence: it is written onto the campaign
object IN PLACE with no store emission (every starmap emission recomputes the whole redacted player
snapshot), and it caps on BYTES as well as on the owner's twenty - 20 authored slices is 1.4 MB for
Sol but 14.8 MB for a 400-node system, rewritten on every autosave.
BLAST: four traps, each of which cost real time to find.
(1) **A SNAPSHOT IS THE AUTHORED SLICE, DEFINED BY `stripSystemForExport` AND NOWHERE ELSE**
(`DERIVED_FIELDS` + `stripBody`, [[PHY-1]]) - `process()` is the redo function, so nothing derived is
ever stored. Do not write a second list of authored fields.
(2) **COMPARE THE SLICE WITH A DEEP EQUAL, NEVER WITH ITS JSON TEXT.** `process()` deletes and
re-adds fields, so an identical authored state serialises with its keys in a different ORDER; string
comparison recorded an undo entry for a re-process that changed nothing.
(3) **A STORE WRITE THAT RETURNS ITS ARGUMENT UNCHANGED EMITS THE SAME OBJECT**, and the recorder
uses exactly that (reference equality) to ignore the clock's several-per-second no-op writes. Every
write site in the app returns a fresh object; if you add one that does not, its edit is invisible to
undo until the next one.
(4) **CLOCK-DRIVEN WRITES GO THROUGH `silentSystemWrite`** - `maybeTopUpAutopilot` and
`syncScheduledJourneysAtDisplayTime` in `SystemView`. Time is out of undo's scope; without the wrap
the stack fills while a system sits idle.
(4b) **THE CAMPAIGN HISTORY'S GATE IS A SHELL, NOT THE CAMPAIGN.** `starmapStore` ticks with EVERY
`systemStore` emission, so its gate runs on every step of every slider drag inside a system.
Measured on the bundled 42-system map: the authored campaign is 227 KB and 7.5 ms, the shell (the
same map with every `systems[].system` removed) is 7.66 KB and 0.03 ms. The shell is also BLIND to
system contents by construction, so a body edit cannot produce a map entry however hard it churns.
The one thing a shell cannot carry is a DELETED system's bodies, so the shadow holds a reference to
each live system and clones just that one into the entry when an id disappears; everything else is
read from the LIVE map at apply time, which is what stops an undo of a move from also winding back
body edits made since.
(5) **AN EDITOR THAT SEEDS ITS FIELDS ONCE PER BODY MUST ALSO RE-SEED ON AN UNDO.** `BodyStarTab`
deliberately reads the body into its local fields only when a DIFFERENT body is selected, so that
typing a precise mass is not snapped back by the next store tick - and an undo, which replaces the
model underneath the open panel, left it showing the pre-undo numbers over a correct model. It now
also watches `undoEpoch`. Found by driving the real app; no unit test could have seen it. Any future
editor with the same seed-once guard needs the same second reason to re-read.
ALSO: the stack caps on entries (200, Mappadux's number) AND on BYTES (32 MB), because one SSE
snapshot is 70.9 KB for Sol against a fog polygon set in Mappadux - 200 entries of a 400-node system
would be 144 MB. And the action boundary is `BodyBasicsTab.finalizeEdit()`, the release the editor
ALREADY had for autoClassify: one question, one answer, so an undo step always lines up with the
type change the GM watched commit. The 250 ms idle gap is the fallback for controls with no release.

### UI-C5 A rule-pack override is a DELTA, and an editor must open on the EFFECTIVE list
BUCKET: ARCHITECTURE - an override is a DELTA. A whole-list copy FREEZES the shipped defaults at the
moment of the edit, so every later improvement silently stops reaching that campaign and nobody is
told.
WHERE: `lib/rulepackDelta.ts` (`makeListDelta` / `applyListDelta`); `EditBiospheresModal`; the
override merge in `routes/+page.svelte`.
RULE: store the keys and fields the GM changed, plus the key order when it moved. An editor opens on
`applyListDelta(base, stored)` — the pack's list with the campaign's delta laid over it — and saves a
fresh delta against the base. Never open on the stored override directly.
WHY: three costs, and the second is the one that bites. (1) Size — seven pigments with their bands is
a few kB in every save and export, against ~450 bytes for a real edit. (2) A whole-list copy FREEZES
the shipped defaults at the moment of the edit: every later improvement to the pack silently stops
reaching that campaign and nobody is told. (3) A diff of two campaigns cannot show what the GM did.
BLAST: **opening on the stored override is the trap** — a delta has no `.length`, so the old
`overrides.x?.length ? overrides.x : base` idiom silently falls back to the base and the next save
wipes everything the GM had not re-typed. `applyListDelta` still accepts a whole list, because
campaigns saved before this carry one. A key absent from `order` is a DELETION; a field stored as
`undefined` is a field the GM removed. **`liquids` and `gasPhysics` still store whole lists** — same
fault, not yet converted, and they are the next users of this module.

### UI-C2 The picture chain is model > photo > glyph, on every surface
BUCKET: IMPLEMENTATION + ARCHITECTURE - durable: a capability is not keyed on a ROLE. The subject of
a photo can be a planet, a star or a construct, and the display side never asks which.
WHERE: `catalogue/document/guideDocument.ts` (imagery branch), `ConstructPortrait.svelte`
RULE: a construct with a 3D model shows the model; without one, its uploaded photo; without that,
its authored `icon_type` glyph. Same order in the GM pane and the player document. `imagery: 'none'`
still means none.
**A PHOTO IS NOT A CONSTRUCT FEATURE — the subject can be a planet, a star or a construct, and the
display side never asks which** (G20). `catalogue/document/bodyImage.ts` reads `image.url` off any
node and gates on SAME-ORIGIN only; the photo branch in `guideDocument` gates on the imagery mode and
a loaded image, never on `roleHint`. So the model>photo>glyph ordering above is the CONSTRUCT arm of
one chain, not the whole of it — a star's uploaded picture reaches the info panel, the document and
the catalogue with no rendering work at all, which is why G20 was a UI job plus a guard and nothing
more. Pinned by `bodyImage.spec.ts` and the star case in `guideDocument.spec.ts`.
WHY: the order was photo-first and was corrected by owner steer ("if a construct is told to be 3D,
display it first"). A28/A30 are the history: the wrong picture is worse than no picture.
BLAST: any new construct-showing surface. Do not re-derive the chain locally — read these two.

### UI-C4 ONE upload block, three subjects — and `custom` is what holds three DIFFERENT writers off
BUCKET: IMPLEMENTATION - one flag honoured SEPARATELY by three unrelated writers, so a reviewer who
checks one concludes the flag is respected everywhere. Exhibit 5 in faults-the-old-shape-allowed.md.
WHERE: `components/CustomImageBlock.svelte`; mounted by `BodyBasicsTab`, `BodyStarTab` and
`ConstructBasicsTab`; pinned by `CustomImageBlock.spec.ts` and the G20 block in `BodyStarTab.spec.ts`.
RULE: `ImageRef.custom` is ONE flag read by three unrelated passes, and adding a fourth picture
subject means finding that subject's deriving writer and teaching it the flag:
  planet    `SystemProcessor.ts` type image — `roleHint !== 'star' && !image.custom`
  star      `BodyStarTab.updateImage()` class portrait, called from the sync `$effect`
  construct nothing derives one; the photo simply outranks the icon glyph (UI-C2)
Removing clears the WHOLE `ImageRef`, never just the flag — a stale url left behind is still drawn by
every generic `image.url` reader. **And the deriving writer must be re-run by the REMOVE itself**
(`BodyStarTab.onPictureChange`), not left to the next render: the guard makes that call a no-op while
a custom picture is set, so it is idempotent on upload and is the whole of the fallback on remove.
WHY: **the star's writer runs from an `$effect` that re-fires on every pass by design, so an
unguarded custom star image is overwritten before the GM lets go of the mouse** — a feature that
appears to work and silently does not ([[RENDER-S19]]'s failure mode in a different costume). The
three-writers-one-flag shape is the trap: a reviewer checks the processor, finds `custom` honoured,
and concludes the flag is respected everywhere. It is not; each writer honours it separately.
BLAST: a fourth subject; any new writer of `body.image`. **Leaving the fallback to a render passed a
unit test and was wrong in the app** — with the clock paused nothing re-renders, so Remove left a
blank where the portrait should be. Test the BUTTON, not the next class change.

### UI-C3 One shape TABLE, two emitters — and a duplicated table drifts at its FALLBACK first
BUCKET: ARCHITECTURE + IMPLEMENTATION - durable, and the best line in the file: WHEN YOU DUPLICATE A
LOOKUP, THE BRANCH THAT DIVERGES FIRST IS THE ONE NO AUTHOR EVER SELECTS. Review of a duplicated
table looks at the entries; the drift is under them.
WHERE: `constructs/constructIcon.ts` — `constructIconShape` (resolver), `traceConstructIcon` (canvas
path), `constructIconPath` (SVG string), `CONSTRUCT_ICON_SHAPES`; pinned by `constructIcon.spec.ts`.
Six consumers: `holo/scene.ts`, `SystemVisualizer.svelte`, `Starmap.svelte`, `ConstructPortrait.svelte`,
`ConstructModelGraphic.svelte`, `catalogue/document/renderDocument.ts`.
RULE: the vector surface shares the shape TABLE and gets its own EMITTER; it does not get its own
table. A sixth shape must fall out of both emitters at once. Never trace a construct glyph at a call
site — RENDER-S13's rule for hulls, one layer down for markers.
WHY: A34 filed this as "four copies, they agree today, nothing enforces it". They did not agree.
`Starmap.svelte`'s SVG copy fell back to a DIAMOND where the resolver and both canvas copies fall back
to a TRIANGLE — so a construct with no authored `icon_type`, THE COMMONEST CASE, drew as a different
shape on the starmap than everywhere else. The drift the item was filed to prevent had already
happened and nobody had noticed, because it only showed on the DEFAULT.
BLAST: this is the general lesson, not a construct-icon one. When you duplicate a lookup, the branch
that diverges first is the one no author ever selects — the fallback, the empty case, the "or else".
Review of a duplicated table looks at the entries; the drift is under them. The spec asserts the
triangle fallback explicitly for that reason.

#### Body facts (G8) — added 2026-08-04 by the frame/suite-hygiene session

### UI-E3 A bad identifier in a Svelte SCRIPT block survives the build and the whole unit suite
BUCKET: PLATFORM (Svelte + Vite: an undefined identifier is a runtime error the build never sees) +
ARCHITECTURE - a component with branching render paths needs a test that RENDERS each path; assert
it does not throw, not the wording.
WHERE: any component script; the guard is `components/BodyTechnicalDetails.spec.ts`.
RULE: `npm run build` compiles an undefined identifier happily — it is a RUNTIME ReferenceError,
not a compile error — and a unit suite that never MOUNTS the component cannot see it either. A
component with branching render paths therefore needs a test that renders each path, however
shallow. Assert that it does not throw and that its cards exist; do not assert wording or layout,
which churn.
WHY: `ReferenceError: NL is not defined` shipped to beta in this panel's STAR branch and reached
the owner, who found it by clicking a star. The build was green, 2840 tests were green, and
nothing anywhere mounted `BodyTechnicalDetails` — the product's densest read-only surface, forty
cards, several branching on role, with no render test at all. The identifier got there because a
scripted edit wrote a helper's NAME into the source instead of the value it stood for.
BLAST: the same hole exists for every component with no `.spec`. When you add a branch to one
(a new role, a new card, a new tooltip built by string concatenation), render it once in a test.
AND: a browser check skipped is not a browser check deferred — this was reported as "verified by
build and suite but not seen in the browser" one release before it was reported as broken.

### UI-E1 The GM technical block is NOT built from `bodyFacts`, so a shared row must share its BUILDER
BUCKET: IMPLEMENTATION + ARCHITECTURE - durable: a fact that must read the same on two surfaces is
shared as THE FUNCTION THAT WORDS IT, not by adding it to one side's data source - which is what the
next person will reach for.
WHERE: `components/BodyTechnicalDetails.svelte` vs `catalogue/bodyFacts.ts`
RULE: the player surfaces (document, panels, printed report) render rows from `bodyFacts`; the GM's
read-only block is its own hand-written markup and always has been. A fact that must read the same in
both therefore cannot be shared by adding it to `bodyFacts` — the shared thing has to be the function
that words it, called from both. `describeEclipse` is the worked example: three surfaces, one string.
WHY: G8 wrote `describeEclipse` precisely so "the same string reaches the GM panel, the printed player
report and the info panels", then only the player-facing surfaces were wired — the GM block had every
other orbital row and not that one, for 30 versions. The next person to add a shared row will hit the
same shape and reach for `bodyFacts`, which does not reach the GM.
BLAST: adding a row that both sides must show → put the WORDING in a function, call it twice, and
check the two against each other with a real body. Do not copy the format string.

### UI-E2 A panel showing a clock-driven derived value samples the clock on WALL time
BUCKET: ARCHITECTURE - the SIMULATION clock and the SAMPLING clock are two clocks. Sample on wall
time, re-sample on selection change, and null means NO ROW rather than a guess.
WHERE: `components/BodyTechnicalDetails.svelte` (the 1 Hz `eclipseNowMs` sampler), mirrored from
`routes/catalogue/+page.svelte` (`docNowMs`)
RULE: pass the display clock in as a prop, but do not react to it directly. Sample it on a wall-clock
interval, and re-sample immediately when the SELECTED BODY changes so a new selection never waits for
the tick. `nowMs === null` means the caller handed over no clock, which means NO ROW — never a guess.
WHY: the GM clock is broadcast to the player views (`SYNC_TIME` in `SystemView`), so it changes every
frame while playing and jumps arbitrarily while scrubbing. Reacting to it directly re-runs the derived
value per frame; for anything cached forward-only (PHY-6) a backwards scrub then costs a full
recompute per frame.
BLAST: any other panel row derived from a search or a propagation rather than from stored fields.

### DATA-R19 THREE code paths change a campaign's distance unit, with OPPOSITE conventions
BUCKET: ARCHITECTURE + IMPLEMENTATION - durable: RELABEL and CONVERT are two operations over one
ruler, both reachable without touching a coordinate, and the app must not GUESS which the user
meant. Neither path here was wrong on its own; the PAIR was.
WHERE: `map/distanceUnits.ts` (`applyUnitChange`, `campaignUnit`, `normaliseCampaignUnit`);
`SettingsModal.svelte` asks, `routes/+page.svelte:handleSaveSettings` applies, and the Traveller branch
at `Starmap.svelte`'s `effectiveGridType === 'traveller-hex'` is the third.
RULE: changing the unit is a change of RULER, not of layout. Positions are stored in map units and a
distance is `mapUnits / pixelsPerUnit`, so BOTH outcomes are reachable without rewriting a single
coordinate - the z/depth annotation included, for free. Which outcome is meant is the GM's call and the
app must not guess: **relabel** (the numbers were right, the unit was wrong) or **convert** (the map was
right, express it the other way). The arithmetic lives in ONE function; a caller supplies only the mode.
WHY: A43. The three paths disagreed and nothing said so. Settings ALWAYS converted (since v2.1.276); the
Traveller hex grid ADOPTS A RULER FROM GEOMETRY (1 hex = 1 pc, so it writes both the unit and
`pixelsPerUnit` from hex spacing), which as far as the stored figures are concerned is a RELABEL. Load a
light-year map with Traveller mode on and it is stamped `pc` with its light-year figures intact; pick
light years afterwards and Settings converts them - x3.26, and Alpha Centauri reads 14.33 against a true
4.37. **Neither path was wrong on its own; the PAIR was.** Note the inbox row's own diagnosis said "no
conversion", the opposite of the truth, so the fix looked like "add conversion" when RELABEL was the
unreachable case. Re-read the code before trusting a diagnosis, however confidently it is written.
BLAST: the Traveller path is a THIRD legitimate operation and must NOT be folded into `applyUnitChange`
- it answers "what ruler does this grid define", not "what did the GM mean". Keep it stated in place.
Any new writer of `scale.unit` goes through `applyUnitChange` or explains why it is a fourth.
**AND THE UNIT LIVES IN TWO FIELDS:** `Starmap.distanceUnit` and `Starmap.scale.unit` both exist and a
save can carry them DISAGREEING; three sites had each written out their own precedence. `campaignUnit()`
is the single answer (`scale.unit` wins - it sits beside the `pixelsPerUnit` it must change with), and
`withStarmapDefaults` folds them on load so nothing downstream has to care. Readers still spelling it by
hand are a latent third copy: 16 files read `.distanceUnit`, 6 read `scale.unit`, and only the three that
implemented the precedence were migrated - the rest are safe ONLY because the load-time fold makes them
agree. Do not delete that fold thinking it is redundant.

### DATA-R20 UNIT PREFS RELABEL PER QUANTITY x BODY TYPE; STORED VALUES NEVER LEAVE SI
BUCKET: ARCHITECTURE - stored values never leave SI. A preference RELABELS a display, display
converts on the way out, and an edit field converts back exactly ONCE, on commit, never mid-typing.
WHERE: `units.ts` (the ladders, `UNIT_QUANTITIES`, defaults, `migrateUnitPrefs`), `unitPrefsStore.ts`
(`cycleUnitPref` - the ONE writer), `types.ts:Starmap.unitPrefs`, `routes/+page.svelte:
withStarmapDefaults` (load-time migration). Consumed by `components/UnitValue.svelte` /
`UnitInput.svelte`; specs in `units.spec.ts`.
RULE: `unitPrefs` is a SPARSE record `${quantity}:${bodyType}` -> ladder stop, ON THE STARMAP -
campaign data, so it rides save, bundle and the player snapshot, and players inherit the GM's units
non-interactively (`unitPrefsLocked`). Values are validated on READ against the quantity's stops and
fall back to the defaults in units.ts (stars K, worlds C; masses M-Sol/M-Earth/t; orbits 'auto' =
the km-below-`ORBIT_KM_BELOW_AU` magnitude rule). A pref RELABELS a display; storage stays SI
(K, kg, km, km/s) - display converts on the way out, edit fields convert back exactly ONCE, on
commit, never mid-typing. PRESENCE of the record (even empty) is the migration mark for the two
legacy fields (`measurementUnits`/`temperatureUnit`), which coexist until the Settings selector
retires (G34 phase 5): swept panels read prefs, unswept panels still read the legacy stores.
WHY: G34. Built against the A43 scar (DATA-R19): convert-vs-relabel must be explicit, and a unit
choice that touched stored numbers would silently corrupt every campaign it loaded. The migration
takes two conscious losses, recorded on the G34 row: an explicitly-`C` map now shows stars in K,
and an imperial map's sub-threshold PLANET orbit reads km via 'auto' rather than miles.
BLAST: the interstellar MAP unit (DATA-R19, `map/distanceUnits.ts`) is a different concept - never
fold these ladders into it. A new quantity key goes in `UNIT_QUANTITIES`, never as cycle logic in a
component. Anything that builds a snapshot or bundle must keep carrying `unitPrefs` - it rides the
starmap object today, so a field WHITELIST anywhere on that path would sever the inheritance.


---

### TRANSPORT-*  (broadcast.ts — same-machine channel + PeerJS)

### TRANSPORT-1 A broker id collision is RETRIED before it is BELIEVED, prompts ONCE per id, and is never silently re-hosted
BUCKET: ARCHITECTURE + PLATFORM (PeerJS broker) - durable: RETRY BEFORE YOU BELIEVE a collision,
prompt once per id, never silently re-host - and GUARD THE AWAIT, not only the outcome, or a
re-entrant async initialiser collides with ITSELF.
WHERE: `src/lib/broadcast.ts` `initPeerHost` (retry ladder `HOST_RETRY_MS`, `blockedIds`,
`promptedIds`, pagehide release), `initSender` (skips a blocked id), `enableRemote(explicit)`
(the only thing that lifts a block); the GM route's `onHostIdUnavailable` (`+page.svelte`).
RULE: on `unavailable-id` re-register the SAME id with a short back-off (1.5 s, 3 s, 5 s) before
treating it as taken; a holder that survives the ladder gets ONE prompt, after which the id is
blocked from AUTO re-hosting until it changes (the OK path mints a new one) or the GM re-enables
sharing EXPLICITLY (Player Views launcher / `REQUEST_REMOTE`). Release the registration on
`pagehide`. Do NOT auto-host from a dev/localhost origin. Every attempt/outcome is a `perfEvent
('peer', …)` — `__ssePerf.events(60,'peer')` is the one action.
WHY: A57 — the PeerJS broker HOLDS a just-dropped id for a timeout, so a reload of the same map
collided with the tab's OWN previous registration and told the GM "another session is hosting";
OK minted a new id and hosted it silently (looked like a no-op); Cancel left `hostRequested` set
and `SystemView` calls `initSender` on every system entry, so the same id was re-attempted and the
prompt came back on every click. Two users on beta saw it inside a day. The id scheme itself was
never wrong (crypto-random, unique by construction) — the collision was always with oneself, or a
dev preview holding a bundled map's id on the PUBLIC broker.
RULE (amended v2.1.817 - the actual root cause): `initPeerHost` is ASYNC and awaits the lazy PeerJS
import before `this.peer` exists, so it is RE-ENTRANT - every same-tick caller (reactive
enableRemote, onMount initSender, SystemView initSender) opened its own socket for the SAME id and the
broker refused the later ones as `unavailable-id`. A fresh id collided with itself on every load.
Guard the AWAIT (`hostInFlight`: one registration per id), not only the outcome; an id change cancels
the old id's retry ladder; a collision reported for a superseded id never prompts.
BLAST: `initSender` is called from many places (route, `SystemView`, `PlayerViewModal`) — none may
be allowed to re-host a collided id, or the loop returns; and none may start a SECOND registration
while one is mid-await, or the id collides with itself. The prompt handler must never mint on
Cancel. A future SECOND transport (self-hosted broker) keeps this state machine; only the broker
address changes.

## OPEN MISALIGNMENTS

**READ THIS BEFORE YOU DECIDE A SUBSYSTEM IS CLEAN.** These are places where one concept has two or
more implementations that AGREE TODAY. Nothing here is a bug; a working mess is fine. They are listed
because agreement is being held by something incidental — an ordering, a repair, a coincidence of
data — and the failure, when it comes, will look like a fault in whichever copy you did not know
about. NOT a work list. Resolve one only when you are in that area for another reason, and if you do,
say so here.

Format: **WHAT** / where / **WHY IT HOLDS TODAY** / **WHAT WOULD BREAK IT**.

### M1 "Is this a giant?" and "does this have a surface?" are two helpers with overlapping answers
BUCKET: DOMAIN + IMPLEMENTATION - domain: an ICE GIANT is exactly the body two definitions of
'giant' disagree about. Implementation: which repair currently holds them together, and where it
stops (anything drawing from raw or partly-processed data steps outside it).
`physics/makeup.rendersAsGiant` (`gas > 0.5 || isFluidGiant`, i.e. mass > 8 M⊕ AND density < 2.5) vs
`physics/radiation.hasSolidSurface` (`gas <= 0.5`). An ICE giant is ice-dominated with a low gas
fraction, so it is exactly the body the two could disagree about.
HOLDS because `SystemProcessor.reconcileGiantMakeup` runs TWICE (`:455` and `:849`, idempotent) and
rewrites a gas-poor fluid-giant makeup to gas 0.6–0.92 before either helper is consulted; where the
makeup is absent entirely, `makeupFractions` infers it from density and lands gas-dominated anyway.
Checked on the bundled Sol: Uranus and Neptune correctly carry NO `hazard/radiation` tag.
BREAKS IF: `rendersAsGiant`'s consumers are RENDERING code (`planetAppearance`, `apparentColor`,
`holo/scene`, `catalogue/smallBodyShape`) and none of them requires the body to have been through
`process()`. Anything that draws a body from raw or partly-processed data steps outside the repair.
Also breaks if the reconcile is moved, made conditional, or its 0.6 floor is lowered towards 0.5.

### M2 One expression, `makeup.gas` against 0.5, answers at least FOUR different questions
BUCKET: DOMAIN + IMPLEMENTATION - domain: four questions share ONE BOUNDARY and are not one question
in four spellings. Implementation: 30 executable sites across 14 files.
30 executable sites across 14 files. The questions are: *has ground* (`radiation.hasSolidSurface`,
`SystemProcessor:1345`, `cloudDecks:226`, `tagDefaults.SURFACE`), *is a giant* (`albedo:126`,
`SystemProcessor:1036,1163`, `makeup:37,63,102`), *draws as a giant* (`rendersAsGiant`, `apparentColor`),
and *has a surface to rust / to weather* (`cloudDecks:299,363`, `temperature:280`).
HOLDS because the threshold happens to be the same number for all four — see PHY-4's caveat for the
two places it already is NOT.
BREAKS IF: anyone "unifies" them on the strength of the shared constant. They are four questions that
share a boundary, not one question in four spellings, and B36 is scoped as the has-ground one only.

### M3 THREE incommensurable word-vocabularies sit in one info block, and B28's inbox entry is stale
BUCKET: DOMAIN + IMPLEMENTATION - domain: time-to-lethal-dose, an irradiation index and a surface
age answer genuinely different questions, which is PHY-2's whole point. The risk is a reader
treating three vocabularies as comparable.
On Mars: `hazard/radiation = years`, `surface/irradiation = high`, `surface/age = old`. On Io:
`hazard/radiation = hours` beside `surface/irradiation = low`. The first is TIME-TO-LETHAL-DOSE
(`RadiationHazard = 'hours'|'days'|'weeks'|'months'|'years'|'chronic'|'background'`,
`radiation.ts:126`), the second a low/moderate/high index (`SystemProcessor:993`), the third
young/moderate/ancient (`:983`).
HOLDS because each is individually correct and they genuinely answer different questions — which is
PHY-2's whole point, and B28 chose deliberately not to feed the belt into the weathering model.
BREAKS IF: someone reads them as comparable, which a GM scanning tags will. NOTE FOR WHOEVER OPENS
THIS: **B28's own closing note describes a five-word set (`background/elevated/high/severe/lethal`)
that no longer exists** — the vocabulary has already turned over once since the entry was written, so
trust `radiation.ts:126`, not the inbox. B20/B29 own the settlement.

### M4 CLOSED (v2.1.861, properly) One preset field, `draft.grid`, bound by BOTH stages
BUCKET: IMPLEMENTATION (CLOSED) + ARCHITECTURE - durable: A SHARED FIELD AND AN INCOMPATIBLE
VOCABULARY ARE TWO FAULTS THAT LOOK LIKE ONE. When a symptom has two candidate causes and one is
cheaper, check whether the cheap fix merely stops the symptom being OBSERVABLE.
WAS: `PlayerPresetEditor` rendered `MAP_OVERLAY_OPTIONS` (7, hexes included) for the starmap and
`SYSTEM_OVERLAY_OPTIONS` (4, hexes filtered) for the system, both `bind:value={draft.grid}`. It held
at RENDER time because `forSystemScale` folded a hex to `square`, and broke in the EDITOR: choose
Traveller hex for the starmap, open the system tab, and that `<select>` had no matching option — so
touching it wrote the system's choice back over the starmap's. A37 recorded it unnumbered.
CLOSED ONCE, WRONGLY, at v2.1.854, by making the two option sets identical. That was a real fix to the
LOSSY half and it left the SHARING untouched — one field still meant one choice, so setting the
starmap to hexes now cleanly and visibly changed the system map as well, and back again. The owner
reported it within the hour: "they are independent" was the requirement, and identical option sets are
the opposite of independence. The entry's own prescription was "two fields or one filtered writer, not
a third option list", and the v2.1.854 note argued that away as more code than deleting a filter. THE
ENTRY WAS RIGHT. Both halves needed doing and only one was done.
FIXED at v2.1.861 by the split: `starmapGrid` beside `grid`, falling back to it in `normalizePreset`
exactly as `starmapOverlay ?? overlay` does three lines above, so a preset written before the split
opens unchanged. Every other twin in this file was already split — `gridDepth`/`starmapGridDepth`,
`gridFalloff`/`starmapGridFalloff` — and the type was the last one sharing. Keeping the sets identical
is still right and still stands; it is what makes the split lossless in both directions.
LESSON, and the reason this entry keeps its history rather than being rewritten clean: A SHARED FIELD
AND AN INCOMPATIBLE VOCABULARY ARE TWO FAULTS THAT LOOK LIKE ONE. Fixing the vocabulary made the
sharing MORE visible, not less — before, the fold hid it. When a symptom has two candidate causes and
one is cheaper to fix, check whether the cheap one merely stops the symptom being observable.

### M5 Three generation paths seed an rng from `Date.now()`, inside a codebase built on reproducibility
BUCKET: IMPLEMENTATION + ARCHITECTURE - durable: DATA-G1's boundary. A one-shot AUTHORING action may
use wall-clock randomness because nothing replays it; anything on a load, import, rebuild or replay
path may not.
`system/modifiers.ts:55`, `:215`, `:429` — `new SeededRNG(sys.seed + Date.now())`, with the comment
"Use a new RNG seed to avoid determinism issues".
HOLDS because these are one-shot AUTHORING actions (a GM adding or re-rolling a body); the result is
stored, and nothing replays them. Same licence as the `Math.random` sites in `SystemView.svelte`.
BREAKS IF: any of it is ever called from a load, an import, a rebuild or a replay — then the same
input produces a different system every time and no test can pin it. DATA-G1 is the rule these sit
outside of; the comment is the honest signal that someone already met the tension and moved on.

### PHY-21 A SEA'S OWN VAPOUR IS DERIVED, AND ITS SATURATION CURVE IS SHARED WITH THE CLOUD MODEL
BUCKET: DOMAIN + ARCHITECTURE - domain: a saturation curve goes to nothing SMOOTHLY, including by
sublimation from a frozen sea, so there is no branch to fall off; and the column mean and the
near-surface fraction are legitimately different numbers. Architecture: one curve, two consumers,
and an authored value is a FLOOR on the derived one.
WHERE: `physics/liquids.ts` `surfaceVapourSource` (the shared answer), `physics/atmosphere.ts`
`evaporatedVapourFraction` (column mean, feeds the greenhouse), `physics/cloudDecks.ts`
`evaporationFraction` (near-surface, feeds the decks). Constants:
`climateModel.greenhouse.vapourColumnMeanHumidity` / `vapourColumnMaxFraction`.
RULE: nothing may invent a second saturation curve, a second liquid-to-gas lookup, or a hardcoded
H2O. The two consumers legitimately want DIFFERENT numbers — the cloud model wants the fraction at
the ground, because that is what condenses at the lifting condensation level; the greenhouse wants
the COLUMN MEAN, because that is what absorbs through the column, and it is several times smaller.
So they keep their own humidity factors and share everything else. An authored composition value is
a FLOOR on the derived one, never a ceiling and never an off-switch.
WHY: the term used to be gated `surfaceTemp > 273 && < 373`, which put a ~10 K STEP into a loop that
feeds itself — a world a hair below freezing lost its whole vapour greenhouse, and losing it is what
kept it below freezing. Measured on the reported world (Traveller "Standard - Earth-like", 0.95 bar,
70% hydrographics, Sun): the greenhouse collapsed 35.3 K -> 24.7 K across one 0.1 AU step and the
world went +16.9 C -> -2.4 C and froze. A saturation curve goes to nothing smoothly, INCLUDING by
sublimation from a frozen sea, so there is no branch to fall off. Do not put a liquid-only phase gate
back on the greenhouse side: that is the same cliff wearing a different hat.
BLAST: calibration is Earth and only Earth (288 K, 1 bar, 71% ocean -> the 0.4% its composition
declares), and it is calibrated against THE PACK'S saturation curve, which reads about 24% low at
288 K versus measurement because it log-interpolates three anchors. Change `liquids.json`'s water
anchors and `vapourColumnMeanHumidity` must be re-derived or every wet world shifts. The bundled
Earth is pinned only because its authored 0.00398 sits just ABOVE what the derivation returns at its
own converged 287.4 K — a ~5% margin, not a wide one.

### PHY-22 -1 IS A SENTINEL ON THE FLIGHT BUDGETS, AND `ascentBudgetApplies` IS THE ONLY READER OF IT
BUCKET: ARCHITECTURE - a SENTINEL in a numeric field is a claim four consumers will each read
differently (-1 is truthy). Publish a PREDICATE and its reason, and keep the row visible either way
- a vanished row reads as a bug.
WHERE: `physics/orbits.ts` `calculateDeltaVBudgets` (writes -1) and `ascentBudgetApplies` (decides).
Consumers: `catalogue/bodyFacts.ts`, `reports/ReportDocument.svelte`,
`components/BodyTechnicalDetails.svelte`, `core/SystemProcessor.ts` (the `flight/ascent` tag).
RULE: never test `loDeltaVBudget_ms` for truthiness and never compare it to -1 by hand. Ask the
predicate whether a surface budget MEANS anything on this body; publish the figure if it does and the
predicate's `reason` if it does not. The row stays visible either way - a vanished row reads as a bug.
WHY: -1 is truthy. Two of the four consumers tested it that way, so every belt and ring in the app
published "Ascent Dv -0.0 km/s"; a third printed "-1.0 m/s"; and only the tag gated properly, so the
tag said nothing about Jupiter while the info block beside it read 50.3 km/s. Four consumers, four
different ideas of what -1 meant (inbox B37).
BLAST: the predicate asks `hasSolidSurface`, NOT a `classes` regex on "gas-giant". The technical panel
used the regex, so ICE giants fell through it and published a surface-to-LO figure for a world with no
surface - the B11 class-regex fault, alive in a copy. If you add a fifth consumer, the danger is that
`calculateDeltaVBudgets` returns EARLY without writing anything when `calculatedGravity_ms2` or
`radiusKm` is missing, so the field can also be `undefined` rather than -1.

### CLASS-1 THERE IS ONE CLASSIFIER, AND A PACK WITHOUT FINGERPRINTS GETS ONE BASE CLASS BY MASS
BUCKET: ARCHITECTURE - one classifier, an explicit named fallback, and a warning that names the
pack. The deleted rival was never REACHED and was not inert: measured, the two engines disagreed on
essentially every body and no test could have told you which was right.
WHERE: `system/classification.ts` `classifyBody` / `fallbackBaseClass` / `warnIfLegacyRules`;
`rulepack-loader.ts` calls the warning. `ClassifierSpec.rules` survives in the type as `unknown[]`
so an old pack still PARSES, and is read by nothing.
RULE: do not reintroduce an additive-score seam beside the fingerprint engine, and do not treat
`classifier.rules` as a fallback. A pack with no fingerprints classifies to `fallbackBaseClass` —
terrestrial or gas-giant by mass, `planet/unclassified` when even the mass is missing — and its
author gets a console warning naming the pack.
WHY: the seam was never REACHED (every shipped pack carries fingerprints and the early return took
them) but it was not inert: measured over the 167 planets and moons in the bundled examples through a
fingerprint-stripped pack, 43 of its 50 rules fired and the output was worse on every body compared.
`planet/silicate` (density > 1.5) hit 136 of 167; Io lost its sulfur, Europa its subsurface ocean,
`hot-eyeball` landed on a gas giant. It also held a copy of the classifier predating B6 (eyeballs
moved onto surface temperature) and B25 (the surface gate), and a rule calling any body under 10
Earth masses with irradiation over 1000 a stripped gas-giant core (inbox B67, D12).
BLAST: `minScore` went with it — nothing reads it. If you ever need a fingerprint-less pack to
classify richly, the answer is to GENERATE fingerprints, not to restore scoring: the two engines
disagreed on essentially every body and there was no test that could have told you which was right.

### GEN-6 ONE STAR-HIERARCHY PLANNER, AND THE TRAVELLER PATH WIDENS IT RATHER THAN REPLACING IT
BUCKET: DOMAIN + ARCHITECTURE - domain: a hierarchy is not a set of orbits round one centre, and a
TIGHT pair is the wrong answer when the ruleset mandates a habitable-zone main world. Architecture:
PLAN, then WALK, with the callers differing only in a factory; and look a leaf up by ID, because the
planner sorts by mass and an index is a rank.
WHERE: `generation/generateFromConfig.ts` `planStarHierarchy` (the plan) + `buildStarHierarchy` (the
walk, exported for this); `traveller/importer.ts` calls both with its own star factory.
RULE: never lay stars out by hand. Plan, then walk. The two callers differ ONLY in how a plan LEAF
becomes a body - the generator evolves a `StarSeed`, the importer resolves Traveller's stated class
("F7 V") through the shared resolver - and that difference is the `makeStar` factory argument.
**LOOK A LEAF UP BY `seed.id`, NEVER BY `leaf.index`:** the planner SORTS seeds by mass before
numbering them, so an index is a mass RANK and matches an input listing only by luck.
WHY: the importer had its own layout - one barycentre for the first pair, further stars appended
round that same centre at `1000 * 1.5^k` AU with `e` 0.1-0.6 and **`i_deg` uniform on 0-180**. On the
owner's Caladbolg that put B and C round one centre at 1,024 and 1,342 AU with e ~0.5-0.6 (crossing
orbits, not a hierarchy) at 96.8 and 79 degrees, period ~33,000 years (inbox D27).
BLAST: the planner's default pair is TIGHT (`closeSepAU` ~1.4 AU at 1.7 solar) because the generator
puts its own planets CIRCUMBINARY. Traveller cannot: its UWP mandates a Main World in the primary's
habitable zone, so a tight pair is a WORSE answer than the crossing orbits it replaced - Caladbolg's
Main World at 2.23 AU inside a 1.34 AU pair. The importer therefore scales every separation by ONE
factor until the primary's S-type bound (`S_TYPE_FRAC * sep`) clears the Main World. One factor is
what keeps it honest: all level ratios, and so the ~7x margin, survive untouched. If you add a third
caller with planets on a star rather than on a barycentre, it needs the same step.

### GEN-7 WHOEVER CALLS `infillSystem` FROM A UI MOUNTS `GenerationDials` AND PASSES ITS KNOBS
BUCKET: IMPLEMENTATION + ARCHITECTURE - durable: a UI that runs a generator WITHOUT its knob panel
silently chooses the flavour for the user; and a band that narrows under a slider must RE-CLAMP what
the slider already holds.
WHERE: `components/GenerationDials.svelte` (the one panel) mounted by `GenerationWizard`,
`ImportModal` (file / SpaceEngine / Universe Sandbox), `RealSkyImportModal` and
`AddTravellerSystemModal`. Threaded via `realsky/fillout.ts FillOutOptions` and
`TravellerImporter.generateTravellerSystem(data, pack, opts)`.
RULE: a UI that runs infill without the panel is silently choosing the GM's flavour for them. Both
new mounts thread `knobs`; the age is bound to the SYSTEM's age, not only to the generated bodies,
or the system card disagrees with the slider that set it.
WHY: the dials were on one path of three. The catalogue path called `infillSystem(system, pack,
{ seed })` and the Traveller path passed nothing - while `importer.ts`'s own comment promised "the
panel lets them adjust" of a panel that did not exist there (inbox G33).
BLAST: THE TWO NEW MOUNTS ARE NOT COPIES OF THE FIRST, and the differences are deliberate. (a) The
catalogue path shows NO age control: a region brings back every star within N light years and they
are not the same age, so one slider would be wrong for most - each system keeps the guess from its
own star. (b) The Traveller panel appears only when `W > 1`; MEASURED, the importer gates infill on
`totalWorldsCount > 0` and W parses to 0 when blank, so a blank W generates nothing and the field's
own "Auto / generated from PBG" hint is a promise nothing keeps. (c) The Traveller age band comes
from `travellerAgeGuess`, which re-reads the star list on every keystroke - so it must also RE-CLAMP
the chosen age, because narrowing the band under a slider the GM already moved (typing "A2 V" over
"G2 V" drops the ceiling from 12.3 Gyr to 2.47) otherwise hands the generator an age past that
star's whole life, and the panel clamps its DISPLAY so the fault would not show on screen.

### UI-B1 A REALISM BAND SAYS UNLIKELY, NEVER INVALID, AND ITS EDGES ARE PACK DATA
BUCKET: ARCHITECTURE (product contract) - the house rule as a control: a band says UNLIKELY, never
invalid; its edges are DATA, not code constants; and an edge value reads as the KINDER band so
nudging onto a boundary never scolds.
WHERE: `components/BandedSlider.svelte` (`realismBandFor`, `realismWording`, `bandOf`);
`generation_parameters.realism_bands` in the pack; mounted through `GenerationDials`.
RULE: the component takes a band and NEVER computes one - no default band, no code constant, no
"sensible middle" if a pack omits it. A pack with no entry renders a plain slider. Amber reads
"few real systems look like this" and RED still says "still allowed, still physical", because
nothing is forbidden at any setting: this is the slider form of "hand authoring is hand authoring -
show the problems in tags and allow it". Green lies INSIDE amber; an edge value reads as the KINDER
band, so nudging onto a boundary never scolds.
WHY: it is a VOCABULARY, not a feature of one control (inbox G24). Writing it for the material
slider alone was the named point-solution trap, and hardcoding the edges would make a GM running a
deliberately fantastical setting fight the UI instead of moving the goalposts.
BLAST: **the strip must be drawn BENEATH the track, not behind it.** Absolutely positioned behind a
native range input it has correct geometry and is invisible - the input's own runnable track paints
over it, which measures fine in the DOM and shows nothing on screen. Found by eye, after the geometry
checked out. Anything reusing this for a physics control inherits that.

### PHY-23 THE KILL ZONE DERIVES, AND IT HAS TWO HAZARDS BECAUSE ONE LETTER COULD NEVER CARRY BOTH
BUCKET: DOMAIN + ARCHITECTURE - domain: photospheric UV alone makes every cool dwarf safe
(contradicting the whole M-dwarf habitability argument) and coronal output alone makes every hot
star safe, which is worse - so the hazard needs BOTH. Architecture: never read a stored dial back in
through the side door, and a quantity the processor writes is NOT STABLE across a pass.
WHERE: `physics/zones.ts` `calculateKillZone`; `physics/spectrum.ts` `blackbodyFractionBelowNm`;
`physics/ionisingOutput.ts` `ionisingOutputSolar`. Constants
`generation_parameters.uv_damage_edge_nm` / `kill_zone_sol_au`.
RULE: everything comes from `getLuminosity` (R^2 T^4) and the star's own temperature and
`flareActivity`. Never `star.radiationOutput`, and never `bodyIonisingOutputSolar` here - that reads
the stored luminosity and would take it back in through the side door. The hazard is the MEAN of two
relative terms, photospheric UV and coronal ionising output, so Sol is exactly 1 by construction.
WHY: it was `0.1 * sqrt(uvFactor * star.radiationOutput * L)`, and all three factors were wrong
(inbox B81, owner decided DERIVE). The stored dial has drifted up to 60,000x (B57) and was
multiplying the COMPUTED luminosity by the STORED one - the same quantity twice. The `uvFactor`
switch tested `classes[0].split('/')[1]` against single letters, so "G2V" matched NOTHING and every
properly classified star fell to 1.0; only a bare BAND key matched, and `star/M` and `star/M4V` came
out 3.2x apart on spelling alone (DATA-R18). Its default handed brown dwarfs, white dwarfs and
neutron stars a Sun-like UV factor.
BLAST: THE KILL ZONE IS NOT STABLE ACROSS A PROCESSING PASS, because `flareActivity` is a field the
PROCESSOR writes. Measured on a Sun-like star: unprocessed it has no activity and the zone is
0.08998 AU; after one `process()` it carries 0.0518 and the zone is 0.09995 — an 11% jump for the
same star. That is not a fault (generation always sees an unprocessed star, and `process` settles
from pass 1), but anything that compares a zone computed BEFORE a pass with one computed AFTER is
comparing two different questions. It cost a real, order-dependent test flake that passed in
isolation and failed under the full suite: a shared star fixture, mutated by the first draw, moved
the floor under every later assertion. Clone the star, or ask at one point in the lifecycle only.
Also TWO HAZARDS IS THE POINT, not a flourish. Photospheric UV alone makes every cool dwarf safe,
which contradicts the whole M-dwarf habitability argument; coronal output alone makes every hot star
safe, which is worse. Measured after: O5V 63 -> 301 AU, neutron star 0.018 -> 0.090, Sol 0.100 ->
0.090, every cool dwarf about 0.56x. **No body stores a kill zone** - it is computed on demand for
the UI and for `generation/placement.ts`, so the derived fixture does NOT move and an empty diff
there is the correct result, not a sign the change did nothing.

### GEN-8 A BODY'S AIR IS CHOSEN FOR THE ORBIT IT IS BORN AT, SO WHERE IT IS BORN IS A PHYSICS DECISION
BUCKET: DOMAIN + ARCHITECTURE - domain: orbital distance is a RATIO quantity so it is drawn
log-uniform, and the inner limit is the Roche limit and the kill zone rather than the stellar
surface. Architecture: the air is chosen for the orbit a body is BORN at and moving it never
re-rolls - correctly - so a body born in the wrong place is permanently wrong in a way no dragging
repairs.
WHERE: `system/modifiers.ts` `addPlanetaryBody` (`logUniform`, `preferredOrbitBandAU`, the inner
limit); `generation/planet.ts` selects the atmosphere by filtering the pack's entries on the body's
`Teq_K`, which comes from the orbit it was handed.
RULE: never treat "which orbit" as cosmetic. The atmosphere draw is downstream of it, and MOVING a
body afterwards does NOT re-roll its air — correctly, because authored data stands. So a body born
in the wrong place is permanently wrong in a way no amount of dragging repairs.
WHY: inbox B84, reported as "a freshly created planet is too cold until well inside the goldilocks
zone". Everything downstream was honest; the orbit was drawn UNIFORMLY from a gap running 0.009 to
172 AU on a bare Sun-like system. Measured, same seed and same final orbit of 1.2 AU: born there,
+28 C with 4.2 bar; born at 40 AU and dragged in, -28 C with no atmosphere. 56 K, decided by nothing
but where it appeared.
BLAST: three separate corrections, and each is derived rather than preferred. (1) LOG-UNIFORM, not
uniform: orbital distance is a ratio quantity and every spacing law in this engine is geometric, so
a linear draw over four decades buries 99% of results at the far end. (2) The non-giant branch now
prefers INSIDE the ice line, which is the exact mirror of the giant branch that already preferred
outside it, for the same reason. (3) The inner limit is the ROCHE LIMIT and the KILL ZONE, not the
stellar surface — `placement.ts` already refuses one and warns about the other. A gap that STRADDLES
the ice line used to be dropped by both buckets, so a bare single-star system could not take a
planet at all; it is split at the line now. Measured after: median orbit 72.5 -> 1.53 AU, worlds
with an atmosphere 15% -> 43%.

### RENDER-S30 A COVERED VIEW IS NOT AN UNMOUNTED ONE, AND A 0x0 MEASUREMENT IS NOT A SIZE
BUCKET: PLATFORM (browser layout / ResizeObserver) + ARCHITECTURE - a 0x0 measurement is NOT A SIZE,
and a COVERED view is not an unmounted one, so 'the observer ought to have fired' stops being
reliable exactly there.
WHERE: `starmap/Starmap3DView.svelte` and `holo/HoloView.svelte` (`push`, `revalidate`, `onReveal`);
`routes/catalogue/+page.svelte` `dismissCover`.
RULE: never hand a renderer a content rect below 1 px — a container that is momentarily unlaid-out
reports 0x0, and taking that as a size sets a 2x2 backing store that the next real frame draws
stretched across the viewport. And re-read the container on REVEAL: a ResizeObserver is the only
thing watching, and a view that was covered rather than unmounted is exactly where "the observer
ought to have fired" stops being reliable.
WHY: inbox A62 — resize while the player's COVER PAGE is up and the starmap revealed afterwards is
stretched, intermittently. The stage is `position: absolute` UNDER the cover, so it stays laid out
and the observer ought to fire; the fault is that nothing re-measures when it comes back.
BLAST: `dismissCover` fires a WINDOW RESIZE EVENT rather than calling into each view. That is
deliberate — the page must not need to know which renderers exist, and a view that does not listen
is simply unaffected. If you add a renderer with its own observer, add the listener too or it will
not be revalidated. NOT REPRODUCED on the live surface: reaching the player catalogue view needs a
broadcast session between two windows, so the guards are unit-tested (`starmap/revealResize.spec.ts`)
and the live check is still owed.

### NET-1 A LOCAL LINK HAS NO BYTES, AND PRESENCE IS THE ONLY WAY TO COUNT ONE
BUCKET: ARCHITECTURE (instrumentation) + PLATFORM (BroadcastChannel structured clone) - durable:
measure only where the bytes are ALREADY being computed; never stringify a payload to print a number
about it; and a zero meaning 'not measured' must not read as a zero meaning 'nothing sent'. Also: an
id must live in the SAME SPACE the other side already knows that window by.
WHERE: `broadcast.ts` (`TransferMeter`, `announcePresence`, `connectionCounts`, `peerLinks`);
`transferReport.ts` (the one formatter); `playerConnections.ts` (the store the rail reads).
RULE: measure bytes only where they are ALREADY being computed — `sendIfChanged` serialises for its
dedupe, `sendPeer` for the frame limit, and a large inbound payload arrives in chunks that carry
their own strings. Never stringify a payload to print a number about it: that is the cost this
feature exists to expose. A same-machine BroadcastChannel hands over a structured clone, so it has
NO bytes and must say so rather than report 0.
WHY: a GM needs to tell over-transmission (many bytes) from slowness (few bytes, long wait), and a
zero that means "not measured" reads identically to a zero that means "nothing sent".
BLAST: three traps, each of which silently produced a plausible wrong answer.
(1) **Presence is keyed on a WINDOW id, not `sessionId`.** On a receiver `sessionId` is the id being
LISTENED TO, and a player opening a bare `/catalogue` link has none — so keying on it disabled the
whole count for exactly the case it exists to serve, with no error anywhere.
(2) **Meter at `sendMessage`, never at both it and `sendIfChanged`** — the latter CALLS the former,
so recording in both double-counts every throttled message, and recording only in the latter makes a
player window report that it has sent nothing (the join burst and every player request go out raw).
(3) **A GM has no meter for a LOCAL window** — there is no connection object to attribute to — so
its per-link figures come from what the player REPORTS about itself. That is the only source, not a
fallback. Remote links are the other way round: known directly, and countable the instant they
connect, whereas a local one appears within a heartbeat and drops after `PRESENCE_TTL_MS`.
(4) **A REMOTE window must announce under its BROKER id, a local one under its window id** — the id
in the announce must live in the SAME space the GM already knows that window by. The first cut
announced the windowId for both, so one remote guest existed twice (once as its connection's
`conn.peer`, once as `w-…` in presence): `connectionCounts` unioned the two and the rail icon
counted every remote guest twice while the list — which skips remote presence entries — stayed
right, and `peerLinks` could never find the reported stats it looked up by broker id. Owner-caught
(list 2, icon 3). Fixed v3.0.10.

### M7 The Hill radius has TWO formulas, and they disagree by (1-e)
BUCKET: DOMAIN + IMPLEMENTATION - domain: the Hill radius at PERIAPSIS and at the SEMI-MAJOR AXIS
are two defensible answers to two questions, and they part at eccentricity. Implementation: five
copies, and the one that must not be recomputed is the one a drawn boundary and a judged one share.
`physics/stability.ts:hillRadiusAU` uses `a*(1-e)*cbrt(m/3M)` — PERIAPSIS, the host's weakest grip,
which is what a "is this orbit safely inside" verdict should be judged at. `physics/twoBodyCoast.ts`
(`hillCandidates`, both wrappers) uses `a*cbrt(mu/3hostMu)` — SEMI-MAJOR AXIS, no eccentricity term.
Three further copies exist (`orbits.ts:425` SOI, `import/ubox/hierarchy.ts:79`, and the mutual-Hill
pair form in `infill.ts:70` / `placement-strategy.ts:151`, which is a different quantity).
HOLDS because the two never had to agree: the periapsis form only ever produced verdicts and the
semi-major form only ever produced drawings, and on the circular orbits most bundled pairs have they
are the same number. Pluto-Charon at e=0.249 is where they part — 4.0e-2 AU judged, 5.3e-2 AU drawn.
BREAKS IF: someone draws a boundary the physics also judges against, which is exactly what G45's
display half is for. That is why `Barycenter.circumbinary.outerAU` is PUBLISHED (PHY-30) instead of
the overlay computing its own: a ring drawn from the a-based formula around a verdict made with the
periapsis one puts a condemned planet visibly inside the safe zone. Also breaks if anyone "unifies"
them without deciding WHICH question each caller is asking — PHY-29 is the precedent for keeping two
answers on purpose.

### M6 Cross-references — recorded as caveats on the entries they falsify, listed here so the sweep is one place
BUCKET: (map apparatus - not an engine entry) - the cross-reference index for falsified WHEREs. The
PRACTICE carries into any long-lived map: record a contradiction as a caveat ON the entry it
falsifies and index them in one place. The contents do not carry. Its last bullet is now STALE - see
the correction below.
- **PHY-4 CAVEAT**: B36's "they all use the same BOUNDARY" is false twice — `SURFACE()` is strict
  `< 0.5` where `hasSolidSurface` is `<= 0.5`, and B25's classifier gate is a BAND, so `bandFit`'s
  15% soft edge means it really closes at 0.575, not 0.5.
- **TAG-1 CAVEAT**: `SystemProcessor.ts:899` is a hand-rolled NAMESPACE strip outside
  `stripForReprocess` (for a stated reason), and four sites strip "legacy" against three different
  definitions of legacy.
- **DATA-G1 BLAST**: three `hash01` copies, one at a different modulus (`1e6` vs `1e5`); two different
  classes both exported as `SeededRNG`.
- **PHY-8 BLAST**: `calculateTotalStellarRadiation` survives as a third, flare-less sum — deliberate,
  it feeds atmospheric escape, and it must not be promoted into a dose.
- **PHY-13 BLAST**: eight hand-written belt exclusions with no shared predicate, plus three MORE
  `roleHint === 'belt'` tests that answer unrelated questions.
- **PHY-29 CAVEAT**: "the one shared formula" is scoped to `twoBodyCoast`; `stability.ts` has a
  second Hill radius that differs by (1-e). Recorded as M7, not resolved.
- ~~**ID COLLISION**: `PHY-17` is used TWICE — "A luminosity class is radius at a temperature" and
  "Has ground is hasSolidSurface".~~ **RESOLVED, and this bullet was stale.** The 2026-08-26
  renumbering at the head of this file moved the second claim to `PHY-28`; grep confirms exactly one
  `### PHY-17` and one `### PHY-28` at v3.0.149. Struck 2026-08-28 by the carry-forward sort.
- **ID COLLISION, LIVE, TWO OF THEM** — found 2026-08-28 by the carry-forward sort, FLAGGED NOT FIXED
  (the criterion doc forbids renumbering). `RENDER-S36` is claimed by "A SAMPLER THAT ANSWERS FOREVER"
  and by "HOW MUCH METHANE YOU SEE"; `RENDER-S37` by ""HAS A ROUTE" IS NOT "IS FLYING"" and by "AN
  AURORAL OVAL". **`RENDER-S37` IS CITED FROM CODE WITH BOTH MEANINGS** — `planetTexture.ts:667` means
  the aurora, `SystemVisualizer.svelte:1072` means the route — and the inbox splits the same way (B101
  aurora, B104 route), so a reader following either citation reaches a coin toss. `RENDER-S40` and up
  are free. This is the third and fourth collision this month, which is what makes the "grep BOTH
  forms" rule at the head of this file worth ENFORCING rather than stating.

### Checked and NOT a misalignment, so nobody re-checks it
- `attachHullVolume` and the read-time path at `holo/scene.ts:3529` both write `v.shipLen`, but they
  cover DISJOINT populations (model-less constructs vs model-carrying ones) and compute it from the
  same `shipLenScene(node)`. Two writers, no overlap.
- `hasSolidSurface` on an ICE giant: the B11 class-regex bug is genuinely gone. Uranus and Neptune
  infer gas-dominated from density and correctly take no surface hazard tag.

### LGR-1 One Lagrange convention, one module — and the l1/l2 hostMu is scaled ON PURPOSE
BUCKET: DOMAIN + ARCHITECTURE - domain: l3/l4/l5 are the secondary's ellipse rigidly ROTATED in
omega, l1/l2 scale BOTH a and hostMu so a standard propagator returns the right period and the
co-rotating velocity exactly, and an M0-shift is NOT a rotation for e>0. Architecture: one
convention, one module, never restated - five rival conventions shipped before this.
WHERE: `physics/lagrange.ts` (the whole module); every consumer of "where is an L-point".
RULE: all five points derive from the secondary via `coOrbitalRelState`/`deriveCoOrbitalOrbit`:
l3/l4/l5 = the secondary's ellipse rigidly rotated in omega (+180/+60/-60, sign flipped for a
retrograde secondary) with the SAME mean anomaly and epoch; l1/l2 = a_AU scaled by (1-/+k) AND
hostMu scaled by (1-/+k)^3, k the Hill cube-root factor. Never restate either transform anywhere,
and never "fix" an l1/l2 orbit's hostMu back to G*M — the scaling is what gives the standard
propagator the secondary's period AND the co-rotating velocity (1-/+k)*v, both exact.
WHY: five independent conventions shipped before G43 (overlay ellipse-at-f+-60, authoring M0-shift,
transit-phantom M0-shift, scheduler omega-rotation, planner-dropdown SOI radii) and eccentric L4
arrivals teleported up to ~0.5 AU between two of them; a panel Mars L1 plan flew to 0.007 AU from
the SUN because a planet-centric distance was read as a heliocentric a_AU. An M0-shift is NOT a
rotation for e>0 (the gap is order 2*e*a).
BLAST: transit calculator + scheduler still hold their local copies until G43 P4 deletes them;
`lagrange.spec.ts` pins the exactness claims. If a test asserts hostMu == parent mass * G for a
co-orbital node, the test is wrong.

### LGR-2 A co-orbital orbit is DERIVED from a SIBLING, which parent-before-child does not order
BUCKET: DOMAIN + ARCHITECTURE - domain, and this is first-order for a new pass model: THE DEPENDENCY
IS ON A SIBLING, so parent-before-child does not order it. The derivation graph of a star system is
not a tree. Read beside PHY-1 and PHY-12.
WHERE: `physics/lagrange.ts deriveCoOrbitalOrbits` (Pass 0c), called from `SystemProcessor.process`
after the barycentre passes and before physical basics.
RULE: a node with `coOrbital` gets its `orbit`, `parentId` and `ui_parentId` REWRITTEN from its
secondary every pass. The dependency is on a sibling (both orbit the same host), so the usual
parent-before-child iteration says nothing about it — ordering lives inside the pass (recursive,
cycle-guarded). Do not read a co-orbital node's orbit in any pass that can run before 0c, and do
not hand-edit its elements (the next process() reverts them; the marker is the authored record).
WHY: the pre-G43 authoring model copied the secondary's orbit ONCE at placement, so every later
edit of the secondary silently stranded its L4/L5 riders off the point — the bundled Uggi map
ships fifteen constructs that had this fault latent.
BLAST: a dangling marker (secondary deleted) is self-healed by DELETING the marker and keeping the
last derived orbit as authored. `importFixup.migrateLagrangePlacements` upgrades legacy placement
strings (L4/L5 + ui_parentId) to markers on load, marker-guarded.

### LGR-3 Flying to an L-point: the solver phantom and the parked point must be ONE object
BUCKET: ARCHITECTURE + DOMAIN - architecture: the target a plan brakes against and the point it
parks on afterwards must be ONE derived object; two constructions of one geometry is a teleport.
Domain: velocity cancelling is what rendezvous with a massless phantom already MEANS.
WHERE: `transit/calculator.ts` (the `isLagrange` arrival block, and the `r2` baseline below it);
`transit/scheduler.ts samplePostJourneyState`. Both call `deriveCoOrbitalOrbit`.
RULE: the target a plan brakes against and the point the ship is parked on afterwards are the same
derived orbit. Velocity cancelling is not a step — it is what "rendezvous with a massless phantom"
ALREADY means, so it is correct exactly while both sides share one geometry. Never reintroduce a
local L-point construction on either side, and never feed `parkingOrbitRadius_au` into an L-point:
the derived orbit already carries the radius, scaled by (1-/+k) for the collinear points.
WHY: they used to differ — a MEAN-ANOMALY shift in the solver against a rigid OMEGA rotation in the
sampler — so a plan braked to 0 m/s relative to a place the ship was then teleported away from.
Measured before the fix on the Sol fixture: Jupiter L4 0.31-0.48 AU of jump with a 0.6-13.3 km/s
velocity step; a Mars L1 plan terminated 0.0066-0.0075 AU from the SUN and 1.4 AU from Mars,
because the planner passed the dropdown's PLANET-CENTRIC L1 distance and the solver read it as a
HELIOCENTRIC a_AU. After: 0 km and 0.0 m/s on every Efficiency/Speed plan to l1..l5.
BLAST: `lagrangeArrival.spec.ts` is the gate and carries the before-numbers. `targetOffsetAnomaly`
is RETIRED from the solver params — the geometry is not a caller's business. The `Complex`
gravity-assist family is EXCLUDED from those assertions and is a separate known fault ([[B86]]):
it publishes `arrivalVelocity_ms = 0` with no Flyby warning while arriving km/s fast, on ordinary
destinations too.

### PHY-29 Hill spheres are asked TWO questions, and the answers must stay different
BUCKET: DOMAIN + ARCHITECTURE - domain: 'what bounds this body's gravity' and 'where does the
propagator switch frames' are different questions with different floors. Architecture: two answers
kept apart ON PURPOSE, both stated - and a display gate that is GEOMETRIC (the Hill radius must
clear the body's own surface) is self-scaling and needs no constant.
WHERE: `physics/twoBodyCoast.ts` — `hillCandidates(system, rootId, includeMoons)` with two wrappers:
`soiCandidates` (coast, moons EXCLUDED) and `hillSpheresAu` (display, moons INCLUDED).
RULE: "what bounds this body's gravity" and "where does the propagator switch frames" are not the
same question. The patched-conic coast hands off at planets and companion stars only — a moon SOI
handoff is NOT modelled — while the display wants a moon's bubble precisely because that is where a
submoon could live. Do not re-merge them, and never widen `soiCandidates` to fix a display gap:
that silently changes every coast in the game and no transit spec necessarily catches it.
WHY: they were one function until G44, so the display inherited the coast's moon exclusion and the
one class of body a GM most wants to hang something off never drew a bubble.
BLAST: the two floors also differ, and that is deliberate and MEASURED. `MIN_SOI_MASS_KG` (3e23) is
roughly MERCURY's mass — the "big enough to bend a heliocentric coast" bar — and it excludes every
major moon in the solar system (Ganymede 1.48e23, Titan 1.35e23, Callisto 1.08e23, Io 8.9e22, Luna
7.3e22). Keeping it on the display side would draw NO moon bubble on any bundled map. A displayed
moon bubble is gated geometrically instead: the Hill radius must clear the body's own surface, which
is self-scaling, needs no constant, and answers the real question ("is there room out there to orbit
in"). Planets and stars are untouched by both changes, so the coast is bit-identical — the Sol
fixtures stay byte-unmoved, which is the gate. Radii come from the one shared formula: Luna 61,525 km
and Titan 52,290 km against textbook ~61,500 and ~52,000.

### RENDER-S31 A dash pattern is charged per SEGMENT over the whole path, not the visible part
BUCKET: PLATFORM (canvas 2D dash patterns) - carry-forward criterion's example. A shape is charged
for its ENTIRE path even when nearly all of it is off-screen, and astronomical radii make the
pathological case ordinary. ** Its trailing CAVEAT is MISFILED: it is about the two Hill-radius
formulas and belongs on PHY-29 / M7. **
WHERE: any dashed canvas stroke in `SystemVisualizer.svelte` at astronomical scale. Live example:
the L-point co-orbital track (`lagrangeTrack`), which guards itself with a circumference budget.
RULE: before `setLineDash` on a path whose length scales with the view, work out how many segments
the pattern implies — `pathLengthPx / dashPeriodPx` — and fall back to a SOLID stroke past a few
thousand. Solid costs the same at any scale. Use dashes sparingly and never on many paths at once.
WHY: owner, 2026-08-26 — dashes "mess up rendering budgets due to some of our crazy scales". The
trap is that a shape is charged for its ENTIRE path even when nearly all of it is off-screen: a
full circle drawn at 100x zoom implies ~45,000 dash segments and at 10,000x about 4.5 million, for
a line the user can see perhaps a tenth of. This engine routinely draws circles whose radius is
astronomical and whose zoom range spans many orders of magnitude, so the pathological case is
ordinary here rather than exotic.
BLAST: the same applies to orbit paths, zone outlines and range rings if any of them ever take a
dash. A solid line at reduced alpha reads almost as well and has no such cliff.
CAVEAT (G45, 2026-08-26): "the one shared formula" is true INSIDE this file and false across the
engine. `twoBodyCoast` computes the Hill radius from the SEMI-MAJOR AXIS; `physics/stability.ts`
computes it from PERIAPSIS (`hillRadiusAU`, see PHY-30). On a circular orbit they agree exactly; on
Pluto's e=0.249 the drawn bubble is 33% larger than the judged one. Both are defensible — see M7 —
but they are two numbers, and anything that draws a boundary the physics also JUDGES must take the
published field rather than recompute.

### PHY-32 A CO-ORBITAL NODE'S ORBIT AND PARENTAGE HAVE EXACTLY ONE OWNER, AND A PAIR RIDES THE POINT
BUCKET: DOMAIN + ARCHITECTURE - domain: the chord across a 60-degree L4 offset is EXACTLY the
orbital radius, which is what named the fault; and a pair AT a point is judged on the combined mass.
Architecture: exactly one owner for a derived orbit AND its parentage, and the marker rides the
thing that is at the point.
WHERE: `physics/lagrange.ts` `deriveCoOrbitalOrbits` (owner of the rider's orbit + parentId),
`physics/barycenterReconcile.ts` `promoteMassiveCompanion` (hands the marker UP on promotion),
`Barycenter.coOrbital` in `types.ts`.
RULE: whatever carries `coOrbital` is the thing AT the point, and the L-point derivation owns its
`orbit` and its `parentId`; nothing else may re-home it. The converse is half the rule and is what
was missing: a node that is a MEMBER of a barycentre never carries `coOrbital` - the PAIR does, and
`deriveCoOrbitalOrbits` strips the marker off any member it finds one on. On promotion the marker
moves UP from the primary to the new barycentre, because the barycentre has already taken the
primary's orbit and host. The members then simply orbit the barycentre and nothing touches them.
WHY: [[B98]]. With the marker on a member, `reconcileBarycenters` (SystemProcessor:179) promoted the
pair and re-homed both members; `deriveCoOrbitalOrbits` (:189) then rewrote the member's `parentId`
back to the secondary's host, tearing the pair apart; and the next pass rebuilt it from the wreckage.
**The companion's semi-major axis climbed on every process - 2.5e-6, 2.91, 4.55, 5.46, 5.97, 6.26,
6.42, 6.51 AU - and the number is the diagnosis: the chord across a 60-degree L4 offset is EXACTLY
the orbital radius, so the reconciler was reading the Lagrange OFFSET as the pair's SEPARATION.**
Silent, too: the member lost its `coOrbital`, so `assessCoOrbitalStability` never spoke for it.
BLAST: a co-orbital pair shares its secondary's semi-major axis BY DEFINITION, so the crossing tests
must exempt it - G43 P2 did that for a single trojan (`coOrbitalExempt`) and
`assessBinaryPairStability` did NOT, which called a correct Patroclus-scale binary "very unstable"
for overlapping with Jupiter. Fixed in the same commit. A pair at a point is judged by
`assessCoOrbitalPairStability`: Gascheau on the COMBINED mass (a pair is heavier than either member,
so a trio one body would survive can fail once doubled), plus the criterion only a pair has - its own
separation against the Hill radius it has at the point, on the same 0.3/0.4/0.5 sep/Hill bands the
binary-tightness test uses. That fate is deliberately NOT directional (contrast B19): when a point
stops holding a pair, BOTH members leave, and there is no lighter one being thrown by a heavier one.

### PHY-30 A barycentre PUBLISHES its circumbinary annulus; nothing may re-derive either edge
BUCKET: DOMAIN + ARCHITECTURE - domain: a P-type body lives in an ANNULUS with two real edges, and
the fit is valid only over a stated range. Architecture: the pair PUBLISHES both edges and nothing
re-derives either, because a drawn boundary and a judged one must be the same number.
WHERE: `physics/circumbinary.ts` (the fit, the bands, the validity range) and
`physics/stability.ts` — `hillRadiusAU`, `barycenterHillRadiusAU`, and the publish loop at the head
of `annotateGravitationalStability`. The contract is `Barycenter.circumbinary`.
RULE: a P-type body lives in an ANNULUS with two edges, and both are DERIVED FIELDS on the pair.
`innerAU` is the Holman & Wiegert (1999) critical semi-major axis; `outerAU` is half the pair's
combined-mass Hill radius, the same 0.5 that `assessHostBindingStability` already calls "stolen by
external tide". Read those fields. Do not restate the polynomial, do not re-multiply the Hill
fraction, and do not compute an inner edge from a bare coefficient — that is what the two generator
constants were. Publication runs over EVERY barycentre, not just ones with children, and before any
child is judged: the pair is the parent half of parent-before-child (PHY-1).
WHY: the fit existed nowhere in the physics, so a circumbinary planet authored a hair outside its
two suns — the most obviously doomed placement a GM can make — collected no verdict at all, while
the generator held TWO disagreeing corners of the same polynomial (`1.60 * separation` at
`planet-generation.ts`, `P_TYPE_FRAC = 2.3` at `generateFromConfig.ts`: the mu=0 and mu=0.5 ends).
The engine was seeding planets into a zone its own physics now condemns. G45.
BLAST: the fit is valid only for 0.1 <= mu <= 0.5 and 0 <= e_b <= 0.7 — outside that
`fitExtrapolated` is set and every explainer must keep saying so, because an extrapolated limit
printed bare is PHY-2's lie. `outerAU` is ABSENT for a root barycentre (no parent, no tide, no
in-system outer wall) and a reader that treats absent as zero inverts the annulus. Any new derived
field on a barycentre must join `DERIVED_BARYCENTER_FIELDS` in `importFixup.ts` or it fossilises
into every save — `derivedFieldDrift.spec.ts` is the guard and it caught this one. See M7 for the
two Hill formulas. Finally, B24's "Driven by:" restates the fate's own reason, which was written when
reasons were short ("Critical Hill spacing (Delta=2.31)"); the reasons here are full explanations, so
a criterion with a long reason must set `fateShort` or the paragraph is printed twice, two lines
apart. Criteria that set nothing behave exactly as before.

### RENDER-S32 A SEGMENT OWNS ITS OWN PATH, AT ITS OWN RESOLUTION, IN ITS OWN FRAME
BUCKET: ARCHITECTURE - every sample carries its OWN TIME. Never generate one path across a whole
journey and slice it by comparing timestamps, and if points are pruned the stamps go with them - two
arrays of different lengths silently revert every reader to even spacing.
WHERE: `transit/pathSampling.ts` (the schedule, the slicing, the one reader), `transit/math.ts`
(`integrateBallisticPathAtTimes`), and the three plan builders that use them — `calculateLambertPlan`,
`calculateFastPlan` and `assist.ts`. The contract is `TransitSegment.pathTimes`.
RULE: a phase generates its OWN points over its OWN duration, and every point carries its OWN time.
Never generate one path across a whole journey and slice it by comparing timestamps afterwards, and
never assume sample i sits at fraction i/(n-1) of a segment — read the stamps through
`pathSampleTimesMs` or `samplePathAtTime`. If points are dropped or pruned, the stamps go with them;
two arrays of different lengths silently revert every reader to the even-spacing assumption.
WHY: the old shape generated one uniform path (a sample per two days) and sliced it into Accel /
Coast / Brake by time, so a sub-hour burn inside a three-year transfer caught NO samples and a
fallback handed it the last two COAST samples instead. Measured on the Sol Expanse fixture at 0.3 g:
the drawn accel implied 1,366 km/s and the brake 1,223 km/s, for a ship that reaches about 10 km/s in
an hour — worst exactly where the eye is, because the engine is lit. After the change the same
segments draw at 19.4 and 10.9 km/s. G46.
BLAST: FOUR readers independently re-derived 'where is the ship at t' from `pathPoints` and all four
assumed even spacing — `scheduler.samplePlanPathAtTime` (the flight), `constructs/shipRoute.ts` (the
drawn route line, which even documented the assumption), `transit/telemetry.ts` (the HUD) and
`TransitPlannerPanel.svelte` (the preview marker). They now all come through one function; two
answers to that question would slide the ship off the line it is drawn beside. `SystemView.svelte`
prunes a completed journey's points and `starmapSanitizer.ts` filters unreadable ones — both must
carry the stamps in lockstep. Journeys saved before this carry no stamps at all and fall back to even
spacing, which is correct for them, so the fallback is not dead code.

### RENDER-S33 THE TRANSIT SPECS PIN DELTA-V AND TIMING; NOTHING PINNED THE DRAWN PATH
BUCKET: ARCHITECTURE + DOMAIN - architecture: a correct total says NOTHING about whether the line
beside it is possible, and a gate must be CHECKED AGAINST THE FAULT rather than watched to pass.
Domain: a fixed time step falls off an eccentric conic near periapsis, so cap by swept ANGLE, not by
the clock.
WHERE: `transit/pathGeometry.spec.ts` is the gate. The gap it fills is everywhere else in
`src/lib/transit/*.spec.ts`.
RULE: a change to how a journey is DRAWN must ship with a geometric assertion in the same commit. A
correct Delta-v total says nothing about whether the line beside it is possible, and a green suite is
not evidence about geometry. The two cheap gates are: no consecutive pair of drawn points may imply a
speed beyond the ship's own ceiling (derived per plan — escape speed at the path's closest approach
plus the plan's whole Delta-v budget — because a torch doing 548 km/s is telling the truth and a
Hohmann freighter doing 1,366 km/s is not), and no single drawn step may swallow a large fraction of
its own segment.
WHY: this is HOW the 1,366 km/s burn shipped and stayed. Every transit spec was green throughout. The
gate has been checked against the fault rather than merely watched to pass: reinstating the
borrowed-sample fallback makes it fail at 1,366 km/s against a ceiling of 68 — a factor of twenty —
and eleven of its twelve assertions go red. G46.
BLAST: two further faults were invisible for the same reason and surfaced the moment the drawing
became honest. The assist family's arrival brake was drawn at 109.6 km/s; and the display integrator
marched at a flat two-day step, which falls off an eccentric conic near periapsis — a valid
long-way-round Lambert leg with e=0.9986 was being drawn as a 53 AU excursion at 313 km/s. The step
is now capped by swept ANGLE (`MAX_STEP_RAD`), not by the clock. That correction in turn revealed
that the assist search never checks where its heliocentric legs GO: it rejects a flyby that would
clip the flyby body, but offers a leg whose perihelion is 0.0037 AU, inside the corona. Pinned by
`calculator.belt.test.ts`. FIXED at v3.0.86 on the owner's word: the search now drops a candidate whose
legs dive inside the star's KILL ZONE — the line the generator already refuses to place a body across,
0.0899 AU for Sol — exactly as it already dropped one whose flyby would clip the planet. It then finds
a safe candidate instead, so the family is still offered: closest approach moved 0.0302 AU -> 1.5537 AU.

### RENDER-S34 A BURN PUBLISHES HOW HARD AND WHICH WAY IT PUSHES; NOTHING MAY INFER EITHER
BUCKET: DOMAIN + ARCHITECTURE - domain: a burn's delta-v is what CHANGES the velocity, so it is not
generally parallel to it, and an efficient arrival burn is frequently PROGRADE despite being
labelled Brake. Architecture: PUBLISH how hard and which way; inferring it from a placeholder zero
recovers the whole orbital velocity instead.
WHERE: `TransitSegment.deltaV_ms` and `TransitSegment.thrustDir`, written by all three plan builders.
Read through `constructs/shipBurn.ts` (`burnEffort`), which feeds the 3D hull heading and plume in
`holo/scene.ts` and the acceleration arrow in `SystemVisualizer.svelte`.
RULE: take the published figures. Do NOT difference `startState.v` against `endState.v` to recover a
burn — most builders leave `endState.v` as a literal zero placeholder, so that difference is the
ship's whole orbital velocity and not the Delta-v at all. Do NOT aim a thrusting hull down its course
line either: a burn's Delta-v is what CHANGES the velocity, so it is not generally parallel to it.
WHY: measured against a commanded 0.3 g, the inferred thrust came out at 2.4x on a Hohmann departure,
2.8x on its brake, and 0.03x on a 57-hour torch burn — a drive plume that was effectively dark through
the longest burn in the game. And measured against the drawn course, the published direction sits 61.7
degrees off on the Most Efficient departure; aiming down the course and flipping for a brake (what the
renderer did) would have drawn that plan's arrival burn 107.3 degrees wrong and the gravity assist's
153.2 degrees wrong, very nearly backwards. G46, owner 2026-08-26: orientation "is ONLY important when
the engines are firing", and then "pointing in direction of desired vector".
BLAST: an efficient arrival burn is frequently PROGRADE despite being labelled `Brake` — arriving at
the top of a transfer ellipse you are slower than the orbit you are joining and must speed up to stay
there — so `braking` is a plume-and-fallback concept and must not be used to derive geometry where a
`thrustDir` exists. A TORCH burn is the case where the old inference was fine (0.1 and 177.4 degrees,
i.e. within 2.6 of prograde/retrograde), which is why this went unseen: nothing drew a ship's heading
at all until the 3D models arrived. The acceleration ARROW showed net gravity alone, which during a
burn is four orders of magnitude too small and points at the star — correct for what it measured and a
lie about what it was labelled (see the standing rule on published quantities). Journeys committed
before this carry neither field and fall back to the old inference, so the fallback is not dead code;
`burnVectors.spec.ts` pins both paths.

### TAG-23 A CLOUD-DECK TAG CARRIES THREE TOKENS, AND ALL THREE OLDER FORMS MUST KEEP PARSING
BUCKET: DOMAIN + ARCHITECTURE - domain: a BUCKET cannot express how NEARLY a deck exists, which is
the exact quantity a renderer must fade on. Architecture: every older form of a published value
keeps parsing; undefined must stay distinguishable from zero; and the RESOLUTION is chosen coarse
enough that floating-point hair cannot rewrite the record and break idempotence.
WHERE: `physics/cloudDecks.ts` — `cloudDeckTags` (emit) and `parseCloudDeckValue` (read), consumed
through `decksFromTags` by `apparentColor.ts`, `planetAppearance.ts`, `surfaceSpectrum.ts` and
`visibility.ts`.
RULE: the value is `"<species> <bucket> <coverage>"`, and the bucket token is what anchors the parse —
coverage is taken ONLY when the token before it is a real bucket name. Three forms exist in the wild
and every one of them is load-bearing: the current three-token form; the two-token `"ammonia broken"`
that every pre-B95 save carries AND that a GM types by hand, which must fall back to the bucket's
centre; and the bare V1 colour word `"white"`. `parseCloudDeckValue` returns `coverage` as
`undefined` rather than a default for the older forms on purpose, so a consumer can tell "no figure
was published" from "the figure is 0".
WHY: a bucket cannot express *how nearly a deck exists*, and that is precisely the quantity a renderer
must fade on. Five buckets over 0..1 means a deck at 1.5% of sky and one at 11% both read `wisps` and
are both republished as the bucket's 8% centre — a 5x inflation of the fainter one. Mars is the
measured case: its real water-ice cloud is 2.4% of sky and was being drawn at 8%. B95 is the same
quantisation seen from the other side: a deck appearing at 1.5% coverage was admitted at FULL strength
as a chromophore stripe and flipped a giant's whole banding.
BLAST: publishing the exact figure moves everything downstream of cloud COVER, not just banding —
Venus's sulphuric veil went 0.92 -> 0.995 and took 15% off its modelled surface light; Earth's water
went 0.68 -> 0.664 and added 0.9%. Both are *more* accurate, and both move `tests/output/`. Do NOT
"fix" that churn by rounding coverage back to the bucket centre — that is the bug. The resolution is
three decimals deliberately: finer than any renderer resolves, coarse enough that floating-point hair
between passes cannot rewrite a tag and churn a save (which would break `idempotence.test.ts`).

### RENDER-S35 A GIANT'S CHROMOPHORE LIST IS A CONTRAST SWITCH, NOT A DECORATION
BUCKET: DOMAIN + ARCHITECTURE - domain: a chromophore band IS a deeper deck seen through the one
above, so the UPPER deck's cover is LINEAR and must never be clamped while the chromophore's own
cover saturates. Architecture: an empty list must land on the SAME look at zero strength, never on a
different look - a presence test standing in for a strength is a cliff.
WHERE: `apparentColor.ts` pushes `"<species> band"` stops from `giantDecks.slice(0, -1)`; both
painters in `planetTexture.ts` read them back as `palette.filter(role === 'cloud').slice(1)` and run
them through `giantBandRamp`.
RULE: the chromophore stops do NOT merely add stripes on top of a giant. Their presence sets the
CONTRAST OF EVERY BAND ON THE PLANET, and it used to do so as a boolean — `chromo.length === 0` chose
between shade pairs `0.985/1.015` (±1.5%, reads featureless) and `0.86/1.06` (−14%/+6%, reads as
Jupiter), and separately gated the Great-Red-Spot oval. So a stack gaining or losing ONE deck at a
condensation threshold moved the whole planet between those two looks at once. Measured on the
painted pixels: row-to-row contrast SD 2.91 against 18.92 for a 0.001-percentage-point ammonia edit,
a 6.5x jump. It now ramps with the strongest stop's weight, normalised by `CHROMOPHORE_MAX_WEIGHT`:
2.91, 3.00, 3.37, 4.54, 6.19, 9.15, 12.45, 16.60 across weight 0 to 0.7.
WHY: `slice(0, -1)` is right and is not the trap — a chromophore band IS a deeper deck seen through
the one above, so a one-deck stack genuinely has none. The trap is that "none" was wired to a
DIFFERENT look rather than to the same look at zero strength. An empty list must land exactly on the
smooth pair, which is what keeps every ice giant and every single-deck giant unchanged.
BLAST: the rule lived TWICE, once per projection (disc and equirect), each with its own copy of the
two pairs — so the 3D globe and the 2D disc could have disagreed about whether a world was banded.
Unified into `giantBandRamp`/`chromoAlpha`; the DRAWING still differs legitimately (orthographic disc
against a wrapped 2:1 sheet, whose spot is drawn three times for the seam) and that is the right
seam. If you add a third projection, call the ramp — do not copy the numbers.
PAIRS WITH PHY-31: this removed the RENDERER's cliff and PHY-31 removed the one underneath it — an
abundance floor that was deleting whole decks. Both were needed; fixing either alone leaves the other
visible, and the ramp here is still what keeps a genuinely marginal deck from popping.
THE TWO COVERAGE TERMS ENTER DIFFERENTLY AND THE ASYMMETRY IS LOAD-BEARING. In `apparentColor`, a
band's strength is `coverAbove * min(1, ownCover / BAND_FULL_COVER)`. The cover of the deck ABOVE is
LINEAR and must never be clamped: belts and zones exist because the upper deck covers part of the sky
and not the rest, so how much of it there is IS how much banding you see. The chromophore's OWN cover
saturates, because once it holds about half the sky it is showing all the colour it has. Clamping the
first one is a real bug that shipped for one version: Jupiter's ammonia holds 88% of its sky and
Saturn's 54%, both clamped to 1, which left PLANET MASS as the only thing telling them apart and drew
Saturn at 73% of Jupiter's contrast. Saturn is a pale ball with muted belts and Jupiter is not; the
owner spotted it on sight. Unclamped it lands at 36% (painted SD 9.0 against 25.2), with the ice
giants still nil.

### PHY-31 A CLOUD DECK IS ADMITTED ON OPTICAL DEPTH. NEVER ON ABUNDANCE
BUCKET: DOMAIN - a deck is admitted on WHAT YOU COULD SEE (optical depth), never on how much gas is
present; the floor was in the wrong currency. Its CORRECTION carries too: ruling out the exotic
explanations is not the same as finding the cause, and a DISCONTINUITY should send you looking for a
BRANCH before it sends you looking for physics.
WHERE: `cloudDecks.ts`, the per-gas loop in `deriveCloudDecks`.
RULE: whether a deck exists is decided by what you could SEE - its optical depth, computed from the
condensed column - and never by a floor on how much of the gas is present. There WAS such a floor
(`cloud.minFraction`, per gas in the rule pack) and it was the root cause of inbox B95. It was a hard
`continue`, so a deck did not thin out as its gas ran low, it blinked out; and it was in the wrong
currency, because abundance does not decide visibility. The optical-depth guard twelve lines below it
was always the correct one and this merely shadowed it.
WHY: measured on the reporter's Jupiter - effective NH3 9.9909e-5 gave NO deck, 1.0091e-4 gave a deck
of 0.906 coverage, and the floor sat at 1.0e-4. With the floor bypassed the deck below it was real and
OPTICALLY THICK the whole way down (tau 44 where the floor was deleting it outright, against a
`TAU_OPAQUE` of 5). It was not suppressing a negligible haze; it was suppressing a cloud.
THE ANCHOR SETTLES IT: our own SATURN failed the floor. Its authored NH3 is 0.0120% and the
hydrosulphide reaction takes NH3 and H2S one for one, so 0.0040% of H2S left 0.008% effective - under
the 0.01% floor - and Saturn was drawn with NO AMMONIA DECK. Saturn's clouds are ammonia. Removing
the floor changed exactly ONE body across the 40 atmospheres in both bundled starmaps: Saturn, which
gained `ammonia broken 0.538`.
BLAST: `GasCloud.minFraction` is gone from the type and from the shipped pack. A campaign whose
`gasPhysics` override still carries the key is harmless - nothing reads it.
CORRECTED 2026-08-27, SAME DAY IT WAS WRITTEN, AND THE WRONG VERSION IS WORTH KNOWING ABOUT: this
entry first said the opposite - "a deck does not fade in, it arrives ~20x past opaque, and that is the
model's shape" - and scoped a subsaturated-haze term to fix it. The measurement behind that was
correct and the conclusion was not. Seeing a deck appear at tau 100 in one step, I attributed the step
to the condensation integral, having already ruled out the pressure grid and the campaign's rule-pack
data. I had not ruled out a plain `if` twenty lines earlier. The lesson is narrow and worth keeping:
ruling out the exotic explanations is not the same as finding the cause, and a discontinuity should
send you looking for a BRANCH before it sends you looking for physics.

### RENDER-S36 HOW MUCH METHANE YOU SEE IS A CLOUD QUESTION, NOT A TEMPERATURE ONE
BUCKET: DOMAIN + ARCHITECTURE - domain: methane condenses coldest, so where it forms a deck that
deck is the TOP of the stack and nothing is above it - which is why an ice giant sees all of its
methane and Jupiter and Saturn are gold. Architecture: a PROXY can be retired the moment the engine
publishes the thing it was proxying. ** ID COLLISION: see the sampler entry above ('A SAMPLER THAT
ANSWERS FOREVER'). **
WHERE: `apparentColor.ts`, the giant branch - `methaneSeen` feeding `methaneStrength`.
RULE: a giant's methane tint is scaled by how much of the methane column the DECKS ABOVE IT leave
visible, taken as the product of (1 - coverage) over every deck above. Methane condenses coldest, so
where it forms a deck at all that deck is the TOP of the stack and nothing is above it - an ice giant
sees all of its methane. On a warm giant methane never condenses and the whole ammonia stack sits
over it, which is exactly why Jupiter and Saturn are gold rather than green.
WHY: this was `teq < 80 ? 1 : teq < 110 ? 0.6 : 0.35`, a three-way step standing in for the sentence
the comment above it already stated in words. Two things were wrong with it. It was a PROXY for a
quantity the engine did not publish - and since B95 it does, so the proxy can be replaced by the
thing itself. And it was a CLIFF, which bit the moment the decks were fixed: giving Saturn back its
ammonia deck raised its albedo and dropped its equilibrium temperature 81.1 K -> 78.1 K, crossing the
80 K rung and swinging its methane tint by two thirds, from a 3 K change. It painted Saturn grey.
MEASURED, on the bundled Sol: Jupiter #c8b59f -> #d6b699 and Saturn #b4b1a4 -> #d4b294, both warmer
and both closer to life (real Jupiter is about RGB 216,178,137). Uranus and Neptune do not move at
all, because their methane IS their top deck. Painted contrast, four giants: Jupiter 27.4, Saturn
15.2, Uranus 2.4, Neptune 1.8 - Saturn banded at a little over half Jupiter's strength, which is
what Saturn looks like, and the ice giants featureless.
BLAST: a giant with NO decks now shows its methane in full rather than at the old 0.35 floor. That is
the right answer - there is nothing there to hide it - but it is a change for hot cloudless giants.
STILL A STEP, LEFT ALONE DELIBERATELY: `methaneHue` picks between two fixed colours at `teq < 52`,
and the ice-giant `iceHue` picks between three at 60 K and 160 K. Neptune (46.6 K) and Uranus
(58.5 K) sit either side of the first. Smoothing them moves BOTH ice giants, which is an anchor
change and wants its own item rather than a ride on this one.

### RENDER-S41 AN AURORAL OVAL LIVES IN A NARROW POLAR BAND. STRENGTH MOVES IT INSIDE THAT BAND, NOT OUT OF IT
BUCKET: DOMAIN - the oval marks where the LAST CLOSED FIELD LINE comes down, so its colatitude is
set by the SHAPE of the magnetosphere: a stronger field pushes the magnetopause out and if anything
CONTRACTS the oval. Brightness may scale with strength; REACH may not. ** ID COLLISION: see the
route/flying entry above, and this id is cited from code with BOTH meanings. **
WHERE: `catalogue/PlanetDisc.svelte` - `auroraColatDeg`, `auroraOval`, `auroraTopCy`/`auroraBotCy`.
The 2D system view promotes big discs to this same component, so it is what the orrery shows too.
RULE: the ring marks where the last closed field line comes down, and that colatitude is set by the
SHAPE of the magnetosphere rather than by how bright the ring is - Jupiter's main oval sits near 16
degrees from the pole, Saturn's near 15, Earth's near 20. A stronger field pushes the magnetopause
further out and if anything CONTRACTS the oval. So brightness may scale freely with strength; REACH
may not. It is clamped to 12-28 degrees. And the ring's radius is geometry, `DISC_R * sin(colat)`,
not a free parameter.
WHY: it used to be `cy = 22 + strength * 9` with the radius growing alongside - an unbounded march
toward the equator. On the r=30 disc that put Jupiter's oval centre at 38 degrees colatitude and its
curtains at 60, two thirds of the way to the equator, and the blurred glow stroke alone was over 4
units wide on a 60-unit disc. Between them they covered about a third of the visible face and
flattened the strongest banding in the map: the owner's screenshots showed Jupiter reading PALER and
less banded than Saturn, when measurement of the texture underneath had Jupiter at 2.3x the contrast.
Now: Jupiter 19.8 degrees, Earth 17.9, Saturn 16.0, still ordered by strength.
BLAST: every body with an `aurora/*` tag, not only giants - Earth moved 34.7 -> 17.9 degrees. Nothing
in `tests/output/` moves, because the appearance model is derived at draw time and never stored.

### RENDER-S38 A GIANT'S STORM AND ITS POLAR VORTEX ARE DERIVED, NOT DECORATION
BUCKET: DOMAIN + ARCHITECTURE - domain: a long-lived anticyclone is what a strongly banded
circulation does at a shear line between two jets, a vortex forms at BOTH ends of the spin axis, and
r = a + b*cos(n*theta) draws an n-LOBED FLOWER rather than a polygon. Architecture: a look is taken
from the BODY, never from a literal in a painter.
WHERE: `planetTexture.ts` - `stormChance`, used by both projections; `planetAppearance.ts` -
`PolarVortexSpec.fillHex`/`rimHex`/`eyeHex`.
RULE: neither is a look a renderer may choose. A long-lived anticyclone is what a strongly banded
circulation does at the shear line between two jets, so its CHANCE follows `bandStrength` and a
smooth ball has none to give - `stormChance` ramps from 0 at 0.45 to 1 at 0.75. Calibrated on the
only pair anyone can check: Jupiter bands at 0.84 and has a Great Red Spot, Saturn bands at 0.38 and
has no persistent spot. It was previously a flat `rnd() > 0.35` on any giant that banded at all,
which gave Saturn a permanent dark oval.
A POLAR VORTEX BOUNDARY IS A POLYGON, AND A COSINE IS NOT ONE. It was
`baseLat + amp * cos(sides * longitude)`, and `r = a + b cos(n th)` in polar coordinates draws an
n-LOBED FLOWER: measured, its sides bow inward by 54% of the apothem and its vertex sits 1.78x an
edge. Saturn's "hexagon" was rendering as a six-petalled star and stayed that way until the owner
sent a close-up. Use `polygonRadiusAt` (exported, shared, pinned): `apothem / cos(phi)` with phi from
the nearest edge midpoint gives straight sides (bow exactly 0) and a vertex 1/cos(180/n) out - 1.1547
for a hexagon. Latitude off the pole IS the polar radius on an equirect sheet, so it applies to y
directly. It is drawn at BOTH poles: a vortex is what a rotating envelope does where the jets
converge, and that happens at each end of the spin axis - Jupiter carries a polygonal cyclone cluster
at both (Juno: eight around a central one north, five south) and Saturn's south has a cyclone with a
clear eye even though only its NORTH is hexagonal. Placement is a colatitude (13 degrees) so it sits
INSIDE the auroral oval of RENDER-S37, which is the right order.
A polar vortex takes its colours from the BODY: the interior is its own cloud colour darkened (a
cyclone clears the upper haze and you see deeper), the rim brightened. Four literal slate blues used
to be spread across TWO painters - `rgba(60,80,120,0.32)` and `rgba(210,222,245,0.6)` in PlanetDisc,
`rgba(48,64,104,0.42)`, `rgba(220,230,250,0.7)` and `rgba(205,218,242,0.42)` in the equirect - which
drew Saturn's hexagon as a grey patch on a gold planet. Same shape as the hardcoded Jovian brown
already deleted from `apparentColor`, and the same duplication: two renderers each inventing a look.
BLAST: a gold giant now gets a gold vortex and a blue one a blue vortex (Saturn #756151/#e6d2c1,
Uranus #336174/#a1d1e5). If you add a third painter, read the spec - do not pick a colour.

### TAG-24 A POLAR VORTEX IS ONE TAG PER POLE, AND THE POLES ARE NOT THE SAME PLACE
BUCKET: DOMAIN + ARCHITECTURE - domain: the two poles are NOT mirror images (Juno counted eight
cyclones north and five south), SPIN decides whether there are vortices at all and AXIAL TILT
decides how ALIKE they are. Architecture: a bare legacy value keeps the meaning it already rendered
with, and 0-means-round is why an ABSENT pole must be null.
WHERE: emitted in `SystemProcessor` (the polar-vortex block), read by `parsePolarVortexTags` in
`planetAppearance.ts`, drawn by both painters.
RULE: `feature/polar-vortex` carries `"<pole> <sides>"` or `"<pole> round"`, one tag per pole. A
count is a POLYGONAL JET; `round` is a plain cyclone with an eye; an absent pole has nothing. The
parser returns null / 0 / 4..9 for those three, and 0-means-round is why an absent pole must be null
rather than 0. A BARE COUNT (`"6"`) is every pre-split save and the obvious thing to hand-type: it
means both poles polygonal at that count, which is exactly how such a save already rendered.
WHY THE TWO POLES DIFFER, and this is the part that is easy to get wrong: they are not mirror images.
Juno counted EIGHT cyclones round a central one at Jupiter's north and FIVE at its south; Saturn has
a hexagonal jet at the north and a plain eyed cyclone at the south. Drawing one count at both makes
Saturn hexagonal at both poles, which the owner spotted on sight.
HOW IT IS ROLLED, because it is a ROLL and the physics page says so under "known fudges": SPIN
decides whether there are polar vortices at all (converging jets make them; a day too long has no
Coriolis to organise the flow) - this replaced a blind `hash01 < 0.7` that left Jupiter and Neptune
with none, which the anchors caught. AXIAL TILT decides how ALIKE the two poles are, not how likely
each is: `alike = 1 - min(1, obliquity/30)`, so a barely-tilted world gets twin poles and a strongly
tilted one gets opposites. The second pole then MATCHES the first with that probability. Getting this
wrong the other way - lowering each pole's chance independently - let Saturn lock a polygon twice on
a 37% roll. Side counts are drawn separately even when both poles lock.
ANCHORS: Jupiter (3.1 deg, alike 0.90) gets 8-gon north and 6-gon south; Saturn (26.7 deg, alike
0.11) gets 6-gon north and round south. Both match life. Do NOT tune further on Neptune, whose poles
are not characterised - it drew matching poles on a 6% roll and that is the model being honest.
BLAST: a manual tag beats the roll (`stripForReprocess` spares it and the generator only fires when
no tag is present), which is the documented GM override in `tags-guide.md`.

### SYNC-1 THE PLAYER SNAPSHOT IS BUILT FROM THE STARMAP'S COPY OF A SYSTEM, NOT THE LIVE ONE
BUCKET: ARCHITECTURE + IMPLEMENTATION - durable and first-order: two holders of 'the same' object
must hold it BY IDENTITY, not merely equal - and A REPETITION TEST IS THE WRONG INSTRUMENT FOR A
TWO-COPY FAULT. This is PHY-1's blind spot, named by the entry itself, and the gate wanted is a
one-line identity invariant.
WHERE: `computePlayerStarmapSnapshot` (`system/utils.ts`) walks `starmapStore.systems[i].system`.
The system a GM is actually looking at lives in `systemStore`, and `src/routes/+page.svelte` copies
the second into the first on every `systemStore` emission (`systemNode.system = system`).
RULE: while a system is open those two must be THE SAME OBJECT, not merely equal. Anything that
replaces `starmapStore.systems[i].system` with its own copy silently forks the campaign in two, and
the fork that reaches players is the one nobody is looking at.
WHY IT IS NOT VISIBLE FROM THE CODE: both stores hold something that looks like the right system,
and every screen the GM can see reads the LIVE one, so a divergence is invisible on the GM side by
construction. It shows up only in what players receive.
MEASURED (inbox B108, 2026-08-27): with Sol open and the clock running, `systemStore`'s Jupiter
carried 20 tags while the starmap's carried 17, `sameObj === false`, for as long as it was watched.
Three tags - a cloud deck, its precipitation and a polar vortex - appeared and disappeared on every
snapshot sent to players as the two copies took turns. NOT ONE of Jupiter's other 221 leaf fields
differed between them, which is the tell: a physics oscillation moves numbers, a forked copy moves
only whatever the pass that forked it had already written.
THE CHECK THAT FINDS IT, and it is one line: in `starmapSnapshotForPlayers`, compare
`get(systemStore)` with the matching `map.systems[...].system` by IDENTITY. `false` is the fault.
BLAST: `system/idempotence.test.ts` cannot see any of this and is not meant to - it gates
`systemProcessor.process()`, which is idempotent here and stayed green throughout. A repetition test
is the wrong instrument for a two-copy fault; the gate wanted is the identity invariant above.

### SYNC-2 TWO PLAYER SNAPSHOT PATHS, AND ONLY ONE OF THEM SLIMS A CONSTRUCT
BUCKET: IMPLEMENTATION + ARCHITECTURE - durable: REDACTING and SLIMMING are different jobs in
different functions, and anything crossing a wire wants BOTH. Two functions named for the same
audience is what hid it. Exhibit 8 in faults-the-old-shape-allowed.md.
WHERE: `computePlayerSnapshot` and `computePlayerStarmapSnapshot`, both in `system/utils.ts`.
RULE: `computePlayerSnapshot` REDACTS (hidden nodes, secret tags, GM notes, anomaly bookkeeping)
and nothing more. Everything that makes a snapshot SMALL - dropping `scheduled_journeys` and
`draft_transit_plan`, publishing `driveBurns` and `route` in their place - lives in `slimNode`,
which only `computePlayerStarmapSnapshot` calls. **Redaction and slimming are different jobs in
different functions, and calling the first does not get you the second.**
WHY IT IS NOT VISIBLE FROM EITHER FUNCTION: both are named for the player and both return
something a player may see, so the per-system path reads as a smaller version of the whole-map
one. It is not: it is the UNSLIMMED one.
THE CONSEQUENCE, measured 2026-08-27 (inbox G51): `SYNC_SYSTEM` is built by
`computePlayerSnapshot` alone, so it publishes the dense `pathPoints` arrays that `slimNode`
exists to keep off the wire - ~245 KB per send on the bundled SciFi map, on the hottest path in
the app. `shipRoute.ts` opens by explaining why those arrays must never be broadcast; the
per-system path broadcasts them anyway.
BLAST: anything new that redacts for players must decide which of the two it is. If it crosses a
DataChannel it wants BOTH, and the slimming is not automatic.

### SYNC-3 A CONSTRUCT'S FLIGHT FIELDS LIVE ON `SYNC_FLIGHT`, AND ABSENCE THERE MEANS PARKED
BUCKET: ARCHITECTURE - SILENCE IS A POSITIVE STATEMENT, so a diff-shaped message would park every
ship it omitted; and a copy-on-write merge is load-bearing, not tidy, when the receiver holds the
very object it merges into.
WHERE: `constructs/flightState.ts` owns the message, its shape and both ends of the merge;
`slimNode` (`system/utils.ts`) strips `FLIGHT_NODE_FIELDS` from every campaign payload.
RULE: `route`, `driveBurns`, `vector_position_au`, `vector_velocity_ms` and `vector_epoch_ms` do
NOT ride the campaign. A construct the flight update does not mention has PARKED, and
`applyFlightUpdate` CLEARS those fields for it — so silence is a positive statement, not "no
change". That is why `buildFlightUpdate` must describe every non-parked ship every time rather
than only the ones that changed: a diff-shaped message here would park every ship it omitted.
WHY: those five fields changed every tick inside a multi-megabyte document, so `sendIfChanged`
could never dedupe the campaign and a ship under way re-sent ~765 KB to every viewer about twice a
second (inbox G51, and the receiving half of B94). The route was ALREADY a time-to-position
function — its knots carry `t` — so the receiver could always have computed the ship itself.
THE TRAP IF YOU ADD A SIXTH FIELD: add it to `FLIGHT_NODE_FIELDS` and to `flightFieldsOf`, or the
strip and the merge will disagree about what "absent" means and a ship will keep a stale value
forever. `flightState.spec.ts` pins the round trip.
AND THE MERGE IS COPY-ON-WRITE, WHICH IS LOAD-BEARING RATHER THAN TIDY. The 3D scene HOLDS the
very system object the receiver merges into - `displaySystem` is `starmap.systems[i].system` by
reference and `setSystem` stores it as `currentSystem` - so an in-place merge makes B94's
motion-only gate compare an object with ITSELF. `onlyFlightVectorsDiffer` then reports "nothing
moved", falls through, and does a full ~103 ms rebuild for five numbers, which is B94's storm
returning through the front door. A changed ship therefore gets a NEW node object and an
unchanged one keeps its identity; an update that changes nothing returns the SAME map.
BLAST: `visibleNodes` had to stop asking "does it carry a stamped vector" (see SYNC-4).

### SYNC-4 ONE PREDICATE FOR "THIS CONSTRUCT IS PLACED ABSOLUTELY", AND IT NEEDS A CLOCK
BUCKET: ARCHITECTURE + DOMAIN - architecture: one predicate for one question, and where a second one
is deliberate BOTH are stated. Domain: a ship keeps the route it flew after arriving, so PRESENCE
alone would leave it free-flying for ever - the window is the question.
WHERE: `isFreeFlying` in `constructs/flightState.ts`, used by `system/visibleNodes.ts`.
RULE: a construct is free-flying if it carries a stamped vector, OR its route covers the instant
being drawn. The WINDOW matters: a ship keeps the route it flew after arriving, so presence alone
would leave it free-flying forever instead of going back to being an ordinary orbiter.
WHY IT IS NOT OBVIOUS: `visibleNodes` used to ask only about the vector, which was a second answer
to the question `worldPositions` answers with "a course OR a vector". They agreed only because the
GM stamped a vector on every transiting ship. The moment that stamp stopped riding the campaign
(SYNC-3) the two diverged and a transiting ship would have gone INVISIBLE on a player view while
being drawn perfectly well — found by reading, before it shipped.
`worldPositions.ts` KEEPS its own presence-only gate on purpose: that module depends only on the
propagator and must not import transit code. Two gates, one deliberate difference, both stated.
BLAST: `getVisibleNodeIds`'s third argument is optional, so a caller with no clock keeps the old
vector-only behaviour rather than silently gaining or losing ships.

### SYNC-5 WHICH CLOCK PLACES A SHIP ON ITS ROUTE — THREE ANSWERS, AND `null` IS ONE OF THEM
BUCKET: ARCHITECTURE - three answers and null is one of them; a boolean could not express the third
case. One clock function with three readers has no way to disagree, which is the whole point.
WHERE: `routeClock()` in `holo/scene.ts`, fed by `setTransitMotion` and `setGmClock`.
RULE: a PLAYER view reads the route at ITS OWN display clock, following the GM or not. A view with
no GM clock known reads `null` - do not place from the route at all, fall back to the stamped vector.
**AMENDED BY G51 Q6, owner 2026-08-27.** This entry used to say a NON-following view read the GM's
last reported instant, preserving the ruling of 2026-08-08 that live traffic is the GM's clock to
run. The owner reversed that ruling on the finding that made it obsolete: the route's knots carry
TIME, so a player view can WORK OUT where a ship is rather than being told, and [[G49]]'s rule (the
clock is the viewer's whenever everything on screen is derivable from it) then applies on its own
terms. The old rule was made when the view could not work it out; that reason has gone.
WHY THE THIRD CASE EXISTS AND MUST NOT BE COLLAPSED: `null` is the GM'S OWN 3D view, which never
receives `SYNC_TIME`. Defaulting it to the local clock would silently change how the GM's own
ships are placed — from their stamp to a re-estimate — which is a different thing to have done and
nobody asked for it.
WHY IT REPLACED A BOOLEAN: the ship, its plume (`shipClock`) and its drawn line (`onRouteNow`) must
all be read at the SAME instant or the torch lights in the wrong place — the bug the `shipClock`
comment already describes. One clock function, three readers, no way to disagree.
THE POLICY IT NOW ENCODES: a scrubbing player sees a ship WHERE IT WOULD BE AT THEIR OWN TIME -
not stale, and not the GM's instant. Still zero bytes, because the viewer computes it. A preset that
FOLLOWS the GM is unaffected, its clock already being the GM's.
THE ONE ROUGH EDGE, and it is worth knowing before someone reports it: scrubbing PAST the end of a
ship's plan leaves `routeStateAt` null with no stamp to fall back on, so the ship draws at the orbit
stored on its node - which for a ship in flight is the one it DEPARTED from. The arrival re-parenting
is a GM event a player cannot derive, so this is a genuine limit rather than an oversight; clamping
to the plan's end would be the fix if it is ever judged worth one.
THE POLICY IT ENCODES, and it is the owner's: a scrubbing player sees transit traffic at the GM's
reported instant, not at their own (2026-08-08). G51 keeps that rule and makes it cost zero bytes
by COMPUTING the stamp instead of transmitting it. Changing it is a product decision (G51 Q6),
not a refactor.

### RENDER-S40 AN EXTENT MUST INCLUDE THE EXTENT OF ITS MEMBERS, NOT JUST THEIR DISTANCES
WHERE: the `rMax` loop in `holo/scene.ts` (`setSystemBuild`), and `physicalRadiusAu` in
`rendering/scaleLaw.ts`, which both it and the `bodies[]` build now share.
RULE: `rMax` is the largest of `|position| + that node's own TRUE radius in AU`. It used to be the
largest `|position|` alone - and a star sits at the CENTRE, so its position magnitude is zero and it
counted for nothing at all.
WHY IT MATTERS BEYOND THE SCREENSHOT THAT FOUND IT (inbox A78): `rMax` is the framing normaliser for
the whole scene. `compressRadius` maps it to `GRID_RADIUS`, `trueScaleFactor` is `gridRadius / rMax`,
and the whole-system shot frames `GRID_RADIUS`. So a lone red supergiant fell through to the 1 AU
fallback while its own radius is 4.19 AU, and drew at ~50 scene units inside a frame of 12 - an
unbroken orange field with no disc and no limb. Everything downstream was solving correctly for a
number that described the wrong system.
TRUE RADIUS, NEVER THE RENDERED ONE, and this is the part that is easy to get backwards: the drawn
size depends on the `bodySize` dial AND on `trueScaleFactor`, which is derived FROM `rMax`. Feeding a
rendered size back in would close a loop. The extent is a fact about the DATA and is dial-independent
by construction.
THE FALLBACK IS KEPT DELIBERATELY. `if (rMax <= 0) rMax = 1` is all but unreachable now, but a system
with no drawable nodes still reaches it and `compressRadius` divides by `rMax` with no guard of its
own. One line against a division by zero.
MEASURED, so nobody re-derives it: across the two bundled starmaps this moves 72 of 74 planeted
systems by a MEDIAN of 0.016% and a worst of 0.309% (GJ 674, a red dwarf whose planet sits at 0.03 AU
so its own radius is a real fraction of its orbit). Sol moves by 2e-7. **The six BARE single-star
systems change completely and on purpose** - Ross 154 goes from the 1 AU fallback to 0.00093 AU -
because those are the case this rule exists for. All of it is at the TRUE-scale end of the dial only;
at the readable default a star still draws `STAR_RADIUS`.
BLAST: `physicalRadiusAu` replaced an inline copy of the same expression in the `bodies[]` build. A
belt carries `radiusInnerKm`/`radiusOuterKm` and no `radiusKm`, so it takes the 3000 km default rather
than its true outer edge - see the A78 row for the separate finding that Sol's Kuiper Belt therefore
draws 21% outside the grid. That is NOT fixed here and wants its own decision.
