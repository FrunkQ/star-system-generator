# Undo/redo, the two clocks, and the traps around them

**AUDIENCE: an agent about to change `src/lib/undo/**`, `components/UndoPill.svelte`,
`components/TimeControls.svelte`, or anything that WRITES to `systemStore` / `starmapStore`.**
Not a tutorial. Every heading below cost real time or was already got wrong once, in some cases by
me, in the same week. The engine map holds the short form (`UI-C7`); this is its long-form companion.

Written on retirement by the G28 session, v2.1.863-beta.

---

## 1. THE SHADOW COPY: why there is no setter layer, and why that is fine

SSE mutates a body IN PLACE and announces afterwards - `body.massKg = ...` at ~145 sites, then
`dispatch('update')` at 109. By the time anything observes the change the previous value is gone, so
there is nothing to record. Mappadux's `CanvasUndoManager`, which this is copied from, does not have
that problem: it records from its StateManager's setters, BEFORE the mutation.

**The whole design exists so that nobody has to introduce a write path.** `systemUndo.ts` keeps a
SHADOW - a deep clone of the AUTHORED slice as of the last completed action - and pushes THAT when a
new action starts. The shadow is the "before". No mutation site knows it exists.

Three properties fall out of it, and each is load-bearing:

- **The snapshot is the authored slice and nothing else**, defined by `stripSystemForExport`
  (`importFixup`'s `DERIVED_FIELDS` + `stripBody`). Derived churn is invisible for free, and
  `process()` IS the redo function - an undo puts authored fields back and the processor re-derives
  temperature, class, tags, colour. **Do not write a second list of authored fields.**
- **An undo re-runs `process()`, which re-enters the recorder.** Hence the `applying` guard. It is
  not optional here, unlike in Mappadux where it is merely tidy.
- **The action boundary is `BodyBasicsTab.finalizeEdit()`** - the slider-release the editor ALREADY
  had for `autoClassify`. One question ("when is an edit finished?"), one answer. The 250 ms idle gap
  is the fallback for controls with no release event.

## 2. COMPARE THE SLICE WITH A DEEP EQUAL, NEVER WITH ITS JSON TEXT

`process()` deletes and re-adds fields, so an identical authored state serialises with its keys in a
different ORDER. Comparing the JSON text recorded an undo entry for a re-process that changed
nothing. The shadow is kept as the OBJECT the strip already cloned, and the comparison is a deep
equal; the stringify happens only when an entry is actually pushed.

The same trap sits in tests: `expect(JSON.stringify(a)).toBe(JSON.stringify(b))` on two systems is a
key-order test wearing a physics test's clothes. Use `toEqual`.

## 3. THE TWO STORES HAVE OPPOSITE WRITE CONVENTIONS, AND GETTING THAT WRONG SHIPPED A BUG

- **`systemStore`: every real write returns a FRESH object.** Audited. So the system recorder can
  short-cut on reference equality, and it does - that is what makes the clock's several-per-second
  no-op writes free. `AddConstructModal` was the one exception (it mutated and returned the same
  object); it was changed to return `{ ...system }` so the convention is now universal. **If you add
  a write to `systemStore` that returns its argument, undo will not see that edit.**
- **`starmapStore`: THIRTEEN sites mutate in place and return the object they were handed** -
  `+page.svelte` and `SystemView.svelte`, including the paths that ADD and DELETE a system. So the
  campaign recorder must NOT short-cut on reference. It compares CONTENT (the shell, §4).

**This is the bug of v2.1.782.** The campaign recorder was written with the system recorder's rule,
so moving, adding and deleting a system recorded nothing at all. See §7 for why the tests missed it.

## 4. THE CAMPAIGN GATE IS A SHELL, AND THAT IS A PERFORMANCE DECISION WITH A CORRECTNESS BONUS

Measured on the bundled 42-system map (178 nodes, 633 KB live):

| | size | cost |
|---|---|---|
| authored campaign slice | 227 KB | 7.5 ms |
| SHELL (map fields, routes, per-system id/name/position/subsector) | 7.66 KB | 0.03 ms |
| one system's authored content | 69.5 KB | - |

`starmapStore` **ticks with every `systemStore` emission** (`+page.svelte`'s sync, "several per
second while idle"), so the campaign gate runs on every step of every slider drag INSIDE a system. A
7.5 ms gate there would tax body editing for a feature that is not about bodies. The shell costs
0.03 ms and is BLIND to system contents by construction, so a body edit cannot produce a map entry
however hard it churns. There is a test that fires 30 body edits and asserts the map history is
still empty.

**The one thing a shell cannot carry is a DELETED system's bodies.** So the shadow keeps a REFERENCE
to each live system beside the shell, and clones just that one system into the entry when an id
disappears (69.5 KB, paid only on a deletion). Everything else is read from the LIVE map at apply
time - which is what stops an undo of "moved Sirius" from also winding back body edits made since.

## 5. AN EDITOR THAT SEEDS ITS FIELDS ONCE PER BODY MUST ALSO RE-SEED ON AN UNDO

`BodyStarTab` deliberately reads the body into its local fields only when a DIFFERENT body is
selected (`if (body.id === lastSyncedBodyId) return`), so that typing a precise mass is not snapped
back by the next store tick. That is correct and should stay.

But an undo replaces the model UNDERNEATH the open panel, which is the other time the fields must be
re-read. Before the fix, an undo restored the model correctly and the panel went on showing 1.68
solar masses over a system that was back at 1.0. `systemUndo` exports `undoEpoch`, bumped on every
applied undo/redo, and the panel watches it.

**`BodyBasicsTab` needed nothing** - it derives its fields with plain reactive statements. Only
`BodyStarTab` has the seed-once guard today. If you add another, give it the same second reason to
re-read. **No unit test can catch this class of fault**; it was found by driving the real app.

## 6. THE HISTORY IS GM-PRIVATE, AND IT SHIPPED MEMORY-ONLY FIRST ON PURPOSE

An undo log records what a GM DELETED. A save in this product is a shared artefact and the project
ships bundled example starmaps. So `undoHistory` is stripped on all four outbound paths - both
exports and both player-redaction points - through the single `stripUndoHistory` in
`undo/historyKey.ts` (a leaf module with no imports, so it cannot cycle).

**Those strips were written and tested at v2.1.774, before a single entry was ever persisted. The
persistence came at 781.** That order is the point: closing the doors while the room is empty is the
only sequence that cannot leak. If you add a fifth outbound path, call `stripUndoHistory`.

**The emergency save is the fifth path, and it is a STRIP, not a leak.** `saveStarmap` falls back to
localStorage when IndexedDB is unavailable, and localStorage is capped near 5 MB per origin. A
persisted history is allowed up to 4 MB of that, which would leave almost nothing for the campaign
itself - so the fallback drops the history. That path exists to get the map out alive in a degraded
browser; the undo log is the most expendable thing in the object and must never be the reason the
save fails.

Persistence detail worth knowing before you change it: the stack is written onto the campaign object
**IN PLACE with no store emission**, then the app's one autosave is asked to run. An emission would
recompute the whole redacted player snapshot in `+page.svelte` (hundreds of KB, fingerprint-gated for
SENDING but not for COMPUTING) on every undo step. Nothing renders the history, so nothing needs to
react to it. It caps on BYTES as well as on the owner's twenty: 1.36 MB for Sol, 14.8 MB for a
400-node system.

## 7. WHAT THE TESTS MISSED AT 782, AND THE GENERAL LESSON

The campaign history had thirteen tests and all of them passed while moving, adding and deleting a
system recorded nothing.

**Every test built its input as `{ ...map, systems: [...] }`. Not one call site in the app does
that.** The recorder and the tests happened to share an assumption - "a change arrives as a fresh
object" - that neither of them shared with the application. The live check was no better: it used a
console call that also built a fresh object, so it confirmed the same false thing more loudly.

**The lesson, which generalises well beyond undo: a test that constructs its own input can agree
with the code under test about a convention neither shares with the app.** The cure is to make the
test do it the app's way (`starmapStore.update(m => { m.systems = ...; return m; })`), and to check
that a new regression test FAILS against the old code before believing it. Three tests were added
that mutate the store the app's way, and each was run against the reverted fix to prove it fails.

A second instance of the same family, from the A60 work: `TimeControls` re-syncs `isPlaying` from
`temporal.playbackRunning` on every prop change, so in a harness that does not echo the prop back, a
`setPlaying(false)` is silently UNDONE and the play/pause label cannot tell the old behaviour from
the new. Two drafts of those tests passed for exactly that reason. The regression guard that DOES
work is the dispatch - no `playbackRunning: false` reaches the campaign - and the file says so.

## 8. NEITHER TIME LOOP IS OBSERVABLE IN A PANE THAT DOES NOT COMPOSITE - DRIVE rAF BY HAND

`TimeControls` runs two `requestAnimationFrame` loops (playback and the jog shuttle). The Browser
pane runs with `document.hidden === true`, so rAF never fires and NOTHING about time can be seen -
this looks exactly like "the feature is broken" and is not.

Replace `requestAnimationFrame`/`cancelAnimationFrame` with a queue you drain yourself, then step
the queue with a MONOTONIC timestamp:

```js
window.__raf = []; let seq = 1;
window.requestAnimationFrame = (cb) => { const id = seq++; window.__raf.push({ id, cb }); return id; };
window.cancelAnimationFrame = (id) => { window.__raf = window.__raf.filter(e => e.id !== id); };
let t = 1000;
window.__step = () => { t += 16; const q = window.__raf.splice(0); q.forEach(e => e.cb(t)); };
```

**The timestamp must keep climbing across calls.** Every tick computes `dt` from the previous
timestamp, so a per-call `let t = 1000` makes `dt` zero and nothing advances - which reads as "the
jog does not work" and wasted a cycle here and again in the unit test.

**One artefact to expect when stepping synchronously:** Svelte flushes props on a microtask, and a
tight `for` loop of steps gives it no chance to run. Each frame then computes from the SAME stale
`temporal` prop, so twenty stepped frames advance the clock by one frame's worth. That is the
harness, not the app - in a browser, frames are separated by real time. Read the STORE for truth and
step in separate calls when the difference matters.

## 9. TIME: THE JOG SEEKS, IT DOES NOT STOP THE CLOCK (A60)

`handleScrubInput` used to open with `if (isPlaying) setPlaying(false)`. Two faults in one line: the
jog stopped playback and nothing resumed it, and `setPlaying` PERSISTS - `playbackRunning: false`
went into the campaign, so the stop outlived the drag and the tab.

Now playback keeps its STATE and yields only its LOOP: `isPlaying` is untouched (nothing persisted,
and the `temporal.playbackRunning` sync has nothing to fight over) while the playback rAF is
suspended for the duration, so two loops cannot advance one clock. Release resumes from wherever the
jog left the time, and a jog dragged back to centre counts as a release - the only signal available
if the pointer is let go outside the control.

**Note for anyone reading the A60 row's original lead:** the align-time overrides
(`displayOverrideSec` / `masterOverrideSec`) were NOT involved. They are only non-null while the
5-second align runs.

## 10. THE PILL: TWO HISTORIES, ONE COMPONENT, NO GLOBAL "ACTIVE" STATE

The system view and the starmap view are never on screen together, so each mounts `UndoPill` with
ITS history passed in as props (`status`, `undo`, `redo`). Ctrl+Z therefore always winds back what
you are looking at, and the component knows about neither store. Resist adding a global "which
history is active" flag; there is nothing for it to disambiguate.

Two details that are deliberate:

- **`use:chrome`, never `use:foreground`** (`UI-C6`). Registering as foreground would make the
  chrome hide itself whenever it was visible.
- **The keys are suppressed for TEXT ENTRY ONLY** - a range or checkbox still undoes, because that
  is exactly where focus sits when a GM lets go of a slider.

## Known open, in this area

- **[[B82]]: `DERIVED_FIELDS` has drifted behind the engine.** Eight fields the processor writes are
  missing from it (`orbitalRadiation`, `irradiationDose`, `volatiles`, `surfaceSpectrum`,
  `vegetation`, `beltInnerEdgeRadii`, `magneticField`, `rotation_period_hours` on a tidally-locked
  body), plus the `hazard/*` tag namespace. Measured: **21.0 KB of Sol's 70.9 KB authored slice
  (29.7%), and 51.2 KB of the bundled campaign's 227 KB (22.6%)** is derived data that a strip
  designed to remove it is letting through. It cannot be fixed by lengthening the list -
  `magneticField` is GM-editable (and already carries `manual: true` when hand-set, which is the
  answer for that one), and `rotation_period_hours` is authored EXCEPT when the processor overwrites
  it for a locked body. Each field needs the question answered on its own. Fixing it also makes the
  undo labels precise for free: one mass drag currently moves nine fields on Earth, so the tooltip
  says "Edit to Earth" where it could say "Mass of Earth".
- ~~**`isManuallyEdited` is written in ~10 places and read nowhere.**~~ **CLOSED by [[G37]] phase 1,
  v3.0.4-beta: RETIRED.** It was 32 write sites, not ten, and the only thing that ever read it was
  `describeChange`, which had to FILTER IT BACK OUT of every edit label. Deleted from the type, from
  every write, and from older saves on load. Each write site kept its fresh-object spread (`{ ...s }`)
  because that convention, not the flag, is what the recorder depends on — see section 3.
- **The undo labels have only been seen for mass, GM notes, delete, move and rename.** A composition
  recompose, an orbit change or a tag edit may read oddly; the phrasing is a diff heuristic and only
  a human eye can judge it.
- **Unseen by eye:** the starmap pill and the tooltips. Geometry, computed style and behaviour are
  verified; the look is not.
