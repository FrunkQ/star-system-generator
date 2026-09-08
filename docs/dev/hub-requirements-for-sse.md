# Hub requirements for the SSE engine — coordinator triage, 2026-08-30

**SEAM PROTOCOL (2026-09-06).** This file is the ENGINE's half of the contract with the Creator Hub: the hub's
requirements banked verbatim, the coordinator's triage, and the engine's `SSE-SIDE STATUS` report under each
R-number it ships. The HUB's half - what the hub has set, consumed and verified - lives in the hub repo's
`docs/sse-requirements.md`, which is read directly and quoted, never paraphrased, and never edited from here.
The protocol, the fixed SEAM REPORT block and Stream N (the integration check across both) are in
`session-briefs-2026-08-28.md` under SEAM PROTOCOL.

BOARD: [[G57]]. The full document below is the Creator Hub session's, banked verbatim. This header
is the coordinator's triage of each item against the tree AT v3.0.223, with two verified gaps the
hub could not see.

| item | state | notes |
|---|---|---|
| R-01 bundleFormat | **HALF-DONE, verified gap** | Stamped in `packBundle` (v3.0.179) — but a PLAIN `.json` save gets NO stamp (`bundle.ts:167` is inside the zip path only). Those are exactly what the JSON-only kill switch makes the hub's only accepted uploads. Small fix: stamp on the plain-JSON export path too. |
| R-02 fixture | **PARTIAL, verified gap** | `tests/fixtures/creator-hub-bundle.sse.zip` exists and is byte-pinned — but it is SYNTHETIC: model named `c0ffee.glb` (six hex chars, NOT the sha256 of its bytes — it would fail R-03's own assertion), no `system.json` sibling, no model shared by two nodes. Regenerate to R-02's full spec from a real save. |
| R-03 hash assert on export | NEW, cheap | One comparison on a path that already computed the hash. Do it in the same batch as the R-02 regeneration, or the new fixture fails it. |
| R-04 in-app upload/update/download | NEW feature | Blocked on R-06. Never pre-tick `attest`; never default `publishGmTree` on; surface `missingProvenance` in the EDITOR. |
| R-05 ?hub=<slug> one-click open | NEW feature | The funnel. Untrusted input; never auto-merge into a live campaign. |
| R-06 auth shape | **DECIDED 2026-08-30: DEVICE-CODE PAIRING** | The app shows a code, the user approves it on the hub in their browser, the app gets a revocable token. No password ever near the app. Batch 3 is unblocked; the hub side builds the pairing endpoint. |
| R-07 cover/screenshot/created_with | NEW, small | The in-app "capture for the hub" screenshot is the highest-value item after R-01/R-02, per the hub. |
| R-08 Cloudflare deploy | ALREADY RECORDED | Identical to `creator-hub-design.md` §5.0. Consistent; no action. |
| R-09 analytics switch | ALREADY ADOPTED | §5.0. No action. |
| R-10 exportMode stamp | Nice-to-have | The stamp must NEVER become the gate — detection stays the control. |
| R-11 custom definitions in saves | **= [[B112]]** | Expanded spec of the banked `save-defaults-task.md`. Fold this text in when handing B112 out. |
| R-12 revision counter | NEW, IMPORTANT, cheap | Prevents real data loss (stale-export overwrite). Ride it WITH the B112 serialisation batch — same territory, same fixtures. |
| R-13 shipped-content manifest | **SHIPPED (stream M) at `/shipped-content.json`** | Build guidance, no decision needed: per the doc's own conclusion, per-entry `custom` flags win for SAVE contents, the manifest earns its place for ASSETS (star-type images, starter models). Built as a GENERATED file (`npm run manifest`) pinned by a spec that regenerates in memory and deep-equals it, so a new star image or a renamed calendar fails the suite until it is rebuilt. Shape and a worked example below. |
| R-17 open a map from a URL | **SHIPPED (stream M) — the parameter is `?open=`** | Banked verbatim below, added 2026-09-06; it arrived after this file was written. Built as a SPLIT of the existing `?hub=` door rather than a second path: `runHubOpen` (by code) and `runHubOpenFromUrl` (by address) both reach `openHubBytes`. The allow-list is DATA (`TRUSTED_OPEN_HOSTS` in `hubConfig.ts`) and the refusal precedes the fetch. **THE HUB MUST BE TOLD TWO THINGS:** the parameter is `open` on the QUERY STRING, not the hash; and `explorers.starsystemx.com` DOES NOT REACH THE HUB TODAY (measured 2026-09-06: it answers from Vercel with `DEPLOYMENT_NOT_FOUND`), so `open_in_sse_url` must carry the workers.dev download URL until the DNS moves. Both hosts are on the allow-list already, so the cutover needs no engine release. |

**Suggested batching:** (1) R-01-gap + R-02-regen + R-03, one small engine batch — unblocks the hub
entirely. (2) B112 + R-11 + R-12, the serialisation batch. (3) R-04 + R-05 + R-07 after the R-06
decision, the in-app funnel batch.

---

# Requirements for the Star System Explorer engine

**Written by the Creator Hub, for an agent working in the SSE repo. The hub does not edit that repo.**

Ordered by what unblocks what. R-01 and R-02 are the only ones the hub is currently *blocked* on;
everything else makes the funnel work properly from inside the app.

Each item states what to build and — more usefully — the trap the hub hit that makes it necessary.

---

## R-01. Stamp a `bundleFormat` integer in the document — BLOCKING

**What:** a single integer at the top level of `starmap.json` / `system.json`, written on every save.
Start at `1`. Bump **only** on a breaking layout change, never per release.

**Why.** There is currently no format version anywhere in the bundle. `appVersion` is a *build stamp*,
not a contract: v3.0.1 and v3.9.0 may have identical or incompatible layouts and nothing says which.
That was survivable while one codebase both wrote and read the format. **It is a time bomb the moment
a second codebase reads it** — which is now.

**Do not conflate it with `appVersion`.** They answer different questions and the hub stores both:

| | question | on change |
|---|---|---|
| `bundleFormat` | *can this parser read this layout at all?* | a number we do not know is **refused** |
| `appVersion` | *what could the app do when this was made?* | never a gate; a newer SSE loads an older map |

**Owner's decision, already taken:** stamp from here on out. Saves made before the stamp are accepted
by the hub as **legacy** and base-stamped as format 1 — so this does not need backfilling.

---

## R-02. Ship a canonical fixture bundle — BLOCKING

**What:** a real save, checked into the SSE repo at a stable path, that the hub's parser tests
against. Regenerate it and bump `bundleFormat` whenever the layout changes.

It should exercise the whole layout, and specifically:

- `starmap.json` **and** a `system.json` sibling — the hub handles both kinds
- `assets/models/<sha256>.glb`, with **one model shared by two nodes** (the "credited once" path)
- `assets/images/<nodeId>.<ext>` and `assets/images/player/<assetId>.<ext>`
- **one asset with full provenance and one with none**, so the public-sharing gate is exercised in
  both directions
- `ATTRIBUTIONS.md` and `README.txt`

**Why.** The hub's reader was written by reading SSE's source. That is evidence, not proof. Until a
real bundle has been through it, `KNOWN_BUNDLE_FORMATS` stays empty and **every upload is refused** —
which is the correct behaviour for a parser that has never seen the thing it claims to parse, and is
the single reason the hub is not open today.

**This is the contract test between the two repos and it costs one file.**

---

## R-03. Verify that a model's path hash matches its bytes on export

**What:** when writing `assets/models/<sha256>.glb`, assert the filename hash equals the hash of the
bytes being written. Fail the export loudly if not.

**Why.** The hub found this from the other side and it is worth closing at source. A bundle can name
a file after **any** hash. If a consumer keys anything on the path-supplied hash, a crafted bundle
naming a file after an already-approved asset inherits that approval while carrying different bytes.

The hub defends itself — it hashes the bytes and treats the path as a claim — but an engine-side
assertion turns a *silent* corruption into a caught bug, and costs one comparison on a code path that
already computed the hash.

---

## R-04. Upload, update and download from inside SSE

**What the owner asked for.** Three things, and they need hub API surface that is mostly already
built:

| in-app action | hub endpoint | notes |
|---|---|---|
| **Download / open** a hub map | `GET /api/download/<slug>` | no account, returns the bundle. Already live. |
| **Upload** a new map | `POST /api/upload` (multipart) | needs a signed-in session — see R-06 |
| **Update** an existing map | same, with `replaces=<systemId>` | **an update costs almost nothing** against the daily allowance: only *novel* asset hashes count |
| **Browse** | `GET /` and the system pages | SSR HTML today; a JSON index can be added when the app wants one — ask |

**Two things the app must send and it will be refused without them:**

1. **`attest=on`** — the provenance attestation. The exact wording the hub shows lives in
   `src/lib/attestation.ts`; the app must show the same text and send the confirmation. **Do not
   pre-tick it.** The whole point is that a person actually read it and took responsibility.
2. **`publishGmTree`** — absent means publish the **player** tree. `computePlayerSnapshot` already
   does the redaction; this flag only records which of the two the creator chose. **Never default it
   on.**

**And what the app should show back:** the upload response reports `mayPublish` and
`missingProvenance`. A map with uncredited assets uploads fine but **cannot be published** until the
creator fills the credits in — so the app should say so at that moment, in the editor, where the
fields actually are. That is a much better place to fix it than a web form.

---

## R-05. One-click open a hub map on startup

**What:** SSE accepts a hub map on launch and opens it, so a link on the hub is one click into the
app rather than a download-then-import.

Two mechanisms, and the web one is the important one:

- **Web:** `https://starsystemx.com/?hub=<slug>` — fetch `GET /api/download/<slug>`, open it. This is
  the funnel: a Discord link becomes a running system in one click.
- **Desktop/installed:** a `starsystemx://open?hub=<slug>` protocol handler, if and when there is an
  installed build. Not needed for launch.

**Two cautions.**

1. **Treat a hub map as untrusted input on the way in**, exactly as an imported file already is. The
   slug comes from a URL a stranger can craft.
2. **Do not auto-import into the current campaign.** Open it as its own thing, or ask. A link that
   silently merges a stranger's systems into somebody's live campaign is a bad afternoon.

---

## R-06. How the app signs in — a decision needed, not just a build

The hub uses Supabase auth. For the app to upload it needs a session, and there are two shapes:

- **(a) Device-code / paired link.** App shows a code, user approves it on the hub in a browser, app
  gets a token. No embedded browser, no password ever touches the app. This is the recommended one.
- **(b) OAuth redirect in a system browser** with a loopback or custom-scheme callback. More moving
  parts, better if there is ever an installed build.

**The hub has neither yet.** This needs a decision before R-04 can be finished, and it is the one
place these requirements need an answer rather than an implementation. Ask the owner.

**Whatever the shape: the app must never handle a password, and the token must be revocable from the
hub's account page.**

---

## R-07. Small, cheap, and useful

1. **A designated cover image.** Nothing in the bundle marks one, so the hub guesses: map background,
   then any player graphic, then the first body picture. A `coverAssetId` field would make it the
   creator's choice. Now less urgent — creators can upload screenshots on the hub and pick one — but
   still the tidier answer.
2. **A screenshot action in-app.** Creators are being asked to add screenshots to sell their maps; a
   "capture for the hub" button that produces a correctly-sized image would raise the quality of
   every hub page. This is probably the highest-value item on this list after R-01/R-02.
3. **Show `created_with` on load** when a map was made by an older build — a quiet marker, not a
   warning. It is a capability marker, so **never refuse to load on it**.

---

## R-08. The Cloudflare deploy of SSE failed — and NOT for the reason it looks like

**Observed, 2026-08-28**, deploying `star-system-generator@3.0.164` to Cloudflare Pages:

```
> star-system-generator@3.0.164 build
> wrangler types --check && node scripts/generate-examples-list.cjs && vite build

X [ERROR] Types file not found at worker-configuration.d.ts.
```

**The repository's build script is not that.** It is, in every worktree checked:

```
"build": "node scripts/generate-examples-list.cjs && vite build"
```

`wrangler types --check` **is not in the repo.** It was injected at deploy time by Cloudflare's own
auto-configuration — the stack trace shows `maybeRunAutoConfig` -> `runAutoConfig` -> `runCommand`.
Wrangler saw a SvelteKit project with **no `wrangler.toml` / `wrangler.jsonc` at all**, decided it
should have Workers types, prepended a check for `worker-configuration.d.ts`, and then failed
because nothing has ever generated that file.

> **So the SSE repo is not broken and its build script should not be "fixed" in response to this.**
> Editing it to satisfy an injected check would be patching a symptom that only exists because the
> project has no wrangler config for auto-config to read.

**The real fix is the adapter swap and a real `wrangler.toml`** — which is the migration, and the
migration is sequenced (below). If a green Cloudflare build is wanted *before* that, the options are:

1. **Commit a `worker-configuration.d.ts`** (run `wrangler types` once). This is the intended
   workflow and it makes `--check` meaningful; it must be regenerated when bindings change.
2. **Add a minimal `wrangler.toml`** so auto-config has something to read and stops guessing.
3. **Do not point Cloudflare at SSE yet** — see the ordering warning.

### THE ORDERING WARNING, and this is the important part

Deploying SSE to Cloudflare Pages **is the migration starting**, and `creator-hub-design.md` §5.2 is
explicit that its steps are sequenced for a reason:

1. push the `sw.js` cache-constant bump **to prod on Vercel first**, and let it propagate for days;
2. *then* swap the adapter and deploy to Pages in parallel on `*.pages.dev`;
3. verify with a hard reload and `?no-sw=1`;
4. cut DNS;
5. leave Vercel up for a week.

The cutover is **same-origin**, so every returning visitor's service worker survives the change of
host and will serve a Vercel-era precached shell that requests asset hashes Cloudflare does not
have. Step 2 before step 1 is exactly the shape of that failure.

**This is owner-and-coordinator work, not an agent job.** Recorded here so whoever picks it up knows
the failed build was auto-config, not a repo defect, and knows which step of a sequenced plan it
belongs to.

---

## R-09. Analytics must follow the deployment path — because for a while there are two

**Today:** `src/routes/+layout.svelte` calls `injectAnalytics` from `@vercel/analytics/sveltekit`,
and `@vercel/analytics` is a dependency.

**The problem is specific to the migration window.** §5.2 step 2 deploys to Cloudflare Pages **in
parallel** while Vercel is still serving production, and step 5 leaves Vercel up for at least a week
after DNS is cut. So for that whole period the same code runs on **both hosts**, and:

- Vercel Analytics on Cloudflare collects nothing and loads a script for no reason;
- Cloudflare Web Analytics on Vercel does the same in reverse;
- shipping both unconditionally double-counts every session on whichever host has both.

**Recommended shape — an explicit build-time switch, not host sniffing:**

```
PUBLIC_ANALYTICS = vercel | cloudflare | none
```

Each host builds separately, so a build-time constant is enough, and an explicit variable beats
detecting `VERCEL=1` / `CF_PAGES=1` because during a migration the thing you most want is to be able
to say *"this deployment reports here"* and have it be true — including being able to set `none` on
a pages.dev verification build so test traffic does not pollute either dataset.

Then in the layout: call `injectAnalytics()` only for `vercel`, and render the Cloudflare beacon
`<script>` only for `cloudflare`. Neither for `none`.

**Cloudflare's side needs no package.** Web Analytics is either a dashboard toggle on the Pages
project (Cloudflare injects the beacon itself — simplest) or a single deferred `<script>` with a
token. The hub does the token version in `src/routes/+layout.server.ts` and
`src/routes/+layout.svelte`, which is ~15 lines and can be copied verbatim.

**Do not remove `@vercel/analytics` until Vercel is actually switched off** (§5.2 step 5 keeps it
running for a week after DNS). Removing it early makes a rollback to Vercel a code change rather
than a DNS change, and the whole point of leaving Vercel up is that rollback stays cheap.

---

## R-10. Stamp the export mode — for the LABEL, not for the gate

**What:** an `exportMode: 'player' | 'gm'` field written at export, recording which the GM chose in
the Save modal.

**Why it is only nice-to-have.** The hub no longer asks the uploader which kind of save they are
uploading — it reads the file (`src/lib/bundle/gmContent.ts`), because the choice was already made
at export and asking someone to restate a fact is asking them to get it wrong. The wrong answer
there leaks a campaign.

**But the inference is asymmetric, and a stamp is what would close the gap:**

| the file | the hub can tell |
|---|---|
| contains GM notes / hidden objects / secret tags | **certainly a GM tree** — every one of those is removed by `computePlayerSnapshot` |
| contains none of them | a player export, **or** a GM export of a campaign with no secrets — genuinely indistinguishable |

That ambiguity is **safe** — a GM tree with nothing hidden in it has nothing to leak — so nothing is
blocked on this. What it costs is precision in the *labelling*: the hub cannot honestly print "this
is the player version" on a page, only "no GM-only content found".

> **CRITICAL, if this is built: the stamp must never become the gate.** It arrives inside a file a
> stranger uploaded, so it is a claim, exactly like `ATTRIBUTIONS.md` (`contract-with-sse.md` C-02).
> Detection stays the control; the stamp only makes the label certain. A stamp saying `player` on a
> file full of GM notes must lose to the detector, loudly.

---

## R-11. Put custom definitions in the save, under a predictable key

**The owner's framing, and it is the right one:** *"If players add their own custom gases, engines,
fuels, constructs, etc, then those are added to the starmap file - so if they are in, we know things
like Custom Gases: 3, Habitable Biospheres: 2, Custom Liquids: 4."*

That removes the need for a separate artefact library on the hub entirely. **The hub does not need a
"fuels" section; it needs the map to carry its own custom fuels**, and it will count them.

### What already works

Two containers already ride in a save and the hub already counts them:

| container | in the save as | shipped baseline |
|---|---|---|
| calendars | `temporal.temporal_registry` (keyed object) | the four in `static/temporal/calendars.json` |
| tag categories | `coiCategories` (array) | the nine SSE ships |
| points of interest | `poiPacks` (array) | none |

### What is missing

Custom **gases, liquids, fuels, engines, reactions** and **atmosphere mixes** have no container in
the save format. The hub already ships disabled rules naming the keys it will look for -
`customGases`, `customLiquids`, `customFuels`, `customEngines`, `customReactions` - as a **proposal**,
not a spec. Any consistent naming works; the hub adapts with a config edit, not a deploy.

**Two things that make the counting honest, and both are cheap:**

1. **Mark what is custom, or keep the shipped set stable and listed.** The hub subtracts a baseline
   of app-shipped names. A `custom: true` flag on each entry would be better still - it removes the
   baseline maintenance entirely.
2. **Do not write the whole shipped library into every save.** If a save carries all 24 shipped
   liquids plus one custom one, the hub must subtract 24 names it has to keep in step with. Writing
   only what the GM actually added or changed is clearer and self-describing.

### THIS IS A CORRECTNESS PROBLEM, NOT A SIZE ONE — and that is the stronger argument

Measured on the real 327 KB Local Neighbourhood starmap, because the size case is the one people
reach for first and it does not hold:

| | share of file |
|---|---|
| `systems` (the actual campaign) | 51% |
| **whitespace / pretty-printing** | **45%** |
| `coiCategories` (shipped defaults) | 2.6% |
| `temporal` (shipped calendars) | 1.0% |
| null / empty node fields | ~10% of node fields |

**So the shipped-defaults block is under 4% of the file.** Removing it saves almost nothing, and
**the 45% is whitespace that a `.sse.zip` compresses away to near-nothing anyway** — and which buys
the hand-editable, diffable working file that `io/bundle.ts` deliberately set out to produce. **Do
not chase it.** That trade was made on purpose and it was made correctly.

**The reason to fix this is that the file currently misdescribes itself.** A save carrying the
shipped calendar registry is claiming to define four calendars the GM never defined. Nothing reading
that file can tell the difference between "this campaign uses a custom reckoning" and "this campaign
was saved by SSE" — which is precisely why the hub's facet lied on every map until the baseline was
corrected.

A save should describe what the GM made. Everything else is the app's, and belongs in the app.

> **The trap, stated plainly because the hub already fell into it:** the first version of the
> calendar rule listed one shipped calendar instead of four, and reported *"3 custom calendars"* for
> every real starmap. A facet that is universally true is worse than no facet - it teaches people
> the pills cannot be trusted, which devalues every other pill beside it.

### Not needed

**No export/import of individual definitions.** A custom fuel travels inside the map that uses it,
which is also the only context where it means anything.

---

### R-11, THE CALENDAR HALF: DELIVERED (stream U, 2026-09-08)

The section above asks for two things and names the second *"Do not write the whole shipped library into every
save"*, with the calendars as its worked example: *"A save carrying the shipped calendar registry is claiming to
define four calendars the GM never defined."* That is now true of the calendars, and of nothing else yet.

**The container is UNCHANGED - still `temporal.temporal_registry`, the keyed object the hub already reads - so the
hub needs no config edit and no deploy.** What changed is what goes IN it: only the calendars the GM added or
altered. `activeCalendarKey` is still written whichever calendar it names, shipped or not, because WHICH reckoning
a campaign runs on is the GM's decision even when the calendar itself is ours.

**WHAT THIS MEANS FOR THE HUB'S BASELINE, and it is the whole point:** the four-name subtraction can go. A calendar
present in `temporal.temporal_registry` is now, by construction, a calendar the GM made or edited - so the count is
the key count, with no baseline to keep in step. **Keeping the subtraction is harmless** (it subtracts names that
are no longer there), which is why this is safe to ship before the hub changes anything. The trap the section warns
about - *"reported 3 custom calendars for every real starmap"* - is gone at the source rather than compensated for.

**OLD SAVES STILL CARRY ALL FOUR.** A campaign saved before this keeps its copies until it is next written, so the
baseline subtraction should not be removed until the hub is content to under-count a stale file by up to four. That
is the only reason to keep it.

```
SEAM REPORT | R-11 (calendars) | engine | beta v3.1.18 (da16b866) | prod: NOT RELEASED
sets:      nothing - the container and its key are unchanged
must know: a save written by v3.1.18+ carries ONLY GM-made or GM-edited calendars in
           `temporal.temporal_registry`; `activeCalendarKey` may still name a SHIPPED calendar and is not
           evidence of a custom one. Older saves still carry all four shipped calendars, so the hub's
           four-name baseline subtraction stays correct and should not be removed yet. Gases, liquids,
           fuels, engines and reactions are NOT delivered - R-11's main ask is still open.
verified:  full suite green (4630); three tests in `io/saveShape.spec.ts` pin a default campaign persisting an
           EMPTY registry, a GM-altered calendar still being persisted, and idempotence under a repeated autosave
not done:  the custom gases/liquids/fuels/engines/reactions containers R-11 actually asks for; and the
           calendar registry still uses its OWN merge rather than `rulePackOverrides`+`applyListDelta` like every
           other customisation (recorded as a duplication finding on G89, recommended and not done)
ready for: STREAM N - confirm the hub's calendar facet reads zero custom calendars on a freshly-saved
           default campaign, and still reads the right number on a campaign with a GM-made calendar
```

## R-12. A monotonic revision counter — this one prevents real data loss

**What:** an integer on the document that increments on every explicit save. `revision: 47`.

**The scenario, and it will happen:**

1. A creator uploads their campaign. The hub stores it.
2. Weeks later they find an older export in their Downloads folder and upload it as an update.
3. **The hub accepts it, replaces every row, and overwrites the stored bundle.** The newer version
   is gone — from the hub, and from anybody who would have downloaded it.

The hub cannot currently prevent this, because **there is nothing in a save that says which of two
exports is newer.** Verified across two real exports of the same map nine months apart:

| | fresh export | bundled example |
|---|---|---|
| `id` | `starmap-local-neighbourhood` | `starmap-local-neighbourhood` — **stable** |
| system ids | — | **42/42 shared** |
| `appVersion` | 3.0.190 | 2.1.692-beta |
| **revision / serial / updatedAt** | **none** | **none** |

`appVersion` is not a substitute: two saves from the same build are indistinguishable, and a creator
who has not updated SSE produces identical stamps forever.

**A file timestamp is not a substitute either.** It is a client clock, it survives copying badly, and
it is trivially wrong.

With a revision the hub can simply say: *"the copy you uploaded is older than the one already
published — did you mean to roll back?"* — and let the creator decide, instead of silently
destroying work.

> **Bonus, free with the same field:** `doc.id` being stable already means the app could offer
> *"this came from the hub — update your published version?"* without the creator hunting for their
> own entry. The revision is what makes doing that automatically **safe**.

---

## R-13. A machine-readable manifest of what SSE ships

**What:** one static JSON, served from the app, listing the content that ships with the build —
calendar names, tag category ids, star-type image paths, starter model paths, and later the shipped
gases/liquids/fuels.

```jsonc
{ "appVersion": "3.0.190",
  "calendars": ["Earth Gregorian", "Star Trek Stardate", "…"],
  "tagCategories": ["status", "owner", "…"],
  "starterModels": ["/models/nasa/iss.glb"] }
```

**Why: it removes an entire class of bug rather than one instance of it.** The hub has to tell
GM-authored content from app-shipped content, and right now it does that by **hardcoding lists
copied out of this repo**. That list drifted within an hour of being written — the calendar baseline
had one name where it needed four, and the facet lied on every map until it was corrected against
the real file.

Every such list is a standing promise to notice a change in another repository. **A manifest turns
that into a fetch.**

**This is the cheaper alternative to R-11's per-entry `custom: true` flag**, and it also covers the
cases a flag cannot: knowing that `/images/star_types/M.webp` is app artwork rather than a creator's
upload, which the hub currently decides by matching a path prefix.

**Either solves the problem; the manifest solves more of it.** If both happen, the flags win for
save contents and the manifest still earns its place for assets.

**SSE-SIDE STATUS, 2026-09-06 (stream M): SHIPPED on beta at v3.0.315, at `/shipped-content.json`.**
Fetch it from whichever origin you are talking to: `https://beta.starsystemx.com/shipped-content.json`
today, `https://starsystemx.com/shipped-content.json` once the owner has released it to production.
**CORS is not a problem and this was measured rather than assumed:** production and beta both serve
static JSON with `Access-Control-Allow-Origin: *` (checked 2026-09-06 against
`/temporal/calendars.json` on both hosts), so a browser on the hub's origin can fetch it directly.

**It is GENERATED, from the files that actually ship, and PINNED.** `npm run manifest` writes it;
`scripts/shipped-manifest/shippedManifest.spec.mjs` regenerates it in memory and fails the suite when
the checked-in copy disagrees. That is the point rather than a detail: a hand-written manifest would
be the hub's hardcoded list moved one repository over, drifting the same way and more quietly.

**The exact shape, with the real values of v3.0.315** (lists abbreviated; every list is sorted except
`tagCategories`, whose order is the order a fresh campaign shows them in):

```jsonc
{
  "_comment": "GENERATED by scripts/shipped-manifest/build-shipped-manifest.mjs - do not edit by hand. ...",
  "appVersion": "3.0.315",
  "bundleFormat": 1,
  "appAssetPrefixes": ["/images/planet_types/", "/images/star_types/", "/models/nasa/"],
  "calendars": ["Chinese Lunisolar (Simplified)", "Earth Gregorian", "Mayan Haab (Simplified)", "Star Trek Stardate"],
  "tagCategories": ["status", "owner", "purpose", "resource", "class", "drive", "frontier", "anomaly",
                    "universe", "disposition", "tech", "science", "intrigue"],
  "starterModels": ["/models/nasa/cassini.glb", "/models/nasa/hubble.glb", "/models/nasa/iss.glb",
                    "/models/nasa/juno.glb", "/models/nasa/mro.glb", "/models/nasa/voyager.glb"],
  "appImages": {
    "starTypes": ["/images/star_types/A.webp", "/images/star_types/B.webp", "..."],      // 18
    "planetTypes": ["/images/planet_types/C-type_asteroid.jpg", "..."]                    // 73
  },
  "gases": ["Ar", "Astrophage", "C2H6", "..."],                                           // 33
  "liquids": ["ammonia", "ammonium-hydrosulfide", "...", "water", "water-ammonia"],       // 24
  "fuels": ["fuel-antimatter", "fuel-argon", "...", "fuel-xenon"]                         // 14
}
```

**`appAssetPrefixes` is the field that replaces the prefix matching the hub does by hand.** Everything
under one of those paths is app artwork; anything else on a node came from the creator. The two
`appImages` lists are the complete contents of those prefixes, so the hub can match either way.
**`planet_types/thumbs/` is deliberately absent** - those thumbnails are derived at display time by
`thumbUrl()` and never stored on a node, so they cannot appear in a save; listing them would be 73
paths the hub can never meet. `images/ui` and `images/logo` are absent for the same kind of reason:
they are chrome and never land on a body.

**Where each list comes from, so the hub knows what it is reading:** `calendars`, `gases` and `fuels`
ship in `static/` (the temporal registry and the starter-sf rule pack); `liquids` is the app default
and a rule pack MAY replace it; `tagCategories` are the categories a fresh campaign starts with,
taken from `pristineTagCategories()` - the same baseline R-11's delta uses, so the two agree by
construction rather than by promise.

**The hub can now delete its hardcoded baselines.** The gases/liquids/fuels the requirement listed as
"later" are in from the start, because they were named in it and the sources were unambiguous.

---

## R-17. Open a hub map from a URL — one click from a map page into the app

**The owner's ask (2026-09-05):** *"how feasible is just an 'open in SSE' button next to download -
instead of the Open SSE at the top - it is just 'open this in SSE'."*

**What the hub does.** When the config row `open_in_sse_url` is set, every map page shows "Open in
Star System Explorer" beside the download. The link is that URL with the map's download URL
appended, percent-encoded:

```
https://starsystemx.com/?open=https%3A%2F%2Fexplorers.starsystemx.com%2Fapi%2Fdownload%2Flocal-neighbourhood
```

`GET /api/download/<slug>` already answers cross-origin: `access-control-allow-origin: *`, no
credentials, on success and on error alike (the hub's `cors.ts`, learned the hard way). So there
is no CORS problem to solve on the engine side: a plain `fetch` of that URL from starsystemx.com
works today and returns the `.sse.zip` bundle, reassembled from approved assets only.

**What the engine needs to do.**

1. On load, read `open` from the query string (or the hash — the hub can send either; say which).
2. Accept it only when it is an `https:` URL on a host the engine trusts — the hub's domain, its
   workers.dev name while that lasts, a `pages.dev` preview. Anything else is ignored with a
   plain message. A URL parameter that the app will fetch and load is an SSRF-shaped thing; the
   allow-list is the whole defence.
3. `fetch` it, and hand the bytes to the existing bundle import path — the same one the file
   picker uses — so provenance, attributions and the format gate behave exactly as for a file.
4. Then behave as a normal import would: ask the same "replace or add?" question the picker asks,
   in the same words. Do not auto-replace a campaign somebody has open because a link said so.
5. Strip the parameter from the address bar once handled, so a reload does not import twice.

**What the hub will set.** The URL template goes in `open_in_sse_url`, e.g. `https://starsystemx.com/?open=`
— the engine tells the hub the exact parameter name and the hub sets the row. Until then the button
is not shown; nothing ships dead.

**Not asked:** deep-linking to an object inside the map on open. The clip's `#node=<id>` already
does that on the hub side; the engine can honour a second parameter later if it wants to.

**SSE-SIDE STATUS ADDENDUM, 2026-09-06 (coordinator): THE DNS MOVED AND `explorers.starsystemx.com` IS LIVE.** MEASURED FROM THE COORDINATOR'S MACHINE 2026-09-06 after the owner's cutover: `starsystemx.com`, `beta.` and `legacy.` still answer `Server: Vercel` (SSE untouched, as planned); `explorers.starsystemx.com` answers `Server: cloudflare` with `x-hub-version: 0.23.1`; `GET /api/download/local-neighbourhood` on it returns 200 `application/json` (334,708 bytes) with `Access-Control-Allow-Origin: *`; nameservers are `dave.ns.cloudflare.com` / `gwen.ns.cloudflare.com`. Both hosts were already on `TRUSTED_OPEN_HOSTS`, so no engine release was needed; the hub may now embed explorers download URLs in its `?open=` links, and Stream N's check N-1 is runnable against the real hostname. The "does not reach the hub" caution below is history from the morning of the same day.

**AND THE HALF THAT DID NEED A RELEASE - v3.0.330.** "No engine release was needed" is true of
REACHABILITY and not of ADDRESS. `HUB.origin` and `HUB.browseUrl` still named the workers.dev host,
so every link the app HANDED A GM - `hubMapUrl`, the Browse control on the load doors, the "Open the
map library" button on a failed open, `shareableAppLink` - carried a hostname the hub had moved off
while the hub itself had already switched to publishing `explorers` URLs. They now point at
`explorers.starsystemx.com`; the workers.dev name stays on the allow-list because it still answers
and links carrying it are in the wild. **The two absolute assertions written to make this deliberate
both went red and had to be edited by hand, which is what they were for.** One trap the move exposed
and closed: `parseHubReference` compared a pasted link's host against `HUB.origin` alone, so a
`.../s/<slug>` link on the old name would have stopped being recognised the moment the origin moved;
`isHubHost` is now the single answer to "is this host the hub?", shared with `isTrustedOpenUrl`.
**Nothing is asked of the hub by any of this.**

**SSE-SIDE STATUS, 2026-09-06 (stream M): SHIPPED on beta at v3.0.314.** The parameter is `open`, on
the **query string** — the hub asked which, and this is the answer. Every numbered point above is
built and was walked in a real browser against the live hub: with no campaign in this browser the map
opens straight away; with one it asks the picker's own question and keeps the replaced campaign under
the single step back; a refused host shows a plain message and **no request is made at all**; and the
parameter is off the address bar in every one of those cases, including the refusal.

**Two things the hub needs from this, and the second is the one that would have shipped a dead
button.** (1) The prefix is `https://beta.starsystemx.com/?open=` as soon as beta carries it, and
`https://starsystemx.com/?open=` only when the owner has released it to production — production is a
read-tree release of beta on his explicit word, and nobody should tell the hub prod carries this until
he has said so. (2) **`explorers.starsystemx.com` does not reach the hub.** Measured 2026-09-06:
`GET https://explorers.starsystemx.com/api/download/local-neighbourhood` answers `404` from **Vercel**
with `X-Vercel-Error: DEPLOYMENT_NOT_FOUND`, while the workers.dev origin answers `200` with
`access-control-allow-origin: *` and `x-hub-version: 0.19.2`. R-17's own example URL uses the
`explorers` host, so a button built from it today would fail for every visitor. Set `open_in_sse_url`
to append the **workers.dev** download URL until the DNS moves; no engine change is needed on the day
it does, because both hosts are already on the allow-list.

**The download-format question is CLOSED, and the hub answered it in its own half** (`sse-requirements.md`,
R-17, 2026-09-06), quoted rather than retold: *"`/api/download/<slug>` serves the bundle reassembled from
approved assets — `.sse.zip` when the upload carried assets, and the plain `.json` document when it did
not (`server/pack.ts`: an assetless save has nothing to withhold and nothing to repack)."* Both go through
`classifySaveFile`, so nothing on this side cares which arrives. No action.

**RE-VERIFIED ON THE DEPLOYED BETA, 2026-09-06, not on a dev server.**
`https://beta.starsystemx.com/?open=<the workers.dev download URL, percent-encoded>` opened Local
Neighbourhood straight away in a browser with no campaign, and stripped the parameter; a look-alike host
(`explorers.starsystemx.com.evil.example`) gave the plain refusal naming the host and no offer. **A deploy
landed between the two checks** — the manifest read `appVersion` 3.0.318 for the first and 3.0.319 for the
second — so both were seen, on two consecutive builds, and R-17's code is unchanged since v3.0.314. The
`explorers` host was re-measured at the same time and still answers 404 from Vercel.

**AND ONE THING THE HUB'S R-18 WAS WRITTEN WITHOUT, because it read the tree at v3.0.314-316:
SINCE v3.0.317 THE ENGINE CAN ALREADY OPEN A SINGLE SYSTEM FROM A HUB REFERENCE — just not from
`?open=`.** [[A95]] gave File > Load System a paste field, and `openSystemFromHub` → `openSystemBytes`
fetches, classifies and opens a SYSTEM there; a campaign pasted into that door raises the existing
sister-file offer instead. So R-18 is an ENTRY-POINT change rather than a new capability: route
`?open=`'s system branch into the door that already exists, instead of refusing it. **The engine will not
say it is verified, because it is not:** the library holds exactly ONE map and it is a campaign
(`/api/maps`, count 1, measured 2026-09-06), so there is nothing on the hub to point a system link at.
What was SEEN is a campaign reference pasted into Load System fetching, classifying and raising the
sister-file offer; the system arm of the same function is gated but has never met a real hub system.
**Worth saying plainly for sequencing:** R-18's premise that the library will be mostly single systems is
a forecast about a library that currently has one map in it, and that is an argument about when, not
whether.

---

## R-14 addendum — what the ENGINE depends on in a clip's nodes. SETTLED 2026-09-06; nothing was added.

**The hub offered to add optional data to a clip so the app could tell what it IS. The engine
declined, because it already has what it needs — and what it asked for instead was a promise.**

**WHAT THE ENGINE READS, and why it is these two fields.** `describeClipRoot` and
`describeClipCompact` turn a clip into the words on the pill and in the right-click menu ("System
Sol", "Planet+7"), and `systemNodesFromClip` decides whether a clip may become a system of its own
on the starmap. Both key on **`kind`** and **`roleHint`** on the clip's nodes, and nothing else:
`kind` separates a body from a barycentre from a construct, and `roleHint` separates a star from a
planet from a moon from a ring. A clip whose root resolves to a star — including a BARYCENTRE of
stars, which is what a binary's root is — can land in empty space as a new system; anything else is
offered "into a system…" instead.

**WHY IT WAS A PROMISE RATHER THAN A FIELD.** The hub builds a clip node as `snippetFor(node)` =
`{...node}` minus `gmNotes` and bundle-local assets, so both fields survive today by virtue of the
spread. That is an accident of the implementation, not a commitment — and if `snippetFor` ever
became a whitelist, "Paste as a new system" would stop being offered for every hub clip with no
error and no failing test on this side, just an option quietly greying out. An explicit `rootKind`
on the envelope was declined for the reason DATA-R4 gives: a claim in a file is a claim, so the app
would have to verify it against the nodes anyway, and a second answer to "what is this clip" is the
duplication both repositories keep unpicking.

**THE HUB'S HALF, quoted from its `docs/sse-requirements.md` (R-14 addendum, hub 0.37.0) rather
than retold:**

> - **PROMISED.** `snippetFor` (`bundle/normalise.ts`) is a DENY list and stays one; if it ever
>   becomes a whitelist, `kind` and `roleHint` are the two names that must be on it. The paragraph
>   above is quoted in the code beside it.
> - **PINNED.** `tests/clip.test.ts` asserts both survive a real node, alongside what must NOT
>   survive (`gmNotes`, bundle-local `image` and `model`). A silent loss is the worst-shaped
>   failure there is, so it is a test rather than a habit.
> - **DECLINED, agreed.** No `rootKind`, no envelope change, no `CLIP_FORMAT` bump. Two answers to
>   one question is the fault, not the fix.

**ENGINE-SIDE STATUS, 2026-09-06: NO WORK OWED, and no change is wanted.** The dependency is
recorded here so that a future reader of either repository can see that the two fields are load
bearing rather than incidental. If the hub's pin ever goes red, the engine symptom to expect is the
starmap's "Paste … here" greying out for every clip from the library while the in-app copy path
carries on working — which is a confusing shape, and is exactly why the promise was worth asking for.

---

## The shared heading face — ANSWERED 2026-09-06. ROUND, at scale 3.

**The hub sent a recipe rather than a request** (`docs/prompt-for-sse-2026-09-06-headings.md`, hub
v0.40.1) and asked one thing back: *"a line saying which alphabet you used and at what scale, so the
hub can match it if the two ever sit side by side — a map card on the hub and the same map's heading
in the app should not be set in two different faces by accident."*

**The answer: `ROUND`, at `scale = 3`, for the rail wordmark `SSE3.1` (engine v3.0.350).** That is
35 columns by 7 rows, rendered 105 x 21 css pixels, in `currentColor` so it takes the theme's
`var(--accent)` like every other accent in the app.

**ROUND because of the hub's own trap 2:** NARROW's letters are three columns and it does not define
a full stop, so `SSE3.1` set in NARROW would put a five-wide stop beside three-wide letters. The
engine's `pixelFont.spec.ts` pins that fact rather than leaving it as folklore - it asserts the
punctuation lives in the base set only and that the fall-through costs the wordmark six columns.

**What was copied, and what was not.** `GLYPHS`, `GLYPH_H`, `fold`, `ROUND` and `NARROW` verbatim,
plus `runs`, `textRows` and `gridWidth`, into ONE module (`src/lib/ui/pixelFont.ts`) rather than the
hub's four files - everything below `fold` in the hub's `font.ts` paints into a Worker raster and is
no use in a browser. `textRows` took the one-line change the recipe specified, to accept a family.
Copied and not imported, on the hub's own advice.

**The identical-glyph test came with it, and it earned its keep immediately in a second role the hub
did not need it for:** three hundred lines of `#` and `.` moved between two repositories, and a
botched paste is exactly as invisible as a badly drawn letter. It was seen RED against a duplicated
`V`, a dropped `Z` and a six-row `A`.

**NO GLYPHS WERE ADDED OR EDITED**, so the hub's offer to take changes back has nothing to collect.
If this side ever draws lowercase or a fourth alphabet, the hub has asked to be told.

---

## What the hub will NOT ask the engine to do

Recorded so nobody builds them by mistake:

- **No hub rendering, no engine on the hub.** Cover image, data, copy-paste snippets. Settled.
- **No moderation in the app.** Review is a hub concern; the app never needs to know a verdict.
- **No provenance parsing from `ATTRIBUTIONS.md`.** It is a human document and the hub treats it as a
  claim. The gate is computed from the node fields. Do not add machine-readable structure to it on
  the hub's behalf.

**SSE-SIDE STATUS ADDENDUM, 2026-09-08 (coordinator 8): RELEASED TO PRODUCTION as v3.1.0** (pushed by the owner
2026-09-07, `c0a3889a`; prod and beta were byte-identical at the release commit). Production now carries R-14
(paste from the hub), R-16 (credit on paste), R-17 (open from a link, parameter `open`), R-13
(`/shipped-content.json`) and the address change to `explorers.starsystemx.com`. **The hub MAY NOW set
`open_in_sse_url` to `https://starsystemx.com/?open=`**; the beta prefix stays valid. The hub records what it
sets, in its own half, when it sets it.

---

## R-19 — a hub clip carries the custom rules its objects need (hub v0.49.0, 2026-09-08)

**The hub's half is SHIPPED AND LIVE.** Its brief for this side is
`C:\Development\starsystemx-creator-hub\docs\prompt-for-sse-2026-09-08-clip-rules.md`, quoted here rather than
paraphrased where it matters. **SSE-SIDE STATUS: JOBS 1 AND 2 OF 5 SHIPPED, beta v3.1.41 - the envelope parses, and
the comparison answers ABSENT / IDENTICAL / DIFFERENT per definition. The MERGE (jobs 3-5) is not built, so a clip's
rules still do nothing on arrival.** Board row [[G92]].

**JOB 2 SHIPPED THE COMPARISON, and it needed something extracted first.** `compareClipOverrides` answers one of three
per DEFINITION - never per section, because `applyStarmapOverrides` is a shallow section-level spread that would
replace a GM's whole liquids override with the incoming one. `canonicalJson` is REUSED, not rewritten, exactly as the
triage asked. The extraction: **`effectiveRulePack` moved out of `src/routes/+page.svelte` into
`src/lib/rulepack/effectivePack.ts`**, unchanged, pinned bit-for-bit against the old expression over twenty cases by
`effectivePack.spec.ts`. It had to: "does this campaign already have that definition?" cannot be answered without that
merge, it was unreachable from anywhere but that component, and writing a second copy is precisely the fault
[[B147]] was - twice.

**AND THE DESTINATION IS ASKED OF ITS EFFECTIVE PACK, NOT ITS OVERRIDES.** A campaign with no `water` override is
still USING water, so a clip carrying the shipped water unchanged must compare IDENTICAL against it. Asking the
overrides alone would call it absent and store a redundant override that freezes that definition against every later
improvement to the pack - `rulepackDelta` cost #2, introduced by a paste.

**JOBS 3 AND 5 SHIPPED THE MERGE AND THE REPORT.** Add / discard silently / NEVER overwrite, per definition. A clash
renames the incoming definition, repoints the pasted nodes, and repoints any incoming definition that named it -
an engine names its fuel by id, so a renamed fuel would otherwise hand the GM an engine with no fuel, which is the
hub's own clip 1 exactly. A second paste of a conflicting clip finds its earlier rename and reuses it. The three
delta sections are written back AS DELTAS. The merge runs BEFORE `process()`, because every derived quantity reads
the effective pack and pass 1 is what a GM sees. Engine map DATA-R48.

**ONE CONSEQUENCE WORTH THE HUB KNOWING, though it asks nothing of them (DATA-R49): `pigmentModel` cannot travel.**
It is a bag of scalars, and `pigmentModel(pack)` always answers with a complete config - so no field is ever ABSENT
in the destination, and a field that differs cannot be renamed because the field IS the name. It is REPORTED
instead ("kept your own captureWeight"). Reporting rather than silence is still the whole difference from the bug.

**GATED AGAINST THE HUB'S OWN SEVEN FIXTURES.** `docs/clips/` in the hub repo, produced by its `buildClip`/
`buildRulesClip` and asserted by its own test. They are READ WHERE THEY LIVE and never copied into this repo - one
copy, on the side that generates them - and the spec skips gracefully when the hub repo is not on the machine. All
seven behave as the README says.

**ONE THING IS WRONG ON THAT SIDE, and it is a fixture shape rather than a contract change. THE HUB'S CLIPS PUT THE
LIQUID IN `hydrosphere.liquid`; THIS ENGINE READS `hydrosphere.composition`** (`types.ts:111`), and nothing anywhere
in the engine reads `.liquid` - grepped. So clip 1's stated expectation, "Bellwether's hydrosphere resolves", cannot
come true however well the merge works: the rules arrive, the body looks up a name under a field nothing reads,
`liquidDef` returns undefined, and it falls back. That is R-19's own bug arriving by another door. **The fix is one
word in the hub's generator** (`liquid` -> `composition`, clips 1, 2, 3, 4 and 6); the hub has offered to move it.
Reported to the owner 2026-09-08. The clip-4 repoint gate sets `composition` by hand meanwhile, so it tests the
repoint rather than the mismatch, and that line goes when the fixtures move.

**WHAT JOB 1 SHIPPED.** `rulePackOverrides` is an optional key on `HubClip`, shape-checked and carried whole
(`parseHubClip`); a RULES-ONLY clip - `nodes: []` and no `root`, which is the pair the hub uses to tell its two
producers apart - parses instead of being refused, describes itself as `Rules (2 liquids)` and is turned away by both
node paste paths in plain words rather than half-handled. `readClipOverrides` keeps only the sections this engine can
merge and DROPS the rest, deliberately: carrying a section nothing can compare would be a promise the merge cannot
keep, and the envelope's version gate already covers a clip from a newer producer. `src/lib/io/clipRules.ts` carries
the whole argument; `src/lib/io/clipRules.spec.ts` the gates.

**AND THIS APP IS THE THIRD PRODUCER, which the contract had not noticed.** `buildClip` - the GM's own Copy, added
2026-09-05 - had R-19's bug in full: copy a body out of one campaign, load another, paste, and its custom liquid did
not come with it. It now carries the campaign's overrides on the same key. Within ONE campaign every definition will
compare IDENTICAL and be discarded in silence, so a same-campaign copy costs nothing. **This is an SSE-side extension
of the hub's envelope, on the same footing as `credits` and `systemName`: the hub neither sends nor reads it, and
both readers leave fields they do not know alone.** The owner approved it, 2026-09-08.

**THREE CORRECTIONS TO THE TRIAGE ABOVE, measured on this side while building job 1.** They do not change what the hub
sends; they change what this side had to build.

1. **THERE ARE THREE DELTA SECTIONS, NOT TWO.** `liquids` joined `morphologies` and `pigments` at D25 -
   `effectiveRulePack` reads it through `applyListDelta` - but its declared type still said `LiquidDef[]` and the
   reader was casting to `any` to say what the type would not. The type is now
   `PackListDelta<LiquidDef> | LiquidDef[]` and the cast is gone. Anything that enumerates the delta sections from the
   type alone was wrong.
2. **THERE IS A NINTH KEY.** `pigmentModel` is a `Partial<PigmentModelConfig>` - a bag of scalars, neither a list nor
   a delta. Both the hub's brief and this file's own triage said EIGHT sections. Left out, a campaign's pigment
   weightings would have been the one customisation that silently did not travel, which is R-19's own bug in
   miniature. It is compared and merged per FIELD, because one changed weight is one setting.
3. **THE NINE KEYS ARE STORED IN FIVE SHAPES, not one**, and `effectiveRulePack` has a hand-written arm for each:
   upsert-by-id (`fuelDefinitions`, `engineDefinitions`, `sensorDefinitions`), record spread (`gasPhysics`),
   whole-list replace of a distribution's entries keyed at `value.name` (`atmosphereCompositions`), delta-or-list
   (the three above), and scalar spread (`pigmentModel`). The merge drives off ONE TABLE (`SECTIONS`) rather than a
   nine-way branch repeated per question.

**AND THE DECISION THE HUB ASKED THIS SIDE TO MAKE AND WRITE DOWN** - whether a delta section is compared as a delta
or as its applied result - **is ANSWERED: by its APPLIED RESULT**, engine map `DATA-R46`. A delta is a set of edits
against a base, so its meaning is not in the delta at all: an incoming `{ boilK: 400 }` for `water`, against a
destination with no water override, is not an absent definition to be added but a DIFFERENT water from the one that
campaign already has. Comparing deltas would add it and silently change a definition every body in the map reads.

**NOT TOLD TO THE HUB, because it is not the hub's business and nothing on that side changes:** two rule-pack editors
on this side were found to disagree with the engine about what a delta is, and both lost data in silence. Fixed in the
same push, board row [[B147]].

**WHAT IT CLOSES, and it is a wrong answer rather than a missing feature.** Custom definitions live on the
STARMAP, in `rulePackOverrides` (`types.ts:1608`), not on the node; a hub clip carries nodes only. So a pasted
planet whose hydrosphere names a GM's custom liquid looks up a definition that is not there, `liquidDef` returns
`undefined`, and phase, appearance and climate all fall back to defaults. **The paste reports success.** Silent
for every override kind: liquids, gases, atmosphere mixes, pigments, morphologies, fuels, engines, sensors.

**WHAT ARRIVES.** One new optional key on the envelope, `rulePackOverrides`, carrying the source map's
`RulePackOverrides` whole and unmodified. Nothing else changed, and an engine that ignores the key behaves
exactly as today. A RULES-ONLY clip (from the hub's `/rules` browser) has `nodes: []` and no `root`; that pair
is how a reader tells the two producers apart, deliberately not a second marker.

**THE COORDINATOR'S TRIAGE, 2026-09-08 — three things measured on this side that the hub could not know:**

1. **`canonicalJson` ALREADY EXISTS and is already justified** — `src/lib/io/shippedDefaults.ts:31`, keys sorted
   recursively, arrays left alone: exactly the comparison the hub asks for, with a measurement behind it (three
   of nine shipped categories fail a naive deep-equal purely on key order after a store round trip). **The
   stream reuses it. It does not write a second one** — that is the duplication rule, and a second canonicaliser
   is the most obvious way to make the identical-definition test disagree with itself.
2. **TWO OF THE EIGHT SECTIONS ARE DELTAS, NOT LISTS**, and the hub's brief treats the bag as flat because from
   its side it is: `morphologies?: PackListDelta<MorphologyDef> | MorphologyDef[]` and `pigments?: ... `
   (`types.ts:1384-1385`, machinery in `lib/rulepackDelta.ts`). A delta is a set of edits AGAINST THE SHIPPED
   PACK, so "does the destination already have this one, identical?" is a different question for those two, and
   merging two deltas is not merging two lists. **This is the stream's real work and its first job.**
3. **THE EXISTING MERGE WOULD DESTROY THE GM'S OWN RULES.** `applyStarmapOverrides` (`routes/+page.svelte:200`)
   is a SHALLOW spread, `{ ...existing, ...incoming }` — section-level, so an incoming `liquids` array replaces
   the GM's entire liquids override rather than joining it. It is right for an editor handing back a whole
   section and catastrophic for a paste. **The paste merge is PER DEFINITION and must not go through that
   function.**

**THE ASK, in the hub's own words where it is a rule:** narrow the overrides to what the pasted nodes reference
then merge (*"merging the lot is an acceptable version one"* — the owner); three outcomes per definition, **add /
discard silently when identical / NEVER OVERWRITE when different** (*"the receiving end needs to identify
duplicates to what it had and discard"*); rename an incoming clash and repoint the pasted nodes at the new name,
or ask; compare canonical form; say what came with it; and let a rules-only clip merge rather than be refused
(`hubClip.ts:116` currently rejects `nodes.length === 0`).

**NOT ASKED FOR:** any change to `?open=`, `?hub=`, `isTrustedOpenUrl`, the replace-or-add question, the storage
shape, or any further envelope key.

**FLAGGED BY THE HUB, no action asked:** `tagVocab` is on `RulePack` but NOT on `RulePackOverrides`, so a custom
tag's definition cannot travel even though the tag on the node does. Recorded here so it is not rediscovered.

**READY FOR STREAM N** once both halves are in, with the hub's own check: copy a body with a custom liquid,
paste into a fresh campaign, confirm the liquid arrived and the body's phase is right; paste the same clip again
and confirm nothing is duplicated or renamed.
