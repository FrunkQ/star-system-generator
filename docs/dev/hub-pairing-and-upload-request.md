# For the Creator Hub session: what the engine needs from you, and what it now gives you

Written 2026-09-01 by the SSE-side stream (board [[G57]]), to be passed to whoever works in the hub
repo. The engine does not edit that repo, so everything below is either a request or a notification.

Two things are BLOCKING an in-app publish flow that is otherwise fully built and switched off behind
one boolean (`src/lib/hub/hubConfig.ts`, `uploadEnabled: false`). They are questions 1 and 2. The
rest are smaller confirmations and one thing you will want to act on immediately (question 3).

---

## First: what SSE now ships, because it changes what you can assume

All on `beta` and pushed. **`KNOWN_BUNDLE_FORMATS` can accept `1` and the hub can open.**

- **`bundleFormat: 1` is now stamped on EVERY save, in every container** (v3.0.244). It used to be
  written only inside the zip, so an asset-free campaign — a plain `.json`, and precisely what your
  JSON-only kill switch would make your only accepted upload — carried no stamp at all. Fixed for
  all four plain-JSON export paths. It is always the FIRST key in the document.
- **Two canonical fixtures, both real saves**, replacing the synthetic one:
  - `tests/fixtures/creator-hub-bundle.sse.zip` — a campaign
  - `tests/fixtures/creator-hub-system.sse.zip` — a single system (the `system.json` sibling; a
    single archive cannot hold both documents, so "sibling" is honoured as a sibling FILE)
  Between them they exercise: a real `glTF` container under a real sha256 path, **one hull flown by
  two ships** (stored once, credited once), a body image with full provenance and one with none, a
  remote image URL that must survive untouched, a built-in starter graphic that is a static path and
  must NOT be extracted, `ATTRIBUTIONS.md` and `README.txt`.
  The old fixture would have failed your own R-03 assertion: its model was `c0ffee.glb`, its "GLB"
  was the ASCII string `RUNNER-GLB`, and its campaign had no `routes`, so SSE itself would have
  refused it had it arrived as plain JSON.
- **R-03 is enforced on export**: SSE now refuses to write `assets/models/<hash>.glb` unless the
  hash is the digest of the bytes. Keep hashing the bytes yourself — the path is still a claim from
  your side — but a bundle written by a current build cannot carry that particular lie.
- **`revision`, a monotonic integer** (v3.0.247), on the CAMPAIGN document, advanced on every
  explicit save. This is your stale-upload guard: *"the copy you uploaded is older than the one
  already published — did you mean to roll back?"* Notes:
  - absent means "written before this existed", which is every save in the world before v3.0.247.
    Treat absent as older than any present value rather than as zero-equals-zero.
  - **a single-system save has NO revision, deliberately.** A system is a slice of a campaign, not a
    separately versioned document, and there is nowhere for its own counter to live that survives a
    reload. So your stale-upload protection covers campaigns and not systems. If you want it for
    systems too, say so — the option is for a system save to carry its parent campaign's revision
    read-only, and that is an owner decision rather than ours.
- **`exportMode: 'gm' | 'player'`** (v3.0.247), as a LABEL. Per your own R-10 warning we have kept
  it strictly non-load-bearing on our side, and you should too: **detection stays the control.** A
  file claiming `player` while full of GM notes must lose to `gmContent.ts`, loudly. It defaults to
  `gm`, the safe direction. Campaign saves are always `gm` (that flow has no Player option); system
  saves take it from the radio the GM already chose.
- **`coverAssetId`, the creator's own choice of cover picture.** The id of a `playerAssets` entry,
  so it points at a graphic the bundle already carries as a real file, already credited in
  `ATTRIBUTIONS.md`. **Absent means the creator has not chosen — keep guessing exactly as you do
  now** (map background, then any player graphic, then the first body picture). It is never present
  and empty: choosing nothing REMOVES the key, so `'coverAssetId' in doc` is a safe test. The app
  refuses to point it at anything the campaign does not carry, and at a built-in starter graphic
  (those are app artwork on a static path and are never extracted into the bundle), but treat it as
  a claim like everything else: if the id names nothing in `playerAssets`, fall back to guessing
  rather than showing a blank.
- **B112 landed earlier (v3.0.225)**: saves no longer carry SSE's own shipped calendars, tag
  categories or reasons config. **Your hardcoded baselines can be emptied** and the facet becomes
  simply "how many are in the file". Files written between v3.0.225 and v3.0.243 carry the delta
  shape but no format stamp, so `appVersion` is still the discriminator for that window.

---

## 1. BLOCKING — the device-code pairing endpoint (R-06)

R-06 was decided in favour of device-code pairing: the app shows a code, the person approves it on
the hub in their own browser, the app holds a revocable token. No password ever reaches the app.

The SSE side is written to a documented interface and needs the real shape. Please define:

- **Start**: what does the app POST to begin, and what comes back? We assume something like a
  `user_code` to show the person, a `verification_uri` to send them to, a `device_code` to poll
  with, plus `interval` and `expires_in`.
- **Poll**: what does the app poll, how often, and what are the distinguishable answers —
  pending / slow-down / denied / expired / granted? We need to tell a waiting person which of those
  happened, so an undifferentiated error is not enough.
- **Token**: what is returned, does it expire, is there a refresh, and what is the exact header the
  upload expects? We currently assume `Authorization: Bearer <token>`.
- **Revocation**: confirm the account page can revoke it, and say what the app sees when it has been
  revoked so it can ask the person to pair again rather than looking broken.

## 2. BLOCKING — the attestation wording, verbatim (R-04)

We need the exact text from your `src/lib/attestation.ts`, copied literally.

**This one genuinely cannot be stubbed, even temporarily.** The purpose of an attestation is that a
person read *those words* and took responsibility for them. Showing approximate words and sending
`attest=on` would be worse than not shipping the feature, so the flow stays off until the real text
arrives. Please also say whether the wording is versioned — if it can change, we would rather show a
version identifier alongside it than silently show stale terms.

Confirmed already implemented on our side, from your requirements: **it is never pre-ticked**, and
`publishBody()` throws rather than build a request without an explicit `true`.

## 3. ACT ON THIS ONE — CORS on `/api/download/<slug>` is MISSING, and it blocks the whole funnel

Not a prediction. **Measured against the live deploy, 2026-09-01**, with the finished client:

```
Access to fetch at
'https://starsystemx-creator-hub.orange-tree-847c.workers.dev/api/download/this-map-does-not-exist'
from origin 'http://localhost:5311' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

`?hub=<slug>` is built and shipping in the app now, and it fetches `GET /api/download/<slug>`
**cross-origin** — from `starsystemx.com`, and also from `beta.`, from a `*.pages.dev` verification
build, and from `localhost` during development. Right now every one of those is refused by the
browser before your Worker's answer is ever read, so **`?hub=` cannot open a single map until this
header is added.** It is the one thing standing between the funnel and working.

It also fails in the least helpful way available: a CORS refusal is indistinguishable from being
offline, so the app genuinely cannot tell the person what went wrong. We degrade as well as it can
be degraded — the message names your map page as the way through, and nothing in their own campaign
is touched — but it is a dead end where it should be one click.

**Please add `Access-Control-Allow-Origin` to that endpoint** and say which origins it allows. A
plain `*` is defensible here since the endpoint is public and needs no account (we send
`credentials: 'omit'` deliberately, so there is nothing for a cookie to leak); an explicit list of
the four origins above is equally fine. Note that `beta.` and `localhost` matter for anyone
developing or testing against the hub, not just for us.

## 4. Confirmations, small

- **The map page path.** We link people to `<hub>/m/<slug>` when a fetch cannot happen. If that is
  not the path, tell us and it is one line (`hubConfig.ts`, `pagePath`).
- **The upload response.** We read `slug`, `mayPublish` and `missingProvenance` (an array of asset
  paths). `mayPublish: false` is treated as **uploaded fine, not publishable yet** — never as a
  failure — and `missingProvenance` is surfaced in the EDITOR where the credit fields are, as you
  asked. Confirm the field names, and say what `missingProvenance` entries look like (we assume the
  same `assets/...` paths that appear in `ATTRIBUTIONS.md`, so we can point at the right node).
- **Update semantics.** We send `replaces=<systemId>` for an update. Confirm that is still right,
  and confirm the "only novel asset hashes count against the daily allowance" behaviour, since the
  app will encourage iterating.
- **Rendering a cover on the hub's behalf.** Raised by the owner and deliberately NOT built. If it
  is ever wanted, R-05 has made it much cheaper than it was: `?hub=<slug>` now opens any published
  map in the real app, so a headless browser (Cloudflare Browser Rendering) pointed at that URL
  renders the genuine thing with no new rendering code and no engine on the hub. It is banked rather
  than built because it is a server, a browser runtime and a compute-abuse surface to replace one
  click in the app the creator is already sitting in. Say if you want it and it becomes a real item.
- **A JSON index.** Not needed yet. If browsing from inside the app is ever wanted, that is when we
  would ask — flagging it so it is not built speculatively.

## 5. The hub origin

The app currently points at `https://starsystemx-creator-hub.orange-tree-847c.workers.dev`, with
`explorers.starsystemx.com` recorded as the agreed final name. It is one constant
(`hubConfig.ts`), and the cutover is one token. Tell us when the domain moves.

Worth knowing: the one-click links this app hands out carry **the app's own origin**
(`starsystemx.com/?hub=<slug>`), not the hub's — so moving the hub does not break any link already
shared into a Discord. Only the app's ability to reach the hub moves.
