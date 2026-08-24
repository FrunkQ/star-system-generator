import { writable } from 'svelte/store';
import { importOrReload } from '$lib/util/importOrReload';
import { peerConfigFor, loadStoredIce, type IceServerEntry } from '$lib/iceConfig';
import { perfCount, perfEvent } from '$lib/perfTrace';
import type { System, RulePack, Starmap } from '$lib/types';
import type { PanState } from '$lib/viewport/stores';

export type ViewSettings = {
    showNames: boolean;
    showZones: boolean;
    showLPoints: boolean;
    showTravellerZones?: boolean;
    showHillSpheres?: boolean; // optional — older senders won't include it
};

export type TimeState = {
    currentTime: number;
    isPlaying: boolean;
    timeScale: number;
};

// Message Types
/**
 * Everything a receiving window needs to render a tag the way the GM sees it: the category's colour
 * and name, and any per-tag override of either. Deliberately NOT the whole TagCategory — rules,
 * provenance and appliesTo are authoring data and have no business on a player's device.
 */
export interface TagStyleSnapshot {
  categories: { id: string; label: string; color: string; textColor?: string }[];
  tags: { key: string; label?: string; color?: string; textColor?: string }[];
}

export type BroadcastMessage = 
  | { type: 'SYNC_SYSTEM'; payload: System }
  | { type: 'SYNC_RULEPACK'; payload: RulePack }
  | { type: 'SYNC_FOCUS'; payload: string | null }
  // The GM's click-ladder framing level for the focused body — re-clicks and Reset View don't change
  // the focus ID, so followers need the LEVEL to mirror the framing (SYNC_FOCUS alone can't carry it).
  | { type: 'SYNC_FOCUS_LEVEL'; payload: { id: string; level: number } }
  | { type: 'SYNC_CAMERA'; payload: { pan: PanState; zoom: number; isManual: boolean; viewMin?: number } }
  | { type: 'SYNC_VIEW_SETTINGS'; payload: ViewSettings }
  | { type: 'SYNC_TIME'; payload: TimeState }
  | { type: 'REQUEST_SYNC'; payload: string | null }
  // The whole campaign, redacted: requested + streamed independently of the per-system SYNC_SYSTEM,
  // so both can be served from the one session.
  | { type: 'SYNC_STARMAP'; payload: Starmap }
  | { type: 'REQUEST_STARMAP'; payload: string | null }
  // A63 (cheap half). A one-line PRE-ANNOUNCE sent immediately before the big SYNC_STARMAP, so a
  // player has something to look at while a multi-megabyte payload crosses and then parses. It is
  // not progress and does not pretend to be: the parse happens in one blocking go on the main
  // thread, so nothing can animate DURING it. What this kills is the "is it broken? I'll reload"
  // temptation, which is the actual reported harm. Real progress needs the payload chunked with
  // sequence numbers, and that is V3.1.
  //
  // `approxBytes` is the size of the LAST starmap this session sent, so it is absent for the first
  // joiner and present after that. The receiver must read fine without it.
  | { type: 'SYNC_INCOMING'; payload: { what: 'starmap'; systems: number; approxBytes?: number } }
  // A player window saying it is still here, and what it has seen. The GM knows its REMOTE guests
  // directly (they hold an open connection); a LOCAL window has no connection object to count, so
  // presence is the only way to know it exists. Sent on join and once per GM heartbeat, so it costs
  // a few bytes every five seconds per player and nothing when nobody is watching.
  | { type: 'PLAYER_PRESENT'; payload: { id: string; remote: boolean; stats?: TransferStats } }
  | { type: 'SYNC_BRANDING'; payload: { name: string; logo: string | null } }
  // THE GM'S TAG VOCABULARY — labels and colours, not the tags themselves.
  // A player window resolves a marker's colour and name against its OWN `tagCategories`, which is a
  // localStorage store and therefore the SHIPPED DEFAULTS on anyone else's device. So a faction the
  // GM recoloured, a tag they renamed, or a category they invented reached the player as a default
  // colour and a raw key — invisible on the GM's own machine, because there the two windows share one
  // localStorage. Only what PRESENTATION needs crosses: no rules, no provenance, no `appliesTo`.
  | { type: 'SYNC_TAGSTYLES'; payload: TagStyleSnapshot }
  // Unified player-view: the GM's Player Views modal drives the open player window — which preset is
  // live + the momentary overrides (hide labels / suspend filter / pause orbit / follow GM). A null
  // payload means "closed" (the player window shows a hold screen).
  // (A42 removed three siblings that served the retired Field Guide and Projector: SYNC_GUIDECONFIG
  // pushed the GM's enforced skin, and SYNC_CRT_MODE / SYNC_GREENSCREEN toggled the projector's CRT
  // and chroma-key. All three are preset fields now.)
  | { type: 'SYNC_PRESET'; payload: PresetBroadcast | null }
  // A59 — WHICH LEVEL THE GM IS LOOKING AT. `SYNC_FOCUS` carries a BODY id, so it can only ever say
  // "look at this thing inside a system"; there was no message that meant "I have gone back to the
  // map", and a following player was therefore stranded in whatever system the GM last opened. This
  // is that message, and it is deliberately a LEVEL rather than a nullable focus: `systemId` lets a
  // player follow the GM into a system that has been SELECTED but not focused on any body, which a
  // null focus could not express either.
  | { type: 'SYNC_GM_LEVEL'; payload: GmLevel }
  // G3 construct models: a player missing a model binary asks for it BY HASH and the GM answers
  // once - the binary never rides the snapshot (design §4: sendIfChanged re-sends whole payloads,
  // so inline models would multiply every resend). b64 rides the existing chunked path.
  | { type: 'REQUEST_MODEL'; payload: { targetId: string | null; hash: string } }
  | { type: 'SYNC_MODEL'; payload: { hash: string; b64: string; meta: Record<string, unknown> } }
  // VTT INTEGRATION (docs/dev/vtt-integration-design.md 9.1/1B, 1D). Discovery: any guest asks
  // "who is here" (null = any host) and the GM tab answers with the identity a host app needs to
  // find, label and connect to this campaign — id, name, and the Player View names. NOTHING from
  // the campaign body: this is discovery metadata, not the snapshot, and it is exactly what a
  // sid-holder could learn anyway by joining. REQUEST_REMOTE asks the GM tab to start hosting on
  // the PeerJS broker (enableRemote is opt-in) so remote players in a VTT can dial in.
  | { type: 'REQUEST_HELLO'; payload: string | null }
  | { type: 'ANNOUNCE'; payload: AnnouncePayload }
  | { type: 'REQUEST_REMOTE'; payload: string | null }
  // Liveness: the GM tab sends its wall clock every few seconds. Receivers turn "GM OFFLINE" back on
  // when it stops (the old flag latched LIVE forever after first contact), and a remote guest
  // re-dials when it goes quiet.
  | { type: 'SYNC_HEARTBEAT'; payload: number };

