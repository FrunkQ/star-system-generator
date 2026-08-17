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

**This is now a PROJECT-WIDE mantra, not a V4 rule — see the first entry under "Standing rules any
worker session must follow" in `observations-inbox.md`.** Owner, 2026-08-07: *"flexible systems over
point solutions… should be the mantra for everything. We are not interested in fine-tuning the system
to create Sol system accurately — we are looking to take the general rules from here, proposed science
for exoplanets, and generalise them up to create complexity out of layered simplicity."* The rest of
this section is that mantra applied to the V4 tiers specifically.


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

### AGE TRAVELS WITH THE CLUSTER — coeval populations, and it is astronomically right

Owner, 2026-08-14: the new generation system "will have a lot more age related stuff, and as it will
support star clusters the ageing will travel with that — so we may get patches of similar star ages."

**Keep this, because it is not a simplification — it is what really happens.** Stars in an open
cluster form from one collapsing cloud within a few million years of each other, so a cluster is
**COEVAL**: one age, shared. That single fact does a great deal of work for free.

- **It makes age a property of a REGION, not only of a star** — which is the same move [[G20]] makes
  for position, and it means the tier abstraction carries age up with it.
- **It produces landscapes rather than noise.** A young cluster is full of hot blue stars, has no
  red giants at all, and has had no time for life; an old one is full of red giants and white dwarfs
  and its worlds have had billions of years. **A GM gets a REASON why one patch of the map feels
  different from another**, instead of every system being an independent dice roll.
- **It is also the cleanest possible test of the age machinery**: every star in a cluster should
  evolve in step, so the turn-off point — the mass above which stars have already left the main
  sequence — is a single number that dates the whole cluster. That is real astronomy (it is how
  cluster ages are measured) and it falls straight out of a shared age plus [[B40]]'s and [[B43]]'s
  mass-dependent evolution.

**Consequence for the meantime, decided 2026-08-14: do NOT tidy the born-old question in V3.** A star
can currently become evolved either by being drawn that way or by being aged, and the owner is content
with both — because this rewrite readdresses age properly. Tweak, do not fix.

## What the timeline unlocks (owner's list)

- Nebulae
- Planetary discs — "free with Accrete"
- Accretion discs
- Stellar mergers
- "others?" — left open on purpose

**The scale-up has MOVED OUT OF V4 — it is now V3.1, and it grew.** What began here as *"Star Clusters
+ starmap + pretty picture = the galaxy"* is tracked as inbox **[[G20]]** and extends TWO further tiers:
galaxies placed on a map to form galaxy clusters, and clusters placed into filaments on a cosmic web.
Same abstraction, same physical design, only the scale and the backdrop change. **Do not plan it from
this file** — G20 carries the analysis, including the four things that do NOT carry up (orbits stop
being the motion model; the clock has nothing to show above the galaxy tier; "one parent" is genuinely
fuzzy up there; and the catalogue story does not extend, because galaxies and filaments are not in the
stellar catalogues the importer reads).

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

### The abstraction the owner proposed, 2026-08-07 — life as METABOLISM, not as a score

His framing, and it is the right one: *"an abstract 'life' creation system — effectively identify
energy source + complex molecules + solvent = life, which will CONSUME energy & molecules and produce
life + 'something' — likely terraforming."* Plus the licence: *"we can get fun and inventive — stay
plausible but have fun."*

**Why this framing is worth keeping rather than refining into something more conventional:** it makes
life a PROCESS WITH A BUDGET — inputs consumed, outputs emitted — instead of a number attached to a
finished world. Three things fall out for free:

- **It is substrate-agnostic.** "Solvent", not "water". The engine ALREADY models non-water solvents
  with phase awareness (the liquids overhaul, `phaseAtP`, the `hydrosphere/*` phase tags), so ammonia,
  methane/ethane and supercritical-CO2 biospheres need no special-casing — they are the same rule with
  a different solvent.
