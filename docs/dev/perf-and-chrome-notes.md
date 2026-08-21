# Performance, chrome and unit-relabel — session notes

Written 2026-08-18 by the "SSE V2 performance and memory analysis" session on retirement, at
v2.1.805-beta. **This is not a design doc and not a backlog.** It is the handful of things that cost
this session real time and are not visible from the code — the instruments that exist, what each one
actually answers, and the faults whose diagnosis was wrong in the row before it was right.

Everything durable is already in `engine-map.md` (RENDER-S22, UI-C6, UI-C8, DATA-R19) and in
`debug-tools.md`. **Read those first.** This file exists to say what a successor should NOT re-derive,
and where each thread was actually left.

---

## 1. The meters, and the one question each answers

`perfTrace.ts`, switched on with `?perf=1`, `localStorage['sse-perf']='1'` or
`window.__ssePerf.enable()`. Full index in `debug-tools.md` §1; this is the short form.

| meter | the question it answers |
|---|---|
| `holo.setSystem.same` / `.new` / `.ms` | how much scene-rebuild work is WASTED, and what it costs |
| `holo.setSystem.by.<reason>` | **who asked for it** — `prop` / `mount` (HoloView) vs `style:<dial>` |
| `rx.<TYPE>` | inbound broadcast messages on a RECEIVER (the missing half of `bc.*`) |
| `bc.<TYPE>.sent` / `.unchanged` / `.strMs` / `.bytes` | what the GM SENDS, and what fingerprinting it costs |
| `gl` provider (`renderer.info.memory`) | geometries / textures / programs beside the JS heap — the leak detector |
| `holo.ringRefineFrame` | should be quiet unless a ring is being refined |
| `[sse-load]` stage stamps | which stage of a cold load is slow or stuck |

**THE EVENT RING IS THE PART THAT IS EASY TO MISS.** `perfEvent` records one cheap row per
occurrence into a bounded ring (300) that is **always recording, enabled or not**, dumped with
`window.__ssePerf.events(60, 'holo.setSystem')`. That is deliberate: the faults it serves are
intermittent, and the refresh you would use to go and switch an instrument on destroys the evidence.
Keep rows cheap. Anything expensive stays behind an explicit opt-in in the caller — the
`__rebuildDebug` payload hash is the worked example, and it prints its own `hashMs` so the
instrument's cost is visible rather than smuggled into the measurement it perturbs.

**A METER MUST NEVER ADD THE COST CLASS IT IS FOR.** `rx.<TYPE>.bytes` needs
`__ssePerf.rxBytes = true` and is deliberately NOT implied by `?perf=1`, because sizing an inbound
payload means stringifying it on the receive path — which is exactly what the rebuild-storm hunt is
chasing.

## 2. The rebuild storm (P2) — instrumented, NOT diagnosed

**Status: the capture machinery shipped at v2.1.746. The fault itself was never reproduced by this
session and is still open.** It needs the owner's two-window setup on
`catalogue?sid=local_neighbourhood-miranda-vega-446&preset=holo`; no bundled example reproduces it.

The owner's capture: `holo.setSystem.same` 146 of 148 in 20 s, 23% of wall clock rebuilding an
unchanged scene, GL counts flat (so **not a leak** — the fix is to stop the retriggering, not to fix
teardown), and a hard refresh clears it.

**READ `sameRef` FIRST, BEFORE REACHING FOR ANY FIX.** It decides which fix is even possible:

- `sameRef: true` — the incoming object is the same reference already held. Nothing upstream
  re-cloned, so the trigger is a RE-FIRE (a remount, or a Svelte statement invalidated by something
  other than `system`). **An upstream content gate cannot help this case**, and a gate is precisely
  what the arithmetic (148 rebuilds against 89 syncs) tempts you into building.
- `sameId` without `sameRef` — a re-clone upstream. A gate IS the candidate.
- `reason: style:*` — a dial rebuilding its own content. All seven style setters are equality-guarded,
  so a `style:*` row in a storm means one is being handed an alternating value. Different bug.

`__rebuildDebug = true` adds `hash`/`sameHash`, the only thing that can prove a re-cloned snapshot was
byte-identical. **Do not build a same-system patch path speculatively** — that instruction predates
this session and still stands.

## 3. Chrome yields to a foreground UI (A52) — and the shape it took TWICE

The rule and its traps are UI-C6. What belongs here is the process lesson, because the first version
shipped and was rejected.

**The first attempt de-listed the MODAL side (an action, not a list of names) and then wrote `{#if}`
gates into each piece of chrome — which is a list of chrome by another name.** Every new floating
control would have had to remember the condition. The owner's correction was the useful one: *"the
time/transit control crossover does not matter — it can move — it's just allowing a modal to take
over when it is more practical on mobile."* The control was never special; the RULE was the
deliverable.

