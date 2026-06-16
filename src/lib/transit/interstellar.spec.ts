import { describe, it, expect } from 'vitest';
import { endJourneyAtSource, endJourneyAtDestination, strandJourney, constructDisplayPlacement, interstellarConstructIds } from './interstellar';
import type { Starmap } from '$lib/types';

function makeStarmap(): Starmap {
  return {
    id: 'm', name: 'Test', systems: [
      {
        id: 'sysA', name: 'Alpha', position: { x: 0, y: 0 },
        system: { id: 'sysA', nodes: [
          { id: 'starA', kind: 'body', roleHint: 'star', name: 'A', parentId: null, classes: ['star/G'], massKg: 2e30 },
          { id: 'ship1', kind: 'construct', roleHint: 'ship', name: 'Wanderer', parentId: 'starA',
            orbit: { hostId: 'starA', hostMu: 1e20, t0: 0, elements: { a_AU: 1, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }, tags: [] }
        ] }
      },
      {
        id: 'sysB', name: 'Beta', position: { x: 100, y: 0 },
        system: { id: 'sysB', nodes: [
          { id: 'starB', kind: 'body', roleHint: 'star', name: 'B', parentId: null, classes: ['star/K'], massKg: 1.6e30 }
        ] }
      }
    ],
    routes: [],
    activeJourneys: [
      { id: 'j1', shipId: 'ship1', shipName: 'Wanderer', fromSystemId: 'sysA', toSystemId: 'sysB', toBodyId: 'starB', toBodyName: 'B', mode: 'torch', startTimeSec: '0', durationSec: 1000 }
    ],
    distanceUnit: 'ly', unitIsPrefix: false
  } as unknown as Starmap;
}
const shipIn = (m: Starmap, sysId: string) => (m.systems.find((s) => s.id === sysId)!.system.nodes as any[]).some((n) => n.id === 'ship1');

describe('interstellarConstructIds (system-view hide / find-by-tag scope)', () => {
  it('flags a ship mid-transit, but not before departure or after arrival', () => {
    const m = makeStarmap();   // j1: depart 0, duration 1000
    expect(interstellarConstructIds(m, -10).has('ship1')).toBe(false);  // before departure → in origin system
    expect(interstellarConstructIds(m, 500).has('ship1')).toBe(true);   // mid-transit → interstellar
    expect(interstellarConstructIds(m, 2000).has('ship1')).toBe(false); // arrived → in destination system
  });
  it('flags a stranded/adrift ship', () => {
    const m = strandJourney(makeStarmap(), 'j1', 0.5, '500');
    expect(interstellarConstructIds(m, 2000).has('ship1')).toBe(true);
  });
});

describe('interstellar journey resolution', () => {
  it('endJourneyAtSource drops the journey and leaves the construct in its origin system', () => {
    const out = endJourneyAtSource(makeStarmap(), 'j1');
    expect(out.activeJourneys).toHaveLength(0);
    expect(shipIn(out, 'sysA')).toBe(true);
    expect(shipIn(out, 'sysB')).toBe(false);
  });

  it('endJourneyAtDestination relocates the construct into the destination system, re-hosted', () => {
    const out = endJourneyAtDestination(makeStarmap(), 'j1');
    expect(out.activeJourneys).toHaveLength(0);
    expect(shipIn(out, 'sysA')).toBe(false);
    expect(shipIn(out, 'sysB')).toBe(true);
    const ship = (out.systems.find((s) => s.id === 'sysB')!.system.nodes as any[]).find((n) => n.id === 'ship1');
    expect(ship.parentId).toBe('starB');
    expect(ship.orbit.hostId).toBe('starB');
    expect(ship.orbit.hostMu).toBeGreaterThan(0);   // recomputed from the new host mass
  });

  it('strandJourney moves the construct adrift at the interpolated interstellar point', () => {
    const out = strandJourney(makeStarmap(), 'j1', 0.25, '500');
    expect(out.activeJourneys).toHaveLength(0);
    expect(shipIn(out, 'sysA')).toBe(false);
    expect(out.adriftConstructs).toHaveLength(1);
    const a = out.adriftConstructs![0];
    expect(a.construct.id).toBe('ship1');
    expect(a.x).toBeCloseTo(25);   // 0 + (100-0)*0.25
    expect(a.y).toBeCloseTo(0);
    expect(a.fromSystemId).toBe('sysA');
    expect(a.toSystemId).toBe('sysB');
  });

  it('unknown journey id is a no-op', () => {
    const m = makeStarmap();
    expect(endJourneyAtDestination(m, 'nope').activeJourneys).toHaveLength(1);
    expect(strandJourney(m, 'nope', 0.5).adriftConstructs ?? []).toHaveLength(0);
  });
});

describe('constructDisplayPlacement (derive-from-clock)', () => {
  // journey j1: sysA(0,0) -> sysB(100,0), start 0, duration 1000.
  it('before start → origin system', () => {
    expect(constructDisplayPlacement(makeStarmap(), 'ship1', -10)).toEqual({ kind: 'system', systemId: 'sysA' });
  });
  it('mid-flight → transit at the interpolated point', () => {
    const p = constructDisplayPlacement(makeStarmap(), 'ship1', 250) as any;
    expect(p.kind).toBe('transit');
    expect(p.frac).toBeCloseTo(0.25);
    expect(p.x).toBeCloseTo(25);
  });
  it('after natural end → destination system (arrive)', () => {
    expect(constructDisplayPlacement(makeStarmap(), 'ship1', 2000)).toEqual({ kind: 'system', systemId: 'sysB' });
  });
  it('outcome=strand with endedAtSec → adrift at that fraction even when scrubbed later', () => {
    const m = makeStarmap();
    m.activeJourneys![0].outcome = 'strand';
    m.activeJourneys![0].endedAtSec = '600';   // 60% along
    const p = constructDisplayPlacement(m, 'ship1', 5000) as any;
    expect(p.kind).toBe('adrift');
    expect(p.x).toBeCloseTo(60);
  });
  it('outcome=return → origin system after it ends', () => {
    const m = makeStarmap();
    m.activeJourneys![0].outcome = 'return';
    expect(constructDisplayPlacement(m, 'ship1', 2000)).toEqual({ kind: 'system', systemId: 'sysA' });
  });
  it('no journey → the system that holds the node', () => {
    expect(constructDisplayPlacement(endJourneyAtSource(makeStarmap(), 'j1'), 'ship1', 999)).toEqual({ kind: 'system', systemId: 'sysA' });
  });
});
