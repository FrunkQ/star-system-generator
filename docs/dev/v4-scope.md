# V4 scope — early, and deliberately parked

**READ THIS FIRST: NOTHING IN THIS FILE IS ACTIONABLE. IGNORE ALL OF IT UNTIL V4 OPENS.**

The owner's instruction, verbatim: "what is important to know is that we can IGNORE these features
until then." This file exists so early thinking is not lost and does not leak into the observations
inbox, which is a triage board for a SHIPPING product. An idea in here is not a backlog item, has no
status, and must never be picked up by a worker session. If something in here turns out to be needed
sooner, it gets raised as an inbox observation in the normal way — it does not get promoted from here.

Captured 2026-08-07 from the owner. His words are preserved where the framing matters.

---

## The spine: it is ONE theme, not a feature list

Everything below hangs off a single decision — **resurrecting the owner's old experimental generation
system**, because that is what "ties many things together". Read the rest as consequences of that,
not as independent wants. The order matters: nothing else in this file is startable before it.

**A new planetary generation system, built on Accrete (possibly REBOUND or similar), whose defining
property is that generation has a TIMELINE.** That timeline is the thing everything else needs.

Two immediate consequences the owner named himself:

- **It is the basis for the stellar timeline slider** — inbox **G17**, already shelved to V4 for
  exactly this reason. G17 is therefore NOT a standalone V4 item; it falls out of the generation
  rebuild. Do not plan it separately.
- **Building it new is the moment to add the interfaces that let it be reused** by the star system
  generator, rather than becoming a third generation route. See the warning below.

## THE ARCHITECTURAL RULE FOR ALL OF IT: BUILD ONE SYSTEM, PARAMETERISED — NOT THREE

Owner, 2026-08-07, and this governs everything below it: *"Bear in mind system reuse… try and create
systems that can be reused — eg: galaxy type selection would be like star type selection now… and star
systems and star clusters… otherwise the same system with a different scale (kpc instead of ly)."*

Two distinct reuses, and they are worth separating because they are reused along different axes:

- **TOPOLOGY, reused across SCALE.** A star system, a star cluster and a galaxy are the same shape —
  things bound about a centre, drawn on a map, navigable, with a hierarchy. What differs is the unit:
  AU, then ly, then kpc. **The right outcome is one system with a scale parameter, not three
  implementations that happen to look alike.**
- **TYPE SELECTION, reused across DOMAIN.** Choosing a galaxy type (Hubble-ish: spiral, barred,
  elliptical, irregular) is structurally the same act as choosing a spectral class today — pick from a
  vocabulary, and let derived consequences follow from the pick. That is already a solved pattern
  here; it should be instantiated, not reinvented.

**THIS IS THE SINGLE MOST IMPORTANT LINE IN THIS FILE, because it is the owner pre-empting this
codebase's most recurring fault AT THE DESIGN STAGE, which is the only cheap moment to do it.** The
standing rule — *"duplicated functionality is this codebase's most recurring fault; the test is not
'is this duplicated code' but 'could these two answer the same question differently'"* — has been paid
for seven or more times already, and `generation-duplication-map.md` records two generators, three
body-creation routes and five magnetic-field inventions. A galaxy tier built as its own thing would be
the largest instance of that fault yet.

**AND THE PRECEDENT ALREADY EXISTS — TWO SCALES ARE ALREADY RUNNING, so this is a generalisation
rather than a leap.** The app today renders the same concepts at AU scale (the system view) and ly
scale (the starmap). Things that already proved scale-agnostic and should be the foundation rather
than being rewritten:
- **The floating origin** — precision at wildly different magnitudes is already solved once; a kpc
  tier is exactly the case it exists for.
- **The size law** (`scaleLaw.ts`, engine-map RENDER-S11) — already "one tested module the scene binds,
  never restates".
- **`niceInterval.ts`** (G10) — the metric decade grid with crossfade already lands any scale on round
  numbers, and the 3D starmap's scale rings were wrong by 43x until it existed.
- **`scale.pixelsPerUnit`** — the map already carries an explicit units-to-pixels factor.

Whoever opens V4 should start by asking what a third tier would have to ADD to these, not what it
would have to duplicate.

## What the timeline unlocks (owner's list)

