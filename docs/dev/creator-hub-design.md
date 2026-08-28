# Creator Hub — design

STATUS: DESIGN ONLY, 2026-08-28 ([[G55]]). Nothing is built. The owner supplied an architecture and
migration plan; this document grounds it against what SSE already ships, records the four scope
decisions he took, and names what the plan does not yet cover.

**THE HEADLINE: roughly half of Part 1 already exists in this repo and matches the plan closely.**
The save-bundle format, the content-addressed asset layout, the `ATTRIBUTIONS.md` generator with its
provenance gate, and the player redaction are all built and shipped. The hub's real work is the
server side, the funnel, and one seam between two repositories.

---

## 1. The four decisions, taken 2026-08-28

| | decision | consequence |
|---|---|---|
| **What publishes** | Creator picks, with a preview of what will go public | Reuse `computePlayerSnapshot` — it already does all of it (§3.1) |
| **Where it lives** | **A separate SvelteKit project** — *"cross over is not huge and totally different use cases"* | The shared surface is a CONTRACT, not a package (§4) |
| **What a page shows** | Cover image, data, copy-paste JSON snippets. **No rendered preview** | No engine on the hub at all |
| **What a page is FOR** | *"it is one click to download - we want peeps using SSE"* | **The hub is a funnel, not a destination** (§2) |

---

## 2. The hub is a funnel — and that should shape every page

The owner's framing settles a lot of design that would otherwise be argued: **the purpose of a hub
page is to get a bundle into somebody's SSE.** Not to browse, not to preview, not to be a nice place
to spend time.

- **Download is the primary action and it is one click.** Above the fold, above the description,
  above everything. No account required to download.
- **No 3D preview and no rendered preview of the system.** The cover image is the only picture, and
  it is an asset the creator already has in the bundle.
- **Copy-paste JSON snippets stay** (Part 1 §3) but are SECONDARY — the cheap way to lift one body or
  construct without taking the whole map. They serve the same funnel: a snippet used is SSE opened.
- **Every page says what SSE is and links to it.** A visitor arriving from a Discord link may never
  have heard of the app; the page's job is to fix that in one screen.

**A consequence worth stating: the hub does not need to be fast at rendering, it needs to be fast at
LOADING.** That is an SSR-and-a-cover-image page, which Cloudflare Pages serves essentially for free,
and it is the whole reason the OG-preview work in Part 1 §5 matters more than any in-page richness.

---

## 3. What already exists — do not rebuild any of it

### 3.1 Redaction: `computePlayerSnapshot` already does the whole job

Owner: *"we kinda do that already on exports - for player versions"* — correct, and it is more
complete than that suggests. `src/lib/system/utils.ts:40` already:

- deletes `gmNotes` **on every node AND on the system itself**
- runs `redactTagsForPlayers`, which is the SINGLE redaction site by design
  (`tagLifecycle.ts:237`; `mapHighlights.ts` notes a second site is how a leak happens)
- strips secret override anomalies, and the node `description` where it is GM-facing
- propagates hiding down subtrees, so a hidden parent cannot leak through its children

The Save modal already offers GM / Player as a mode (`SystemView.svelte:1520`). **The hub's
"creator picks" is that same choice, made at upload, with the result shown before publish.**

> **THE GATE IS: publish what `computePlayerSnapshot` returns, unless the creator explicitly chooses
> to publish the GM tree, having been shown what that includes.** Never silently publish a GM tree.

### 3.2 The bundle format is exactly the plan's format

`src/lib/io/bundle.ts` already writes precisely the layout Part 1 §2 describes:

```
starmap.json | system.json                the data, assets referenced not inlined
assets/models/<sha256>.glb                content-addressed — shared hulls stored once
assets/images/<nodeId>.<ext>              body/construct pictures
assets/images/player/<assetId>.<ext>      logos, overlays, map background
ATTRIBUTIONS.md                           generated (§3.3)
README.txt                                a human explanation of the layout
```

