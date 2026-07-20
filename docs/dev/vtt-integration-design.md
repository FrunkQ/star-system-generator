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

## 9. Open questions (settle before detailed design)

- **Q1 — Session identity.** Adopt persistent per-starmap `broadcastId` (G1) as
  described? (Recommended: yes — it also fixes stale QR/player links generally.)
- **Q2 — Discovery UX.** Hidden `/bridge` auto-discovery (recommended) vs
  paste-the-share-URL into Mappadux? (Bridge is more code but "it just found my
  starmap" is the magic moment; paste-URL could still be the fallback.)
- **Q3 — Preset pinning.** Each Mappadux StarMap map carries one preset via URL.
  If the GM pushes `SYNC_PRESET` from SSE2, should embedded views (a) follow the
  push (current catalogue behaviour — one live view for everyone), or (b) stay
  pinned to their configured preset? Follow-the-push matches "GM drives from
  SSE2"; pinning matches "this Mappadux map *is* the datapad view". Pick one, or
  add a per-map "pinned" flag.
- **Q4 — Overlays.** Confirm v1 disables markers/pings/annotations/measure on
  StarMap maps (recommended). A later idea: forward Mappadux pings into SSE2 via
  the bridge as a "GM points at body X" gesture — banked, not v1.
- **Q5 — Projector.** Full-bleed same-as-player iframe on the projector surface
  (recommended v1), or exclude StarMap maps from projector output entirely?
- **Q6 — Hold behaviour inside Mappadux.** When SSE2 pushes hold
  (`SYNC_PRESET: null`) or the GM tab closes, the embedded view shows SSE2's
  hold/waiting screen. Acceptable, or should Mappadux fall back to its splash /
  previous map automatically?
- **Q7 — Where does the doc/contract live.** This file sits in SSE2 `docs/dev/`;
  the Mappadux-side implementation notes could stay here or split into the
  Mappadux repo at Phase 3. Preference?
- **Q8 — Foundry timing.** Build the generalised Foundry embed module right
  after Phase 1 (cheap, independent), or hold until the Mappadux integration has
  proven the embed contract in real sessions?
- **Q9 — Snapshot export scope.** Is a plain PNG "Export view as image" enough
  for the snapshot path, or is a sized/framed export (choose resolution, hide
  UI, transparent background for composite tiles) wanted from day one?
