# SSE task: a save should describe what the GM made, not what the app ships

BOARD: [[B112]]. Written by the Creator Hub session, 2026-08-28, while deriving facets from real
save files; banked here verbatim by the coordinator so it is not transcript-only. The owner hands
this to an agent himself — it is a complete brief and needs no re-derivation.

---

**For an agent working in the Star System Explorer repo.** Found by the Creator Hub, 2026-08-28,
while deriving facets from real save files. The hub does not edit this repo.

## The finding

**Every exported save carries the app's own shipped defaults as if the GM had authored them.**

`temporal.temporal_registry` in all three real starmaps contains exactly the four calendars from
`static/temporal/calendars.json` — Earth Gregorian, Star Trek Stardate, Mayan Haab (Simplified),
Chinese Lunisolar (Simplified). The GM added none of them. Same story for `coiCategories`, which
carries the nine shipped tag categories, and `reasonsConfig`.

## Why this matters — and it is NOT about file size

The hub built a facet to show *"Custom calendars: 3"*, because a GM who invents a reckoning for
their setting has made something worth finding. **It fired on every map ever made**, reporting three
custom calendars for maps that had none, until a hardcoded baseline of shipped names was added to
subtract them.

That baseline is now a list the hub must keep in step with this repo forever. Every calendar SSE
adds is a false positive on the hub until someone remembers to update it.

> **The real problem: the file misdescribes itself.** Nothing reading a save can distinguish *"this
> campaign uses a custom reckoning"* from *"this campaign was saved by Star System Explorer"*. That
> is a correctness bug in the format, and the hub's wrong facet is just the first consumer to trip
> over it.

## Do NOT chase file size — measured, so nobody argues it

On the real 327 KB `Local_Neighbourhood-Starmap.json`:

| | share of file |
|---|---|
| `systems` — the actual campaign | 51% |
| **whitespace / pretty-printing** | **45%** |
| `coiCategories` (shipped defaults) | 2.6% |
| `temporal` (shipped calendars) | 1.0% |

**The shipped-defaults block is under 4%.** Removing it saves almost nothing.

**And do not touch the 45%.** That is pretty-printing, a `.sse.zip` compresses it away to nearly
nothing, and it buys the hand-editable, diffable working file `io/bundle.ts` deliberately set out to
produce (*"GMs hand-edit them, diff them, and swap art in them"*). That trade was made on purpose and
made correctly. Compacting the JSON would trade a documented product value for a few hundred KB of
something zip already handles.

**Fix this for correctness. Do not sell it as a size win, because it is not one.**

---

## What to change

### 1. Do not serialise shipped registries into a save

`temporal.temporal_registry`, `coiCategories` and `reasonsConfig` should carry **what the GM added or
altered**, not the app's library. Two workable shapes:

- **Write only the delta** — entries absent from, or differing from, the shipped set. Simplest for
  consumers: everything present is by definition the GM's.
- **Or keep writing everything but mark it** — `custom: true` on GM-authored entries, or `source:
  'app' | 'user'`. Slightly bigger, but unambiguous and it survives the shipped set changing.

**Either is fine; the second is more robust.** What matters is that a reader can tell them apart
without holding a copy of this repo's static files.

### 2. Do the same for the containers that do not exist yet

The hub is ready to count custom **gases, liquids, fuels, engines, reactions** and **atmosphere
mixes** the moment saves carry them (`docs/sse-requirements.md` R-11 in the hub repo). When those
land, apply the same rule from day one: **the save carries the GM's, not the app's.** Getting it
right at the start costs nothing; retrofitting it means every consumer needs a baseline list.

### 3. Minor: stop writing empty containers

Measured across 192 nodes in one starmap:

- `classes: []` on 101 nodes
- `tags: []` on 94
- `hydrosphere: {}` on 80
- `parentId: null` on 42
- `areas: []` on 35

Byte cost is trivial. The reason to fix it is the same as above: `hydrosphere: {}` says *"this world
has a hydrosphere object which is empty"*, which is not the same statement as *"this world has no
hydrosphere"*. Omit the key when there is nothing to say.

**Low priority.** Do not let it delay 1 and 2, and do not break the loader — absent must already be
handled everywhere, so this should be a serialisation change only.

---

## How to know it worked

1. Open a fresh campaign, add nothing, export. **`temporal_registry` should be empty or absent**, and
   `coiCategories` should carry nothing the app ships.
2. Add one custom calendar, export. **It should be the only one in the file.**
3. Re-open both saves. They must load identically to before — the app fills in its own library at
   load time, which is where that data belongs.

Step 3 is the one that matters: **this is a serialisation change, not a data-model change.** Nothing
about what SSE can do should alter.

---

## Tell the hub when this lands

The hub currently hardcodes the shipped calendar names and the nine shipped tag categories as
baselines to subtract. Once saves stop carrying app defaults, those baselines can be emptied and the
facet becomes simply *"how many are in the file"* — which is what it should have been.

Until then the hub is correct but fragile, and every calendar added to this repo silently breaks it.

---

## Coordinator additions (read before starting — the brief above is the hub's, these are the house rules it could not know)

- **Work in your own worktree off `origin/beta`; the main checkout is shared.** Commit as
  **FrunkQ <frunk@frunk.net>**. Fetch before every push; other streams are pushing.
- **Read the standing rules at the foot of `docs/dev/observations-inbox.md`**, and in
  `docs/dev/engine-map.md`: `DATA-R20`'s shape (stored values never leave SI — the same
  authored-vs-derived discipline, different axis), and the save/load entries around
  `stripStarmapForExport` and `provenance.ts`.
- **The old-file path is sacred:** a save written BEFORE this change (carrying the full shipped
  registries) must load identically forever. Pin one in a fixture before you start.
- **Mind `bundleFormat`** (`io/bundle.ts`, stamped `1` since v3.0.179): if the delta shape changes
  what a reader must do to interpret the file, bump it and regenerate
  `tests/fixtures/creator-hub-bundle.sse.zip` in the same commit — the hub's parser tests against
  that fixture by byte.
- **Every new gate run with the fix removed and seen red** before it is trusted.