export interface AnnouncePayload {
  sessionId: string;                       // = starmap.broadcastId (what a guest dials)
  starmapId: string;
  starmapName: string;
  presets: { id: string; name: string }[]; // Player Views by name only
  appVersion: string;                      // for integration gating ("update SSE2" below a floor)
}

export interface PresetOverrides {
  followGM: boolean | null; // null = use the preset's own flag
  filterBypass: boolean;
  orbitPaused: boolean;
  labelsHidden: boolean;
  orbitLinesHidden: boolean;
  // "Don't show them the fleet." Drops every construct from the players' view in one move — ships,
  // stations, gates, the lot. Momentary like the rest of this block: it is the thing a GM reaches for
  // mid-scene, not a property of the preset's design.
  constructsHidden?: boolean;
  // What the GM is highlighting on the maps right now — category ids and/or exact tag keys. Rides
  // with the other momentary overrides so the players' map badges whatever the GM's does.
  // SAFE BY CONSTRUCTION: this is only a SELECTION. The tags themselves arrive via the player
  // snapshot, which has already removed secret tags and player-hidden categories, so highlighting a
  // category cannot reveal one.
  mapHighlights?: { ref: string; style?: string }[];
  highlightsMuted?: boolean;
}
/** A59: where the GM is - the map, or inside one system. */
export interface GmLevel {
  level: 'starmap' | 'system';
  systemId?: string; // set when level === 'system'
}

export interface PresetBroadcast {
  presetId: string;
  overrides: PresetOverrides;
}

type BroadcastEnvelope = {
  sessionId: string | null;
  message: BroadcastMessage;
};

/**
 * TRANSFER METERS — what actually crossed, per link, so a GM can tell over-transmission from
 * slowness without guessing. Owner, 2026-08-21.
 *
 * WHAT IS MEASURED AND WHAT IS NOT, because the difference is the honest part:
 *
 *  * SEND bytes are free. `sendIfChanged` already stringifies every payload for its dedupe, and
 *    `sendPeer` stringifies again for the frame limit — so nothing is measured that was not already
 *    being computed.
 *  * RECEIVE bytes are free ON THE PEER PATH. A large payload is chunked, and a chunk carries its
 *    own string, so its length is there for the taking. Anything NOT chunked is under CHUNK_BYTES by
 *    construction, so measuring it costs a stringify of at most 16 KB.
 *  * RECEIVE bytes over the LOCAL channel are NOT measured, and that is a statement rather than a
 *    gap: a same-machine BroadcastChannel hands over a structured clone. Nothing is serialised, so
 *    there are no bytes on a wire to report — measuring would mean stringifying a multi-megabyte
 *    payload purely to print a number, which is the very cost this feature exists to expose. Local
 *    links report messages and say plainly that bytes do not apply.
 *
 * SPEED is measured in one-second buckets: `peakBytesPerSec` is the fullest second seen, and the
 * average is total bytes over elapsed time. A peak far above the average is bursty traffic (a
 * snapshot); a low peak with a long wait is a slow link.
 */
export interface TransferStats {
  sentMsgs: number;
  sentBytes: number;
  largestSentBytes: number;
  recvMsgs: number;
  recvBytes: number;
  largestRecvBytes: number;
  /** False when this link is a same-machine channel, where bytes are not a meaningful quantity. */
  bytesMeaningful: boolean;
  peakBytesPerSec: number;
  startedAt: number;
  byType: Record<string, { sent: number; sentBytes: number; recv: number; recvBytes: number }>;
}

class TransferMeter {
  sentMsgs = 0; sentBytes = 0; largestSentBytes = 0;
  recvMsgs = 0; recvBytes = 0; largestRecvBytes = 0;
  bytesMeaningful = false;
  peakBytesPerSec = 0;
  startedAt = Date.now();
  byType: Record<string, { sent: number; sentBytes: number; recv: number; recvBytes: number }> = {};
  private bucketStart = Date.now();
  private bucketBytes = 0;

  private row(type: string) {
    return (this.byType[type] ??= { sent: 0, sentBytes: 0, recv: 0, recvBytes: 0 });
  }
  /** One-second buckets. Rolling on every record keeps the peak honest without a timer. */
  private roll(bytes: number) {
    const now = Date.now();
    if (now - this.bucketStart >= 1000) {
      if (this.bucketBytes > this.peakBytesPerSec) this.peakBytesPerSec = this.bucketBytes;
      this.bucketStart = now; this.bucketBytes = 0;
    }
    this.bucketBytes += bytes;
    if (this.bucketBytes > this.peakBytesPerSec) this.peakBytesPerSec = this.bucketBytes;
  }
  recordSend(type: string, bytes?: number) {
    this.sentMsgs++; this.row(type).sent++;
    if (bytes === undefined) return;
    this.bytesMeaningful = true;
    this.sentBytes += bytes; this.row(type).sentBytes += bytes;
    if (bytes > this.largestSentBytes) this.largestSentBytes = bytes;
    this.roll(bytes);
  }
  recordRecv(type: string, bytes?: number) {
    this.recvMsgs++; this.row(type).recv++;
    if (bytes === undefined) return;
    this.bytesMeaningful = true;
    this.recvBytes += bytes; this.row(type).recvBytes += bytes;
    if (bytes > this.largestRecvBytes) this.largestRecvBytes = bytes;
    this.roll(bytes);
  }
  snapshot(): TransferStats {
    return {
      sentMsgs: this.sentMsgs, sentBytes: this.sentBytes, largestSentBytes: this.largestSentBytes,
      recvMsgs: this.recvMsgs, recvBytes: this.recvBytes, largestRecvBytes: this.largestRecvBytes,
      bytesMeaningful: this.bytesMeaningful, peakBytesPerSec: this.peakBytesPerSec,
      startedAt: this.startedAt, byType: JSON.parse(JSON.stringify(this.byType))
    };
  }
}

/** One connected player window as the GM sees it. */
export interface PeerLink {
  id: string;
  remote: boolean;
  /** Last time anything was heard from this window. Local windows announce; remote ones are known. */
  lastSeen: number;
  stats: TransferStats;
  /** What the PLAYER says it has seen, when it has told us — the other half of the same link. */
  reported?: TransferStats;
}

const CHANNEL_NAME = 'star_system_generator_channel';

class BroadcastService {
  private channel: BroadcastChannel | null = null;
  private isSender: boolean = false;
  private sessionId: string | null = null;
  private targetSessionId: string | null = null;

