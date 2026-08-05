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

**ENTRY FORMAT** (keep it):
```
### <ID> <short imperative claim>
WHERE: file:symbol (the code that enforces it)
RULE: the invariant, in one or two sentences.
WHY: the failure it prevents — ideally the one that actually happened, with its inbox id.
BLAST: what else to check when you change this.
```

**STATUS:** started 2026-08-04 by the tagging stream, seeded with the tagging + tag-lifecycle
domain only. Every other domain is a stub awaiting its owner. Coordinator owns the shape.

---

## TAGS — lifecycle and provenance

### TAG-1 One module decides what may delete a tag
WHERE: `src/lib/tags/tagLifecycle.ts`
RULE: `stripForReprocess` / `stripRuleTags` are the ONLY ways engine code removes a tag by
provenance or namespace. Removing by exact key in response to a user action is not covered and is
allowed (`tagCategories.ts` edit ops, `coi.ts` toggle).
WHY: the rule used to be restated at 34 call sites and 25 of them deleted hand-added tags, so a GM
override could not exist. `importFixup` also deleted one on save.
BLAST: adding a strip anywhere → route it here. Grep `tags.filter` before assuming a site is new.

### TAG-2 Sparing a tag on strip is only half; the emit must be guarded
WHERE: `tagLifecycle.emit`, used across `core/SystemProcessor.ts`
RULE: a pass that spares hand-added tags and then pushes unconditionally produces DUPLICATES. Strip
with `stripForReprocess`, emit with `emit()` — which no-ops when the key is already present, so a GM
override suppresses the derived twin rather than sitting beside it.
WHY: the idiom was invented twice by hand (B28 `hazard/radiation`, B31 `flight/ascent`) before it was
named. Without the guard an override doubles on every pass.
BLAST: multi-emit keys must NOT use `emit()` — see TAG-3.

### TAG-3 Some keys legitimately appear several times on one body
WHERE: `tagConsistency.spec.ts` ("packs no delimited list into a single tag value")
RULE: `volatiles/ices` (x4 on real bodies), `structure/cloud-deck` (x2), `weather/precipitation` (x2).
Several of a thing = several tags, never one delimited value. Do not dedupe tags by key globally.
WHY: a blanket dedupe silently deletes real data; the alternative (comma-joined values) is the
mini-format the consistency suite exists to forbid.
BLAST: any "clean up duplicate tags" idea. Any `emit()` added to a volatiles/cloud/weather push.

### TAG-4 Provenance is declared by the category; the tag carries only a flag
WHERE: `tagDefaults.ENGINE_NAMESPACES`, `tagLifecycle.namespaceProvenance`, `TagCategory.provenance`
RULE: the tag records whether a human added it (`manual`); the CATEGORY records what a tag in that
namespace is otherwise (`physics` = re-derived every pass, `authored` = written once at generation,
never re-derived). Exact keys may override their namespace — `orbit/` is mixed.
WHY: it was a hardcoded prefix list inside the lifecycle module; adding an engine namespace anywhere
else left its tags silently claiming to be physics-derived (A44).
BLAST: new engine namespace → add it to `ENGINE_NAMESPACES` or its tags read as physics. The same
table feeds the GM-override dropdown; do not add a second list.

### TAG-5 `authored` tags are removable and never come back
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
WHERE: `SystemProcessor.calculateHabitabilityAndBiosphere` (the fixed example)
RULE: one clear per namespace, at the top of the owning pass. Not per branch.
WHY: habitability cleared in two branches; the two then disagreed about sparing hand-added tags,
because a rule applied to one was silently absent from the other (B38).
BLAST: if you find a second clear of one namespace, hoist rather than add a third.

