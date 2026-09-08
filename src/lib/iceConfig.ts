/**
 * iceConfig.ts — bring-your-own ICE (STUN/TURN) for the PeerJS transport.
 * (docs/dev/vtt-integration-design.md section 11)
 *
 * WARNING, measured 2026-09-08: the PeerJS community TURN relays in the
 * default list below (turn:eu-0/us-0.turn.peerjs.com:3478) NO LONGER RESOLVE.
 * Both names return NOERROR with no A or AAAA record, from two independent
 * public resolvers, while stun.l.google.com resolves normally from the same
 * machine. So the out-of-the-box configuration is STUN ONLY, with no relay of
 * any kind behind it.
 *
 * What that means in practice: a player whose network needs a relay cannot
 * connect at all, on any browser, until the GM supplies one. STUN alone gets
 * you a direct path when the NATs cooperate and nothing when they do not —
 * there is no longer a fallback underneath it. (This is what a Firefox-vs-
 * Chrome bug report on 2026-09-08 actually turned out to be: Chrome found a
 * direct path, Firefox did not, and there was no relay to catch either.)
 *
 * The entries are KEPT because peerjs still ships them and removing them
 * changes nothing — they are simply inert. `testIceServers` will tell you the
 * truth for any list, which is the honest way to find out.
 *
 * So a GM supplying their own relay is no longer the fix for locked-down
 * networks only; it is the fix for remote play in general. A TURN relay
 * reachable over TLS on 443 (`turns:host:443`) covers the most networks. It is
 * delivered PRE-CONNECTION — in the share URL/QR the player opens — because a
 * player who cannot connect cannot be told anything over the channel.
 *
 * Wire format (`ice=` URL param): base64url of JSON `[{urls,username?,credential?},...]`.
 * Custom servers are PREPENDED to the defaults, so a `turns:443` relay is
 * tried alongside STUN/UDP-TURN, never instead of them.
 */

export interface IceServerEntry {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const STORAGE_KEY = 'sse-ice-servers';

export function parseIceParam(param: string | null | undefined): IceServerEntry[] | null {
  if (!param) return null;
  try {
    const b64 = param.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const arr = JSON.parse(json);
    return sanitise(arr);
  } catch { return null; }
}

export function encodeIceParam(servers: IceServerEntry[] | null | undefined): string | null {
  const s = sanitise(servers);
  if (!s || s.length === 0) return null;
  const json = JSON.stringify(s.map(({ urls, username, credential }) => ({ urls, ...(username ? { username } : {}), ...(credential ? { credential } : {}) })));
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** One URL per line, optionally `url|username|credential` — the GM settings textarea format. */
export function parseIceText(text: string): IceServerEntry[] {
  const out: IceServerEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [url, username, credential] = line.split('|').map((x) => x.trim());
    if (!url || !/^(stun|stuns|turn|turns):/i.test(url)) continue;
    out.push({ urls: url, ...(username ? { username } : {}), ...(credential ? { credential } : {}) });
  }
  return out;
}
export function iceToText(servers: IceServerEntry[] | null | undefined): string {
  return (servers ?? []).flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]).map((u) =>
    [u, s.username ?? '', s.credential ?? ''].filter((x, i) => i === 0 || x).join('|'))).join('\n');
}

