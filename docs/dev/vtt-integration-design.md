# VTT Integration — SSE2 as a Map Source (Mappadux StarMap + Foundry sanity check)

Status: HIGH-LEVEL DESIGN, DECISIONS SETTLED (2026-07-20 review — see the
decision log in section 9). Ready to drive to detailed design.

Scope: three related integrations, in priority order.

1. **Mappadux "StarMap" map style** — a new map type in Mappadux that shows a live,
   GM-driven SSE2 player view to players. This is the main build.
2. **Foundry VTT module for SSE2** — sanity check: can/should we ship a Foundry
   module that does the same job inside Foundry. Verdict: CAN yes, SHOULD probably
   (thin module, shipped precedent).
3. **Mappadux as a Foundry module** — sanity check requested alongside. Verdict:
   CAN yes (identical mechanism), but value is selective — embed Mappadux's unique
   surfaces (motion tracker, filtered handouts), not the battlemap itself.

Both codebases were surveyed for this doc (SSE2 beta v2.1.189, Mappadux beta
v2.17.39). File/line references were verified at survey time.

---

## 1. Guiding principles (from the brief)

- **Everything is authored and driven in SSE2.** Player Views are built in SSE2's
  preset editor; the GM drives focus/time/preset pushes from SSE2. Mappadux (or
  Foundry) only *hosts* the player view and gets it in front of players.
- **Parallel data channel.** SSE2 view data never travels over Mappadux's P2P
  layer. The embedded view connects to the SSE2 session over SSE2's own transport
  (BroadcastChannel same-browser, PeerJS/WebRTC remote). Mappadux only broadcasts
  a tiny descriptor ("show this StarMap").
- **No filter-in-filter.** The preset's visual filter runs inside SSE2 (real GLSL).
  Mappadux's own filter pipeline is force-disabled for StarMap maps. (The two
  apps share the same filter package lineage — SSE2's `src/lib/holo/filters/` is
  the Mappadux port — so double-filtering would be both ugly and redundant.)
- **Both sides are ours.** Where the existing contract falls short (session
  identity, discovery) we change SSE2 rather than work around it.

---

## 2. What already exists (survey summary)

### 2.1 SSE2 side — the player view is already an embeddable product

- `/catalogue?sid=<id>&preset=<id>&units=&temp=` is a fully self-contained SPA:
  no server state, boots from URL params, acquires the campaign by sending
  `REQUEST_SYNC` + `REQUEST_STARMAP` over the broadcast service
  (`src/routes/catalogue/+page.svelte:667-721`).
- `src/lib/broadcast.ts` is a clean dual transport: one envelope
  `{sessionId, message}` over BroadcastChannel `'star_system_generator_channel'`
  plus a lazy PeerJS pipe (GM hosts `new Peer(sessionId)` on `enableRemote()`;
  guests dial the sid; payloads >14 KB are chunked — the Mappadux 16 KB gotcha is
  already handled).
- The GM's answer to `REQUEST_STARMAP` is the redacted campaign **including
  `starmap.playerPresets`** — so any guest on the channel can enumerate the
  available Player Views. Discovery needs no new data path, only a handshake.
- `SYNC_PRESET {presetId, overrides} | null` pushes/holds the live view;
  `SYNC_FOCUS`, `SYNC_FOCUS_LEVEL`, `SYNC_CAMERA`, `SYNC_TIME` drive followGM —
  all live and working today.
- Filters: GLSL `none/crt/night_vision/thermal` + CSS approximation for DOM
  surfaces, all inside the catalogue page.
- Headers: the deployed site sends no `X-Frame-Options` and no CSP —
  `/catalogue` is iframe-embeddable today (verified against production).

**Gaps found (SSE2 changes needed):**

- **G1 — ephemeral session id.** `broadcastSessionId = generateId()` at
  `src/routes/+page.svelte:64` is per-page-load, in-memory only. Any stored link
  (Mappadux pack, Foundry setting, player bookmark) goes stale on the next GM
  reload. Needs a persistent id.
- **G2 — no discovery.** Nothing announces "an SSE2 session is running, here is
  its sid / starmap id / starmap name". An external app must be told the sid.
- **G3 — no external command surface.** No postMessage listener anywhere; a
  parent page cannot ask an embedded SSE2 frame anything.
- **G4 — no embed chrome mode.** The catalogue shows its own status bar / back
  navigation; as an embedded map surface some chrome may want suppressing.
- **G5 — remote hosting is opt-in.** PeerJS hosting starts only when the GM opens
  the Player Views modal (`PlayerViewModal.svelte` onMount → `enableRemote()`).
  An integration needs a way to request it.
- **G6 — no disconnect detection.** The catalogue's `connected` flag latches true
  on first sync and never falls back; a "GM gone" state is not detectable after
  first contact. Cosmetic for v1, worth fixing for hosted embeds.

### 2.2 Mappadux side — every mechanism has an in-repo precedent

- **Non-raster map kinds exist**: `MapAsset.source` is
  `'upload' | 'web-link' | 'text-map' | 'composite-map'` (`src/types.ts:1642`);
  text-maps carry a `textMap?: TextMapConfig` payload instead of a blob. StarMap
  becomes a fifth kind with a `starMap?: StarMapConfig` payload — but it is the
  first kind that never rasterises to a blob at all, so it must branch before
  `MapAssetStore.getBlob()` / `Renderer.loadMap()`.
- **Live cross-origin iframe overlay precedent**: the v2.16.90 YouTube-on-textmap
  feature. `src/rendering/TextMapVideoLayer.ts` is a lifecycle-managed iframe
  overlay working on GM, player AND projector surfaces, with `mode:'gm'|'viewer'`,
  a fullscreen-blank workaround (`refresh()`), and DOM slots already present in
  `player.html` / `projector.html`. A `StarMapLayer` is a close clone.
- **Filter disable gate exists**: `GMApp._effectiveFilter()` (`GMApp.ts:5376`)
  already returns `{filterId:'none'}` under a bypass flag and every filter
  broadcast goes through it. Adding "or active map is a StarMap" is a one-seam
  change; the GM UI has an existing per-kind button-visibility branch to grey the
  filter controls.
- **Small-message P2P path**: a StarMap descriptor is a few hundred bytes of
  JSON — one un-chunked frame, modelled on `MsgTextMapVideos`.
- **No-blob persistence/export precedent**: text-map assets export payload-only;
  `remoteMapAssets` export URL-only. A StarMap asset follows the text-map branch.
- **Main friction point**: `MsgMapChange.mapBlob` is non-optional and the player
  pipeline assumes a WebGL texture. StarMap needs either an optional `mapBlob` +
  descriptor field, or a discrete `MsgStarMap` message (preferred — see §4.5).

### 2.3 Foundry side — confirmed viable, shipped precedent

