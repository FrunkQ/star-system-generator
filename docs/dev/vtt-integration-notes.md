# VTT integration, broadcast and the broker — session notes

Written 2026-08-19 by the "SSE2 integration with VTTs" session on retirement, at v2.1.866-beta.
**This is not a design doc and not a backlog.** The design, decisions and build record are in
`docs/dev/vtt-integration-design.md` (sections 1-17) and the Mappadux half in
`dynamic-map-renderer-v2/docs/starmap-map-kind-design.md`; the durable rule is in `engine-map.md`
(TRANSPORT-1). **Read those first.** This file is the handful of things that cost this session real
time and are NOT visible from the code — what a successor should not re-derive.

Territory: `src/lib/broadcast.ts`, `src/routes/bridge/`, the integration surface of
`src/routes/catalogue/+page.svelte` (embed mode, heartbeat, parent commands), `src/lib/iceConfig.ts`,
`src/lib/broadcastId.ts`, `src/lib/embedOrigins.ts`; on the Mappadux side `src/gm/Sse2Bridge.ts`,
`src/gm/StarMapDialog.ts`, `src/rendering/StarMapLayer.ts`.

---

## 1. The one fact about the transport that nothing in the code says

`sendMessage` mirrors EVERY send to the BroadcastChannel AND to every open PeerJS connection. There
is no directed reply. Fine for the player snapshot (redacted before it leaves); a landmine for
anything GM-only: a naive reply to a future `REQUEST_GM_SYNC` would hand the GM's notes to every
connected player. The design (section 12.3, audit F1) makes a directed `replyTo(conn)` a hard
requirement of the GM channel. It does not exist yet. **Any sender-side answer that is not
player-safe needs the directed primitive first.**

## 2. BroadcastChannel is origin-scoped — and PARTITIONED in a third-party iframe