The shape that survived: both sides declare themselves (`use:foreground`, `use:chrome`), one CSS rule
in `tokens.css` joins them, and it **hides rather than unmounts** so the bar comes back holding what
it held. Two things a successor should not undo:

- **`data-app-mode` replaces a second breakpoint on purpose.** It is `AppShell.mode` mirrored onto
  `<html>`, and `mode` already folds width, pointer type AND the `?mode=` override together. A CSS
  media query beside it would be a 26th breakpoint value that disagrees the moment someone forces
  phone on a wide screen — verified: forced phone at desktop width correctly yields.
- **"Just hide `.app-shell`" was measured and rejected.** The reported bar and every modal render
  OUTSIDE `<AppShell>` as siblings, so it would have missed the one thing that was reported.

**And the bug that only verification found:** the first time-control gate omitted the breakpoint, so
DESKTOP hid it too — the opposite of the rule, with a green build throughout. A green build says
nothing about a breakpoint-dependent rule; measure both sides.

## 4. The unit fold (A43) — the row's diagnosis was BACKWARDS

Worth knowing because it is the clearest case this session found of a confidently-written row being
wrong in the direction that matters.

The row said unit changes apply "no conversion". The opposite was true: `handleSaveSettings` had
rescaled `pixelsPerUnit` since v2.1.276 — before A43 was even reported. Every unit change ALREADY
converted, so **RELABEL was the unreachable case**, and the job was not to add conversion but to make
the other outcome possible and let the GM choose.

**The shared cause was a third path nobody had counted:** the Traveller hex grid STAMPS the unit and
takes `pixelsPerUnit` from hex geometry, which relative to the stored figures is a relabel. Settings
then CONVERTS. Neither is wrong alone; the pair is the fault, and it is exactly the reported sequence.
That is DATA-R19, along with the `campaignUnit()` fold that keeps `distanceUnit` and `scale.unit` from
disagreeing.

**Honest residue:** only the three sites that had hand-written the precedence were migrated to
`campaignUnit()`. Sixteen files read `.distanceUnit` and six read `scale.unit`; they are safe ONLY
because the load-time fold makes them agree. Do not delete that fold thinking it is redundant.

## 5. Editors that bind to pack data — the trap that reached the SAVED campaign

From A56, and it is UI-C8, but it belongs here too because the failure is invisible on screen.

`bind:bands` on a gas with no authored bands wrote the editor's `[]` default into the record, and
`[]` is not the same JSON as an ABSENT key — so the save diff judged 17 of 33 gases changed and wrote
overrides for every one. **A GM who merely OPENED the editor and pressed save would have pinned their
campaign to that day's pack for gases they never touched.** The build was green and the UI looked
right; it was found by reading the SAVED CAMPAIGN after a save, which is the only place it shows.

**Check a save by reading storage, not by looking at the screen.** And when extracting a shared
control out of the component that owns the data, remember both halves: re-assign rather than mutate
(a member mutation does not propagate through `bind:`), and give the parent a callback so it can nudge
its own container.

## 6. Two things still open, named honestly

- **A player view cannot produce a diagnostic bundle.** `buildDiagnosticBundle` is offered only from
  the GM route, so on a player view the counters and the event ring are reachable only through a
  console — which a phone has not got. A player hitting the P2 storm on a tablet still cannot report
  it. This is the next gap worth closing in this area.
- **The night-side light colour (A56b) reaches the drawn layer but its painted pixel is unverified.**
  The data path is tested; getting a real technological world rendering to check the actual glow was
  not achieved from a worker session.

## 7. Process, because it cost more than any single fault

**Version and changelog collisions cost five rebases on one small change.** Twice a resolution
silently dropped ANOTHER session's changelog entry, and once left an empty heading husk behind from my
own renumber. Both were caught only by comparing heading lists against `origin/beta` afterwards.

Three rules that would have prevented all of it:

1. **Resolve a changelog conflict by keeping BOTH sides and renumbering YOURS** — never by taking a
   side. Same lesson as E10, which is about this exact file family.
2. **Verify with a set difference, not by eye.** This must come back empty; anything it prints is
   another session's work you are about to delete:
   `comm -23 <(git show origin/beta:changelog.md | grep "^## v" | sort) <(grep "^## v" changelog.md | sort)`
3. **Never stage a `package.json` you have not parsed.** A conflict-marked one staged cleanly and only
   failed at `npm run build`; a `json.loads` before `git add` catches it in a second.

Note `beta`'s changelog currently carries three duplicated headings (v2.1.416, v2.1.749, v2.1.798)
from earlier collisions. Not this session's, not fixed, recorded so the next tidy-up knows they are
artefacts rather than real releases. **The standing proposal — bump the version at PUSH time, not
commit time — would remove this whole class.**
