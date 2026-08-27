# The multi-session playbook

How SSE ran V2 -> V3.0.0-rc in five days with a dozen parallel agent sessions and no lost work.
This pack is project-agnostic: copy `docs/process-templates/` into a new repo, rename the
placeholders, and start the coordinator with the prompt in PROMPTS.md. Distilled 2026-08-21 from
the working system, including the mistakes that became rules.

## The shape

**One COORDINATOR, many WORKERS, one BOARD.**

- The **coordinator** does intake, triage and routing — not implementation. It fixes trivial
  one-liners itself, hands everything else out as grounded briefs, owns the item numbering, and
  guards its own context for breadth. Its value is that nothing is lost and nothing is solved twice.
- **Workers** are single-territory sessions (one owns physics, one owns the render surfaces, one
  owns networking...). A worker holds deep context on its territory and must not wander out of it.
- The **board** (BOARD_TEMPLATE.md) is one markdown file in the repo, committed and pushed like
  code. An item that exists only in a chat transcript is an item that will be lost. The board is
  the ONLY shared memory between sessions.

## The lifecycle of a piece of work

1. **CAPTURE** — the owner reports something mid-play, rough and unpunctuated. The coordinator
   writes it onto the board verbatim-ish, numbered, without stopping to diagnose. Capture first,
   diagnose second. A vague report ("works on the laptop, not the phone") is a lead, not noise.
2. **TRIAGE** — the coordinator investigates JUST far enough to route confidently: locate the
   code by file and line, name the probable cause as a LEAD (never a diagnosis unless proven),
   and stamp a destination (this release / next / parked). Then stop digging.
3. **BRIEF** — before handing anything out, RE-VERIFY every claim in the tree. Entries drift:
   a row written twelve days ago had moved three files and 131 lines. A brief contains: the
   owner's words, what is true in the tree TODAY (file:line), the fix shape, acceptance criteria
   a human can check in thirty seconds, and the rules that will bite. Big jobs get a standalone
   handoff doc; small ones ride the board row.
4. **BUILD** — the worker works in its OWN git worktree, pushes on every green build, updates
   its own rows, and records any non-obvious rule it had to discover in the traps file (same
   commit as the code).
5. **CLOSE** — the row gets the version that fixed it plus what is still UNSEEN by a human eye,
   as a thirty-second check ("open Saturn: the inner six moons sit in the ring plane").
6. **RETIRE** — a session near its context limit spends its LAST tokens writing a notes doc of
   its territory's traps (not a tutorial, not a backlog — the things that cost it time and are
   invisible in the code), then stops. That is what lets a fresh session pick up in an hour what
   took the old one a week to learn.

## The entry fee (measured, 2026-08-27)

**A session spends roughly a FIFTH of its context just reading in.** Owner, on a mature codebase:
*"it takes 20% just to get up to speed — we have a big load of code!"* That is not waste and it cannot
be skipped, but it is a fixed cost paid per SESSION, not per item, and three things follow from it.

1. **DO NOT SPEND A SESSION ON ONE SMALL ITEM.** Two related small items cost barely more than one
   once the fee is paid. Batch by TERRITORY (the files they touch), not by priority — two bugs in the
   same module share their reading; two bugs of equal urgency in different modules do not.
2. **A DENSE BRIEF IS THE FEE, PRE-PAID BY THE COORDINATOR.** "Investigate the SOI derivation" makes
   the session go and find it. "`orbits.ts:426` builds the SOI from the INSTANTANEOUS
   `distanceToHost_km`" does not. Every measured fact, file:line and disproved hypothesis in a brief is
   context the session does not have to spend — which is why briefs here run long on purpose and why
   RECORDING DEAD ENDS matters as much as recording findings.
3. **THE RETIREMENT NOTES ARE THE SAME LEVER, aimed at the next session instead.** A territory's
   notes file exists so its successor inherits the traps rather than re-deriving them; that is why the
   drill asks for what COST TIME rather than for a summary of what the code does.

