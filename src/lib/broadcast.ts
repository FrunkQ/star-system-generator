import { writable } from 'svelte/store';
import type { System, RulePack } from '$lib/types';
import type { PanState } from '$lib/viewport/stores';

export type ViewSettings = {
    showNames: boolean;
    showZones: boolean;
    showLPoints: boolean;
};

export type TimeState = {
    currentTime: number;
    isPlaying: boolean;
    timeScale: number;
};

// Message Types
export type BroadcastMessage = 
  | { type: 'SYNC_SYSTEM'; payload: System }
  | { type: 'SYNC_RULEPACK'; payload: RulePack }
  | { type: 'SYNC_FOCUS'; payload: string | null }
  | { type: 'SYNC_CAMERA'; payload: { pan: PanState; zoom: number; isManual: boolean } }
  | { type: 'SYNC_VIEW_SETTINGS'; payload: ViewSettings }
  | { type: 'SYNC_TIME'; payload: TimeState }
  | { type: 'SYNC_CRT_MODE'; payload: boolean }
  | { type: 'SYNC_GREENSCREEN'; payload: boolean }
  | { type: 'REQUEST_SYNC'; payload: string | null };

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

  private async loadPeer(): Promise<any> {
    const mod: any = await import('peerjs');
    return mod.default ?? mod.Peer ?? mod;
  }

  private async initPeerHost(sessionId: string) {
    if (typeof window === 'undefined') return;
    try {
      const Peer = await this.loadPeer();
      // The host registers under the session id, so a guest dials that id directly.
      this.peer = new Peer(sessionId);
      this.peer.on('connection', (conn: any) => {
        conn.on('open', () => { if (!this.peerConns.includes(conn)) this.peerConns.push(conn); });
        conn.on('data', (data: any) => this.handleMessage(data));
        conn.on('close', () => { this.peerConns = this.peerConns.filter((c) => c !== conn); });
        conn.on('error', () => { /* per-connection; ignore */ });
      });
      this.peer.on('error', (e: any) => { console.warn('[peer host]', e?.type || e); });
    } catch (e) {
      console.warn('PeerJS host init failed (cross-device sharing unavailable)', e);
    }
  }

  private async initPeerGuest(sessionId: string | null) {
    if (typeof window === 'undefined' || !sessionId) return;
    try {
      const Peer = await this.loadPeer();
      this.peer = new Peer();
      this.peer.on('open', () => {
        const conn = this.peer.connect(sessionId, { reliable: true });
        this.peerOut = conn;
        conn.on('open', () => {
          conn.send({ sessionId: null, message: { type: 'REQUEST_SYNC', payload: sessionId } });
        });
        conn.on('data', (data: any) => this.handleMessage(data));
        conn.on('error', () => { /* ignore; local channel may still serve */ });
      });
      this.peer.on('error', (e: any) => { console.warn('[peer guest]', e?.type || e); });
    } catch (e) {
      console.warn('PeerJS guest init failed (cross-device unavailable)', e);
    }
  }

  private sendPeer(envelope: BroadcastEnvelope) {
    if (this.isSender) {
      for (const c of this.peerConns) { try { if (c.open) c.send(envelope); } catch { /* drop */ } }
    } else if (this.peerOut) {
      try { if (this.peerOut.open) this.peerOut.send(envelope); } catch { /* drop */ }
    }
  }

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (event) => this.handleMessage(event.data);
    }
  }

  // Setup for GM Mode (Sender)
  public initSender(sessionId: string) {
    this.isSender = true;
    this.sessionId = sessionId;
  }

  // Opt-in cross-device hosting: called when the GM opens the Companion launcher (sharing intent),
  // so we only announce an id to the public PeerJS broker when the GM actually wants remote players —
  // not on every session. Idempotent.
  public enableRemote() {
    if (this.peer || !this.sessionId || !this.isSender) return;
    this.initPeerHost(this.sessionId);
  }

  // Setup for Player Mode (Receiver)
  public initReceiver(
      onSystemUpdate: (sys: System) => void,
      onRulePackUpdate: (pack: RulePack) => void,
      onFocusUpdate: (id: string | null) => void,
      onCameraUpdate: (pan: PanState, zoom: number, isManual: boolean) => void,
      onViewSettingsUpdate: (settings: ViewSettings) => void,
      onTimeUpdate: (time: TimeState) => void,
      onCrtModeUpdate: (isCrt: boolean) => void,
      onGreenscreenUpdate: (isGreen: boolean) => void,
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
    this.onCrtModeUpdate = onCrtModeUpdate;
    this.onGreenscreenUpdate = onGreenscreenUpdate;
    
    // Request initial state
    // For REQUEST_SYNC, we send it "from" no one (or self?), but the payload targets the specific GM
    this.sendMessage({ type: 'REQUEST_SYNC', payload: targetId });
    // Also try to reach the host over the network (cross-device); local channel handles same-machine.
    this.initPeerGuest(targetId);
  }

  public sendMessage(msg: BroadcastMessage) {
    const envelope: BroadcastEnvelope = {
        sessionId: this.sessionId, // Will be null for Receiver (which is fine for REQUEST_SYNC)
        message: msg
    };
    if (this.channel) this.channel.postMessage(envelope);
    this.sendPeer(envelope); // mirror over the cross-device pipe
  }

  private onSystemUpdate: ((sys: System) => void) | null = null;
  private onRulePackUpdate: ((pack: RulePack) => void) | null = null;
  private onFocusUpdate: ((id: string | null) => void) | null = null;
  private onCameraUpdate: ((pan: PanState, zoom: number, isManual: boolean) => void) | null = null;
  private onViewSettingsUpdate: ((settings: ViewSettings) => void) | null = null;
  private onTimeUpdate: ((time: TimeState) => void) | null = null;
  private onCrtModeUpdate: ((isCrt: boolean) => void) | null = null;
  private onGreenscreenUpdate: ((isGreen: boolean) => void) | null = null;

  // Handlers for incoming messages
  public onRequestSync: ((requestingId: string | null) => void) | null = null;

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
          case 'SYNC_CAMERA':
              if (!this.isSender && this.onCameraUpdate) this.onCameraUpdate(msg.payload.pan, msg.payload.zoom, msg.payload.isManual);
              break;
          case 'SYNC_VIEW_SETTINGS':
              if (!this.isSender && this.onViewSettingsUpdate) this.onViewSettingsUpdate(msg.payload);
              break;
          case 'SYNC_TIME':
              if (!this.isSender && this.onTimeUpdate) this.onTimeUpdate(msg.payload);
              break;
          case 'SYNC_CRT_MODE':
              if (!this.isSender && this.onCrtModeUpdate) this.onCrtModeUpdate(msg.payload);
              break;
          case 'SYNC_GREENSCREEN':
              if (!this.isSender && this.onGreenscreenUpdate) this.onGreenscreenUpdate(msg.payload);
              break;
          case 'REQUEST_SYNC':
              // Sender Logic: Only respond if payload matches OUR sessionId (or is null/legacy)
              if (this.isSender && this.onRequestSync) {
                   const targetId = msg.payload;
                   if (targetId && targetId !== this.sessionId) return;
                   this.onRequestSync(msg.payload);
              }
              break;
      }
  }
  
  public close() {
      if (this.channel) this.channel.close();
      try { this.peer?.destroy(); } catch { /* already gone */ }
      this.peer = null;
      this.peerConns = [];
      this.peerOut = null;
  }
}

export const broadcastService = new BroadcastService();
