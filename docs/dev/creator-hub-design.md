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

## 6. What the plan does not yet cover

Named rather than designed, because each needs a decision.

1. **MODERATION AND TAKEDOWN.** A public hub accepting user uploads needs a report path, a way to
   remove content, and terms. The provenance gate handles *"is this art credited"*; it does nothing
   about *"is this content acceptable"* or a DMCA notice. **This is the largest missing piece and it
   is not technical** — it is a policy the app then implements.
2. **ACCOUNT DELETION AND DATA EXPORT.** UK/EU users, a real obligation. Supabase makes it
   straightforward; the R2 objects are the part people forget, and content-addressed objects
   **must not** be deleted on account deletion when another creator's map references the same hash.
   That is a refcount, and it should be designed in rather than bolted on.
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

## 7. Phasing

**Phase 0 — SSE-side prerequisites, before the hub reads anything.** The `bundleFormat` stamp and
the canonical fixture (§4). Small, and everything else depends on it.

**Phase 1 — the migration, on its own.** Adapter swap, SW version bump FIRST (§5.2), parallel deploy,
verify, cut DNS, leave Vercel up. **Do not combine this with hub work** — it is a change to a live
product with a known failure mode, and it deserves to be the only variable.

**Phase 2 — read-only hub.** Upload, parse, normalise, store, one-click download, OG previews. No
accounts beyond what upload requires, no comments, no votes. **This is the whole funnel and it is
shippable alone.**

**Phase 3 — community.** Upvotes, comments, search and discovery. Needs §6.1 answered first.

**Phase 4 — the tier hooks.** Already specified in the plan: `account_tier` and `visibility` exist in
the schema from phase 2 and are simply not exposed. Correct approach, no notes.

---

## 8. Questions still open for the owner

1. **Moderation (§6.1)** — the largest gap, and the answer is a policy before it is code.
2. **Cover image (§6.4)** — what designates one, and what happens with none.
3. **Does the hub host CAMPAIGNS (multi-system starmaps) as well as single systems?** The bundle
   format supports both (`starmap.json` vs `system.json`) and the normalisation tables imply
   systems. A campaign is the more valuable share and the bigger payload.
4. **Anonymous upload, or account required?** Download is one click and needs no account (§2).
   Upload is the question, and it interacts with moderation.
