# SSE V4: the owner's plans and design inputs (captured November 2026)

## 1. Purpose and how to read this

This is a capture of what the owner (who posts on Discord as Frunk) has said he intends for Version 4 of Star System Explorer, gathered from his Discord comments between July and November 2026 and from the design notes already in the repository. It is a record of stated intent, not a design: nothing has been decided on his behalf, and where he did not say something the text says so. Items are dated because his thinking moved during autumn 2026, most sharply on 2 November, when "continue V3" became "restart"; where statements changed, the sequence is shown rather than one version picked. Sections 2 to 4 are his plans, section 5 is what users asked for, sections 6 and 7 are what the repository already holds, and section 8 lists what he needs to answer first.

Conventions. All dates are 2026. Quotes are his own words, typos included. Source tags: (v4-planning), (announcements), (under-the-hood), (converter), (ideas), (using-sse) and (sharing) are Discord channels read in full; (sse-chat) is a condensed triage of #sse-chat, so its wording is as noted rather than verified verbatim; (repo: file) is a document in `docs/dev/` on the `rel/3.1.1` checkout at v3.1.77; "inbox" is `observations-inbox.md`.

---

## 2. The owner's direction in one page

**The restart decision.** On 2 Nov: "Plans for V3.2 have grown too ambitious and I think I need a reset away from 'bug fixing' and towards 'taking a new approach'" (announcements). V4 is a "blank slate start - totally new architecture - the one I have used for Ovid" (v4-planning). Why not continue: "I got pretty close with V3.2... but decided its worth 'doing better' now." Of the V3 codebase he had said earlier that it "feels more like geology at times" (7 Sep, ideas).

**The architecture he named** (all 2 Nov, v4-planning unless marked):

- "Node based physics chains that you can see, tweak and rewrite (with built in coding LLM to help you develop them)".
- "more an 'astrophysics toolkit' that you add to - more modular and designed to be expanded by me or ANYONE!" Users get "the physics systems that generate the systems (and can tweak then) rather than just their output."
- "Able to be used as a research tool as well as an RPG tool - that will always be the focus (interesting places for intresting stories)".
- "Multiple render systems that can be engaged when needed".
- "Backward compatible with all exist data saves".
- "game engine compatible - I ain't gonna write a game but others can on top of it".
- Development should be "a LOT faster than V3 as I have a clear architecture and plan in my head that is far more robust. modular and transparent" (announcements).

**Scope.** Time "as a universal constant" to age stars and planets; extension "up to galaxies, galaxy clusters and cosmic filaments"; planet classification rebuilt "Ground up"; physics "more robust", the one thing "I am NOT compromising on". The evolutionary work "will continue - and form part of V4. The evolutionary biology would be a later version." Big features users ask for are routed to V4 (section 5).

**Schedule, as stated, in sequence.**

| Date | Statement |
|---|---|
| 7 Aug | V4 parked: "we can IGNORE these features until then" (repo: v4-scope.md). |
| 11 Aug | "early thinking, nothing decided... Not committed to any of it" (under-the-hood). |
| 24 Aug | "VERY early days - still getting lab environments up and running"; hope that the evolutionary system "appears in a limited capacity in V3.1" (v4-planning). V3.1 shipped 7 Sep without announcing it. |
| 10 Sep | System ageing "was V4, brought forward"; galaxy pushed back; "all this is pre-work for V4" (sse-chat). |
| 16 Sep | Project paused by the owner (inbox, pause note). |
| 22 Sep | "research mode"; V4 a side project for some months; v3.2 to be bug fixes plus finishing the V3 feature set (sse-chat). |
| 30 Sep | "Mainline features are probably delayed to the new year as Ovid will take some of my time up just now" (using-sse). |
| 2 Nov | Idea harvest to year end; "Dev will start in the New Year - I would anticipate having something out by end of February (subject to change - may be earlier/later)"; "I am going to continue to focus on Ovid for now". |