- Modules render arbitrary cross-origin iframes in application windows (Inline
  Webviewer, verified Foundry v13, does exactly "GM pushes URL, iframe window
  opens on every player's screen" via the `module.<id>` socket).
- WebRTC works in the Electron desktop client (Foundry's own A/V is WebRTC), so
  the catalogue's PeerJS path works for every player, desktop client included.
- Constraint: the Electron client cannot spawn OS popout windows — use in-app
  iframe windows/overlays (the precedent approach anyway). Scene *backgrounds*
  cannot host live HTML; a fullscreen iframe-over-canvas per-scene pattern exists
  (HTML To Scene) if a scene-like presentation is wanted later.
- Licensing/distribution: clean. Bridge modules embedding an owned external
  service are an established, registry-listed category.

---

## 3. Architecture overview (Mappadux StarMap)

```
GM machine (one browser)
┌─────────────────────────────┐        ┌──────────────────────────────┐
│ SSE2 GM tab (starsystemx)   │        │ Mappadux GM tab              │
│  - authors presets          │◄──BC──►│  - hidden SSE2 /bridge frame │
│  - drives focus/time/preset │        │    (same origin as SSE2 tab, │
│  - answers REQUEST_STARMAP  │        │     so BroadcastChannel works)│
│  - hosts PeerJS Peer(sid)   │        │  - bridge ↔ GMApp: postMessage│
└──────────────┬──────────────┘        └──────────────┬───────────────┘
               │ PeerJS (remote) / BC (same browser)   │ Mappadux P2P (tiny
               ▼                                       ▼  MsgStarMap descriptor)
       ┌───────────────────────────────────────────────────────┐
       │ Player device: Mappadux player.html                   │
       │   #starmap-layer iframe → SSE2 /catalogue?sid=&preset=│
       │   (iframe joins the SSE2 session itself — parallel    │
       │    channel; Mappadux carries no SSE2 data)            │
       └───────────────────────────────────────────────────────┘
```

Key idea: **the bridge frame**. BroadcastChannel is origin-scoped, not tab-scoped.
A hidden SSE2-origin iframe inside the Mappadux GM page sits on the *same*
BroadcastChannel as the GM's SSE2 tab. It can therefore discover the running
session, fetch the preset list, and relay commands — all using SSE2's existing
message plumbing — and talk to Mappadux over `window.postMessage` with strict
origin checks. Mappadux never needs to implement the SSE2 wire protocol.

### 3.1 Connect / discovery flow

1. GM clicks **Add StarMap** in Mappadux's map library.
2. Mappadux mounts the hidden bridge frame (`<sse2-origin>/bridge`).
3. Bridge sends a new `REQUEST_HELLO` on the channel; the SSE2 GM tab answers
   `ANNOUNCE {sessionId, starmapId, starmapName, presetSummaries[]}` (new
   messages, §4.1). No SSE2 tab open → timeout → Mappadux prompts "Open Star
   System Explorer and load your starmap" with a link.
4. Mappadux shows the discovered starmap name + the list of Player Views.
   The GM picks one or more; each becomes a StarMap map entry.
   Additionally (decision Q2): every UI point where a StarMap could be created
   or edited is connection-aware — if no SSE2 instance is reachable it says so
   inline and offers a one-click "Open Star System Explorer" (new tab at the
   configured origin), then resumes discovery when the tab announces itself.
5. Each map stores a `StarMapConfig` (§4.4) including the starmap id/name — the
   "make sure the right starmap is loaded next time" anchor.

### 3.2 Session-start / reload flow (the "is it loaded?" requirement)

On pack load or when a StarMap map is activated, Mappadux re-runs discovery:

- **SSE2 running, right starmap** → refresh sid if changed (should not change
  once G1 lands), go live.
- **SSE2 running, wrong starmap** → non-blocking banner: "This map expects
  starmap '<name>'. Currently loaded: '<other>'. Load it in SSE2 and press
  Retry."
- **SSE2 not running** → banner: "Open Star System Explorer to power this map"
  + link. Players who already have the map open see SSE2's own
  waiting/hold-screen behaviour.

Because SSE2 stores exactly one starmap (single IDB slot), "the right starmap is
loaded" is a simple id comparison.

### 3.3 Player flow

1. GM activates a StarMap map. Mappadux broadcasts `MsgStarMap` (descriptor:
   origin, sid, presetId, background colour). It also asks the bridge to ensure
   `enableRemote()` is on in the SSE2 tab (G5) so remote players can dial in.
2. `PlayerApp` sees the descriptor: hides/parks the WebGL canvas, shows
   `#starmap-layer` with an iframe at
   `<origin>/catalogue?sid=<sid>&preset=<presetId>&embed=1`.
3. The iframe connects itself: same-browser windows over BroadcastChannel,
   remote devices over PeerJS. Mappadux's job is done at this point.
4. Player interactivity happens *inside* the iframe, governed by the preset's
   `interactive`/`followGM` flags — SSE2's existing behaviour, untouched.
5. GM keeps driving from SSE2 (focus, time, preset pushes, hold screen). A
   `SYNC_PRESET` push changes what every connected view shows, including
   Mappadux-embedded ones — see Q3 about pinning.

### 3.4 What Mappadux switches off for StarMap maps

| Subsystem | Behaviour on a StarMap map |
|---|---|
| Filters | Force `none` via `_effectiveFilter()`; grey the filter dropdown + FX button. SSE2's preset filter is the filter. |
| Viewport crop (`view_update`) | Bypassed; iframe is full-bleed. ViewportEditor hidden. `backgroundColor` still honoured behind the iframe (letterbox). |
| Fog | Disabled (nothing to fog). |
| Pings | KEPT (decision Q4) — screen-space pings over the iframe. Roughly aligned only (they do not track SSE2's pan/zoom); good enough for "look here". |
| Markers / annotations / measure | Disabled — their coordinates are map-texture space, which does not exist here, and SSE2 has its own pointer story. The player-side tool dropdown restricts itself to Ping only (other tools hidden, not merely inert). |
| Grid | Disabled. |
| Transitions | Keep: transition out of the previous map, then reveal the iframe (nice continuity, cheap). |
| Audio / soundboard / tracker | Unaffected — these are not map-space features and keep working alongside. |

Projector: v1 shows the same full-bleed iframe (calibration/crop meaningless for
a live external view). See Q5.

---

## 4. Design elements (high level)

### 4.1 SSE2: session identity + hello (fixes G1/G2)

- Add `broadcastId?: string` to `Starmap`, generated once (first share/bridge
  contact) and persisted with the starmap in the existing IDB slot. The GM page
  uses it as `broadcastSessionId` (and PeerJS host id) instead of a fresh
  `generateId()` per load. Backwards compatible: absent → generate + save.
  Result: player URLs, QR codes, Mappadux packs and Foundry settings all stay
  valid across GM restarts.
- New broadcast messages:
  - `REQUEST_HELLO` (payload null) — any guest asks "who is here".
  - `ANNOUNCE {sessionId, starmapId, starmapName, presets: {id, name}[]}` — GM
    tab answers (and may proactively send on starmap load/change).
  - `REQUEST_REMOTE {sessionId}` — asks the GM tab to call `enableRemote()`
    (G5). GM-side may show a one-line toast so it is never silent.

### 4.2 SSE2: `/bridge` route (fixes G3 for the Mappadux case)

Tiny UI-less route intended only for embedding by a trusted parent:

- Speaks `postMessage` to `window.parent` with an explicit allowlisted
  `targetOrigin` (configurable; localhost dev origins + the Mappadux prod
  origin). Ignores messages from any other origin.
- Commands in: `hello` (run discovery), `ensureRemote`, `listPresets`.
- Events out: `announce`, `gone` (hello timeout), `error`.
- It is a *read/relay* surface only — it cannot edit the starmap. The security
  posture matches the existing one: anyone with the sid can already read the
  redacted snapshot; the bridge exposes nothing beyond that plus preset names.

### 4.3 SSE2: embed mode (fixes G4)

`?embed=1` on `/catalogue`: suppress the status header/back-navigation chrome
that a host app duplicates; keep the hold screen and waiting states (they are
the correct UX when the GM pauses/leaves). Exact chrome list is a detailed-design
item.

### 4.4 Mappadux: the StarMap map kind

```ts
// on MapAsset (mirrors textMap?: TextMapConfig)
starMap?: {
  origin: string;        // SSE2 origin, default https://starsystemx.com
  sessionId: string;     // stable broadcastId (G1)
  starmapId: string;     // identity anchor for the reload prompt
  starmapName: string;   // for human-readable prompts
  presetId: string;      // the Player View this map shows
  presetName: string;    // display
}
```

- `source: 'starmap'`, no blob ever; new glyph in the map dropdown.
- Persistence: asset metadata only → exports in bundles via the text-map branch
  (payload, no bytes). Loading a pack on another machine keeps working as long
  as the SSE2 session is reachable (same GM machine scenario unchanged).
- Add-flow: **Add StarMap** button in the map library footer (next to Create
  Handout / Composite) → bridge discovery dialog → tick one or more Player
  Views → one StarMap map minted per ticked view.

### 4.5 Mappadux: wire + render

- New `MsgStarMap` GMMessage (discrete message, modelled on `MsgTextMapVideos`)
  rather than bending `map_change`'s required `mapBlob`. `map_change` ordering
  semantics stay untouched for every existing kind; StarMap activation sends
  `MsgStarMap` where `map_change` would have gone. `full_state` gains the same
  descriptor for late joiners.
- `StarMapLayer` (clone of `TextMapVideoLayer`): full-bleed iframe on GM,
  player and projector surfaces. GM mode is interactive (the GM can poke the
  view); player mode keeps pointer events ON (unlike the YouTube layer) because
  player interactivity is a feature — the preset's `interactive` flag governs
  actual capability inside SSE2. Reuses the fullscreen-blank `refresh()`
  workaround.
- GM preview: the GM's own canvas area shows the same layer (the GM's *control*
  surface remains the SSE2 tab, per the guiding principle — the Mappadux preview
  is just "what players see").
- **Full fidelity by construction**: the iframe is the real SSE2 app running in
  its own browsing context — its own WebGL, shaders, filters and input. Nothing
  is proxied or re-rendered by Mappadux, so the embedded view is pixel-identical
  to a directly-opened player view.

### 4.5b Instant switching: pre-warm + render pause

The target table flow is "station map / terminal screens in Mappadux, then drop
straight into the starmap". Two measures make that cut instant instead of a
1-3 s cold iframe boot (SvelteKit load + lazy three chunk + starmap handshake):

- **Pre-warm/keep-alive**: when the loaded pack contains any StarMap map, the
  player view mounts the catalogue iframe hidden at session start — loaded,
  connected and ticking. Activating a StarMap map is then a show/hide toggle;
  switching back to a normal map keeps the iframe warm. Multiple StarMap maps
  (different presets) share one iframe, swapping preset without reload (URL
  param on first load; postMessage or a preset-swap message later).
- **Render pause**: while the iframe is visible, pause Mappadux's own WebGL
  render loop (canvas is already hidden) so the player device runs exactly one
  3D app at a time. Resume on switch-back. Matters on tablets/Smart TVs.

Mappadux map transitions still play over the swap, so the station-deck-to-
starmap cut can be styled.

### 4.6 Complementary mode: SSE2 snapshot → Mappadux handout/asset — DROPPED

**Decision (Q9): not building.** Kept on file because the reasoning stays valid
if demand appears: an SSE2 "Export view as image" (PNG capture of the current
render) would let star content enter Mappadux as a normal raster asset, where
filters, fog, annotations, composite tiles and text-map handout framing all
work (the live path deliberately disables them). Cost when revived: one SSE2
button (plain capture) or a small export dialog (resolution / hide-UI /
transparent background for composite tiles); zero Mappadux code. Banked.

---

## 5. Foundry VTT — SSE2 module (sanity check: GO)

**Capability: confirmed.** All load-bearing mechanisms exist with shipped
precedent (Inline Webviewer = iframe app window pushed to all players over the
`module.<id>` socket, verified on v13; WebRTC works in the Electron client;
starsystemx.com is embeddable — no blocking headers).

**Shape of the module (thin — SSE2 does all the heavy lifting):**

- `module.json` with `socket: true`, targeting v13+ (ApplicationV2 only; skip
  the AppV1 dual-path).
- GM settings: SSE2 origin + session id (paste the share URL; the module parses
  it) — or, later, the module embeds the same `/bridge` frame for discovery,
  identical to Mappadux.
- GM UI: a small control (scene controls button or journal-style header button)
  listing presets (from bridge/announce, or manually configured), with
  Open / Change / Close on players.
- Socket messages: `show {url}`, `close` — receivers open/close an AppV2 window
  containing the catalogue iframe. Late joiners: GM re-emits on `userConnected`.
- Every player iframe connects to SSE2 over PeerJS (assume PeerJS everywhere in
  the Foundry context; do not rely on BroadcastChannel).
- Optional v2: "scene mode" — fullscreen iframe over the canvas per scene
  (HTML To Scene pattern, reimplemented; the original module is stale).

**Dependencies on the SSE2 work above:** G1 (stable sid — otherwise the module's
stored URL dies every GM reload) and G4 (embed chrome). G2/G3 are optional
polish for Foundry (paste-URL works without them). So the Foundry module slots
naturally *after* Phase 1 below, and shares it.

**Should we:** yes, with modest expectations. Cost is low (a few hundred lines +
release plumbing + a Foundry license for testing), it reuses the exact embed
contract Mappadux hardens, and it opens SSE2 to the largest VTT audience.
Electron popout limitation and iframe-steals-keyboard-focus are known cosmetic
caveats to document.

## 6. Foundry VTT — Mappadux module (sanity check: CAN yes, VALUE selective)

**Capability:** identical mechanism — Mappadux's `player.html#<roomcode>` is
also a self-contained page connecting over PeerJS, and the same socket+iframe
module skeleton would push it to Foundry players. Technically this is the same
module twice with a different URL.

**Value — honest assessment:** weaker than the SSE2 case, because Mappadux's
core (battlemap, fog, tokens/markers, grid) *competes with Foundry's core*
rather than complementing it. A Foundry GM already has scenes, fog and tokens;
embedding a second battlemap adds confusion, not capability. The parts of
Mappadux with real pull for Foundry users are the ones Foundry lacks:

- the WebGL filter looks (CRT/night-vision/thermal ambience screens),
- the motion tracker,
- text-map handouts / document props,
- soundtrack/soundboard scenes driven from one GM surface.

These are all *auxiliary screens*, which is exactly what an iframe window is
good at. Meanwhile Mappadux's genuinely unique deployment tricks (projector
calibration, tablet-as-table-screen, Smart-TV player view) need real windows and
physical screens — Foundry-in-Electron adds nothing to them.

**Recommendation:** do not build a dedicated Mappadux module now. Instead build
the SSE2 module as a lightly **generalised "live GM screen" embed module**
(config = named URL entries + open/close/push socket) so pointing it at a
Mappadux player URL is free. If Foundry-side demand for Mappadux surfaces
materialises, promote it to a branded module then. This keeps one codebase, one
review, one release pipeline.

## 7. Phasing

- **Phase 1 — SSE2 embed contract** (independent value: fixes stale player
  links/QRs for everyone, not just integrations): stable `broadcastId` (G1),
  `REQUEST_HELLO`/`ANNOUNCE`/`REQUEST_REMOTE` (G2/G5), `?embed=1` (G4),
  disconnect detection polish (G6).
- **Phase 2 — SSE2 `/bridge` route** (G3) + postMessage contract with origin
  allowlist.
- **Phase 3 — Mappadux StarMap map kind**: asset kind + Add-StarMap discovery
  dialog (connection-aware, offers to open SSE2), `MsgStarMap`, `StarMapLayer`
  (player/projector/GM) with pre-warm/keep-alive + render pause, ping-only
  player tools, disable gates (filters/viewport/fog/markers/grid), bundle
  export, reload-prompt flow.
- **Phase 4 — Foundry module** (generalised "live GM screen" embed): after the
  Mappadux integration has proven the embed contract in real sessions
  (decision Q8).

Phases 1–2 land on the SSE2 beta channel; Phase 3 on the Mappadux beta channel;
they are independently shippable. The snapshot path (old Phase 4) is dropped
per decision Q9 (see 4.6).

## 8. Risks / notes

- **Public PeerJS broker** (0.peerjs.com) is a shared dependency of both apps'
  remote paths; both already accept this. A self-hosted broker remains the
  escape hatch if it ever degrades.
- **Origins**: config must carry the SSE2 origin (prod vs beta vs localhost dev)
  — a beta-channel GM pointing players at the prod origin would silently talk to
  a different deployment. Default prod, overridable.
- **Same-browser vs remote**: the GM's SSE2 tab and Mappadux tab must share a
  browser profile for the bridge (BroadcastChannel). Remote *players* are
  unaffected (PeerJS). GM running SSE2 on a different machine from Mappadux is
  out of scope v1.
- **Security**: bridge postMessage uses explicit origin allowlists both ways;
  the sid continues to grant read-only redacted data only (existing posture).
- **Iframe focus**: a focused iframe eats keyboard shortcuts of the host app
  (both Mappadux and Foundry). Known cosmetic caveat; document it.
- **Cross-origin fullscreen blank**: already solved by the `refresh()` pattern
  in `TextMapVideoLayer`; carry it into `StarMapLayer`.

## 9. Part II — Detailed design

Part I above is the settled high-level design. This part is the build spec.
The Mappadux Phase 3 spec lives in the Mappadux repo
(`docs/starmap-map-kind-design.md`) per decision Q7; Phases 1-2 and 4-5 are
specified here because they are SSE2-side (or SSE2-adjacent) work.

### 9.1 Phase 1 — SSE2 embed contract

All changes are additive to the one deployed app. No integration-specific
build or origin: direct players, Mappadux, Foundry and Owlbear all consume the
same URL and the same broadcast contract.

**1A. Stable session id (G1)**

- `src/lib/types.ts`: add `broadcastId?: string` to `Starmap`.
- New `ensureBroadcastId(starmap): string` helper (suggested home
  `src/lib/broadcastId.ts`): return `starmap.broadcastId` if present, else
  generate via `generateId()`, assign, and let the existing auto-persist path
  save it. Called from the GM route.
- `src/routes/+page.svelte`: replace the static
  `let broadcastSessionId = generateId()` (line ~64) with a reactive derivation
  from the loaded starmap. `initSender(broadcastSessionId)` must re-run when
  the id changes (it is a cheap field-set; safe to call repeatedly). The
  `PlayerViewModal`/`CompanionModal`/`SystemView` props are already reactive.
- Fallback: before any starmap is loaded, keep an ephemeral `generateId()` so
  the broadcast service is never idless.
- **Portability is the point**: the id lives IN the starmap data, so saving
  the file and loading it on another PC re-hosts the same channel — all
  stored player URLs/QRs/pack configs/module settings reconnect unchanged.
- **Collision handling — PROMPT, never silently regenerate**: PeerJS ids are
  claim-by-first, so `unavailable-id` (hook: `peer.on('error')` in
  `initPeerHost`, `src/lib/broadcast.ts:101`) has two innocent causes — the
  GM's own stale tab on another machine, or a copied file at another table.
  Show: "Another session is already hosting this starmap's channel (an old
  tab on another PC?). Close it and Retry, or Regenerate a new id." Silent
  regeneration would break every stored link in the move-to-a-new-PC case.