- Nebulae
- Planetary discs — "free with Accrete"
- Accretion discs
- Stellar mergers
- "others?" — left open on purpose

**And the scale-up:** *"Star Clusters + starmap + pretty picture = the galaxy."*

## Traveller, properly this time

Bring the Traveller importer up to **the full World Builder's Handbook treatment**, done alongside the
new planetary generation rather than as a separate patch job.

Reference implementation the owner named: `https://github.com/rtrm/TravellerSystemGenerator`
(recorded only — not reviewed, not licence-checked. Both are jobs for whoever opens this.)

## Civilisation and technology

A V4 feature, because it fits the planetary timelines that will exist by then. Not scoped further.

## Biosphere — a real refresh, and the freest part of the project

The engine "has barely changed since V1" and is due a big refresh, because the new generation gives it
"a lot more parameters to guess off".

**The design move, and it is a pattern this codebase has already proven three times:** the current
biosphere calculation exists to highlight **human-habitable** planets. That becomes just the
**DEFAULT**, with the ability to add and customise alongside it — *"like we have done with
gas/liquids, etc."* That is the rule-pack DATA pattern (see the composition redesign, the liquids
overhaul and the cloud decks), so this is an existing architecture applied to a new domain rather than
anything novel. It also lands squarely on the standing rule that a GM-editable look or behaviour lever
belongs in pack data, not in code.

**A planetary EVENT system** feeds this — the owner suggests a local REBOUND-ish mechanism, explicitly
open to something better being researched instead.

**The framing worth keeping, because it is the actual design idea:** *life as a geological event.*
Fungus gave us soil — effectively resurfacing a planet, in the same way tectonics does. That makes
biology a terrain process on the timeline rather than a score attached to a finished world.

And the owner's own note on how tightly to hold this: *"At least no-one can tell me my biosphere stuff
is wrong as no-one knows the truth… we can have 'fun' with life stuff as there is 'no truth' to stick
to."* Worth remembering when this opens — this is the part of the engine with the most licence,
whereas the physics is anchored to measurable bodies and is not.

---

## RECOVERED PRIOR ART — the owner's earlier "Generation Engine V2" thinking, found 2026-08-07

The owner asked whether early design notes survived. **They do, in two places, and they were written
BEFORE SSE2 shipped — so they are prior art, not a plan.** Both are recorded here because the second
one is a hard technical constraint on the V4 spine.

### (a) The integrator warning — `design-docs/docs/Design Review.html`

