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

/** Build the PeerJS `config` option: the GM's own servers first, then the managed
 *  relay if one has arrived, then the library defaults. Undefined when there is
 *  nothing to add at all, so PeerJS uses its own defaults untouched. */
export function peerConfigFor(custom: IceServerEntry[] | null | undefined): { iceServers: IceServerEntry[] } | undefined {
  const s = sanitise(custom) ?? [];
  const m = managedIce() ?? [];
  if (s.length === 0 && m.length === 0) return undefined;
  return { iceServers: [...s, ...m, ...DEFAULT_ICE] };
}

// ─── The managed relay (v3.1.17) ───────────────────────────────────────────
//
// A relay nobody has to configure. The app asks an endpoint of ours for
// short-lived TURN credentials at startup, and adds them to the list it was
// going to use anyway.
//
// WHAT THIS IS NOT: a pipe everyone's game flows through. ICE ranks candidates
// by type and RELAY IS LAST — priority zero, below the LAN address and below
// the direct internet path STUN finds. The browser tries pairs in that order
// and keeps the best one that works, so a relay is only ever used by the
// players who could not connect without it. Everyone else connects machine to
// machine exactly as they do today and never touches it. (Same-browser windows
// skip PeerJS altogether and ride LocalChannel, so they do not even gather.)
//
// WHAT THE ENDPOINT LEARNS: an IP address and a timestamp. The request carries
// no room code, no session id, no cookies and no body — see fetchManagedIce.
// Keep it that way: this must never become a way to know who is playing.
//
// It is OPTIONAL in every direction. No URL configured, endpoint down, request
// slow, GM switched it off — all of them mean "carry on exactly as before",
// silently. Nothing here may ever be able to stop a game connecting.

/**
 * Where short-lived credentials come from. EMPTY = no managed relay, which is
 * the shipped state until the Worker exists; the machinery below is inert and
 * costs one `if`. Flip this to the endpoint and everything switches on.
 *
 * Overridable per-device for testing without a deploy: set
 * `localStorage['sse-managed-relay-url']`.
 */
export const MANAGED_ICE_URL = '';

const MANAGED_URL_KEY   = 'sse-managed-relay-url';
const MANAGED_OFF_KEY   = 'sse-managed-relay-off';
const MANAGED_CACHE_KEY = 'sse-managed-ice';

/** How long to let the request run before giving up on it entirely. */
const MANAGED_FETCH_MS = 4000;
/** How long a dial will wait for it. Shorter: joining beats relaying. */
const MANAGED_WAIT_MS  = 2500;
/** Used when the endpoint does not say how long its credentials last. */
const MANAGED_DEFAULT_TTL_MS = 3600_000;

export function managedIceUrl(): string {
  if (typeof localStorage !== 'undefined') {
    try {
      const override = localStorage.getItem(MANAGED_URL_KEY);
      if (override) return override;
    } catch { /* storage blocked */ }
  }
  return MANAGED_ICE_URL;
}

/** The GM's own switch. On by default; off means we never ask at all. */
export function managedRelayEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  try { return localStorage.getItem(MANAGED_OFF_KEY) !== '1'; } catch { return true; }
}
export function setManagedRelayEnabled(on: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (on) localStorage.removeItem(MANAGED_OFF_KEY);
    else { localStorage.setItem(MANAGED_OFF_KEY, '1'); _managed = null; _managedPromise = null; forgetManagedIce(); }
  } catch { /* storage blocked */ }
}

/**
 * Read an endpoint's answer. PURE, so the shapes are pinned by tests rather
 * than by a live server.
 *
 * Accepts our own `{ iceServers: [...], ttl }` and Cloudflare's shape, which
 * returns `iceServers` as a SINGLE OBJECT rather than a list — proxying their
 * body through unchanged should work, and this is what makes that safe.
 */
export function parseManagedIce(body: unknown): { servers: IceServerEntry[]; ttlMs: number } | null {
  if (!body || typeof body !== 'object') return null;
  const raw = (body as { iceServers?: unknown }).iceServers ?? body;
  const list = Array.isArray(raw) ? raw : [raw];
  const servers = sanitise(list);
  if (!servers || servers.length === 0) return null;
  const ttl = (body as { ttl?: unknown }).ttl;
  const ttlMs = typeof ttl === 'number' && ttl > 0
    ? Math.min(ttl * 1000, 48 * 3600_000)
    : MANAGED_DEFAULT_TTL_MS;
  return { servers, ttlMs };
}

