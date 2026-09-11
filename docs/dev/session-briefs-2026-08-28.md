# Three session briefs — 2026-08-28, from coordinator 7

Paste one into each fresh session. They are long on purpose: the entry fee is measured at about a
fifth of a session's context (`PLAYBOOK.md`), and every file:line below is that fee pre-paid.

**Every code claim here was verified in the tree at v3.0.177. A worker still re-verifies line numbers
before editing** — the tree moves.

**EVERY STREAM, regardless of its own read list:** the repo's `CLAUDE.md` is the front door (four
documents in reading order), the STANDING RULES at the foot of `docs/dev/observations-inbox.md` are
the house coding rules, `docs/dev/engine-map.md` is grepped for your territory before you agree
anything needs a change and maintained IN THE SAME COMMIT as code, and
`docs/process-templates/PLAYBOOK.md` is read once per session. A brief pre-pays the entry fee; it
does not replace the reading.

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

---

## STREAM G — the temporal batch: reports that lie about the date, and the stake in the sand (B113 + G62)

> You are fixing [[B113]] and building [[G62]] for Star System Explorer — one stream, because the
> report's epoch fault is a CONSUMER of the grounding G62 builds. Repo
> `C:\Development\star-system-explorer-v2\star-system-generator`, branch `beta` (v3.0.251+ — fetch
> the tip; several streams push daily, renumber on collision). Work in your OWN worktree
> (`git worktree add ../sse2-temporal -b wt/temporal origin/beta`); the main checkout is shared.
> Commit as **FrunkQ <frunk@frunk.net>**, never ac@epsis.com.
>
> **READ FIRST.** (1) The [[B113]] and [[G62]] rows in `docs/dev/observations-inbox.md` — both carry
> coordinator probes; then the standing rules at that file's foot. (2) In `docs/dev/engine-map.md`:
> grep for `temporal|calendar|epoch|clock` and read every entry that returns (the player-clock
> ownership entries are load-bearing here), plus `PHY-34` for the gate discipline. (3)
> `static/temporal/calendars.json` and the temporal registry code that consumes it. (4) The player
> clock rules: docs/GettingStarted's who-owns-the-clock section.
>
> **PART 1 — [[B113]], AND MEASUREMENT COMES FIRST.** Two symptoms, likely two faults:
>
> - **(a) The report epoch ignores the settings calendar.** PROBED: `ReportDocument.svelte:762`
>   renders `new Date(system.epochT0)` RAW — the ms epoch pushed straight through Gregorian,
>   never through the temporal registry. The fix is that reports render dates through the SAME
>   calendar path every other surface uses — find that path, do not invent a second one (one
>   formatter, or you build the next B110).
> - **(b) "The report window no longer opens at all" (owner).** PROBED, two suspects: the report
>   opens via a bare `window.open('/report', '_blank')` (`+page.svelte:121`,
>   `SystemView.svelte:1195`) — a blocked popup fails SILENTLY; and exactly ONE commit touched
>   reports since prod: **v3.0.205, the A80 unit sweep over ReportDocument** — if that render now
>   throws, the tab opens blank, which a user reports as "does not open".
>   **REPRODUCE ON BOTH CHANNELS BEFORE FIXING ANYTHING:** prod is v3.0.164 at starsystemx.com,
>   beta at beta.starsystemx.com. The reporting user is presumably on prod (pre-.205) — if prod
>   fails too, .205 is exonerated for (b). Check the /report tab's console FIRST; a thrown render
>   is loud there and invisible otherwise. If popup blocking is implicated, the fix is graceful:
>   detect the null return from `window.open` and tell the GM what their browser did.
>
> **PART 2 — [[G62]], the stake in the sand.** Owner: *"The main clock is 'seconds from big bang'
> but we need a genuine stake in the sand to the gregorian calendar... a common reference to ground
> the calendars so <tick> = 12:00:00 on 1/Sept/26 or stardate or whatever."*
>
> - **AUDIT HIS CORRECTION NUMBER FIRST — he flagged the doubt himself** (*"I put in a correction
>   number... not sure it works entirely as planned"*). Find it (grep the temporal code and the
>   bundled maps for offset/correction fields), measure what it ACTUALLY does, and record that on
>   the row before replacing anything. A correction that half-works and gets silently replaced is
>   a dead end the next reader re-walks.
> - **The mechanism: ONE anchored reference** — tick T on the master clock = instant X on calendar
>   C — that every calendar in the registry derives from. The anchor is DATA in the registry, not
>   a constant in code (the scattered-constants rule), and every calendar surface (settings,
>   reports, info cards, the clock strip) renders through it.
> - **The calibration: the bundled Earth/Sol maps** set so real dates give real sky. **The
>   acceptance test is the owner's own: ECLIPSE TIMINGS.** A wrong anchor moves an eclipse by
>   hours, so pick one or two known eclipses (there is a solar eclipse 2026-08-12, conveniently
>   recent) and gate that the engine's geometry at the anchored date puts Luna's shadow where
>   history says. `src/lib/system/eclipses.ts` exists; read it before writing anything.
> - **COORDINATE WITH STREAM F:** it is serialising `temporal_registry` (delta-not-defaults,
>   [[B112]]). The anchor's data shape must land BEFORE or WITH its delta work — talk through the
>   board rows, do not collide in the file.
>
> **THE TWO-CHANNEL RULE FOR THIS BATCH (owner: these fixes go to PROD and BETA).** Fix on beta
> first, gates red-first, build green, push. For whatever reproduces on PROD: cherry-pick the fix
> commits onto a branch off `origin/main` in the `../sse-prod-hotfix` worktree, re-run the gates
> AGAINST THAT TREE (a fix that leans on post-.164 machinery may not port — check, do not assume),
> build green from it, and **STOP THERE. Report the staged branch on your rows. The prod push is
> the owner's word through the coordinator, never yours.** Version numbering is ONE SHARED LINE:
> the hotfix takes the next free number above beta's top at that moment.
>
> **RELAY, in your row when you close (a):** the user also asked whether player reports can be
> hand-edited — the answer is no, they are generated; if they want editable output that is a
> feature request for the board, not a fault.
>
> **ACCEPTANCE.** (1) A campaign whose settings calendar is non-Gregorian generates a report whose
> Epoch line matches the settings calendar. (2) /report opens with the paper report on prod-tree
> and beta-tree builds; a deliberately blocked popup produces a visible explanation, not silence.
> (3) The anchored reference is data; changing it moves every calendar surface together. (4) The
> eclipse gate: the anchored Earth map puts a named historical eclipse at its recorded time,
> within minutes. (5) The owner's correction number is measured and its story recorded BEFORE it
> is replaced. (6) Every new gate run with the fix removed and seen red; at least one assertion
> absolute (PHY-34).
>
> **RULES THAT ARE NOT OPTIONAL:** green `npm run build` per push; version bump + changelog prose
> a GM understands; explicit staging, never `git add -A`; `git show --stat` before every push;
> fetch before push, rebase on rejection, RENUMBER from theirs, keep both changelog entries, and
> **the conflict-marker check GATES the add** (a marker was pushed this week when a check merely
> printed); engine-map entry in the same commit for any non-obvious rule, correct any entry you
> falsify; record dead ends loudly; never stop early on a context guess; if the pane will not
> render, hand back a thirty-second eyeball list.

---

## STREAM H — the UI batch: star hover summaries, supermassive black holes, and the mobile audit (A82 + A83 + A84)

> You are fixing [[A82]], [[A83]] and [[A84]] for Star System Explorer — one stream, all
> self-contained UI, no physics. Repo `C:\Development\star-system-explorer-v2\star-system-generator`,
> branch `beta` (v3.0.251+ — fetch the tip; several streams push daily, renumber on collision).
> Work in your OWN worktree (`git worktree add ../sse2-uibatch -b wt/uibatch origin/beta`); the main
> checkout is shared. Commit as **FrunkQ <frunk@frunk.net>**, never ac@epsis.com.
>
> **READ FIRST.** (1) The three rows in `docs/dev/observations-inbox.md`, then the standing rules
> at that file's foot — especially the browser-pane rules ([[E7]]: a hidden pane cannot render a
> canvas at all) and "verify in the browser is not optional". (2) In `docs/dev/engine-map.md`:
> `RENDER-S27` (a starmap glyph is a SCREEN quantity), `UI-C1`, `UI-C10`, `DATA-R20` (units:
> stored values never leave SI), and the A72 overflow note in the standing rules. (3)
> `docs/ui-design-language.md` if present — match the house chrome, compact modals over inline
> panels.
>
> **H1 — [[A82]], the star hover summary.** Hover on a GM starmap star currently shows nothing.
> Build a compact summary card: full star designation (the ONE builder,
> `system/starClassExplain.ts` — do not format a second spelling), planet count, body count,
> construct count, one compact life line when a biosphere exists, and a special line for
> non-standard objects (read `megaType`/the exotics capability record — a ringworld in the system
> is exactly what the owner wants surfaced). Check BOTH starmap surfaces (2D `Starmap.svelte` and
> the 3D starmap) — one summary component, two mounts, never two spellings of the counts. GM side
> only; the PLAYER starmap must not gain it (their view is redacted for a reason — if you wire the
> shared component, prove the player path never mounts it).
>
> **H2 — [[A83]], supermassive black holes.** PROBED: the cap is `const massMax = 300` HARDCODED
> at `BodyStarTab.svelte:90` — the scattered-constant fault. Owner: *"a switch that can offer
> 'supermassive black holes' - the scale will change from 300 to 270 Billion SM - which is the
> theoretical limit (log slider!)"*. Fix shape, in order: (i) EXTRACT the bound to data, pinning
> today's behaviour — moving a number and changing it are two commits, never one (the pixel-floor
> precedent); (ii) the supermassive toggle swaps the slider's soft range to a LOG scale reaching
> 2.7e11 SM (the overrides roster's `log?: boolean` is the shipped pattern — reuse it, do not
> invent a second log-slider); (iii) 270 billion is the THEORETICAL limit, so it is the amber band
> edge, not a wall — a typed value beyond it stays allowed and warned, per steer-don't-stop and
> the two-tier amber/red convention. **Then LOOK at one:** create a 4e6 SM black hole (Sgr A*)
> and a 1e10 SM one and eyeball the renderer — lensing, accretion, the info card's derived
> figures (Schwarzschild radius of 1e10 SM is ~200 AU; if a derived readout or the scale law
> does something absurd, record it as a finding rather than silently clamping).
>
> **H3 — [[A84]], the mobile audit — and the two named faults first.** Owner: the LLM description
> screen and the Constructs **Schedule Journey** flow are broken/unreachable on mobile, *"take a
> quick audit to see if we have missed anything else"*. Use the preview pane's mobile preset
> (`resize_window`, 375x812, reload after switching so load-time device gates re-run). Fix the two
> named surfaces, then SWEEP every modal, menu and full-screen surface at that viewport — the
> audit output is a LIST on your rows: each surface, works/broken, fixed-inline or filed. Fix the
> trivial ones in this stream; file anything structural as its own captured row rather than
> widening this one. **The audit REQUIRES the pane to render** — if the browser is genuinely
> unavailable, the two named fixes still land by code-reading but the audit half is handed back
> explicitly as NOT DONE, never silently skipped.
>
> **THE TWO-CHANNEL RULE (owner: this batch goes to PROD and BETA).** Beta first, gates red-first
> where a gate applies, build green, push. Then cherry-pick what reproduces on prod onto a branch
> off `origin/main` in `../sse-prod-hotfix`, re-verify against that tree, build green, and **STOP
> — report the staged branch; the prod push is the owner's word through the coordinator.** One
> shared version line: the hotfix takes the next free number above beta's top.
>
> **ACCEPTANCE.** (1) Hovering any star on the GM 2D and 3D starmaps shows the summary; a system
> with a ringworld says so; the player starmap shows nothing new. (2) The default BH slider
> behaves exactly as today; the toggle reaches 2.7e11 SM on a log scale; a typed 5e11 warns amber
> and is kept. (3) The LLM description screen and Schedule Journey work at 375x812, and the audit
> list is on the rows with every surface named. (4) Every new gate red-first; visual claims either
> seen in the pane or handed to the owner as a thirty-second eyeball list.
>
> **RULES THAT ARE NOT OPTIONAL:** as Stream G — green build per push, version bump + changelog
> prose, explicit staging, `git show --stat` (the CRLF tell), fetch-rebase-renumber with the
> marker check GATING the add, engine-map entries in the same commit, dead ends recorded, no
> stopping early on a context guess.

---

## STREAM I — the documentation sweep, as an AUDIT (G63)

> You are running the documentation sweep for Star System Explorer — [[G63]]. Repo
> `C:\Development\star-system-explorer-v2\star-system-generator`, branch `beta` (v3.0.257+ — fetch
> the tip; several streams push daily, renumber on collision). Work in your OWN worktree
> (`git worktree add ../sse2-docsweep -b wt/docsweep origin/beta`); the main checkout is shared.
> Commit as **FrunkQ <frunk@frunk.net>**, never ac@epsis.com.
>
> **READ FIRST.** (1) `CLAUDE.md` at the repo root — the front door. (2) The STANDING RULES at the
> foot of `docs/dev/observations-inbox.md`, especially BANK A LINE SWEEP THE PROSE, the CRLF rules,
> and "a physics change is not finished until the explanations follow it". (3) The
> **Documentation debt** section of that same file — its ~33 banked lines ARE your work list. (4)
> The [[G63]] row. (5) `docs/process-templates/PLAYBOOK.md`.
>
> **THE OWNER'S FRAMING, AND IT CHANGES WHAT THIS JOB IS:** *"just a danger of chinese whispers now
> we are a few generations along - maybe important things have been 'forgotten'."* **So this is an
> AUDIT that produces prose, not a transcription.** The rule, for every banked line:
>
> 1. **VERIFY THE CLAIM AGAINST THE TREE FIRST.** Find the shipped behaviour the line describes —
>    the code, the gate that pins it, the row that shipped it. A banked line is a note someone made
>    months of versions ago; the behaviour may have moved since, or the line may have garbled it.
> 2. **THE TREE WINS.** Where a doc surface ALREADY contradicts the tree, fix the surface to the
>    tree and record the contradiction on your rows — never average the two, never propagate the
>    doc's version because it reads better.
> 3. **Write the prose, DELETE the banked line in the same commit.** The sweep ends with the debt
>    section at zero, or with the un-writable lines still banked and each one annotated with WHY
>    (could not verify; behaviour since removed; needs the owner).
>
> **THE SIX SURFACES**, from the debt section's own header: `src/routes/physics/+page.svelte` (the
> physics page), `src/lib/physics/physicsTrace.ts` (**the Newton explainer — it claims to SHOW THE
> WORKING, so it is the worst one to leave wrong and the first to check for whispers**),
> `docs/tags-guide.md`, `docs/classification-and-tags.md`, and for anything a GM meets rather than
> a pack author, `GettingStarted.md` and `README.md`.
>
> **TRAPS SPECIFIC TO THIS STREAM.** (i) **CRLF, and this exact job has been bitten before:** a
> 13-line edit to `physics/+page.svelte` once committed as 2,054 insertions because a regex `\s*`
> crossed a `
`. Byte-level editing is the safe form for every CRLF file here; read
> `git show --stat` before EVERY push and treat a whole-file diff on a small edit as a stop.
> (ii) The debt section lives inside `observations-inbox.md`, which other streams edit daily —
> fetch before every push, rebase on rejection, and the conflict-marker check GATES the add.
> (iii) UK English, no emoji in docs, prose a GM would understand; the physics page explains to a
> curious user, not to us. (iv) Do not invent physics: every sentence you write must trace to a
> behaviour you verified in step 1. Uncertain means ask via your rows, not guess.
>
> **ACCEPTANCE.** (1) The Documentation-debt section is at zero, or every surviving line carries
> its reason. (2) Each of the six surfaces describes current behaviour for every swept item — spot
> check: a reader following the physics page's account of luminosity, occlusion tags, the
> disclosure ladder's three visibility rungs, paired-star orbits and the construct unit cycling
> finds the app doing exactly what the page says. (3) Any doc-vs-tree contradiction found is
> fixed to the tree AND recorded. (4) Green build per push, version bumped, changelog line
> ("Board only" is wrong here — these are reader-facing changes, say what a reader gains).