**On V3.2 and bug fixing.** V3.2 was first described (22 Sep) as bug fixes plus finishing V3, with a time refactor and calendar rewrite. On 30 Sep he limited V3 work to "minor bug fixing just now. No point in a huge pile of effort if the whole system is thrown in the bin soon" (said while discussing the habitability code). On 2 Nov: "Will probably drop all plans for a V3.2 to 'patch things up'" (the sentence reads two ways; the announcement that day supports "V3.2 is dropped"). On 4 Nov: "I am gonna try a [b]ug squash run to get 3.1.1 out with tweaks rather than big changes" (ideas). The stated position is therefore a small 3.1.1 bug-fix release, no V3.2, then V4, whose wishlist is "not so much 'bug fixing' as 'feature requests' for a V4... which will have its own set of bugs".

**Principles he has stated.** "more meant to be a 'story tool' for worldbuilding. But in V4 I plan to be both" (4 Nov). "rooted in the possible" (4 Nov). "flexible systems over point solutions… create complexity out of layered simplicity" (7 Aug, repo: v4-scope.md). "start simple, build complexity" (10 Sep, sse-chat notes only; not found in the other channels). "All for fun, all for free" (2 Nov).

---

## 3. Plans by theme

Each theme gives what he said, why, what V3 already holds, and open questions.

### 3.1 Architecture and data model

**Said.** The statements in section 2. What a user should be able to add: "generation 2 planets (post supernova planets) or white dwarfs with atmospheres... or to add landmarks/tags, then you can 'just do it' and share it in 'explorer'" (2 Nov). For constructs he wants a reusable system driven "by config files so other peopel can xcreate them from scratch" (8 Sep, ideas).

**Why.** "I want to keep it interesting to me and also easier for others to get involved in its development. I am learning a lot while developing Ovid and I wanna bring all those lessons" (2 Nov).

**In V3 already.** The rule-pack data pattern (composition, liquids, cloud decks, user-defined gas reactions) is the existing form of user extension (repo: v4-scope.md). The engine map is sorted for carry-forward: domain knowledge carries verbatim, architecture as requirements, platform notes labelled, implementation notes not at all (repo: faults-the-old-shape-allowed.md).

**Open.** No source says what "the one I have used for Ovid" consists of. What a node is and at what granularity. Where the coding LLM runs and at whose cost.

### 3.2 Physics and composition

**Said.** "lean on primatives more (gas/dust mix)"; track "more critical elements (eg: all the HPEs [potassium, thorium, and uranium] as well as the usual carbon/silicates" (2 Nov). "V4 will be handling dust/gas densities and calculations so it will have a mass record of what is actually in the ring. Time will clump it" (13 Sep, ideas). Made-up factors such as the greenhouse factor: "I will slowly migrate to real numbers over time" (7 Sep, using-sse). Mass transfer between close bodies is "an area that could be improved" (28 Sep). "Dynamic contact binaries will be a V4 thing I hope... I need them for stellar mergers... and planetary mergers" (8 Sep). Current limit: "true n-body physics and I only do pairs for simplicity in a browser" (3 Nov). Invented content stays allowed, "but you have to tag a reason for it... eg: Magic" (4 Nov).

**In V3 already.** Every body has metal, rock, carbon, ice and gas fractions; there is no metallicity field (repo: deep-time-design.md). `stellar-evolution.ts` still carries n-body stepping, ejection and merger handling, and three integrators exist (checked in the tree). A recovered design note rules out RK4 over gigayears and calls for a symplectic integrator (repo: v4-scope.md). Standing rule: a physics criterion tags and explains, it never refuses an edit (inbox, standing rules).

**Open.** Which integrator, and how much n-body a browser can afford. Whether metallicity arrives with element tracking.

### 3.3 Stars and classification

**Said.** "the whole planet classification system will work very differently... Bring in your own physics and your own clasifications"; on star types, "You will be able to add your own" (2 Nov). On missing luminosity classes: "I did not fully 'complete the set'... bit of research required"; brown dwarfs are a "continual pain" and "exist twice" (8 and 29 Sep, ideas).

**In V3 already.** The star classification rewrite he scoped on 15 Aug is partly shipped: classification by position against the pack's bands (ten of ten reference stars correct), luminosity computed rather than stored, magnetars as neutron stars with a drawn field. Not built: one record per type serving classifier, generator and UI; the full MK designation space; dynamic ageing, which he called "a V4 feature — system evolution is a key feature". The invariant: a body created as type T classifies back as T (63 of 64 planet types already do). Two further rules: "REFUSE TO PRODUCE. NEVER REFUSE TO ACCEPT", and ageing produces state while classification only reads it (all repo: type-vocabulary-prev4.md).

