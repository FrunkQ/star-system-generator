import { describe, it, expect } from 'vitest';
import { gatherResourceCandidates, resolveResourceStops, buildAdapterStops, AUTOPILOT_PROFILES, profileIndexForDrive } from './autopilotAdapter';

// Minimal system stub — only the fields the resolver reads.
function sys(nodes: any[]) { return { nodes } as any; }
const body = (id: string, roleHint: string, a_AU: number, tags: [string, number?][] = []) =>
  ({ id, kind: 'body', roleHint, orbit: { elements: { a_AU } }, tags: tags.map(([key, value]) => ({ key, value })) });
const ship = (id: string, tags: [string, number?][] = []) =>
  ({ id, kind: 'construct', roleHint: 'ship', tags: tags.map(([key, value]) => ({ key, value })) });

describe('burn profile — a straight tie to the Drive slider', () => {
  it('efficiency end coasts long, speed end burns continuously', () => {
    expect(AUTOPILOT_PROFILES[profileIndexForDrive(0)]).toEqual({ accel: 0.2, brake: 0.2 }); // 20/60/20
    expect(profileIndexForDrive(0.34)).toBe(1);                                              // 30/40/30
    expect(profileIndexForDrive(0.5)).toBe(2);  // rounds to the speedier middle, matching driveFast >= 0.5
    expect(AUTOPILOT_PROFILES[profileIndexForDrive(1)]).toEqual({ accel: 0.5, brake: 0.5 }); // 50/0/50 — no coast
  });

  it('clamps out-of-range and defaults garbage to the balanced default', () => {
    expect(profileIndexForDrive(-1)).toBe(0);
    expect(profileIndexForDrive(2)).toBe(AUTOPILOT_PROFILES.length - 1);
    expect(profileIndexForDrive(NaN)).toBe(2); // treated as drive 0.5
  });
});

describe('gatherResourceCandidates — mine-bodies-only', () => {
  const system = sys([
    body('star', 'star', 0),
    body('enceladus', 'moon', 9.4, [['resource/water-ice', 0.9]]),
    body('tethys', 'moon', 9.6, [['resource/water-ice', 0.6]]),
    body('saturn', 'planet', 9.5, [['frontier/gas-skimming']]),      // refuel, not water-ice cargo
    body('mars', 'planet', 1.5, [['resource/heavy-metals', 0.7]]),    // wrong resource
    ship('tanker', [['resource/water-ice', 1]])                        // a SHIP carrying ice — must NOT be a candidate
  ]);

  it('finds bodies carrying the resource, excludes ships and non-matching bodies', () => {
    const c = gatherResourceCandidates(system, ['resource/water-ice'], 'star', new Set());
    expect(c.map((x) => x.id).sort()).toEqual(['enceladus', 'tethys']); // not saturn, mars, or the tanker
  });

  it('marks a candidate refuels=true when it carries a fuel-source the ship uses', () => {
    const c = gatherResourceCandidates(system, ['resource/water-ice'], 'star', new Set(['resource/water-ice']));
    expect(c.every((x) => x.refuels)).toBe(true);
  });

  it('explore with no resourceKeys matches any body carrying a resource/* tag', () => {
    const c = gatherResourceCandidates(system, [], 'star', new Set());
    expect(c.map((x) => x.id).sort()).toEqual(['enceladus', 'mars', 'tethys']);
  });
});

