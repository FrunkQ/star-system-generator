# G28 — Undo/redo: handoff for a fresh session

Written 2026-08-17 by the coordinator, from inbox [[G28]] with every claim below re-verified in the
tree at v2.1.739-beta, and re-checked at v2.1.772-beta on 2026-08-17 (line numbers below are the 772 ones). This is the whole brief; the inbox entry is the history.

**One sentence:** a floating undo/redo that winds back a GM's authored edits and lets `process()`
re-derive everything else — built by copying Mappadux's `CanvasUndoManager`, taking the "before" from a
shadow copy because SSE has no setter layer, using the slider-release boundary the body editor already
has, and STRIPPING the history on export, share and broadcast.

Owner decisions already taken (do not re-open): V3, in the welcome list as `coming`
(`src/lib/components/WelcomeModal.svelte:78`, blurb "Hallelujah." — his, keep it); "we only need to
revert a value and recalculate — a list of changed values since last save; maybe keep the last 20 in the
save file"; "look at mappadux — worked great there"; "IDLE_GAP_MS = 250 needs us to just store the
value once the user has moved on as 1 value."

## Read first, in this order

1. `docs/dev/observations-inbox.md` — the standing rules at the bottom (worktree per session, stage
   explicit files, never `git add -A`, `changelog.md` is tracked lowercase, bump the patch version on
   every push, `npm run build` green before push, commit as FrunkQ <frunk@frunk.net>, the two GENERATED
   fixtures churn under vitest and are never committed). Then the [[G28]] row.
2. `docs/dev/engine-map.md` — [[PHY-1]] (nothing reads what a later pass writes; `process()` is
   idempotent and `idempotence.test.ts` enforces it), [[TAG-5]] (authored tags vs derived), [[TAG-9]]
   (player redaction happens at exactly one point), [[DATA-M3]] (a save is a bundle or plain JSON, the
   magic number decides). Grep the file for `UI-` before adding a control.
3. `C:\Development\dynamic-map-renderer-v2\src\gm\CanvasUndoManager.ts` — 141 lines, the thing to copy.

## What is true in the tree today (verified 2026-08-17)

**There is no GENERAL undo anywhere.** ONE specific, single-shot undo exists and is NOT yours: `src/lib/starmapStorage.ts:127-136` (`savePreUpgradeStarmap` / `loadPreUpgradeStarmap`) restores the pre-upgrade campaign snapshot from Settings, and its own comment says *"a single, specific undo for a single, specific action."* Leave it exactly as it is; do not absorb it into the history and do not reuse its storage key. `src/lib/ui/foreground.ts:44` already names your pill: *"A NEW FLOATING CONTROL (G28's undo/redo pill is the next one) takes `use:chrome`, NOT `use:foreground`."* `grep -rli undo src` hits only prose ("This can't be undone", a ring
"has to undo the column offset"). No `<svelte:window on:keydown>` in `src/routes/+page.svelte` or
`SystemView.svelte` — check `AppShell.svelte` and the modals before adding a global key handler.

**Every system-level edit ends in ONE store**: `systemStore` (`src/lib/stores.ts:25`). The 109
`dispatch('update')` sites in the components funnel through a handful of consumers in
`src/lib/components/SystemView.svelte`:

- `:912 handleBodyUpdate` — receives the (already mutated) body, splices it in, calls
  `systemProcessor.process(...)` at `:945`, and sets the store with `isManuallyEdited: true`.
- `:805 handleConstructUpdate` — same shape for constructs.
- add / delete / other structural edits set the store at `:614`, `:1306`, `:1311`, `:1337`, `:1432`,
  `:1451`, `:1177`.
- Load, switch and rename set it from `src/routes/+page.svelte:436`, `:1103`, `:1113`, `:1598`,
  `:1604` — these are NOT user edits and must reset the history, not record into it.

Starmap-level edits (system positions, depth, description on the "My Starmap" bar) go through
`starmapStore` (`src/lib/starmapStore.ts:4`). Out of V1 scope — see below.

**The mutation convention is in-place-then-announce.** `BodyBasicsTab.svelte:222 commit(out)` writes
`body.massKg = ...` directly on the shared object and then `dispatch('update')`. So by the time the
store is set, the previous value is gone from the object. That is why the shadow copy exists.