**Open.** How user-defined types coexist with that invariant. What happens to class keys stored in existing saves.

### 3.4 Time, ageing and deep time

**Said.** "The spine: a new generation engine where systems are BUILT ON A TIMELINE rather than popped into existence finished", "one idea rather than a list of features" (11 Aug, under-the-hood). His list: scrubbing a system's age "back and forth"; protoplanetary discs, nebulae, accretion discs; stellar mergers and "stars that swallow their own planets"; planet migration; "System history as real events: impacts, nearby supernovae, cataclysms". "EVERY object should have an independent age anyway as V4 will track formation times, captured bodies and rebuilding planets smashed in system" (8 Sep, inbox G94). Ageing "will travel with" star clusters, giving "patches of similar star ages" (14 Aug, repo: v4-scope.md). "V4 will do the full historical 'stability periods' for planets... Every one a 'extinction event'. I wanna capture all that so planets have 'intersting histories'" (4 Nov). The campaign clock is to become "a time selector" (22 Oct).

**Why.** "This is primarily a storytelling tool... why else to planets need interesting, dynamic histories" (30 Sep). Terraforming machines need a time component (10 Sep, sse-chat). Age is also the honest fix for a brown-dwarf temperature that will not stick: give the GM the cause, not the consequence (repo: deep-time-design.md).

**In V3 already.** One age exists, the system's, read at 21 sites (inbox G94). The deep-time design is written and owner-decided: age is a property stored as a formation time on the absolute clock (zero at the big bang), absent means inherit; `age/` tags say when and `origin/` tags say where from, kept separate; the slider has a composition-dependent floor that "resists; it does not refuse". It was unbuilt at the 16 Sep pause; the changelog marks it "Board only" and a search of the tree finds no `age/` tags. `ageStar` runs a star from pre-main-sequence to remnant, at creation only (inbox G97). For scrubbing, v4-scope.md proposes `state(T) = f(seed, T)`: history computed once into dated events, never simulated on drag.

**Open.** Seed versus current state for a star that ages live (G97, flagged as his call). What an age slider does to a system imported from real astronomy (inbox G17). How a swallowed planet is remembered so time can run backwards.

### 3.5 Terraforming and mega-constructs

**Said.** Megastructures shipped in 3.1 "(Not 100% complete)" (7 Sep). "That is all planned out... it has to understand 'inside surfaces'"; new classes such as "a Soletta for adding heating to a planet"; "Once working I am moving rings and belts to the new system" (8 Sep, ideas). The next constructs update was to be terraforming machines that change planet properties: Solettas, Planetary Parasols, Fusion Candles, Orbital Scoops, Atmospheric Processors, L1 Magnetic Dipole Shields, Tectonic Lasers, Nuclear Bombardment, with the question "what happens if I overuse it?" (10 Sep, sse-chat). In the repo, life is also a terraformer: its "outputs ARE the terraforming" (7 Aug, v4-scope.md).

**Why.** "we are building an if/then/else rat's nest - rather than take the opportunity to create a new manageable subsystem... Abstract now - save a ton of problems going forward" (31 Aug, inbox G58).

**In V3 already.** A capability-record design, partly built (G58). Interiors specified as inward-facing surface areas with gravity calculated from spin, "not a fake g"; not built (G56). Surface areas specified, phases 1 and 2 marked pre-V4 (G30). Belts and rings, special-cased at 63 sites, routed to move onto the same mechanism (G61).

**Open.** Whether this groundwork is still built in V3 or becomes V4 input. Constructs in open space and wormholes (asked twice, no reply). The word "terraforming" appears only in the repo and the sse-chat notes.

### 3.6 Galaxy and larger scales

