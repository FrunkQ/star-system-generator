/**
 * VTT integration contract (docs/dev/vtt-integration-design.md 9.1): discovery, remote request,
 * heartbeat liveness, and the sender-side filtering rules — exercised end-to-end through the
 * REAL BroadcastService class over a same-process BroadcastChannel shim, host and probe as two
 * instances. PeerJS is never dialled here (initProbe by design does not, and initSender only
 * hosts after enableRemote).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// A minimal in-process BroadcastChannel: every instance on a name hears every other's posts
// asynchronously (like the real one), never its own.
class FakeChannel {
  static byName = new Map<string, Set<FakeChannel>>();
  onmessage: ((e: { data: unknown }) => void) | null = null;
  constructor(public name: string) {
    if (!FakeChannel.byName.has(name)) FakeChannel.byName.set(name, new Set());
    FakeChannel.byName.get(name)!.add(this);
  }
  postMessage(data: unknown) {
    for (const c of FakeChannel.byName.get(this.name)!) {
      if (c !== this) queueMicrotask(() => c.onmessage?.({ data: JSON.parse(JSON.stringify(data)) }));
    }
  }
  close() { FakeChannel.byName.get(this.name)?.delete(this); }
}
const flush = () => new Promise((r) => setTimeout(r, 0));

async function makeService() {
  // Fresh module instance per call so host and probe are independent singletons.
  vi.resetModules();
  const mod = await import('./broadcast');
  return mod.broadcastService as InstanceType<typeof mod.broadcastService.constructor> & typeof mod.broadcastService;
}

describe('VTT integration broadcast contract', () => {
  beforeEach(() => {
    FakeChannel.byName.clear();
    (globalThis as any).window = globalThis;
    (globalThis as any).BroadcastChannel = FakeChannel;
  });

  it('REQUEST_HELLO(null) reaches the host, ANNOUNCE reaches the probe', async () => {
    const host = await makeService();
    const probe = await makeService();
    host.initSender('my_tuesday_game-gamma-spice-042');
    const announced: any[] = [];
    probe.initProbe((a) => announced.push(a));
    host.onRequestHello = () => host.sendMessage({ type: 'ANNOUNCE', payload: {
      sessionId: 'my_tuesday_game-gamma-spice-042', starmapId: 'sm1', starmapName: 'My Tuesday Game',
      presets: [{ id: 'holo', name: 'Holo Table' }], appVersion: '2.1.720-beta' } });
    probe.sendMessage({ type: 'REQUEST_HELLO', payload: null });
    await flush(); await flush();
    expect(announced).toHaveLength(1);
    expect(announced[0].starmapName).toBe('My Tuesday Game');
    expect(announced[0].presets[0].id).toBe('holo');
  });

  it('a targeted REQUEST_HELLO for a DIFFERENT sid is ignored by the host', async () => {
    const host = await makeService();
    const probe = await makeService();
    host.initSender('sid-a');
    probe.initProbe(() => {});
    const hello = vi.fn();
    host.onRequestHello = hello;
    probe.sendMessage({ type: 'REQUEST_HELLO', payload: 'sid-b' });
    await flush();
    expect(hello).not.toHaveBeenCalled();
    probe.sendMessage({ type: 'REQUEST_HELLO', payload: 'sid-a' });
    await flush();
    expect(hello).toHaveBeenCalledTimes(1);
  });

  it('REQUEST_REMOTE reaches the host handler; SYNC_HEARTBEAT reaches a receiver', async () => {
    const host = await makeService();
    const guest = await makeService();
    host.initSender('sid-a');
    const remote = vi.fn();
    host.onRequestRemote = remote;
    const beats: number[] = [];
    guest.initProbe(() => {});
    guest.onHeartbeat = (t) => beats.push(t);
    guest.sendMessage({ type: 'REQUEST_REMOTE', payload: 'sid-a' });
    host.sendMessage({ type: 'SYNC_HEARTBEAT', payload: 1234 });
    await flush(); await flush();
    expect(remote).toHaveBeenCalledTimes(1);
    expect(beats).toEqual([1234]);
  });

  it('a host never acts on ANNOUNCE/HEARTBEAT (receiver-only), a probe never on REQUEST_* (sender-only)', async () => {
    const host = await makeService();
    const probe = await makeService();
    host.initSender('sid-a');
    const hostAnnounce = vi.fn(); host.onAnnounce = hostAnnounce;
    const probeHello = vi.fn(); probe.onRequestHello = probeHello;
    probe.initProbe(() => {});
    probe.sendMessage({ type: 'ANNOUNCE', payload: { sessionId: 'x', starmapId: 'x', starmapName: 'x', presets: [], appVersion: '0' } });
    host.sendMessage({ type: 'REQUEST_HELLO', payload: null });
    await flush(); await flush();
    expect(hostAnnounce).not.toHaveBeenCalled();
    expect(probeHello).not.toHaveBeenCalled();
  });
});