Corollary for the owner: a session already at 25% has about half its useful budget left after reading
in, so give it something SHAPED to that — a bounded item, or a design phase that ends in a note
rather than a build.

## The release discipline

**The what's-new / feature list IS the scope statement.** Every unpending line is a claim the
build makes on first launch; a `pending` flag is the only honest way to advertise unfinished
work. Release-readiness is therefore checkable, not a feeling: sweep the list, prove each claim
against the tree, and the one false claim is the release blocker. The flag comes off a line only
when the OWNER has seen the feature work.

## Interfaces, not growth (the parallel-project rule)

New capability that can stand alone goes in its OWN repo behind an interface, and the core
consumes it by CONTRACT — the way the accretion engine left SSE for system-lab, and the way the
VTT integration talks to Mappadux over a versioned message contract. Consequences:

- The board tracks the CONTRACT (message types, schemas, the version floor), never the
  neighbour's internals. A contract change is an item; a neighbour refactor is not.
- Deleting core code that moved out is a real work item with the traps-file entry REVERSED in
  the same commit (a stale "preserve this" note is the most expensive kind of wrong comment).
- Cross-repo work gets its own design doc naming both sides' obligations, and a spec on the
  contract (the flaky-test rule applies doubly here: a contract spec that fails at random
  teaches every session to push through red).

## The rules that came from real mistakes (universal)

1. **A grep that returns nothing is not an absence.** Say what you searched. This bit three
   coordinators.
2. **Read the artefact, not the summary.** A phrase in a row ("GM-local store") was read as a
   feature that did not exist; a migration was nearly scoped for phantom data.
3. **Re-verify before prompting, every time.** Entries drift under a moving tree.
4. **Never bundle an independent item onto a job that might evaporate.** It dies with the job.
5. **First claim wins on numbering, and check BOTH reference forms** (the table row `| B75 |`
   AND the link `[[B75]]`) before claiming an id. Eight collisions happened in one day when
   sessions checked only one form.
6. **Two sessions will solve one problem independently if entries are not cross-linked.** The
   board exists to prevent exactly this; link related rows aggressively.
7. **Never act on your own context estimate — it has been wrong every time it was checked.**
   Sessions reporting "2% left" were measured at one-third used. Work to completion; the OWNER'S
   figure is authoritative; when the owner calls it, do the retirement drill.
8. **A quantity correct for its purpose can still be published as a lie.** Name what a figure
   measures, where, and in what units — and check its neighbours agree.
9. **Duplicated functionality is the recurring fault.** The test is not "is this code
   duplicated" but "could these two answer the same question differently". Report every second
   copy; prefer deleting one over syncing them.
10. **Silence is indistinguishable from forgetting.** If a change needs no docs, write "no
    reader-facing change" on the board. If a sweep drops coverage, log what was dropped.

## Git across parallel sessions (universal, all paid for in blood)

- The main checkout is a SHARED tree. Every session works in its own `git worktree`; the
  coordinator too (detached from origin, `git push origin HEAD:<branch>`).
- Stage explicit files, never `git add -A`. Never stash, `checkout -- <file>`, or hard-reset a
  shared file you did not change — back it up first if you must touch one.
- Never amend or rebase-rewrite with concurrent sessions; a new commit always.
- Version and changelog collisions are CONSTANT (a dozen a day at peak). On push rejection:
  pull --rebase, take THEIR version number, bump from it, keep BOTH changelog entries.
- After resolving ANY conflict: check EVERY conflicted file for markers before `git add`, and
  parse-check machine files (`python -c "import json;json.load(open('package.json'))"`). Marker
  soup was pushed to origin twice by scripts that "resolved" the wrong line ending.
- Changelog entries are PREPENDED after a fixed preamble line, never anchored on a version
  heading (headings move; `str.replace` fails silently). Bump the version on every push.
- Generated files (fixtures, build stamps) churn under the test runner: commit them ONLY when
  the change is the point (a physics diff), discard otherwise, never hand-edit.
