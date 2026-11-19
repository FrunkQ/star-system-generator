# Moving SSE off Vercel - diagnosis, the cheap fix, and the Cloudflare runbook

Measured 2026-09-23. Every number here was read off the Vercel usage page or measured with `curl`
against the live production origin. Guesses are marked GAP.

Companion document: `C:\Development\INFRASTRUCTURE.md` - the estate-wide record. Read it before any
DNS change and append to it after one.

---

## 1. What is actually wrong

Vercel Hobby usage, account-wide, at 2026-09-23:

| Product | Usage | Share of cap |
|---|---|---|
| **Edge Requests** | **911K / 1M** | **91%** |
| Fast Data Transfer | 24.65 GB / 100 GB | 25% |
| Fast Origin Transfer | 259.09 MB / 10 GB | 3% |
| Edge Request CPU Duration | 4m 2s / 1h | 7% |

Edge Requests by project, last 30 days:

| Project | Requests | Share |
|---|---|---|
| `star-system-generator` | 823,528 | 94.0% |
| `dynamic-map-renderer-v2` | 51,795 | 5.9% |
| `evolution-lab` | 862 | 0.1% |
| `system-lab` | 271 | 0.0% |

**Only one metric is near its cap, and it is request COUNT, not bytes and not compute.** 24.65 GB
across 911K requests averages 27 KB per request. That is the signature of a CDN answering a very
large number of small conditional requests, not of an app shipping a lot of data.

### The cause, measured

Response headers from `https://starsystemx.com`, 2026-09-23:

| Path | `Cache-Control` |
|---|---|
| `/_app/immutable/assets/0.ZakJeqcG.css` | `public, immutable, max-age=31536000` |
| `/` | `public, max-age=0, must-revalidate` |
| `/images/ui/SSE-Logo.png` | `public, max-age=0, must-revalidate` |
| `/images/planet_types/Comet.png` | `public, max-age=0, must-revalidate` |
| `/manifest.webmanifest` | `public, max-age=0, must-revalidate` |
| `/sw.js` | `public, max-age=0, must-revalidate` |

SvelteKit's own build output under `/_app/immutable/` is cached correctly for a year and costs
nothing on repeat visits. **Everything in `static/` - 245 files, 62 MB, of which 50 MB is images -
is served with `max-age=0, must-revalidate`, so every browser revalidates every one of them on
every page load.** Each revalidation is a billable Edge Request that returns a 304 and almost no
bytes. That is where the 911K comes from, and it is why data transfer sits at a quarter of its cap
while requests sit at 91%.

There is no `vercel.json` in the repo. Nothing has ever set a cache policy for `static/`.

`X-Vercel-Cache: HIT` on those assets is a red herring. That is Vercel's *edge* cache and it means
Vercel did not go to origin - the request still reached Vercel's edge and still counted.

### The second contributor

`static/sw.js` is **network-first for every same-origin GET** except `/api/`:

```js
// Network-first to avoid stale UI when online; cache remains offline fallback.
const response = await fetch(request);
```

It never reads its runtime cache while online. It relies entirely on the HTTP cache to avoid the
network - and the headers above defeat the HTTP cache. The two defects compound.

---

## 2. The decision

**Fix the headers before migrating.** Two reasons:

1. It is a one-file change that may drop Edge Requests far enough that the Hobby cap stops being a
   problem at all. Migrating to escape a cap you created with a missing header is the wrong trade.
2. If you still want Cloudflare afterwards - and there is a good case for it - you will be cutting
   over calmly instead of against a cap. Every step below is safer done without a deadline.

The case for Cloudflare survives the fix: **Cloudflare Workers does not meter static asset requests
at all.** The metric that is hurting you goes to zero, permanently, rather than being pushed back
under a ceiling. Workers Free allows 100,000 *Worker* invocations a day on top of unlimited free
asset requests; Workers Paid is $5/month against Vercel Pro at $20/month.

So: Phase A now, Phase B onwards when you choose.

---

## Phase A - the cache-header fix (Vercel, today)

Create `vercel.json` at the repo root. The split matters, because **files in `static/` are not
content-hashed** - a long cache on a file whose name never changes pins stale content in user
browsers that you cannot purge.

```json
{
  "headers": [
    {
      "source": "/sw.js",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }]
    },
    {
      "source": "/images/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=2592000, stale-while-revalidate=86400" }]
    },
    {
      "source": "/(draco|models|pwa|screenshots)/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=2592000, stale-while-revalidate=86400" }]
    },
    {
      "source": "/(examples|example-starmaps|rulepacks|temporal|realsky)/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=3600, stale-while-revalidate=86400" }]
    },
    {
      "source": "/(manifest.webmanifest|shipped-content.json)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=3600, stale-while-revalidate=86400" }]
    }
  ]
}
```

Rules behind that split:

- **`/sw.js` must stay at `max-age=0`.** It is listed first and explicitly. The "new version
  available" prompt fires only when this file's bytes change (see the A68 note at the top of
  `static/sw.js`); cache it and you lose the update path for every installed PWA.