export function loadStoredIce(): IceServerEntry[] | null {
  if (typeof localStorage === 'undefined') return null;
  try { return sanitise(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); } catch { return null; }
}
export function saveStoredIce(servers: IceServerEntry[] | null): void {
  if (typeof localStorage === 'undefined') return;
  const s = sanitise(servers);
  if (!s || s.length === 0) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

/** Build the PeerJS `config` option: custom servers first, then the library defaults
 *  (returned as undefined when nothing custom, so PeerJS uses its own defaults untouched). */
export function peerConfigFor(custom: IceServerEntry[] | null | undefined): { iceServers: IceServerEntry[] } | undefined {
  const s = sanitise(custom);
  if (!s || s.length === 0) return undefined;
  return { iceServers: [...s, ...DEFAULT_ICE] };
}

/**
 * The ICE verdict, read from BOTH of a peer connection's state machines,
 * because browsers do not agree on which one reaches 'failed'.
 *
 * `connectionState` is the aggregate (ICE + DTLS); `iceConnectionState` is ICE
 * alone. Chrome drives them together, so watching either works there. Firefox
 * does not: it can sit on `iceConnectionState: 'failed'` while `connectionState`
 * reports 'disconnected' or lags behind it. A guest watching only
 * `connectionState` therefore misses the failure on Firefox and shows the
 * player nothing useful — while PeerJS, which watches `iceConnectionState`,
 * raises its own raw `negotiation-failed` error at them instead.
 *
 * That is a REAL user report: Chrome on Android connected, Firefox on Android
 * showed "P2P negotiation error" (2026-09-08). PeerJS 1.5.5 emits that error
 * from exactly one place — `iceConnectionState === 'failed'` — so despite the
 * name it never means an SDP/offer-answer fault. It means no network path was
 * found, which is the same thing this verdict is for.
 *
 * Returns 'ice-failed' when the connection is definitively dead, 'connected'
 * when a path is up, and null while it is still trying.
 */
export function iceVerdict(pc: {
  connectionState?: string;
  iceConnectionState?: string;
} | null | undefined): 'ice-failed' | 'connected' | null {
  if (!pc) return null;
  // Either state machine reaching 'failed' is final: every candidate pair was
  // tried and none worked.
  if (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed') return 'ice-failed';
  // 'completed' is ICE's own success terminal; 'connected' appears on both.
  if (pc.connectionState === 'connected'
    || pc.iceConnectionState === 'connected'
    || pc.iceConnectionState === 'completed') return 'connected';
  // 'disconnected' is NOT a verdict: it is a wobble that routinely recovers,
  // and calling it a failure would tell a player their game had died mid-scene.
  return null;
}

/**
 * Does this ICE configuration actually work? Gathers candidates from the
 * browser and reports what came back, so a GM can find out at setup time rather
 * than from a player who cannot join mid-session.
 *
 * `relay` is the answer that matters: a relay candidate means the TURN server
 * accepted the credentials and is reachable, which is the whole point of
 * configuring one. `srflx` (a STUN reflexive candidate) only proves the machine
 * can see itself from outside — useful, but it is not what rescues a player on
 * a locked-down network.
 *
 * Nothing is dialled: this is a local gathering pass, so it costs nothing and
 * tells nobody. It is also honest about the boring failure — a TURN server with
 * wrong credentials gathers no relay candidate and says so.
 */
export async function testIceServers(
  servers: IceServerEntry[] | null | undefined,
  timeoutMs = 6000,
): Promise<{ relay: boolean; srflx: boolean; error?: string }> {
  const config = peerConfigFor(servers) ?? { iceServers: DEFAULT_ICE };
  let pc: RTCPeerConnection | null = null;
  try {
    pc = new RTCPeerConnection(config as RTCConfiguration);
  } catch (e) {
    return { relay: false, srflx: false, error: (e as Error).message };
  }
  const found = { relay: false, srflx: false };
  try {
    // A data channel is needed or nothing is gathered at all.
    pc.createDataChannel('ice-test');
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      const timer = setTimeout(done, timeoutMs);
      pc!.onicecandidate = (e) => {
        if (!e.candidate) { clearTimeout(timer); done(); return; }   // gathering finished
        const type = / typ (\w+)/.exec(e.candidate.candidate)?.[1];
        if (type === 'relay') found.relay = true;
        if (type === 'srflx') found.srflx = true;
        // A relay candidate is the answer; no reason to keep waiting for more.
        if (found.relay) { clearTimeout(timer); done(); }
      };
      void pc!.createOffer().then((o) => pc!.setLocalDescription(o)).catch(() => { clearTimeout(timer); done(); });
    });
    return found;
  } catch (e) {
    return { ...found, error: (e as Error).message };
  } finally {
    try { pc.close(); } catch { /* already gone */ }
  }
}

/**
 * What to tell the GM when a joiner's connection was blocked.
 *
 * Only the GM can fix this: the relay has to be in the link the player opens,
 * and it is delivered pre-connection precisely because a player who cannot
 * connect cannot be told anything over the channel. So the person seeing the
 * error is never the person who can act, and the app has to carry the message
 * across for them.
 *
 * Two cases, and they need different advice:
 *   'add-relay'  — no custom relay configured. The default list is one STUN and
 *                  one UDP-only community TURN that no longer resolves, so a
 *                  restrictive network has nothing to fall back on. A turns:443
 *                  relay is the fix.
 *   'reshare'    — a relay IS configured, so the likely fault is that this
 *                  player is using a link or QR made BEFORE it was added.
 *                  Re-sharing costs nothing and fixes exactly that.
 */
export function blockedJoinerAdvice(hasCustomRelay: boolean): 'add-relay' | 'reshare' {
  return hasCustomRelay ? 'reshare' : 'add-relay';
}

/** Mirror of peerjs@1.5 DEFAULT_CONFIG.iceServers — kept here so a custom
 *  list ADDS to the defaults rather than replacing them. */
export const DEFAULT_ICE: IceServerEntry[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
];

function sanitise(arr: unknown): IceServerEntry[] | null {
  if (!Array.isArray(arr)) return null;
  const out: IceServerEntry[] = [];
  for (const e of arr) {
    if (!e || typeof e !== 'object') continue;
    const urls = (e as IceServerEntry).urls;
    const list = (Array.isArray(urls) ? urls : [urls]).filter((u): u is string => typeof u === 'string' && /^(stun|stuns|turn|turns):[^\s]+$/i.test(u));
    if (list.length === 0) continue;
    const entry: IceServerEntry = { urls: list.length === 1 ? list[0] : list };
    if (typeof (e as IceServerEntry).username === 'string') entry.username = (e as IceServerEntry).username;
    if (typeof (e as IceServerEntry).credential === 'string') entry.credential = (e as IceServerEntry).credential;
    out.push(entry);
  }
  return out;
}
