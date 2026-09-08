import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  encodeIceParam, parseIceParam, parseIceText, iceToText, peerConfigFor, DEFAULT_ICE, iceVerdict,
  blockedJoinerAdvice, parseManagedIce, primeManagedIce, managedIce, managedIceReady, managedIceUrl,
  managedRelayEnabled, setManagedRelayEnabled, resetManagedIce,
} from './iceConfig';

describe('iceConfig', () => {
  it('round-trips a TURN/TURNS list through the URL param', () => {
    const list = parseIceText('turns:relay.example.com:443|user|secret\nstun:stun.example.com:3478\n# comment\nnot-a-url');
    expect(list).toHaveLength(2);
    const p = encodeIceParam(list)!;
    expect(p).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, safe in a query string
    const back = parseIceParam(p)!;
    expect(back[0]).toEqual({ urls: 'turns:relay.example.com:443', username: 'user', credential: 'secret' });
    expect(back[1]).toEqual({ urls: 'stun:stun.example.com:3478' });
    expect(iceToText(back)).toBe('turns:relay.example.com:443|user|secret\nstun:stun.example.com:3478');
  });
  it('custom servers are PREPENDED to the library defaults, never replacing them', () => {
    const cfg = peerConfigFor([{ urls: 'turns:r:443', username: 'u', credential: 'c' }])!;
    expect(cfg.iceServers[0].urls).toBe('turns:r:443');
    expect(cfg.iceServers.slice(1)).toEqual(DEFAULT_ICE);
    expect(peerConfigFor(null)).toBeUndefined();
    expect(peerConfigFor([])).toBeUndefined();
  });
  it('reads the verdict from EITHER state machine, because browsers disagree', () => {
    // Chrome drives both together...
    expect(iceVerdict({ connectionState: 'failed', iceConnectionState: 'failed' })).toBe('ice-failed');
    expect(iceVerdict({ connectionState: 'connected', iceConnectionState: 'connected' })).toBe('connected');
    // ...Firefox does not: ICE can be dead while the aggregate still says
    // 'disconnected'. Watching only connectionState loses the verdict there,
    // which is how a Firefox player got PeerJS's raw error instead of ours.
    expect(iceVerdict({ connectionState: 'disconnected', iceConnectionState: 'failed' })).toBe('ice-failed');
    expect(iceVerdict({ connectionState: 'connecting', iceConnectionState: 'failed' })).toBe('ice-failed');
    // ...and the other way round, for whatever browser does the reverse.
    expect(iceVerdict({ connectionState: 'failed', iceConnectionState: 'checking' })).toBe('ice-failed');
  });

  it('treats ICE completion as connected, and a wobble as no verdict at all', () => {
    expect(iceVerdict({ iceConnectionState: 'completed' })).toBe('connected');
    // 'disconnected' routinely recovers. Calling it a failure would tell a
    // player their game had died in the middle of a scene.
    expect(iceVerdict({ connectionState: 'disconnected' })).toBeNull();
    expect(iceVerdict({ connectionState: 'connecting', iceConnectionState: 'checking' })).toBeNull();
    expect(iceVerdict({})).toBeNull();
    expect(iceVerdict(null)).toBeNull();
    expect(iceVerdict(undefined)).toBeNull();
  });

  it('tells the GM which of the two fixes applies', () => {
    // Nothing configured: the default list has no working relay behind it.
    expect(blockedJoinerAdvice(false)).toBe('add-relay');
    // A relay IS set up, so the likely fault is a link made before it was added.
    expect(blockedJoinerAdvice(true)).toBe('reshare');
  });

  it('rejects junk and non-ICE schemes', () => {
    expect(parseIceParam('!!!')).toBeNull();
    expect(parseIceParam(encodeIceParam([{ urls: 'https://evil' } as any]))).toBeNull();
  });
});

/**
 * The managed relay (v3.1.17) — a relay nobody configures.
 *
 * The risk in this feature is not that it fails; it is that it fails LOUDLY,
 * or slowly, or that it quietly becomes mandatory. Everything below is about
 * one of those three: a bad answer must be indistinguishable from no relay,
 * a slow endpoint must not hold a join, and a relay must never be the only
 * thing offered.
 */