**AMENDED 2026-09-06 by coordinator 7, at v3.0.348, on the owner's "will that doc sweep do help files, physics and
attributions? The full bifta?"** Yes, and the brief above under-counts the surfaces. The Documentation debt section now
holds 42 banked lines, not 33. Add to the six surfaces: (7) the in-app help itself - `src/lib/components/HelpModal.svelte`,
`HelpMenuModal.svelte`, `AboutModal.svelte` and `WelcomeModal.svelte` - which a GM meets before any document, so every
claim in them is verified against the tree the same way; (8) `docs/autopilot-guide.md` and `docs/time-architecture.md`,
which predate the temporal batch and the docking work; (9) the attributions, which are NOT a document to edit but text the
app GENERATES into every save and bundle from `src/lib/io/attributions.ts` (`attributions.spec.ts` pins it): audit its
static credits (the catalogues behind the real-sky import, the NASA models, fonts, the Explorers site's "Content from
other cartographers" block) against what the app actually ships and imports, and fix the generator, never a copy. Five
things the brief could not know: every version bump is followed by `npm run manifest` (it stamps the manifest AND
`static/sw.js`); the two `tests/` fixtures are a baseline - commit them if a run changes them ([[B137]]); the stash stack
is shared - WIP commits, never bare stash/pop; claim ids in both forms; B99's rarity-dial test is a known statistical
flake, green alone is the accepted form. The "keep a copy" notice ([[G72]]) is disarmed and gets no prose.

---

## STREAM J — the hierarchy batch: a binary imported as one star, and re-homing a body by hand (B114 + G64)

> You are fixing [[B114]] and building [[G64]] for Star System Explorer — one stream, because they
> share the kepler helpers and the hierarchy passes, and together they mean an imported binary comes
> in right AND can be corrected by hand when it does not. Repo
> `C:\Development\star-system-explorer-v2\star-system-generator`, branch `beta` (v3.0.287+ — fetch
> the tip; several streams push daily, renumber on collision). Work in your OWN worktree
> (`git worktree add ../sse2-hierarchy -b wt/hierarchy origin/beta`); the main checkout is shared.
> Commit as **FrunkQ <frunk@frunk.net>**, never ac@epsis.com.
>
> **READ FIRST.** (1) `CLAUDE.md` at the repo root. (2) The [[B114]] and [[G64]] rows in
> `docs/dev/observations-inbox.md` — B114 was MEASURED on the user's file and the row carries the
> exact lines; then the standing rules at that file's foot. (3) In `docs/dev/engine-map.md`:
> `DATA-R29` first (a stored orbit describes a body only if it carries the PHASE), `LGR-1`, `LGR-2`,
> `PHY-32` (a co-orbital node's orbit and parentage have ONE owner), `PHY-30` (a barycentre publishes
> its annulus), `DATA-R30`, `GEN-6` (one star-hierarchy planner), and `PHY-34` for gates. (4) The
> [[B111]] row — the one-epoch pair machinery you will be emitting INTO. (5) `import/ubox/hierarchy.ts`
> and `import/ubox/kepler.ts` end to end; they are short.
>
> **THE FILE, and it is the gate:** `../user-test-files/Diurnus-System-V2.1.2.ubox` — a real user's
> map, NEVER commit, bundle or publish it. Two stars, Ochel Diurnus (2.18 Msun) and Acher Diurnus
> (2.12 Msun); Onae orbits Acher and Bonae orbits Onae.
>
> **PART 1 — [[B114]], the importer assumes one star.** Measured today with the importer run
> headlessly on that file: `resolveCategory` (`convert.ts:60`) correctly calls BOTH stars by mass —
> that is not the fault. `inferHierarchy` is: it picks ONE local root, the most massive candidate
> (line 65); places everything else under its best-bound host or the root (112); assigns role purely
> from the parent's role — `parent.roleHint === 'star' ? 'planet' : 'moon'` (116) — so Acher came out
> as a `planet` with no class and its whole retinue as `moon`; and its Hill-radius binding score is
> computed against the ROOT's mass, not the candidate host's (79), which is why Bonae was pulled up
> to Acher instead of staying with Onae. There is NO depth cap anywhere — moons of moons are
> structurally fine; the flattening is the scoring.
>
> **FIX SHAPE:** multi-root. Stellar-mass bodies gravitationally bound to each other become a PAIR
> under a barycentre (the 8% promote ratio is pack data since v3.0.188, and B111's one-epoch pair is
> the target shape — emit INTO it, do not invent a second pair convention); each star keeps
> `roleHint: 'star'` and seeds its own star→planet→moon chain; Hill radii are computed against the
> ACTUAL host mass. **Check the SpaceEngine importer for the same single-root shape** and fix it in
> the same way if it has it — two importers with two hierarchy rules is the duplication fault.
> Preserve every existing importer gate (`ubox.spec.ts`) bit-for-bit where the input has one star.
>
> **PART 2 — [[G64]], re-home a body from its orbit panel.** Owner: *"an advanced edit button next to
> the standard orbit - to reparent - it does not deserve 1st level appearance."* Constructs already
> choose a host (`ConstructGeneralTab.svelte`, `selectedParentId` + the placement list); bodies only
> LABEL theirs (`BodyOrbitTab.svelte`). Build a POSITION-PRESERVING reparent: take the body's current
> world state, re-express its orbit about the new host — `kepler.ts` `stateVectorsToElements(r, v,
> mu)` already does exactly this for imports; with position only, a circular orbit at the current
> distance is the honest fallback — set `parentId` and `orbit.hostMu`, then let the existing passes
> settle it: `hierarchyRebuild`, `barycenterReconcile` (a 2 Msun body reparented under a 2 Msun star
> must PROMOTE to a pair), with `idempotence.test.ts` as the guard. **THE TRAP IS ALREADY PAID FOR:** a
> reparent that writes a radius and keeps the old `M0` is DATA-R29 and B111 again — the body must not
> jump. Steer-don't-stop: reparenting INTO a physically absurd place is allowed and TAGGED, never
> refused. UI: ONE "Advanced" disclosure beside the orbit editor opening a host picker — reuse the
> construct one — never a first-level control.
>
> **ACCEPTANCE — thirty seconds each.** (1) The Diurnus file imports to TWO `star` roles under one
> barycentre, Onae under Acher, Bonae under Onae — and this gate is run RED against today's importer
> first. (2) A single-star ubox still imports exactly as before (pin one before you start). (3)
> Reparent a moon to a different planet: it stays where it was on screen at that instant, then
> follows its new host; scrub time and it orbits the new host. (4) Reparent a 2 Msun body under a
> star: a pair forms. (5) Every new gate seen red first; at least one assertion absolute.
>
> **RULES THAT ARE NOT OPTIONAL:** green `npm run build` per push; version bump + changelog prose a
> GM understands; explicit staging, never `git add -A`; `git show --stat` before every push; fetch
> before push, rebase, RENUMBER from theirs, keep both changelog entries, and the conflict-marker
> check GATES the add; an engine-map entry in the same commit for any non-obvious rule, and correct
> any entry you falsify; dead ends recorded loudly; never stop early on a context guess; if the pane
> will not render, hand back a thirty-second eyeball list.

## STREAM K — size comparison: every object at true scale, side by side (G66)

**Read first, in this order:** `CLAUDE.md`; the standing rules at the top of `docs/dev/observations-inbox.md`; the [[G66]]
row (the owner's words and the coordinator's measurements); `docs/dev/engine-map.md` entries RENDER-S11, RENDER-S41,
RENDER-S43, RENDER-S9, RENDER-S25, RENDER-S30, RENDER-S44, RENDER-S45, RENDER-S46, RENDER-S8, TAG-14, TAG-20, DATA-R20,
UI-L7; `docs/dev/PLAYBOOK.md`. Work in your own worktree off `origin/beta`; push `HEAD:beta` on a green build; commit as
FrunkQ; bump the patch version every push; `git show --stat` before every push.

**What the owner asked for, verbatim where it matters.** Under the rail's Measure button, when Measure is on, a second
button: "Size comparison". It opens a view that shows EVERY object on the current map at 1:1 relative size, laid out in
size order like the classic planets-and-moons poster: on the system map that is the star(s), the giants, the planets,
the moons, the small bodies; on the starmap it is the stars of every system. Clicking an object centres it and draws
it at 50% of the viewport's shorter side, with everything else scaled to match. A ruler in real units runs along the
strip with three highlighted reference ticks: Luna's diameter, Earth's diameter, the Sun's diameter. The initial
selection is the MEDIAN PLANET, so moons and asteroids cannot skew the opening view; the initial zoom shows the planets
at about 30% (the median planet's diameter at ~30% of the shorter side), the strip overflows and scrolls (left/right on
desktop, up/down on a phone), and the user can zoom by hand. Any object can be hidden; hiding offers, in one click,
"hide this and everything bigger" and "hide this and everything smaller" so whole sections clear at once. Hidden STAYS
hidden across re-entry, and while anything is hidden a "show all hidden" control is visible and resets the view to its
starting state. A click is also a SELECTION on the map (the shared selection, so the info panel follows). The owner wants
the 3D visualisations used, because this will reach the Player view later, and wants it reachable as a new view option
on both maps as well as under Measure.

**Why this is cheaper than it looks, and the refactor that makes it so (do this FIRST).** `src/lib/holo/galleryScene.ts`
already does most of it: one holo scene laying out many bodies with labels, built from the SAME `bodyFeatures` builders
the live holo uses (`scene.ts`). Measured: of twelve shared builders, ten are called in both files, each inside its own
inline assembly (the gallery's `buildBody` closure near line 286; the holo's inside `createHoloScene`). That is already
two copies of "assemble this node's look at this radius"; this stream must not write a third. Phase 1 is therefore to
extract ONE assembly function (in `bodyFeatures.ts` or a new `holo/bodyLook.ts`) that takes a node, a rendered radius
and options (time, detail, lighting) and returns the group plus its updaters, and to make `scene.ts` and
`galleryScene.ts` call it. Measure the two paths before you merge them and write the differences down: grep says
`buildStellarFlares` is called only in the gallery and `buildStarLook` only in the scene, so either the holo lost
stellar flares or they are reached another way; if the live holo really does not flare, that is a bug row of its own
(claim a B number, gated), not something to fix silently inside the extraction. Gate for the extraction: a spec that
builds the same node through both callers and compares the feature inventory (child names, material counts) so the
gallery and the holo cannot drift again; the gallery route (`routes/discgallery3d`) and the holo must still render,
checked headlessly (store the rAF callback, step the loop; the recipe is in the starmap-stars memory and RENDER-S30).

**The comparison scene itself.** A new `holo/comparisonScene.ts` and `components/SizeComparisonView.svelte`, mounted the
way `discgallery3d/+page.svelte` mounts the gallery (onMount, dynamic import, a handle with `dispose()`). Design points,
each a sentence you should be able to defend to the owner:
- TRUE scale is the whole feature, so this view deliberately does NOT bind the size law. RENDER-S11/S41/S43 are the
  readable-size law for the map; here a body's drawn radius is `radiusKm` (bodies), `starRadiusKmOf` (stars), the outer
  radius for belts and rings (`radiusOuterKm`), a mega's own radius (RENDER-S44) and a construct's real length (its model
  group is normalised, RENDER-S9, so scale it by the length, never by a dial). Write that exception down as a new
  engine-map entry (claim the next free RENDER-S number): "true scale is a VIEW, not a dial, and the span map has no
  say in it".
- An ORTHOGRAPHIC camera. Perspective makes the nearer body larger, which is exactly the lie this view exists to remove.
- One fixed key light from the viewer's upper left so every body is lit the same way (the poster look); black backdrop;
  NO starfield, because a starfield implies distance.
- Layout is a pure function `layoutStrip(items, scale, gap)` of the sorted diameters: descending, edge-to-edge with a gap
  proportional to the larger neighbour, labels alternating above/below once bodies get small (the poster's Titania/Rhea
  rows). Horizontal on desktop, vertical when `mode === 'phone'` (the same phone mode `SystemView`/`Starmap` already
  key on). The strip scrolls along its axis; zoom bounds come from the set's own extent (UI-L7: never a constant).
- Scale: `pxPerKm = 0.5 * min(w, h) / selectedDiameterKm` on a click, `0.3` for the opening view. The MEDIAN PLANET is
  the median by radius of the bodies whose `roleHint` is `planet` (giants included); for an even count take the lower
  middle (the smaller one), which favours the terrestrial worlds a GM is likelier to be authoring; with no planets fall
  back to the median of all bodies, and with only a star, the star. Pin all three cases.
- The pixel floor is a legibility device, not a size: anything under ~2 px at the current scale draws as a dot with its
  label and the words "below 1 px at this scale", never inflated (RENDER-S43's spirit). Do not build textures or
  materials for bodies under the floor; build looks lazily as zoom brings them up, dispose as it takes them down. A
  system with two hundred asteroids must open in the time the map does.
- The ruler runs along the strip's axis in the current LENGTH unit through the click-to-cycle unit prefs (DATA-R20:
  stored values never leave SI, relabel only), with the three reference ticks highlighted where they fall and shown at
  the ruler's edge as arrows when off its range. The tick constants live in `src/lib/constants.ts` once: EARTH_RADIUS_KM
  and SOLAR_RADIUS_KM are already there; there is NO Luna radius anywhere in the codebase, so add `LUNA_RADIUS_KM =
  1737.4` there and read it. Note `src/lib/import/realsky/constants.mjs` carries a second SOLAR_RADIUS_KM (695,700 vs
  696,340); the view reads the app constant, and the duplicate is an observation to record, not yours to unify.
- Each label carries the body's name and its diameter in the current unit.
- Selection: a click centres the object AND selects it through the map's shared selection (TAG-14: live and shared,
  not per-surface). The view is a selector; it does not grow a second selection store.
- Hidden set: per map (keyed by system id, or the starmap id), persisted in localStorage next to the other viewer
  preferences, NOT in the campaign file: it is a viewer's choice, not a fact about the system. Say so in a comment; the
  owner may reverse it when this reaches the Player view. Hiding the selected object offers three actions in one small
  popup: hide this; hide this and everything bigger; hide this and everything smaller. While the set is non-empty a
  pill reads "N hidden - show all" and clears it. Hidden objects never take part in the median or the layout.
- Entry points, all thin: the rail sub-button under Measure (`RailNav.svelte` ~line 155, shown only while `rulerOn`;
  the two maps feed `rulerOn` from `measureMode` / `rulerActive`); and a fourth starmap view beside 2D/3D/List in
  `src/lib/starmap/` and the system map's view switch, ONE switch each, found rather than duplicated. On the starmap the
  items are every system's stars from `systemVisualStars` (multi-star aware) with `starRadiusKmOf` for the radius.
- Player view later: the scene module takes plain data and has no GM chrome inside it, so the player tier (HoloView at
  BOTH tiers, TAG-20, and its four-places marker rule when the time comes) can mount it unchanged.

**Gates, every one seen RED with its law removed:** the layout law (order, spacing, axis by mode); the scale rule (50%
on click, 30% opening, both from the shorter side); the median-planet rule with its three cases; hidden-set persistence
round trip and "show all"; the ruler's three ticks in km and their relabel through the unit prefs; the extraction
inventory spec above. A ratio test is blind to constant divergence (PHY-34): pin absolute pixel sizes for the Solar
System fixture (Jupiter, Earth, Luna at a stated scale).

**Eyeball list for the owner (nobody on this stream will see a browser; say so in the report):** Sol opens on Earth at
~30% with the giants and the Sun off to the left and the ruler's Sun tick lit; click Jupiter and it fills half the
shorter side; phone view runs vertically; hide Mercury, reload, the pill says "1 hidden", "show all" brings it back;
the same on the starmap with Sirius A (now `star/A1V`) beside the Sun.

**Report back** with versions, the engine-map entries you added, what you measured about the two assembly paths, and
anything you left undone. Two sittings is honest: the extraction plus the desktop view; then phone, hiding, the ruler
and the entry points.

## STREAM L — finish G66: the size comparison's chrome into the canvas, and the last DOM player stage out (B126)

**WRITTEN BY STREAM K, 2026-09-05, as a handover.** Stream K built G66 across v3.0.301-310 and ran out of
context; everything below is measured, not remembered, and every line reference was re-verified against
`origin/beta` at v3.0.310. Re-verify anyway — the tree moves daily.

**Read first, in this order:** `CLAUDE.md`; the standing rules at the foot of `docs/dev/observations-inbox.md`;
the [[B126]] row (the fault and the owner's decision), then [[G68]] and [[G66]] for what already exists;
`docs/dev/v2.2-player-view-visual-overhaul.md` **section 7** (the 2026-07-18 decision this stream serves —
read it before writing any code); engine-map `RENDER-S54`, `RENDER-S52`, `RENDER-S53`, `DATA-R20`, `A39`.

### What is already done, and works

G66 shipped in eight pushes. The laws are pure and gated in `src/lib/comparison/layout.ts` (order, the median
planet, the 50%/30% scale shares, the strip, the orbit tree, the pixel floor, ring reach, the ruler, the scroll
clamp and the zoom anchor) with ~70 gates in `layout.spec.ts` + `items.spec.ts` + `playerView.spec.ts`, every one
seen RED against a deliberate mutation. `holo/comparisonScene.ts` draws the globes through an orthographic
camera measured IN PIXELS. `components/SizeComparisonView.svelte` is the chrome. It is reachable from the rail
under Measure on both GM maps, and as a player system view (`ViewModule` `'sizecompare'`).

**Do not re-litigate any of that.** This stream is one job.

### The job

**THE STRIP'S CONTENT IS DOM AND MUST BE DRAWN INTO THE RENDERED SURFACE.** Owner, 2026-07-18
(`v2.2-player-view-visual-overhaul.md` §7): *"a player 'info screen' ... is drawn ONE way - canvas region ->
shader ... Retire the DOM `.inspector` + `cssFilterApprox` chrome for player views; keep DOM only where a preset
is explicitly un-filtered."* The reason is a fault mode, not tidiness: DOM chrome sits in SCREEN space and does
not follow the warped, inset projection, so a barrel-warped CRT bends the picture and leaves the text over it
straight. Stream K went the wrong way twice (v3.0.308 added the DOM stage, v3.0.309 wrapped it in `FilterFrame`)
and then wrote the wrong rule into `RENDER-S54`, since corrected.

**THE OWNER HAS ALREADY DECIDED THE ONE QUESTION THIS RAISES (2026-09-05): ONE canvas renderer serves BOTH
tiers, and the strip's size labels stop being a place you can cycle the unit from.** He was offered the
alternative — a DOM renderer for the GM and a canvas one for the player — and rejected it, because two
implementations of one set of labels is this codebase's most recurring fault. The unit still cycles from every
other panel and the strip follows, because the labels read the same `unitPrefs` store either way (DATA-R20:
stored values never leave SI, a pref RELABELS). **Do not add a second renderer to preserve the click.**

### The shape of it

1. **`src/lib/comparison/stripChrome.ts` — NEW, and the only place the strip's text is drawn.** A pure-ish
   function taking the `StripLayout` (`layout.ts`), the `ReferenceMark[]` and `minorTicks` output, the unit prefs
   and a `CanvasRenderingContext2D`, and drawing: the per-object label (name + diameter), the sub-pixel DOTS and
   their "below N px at this scale" note, and the ruler with its three highlighted reference ticks and minor
   ticks. It is all already computed — `layoutStrip` returns `centrePx`, `crossPx`, `spanPx`, `diameterPx`,
   `belowFloor`, `labelSide`, `depth`; `referenceMarks` returns `posPx`, `row` and `off`. Nothing needs
   recomputing, only drawing.
   **Units go through `units.ts` and nothing else** — `resolveUnitPref` (`units.ts:519`), `resolveAutoUnit`
   (`:314`), `unitFromSI` (`:333`), `formatUnitNum` (`:406`), `unitIdLabel` (`:345`). That is the same chain
   `UnitValue.svelte` runs, so the canvas text and every panel cannot disagree. DATA-R20 is explicit that
   SIG_FIGS lives in `formatUnitNum` and nowhere else — do not format a number by hand.
   Gate it headlessly by recording the ctx calls (the jsdom canvas stub in `src/setup.ts` is a Proxy; record
   `fillText` calls and assert the strings and positions).

2. **`src/lib/holo/comparisonScene.ts` — composite that canvas and run the REAL filter chain.**
   `createComparisonScene` is at `:81`; the renderer at `:82`, the ortho camera at `:87`, `applyCamera()` at
   `:204`, the render call at `:249`. One world unit is one CSS pixel, so the chrome canvas is a screen-space
   quad at the front of the frustum with a `CanvasTexture` — no projection maths.
   **Copy `holo/filteredCanvas.ts` for the filter chain**: `EffectComposer` + `RenderPass` + a `ShaderPass` from
   `filters/FilterRegistry` and `filters/shaderMaterial` (`buildShaderObject`, `updateUniforms`). Its controller
   (`filteredCanvas.ts:13-21`) is the API to mirror: `setFilter(id, params)`, `warpPoint(su, sv)`, `resize`.
   Add `setFilter` and `warpPoint` to `ComparisonSceneHandle` (`:58`).
   NB `filteredCanvas.ts:26` sets `preserveDrawingBuffer: true` and says why — A38 paid for that lesson.

3. **`SizeComparisonView.svelte` — delete the DOM content, keep the CONTROLS.** The label block is at `:404-412`
   (it mounts `UnitValue`), the ruler at `:422-429`, the hit areas at `:393`. The order pills (`:352`), the
   steppers (`:458`, `:462`) and the header stay DOM: they are controls, not content, and the holo keeps
   `BodyPicker` as DOM for the same reason. Feed the chrome canvas to the scene alongside the existing
   `setSlots` (`:131`) / `setView` (`:136`) calls.
   **PICKING MUST GO THROUGH `warpPoint`.** The invisible hit areas are the one DOM thing that survives, and
   under a warped filter they no longer sit over what they name. Map the pointer through `warpPoint` to a source
   uv, then to a strip coordinate, then hit-test the LAYOUT (`slots`, which carry `centrePx`/`crossPx`/`spanPx`)
   rather than the DOM. That also fixes the drag and the tap-vs-drag slop under warp.

4. **Drop `FilterFrame` from both mounts and pass the filter instead.** The live branch is
   `routes/catalogue/+page.svelte:1411` (the `FilterFrame` to remove is at `:1433`); the editor preview is
   `PlayerPresetEditor.svelte:1306-1310`. Both must change together or the preview lies about the live view
   again, which is exactly what [[B126]] records. The overlay graphic goes on being rendered — it is a
   `GraphicLayer` over the top; decide whether it joins the quad or stays DOM and SAY WHICH.

5. **`FilterFrame` stays for the GM's own view.** The GM maps are never filtered (no `filterId` anywhere in
   `SystemView.svelte` or `Starmap.svelte` — checked), so `playerChrome === false` runs the same canvas chrome
   with the filter set to `'none'`. One renderer, one code path, one look.