- **The outputs ARE the terraforming.** Gases change composition, which changes greenhouse, which
  changes temperature. Solids change the surface, which changes albedo. That is the feedback loop, and
  it needs no separate "terraforming system".
- **BIOSIGNATURES BECOME DERIVED RATHER THAN ASSERTED.** Today `science/biosignature` is emitted by a
  rule-pack rule (`rule:d18`). Under this model it becomes what it is in real astrobiology —
  ATMOSPHERIC DISEQUILIBRIUM, a gas present that should not persist without something replenishing it.
  That is a genuine upgrade in honesty for a tag that currently guesses.

**THE ONE HARD WARNING, AND THIS PROJECT HAS ALREADY PAID FOR IT ONCE: THIS IS A FIXED POINT.** Life
changes the atmosphere; the atmosphere changes the temperature; the temperature changes what life is
possible. That loop has to be SOLVED, not evaluated once. `solveThermalState` is already exactly such
a fixed point, and its three hard-won rules apply here unchanged — especially **"bright condensate is
bistable"**. A life loop is MORE bistable than the thermal one, not less. Read [[B5]] before designing
this: it was deliberately stopped at its gate because joining the thermal fixed point turned out to
cost far more than the triage assumed, and this proposal joins the same fixed point from the other
side. **Daisyworld (Lovelock & Watson) is the canonical toy model of precisely this loop and is the
right thing to read first** — it is deliberately simple, it demonstrates the regulation AND the
collapse, and it is a better starting point than a detailed ecology.

### Fun-but-plausible instances — all reusing machinery that already exists

Written as pack DATA (the gas/liquids pattern), so a GM can add their own. Each names the real
metabolism it is based on, because "plausible" is the constraint:

| Metabolism | Consumes | Emits | The terraforming consequence |
|---|---|---|---|
| Oxygenic photosynthesis | starlight, CO2, water | O2 | **The best story beat available.** O2 accumulates, poisons the anaerobes that made it, oxidises the methane greenhouse and can tip the world into a snowball. A real mass extinction caused by success. |
| Methanogenesis | chemical energy (H2 + CO2) | CH4 | Strong greenhouse — life WARMS a cold world. The real answer to the faint young Sun. |
| Anoxygenic photosynthesis | light, H2S | sulfur | Tints the world purple/green; no oxygen ever appears. |
| Chemosynthesis at vents | tidal or radiogenic heat, H2S | sulfur compounds | Works with NO light and under ice — the Europa case, and the engine already derives tidal heating and subsurface oceans. |
| Titan-style acetylene metabolism | acetylene + hydrogen in a methane solvent | methane | Depletes atmospheric hydrogen — a real proposed Titan signature (McKay & Smith), and detectable as an absence. |
| **Radiosynthesis** | **ionising radiation** | biomass | **Turns the radiation model into a RESOURCE rather than only a hazard.** Melanin-based radiotrophy is a live hypothesis, and the engine now has a serious radiation model (Io at 36 Sv/day, belts, shielding). A biosphere in a giant's belt is the payoff. |
| Biotic weathering / "fungus made soil" | rock, water, CO2 | soil, drawn-down CO2 | The owner's own example. Resurfacing as a geological process, cooling the world by weathering. |

**Energy inputs the engine ALREADY derives and could feed straight in:** stellar flux, tidal heating,
internal/radiogenic heat, and now radiation dose. Little of this needs new physics — it needs the
existing outputs wired as inputs to a metabolism, which is why the abstraction is worth more than any
individual entry above.

### A SCHEMA, NOT A LIST — and the scrubbing constraint that decides the whole design

Owner, 2026-08-07: *"That looks like an extensible rules engine that we could generalise for any
solvent and make other versions of 'life' even when unexpected. There will have to be a
pseudo-randomness to this — so a planet may or may not develop weird life, but if it does it always
dies to make scrubbing work."*