**Sliders dispatch PER INPUT, not per release.** `commit()` fires on every drag step (`:257-272`
`applyMass/applyRadius/applyDensity` all call it), and `finalizeEdit()` (`:231`, "runs on slider release
/ number-input edits") is the release boundary that re-arms autoClassify. So one drag is a BURST of
store sets. Coalescing is not optional, and `finalizeEdit` is the boundary to reuse — do not invent a
second idea of "the edit is finished" ([[G28]] says why: two boundaries would show up as undo steps that
do not line up with type changes). Measure the burst before designing: count store sets during one
mass-slider drag and one number-field edit.

**"Authored" is already defined, by its complement.** `src/lib/system/importFixup.ts:29
DERIVED_FIELDS` and `stripBody` (~`:110`) delete what the processor re-derives; what survives is the
authored set (with the two exceptions written there: a STAR's `temperatureK` and `radiationOutput` are
authored inputs). Diff `stripBody(before)` against `stripBody(after)`, or the equivalent field list, and
derived churn is invisible to the log for free. Do not write a second list of authored fields.

**Export has ONE strip function and the history must go through it.** `stripStarmapForExport`
(`importFixup.ts:309`) is what `+page.svelte:1654` calls before packing a starmap; the system save at
`SystemView.svelte:1379` builds `systemToSave` and calls `packBundle('system', ...)`. Both are the place
to drop the history. `src/lib/io/bundle.spec.ts` is the round-trip test to extend.

**Persistence is the campaign object in IndexedDB**: `src/lib/starmapStorage.ts:106 saveStarmap`. If
the last-20 history is kept across reloads it rides that object. Two rules from earlier work: ONE
campaign in storage, and never stamp provenance on autosave (only on explicit save — see the M1 comment
at `+page.svelte:1646`).

**Broadcast is separate from save, and redacts at one point** (`src/lib/broadcast.ts`, [[TAG-9]]).
"The whole campaign, redacted" is streamed on request. If the history rides the campaign object, the
redaction MUST strip it, or a player receives the GM's edit history — check the payload builder does
not spread the whole object.

## What transfers from Mappadux, and the one thing that does not

`CanvasUndoManager.ts`: coalescing by kind with `IDLE_GAP_MS = 250` (`:53`, `:84-89`); the `applying`
guard (`:63`, set around every apply at `:97-98`, `:107-108`) so an undo does not record itself; the
callback interface (`get`/`apply` per surface plus `onChange`, `:50`) so surfaces register
incrementally; new action clears redo; stack capped at 200 (`:76`); deep-cloned captures (`:73-74`);
and a header that states a deliberately tight V1 scope.

**Does not transfer:** Mappadux calls `recordIfNewAction(kind)` from its StateManager setters BEFORE
the mutation. SSE has no setters. So: keep a SHADOW deep clone of the authored state; on each store set,
apply the same idle-gap / boundary rule; if this starts a new action, push the SHADOW (the pre-edit
state) and refresh it. Same behaviour, none of the mutation sites touched. In SSE the `applying` guard
is not optional — applying an undo re-runs `process()` and sets the store, which is the very event the
recorder listens to.

Snapshot the slice or log deltas? Mappadux snapshots whole slices (`FogState`, `Marker[]`). SSE's
authored slice is small too — that is [[PHY-1]]'s whole point. Either is fine; the owner's "list of
changed values" and "snapshot the slice" converge once you notice the slice is the changed values.
Measure the size on a 400-body map before choosing (the [[G28]] estimate is ~8,000 comparisons per
user action, which is nothing, but measure it).

## Scope, V1

IN: everything that flows through `systemStore` — body and construct edits from every editor tab, add
body, delete body, the tag editor's writes to `body.tags`, GM notes, description. Undo/redo buttons in a
floating pill (owner: "on the top"), plus Ctrl/Cmd+Z and Ctrl+Shift+Z / Ctrl+Y — suppressed while
focus is in an input, textarea or contenteditable so the browser's own text undo keeps working.

OUT, stated in the module header the way Mappadux does: starmap-level edits (`starmapStore`),
player-view presets, settings, time. Add later if the user finds the gap.

**Placement — A52 IS BUILT (v2.1.762, engine-map UI-C6), so this is now a one-liner:** `src/lib/ui/foreground.ts` exports two Svelte actions. A dialog marks its backdrop `use:foreground`; persistent chrome marks itself `use:chrome`, and one CSS rule at the foot of `styles/tokens.css` hides `.sse-chrome` when a foreground UI is open on a phone. NEITHER SIDE KEEPS A LIST. So the undo pill marks itself `use:chrome` and is covered — hidden under an open dialog on a phone, present otherwise. Do not write any hide logic of your own. See `foreground.spec.ts` for the pattern, and the floating time control in `SystemView.svelte` for a sibling that already does this.

## Acceptance

- Drag the mass slider on Earth from 1.0 to 1.5 in one drag: ONE undo entry. Undo restores 1.0 AND
  every derived quantity (temperature, class, tags) — because `process()` re-ran, not because you
  stored them.
- Type in a number field, blur: one entry. Edit the description: one entry per commit, not per key.
- Undo, then make a new edit: redo stack is empty.
- Undo does not record itself (the `applying` guard); redo likewise.
- Load a different system: history resets; it does not carry the previous system's entries.
- Export the starmap and the system as bundle AND as plain JSON: NO history in the file
  (`bundle.spec.ts` asserts it). Round-trip a save that DID contain history: loads, and the history is
  either restored (if you keep last-20) or dropped — either way nothing crashes.
- If history persists in the campaign object: the broadcast payload does not contain it (test it).
- Ctrl+Z inside a text field edits the text, not the model.
- `idempotence.test.ts` and `physics-baseline.test.ts` still green; the two generated fixtures show
  no churn beyond what vitest always produces (discard, never commit).

## Deliverables

1. `src/lib/undo/` — the manager (copied, credited in a header comment to Mappadux's
   `CanvasUndoManager.ts` and its version), the shadow, the store hook. Unit tests for coalescing, the
   guard, redo-clearing, the cap, and the reset-on-load.
2. The pill + keys.
3. The strip on export (both paths) and on broadcast if applicable, with tests.
4. ONE engine-map entry (`### UI-<next> The undo history is GM-private and is stripped at export,
   share and broadcast` — WHERE / RULE / WHY / BLAST, the file's format), same commit as the code.
5. Changelog line prepended AFTER "All notable changes are listed here:", version bumped, build green,
   push beta.
6. `WelcomeModal.svelte:78`: remove `pending: 'coming'` ONLY when the owner has seen it work.
7. Documentation-debt line in the inbox naming which user doc needs the feature described, and the
   [[G28]] status cell updated with the version.

## Rules that will bite here

- Measure, then change (`docs/dev/debug-tools.md`). Count the store sets in a drag before you design
  the coalescing.
- A grep that returns nothing is not an absence — say what you searched.
- Do not refactor the 145-odd mutation sites. The whole design exists so you do not have to.
- If the browser pane is unavailable, say exactly what remains unseen; a unit-tested visual is not
  finished.
- Anything that changes what the product IS (e.g. "should undo also cover the starmap?") is the owner's
  call — recommend, do not decide.