### Gates

The pure laws are already covered; what is NEW and needs pinning: the chrome renderer's output (recorded
`fillText` strings and positions for a known layout — including a below-floor dot's note and a ruler mark's
label); the unit chain (a pref change moves the drawn string, and the string equals what `UnitValue` would
render for the same value); `warpPoint` round-tripping a pointer to the right slot with a warp active AND with
the filter off; and the preview/live parity — assert both mounts pass the same `filterId`. **Every one seen RED
with its law removed**, and at least one absolute assertion, not a ratio (PHY-34).

### What Stream K left unseen, so this stream should look

- **The frame-rate guard has never fired on a genuinely slow map** ([[G69]]) — it was verified by forcing
  `SHED_FPS`/`WARMUP_MS`. If you can make a map that slow, watch it.
- **An actual player window has never been opened on this view** — it needs a broadcast session between two
  browsers. Everything player-side was verified through the preset editor's preview.
- After the conversion: **a CRT preset on the size comparison, warped**, is the thirty-second eyeball — the
  labels must bend WITH the planets, and a tap must still land on the world under your finger.

### Housekeeping

Work in your own worktree off `origin/beta`; commit as FrunkQ <frunk@frunk.net>; `npm run build` green AND the
full vitest suite green before every push; bump the patch version every push; `git show --stat` before pushing.
`src/lib/generated/exampleSystems.ts` and the two `tests/` fixtures are a BASELINE — if a run changes the two `tests/` fixtures, COMMIT them with your change ([[B137]]); leave `exampleSystems.ts`.
A dev server for a worktree is registered by adding an entry to `C:\Development\.claude\launch.json` (the
tool reads the PRIMARY working directory's file, not the worktree's) — that is how Stream K drove a browser.

## STREAM M — the hub's next two asks of the engine: open a hub map from a URL (R-17), then the shipped-content manifest (R-13)

**WRITTEN BY COORDINATOR 7, 2026-09-05, as the successor to the hub-side engine stream.** That stream shipped
R-14's paste target (v3.0.292), the paste UI (v3.0.300, `HubClipPasteModal.svelte`), copy/cut/paste inside the
campaign with proper undo (v3.0.303, `io/clipBuffer.ts`, `clipUndo.spec.ts`) and R-16 credit-on-paste, and is
out of context. The hub's standing ask, in its own words (`C:\Development\starsystemx-creator-hub\docs\prompt-for-sse-2026-09-05.md`):
*"Engine side: the paste UI, then R-17, then R-13."* The paste UI is done. This stream is R-17 then R-13, in that
order, and nothing else. Every file:line below was checked against `origin/beta` at v3.0.311; re-verify, the tree
moves daily.

**Read first, in this order:** `CLAUDE.md`; the standing rules at the foot of `docs/dev/observations-inbox.md`; the
[[G57]] row (the hub's requirements and what has shipped); `docs/dev/hub-requirements-for-sse.md` (the SSE-side copy
with the coordinator's triage - R-13 is at its section 13, and R-17 is NOT in it yet: add it, verbatim from the hub's
prompt file above, with a status line, as part of this stream); the hub's own `docs/sse-requirements.md` in the hub
repo for R-13's full text and R-14's status note; engine-map entries DATA-R4 (the importer never invents), DATA-R20,
DATA-R31 and whatever the G57 row names for the bundle format gate; `docs/dev/PLAYBOOK.md`. The hub does not edit this
repo and this repo does not edit the hub's: you report to the hub through the owner, in the report-back below.

### R-17 — "Open in Star System Explorer" from a hub map page (an afternoon, the hub says; believe it, but measure)

**What the hub sends:** `https://starsystemx.com/?open=<percent-encoded download URL>`, where the URL is
`https://explorers.starsystemx.com/api/download/<slug>` and returns the `.sse.zip` bundle reassembled from approved
assets only, with `access-control-allow-origin: *` on success AND on error, so a plain `fetch` from the app's origin
works today. The parameter name is yours; the hub stores the prefix in a config row and shows the button only once
it is told the prefix is live.

**What already exists, and is the whole point: the app ALREADY opens hub maps by code.** `src/routes/+page.svelte`
around lines 828-880 holds the `?hub=<slug>` path: `hubSlugFromUrl`, `clearHubParam` (strips the parameter so a
refresh does not re-offer), `openHubBySlug` and `runHubOpen`, with two cautions written above them that you must
keep word for word in spirit: the map is UNTRUSTED input, so the bytes go through `classifySaveFile` and then
`openStarmapPayload` and `validateStarmap` - the same door an imported file uses, no shortcut; and it NEVER touches
an open campaign without being told, because browser storage holds exactly one campaign - with none it opens
straight away, with one it ASKS in plain words and keeps a copy of the replaced campaign under the one-step-back
mechanism the base-map upgrade uses. **R-17 is that same door with the address supplied whole.** So the job is a
SPLIT, not a second path: separate "get the bytes" (by slug today, by URL now) from "classify, ask, open" in
`runHubOpen`, and make `?open=` and `?hub=` converge on the one open function. Do not write a second fetch-and-open;
two doors into one campaign store is exactly the duplication this codebase keeps paying for.

**The allow-list is the defence, and it is DATA.** Accept only `https:` URLs whose host is `explorers.starsystemx.com`,
the hub's `*.workers.dev` name while it lasts, or a `*.pages.dev` preview; anything else is refused with a plain
message and never fetched - a URL the app will fetch and load is an SSRF-shaped thing. Put the list in ONE exported
constant next to the hub code with a pure `isTrustedOpenUrl(url): string | null` (null = trusted, otherwise the
reason), and gate it: a spec that tries `http:`, a look-alike host (`explorers.starsystemx.com.evil.example`), a
userinfo trick (`https://explorers.starsystemx.com@evil.example/`), a `javascript:` scheme, and each trusted host,
seen RED with the check removed. Strip the parameter from the address bar once handled (`clearHubParam` already
does this for `?hub=`; make it take the parameter name). Bundle bytes go to the same `sniffBundle`/`unpackBundle`
(`src/lib/io/bundle.ts:102`, `:270`) the picker uses, so provenance, attributions, the `bundleFormat` gate
(`BUNDLE_FORMAT`, `takeBundleFormat`, `bundle.ts:40`, `:84`) and the format refusal behave exactly as for a file.

**Verify it in a browser, end to end, against the live hub.** Register your worktree as a dev server in
`C:\Development\.claude\launch.json` (an entry like the existing ones: `cmd /c cd /d <worktree> && npm run dev --
--port 52xx --strictPort`, the tool reads the PRIMARY working directory's file, not the worktree's), then open
`http://localhost:52xx/?open=https%3A%2F%2Fexplorers.starsystemx.com%2Fapi%2Fdownload%2Flocal-neighbourhood` with
no campaign in storage (it should open straight away), then again with a campaign (it should ask, in the picker's
words, and the one-step-back copy must exist), then with a refused host (plain message, nothing fetched - check the
network log). Say in the report what you saw, not what the code says.

**Report back to the hub, through the owner:** the exact prefixes - `https://beta.starsystemx.com/?open=` as soon
as beta carries it, `https://starsystemx.com/?open=` only when the owner has released it to prod (prod is a
read-tree release of beta on his word; do not tell the hub prod is live until he says it is).

### R-13 — a machine-readable manifest of what SSE ships (after R-17, and only then)

**What the hub asked for:** one static JSON served from the app listing the content that ships with the build -
calendar names, tag category ids, star-type image paths, starter model paths, later the shipped gases/liquids/fuels
- carrying `appVersion`. **Why:** the hub tells GM-authored content from app-shipped content by lists hand-copied out
of this repo, and the first such list drifted within an hour of being written; a manifest turns a standing promise
to notice a change in another repository into a fetch. **How much it bites (hub, 2026-09-04):** less than it did -
since B112 (v3.0.225) a new save omits the shipped registries, so the baselines only matter for older files, and
app artwork is told from uploads by path prefix, which has not failed on a real file. **The coordinator's triage
stands:** per-entry `custom` flags win for SAVE contents; the manifest earns its place for ASSETS (star-type and
planet-type images, starter models). Build it for the assets first and add the registries the hub named; do not
invent categories it did not ask for.

**The one rule that matters: a HAND-WRITTEN manifest is the hub's hardcoded list moved one repo over.** Generate it
from the real sources and PIN it. The repo already has the pattern: `scripts/starmap-build/build-starmaps.mjs`
writes `src/lib/generated/bundledArchiveHosts.mjs` (around its line 464) and `buildKit.spec.mjs` fails the suite
when the checked-in output no longer matches a fresh build. Do the same: a script that walks the true sources -
`static/images/star_types/` and `static/images/planet_types/` (and `STAR_IMAGE` in `src/lib/import/realsky/stars.mjs:8`,
which maps class to image), `static/models/nasa/`, the calendar registry in `src/lib/temporal/`, the tag categories in
`src/lib/tags/tagCategories.ts` / `tagDefaults.ts`, and the starter-sf rulepack files for gases/liquids/fuels when
you get to them - and writes ONE checked-in JSON under `static/` (name it once, e.g. `static/shipped-content.json`)
with `appVersion` from `package.json` and `bundleFormat` from `bundle.ts`. Pin it with a spec that regenerates in
memory and deep-equals the served file, so a new star image or a renamed calendar fails the suite until the manifest
is rebuilt (measure this red: add a throwaway file under `static/images/star_types/`, watch the spec fail, remove it).
Rebuild AFTER the version bump, because `appVersion` is stamped into it - the starmap kit taught that lesson twice.

**Report back to the hub:** the manifest's URL and its exact shape, with one real example, so the hub can replace
its hand-copied baselines with a fetch and delete them.

### Gates

Every new one seen RED with its law removed, with at least one absolute assertion (PHY-34): the allow-list spec
above; a spec that `?open=` and `?hub=` reach the SAME open function (pin the source: one `openHubBytes`-shaped
function, both callers name it); the manifest pin. The existing hub specs (`hubClip.spec.ts`, `hubFixture.spec.ts`,
`bundle.spec.ts`, `clipUndo.spec.ts`) stay green; do not loosen one to pass.

### Housekeeping

Own worktree off `origin/beta`; commit as FrunkQ <frunk@frunk.net>; `npm run build` green AND the full vitest suite
green before every push; bump the patch version every push; `git show --stat` before pushing. The two `tests/` fixtures are a
BASELINE `physics-baseline.test.ts` regenerates deterministically: if a run changes them, COMMIT them with your change
([[B137]] - restoring them kept a stale baseline for ten days); `src/lib/generated/exampleSystems.ts` churn is separate, leave it. The stash stack is SHARED across
every worktree and session on this machine: never bare `git stash`/`pop`; set work aside with a WIP commit. Update
the G57 row's status and the SSE-side requirements doc as you ship; claim any new board id at write time by checking
both the `| id |` and `[[id]]` forms. Report versions, what the hub must be told, and anything left undone.

## SEAM PROTOCOL — how the app and the Creator Hub stay one contract (2026-09-06)

**Why this exists.** The hub and the engine are two repositories with two agents, and the contract between them
drifted three times in one week: the hub's file still said "paste UI pending" a day after the engine shipped it;
the engine's copy of the requirements lacked R-17 until a brief told a stream to add it; and the rule that the
"Open in Star System Explorer" prefix goes to BETA first lived in nobody's file. None of that was a misunderstanding
of terms. It was two copies of one contract, and checks that no single-repo agent can run. The owner's instinct
(2026-09-06) was a bridge agent "in a very limited way"; this protocol is that bridge, made of two rules and one
episodic stream, so that nothing crosses the seam as a paraphrase.

**Rule 1 - two halves, two files, no paraphrase.** The ENGINE's half of the contract is
`docs/dev/hub-requirements-for-sse.md` in this repo: the hub's requirements banked verbatim, the coordinator's triage,
and the engine's `SSE-SIDE STATUS` report under each R-number it ships. The HUB's half is
`C:\Development\starsystemx-creator-hub\docs\sse-requirements.md`: the R-numbers as the hub wrote them and, under
each, what the hub has SET, CONSUMED and VERIFIED. Each side writes only its own half. Each side reads the other's
file directly - both repositories are on this machine and reading across is allowed both ways - and QUOTES it; a
status that has been retold is not a status. Neither side ever edits the other's repository: a push to the hub's
`main` is a deploy, and the hub's standing rule forbids editing the engine.

**Rule 2 - every shipped R-number is reported in one fixed block, pasted whole.** An engine stream that ships an
R-number ends its report with this block, and the hub agent pastes it unchanged under that R-number in its file;
a hub change to the contract goes the other way in the same shape, and the coordinator pastes it into the G57 row:

```
SEAM REPORT | R-17 | engine | beta v3.0.314 (21779f3e) | prod: RELEASED in v3.1.0, 2026-09-07
sets:      open_in_sse_url = https://beta.starsystemx.com/?open=
must know: the parameter is `open` on the query string, not the hash; explorers.starsystemx.com answers 404 from
           Vercel (DEPLOYMENT_NOT_FOUND) so download URLs must use the workers.dev origin until DNS moves; both
           hosts are already on the allow-list (TRUSTED_OPEN_HOSTS, src/lib/hub/hubConfig.ts:90)
verified:  walked in a browser against the live hub - no campaign: opens; a campaign: asks in the picker's words;
           refused host: plain message and no request; the parameter is stripped in every case
not done:  -
ready for: STREAM N N-1
```

The fields are fixed: `who | R-number | side | version (commit) | prod state`, then `sets` (config rows or URLs the
other side must set or use), `must know` (facts the other side would otherwise assume), `verified` (what was SEEN,
not what the code says), `not done`, and `ready for` naming the Stream N check it unlocks. Versions and URLs are
copied, never retyped from memory.

**The prod rule, stated once.** The engine's production is a read-tree release of beta on the owner's explicit
word. Nothing on either side points the hub at `https://starsystemx.com` for a feature until he has said the
release is made; until then the block says `prod: NOT RELEASED` and the hub's prefix stays on beta.

**Stream N.** The checks that need both products open at once are run by STREAM N below. It is fired by the OWNER,
never by a parent agent, when both halves of a check have said `ready for: STREAM N N-x`. It edits no product code
on either side and never pushes to the hub; its report is the artefact.

## STREAM N — the integration check across the seam (episodic; fired by the owner when a pair of halves has landed)

**What you are.** A short session that runs the checks no single-repo agent can: the ones that need the engine and
the hub open at the same time. You read both repositories, the SSE board (`docs/dev/observations-inbox.md`), both
halves of the contract (SEAM PROTOCOL above) and the latest SEAM REPORT blocks, drive a browser at both products,
and write ONE report in both dialects. You change no product code on either side, you never push to the hub
repository (a push is a deploy), and the only thing you commit is your report, in the engine repo, from your own
worktree off `origin/beta`, as FrunkQ <frunk@frunk.net>.