Sibling directory `C:\Development\star-system-explorer-v2\design-docs\` (NOT in this repo, so it is
not backed up by our git history — worth knowing). In its physics-audit section:

> Use n-body only for Stellar Dance & v2 protoplanetary accretion. Both are already there. **Don't
> expand the use of full n-body into long-term planetary evolution unless you switch to a symplectic
> integrator (Wisdom-Holman or REBOUND-style mercurius) — RK4 over Gyr will eat your energy.**

**THIS IS THE MOST IMPORTANT RECOVERED LINE, because it is a direct constraint on exactly what V4
proposes.** A scrubbable Gyr-scale timeline IS long-term planetary evolution, so the naive path —
run the existing RK4 machinery for longer — is ruled out in advance with the reason given: RK4 does not
conserve energy over those spans, so orbits drift for numerical reasons and the timeline becomes
untrustworthy. **The owner's own "maybe REBOUND+" instinct is therefore right, and this note says
WHY.** Whoever opens V4 should treat "which integrator" as a decision to be made deliberately and
early, not discovered late. Related and corroborating: "RK4-on-generation" is already banked as
pending in the aging/classifier notes.

The same section names a second, smaller item: transit ballistics could use n-body summation, and
**`nBodyNodes` is still an implemented-but-never-passed parameter** — verified at
`src/lib/transit/math.ts:19,38-39`, where the summation loop exists and no caller supplies it. Still
unused, still available.

### (b) `PlanetaryGeneration.md` — DELETED, recoverable from git

Removed in commit `54b8652`. Recover with:
`git show 54b8652^:PlanetaryGeneration.md`

Its "future improvements" list maps onto the V4 scope the owner described today with striking
closeness — **these are the same ideas, written down before SSE2 existed**:

- **System History and Events → Cataclysmic Events:** *"a history of cataclysmic events, such as
  asteroid impacts, nearby supernovae, or stellar mergers… lasting impact on the planets."* **This is
  the event-driven engine, and it already names stellar mergers.**
- **Ancient Civilizations:** ruins, derelict megastructures — the seed of "civilisation & technology".
- **Atmospheric Composition Evolution:** atmospheres evolving via outgassing, solar-wind stripping
  **"and the presence of life"** — which is *life as a geological event*, already written down.
- **More Complex Biospheres** — the biosphere refresh.
- **Planet Migration** — hot Jupiters that formed far out and moved in. Not in today's list; a genuine
  addition the timeline would make possible.
- **Frost line**, **volcanism and tectonics**, **pulsars and quasars**, **more data-driven generation
  in rule packs rather than hard-coded**.

**CAUTION, AND IT MATTERS: THAT LIST PREDATES SSE2, SO SEVERAL ITEMS ARE ALREADY BUILT.** Do not treat
it as a backlog. `geoActivity.ts` covers volcanism and tectonics; `zones.ts` covers the frost line;
atmospheric evolution partly exists (bodies carry an `evolveAtmosphere` flag); and the data-driven
rule-pack move has happened repeatedly since. **Check each one against the code before scoping it.**
The value in the document is the ideas that were NOT built — events, civilisations, migration — plus
the confirmation that the direction has been stable for a long time.

## What ALREADY EXISTS that feeds this — check before building

Grounded, so V4 does not rebuild what is sitting there. **All of it is in the module tree that
`engine-map.md` GEN-1 forbids deleting**, which is now doubly load-bearing: the preservation order is
not a preference, it is the V4 foundation.

- **`physics/accrete-adapter.ts` + `vendor/accrete-js`** — the Accrete engine, deliberately preserved
  and explicitly labelled as the harvest for a future generation rebuild. This is the starting point.
- **`physics/stellar-evolution.ts`** — and this is the surprising one: it already carries
  `initializeStellarNursery`, `stepNBody`, `shiftToBarycentricFrame`, `checkEjections` and
  **`handleMergers`**. So *stellar mergers*, one of the owner's V4 wants, is partly built already.
  `ageStar` is pure in ABSOLUTE age, which is what makes a scrubbable timeline tractable at all.
- **`EvolutionTimeline.svelte` / `EvolutionaryWizard.svelte`** — a working age slider with
  slow-fast-slow easing, reachable today as "Evolutionary (Alpha Physics)".
- **Existing integrators** — `driftIntegrator.ts`, `twoBodyCoast.ts`, `flyby.ts`. Worth auditing
  before importing anything REBOUND-shaped.
- **The rule-pack data pattern** — composition, liquids, cloud decks. The biosphere refresh should
  follow it rather than invent a fourth shape.

## Two warnings for whoever opens V4

1. **THE GENERATION DUPLICATION PROBLEM IS THE MAIN RISK, and V4 is where it is either fixed or made
   permanent.** `docs/dev/generation-duplication-map.md` already records TWO live system generators,
   THREE body-creation routes and FIVE places that invent a magnetic field. A new generation system
   that does not REPLACE those becomes the third generator, and the "add interfaces to reuse it" plan
   is exactly the point at which that is decided. Read that map before writing any of it.
2. **`defaultMakeup` is four lines and wrong at both ends of its range** (inbox D7 + D17). If V4
   rebuilds composition inference, that function should not survive — but it will have written its
   verdict into bundled data long before then, so the V2 fix still matters and the two must not be
   confused for each other.

## Consequences for work happening NOW

These are the only parts of this file that affect anything before V4, and they are cautions, not tasks:

- **[[G11]] — do not over-invest.** The Traveller importer is scheduled for a full World Builder's
  Handbook rebuild in V4. G11's design investigation is still worth doing, because D6 and **D16** are
  live faults today, but it should be scoped as *diagnose and fix cheaply*, not as *specify the
  importer's final form*. Say so in its prompt.
- **GEN-1 is now load-bearing, not housekeeping.** Anyone tempted to prune the evolutionary/Accrete
  path is deleting the V4 foundation.
- **G17 stays shelved and stays linked here.** It is not a separate design job.