**Said, in sequence.** 7 Aug: the cluster and galaxy idea "is instead a V3.1 feature and we wanna scale up the hierarchy too", five tiers on one abstraction (inbox G20). 11 Aug: "Star clusters, and then the same tool zoomed out again to a galaxy". 7 Sep: "galaxies are likley to melt your phone!" 10 Sep: galaxy pushed back (sse-chat). 22 Sep: wider scales "up in the air", "rather do it right than fast" (sse-chat). 29 Sep: "Whole galaxies may be V4. And it won't work in quite the way you imagine"; the cosmic web "needs to be interesting, useful & relevant"; random clusters "On the roadmap". 2 Nov: "Yes, it will extend up to galaxies, galaxy clusters and cosmic filaments".

**In V3 already.** Four scale-agnostic pieces: the floating origin, `scaleLaw.ts`, `niceInterval.ts` and the map's units-to-pixels factor (repo: v4-scope.md). G20 records what does not carry upward: orbits stop being the motion model, the clock has nothing to show above a galaxy, "one parent" becomes fuzzy, star catalogues do not cover galaxies. His one measurement: a very large star count loads in about 30 seconds with a "Predicable mess on the GM view"; on limits, "I still don't have much of a clue!" (13 Aug).

**Open.** What "won't work in quite the way you imagine" means; which tiers ship first.

### 3.7 Habitability and life (the near part)

**Said.** The biosphere "only really answers 'could a human live here', and that becomes just the DEFAULT you can swap out" (11 Aug). "The whole habitability thing is pretty old code and we have a lot more data to go at now, so it will get a major overhaul" (30 Sep). Radiation has two channels shielded differently, atmosphere and magnetosphere at "probably around a 90/10 split"; "Its a chain" (30 Sep). For suitability he wants "'energy gradients', 'stable periods...', 'raw materials' & 'evolution time'", counting a large moon, a big iron core, tides and organic chemistry (4 Nov).

**In V3 already.** The biosphere engine "has barely changed since V1". The repo proposes a metabolism schema in pack data (energy source, substrate, solvent, outputs), biosignatures derived from atmospheric disequilibrium, and warns that life-climate feedback is a fixed point more bistable than the thermal one already solved (repo: v4-scope.md). Standing rule: never assume an Earth, Sol or human baseline.

**Open.** Where V4 habitability stops and the later evolutionary biology (section 4) starts.

### 3.8 Traveller, civilisations and game layers

**Said.** "A proper Traveller importer, full World Builder's Handbook treatment"; "Civilisations and tech levels sitting on top of those timelines" (11 Aug). "Traveller worlds will have a major update in v4. I want a bunch of other systems in place first"; Architect of Worlds "just by using someone else's code" (7 Sep). An economics layer is "Certainly do-able in the new archgitecture" (2 Nov). For 4X play, ownership "can be done with tags"; per-player views are "possible but not something ever considered" (22 Oct).

**In V3 already.** The reference generator he named is recorded as not reviewed and not licence-checked (repo: v4-scope.md). At the pause a main-world placement module existed but was not wired (verify current state).

**Open.** Licence of third-party code; scope of "civilisation".

### 3.9 Player view, scanning and information reveal

**Said.** "3D view can be a bit more 'fancy' - GM view is always 'functional'" (7 Sep). Reveal: basic information always shown, the rest toggled per planet from the GM screen as a before-and-after "scan"; GM notes never shown (14 Sep, sse-chat). Start-up should "start ASAP with wireframes that texture as they are calculated" (17 Sep). "Owlbear Rodeo and Foundry are next" (21 Aug; not announced since). Send what changes and let the player view simulate the rest from a timestamp (27 Aug, inbox G51).

**In V3 already.** Player sharing uses the same peer-to-peer path as his Mappadux tool. Recorded faults: two stores holding "the same" system, visible only in what players received; a snapshot that redacts but does not slim (repo: faults doc, s2 and s5).

**Open.** Per-player views; sound (requested, no reply).

### 3.10 Reports and tags

**Said.** On hiding any tag from players: "yeah I agree - the reports will be more configurable" (2 Nov). Non-physical star behaviour (flares, jets) belongs in tags because it can be re-derived (15 Aug, repo: type-vocabulary-prev4.md).

**In V3 already.** "Physics and data drive tags; tags drive the image" (standing rules). Tags are additive, type is exclusive. Known gaps: tags left behind when their rule is removed; engine behaviour keyed to slugs in user-editable tag data (faults doc, s3).

**Open.** Per-category visibility; orphaned-tag clean-up.

