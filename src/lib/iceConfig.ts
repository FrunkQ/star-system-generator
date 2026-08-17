/**
 * iceConfig.ts — bring-your-own ICE (STUN/TURN) for the PeerJS transport.
 * (docs/dev/vtt-integration-design.md section 11)
 *
 * The default PeerJS config already carries Google STUN plus the PeerJS
 * community TURN relays (turn:eu-0/us-0.turn.peerjs.com:3478, UDP) — enough
 * for home networks and mobile. What it cannot do is cross a WORK network
 * that blocks UDP and only lets 443 out: for that a TURN relay reachable over
 * TLS on 443 (`turns:host:443`) is needed, and nobody runs one for free at
 * scale. So the GM can supply their own (a free-tier managed TURN or a small
 * coturn), and it is delivered PRE-CONNECTION — in the share URL/QR the
 * player opens — because a player who cannot connect cannot be told anything
 * over the channel.
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