  // --- PeerJS cross-device transport (runs in PARALLEL to the same-machine BroadcastChannel).
  //     Same envelope/message shapes, just a different pipe — so the host can reach players on
  //     their own phones/tablets over the network, not only same-machine windows. Lazy-loaded so
  //     PeerJS never bloats the main bundle and only connects when sharing/viewing. All failures
  //     are non-fatal: if the broker is unreachable the local channel still works. ---
  private peer: any = null;
  /** A local window is counted while it has spoken within this long. Three GM heartbeats. */
  private static readonly PRESENCE_TTL_MS = 16_000;
  private peerConns: any[] = [];   // host: open guest connections
  /** Everything this window has sent and received, whatever the transport. */
  /**
   * This window's own identity, for presence. Generated once and never persisted: two tabs are two
   * windows and must count as two, and a reload IS a new window as far as "who is watching" goes.
   * `Math.random` is safe here for the reason M5 gives — nothing replays a window id.
   */
  private readonly windowId = 'w-' + Math.random().toString(36).slice(2, 10);
  private meter = new TransferMeter();
  /** Bytes measured on the peer path, handed to the meter once the message type is known. */
  private pendingRecvBytes = 0;
  /** Set by sendIfChanged, which already has the serialised size; undefined for a raw send. */
  private pendingSendBytes: number | undefined = undefined;
  /** GM: one meter per remote guest, keyed by its peer id. Local windows appear via `presence`. */
  private meterByPeer = new Map<string, TransferMeter>();
  /** GM: player windows heard from recently, keyed by the id they announce. */
  private presence = new Map<string, { at: number; remote: boolean; reported?: TransferStats }>();
  private peerOut: any = null;     // guest: connection to the host
  // WebRTC data channels drop/garble messages over ~16KB, so large payloads (the whole starmap)
  // must be chunked — small ones (branding, focus) go in one frame. This is the Mappadux gotcha.
  private static CHUNK_BYTES = 14000;
  private chunkSeq = 0;
  private chunkBuf = new Map<string, { n: number; parts: string[] }>();

  private async loadPeer(): Promise<any> {
    const mod: any = await importOrReload(() => import('peerjs'));
    return mod.default ?? mod.Peer ?? mod;
  }

  // A57 — the broker holds a just-dropped id for a timeout, so a reload of the same map used to
  // collide with the tab's OWN previous registration and prompt the GM as if a second host existed.
  // Three defences, in order: release the id on pagehide (so the hold rarely starts); on
  // unavailable-id RETRY the same id with a short back-off before believing it is really taken;
  // and prompt at most ONCE per id, after which the id is BLOCKED from silent re-hosting until it
  // changes or the GM explicitly re-enables sharing. Every attempt/outcome lands in the always-on
  // perf event ring — `__ssePerf.events(60,'peer')` is the one action when this fires again.
  private static HOST_RETRY_MS = [1500, 3000, 5000];
  private hostAttempt = new Map<string, number>();     // id -> retries used
  private blockedIds = new Set<string>();               // collided; do not auto re-host
  private promptedIds = new Set<string>();              // prompted the owner already
  private hostRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private pagehideBound = false;
  private hostInFlight: string | null = null;           // id whose registration is mid-await

  private async initPeerHost(sessionId: string, caller = 'initPeerHost') {
    if (typeof window === 'undefined') return;
    if (this.blockedIds.has(sessionId)) {
      perfEvent('peer', { phase: 'host-skip', id: sessionId, caller, outcome: 'blocked-after-collision' });
      return;
    }
    if (this.peer) { perfEvent('peer', { phase: 'host-skip', id: sessionId, caller, outcome: 'already-hosting' }); return; }
    // THE ACTUAL A57 ROOT CAUSE (v2.1.817): initPeerHost is async — it awaits the lazy PeerJS import
    // BEFORE this.peer is assigned, so two callers in the same tick (the route's reactive enableRemote
    // + onMount/SystemView initSender) both see "no peer", both construct new Peer(sameId), and the
    // broker rejects the SECOND as unavailable-id. A brand-new id "collided" with ITSELF on every load
    // — which is why a freshly minted id prompted again 5 s later (ladder exhausting) and why it was
    // "consistent" rather than a timeout-bound ghost. One in-flight registration at a time.
    if (this.hostInFlight === sessionId) { perfEvent('peer', { phase: 'host-skip', id: sessionId, caller, outcome: 'in-flight' }); return; }
    this.hostInFlight = sessionId;
    if (!this.pagehideBound) {
      // Release the broker registration the moment the page goes away, so a reload does not meet
      // its own ghost. pagehide fires on reload, close and bfcache; destroy() closes the socket.
      window.addEventListener('pagehide', () => {
        perfEvent('peer', { phase: 'pagehide', id: this.sessionId, outcome: this.peer ? 'destroy' : 'no-peer' });
        try { this.peer?.destroy(); } catch { /* unloading */ }
        this.peer = null;
      });
      this.pagehideBound = true;
    }
    const attempt = this.hostAttempt.get(sessionId) ?? 0;
    perfEvent('peer', { phase: 'host-attempt', id: sessionId, caller, attempt });
    try {
      const Peer = await this.loadPeer();
      // The host registers under the session id, so a guest dials that id directly.
      // BYO ICE (docs/dev/vtt-integration-design.md 11): custom STUN/TURN prepended to
      // the PeerJS defaults, so a turns:443 relay can carry a locked-down network.
      const cfg = peerConfigFor(this.iceServers ?? loadStoredIce());
      const peer = new Peer(sessionId, cfg ? { config: cfg } : undefined);
      this.peer = peer;
      this.hostInFlight = null;
      peer.on('open', (id: string) => {
        this.hostAttempt.delete(sessionId);
        perfEvent('peer', { phase: 'host-open', id, caller, attempt });
      });
      peer.on('disconnected', () => perfEvent('peer', { phase: 'host-disconnected', id: sessionId }));
      peer.on('close', () => perfEvent('peer', { phase: 'host-closed', id: sessionId }));
      peer.on('connection', (conn: any) => {
        conn.on('open', () => { if (!this.peerConns.includes(conn)) this.peerConns.push(conn); });
        conn.on('data', (data: any) => this.handlePeerData(data));
        conn.on('close', () => { this.peerConns = this.peerConns.filter((c) => c !== conn); });
        conn.on('error', () => { /* per-connection; ignore */ });
      });
      peer.on('error', (e: any) => {
        const errType = e?.type || String(e);
        if (errType === 'unavailable-id') {
          try { peer.destroy(); } catch { /* already gone */ }
          if (this.peer === peer) { this.peer = null; this.peerConns = []; }
          if (this.sessionId !== sessionId) {
            // A late answer for an id we no longer use (OK minted a new one mid-ladder): never prompt.
            perfEvent('peer', { phase: 'host-collide', id: sessionId, caller, errType, outcome: 'stale-id-ignored' });
            return;
          }
          const used = this.hostAttempt.get(sessionId) ?? 0;
          if (used < BroadcastService.HOST_RETRY_MS.length && this.sessionId === sessionId) {
            // Probably our own just-dropped registration still held by the broker: try again.
            const wait = BroadcastService.HOST_RETRY_MS[used];
            this.hostAttempt.set(sessionId, used + 1);
            perfEvent('peer', { phase: 'host-collide', id: sessionId, caller, errType, attempt: used, outcome: `retry-in-${wait}ms` });
            if (this.hostRetryTimer) clearTimeout(this.hostRetryTimer);
            this.hostRetryTimer = setTimeout(() => {
              this.hostRetryTimer = null;
              if (this.sessionId === sessionId && this.hostRequested && !this.peer) void this.initPeerHost(sessionId, 'retry');
            }, wait);
            return;
          }
          // Held through every retry: a genuinely persistent holder. Block silent re-hosting of this
          // id and ask the owner ONCE. The block lifts when the id changes (OK) or the GM re-enables
          // sharing explicitly (enableRemote from the launcher / REQUEST_REMOTE) — Cancel's promise.
          this.hostAttempt.delete(sessionId);
          this.blockedIds.add(sessionId);
          const first = !this.promptedIds.has(sessionId);
          this.promptedIds.add(sessionId);
          perfEvent('peer', { phase: 'host-collide', id: sessionId, caller, errType, outcome: first ? 'prompt' : 'blocked-silent' });
          if (first) this.onHostIdUnavailable?.();
          return;
        }
        perfEvent('peer', { phase: 'host-error', id: sessionId, caller, errType });
        console.warn('[peer host]', errType);
      });
    } catch (e) {
      this.hostInFlight = null;
      perfEvent('peer', { phase: 'host-error', id: sessionId, caller, errType: 'init-failed' });
      console.warn('PeerJS host init failed (cross-device sharing unavailable)', e);
    }
  }