### TAG-7 Tag keys are case-insensitive with ONE canonical spelling
WHERE: `tagLifecycle.canonicalTagKey`, `tagSlugSegment`, `canonicaliseTags`
RULE: fold at creation, not by comparing loosely everywhere. Lowercase, spaces→hyphens. Display
casing is regenerated by `describeTag` (title-case), so storage stays canonical.
WHY: free text ("Smugglers", "Red Syndicate") became keys that the import strip read as V1
display-name tags and deleted on save.
BLAST: ORDERING TRAP — `isLegacyTag` recognises a V1 tag BY its capitals and spaces. Canonicalise
AFTER the legacy strip or you launder every V1 tag into a valid-looking user tag.

### TAG-8 Rule evaluation order is load-bearing
WHERE: `TagRule.seq`, consumed in `reasonsToVisit.poiPacks`
RULE: each body rolls a seeded random number PER RULE and the sequence advances every time. Changing
the ORDER rules run in changes which tags every world gets. `seq` preserves the authored order across
storage changes.
WHY: moving rules onto their categories grouped them by category and re-rolled the entire bundled
starmap. Caught only by the derived baseline moving.
BLAST: anything that re-orders, filters, or re-groups the rule list. Diff
`tests/output/solar-system-derived.json` after.

### TAG-9 Player redaction happens at exactly one point
WHERE: `system/utils.computePlayerSnapshot` → `tagLifecycle.redactTagsForPlayers`
RULE: `secret` tags and `playerHidden` categories are stripped there. Every player surface
(catalogue, player views, holo, broadcast, report) reads that snapshot.
WHY: a second redaction site is how a leak happens — one surface gets the fix, another does not, and
nothing reports the difference.
BLAST: a new player-facing surface must consume the snapshot, not the raw system.

### TAG-10 Defaults live apart from the store that seeds from them
WHERE: `src/lib/tags/tagDefaults.ts`
RULE: `tagDefaults` has TYPE-ONLY imports and therefore cannot cycle. `tagCategories` and
`tagLifecycle` both seed from it AT MODULE LOAD, never lazily.
WHY: lazy seeding from "whoever imports first" meant a spec that never imported `coi.ts` ran against
an empty store — the B33 surface-resource assertions failed for a reason unrelated to B33. The same
trap recurred with the provenance registry a phase later.
BLAST: any new registry. Seed it at load; write a test that does NOT import the store.

### TAG-11 Storage is one store behind old names
WHERE: `tags/tagCategories.ts`; `constructs/coi.ts` and `physics/reasonsToVisit.ts` export VIEWS
RULE: `coiCategories` / `poiPacks` / `reasonsConfig` are derived read-only views over
`tagCategories`. Mutating them does nothing. Write through the `tagCategories` mutators.
WHY: PoI and CoI were the same shape in two stores with two file formats and two disagreeing
definitions of "core".
BLAST: these views are the deletion target once their last consumer moves.

### TAG-12 SYSTEM means undeletable, NOT undisableable
WHERE: `tagCategories.SYSTEM_CATEGORY_IDS`, `normalizeTagCategories`
RULE: status, owner, purpose, resource, class, drive, frontier cannot be DELETED (the engine matches
those slugs by hand). They CAN be switched off.
WHY: `frontier` has always been user-toggleable; forcing it on during migration would have silently
re-seeded tags across an existing campaign.
BLAST: migration must copy enabled state verbatim; "absent preference" is NOT "on" — `intrigue`
ships off (caught by the derived baseline moving).


### TAG-13 Map markers read the snapshot, never the raw system
WHERE: `tags/mapHighlights.markersFor` (takes tags, not a body id)
RULE: `markersFor` has no idea who is looking, deliberately. The caller passes tags that are ALREADY
redacted for that audience — player surfaces pass the snapshot (TAG-9), GM surfaces pass raw.
WHY: it makes "highlight the whole Faction category" safe to leave on: a secret faction cannot become
a player badge, because it was removed before markers were built. Teaching the marker builder about
audiences would put a second redaction rule next to the first.
BLAST: a new marker surface → confirm which tags it hands in.