### 3.11 Explorers hub, sharing and presets

**Said.** Shared items can be updated at any time and opened "from a single link" (7 Sep). "closer links to load/save to portal. But halfway through that" (13 Sep). Explorers to be linked closer to the main program, "replacing the presets" (4 Oct, sse-chat). In V4, new physics is shared through it; selling is possible "if peeps wanna... Lemme know what appeals" (2 Nov; nobody answered).

**In V3 already.** Explorers lists inside Load Starmap, New Starmap and the wizard shipped to beta. A commit moving the bundled example maps out of the app is built and held until the owner tags his hub copies as defaults (inbox, pause note).

**Open.** Selling or not. How shared physics chains are checked before others run them (raised by this capture; he has not addressed it).

### 3.12 Import, export and converters

**Said.** "Backward compatible with all exist data saves" (2 Nov). A separate converter site between SSE, Universe Sandbox and Space Engine: "Just aiming for 'close enough' and folks can hand tweak afterwards"; "I will add export options on SSE direct in the next version" (23 Sep, converter; not announced since).

**In V3 already.** Importers for real-sky catalogues, Traveller, Universe Sandbox and Space Engine. Lesson recorded: upgrade a format at the load boundary, never in a live store (faults doc, s6).

**Open.** How full compatibility is met when classification "will work very differently".

### 3.13 Rendering and performance

**Said.** Render systems "more flexible than now: text/reports, 2D, 3D faked as 2D, 3D & photo-realism (new)" (2 Nov). A Low Power switch that "will work across more and more"; old devices: "it is doing A LOT and may eventually outgrown them. But I will try and keep it working as long as possible" (7 Sep). Any edit "redoes all it's physics and probably does the physics of everything else" (17 Sep).

**In V3 already.** One concept drawn four times in four media (CSS, canvas, SVG, three.js), bound only by a test; canvas output automated sessions cannot see (faults doc, s1 and s7).

**Open.** How photo-realism is done in a browser; the minimum device.

### 3.14 Hosting and platform

**Said.** Browser-first; the worry is "someone's old android tablet" (24 Aug). Hosting to move from Vercel to Cloudflare for the free limits, Explorers already there (9 Sep, sse-chat). Labs and the converter are separate sites.

**Open.** An offline build (requested, no reply). What "game engine compatible" means: library, API or headless mode.

### 3.15 UI design language

**Said.** "write a design language to abstract the UI layer - maybe in a future version we can refactor the whole UI to embrace this design pattern" (31 Aug, inbox G59): panels and rows as data, one renderer per row kind. Editors guide rather than block: the composition editor "rarely stops you from doing anything" (17 Jul).

**In V3 already.** Precedents named in G59: the override roster, `MegaParamDef` rows, click-to-cycle units, editor chrome conventions. G59 is banked: "do not start without the owner scheduling it", design document first.

**Open.** Whether G59 is the V4 UI. Touch devices have no hover, so help cannot rely on tooltips.

### 3.16 Documentation, onboarding and feedback

**Said.** "V4 will also have new systems to report bugs so I can deal with thEm faster", because "searching these threads is hard" (4 Nov). The apple icon "shows you the working" (30 Sep).

**In V3 already.** Standing rule: a physics change is not finished until the user-facing explanations follow it.

**Open.** Users report that tutorials are hard to find and beta-only features are unmarked; one asked how an idea becomes a feature (unanswered).

---

## 4. Far-V4 ambition (kept separate on the owner's instruction)

Recorded, not designed. He called this "way more complex" and said he had "no idea if it will work".

**System Lab** (24 Aug, v4-planning). Goal: "deterministically generate a star system's formation history from one seed, including planetary bodies, accretion events, material bands, provenance, uncertainty, and reproducible time slices." Intended to cope with "Passing stars, galactic motion and Oort-cloud disturbance. REBOUND/REBOUNDx integration. Detailed stellar evolution, mass transfer and mergers. Long-term planetary geology, climate and atmospheric evolution." Status then: the old accrete code "yanked out of V3" into a standalone site, "Nothing added"; it "will not actually get a chunk of development until the other strand is more advanced."