The discovery hop (`/bridge` as a hidden frame sharing the SSE GM tab's channel) rests on
"BroadcastChannel is origin-scoped, not tab-scoped". True — and Chrome partitions it by TOP-LEVEL
SITE inside a third-party iframe, so a starsystemx.com frame embedded by mappadux.com cannot hear the
starsystemx.com tab. Local dev never shows this: localhost:5180 and localhost:5199 are ONE site. The
first deployed test failed on it; design section 16 has the evidence and the fix (`/bridge?sid=`
discovers over PeerJS, which is not partitioned). **Any same-browser assumption in this territory
must be re-tested on two real domains before it is believed.** Foundry/Owlbear are cross-site by
definition: discovery there is PeerJS-with-a-known-sid ONLY, and first pairing is always a pasted
player link.

## 3. The broker is a registry with a hold, and `initPeerHost` was re-entrant

Two different facts, both in `broadcast.ts`, each cost a day:
- The public broker (`0.peerjs.com`) keeps a dropped id reserved for a timeout. A reload inside that
  window collides with the tab's OWN previous registration. Defences now in place: `peer.destroy()`
  on `pagehide`, retry the same id (1.5/3/5 s) before believing it is taken, prompt ONCE per id,
  never silently re-host a collided id (`blockedIds`; only an id change or `enableRemote(true)` lifts
  it).
- The prompt the owner actually hit was NOT that. `initPeerHost` awaits `import('peerjs')` BEFORE it
  records any in-flight state, so the same-tick callers on every load (the route's reactive
  `enableRemote`, then `onMount`'s and `SystemView`'s `initSender`) each opened a socket for the SAME
  id and the broker refused the later ones as `unavailable-id`. A fresh crypto-random id collided
  with itself, consistently. `hostInFlight` guards the await. Engine-map TRANSPORT-1 has the rule:
  **guard the await, not the outcome.** Read it before touching any registration path.
- The decisive instrument for "is SSE hosting?" is a WebSocket to the broker with the sid: ID-TAKEN
  means hosting — a twelve-line Node script, no browser needed (pattern in design section 16).
  `__ssePerf.events(60,'peer')` is the in-browser equivalent: every host attempt and outcome is in
  the ring.

## 4. The id is campaign data, and everything follows from that

`broadcastId` lives ON the starmap (minted once, `<name-slug>-<word>-<word>-<NNN>`, crypto RNG,
frozen across renames). That is why a new PC with the same file reconnects, why a copied file collides
(prompt, never silent regen), why a share-copy export must strip it (not built — see section 12),
and why a dev/localhost tab must NOT auto-host (it would take the bundled map's id on the public
broker). The readable scheme was never the cause of any collision; do not "fix" it.

## 5. The catalogue is the only viewer — loaded at runtime, never copied

Every host (Mappadux StarMap, future Foundry/Owlbear) frames SSE's own
`/catalogue?sid&preset&embed=1` from the SSE origin. There is deliberately no second copy of the
player view anywhere. `?embed=1` hides the device chrome and enables the parent command set
(`setPreset`, `ping` — `{ns:'sse2-embed', v:1}`). There is NO `focus` command by decision: pointing
the view at a body is view-driving and stays on the GM channel (future `REQUEST_FOCUS`). A42 owns the
chrome inside catalogue/+page.svelte; the integration surface there is a `class:embed` gate, the
heartbeat-derived `connected`, and the message listener. Keep it that thin.

## 6. Filters: SSE wins, and it is one seam

Both apps carry the identical filter package. Over a StarMap, Mappadux forces its own filter to
`none` at `GMApp._effectiveFilter()` — the single seam every filter broadcast passes through — and
disables the controls with a visible note. Do not add a second gate anywhere else; the saved per-map
filter state is left intact on purpose.

## 7. The two apps' network code is ONE system, kept in lockstep

`iceConfig.ts` is byte-identical in SSE (`src/lib/`) and Mappadux (`src/p2p/`) except the storage
key; custom STUN/TURN is PREPENDED to the PeerJS defaults (Google STUN + UDP TURN
`eu-0/us-0.turn.peerjs.com` — verified in node_modules, so home/mobile already relay); `?ice=` rides
every share/join link because a player who cannot connect cannot be told anything over the channel;
ICE-failed surfaces as an honest "blocked" state. The only real WAN gap is a UDP-blocking work
network, which needs a `turns:443` relay the GM supplies. Owner rule: change one, change both, like
filters and transitions (design section 15). **The real WAN test — one device on cellular, one on
broadband — has never been run.**

## 8. Deployment facts that masquerade as code bugs

- **Both apps are PWAs.** A tab left open across a deploy runs the OLD service worker until reloaded.
  This produced at least three false "not shipped" readings in two days, and the owner's last
  "cannot be reached" was almost certainly an SSE tab serving a stale worker's 404 for `/bridge`
  (curl said 200; `/catalogue`, which the old worker knew, worked). The Mappadux message now leads
  with "hard-reload SSE once".
- **Vercel Security Checkpoint** (`X-Vercel-Mitigated: challenge`) answers 403 to a third-party frame
  that cannot solve it. It was a per-IP System Rule in 111-request bursts triggered by this session's
  own probing, not a project setting. The owner's Firewall bypass rule (`path starts with /bridge`
  OR `/catalogue` → Bypass) is the durable answer and a deployment requirement for ANY host of the
  integration, prod included. Exact config is in inbox row E13.
- Prod `starsystemx.com` has no `/bridge` until the prod release; the Mappadux dialog probes the GM's
  default origin first, so `starsystemx.com/bridge 404` in a beta console is expected noise.

## 9. Testing this territory: the traps in the harness

`broadcastContract.spec.ts` runs the REAL `BroadcastService` twice over a BroadcastChannel shim and a
fake PeerJS. What it taught, re-derivable only the hard way:
- Await the DELIVERY (`waitFor`), never a tick count — E12's flake was exactly that; now 218/218 x3
  green under the full suite.
- Build both services before sending anything; a dynamic import can race an in-flight message.
- `vi.useFakeTimers()` fakes `setImmediate`/`nextTick`: a yield through them hangs — drain microtasks.
  And `await import('peerjs')` resolves on REAL time: warm it before enabling fake timers or the first
  host attempt lands seconds late and the retry ladder looks dead.
- The fake broker must claim an id from a PENDING socket (on construct) and `destroy()` must free it
  only if THIS peer registered it — otherwise a rejected peer's cleanup frees the other holder's id
  and the persistent-holder tests pass for the wrong reason. Even so, the re-entrancy race could not
  be made to FAIL without the guard in the fake; the production network evidence is the proof, and
  the A57 row says so.
- `npx vitest run` from `C:\Development` (the harness cwd resets there between calls) walks every
  worktree under it — 2471 files "failing". Always `cd` into the repo in the same command.

