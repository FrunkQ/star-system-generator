/**
 * VTT integration contract (docs/dev/vtt-integration-design.md 9.1): discovery, remote request,
 * heartbeat liveness, the sender-side filtering rules, and (A57) the broker id collision state
 * machine — exercised through the REAL BroadcastService class over a same-process BroadcastChannel
 * shim and a fake PeerJS `Peer`, host and probe as two instances.
 *
 * E12: this file was flaky under the full suite because it counted ticks (`await flush()`) instead
 * of awaiting the delivery. Now every expectation WAITS for the condition (bounded), and both
 * services are constructed before anything is sent, so the second module's dynamic import can
 * never race an in-flight message.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

/** Await a condition rather than a tick count (E12). */
async function waitFor(pred: () => boolean, ms = 2000): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('waitFor: condition not met within ' + ms + 'ms');
    await new Promise((r) => setTimeout(r, 5));
  }
}
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

// ---- Fake PeerJS: a broker with a registry of taken ids, so we can script `unavailable-id`. ----
type Handler = (...a: any[]) => void;
class FakePeer {
  static taken = new Set<string>();       // ids currently registered on the "broker"
  static constructed: { id: string | undefined; peer: FakePeer }[] = [];
  private handlers = new Map<string, Handler[]>();
  destroyed = false;
  private registered = false;              // did THIS peer win the id? (only then destroy() frees it)
  constructor(public id?: string, _opts?: unknown) {
    FakePeer.constructed.push({ id, peer: this });
    // Like the real broker: a SECOND socket for an id whose first socket is open OR still pending
    // is refused. So claim the id synchronously on construction (pending counts), and answer
    // asynchronously like the websocket handshake does.
    const pendingHolder = id ? FakePeer.taken.has(id) : false;
    if (id && !pendingHolder) { FakePeer.taken.add(id); this.registered = true; }
    setTimeout(() => {
      if (this.destroyed) return;
      if (pendingHolder) this.emit('error', { type: 'unavailable-id' });
      else this.emit('open', id ?? 'anon');
    }, 1);
  }
  on(ev: string, fn: Handler) { (this.handlers.get(ev) ?? this.handlers.set(ev, []).get(ev)!).push(fn); }
  emit(ev: string, ...a: any[]) { for (const fn of this.handlers.get(ev) ?? []) fn(...a); }
  connect() { return { on() {}, send() {}, open: false }; }
  // A REJECTED peer's destroy must not free the OTHER holder's registration — that is exactly the
  // real-broker semantics the persistent-holder tests depend on.
  destroy() { this.destroyed = true; if (this.id && this.registered) FakePeer.taken.delete(this.id); }
}

async function makeService() {
  // Fresh module instance per call so host and probe are independent singletons.
  vi.resetModules();
  vi.doMock('peerjs', () => ({ default: FakePeer, Peer: FakePeer }));
  const mod = await import('./broadcast');
  // Warm the lazy `import('peerjs')` that initPeerHost awaits: a dynamic import resolves on REAL
  // time through the module loader, invisible to fake timers — without this the first host attempt
  // lands seconds late under vi.useFakeTimers() and the retry ladder appears never to fire.
  await import('peerjs');
  return mod.broadcastService as InstanceType<typeof mod.broadcastService.constructor> & typeof mod.broadcastService;
}

/** Under fake timers, advance in steps and yield a real tick between them so any awaited promise
 *  chain (the lazy import, `peer.on('open')` handlers) settles before the next timer fires. */
async function advance(ms: number) {
  const step = 250;
  for (let done = 0; done < ms; done += step) {
    await vi.advanceTimersByTimeAsync(Math.min(step, ms - done));
    // Drain microtasks only — setImmediate/nextTick are FAKED by vi.useFakeTimers() and would hang.
    for (let i = 0; i < 8; i++) await Promise.resolve();
  }
}