### TAG-14 Highlight selection is live and shared, not per-surface
WHERE: `player/liveOverrides.mapHighlights`
RULE: ONE value drives the GM's maps and the players' windows. Momentary — never saved into a preset.
WHY: the GM must be looking at what they are about to push; a separate preview is a second source of
truth for "what shows on the map".
BLAST: do not add a GM-only copy. Persisting a favourite set is banked, not built.

### TAG-15 A player window has its OWN store instances
WHERE: `SystemVisualizer.highlights` prop; `broadcast.PresetOverrides.mapHighlights`
RULE: the player view runs in a separate document, so every Svelte store in it is a fresh empty
instance. Anything the GM sets locally reaches it ONLY over the broadcast. Components shared by both
take the value as a prop and fall back to the store.
WHY: a shared component reading `$liveOverrides` works on the GM's screen and silently does nothing
on the player's — no error, just a feature that never appears.
BLAST: any GM-side live control that a shared component consumes. Add it to `PresetOverrides` too.

### TAG-16 There are TWO tag pickers and they are not duplicates
WHERE: `components/TagFinder.svelte` (map-derived) vs `components/TagPicker.svelte` (full vocabulary)
RULE: TagFinder offers only tags something ACTUALLY carries, with counts — for finding, and for
choosing map highlights. TagPicker offers every category, engine namespace and declared tag whether
or not anything carries it — for adding a tag by hand, and for authoring.
WHY: picking the wrong one fails in BOTH directions. A manual-tagging picker filtered to what exists
can never add the first instance of anything; a highlight picker full of unused tags offers things
that will never appear on a map.
BLAST: new tag-choosing UI → pick deliberately and say which in the component header. Do not "unify"
them; the filtering IS the difference.

---

## PHYSICS — ordering and honesty

### PHY-1 Nothing may read a value a later pass writes
WHERE: `src/lib/system/idempotence.test.ts`
RULE: process, process the result, process that — nothing on any body may change. If that test goes
red, find the read; do not relax the test.
WHY: seven such edges at once in B13; one put a hundredfold error on Earth's radiation card. Every
other test runs `process()` ONCE and therefore pins pass-1 values a GM never sees.
BLAST: corollaries — a derived CLASS is never a physics input (the classifier runs late); when a
quantity depends on another body, iterate PARENT BEFORE CHILD, not in file order.

### PHY-2 A quantity correct for its purpose can still be published as a lie
WHERE: `tags/tagConsistency.spec.ts`
RULE: when you add a derived field or tag, state WHAT it measures, WHERE, and IN WHAT UNITS, and
check its name and its neighbours agree.
WHY: a relative ratio printed beside an absolute dose (A33); a belt peak labelled "orbital" (B27); an
appearance driver published as a hazard reading (B28).
BLAST: changing a quantity → grep every tag bucketed off it AND off any older proxy for it.

### PHY-3 The radiation bucket has exactly one implementation
WHERE: `physics/radiation.radiationHazardBucket`, consumed by `SystemProcessor` and `catalogue/bodyFacts`
RULE: the tag and the info-block row must bucket with the same function.
WHY: two implementations called Mars and Io both "high", sixty thousand times apart (B28).
BLAST: any new place that turns a dose into a word.

### PHY-4 Surface-requiring claims are gated on makeup.gas
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

---

## STUBS — owners, add your domain here

Keep the entry format. One entry per trap, not per file.

### RENDER-*  (appearance / planetAppearance / holo scene)
_Unwritten. Candidates: the floating-origin rule (scene coordinates are relative to camera focus, so
(0,0,0) is not the star); immutable GL texture caveat (A1); "a proximity test against a sampled curve
must be against its SEGMENTS, never its samples"._

#### Ship models (G3) — added 2026-08-04 by the ship-appearance stream