- **Share-safe export**: because `broadcastId` (and `gmToken`, §12.3) travel
  in the starmap data, a "Save a copy for sharing" export strips both; the
  recipient's app mints fresh ones on first load. Normal saves/backups keep
  them — only the deliberate share-copy sheds session identity.
- Redaction: `computePlayerStarmapSnapshot` may keep or strip `broadcastId`;
  players already know the sid from their URL. No requirement either way.
- **Entropy + revocation (audit F2) + readable format:** `broadcastId` is a
  long-lived bearer capability, formatted for humans:
  `<name-slug>-<word>-<word>-<NN>` — e.g. `my_tuesday_game-gamma-spice-42`.
  - **Name prefix**: slug of the starmap name at mint time (lowercase,
    keep `[a-z0-9_-]`, strip the rest, cap ~24 chars; fallback to a word if
    empty). PeerJS ids only tolerate `[A-Za-z0-9_-]`. The prefix is FROZEN
    at mint — renaming the starmap must NOT re-derive the id (that would
    break every stored link); the regenerate control covers a wanted rename.
  - **Random tail**: 2 words from a deduplicated, phonetically-distinct
    1024-word space/science-fiction/science list + a 2-digit suffix, all
    chosen with `crypto.getRandomValues` (NOT `Math.random`) — ~27 bits.
    The name prefix carries ZERO secrecy (names get spoken/streamed), so the
    tail is the security: ~100M combinations is years of scanning at PeerJS
    broker probe rates, proportionate to the asset (read-only redacted
    fiction + griefing) given revocation exists.
  - Readability pays for itself: the code identifies its campaign at a
    glance in VTT module settings, can be spoken at the table, and typed on
    TV browsers. Mappadux's own room codes stay as they are (ephemeral,
    lower stakes). `gmToken` remains opaque crypto-random 128-bit hex: no
    human ever types it. Add a "Regenerate session id" control in the
    integration/share settings as the revocation path for a leaked sid (old
    links/QRs/pack configs die; the connection-aware VTT flows recover via
    discovery).