describe('VTT integration broadcast contract', () => {
  beforeEach(() => {
    FakeChannel.byName.clear();
    FakePeer.taken.clear();
    FakePeer.constructed = [];
    (globalThis as any).window = globalThis;
    (globalThis as any).BroadcastChannel = FakeChannel;
    (globalThis as any).addEventListener ??= () => {};
    (globalThis as any).performance ??= { now: () => Date.now() };
  });
  afterEach(() => { vi.useRealTimers(); });

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
    await waitFor(() => announced.length === 1);
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
    await settle();
    expect(hello).not.toHaveBeenCalled();
    probe.sendMessage({ type: 'REQUEST_HELLO', payload: 'sid-a' });
    await waitFor(() => hello.mock.calls.length === 1);
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
    await waitFor(() => remote.mock.calls.length === 1 && beats.length === 1);
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
    await settle();
    expect(hostAnnounce).not.toHaveBeenCalled();
    expect(probeHello).not.toHaveBeenCalled();
  });
});

describe('A57 — broker id collision: retry first, prompt once, no silent re-host', () => {
  beforeEach(() => {
    FakeChannel.byName.clear();
    FakePeer.taken.clear();
    FakePeer.constructed = [];
    (globalThis as any).window = globalThis;
    (globalThis as any).BroadcastChannel = FakeChannel;
    (globalThis as any).addEventListener ??= () => {};
    (globalThis as any).performance ??= { now: () => Date.now() };
  });

  it('a free id hosts on first attempt', async () => {
    const host = await makeService();
    host.initSender('map-alpha-beta-001');
    host.enableRemote();
    await waitFor(() => FakePeer.taken.has('map-alpha-beta-001'));
    expect(FakePeer.constructed.filter((c) => c.id === 'map-alpha-beta-001')).toHaveLength(1);
  });

  it('a TRANSIENT holder (own ghost) is retried and hosts without prompting', async () => {
    vi.useFakeTimers();
    const host = await makeService();
    const prompt = vi.fn();
    host.onHostIdUnavailable = prompt;
    FakePeer.taken.add('map-ghost-x-002');           // the broker still holds our old registration
    host.initSender('map-ghost-x-002');
    host.enableRemote();
    await advance(300);            // first attempt -> unavailable-id
    expect(prompt).not.toHaveBeenCalled();
    FakePeer.taken.delete('map-ghost-x-002');        // ghost expires before the retry
    await advance(1600);         // first back-off (1.5 s) -> retry succeeds
    expect(FakePeer.taken.has('map-ghost-x-002')).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
    const attempts = FakePeer.constructed.filter((c) => c.id === 'map-ghost-x-002').length;
    expect(attempts).toBe(2);
  });

  it('a PERSISTENT holder prompts exactly once, and initSender never re-hosts that id', async () => {
    vi.useFakeTimers();
    const host = await makeService();
    const prompt = vi.fn();
    host.onHostIdUnavailable = prompt;
    FakePeer.taken.add('map-taken-y-003');           // held for the whole window
    host.initSender('map-taken-y-003');
    host.enableRemote();
    await advance(12000);        // 1st + 3 retries (1.5+3+5 s) all collide
    expect(prompt).toHaveBeenCalledTimes(1);
    const before = FakePeer.constructed.length;
    // The "Cancel then click into three systems" loop: SystemView calls initSender each time.
    host.initSender('map-taken-y-003');
    host.initSender('map-taken-y-003');
    host.initSender('map-taken-y-003');
    await advance(12000);
    expect(FakePeer.constructed.length).toBe(before); // no new registration attempts
    expect(prompt).toHaveBeenCalledTimes(1);          // and no second prompt
    expect(host.hostBlocked).toBe(true);
    // Auto (non-explicit) enableRemote must not lift the block either.
    host.enableRemote();
    await advance(300);
    expect(FakePeer.constructed.length).toBe(before);
  });

  it('ROOT CAUSE (v2.1.816 report): three same-tick callers must make ONE registration — a fresh id never collides with itself', async () => {
    vi.useFakeTimers();
    const host = await makeService();
    const prompt = vi.fn();
    host.onHostIdUnavailable = prompt;
    // The real load sequence: the reactive block calls initSender + enableRemote, then onMount
    // calls initSender again, then SystemView calls initSender on system entry — all before the
    // async initPeerHost has assigned this.peer.
    host.initSender('map-fresh-s-008');
    host.enableRemote();
    host.initSender('map-fresh-s-008');
    host.initSender('map-fresh-s-008');
    await advance(12000);
    const regs = FakePeer.constructed.filter((c) => c.id === 'map-fresh-s-008');
    expect(regs).toHaveLength(1);                         // exactly one Peer for the id
    expect(FakePeer.taken.has('map-fresh-s-008')).toBe(true);
    expect(prompt).not.toHaveBeenCalled();                // and therefore no self-collision prompt
  });

  it('OK pressed MID-LADDER (v2.1.816 report): the old id pending retry never prompts again', async () => {
    vi.useFakeTimers();
    const host = await makeService();
    const prompt = vi.fn();
    host.onHostIdUnavailable = prompt;
    FakePeer.taken.add('map-old-q-006');              // persistent holder for the OLD id
    host.initSender('map-old-q-006');
    host.enableRemote();
    await advance(12000);                              // ladder exhausts -> ONE prompt
    expect(prompt).toHaveBeenCalledTimes(1);
    // Owner clicks OK: the route mints a new id and calls initSender with it while the service
    // may still hold retry state for the old id.
    host.initSender('map-new-r-007');
    await advance(300);
    expect(FakePeer.taken.has('map-new-r-007')).toBe(true);   // new id hosted
    // The thing the owner saw: ~5 s later the prompt came back. It must not.
    await advance(15000);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(FakePeer.taken.has('map-new-r-007')).toBe(true);   // still hosting the new id
  });

  it('OK (a NEW id) hosts cleanly; explicit enableRemote lifts the block for the old id', async () => {
    vi.useFakeTimers();
    const host = await makeService();
    const prompt = vi.fn();
    host.onHostIdUnavailable = prompt;
    FakePeer.taken.add('map-taken-z-004');
    host.initSender('map-taken-z-004');
    host.enableRemote();
    await advance(12000);
    expect(prompt).toHaveBeenCalledTimes(1);
    // OK: the route mints a new id and calls initSender with it -> hosts, no prompt.
    host.initSender('map-fresh-w-005');
    await advance(300);
    expect(FakePeer.taken.has('map-fresh-w-005')).toBe(true);
    expect(prompt).toHaveBeenCalledTimes(1);
    // Explicit re-enable on the blocked id (holder now gone) hosts it again.
    FakePeer.taken.delete('map-taken-z-004');
    host.initSender('map-taken-z-004');
    await advance(300);
    expect(FakePeer.taken.has('map-taken-z-004')).toBe(false); // still blocked: initSender alone does nothing
    host.enableRemote(true);
    await advance(300);
    expect(FakePeer.taken.has('map-taken-z-004')).toBe(true);  // explicit enable lifted the block
  });
});