### RENDER-S1 One builder dresses a ship model, everywhere it is drawn
WHERE: `src/lib/constructs/modelViewer.ts:buildDisplayModel`
RULE: the import modal's preview, the info-block turntable and the holo scene's focused hull ALL
build through this one function (finish, tint, livery, normalise-to-unit-length, optional orient
bake). Never dress a model at a call site.
WHY: what the GM approves in the dialog must be what every surface shows. Three copies would drift
the first time a finish was added — the same fault A46 fixed for the body portrait.
BLAST: adding a finish, changing normalisation, or adding a fourth surface that draws a hull.

### RENDER-S2 A construct contributes NO radius, model or not
WHERE: `src/lib/holo/scene.ts` (`frameDistance`, the clearance branch in `updatePositions`)
RULE: a ship model is a MARKER with real geometry, not a body. It must never feed ring clearance or
the whole-system bounding sphere (F5). `frameDistance` may read its hull length to frame it; nothing
else may.
WHY: real extent in the clearance maths makes camera framing depend on zoom — F4's bug class — and
would push moons off their orbits around a station.
BLAST: any new use of `shipLen`. Any "make constructs act like bodies" change.

### RENDER-S3 Nozzles live in the model's own space, orientation applies at view time
WHERE: `ModelRef.nozzles` (`types.ts`), `modelViewer.setNozzles` / `setOrient`
RULE: authored drive positions are stored BEFORE `orient` is applied, and the plume rig hangs off
the same group the orientation fix rotates. Storing them post-orientation strands every drive the
moment the GM re-aligns the hull.
WHY: orientation is editable forever; the placement was made once.
BLAST: baking orient into the stored binary; moving the plume group out of `orientGroup`.

### RENDER-S4 Camera near-plane must follow the framed object all the way down
WHERE: `src/lib/holo/scene.ts` (near-plane block in the render loop)
RULE: `near` tracks the camera-target distance with a floor low enough for the SMALLEST framable
thing. A ship at true scale frames at ~1e-9 scene units; the floor is 1e-11.
WHY: the floor was 1e-8 — written when the smallest framable thing was a body (~1e-7) — so focusing
a construct at true scale put the whole scene inside the near plane and the view went black.
BLAST: anything that can be framed smaller than a body (debris, a docked shuttle).

### RENDER-S5 An interface-declared method is not an implemented one
WHERE: `modelViewer.ts` return object; guarded by `modelViewer.spec.ts` ("createModelViewer surface")
RULE: the viewer is an object literal behind a hand-written interface, so a method dropped from the
literal still type-checks against the interface and fails only at the call site, at runtime.
WHY: a refactor replaced the span between two methods and silently deleted `setOrient` — Pitch/Yaw/
Roll died with "setOrient is not a function" and nothing else complained. The surface test now
asserts every declared method exists (mutation-checked: remove it again and the test fails).
BLAST: any range-based edit of that return object. Add new methods to the required list.

### RENDER-S7 Never swallow an exception on the path that decides whether a thing renders
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
WHERE: `src/lib/holo/scene.ts:dialBlend` (bodies, stars and ship hulls all route through it)
RULE: size = true^(1-v) x readable^v, so each step of the dial multiplies size by a constant ratio.
WHY: linear blending let the readable term dominate a 1e-5 true radius immediately — 20%-90% of the
travel looked identical and the whole true-scale transition was crammed into 0-5%. Log spacing also
makes ships shed size faster than planets for free (bigger readable-to-true ratio), which is what
"constructs should be smaller" asked for.
BLAST: changing either endpoint; adding a new object class to the dial. Mid-dial looks in SAVED
presets move if this changes — endpoints do not.

### TRANSIT-*  (journeys, autopilot, routing)
_Unwritten. Candidates: which tags autopilot matches by slug and what breaks if they move; readiness
and tardiness sources; belt mass is a debris-density proxy, not gravitational mass._