describe('resolveResourceStops', () => {
  const system = sys([
    body('star', 'star', 0),
    body('rich-near', 'moon', 9.4, [['resource/water-ice', 0.9]]),
    body('poor-far', 'moon', 14, [['resource/water-ice', 0.3]])
  ]);
  const noFuel = () => false;

  it('mine picks the best source and appends a deliver-to stop', () => {
    const leg = { action: 'mine', resourceKeys: ['resource/water-ice'], rate_tpd: 10, fillAmount_t: 100, deliverTo: { placeId: 'ceres' } };
    const stops = resolveResourceStops(leg, 'star', system, noFuel, new Set(), false);
    expect(stops.map((s) => [s.targetId, s.verb])).toEqual([['rich-near', 'mine'], ['ceres', 'unload']]);
    // dwell scales with source richness: 100 t ÷ (10 t/day × 0.9 abundance) ≈ 11.1 days; the richness is
    // carried on the stop so the adapter can re-size the dwell once the haul amount is finalised.
    expect(stops[0].dwellDays).toBeCloseTo(100 / (10 * 0.9), 3);
    expect(stops[0].abundance).toBe(0.9);
    expect(stops[0].rate_tpd).toBe(10);
  });

  it('mine self-fuels at the source when the ore is fuel-grade', () => {
    const leg = { action: 'mine', resourceKeys: ['resource/water-ice'], rate_tpd: 10, fillAmount_t: 50 };
    const isFuel = (k: string) => k === 'resource/water-ice';
    const stops = resolveResourceStops(leg, 'star', system, isFuel, new Set(), false);
    expect(stops[0].refuelHere).toBe(true);
  });

  it('explore yields one loiter stop at a sought source', () => {
    const leg = { action: 'explore', resourceKeys: ['resource/water-ice'], loiterDays: 20 };
    const stops = resolveResourceStops(leg, 'star', system, noFuel, new Set(), false);
    expect(stops).toHaveLength(1);
    expect(stops[0].verb).toBe('explore');
    expect(stops[0].dwellDays).toBe(20);
  });

  it('returns [] when nothing carries the resource', () => {
    const stops = resolveResourceStops({ action: 'mine', resourceKeys: ['resource/unobtainium'] }, 'star', system, noFuel, new Set(), false);
    expect(stops).toEqual([]);
  });
});

describe('buildAdapterStops — Avoid list + explore noRevisit', () => {
  const system = sys([
    body('star', 'star', 0),
    body('near', 'moon', 9.4, [['resource/water-ice', 0.9]]),
    body('far', 'moon', 14, [['resource/water-ice', 0.8]])
  ]);
  const mine = { action: 'mine', resourceKeys: ['resource/water-ice'], rate_tpd: 10, fillAmount_t: 50 };

  it('an avoided place is never auto-chosen as a resource source', () => {
    const stops = buildAdapterStops([mine], 'star', system, () => false, new Set(), false, 0, new Set(['near']));
    expect(stops[0].targetId).toBe('far'); // best source was near, but it's on the avoid list
  });

  it("explore with noRevisit skips places already in the ship's log — the survey pushes outward", () => {
    const explore = { action: 'explore', resourceKeys: ['resource/water-ice'], loiterDays: 10, noRevisit: true };
    const stops = buildAdapterStops([explore], 'star', system, () => false, new Set(), false, 0, undefined, new Set(['near']));
    expect(stops[0].targetId).toBe('far'); // 'near' already visited → next source out
  });

  it('without noRevisit the visited set is ignored', () => {
    const explore = { action: 'explore', resourceKeys: ['resource/water-ice'], loiterDays: 10, noRevisit: false };
    const stops = buildAdapterStops([explore], 'star', system, () => false, new Set(), false, 0, undefined, new Set(['near']));
    expect(stops[0].targetId).toBe('near');
  });
});

describe('buildAdapterStops — escort follows a moving construct', () => {
  it("rendezvous at the escorted ship's current host (re-resolved as it moves)", () => {
    const system = sys([
      body('mars', 'planet', 1.5),
      { id: 'escortee', kind: 'construct', parentId: 'mars' } // no journeys → current host is its parent
    ]);
    const stops = buildAdapterStops([{ action: 'escort', placeId: 'escortee', loiterDays: 7 }], 'earth', system, () => false, new Set(), false, 0);
    expect(stops).toHaveLength(1);
    expect(stops[0].targetId).toBe('mars'); // go to where the escorted ship is
    expect(stops[0].dwellDays).toBe(7);
  });

  it('yields no stop when the escort target is missing', () => {
    const stops = buildAdapterStops([{ action: 'escort', placeId: 'ghost' }], 'earth', sys([]), () => false, new Set(), false, 0);
    expect(stops).toHaveLength(0);
  });
});
