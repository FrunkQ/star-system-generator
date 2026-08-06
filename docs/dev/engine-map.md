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

#### Positions and eclipses (C3/C9/G8) — added 2026-08-04 by the frame/suite-hygiene session

### PHY-5 The 3D propagator returns satellites ALREADY in the parent's equator; nothing may rotate again
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

### RENDER-S11 The size law is one tested module; the scene binds it, never restates it
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

#### Body facts (G8) — added 2026-08-04 by the frame/suite-hygiene session

### UI-E1 The GM technical block is NOT built from `bodyFacts`, so a shared row must share its BUILDER
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
