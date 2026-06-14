import { describe, it, expect } from 'vitest';
import { endJourneyAtSource, endJourneyAtDestination, strandJourney } from './interstellar';
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
