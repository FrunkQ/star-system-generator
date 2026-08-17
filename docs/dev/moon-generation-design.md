# Moon generation — design note (G18)

Written 2026-08-17 alongside B58. **This is the design note the owner asked for BEFORE any moon code.
Nothing here is implemented.** Every claim about the current tree was checked at v2.1.742-beta.

The physics in section 2 is the owner's own research from the [[G18]] inbox row, used rather than
re-derived.

## 1. The finding that changes the shape of the job

The [[G18]] row asks for "one moon creation/distribution system SHARED ACROSS ALL GENERATORS".
**That system already exists, and the manual picker already uses it. Generated moons are the only
thing that does not.**

`viableTypesAt(teqK, role, fingerprints, hostMassKg)` in `generation/generateBodyOfType.ts:97`
already answers "what type may a moon be here", and already encodes three of the rules the row asks
for:

- a moon can never be a giant or an eyeball (`:111`);
- a moon must fit under its host — any type whose characteristic mass exceeds
  `hostMe * MOON_MASS_CAP` (0.1) is dropped (`:112-115`);
- around a host below 15 M⊕ only simple airless/icy/rocky moons are offered; oceans, atmospheres and
  biospheres need a giant host (`:116-118`).

`AddBodyTypeModal.svelte:22` — the "Add moon here..." picker — calls exactly that. The wizard calls it
too, but **only for planets** (`generateFromConfig.ts:352`, `role: 'planet'`).

Generated MOONS instead take a separate, hardcoded ladder in `planet.ts:141-164`: a terrestrial
parent gets `planet/terrestrial` and nothing else; a giant parent gets a 60/40 ice-giant/terrestrial
draw beyond the frost line; `planet/gas-giant` is permitted if the parent exceeds 1,000 M⊕. Searched:
`role: 'moon'` and `viableTypesAt` across `src/lib/generation/**` — no generator reaches the moon
branch of the shared function.

**So this is a duplication finding, not a greenfield build** — the codebase's most recurring fault,
per the standing rule, and the two copies have already drifted: the picker can offer an icy moon
around a 12 M⊕ host, the generator cannot; the generator can make a moon a `planet/ice-giant`, the
picker forbids it outright. The bulk of G18 is **routing moon creation through the vocabulary that
already exists** and deleting the ladder, not writing a second system.

## 2. The three physics rules, and where each one stands

**(1) Mass budget — ~1/10,000 of the host aggregates into satellites. ALREADY IMPLEMENTED, and it is
the part that works.** `planet.ts:396` gives giants `0.0001 to 0.00025` of host mass and terrestrials
`0.00001 to 0.00005`, with a 2% double-planet branch at `:389`. This is [[B59]]'s mass half, and it
already delivers the owner's point that a super-Jupiter can legitimately yield a Mars-mass moon.
**Two defects remain: those budget factors are CONSTANTS IN CODE where the standing rule says they
are pack data, and the flat `Math.min(numMoons, 30)` at `:380` is still bolted on top of the physical
budget.** Once counts are derived rather than tabled, the cap should go.

**(2) The ~1.6 R⊕ barrier — NOT PRESENT.** Nothing in the tree gates a fractionally large moon on
host radius. This is a new rule and it is cheap: a Luna-class satellite (a large mass fraction, from
a giant impact) should be available only to rocky hosts below roughly 1.3-1.6 R⊕, because above that
the impact disc is vapour-rich and gas drag spirals the moonlets back in. Above the barrier a rocky
world still gets small captured moons — it just cannot get a Luna. The existing 2% double-planet
branch is the natural place to gate.

**(3) Distance and abundance — NOT PRESENT.** Moon abundance should fall with proximity to the star:
cold wide giants keep full retinues, hot Jupiters are stripped by stellar tides. The engine can
already answer this — it derives orbital distance and, at `planet.ts:40 laplaceRadiusAU`, the Hill
and Laplace geometry that says where a moon can be held at all ([[C5]]). The count model should read
that rather than a table keyed only on giant-vs-terrestrial.