**Evolution Lab** (24 Aug). "I have no idea if it will work or collapse the browser as normally this type of stuff is done in supercomputers... But I have a plan and I think it is sound." Mechanism: "it treats evolution as an abstract network of interacting populations and resource fluxes. It models capabilities and energy gradients"; at that date "a single test-tube rather than a full ecosystem". The labs feed each other: System Lab supplies planets and is "driven from it as biology changes planetary conditions."

**Scale invariance** (24 Aug). "The engine itself is blind to what the nodes represent. The exact same directed graph that calculates a microbial test-tube ecosystem can simulate the societal factions of a medieval town, or the mass-transfer of a galactic collision, simply by swapping out the data rules." The same system is to be "reused to do stellar and galactic evolution".

**Xenobiology** (4 Nov). "there is no 'life forms logic'... it does not account for genuine alien biologies." "I am saying 'time and chemical complexity' creates life... and we know what knocks those back to 'zero'. So the aim is to track distriptiopns and then let 'life evolve' - it may not be entirely carbon based." Silicon-only life is "super unlikley".

**Relation to Ovid, and timing.** "Ovid is a stepping stone to the evolutionary systems I want for galaxy formation and life" (30 Sep). To a user's picture of generating a system, evolving within it and eventually leaving the star: "That is the core idea... I know how it will work" (2 Nov). And: "The evolutionary biology would be a later version" (2 Nov).

**Unresolved by the sources.** Whether it runs in a browser. How a graph simulation stays reproducible when time is scrubbed. How it relates to the repo's simpler dated-epoch proposal (section 6).

---

## 5. Community wishes routed to V4

One line each. "No reply" means none from the owner in the channels read.

**Stars and classification**
- More star types (quasi-stars, iron and carbon stars, pulsars, all brown-dwarf types, hypergiants, Wolf-Rayet). Agreed as "You will be able to add your own".
- Stellar activity cycles and remodelled flaring. No reply.

**Time and history**
- One overall system age with bodies ageing to match; red-giant-phase effects. Covered by his time plan.
- Per-body ages. Agreed: "needed for V4 anyway".
- Calendars for non-Julian systems. Rework was planned for V3.2; now unplaced.

**Physics and stability**
- Stability that accounts for inclination, resonance and weighted influences. No reply.
- Large moons stabilising tilt should raise habitability. Agreed: "would be counted".
- Stellar and planetary mergers, dynamic contact binaries. Deferred: "V4".
- Close-binary accretion and tidal stretching. No reply; he had separately called mass transfer "an area that could be improved".
- Lagrange points for circumbinary planets. Deferred: "Some reaserch needed".
- Moon shielding by the parent's magnetosphere. Unanswered.
- Atmosphere appearance by altitude. "will look into it".
- Count and mass budget of objects in a belt or ring. Deferred to V4: "it falls out there".

**Life and evolution**
- Life from microbes to an interstellar species; evolving inside a generated system. Agreed as "the core idea" (far-V4).
- Procedurally generated life descriptions. No reply.

**Galaxy and scale**
- Whole galaxies and galaxy-scale maps. "may be V4".
- Random clusters and neighbourhoods. "On the roadmap".
- Performance with hundreds of objects and on older phones. Acknowledged as ongoing.

**Constructs**
- Ring-world atmosphere, biosphere and temperature. Planned; needs inside surfaces.
- Megastructures on inclined orbits. "Next update"; a user reported it absent from beta.
- Constructs in open space; wormholes. No reply.

**Traveller and generation**
- Traveller rework, including editing a UWP after import. Deferred: "major update in v4".
- Architect of Worlds generation. Agreed, via third-party code.
- Choose the number of bodies at creation; generate planets into an existing system. No reply.
- More than one custom gas, liquid or engine. Acknowledged as a 3.1.1 bug rather than a V4 feature.

**Game, economy, shop**
- Survival and sandbox modes with a currency. Declined as a game; V4 to be "game engine compatible".
- A customisable economy. "Certainly do-able"; a later repeat got no reply.
- A shop interface. Left open: Explorers is the shop.
- Empire ownership and per-player views. Tags and the overlay today; per-player views "possible".

