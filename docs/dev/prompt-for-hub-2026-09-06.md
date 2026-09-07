# For the next Creator Hub agent — start here

You are taking over coding the **StarSystemX Creator Hub**, its own repo at
`C:\Development\starsystemx-creator-hub`. It is NOT a worktree of anything. It is live at
`https://starsystemx-creator-hub.orange-tree-847c.workers.dev`, currently v0.19.2, and a push to
`main` IS the deploy — there is one environment.

## Ground yourself in this order, before touching anything

1. **`docs/handover-2026-09-06.md`** — the previous agent's START HERE, written at the exact
   version you are inheriting. It has the standing rules from the owner, the file map, what is
   built, the traps, what is open and whose it is, and a suggested first hour. Do not ask me or
   the owner anything it already answers.
2. **`docs/decisions.md`, D-19 to D-35** — the reasoning behind every non-obvious choice. D-29
   (the pixel font, used sparingly), D-30 (the information-density meter), D-32 (Discord sharing
   through the outbox), D-33 (the Worker's own Cron Triggers), D-34 (badge roles), D-35 (debug
   upload Inspect, and "Open in SSE").
3. **`docs/handover-2026-09-03.md`** — the per-release log that got the hub to 0.19.x.
4. **`docs/sse-requirements.md`** — R-01 to R-17, what the hub has asked the engine for and why
   each one exists. **Read R-13 and R-17 knowing they have both now shipped** (see below).
5. **`docs/contract-with-sse.md`** and `docs/integrations.md`, `docs/containment-design.md` when
   the work touches them.

The two rules that will bite you first if you skip them: **never edit the SSE repo**
(`C:\Development\star-system-explorer-v2`) — reading it for the contract is fine, and anything
the engine must change becomes a new R-number in `docs/sse-requirements.md` plus a
`docs/prompt-for-sse-<date>.md` for the owner to hand across. And **commit as
`FrunkQ <frunk@frunk.net>`**, never the owner's work address.

## What changed on the ENGINE side after that handover was written — this is the part it does not have

The engine's stream M shipped both of the things the handover lists as "the engine's", on
2026-09-06. Both are on **beta only**. Production (`starsystemx.com`) is a read-tree release of
beta on the owner's explicit word, and he has not given it — **do not treat anything below as live
on production until he says so.**

### R-17, "Open in Star System Explorer", is SHIPPED — beta v3.0.314

- **The parameter is `open`, on the QUERY STRING** (not the hash). You asked which; that is the
  answer. So the prefix to put in the `open_in_sse_url` config row is:
  - `https://beta.starsystemx.com/?open=` — correct as of now;
  - `https://starsystemx.com/?open=` — only once the owner has released it to production.
- `src/lib/openInSse.ts` already builds exactly the right thing (`prefix + encodeURIComponent(siteUrl
  + '/api/download/' + slug)`). Nothing in the hub needs rewriting. Setting the row turns the
  button on everywhere it is already gated.
- The engine accepts the URL only when its host is on an allow-list: the hub's workers.dev name,
  `explorers.starsystemx.com`, or a `*.pages.dev` preview. Anything else is refused with a plain
  message and **is never fetched**. Both hosts are already listed, so the DNS cutover will need no
  engine release.

**THE TRAP, AND IT IS YOURS TO AVOID: `explorers.starsystemx.com` DOES NOT REACH THE HUB.**
Measured 2026-09-06: `GET https://explorers.starsystemx.com/api/download/local-neighbourhood`
answers **404 from Vercel** with `X-Vercel-Error: DEPLOYMENT_NOT_FOUND`, while the workers.dev
origin answers 200 with `access-control-allow-origin: *` and `x-hub-version: 0.19.2`. R-17's own
worked example in `docs/sse-requirements.md` uses the `explorers` host, so **a button built from
that example would fail for every visitor today.**

Concretely, in this repo: `loadSite()` in `src/lib/server/site.ts` falls back to the request's own
origin when the `site_url` config row is unset, which is why the download URL is right today.
**Do not set `site_url` to `https://explorers.starsystemx.com` until that host actually serves the
hub** — the moment you do, every "Open in SSE" link builds a download URL that 404s, and the
failure will look like an engine bug rather than a config row. Check with a plain
`curl -sI https://explorers.starsystemx.com/api/download/<a real slug>` before believing otherwise.

### R-13, the shipped-content manifest, is SHIPPED — beta v3.0.315

`https://beta.starsystemx.com/shipped-content.json` (and `https://starsystemx.com/shipped-content.json`
once released). **You can delete the hardcoded baselines** — this is the fetch that replaces them.

