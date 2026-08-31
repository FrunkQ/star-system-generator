# Three session briefs — 2026-08-28, from coordinator 7

Paste one into each fresh session. They are long on purpose: the entry fee is measured at about a
fifth of a session's context (`PLAYBOOK.md`), and every file:line below is that fee pre-paid.

**Every code claim here was verified in the tree at v3.0.177. A worker still re-verifies line numbers
before editing** — the tree moves.

---

## TWO ADJUSTMENTS TO THE SPLIT, before handing these out

**1. The Creator Hub agent must not touch the SSE repo.** G55 phase 0 — the `bundleFormat` stamp and
the canonical fixture — is engine-side work. It has been moved into **Stream A** so the hub agent
stays entirely inside its own new repository, which was the point of separating it.

**2. The Vercel→Cloudflare migration is NOT an agent job.** It changes a live product, has a known
failure mode (the service worker, `creator-hub-design.md` §5.2) and needs a propagation window
between two steps. That is owner-and-coordinator work, in sequence. **The `sw.js` version bump alone
is one line and is correct regardless of when the migration happens**, so it sits in Stream A ready
to go to prod on the owner's word.

**Streams A and B share the main checkout.** Both must work in their OWN worktree and stage explicit
files — never `git add -A`. Both may touch `src/lib/types.ts`; if you find someone else's edit there,
it is theirs, leave it.

---

## STREAM A — "binaries not binarying", and the luminosity split