let _managed: IceServerEntry[] | null = null;
let _managedPromise: Promise<IceServerEntry[] | null> | null = null;

/** What has arrived, if anything. Synchronous, for the dialling code. */
export function managedIce(): IceServerEntry[] | null {
  return _managed && _managed.length > 0 ? _managed : null;
}

function readCache(): IceServerEntry[] | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = JSON.parse(sessionStorage.getItem(MANAGED_CACHE_KEY) || 'null');
    if (!raw || typeof raw.notAfter !== 'number' || Date.now() >= raw.notAfter) return null;
    return sanitise(raw.servers);
  } catch { return null; }
}
function writeCache(servers: IceServerEntry[], ttlMs: number): void {
  if (typeof sessionStorage === 'undefined') return;
  // Expire a minute early: a credential that dies mid-dial is worse than a
  // fetch we did not need.
  try {
    sessionStorage.setItem(MANAGED_CACHE_KEY, JSON.stringify({
      servers, notAfter: Date.now() + Math.max(60_000, ttlMs - 60_000),
    }));
  } catch { /* storage blocked or full */ }
}
function forgetManagedIce(): void {
  if (typeof sessionStorage === 'undefined') return;
  try { sessionStorage.removeItem(MANAGED_CACHE_KEY); } catch { /* storage blocked */ }
}

/**
 * Ask for credentials, once. Call it as early in startup as possible: by the
 * time anything dials, the answer is usually already here.
 *
 * Memoised, so every later caller shares the one request. Never throws and
 * never rejects — a failure is just "no managed relay", which is where we
 * started.
 */
export function primeManagedIce(): Promise<IceServerEntry[] | null> {
  if (_managedPromise) return _managedPromise;
  _managedPromise = (async () => {
    const url = managedIceUrl();
    // `typeof window` rather than `typeof fetch`: server-side rendering has a
    // perfectly good fetch, and a build step quietly asking for TURN
    // credentials would be a genuinely surprising thing to ship.
    if (!url || typeof window === 'undefined' || !managedRelayEnabled()) return null;
    const cached = readCache();
    if (cached) { _managed = cached; return cached; }
    const got = await fetchManagedIce(url);
    if (got) { _managed = got.servers; writeCache(got.servers, got.ttlMs); return got.servers; }
    return null;
  })();
  return _managedPromise;
}

/**
 * One request, told nothing about the game.
 *
 * `credentials: 'omit'` so no cookie ever rides along, `cache: 'no-store'` so
 * a credential is not held by the HTTP cache past its life, and a plain GET
 * with no query string so there is nothing to correlate a player with. The
 * endpoint sees an IP and a time, which is what any web request gives it.
 */
export async function fetchManagedIce(
  url: string,
  timeoutMs = MANAGED_FETCH_MS,
): Promise<{ servers: IceServerEntry[]; ttlMs: number } | null> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      ...(ctl ? { signal: ctl.signal } : {}),
    });
    if (!res.ok) return null;
    return parseManagedIce(await res.json());
  } catch {
    return null;      // offline, blocked, slow, garbled: all the same answer
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Wait for the relay before dialling — but not for long, and never forever.
 * Resolves the moment the answer is in, or after MANAGED_WAIT_MS regardless.
 * A player who joins a fraction of a second sooner without a relay they did
 * not need beats a player staring at a spinner.
 */
export async function managedIceReady(maxWaitMs = MANAGED_WAIT_MS): Promise<void> {
  if (_managed || !managedIceUrl() || !managedRelayEnabled()) return;
  await Promise.race([
    primeManagedIce(),
    new Promise((resolve) => setTimeout(resolve, maxWaitMs)),
  ]);
}

/** Tests only: forget everything fetched or cached. */
export function resetManagedIce(): void {
  _managed = null;
  _managedPromise = null;
  forgetManagedIce();
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