- **`/images/**`, `draco`, `models`, `pwa`, `screenshots`** - 30 days. Stable filenames, content
  effectively never changes. If you ever change one of these images, **rename it**, do not edit in
  place.
- **`examples`, `example-starmaps`, `rulepacks`, `temporal`, `realsky`, `shipped-content.json`** -
  one hour. These do change between releases and are not hashed. An hour still collapses
  per-page-load revalidation to roughly one request per browser per hour.

Verify after deploying to beta:

```bash
for u in /sw.js /manifest.webmanifest /images/ui/SSE-Logo.png /images/planet_types/Comet.png /rulepacks/; do printf "%-40s " "$u"; curl -sI --max-time 20 "https://beta.starsystemx.com$u" | grep -i '^cache-control' | tr -d '\r'; done
```

Then watch Vercel's Edge Requests for a week. Returning visitors benefit immediately; the full
effect appears as the existing `max-age=0` responses age out of browser caches.

### Optional follow-up: the service worker

Make the fetch handler cache-first for content-addressed and stable assets (`/_app/immutable/**`,
`/images/**`) and leave everything else network-first. The header fix does most of this work
already, so treat this as a second-order improvement and a separate commit.

**GAP:** no per-path request breakdown was taken. If Phase A does not move the number as much as
expected, pull the Edge Requests split by path from Vercel Observability before doing anything else.

---

## Phase B - build SSE for Cloudflare

The app is a better fit for Workers than it looks. Confirmed by reading the tree:

- SvelteKit 2 / Svelte 5 on `@sveltejs/adapter-auto`.
- **Three** server-side entry points, and no others:
  - `src/routes/+page.server.ts` - returns a static build-time import (`$lib/generated/exampleSystems`).
  - `src/routes/api/generate/+server.ts` - streaming LLM proxy. Plain `fetch` + `ReadableStream`.
  - `src/routes/api/realsky-tap/+server.ts` - NASA Exoplanet Archive CORS proxy. Plain `fetch`.
- **No Node built-ins and no `$env/` usage anywhere in `src/`.** Nothing needs polyfilling.
- 245 static files, largest 3.8 MB - comfortably inside Workers Static Assets limits (20,000 files,
  25 MiB per file).

### B1. Swap the adapter

```bash
npm i -D @sveltejs/adapter-cloudflare
```

In `svelte.config.js`, replace `adapter-auto` with `adapter-cloudflare`. Pin it explicitly rather
than leaving `adapter-auto` to guess - the parallel run needs both targets to be deliberate.

### B2. Add `wrangler.jsonc`

Shape, to be confirmed against what the adapter actually emits on the first build:

```jsonc
{
  "name": "sse-beta",
  "main": ".svelte-kit/cloudflare/_worker.js",
  "compatibility_date": "2026-09-23",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "binding": "ASSETS", "directory": ".svelte-kit/cloudflare" },
  "workers_dev": true
}
```

**Keep `workers_dev: true` explicit.** Adding `[[routes]]` to a Worker silently disables its
`workers.dev` address - that bit the `relay-ice` Worker on 2026-09-08 and the deploy only warns.

### B3. Headers, portably

Cloudflare Workers Static Assets reads a `_headers` file; Vercel does not. Put the same policy in
`static/_headers` so both hosts agree during the parallel run. Vercel ignores it, Cloudflare ignores
`vercel.json`, and neither fights the other.

### B4. Replace Vercel Analytics

`src/routes/+layout.svelte` imports `injectAnalytics` from `@vercel/analytics/sveltekit`. It has to
go - the beacon posts to `/_vercel/insights`, which will not exist.

Cloudflare Web Analytics is the like-for-like replacement: free, no event cap, no cookie. Because
the hostnames will be proxied you can enable it zone-side with no code at all.

Note what this retires: the 24-hour `localStorage` stamp in that file exists purely to stay under
Vercel's 50,000 events/month allowance. Cloudflare does not bill per event, so the dedup logic can
go with it - and you get honest per-route numbers back instead of one event per browser per day.

### B5. Pin Node

There is no `.nvmrc` and no `engines` field. Add a `.nvmrc` matching the Node version Vercel is
building with, so the two hosts build identically. **GAP:** read the current version off a Vercel
build log first.

`vite.config.ts` shells out to `git rev-parse --short HEAD` and already falls back to `'nogit'`, so
it is safe either way.

---

## Phase C - parallel run

Stand the Cloudflare build up on **`cf.starsystemx.com`**, proxied (orange cloud). Universal SSL
covers one level of subdomain, and the zone's CAA already permits `pki.goog`, which is what
Cloudflare issues from - proven by `explorers` and `turn`. No zone change is needed.

Note the contrast with every Vercel record in this zone, which must stay **DNS only / grey**. The
Cloudflare records are managed and proxied. Both are correct; do not "tidy" one to match the other.

### Three traps specific to this estate

