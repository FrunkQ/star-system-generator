/**
 * G51 ACCEPTANCE, MEASURED THROUGH THE REAL SEND PATH.
 *
 * The item's claim is a claim about the WIRE — "with a ship under way and a player attached, the
 * campaign payload stops being re-sent" — so it is checked here against the real `BroadcastService`
 * over the same in-process channel shim `broadcastContract.spec.ts` uses, with a host and a
 * receiver as two instances. The counters asserted (`bc.SYNC_STARMAP.sent` / `.unchanged`) are the
 * very ones the owner reads in `__ssePerf.report()`, so a green run here and a good capture on his
 * machine are measuring the same thing.
 *
 * WHY THIS FILE EXISTS AT ALL: the browser pane was not displayed for this session (standing rule
 * E7 - `document.hidden === true`, zero rAF callbacks), so the two-window repro could not be run.
 * Reproducing the numbers through the real code is what E7 asks for instead of quietly dropping the
 * check. What it CANNOT see is the player's heap and `holo.setSystem` - those still want an eye.
 *
 * RUN AGAINST THE OLD CODE THIS GOES RED: put the per-tick vector back on the campaign payload and
 * "the campaign is sent ONCE while a ship flies" fails with the send count climbing per tick. That
 * was checked before this file was believed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildFlightUpdate, applyFlightUpdate, type FlightUpdate } from './flightState';
import { computePlayerStarmapSnapshot } from '$lib/system/utils';
import { routeOf, routeStateAt } from './shipRoute';
import type { Starmap } from '$lib/types';

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
class FakePeer {
  destroyed = false;
  constructor(public id?: string) { setTimeout(() => this.emit('open', id ?? 'anon'), 1); }
  private h = new Map<string, ((...a: any[]) => void)[]>();
  on(ev: string, fn: (...a: any[]) => void) { (this.h.get(ev) ?? this.h.set(ev, []).get(ev)!).push(fn); }
  emit(ev: string, ...a: any[]) { for (const fn of this.h.get(ev) ?? []) fn(...a); }
  connect() { return { on() {}, send() {}, open: false }; }
  destroy() { this.destroyed = true; }
}

async function makeService() {
  vi.resetModules();
  vi.doMock('peerjs', () => ({ default: FakePeer, Peer: FakePeer }));
  const mod = await import('$lib/broadcast');
  await import('peerjs');
  return mod;
}
const settle = () => new Promise((r) => setTimeout(r, 25));
/** Longer than `SEND_MIN_INTERVAL_MS` (500), so a CHANGED payload's throttled send actually lands. */
const settleSend = () => new Promise((r) => setTimeout(r, 700));

const T0 = 1_800_000_000_000;
const HOUR = 3_600_000;
const START = T0 + HOUR;
const END = T0 + 11 * HOUR;

function flightCampaign(): Starmap {
  const n = 40;
  const pts: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    pts.push({ x: 1 + 4 * f, y: 1.6 * f * (1 - f), z: 0 });   // a curved haul, not a straight hop
  }
  const seg = (type: string, a: number, b: number, from: number, to: number, dv?: number) => ({
    type, startTime: a, endTime: b,
    ...(dv ? { deltaV_ms: dv, thrustDir: { x: 1, y: 0 } } : {}),
    pathPoints: pts.slice(from, to),
    startState: { r: pts[from] }, endState: { r: pts[to - 1] }
  });
  const ship = {
    id: 'roci', name: 'Rocinante', kind: 'construct', parentId: 'star', flight_state: 'Transit',
    orbit: { hostId: 'star', hostMu: 1.3e20, t0: T0, elements: { a_AU: 1, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } },
    scheduled_journeys: [{ status: 'active', plans: [{ segments: [
      seg('Accel', START, START + HOUR, 0, 12, 5000),
      seg('Coast', START + HOUR, END - HOUR, 11, 30),
      seg('Brake', END - HOUR, END, 29, n, 5000)
    ] }] }],
    vector_position_au: { x: 2.0, y: 0.3 },
    vector_velocity_ms: { x: 14_000, y: 800 },
    vector_epoch_ms: START
  };
  return {
    id: 'map1', name: 'Campaign', distanceUnit: 'ly',
    systems: [{
      id: 'sysA', name: 'A', position: { x: 0, y: 0, z: 0 },
      system: { id: 'sysA', name: 'A', epochT0: T0, nodes: [
        { id: 'star', name: 'Star', kind: 'body', roleHint: 'star', parentId: null, massKg: 2e30, radiusKm: 700000, tags: [] },
        { id: 'world', name: 'World', kind: 'body', parentId: 'star', massKg: 6e24, radiusKm: 6371, tags: [],
          orbit: { hostId: 'star', hostMu: 1.3e20, t0: T0, elements: { a_AU: 1, e: 0.1, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } },
        ship
      ] }
    }],
    routes: []
  } as any;
}