> You are fixing [[B111]] and [[B110]] for Star System Explorer. Repo
> `C:\Development\star-system-explorer-v2\star-system-generator`, branch `beta` (v3.0.177). Work in
> your OWN git worktree (`git worktree add ../sse2-orbital-phase -b wt/orbital-phase origin/beta`);
> the main checkout is shared with other sessions. Commit as **FrunkQ <frunk@frunk.net>**, never
> ac@epsis.com.
>
> **READ FIRST, IN THIS ORDER.** (1) The [[B111]] and [[B110]] rows in
> `docs/dev/observations-inbox.md` — both were MEASURED by the coordinator, not reasoned, and the
> numbers are in the rows. (2) The standing rules at the foot of that file. (3) **In
> `docs/dev/engine-map.md`, these entries specifically, and DATA-R29 first because it already states
> the rule B111 breaks:** `DATA-R29` (a stored orbit describes a body only if it carries the PHASE as
> well as the radius — *"a circle is not an orbit without a PHASE"*), `LGR-1` (one Lagrange
> convention, one module), `LGR-2` (a co-orbital orbit is DERIVED from a SIBLING, which
> parent-before-child does not order), `PHY-32` (a co-orbital node's orbit and parentage have exactly
> ONE owner), `PHY-30` (a barycentre publishes its annulus; nothing may re-derive either edge),
> `DATA-R30` (a repair that only checks the host cannot see a change of orbit), `DATA-R2` (node ids
> feed the orbital phase hash). (4) `docs/process-templates/PLAYBOOK.md`.
>
> **THE JOB, in three parts, each its own green push.**
>
> **A0 — two five-minute jobs first, deliberately out of territory, to get a green push under you.**
> (i) `static/sw.js` pins `STATIC_CACHE`/`RUNTIME_CACHE` at `sse-static-v3.0.22` while prod is
> v3.0.164; its own A68 comment explains that the update prompt only fires when that file's bytes
> change, so it is dead. Bump both to the current version. **Do not do anything else to the service
> worker.** (ii) Add a `bundleFormat` integer to what `src/lib/io/bundle.ts` writes (start at 1) and
> check in a canonical fixture bundle under `tests/fixtures/` — a second codebase is about to read
> this format and `provenance.ts`'s `appVersion` is a build stamp, not a contract. See
> `docs/dev/creator-hub-design.md` §4.
>
> **A1 — [[B111]], the user-facing one, and the reason this stream exists.** A pair sharing a
> barycentre sits at the wrong points on its orbits, so the two bodies chase each other instead of
> orbiting each other. **Measured** on `../user-test-files/PS21-System.json` (a real user file —
> NEVER commit it, never bundle it): the angle between PS21 Ba and PS21 Bb seen from their own
> barycentre runs 130.7° / 5.8° / 40.0° / 125.2° across one period, and should be 180° at every
> instant. **Root cause: `orbit.t0` differs between the members by 3,893 days while `M0_rad` is
> identical** — and `M(t) = M0 + n·(t − t0)`, so that is a fixed 240.7° phase error, constant because
> `n` matches. `orbit.lastEditedT0` differs by 26.7 s: **each edit re-stamps that node's `t0` and does
> not re-phase its partner.** Confirmed: aligning Bb's `t0` to Ba's gives 180.0° at every sample.
> **Fix in two steps.** First make any `t0` re-stamp PHASE-PRESERVING — recompute `M0` so the body
> does not move — which fixes the symptom everywhere including L-points and is the smaller change.
> Then, if there is room, the structural shape: **a pair is ONE relative orbit plus a mass ratio, not
> two independent orbits**, derived every pass exactly as `coOrbital` already does for L-points
> (`physics/lagrange.ts`). The second makes the fault unrepresentable; the first makes it stop.
> **A SECOND, SEPARATE FAULT in the same file, also measured:** the root barycentre lists `PS21 Ba` in
> `memberIds` while Ba's `parentId` points at the INNER barycentre, and its `effectiveMassKg` omits
> `PS21 Bb` entirely, leaving the root pair 1811× out of balance. `fixUpImportedSystem`,
> `reconcileBarycenters` and a full `SystemProcessor.process` pass **all leave it exactly as-is** —
> verified at every stage. Nothing repairs a barycentre whose membership went stale when a member was
> promoted into a sub-pair.
>
> **A2 — [[B110]], and it BLOCKS two other features.** A star's luminosity is computed in two
> independent places: `physics/zones.ts:26` `getLuminosity` (module-private, solar units, six callers
> inside that file) and **inline inside `calculateEquilibriumTemperature`** (`physics/temperature.ts`,
> around line 494, SI watts), which feeds equilibrium temperature and therefore surface temperature,
> albedo, habitability and colour. Both are R²T⁴ so nothing is wrong today — but occlusion applied at
> one and not the other gives a star dimmed for the habitable zone and not for a planet's
> temperature. **Export ONE luminosity function, have both call it, pin the old values bit-for-bit in
> the same commit** (the P1 pattern in `src/lib/rendering/scaleLaw.spec.ts` is the model — moving a
> number and changing it are two commits, never one). **SWEEP FIRST:** the coordinator searched for
> the occlusion path, not exhaustively; find any third site before you unify.
>
> **A3 — the two thresholds become settings.** `PROMOTE_RATIO = 0.08` and `DEMOTE_RATIO = 0.05` at the
> top of `physics/barycenterReconcile.ts` decide when a large moon becomes a double planet. The owner
> asked for them tunable, and the standing rule agrees (*"will a human want to change this after
> using the product?"*). Extract to data with the existing settings/override conventions; do NOT
> change the numbers in the same commit that moves them.
>
> **ACCEPTANCE — thirty seconds each, and include the negative cases.** (1) Load
> `../user-test-files/PS21-System.json`, open the PS21 Ba / PS21 Bb pair and scrub: they stay
> opposite across a full period. (2) Edit ONE member of a working pair — change its name, nudge an
> element — and it stays paired. **That is the regression that matters and it is the one that was
> broken.** (3) The root barycentre's mass equals the sum of everything under it. (4) A moon crossing
> 8% of its host still promotes; crossing back below 5% still demotes. (5) Every new gate has been
> RUN WITH THE FIX REMOVED and seen to go red — a green gate proves nothing until then, and this
> project has shipped a gate that passed with its bug fully present.
>
> **RULES THAT ARE NOT OPTIONAL.** `npm run build` green before every push (svelte-check alone is not
> enough); bump the version every push; changelog line after the preamble, prose a GM would
> understand, no internal ids; stage explicit files, never `git add -A`; **read `git show --stat`
> before every push — a whole-file diff on a small edit is the CRLF tell and it has cost this project
> twice**; byte-level editing is the safe form for `observations-inbox.md` and `changelog.md`.
> **`src/lib/system/idempotence.test.ts` is the guard for everything you are touching** — if it goes
> red, find the read, do not relax it. **ENGINE-MAP MAINTENANCE IS PART OF THE JOB, NOT A FOLLOW-UP:**
> any non-obvious rule that cost you more than ten minutes gets an entry in `docs/dev/engine-map.md`
> in the SAME commit as the code, in the file's fixed format (`### ID claim` / BUCKET / WHERE / RULE /
> WHY / BLAST) — and **if your change falsifies an existing entry, correct it in the same commit; a
> wrong entry is worse than a missing one.** Record dead ends as loudly as findings. Do not stop early
> on a context guess — that estimate has been wrong every time it has been checked. If the preview
> will not render, say so and hand back a thirty-second eyeball list rather than claiming it is done.

---

## STREAM B — mega-constructs, phase 1 (no physics risk)