describe('the managed relay', () => {
  afterEach(() => {
    resetManagedIce();
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* no storage */ }
    vi.unstubAllGlobals();
  });

  it('reads our own shape and the Cloudflare one, which is not a list', () => {
    // Ours.
    const mine = parseManagedIce({ iceServers: [{ urls: 'turns:r:443', username: 'u', credential: 'c' }], ttl: 600 });
    expect(mine!.servers).toHaveLength(1);
    expect(mine!.ttlMs).toBe(600_000);
    // Cloudflare returns iceServers as a SINGLE OBJECT. Proxying their body
    // through unchanged has to work, or the Worker grows a translation layer
    // for no reason.
    const cf = parseManagedIce({
      iceServers: {
        urls: ['stun:stun.cloudflare.com:3478', 'turns:turn.cloudflare.com:5349?transport=tcp'],
        username: 'abc', credential: 'def',
      },
    });
    expect(cf!.servers[0]!.username).toBe('abc');
    expect(Array.isArray(cf!.servers[0]!.urls)).toBe(true);
  });

  it('treats a junk answer as no relay at all, never as a broken one', () => {
    expect(parseManagedIce(null)).toBeNull();
    expect(parseManagedIce({})).toBeNull();
    expect(parseManagedIce({ iceServers: [] })).toBeNull();
    // The dangerous case: a plausible-looking body carrying a non-ICE scheme.
    expect(parseManagedIce({ iceServers: [{ urls: 'https://evil.example' }] })).toBeNull();
  });

  it('caps a silly TTL rather than trusting it', () => {
    // Cloudflare's own maximum is 48 hours; a server claiming a year is either
    // broken or lying, and either way the credential will not last that long.
    expect(parseManagedIce({ iceServers: [{ urls: 'turns:r:443' }], ttl: 999_999_999 })!.ttlMs)
      .toBe(48 * 3600_000);
    // No ttl at all is fine — an hour, then ask again.
    expect(parseManagedIce({ iceServers: [{ urls: 'turns:r:443' }] })!.ttlMs).toBe(3600_000);
  });

  it('is inert with no endpoint configured — this is the shipped state', async () => {
    expect(managedIceUrl()).toBe('');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await primeManagedIce();
    // Nothing asked, nothing added, nothing to go wrong.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(managedIce()).toBeNull();
    expect(peerConfigFor(null)).toBeUndefined();
  });

  it('adds itself AFTER the servers the GM chose and BEFORE the defaults', async () => {
    localStorage.setItem('sse-managed-relay-url', 'https://relay.test/ice');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ iceServers: [{ urls: 'turns:managed:443', username: 'm', credential: 'p' }] }),
    }));
    await primeManagedIce();

    const cfg = peerConfigFor([{ urls: 'turns:mine:443' }])!;
    // The GM's own relay is what they chose; it goes first. Ours backs it up.
    expect(cfg.iceServers[0]!.urls).toBe('turns:mine:443');
    expect(cfg.iceServers[1]!.urls).toBe('turns:managed:443');
    expect(cfg.iceServers.slice(2)).toEqual(DEFAULT_ICE);
    // And with no GM relay it still never REPLACES the defaults.
    const alone = peerConfigFor(null)!;
    expect(alone.iceServers[0]!.urls).toBe('turns:managed:443');
    expect(alone.iceServers.slice(1)).toEqual(DEFAULT_ICE);
  });

  it('says nothing to the endpoint about the game', async () => {
    localStorage.setItem('sse-managed-relay-url', 'https://relay.test/ice');
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ iceServers: [{ urls: 'turns:m:443' }] }) });
    vi.stubGlobal('fetch', fetchSpy);
    await primeManagedIce();

    const [url, init] = fetchSpy.mock.calls[0]!;
    // No room code, no session id, no query string of any kind: the endpoint
    // must never become a way to know who is playing.
    expect(url).toBe('https://relay.test/ice');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    // And no cookie rides along, nor does a credential linger in the HTTP cache.
    expect(init.credentials).toBe('omit');
    expect(init.cache).toBe('no-store');
  });

  it('a failing or hostile endpoint is simply no relay', async () => {
    localStorage.setItem('sse-managed-relay-url', 'https://relay.test/ice');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await primeManagedIce()).toBeNull();
    expect(managedIce()).toBeNull();
    expect(peerConfigFor(null)).toBeUndefined();     // exactly today's behaviour

    resetManagedIce();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await primeManagedIce()).toBeNull();
  });

  it('never holds a join for longer than the wait allows', async () => {
    localStorage.setItem('sse-managed-relay-url', 'https://relay.test/ice');
    // An endpoint that never answers. The whole point: a player joins WITHOUT
    // a relay rather than staring at a spinner because ours is having a day.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => { /* never settles */ })));
    const started = Date.now();
    await managedIceReady(60);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(managedIce()).toBeNull();
  });

  it('does not ask at all when the GM has switched it off', async () => {
    localStorage.setItem('sse-managed-relay-url', 'https://relay.test/ice');
    setManagedRelayEnabled(false);
    expect(managedRelayEnabled()).toBe(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await primeManagedIce();
    expect(fetchSpy).not.toHaveBeenCalled();
    setManagedRelayEnabled(true);
    expect(managedRelayEnabled()).toBe(true);
  });

  it('asks once, however many callers there are', async () => {
    localStorage.setItem('sse-managed-relay-url', 'https://relay.test/ice');
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ iceServers: [{ urls: 'turns:m:443' }] }) });
    vi.stubGlobal('fetch', fetchSpy);
    await Promise.all([primeManagedIce(), primeManagedIce(), managedIceReady()]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
