import { writable } from 'svelte/store';
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
export interface PresetBroadcast {
  presetId: string;
  overrides: PresetOverrides;
}

type BroadcastEnvelope = {
  sessionId: string | null;
  message: BroadcastMessage;
};

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
  private peerConns: any[] = [];   // host: open guest connections
  private peerOut: any = null;     // guest: connection to the host
  // WebRTC data channels drop/garble messages over ~16KB, so large payloads (the whole starmap)
  // must be chunked — small ones (branding, focus) go in one frame. This is the Mappadux gotcha.
  private static CHUNK_BYTES = 14000;
  private chunkSeq = 0;
  private chunkBuf = new Map<string, { n: number; parts: string[] }>();

  private async loadPeer(): Promise<any> {
    const mod: any = await import('peerjs');
    return mod.default ?? mod.Peer ?? mod;
  }

  private async initPeerHost(sessionId: string) {
    if (typeof window === 'undefined') return;
    try {
      const Peer = await this.loadPeer();
      // The host registers under the session id, so a guest dials that id directly.
      // BYO ICE (docs/dev/vtt-integration-design.md 11): custom STUN/TURN prepended to
      // the PeerJS defaults, so a turns:443 relay can carry a locked-down network.
      const cfg = peerConfigFor(this.iceServers ?? loadStoredIce());
      this.peer = new Peer(sessionId, cfg ? { config: cfg } : undefined);
      this.peer.on('connection', (conn: any) => {
        conn.on('open', () => { if (!this.peerConns.includes(conn)) this.peerConns.push(conn); });
        conn.on('data', (data: any) => this.handlePeerData(data));
        conn.on('close', () => { this.peerConns = this.peerConns.filter((c) => c !== conn); });
        conn.on('error', () => { /* per-connection; ignore */ });
      });
      this.peer.on('error', (e: any) => {
        if (e?.type === 'unavailable-id') {
          // Another LIVE session already hosts this id — a stale tab on another PC, or a
          // copied starmap file at another table. Surface it to the owner; never silently
          // regenerate (that would break every stored player link on an innocent PC move).
          try { this.peer?.destroy(); } catch { /* already gone */ }
          this.peer = null;
          this.peerConns = [];
          this.onHostIdUnavailable?.();
          return;
        }
        console.warn('[peer host]', e?.type || e);
      });
    } catch (e) {
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
      let entry = this.chunkBuf.get(id);
      if (!entry) { entry = { n, parts: new Array(n) }; this.chunkBuf.set(id, entry); }
      entry.parts[i] = part;
      if (entry.parts.filter((p) => p !== undefined).length === entry.n) {
        this.chunkBuf.delete(id);
        try { this.handleMessage(JSON.parse(entry.parts.join(''))); } catch { /* malformed; drop */ }
      }
      return;
    }
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
    if (changed && this.peer) {
      try { this.peer.destroy(); } catch { /* already gone */ }
      this.peer = null;
      this.peerConns = [];
    }
    if (this.hostRequested && !this.peer) this.initPeerHost(sessionId);
  }

  // Opt-in cross-device hosting: called when the GM opens the Companion launcher (sharing intent),
  // so we only announce an id to the public PeerJS broker when the GM actually wants remote players —
  // not on every session. Idempotent. The request is remembered so a session-id change re-hosts.
  private hostRequested = false;
  public enableRemote() {
    this.hostRequested = true;
    if (this.peer || !this.sessionId || !this.isSender) return;
    this.initPeerHost(this.sessionId);
  }

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
    const envelope: BroadcastEnvelope = {
        sessionId: this.sessionId, // Will be null for Receiver (which is fine for REQUEST_SYNC)
        message: msg
    };
    if (this.channel) this.channel.postMessage(envelope);
    this.sendPeer(envelope); // mirror over the cross-device pipe
  }

  // sendIfChanged state: last fingerprint + send time per type, and a trailing-send timer.
  private lastSentByType = new Map<string, string>();
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
    const wait = BroadcastService.SEND_MIN_INTERVAL_MS - (now - (this.lastSentAtByType.get(msg.type) ?? 0));
    if (wait > 0) {
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
  public onTagStylesUpdate: ((t: TagStyleSnapshot) => void) | null = null;
  public onPresetUpdate: ((p: PresetBroadcast | null) => void) | null = null;
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
          case 'SYNC_TAGSTYLES':
              if (!this.isSender && this.onTagStylesUpdate) this.onTagStylesUpdate(msg.payload);
              break;
          case 'SYNC_PRESET':
              if (!this.isSender && this.onPresetUpdate) this.onPresetUpdate(msg.payload);
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
              if (!this.isSender && this.onHeartbeat) this.onHeartbeat(msg.payload);
              break;
      }
  }
  
  public close() {
      this.closed = true;
      if (this.redialTimer) { clearTimeout(this.redialTimer); this.redialTimer = null; }
      if (this.channel) this.channel.close();
      try { this.peer?.destroy(); } catch { /* already gone */ }
      this.peer = null;
      this.peerConns = [];
      this.peerOut = null;
  }
}

export const broadcastService = new BroadcastService();
