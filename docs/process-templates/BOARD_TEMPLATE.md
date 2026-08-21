# Observations inbox — <PROJECT NAME>

Raw observations land here as they are noticed, get triaged, and are handed to a worker session as
a grounded prompt. This file is the source of truth between sessions — an item that is only in a
chat transcript is an item that will be lost.

**How to use it.** Add anything to CAPTURED, however rough, without stopping to diagnose. Triage
moves an item into a bucket with a verdict. When a bucket is worth a session, a prompt is written
from it and the items are marked with the version that fixed them.

**Status vocabulary** (START the status cell with one of these; free prose may follow):
`captured` · `triaged` · `assigned` · `fixed vX.Y.Z` · `wont-fix (reason)`.

**Numbering.** THE COORDINATOR OWNS THE NUMBERING. Ids are `<letter><number>` per bucket. Before
claiming an id, check BOTH forms: `grep -c '| B7 |'` AND `grep -c '\[\[B7\]\]'`. A worker's claim
is provisional until triage confirms; on a collision the coordinator's numbering wins and the
worker's row moves, carrying a RENUMBERED note. First claim wins between coordinator claims.

**Row format** (one line per row — long is fine, newlines are not):
`| B7 | **HEADLINE.** The owner's words. What was located (file:line). The lead or the fix shape. Related: [[B2]], [[TRAP-4]]. | status |`

---

## Buckets (rename per project; keep features separate from bugs)

## A — UI (self-contained, no domain logic)
| # | Observation | Status |
|---|---|---|

## B — Core / domain engine (needs someone holding that context)
| # | Observation | Status |
|---|---|---|

## C — Rendering / presentation
| # | Observation | Status |
|---|---|---|

## D — Content / data
| # | Observation | Status |
|---|---|---|

## E — Process / not-ours / environment
| # | Observation | Status |
|---|---|---|

## G — Features (deliberately not bugs — never hand these to a bug batch)
| # | Observation | Status |
|---|---|---|

## Captured, not yet triaged
_(new observations go here — rough is fine)_
| # | Observation | Status |
|---|---|---|

---

## SESSION STATE at handover — <date> (outgoing coordinator) — READ THIS FIRST
Everything else in this file is durable. This section is not: it is who exists, what is live, and
what to pick up. It is the only thing a successor cannot reconstruct from the repo. Include: the
session roster (names as the owner's sidebar shows them, owner-reported context figures — agents
cannot self-measure), what each holds, what to pick up first in order, and the mistakes this role
made that it will make again.

## DELIVERY BUCKETS — every unhomed item, for the owner to assign
| item | what | recommended release |
|---|---|---|
(The recommendation column is the coordinator's and is meant to be overruled; the point is that
nothing sits unbucketed.)

## Documentation debt
When you ship something a reader needs to know, append ONE LINE here naming what changed and which
surface needs it — seconds of work, and the guard against the docs drifting for a hundred versions.
If your change genuinely needs no documentation, write that line too ("B24: no reader-facing
change") — silence is indistinguishable from forgetting. A periodic sweep turns lines into prose.

- (example) B58: the generator's spacing law changed — the getting-started doc and the physics
  page both describe the old one.

---

## Standing rules any worker session must follow

- **FLEXIBLE SYSTEMS OVER POINT SOLUTIONS — the mantra, outranking everything below.** A branch
  for one particular case is a point solution: express the difference as DATA in a definition, or
  extend the SCHEMA so it can be expressed. But reference cases are CALIBRATION ANCHORS, not
  targets: if the general law gets a known case wildly wrong, the law is wrong and the anchor did
  its job; what is forbidden is tuning constants until the known case is perfect at the cost of
  the general law. Check against every anchor; fit to none.
- **Never assume the familiar baseline in a DERIVATION** (the home case, the default config, the
  developer's own device); a familiar frame is welcome in PRESENTATION — say which frame.
  Corollary: ABSENT IS NOT TYPICAL — an unknown value is unknown, not the common case.
- **Work in your own git worktree.** The main checkout is shared. Stage explicit files, never
  `git add -A`. New commits only — never amend with concurrent sessions.
- **Green build before any push** (the full build, not just the type-checker). Bump the version
  every push. Prepend the changelog entry after the preamble line, never anchored on a heading.
- **On push rejection:** pull --rebase, take THEIR version, bump from it, keep BOTH changelog
  entries, check every conflicted file for markers BEFORE `git add`, parse-check machine files.
- **Spent more than ten minutes working out a non-obvious rule? Write it into the traps file, in
  the same commit as the code.** A wrong entry is worse than a missing one: if your change
  falsifies an entry, correct it in the same commit. Two entries claiming single authority over
  one concept = a duplication found; report it.
- **When you find a second copy of anything, report it up** — and unify at the source if cheap
  and in scope. Prefer removing a copy over syncing it; syncing preserves the fault.
- **A change is not finished until the user-facing explanations follow it** — update the doc
  surfaces in the same batch, or bank the one-line debt note above.
- **Verify in the running app; a unit-tested visual is not finished.** If the preview genuinely
  cannot render, do the strongest headless check (compare the NUMBERS) and hand back an explicit
  thirty-second list of what still needs a human eye. Honest omission beats a false claim.
- **Never stop, shorten or skip work because you think you are running out of context — your
  estimate has been wrong every time it was checked.** Work to completion; the harness will stop
  you if it must; the owner's figure is the only authoritative one.
- **A grep that returns nothing is not an absence — say what you searched.**
- Generated files churn under the test runner: discard, never commit (unless the diff IS the
  point), never hand-edit.
- <PROJECT-SPECIFIC: commit identity, language conventions, protected files, domain honesty
  rules — add them here.>

---

## The traps file — `docs/dev/traps.md` (create beside this board)

An index of TRAPS for agents changing the system: invariants and orderings that are invisible in
the code, expensive to re-derive, and already got wrong at least once. One entry per rule, fixed
format:

```
### <AREA>-<N> <one-line claim>
WHERE: file:line(s)
RULE: the invariant, stated so a violation is recognisable
WHY: what it cost when it was got wrong (the incident, with numbers)
BLAST: what breaks if violated, and the known metering/debug gap
```

NOT a tutorial, NOT an API reference, never a restatement of what the code says — if an entry can
be replaced by reading one function, delete it. A padded file stops being grepped.
