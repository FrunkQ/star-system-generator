import { describe, it, expect } from 'vitest';
import { encodeIceParam, parseIceParam, parseIceText, iceToText, peerConfigFor, DEFAULT_ICE, iceVerdict, blockedJoinerAdvice } from './iceConfig';

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
