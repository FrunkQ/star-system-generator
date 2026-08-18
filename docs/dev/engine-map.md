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
### <ID> <short imperative claim>
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

### TAG-22 `biodiversity/*` is the surface-light pass's namespace, and one tag there is a DRAW
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

### TAG-17 A helper that reads a reactive value OUT OF SCOPE is invisible to the compiler, and `{@const}` will not re-run
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

## PHYSICS — ordering and honesty

### PHY-20 A surface property that VARIES BY AN ORDER OF MAGNITUDE is a process, not a constant
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
WHERE: `src/lib/system/idempotence.test.ts`
RULE: process, process the result, process that — nothing on any body may change. If that test goes
red, find the read; do not relax the test.
WHY: seven such edges at once in B13; one put a hundredfold error on Earth's radiation card. Every
other test runs `process()` ONCE and therefore pins pass-1 values a GM never sees.
BLAST: corollaries — a derived CLASS is never a physics input (the classifier runs late); when a
quantity depends on another body, iterate PARENT BEFORE CHILD, not in file order.

### PHY-17 Chromatic adaptation is BOUNDED — never amplify a cone that has no photons in it
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

### PHY-16 Normalise a colour-matching result against the BAND, never against its own peak channel
WHERE: `physics/spectrum.wavelengthHex` (the chart ribbon) and, by the same argument, anything else
that turns a narrow spectral feature into a colour.
RULE: divide by a shared scale across the whole grid, not by that sample's own maximum channel.
WHY: out in the tails the tristimulus values are vanishingly small AND numerically meaningless — the
ragged remains of a Gaussian fit to the colour-matching functions. Dividing them by their own maximum
scaled that noise to FULL SATURATION, so the ribbon came out bright cyan at 300 nm and mint green at
780 nm. Colour where the eye has none, and it looked deliberate. Owner spotted it on the chart.
BLAST: any new plot that colours by wavelength. Also keep the near-black floor: without it the
out-of-gamut repair in `xyzToHex` (which lifts negative channels) turns a rounding error into a hue.

### PHY-14 The human eye enters at the END or it poisons the derivation
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

### PHY-15 A capture term that does not SATURATE is the naive maximiser, and Earth falsifies it
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
    that way.
Do not "harmonise" these by nudging one number: pick the boundary, then make every site CALL
`hasSolidSurface`, which is what B36 asks for and what would have made both divergences impossible.

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

#### Backfilled from closed inbox items — added 2026-08-07 by the engine-map backfill session

### PHY-7 A module that declares itself THE single evaluation has no rival, upstream least of all
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
`processEnvironment` also still ends with a dead `retainsAtmosphere` local that reads the field
(`SystemProcessor.ts:645`) — unused, so it cannot drift; do not "wire it up".

### PHY-13 A belt's or ring's `massKg` is a debris-density proxy, never a point mass
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

### RENDER-S24 A shared LOOK needs a shared CONSTANT, or the copies diverge into a bug
WHERE: `src/lib/map/gridFade.ts` (`gridFadeWindow` / `gridFadeAlpha`, pinned in `gridFade.spec.ts`),
bound by `holo/scene.ts:addGridLines` and `starmap/starmapScene.ts:fadeWindow`. Reported as C14.
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
- `bc.<TYPE>.strMs` / `.bytes` / `.sent` / `.unchanged` — the payload cost. Note `sendIfChanged`
  stringifies the whole payload on EVERY reactive tick to fingerprint it, sent or not.
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

_Belt mass is PHY-13. Route geometry and the ship's own clock are RENDER-S17 and RENDER-S18 — read
both before touching a published route._

#### Opened 2026-08-07 by the engine-map backfill session. Verified against the code, not the inbox.

### TRANSIT-1 Autopilot takes FLIGHT PARAMETERS out of user-editable tag data, by slug
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
WHERE: `routes/+page.svelte:downloadStoredStarmap` (storage → JSON → download, no render, no engine)
RULE: the recovery route for un-loadable data reads storage and writes a file, touching no renderer,
no processor and no store. Plain JSON, which the ordinary `.json` load path reads back.
WHY: the user's only exit from a map that would not load was resetting Chrome data — the campaign
was destroyed by the workaround, not by the bug. A rescue that ran the same pipeline would hang the
same way. This is why it is offered on the safe-mode screen, BEFORE any retry.
BLAST: adding assets/bundling to this path would reintroduce the dependency. Keep it dumb.