**Read first:** `CLAUDE.md`; the SEAM PROTOCOL section above; the [[G57]] row; `docs/dev/hub-requirements-for-sse.md`
(the engine's half, with Stream M's `SSE-SIDE STATUS` under R-13 and R-17); the hub's `docs/sse-requirements.md` and
`docs/handover-2026-09-06.md` (its standing rules and traps - the local hub dev server has no `platform.env`, so
the hub is verified LIVE at `https://starsystemx-creator-hub.orange-tree-847c.workers.dev`, version by
`curl -sI <host>/ | grep x-hub-version`). The engine is verified on beta (`https://beta.starsystemx.com`) or from a
worktree dev server registered in `C:\Development\.claude\launch.json` (the tool reads the PRIMARY working
directory's file). Fetch first: both trees move daily.

**N-1 - open a hub map from a link (R-17, engine beta v3.0.314).** Pass when ALL of these are seen, not read:
1. The hub's `open_in_sse_url` is set to the beta prefix and the "Open in Star System Explorer" control appears on a
   map page and on its card; the hub's version header says which build you are looking at.
2. The link the hub builds is `<prefix><percent-encoded download URL>`, with the parameter `open` on the QUERY
   STRING, and the download URL's host is one the engine's allow-list accepts (`TRUSTED_OPEN_HOSTS`,
   `src/lib/hub/hubConfig.ts:90`: the workers.dev origin and `explorers.starsystemx.com`; `*.pages.dev` by suffix).
3. `curl -sI https://explorers.starsystemx.com/api/download/local-neighbourhood`: report whether it still answers
   404 from Vercel (`DEPLOYMENT_NOT_FOUND`, measured 2026-09-06) or has moved to the Worker. Until it moves, the
   hub's links must carry the workers.dev download URL; if a link carries the explorers host while it is still
   dead, that is a FAIL with a plain cause, not a mystery.
4. With no campaign in the browser the map opens straight away; with a campaign open it asks in the picker's own
   words and the replaced campaign is one step back; a refused host shows a plain message and the network log
   shows NO request; the parameter is off the address bar in every case, including the refusal.
5. The opened map's provenance and attributions are what the bundle carries (the same door as a file import).

**N-2 - the credit chain (R-14 + R-16), when the owner has a map with a pasted clip to upload.** Pass when:
1. Copying a row on a hub map page puts a clip on the clipboard whose `source` carries `site`, `url` (a deep link
   with `#node=<id>`), `title`, `creator` and, for re-pasted content, `chain`.
2. Pasting it in the engine (the paste UI, v3.0.300+) lands the subtree with re-minted ids, the `origin/hub` tag,
   a `contentCredits` entry on the CAMPAIGN (title, creator, url, site, pastedAt, nodeIds, chain as received), and
   the `ATTRIBUTIONS.md` lines under "Content from other cartographers", with the lineage sentence for a chain.
3. Saved and uploaded to the hub, the new map's page reads "Includes work from <title> by <creator>" with the deep
   link, lists every cartographer in a chain, and the ORIGINAL map's page shows "Used in". The upload needs an
   account: the owner does that step, or lends a test account; you prepare the bundle and verify both pages.
4. `creator` absent (an older clip) credits title and url and says "cartographer not recorded".

**N-3 - the shipped-content manifest (R-13, engine beta v3.0.315).** Pass when:
1. `https://beta.starsystemx.com/shipped-content.json` answers with `Access-Control-Allow-Origin: *` and the keys
   `appVersion`, `bundleFormat`, `appAssetPrefixes`, `calendars`, `tagCategories`, `starterModels`, `appImages`,
   `gases`, `liquids`, `fuels`, and `appVersion` equals the version the app itself reports (the rail's brand click
   copies it; `package.json` on the deployed commit).
2. The hub has replaced its hand-copied baselines with a fetch of that file (the hub agent's work under R-13) and
   the copies are DELETED, not shadowed; a map page classifies an app star image and an app calendar as app content
   and a GM's own upload as the GM's.
3. The manifest unreachable (block it in the browser) degrades the hub page to a stated fallback, never a broken page.

**Your report** goes to `docs/dev/seam-reports/<yyyy-mm-dd>-N-<x>.md` in the engine repo, committed from your
worktree (docs only; bump the patch version and add a one-line changelog entry as every push does), in two
sections: **For the engine**, in SSE terms - board ids, versions, files, with a row filed on the board for every
FAIL (a B or A number claimed at write time by checking both `| id |` and `[[id]]` forms) - and **For the hub**, in
its terms - R-numbers, D-numbers to record, config rows to set - written so the hub agent can paste it under the
R-number unchanged. Every criterion above gets PASS or FAIL and one sentence of what was seen. End with a SEAM
REPORT block per R-number in the protocol's shape, side `stream N`. Housekeeping: `git show --stat` before pushing;
the stash stack is SHARED across every worktree and session - never bare `git stash`/`pop`; never tell the hub
prod carries anything until the owner has released it.

## STREAM O — a transit with the clock running must not be an edit per frame (B131)

**Read first, in this order:** `CLAUDE.md`; the standing rules at the foot of `docs/dev/observations-inbox.md`; the
[[B131]] row (the owner's report, the diagnostic's numbers and the chain, measured); `docs/dev/architecture-physics-tags-visuals.md`;
the comment block above `src/routes/+page.svelte:1337` (the same storm through the broadcast sink, and how that one sink
was fixed); the header comment of `src/lib/undo/systemUndo.ts` (what the recorder considers authored, and its silent
scope); engine-map PHY-1 and the rebuild-storm entries under RENDER (search the map for `sameRef`); `docs/dev/PLAYBOOK.md`.
The diagnostic itself is `../user-test-files/sse-load-diagnostic-2026-09-06T01-01-22.zip` - a user's campaign: read it,
never commit, bundle or publish it.

**The fault in one sentence.** A ship in transit re-stamps its state vector into its node on every animation frame
(`SystemView.svelte` `syncScheduledJourneysAtDisplayTime`, `:2031`, the 1e-9 AU comparison), that write is a campaign
store emission, and every sink downstream treats an emission as an authored edit: the undo recorder deep-clones the
system, the page writes the system back into the starmap, the autosave queue deep-clones the whole campaign and chains
an IndexedDB write per frame with no coalescing, the normaliser walks every system, the starmap recorder stringifies.
The autosave chain is where the memory sat: one full campaign per pending frame until the transit ended.

**The rule this stream serves.** A flight sample is DERIVED. Physics runs, the sampler answers from the journey plan
and the clock, and what it answers is a fact about NOW, not an edit to the campaign. The node needs a stamp only at a
TRANSITION - departure, arrival, docking, abort, heal - because the transition stamp plus the plan reproduce any
instant on reload; that is the derived-from-clock journey design already in force. Nothing per frame belongs in the
campaign document, in its undo history, in its autosave or in its broadcast snapshot.

**AMENDED 3.0.322 (coordinator):** part 2's persist queue (`src/lib/persistQueue.ts`, gated) and the recorder's per-frame
clone (flight-only machine writes skip the rebuild, gated in `systemUndo.silent.spec.ts`) are DONE. Part 1 (the
live-flight table) and the rest of part 2 (the write-back, the normaliser and the starmap recorder still run per
emission) remain yours; the store still emits once per frame during a transit, and that count is your gate.

### The job, in three parts, each gated

1. **Move the per-frame flight state out of the campaign store.** A transient `liveFlight` store (node id -> sampled
   position, velocity, state, sample time) written by the frame path and read by everything that draws or reports a
   moving ship: the 2D orrery, `holo/scene.ts`, `physics/worldPositions.ts` (vectors outrank orbit elements at render
   time - give it the live table as an input rather than the node's stamp), the broadcast (players advance on their own
   clock; the snapshot needs the TRANSITION stamp, not the frame), telemetry, the reports. The node's `vector_*` and
   `flight_state` are then written only at transitions, by the code that already handles them (`flightState.ts`,
   `reconcileConstructArrival`, the scheduler), inside the recorder's silent scope where they are machine writes.
   Measure before and after: with perf tracing on (Settings), count campaign-store emissions per second during a
   played transit. Before: one per frame. After: zero between transitions. Pin that count as a gate on a fixture.
2. **Harden the sinks so no machine write can ever storm them again.** `enqueueStarmapPersist` keeps ONE pending
   snapshot, cloned at persist time, coalescing every emission that arrives while a write is in flight; the undo
   recorder's silent path stops deep-cloning per emission (compute the shadow lazily when the next authored change is
   examined); the system-into-starmap write-back does not emit `starmapStore` when nothing but a machine field
   changed. Each is a small change with its own gate: queue length never exceeds one under a burst of a thousand
   emissions; `stripSystemForExport` is called zero times across a thousand silent emissions; the starmap store emits
   zero times for a flight-only write. Every gate seen RED on the current code first (PHY-34: absolute counts, not
   ratios).
3. **Do not reintroduce the parked-ship storm.** The comment inside the block at `:2100` records why a PARKED ship's
   sample must not be stamped (the player holo rebuilt twice a second forever). Keep that behaviour; the live table is
   for free-floating ships only, and a parked ship's orbit remains its description.

### What to check that no test can

Play a transit for five minutes on the diagnostic's campaign with the memory strip visible: it must stay flat, the
fans must stay quiet, and `bc.SYNC_STARMAP.skippedWhilePlaying` in a fresh diagnostic must stop climbing per frame.
Press undo during and after the transit: the GM's last authored edit must be what comes back. Open a player view in a
second browser: the ship must still move, attach and arrive as it does today (TAG-20: the player system view is HoloView
at both tiers). Say in the report what you saw, not what the code says.

### Housekeeping

Own worktree off `origin/beta`; commit as FrunkQ <frunk@frunk.net>; `npm run build` green AND the full vitest suite green
before every push; bump the patch version every push and run `npm run manifest` AFTER the bump (the shipped-content pin
fails otherwise, and its message says so); `git show --stat` before pushing. The two `tests/` fixtures and
`src/lib/generated/exampleSystems.ts` are a BASELINE - if a run changes the two `tests/` fixtures, COMMIT them with your change ([[B137]]); leave `exampleSystems.ts`. The stash stack is SHARED across every
worktree and session - never bare `git stash`/`pop`; set work aside with a WIP commit. Register your worktree in
`C:\Development\.claude\launch.json` to drive a browser. Claim any board id at write time by checking both the `| id |`
and `[[id]]` forms. Report versions, the emission counts before and after, and anything left undone.

## STREAM P — mega-constructs: what is settled, and what is next (G53 / G58 / G61 hand-over)

**WRITTEN BY THE MEGA SESSION, 2026-09-06, as a handover, in Stream L's shape.** That session ran from
v3.0.217 to v3.0.343 across the elevator, the exotics system and docking, and closed the owner's settled
list on the G53 row. Nothing below is owed; it is what the next stream starts from.

**THE OWNER'S CLOSE, 2026-09-06, verbatim:** *"I killed the death star decision - unless we can make that type of functionality into a better generalised system. I think we are in a good place for now - what we have works - and we can fix the rest later."* **So this stream is PAUSED, not open:** what is shipped
works and stays; everything under "settled by decision" and "the jobs" below is "later" - pick it up when THE
QUEUE reaches it, in the order given, and not before.

**Read first, in this order:** `CLAUDE.md`; the standing rules at the foot of `docs/dev/observations-inbox.md`;
the G53, G58 and G61 rows there (long, and they are the record); `docs/dev/authoring-exotics.md` (the agent
guide - its seam table is the ledger and every row now reads the record); `docs/dev/nonstandard-objects-design.md`
(why the system is shaped this way); `docs/dev/mega-constructs-design.md` §7c, §10 and §11; then the engine-map
entries named in the traps below.

### What is already done, and works (by CODE)

- **The exotics system (G58).** One `MegaTypeDef` record per type in `constructs/megaTypes.ts`; the vocabulary in
  `constructs/exotics.ts` (apparentG, flux, render3d, render2d, framing, docking); `exoticsParity.spec.ts` gates
  every record automatically. Consumers read the record - DATA-R33 - and no legacy flag or family test remains
  in a render or panel seam. The knob editor (`ConstructMegaTab.svelte`) renders every declared param; the sparse
  `megaParams` overlay resolves ONLY through `instanceMegaParams`.
- **Starlight occlusion (phase 4, PHY-36).** Bodies, zones (tilt-weighted band share), eclipse cadence, the
  `mega/shadowed-by` and `mega/eclipsed` tags with physics origin, the trace and the /physics page.
- **The space elevator.** Mast glyph; anchored on the equator (`anchorLatitudeDeg`); reach by the SATELLITE LAW
  (`rendering/scaleLaw.ts satelliteDrawDistance`, RENDER-S50 - one function for a moon, its ring, a station and a
  structure); drawn on the GM's 2D map (`render2d 'radial'`); unit parts laid out per frame (`tetherLayout`).
- **Docking, all seven types (RENDER-S51).** `capabilities.docking` = ladder / anywhere / point; `constructs/docking.ts`
  is pure; attachment is PROPAGATOR data (`walkPositions` attach pass - 2D = 3D = states by gate); a ladder structure
  stands on its own anchor ray; `TransitPlan.arrivalDock` + the planner's level destinations + the docking cost stated;
  the sampler parks the ship on the structure (a level below geo docks when its orbit CATCHES the ribbon); the
  reconciler stamps `attachedTo`; `getGlobalState` is attachment-aware (departures from a dock).
- **Arrival sense.** TRANSIT-8: a Hohmann's far-side velocity is -w (every orbit change used to park retrograde);
  at a beanstalk host the parking orbit is prograde on both paths, a reversal priced and tagged.
- **Apparent gravity from the record.** `constructs/apparentG.ts`: own-rotation NET OF THE HOST (zero at orbital
  rate), surface = the hull's own mass, none = nothing shown; the crew tab shows it for an exotic and writes no
  station-shaped default onto it.

### What is settled by DECISION (the owner's word, 2026-09-06 - do not reopen without him)

- The GEO hand-over is at arrival (a phasing model would close the last snap) - NOT scheduled.
- The interplanetary solver flies to the HOST at the level's radius, not to the moving dock - NOT scheduled.
  (A same-system origin could rendezvous with a synthetic `attachedTo` node via the construct-Rendezvous path;
  `needsRedirect` in `transit/calculator.ts` decides.)
- A ship docked to a plain station keeps the pre-existing Rendezvous path.
- Death Star carrying: KILLED as a feature (owner, 2026-09-06) - not bespoke, not scheduled. Only a GENERALISED
  carrier capability on the exotics record (a structure that docks what orbits it and releases it at its
  destination) could revive it, and that is a design question, not a job.
- The eyeballs (docking in the holo and player views; the elevator's reach, equator and dock-under-station in 3D)
  are accepted on the owner's word. The 2D radial and the 2D dock-under-station WERE seen live; the holo was not.

**Do not re-litigate any of that.** What follows is the queue's order (THE QUEUE, items 5-7).

### The jobs, in order

1. **Phase 5c - interiors (G56 §10), gated on G30 surface areas phases 1-2 (queue item 6).** A ringworld's or
   shell's habitable face gets the surface chain honestly; until then the honesty gate in design §10 says
   "not yet derived for a built world" rather than printing GM/r² of the ring's own mass.
2. **G61 - belts and rings onto the exotics mechanism.** The refactor-as-we-go job: a swarm-like member of the
   exotics pack (particles instead of a ring), same record shape; the board row measured 63 sites.
3. **Phase 5 - the hybrid flip** (`kind: 'body'` behind `showsAsConstruct`): answer §11 Q3 (redaction) FIRST; run
   `idempotence.test.ts` early; ship the surface-chain honesty gate in the same commit.
4. **Phase 6 - the catalogue widens** (Shkadov, soletta, Birch, aerostat): parameter sets on existing generators.
   The SOLETTA must land `flux.amplifies` AND the consumer change in one batch: `receivedLuminosityWatts`'s ≤1
   clamp learns the amplify case, red-first with a target receiving MORE than inverse-square.
5. §11 Q4 (should the generator ever PLACE one) and Q5 (tech level as a gate) - the owner's, when he wants them.

### The shape of it - the files

`constructs/exotics.ts` (vocabulary) · `constructs/megaTypes.ts` (records) · `constructs/megaGeometry.ts`
(one builder; `tetherLayout`, `equatorialAnchor`) · `constructs/docking.ts` (ports, anchor ray, attachment,
dock cost) · `constructs/apparentG.ts` · `constructs/megaPreview.ts` · `physics/starlightOcclusion.ts` ·
`physics/worldPositions.ts` (the attach pass) · `rendering/scaleLaw.ts` (the satellite law) · `holo/scene.ts`
(attach, per-frame layout in `updateSurfaceConstructs`, framing) · `components/SystemVisualizer.svelte`
(`isMegaRing` / `isMegaRadial` / `drawTetherRadial`) · `transit/scheduler.ts` (Docked branch, catch, reconciler) ·
`transit/calculator.ts` (`progradeSense`, `buildOrbitChangePlan`) · `components/TransitPlannerPanel.svelte`
(dock destinations) · `components/ConstructCrewTab.svelte` · `components/ConstructMegaTab.svelte`.

### Gates (all red-first; run `npx vitest run src/lib/constructs src/lib/transit src/lib/physics/worldPositions.docking.spec.ts`)

`exoticsParity.spec` · `megaDerive.spec` · `megaGeometry.spec` · `docking.spec` (physics anchors: 6.62 Earth radii,
1 g rim, ~0 at GEO) · `apparentG.spec` · `worldPositions.docking.spec` · `dockingArrival.spec` · `dockingCatch.spec`
· `dockedState.spec` · `arrivalSense.spec` · `orbitChangeSense.spec` · `scaleLaw.spec` (the satellite law) ·
`starlightOcclusion` specs. Then `npm run build`, a scoped `npx svelte-check --threshold error` grepped for every
file you touched (RENDER-S46: the build never typechecks), and `npm run manifest` after EVERY version bump.

### The traps roster (read before, not after)

DATA-R31 · DATA-R33 · UI-B2 · RENDER-S2 · RENDER-S44 · RENDER-S45 · RENDER-S46 · RENDER-S48 (+ its correction) ·
RENDER-S50 · RENDER-S51 (+ addendum) · PHY-36 · TRANSIT-8 · E7 (the canvas cannot be verified headlessly) · the CRLF
trap (measure each file's own ending; this briefs file is LF) · the shared stash stack (WIP commits, never
bare stash/pop) · a conflict resolver must ASSERT before it writes and the marker check must GATE the add · never
join a push chain with `;` · both changelog entries share a heading when two streams bump to the same number
(git leaves the heading OUTSIDE the block - lift yours under a new heading above theirs).

### Housekeeping

Worktree `C:\Development\star-system-explorer-v2\sse2-mega2` (branch `wt/mega2`); dev server entry
`sse-mega2-dev` (port 5299) in `C:\Development\.claude\launch.json`; a headless Browser-pane run at ~1 fps
can drive the 2D orrery but not usefully the holo - the holo eyeballs are the owner's.

## THE QUEUE — what is next, in order (coordinator 7, 2026-09-06 evening, on the owner's "line up what you think should be next")

The site-to-app loop is nearly closed: the hub is live at `explorers.starsystemx.com`, its "Open in Star System Explorer" button
works, the manifest is consumed, the paste target and credit chain are built. What keeps it from closing is that PRODUCTION is at
v3.0.286 and everything the loop needs is on beta. So the order is:

1. **A production release of beta (the owner's word; the coordinator runs the read-tree recipe).** It ships R-14/R-16/R-17 so the
   hub can point its button at `https://starsystemx.com/?open=`, plus B117 (construct export/import), the size comparison, docking,
   the Am parsing, the transit sinks, the disarmed keep-a-copy notice. BEFORE it: the "what is sitting on a branch?" sweep, and the
   owner's eyeball list (docking in the holo and player views; the elevator in 3D; the size comparison under a CRT warp). AFTER it:
   the hub sets the production prefix; the `sse-prod-hotfix` worktree's unpushed B117 commit is deleted as moot.
2. **Stream N, check N-2 (the credit chain end to end).** Needs the owner's account to upload a map with a pasted clip. The last seam
   check; N-1 and N-3 are done.
3. ~~Stream O~~ CLOSED 2026-09-06 on the owner's word: the sinks fixed the storm, the per-frame emission is bounded and
   deliberately left. In its place: **Stream Q** (jets on the 2D orrery, G77) and **Stream R** (kill the DOM render surface, G78),
   both briefed below, both small and self-contained.
4. **Stream I (the documentation sweep, as an audit).** Queued since 31 August; three weeks of streams since. Runs in parallel with
   the release prep; its output is what users read on the released version.
5. **Mega-constructs, Stream P (hand-over).** The mega session writes its own successor brief while it has room, in Stream L's
   shape: what is settled by code and what by decision, then phase 5c (interiors), which is gated on item 6. Carrying is not a
   requirement (see the G53 row).
6. **G30 surface areas, phases 1 and 2.** Spec complete, no design pass owed; unlocks 5c.
7. **G61 belts and rings onto the exotics mechanism.** The refactor-as-we-go job, now that the two exotics decisions are settled.
8. **The physics hygiene batch:** A86, B90/B91, B110's four solar luminosities, B121's two solar radii, B54's third star-colour path.
9. **The owner's own list:** the Discord bot on the hub; the dated watch item in `C:\Development\INFRASTRUCTURE.md` for 2026-10-05
   (four subdomains ride a wildcard certificate that can no longer renew after the zone move); disconnect the failing Cloudflare
   build of the SSE repo if it is still connected.

Not scheduled and not forgotten: G65 (full MK designations from physics), G60/G59 (the edit-UI design languages, banked), the UI
leftovers A87/A52/A58, and B99's statistical rarity-dial flake (whoever owns generation).

## STREAM Q — polar jets and the shed shell on the 2D orrery, drawn from ONE geometry (G77)

**Read first:** `CLAUDE.md`; the standing rules at the foot of `docs/dev/observations-inbox.md`; the [[G77]] row (what was
measured, and the 3D half already done); engine-map RENDER-S53 (one body-look assembly), RENDER-S27 (a starmap glyph is a screen
quantity), RENDER-S25 (one channel per pixel factor); `docs/dev/architecture-physics-tags-visuals.md`; `docs/dev/PLAYBOOK.md`.

**The state.** One physics source, `src/lib/physics/stellarOutflows.ts` (`jetStrength(tags)`, `sheddingStrength(tags)`, each 0/1/2
from the `stellar/jets` and `stellar/shedding` tags). The 2D starmap draws both as SVG in `src/lib/components/Starmap.svelte`
(lines 1619-1650 at v3.0.341: a ring for the shell, two bowtie polygons for the jet - sheath and core - with the numbers inline:
length `r * (3 | 4)`, base half-width `0.14 r`, tip half-widths `0.62 | 0.8` and `0.25 | 0.32`, the core at `0.95` of the length). The
3D surfaces all get them from the one assembly since v3.0.346. The 2D ORRERY does not: `src/lib/components/SystemVisualizer.svelte` is a
canvas renderer (343 context calls, no SVG) that draws the star at its `roleHint === 'star'` site near line 1390 and reads no outflow
tag anywhere.

**The job, and the rule it serves.** Draw the jet and the shell on the orrery's star from the SAME numbers, and do it without a second
drawing of the same thing. The starmap's inline numbers are the geometry; move them into ONE pure function in the glyph law
(`src/lib/starmap/starGlyphLaw.ts`, where `sizeBandOf` and `floorGlyphGain` already live): `starOutflowGlyph(r, jets, shedding)` returning
the shell radius and stroke, and the sheath and core polygons as point lists in glyph units. Then TWO painters read it: the starmap
builds its SVG `points` strings from the lists, and the visualizer paints the same lists as canvas paths at the star's drawn radius, with
the same additive look (a cyan-white core inside a soft sheath, fading along the beam - the starmap's CSS classes `star-jet` and
`star-jet-sheath` say how). Colour follows the star's colour as the starmap's does. The jet scales with the star's DRAWN radius on each
surface (`minRadiusPx` rules at `:817`/`:903` apply to the star; the jet rides that radius), and the culling radius at `:1379` must grow
to include the jet length or it will pop at the viewport edge.

**The convention, stated so nobody "fixes" it:** every renderer draws the jet as an upright, screen-space GLYPH - the holo's is a
billboard sprite, the starmap's is a vertical bowtie - not a projection of the star's spin axis. A plan view looking down the axis
would see a jet end-on; the glyph says "this object jets" the way the map does. An axis-true cone in the holo is a separate item.

**Gates, red first:** the geometry function pinned with absolute numbers for jets 1 and 2 and shedding 1 and 2 (PHY-34); a source pin
that `Starmap.svelte` no longer carries the inline `r * 0.14`-style numbers and calls the law; a source pin that `SystemVisualizer.svelte`
calls the law at its star site; a canvas-call recording (the jsdom canvas Proxy in `src/setup.ts`) that a star tagged `stellar/jets`
paints the polygons and an untagged one does not.

**Eyeball for the owner:** a pulsar or an active black hole in the 2D system view shows the same bowtie as its starmap glyph, at
the same proportion, in the star's colour; Sol shows nothing.

**Housekeeping:** own worktree off `origin/beta`; commit as FrunkQ <frunk@frunk.net>; full suite and `npm run build` green before every
push; bump the patch version and run `npm run manifest` AFTER it; `git show --stat` before pushing; if a run changes the two `tests/`
fixtures they are a baseline - commit them with your change ([[B137]]); the stash stack is SHARED - WIP commits, never bare stash/pop.

## STREAM R — kill the DOM render surface: `FilterFrame` and `cssFilterApprox` are deleted and gated out (G78)

**Read first:** `CLAUDE.md`; the standing rules at the foot of `docs/dev/observations-inbox.md`; the [[G78]] row (the measured
consumer list); engine-map RENDER-S54 (the corrected entry, which already calls the approximation the interim); [[B126]] and
[[A39]]; `docs/dev/v2.2-player-view-visual-overhaul.md` section 7 (the 2026-07-18 decision); `holo/filteredCanvas.ts` (the real chain over
a static canvas, with `warpPoint`); the holo's HUD-quad composite of its info card and overlay in `holo/scene.ts` (search `hudOverlayOn`
in `routes/catalogue/+page.svelte` for the switch); `docs/dev/PLAYBOOK.md`.

**Why now.** The DOM surface survived the decision that retired it because every new stage reached for it: B126 did so twice in one
day. The only way an interim dies is to delete it and pin the deletion. At v3.0.341 its remaining consumers are exactly: the preset's
overlay graphic at three catalogue mounts (`routes/catalogue/+page.svelte:1321`, `:1366`, `:1470`), the `.inspector` approximation for
non-holo stages (`inspFx`, `:792`), and the preset editor's previews of the cover view and the two overlays
(`PlayerPresetEditor.svelte:1246`, `:1268`, `:1366`, `:1373`). Everything else already renders into a surface the real shader reaches.

**The job, in order, each step gated:**
1. **The gate first, seen red.** A source scan in the shape of `src/lib/ui/foregroundContract.spec.ts` that refuses `FilterFrame`,
   `cssFilterApprox` and `inspFx` anywhere under `src/`. Red against the seven imports on day one; green means the surface is dead.
2. **The overlay becomes a quad in every stage's rendered surface.** The holo already composites its overlay as a HUD quad when
   `hudOverlayOn`; make that the ONLY path for the holo, and give the starmap stage, the 2D orrery stage and the size comparison the
   same: the `GraphicLayer` image drawn into the stage's filtered canvas (`createFilteredCanvas` for the static stages; the
   comparison's own chain) before the shader pass, so it warps WITH the picture. One placement law (`GraphicLayer`'s placement maths)
   feeds all of them - do not re-derive it per stage.
3. **The cover view is drawn to a canvas and composited**, the info card's own recipe (draw the static card to a canvas, composite,
   run the chain). The DOM `CoverView` remains only as the un-filtered rendering, if a preset is explicitly un-filtered.