**CORS is not a problem, and that was measured rather than assumed:** production and beta both
serve static JSON with `Access-Control-Allow-Origin: *` (checked 2026-09-06 against
`/temporal/calendars.json` on both hosts), so a browser on the hub's origin can fetch it directly.

The shape, with the real values of v3.0.315 (lists abbreviated; every list is sorted except
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
    "starTypes":   ["/images/star_types/A.webp", "..."],                 // 18
    "planetTypes": ["/images/planet_types/C-type_asteroid.jpg", "..."]   // 73
  },
  "gases":   ["Ar", "Astrophage", "C2H6", "..."],                        // 33
  "liquids": ["ammonia", "...", "water", "water-ammonia"],               // 24
  "fuels":   ["fuel-antimatter", "...", "fuel-xenon"]                    // 14
}
```

Three things worth knowing before you wire it up:

- **`appAssetPrefixes` is the field that replaces your path-prefix matching.** Everything under one
  of those paths is app artwork; anything else on a node came from the creator. The two `appImages`
  lists are the complete contents of those prefixes, so you can match either way.
- **`planet_types/thumbs/` is deliberately absent.** Those thumbnails are derived at display time
  by the app and never stored on a node, so they cannot appear in a save you are reading. Listing
  them would have been 73 paths you can never meet. `images/ui` and `images/logo` are absent for
  the same reason — chrome, never on a body.
- **`tagCategories` comes from the engine's `pristineTagCategories()`**, which is the *same*
  baseline R-11/B112's save delta uses. So the manifest and the save agree by construction rather
  than by promise — a category absent from a save because it is shipped will be present here.
- It carries `appVersion` and it is **generated and pinned**: the engine's suite fails if a star
  image is added or a calendar renamed without rebuilding it. Treat it as authoritative for the
  build it names, and re-fetch rather than caching it across engine releases.

### One thing to fix on YOUR side

`/api/download/<slug>` currently returns **plain JSON** (`content-type: application/json`,
`filename="<slug>.json"`), not the `.sse.zip` that R-17's own text in `docs/sse-requirements.md`
describes. This is harmless — the engine puts both through the same classifier — but the
requirement and the behaviour disagree, and the next reader of that document will believe the
document. Reconcile the wording (or the behaviour, if the bundle was intended).

### In flight on the engine as you read this

The owner has asked the engine to **remove the "Open a shared map" paste block from SSE's welcome
screen** ("this is not the place — it is ugly and people are not joining from here") and instead
put a **"Browse shared maps"** route into SSE's own Load Starmap / Load System modals, which opens
the hub's browse page. Landing as engine v3.0.316.

**What that means for you:** more traffic will arrive at the hub's **`/browse`** page from inside
the app, sent by someone who has already decided they want a map. That page becomes a landing
surface rather than only a discovery one. Worth an eye on it early — it is the first thing those
people see. Nothing in the hub has to change for the link to work; `HUB.browseUrl` on the engine
side points at the workers.dev origin today and follows the same config move later.

## What is open, and whose it is

Take this from `docs/handover-2026-09-06.md` — it is current and I am not going to restate it and
let the two drift. In summary only, so you know the shape:

- **The owner's:** SMTP in Supabase Auth (Resend), then the Gates page test button; the Discord bot
  steps in `docs/integrations.md` if badge roles are wanted (the sharing webhook is already set and
  needs none of it); the three containment decisions in `docs/containment-design.md`. **And now
  also: set `open_in_sse_url` to `https://beta.starsystemx.com/?open=`.**
- **The engine's, still owed:** the R-07 capture/screenshot button (engine side complete, the
  surface is undecided) and R-04 in-app upload, which is parked on **the hub's** device-code pairing
  endpoint — that is yours to build when the owner wants the in-app funnel, and the request is
  written up in the engine repo's `docs/dev/hub-pairing-and-upload-request.md`.
- **Yours when the moment comes:** the first upload of a map containing a pasted clip (check
  "Includes work from X by Y" and the original's "Used in" end to end); the first real Discord
  share; comment mail once SMTP exists; **Collections**, which is recommended but is a product
  surface and awaits the owner's yes; search over descriptions when the library needs a text index.

## How the owner works

Short, direct briefs, often with a screenshot. He wants **a recommendation before a question** —
say what you would do and why, then ask. Ordinary work: just do it. Anything that changes what the
product IS: recommend, then ask. He will tell you when something is ugly, and that is usually about
placement rather than the feature.