/** What `SystemView`'s reconcile tick does to the GM's own copy as the clock advances. */
function gmReStamp(map: Starmap, atMs: number) {
  const ship: any = (map as any).systems[0].system.nodes.find((n: any) => n.id === 'roci');
  const rs = routeStateAt(routeOf(ship), atMs);
  if (!rs) return;
  ship.vector_position_au = { x: rs.x, y: rs.y };
  ship.vector_velocity_ms = { x: 14_000 - (atMs - START) / 1e6, y: 800 };
  ship.vector_epoch_ms = atMs;
}

describe('G51 acceptance — measured on the wire', () => {
  beforeEach(() => {
    FakeChannel.byName.clear();
    (globalThis as any).window = globalThis;
    (globalThis as any).BroadcastChannel = FakeChannel;
    (globalThis as any).addEventListener ??= () => {};
    (globalThis as any).performance ??= { now: () => Date.now() };
    (globalThis as any).__ssePerf = undefined;
  });
  afterEach(() => { vi.useRealTimers(); });

  /** Drive the GM's two reactive sends the way `+page.svelte` does, over `ticks` clock steps. */
  async function runClock(host: any, map: Starmap, ticks: number, stepMs = 5 * 60_000) {
    for (let i = 0; i < ticks; i++) {
      const at = START + HOUR + i * stepMs;
      gmReStamp(map, at);                         // the GM's own reconcile, every tick
      host.broadcastService.sendIfChanged({ type: 'SYNC_STARMAP', payload: computePlayerStarmapSnapshot(map) });
      host.broadcastService.sendIfChanged({ type: 'SYNC_FLIGHT', payload: buildFlightUpdate(map, at) });
      await settle();
    }
  }

  it('THE ACCEPTANCE: the campaign is sent ONCE while a ship flies, and re-sends are all dedupes', async () => {
    const host = await makeService();
    host.broadcastService.initSender('sess-a');
    const map = flightCampaign();
    // The send throttle judges a big payload on the LAST sent size, so give it real time to work in.
    await runClock(host, map, 12);
    const c = (globalThis as any).__ssePerf?.counters ?? {};
    expect(c['bc.SYNC_STARMAP.sent'], JSON.stringify(c)).toBe(1);
    expect(c['bc.SYNC_STARMAP.unchanged']).toBeGreaterThanOrEqual(10);
  });

  it('the flight message is quiet too while the plan is flown to schedule', async () => {
    const host = await makeService();
    host.broadcastService.initSender('sess-b');
    const map = flightCampaign();
    await runClock(host, map, 12);
    const c = (globalThis as any).__ssePerf?.counters ?? {};
    // One send to establish the plan, then silence: nothing unpredictable is happening.
    expect(c['bc.SYNC_FLIGHT.sent']).toBe(1);
    expect(c['bc.SYNC_FLIGHT.unchanged']).toBeGreaterThanOrEqual(10);
  });

  it('a GM EDIT mid-flight still reaches the player immediately', async () => {
    const host = await makeService();
    host.broadcastService.initSender('sess-c');
    const map = flightCampaign();
    await runClock(host, map, 6);
    const before = ((globalThis as any).__ssePerf?.counters ?? {})['bc.SYNC_STARMAP.sent'];
    // The GM renames a world. Nothing to do with ships; must go out at once.
    (map as any).systems[0].system.nodes[1].name = 'New Earth';
    host.broadcastService.sendIfChanged({ type: 'SYNC_STARMAP', payload: computePlayerStarmapSnapshot(map) });
    await settleSend();
    const after = ((globalThis as any).__ssePerf?.counters ?? {})['bc.SYNC_STARMAP.sent'];
    expect(after).toBe(before + 1);
  });

  it('a REPLAN mid-flight goes out at once, and only on the small message', async () => {
    const host = await makeService();
    host.broadcastService.initSender('sess-d');
    const map = flightCampaign();
    await runClock(host, map, 6);
    const cBefore = { ...((globalThis as any).__ssePerf?.counters ?? {}) };
    // The GM aborts: the journey is cancelled at this instant, so the route truncates there.
    const at = START + 4 * HOUR;
    const ship: any = (map as any).systems[0].system.nodes.find((n: any) => n.id === 'roci');
    ship.scheduled_journeys[0].cancelledAtSec = String(Math.floor(at / 1000));
    ship.scheduled_journeys = [...ship.scheduled_journeys];   // new identity: the plan changed
    host.broadcastService.sendIfChanged({ type: 'SYNC_STARMAP', payload: computePlayerStarmapSnapshot(map) });
    host.broadcastService.sendIfChanged({ type: 'SYNC_FLIGHT', payload: buildFlightUpdate(map, at) });
    await settleSend();
    const cAfter = (globalThis as any).__ssePerf?.counters ?? {};
    expect(cAfter['bc.SYNC_FLIGHT.sent']).toBe(cBefore['bc.SYNC_FLIGHT.sent'] + 1);
    // The campaign has nothing new to say about it — the plan does not live there any more.
    expect(cAfter['bc.SYNC_STARMAP.sent']).toBe(cBefore['bc.SYNC_STARMAP.sent']);
  });

  it('a player RECEIVES the flight message and its ship moves, agreeing with the GM', async () => {
    const host = await makeService();
    const player = await makeService();
    host.broadcastService.initSender('sess-e');
    let received: FlightUpdate | null = null;
    let campaign: Starmap | null = null;
    // The receiver filters on the HOST's session id - that is what `targetId` means.
    player.broadcastService.initReceiver(() => {}, () => {}, () => {}, () => {}, () => {}, () => {}, 'sess-e');
    player.broadcastService.onFlightUpdate = (u: FlightUpdate) => { received = u; };
    player.broadcastService.onStarmapUpdate = (m: Starmap) => { campaign = m; };

    const map = flightCampaign();
    const at = START + 4 * HOUR;
    gmReStamp(map, at);
    // Join burst order: flight FIRST, then the campaign (the owner's Q2 answer).
    host.broadcastService.sendMessage({ type: 'SYNC_FLIGHT', payload: buildFlightUpdate(map, at) });
    host.broadcastService.sendMessage({ type: 'SYNC_STARMAP', payload: computePlayerStarmapSnapshot(map) });
    await settle();

    expect(received).not.toBeNull();
    expect(campaign).not.toBeNull();
    applyFlightUpdate(campaign, received);
    const playerShip: any = (campaign as any).systems[0].system.nodes.find((n: any) => n.id === 'roci');
    const gmShip: any = (map as any).systems[0].system.nodes.find((n: any) => n.id === 'roci');

    // IT MOVES: two different instants give two different places, and they are not the stamp.
    const p1 = routeStateAt(routeOf(playerShip), at)!;
    const p2 = routeStateAt(routeOf(playerShip), at + HOUR)!;
    expect(Math.hypot(p2.x - p1.x, p2.y - p1.y)).toBeGreaterThan(0.01);

    // AND IT AGREES WITH THE GM at the same instant, to the published fit tolerance.
    const g1 = routeStateAt(routeOf(gmShip), at)!;
    expect(p1.x).toBeCloseTo(g1.x, 9);
    expect(p1.y).toBeCloseTo(g1.y, 9);
  });

  it('a JOINER mid-flight is placed correctly, with no history and no catch-up', async () => {
    const map = flightCampaign();
    const at = START + 7 * HOUR;
    gmReStamp(map, at);
    // A window that has seen nothing before this moment: campaign + one flight message.
    const fresh: any = computePlayerStarmapSnapshot(map);
    applyFlightUpdate(fresh, buildFlightUpdate(map, at));
    const joined = fresh.systems[0].system.nodes.find((n: any) => n.id === 'roci');
    const gmShip: any = (map as any).systems[0].system.nodes.find((n: any) => n.id === 'roci');
    const jp = routeStateAt(routeOf(joined), at)!;
    const gp = routeStateAt(routeOf(gmShip), at)!;
    expect(jp.x).toBeCloseTo(gp.x, 9);
    expect(jp.y).toBeCloseTo(gp.y, 9);
    // And it is NOT sitting at its pre-flight parking orbit, which is the B96 failure.
    expect(Math.hypot(jp.x, jp.y)).toBeGreaterThan(1.5);
  });
});