## 3. What replaces the count table

Today: `pack.distributions[isGiant ? 'gas_giant_moon_count' : 'terrestrial_moon_count']` drawn by
`weightedChoice` (`planet.ts:371-372`), a `log10(massInEarths)` multiplier for giants (`:374-377`),
then the flat cap of 30 (`:380`). The shipped tables are
`gas_giant_moon_count` = 0..20 and `terrestrial_moon_count` = 0,1,2 at 60/25/15 — so a terrestrial can
never have three moons and Jupiter's real count of 95 is unreachable by construction.

Proposed, and it is the same move B58 just made for planet spacing — **derive from what the engine
already computes, and keep the parameters in the pack**:

1. **Budget first, count second.** Take the satellite mass budget (rule 1) as the primary quantity.
2. **Divide it by a drawn satellite mass spectrum** to get a count, rather than drawing a count and
   then fitting masses into it. A steep power-law spectrum gives the observed shape for free: a few
   large regular moons and a long tail of small ones.
3. **Scale the retinue by the room available** — the Hill/Laplace radius at the planet's actual
   orbit (rule 3), so a hot Jupiter's budget has nowhere to go and its count collapses honestly.
4. **Gate the large-fraction outlier on the 1.6 R⊕ barrier** (rule 2).
5. **Type each satellite through `viableTypesAt(teq, 'moon', ...)`** (section 1), so the generator and
   the picker cannot disagree.

That removes the arbitrary 30 cap, the `log10` fudge and both count tables, and replaces them with
one pack block of the same shape as B58's `orbital_spacing`.

## 4. Scope note

`generateBodyOfType.ts`, `generateFromConfig.ts` and `planet.ts` (which recurses into itself for
moons, `:252`) are the three body-creation routes named in `generation-duplication-map.md`. The moon
system must be entered from one place by all three, or this note will be re-written in six months.

`docs/dev/v4-scope.md` says V4 replaces generation wholesale with an accretion engine. **Build this
cheaply.** Sections 1 and 3 are worth doing because they DELETE code; section 2's two missing rules
are a few lines each.

## 5. Questions for the owner — none of these should be guessed

The row's own instruction is to confirm the slider mapping rather than assume it, so this note stops
here.

1. **Rarity → moon TYPES.** Your steer was that the Rarity dial biases moon types upward, "with the
   potential for an Earth-like moon around a gas giant" at the top. `viableTypesAt` currently
   forbids a `SUBSTANTIAL_MOON` (ocean, forest, earth-like, ...) around any host below 15 M⊕ but
   ALLOWS it around a giant, so an Earth-like moon of a gas giant is already legal at any rarity.
   **Should high Rarity make it merely more likely, or should low Rarity make it impossible?**
2. **Disk mass → count, dynamical history → eccentricity/inclination spread.** Plausible, and it
   matches what those two knobs already do for planets. **Confirm, or say which you would rather they
   drove.**
3. **Metallicity → moons?** It currently drives nothing that survives (see the [[G24]] measurements:
   it reaches roughly one body in seventy-four). If it is to mean anything for moons — icy versus
   rocky satellite mixes — say so, because that is a natural fit and it would give the dial a job.
4. **How many moons is too many, for the TABLE rather than for physics?** The 30 cap was added for
   "performance/visual issues". Jupiter has 95. If the cap goes, a realistic Jovian system may put 60
   rows in the body list. **Is that a display problem to solve, or a number to keep capped?**
5. **Should a terrestrial world be able to have three or more moons?** The shipped table forbids it
   outright. Physics does not, and a rebalance is the moment to decide.

Related: [[B40]], [[B59]], [[C5]] (Laplace plane), [[C8]], [[D8]],
`docs/dev/generation-duplication-map.md`.