`sniffBundle` decides by zip magic number, never by extension. Extension is `.sse.zip`. A plain
`.json` save with no assets still loads and *"always will"*.

> **USE `fflate`, NOT `JSZip`.** The plan names JSZip; SSE already ships `fflate` and
> `readZipMembers` (`src/lib/import/shared/zip.ts`), and they already parse this exact layout.
> Adding a second zip library to read a format the first one writes is the duplication fault this
> codebase names as its most recurring. **The hub is a separate repo, so it may pick its own — but
> it should pick `fflate` for the same reason, and because the read code it needs is small enough to
> mirror rather than invent (§4).**

### 3.3 Attribution and the public gate are built

`src/lib/io/attributions.ts` already produces `ATTRIBUTIONS.md` with `path`, `kind`, `usedBy`,
`title`, `credit`, `license`, `sourceUrl` — and it already emits the literal string
**`_No provenance recorded._`** plus a count of how many assets are missing it.

Its own header anticipated the hub: *"It is also a WORKING DOCUMENT, not a formality: it names the
assets with nothing recorded, so a GM can see what they still need to fill in before sharing."*

> **THE PUBLIC-SHARING GATE IN PART 1 §4 IS THEREFORE `missing.length === 0`.** Not new work. The
> only new part is enforcing it server-side as well as client-side, which the plan already says and
> which is correct — a client gate is a courtesy, not a control.

### 3.4 Content addressing is worth more than the plan claims

Models are **already keyed by sha256**. Key R2 objects by that same hash and three things fall out
for free:

1. **Cross-user dedup.** Two creators sharing the same hull store one object, not two.
2. **A cheap skip.** The presigned-upload step can `HEAD` by hash first and upload only what is
   absent — for a popular model, most uploads transfer nothing at all.
3. **Immutability.** A content hash never needs cache invalidation, so R2 objects can be served with
   a far-future `Cache-Control` and never revalidated.

That is a direct cut to the storage cost the Pro tier exists to offset, and it is available on day
one because the hashing already happened in the app.

---

## 4. The seam between two repositories — small, but it needs a version

Owner: *"Separate project as cross over is not huge and totally different use cases... very little
code to dupe - apart from parsing the file to chop it up - rather than use it."*

**That is the right read and it makes the coupling much smaller than it first looks.** The hub never
*uses* a campaign: no physics, no classification, no rendering, no types beyond what it slices on. It
opens a zip, reads one JSON, cuts it into rows, lists asset paths, and reads the attribution flags.

**The entire shared surface:**

| what the hub needs | size |
|---|---|
| the zip layout (four path prefixes, two doc names, the magic-number sniff) | ~10 constants |
| enough of the doc shape to slice it: `systems[].system.nodes[]`, `id`, `name`, `kind`, `roleHint`, `parentId` | a handful of fields |
| the asset-reference fields, to know which files a node points at | small |
| the attribution/provenance flags, for the gate | small |

**RECOMMENDATION: do NOT publish a shared package.** Two repos on different release cadences, coupled
by a build-time dependency, is a bigger cost than mirroring a hundred lines. Instead:

> **1. STAMP A `bundleFormat` INTEGER IN THE DOC, and this is the one genuine gap.** There is
> currently **no format version anywhere in the bundle.** `provenance.ts` stamps `appVersion` on an
> explicit save — but that is a BUILD STAMP, not a CONTRACT: v3.0.1 and v3.9.0 may have identical or
> incompatible layouts and nothing says which. That was survivable while one codebase both wrote and
> read the format. **The moment a second codebase reads it, it is a time bomb**, and the fix is one
> integer, bumped only on a breaking layout change.
>
> **2. SSE SHIPS A CANONICAL FIXTURE BUNDLE**, checked in, that the hub's parser tests against. When
> SSE changes the layout it regenerates the fixture and bumps `bundleFormat`; the hub's suite goes
> red on a fixture it does not understand. **That is the contract test, and it costs one file.**
>
> **3. THE HUB REFUSES UNKNOWN FORMATS POLITELY** — *"this bundle was made with a newer SSE; update
> the hub"* — rather than parsing something it does not understand into a public database.