/**
 * A59 - SYNC_GM_LEVEL: the message that can say "I have gone back to the map".
 *
 * SYNC_FOCUS carries a BODY id, so it can only ever point INTO a system; leaving one broadcast
 * nothing at all, and a following player stayed where the GM last was. These pin the transport half:
 * that the message crosses, that it is receiver-only like its siblings, and that both levels survive
 * the wire. The player-side GATING (obeyed only while following, and never when the preset has locked
 * its players into one system) lives in the catalogue route with the state it guards.
 */
describe('A59 - SYNC_GM_LEVEL reaches a player window', () => {
  beforeEach(() => {
    // REAL TIMERS FIRST. The A57 describe above runs the retry ladder under vi.useFakeTimers(), and
    // its afterEach is scoped to that describe - so without this, `waitFor`'s setTimeout never fires
    // here and every awaited delivery looks like a transport failure. (Cost: three tests that timed
    // out at 5 s while the message was in fact arriving perfectly.)
    vi.useRealTimers();
    FakeChannel.byName.clear();
    FakePeer.taken.clear();
    (globalThis as any).window = globalThis;
    (globalThis as any).BroadcastChannel = FakeChannel;
    (globalThis as any).addEventListener ??= () => {};
    (globalThis as any).performance ??= { now: () => Date.now() };
  });

  it('carries the starmap level - the case that did not exist before', async () => {
    const host = await makeService();
    const player = await makeService();
    host.initSender('sid-a');
    player.initProbe(() => {});
    const seen: any[] = [];
    (player as any).onGmLevelUpdate = (l: any) => seen.push(l);
    host.sendMessage({ type: 'SYNC_GM_LEVEL', payload: { level: 'starmap' } } as any);
    await waitFor(() => seen.length > 0);
    expect(seen[0]).toEqual({ level: 'starmap' });
  });

  it('carries the system level WITH its id, so a selected-but-unfocused system is followable', async () => {
    const host = await makeService();
    const player = await makeService();
    host.initSender('sid-a');
    player.initProbe(() => {});
    const seen: any[] = [];
    (player as any).onGmLevelUpdate = (l: any) => seen.push(l);
    host.sendMessage({ type: 'SYNC_GM_LEVEL', payload: { level: 'system', systemId: 'sol' } } as any);
    await waitFor(() => seen.length > 0);
    expect(seen[0]).toEqual({ level: 'system', systemId: 'sol' });
  });

  it('is RECEIVER-ONLY: a sender never acts on its own level message', async () => {
    const host = await makeService();
    const player = await makeService();
    host.initSender('sid-a');
    player.initProbe(() => {});
    let hostSaw = 0;
    (host as any).onGmLevelUpdate = () => hostSaw++;
    const seen: any[] = [];
    (player as any).onGmLevelUpdate = (l: any) => seen.push(l);
    host.sendMessage({ type: 'SYNC_GM_LEVEL', payload: { level: 'starmap' } } as any);
    await waitFor(() => seen.length > 0);
    await settle();
    expect(hostSaw).toBe(0);
  });

  it('a level CHANGE gets through the fingerprint gate, and a repeat does not', async () => {
    const host = await makeService();
    host.initSender('sid-a');
    const bc = host as any;
    const { perfCounters } = await import('./perfTrace');
    for (const k of Object.keys(perfCounters)) delete perfCounters[k];
    bc.lastSentByType.delete('SYNC_GM_LEVEL');
    bc.lastSentAtByType.delete('SYNC_GM_LEVEL');
    bc.sendIfChanged({ type: 'SYNC_GM_LEVEL', payload: { level: 'system', systemId: 'sol' } });
    bc.sendIfChanged({ type: 'SYNC_GM_LEVEL', payload: { level: 'system', systemId: 'sol' } });
    expect(perfCounters['bc.SYNC_GM_LEVEL.sent']).toBe(1);
    expect(perfCounters['bc.SYNC_GM_LEVEL.unchanged']).toBe(1);
    // The message is tiny, so it never earns the large-payload floor below.
    expect(perfCounters['bc.SYNC_GM_LEVEL.throttled']).toBeUndefined();
    for (const q of bc.pendingByType.values()) clearTimeout(q.timer);
    bc.pendingByType.clear();
  });
});

