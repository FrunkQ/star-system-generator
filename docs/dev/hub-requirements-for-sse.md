# Hub requirements for the SSE engine — coordinator triage, 2026-08-30

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
| R-06 auth shape | **OWNER DECISION** | Device-code pairing (hub-recommended, coordinator concurs — no password ever near the app) vs OAuth redirect. Blocks R-04. |
| R-07 cover/screenshot/created_with | NEW, small | The in-app "capture for the hub" screenshot is the highest-value item after R-01/R-02, per the hub. |
| R-08 Cloudflare deploy | ALREADY RECORDED | Identical to `creator-hub-design.md` §5.0. Consistent; no action. |
| R-09 analytics switch | ALREADY ADOPTED | §5.0. No action. |
| R-10 exportMode stamp | Nice-to-have | The stamp must NEVER become the gate — detection stays the control. |
| R-11 custom definitions in saves | **= [[B112]]** | Expanded spec of the banked `save-defaults-task.md`. Fold this text in when handing B112 out. |
| R-12 revision counter | NEW, IMPORTANT, cheap | Prevents real data loss (stale-export overwrite). Ride it WITH the B112 serialisation batch — same territory, same fixtures. |
| R-13 shipped-content manifest | NEW | Build guidance, no decision needed: per the doc's own conclusion, per-entry `custom` flags win for SAVE contents, the manifest earns its place for ASSETS (star-type images, starter models). |

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

---

## What the hub will NOT ask the engine to do

Recorded so nobody builds them by mistake:

- **No hub rendering, no engine on the hub.** Cover image, data, copy-paste snippets. Settled.
- **No moderation in the app.** Review is a hub concern; the app never needs to know a verdict.
- **No provenance parsing from `ATTRIBUTIONS.md`.** It is a human document and the hub treats it as a
  claim. The gate is computed from the node fields. Do not add machine-readable structure to it on
  the hub's behalf.