**1B. Discovery + remote-request messages (G2/G5)**

Extend the `BroadcastMessage` union (`src/lib/broadcast.ts:20-44`):

```ts
| { type: 'REQUEST_HELLO'; payload: string | null }   // target sid, null = any host
| { type: 'ANNOUNCE'; payload: AnnouncePayload }
| { type: 'REQUEST_REMOTE'; payload: string | null }  // target sid
| { type: 'SYNC_HEARTBEAT'; payload: number }         // GM wall-clock ms (see 1D)

interface AnnouncePayload {
  sessionId: string;      // = starmap.broadcastId
  starmapId: string;
  starmapName: string;
  presets: { id: string; name: string }[];  // playerPresetList, names only
  appVersion: string;     // package.json version, for integration gating
}
```

- `handleMessage` routing follows the existing patterns exactly:
  `REQUEST_HELLO`/`REQUEST_REMOTE` are sender-side handlers with the same
  null-or-matching-target rule as `REQUEST_SYNC` (broadcast.ts:355-362);
  `ANNOUNCE`/`SYNC_HEARTBEAT` are receiver-side handlers
  (`onAnnounce`, `onHeartbeat` public fields).
- New lightweight receiver mode `initProbe(onAnnounce)` — sets
  `isSender=false`, `targetSessionId=null`, wires only `onAnnounce`, and does
  NOT dial PeerJS (the bridge is same-machine by definition). Avoids the
  8-callback `initReceiver` ceremony.
- GM side (`src/routes/+page.svelte`, next to the existing
  `onRequestStarmap` wiring at ~632):
  - `onRequestHello` → `sendMessage({type:'ANNOUNCE', ...})` built from
    `$starmapStore` + `playerPresetList`.
  - Proactive `sendIfChanged(ANNOUNCE)` reactive on starmap id/name/preset
    list, so an open bridge hears mid-session changes without polling.
  - `onRequestRemote` → `broadcastService.enableRemote()` + a small transient
    GM-side notice ("Remote sharing enabled for <starmap name>") so hosting on
    the public broker is never silent.

**1C. Embed mode (G4) + parent command listener**

- `/catalogue` reads `embed=1` → `embedMode`. In embed mode: hide the status
  header bar (branding/LIVE pill) and any host-duplicated chrome; keep the
  hold screen, waiting/"Reaching the host" states, and all in-view navigation
  (system list, back button) — those are content, not chrome. Exact element
  list to be finalised against the live DOM at build time.
- **Parent postMessage commands (embed mode only)**: the catalogue registers a
  `window.addEventListener('message')` handler, active only when `embedMode`
  and `window.parent !== window`, accepting only allowlisted origins (shared
  constant with the bridge, §9.2). Command set v1:
  - `{ns:'sse2-embed', v:1, cmd:'setPreset', presetId}` — switch the active
    preset locally (same code path as a `SYNC_PRESET` arrival, without
    overrides). A later GM `SYNC_PRESET` still wins (last-write-wins), which
    is exactly decision Q3.
  Note: there is deliberately NO `focus` embed command or `?focus=` URL param
  — pointing the view at a body is VIEW-DRIVING and stays on the GM broadcast
  channel (the GM tab applies the focus and the existing SYNC_FOCUS /
  SYNC_FOCUS_LEVEL / framing toolset carries it to every viewer). VTT deep
  links request it via `REQUEST_FOCUS` on the GM channel — see §12.
  - `{ns:'sse2-embed', v:1, cmd:'ping'}` → reply `{event:'pong'}` (host-side
    liveness/handshake).
  This is what lets a host switch between StarMap maps with different presets
  on ONE warm iframe — no reload, instant cut.

**1D. Disconnect detection (G6) + guest reconnect**

- GM sends `SYNC_HEARTBEAT` every 5 s (interval owned by `+page.svelte`,
  started with `initSender`; plain `sendMessage`, one tiny frame).
- Catalogue: track `lastHeardAt` on every accepted message; a 5 s ticker sets
  `connected = (now - lastHeardAt) < 15_000`. Any arrival flips it back —
  replaces the current latch-true-forever behaviour.
- Guest PeerJS reconnect (fixes the long-banked refinement): on
  `peerOut.on('close')` or heartbeat loss while remote, retry
  `initPeerGuest(sid)` every 10 s until reconnected.

### 9.2 Phase 2 — `/bridge` route

- `src/routes/bridge/+page.svelte` (+ `+page.ts`, `ssr=false`). No visible UI
  (renders nothing but a debug line when opened directly).
- **Origin allowlist** (shared constant, suggested
  `src/lib/embedOrigins.ts`): exact-match list
  `https://www.mappadux.com`, `https://mappadux.com` (+ beta origin when one
  exists) plus a dev regex `^http://(localhost|127\.0\.0\.1)(:\d+)?$`.
  Checked against `event.origin` on every inbound message; every outbound
  `postMessage` uses the caller's origin as explicit `targetOrigin` — never
  `'*'`.
- Protocol (all frames carry `{ns:'sse2-bridge', v:1}`):
  - bridge → parent on mount: `{event:'ready'}`
  - parent → bridge: `{cmd:'hello', requestId}` — bridge calls
    `initProbe(onAnnounce)`, sends `REQUEST_HELLO(null)`, answers with
    `{event:'announce', requestId, payload: AnnouncePayload}` or, after a
    2.5 s timeout, `{event:'gone', requestId}`. Unsolicited ANNOUNCE arrivals
    (proactive re-announces) are forwarded as `{event:'announce'}` without a
    requestId — this is how the host's "Open SSE2, then auto-resume" flow
    completes without polling.
  - parent → bridge: `{cmd:'ensureRemote', sessionId, requestId}` — sends
    `REQUEST_REMOTE(sessionId)`, replies `{event:'ok', requestId}`.
  - errors: `{event:'error', requestId, message}`.
- The bridge is read/relay only; it exposes starmap identity + preset names,
  nothing an sid-holder could not already obtain.

### 9.3 Phase 3 — Mappadux StarMap map kind

Specified in the Mappadux repo: `docs/starmap-map-kind-design.md`
(decision Q7). Summary of the contract it consumes from this side:
`AnnouncePayload` (discovery), `/catalogue?sid&preset&embed=1` (view),
`setPreset` postMessage (instant preset switch on a warm iframe),
`SYNC_HEARTBEAT` semantics (its own connection pill). It requires
`AnnouncePayload.appVersion` >= the Phase 1 release version and degrades to
"update Star System Explorer" messaging below that.

### 9.4 Phase 4 — Foundry module (after Mappadux, decision Q8)

Thin generalised "live GM screen" module; working id `gm-screen-embed`
(final name at build).

- `module.json`: `id`, `title`, `compatibility {minimum: 13, verified: 13}`,
  `socket: true`, `esmodules: ["module.js"]`; distributed via GitHub releases
  (`manifest`/`download` URLs). ApplicationV2 only.
- **Config** (world settings): a list of named screen entries
  `{name, url}`. For SSE2 the GM pastes the share URL from the Player Views
  modal; the module recognises SSE2 URLs and appends `embed=1`. (Bridge-based
  discovery inside Foundry is possible later — the module could host the same
  hidden `/bridge` iframe — but paste-URL ships first.)
