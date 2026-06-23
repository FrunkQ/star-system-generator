import { describe, it, expect } from 'vitest';
import { gatherResourceCandidates, resolveResourceStops } from './autopilotAdapter';

// Minimal system stub — only the fields the resolver reads.
function sys(nodes: any[]) { return { nodes } as any; }
const body = (id: string, roleHint: string, a_AU: number, tags: [string, number?][] = []) =>
  ({ id, kind: 'body', roleHint, orbit: { elements: { a_AU } }, tags: tags.map(([key, value]) => ({ key, value })) });
const ship = (id: string, tags: [string, number?][] = []) =>
  ({ id, kind: 'construct', roleHint: 'ship', tags: tags.map(([key, value]) => ({ key, value })) });

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
