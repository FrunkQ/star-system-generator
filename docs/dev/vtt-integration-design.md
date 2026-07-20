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
- **Collision handling**: a starmap file copied to another GM duplicates the
  id. The PeerJS host emits an `unavailable-id` error when a second host
  claims the same peer id — on that error, generate a fresh `broadcastId`,
  persist it, and re-init the host. (Hook: the `peer.on('error')` handler in
  `initPeerHost`, `src/lib/broadcast.ts:101`.)
- Redaction: `computePlayerStarmapSnapshot` may keep or strip `broadcastId`;
  players already know the sid from their URL. No requirement either way.

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