- **GM UI**: a scene-controls button opening a small AppV2 picker listing the
  entries with Open / Change / Close — deliberately mirroring the SSE2 Player
  Views modal verbs.
- **Socket protocol** on `module.<id>`:
  `{action:'show', url, w?, h?}` | `{action:'close'}`. Receivers (players)
  open/replace/close a frameless-ish AppV2 window containing
  `<iframe src=url allow="autoplay">`. The GM client applies the same action
  locally (socket emit does not echo to sender).
- **Late joiners**: GM client re-emits current state on the `userConnected`
  hook; current state also mirrored to a world setting as backstop.
- Player connectivity is always the PeerJS path (assume no shared browser
  profile). Known caveats to document in the README: focused iframe eats
  Foundry hotkeys; Electron client has no OS popouts (in-app window only).
- Pointing an entry at a Mappadux player URL (`player.html#<roomcode>`) gives
  the Mappadux-in-Foundry auxiliary-screen story for free (section 6).

### 9.5 Phase 5 — Owlbear Rodeo extension (after Foundry lessons learned)

Research verdict (2026-07-20): **feasible, no hard blockers found**, and the
fit is unusually clean — Owlbear 2.0 extensions ARE developer-hosted iframes,
so SSE2 can serve the extension directly from its own origin with no wrapper
domain.

Confirmed mechanics (docs.owlbear.rodeo, fetched):

- Extension = a hosted `manifest.json` (name, version, icon, `action` popover
  URL, optional `background_url`, `permissions`). Users add it in their
  profile; the room owner enables it per room — **players install nothing**;
  room-enabled extensions load for every member.
- Render surfaces: action popover (resizable), arbitrary-size
  `OBR.popover.open`, and `OBR.modal.open({fullScreen: true})` — a true
  fullscreen surface for the live view.
- `background_url` = a hidden page running on EVERY client with no click.
  Push pattern: GM control panel calls `OBR.broadcast.sendMessage` (16 KB
  cap, fine for control frames) → each player's background page receives it →
  opens/closes the fullscreen modal locally. Durable state (sid, current
  preset, live flag) sits in `OBR.room` metadata (16 KB total) so late
  joiners sync without a rebroadcast. `OBR.player.getRole()` gates the GM UI.
- Precedent: dddice runs fullscreen external-origin WebGL overlays on all
  players' screens synced via its own backend; Theatre!/PDF/Sheet-from-Beyond
  push shared popups. Distribution: free PR to the owlbear-rodeo/extensions
  repo, optional; direct manifest-URL install works for private beta.
  SDK is MIT; commercial extensions are normal.

Module shape (mirrors the Foundry split, all served from the SSE2 origin):

- `/obr/manifest.json` — the extension manifest.
- `/obr/panel` — action popover: GM-only controls (session paste-or-detect,
  preset list, Open/Change/Close on players) writing room metadata +
  broadcasting control frames; player role sees a status line.
- `/obr/background` — background page: listens, opens
  `OBR.modal.open({url: '/catalogue?sid=…&preset=…&embed=1', fullScreen})`.
- `/catalogue` unchanged beyond the existing `embed=1`; the page
  feature-detects the OBR SDK rather than requiring it. Data plane stays
  SSE2's PeerJS (players are on different machines; the 16 KB OBR caps never
  carry view data).

De-risk spike before scheduling (~1 hour): a bare page inside an OBR room
confirming PeerJS data connections + localStorage behave in the extension
iframe (expected yes — WebRTC data channels are not gated by iframe
permissions policy; unverified only because no existing extension uses
PeerJS specifically). One verification-badge note: the optional "works with
cookies disabled" guideline may conflict with catalogue localStorage use —
only matters if the badge is chased.

### 9.6 Market context (scan run 2026-07-20)

Question asked: is there anything like SSE2 in the VTT space? Short answer: as
a combined product, no. The space splits into static generators (Sectors
Without Number, donjon, Starsy, Cosmographer), static VTT content (Traveller
Map importer modules, map packs), and exactly two tools with animated orbital
mechanics — neither of which has redacted GM-driven player views, 3D, real
physics AND transit planning together.

| Tool | Live orbits | Player view / GM drive | Physics | Status | Delta vs SSE2 |
|---|---|---|---|---|---|
| Augur: Sci-Fi (paid Foundry module) | Yes, 2D | Foundry clients only; no redaction model or fiction skins | Deliberately none | ACTIVE, commercial, monthly releases | Foundry-locked, 2D, no physics/transit; has LLM descriptions |
| Sectors Without Number (free web) | No (static hex) | Yes — hidden entities + player view (player-browsed, not driven) | None | Alive, slow | Sector scale only; proves demand for redaction |
| AstroSynthesis 3 (Windows desktop) | Yes, Keplerian + time scrub, 3D | None (single-user) | Moderate | Legacy (~2011), still sold | No web/multiplayer/player views |
| Traveller Map + Foundry importers | Pan/zoom only | None | Canon data | Active | Fixed-universe atlas, not a generator/table tool |
| Starsy / donjon / itch generators | No | No | None | Various | Prep artefacts only |

Implications for this design: (1) the "players open a link and get a live,
in-fiction, filtered terminal the GM drives" loop appears genuinely unique —
the integrations in this doc are how it reaches tables that live inside other
VTTs; (2) the one competitor to watch is Augur Studios (active, commercial,
could plausibly add a player-view layer); (3) positioning is "the sensor
display beside any VTT", not "another VTT" — which is exactly the generalised
embed-module shape chosen in section 6/9.4. Discovery is the challenge, not
competition: the category has no shelf, so the Foundry/Owlbear listings double
as the marketing surface.

---

## 10. Decision log (settled 2026-07-20)

- **Q1 — Session identity: PERSIST.** Per-starmap `broadcastId` stored with the
  starmap (G1); stable player URLs/QRs/pack references across GM restarts.
- **Q2 — Discovery: BRIDGE AUTO-DISCOVERY**, plus connection-aware StarMap
  create/edit UI — when no SSE2 instance answers, Mappadux says so inline and
  offers a one-click "Open Star System Explorer" to get one running (§3.1).
- **Q3 — Preset pushes: FOLLOW THE GM PUSH.** The configured Player View is the
  starting view; `SYNC_PRESET` switches embedded views live like any other
  player window. No pinning.
- **Q4 — Overlays: PINGS ONLY.** Screen-space pings stay available over the
  iframe; markers/annotations/measure/fog/grid disabled, and the player tool
  dropdown offers Ping only on StarMap maps. Non-map-space features (chat,
  audio, soundboard, tracker) are unaffected and keep working. Banked idea:
  forward pings into SSE2 via the bridge as "GM points at body X".
- **Q5 — Projector: FULL-BLEED** same-as-player iframe. (A per-map separate
  projector preset — e.g. top-down Projection view — noted as a possible v2.)
- **Q6 — Hold behaviour: SSE2'S HOLD SCREEN.** No Mappadux-side fallback; the
  GM controls standby from SSE2 like any player window.
- **Q7 — Doc home: SSE2 `docs/dev/`**, with the Mappadux-side implementation
  spec splitting into the Mappadux repo when Phase 3 starts.
- **Q8 — Foundry timing: AFTER the Mappadux integration** has proven the embed
  contract in real sessions.
- **Q9 — Snapshot export: SKIPPED.** No static export path; live StarMap only
  (§4.6 kept as a banked record).


## 11. Network reality — WAN, NAT and relays (supplementary, analysed 2026-07-22)

Prompted by the question "these apps have only ever been used on a local
network — are we really set up for internet P2P?" Short answer: yes by
construction, unproven by testing. This section replaces an earlier pasted
draft of the same topic with the verified facts.

### 11.1 Architectural reality

- Neither VTT relays third-party view data. Foundry sockets and Owlbear
  broadcast/metadata are small control planes (Owlbear caps at 16 KB);
  precedent extensions (dddice) bring their own transport exactly as this
  design does. The PeerJS pipe is and remains the data plane for remote
  players.
- **Nothing streams.** The player's device renders the 3D view locally; the
  wire carries one redacted snapshot at join (a few hundred KB, chunked) plus
  small incremental updates and heartbeats. A fully TURN-relayed player costs
  kilobytes per second — this workload is nothing like video, so relay
  bandwidth economics are a non-issue at table scale.
- WebRTC data channels over the public internet are the standard mechanism
  (videoconferencing, dddice); a LAN is merely the easy case of the same
  machinery. The design gap is evidence, not architecture: no real WAN test
  has ever been run.

### 11.2 What the stack already does (verified in node_modules, both repos)