### UI-L7 A loop sized in MAP units is unbounded, because zoom is fitted to the map's own extent
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

### DATA-R7 The archive's DENSITY is usually not evidence — it is the mass again, in disguise
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
THE CUE, and it is the whole point of this entry: **you are about to say "field X is unset / wrong /
contradictory" on the strength of having read X out of a JSON file or off a node.** Stop there. Ask
who READS X in the running app. If the answer is "an accessor that derives X when it is missing", or
"nobody, the load path deletes it first", then what you measured is not what the app sees and the
conclusion is wrong — not approximately, but backwards.

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
BLAST: any audit of `classes` or `image`; and note the legacy rules path in `classifyBody` carries a
hand-maintained `baseArchetypes` Set that lists ~17 of the rulepack's 64 `kind: 'base'` fingerprints —
a second answer to "which classes are mutually exclusive", dormant only because the starter pack
ships fingerprints. It is the shape that produced those fossils.

### DATA-R18 A BAND is a range to draw from; a DESIGNATION is what a star IS. Bodies hold designations
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

### PHY-17 "Has ground" is `hasSolidSurface`, and it is the ONLY one of the four gas-threshold questions with a predicate
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

### DATA-R15 A CLASS TEST ANCHORED AT THE END SILENTLY EXCLUDES EVERY SUBTYPE
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

### DATA-R16 A BROWN DWARF HAS ONE DEFINITION, REACHABLE FROM BOTH ROLES
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

### DATA-R14 EDIT A RULE PACK AS TEXT
WHERE: `static/rulepacks/**/*.json`.
RULE: load-and-re-dump rewrites the whole file to change one key. It reflows every line, so the diff
is the entire pack and a reviewer cannot see what actually changed — and any formatting the pack
relies on for readability is gone. Do a targeted string replacement and CHECK THE DIFF STAT: adding
fourteen distribution entries should be about fifty lines, not six thousand.
WHY: it happened here (coordinator, 2026-08-14 — 6,385 lines rewritten to add one key), and the
pack is the file most likely to be edited by someone who is not looking at it closely.

### PHYS-S1 A MULTIPLIER IS NOT A LIMIT, AND A GATE IS NOT A GUARD
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

### GEN-1 The evolutionary / Accrete generation path is LIVE and deliberately preserved — never "clean it up"
WHERE: `physics/accrete-adapter.ts` + `vendor/accrete-js`, `components/EvolutionTimeline.svelte`,
`components/EvolutionaryWizard.svelte`, reached from `SettingsModal.svelte:506`
(`<option value="evolutionary">Evolutionary (Alpha Physics)</option>`, disclaimer-gated at `:131`)
via `routes/+page.svelte:896` -> `:1788`.
RULE: The whole chain is user-reachable and the OWNER HAS RULED THAT ALL OF IT IS KEPT (2026-08-07).
It reads as abandoned alpha experiment — an "Alpha Physics" label, a disclaimer, a vendored engine,
a component nothing else imports — and it is not. Do not delete, prune, tree-shake or fold it into
another generator, and do not treat its alpha labelling as permission.
WHY: two people in one conversation independently believed it had already been removed, and
`accrete-adapter.ts`'s own header still said its caller "is being removed" long after that plan
lapsed — a stale in-code instruction to delete something the owner wants kept is the most expensive
kind of wrong comment, because it reads as authority. See [[G17]].
BLAST: `accrete-adapter` is ALSO the intended harvest for V3/V4 generation, so anything that changes
`StarSeed`, `CelestialBody` or the rule-pack disk config must keep it compiling even while it has few
callers. Note its data model is Accrete's own (`Planetismal`: axis / eccentricity / earthMass), NOT
`CelestialBody` — which is why [[G17]]'s ageing work cannot simply reuse
`recalculatePlanetAgedState` on a hand-authored body. Related: `generation-duplication-map.md`
(two live system generators — this is the second one).

### GEN-2 THE MASSES THAT SET PLANET SPACING ARE A PROXY, AND NOTHING RECONCILES THEM WITH THE MASSES ACTUALLY ASSIGNED
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

