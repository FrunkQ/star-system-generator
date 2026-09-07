# Star System Explorer — read this before touching anything

This file is deliberately short: it points at the law, it does not restate it. A second copy of a
rule is a copy that drifts, and duplication is this codebase's most recurring recorded fault.

## The four documents, in reading order

1. **`docs/dev/observations-inbox.md`** — the live board. Read the STANDING RULES at its foot
   BEFORE writing any code: they are the house coding rules (physics drives tags drives visuals;
   steer, never stop; scattered constants are data in the wrong place; nothing reads a value a
   later pass writes; and the rest). Every open item is a row; every row you work updates in the
   same push. The coordinator owns the numbering — check an id in BOTH forms (`| B75 |` and
   `[[B75]]`) before claiming one.
2. **`docs/dev/engine-map.md`** — the traps file: invariants and orderings that are invisible in
   the code, expensive to re-derive, and already paid for at least once. **Grep it for your
   territory before agreeing anything needs a change.** If you spend more than ten minutes working
   out a non-obvious rule, write it in as an entry IN THE SAME COMMIT as the code; if your change
   falsifies an entry, correct it in that commit — a wrong entry is worse than a missing one.
3. **`docs/process-templates/PLAYBOOK.md`** — the session lifecycle and the rules that came from
   real mistakes, including the measured entry fee (a session spends about a fifth of its context
   reading in — that is expected; do not skip the reading to save it).
4. **Your brief, if you were given one** — usually a STREAM section in
   `docs/dev/session-briefs-*.md`. It pre-pays the entry fee with verified file:line references;
   re-verify line numbers before editing, because the tree moves daily.

## The non-negotiables (the foot of the board has the full versions)

- **Work in your own git worktree off `origin/beta`.** The main checkout is SHARED — never reset,
  stash, or `git add -A` in it; stage explicit files always.
- **Commit as `FrunkQ <frunk@frunk.net>`** — never any other identity.
- **`npm run build` green before every push** (svelte-check alone is not enough), version bumped
  every push, a changelog line in prose a GM would understand.
- **Read `git show --stat` before every push** — a whole-file diff on a small edit is the CRLF
  tell, and byte-level editing is the safe form for `observations-inbox.md` and `changelog.md`.
- **Expect concurrent streams.** Fetch before every push; on rejection rebase, take their version,
  RENUMBER yours from theirs, keep both changelog entries, and the conflict-marker check must GATE
  the `git add`, not print beside it.
- **Every new gate is run against the code with the fix removed and seen to go RED** before it is
  trusted — three gates in this project's history passed with their bug fully present, and at
  least one assertion should be absolute, not a ratio (engine map PHY-34).
- **Visual claims are verified in the browser or handed back honestly** as a thirty-second eyeball
  list for the owner. Saying you skipped it is fine; claiming done-without-looking is not.
- **`beta` auto-pushes on a green build; production moves ONLY on the owner's explicit word**,
  through the coordinator, by the read-tree recipe.
- **Real user files live in `../user-test-files/`, outside the repo** — never commit, bundle, or
  publish one.
- Anything that changes what the product IS: recommend, then ask the owner.