**This is a change SSE must make, not the hub**, and it should land before the hub reads anything.

---

## 5. The migration — and the one thing that will break it

### 5.1 It is simpler than the plan says, in two ways, and both were verified

- **There is no `vercel.json` and no `.vercel` directory.** Nothing Vercel-specific to port.
- **The adapter is `@sveltejs/adapter-auto`, not the Vercel adapter.** Step 1 is a one-line swap, and
  the local build currently warns *"Could not detect a supported production environment"* — so
  moving to `adapter-cloudflare` also makes local builds honest.
- **All three existing server routes run on Workers unchanged.** `+page.server.ts` (a static import),
  `/api/generate` (a `fetch` proxy to an LLM endpoint) and `/api/realsky-tap` (a `fetch` proxy to the
  NASA archive) use **no Node-only APIs** — checked, no `fs`, no `node:`, no `path`, no `process.env`.

### 5.2 THE SERVICE WORKER WILL BREAK THE CUTOVER UNLESS ONE LINE CHANGES

**This is the most important thing in Part 2 and the plan does not mention it.**

`static/sw.js` precaches the app shell (`/`) under `STATIC_CACHE = 'sse-static-v3.0.22'` — **while
production is v3.0.164.** The file's own comment records this exact fault having already happened:

> *"A68 note: this had said v2.0.148 for ~750 versions — the precached '/' shell was never purged,
> and the layout's 'new version available' prompt only fires when THIS FILE's bytes change, so it had
> been dead since then."*

**It is dead again.** And the DNS cutover is SAME-ORIGIN, so a service worker registered against
`starsystemx.com` **survives the change of host entirely**. The failure chain:

1. A returning visitor's SW serves the precached `/` shell from the Vercel era.
2. That shell references hashed asset URLs (`/_app/immutable/…`) from the Vercel build.
3. Cloudflare's build produces different hashes, so those requests 404.
4. Runtime fetch is network-first **with cache fallback** — the fallback misses too.
5. **The app is broken for that user, and step 3.4 of the plan — *"safely delete the Vercel
   project"* — is the moment it becomes unrecoverable.**

> **THE FIX IS ONE LINE AND IT MUST RIDE THE SAME PUSH AS THE ADAPTER SWAP:** bump `STATIC_CACHE`
> and `RUNTIME_CACHE` to the release version. The `activate` handler already deletes every cache
> whose key is not the current pair, so a bump is sufficient — but the bytes of `sw.js` must change,
> or no browser will look.

**Recommended ordering, because a cutover is not the moment to discover this:**

1. Push the SW version bump to **prod on Vercel first**, and let it propagate for a few days. Users
   pick up a fresh shell while the old host is still serving it.
2. Then swap the adapter and deploy to Cloudflare Pages in parallel, on `*.pages.dev`.
3. Verify on the pages.dev URL directly, with a hard reload and `?no-sw=1` (the layout already
   supports that escape hatch, `+layout.svelte:65`).
4. Cut DNS.
5. **Leave Vercel running for at least a week.** Deleting it is the irreversible step and it buys
   nothing to do early.

**And fix the underlying fault while you are in there:** the SW version should ride the release
recipe automatically rather than being a constant somebody remembers. Its own comment asks for this
(*"Until the bump rides the release recipe automatically, bump it on any push…"*). A separate small
item; do not let the migration depend on it.

---

## 6. Moderation, control and abuse — the full shape

Owner, 2026-08-28: *"obviously I will have an admin account to delete offensive content - we will
need a mechanism for users to report as well as hearts on their uploads. And we will need some basic
gates so it cant be abused - i.e. a user uses it to pass around porn images as 'planets'...
'celestial bodies are not nude!' So limit to 1 zip file per user per day (tunable and relaxable over
time) and I can ban zips altogether (with files) and only allow json. So some moderation and some
control. An admin tool to quickly review images and their copyright info would be useful - so it is
easy to scan from all archives and checked ones never appear again. Manual pic review."*