### DATA-*  (starmaps, import, rulepacks)
_Unwritten. Candidates: `tests/fixtures/*` and `tests/output/*` are GENERATED, never hand-edited;
bundled-map collision protection in the real-sky importer; stable-id rules._

#### Ship-model binaries (G3) — added 2026-08-04 by the ship-appearance stream

### DATA-M1 A model binary never rides the node
WHERE: `src/lib/constructs/modelStore.ts`, `modelTransfer.ts`, `broadcast.ts` (`REQUEST_MODEL`)
RULE: the node carries a `ModelRef` (hash + attribution) ONLY. The GLB lives in a hash-addressed
IndexedDB store; it reaches a saved file by explicit embedding at export, and a remote player by an
on-demand fetch keyed on the hash. Inlining it as a data URL is the trap.
WHY: `sendIfChanged` re-stringifies and re-sends the WHOLE snapshot on any change. A photo (30-80 KB)
survives that; a 500 KB model multiplies every resend until the GM's tab stalls.
BLAST: any new place a model is attached; anything that puts bytes on a node. Content addressing
means two ships sharing a hull cost one entry — do not "clean up" the store per construct.

### DATA-M3 A save is a bundle or plain JSON, and the MAGIC NUMBER decides
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
WHERE: `src/lib/io/attributions.ts`, written into every bundle as `ATTRIBUTIONS.md`
RULE: each uploaded model/image is listed once with what uses it and its credit/licence/source.
An asset with NOTHING recorded is listed as such; CC-BY with no credit is called out as a breach
rather than a gap. `collectAttributions` reads only assets the bundle CARRIES (an `assets/` path),
never a remote url or an unpacked data: url - so it must run AFTER packing has rewritten them.
WHY: a save gets handed to a player or posted publicly. Provenance buried in JSON is provenance
nobody honours, and CC-BY is an obligation, not a preference.
BLAST: changing the asset paths (the collector matches on the `assets/` prefix). Adding an upload
surface: fill the ImageRef/ModelRef provenance fields or every asset it creates reports blank.

### DATA-M2 Imported model bytes are verified against their own key
WHERE: `modelTransfer.importEmbeddedModels`; pinned by `modelTransfer.roundtrip.spec.ts`
RULE: an embedded blob is re-hashed on import and DROPPED if it does not match the key it arrived
under. A ref whose binary this machine never had exports ref-only and degrades to the icon glyph.
WHY: the store is content-addressed; mis-filing a payload under someone else's hash would poison
every construct pointing at it.
BLAST: adding another transport (the broadcast path shares this function deliberately).

#### Real-sky import and the bundled starmaps — added 2026-08-04 by the importer stream

### DATA-R1 A correction to a bundled map belongs in the KIT, never in the JSON
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

### DATA-R2 Node ids are stable REFERENCES, and they feed the orbital phase hash
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
WHERE: `src/lib/import/realsky/convert.mjs` (`mutualIncMax`), `data/systems-real.mjs` header
RULE: SSE's reference plane is the SYSTEM's own plane, so planets get a near-zero mutual inclination
(default spread 1.2°). Discovery papers quote inclination against the SKY, where a transiting system
reads ~90°. The two numbers are not interchangeable and the catalogue column is the wrong one.
WHY: importing the published value stands a transiting system on its edge — every TRAPPIST-1 planet
in a vertical line. Spotted in the old hand-built map by the owner before the rebuild.
BLAST: any new orbital-element source (Gaia, WDS, VizieR). Satellites are a separate question — see
`orbit.frame` and C3, which is about a moon's parent equator, not this.