  private async initPeerGuest(sessionId: string | null) {
    if (typeof window === 'undefined' || !sessionId) return;
    try {
      const Peer = await this.loadPeer();
      const cfg = peerConfigFor(this.iceServers ?? loadStoredIce());
      this.peer = new Peer(undefined, cfg ? { config: cfg } : undefined);
      this.peer.on('open', () => {
        const conn = this.peer.connect(sessionId, { reliable: true });
        this.peerOut = conn;
        // ICE failure detection: PeerJS surfaces the RTCPeerConnection once negotiation
        // starts. `failed` means STUN and every TURN candidate were tried and none got
        // through — typically UDP blocked with no turns:443 relay. Report it so the view
        // can say so instead of waiting forever; the redial loop keeps trying regardless.
        const watchIce = () => {
          const pc: RTCPeerConnection | undefined = conn.peerConnection;
          if (!pc) { setTimeout(watchIce, 250); return; }
          pc.addEventListener('connectionstatechange', () => {
            if (pc.connectionState === 'failed') this.onPeerFailed?.('ice-failed');
            if (pc.connectionState === 'connected') this.onPeerFailed?.(null);
          });
        };
        watchIce();
        conn.on('open', () => {
          if (this.probeOnly) {
            conn.send({ sessionId: null, message: { type: 'REQUEST_HELLO', payload: sessionId } });
            return;
          }
          conn.send({ sessionId: null, message: { type: 'REQUEST_SYNC', payload: sessionId } });
          conn.send({ sessionId: null, message: { type: 'REQUEST_STARMAP', payload: sessionId } });
        });
        conn.on('data', (data: any) => this.handlePeerData(data));
        conn.on('error', () => { /* ignore; local channel may still serve */ });
        // Host went away (GM tab closed, network blip): forget the dead pipe and try again
        // shortly. Before this, a guest that outlived the host never reconnected — the
        // long-banked "GM started hosting AFTER the player opened" gap.
        conn.on('close', () => {
          if (this.peerOut === conn) this.peerOut = null;
          this.scheduleRedial();
        });
      });
      // 'peer-unavailable' = nobody is hosting that id (yet). Keep trying at a gentle cadence so a
      // player who opened the link before the GM enabled remote sharing still gets through.
      this.peer.on('error', (e: any) => {
        if (e?.type === 'peer-unavailable') { this.scheduleRedial(); return; }
        console.warn('[peer guest]', e?.type || e);
      });
    } catch (e) {
      console.warn('PeerJS guest init failed (cross-device unavailable)', e);
    }
  }

  private peerTargets(): any[] {
    if (this.isSender) return this.peerConns;
    return this.peerOut ? [this.peerOut] : [];
  }

  private sendPeer(envelope: BroadcastEnvelope) {
    const targets = this.peerTargets();
    if (targets.length === 0) return;
    const json = JSON.stringify(envelope);
    // Per-link accounting, free: `json` is computed here anyway for the frame limit. Attributed to
    // each target because "which player is this costing" is the question the GM actually has.
    const type = envelope.message?.type ?? 'unknown';
    for (const c of targets) {
      const id = c?.peer;
      if (!id) continue;
      let m = this.meterByPeer.get(id);
      if (!m) { m = new TransferMeter(); this.meterByPeer.set(id, m); }
      m.recordSend(type, json.length);
    }
    const safeSend = (c: any, payload: any) => { try { if (c.open) c.send(payload); } catch { /* drop */ } };

    if (json.length <= BroadcastService.CHUNK_BYTES) {
      for (const c of targets) safeSend(c, envelope);
      return;
    }
    // Too big for one WebRTC frame → split into ordered chunks, reassembled on the far side.
    const id = `${this.sessionId || 'x'}-${++this.chunkSeq}`;
    const n = Math.ceil(json.length / BroadcastService.CHUNK_BYTES);
    for (let i = 0; i < n; i++) {
      const part = { __chunk: { id, i, n, data: json.slice(i * BroadcastService.CHUNK_BYTES, (i + 1) * BroadcastService.CHUNK_BYTES) } };
      for (const c of targets) safeSend(c, part);
    }
  }