### 6.1 THE ONE PROPERTY THAT MAKES THIS CHEAP: a verdict is per-HASH, not per-upload

**Assets are already content-addressed by sha256 (§3.4), and that turns moderation from an
ever-growing job into a shrinking one.** Review an image once and store the verdict against its
hash, and:

- **Every future upload of those exact bytes inherits the verdict instantly.** The hundredth person
  to share the same nebula backdrop costs zero review.
- **An approved hash never enters the queue again** — which is precisely the owner's *"checked ones
  never appear again"*, and it falls out of a decision already taken for storage reasons.
- **A banned hash is refused at upload time**, before a presigned URL is ever issued. It never
  reaches R2 at all.
- **Re-uploading a banned image under a new filename does nothing.** Same bytes, same hash, same
  verdict. To evade, the bytes must change — and changed bytes are a new hash, which lands back in
  the queue as novel.

> **SO THE REVIEW QUEUE ONLY EVER HOLDS GENUINELY NOVEL IMAGES, AND IT SHRINKS AS THE LIBRARY
> GROWS.** That is the difference between a moderation burden that scales with traffic and one that
> scales with variety.

**BE HONEST ABOUT THE LIMIT: this is exact-byte matching, not perceptual matching.** Re-saving a
banned image at 99% JPEG quality produces a different hash and a fresh queue entry. That is a real
gap and it is the correct trade for now — the escalation, if it is ever needed, is a perceptual hash
(pHash) stored *alongside* the sha256 so near-duplicates cluster in the queue. **Do not build that
yet**; note it, and let evidence decide.

### 6.2 Nothing unreviewed is ever served, and nothing waits in a queue

These pull in opposite directions and the hash ledger resolves them, which matters because a hub with
a review backlog is a dead funnel.

**The rule: an upload is never blocked; an unreviewed ASSET is never served.**

- An upload whose assets are **all previously-approved hashes** goes live immediately. After a short
  while this is most uploads.
- An upload containing **novel hashes** also goes live — with those specific assets withheld. The map
  is public, downloadable and usable; the unreviewed pictures show as placeholders and the creator
  sees *"3 images awaiting review"*.
- **The withholding covers the DOWNLOAD too, not just the page.** This is the part that is easy to
  get wrong: serving the original zip would hand out the very bytes being withheld. So the
  downloadable bundle is assembled from approved assets only.

**HOW TO SERVE IT: keep the R2 bucket PRIVATE and serve every object through a Worker that checks
the ledger.** No quarantine bucket, no copying objects on approval, one source of truth. Approve or
ban is a row update and takes effect on the next request — including revoking something already
public, which a copy-on-approve design makes slow and error-prone.

### 6.3 The gates — a config table, not code

Every one of these is a row an admin edits, because the owner asked for *"tunable and relaxable over
time"* and a limit that needs a deploy to relax is a limit nobody relaxes.

| gate | default | why |
|---|---|---|
| `uploads_per_user_per_day` | **1** | the owner's number |
| `zips_allowed` | true | **the kill switch** — see below |
| `max_bundle_bytes` | tunable | cost control |
| `max_assets_per_bundle` | tunable | one map should not carry a gallery |
| `new_account_cooldown_hours` | tunable | a brand-new account uploading instantly is the classic pattern |
| `novel_hash_limit_per_upload` | tunable | the abuse signal that matters most (§6.6) |

> **`zips_allowed: false` IS A REAL KILL SWITCH AND IT COSTS ALMOST NOTHING TO BUILD, because the app
> already supports assetless saves:** *"A plain .json save (no assets) still loads, and always will"*
> (`bundle.ts`). Flipping it reduces the entire abuse surface to TEXT — names, descriptions, notes —
> which is a far smaller moderation problem than images, and the hub keeps working. Implementation is
> one check: reject when `sniffBundle(bytes)` is true.