/**
 * P3 - A PLAYING CLOCK MUST NOT RE-BROADCAST THE CAMPAIGN.
 *
 * The owner's diagnostic: bc.SYNC_STARMAP.sent 517, 989 MB across the wire, 33 s of stringify, heap
 * to 3.8 GB and a dead tab. These pin the SIZE-AWARE THROTTLE that makes the crash impossible.
 *
 * The other two guards live where their state does, and are named here so nobody reads this file as
 * the whole story: the clock no longer rides the campaign payload (starmapSnapshotForPlayers strips
 * temporal and the per-system time block), and the snapshot is not even BUILT on every tick while
 * playback runs (the GM route's reactive gate). That last one matters most, because sendIfChanged can
 * only decline to SEND - by the time it is reached, the deep clone, the redaction and the stringify
 * have all already happened.
 */
describe('P3 - the big-payload throttle: degrade, never crash', () => {
  beforeEach(() => {
    // REAL TIMERS FIRST. The A57 describe above runs the retry ladder under vi.useFakeTimers(), and
    // its afterEach is scoped to that describe - so without this, `waitFor`'s setTimeout never fires
    // here and every awaited delivery looks like a transport failure. (Cost: three tests that timed
    // out at 5 s while the message was in fact arriving perfectly.)
    vi.useRealTimers();
    FakeChannel.byName.clear();
    FakePeer.taken.clear();
    (globalThis as any).window = globalThis;
    (globalThis as any).BroadcastChannel = FakeChannel;
    (globalThis as any).addEventListener ??= () => {};
    (globalThis as any).performance ??= { now: () => Date.now() };
  });

  async function freshMeters() {
    const host = await makeService();
    host.initSender('sid-a');
    const { perfCounters } = await import('./perfTrace');
    for (const k of Object.keys(perfCounters)) delete perfCounters[k];
    const bc = host as any;
    bc.lastSentByType.clear();
    bc.lastSentAtByType.clear();
    bc.lastBytesByType.clear();
    drain(bc);
    return { bc, perfCounters };
  }
  function drain(bc: any) {
    for (const q of bc.pendingByType.values()) clearTimeout(q.timer);
    bc.pendingByType.clear();
  }

  it('a small payload keeps the 500 ms floor and is never counted as throttled', async () => {
    const { bc, perfCounters } = await freshMeters();
    bc.sendIfChanged({ type: 'SYNC_TIME', payload: { t: 1 } });
    bc.sendIfChanged({ type: 'SYNC_TIME', payload: { t: 2 } });
    expect(perfCounters['bc.SYNC_TIME.sent']).toBe(1);
    expect(perfCounters['bc.SYNC_TIME.throttled']).toBeUndefined();
    drain(bc);
  });

  it('once a payload has gone out BIG, the next change is throttled rather than sent', async () => {
    const { bc, perfCounters } = await freshMeters();
    const big = (n: number) => ({ blob: 'x'.repeat(400 * 1024), n });
    // The FIRST send is never delayed - the floor is judged on what this type last actually sent.
    bc.sendIfChanged({ type: 'SYNC_STARMAP', payload: big(1) });
    expect(perfCounters['bc.SYNC_STARMAP.sent']).toBe(1);
    expect(perfCounters['bc.SYNC_STARMAP.bytes']).toBeGreaterThan(256 * 1024);
    // ...and now a genuinely DIFFERENT payload does not go out, because the last one was large.
    bc.sendIfChanged({ type: 'SYNC_STARMAP', payload: big(2) });
    expect(perfCounters['bc.SYNC_STARMAP.sent']).toBe(1);
    expect(perfCounters['bc.SYNC_STARMAP.throttled']).toBe(1);
    // DELAYED, NOT DROPPED: the trailing timer still holds the latest message.
    expect(bc.pendingByType.has('SYNC_STARMAP')).toBe(true);
    expect(bc.pendingByType.get('SYNC_STARMAP').msg.payload.n).toBe(2);
    drain(bc);
  });

  it('the throttle keeps the LATEST state, so a burst collapses to one send rather than a queue', async () => {
    const { bc, perfCounters } = await freshMeters();
    const big = (n: number) => ({ blob: 'y'.repeat(400 * 1024), n });
    bc.sendIfChanged({ type: 'SYNC_STARMAP', payload: big(0) });
    for (let i = 1; i <= 20; i++) bc.sendIfChanged({ type: 'SYNC_STARMAP', payload: big(i) });
    // Twenty ticks of a 400 KB payload used to be 8 MB on the wire. It is now one pending message.
    expect(perfCounters['bc.SYNC_STARMAP.sent']).toBe(1);
    expect(perfCounters['bc.SYNC_STARMAP.throttled']).toBe(20);
    expect(bc.pendingByType.size).toBe(1);
    expect(bc.pendingByType.get('SYNC_STARMAP').msg.payload.n).toBe(20); // the LATEST
    drain(bc);
  });
});