1. **A test hostname is a different origin, so no saved campaigns appear there.** Browser storage is
   keyed by origin. Tell your testers this before they open it, or someone will report their
   campaigns as lost. Nothing is lost - the data is still under `starsystemx.com`. The real cutover
   keeps the hostname and is therefore unaffected.

2. **The hub allow-list.** `src/lib/hub/hubConfig.ts` lists the origins the engine will talk to, and
   the hub names `HUB_FINAL_ORIGIN` on its side. A new test hostname is on neither, so hub
   round-trips will fail from `cf.` until it is added - or you accept that the hub handshake is not
   covered by the parallel run and test it only at cutover.

3. **The `relay-ice` origin allow-list.** The TURN credential Worker at `turn.starsystemx.com/ice`
   checks the requesting origin. `cf.starsystemx.com` is not on it, so P2P relay will fail from the
   test origin. Add it, or exclude multiplayer from the parallel test deliberately.

### What to verify

- All three server routes, including **streaming** from `/api/generate` (the response is
  `text/event-stream` - confirm it streams rather than buffering).
- `/api/realsky-tap` against the live archive.
- WebGL scenes, the heavy player view, PWA install and offline shell.
- **Worker CPU time.** The free plan caps CPU at 10 ms per invocation. Static assets do not invoke
  the Worker, but non-prerendered page loads do. If SSR of the shell exceeds 10 ms you will see 1101
  errors. Two outs: prerender the pages, or Workers Paid at $5/month for a 30 s ceiling.

### A likely optimisation

`+page.server.ts` returns nothing but a build-time import. Convert it to a universal `+page.ts` and
mark the route `prerender = true` and it becomes a static asset - no Worker invocation at all for
the main page. Verify `+page.svelte` does not read request state during SSR before doing this, and
check `hubOneDoor.spec.ts` still passes.

---

## Phase D - cut beta over

Beta first. Your testers are already there and it is the channel that can absorb a surprise.

1. **Measure the live DNS before changing anything.** `INFRASTRUCTURE.md` section 3 and the DNS
   cutover notes **disagree** about the apex A records - one says `64.29.17.1` + `216.198.79.65`,
   the other says `216.198.79.1`. Do not trust either. Capture what is actually live and write it
   into your rollback note.
2. **Bump `STATIC_CACHE` and `RUNTIME_CACHE` in `static/sw.js`** in the cutover release. Installed
   PWAs are holding a precached `/` shell from the Vercel era; without a version change the activate
   handler will not purge it.
3. Add `beta.starsystemx.com` as a Custom Domain on the beta Worker. Cloudflare writes the managed
   proxied record and supersedes the `cname.vercel-dns.com` row.
4. **Leave the hostname attached to its Vercel project.** That is what keeps the rollback cheap.
5. Re-run the section 8 verification commands in `INFRASTRUCTURE.md`. `Server:` should now read
   `cloudflare` for beta and still `Vercel` for everything else.

Let it sit for a week under real use.

---

## Phase E - cut production over

Same steps for the apex. Two differences:

- The apex has **A records**, not a CNAME. The Worker Custom Domain replaces both.
- `www` 307s to the apex today. Decide deliberately whether `www` moves with it or stays on Vercel
  pointing at a host that no longer serves the apex - the second is a broken redirect waiting to
  happen.

Leave `legacy`, `system-lab` and `evolution-lab` on Vercel. Between them they account for about 0.1%
of Edge Requests; moving them buys nothing and `system-lab` and `evolution-lab` have already come
within one click of going dark once.

---

## Phase F - after

- Keep the Vercel project intact for a **full billing period**. It is the rollback.
- Once SSE is off, account-wide Edge Requests drop to roughly 53K/month - about 5% of the Hobby cap,
  with Mappadux comfortably inside it.
- The registrar is still **Vercel** (`starsystemx.com`, expires 2027-05-20, auto-renew on). Moving
  hosting does not require moving the registrar. If the intent is to leave Vercel entirely, that is
  a separate, unhurried job.
- Append the outcome to `INFRASTRUCTURE.md` section 10 and correct the apex A records in section 3
  while you have the measured values in hand.

### The 2026-10-05 watch item changes shape

`INFRASTRUCTURE.md` section 7 flags four subdomains sharing a 2026-10-19 certificate expiry on
Vercel's old `*.starsystemx.com` wildcard, which can no longer renew. Moving `beta` to Cloudflare
makes the item moot **for beta only**. `legacy`, `system-lab` and `evolution-lab` stay on Vercel and
still need the October check. Do not let this migration be mistaken for having closed it.

---

## Rollback

Reversible at every phase, because Cloudflare is the DNS authority and this zone's changes take
effect in minutes.

1. Delete the Custom Domain from the Worker.
2. Re-add the records you captured in Phase D step 1, **DNS only / grey cloud**.
3. Confirm `Server: Vercel` returns.

One caveat worth knowing before you need it: Vercel cannot renew a certificate for a hostname whose
DNS points at Cloudflare. If you roll back after the existing certificate has lapsed, Vercel
re-issues over HTTP-01 once DNS points back - which works, but is minutes rather than instant. That
is the whole reason for Phase D step 4.