**One interaction worth designing for now: an UPDATE to your own existing entry should not cost a
daily upload, or cost less.** A creator iterating on a map would otherwise burn their allowance in a
morning, and an update is inherently lower risk — same creator, mostly-known hashes. Count only
*novel* hashes against the allowance and the limit stops punishing the people you want.

### 6.4 The admin review tool

The owner asked for *"an admin tool to quickly review images and their copyright info... easy to scan
from all archives"*. **The copyright info is already in the bundle** — `ATTRIBUTIONS.md` carries
`title`, `credit`, `license`, `sourceUrl` per asset (§3.3), parsed at upload.

**So the review card shows the image AND the creator's own licence claim side by side**, which lets
one pass judge two things at once: is this acceptable content, and is that attribution plausible?
A stock photo credited *"my own work, CC0"* is a different problem from an uncredited one, and only
this view makes it visible.

**Design for SPEED, because it is manual and volume is the enemy:**

- A grid of **unreviewed hashes only**, newest first, with usage count (*"used by 4 maps"*) so the
  highest-impact decisions come first.
- **Keyboard-driven**: approve / reject / ban-creator, with undo. A mouse-driven queue is a queue
  nobody clears.
- Each card carries: the image, its attribution block, the maps using it, the uploader, and any
  reports against it.
- **Bulk approve a whole upload** when it is obviously fine — the common case.
- A decision is written against the HASH with a reviewer and a timestamp. **Never against the
  upload**, or the same bytes come back tomorrow.

**Reject needs a reason** (content / copyright / spam), because the reason drives what happens next:
a copyright rejection is a note to the creator, a content rejection may be a creator-level action.

### 6.5 Reports and hearts

**Reports** target either a MAP or a specific ASSET, and the distinction matters: an asset report
feeds the hash queue directly and therefore protects every other map using the same bytes.

- A short reason list plus free text. Reasons drive triage order.
- **Reports on one hash collapse into one queue entry with a count.** Ten reports on the same image
  is one decision, not ten.
- Report volume against a creator is itself a signal (§6.6).
- Signed-in reporters only — an anonymous report button is a griefing tool.

**Hearts** are one per user per system, and they are not decoration: **for a funnel, discovery IS the
product** (§7.5), and hearts are the ranking axis that makes a front page possible. They require an
account for the same reason reports do.

### 6.6 What catches abuse without an image classifier

There is no free, reliable nudity classifier to lean on, and an ML content filter is out of scope
here. **The signals that actually work are behavioural and cost nothing:**

- **Novel-hash rate.** A legitimate map reuses models and carries a handful of pictures. An account
  uploading dozens of never-seen images is the pattern worth flagging, and it is the single best
  signal available.
- **New account + immediate upload + all-novel assets.** The classic shape.
- **Report velocity** against one creator or one hash.
- **Attribution quality.** A bundle where every asset says *"No provenance recorded"* is already
  blocked from public by the existing gate (§3.3) — which means the provenance gate is doing
  moderation work as a side effect, and that is worth knowing.

**Flagged uploads are not blocked; they are moved to the FRONT of the review queue.** Same
philosophy as the rest of this design: never stop the funnel, just look sooner.

**Cloudflare Workers AI does offer image classification models**, and it is worth EVALUATING as a
pre-filter that only reorders the queue — never as an automatic reject. Its cost and accuracy at this
volume are unknown and should be measured before anything depends on it. **Not in scope for launch.**

### 6.7 States, and who can do what

```
draft ──► public ──► hidden (admin)        assets: novel ──► approved
                └──► removed (creator)             └──► banned
creator: active ──► suspended ──► banned
```

**Two roles only at launch: `user` and `admin`.** A moderator tier is easy to add later and pointless
before there is a queue worth sharing. The owner is admin.

**An admin action is always recorded — who, what, when, why.** Not for bureaucracy: when a creator
asks why their map vanished, the answer must exist, and a hub that removes things silently loses the
people it wants.

### 6.8 What this still needs from the owner