**Part one — the seven metabolisms above are INSTANCES, and the deliverable is the SCHEMA.** Define
the shape (energy source, substrate molecules, solvent, outputs, rates, tolerances) as rule-pack DATA
in the gas/liquids pattern, and the engine can then evaluate combinations NOBODY AUTHORED against a
given world. That is where "weird life even when unexpected" comes from: emergence out of a general
rule, not a hidden list of surprises. A GM adds an eighth metabolism the same way they add a liquid.

**Part two — and this is the one that constrains everything: SCRUBBING REQUIRES DETERMINISM, AND A
FEEDBACK LOOP IS PATH-DEPENDENT. THOSE TWO PULL AGAINST EACH OTHER.** Name it early, because it is the
hard problem of this feature:
- A scrubbable timeline wants `state(T) = f(seed, T)` — computable at any instant without replaying
  history. That is exactly the property that makes [[G17]] tractable at all: `ageStar` is pure in
  ABSOLUTE age.
- A feedback loop gives `state(T) = f(state(T-1))` — life changed the air, which changed what could
  live. **That is path dependence, and with bistability it means the same instant can have two valid
  answers depending on the route taken.** `solveThermalState` already has this ("bright condensate is
  bistable"), and a life loop is worse.

**THE OWNER'S OWN FRAMING IS THE RESOLUTION, AND IT SHOULD BE TAKEN LITERALLY RATHER THAN POETICALLY:
LIFE AS A GEOLOGICAL *EVENT*. Geological events have DATES.** So model a biosphere not as a state
being continuously integrated, but as a **list of dated epochs computed ONCE from the seed and the
planet's parameters** — emerged at 1.2 Gyr, oxygenated at 2.4, collapsed at 2.5, recovered at 2.8,
ended at 4.1. Everything the owner asked for then falls out:
- **Scrubbing is a lookup, not a simulation** — "which epoch is 3.6 Gyr in" is a search over a short
  list, and it is identical every time, in both directions.
- **Pseudo-randomness is free and safe** — rolled ONCE from the seed when the events are computed, so
  a world may or may not develop weird life and always develops the SAME weird life.
- **"It always dies" becomes structural rather than a rule to enforce** — every epoch has an end,
  because a list of events with no terminator cannot be scrubbed past.
- **The feedback still happens** — it is applied while COMPUTING the epoch list, once, in forward
  order, where path dependence is correct and cheap. It is only the SCRUBBING that must be pure.
- **It matches machinery that exists.** `EvolutionTimeline` already works on precomputed
  `AccreteSnapshot`s rather than integrating live; this is the same pattern applied to biology.

**Recommendation to be confirmed when V4 opens (not decided here):** compute the epoch list at
generation time, store it on the body, and let the scrubber read it. Resist any design where dragging
the slider RUNS the ecology — that is the version that will be slow, irreproducible, and impossible to
debug.

### IT IS THE ATMOSPHERE REACTION SYSTEM, EXTENDED — verified, not asserted

Owner, 2026-08-07: *"It's kinda like the atmo system now — where you can add 'reactions'. It is getting
to the stage where I can begin to reuse physics systems I have already built."* **Checked against the
code, and he is right — the fit is closer than the remark claims.**

`src/lib/types.ts:561-567` already defines exactly this shape:
```ts
// A reaction PRODUCT declares its recipe (NH4SH from NH3 + H2S). The product's effective fraction
// derives from its constituents at process time: min(constituents) x yield, constituents depleted
// by the amount converted. ... One generation only — a product cannot itself react further. This is
// NOT a chemistry database: only reactions someone cares about are defined, and users add their own
// ("Krypton + Unobtanium = pink bubblegum").
export interface GasReaction { from: string[]; yield?: number; }
```
Pack data at `static/rulepacks/starter-sf/atmospheres.json`, e.g.
`HCN: { reaction: { from: ["N2","CH4"], yield: 0.002 } }`.

**So four things a biosphere needs ALREADY EXIST and are proven in shipped code:** reactants declared
as data; a yield; constituents DEPLETED by what is converted (a real budget, not bookkeeping); and
user extension as an explicit design goal — the "pink bubblegum" comment is the *have fun, stay
plausible* licence already written into the engine.

**WHAT A METABOLISM ADDS ON TOP — three fields and one lifted restriction:**
1. **An energy input.** A gas reaction here is spontaneous or photochemical; a metabolism must name
   its energy source (starlight, tidal, radiogenic, radiation, chemical gradient) — all of which the
   engine already derives.
2. **A solvent requirement.** Gated on a liquid actually being present in the right phase, which the
   liquids/`phaseAtP` work already answers.
3. **Self-catalysis.** The output includes MORE OF THE AGENT, so the yield is not fixed — it grows
   with the population. **That, precisely, is the difference between chemistry and life**, and it is
   the only genuinely new mechanic.

**AND THE RESTRICTION THAT MUST BE LIFTED IS THE INTERESTING PART, BECAUSE IT IS DELIBERATE:
`GasReaction` is explicitly ONE GENERATION ONLY — "a product cannot itself react further".** A
biosphere's entire point is the opposite: its output changes the world, which changes what happens
next. **So the cascade the atmosphere system deliberately forbids is exactly what a biosphere
requires** — which is the same path-dependence problem named above, arriving from a different
direction and confirming it is the real constraint rather than a worry.

**The epoch-list design resolves this cleanly and should be stated as the rule: lift the
one-generation limit ONLY while COMPUTING the epoch list** — forward, once, at generation time, where
cascading is correct and affordable — **and never at read time.** Scrubbing still reads dated events.
The atmosphere system's existing behaviour is untouched; the biosphere borrows its shape and runs the
cascade in the one place that can afford it.

**A planetary EVENT system** feeds this — the owner suggests a local REBOUND-ish mechanism, explicitly
open to something better being researched instead.

**The framing worth keeping, because it is the actual design idea:** *life as a geological event.*
Fungus gave us soil — effectively resurfacing a planet, in the same way tectonics does. That makes
biology a terrain process on the timeline rather than a score attached to a finished world.

**AND THE METABOLISM MODEL BELOW IS NOT A SECOND IDEA — IT IS THE MECHANISM FOR THIS ONE.** The owner
confirmed the two are the same thing (2026-08-07): "life as a geological event" is the FRAMING, and
"energy + complex molecules + solvent, consumed, emitting something" is HOW a geological event is
actually computed. Consumption and emission on a budget is what makes biology a planetary process with
the same standing as tectonics or weathering, rather than a label. Design them together; neither is
complete alone.

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
- **SURFACE AREAS — THE SEAM IS BEING PUT IN NOW, AND V4 DRIFT IS WHY.** Owner, 2026-08-17: V4 will
  subdivide a world into areas for surface detail — tectonic plate drift being the driving case, which
  is *a fraction, a bearing and a rate*. `docs/dev/surface-areas-design.md` fixes the record now:
  a frame (`body` / `spin` / `stellar` / `primary` / `orbital`) plus one of three closed-form shapes
  (cap-or-ellipse, band, lune), stacked as ordered paint rather than nested, with the area fraction
  DERIVED from the geometry. **What V4 adds is one field — `drift: { bearing, rate }` — and a widening
  of `centre` from a static pair to a time-evolving one.**
  **The reason to do the record before V4 rather than with it:** every derivation in the engine today
  assumes a body has ONE surface, that assumption is being written into more code every week, and it
  is expensive to unpick afterwards. Phase 1 of that spec puts the seam in with ZERO behaviour change
  — the fixture is byte-identical by construction — so it can land at any time and blocks nothing.
  **The prerequisite for it to change any NUMBER is surface-age resolution** (an active world's
  surface age is currently its regime's constant, giving five distinct ages across all 40 bundled
  bodies), which is phase 2 of the same spec and wants an owner decision: does a resurfacing RATE
  produce a distribution of terrain ages, or still one number?