Both apps use `peerjs@1.5.5` constructed with no config, which ships defaults
of Google STUN (`stun:stun.l.google.com:19302`) **plus free TURN relays**
(`turn:eu-0.turn.peerjs.com:3478`, `turn:us-0.turn.peerjs.com:3478`, the
PeerJS project's community relay). So today, without any change:

- Standard consumer NATs negotiate a direct P2P link via STUN (the large
  majority of home networks).
- Symmetric NAT / CGNAT / strict-firewall players fall back to the community
  TURN relay rather than hard-failing.

The correction to the earlier draft: the default is NOT STUN-only; a relay
fallback already exists. The true weakness is that both the `0.peerjs.com`
broker and the community TURN are best-effort infrastructure with no SLA.

### 11.3 Plan

- **Phase 0 (do before any Phase 1 code): a real WAN test.** One device on
  cellular data, one on home broadband; GM opens SSE2, player opens the share
  URL. Pass = live view + focus/time following. Repeat with the Mappadux
  player URL. ~30 minutes, converts "I think" into data, and decides how much
  of the rest is needed.
- **Explicit ICE config surface (Phase 1 hardening, SSE2 + Mappadux alike):**
  make `iceServers` a configurable override rather than a bundled default —
  GM settings accept a custom STUN/TURN list (URL, username, credential).
  Keeps the zero-infrastructure default; tables needing guaranteed traversal
  bring their own relay (self-hosted coturn or a free-tier managed TURN).
- **Delivery must be pre-connection** (correction to the earlier draft, which
  proposed the discovery payload — a chicken-and-egg: remote players need ICE
  config BEFORE they can join the channel that would carry it). Custom ICE
  config travels in: the share URL/QR (compact-encoded param), the Mappadux
  `StarMapConfig`, and the Foundry/Owlbear module settings. Absent = PeerJS
  defaults.
- **Failure detection + honest UI:** monitor the peer connection state
  (PeerJS surfaces ICE failure on the underlying RTCPeerConnection;
  `failed` typically lands within ~15 s). On failure, the catalogue replaces
  the waiting overlay with a hard in-fiction error ("SENSOR LINK BLOCKED —
  NETWORK RELAY REQUIRED") plus a plain-language line that the local network
  blocks direct connections and a relay must be configured. This folds into
  the Phase 1D disconnect work (§9.1) — same state machine, one more state.
- **Escape hatch (banked, not scheduled):** if the community broker/TURN ever
  degrades, one small VPS running PeerServer + coturn replaces both;
  config-only for clients that already accept custom ICE + broker host. No
  architectural change.

### 11.4 Verdict

Do not give up the VTT idea. The transport was internet-grade from day one;
the workload is state-sync, not streaming; a relay fallback already exists by
default. Remaining work is one afternoon of hardening (config surface +
failure UI) plus a half-hour test that should have happened years ago.

## 12. VTT data crossover — beyond the embedded view (analysed 2026-07-22)

Question: the v1 modules are thin (connect, pick a Player View, open it on
players). Could real data crossover with the host VTT make SSE2 read as a
proper tool of the VTT rather than a window beside it? Analysis and scoping;
none of this is required for the modules to be viable.

### 12.1 The enabling primitive: the data bridge

The module can obtain SSE2's entire REDACTED dataset already — the player
snapshot on the wire carries systems, body fact sheets, classifications,
player-safe descriptions, constructs and flight plans. Mechanism: a bridge
variant that dials PeerJS with the sid (`/bridge?sid=…`) and posts the
snapshot to its parent — needed anyway in Foundry, whose Electron client
cannot share a BroadcastChannel with a separate browser. Everything in the
tier table builds on this one primitive, and it is inherently spoiler-safe:
the module physically cannot see what the GM has hidden.

### 12.2 Tier table (utility vs effort)

| Tier | Feature | Mechanism | Effort | Utility |
|---|---|---|---|---|
| 0 | Connect + open/push player views | Sections 9.4/9.5 | — | The core |
| 1 | Clickable star-map links in notes | Foundry text enricher: `@sse2[bodyId]{label}` in any journal/chat → the GM's click sends `REQUEST_FOCUS {token, bodyId}` over the GM channel; the GM tab applies the focus to its own state, so the GM orrery AND every player view swing together via the existing SYNC_FOCUS/framing toolset (followGM/preset rules respected). Owlbear analogue: context-menu item on a marker | Small | HIGH — the whole table points at the place with one click in your notes |
| 2 | System dossier import → journals (HOPED scope, Foundry) | Module button builds/updates a Foundry journal folder: a page per body (facts, description, image, Tier 1 link back). Player-safe by construction | Moderate | MEDIUM-HIGH — content generation rather than locations, but strong native-tool feel; post-v1 roadmap, not a commitment |
| 3 | Notes/actor ↔ body back-links (HOPED scope, Foundry) | Module-side mapping (flags); "open linked journal" on focus (needs a `focusChanged` event out of the embed) | Moderate | MEDIUM — the cheap half rides Tier 2 |
| 4 | Party/location tracker | Constructs + journeys are in the snapshot: widget shows "Aboard <ship> — in transit to <body>, ETA …"; optional body→scene mapping with one-click activate on arrival | Small on top of Tier 2 | MEDIUM-HIGH — table flavour, demos brilliantly |
| 5 | Deep canvas/actor sync (tokens as ships, PCs aboard constructs, bidirectional live data) | Fights both data models | High | LOW — recommend against |

Scoping (final 2026-07-22):

- **Foundry — hoped scope is the full Tier 0-4 ladder.** Committed v1 =
  Tier 0 + Tier 1 deep links; v1.1 = GM-notes panel (§12.3) + Tier 4
  location tracker; Tiers 2-3 (dossier import, back-links) are HOPED scope —
  the post-v1 roadmap that makes the module read as a first-class Foundry
  tool. Tier 5 never.
- **Mappadux and Owlbear — the location-framing subset**, expressed in each
  host's native idiom, all riding the same GM-channel calls:
  - Tier 1 Mappadux: a "starmap link" MARKER ROLE — a marker on a deck plan
    (e.g. the nav console) carrying a bodyId; badge tap sends
    `REQUEST_FOCUS` via the bridge, optionally auto-activating the StarMap
    map first. The whole table swings to the location from a tap on the
    station map. (Hoped scope, after the Phase 3 core ships.)
  - Tier 1 Owlbear: marker context-menu item, as specced.
  - Tier 4 both: the location tracker widget (Mappadux GM screen pill /
    Owlbear action popover), hoped scope.
  - Tiers 2-3 do not apply (no journal system in either).
- gmToken handling outside Foundry: Mappadux keeps it in LOCAL settings
  (localStorage), never in pack exports; Owlbear in extension local storage,
  never in room metadata.

### 12.3 GM Notes as a shared notepad

SSE2 carries `gmNotes` on every body, construct, system and the starmap.
Can they be a shared notepad with the VTT?

**The constraint:** redaction strips `gmNotes` from the player snapshot, and
the sid-based channel is joinable by anyone holding the sid — GM notes must
never travel on it. A notes integration therefore needs a narrow **GM
channel**:

- SSE2 mints a per-starmap `gmToken` (generated once, persisted beside
  `broadcastId`, NEVER broadcast; surfaced to the GM in the integration
  settings UI).
- New token-gated messages, validated by the GM tab: `REQUEST_GM_SYNC
  {token}` → `SYNC_GM_DATA` (the gmNotes map, node id → text);
  `GM_NOTES_WRITE {token, nodeId, text, ts}` (apply + persist + re-sync;
  last-write-wins on timestamp); and `REQUEST_FOCUS {token, bodyId}` (GM tab
  applies the focus to its own state — the existing reactive SYNC_FOCUS/
  SYNC_FOCUS_LEVEL/framing broadcast then drives every viewer; powers Tier 1
  deep links). Token scope is exactly notes-read + notes-write + focus,
  nothing else. A guest cannot inject SYNC_* directly: the channel is
  GM→players by construction (the host ignores SYNC_* from guests and never
  relays guest traffic), which is why view-driving requests route through the
  GM tab.
- **SECURITY-CRITICAL (audit F1): GM-channel replies must be DIRECTED.**
  `sendMessage` mirrors to the BroadcastChannel and to EVERY peer connection —
  replying to `REQUEST_GM_SYNC` that way would broadcast `SYNC_GM_DATA`
  (the GM notes) to every connected player. The broadcast service needs a
  directed-reply primitive (`replyTo(conn, envelope)` — send on the single
  requesting peer connection only, never the BroadcastChannel, never other
  peers), and ALL GM-channel responses must use it. This is a hard
  requirement of the GM-channel build, not a hardening option.
- Module side: token lives in GM-LOCAL (client-scope) settings — Foundry
  world-scope settings are readable by player clients and must not hold it.

**Foundry — DECIDED (2026-07-22): the flipped model, same as Owlbear.**
The module's GM panel shows and edits `gmNotes` for the focused/linked body
live over the GM channel. One source of truth (the starmap), zero sync
machinery, identical code in both VTTs. Journal two-way sync (GM-only
dossier-page sections synced off edit hooks) is BANKED — its costs (plain
text vs rich HTML round-tripping, conflicts, sync debugging) buy little over
the panel, and it drags the module away from the "SSE2 is a Map" centre of
gravity. Revisit only on real demand.

**Owlbear — no native counterpart, so the model flips:** there is no journal
system and room metadata caps at 16 KB total, so there is nothing VTT-side to
share notes WITH. Instead, SSE2 IS the notepad: the extension's GM panel
(action popover, GM role only) embeds the same notes editor over the GM
channel. Same code as Foundry model 1 — one implementation serves both VTTs.
This is not a lesser outcome; it is the same shared notepad with a single
source of truth and no sync to break.

SSE2-side prerequisites introduced by this section (schedule with Phase 1 or
as a fast follow): `gmToken` on the starmap; `REQUEST_GM_SYNC` /
`SYNC_GM_DATA` / `GM_NOTES_WRITE` / `REQUEST_FOCUS` messages. (The
`focusChanged` outbound embed event rode Tier 3 and is banked with it.)

## 13. Security review (2026-07-24, design-stage audit for internet exposure)

Context: the apps were built LAN-first; the VTT programme makes internet use
routine. Audit scope = both codebases as deployed today plus everything this
doc designs. Grounding: code scan of SSE2 (HTML-injection sites, the LLM
proxy route, secret patterns, PII) plus the Mappadux v2.14 data/network audit
(which remains valid: no telemetry beyond opt-in Vercel analytics, no keys in
bundles or broadcasts, sanitised splash HTML).

**Confirmed clean:** no hardcoded tokens/keys/secrets in either source tree;
no PII anywhere (no accounts, no email addresses in src); player-facing SSE2
surfaces (catalogue, reports, player views) contain no `{@html}` sinks — all
campaign strings render through Svelte auto-escaping, so even a forged host
cannot inject markup into player devices; postMessage surfaces in this design
carry origin allowlists both directions; tokens are specced out of pack
exports and room metadata.

**Threat model in one line:** there is no money and no PII here — the assets
are (a) GM notes (spoilers), (b) control of what players see (griefing),
(c) the deployment's availability/cost, (d) code execution on the GM's
browser. Findings ranked accordingly:

- **F1 — GM-channel replies must be directed, not broadcast (CRITICAL,
  design-stage — fixed in spec §12.3).** The transport mirrors every send to
  all pipes; a naive `SYNC_GM_DATA` reply would hand the GM notes to every
  player. Directed-reply primitive is now a hard requirement.
- **F2 — id/token entropy + revocation (HIGH, cheap — fixed in spec §9.1/1A).**
  `generateId()` is `Date.now` + `Math.random` (non-cryptographic). Fine for
  ephemeral ids; NOT fine once `broadcastId`/`gmToken` become persistent
  bearer capabilities. Use `crypto.getRandomValues`; add a regenerate/revoke
  control.
- **F3 — `/api/generate` is an unauthenticated open relay (MODERATE, exists
  in production TODAY, unrelated to the VTT work).** The route forwards any
  POST to a client-supplied `apiEndpoint` and streams the response. Abuse
  potential: free egress proxy + Vercel function-hours burn + the deployment
  becoming the visible origin of someone else's traffic. Data risk: none
  (user keys pass through per-request, never stored). Fix options: allowlist
  endpoints (openrouter.ai; localhost targets only make sense in local dev
  anyway) or move the call client-side (OpenRouter supports CORS) and delete
  the route. Schedule as an SSE2 fix independent of this programme.
- **F4 — GM-side `{@html}` sinks accept unescaped content (MODERATE).**
  `DescriptionEditor.renderMarkdown` injects description text with markdown
  substitutions but NO HTML escaping, and `AIExpansionModal` injects raw LLM
  output. Attack paths that matter now: a SHARED starmap file carrying a
  malicious description executes in the GM's browser on edit; LLM prompt
  injection can emit live HTML. Players are unaffected (escaped surfaces).
  Fix: escape-then-format in both sites (~10 lines). Schedule with F3.
- **F5 — request-flood amplification (LOW).** Anyone with the sid can spam
  `REQUEST_STARMAP` and the host re-sends the full snapshot each time
  (request path bypasses `sendIfChanged` by design, for late joiners).
  Mitigation when convenient: per-requester rate-limit on the answer path.
- **F6 — host impersonation via sid squatting (LOW, accepted).** With the GM
  offline, a sid-holder can register `Peer(sid)` and serve forged (escaped)
  campaign data to players, and `REQUEST_REMOTE` lets a sid-holder make the
  GM host publicly. Impact is content griefing by someone already inside the
  table's trust circle; revocation (F2) is the recovery. Documented, not
  engineered around.
- **F7 — clickjacking hardening (LOW, config-only).** `/catalogue` and
  `/bridge` are intentionally embeddable; the GM route is not and should get
  `Content-Security-Policy: frame-ancestors 'none'` via per-path headers
  (vercel.json) at Phase 1.
- **F8 — infrastructure privacy (accepted, documented).** The public PeerJS
  broker and community TURN see connection metadata and IPs (WebRTC peers see
  each other's IPs; TURN relays only DTLS ciphertext). BroadcastChannel is
  same-browser-profile readable. All inherent to the architecture; the
  self-host escape hatch (§11.3) covers tables that care.

**Verdict:** the instinct "no real attack surface, no critical data" is
broadly right — nothing here holds money, identities or secrets, and the
worst realistic outcomes are spoiler leakage (F1, now designed out), session
griefing by sid-holders (F6, accepted trust model), and platform-cost abuse
(F3). The two pre-existing items (F3, F4) are worth fixing on the SSE2 beta
regardless of the VTT programme; everything else is already folded into the
build specs above.

## 14. Build status and the reuse boundary (2026-08-17)

**Shipped.** SSE Phases 1-2 (v2.1.722-beta: stable readable `broadcastId`,
REQUEST_HELLO/ANNOUNCE/REQUEST_REMOTE/SYNC_HEARTBEAT, guest re-dial,
`?embed=1` + setPreset/ping, `/bridge`, origin allowlist) and the Mappadux
StarMap map kind (Mappadux v2.18.0 — spec + verified build status in
`dynamic-map-renderer-v2/docs/starmap-map-kind-design.md` section 11).
Verified together in one browser, cross-origin (Mappadux :5180 framing SSE
:5199): discovery, mint, live GM preview, live PiP player view, warm
StarMap→handout→StarMap on the SAME iframe, filter precedence to SSE, both
failure banners, and cold reconnect on page load.

**The one shared piece of viewer code is SSE's own `/catalogue`, loaded at
runtime.** No host copies it. A Mappadux/Foundry/Owlbear player window frames
the live SSE app from the SSE origin the moment it is needed, so a change to
SSE's player view reaches every host on next load and there is exactly one
viewer codebase to maintain. Hosts own the WINDOW; SSE owns the CONTENT and
its data channel. (Owner's requirement, restated because it is the load-
bearing decision: players never hop windows — the host's normal player
surface shows the SSE view, hides it for a handout, and shows the still-
connected frame again.)

**Reuse boundary — what each future host copies vs writes:**

| Piece | Where it lives | Foundry / Owlbear |
|---|---|---|
| Discovery frame + protocol, ANNOUNCE shape, embed URL + setPreset/ping, heartbeat, allowlist | SSE origin | reuse as-is (add the host origin to `embedOrigins.ts`) |
| `Sse2Bridge` client (hello / announce / ensureRemote / playerViewUrl / version gate) | `dynamic-map-renderer-v2/src/gm/Sse2Bridge.ts`, no Mappadux imports | copy verbatim |
| Connection-aware dialog states (searching / found / not found / needs update) | `StarMapDialog.ts` | port the STATES; UI is host-native |
| Warm full-bleed iframe + preset switch + fullscreen rebuild | `StarMapLayer.ts` | Foundry: AppV2 window; Owlbear: fullscreen modal — one line each |
| starmap_show / full_state wire, Renderer pause, filter and tool gates | Mappadux only | not applicable |
| Open the SSE tab for the GM, ensure-remote, auto-resume on announce | Mappadux only (we own the browser) | becomes an INSTRUCTION to the user |

**Rule adopted (owner, 2026-08-17): automate when we own the surface,
instruct the user when we do not.** Never rely on loading a starmap by URL
(no such path — SSE stores one map; foreign files cannot be summoned). "Load
starmap X in SSE" is a named instruction in every host; in Mappadux it is a
banner that resolves itself when SSE announces the right map. A future
`REQUEST_LOAD` (SSE loads X only if X is its saved slot or a bundled example)
is the one automation still open — owner call whether it is worth it.

**Filter precedence (owner's gotcha, settled): SSE wins.** Both apps carry
the identical filter package; over a StarMap the host forces its own filter
to `none` at the single broadcast seam and disables the controls, so the
preset's GLSL is the only filter. Saved host filter state is untouched.

**Network hardening (section 11) — status:** SHIPPED today: heartbeat
liveness (LIVE→OFFLINE within ~15 s), guest re-dial on host loss and on
"nobody hosting yet". STILL OPEN, in priority order: Phase 0 real WAN test
(cellular vs broadband, both apps); explicit `iceServers` override delivered
pre-connection (share URL param, StarMapConfig, module settings); connection-
failed in-fiction error state; banked self-host escape hatch. These stay in
section 11 as the single list.

## 15. Network layer: ONE system across both apps (2026-08-17)

Owner's rule, same as filters and transitions: the network transport is one
system that happens to live in two repositories. Every improvement lands in
BOTH, kept as closely aligned as possible; the only permitted difference is
naming (localStorage keys, the room-code word cloud). Shipped in lockstep
today — SSE v2.1.725-beta and Mappadux v2.18.1-beta:

| Piece | SSE | Mappadux | Must stay identical |
|---|---|---|---|
| ICE config module (parse/encode `?ice=`, textarea format, prepend-to-defaults, `DEFAULT_ICE` mirror of peerjs 1.5) | `src/lib/iceConfig.ts` | `src/p2p/iceConfig.ts` | YES — byte-identical except `STORAGE_KEY` |
| Its unit tests | `src/lib/iceConfig.spec.ts` | `test/unit/iceConfig.test.ts` | YES |
| Peer construction takes `{config:{iceServers}}` when custom, else library defaults | `broadcast.ts` host+guest | `Host.ts`, `Guest.ts` | YES |
| Custom servers PREPENDED to defaults, never replacing | both | both | YES |
| `?ice=` on every join link/QR the GM shares | share URL (PlayerViewModal) | `_buildPlayerUrl` (+ projector) | YES |
| ICE-failed verdict from `RTCPeerConnection.connectionState` -> honest "blocked" state, redial continues | catalogue `linkBlocked` | Guest `onIceState` -> Player/Projector status | YES (wording may differ) |
| Settings surface: textarea "one per line `turns:host:443|user|credential`" + summary line | Settings > Advanced | Settings > Connections | YES (same copy) |
| Heartbeat liveness + guest re-dial | shipped 1D | Mappadux already had reconnect (`onReconnecting`) | align cadence when next touched |
| STILL OPEN, both: Phase 0 real WAN test; connection-failed copy tuned after that test | — | — | do together |

Verified facts behind the design (read from `node_modules/peerjs/dist`, both
repos, 1.5.5): defaults = `stun:stun.l.google.com:19302` + TURN
`turn:eu-0/us-0.turn.peerjs.com:3478` (UDP, user `peerjs`); broker
`0.peerjs.com:443` WSS. So home/mobile/most firewalls work out of the box;
the one real gap is UDP-blocking work networks, which need a `turns:443`
relay — now a GM setting in both apps rather than a code change.

When the third copy would appear (Foundry/Owlbear shims), the SAME module is
copied again — or, better, the pair is extracted to a tiny shared package;
that extraction is the trigger point, not before.

## 16. Cross-site discovery: BroadcastChannel is partitioned (found 2026-08-17 on the deployed pair)

**The fault.** The first real test on the deployed pair (beta.mappadux.com framing
beta.starsystemx.com) failed discovery: the bridge answered `gone` even with an
SSE GM tab open and announcing. Cause: **Chrome partitions BroadcastChannel (and
all storage) inside a third-party iframe** — a starsystemx.com frame embedded by
another SITE gets a channel keyed on the top-level site and cannot hear the
top-level starsystemx.com tab. The design's discovery hop assumed origin-scoped
channels; that is only true when host and SSE are the SAME SITE. It passed
testing because localhost:5180 and localhost:5199 are one site. Verified
empirically: same-origin bridge frame -> `announce`; cross-site frame -> its
REQUEST_HELLO never reaches the GM tab's channel (watched from the tab).

**The fix (SSE v2.1.749/753 + Mappadux v2.18.2):**
- `/bridge?sid=<id>`: when the host knows the sid, the frame discovers over
  **PeerJS** (`probeViaPeer` — dial the GM, ask REQUEST_HELLO on the data
  channel; not partitioned). Same-site hosts keep the instant local path.
- The SSE GM tab **hosts on the broker as soon as a starmap has its persistent
  id** (reactive `enableRemote()`), because a saved sid is only worth anything
  if it can be dialled. Verified with a broker probe (ID-TAKEN = hosting).
- Mappadux `Sse2Bridge.hello(origin, sid)`: sid-keyed frames, longer timeout for
  the peer path; every StarMap map / activation passes its sid.
- **First pairing** (no sid yet, cross-site): the Add StarMap dialog offers
  "paste a player link from SSE (Player Views… > Copy link)"; the sid comes from
  the URL, PeerJS discovery then confirms the campaign and lists ALL its views.
  After that, StarMaps reconnect on their own. Address field became a dropdown
  (production / beta / other).

**Consequence for Foundry / Owlbear (they are always cross-site):** discovery
there is PeerJS-with-a-known-sid ONLY, and first pairing is always the pasted
link (or typed sid) — which is the "instruct the user" rule from section 14
landing exactly where predicted. Nothing else in the contract changes.

**VERIFIED on the deployed pair (2026-08-17, beta.mappadux.com v2.18.2 framing
beta.starsystemx.com v2.1.758):** Add StarMap -> Beta origin -> "not found" +
paste row -> pasted `.../catalogue?sid=local_neighbourhood-deuterium-naos-949&preset=holo`
-> PeerJS discovery through the sid-keyed bridge frame -> "Connected: Local
Neighbourhood", all six Player Views listed, Holo Table pre-ticked from the link
-> Add -> `✦ Local Neighbourhood — Holo Table` minted -> activation discovered
the session again over PeerJS, no banner, filters handed to SSE, GM preview
frame = the deployed catalogue in embed mode. Broker probe (WSS to
0.peerjs.com, ID-TAKEN = hosting) confirmed the deployed GM tab auto-hosts under
its persistent id on load. Reminder for testers: both apps are PWAs — a tab
open across a deploy keeps the OLD service-worker build until reloaded, which
produced two false "not shipped" readings during this test.

**Session-hygiene note (own fault, recorded):** the auto-host hunk in
`+page.svelte` was left in the working copy by an autostash during a shared-tree
version collision and did not ship in v2.1.749; caught by the broker probe on
the deployed tab (explicit Player Views hosting worked, load-time did not).
Shipped in v2.1.753. Lesson for the shared tree: after any `--autostash`, diff
the working copy against origin before declaring a push complete.

## 17. Deployment requirement: embeds must pass the firewall (found 2026-08-18)

The second beta test failed with `bridge → 403`. Cause: **beta.starsystemx.com is behind
Vercel's Security Checkpoint (Attack Challenge Mode)** — every route answers
`X-Vercel-Mitigated: challenge` to a request without a solved-challenge cookie. A real
browser tab solves it invisibly; a **third-party iframe cannot** (it cannot show the
challenge and its cookies are partitioned), so Mappadux's hidden `/bridge` frame AND every
player's `/catalogue` frame get 403 wherever Mappadux itself runs (beta, prod, localhost).
Moving Mappadux to prod does not help — the block is on the SSE side. Deployment
protection (password/SSO) is off; this is the firewall challenge, likely auto-armed after a
burst of deploys and probes.

**Requirement (Vercel project star-system-generator → Firewall):** either turn Attack
Challenge Mode off for the beta domain, or keep it and add a **bypass rule for paths
`/bridge` and `/catalogue`** — the two routes third-party embeds must reach; neither has a
writable surface. This applies to ANY deployment that hosts the integration (prod later,
too). Mappadux v2.18.3 now reports this state as "cannot be reached for integration
(older than the integration, or a firewall/security challenge)" rather than "no session".

Owner call: keep both apps on beta and add the bypass (recommended — a prod push of SSE
would carry ~50 unrelated versions), test there, ship prod when the release is otherwise
ready.

**Refined 2026-08-18 from the Firewall log:** it is NOT a project-wide Attack Challenge
Mode. The events are Vercel's automatic **System Rule → Challenge**, all against ONE IP
(the tester's), in bursts of exactly 111 requests about every 20 minutes — the bot-mitigation
heuristic reacting to the evening's probing (curls, broker probes, dozens of dialog retries)
and the SSE tab's own re-dials from that IP. So: it clears on its own when the pattern
stops, and normal tables (a handful of requests) will not trip it. But whenever an IP IS in
the challenged state, third-party frames from it fail — so testing looks broken at random.
The durable answer stays the same and is now the recommendation: a Firewall custom rule
**path starts with `/bridge` OR `/catalogue` → Bypass**, which takes precedence over the
system challenge for those two routes only. Do NOT loosen the challenge globally.