### UI-C1 One colour drives a construct's whole look
WHERE: `ConstructBasicsTab.svelte` (Appearance block), `constructIcon.ts`, `modelViewer.ts`
RULE: `icon_color` is the single authored colour: the 2D marker, the hull tint for material-less
models, and the seeded livery all derive from it. The livery's CONTRAST accent is DERIVED from it
too (seeded complementary rotation) unless a GM pins `ModelRef.accentHex`.
WHY: an owner decision — one colour to set, variation for free. A second required slider was
considered and rejected; if per-faction control is ever wanted, the lever is pack DATA.
BLAST: adding another colour field to a construct. Ask whether it can be derived first.

### UI-C8 Lifting a control OUT of the component that owns the data breaks two things silently
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

### UI-C6 On a small screen an open dialog gets the screen; BOTH SIDES declare themselves
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

### DATA-R19 THREE code paths change a campaign's distance unit, with OPPOSITE conventions
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


---

## OPEN MISALIGNMENTS

**READ THIS BEFORE YOU DECIDE A SUBSYSTEM IS CLEAN.** These are places where one concept has two or
more implementations that AGREE TODAY. Nothing here is a bug; a working mess is fine. They are listed
because agreement is being held by something incidental — an ordering, a repair, a coincidence of
data — and the failure, when it comes, will look like a fault in whichever copy you did not know
about. NOT a work list. Resolve one only when you are in that area for another reason, and if you do,
say so here.

Format: **WHAT** / where / **WHY IT HOLDS TODAY** / **WHAT WOULD BREAK IT**.

### M1 "Is this a giant?" and "does this have a surface?" are two helpers with overlapping answers
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
30 executable sites across 14 files. The questions are: *has ground* (`radiation.hasSolidSurface`,
`SystemProcessor:1345`, `cloudDecks:226`, `tagDefaults.SURFACE`), *is a giant* (`albedo:126`,
`SystemProcessor:1036,1163`, `makeup:37,63,102`), *draws as a giant* (`rendersAsGiant`, `apparentColor`),
and *has a surface to rust / to weather* (`cloudDecks:299,363`, `temperature:280`).
HOLDS because the threshold happens to be the same number for all four — see PHY-4's caveat for the
two places it already is NOT.
BREAKS IF: anyone "unifies" them on the strength of the shared constant. They are four questions that
share a boundary, not one question in four spellings, and B36 is scoped as the has-ground one only.

### M3 THREE incommensurable word-vocabularies sit in one info block, and B28's inbox entry is stale
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

### M4 One preset field, `draft.grid`, is bound by TWO pickers offering different option sets
`components/PlayerPresetEditor.svelte:411` renders `MAP_OVERLAY_OPTIONS` (7 options, hexes included),
`:513` renders `SYSTEM_OVERLAY_OPTIONS` (4, hexes filtered out) — both `bind:value={draft.grid}`.
HOLDS at RENDER time because `mapOverlay.forSystemScale` folds a hex value to `square` for the system
views (`SystemVisualizer:46`, `holo/scene:1752`), so a stray hex grid never draws inside a system.
BREAKS IF: the EDITOR is where it is lossy, not the renderer. Choose Traveller hex for the starmap,
then open the system tab: that `<select>` has no matching option, and touching it writes the system's
choice back over the starmap's. A37 recorded this unnumbered and it was never picked up. The fix is
two fields or one filtered writer, not a third option list.

### M5 Three generation paths seed an rng from `Date.now()`, inside a codebase built on reproducibility
`system/modifiers.ts:55`, `:215`, `:429` — `new SeededRNG(sys.seed + Date.now())`, with the comment
"Use a new RNG seed to avoid determinism issues".
HOLDS because these are one-shot AUTHORING actions (a GM adding or re-rolling a body); the result is
stored, and nothing replays them. Same licence as the `Math.random` sites in `SystemView.svelte`.
BREAKS IF: any of it is ever called from a load, an import, a rebuild or a replay — then the same
input produces a different system every time and no test can pin it. DATA-G1 is the rule these sit
outside of; the comment is the honest signal that someone already met the tension and moved on.

### M6 Cross-references — recorded as caveats on the entries they falsify, listed here so the sweep is one place
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

### Checked and NOT a misalignment, so nobody re-checks it
- `attachHullVolume` and the read-time path at `holo/scene.ts:3529` both write `v.shipLen`, but they
  cover DISJOINT populations (model-less constructs vs model-carrying ones) and compute it from the
  same `shipLenScene(node)`. Two writers, no overlap.
- `hasSolidSurface` on an ICE giant: the B11 class-regex bug is genuinely gone. Uranus and Neptune
  infer gas-dominated from density and correctly take no surface hazard tag.