4. **The preset editor's previews use the same code as the live stages** - the B126 lesson: both mounts change together or the
   preview lies. Pin it: a spec that both pass the same `filterId` through the same path.
5. **Delete** `components/FilterFrame.svelte` and `player/cssFilterApprox.ts`, remove `inspFx`, correct RENDER-S54 to say the interim
   is gone and the gate holds it gone, and update section 7's status line.

**Eyeball for the owner:** a CRT preset with warp on each stage - starmap, 2D system, holo, document, size comparison - with an
overlay set: the overlay bends with the picture on every one, and the preview in the editor matches the live view.

**Housekeeping:** as Stream Q's, word for word.

## STREAM S — floating chrome as a system: the time display floats, a GM chooses an edge, controls dock (G81)

> You are giving the GM "total flex" over the floating chrome on the canvas — [[G81]], on top of [[A98]], which
> shipped v3.0.360. Repo `C:\Development\star-system-explorer-v2\star-system-generator`, branch `beta` (fetch the
> tip; several streams push daily, renumber on collision). Work in your OWN worktree (`git worktree add
> ../sse2-floating-chrome -b wt/floating-chrome origin/beta`); the main checkout is shared. Commit as
> **FrunkQ <frunk@frunk.net>**, never ac@epsis.com.
>
> **READ FIRST.** `CLAUDE.md`; the STANDING RULES at the foot of `docs/dev/observations-inbox.md`; the [[A98]] and
> [[G81]] rows; engine map **UI-C17** (the edge-gap model and its BLAST list - read it before touching `settle`),
> **UI-C6** (a floating control marks itself `use:chrome`, never `use:foreground`) and **UI-C16** (pointer capture
> on a container kills the buttons inside it); `src/lib/ui/floatingControl.ts` with its spec.
>
> **THE OWNER'S WORDS (2026-09-06/07):** *"Maybe even give the time display the same treatment - to give gm total
> flex. To help with different types of screens - pin them to a screen edge which it moves with... and allow them
> to be pinned together. This allow user display customisation - saved locally with PC."*
>
> **WHAT IS ALREADY TRUE, so you do not rebuild it:** one behaviour module serves three hosts (the body picker, the
> time transport, the undo pill). Every control is bounded by the box that clips it, remembers its gap from its
> NEAREST edge and moves with that edge when the box changes shape; the lock is a drag handle; the undo pill has a
> width handle. All of it lives in localStorage per control, never in the campaign file - that IS the owner's
> "saved locally with PC", and it stays that way.
>
> **THE JOBS, in order, each its own commit and push:**
> 1. **The time DISPLAY floats.** `.time-display-overlay` (`SystemView.svelte` ~2719 and `Starmap.svelte` ~1340,
>    fixed top-left) becomes the fourth host: grip on the left, lock on the right. The module's puck/strip
>    semantics are NOT wanted here (it is a read-out, always shown) - mirror the undo pill: `open: true, pinned:
>    true`, `FloatGrip always`. One storage key shared by both mounts, as the picker does.
> 2. **An explicit edge.** The nearest-edge guess is right at the sides and wrong in the middle of a wide screen.
>    Offer the choice on the lock (right-click or long-press): Left / Right / Top / Bottom / Nearest. It writes
>    `ex`/`ey` and marks them chosen so `settle` stops re-reading that axis. DATA, not branches: the menu is one
>    list, the pinned axis one flag per axis.
> 3. **Docking.** Two controls "pinned together" move as one and settle as one box. Design it as a GROUP stored
>    per control (`dock: <groupId>`), not as parent/child; the group's box is the union of its members' rects and
>    settles against the stage as ONE; one grip moves all. Gesture: drop a control's grip within 12 px of
>    another's edge and it snaps and docks; drag it more than 24 px away and it undocks; say so in the tooltip.
>    Measure the existing `set`/`settle` flow before adding a group layer - the per-frame drag must not fight
>    itself (UI-C17 BLAST).
>
> **GATES, red-first, every one absolute in pixels:** the time display clamps inside `.main-view` and keeps its
> edge gap (a host gains no module logic - extend `floatingControl.spec.ts` only if the module changes); the
> explicit edge overrides the nearest-edge re-read; a docked pair moves together by exactly the drag delta and
> settles as one box against a narrowed stage; undocking restores independent settling.
>
> **TRAPS:** CRLF everywhere (measure each file's own ending; Python bytes, never `sed -i` on MSYS, which rewrites
> CRLF as LF); `npm run manifest` after every version bump; the two `tests/` fixtures are a baseline - commit them
> if a run changes them; the stash stack is shared - WIP commits, never bare stash/pop; claim ids in both forms;
> B99's rarity-dial test is a known statistical flake, green alone is the accepted form.
>
> **EYEBALL FOR THE OWNER (a canvas cannot be verified headlessly - hand back the list):** on a phone-width window
> the time display, transport, picker and undo pill all stay reachable and none sits under the rail or the bottom
> bar; dock the transport to the time display and drag the pair; open the detail pane and watch a right-pinned
> pair move with the edge.
>
> **Housekeeping:** as Stream Q's, word for word.

## STREAM T — magnetospheres, drawn from the physics the engine already has (G82)