> You are building [[G53]] PHASE 1 for Star System Explorer. Repo
> `C:\Development\star-system-explorer-v2\star-system-generator`, branch `beta` (v3.0.177). Work in
> your OWN worktree (`git worktree add ../sse2-mega -b wt/mega origin/beta`); the main checkout is
> shared. Commit as **FrunkQ <frunk@frunk.net>**.
>
> **READ FIRST.** (1) `docs/dev/mega-constructs-design.md` — the whole thing, but §3 (the hybrid),
> §4 (data model), §5b (the registry) are the build. It was written and corrected by the owner four
> times in one sitting; every quoted decision in it is his. (2) The [[G53]] row in
> `docs/dev/observations-inbox.md`, then the standing rules at that file's foot. (3) **In
> `docs/dev/engine-map.md`:** `RENDER-S2` (**a construct contributes NO radius, model or not — your
> work will eventually FALSIFY this entry, and the rules say correct it in the same commit; phase 1
> does not, so leave it alone and know it is coming**), `RENDER-S13` (every construct has an EXTENT,
> and anything self-drawn must be self-LIT), `RENDER-S9` (a "normalised" model group is only
> normalised until someone sets its scale), `UI-B1` (**a realism band says UNLIKELY, never INVALID,
> and its edges are PACK DATA — this is exactly §3.5's hard/steer split**), `UI-C5` (a rule-pack
> override is a DELTA; an editor opens on the EFFECTIVE list), `UI-C1` (one colour drives a
> construct's whole look), `DATA-R14` (edit a rule pack as text). (4) `PLAYBOOK.md`.
>
> **THE JOB.** Phase 1 only, and **phase 1 deliberately leaves `kind: 'construct'` alone — there is
> no physics change and no risk to any existing system.** Build order, each its own green push:
>
> 1. **The flags and the ONE predicate.** `constructChrome?: true` and `artificial?: true` on the
>    node (they are ORTHOGONAL — §3.3 has the table; an asteroid is natural and still wants chrome),
>    plus `megaType?`. A new `src/lib/constructs/chrome.ts` exporting `showsAsConstruct()` and
>    `isArtificial()` — **the only place that knows a body can wear construct chrome.** Do not
>    re-point the 154 existing `kind === 'construct'` sites; they migrate as they are touched, and an
>    unmigrated site degrades gracefully.
> 2. **The registry.** `MegaTypeDef`, one record per type — **copy the pattern in
>    `src/lib/physics/overrides.ts` (G37) and read its header first; it argues the case better than
>    the design does and it replaced exactly the scattered shape the owner is trying to avoid.** The
>    params are `OverrideDef`-shaped on purpose, so the existing override row, badge, two-tier warning
>    (amber = no known mechanism, red = breaks conservation) and Newton trace already render them.
> 3. **`derive()` and `shape()` are PURE and return DATA. THREE.js at ONE edge and nowhere else.**
>    The reason is [[E7]] in the standing rules, measured: a canvas cannot be verified by a worker
>    session AT ALL, because the pane runs `document.hidden` and rAF never fires. **Maths inside
>    geometry construction can never be gated. Maths in a pure function is an ordinary headless
>    test.** This is the load-bearing decision in the whole build.
> 4. **The placement vocabulary as DATA**, with §3.5's `hard` (relevance — greys, final) and `steer`
>    (plausibility — tags and explains, never refuses) clauses split in the pack. `inHabitableZone`
>    is a STEER clause and must never be hard.
> 5. **The `mega` pack category and the picker tab** in `src/lib/components/AddConstructModal.svelte`
>    — which is already a placement-availability engine (lines 26-60); you are adding one axis,
>    per-TEMPLATE as well as per-HOST. An empty tab hides; individual options grey with their reason.
>
> **NOT IN PHASE 1, and do not drift into them:** the hybrid flip to `kind: 'body'` (phase 5), any
> geometry, occlusion, docking, or the asteroid migration. **If you find yourself editing physics, you
> have left phase 1.**
>
> **ACCEPTANCE.** (1) A campaign saved before this change loads and renders identically — both flags
> absent means today's behaviour exactly, everywhere. (2) The mega tab appears on a host that can take
> something and hides on one that cannot. (3) A greyed option states WHY in a sentence a GM
> understands. (4) A `steer` clause tags and explains and changes no authored value. (5) Every new gate
> run with the fix removed and seen red.
>
> **RULES THAT ARE NOT OPTIONAL:** as Stream A — green build, version bump, changelog prose, explicit
> staging, `git show --stat` before pushing, idempotence stays green, **an engine-map entry in the same
> commit for any non-obvious rule and a correction to any entry you falsify**, dead ends recorded,
> no stopping early on a context guess. Anything that changes what the product IS: recommend, then ask.

---

## STREAM C — the Creator Hub (a new application, its own repository)

> You are building the StarSystemX Creator Hub — a NEW SvelteKit application in its OWN repository.
> **You do not edit the SSE engine repo at all**; if you need something from it, say so and it will be
> done by another session.
>
> **READ FIRST.** (1) `C:\Development\star-system-explorer-v2\star-system-generator\docs\dev\creator-hub-design.md`
> — the whole thing. It grounds the owner's architecture plan against what SSE already ships and
> records four scope decisions he has already taken; **do not re-open them.** (2) The [[G55]] row in
> that repo's `docs/dev/observations-inbox.md`.
>
> **THE FOUR DECISIONS, taken — build to them.** Creator picks what publishes, with a preview. A
> SEPARATE project. Cover image, data and copy-paste JSON snippets — **no rendered preview and no
> engine on the hub.** And **the hub is a FUNNEL, not a destination**: *"it is one click to download -
> we want peeps using SSE"*, which settles most page design (§2).
>
> **WHAT NOT TO BUILD, because SSE already ships it and the format is fixed:** the save-bundle layout
> (`starmap.json` + `assets/models/<sha256>.glb` + `assets/images/…`, sniffed by zip MAGIC NUMBER not
> extension), the `ATTRIBUTIONS.md` provenance data, and the player redaction. §3 of the design has
> the details. **Use `fflate`, not JSZip.** Your public-sharing gate is `missing.length === 0` on the
> attribution data — it already exists in the file you are parsing.
>
> **THE THREE THINGS MOST LIKELY TO BE GOT WRONG.**
> 1. **Assets are content-addressed by sha256, so key R2 objects by that hash** — cross-user dedup,
>    a HEAD-and-skip on upload, and immutable far-future caching, all free (§3.4).
> 2. **A moderation verdict is per-HASH, not per-upload** (§6.1). Review an image once and every
>    future upload of those bytes inherits it; an approved hash never re-enters the queue; a banned
>    hash is refused before a presigned URL is issued. **The queue therefore holds only novel images
>    and shrinks as the library grows.** It is exact-byte, not perceptual — say so, do not overclaim.
> 3. **An upload is never blocked; an unreviewed ASSET is never served** (§6.2) — **including from the
>    DOWNLOAD**, which is the easy thing to get wrong. Keep the R2 bucket private and serve every
>    object through a Worker that checks the ledger: no quarantine bucket, no copy on approval, and
>    revoking something already public is a row update.
>
> **BUILD ORDER.** Phase 2 of the design (the funnel) **with the gates from day one** — the config
> table (§6.3), the hash ledger (§6.1), the admin review tool (§6.4) and reports (§6.5) ship WITH it,
> not after. A public upload path without them is a liability from its first hour, and the ledger must
> exist from the first asset or the queue starts life with a backlog. Then phase 3: hearts, search and
> discovery.
>
> **BLOCKED ON, and it is being done by another session:** a `bundleFormat` integer in the bundle plus
> a canonical fixture to test your parser against. **Do not start parsing until you have the fixture**,
> and refuse an unknown format politely rather than parsing something you do not understand into a
> public database.
>
> **STILL OWED BY THE OWNER, and not yours to invent:** terms and an acceptable-use line, a takedown
> address that reaches a person, and confirmation that a rejected asset leaves its map
> published-without-it rather than taking the map down (§6.8). **Ask; do not guess a policy.**
>
> **RULES:** your own repo, your own conventions — but keep the ones that earn their place here: a
> green build before every push, a changelog a human can read, explicit staging, and **record what you
> had to work out** so the next session does not re-derive it. Anything that changes what the product
> IS: recommend, then ask.

---

## STREAM D — one unit system across the construct panels (A80)

> You are building [[A80]] for Star System Explorer. Repo
> `C:\Development\star-system-explorer-v2\star-system-generator`, branch `beta` (v3.0.199+ — fetch
> and read the tip; other streams are pushing). Work in your OWN worktree
> (`git worktree add ../sse2-units2 -b wt/units2 origin/beta`); the main checkout is shared. Commit
> as **FrunkQ <frunk@frunk.net>**, never ac@epsis.com.
>
> **READ FIRST.** (1) The [[A80]] row in `docs/dev/observations-inbox.md` — it carries the owner's
> ask verbatim and the screenshot's two faults. (2) The standing rules at that file's foot. (3) In
> `docs/dev/engine-map.md`: **`DATA-R20` first** (UNIT PREFS RELABEL PER QUANTITY x BODY TYPE;
> STORED VALUES NEVER LEAVE SI — the load-bearing rule for everything you touch), then `UI-C10`.
> (4) `src/lib/units.ts` 145-175 — read the `UNIT_QUANTITIES` table's own comment: *"adding a key
> here is cheap, forking cycle behaviour in a component is the thing this table exists to prevent."*
> That sentence is your whole job description.
>
> **THE JOB.** The first mega-construct card in the wild showed `DRY MASS
> 100,000,000,000,000,010,0… t` overflowing its tile and `DIMENSIONS 300000000000 x … m` (that is
> 2 AU, in metres). Owner: *"smarter units on the side panel - a bit more reactive of their scale…
> a general system across those ui components to let us change units (like the bodies)."*
>
> **THE SYSTEM ALREADY EXISTS AND IS CLOSER THAN THE ROW CLAIMED — verified:** `UnitBodyType`
> already includes `'construct'` (`units.ts:142`); the `radius` quantity's comment already names
> "construct dimensions" as its scope; `formatPref(prefs, quantity, bodyType, si)` (`units.ts:266`)
> and `cycleUnitPref` (`unitPrefsStore.ts:36`) are the shipped call pair; and an `'auto'` stop
> already exists on `orbit` with its magnitude rule pinned in `units.spec.ts` (the
> Pluto-about-the-barycentre lesson — read that spec before adding any auto ladder). **The
> construct components simply never joined:** `ConstructDerivedSpecs.svelte` ~241-268 does raw
> `Math.round(t).toLocaleString()` and `dimensionsM?.join(' x ')` in bare metres.
>
> **BUILD ORDER, each its own green push.**
> 1. **Vocabulary:** extend `UNIT_QUANTITIES` — an `'auto'` stop on `mass` (t → kt → Mt → Gt →
>    M-Earth by magnitude, mirroring orbit's auto shape); a `volume` quantity (m³ ladder); a
>    `power` quantity (MW → GW → TW; a fraction-of-L☉ stop is wanted by the G53 power figures —
>    coordinate the label with `megaTypes.ts` rather than inventing a second spelling). Dimensions
>    stay SI underneath, per DATA-R20, always.
> 2. **Significant figures in the ONE formatter.** The `…010` tail is kg→t float noise printed as
>    if measured. `formatPref` owns rounding for every caller; no per-tile `Math.round`. Three
>    significant figures is the house feel for large derived values — check what the body panels do
>    and match them rather than choosing fresh.
> 3. **The sweep.** Convert every construct-facing formatter to `formatPref` + click-to-cycle:
>    `ConstructDerivedSpecs.svelte` + `ConstructDerivedSpecsModal`, `ConstructBasicsTab`,
>    `ConstructCargoTab`, `ConstructEnginesTab`, `ConstructFuelTab`; then check
>    `BodyTechnicalDetails` and `BodyStarTab` for stragglers the G34 pass missed. Say in the row
>    which sites you converted and which you deliberately left (a count in a log line is not a
>    quantity and needs no ladder).
> 4. **Dimensions display:** `dimensionsM` renders through the `radius` quantity per its own
>    comment — `300000000000 x …` becomes `2.01 x 2.01 x 2.01 AU` (or km at smaller scales), one
>    click cycling all three together, never three separate prefs.
>
> **ACCEPTANCE — thirty seconds each.** (1) The Dyson Sphere card from the owner's screenshot
> reads sanely: mass in Gt or M-Earth with no float dust, dimensions in AU. (2) Clicking any unit
> on a construct card cycles it, the choice survives a reload, and it is per quantity x body type
> exactly as bodies behave. (3) A 46 m corvette still reads in metres/tonnes — the auto ladder must
> not push small craft into absurd units. (4) Body panels are UNCHANGED — pin one or two of their
> rendered strings in a test before you start, so drift is caught rather than eyeballed. (5) Every
> new gate run with the fix removed and seen red.
>
> **RULES THAT ARE NOT OPTIONAL:** green `npm run build` before every push; version bump + changelog
> after the preamble (prose a GM understands); stage explicit files, never `git add -A`; read
> `git show --stat` before every push — a whole-file diff on a small edit is the CRLF tell; expect
> OTHER STREAMS to push while you work (fetch before every push; on rejection pull --rebase, take
> their version, renumber yours from theirs, keep both changelog entries, check every conflicted
> file for markers before `git add`); an engine-map entry in the same commit for any non-obvious
> rule you had to work out, and correct any entry your change falsifies; record dead ends; do not
> stop early on a context guess. The preview pane may not render for you — if so, hand back a
> thirty-second eyeball list naming exactly what the owner should look at.

---

## STREAM E — observed vs intrinsic (G54): the disclosure ladder and the star that lies

> You are building [[G54]] phases 1-3 for Star System Explorer. Repo
> `C:\Development\star-system-explorer-v2\star-system-generator`, branch `beta` (v3.0.213+ — fetch
> and read the tip; other streams are pushing, expect rebases). Work in your OWN worktree
> (`git worktree add ../sse2-observed -b wt/observed origin/beta`); the main checkout is shared.
> Commit as **FrunkQ <frunk@frunk.net>**, never ac@epsis.com.
>
> **READ FIRST, IN THIS ORDER.** (1) `docs/dev/observed-vs-intrinsic-design.md` — the whole design,
> owner-corrected; §2's physics correction and §2b's directional-bands refinement are HIS and are
> not up for re-litigation. (2) The [[G54]] row in `docs/dev/observations-inbox.md`, then the
> standing rules at that file's foot. (3) **In `docs/dev/engine-map.md`:** `TAG-9` (player redaction
> happens at exactly ONE point — your rung lives there and nowhere else), `TAG-1`, `TAG-4`, `PHY-34`
> (how bright a star is has ONE answer, and a gate needs an ABSOLUTE anchor — a ratio test is blind
> to a constant divergence; this entry was paid for THIS WEEK), `OVR-7` (brightness vs ionising
> output are different quantities), `DATA-R10` + `PHY-17` (a designation is LETTER + LUMINOSITY
> CLASS). (4) The header of `src/lib/physics/spectrum.ts` — its two rules (B45/B54) govern
> everything you do on the spectral side.
>
> **VERIFIED ANCHORS (re-verify line numbers; the tree moves).** [[B110]] is DONE: ONE luminosity
> module, `src/lib/physics/luminosity.ts` (`luminositySolarFromRT`, with `luminosityWattsFromRT`
> derived from it by one multiplication — a factor applied to the primitive reaches everything,
> which is the hook you exist to use). `redactTagsForPlayers` is `tagLifecycle.ts:242`.
> **`starOcclusion` is ALREADY LIVE in `megaTypes.ts`** (published at ~460; a swarm's `densityFrac`
> maps to it at ~531) — you are consuming a number another stream already produces.
>
> **THE JOB, three phases, each its own green push.**
>
> **E1 — the disclosure ladder, ALONE, and it is the reusable core.** Redaction today is binary: a
> player sees a tag or has no idea it exists. Add the middle rung — **`anonymous`: the tag's
> PRESENCE survives redaction, its IDENTITY does not** ("something is here and I am not telling you
> what"). Computed INSIDE `redactTagsForPlayers` and nowhere else — `mapHighlights.ts:57` explains
> that a second site is how a leak happens, and TAG-9 is the rule. It needs a neutral marker style,
> not a new symbol system (marker styles are shipped vocabulary). **Sweep every surface that renders
> a tag** (map markers, panels, catalogue, reports, the printed document) and prove the identity
> cannot leak through any of them — name, value, category colour, tooltip, hover. **The owner's
> note: "will be useful for constructs" — keep the rung GENERAL.** Its first construct customer is
> already designed: the carried-fleet `unobtanium` tag (`mega-constructs-design.md` §3.6) wants
> players to see that something holds a fleet together without being told what.
>
> **E2 — the observed appearance.** A `LineOfSightEffect` composed onto the star's spectrum
> (`observed[i] = intrinsic[i] x transmission[i]` on the existing grid — flat for a swarm/shell),
> the observed COLOUR on both starmaps, and the optional anomaly badge. **Both readings are ALWAYS
> computed; only `cause` is redacted** (design §6) — that is what makes "both sides of the story"
> one object rather than two code paths. **THE OUT-OF-BAND RULE IS NOT OPTIONAL:** re-emission is a
> SCALAR plus a TEMPERATURE (`wienPeakNm` gives the peak), NEVER a widened grid — the grid is the
> photochemistry window and extending it to the far-IR is ~100,000 samples per body per pass.
> **§2b, directional:** a full shell dims every direction; a BAND dims only observers near its
> plane — the bearing test is one dot product using the shape's `thetaStartRad`/`thetaLengthRad`,
> and with no viewpoint chosen fall back to isotropic and say so.
>
> **E3 — the observed designation.** Into `src/lib/system/starClassExplain.ts` beside the intrinsic
> one — it is the ONE designation builder and its header says why; do not write a second. The
> reader-facing text is the THREE-WAY DISAGREEMENT (spectroscopy says G2V; photometry says four
> magnitudes too faint; infrared says a large excess) — the design's §2 correction: a swarm dims
> WITHOUT reddening, so "looks like an M star" is a NEBULA story, not a swarm story, and the lines
> are the tell that never lies.
>
> **DELIBERATELY NOT IN SCOPE — do not drift:** nebula EMISSION (own item), interstellar
> ray-through-volume geometry (own item), and **the thermal/insolation coupling — occlusion changing
> a planet's TEMPERATURE is [[G53]] phase 4 and belongs to the mega stream.** You own what an
> OBSERVER measures; they own what a world FEELS. The seam is `luminosity.ts`, and if you find
> yourself editing `temperature.ts` you have crossed it.
>
> **ACCEPTANCE — thirty seconds each, negative cases included.** (1) An `anonymous` tag on any node
> shows players a neutral "something" marker and leaks nothing through ANY surface — including the
> report and the catalogue. (2) The same tag at `hidden` shows nothing at all; at `open`,
> everything: three rungs, one tag, no code fork per surface. (3) A star with a swarm at 0.4 dims on
> the starmap without changing hue; behind authored dust it dims AND reddens. (4) A BAND's badge
> appears only for viewpoints near its plane; a shell's for all. (5) The physics page / Newton
> explainer describes the observed designation honestly (a physics change is not finished until the
> explanations follow it — standing rule). (6) **Every new gate run with the fix removed and seen
> red — and at least one spectral assertion ABSOLUTE, not a ratio** (PHY-34: this project has now
> shipped three gates that passed with their bug present, and the third was in exactly this
> territory).
>
> **RULES THAT ARE NOT OPTIONAL:** green `npm run build` before every push; version bump + changelog
> prose a GM understands; explicit staging, never `git add -A`; `git show --stat` before every push
> (the CRLF tell); fetch before every push and on rejection rebase, renumber, keep both changelog
> entries, check conflicted files for markers; an engine-map entry in the same commit for any
> non-obvious rule, and correct any entry you falsify; record dead ends loudly; do not stop early on
> a context guess; if the pane will not render, hand back a thirty-second eyeball list. Anything
> that changes what the product IS: recommend, then ask.

---

## STREAM F — everything the map-sharing site expects of the engine (G57 + B112, one stream)

> You are building the SSE side of the Creator Hub integration: [[G57]] (R-01..R-13) and [[B112]],
> as ONE stream — the owner's call, and it is right, because it is all one territory: what a save
> SAYS, and how the app talks to the hub. Repo
> `C:\Development\star-system-explorer-v2\star-system-generator`, branch `beta` (v3.0.239+ — fetch
> the tip; several streams push here daily, expect rebases and renumber on collision). Work in your
> OWN worktree (`git worktree add ../sse2-hubside -b wt/hubside origin/beta`); the main checkout is
> shared. Commit as **FrunkQ <frunk@frunk.net>**, never ac@epsis.com.
>
> **READ FIRST, IN THIS ORDER.** (1) `docs/dev/hub-requirements-for-sse.md` — the hub's thirteen
> requirements WITH the coordinator's triage table on top; the triage is the map of what is done,
> half-done and yours. (2) `docs/dev/save-defaults-task.md` — the B112 brief, banked verbatim with
> house rules appended; it is your batch 2. (3) The [[G57]], [[B112]] and [[G55]] rows in
> `docs/dev/observations-inbox.md`, then the standing rules at that file's foot. (4) In
> `docs/dev/engine-map.md`: the DATA-* save/format entries, and `PHY-34` for the gate discipline.
> (5) `src/lib/io/bundle.ts` and `src/lib/map/provenance.ts` headers — the format's own stated
> promises ("a plain .json save still loads, and always will") bind you.
>
> **TWO GAPS ALREADY VERIFIED by the coordinator — start here, they unblock the hub entirely.**
>
> **F1 (= G57 batch 1).** (i) R-01 gap: `bundleFormat` is stamped ONLY inside `packBundle`
> (`bundle.ts:167`) — **a plain `.json` save carries no stamp**, and plain saves are exactly what
> the hub's JSON-only kill switch would make its only accepted uploads. Stamp the plain-JSON export
> path too, same integer, same "this writer decides" discipline (`bundle.ts:120`). (ii) R-02:
> `tests/fixtures/creator-hub-bundle.sse.zip` is SYNTHETIC — its model is `c0ffee.glb`, six hex
> chars, NOT the sha256 of its bytes, so the canonical fixture would fail R-03's own assertion.
> Regenerate it as a REAL save meeting R-02's full spec: both `starmap.json` and a `system.json`
> sibling, one model with a REAL content hash shared by TWO nodes, body and player images, one
> asset fully credited and one with none, `ATTRIBUTIONS.md` + `README.txt`. (iii) R-03: assert on
> export that a model file's path hash equals the hash of the bytes written — fail loudly. Do all
> three in one batch; the fixture must be regenerated last or it fails the new assert.
>
> **F2 (= batch 2: B112 + R-11 + R-12).** The serialisation batch — `save-defaults-task.md` is the
> whole brief. Add to it: **R-12, the `revision` counter** (an integer incremented on every explicit
> save — it is what lets the hub say "the copy you uploaded is older than the one published" instead
> of silently destroying work), and **R-10's `exportMode: 'player' | 'gm'` stamp** (cheap here, and
> the hub treats it as a LABEL never a GATE). **Format judgement:** removing shipped defaults and
> ADDING fields are non-breaking — `bundleFormat` stays 1 — but whatever you change, regenerate the
> fixture in the same commit; the hub's parser pins it by byte. **Pin an OLD-format save as a
> fixture FIRST**: a file written before your change, carrying the full shipped registries, must
> load identically forever.
>
> **F3 (= batch 3: the in-app funnel).** R-06 is DECIDED: device-code pairing (app shows a code,
> user approves on the hub in their browser, app holds a revocable token — no password ever near
> the app). Build in this order:
> - **R-05 first — `?hub=<slug>` one-click open.** `GET /api/download/<slug>` is LIVE on the hub
>   now, no auth needed, so this ships independently. Treat the fetched map as UNTRUSTED input
>   exactly like an imported file (`fixUpImportedSystem` path), and NEVER auto-merge into the open
>   campaign — open as its own thing or ask.
> - **R-07: `coverAssetId` on the doc; a "capture for the hub" screenshot action** (the hub rates
>   this the highest-value item after the blockers); show `created_with` quietly on loading an
>   older-build map — a capability marker, NEVER a refusal to load.
> - **R-04: upload/update from the Save flow.** Two hard rules from the hub: NEVER pre-tick the
>   provenance attestation, and NEVER default `publishGmTree` on — absent publishes the PLAYER tree
>   via `computePlayerSnapshot`. Surface `mayPublish`/`missingProvenance` from the upload response
>   IN THE EDITOR, where the credit fields actually are.
> - **BLOCKED INPUTS, do not invent them:** the exact attestation wording (lives in the hub repo's
>   `src/lib/attestation.ts` — ask the owner to paste it), and the device-code pairing endpoint
>   (the hub owes it; build the SSE side to a documented interface behind a flag and park it if the
>   endpoint is not live yet). Parking upload does NOT park R-05 or R-07.
>
> **R-13 (the shipped-content manifest), if room remains:** one static JSON served by the app
> listing shipped calendar names, tag category ids, star-type image paths, starter model paths.
> Per the doc's own conclusion: `custom` flags win for SAVE contents, the manifest earns its place
> for ASSETS.
>
> **ACCEPTANCE — thirty seconds each.** (1) A fresh no-assets campaign exports a plain `.json`
> carrying `bundleFormat: 1` and an EMPTY custom registry; add one custom calendar and it is the
> only one in the file; both reload identically. (2) The regenerated fixture passes the R-03 assert
> and exercises every R-02 bullet. (3) Two consecutive explicit saves differ by exactly +1 in
> `revision`. (4) `?hub=<slug>` on a fresh tab opens the map WITHOUT touching any open campaign;
> a garbage slug fails politely. (5) An upload with uncredited assets reports `missingProvenance`
> in the editor and is not publishable; credit it and it is. (6) A save from BEFORE this stream
> (the pinned old-format fixture) loads identically forever. (7) **Every new gate run with the fix
> removed and seen red** — and mind PHY-34: at least one assertion absolute, not relative.
>
> **RULES THAT ARE NOT OPTIONAL:** green `npm run build` before every push; version bump +
> changelog prose a GM understands; explicit staging, never `git add -A`; `git show --stat` before
> every push (the CRLF tell); fetch before every push, and on rejection rebase, RENUMBER from
> theirs, keep both changelog entries, and **verify zero conflict markers in every conflicted file
> before `git add` — the check must GATE the pipeline, not print beside it** (this cost the
> coordinator a pushed marker this week); an engine-map entry in the same commit for any
> non-obvious rule, and correct any entry you falsify; record dead ends loudly; do not stop early
> on a context guess. When the hub needs telling (its baselines can empty once F2 lands), say so in
> your rows — the owner relays. Anything that changes what the product IS: recommend, then ask.