## 10. Process, because it cost more than any fault

- After any `git pull --rebase --autostash` on the shared tree, diff the working copy against origin
  before calling a push done: a `+page.svelte` hunk was left unstaged by the autostash and missed a
  release (design section 16).
- Version collisions are routine: take theirs, bump, keep BOTH changelog entries; never resolve by a
  whole-file ours/theirs. The inbox keeps a literal conflict marker inside row E10 — an UNCHANGED
  marker count is the right assertion, not "no markers".
- A bare `node_modules/.bin` is someone's partial install, not a live one; `npm install` repairs it in
  seconds. Leave `package-lock.json` unstaged unless it was yours.
- Windows `python -` heredocs die on Unicode output (cp1252): anchor on ASCII substrings, reconfigure
  stdout to UTF-8, and write patch scripts to a file when the payload has quotes.

## 11. How to test Owlbear / Foundry when a volunteer appears

Both are cross-site, so: (1) they discover ONLY over PeerJS with a known sid — copy `Sse2Bridge.ts`
verbatim (no Mappadux imports), call `hello(origin, sid)`; first pairing is the GM pasting a player
link from Player Views (sid + preset in the URL), never auto-discovery. (2) The player surface is an
iframe at `playerViewUrl(origin, sid, presetId)` (`embed=1`) — Foundry: an ApplicationV2 window pushed
to players over the `module.<id>` socket (Inline Webviewer is the precedent, verified v13; no OS
popouts in the Electron client); Owlbear: a `background_url` page on every client opening
`OBR.modal.open({fullScreen:true})` on an `OBR.broadcast` from the GM panel, all served from the SSE
origin (`/obr/manifest.json`, `/obr/panel`, `/obr/background`) — run the one-hour spike first: a bare
page inside an OBR room confirming PeerJS data connections work in the extension iframe. (3) The SSE
side needs nothing new except the host's origin in `embedOrigins.ts` and the firewall bypass on
whatever SSE deployment they point at. (4) Acceptance: paste link → Connected with the preset list →
open on players → GM changes preset in SSE → every player switches; then the Mappadux deviation list
applies (ping is a corner button; keyboard focus belongs to the iframe).

## 12. Known open, in these files

- `src/lib/broadcast.ts` — NO directed reply primitive (`replyTo(conn)`); required before any GM-only
  answer (design 12.3 / audit F1). Check: grep `replyTo` — absent.
- `src/lib/broadcast.ts` — `REQUEST_FOCUS` / `gmToken` GM channel (design 12.3) not built; VTT deep
  links and the notes panel depend on it.
- `src/routes/+page.svelte` / `RailNav` (A42 territory) — share-safe export stripping `broadcastId`
  (and a future `gmToken`) from a "Save a copy for sharing": not built; a shared file re-hosts under
  the sharer's id and the collision PROMPT is what catches it. Inbox handoff row.
- `vercel.json` — `frame-ancestors 'none'` on the GM route (audit F7): not set; `/catalogue` and
  `/bridge` must stay embeddable. Inbox handoff row.
- `src/routes/api/generate/+server.ts` — open relay to a client-supplied endpoint (audit F3); and the
  two GM-side `{@html}` sinks (F4: `DescriptionEditor.renderMarkdown`, `AIExpansionModal`). Not this
  territory; spawn-task chips were raised; unchanged as far as I can see.
- Both apps — the real WAN test (cellular vs broadband) has never been run; `?ice=` BYO relay shipped
  untested against a UDP-blocking network.
- Inbox A57 acceptance list — owner confirmed "it has stopped" on v2.1.817; the five-point list
  (reload x3, second browser prompts once, OK notice, Cancel + three systems, localhost does not
  steal) has not been walked end to end by a human.
- Mappadux `StarMapLayer` on the PROJECTOR surface, and a REAL remote phone dialling a Mappadux StarMap
  over PeerJS — wired identically to the player path, never seen by a human.
- The Mappadux "cannot be reached" the owner saw on 2026-08-19 with curl saying 200 — diagnosed as a
  stale SSE service worker (section 8) but NOT confirmed from his machine. Check: open
  `https://beta.starsystemx.com/bridge` directly in that browser — a 404 page = stale worker; the
  "integration bridge" note = something else, then read the frame URLs from the Mappadux console with
  the dialog open.