**Player view, reports, tags**
- Hide any tag from players; choose tag categories in reports. Agreed: reports "more configurable".
- Control what the body panel shows players, with a post-scan description. Agreed in principle; version not stated.
- Remove tags whose rule no longer exists. No direct reply.
- Sound and music, including spin-dependent pulsar sound. No reply.

**Maps, export, platform**
- Planet map export, areas of influence, height-map import and export, saved surface maps. No reply.
- An offline HTML build. No reply.
- Export to Space Engine. Planned earlier and never built in the app; now attempted through the converter site.

**Rendering and documentation**
- Rework cloud-band colours; a real effect of inclination on the 2D map; one size comparison across system and star map. No reply.
- Magnetic field visualisation. In beta, held back.
- A video tutorial and easier-to-find guides. No reply.

---

## 6. What the repo's v4-scope.md says, and where it is stale

**What it says** (captured 7 Aug, last addition 28 Aug). Parked and non-actionable until V4 opens. Its spine is one decision: a new generation system "built on Accrete (possibly REBOUND or similar)" whose generation has a timeline, from which the age slider (G17) falls out. One parameterised system, not three: topology reused across scale, type selection across domain. Age travels with the cluster. The scale-up to galaxies was moved out to V3.1 (G20). Traveller gets the full handbook treatment; civilisation is named but unscoped. The biosphere becomes a pack-data metabolism schema with human-habitable as the default, its history computed once as dated epochs so scrubbing is a lookup. It names existing modules as "the V4 foundation", marks surface areas as pre-V4 groundwork, and warns that generation duplication is the main risk.

**Stale or contradicted.**

1. **The Accrete foundation is gone (verified).** The file says the Accrete path is "deliberately preserved", that "GEN-1 is now load-bearing" and that pruning it "is deleting the V4 foundation". The engine map's GEN-1 entry now records the reverse: on 21 Aug the owner ordered "ditch accrete, shrink our program" (inbox G35), and `accrete-adapter.ts`, `vendor/accrete-js`, `EvolutionaryWizard.svelte` and `EvolutionTimeline.svelte` were removed at v2.1.898-beta, living on as the System Lab project. The tree agrees: only `stellar-evolution.ts` and the integrators remain. The file's "What ALREADY EXISTS" list, its `AccreteSnapshot` reference and inbox G17's "preserved in full" are stale. His Discord statement of 24 Aug matches the engine map.
2. **Restart versus reuse.** The file builds on existing modules "rather than being rewritten"; on 2 Nov he chose a blank slate.
3. **"Ignore until V4 opens."** He opened V4 planning publicly on 2 Nov.
4. **Galaxy tiers.** The file and G20 place them in V3.1; they did not ship there, and on 29 Sep and 2 Nov he placed them in V4.
5. **Ageing.** The file (14 Aug) says not to tidy star ageing in V3; decisions of 8 to 11 Sep put an age on every body in V3 ("was V4, brought forward"), which was not then built.
6. **Biosphere timing.** The file treats the refresh as V4; on 2 Nov "The evolutionary biology would be a later version."
7. **Life mechanism.** The file proposes a dated epoch list extending the gas-reaction shape; on 24 Aug he described a population-and-flux graph. Neither text reconciles them.
8. **Order of work.** The file says nothing is startable before the generation rebuild; on 24 Aug System Lab waits behind Evolution Lab.
9. **Pre-V4 groundwork.** Surface areas, megastructure interiors and the Traveller caution assume continuing V3 work; with V3.2 dropped their status is undefined.

**Still sound.** The one-system rule, the scale-agnostic foundations, coeval ages, the fixed-point and determinism warnings, the integrator warning and the duplication warning.

---

## 7. Lessons from V3 worth carrying into a restart

