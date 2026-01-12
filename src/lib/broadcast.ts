import { writable } from 'svelte/store';
import type { System, RulePack } from '$lib/types';
import type { PanState } from '$lib/cameraStore';

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

  // Setup for Player Mode (Receiver)
  public initReceiver(
      onSystemUpdate: (sys: System) => void,
      onRulePackUpdate: (pack: RulePack) => void,
      onFocusUpdate: (id: string | null) => void,
      onCameraUpdate: (pan: PanState, zoom: number, isManual: boolean) => void,
      onViewSettingsUpdate: (settings: ViewSettings) => void,
      onTimeUpdate: (time: TimeState) => void,
      onCrtModeUpdate: (isCrt: boolean) => void,
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
    
    // Request initial state
    // For REQUEST_SYNC, we send it "from" no one (or self?), but the payload targets the specific GM
    this.sendMessage({ type: 'REQUEST_SYNC', payload: targetId });
  }

  public sendMessage(msg: BroadcastMessage) {
    if (this.channel) {
        const envelope: BroadcastEnvelope = {
            sessionId: this.sessionId, // Will be null for Receiver (which is fine for REQUEST_SYNC)
            message: msg
        };
        this.channel.postMessage(envelope);
    }
  }

  private onSystemUpdate: ((sys: System) => void) | null = null;
  private onRulePackUpdate: ((pack: RulePack) => void) | null = null;
  private onFocusUpdate: ((id: string | null) => void) | null = null;
  private onCameraUpdate: ((pan: PanState, zoom: number, isManual: boolean) => void) | null = null;
  private onViewSettingsUpdate: ((settings: ViewSettings) => void) | null = null;
  private onTimeUpdate: ((time: TimeState) => void) | null = null;
  private onCrtModeUpdate: ((isCrt: boolean) => void) | null = null;

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
  }
}

export const broadcastService = new BroadcastService();
