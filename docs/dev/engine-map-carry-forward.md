# Carrying the engine map into a new engine

Written 2026-08-27 by coordinator 6, at v3.0.146, against 209 entries in `engine-map.md`.

The owner's plan is to stop working on the old code and build a new evolution engine — first life,
exobiology, system events through n-body, galactic evolution. His words on this file: *"the
engine-map is our secret sauce and will never leave our side. We would have run aground a while ago
without that reference."* Agreed. But carrying it across **wholesale** would break the map's own
hardest rule, and that rule is worth restating before anything else:

> **A WRONG ENTRY IS WORSE THAN A MISSING ONE.**

A new engine will falsify some of these. An entry that survives into a codebase it is no longer true
of is not a neutral leftover — it is a trap that reads with the full authority of 208 entries that
*are* true. So the carry-forward is done **entry by entry**, and this file is the criterion for
doing it.

## The four buckets

Reading the map as a whole, the entries sort into four kinds, not the two I first assumed. The
distinction that matters is **what would have to change for this entry to become false.**

### 1. DOMAIN — a truth about worlds, light and orbits

False only if the universe changes. Carries forward untouched, into any language, any architecture.

- `PHY-19` an equilibrium temperature is a POWER balance and is never a mean
- `PHY-20` a surface property that varies by an order of magnitude is a process, not a constant
- `PHY-24` the human eye enters at the END or it poisons the derivation
- `PHY-25` a capture term that does not saturate is the naive maximiser, and Earth falsifies it
- `PHY-13` a belt's `massKg` is a debris-density proxy, never a point mass

**These are the ones that cost the most to learn and are cheapest to carry.** Several were paid for
with a user report and a day of hunting. Move them first, and move them verbatim.

### 2. ARCHITECTURE — a truth about how a derivation engine must behave

False only if you build something that is not a staged derivation over a shared model. Survives a
rewrite of *this* system; would not survive a genuinely different paradigm.

- `PHY-1` nothing may read a value a later pass writes
- `PHY-11` a quantity that never settles is non-idempotence, even when nothing physical moves
- `PHY-2` a quantity correct for its purpose can still be published as a lie
- `PHY-9` a placeholder zero is a CLAIM, not an absence
- `PHY-10` a precondition is not a defining trait, and writing one as the other inverts the scope
- `PHY-7` / `PHY-8` a module that declares itself the single evaluation has no rival; never write a
  second sum of a quantity that already has one
- `TAG-8` rule evaluation order is load-bearing

**Carry these as REQUIREMENTS ON THE NEW DESIGN, not as notes about the old one.** `PHY-1` in
particular is not documentation — it is a property the new engine either has or spends a year
discovering it needed. It has a test (`idempotence.test.ts`); that test is more portable than the
code it guards.

### 3. PLATFORM — a truth about WebGL, browsers, or floating point

False when you leave the platform. Survives as long as you are still drawing in a browser.

- `RENDER-B1` GL texture storage is IMMUTABLE — a resized canvas silently never lands
- The dash-pattern cost rule (a dashed line is charged for its whole path)
- Anything about `overflow-x: clip` computing back to `hidden`

Cheap to keep, and each one is a day someone already lost. Keep them, but **label the platform**, so
a future port to a native renderer knows which shelf to clear.

### 4. IMPLEMENTATION — true of THIS code, and probably not of the next

Dies with the code. But **do not simply delete these** — they are the most interesting bucket for a
redesign, read the right way round.

- `TAG-11` storage is one store behind old names
- `TAG-16` there are TWO tag pickers and they are not duplicates
- `TAG-18` the tag pill is ONE shape and two of its four implementations cannot share code
- `RENDER-B2` the player's "2D starmap" is the 3D renderer locked overhead
- `TAG-15` a player window has its OWN store instances

**Each of these is a fault the old shape made POSSIBLE.** Four implementations of one pill; two
pickers that are not duplicates; a store carrying old names. Read as a list, they describe the
pressures this architecture put on the people working in it — which is exactly the input a new
architecture should be designed against. So the carry-forward for this bucket is not the entry, it
is the question: **what shape would have made this impossible?**

## The test, when an entry is ambiguous

Ask: **what would have to change for this to become false?**

| the answer | bucket |
|---|---|
| physics, or the universe | DOMAIN |
| the way we stage derivations | ARCHITECTURE |
| the browser, GPU or numeric type | PLATFORM |
| a file, a component, a store | IMPLEMENTATION |

If two answers feel true, it is usually a DOMAIN truth wearing an implementation's clothes — and the
right move is to **split it**: carry the durable half forward and leave the file-specific half
behind. `PHY-5` (the 3D propagator returns satellites already in the parent's equator; nothing may
rotate them again) is exactly this shape — the frame convention is domain, the "nothing may rotate
them again" is a warning about one call site.

## Two things NOT to do

**Do not renumber.** The ids are referenced from code comments, board rows and commit messages going
back a year. An entry that moves bucket keeps its id; the bucket is a field, not a filing system.
The board has already lost days to three id collisions this month — do not manufacture more.

**Do not carry an entry you cannot restate.** If nobody can say what an entry means without reading
the code it describes, it has already failed the map's own standard ("if an entry can be replaced by
reading one function, delete it") and the rewrite is the moment to drop it.

## Suggested order of work

1. **DOMAIN first**, verbatim. Cheapest, highest value, and it seeds the new engine's own map on day
   one so the file is never empty and never optional.
2. **ARCHITECTURE next, as design requirements** — with `idempotence.test.ts` ported before the code
   it guards, so the property is enforced from the first commit rather than retrofitted.
3. **PLATFORM**, labelled by platform.
4. **IMPLEMENTATION last, and as a DESIGN REVIEW rather than a migration** — one pass asking of each
   entry "what shape would have made this impossible?", and the answers become notes on the new
   architecture. Nothing from this bucket ships into the new map as a rule.

The whole pass is a good first task for the new work: it forces a read of all 209 entries while the
new architecture is still soft, and it costs its reading-in fee usefully, because reading the map
**is** the reading-in.