1. **Terms and an acceptable-use line.** The tooling above enforces a policy; it does not write one.
   One page, plain English, and it must exist before the first public upload.
2. **A takedown route** — an email address that reaches a person, for copyright claims from people
   who do not have an account.
3. **Is a rejected asset's map still published without it, or does the whole map come down?** §6.2
   assumes the former (map lives, asset withheld). Confirm — it is the difference between a hub that
   feels fair and one that feels arbitrary.

---

## 7. Other gaps the plan does not yet cover

Named rather than designed, because each needs a decision.

1. ~~**MODERATION AND TAKEDOWN.**~~ **DESIGNED IN §6**, 2026-08-28, on the owner's brief. What
   remains is the non-technical half he still owes: terms, an acceptable-use line, and a takedown
   address that reaches a person (§6.8).
2. **ACCOUNT DELETION AND DATA EXPORT.** UK/EU users, a real obligation. Supabase makes it
   straightforward; the R2 objects are the part people forget, and content-addressed objects
   **must not** be deleted on account deletion when another creator's map references the same hash.
   That is a refcount, and it should be designed in rather than bolted on. **Note it interacts with
   §6.1:** a hash's review VERDICT must outlive the account that uploaded it, or a banned image
   returns the moment its uploader deletes themselves.
3. **RATE LIMITING AND ABUSE.** Presigned R2 URLs are capability tokens. Scope them tightly (single
   object, short expiry, exact content-length) or the hub becomes free anonymous storage.
4. **WHAT IS THE COVER IMAGE?** OG previews need one. The bundle carries player-view graphics under
   `assets/images/player/` (logos, overlays, map background) — the map background is the obvious
   candidate, but nothing today designates a cover. **Decide the source, and what a bundle with no
   suitable image falls back to.**
5. **SEARCH AND DISCOVERY.** The plan normalises into `Systems` / `Bodies` / `Constructs`, which is
   the right shape for it, but nothing says how anyone FINDS a map. For a funnel, discovery is the
   product. Tags exist in the data and are the obvious axis.
6. **VERSIONING AN UPLOAD.** A creator improves their map — a new upload, or a new version of the
   same entry with a stable URL? Deep links and OG previews make this matter more than it looks.

---

## 8. Phasing

**Phase 0 — SSE-side prerequisites, before the hub reads anything.** The `bundleFormat` stamp and
the canonical fixture (§4). Small, and everything else depends on it.

**Phase 1 — the migration, on its own.** Adapter swap, SW version bump FIRST (§5.2), parallel deploy,
verify, cut DNS, leave Vercel up. **Do not combine this with hub work** — it is a change to a live
product with a known failure mode, and it deserves to be the only variable.

**Phase 2 — the funnel, with the gates from day one.** Upload, parse, normalise, store, one-click
download, OG previews. **The gate config table (§6.3), the hash ledger (§6.1) and the admin review
tool (§6.4) ship WITH this phase, not after it** — a public upload path without them is a liability
from its first hour, and the ledger has to be there from the first asset or the queue starts life
with a backlog. Reports (§6.5) too: they are a table and a button.

**Phase 3 — community.** Hearts, search and discovery, and comments if wanted. **Hearts are the
ranking axis** the front page needs, so this is closer to the funnel than it sounds.

**Phase 4 — the tier hooks.** Already specified in the plan: `account_tier` and `visibility` exist in
the schema from phase 2 and are simply not exposed. Correct approach, no notes.

---

## 9. Questions still open for the owner

1. **Moderation (§6.1)** — the largest gap, and the answer is a policy before it is code.
2. **Cover image (§6.4)** — what designates one, and what happens with none.
3. **Does the hub host CAMPAIGNS (multi-system starmaps) as well as single systems?** The bundle
   format supports both (`starmap.json` vs `system.json`) and the normalisation tables imply
   systems. A campaign is the more valuable share and the bigger payload.
4. **Anonymous upload, or account required?** Download is one click and needs no account (§2).
   Upload is the question, and it interacts with moderation.