  // Incoming peer data: reassemble chunk frames, then route like any other message.
  private handlePeerData(data: any) {
    if (data && data.__chunk) {
      const { id, i, n, data: part } = data.__chunk;
      // FREE: the chunk carries its own string. This is the path every large payload takes, which is
      // why inbound sizing costs nothing exactly where it matters most.
      this.pendingRecvBytes += typeof part === 'string' ? part.length : 0;
      let entry = this.chunkBuf.get(id);
      if (!entry) { entry = { n, parts: new Array(n) }; this.chunkBuf.set(id, entry); }
      entry.parts[i] = part;
      if (entry.parts.filter((p) => p !== undefined).length === entry.n) {
        this.chunkBuf.delete(id);
        try { this.handleMessage(JSON.parse(entry.parts.join(''))); } catch { /* malformed; drop */ }
      }
      return;
    }
    // Not chunked, so under CHUNK_BYTES by construction — a stringify of at most 16 KB.
    try { this.pendingRecvBytes += JSON.stringify(data).length; } catch { /* unmeasurable */ }
    this.handleMessage(data);
  }

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (event) => this.handleMessage(event.data);
    }
  }

  // Setup for GM Mode (Sender). Safe to call again when the session id changes (a different
  // starmap loads, or the owner regenerates a leaked id): if remote hosting was requested, the
  // old peer registration is dropped and re-hosted under the new id so guests dial the id the
  // GM is actually broadcasting as.
  public initSender(sessionId: string) {
    const changed = this.isSender && this.sessionId !== null && this.sessionId !== sessionId;
    this.isSender = true;
    this.sessionId = sessionId;
    if (changed) {
      // A57 follow-up (v2.1.817): the OLD id's retry ladder must die with the old id — it kept
      // ticking after OK minted a new one and could fire a second collision outcome 5 s later.
      if (this.hostRetryTimer) { clearTimeout(this.hostRetryTimer); this.hostRetryTimer = null; }
      this.hostAttempt.clear();
      if (this.peer) {
        perfEvent('peer', { phase: 'rehost-id-changed', id: sessionId, caller: 'initSender' });
        try { this.peer.destroy(); } catch { /* already gone */ }
        this.peer = null;
        this.peerConns = [];
      }
    }
    // A57: a collided id is NOT re-hosted from here (SystemView calls initSender on every system
    // entry — that was the "Cancel brings it back on every click" loop). Only an id change or an
    // explicit enableRemote() lifts the block.
    if (this.hostRequested && !this.peer && !this.blockedIds.has(sessionId)) void this.initPeerHost(sessionId, 'initSender');
  }

  // Opt-in cross-device hosting: called when the GM opens the Companion launcher (sharing intent),
  // so we only announce an id to the public PeerJS broker when the GM actually wants remote players —
  // not on every session. Idempotent. The request is remembered so a session-id change re-hosts.
  private hostRequested = false;
  public enableRemote(explicit = false) {
    this.hostRequested = true;
    if (!this.sessionId || !this.isSender) return;
    // An EXPLICIT re-enable (launcher / REQUEST_REMOTE) is the GM saying "the other session is
    // gone, try again": lift the collision block and allow one more prompt if it is still held.
    if (explicit && this.blockedIds.has(this.sessionId)) {
      this.blockedIds.delete(this.sessionId);
      this.promptedIds.delete(this.sessionId);
      this.hostAttempt.delete(this.sessionId);
    }
    if (this.peer) return;
    void this.initPeerHost(this.sessionId, explicit ? 'enableRemote-explicit' : 'enableRemote-auto');
  }
  /** True when the current id collided with a persistent holder and auto-hosting is suspended. */
  public get hostBlocked(): boolean { return !!this.sessionId && this.blockedIds.has(this.sessionId); }

  // Fired when hosting failed because the id is ALREADY TAKEN by a live session elsewhere.
  // The GM route owns the user-facing choice (keep and retry later, or regenerate).
  public onHostIdUnavailable: (() => void) | null = null;

  // BYO ICE servers for THIS instance (a player view reads them from its URL; the GM from
  // settings). Null = stored GM setting, else PeerJS defaults. Set BEFORE dialling.
  private iceServers: IceServerEntry[] | null = null;
  public setIceServers(servers: IceServerEntry[] | null) { this.iceServers = servers; }
  // Guest-side transport verdict: 'ice-failed' when no path (direct or relayed) could be
  // negotiated; null when a connection later succeeds. Receivers turn this into an honest
  // "blocked — relay needed" state rather than an endless waiting screen.
  public onPeerFailed: ((reason: 'ice-failed' | null) => void) | null = null;

  // Setup for Player Mode (Receiver)
  public initReceiver(
      onSystemUpdate: (sys: System) => void,
      onRulePackUpdate: (pack: RulePack) => void,
      onFocusUpdate: (id: string | null) => void,
      onCameraUpdate: (pan: PanState, zoom: number, isManual: boolean, viewMin?: number) => void,
      onViewSettingsUpdate: (settings: ViewSettings) => void,
      onTimeUpdate: (time: TimeState) => void,
      targetId: string | null = null
  ) {
    this.isSender = false;
    this.targetSessionId = targetId;
    this.onSystemUpdate = onSystemUpdate;
    this.onRulePackUpdate = onRulePackUpdate;
    this.onFocusUpdate = onFocusUpdate;
    this.onCameraUpdate = onCameraUpdate;
    this.onViewSettingsUpdate = onViewSettingsUpdate;
    this.onTimeUpdate = onTimeUpdate;
    
    // Request initial state
    // For REQUEST_SYNC, we send it "from" no one (or self?), but the payload targets the specific GM
    this.sendMessage({ type: 'REQUEST_SYNC', payload: targetId });
    // Also try to reach the host over the network (cross-device); local channel handles same-machine.
    this.initPeerGuest(targetId);
  }

  // Lightweight DISCOVERY receiver for the /bridge route and other same-machine probes: listens
  // for ANNOUNCE only, filters by nothing (any host on this browser's channel may answer), and
  // deliberately does NOT dial PeerJS — a probe is same-machine by definition. Avoids the
  // full initReceiver ceremony for a caller that wants one answer.
  public initProbe(onAnnounce: (a: AnnouncePayload) => void) {
    this.isSender = false;
    this.targetSessionId = null;
    this.onAnnounce = onAnnounce;
  }

  // CROSS-SITE discovery. Chrome partitions BroadcastChannel (and all storage) inside a
  // third-party iframe, so a /bridge frame embedded by another SITE (beta.mappadux.com
  // framing beta.starsystemx.com) cannot hear the SSE GM tab on the same-machine channel —
  // it only works when host and SSE are the same site (localhost dev, which is how it
  // passed testing). PeerJS is NOT partitioned: given the sid the host already knows
  // (every StarMap map / share link carries it), dial the GM over WebRTC and ask HELLO
  // there. Answers arrive through the normal receiver path (onAnnounce).
  public probeViaPeer(sessionId: string, onAnnounce: (a: AnnouncePayload) => void) {
    this.isSender = false;
    this.targetSessionId = sessionId;
    this.onAnnounce = onAnnounce;
    this.probeOnly = true;
    this.initPeerGuest(sessionId);
  }
  // A probe wants HELLO, not the whole campaign: skip the REQUEST_SYNC/STARMAP join burst.
  private probeOnly = false;
  public onAnnounce: ((a: AnnouncePayload) => void) | null = null;
  public onHeartbeat: ((gmClockMs: number) => void) | null = null;
  // Sender-side answers, owned by the GM route.
  public onRequestHello: ((requestingId: string | null) => void) | null = null;
  public onRequestRemote: ((requestingId: string | null) => void) | null = null;

  // Guest liveness: when the far side goes quiet (peer connection closed, or heartbeats stop for
  // longer than the receiver tolerates) re-dial the host. Idempotent; a no-op on the local pipe.
  public redialPeer() {
    if (this.isSender || !this.targetSessionId || this.closed) return;
    if (this.peerOut?.open) return;
    try { this.peer?.destroy(); } catch { /* already gone */ }
    this.peer = null;
    this.peerOut = null;
    this.initPeerGuest(this.targetSessionId);
  }
  private static REDIAL_MS = 10_000;
  private redialTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private scheduleRedial() {
    if (this.redialTimer || this.closed || this.isSender) return;
    this.redialTimer = setTimeout(() => { this.redialTimer = null; this.redialPeer(); }, BroadcastService.REDIAL_MS);
  }

  public sendMessage(msg: BroadcastMessage) {
    // EVERY send is counted here, because this is the one door they all go through — the join burst
    // and the player's own requests use it raw, and metering only the throttled path made a player
    // window report that it had sent nothing at all.
    const known = this.pendingSendBytes;
    this.pendingSendBytes = undefined;
    this.meter.recordSend(msg.type, known);
    const envelope: BroadcastEnvelope = {
        sessionId: this.sessionId, // Will be null for Receiver (which is fine for REQUEST_SYNC)
        message: msg
    };
    if (this.channel) this.channel.postMessage(envelope);
    this.sendPeer(envelope); // mirror over the cross-device pipe
  }

  // sendIfChanged state: last fingerprint + send time per type, and a trailing-send timer.
  private lastSentByType = new Map<string, string>();

  /**
   * The serialised size of the last message of this type that actually went out, or undefined if
   * none has. A63 uses it to tell a joining player roughly how much is coming; it is deliberately
   * the LAST send rather than a fresh measurement, because measuring costs a stringify of the very
   * payload whose stringify cost is the problem.
   */
  /** How long a link has been counted, and whether this window is remote. */
  private get amRemote(): boolean { return !!this.peerOut; }

  /**
   * Tell the GM this window is here, and what it has seen. Cheap: a few bytes, at most every 5 s.
   *
   * IT IDENTIFIES THE WINDOW, NOT THE SESSION, and that distinction is why the first cut announced
   * nothing at all. On a receiver `this.sessionId` is null by design — it is the id of the session
   * being LISTENED TO, and a player that opened a bare /catalogue link has none — so keying presence
   * on it silently disabled the whole feature for exactly the case it exists to count. What the GM
   * is counting is windows, so windows are what carry the id.
   */
  public announcePresence() {
    if (this.isSender) return;
    // A REMOTE window must announce under its PeerJS broker id — the id the GM's connection list
    // already knows it by. Announcing the windowId gave one window two identities in two id spaces:
    // connectionCounts unioned both and counted every remote guest TWICE, and peerLinks looked up
    // the reported stats by broker id against a map keyed 'w-…' and never found them. A local
    // window has no broker id and keeps the windowId. (NET-1 trap 4.)
    const id = this.amRemote && this.peer?.id ? this.peer.id : this.windowId;
    this.sendMessage({
      type: 'PLAYER_PRESENT',
      payload: { id, remote: this.amRemote, stats: this.meter.snapshot() }
    });
  }

  /**
   * HOW MANY PLAYER WINDOWS ARE WATCHING, split by transport — the count the GM wants at a glance.
   *
   * The two halves are known differently and neither can stand in for the other. A REMOTE window
   * holds an open connection, so the GM can see it directly and immediately, even before it has said
   * anything. A LOCAL window is just another tab on a shared channel with no connection to count, so
   * it has to announce itself — which means a local window appears within one heartbeat rather than
   * instantly, and disappears within `PRESENCE_TTL_MS` of going quiet rather than the moment it
   * closes. Saying that plainly is better than a number that pretends to be exact.
   */
  public connectionCounts(): { local: number; remote: number } {
    const now = Date.now();
    let local = 0;
    const remoteIds = new Set<string>(this.peerConns.map((c) => c?.peer).filter(Boolean));
    for (const [id, p] of this.presence) {
      if (now - p.at > BroadcastService.PRESENCE_TTL_MS) { this.presence.delete(id); continue; }
      if (p.remote) remoteIds.add(id); else local++;
    }
    return { local, remote: remoteIds.size };
  }

  /** Everything this window has sent and received, whatever the transport. */
  public transferStats(): TransferStats { return this.meter.snapshot(); }

  /**
   * GM view: one row per player window. Remote links carry real byte figures; local ones carry the
   * message counts and say bytes do not apply, because on a shared channel there is no wire.
   */
  public peerLinks(): PeerLink[] {
    const now = Date.now();
    const out: PeerLink[] = [];
    for (const c of this.peerConns) {
      const id = c?.peer;
      if (!id) continue;
      const m = this.meterByPeer.get(id);
      out.push({ id, remote: true, lastSeen: this.presence.get(id)?.at ?? now,
        stats: (m ?? new TransferMeter()).snapshot(), reported: this.presence.get(id)?.reported });
    }
    for (const [id, p] of this.presence) {
      if (p.remote || out.some((x) => x.id === id)) continue;
      if (now - p.at > BroadcastService.PRESENCE_TTL_MS) continue;
      out.push({ id, remote: false, lastSeen: p.at, stats: new TransferMeter().snapshot(), reported: p.reported });
    }
    return out.sort((a, b) => Number(b.remote) - Number(a.remote) || a.id.localeCompare(b.id));
  }

  public approxBytesOf(type: BroadcastMessage['type']): number | undefined {
    return this.lastSentByType.get(type)?.length;
  }
  private lastSentAtByType = new Map<string, number>();
  private pendingByType = new Map<string, { timer: ReturnType<typeof setTimeout>; msg: BroadcastMessage }>();
  // The GM clock is EMBEDDED in the snapshots (temporal.masterTimeSec/displayTimeSec), so with time
  // playing every tick made the payload "different" and the whole ~400KB starmap went out ~5×/sec
  // again. Players take their time from SYNC_TIME, so the clock fields are ignored when deciding
  // whether a snapshot changed. (They still ride along in the payload itself.)
  private static readonly VOLATILE_KEYS = new Set(['masterTimeSec', 'displayTimeSec']);
  // Backstop for volatile fields this list doesn't know about: at most one send per type per interval,
  // with a trailing send so the final state always lands.
  private static readonly SEND_MIN_INTERVAL_MS = 500;
  // P3 — THE SIZE-AWARE BACKSTOP, so this degrades instead of crashing.
  //
  // The 500 ms floor above is the right interval for a payload of a few KB and completely the wrong
  // one for a campaign snapshot. The owner's diagnostic: a playing clock produced 517 SYNC_STARMAP
  // sends totalling 989 MB with 33 s of stringify, and the tab reached a 3.8 GB heap and died. Two
  // per second of a 2 MB payload is 4 MB/s of JSON that every player window must also parse.
  //
  // So a payload OVER `LARGE_PAYLOAD_BYTES` earns a much longer floor. It is measured from what this
  // type last actually sent, which is the honest predictor of what it is about to send again, and the
  // trailing timer means the final state still lands — a throttled update is DELAYED, never dropped.
  // `bc.<TYPE>.throttled` counts them, so the next person to look at the meters can see the guard
  // working rather than having to infer it.
  private static readonly LARGE_PAYLOAD_BYTES = 256 * 1024;
  private static readonly LARGE_SEND_MIN_INTERVAL_MS = 5000;
  private lastBytesByType = new Map<string, number>();

  /**
   * Gate for REACTIVE broadcast sites (Svelte `$:` statements that fire on every store tick): skip the
   * send when the payload is unchanged (ignoring the embedded GM clock), and rate-limit genuinely
   * changing payloads to one per interval. The GM's stores tick several times a second and the
   * snapshot payloads run to hundreds of KB — without this gate every player window receives (and
   * rebuilds from) megabytes of JSON per second and eventually freezes.
   * Request-response sites (onRequestSync / onRequestStarmap join bursts) must keep using sendMessage:
   * a NEW listener needs the current state even though it hasn't changed.
   */
  public sendIfChanged(msg: BroadcastMessage) {
    // Perf trace: this stringify runs on EVERY reactive tick that reaches here, sent or not — on a
    // several-hundred-KB starmap snapshot that is a real, previously invisible main-thread cost.
    // `.strMs` accumulates it; `.bytes` is the payload size of what actually went out, which is what
    // crosses the 16KB-framed DataChannel. avg payload = bytes / sent.
    const t0 = performance.now();
    const json = JSON.stringify((msg as { payload?: unknown }).payload ?? null, (key, value) =>
      BroadcastService.VOLATILE_KEYS.has(key) ? undefined : value
    );
    perfCount(`bc.${msg.type}.strMs`, Math.round(performance.now() - t0));
    if (this.lastSentByType.get(msg.type) === json) { perfCount(`bc.${msg.type}.unchanged`); return; }
    const now = Date.now();
    // A big payload gets a big floor (see LARGE_PAYLOAD_BYTES). Judged on the last SENT size for this
    // type, so the very first send of anything is never delayed.
    const lastBytes = this.lastBytesByType.get(msg.type) ?? 0;
    const floor = lastBytes >= BroadcastService.LARGE_PAYLOAD_BYTES
      ? BroadcastService.LARGE_SEND_MIN_INTERVAL_MS
      : BroadcastService.SEND_MIN_INTERVAL_MS;
    const wait = floor - (now - (this.lastSentAtByType.get(msg.type) ?? 0));
    if (wait > 0) {
      if (floor !== BroadcastService.SEND_MIN_INTERVAL_MS) perfCount(`bc.${msg.type}.throttled`);
      // Too soon — remember the LATEST message and send it when the interval is up.
      const pending = this.pendingByType.get(msg.type);
      if (pending) {
        pending.msg = msg;
      } else {
        this.pendingByType.set(msg.type, {
          msg,
          timer: setTimeout(() => {
            const p = this.pendingByType.get(msg.type);
            this.pendingByType.delete(msg.type);
            if (p) this.sendIfChanged(p.msg);
          }, wait)
        });
      }
      return;
    }
    this.lastSentByType.set(msg.type, json);
    this.lastSentAtByType.set(msg.type, now);
    perfCount(`bc.${msg.type}.sent`);
    perfCount(`bc.${msg.type}.bytes`, json.length);
    // Hand the size to sendMessage rather than recording here: sendIfChanged CALLS sendMessage, so
    // recording in both would count every throttled-path message twice. `json` is free either way —
    // it was computed for the dedupe above.
    this.pendingSendBytes = json.length;
    this.lastBytesByType.set(msg.type, json.length); // what the next call's floor is judged on
    this.sendMessage(msg);
  }

  private onSystemUpdate: ((sys: System) => void) | null = null;
  private onRulePackUpdate: ((pack: RulePack) => void) | null = null;
  private onFocusUpdate: ((id: string | null) => void) | null = null;
  private onCameraUpdate: ((pan: PanState, zoom: number, isManual: boolean, viewMin?: number) => void) | null = null;
  private onViewSettingsUpdate: ((settings: ViewSettings) => void) | null = null;
  private onTimeUpdate: ((time: TimeState) => void) | null = null;

  // Handlers for incoming messages
  public onRequestSync: ((requestingId: string | null) => void) | null = null;
  // Set by the player view (receiver) to get the whole redacted starmap, and by the host owner
  // (+page) to answer its REQUEST_STARMAP. Separate from onRequestSync so a per-system consumer and
  // a whole-map one can both be served by one session.
  public onStarmapUpdate: ((map: Starmap) => void) | null = null;
  public onRequestStarmap: ((requestingId: string | null) => void) | null = null;
  public onBrandingUpdate: ((b: { name: string; logo: string | null }) => void) | null = null;
  /** A63: something large is on its way. Receiver-only, like the other on*Update callbacks. */
  public onIncoming: ((info: { what: 'starmap'; systems: number; approxBytes?: number }) => void) | null = null;
  public onTagStylesUpdate: ((t: TagStyleSnapshot) => void) | null = null;
  public onPresetUpdate: ((p: PresetBroadcast | null) => void) | null = null;
  public onGmLevelUpdate: ((l: GmLevel) => void) | null = null;
  public onFocusLevelUpdate: ((p: { id: string; level: number }) => void) | null = null;
  // G3 construct models (sender side answers, receiver side stores) - transport only, the model
  // store itself is the hosts' business.
  public onRequestModel: ((requestingId: string | null, hash: string) => void) | null = null;
  public onModelUpdate: ((m: { hash: string; b64: string; meta: Record<string, unknown> }) => void) | null = null;

  private handleMessage(data: any) {
      // Check if this is an envelope or legacy message
      let msg: BroadcastMessage;
      let senderId: string | null = null;

      if (data && 'message' in data && 'type' in data.message) {
          // New Envelope Format
          const env = data as BroadcastEnvelope;
          msg = env.message;
          senderId = env.sessionId;
      } else if (data && 'type' in data) {
          // Legacy Format (handle gracefully during upgrade/mixed versions)
          msg = data as BroadcastMessage;
      } else {
          return; // Unknown format
      }

      // Receiver Logic: Filtering
      if (!this.isSender) {
          // If we have a targetSessionId, we ONLY accept messages from that ID
          // Exception: If senderId is null/undefined (Legacy), we might accept it if we didn't specify a target?
          // BUT: If targetId IS set, we must strictly ignore mismatches.
          if (this.targetSessionId && senderId !== this.targetSessionId) {
              return; 
          }
      }

      // P2 RECEIVE-SIDE METERS. `bc.*` counts what the GM SENDS and lives only on the sender; a
      // player window had no equivalent, so a rebuild storm could not be attributed: "the GM is
      // sending more" and "the player rebuilds more per message received" have the same symptom and
      // opposite fixes. `rx.<TYPE>` is that missing half, and the event row puts inbound messages on
      // ONE TIMELINE with holo.setSystem rebuilds — which is what actually separates the two
      // (rebuilds ≈ messages → the sender; rebuilds ≫ messages → this window is retriggering).
      // Counting is free. SIZING IS NOT: stringifying a several-hundred-KB starmap on the receive
      // path is the very cost class this item chases, so it stays behind an explicit opt-in
      // (`__ssePerf.rxBytes = true`) rather than riding ?perf=1.
      // Transfer meter, both directions and both roles. `pendingRecvBytes` is non-zero only when the
      // message came over the PEER path, where the size was free; a local channel delivery leaves it
      // at zero and the meter records a message with no byte figure, which is the truth.
      const recvBytes = this.pendingRecvBytes || undefined;
      this.pendingRecvBytes = 0;
      this.meter.recordRecv(msg.type, recvBytes);
      if (senderId && this.isSender) {
          const m = this.meterByPeer.get(senderId);
          if (m) m.recordRecv(msg.type, recvBytes);
      }

      if (!this.isSender) {
          perfCount(`rx.${msg.type}`);
          let bytes: number | undefined;
          if ((globalThis as any).__ssePerf?.rxBytes) {
              try { bytes = JSON.stringify((msg as { payload?: unknown }).payload ?? null).length; } catch { /* unmeasurable */ }
              if (bytes !== undefined) perfCount(`rx.${msg.type}.bytes`, bytes);
          }
          perfEvent('rx', { type: msg.type, ...(bytes !== undefined ? { bytes } : {}) });
      }

      switch (msg.type) {
          case 'SYNC_SYSTEM':
              if (!this.isSender && this.onSystemUpdate) this.onSystemUpdate(msg.payload);
              break;
          case 'SYNC_RULEPACK':
              if (!this.isSender && this.onRulePackUpdate) this.onRulePackUpdate(msg.payload);
              break;
          case 'SYNC_FOCUS':
              if (!this.isSender && this.onFocusUpdate) this.onFocusUpdate(msg.payload);
              break;
          case 'SYNC_FOCUS_LEVEL':
              if (!this.isSender && this.onFocusLevelUpdate) this.onFocusLevelUpdate(msg.payload);
              break;
          case 'SYNC_CAMERA':
              if (!this.isSender && this.onCameraUpdate) this.onCameraUpdate(msg.payload.pan, msg.payload.zoom, msg.payload.isManual, msg.payload.viewMin);
              break;
          case 'SYNC_VIEW_SETTINGS':
              if (!this.isSender && this.onViewSettingsUpdate) this.onViewSettingsUpdate(msg.payload);
              break;
          case 'SYNC_TIME':
              if (!this.isSender && this.onTimeUpdate) this.onTimeUpdate(msg.payload);
              break;
          case 'REQUEST_SYNC':
              // Sender Logic: Only respond if payload matches OUR sessionId (or is null/legacy)
              if (this.isSender && this.onRequestSync) {
                   const targetId = msg.payload;
                   if (targetId && targetId !== this.sessionId) return;
                   this.onRequestSync(msg.payload);
              }
              break;
          case 'SYNC_STARMAP':
              if (!this.isSender && this.onStarmapUpdate) this.onStarmapUpdate(msg.payload);
              break;
          case 'SYNC_BRANDING':
              if (!this.isSender && this.onBrandingUpdate) this.onBrandingUpdate(msg.payload);
              break;
          case 'SYNC_INCOMING':
              if (!this.isSender && this.onIncoming) this.onIncoming(msg.payload);
              break;
          case 'PLAYER_PRESENT':
              // GM only. A local window has no connection object to count, so this is the only way
              // it can be known to exist at all.
              if (this.isSender && msg.payload?.id) {
                  this.presence.set(msg.payload.id, {
                      at: Date.now(), remote: !!msg.payload.remote, reported: msg.payload.stats
                  });
              }
              break;
          case 'SYNC_TAGSTYLES':
              if (!this.isSender && this.onTagStylesUpdate) this.onTagStylesUpdate(msg.payload);
              break;
          case 'SYNC_PRESET':
              if (!this.isSender && this.onPresetUpdate) this.onPresetUpdate(msg.payload);
              break;
          case 'SYNC_GM_LEVEL':
              if (!this.isSender && this.onGmLevelUpdate) this.onGmLevelUpdate(msg.payload);
              break;
          case 'REQUEST_STARMAP':
              if (this.isSender && this.onRequestStarmap) {
                   const targetId = msg.payload;
                   if (targetId && targetId !== this.sessionId) return;
                   this.onRequestStarmap(msg.payload);
              }
              break;
          case 'REQUEST_MODEL':
              if (this.isSender && this.onRequestModel) {
                   const targetId = msg.payload?.targetId;
                   if (targetId && targetId !== this.sessionId) return;
                   this.onRequestModel(targetId ?? null, msg.payload.hash);
              }
              break;
          case 'SYNC_MODEL':
              if (!this.isSender && this.onModelUpdate) this.onModelUpdate(msg.payload);
              break;
          case 'REQUEST_HELLO':
              if (this.isSender && this.onRequestHello) {
                   const targetId = msg.payload;
                   if (targetId && targetId !== this.sessionId) return;
                   this.onRequestHello(msg.payload);
              }
              break;
          case 'ANNOUNCE':
              if (!this.isSender && this.onAnnounce) this.onAnnounce(msg.payload);
              break;
          case 'REQUEST_REMOTE':
              if (this.isSender && this.onRequestRemote) {
                   const targetId = msg.payload;
                   if (targetId && targetId !== this.sessionId) return;
                   this.onRequestRemote(msg.payload);
              }
              break;
          case 'SYNC_HEARTBEAT':
              // Answer once per heartbeat rather than on a timer of our own: the GM's cadence is
              // already the liveness clock both sides use, so presence cannot drift out of step with
              // it, and a GM that stops beating stops being told about players it can no longer see.
              if (!this.isSender) this.announcePresence();
              if (!this.isSender && this.onHeartbeat) this.onHeartbeat(msg.payload);
              break;
      }
  }
  
  public close() {
      this.closed = true;
      if (this.redialTimer) { clearTimeout(this.redialTimer); this.redialTimer = null; }
      if (this.hostRetryTimer) { clearTimeout(this.hostRetryTimer); this.hostRetryTimer = null; }
      if (this.channel) this.channel.close();
      try { this.peer?.destroy(); } catch { /* already gone */ }
      this.peer = null;
      this.peerConns = [];
      this.peerOut = null;
  }
}

export const broadcastService = new BroadcastService();