### DATA-R4 The importer never invents and never overwrites — and both must reach the user
WHERE: `convert.mjs` (`starNodeFromRow` skips, `BUNDLED_ARCHIVE_HOSTS` collisions), `RealSkyImportModal.svelte`
RULE: a host missing mass, radius or temperature is SKIPPED with a named reason rather than guessed
into existence, and a host already curated into a bundled system is returned as a COLLISION rather
than converted. `convertArchiveRows` returns `{systems, collisions, skipped}` and the caller is
required to SHOW the last two. Filtering them away to tidy the dialogue defeats the whole design.
WHY: raw catalogue rows overwriting curated systems is exactly the drift DATA-R1 exists to prevent,
arriving from the other direction; and a silently short import reads as a complete survey.
BLAST: any new consumer of `convertArchiveRows`. The collision list is generated from the roster, so
it is only as current as the last kit run (D15).

### DATA-R5 The shared real-sky core must stay plain, dependency-free ESM
WHERE: `src/lib/import/realsky/{constants,positions,stars,planets,convert,query,clusterGate}.mjs`
RULE: these files are imported by BOTH the Vite app and `scripts/starmap-build/build-starmaps.mjs`,
which runs under plain `node`. No TypeScript, no `$lib` alias, no Svelte imports — use relative
paths. App-only logic (`fillout.ts`, `stardefaults.ts`) is `.ts` and may use `$lib` freely.
WHY: a `$lib/…` import inside `convert.mjs` type-checks, bundles and passes every browser test while
breaking the build kit — and the kit is what regenerates the shipped maps, so the damage surfaces
later, as DATA-R1's failure mode.
BLAST: `node -e "import('./src/lib/import/realsky/convert.mjs')"` is the cheap check.

### DATA-R6 The Exoplanet Archive is ALWAYS CORS-blocked in a browser; the proxy is the live path
WHERE: `src/routes/api/realsky-tap/+server.ts`, `src/lib/import/realsky/catalogue.mjs`
RULE: the archive's TAP endpoint sends no `Access-Control-Allow-Origin`, so a direct browser fetch
fails deterministically — SIMBAD does send it and works direct. `loadArchiveRows` tries direct (for
node, where CORS does not exist), then the same-origin proxy, then the bundled snapshot, and reports
which answered. The proxy forwards SELECT-on-`pscomppars` only; it is not an open proxy.
WHY: measured from the deployed origin after it looked like flaky availability. It was not
intermittent: every region import in the browser had been served by the offline snapshot, silently.
BLAST: adding Gaia or VizieR — check their CORS before assuming direct fetch works, and keep the
"which source answered" label honest, because a stale snapshot must never read as live data.

### UI-*  (panels, editors, player views)
_Unwritten. Candidates: which surfaces read the player snapshot; the four explanation surfaces that
drift silently (physics page, Newton explainer, tags guide, classification doc)._

#### Construct appearance (G3) — added 2026-08-04 by the ship-appearance stream

### UI-C1 One colour drives a construct's whole look
WHERE: `ConstructBasicsTab.svelte` (Appearance block), `constructIcon.ts`, `modelViewer.ts`
RULE: `icon_color` is the single authored colour: the 2D marker, the hull tint for material-less
models, and the seeded livery all derive from it. The livery's CONTRAST accent is DERIVED from it
too (seeded complementary rotation) unless a GM pins `ModelRef.accentHex`.
WHY: an owner decision — one colour to set, variation for free. A second required slider was
considered and rejected; if per-faction control is ever wanted, the lever is pack DATA.
BLAST: adding another colour field to a construct. Ask whether it can be derived first.

### UI-C2 The picture chain is model > photo > glyph, on every surface
WHERE: `catalogue/document/guideDocument.ts` (imagery branch), `ConstructPortrait.svelte`
RULE: a construct with a 3D model shows the model; without one, its uploaded photo; without that,
its authored `icon_type` glyph. Same order in the GM pane and the player document. `imagery: 'none'`
still means none.
WHY: the order was photo-first and was corrected by owner steer ("if a construct is told to be 3D,
display it first"). A28/A30 are the history: the wrong picture is worse than no picture.
BLAST: any new construct-showing surface. Do not re-derive the chain locally — read these two.