> You are drawing MAGNETIC FIELDS for Star System Explorer — [[G82]]. Repo
> `C:\Development\star-system-explorer-v2\star-system-generator`, branch `beta` (fetch the tip; several streams push
> daily, renumber on collision). Work in your OWN worktree (`git worktree add ../sse2-magnetospheres -b
> wt/magnetospheres origin/beta`); the main checkout is shared. Commit as **FrunkQ <frunk@frunk.net>**, never
> ac@epsis.com.
>
> **READ FIRST.** `CLAUDE.md`; the STANDING RULES at the foot of `docs/dev/observations-inbox.md` - especially
> physics-drives-tags-drives-visuals, scattered constants are DATA, check against every anchor and fit to none,
> "a quantity correct for its purpose can still be published as a lie" (say WHAT, WHERE, UNITS), and "nothing may
> read a value a later pass writes" (`src/lib/system/idempotence.test.ts` enforces it); the [[G82]] row (the owner's
> words and the accepted design); engine map **PHY-34** (an absolute anchor in every gate, never a ratio alone),
> **RENDER-S53** (ONE body-look assembly for the holo, the gallery and the size comparison), **RENDER-S52** (true
> scale binds no size law), **UI-C6** (a floating control marks itself `use:chrome`); the [[B17]], [[B22]], [[B27]]
> and [[B28]] rows (the belt model and the tags that lied beside it).
>
> **THE OWNER'S WORDS (2026-09-07):** *"sounds like we have all the machinery in place - so not hard - mauve/purple/
> lilac is the colour palette for magnetic fields so far (eg magnetars). We will have to have an option to turn
> them on and off in player view setup too (default off) - controls under the belts and other turn on/off options.
> But yeah I see it as another option like Hill Sphere/Zones in the GM view... if enabled it is honoured whenever
> 3d images are shown and hidden in Low Power mode."*
>
> **WHAT THE ENGINE ALREADY HAS (verified at v3.0.361 - re-verify line numbers, the tree moves daily):**
> - `src/lib/physics/magnetism.ts` - `deriveMagnetism` publishes `magnetism.source`, `.geometry` (the WORD:
>   dipolar / tilted / off-centre / multipolar / induced), `.nominalGauss`, `.estimatedRangeGauss`;
>   `magneticShieldingTag` emits `magnetic/dynamo|induced|tenuous|unshielded|anomalous` (`TENUOUS_GAUSS` = 0.05).
>   Types at `src/lib/types.ts:202-232`; `axial_tilt_deg` at `:667`; the signed `rotation_period_hours`.
> - `src/lib/core/SystemProcessor.ts:1088-1100` - `insideHostMagnetosphere` is a THRESHOLD (host > 50 Earth masses,
>   or gassy, or ≥ 1 G), not a distance, and the pass iterates parent before child. Your standoff replaces the
>   threshold with a distance: a moon is inside the host's bubble when its orbit radius < the host's standoff.
> - `src/lib/physics/radiation.ts` ~195-235 - the belt law `dose(r) = D0·(B/B_ref)²·(Ω/Ω_ref)·exp(−r/λ)` with
>   `λ = λ_ref·(B/B_ref)^(1/3)`, constants from the pack's `generation_parameters` (`beltConstants`, read from
>   `static/rulepacks/starter-sf/generation.json`); `:417-424` `radiationShieldingMag` = min(0.99, (log10(B+0.01)+2)/3).
>   DO NOT re-derive the belt: read its constants for the belt torus's peak and scale.
> - `src/lib/physics/aurora.ts` - `auroraStrength` from pressure × `radiationShieldingMag` × flux; per-gas bands.
> - `src/lib/physics/ionisingOutput.ts` - `hasHotCorona` (:176), `magneticFluxRelative` (:181), `ionisingFromField`
>   (:192), `saturationFieldGauss` (:237): the star side's activity and wind character.
> - Renderers: `src/lib/holo/bodyLook.ts:175 buildBodyLook` is the ONE look for the holo (`scene.ts:4300/4379`),
>   the gallery (`galleryScene.ts:122`) and the size comparison (`comparisonScene.ts:276`) - a feature added there
>   is on every 3D surface at once, which is the owner's "honoured whenever 3d images are shown".
>   `bodyLook.ts:313-316` chooses the aurora source; `holo/bodyFeatures.ts:779-830` builds the aurora shell and
>   `:795` fixes its ring centres at 0.15/0.85 of the texture - that is the line your oval colatitude replaces.
>   `scene.ts:4423` is the axial-tilt quaternion the spin group carries: the dipole axis lives IN that group.
>   `scene.ts:167/844 setAuroras` and `holo/HoloView.svelte:109 controller.setAuroras(drawsHeavy(s.auroras,
>   $lowPower))` with `src/lib/lowPowerStore.ts:68 drawsHeavy` - copy this shape exactly for `setMagnetospheres`;
>   it is what hides the feature in Low Power ([[G80]]).
> - 2D: `src/lib/components/SystemVisualizer.svelte:51 showHillSpheres`, drawn at `~1560-1575` through
>   `drawnRadiusAu` (the minimum-radius discipline that keeps a bubble visible at astronomical zoom) from
>   `physics/twoBodyCoast.ts:247 hillSpheresAu`; the GM View popover at `SystemView.svelte:2755-2775`
>   (state `:265`), broadcast to player views in `SYNC_VIEW_SETTINGS` (`SystemView.svelte:1985`,
>   `broadcast.ts:14` - optional fields, older senders omit them).
> - Player presets: `src/lib/player/presetTypes.ts:213 auroras`, `presets.ts:329`, the editor checkbox at
>   `PlayerPresetEditor.svelte:906` under "Belts & rings" - the new `magnetospheres` checkbox goes beside it,
>   DEFAULT OFF (an absent field is false, unlike `atmospheres`).
> - Colour: `src/lib/styles/tokens.css:141 --star-magnetar: #800080` and `rendering/colors.ts:29` are the
>   existing purple; add the field tokens beside them (mauve for the cage, lilac for the belts, the magnetar
>   purple for an anomalous field) - tokens are DATA, never hex in a renderer.
> - The card: `BodyAtmosphereTab.svelte:498-529` (the reading and the implied range), `catalogue/bodyFacts.ts:420`;
>   the physics page `src/routes/physics/+page.svelte:894 <section id="magnetism">`.
>
> **THE DESIGN (accepted on the G82 row; do not re-litigate, do measure):** one dimensionless number sets the
> shape - the standoff in body radii, `R_mp/R = (B² / (2 μ0 P_wind))^(1/6)` with B the equatorial surface field
> and `P_wind` the wind ram pressure at the body: a pack reference pressure at 1 AU (Sol ≈ 2 nPa), scaled by the
> star's activity/ionising fraction and by 1/d², summed over the system's stars. The tail is ~20 standoffs; the
> nose is a paraboloid. The geometry WORD becomes numbers from a pack table: dipolar ≈ 10° tilt, 0 offset;
> tilted/off-centre ≈ 50-60° and 0.3-0.5 R offset (Uranus 59°/0.3 R, Neptune 47°/0.55 R); multipolar = no
> single axis. The aurora oval's colatitude follows the standoff (`sin²θ = 1/L_open`, L_open ≈ standoff): Earth
> ~67° latitude, Jupiter within ~15° of the pole. Induced fields have no bubble of their own - the nose faces
> the host's corotating plasma. A star's bubble is its ASTROSPHERE: wind ram pressure against an interstellar
> pressure (one pack number), Sol 100-130 AU. The tilt's LONGITUDE is unobservable: seed it from the body id
> and say so on the physics page. Estimates are labelled estimates. A GM's pinned 70 T field gets its enormous
> bubble and a note - steer, never stop.
>
> **THE JOBS, in order, each its own commit and push to beta:**
> 1. **Publish the numbers.** `src/lib/physics/magnetosphere.ts`: per body `magnetosphere: { shape: 'none' |
>    'tenuous' | 'bubble' | 'induced', standoffRadii, tailRadii, dipoleTiltDeg, dipoleOffsetRadii, ovalColatDeg,
>    beltPeakRadii?, upstream: 'star' | 'host' }`, and per star `astrosphereAu`. Runs AFTER magnetism and reads
>    only what earlier passes wrote (field, luminosity, the star's activity) - NEVER `totalIncidentFlux`, which
>    radiation writes later; the idempotence test is the gate for that. Constants in the pack
>    (`generation_parameters`: `wind_ref_pressure_npa_at_1au`, `ism_pressure_pa`, the tilt/offset table per
>    geometry word), read the way `beltConstants` reads its own. Replace the `insideHostMagnetosphere` threshold
>    with the distance test. Gates, absolute (PHY-34): Mercury 1.4-1.6 R, Earth 9-11 R, Saturn 18-25 R, Jupiter
>    45-90 R, Sol's astrosphere 100-130 AU, Earth's oval 65-72° latitude, Jupiter's 72-78°; every one seen red
>    with the law replaced by a constant. The card shows standoff, tail and tilt with UNITS; the physics page's
>    magnetism section gains the standoff law and the two honesty notes; a Documentation-debt line.
> 2. **The 2D overlay.** A `Magnetospheres` checkbox beside Hill spheres in the GM View popover, carried in
>    `SYNC_VIEW_SETTINGS` as an optional field; `SystemVisualizer` draws a shaded teardrop per body with a
>    bubble - nose toward the upstream source at the standoff, width ~2 standoffs, tail ~20 - through the same
>    `drawnRadiusAu` floor the Hill bubble uses, mauve at the Hill bubble's alpha; tenuous draws a faint nose
>    only; induced a small bubble facing its host; unshielded nothing. The star's astrosphere is an unfilled
>    line like the star's Hill limit, labelled. Gate: the teardrop's nose and tail in canvas px for Earth at a
>    fixed zoom, absolute. Declarative enough to verify headlessly? No - it is a canvas: hand back the eyeball.
> 3. **The aurora ovals onto the dipole.** `bodyFeatures.ts:795` takes its ring centre from `ovalColatDeg`; the
>    shell sits in the spin group so it tilts with the dipole axis (job 4 adds the axis; here the oval moves to
>    the right latitude). Gate: the texture's ring centre for Earth and Jupiter, absolute.
> 4. **The 3D cage, on every 3D surface at once.** `buildBodyLook` gains a `magnetosphere` feature (add it to the
>    FEATURE-INVENTORY spec that guards RENDER-S53): a translucent line cage of dipole L-shells (1.5 R to the
>    standoff, a handful of shells, a dozen meridians), each line clipped by the nose paraboloid and swept into
>    the tail along the upstream direction (the star's direction in the holo; −x in the gallery and the size
>    comparison, which have no star); the dipole axis in the spin group, tilted by `dipoleTiltDeg` about a
>    seeded longitude and offset by `dipoleOffsetRadii`, so Uranus's field tumbles once a day; belts as a faint
>    lilac torus at the belt peak, alpha from the dose; multipolar drawn as a disordered bundle. Colour from the
>    tokens by tag: dynamo mauve, induced dim lilac, anomalous the magnetar purple. `setMagnetospheres(on)` on
>    the controller as `setAuroras` is; `HoloView.svelte` gates it with `drawsHeavy(s.magnetospheres, $lowPower)`;
>    the preset field `magnetospheres?: boolean`, DEFAULT OFF, its checkbox beside Auroras; the GM holo follows
>    the GM View checkbox. Budget: a few hundred segments per bubble, only for bodies in the region of
>    interest; measure a frame with ten bubbles before and after (the [[G69]] frame-rate guard must not fire on
>    Sol with the option on).
> 5. **The astrosphere in 3D** (optional, last): a faint mauve shell at `astrosphereAu` at the system's
>    outermost scale, unfilled, honouring the same switch.
>
> **TRAPS:** a canvas cannot be verified headlessly ([[E7]]) - reproduce the transform in a script and compare
> NUMBERS, then hand back a thirty-second list; CRLF everywhere (measure each file's own ending; Python bytes,
> never `sed -i` on MSYS); `npm run manifest` after every version bump; the two `tests/` fixtures are a baseline
> - job 1 WILL change them (a new derived block on every body) and you commit them with the change ([[B137]]);
> the stash stack is shared - WIP commits, never bare stash/pop; claim ids in both forms; B99's rarity-dial
> test is a known statistical flake, green alone is the accepted form; `broadcastContract.spec.ts` guards the
> player payload - extend the contract, do not dodge it.
>
> **EYEBALL FOR THE OWNER:** Earth's bubble ten radii out with a tail; Jupiter's vast; Saturn's between;
> Mercury a nose only; Uranus tumbling; Europa a small bubble facing Jupiter, not the Sun; the 2D teardrops
> pointing at the star at every zoom; a player view with the option off shows nothing, on shows the cage on
> the holo AND the size comparison, and Low Power hides it again; the CRT warp bends the cage with the picture.
>
> **Housekeeping:** as Stream Q's, word for word.

**AMENDED 2026-09-07 late by coordinator 8, AFTER the stream started (job 1 landed as v3.0.370) - so the running
session must be TOLD, not expected to re-read: a job before the wind pressure, [[B145]].** Your wind pressure scales
with the star's ACTIVITY, and for a compact remnant that activity is a FLARE verdict (`stellar-evolution.ts
flareActivity`: an isolated neutron star or white dwarf is deliberately quiet; a magnetar 0.9; a fed hole from its
Eddington fraction) fed through a main-sequence CORONAL fraction (`ionisingOutput.ts ionisingFraction`, the quiet
Sun's 1e-7 of bolometric up to 1e-3 saturated). A 600,000 K photosphere is not a corona: nearly all of its light
is above the hydrogen edge, so its ionising fraction is close to 1, the card's `1.00e-4 × Sun` is low by up to
seven decades, the UV kill zone follows it, and your wind for a remnant would too. THE JOB: for the NAMED remnant
classes (`star/NS`, `star/WD`, `star/magnetar`, `star/BH`), derive the ionising fraction from the photospheric
temperature - the Planck fraction above 13.6 eV, one function, anchored (Sun unchanged; 6e5 K neutron star near
1; 1e4 K white dwarf a few per cent; a 30,000 K O star's thermal fraction real but its corona still the soft-X-ray
source) - keep the flare verdict as the flare verdict, and let the wind for a remnant read the thermal figure.
Red-first, absolute (PHY-34). Then take the 'coronal model, not the surface' note off the card's ionising cell
(`BodyTechnicalDetails.svelte`, `starIonisingNote`) in the same push.

## STREAM U — the real-sky importer: the masses and radii it drops, and the companions it loses (D29)

> You are fixing the REAL-SKY IMPORTER for Star System Explorer — [[D29]], the owner's own report off the live
> 3.1.0 release. Repo `C:\Development\star-system-explorer-v2\star-system-generator`, branch `beta` (fetch the
> tip; several streams push daily, renumber on collision). Work in your OWN worktree (`git worktree add
> ../sse2-realsky -b wt/realsky origin/beta`); the main checkout is shared. Commit as **FrunkQ
> <frunk@frunk.net>**, never ac@epsis.com.
>
> **READ FIRST.** `CLAUDE.md`; the STANDING RULES at the foot of `docs/dev/observations-inbox.md` — especially
> NEVER ASSUME AN EARTH/SOL BASELINE, STEER DON'T STOP (an authored map is never silently corrected), and
> DUPLICATED FUNCTIONALITY; the [[D29]] row (the owner's words and the coordinator's probe); the rows folded in
> with it — [[D18]], [[D25]], [[D28]]; engine map **PHY-34** (every gate absolute, seen red first) and the
> `import/realsky` entries you find by grepping the traps file for your territory.
>
> **THE OWNER'S WORDS (2026-09-08):** *"the importer still not adding the radii or masses for real stars, also
> its still adding binaries as single or 2 stars (examples: sirius (only adds b) completely forgets luhman 16
> and eps indi Ab's partner)"*.
>
> **WHAT THE COORDINATOR ALREADY MEASURED — do not re-derive it, do verify it:**
> - `SIMBAD_STAR_COLUMNS` at `src/lib/import/realsky/query.mjs:177` is
>   `['main_id', 'ra', 'dec', 'plx_value', 'sp_type', 'otype']`. **There is no mass, radius or temperature
>   column in any of the three SELECTs (`:105`, `:137`, `:158`).** The importer cannot be carrying measured
>   sizes, because it never asks for them.
> - `src/lib/import/realsky/stardefaults.ts` opens with *"The catalogues give a star's mass, radius,
>   temperature and luminosity; they do NOT give its magnetic field or spin-axis tilt"* and fills only the
>   field and the tilt. **The gap-filler believes the gaps are filled.** That sentence is the bug's
>   documentation, and it must end up either true or rewritten.
> - Every star query carries `plx_value > 0` (`:137`, `:160`, `:184`). A SIMBAD companion often has no
>   parallax row of its own. That one clause would drop precisely the member the owner is missing —
>   SUSPECTED, NOT PROVEN, and proving it is job 1.
> - `convert.mjs` ~325-370 holds the multiples logic already: the [[D28]] one-object-two-catalogues merge,
>   `WIDE_COMPANION_MIN_AU = 50`, and "the heaviest star is the root; companions orbit it".
>
> **THE JOBS, in order, each its own commit and push:**
> 1. **Measure the three named systems before changing anything.** Sirius (A lost, B kept), Luhman 16 (absent
>    entirely), Epsilon Indi (the B/C brown-dwarf pair absent). Capture the actual catalogue rows each query
>    returns — the raw response, not your reading of it — and say for each system WHICH clause dropped WHICH
>    row. The coordinator's `plx_value` suspicion is a hypothesis; record it as confirmed or as a dead end,
>    loudly either way. Sirius keeping the FAINTER member is the sharpest clue you have: whatever orders or
>    de-duplicates rows prefers B over A, and that is not a parallax story.
> 2. **Fetch the sizes.** Add the mass/radius/temperature columns SIMBAD actually exposes to the query and
>    carry them through `convert.mjs` into `massKg`/`radiusKm`/`temperatureK`, measured values winning over
>    the class-band fill-in (`stardefaults.ts` already states that precedence — honour it). Where a catalogue
>    has no value the band fill-in stays, and the body should be able to SAY which it is: a GM reading Sirius
>    should get Sirius's real radius, and a GM reading an obscure dwarf should not be told a band value is a
>    measurement (the "a quantity correct for its purpose can still be published as a lie" rule). Correct
>    `stardefaults.ts`'s opening paragraph in the same commit.
> 3. **Multiples arrive whole.** Every member of a system the query reaches comes in, orbiting its shared
>    barycentre by the engine's existing pair machinery (a pair has ONE epoch — engine map DATA-R29 and the
>    [[B111]] history; do not invent a second convention). A brown-dwarf pair is a pair. Then re-run job 1's
>    three systems as the gate.
> 4. **[[D18]] while you are here:** the produced "local neighbourhood" has no Sol and no Alpha Centauri.
>    Both omissions are almost certainly the same selection logic; fix them with jobs 1-3 or say why not.
> 5. **[[D25]] and [[D28]]:** fictional substances (ASTROPHAGE) leaking into REAL systems, and one companion
>    imported twice. D25 needs an owner decision on the rule — recommend, then ask, do not choose for him.
>
> **GATES, red-first, absolute:** Sirius imports as TWO stars with A the primary and a real radius near
> 1.71 solar; Luhman 16 imports as a pair; Epsilon Indi arrives with its B/C companions; the bundled-starmap
> pin (`scripts/starmap-build/buildKit.spec.mjs`) still passes, and if classification moves you must re-run
> `node scripts/starmap-build/build-starmaps.mjs` and commit the three `static/example-starmaps/` files AFTER
> the version bump, because the build stamps `appVersion`. Network calls do not belong in the suite: pin the
> catalogue rows as fixtures and gate the TRANSFORM.
>
> **TRAPS:** real user files live in `../user-test-files/` and never in the repo; the two `tests/` fixtures are
> a baseline — commit them if a run changes them; CRLF everywhere (measure each file's own ending, Python
> bytes, never `sed -i` on MSYS); `npm run manifest` after every version bump; the stash stack is shared — WIP
> commits, never bare stash/pop; claim ids in both forms; B99's rarity-dial test is a known statistical flake.
>
> **EYEBALL FOR THE OWNER:** import the local neighbourhood and open Sirius, Luhman 16 and Epsilon Indi; each
> should show both members, and each star's radius and mass should read as the real measured figures rather
> than a class average.
>
> **Housekeeping:** as Stream Q's, word for word.

## STREAM V — a Traveller main world where people could actually live (G87)

> You are building the MAIN-WORLD PLACEMENT MODEL for Star System Explorer — [[G87]], a user request relayed by
> the owner with his own design on top. Repo `C:\Development\star-system-explorer-v2\star-system-generator`,
> branch `beta` (fetch the tip; several streams push daily, renumber on collision). Work in your OWN worktree
> (`git worktree add ../sse2-mainworld -b wt/mainworld origin/beta`); the main checkout is shared. Commit as
> **FrunkQ <frunk@frunk.net>**, never ac@epsis.com.
>
> **READ FIRST.** `CLAUDE.md`; the STANDING RULES at the foot of `docs/dev/observations-inbox.md` — four of them
> are load-bearing here and you should be able to quote them back: FLEXIBLE SYSTEMS OVER POINT SOLUTIONS, NEVER
> ASSUME AN EARTH/SOL BASELINE (this bug IS that rule broken), SCATTERED CONSTANTS ARE DATA IN THE WRONG PLACE,
> and STEER DON'T STOP (an authored hostile world is never quietly moved somewhere nicer); the [[G87]] row, which
> carries the user's words, the owner's design and the coordinator's measurement; [[G32]] and [[G11]] (the
> importer's own history); engine map **PHY-34** (every gate absolute and red-first).
>
> **WHAT IS WRONG, MEASURED — verify it, do not re-derive it.** `src/lib/traveller/importer.ts:222-246` decides
> the main world's orbit from a hardcoded `HZ_ANCHORS` per spectral LETTER indexing a hardcoded `BODE_TABLE` of
> AU slots, jittered ±10%. It never consults `physics/zones.ts calculateGoldilocksZone`, which derives the real
> band from the star's own luminosity, nor `physics/habitability.ts findViableHabitableOrbit`, which already
> finds a free orbit inside a band. Every G star lands at 0.85 AU and every M star at 0.17 AU whatever their
> luminosity — a frozen world round a late M dwarf, a hot one round a bright G0 V. `if (uwpSizeDigit >= 10)
> orbitIndex += 3` then pushes a large world three slots out for a non-thermal reason. The main world's TYPE is
> hardcoded `'planet/terrestrial'` at the `_generatePlanetaryBody` call (`:290-302`).
>
> **WHAT ALREADY WORKS AND MUST STILL WORK AFTERWARDS.** The MOON case is built: trade code `Sa` puts the main
> world on a moon orbit round a larger host (`:367-381`, `:473-482`, tag `traveller/satellite-main-world`), and
> `W` is a hard world count that never counts moons. Treat it as a regression to avoid, and make your module
> return a HOST as well as an orbit so the satellite path flows through it rather than round it. Determinism is
> available: `traveller/rng.ts` is a `cyrb128`-seeded SFC32 hashed from a string.
>
> **THE JOBS, in order, each its own commit and push:**
> 1. **The module, on its own, with no importer changes yet.** `src/lib/worlds/mainWorldPlacement.ts` — the
>    owner's *"its own model we can tweak later - even the new Traveller creation system will require the same
>    functionality"*. A PURE function: given the star (or host), the system as it stands, the requested world's
>    facts (UWP size, atmosphere, hydrographics, population, trade codes) and a seed string, it answers WHERE
>    (host + a_AU) and WHAT TYPE, plus a REASON in plain words and the tolerance grade it settled for. It reads
>    the engine's own zone derivation; it contains no spectral-class table and no AU table of its own. Nothing
>    imports it yet — this job is the module and its gates alone.
> 2. **The candidate types are PACK DATA.** A ranked list of main-world types with a human-tolerance grade —
>    breathable / mask / sealed-or-underground — in the rule pack beside the other distributions, NOT an array
>    in the module. The vocabulary already exists (`planet/earth-like`, `earth-analogue`, `super-earth`, `ocean`,
>    `jungle`, `swamp`, `forest`, `desert`, `superhabitable`, `hycean`, and the hostile ones). The owner's rule:
>    *"we don't want them all entirely earth like; some will require breathing masks"* — so the list spans the
>    ladder, and the module picks the best grade the star, the orbit and the UWP will actually support, working
>    DOWN the ladder rather than giving up. **At least one human-compatible option must be reachable** when the
>    UWP's own atmosphere and hydrographics allow it, which is the user's whole request.
> 3. **Always try to place somebody.** *"On the whole they will always TRY and pop a main world down unless it
>    could[n't] have a decent population, even if they have to live underground occasionally."* So the module
>    declines only when no population could live there at all, and when it declines it SAYS SO in its reason
>    rather than silently falling back to the old table.
> 4. **The trade codes win.** A world Traveller declares hostile — hellworld and its neighbours — is NOT moved
>    into the habitable zone: that is the user's own bypass request and the steer-don't-stop rule agreeing with
>    each other. The bypass list is pack data too, keyed on the codes the decoder already expands
>    (`traveller/decoder.ts:27`), so a GM can add one without a release. A bypassed world keeps today's
>    behaviour exactly.
> 5. **Wire the importer to the module and delete the tables.** `HZ_ANCHORS`, `BODE_TABLE` and the `+= 3` size
>    nudge come out; the `Sa` satellite path routes through the module's host answer; the import gains the
>    option the user asked for (default ON is the owner's call — RECOMMEND, then ask him before shipping a
>    default that changes what an existing import produces).
>
> **GATES, red-first and absolute — in AU and kelvin, never ratios (PHY-34):** a G2 V main world lands inside
> the band `calculateGoldilocksZone` derives for that star, and its derived surface temperature sits in a
> liveable range; an M5 V main world lands near ITS band (~0.03-0.08 AU) and NOT at the old 0.17 AU — assert the
> old value is gone, or the gate passes on the bug; a hellworld-coded world is placed exactly where today's code
> puts it, unmoved; an `Sa` world is still a moon of a larger host, with its tag; **the same sector imported
> twice is byte-identical, and imported by two different "users" (different sessions, same input) is also
> byte-identical** — that is the owner's determinism requirement and it deserves its own test; and the existing
> `importer.spec.ts` W-count and hierarchy gates stay green.
>
> **TRAPS:** real user files live in `../user-test-files/` and never in the repo — there are Traveller sector
> files there to reproduce against; the two `tests/` fixtures are a baseline, commit them if a run changes them;
> CRLF everywhere (measure each file's own ending, Python bytes, never `sed -i` on MSYS); `npm run manifest`
> after every version bump; the stash stack is shared — WIP commits, never bare stash/pop; claim ids in both
> forms; B99's rarity-dial test is a known statistical flake.
>
> **EYEBALL FOR THE OWNER:** import a Traveller sector and open half a dozen main worlds — each should sit in
> its star's own habitable band with a temperature a GM would not blink at, the hostile-coded ones should be
> exactly as hostile as before, and a satellite main world should still be a moon.
>
> **Housekeeping:** as Stream Q's, word for word.

## STREAM W - ask the browser for what we need, and notice when it says no (C20)

> You are fixing the 3D LOCKUP on a tired browser - [[C20]], the owner's own report and his question: *is this a
> need to ask for more resources in the browser that we are NOT doing?* The answer is yes, three times over, and
> the row names all three with the measurement already done. Repo
> `C:\Development\star-system-explorer-v2\star-system-generator`, branch `beta` (fetch the tip; several streams
> push daily). Work in your OWN worktree (`git worktree add ../sse2-webgl -b wt/webgl origin/beta`); the main
> checkout is shared. Commit as **FrunkQ <frunk@frunk.net>**, never ac@epsis.com.
>
> **READ FIRST.** `CLAUDE.md`; the STANDING RULES at the foot of `docs/dev/observations-inbox.md` - DUPLICATED
> FUNCTIONALITY and STEER DON'T STOP both bite here; the [[C20]] row (verify the measurement, do not repeat it);
> [[G69]] (the frame-rate guard, and its rule that the state is TWO facts - what the settings REQUEST and what
> the guard SHED - because the host re-asserts every setting on every change); [[G80]] and [[G83]] (low power);
> [[A38]] (why `preserveDrawingBuffer` exists, and what breaks if it goes without a replacement); engine map
> **E7** (a canvas cannot be verified headlessly - reproduce the numbers and hand back an eyeball list).
>
> **THE SYMPTOM, in the owner's words to his users:** an old browser with many tabs opens Size Comparison or a
> Holoview and locks up solid, worst on MS Edge; a fresh browser purrs. His workaround is correct and stays in
> the help text until this ships.
>
> **THE JOBS, in order, each its own commit and push:**
> 1. **Ask.** ONE shared renderer factory. Six sites each write their own `new THREE.WebGLRenderer` today, which
>    is six copies of one decision - the duplication fault this codebase keeps paying for. The factory passes
>    `powerPreference: 'high-performance'` and takes each site's genuine differences (alpha,
>    `preserveDrawingBuffer` where [[A38]] needs it) as arguments.
> 2. **Notice a no.** Probe once with `failIfMajorPerformanceCaveat: true`. If that context is refused we are on
>    a software rasteriser. **Do not refuse to run** - steer, don't stop - but say so plainly and let it turn
>    low power on for that session. A GM told "your browser is drawing this on the processor; Low power is on,
>    and a fresh window will be much faster" has an actionable sentence instead of a hang.
> 3. **Give the context back.** `forceContextLoss()` after `dispose()` at all six teardowns, and a
>    `webglcontextlost` handler on the five that have none, so a reaped context shows a plain message and can
>    rebuild rather than leaving a dead canvas. Then prove it: open and close each 3D surface twenty times and
>    assert the live context count does not climb.
> 4. **Read the machine.** `navigator.deviceMemory` is already collected for diagnostics and decides nothing.
>    Let a small device default to low power through the SAME switch the GM controls, never a second hidden one,
>    and never let the default overrule a GM who has chosen ([[G69]]'s two-facts rule).
> 5. **Only then weigh `preserveDrawingBuffer`.** Which of the six genuinely need it? [[A38]] is the reason it
>    exists; a surface that is never captured does not need it and pays for it every frame.
>
> **GATES, red-first:** a source-level pin refusing a bare `new THREE.WebGLRenderer` outside the factory (the
> shape `skinLiterals.spec.ts` already uses); the software-fallback path sets low power and emits its message;
> twenty open/close cycles leave the context count flat; low power still honours an explicit GM choice. A real
> GPU cannot be asserted under vitest - pin the DECISIONS, drive a browser for the rest, and say plainly what
> stays eyes-only.
>
> **TRAPS:** CRLF everywhere (measure each file's own ending, Python bytes, never `sed -i` on MSYS); `npm run
> manifest` after every version bump; the two `tests/` fixtures are a baseline; the stash stack is shared - WIP
> commits, never bare stash/pop; claim ids in both forms; B99's rarity-dial test is a known statistical flake.
>
> **EYEBALL FOR THE OWNER:** on the machine that locks up, open Size Comparison and the holo. You should get
> either a usable view or a plain sentence saying what happened and what to do about it - never a hang.
>
> **Housekeeping:** as Stream Q's, word for word.

**STREAM U AMENDED 2026-09-08, AFTER THE STREAM STARTED (job 1 landed at v3.1.4) - so the running session must be
TOLD, not expected to re-read.** The owner has added scope to [[D29]], and it belongs with job 3: **a control for
the edge of a binary's extent.** His words: *"Additional control to define the edge of your binary extent; so you
can control whether its separate stars or a binary."* A wide pair is a judgement, not a fact - the same two stars
are one binary system or two neighbouring ones depending where the line is drawn, and the importer draws it today
without telling anybody. Make the separation threshold a SETTING on the import, defaulting to exactly today's
behaviour so nothing moves for an existing user, and carry the chosen value in the import's own record so a
re-import reproduces the same map. Decide it BEFORE job 3 brings multiples in, because it defines what a multiple
is. Gate it absolutely: one named wide pair imports as two systems below the threshold and as one binary above it,
with the same input and the same seed.

## STREAM X — a pasted body brings the rules it needs (R-19)

> You are building the engine's half of **R-19**: a hub clip now carries the custom rule definitions its objects
> reference, and this side has to narrow, merge and report them. Repo
> `C:\Development\star-system-explorer-v2\star-system-generator`, branch `beta` (fetch the tip; several streams
> push daily). Work in your OWN worktree (`git worktree add ../sse2-cliprules -b wt/cliprules origin/beta`); the
> main checkout is shared. Commit as **FrunkQ <frunk@frunk.net>**, never ac@epsis.com.
>
> **READ FIRST, and in this order.** (1) `CLAUDE.md`. (2) The STANDING RULES at the foot of
> `docs/dev/observations-inbox.md` — DUPLICATED FUNCTIONALITY and STEER DON'T STOP are the two that decide this
> design. (3) **The hub's brief, whole:**
> `C:\Development\starsystemx-creator-hub\docs\prompt-for-sse-2026-09-08-clip-rules.md` — it is unusually good,
> it explains WHY each rule is a rule, and it is the authority on what arrives. (4) The **R-19 section at the
> foot of `docs/dev/hub-requirements-for-sse.md`** — the engine's half, carrying the coordinator's triage and
> three measurements the hub could not make. (5) The **SEAM PROTOCOL** section of this briefs file: you will owe
> a SEAM REPORT block, and you never edit the hub's repository.
>
> **WHAT IS ALREADY MEASURED — verify it, do not re-derive it.**
> - `canonicalJson` (`src/lib/io/shippedDefaults.ts:31`) is ALREADY the comparison the hub asks for: keys sorted
>   recursively, array order untouched. **Reuse it.** A second canonicaliser is how the identical-definition
>   test starts disagreeing with itself.
> - `RulePackOverrides` (`types.ts:1373-1390`) has eight sections and **two of them are DELTAS against the
>   shipped pack**, not lists: `morphologies` and `pigments` are `PackListDelta<T> | T[]` (`types.ts:1384-1385`,
>   `lib/rulepackDelta.ts` with `makeListDelta`/`applyListDelta`). "Do I already have this one, identical?" is a
>   different question for a delta, and merging two deltas is not merging two lists.
> - `applyStarmapOverrides` (`routes/+page.svelte:200`) is a SHALLOW section-level spread. Sending a paste
>   through it would replace the GM's whole liquids override with the incoming one. **Do not use it for this.**
> - `hubClip.ts`: the envelope at `:56`, the `nodes.length === 0` refusal at `:116`, `insertClip` at `:454`,
>   and `addContentCredit` at `:542` — which is the shape to copy for "say what came with it", because R-16
>   already solved the same reporting problem for credits.
>
> **THE JOBS, in order, each its own commit and push:**
> 1. **The envelope and the two producers.** `rulePackOverrides` becomes an optional key on `HubClip`; a clip
>    with `nodes: []` and no `root` parses as a RULES-ONLY clip instead of being refused. Parsing only — no
>    merging yet, and a rules-only clip that reaches the paste path in this job says plainly that it is not
>    handled yet rather than half-doing it.
> 2. **The comparison, on its own, with its own gates.** Given an incoming definition and the destination's
>    overrides, answer one of three: ABSENT / IDENTICAL / DIFFERENT, using `canonicalJson`. Handle the two delta
>    sections honestly — decide and WRITE DOWN whether a delta is compared as a delta or as its applied result,
>    and say why in the module and in an engine-map entry. This is the job that earns the stream.
> 3. **The merge.** Per DEFINITION, never per section. Absent: add. Identical: discard silently — the ordinary
>    case, because pasting a star then one of its planets brings every rule twice. Different: **NEVER
>    OVERWRITE.** Rename the incoming one and repoint the pasted nodes at the new name. Somebody else's "Liquid
>    Unobtainium" is not this GM's, and overwriting turns one quietly wrong planet into a quietly wrong campaign.
> 4. **Narrowing** — take only what the pasted nodes actually reference. The hub deliberately sends the lot
>    because narrowing is engine knowledge. **The owner has said merging the lot is an acceptable version one**,
>    so if narrowing looks expensive, ship job 3 without it and say so; do not let it hold the fix back.
> 5. **Say what came with it**, in the app's own voice: "added 2 liquids and an engine definition; renamed
>    Unobtainium to Unobtainium (from Local Neighbourhood) because you already had one." A GM who is told
>    nothing cannot tell this feature from the bug it fixes.
>
> **GATES, red-first and absolute.** A body with a custom liquid pastes into a fresh campaign and its PHASE is
> right, not merely its name — that is the difference between the fix and the bug; the same clip pasted twice
> adds nothing the second time and renames nothing; a DIFFERENT definition of the same name is never
> overwritten, and the pasted nodes point at the renamed one; key order alone never causes a rename (pin it with
> an object built in a different order); a delta section round-trips; and a rules-only clip merges and reports.
>
> **TRAPS:** CRLF everywhere (measure each file's own ending, Python bytes, never `sed -i` on MSYS); `npm run
> manifest` after every version bump; the two `tests/` fixtures are a baseline; the stash stack is shared — WIP
> commits, never bare stash/pop; claim ids in both forms; B99's rarity-dial test is a known statistical flake.
>
> **WHEN IT SHIPS:** the hub asks to be told so it can note R-19. Write the SEAM REPORT block in the protocol's
> fixed shape, quoted not retyped, and hand it to the coordinator — you do not push to the hub's repository, and
> you never tell it production carries something the owner has not released.
>
> **Housekeeping:** as Stream Q's, word for word.


## STREAM W - HANDOVER (C20 complete as briefed, 2026-09-08)

**All five jobs are on beta: v3.1.9, v3.1.16, v3.1.20 and v3.1.25.** Production is v3.1.0 and has
none of it, so a GM there still gets the hang and the fresh-browser workaround is still the right
answer in the help text.

**WHAT THE OWNER ASKED, ANSWERED.** *"Is this a formal memory request or a need to ask for more
resources in the browser that we are NOT doing?"* Yes, and there were three, all now made:

1. We never asked for the discrete GPU. `powerPreference: 'high-performance'` now goes with every
   context, from ONE factory (`rendering/glRenderer.ts`) instead of six copies of the decision.
2. We never noticed the browser dropping to software rendering. It is probed once, on a throwaway
   context, and a refusal turns Low power on and puts a sentence on screen instead of hanging.
3. We never handed a context back. `releaseGlRenderer` (dispose THEN forceContextLoss) at all six
   teardowns, and all six now hear `webglcontextlost` where only the holo did.

Plus: a device reporting <= 2 GB defaults to Low power through the GM's own switch, and
`preserveDrawingBuffer` is now per USE rather than per module.

### WHAT WAS VERIFIED IN A REAL BROWSER, AND WHAT IS LEFT FOR THE OWNER

**Verified on beta.starsystemx.com, v3.1.31 (commit 6d0e978), Chrome, 2026-09-08.** An earlier note
in this handover said nothing had been seen; that was true of the LOCAL dev server only. The fix was
to stop trying to run one - the pane's launch registry is cached per session and its one usable entry
points at the shared main checkout - and drive the DEPLOYED beta instead, which is where these pushes
land. If you are verifying this stream again, start there.

Observed by patching `getContext` before any 3D view existed, then opening one:

1. **Every context asks for the high-performance GPU** - on the probe AND the real surface (job 1).
2. **The probe runs first and once**, on a throwaway canvas, with `failIfMajorPerformanceCaveat`.
   Refused, it retries `webgl` strict, then plain, and concludes software - the exact four-call
   sequence the design predicts (job 2).
3. **On a refusal the view is STILL BUILT** and the notice appears with its shipped wording, word for
   word (job 2, steer-don't-stop).
4. **The probe hands its throwaway context straight back** - `loseContext` observed.
5. **Low power comes on for the session and NOTHING is persisted** - the GM's own checkbox reads
   ticked, storage stays empty. That is the two-facts split working (jobs 2 and 4).
6. **An explicit choice beats the machine both ways, and survives a reload** while the machine still
   says software: the box stayed unticked and the GM was still told why. This is the guarantee the
   whole two-facts design exists for.
7. **Closing a 3D view calls `forceContextLoss` exactly once** (job 3). Before this stream: zero.
8. `deviceMemory` was 32 on that machine, so job 4 correctly said nothing.
9. The captured holo surface carries `preserveDrawingBuffer`; the probe context does not (job 5).

**STILL UNSEEN, and unseeable from a page:** that a discrete GPU is really handed over, and the
browser's own live-context count. Neither is observable from JavaScript, which is why the gates pin
OUR count and our decisions instead.

**C21's build budget and wireframes are unseen for a DIFFERENT and structural reason - [[E7]].** The
view was opened on the deployed beta and the `comparison` perf provider is registered and reporting,
so the code is live; but it reported `buildsTotal: 0`, because the pane runs `document.hidden ===
true` and `requestAnimationFrame` never fires (measured again the same day: 0 frames in 1500 ms).
`reconcile()` lives inside the frame loop. **Everything in C20 was verifiable because it happens at
context CREATION and TEARDOWN, which are synchronous on mount and unmount; everything in C21 happens
inside rAF and is eyes-only by construction.**

### THE OWNER'S OWN THIRTY SECONDS, on the PC that locks up

1. Open **Size comparison** (rail: Measure, then Size comparison). It should come up straight away
   with spinning **wireframe globes** that fill in over the next second or two, and the strip should
   scroll and answer clicks the whole time - never the "page isn't responding" dialog.
2. If anything still stalls, run `window.__ssePerf.events(60, 'comparison.build')` in the console:
   it gives bodies built, bodies deferred and milliseconds blocked, per pass, whether or not tracing
   was on.
3. Open a **Holoview**. On a tired browser you should get a plain sentence about the processor and
   Low power ticking itself on - never a hang. Untick it and it must STAY unticked, including after
   a reload.

### THE DRAWING BUFFER - asked, answered, and then improved on by the owner

The catalogue's full-screen player holo holds ~59 MB of drawing buffer for as long as it is open,
solely so the view-entry transition can photograph the outgoing 3D screen. Offered as keep / drop /
follow-low-power. **The owner chose KEEP**, so nothing changed and
`preserveDrawingBuffer.spec.ts` still pins that this site does not opt out.

**Then he named the thing all three options missed:** *"You can drop the 3d data once the image is
taken ... it needed to exist to copy FROM."* He is right - the buffer only has to exist at the moment
of the copy - **but not by toggling the flag**, which is fixed at context creation (RENDER-S57) and
cannot be changed on a live context. What the flag actually buys is reading the canvas OUTSIDE the
frame that drew it. So the way to stop paying for it is to **do the copy INSIDE that frame**: a
`captureFrame()` on the holo controller (render, then copy, in one call stack) hands back a canvas
that never needed the flag at all, and the cost comes off EVERY surface rather than one.

**Where it applies and where it does not - checked, not assumed:**

- **The D8 view-entry transition is the clean case.** One photograph, taken at `beforeUpdate`,
  outside any frame. It is exactly what `captureFrame()` is for.
- **A38's body graphic is NOT.** `FilteredDocumentView.gfxLoop` re-photographs it on EVERY rAF, and
  deliberately - *"because a 3D body SPINS and a static texture would freeze it mid-turn"*. The 3D
  cannot be dropped there after one image. It would still stop needing the flag if the copy moved
  inside the holo's own frame, but the scene has to stay live.

**NOT BUILT.** It is a real refactor across the holo scene and two consumers, its failure mode is a
SILENT blank capture, and nothing in this stream has been seen in a browser. Briefed, not attempted -
the right order is to get eyes on what has already shipped first.

### TWO FINDINGS FOR THE COORDINATOR, unrelated to C20

- **NOT A FLAKE - HEAVY SPECS TIME OUT WHEN SEVERAL AGENTS TEST AT ONCE, and that is worth knowing
  in a repo that runs parallel sessions by default.** I first wrote this up as "a second statistical
  flake beside [[B99]]'s rarity dial", which was WRONG and is corrected here rather than left to
  mislead. `axialTilt.spec.ts`, `generateFromConfig.spec.ts` and `tagPresentation.spec.ts` all failed
  together, then all passed alone - and the failures were `Test timed out in 5000ms`, never an
  assertion. The owner's explanation was the whole of it: *"we just had 4 agents testing at once"*.
  **THE TELL IS THE ERROR TEXT.** A timeout names a budget; a flake names a value. Read it before
  concluding anything is non-deterministic, because the two are indistinguishable from a red tick in
  a summary line and only one of them is a bug. Several heavy specs sit on vitest's default 5 s, and
  the source-scanning pins are the same shape (`glRendererSites.spec.ts` needed 60 s, and it cheap-
  rejects a file before doing per-line work for exactly this reason). If this keeps costing sessions,
  the fix is a budget on the heavy specs, not a hunt for a seed.
- **`player/presetStore.ts:addAssetFromCanvas` has no callers anywhere in the repo**, yet its
  documentation states a live dependency on `holo/scene.ts` and `filteredCanvas.ts` keeping
  `preserveDrawingBuffer`. It was traced during job 5 and deliberately left alone; if it is dead it
  should go, and if it is owed to a future feature the dependency is now recorded in
  `HoloOptions.capture` where a change would be noticed.

## STREAM Y — a contact binary: one body fact, one modifier, one silhouette (G90)

> You are adding CONTACT BINARIES - two lobes touching, like Arrokoth and like comet 67P - as a small-body type
> a GM can author and the generator can also produce. [[G90]], the owner's ask of 2026-09-08 **as corrected by
> him the same day: an earlier version of this brief invented an "authored but never generated" mechanism from a
> misreading, and it is dropped. This is an ordinary type.** Repo
> `C:\Development\star-system-explorer-v2\star-system-generator`, branch `beta` (fetch the tip; several streams
> push daily). Work in your OWN worktree (`git worktree add ../sse2-contactbinary -b wt/contactbinary
> origin/beta`); the main checkout is shared. Commit as **FrunkQ <frunk@frunk.net>**, never ac@epsis.com.
>
> **READ FIRST.** `CLAUDE.md`; the STANDING RULES at the foot of `docs/dev/observations-inbox.md` - FLEXIBLE
> SYSTEMS OVER POINT SOLUTIONS and PHYSICS DRIVES TAGS DRIVES VISUALS are the two that shape this; the [[G90]]
> row, including the owner's correction, which is the authority on scope; `docs/dev/engine-map.md` grepped for
> your territory, and `classifierSeam.spec.ts` before you touch a fingerprint.
>
> **THE OWNER, corrected:** *"Authored means put there by a user rather than generated. BOTH are fine! Both are
> needed. I thought this would simply be adding a new type of small thing alongside the other 5? They are likely
> to be rubbly to join together like this - but maybe we can have a couple of types if that reflects reality."*
>
> **THE ONE REAL CONSTRAINT, measured.** Fingerprints match a FEATURE MAP built in
> `core/SystemProcessor.ts:1375-1382` - `makeup.*`, `porosity`, `mass_Me` and friends. **Being two lobes is a
> fact about shape and history that no derived quantity carries**, so there is nothing there to match on today,
> and a type the classifier cannot re-derive is LOST on the next reprocess. So the type needs a body fact
> underneath it. That is the whole job and it is small.
>
> **THE SHAPE OF THE ANSWER, and take it as a strong recommendation rather than an instruction - if measuring
> says otherwise, say so and do the better thing:**
> - **A body property** a GM can author and the generator can set (name it as the codebase would).
> - **One line in the feature map** beside `porosity`, so a fingerprint can match it.
> - **A MODIFIER fingerprint**, not a base - because `asteroid/rubble-pile` is already a modifier that stacks,
>   and stacking answers the owner's "a couple of types" without a second type: **comet + contact-binary is
>   67P**, the bilobate nucleus Rosetta photographed; **rubble-pile + contact-binary is Arrokoth**. Match it on
>   the new fact plus the population it really comes from - small, porous, rubbly - because these form by gentle
>   low-velocity mergers, which is the owner's own instinct and it is correct.
> - **A bilobate branch in `catalogue/smallBodyShape.ts:17 smallBodyOutline`.**
>
> **THE JOBS, in order, each its own commit and push:**
> 1. **The body fact and its feature line**, with the classifier seam proven: a body carrying it keeps its class
>    across a reprocess, and one without it never gains the class. Nothing visual yet.
> 2. **The modifier fingerprint**, stacking correctly on both a comet and a rubble pile, and never on something
>    absurd. Check `classification.audit.spec.ts` still passes - it audits fingerprint overlap.
> 3. **The silhouette, the part worth doing well.** Two lobe centres and a neck in `smallBodyOutline`, still
>    seeded from the body id so a rock keeps its shape everywhere it appears, still ONE closed path - because
>    `PlanetDisc.svelte:53` and `CompositionCrossSection.svelte:39` share it and the cutaway must clip to the
>    same outline. Vary the lobe ratio and neck width from the seed: Arrokoth's lobes are famously unequal, and
>    one silhouette for every contact binary would look like a decal.
> 4. **The generator**, last and modestly: a small chance for a body already in the right population. The owner
>    asked for authoring first, so this must not distort what systems normally contain - measure the before and
>    after counts and say what moved.
> 5. **The image, ONLY if the owner has supplied a file and a credit line.** Do NOT download one: the reworked
>    Arrokoth composite is a derivative whose licence is his to check, and `io/attributions.ts` writes a credit
>    into every save and bundle. Without it, ship with no image - `asteroid/rubble-pile` has none and that is
>    the precedent.
>
> **GATES, red-first:** the class survives a reprocess (the seam) and is never assigned without the fact; the
> modifier stacks on comet AND on rubble-pile; the outline is one closed path with its lobe count and bounding
> box asserted NUMERICALLY, not "looks lobed"; the same id gives the same path twice; and
> `CompositionCrossSection` clips to the identical path, which is the regression that matters.
>
> **THE 3D HALF IS IN SCOPE, AND IT IS [[G91]].** It was raised and the owner answered the same day: *"'lumpy'
> 3d/2d models are the best - the 2d on GM screen was quite good - I just think we miss the 3d render path."*
> He is right, and it is measured: `holo/bodyLook.ts:340` builds a plain `SphereGeometry` for every body and
> nothing displaces it, so the same asteroid is a convincing potato on its card and a billiard ball in the holo.
>
> **Job 3b, and take it with job 3 because they are one design:** displace that sphere for small bodies.
> `buildBodyLook` is the single assembly for the holo, the gallery AND the size comparison (engine map
> RENDER-S53), so one change reaches all three. **Both views must sample ONE seeded shape source** - the 2D
> outline is already a seeded radial function of one angle, the 3D lump is the same idea over two - so that a
> body's silhouette and its solid are the same rock seen twice. Build the shared source first, then let
> `smallBodyOutline` and the mesh both read it; shipping them apart gives a GM a card and a holo showing
> plainly different objects, which is the fault this codebase keeps recording.
> **Watch the cost:** the sphere is 32x24 segments (16x10 low-poly, `bodyLook.ts:224-225`), small bodies are the
> most numerous things in a system, and the frame-rate guard ([[G69]]) will shed what you overspend. Measure a
> busy map before and after, honour Low Power ([[G80]]/[[G83]]), and say what it cost.
>
> **TRAPS:** CRLF everywhere (measure each file's own ending, Python bytes, never `sed -i` on MSYS); `npm run
> manifest` after every version bump; the two `tests/` fixtures are a baseline and a new body fact may well move
> them - commit them with the change and read the diff as the record; the stash stack is shared - WIP commits,
> never bare stash/pop; claim ids in both forms; B99's rarity-dial spec is a known statistical flake.
>
> **EYEBALL FOR THE OWNER:** author a contact binary and look at it on the 2D orrery, on its info card and in a
> composition cross-section - two lobes joined, and the cutaway meeting its edge. Then open a comet and a rubble
> pile and confirm the modifier reads sensibly on both.
>
> **Housekeeping:** as Stream Q's, word for word.

## STREAM Z - every object carries its own age (G94, and the fix for B150)

> You are giving every body an age of its own. [[G94]], decided by the owner 2026-09-08; it is the groundwork V4
> needs and the fix [[B150]] needs, built once. Repo
> `C:\Development\star-system-explorer-v2\star-system-generator`, branch `beta` (fetch the tip; several streams
> push daily). Work in your OWN worktree (`git worktree add ../sse2-bodyage -b wt/bodyage origin/beta`); the main
> checkout is shared. Commit as **FrunkQ <frunk@frunk.net>**, never ac@epsis.com.
>
> **READ FIRST.** `CLAUDE.md`; the STANDING RULES at the foot of `docs/dev/observations-inbox.md` - PHYSICS
> DRIVES TAGS DRIVES VISUALS and NOTHING READS A VALUE A LATER PASS WRITES both bite here; the [[G94]] row (the
> owner's decision and the whole measurement) and [[B150]] (the bug it fixes); engine map [[G62]] on the
> absolute clock and the stake in the sand; `src/lib/system/idempotence.test.ts` before you touch the processor.
>
> **THE OWNER'S DECISION:** *"EVERY object should have an independent age anyway as V4 will track formation
> times, captured bodies and rebuilding planets smashed in system."*
>
> **WHAT IS MEASURED - verify it, do not re-derive it.** One age exists: `System.age_Gyr` (`types.ts:990`), read
> into `SystemProcessor.systemAgeGyr` (`:93,:98`) and consumed at 21 sites. The per-body consumers that matter:
> `brownDwarfThermal` (`:155,:689`), `flareActivity` (`:127`), `estimateInternalHeatK` (`:782`), atmospheric
> escape (`:956`, which already computes `planetAgeGyr = systemAgeGyr - FORMATION_DELAY_GYR`). The clock is
> already absolute ([[G62]]), so a formation time has an axis to live on.
>
> **THE THREE DECISIONS ALREADY TAKEN, so do not reopen them:**
> 1. **An age is a PROPERTY, not an override.** It does not fire the anomaly engine. A body older than its
>    system is a history, not a cheat.
> 2. **Store a FORMATION TIME on the absolute clock**, and derive age from it. A duration would have to be
>    migrated the moment V4 tracks formation properly.
> 3. **ABSENT MEANS INHERIT.** No age of its own means the system's age, and the system's age is NEVER stamped
>    onto bodies when saving - that would freeze it and stop a later change reaching anything.
>
> **THE QUESTION THIS BRIEF ONCE LEFT OPEN IS SETTLED - the owner, same day:** *"No clock is changed as you can
> slide the age of a body independently - t=0 is big bang, t for comparison = star formation, and that is fine."*
> **A body's age is STORED AND INDEPENDENTLY EDITABLE, and the campaign clock is not involved in deriving it.**
> Sliding an age does not move the clock; scrubbing the clock does not change an age. The trap this brief warned
> about - physics depending on the display clock - is not guarded against, it simply is not created. Storing a
> formation time on the absolute axis is still the better representation for V4, because a body rebuilt after a
> collision moves its own forward; but with nothing re-deriving against a moving "now", that is a representation
> choice with no behavioural risk. **DO NOT introduce a dependency on the scrub position.**
>
> **THE JOBS, in order, each its own commit and push:**
> 1. **The field and `ageOf(body)`**, with absent-means-inherit proven both ways: a body without one follows the
>    system when the system's age changes; a body with one does not. Nothing else changes yet.
> 2. **Switch the per-body consumers** from `this.systemAgeGyr` to `ageOf(body)` - the substellar cooling track
>    first, since that is B150 - then radiogenic heat, then escape and flare activity. **Not all 21**: the
>    system's own age control and the map summary stay system-wide. One commit per consumer, each with its own
>    gate, because each is a physics change.
> 3. **The control**, on the body's own panel and labelled **Age** - not "time", which in this app means the
>    campaign date and already has a clock, a calendar and transit times attached to it. Say underneath what it
>    drives, the way the other derived readings on that panel already do.
>
>    **WHERE, decided by the owner 2026-09-11 ([[G96]]):** on a PLANET or MOON the slider lives on the
>    **Temperature tab** (`BodyTemperatureTab.svelte`, which already receives `systemAgeGyr` from
>    `BodySidePanel.svelte:103` - the inherited age is in its hands today). On a STAR it **REPLACES the
>    Effective Temperature block** on the Star tab (`BodyStarTab.svelte:970-988`; a star has no Temperature
>    tab) and shows the resulting temperature beneath it. On a BROWN DWARF likewise, which is job 5.
> 4. **The inversion, which is what answers the user who started this.** `worlds/orbitSolver.ts` (Stream V,
>    same day) already does *"ask where a star would keep a body at a given temperature"*. Do the same here: the
>    GM types a temperature into the field B150 is about, and the app answers *"that is a 9.2 Gyr dwarf - set
>    its age to that?"* Physics stays the single source and the GM still gets to type what he wanted.
> 5. **[[B150]]'s interface half**, last, and it is a REMOVAL rather than an explanation - the owner has told
>    the user *"that temp slider WILL disappear, but you can mess with its age instead"*. For a SUBSTELLAR body
>    the temperature control goes and the age slider takes its place.
>
>    **SUPERSEDED 2026-09-11 - READ [[G96]] FIRST.** The owner moved the fusing-star case: *"On stars it
>    REPLACES the temp control which also shows temp... direct temp control is now in overrides."* So the
>    removal is NOT scoped to substellar any more: the temperature control goes on a star too, the age
>    slider takes its place, and the star's direct temperature becomes a NEW OVERRIDE KEY in
>    `physics/overrides.ts` - effective temperature, `appliesTo: ['star']`, its own band (not
>    `surfaceTempK`, which is a planet's mean-surface pin banded on equilibrium). The physics uses whatever
>    the override says. What a star's AGE then drives is [[G97]], which needs his word on seed-versus-
>    current-state before you switch a stellar consumer. The paragraph below is kept as the record of
>    what was true for three days; its "gate it BOTH ways" becomes: control gone on a star AND on a brown
>    dwarf, override present on the star only.
>
>    **GUARD, AND A REAL REGRESSION RISK: A FUSING STAR KEEPS ITS TEMPERATURE CONTROL.** The owner: *"probably
>    still look to have a stellar temp override on stars available, to do a manual tweak if they want. The
>    physics just uses the actual values - even if they don't make a huge amount of sense."* It already works
>    that way - `applySubstellarSelfLuminosity` only fires inside the 8-80 M_Jup window, so above the
>    hydrogen-burning limit nothing overwrites `temperatureK` and an authored temperature already sticks, with
>    luminosity deriving from it and the radius. **Scope the removal to substellar, and gate it BOTH ways: the
>    control is gone on a brown dwarf and STILL THERE on a star.**
>
>    (One existing exception, flagged not changed: `SystemProcessor.ts:721-725` raises a fusing star below about
>    1900-2100 K to that floor, on the argument that an object at the hydrogen-burning limit sits there whether
>    or not it has just started fusing. It only ever raises. Leave it, and mention it in your report.)
> 6. **THE AGE SCALE AND ITS TAG FAMILY** - the owner's extension, and the part with the most product in it.
>    *"The basis of EVERY body should have an age slider from now until end of universe - pinned to an orange
>    point based on the stellar age... We need a new set of AGE tags now to highlight young, old and ancient
>    objects. young - is younger than host star, old is older and ancient is 2-3 stars ago - primordial is early
>    universe stuff."* And: *"It fires the tag engine rather than anomaly."*
>
>    **The slider's bound is DERIVED, not typed.** `temporal/utre.ts:14` already holds
>    `BIG_BANG_TO_UNIX_EPOCH_T` = 13.787 Gyr, and [[G62]] made the axis absolute - so the range runs 0 to the
>    CAMPAIGN'S OWN cosmic time (a far-future campaign has more room), and nothing may be older than the
>    universe was on the day the campaign is set. The orange pin is the host star's age on the same scale.
>
>    **A NEW `age/` FAMILY, not an extension of `origin/`.** `origin/` already carries `captured`, `migrated`,
>    `generated` and the hub pair (`tagPresentation.ts:254-274`, emitted at `generation/planet.ts:239,304`) and
>    it answers WHERE a body came from; `age/` answers WHEN it formed. They compose, and the composition is the
>    owner's own example: `origin/captured` + `age/primordial` is the primordial rock this system picked up.
>
>    **Four bands, two relative and two absolute - do not blur them.** `age/young` younger than the host star;
>    `age/old` older than it; `age/ancient` older by at least two stellar generations (his "2-3 stars ago"),
>    with **the generation length as PACK DATA** because it is exactly the number a human will want to tune;
>    `age/primordial` an ABSOLUTE band at the big-bang end, Population III territory. The relative pair keeps
>    working for a young host; the absolute pair keeps meaning something whatever it orbits.
>
>    **THE TEST THIS DESIGN MUST PASS**, because the owner named the destination: *"as we move on to galactic
>    mergers and stellar collisions we need a robust system."* Since origin and age are separate axes, a merger
>    or a collision must be a NEW MEMBER OF `origin/` and touch the age model not at all - a star flung in by a
>    merger keeps its formation time and gains an origin; a body rebuilt after a collision moves its formation
>    time forward and its age tags follow by themselves. **If you find yourself needing to change the age model
>    to describe a merger, the split is wrong - stop and say so.**
>
>    **AND SAY WHAT WAS MEASURED.** There is NO metallicity in this engine (grepped: nothing), so `ancient` and
>    `primordial` come from age alone. That is honest but incomplete - a primordial rock should also be
>    metal-poor - so word the tag descriptions to say the age is what was measured, and leave metallicity as the
>    cross-check it will one day be.
>
> 7. **THE SLIDER AND ITS COMPOSITION FLOOR.** The scale: a RED point at the host star's formation, an ORANGE
>    band across accretion, a GREEN line to the campaign's reference date at the right-hand end, and **a FOURTH
>    ZONE from the composition floor up to stellar formation** - the region where captured, ancient and
>    primordial bodies live, which must be drawn rather than left as the blank part of the scale.
>
>    **The floor is a function of what the body is MADE OF** - `physics/makeup.ts makeupFractions` already gives
>    `metal / rock / carbon / ice / gas`. Gas reaches cosmic dawn (the first stars, ~100-250 Myr after the big
>    bang, NOT the big bang); ice about one generation, because C, N and O come from the first massive stars;
>    rock three to four, because a substantial rocky body needs enough Si, Mg and Fe to have ACCUMULATED - a
>    threshold on abundance, not a switch on availability. **A BLACK HOLE's floor is the big bang itself**, since
>    a primordial one forms in the first second before any star - so the floor reads KIND as well as makeup, and
>    is a curve over the fractions rather than a two-way test. Every number in it is PACK DATA.
>
>    **The floor RESISTS, it does not refuse** - passing it corrupts nothing and is merely implausible, which is
>    the case steer-don't-stop was written for. Detent, take a deliberate push, then tag the body beyond it
>    ([[G45]] is the precedent). Contrast [[A102]], where the solvents ARE disabled because choosing one would
>    corrupt the coupled atmosphere: refuse only when a choice would break a neighbour.
>
>    **Rogue planets and primordial black holes fall out for free** - a rogue has no host so no red pin, only the
>    cosmic axis; a primordial black hole sits at the far left with a floor nothing else has. That is a fair test
>    of the design, and the owner's own observation.
>
> **THE FULL MODEL LIVES IN `docs/dev/deep-time-design.md`** - written 2026-09-08 at the owner's word (*"feel
> free to start a NEW system to store and work with this stuff"*), because this is the groundwork for 3.2 and V4
> stellar and galactic evolution and had outgrown a board row. **Read it before job 1, keep it true as you go,
> and correct it in the same commit as anything that proves it wrong.**
>
> **GATES, red-first and absolute.** A dwarf at a given mass and radius reports a specific temperature at 1 Gyr
> and a specific LOWER one at 9 Gyr, in kelvin, not "cooler"; the same value survives a reprocess (it is an
> input, and `idempotence.test.ts` is the gate that proves nothing reads it out of order); a body with no age
> tracks the system's when that changes, and one with an age does not; and the two `tests/` fixtures WILL move -
> commit them and read the diff as the record of what shifted.
>
> **TRAPS:** CRLF everywhere (measure each file's own ending, Python bytes, never `sed -i` on MSYS); `npm run
> manifest` after every version bump; the stash stack is shared - WIP commits, never bare stash/pop; claim ids
> in both forms and expect a race (one was lost to another stream while this row was being written); B99's
> rarity-dial spec is a known statistical flake that passes alone. **THE MACHINE IS BUSY** - several streams are
> live and the owner has asked for lighter runs, so prefer targeted gates while you work.
>
> **EYEBALL FOR THE OWNER:** open the brown dwarf from the user's report, set its age older, and watch the
> temperature fall by the same law rather than snapping back; then type a temperature and be offered the age
> that produces it.
>
> **Housekeeping:** as Stream Q's, word for word.
