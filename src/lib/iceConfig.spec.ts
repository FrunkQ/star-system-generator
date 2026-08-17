import { describe, it, expect } from 'vitest';
import { encodeIceParam, parseIceParam, parseIceText, iceToText, peerConfigFor, DEFAULT_ICE } from './iceConfig';

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
  it('rejects junk and non-ICE schemes', () => {
    expect(parseIceParam('!!!')).toBeNull();
    expect(parseIceParam(encodeIceParam([{ urls: 'https://evil' } as any]))).toBeNull();
  });
});