| Recorded fault class | Where recorded | What a V4 architecture should do |
|---|---|---|
| Duplication: two system generators, three body-creation routes, five places inventing a magnetic field; one tag pill implemented four times | generation-duplication-map.md; faults doc s1; v4-scope.md | Give each concept one authority that is the only way to obtain the value; generate any second medium from the first. |
| Two answers to one question, agreeing by coincidence | faults doc s2 | One publisher per derived quantity; where two answers are intended, name both. |
| Order of passes: a later pass overwrites what an earlier one already read, so reprocessing drifts (radiation up to 18% on a second pass) | generation-duplication-map.md s3; inbox standing rules | Make node dependencies explicit and one-way, choose the pass model deliberately, and keep an idempotence test from the first day. |
| Feedback loops and path dependence against scrubbing | v4-scope.md | Solve fixed points explicitly; compute history once from the seed and make scrubbing a pure lookup. |
| Kind-gates: behaviour branching on what a thing is called (63 belt and ring sites, thirteen megastructure seams, flares matched off a class letter) | inbox G58, G61; type-vocabulary-prev4.md s9.4, s11 | Objects declare capabilities and consumers switch on declarations; a derived class is never a physics input. |
| Scattered constants and stored derived values (the main-sequence law spelled five times; a stored figure out by up to 60,000 times) | inbox standing rules; type-vocabulary-prev4.md s6, s10; deep-time-design.md s4 | Tunable numbers live in pack data; store only what cannot be computed. |
| Forward and inverse vocabularies growing apart | type-vocabulary-prev4.md s1 to s4 | One record per type for generator, classifier and UI; generation bands inside match bands; a round-trip test. |
| Authored and derived state in one object | faults doc s8 | Two stores; undo, save, diff and idempotence then follow from one property. |
| Engine behaviour keyed to user-editable vocabulary | faults doc s3 | The engine declares and registers its own keys and an unmatched key is loud. This matters more once users edit physics. |
| Flags and sentinels each writer honours separately | faults doc s4 | Publish the gated operation, not the permission; make a sentinel a type. |
| Names that mean different things to different readers | faults doc s5 | Name a function for what it does; make audience a parameter. |
| Half-finished migrations and shadow stores | faults doc s6 | Upgrade old formats once at the load boundary, with a version and a removal date: the save-compatibility promise in practice. |
| Verification that cannot see what it verifies | faults doc s7 | Fixtures built by the producer; every visual state reachable from a bundled example; instruments report what was measured. |
| Things that look like duplication and are not | faults doc s9 | Name the question, not the comparison, before unifying. |
| Trusted documents going stale | type-vocabulary-prev4.md s9.7; deep-time-design.md s8 | Correct a document in the change that falsifies it; section 6 is a live example. |

The faults document ranks three to design against first: authored and derived state in one object; a published quantity with more than one producer, or none; and visual paths nothing can exercise.

---

## 8. Open decisions for the owner

1. **What crosses from V3.** Does "blank slate" mean no V3 code, or a new architecture carrying V3 physics modules, pack data, engine-map domain entries and tests?
2. **The Ovid-derived architecture.** What it is concretely for SSE: what a node is, and how chains are stored, run and versioned.
3. **First-release scope.** Which themes in section 3 are in the release targeted for end of February.
4. **The V3 line.** What goes into 3.1.1; whether V3.2 is dropped; the fate of beta-only work, the held commit, the unbuilt age work and the pre-V4 groundwork.
5. **Save compatibility.** Whether old files merely load and upgrade once, or must keep looking and classifying as they did.
6. **Time model.** Seed versus current state for ageing stars; ageing of imported real systems; live simulation versus history computed once; which integrator.
7. **Life.** Dated epochs, the population-and-flux graph, or one inside the other; and what habitability ships before the evolutionary biology.
8. **Scale tiers.** Whether galaxies, clusters and filaments are in the first release, and how they "won't work in quite the way you imagine".
9. **Extensibility.** What users may change (data, node chains, code); which coding LLM, where it runs, at whose cost; how shared physics is made safe to run.
10. **Classification.** How user-defined types and a primitives-based scheme coexist with "what you pick is what it classifies as".
11. **Explorers.** Physics sharing, hub content replacing presets, and whether selling is allowed.
12. **Rendering and devices.** Which render systems ship first, how photo-realism is done, the minimum device.
13. **Platform.** Browser only or also offline; the hosting move; the form of "game engine compatible".
14. **Third-party generation.** Traveller and Architect of Worlds code: review and licence.
15. **Player view.** The scan-and-reveal model, virtual-tabletop integrations, per-player views.
16. **UI.** Whether the banked declarative design language is the V4 UI.
17. **Intake.** What the new bug and idea reporting system is.
18. **v4-scope.md.** Retire or correct it once the V4 design document exists.
