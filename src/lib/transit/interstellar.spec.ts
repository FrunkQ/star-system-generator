import { describe, it, expect } from 'vitest';
import { endJourneyAtSource, endJourneyAtDestination, strandJourney, constructDisplayPlacement, interstellarConstructIds, flybyTurn } from './interstellar';
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

describe('ballistic adrift drift (Stage 1)', () => {
  it('a momentum-drive (torch) strand coasts in a straight line; position grows with the clock', () => {
    // j1: torch mode, sysA(0,0)→sysB(100,0), depart 0, duration 1000 → velocity 0.1 units/sec
    const m = strandJourney(makeStarmap(), 'j1', 0.5, '500');   // stranded at frac 0.5 → x=50, t0=500
    const p1 = constructDisplayPlacement(m, 'ship1', 500);
    const p2 = constructDisplayPlacement(m, 'ship1', 1500);     // +1000 s
    expect(p1.kind).toBe('adrift');
    if (p1.kind === 'adrift' && p2.kind === 'adrift') {
      expect(p1.x).toBeCloseTo(50);
      expect(p2.x).toBeCloseTo(150);          // coasted 100 units in 1000 s (0.1 u/s)
      expect(p2.y).toBeCloseTo(0);            // straight line along the leg
      expect(p1.vx).toBeCloseTo(0.1);
    }
    // deterministic / reversible: same T → same point
    const again = constructDisplayPlacement(m, 'ship1', 1500);
    if (again.kind === 'adrift' && p2.kind === 'adrift') expect(again.x).toBeCloseTo(p2.x);
  });

  it('a jump strand is stationary (no drift)', () => {
    const base = makeStarmap();
    (base.activeJourneys as any)[0].mode = 'jump';
    const m = strandJourney(base, 'j1', 0.5, '500');
    const p1 = constructDisplayPlacement(m, 'ship1', 500);
    const p2 = constructDisplayPlacement(m, 'ship1', 9999);
    if (p1.kind === 'adrift' && p2.kind === 'adrift') {
      expect(p2.x).toBeCloseTo(p1.x);   // unmoved
      expect(p2.vx ?? 0).toBe(0);
    }
  });
});

describe('realistic "cannot stop" fly-by (Stage-1 integration)', () => {
  it('reaches the destination then coasts on past it as adrift-with-velocity', () => {
    const m = makeStarmap();   // sysA(0,0)→sysB(100,0), depart 0, dur 1000
    (m.activeJourneys as any)[0].cannotStop = true;
    const atArrival = constructDisplayPlacement(m, 'ship1', 1000);   // natural end
    const later = constructDisplayPlacement(m, 'ship1', 2000);       // +1000 s past
    expect(atArrival.kind).toBe('adrift');
    if (atArrival.kind === 'adrift' && later.kind === 'adrift') {
      expect(atArrival.x).toBeCloseTo(100);   // at the destination at end
      expect(later.x).toBeCloseTo(200);       // coasted on past it
      expect(atArrival.vx).toBeCloseTo(0.1);
    }
  });
  it('a GM-forced arrival overrides the fly-by and stops at the destination', () => {
    const m = makeStarmap();
    (m.activeJourneys as any)[0].cannotStop = true;
    (m.activeJourneys as any)[0].outcome = 'arrive';
    expect(constructDisplayPlacement(m, 'ship1', 2000)).toEqual({ kind: 'system', systemId: 'sysB' });
  });
});

describe('flybyTurn — interstellar slingshot (Stage 3, honest 2-body deflection)', () => {
  // 4 ly between stars; the fly-by aims at a planet 1 AU out around a ~1-solar-mass star. Duration sets
  // the cruise speed, which sets how hard the star bends the onward drift.
  const LY_M = 9.4607e15, AU_M = 1.495978707e11;
  function flybyMap(durationSec: number, aAU = 1, massKg = 2e30) {
    const distLy = 4;
    return {
      id: 'm', name: 'T',
      systems: [
        { id: 'A', name: 'A', position: { x: 0, y: 0 }, system: { id: 'A', nodes: [] } },
        { id: 'B', name: 'B', position: { x: distLy, y: 0 }, system: { id: 'B', nodes: [
          { id: 'starB', kind: 'body', roleHint: 'star', classes: ['star/G'], massKg },
          { id: 'pB', kind: 'body', roleHint: 'planet', orbit: { elements: { a_AU: aAU } } }
        ] } }
      ],
      routes: [],
      activeJourneys: [{ id: 'j', shipId: 'ship', fromSystemId: 'A', toSystemId: 'B', toBodyId: 'pB', mode: 'torch', startTimeSec: '0', durationSec, cannotStop: true }],
      distanceUnit: 'ly', unitIsPrefix: false
    } as unknown as Starmap;
  }
  const turnOf = (m: Starmap) => Math.abs(flybyTurn(m, (m.activeJourneys as any)[0], { x: 0, y: 0 }, { x: 4, y: 0 }));

  it('a slow pass (~30 km/s, near orbital speed) bends hard around the star', () => {
    const dur = (4 * LY_M) / 3e4; // 30 km/s
    expect(turnOf(flybyMap(dur))).toBeGreaterThan(0.3); // tens of degrees
  });
  it('a relativistic pass (~0.1c) is too fast to bend — honest physics, no exaggeration', () => {
    const dur = (4 * LY_M) / 3e7; // 0.1c
    expect(turnOf(flybyMap(dur))).toBeLessThan(0.01);
  });
  it('a black-hole-mass attractor bends even a relativistic pass visibly', () => {
    const dur = (4 * LY_M) / 3e7; // 0.1c
    expect(turnOf(flybyMap(dur, 1, 2e30 * 1e7))).toBeGreaterThan(0.1); // 10^7 solar masses
  });
  it('a deep-space point target has no star to wrap → no deflection', () => {
    const m = flybyMap((4 * LY_M) / 3e4);
    (m.activeJourneys as any)[0].toX = 2; (m.activeJourneys as any)[0].toY = 0;
    expect(turnOf(m)).toBe(0);
  });
});

describe('point-destination journeys (Stage 2 — fly to a spot, e.g. a stranded ship)', () => {
  it('transits toward the point and rendezvouses (adrift) there on arrival', () => {
    const m = makeStarmap();   // sysA(0,0), dur 1000
    (m.activeJourneys as any)[0].toX = 50;
    (m.activeJourneys as any)[0].toY = 30;
    const mid = constructDisplayPlacement(m, 'ship1', 500);    // frac 0.5 from (0,0) → (50,30)
    const arrived = constructDisplayPlacement(m, 'ship1', 2000);
    expect(mid.kind).toBe('transit');
    if (mid.kind === 'transit') { expect(mid.x).toBeCloseTo(25); expect(mid.y).toBeCloseTo(15); }
    expect(arrived.kind).toBe('adrift');   // sits at the rendezvous point, not "in a system"
    if (arrived.kind === 'adrift') { expect(arrived.x).toBeCloseTo(50); expect(arrived.y).toBeCloseTo(30); }
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
  it('outcome=strand: a jump-drive abort stays fixed at that fraction even when scrubbed later', () => {
    const m = makeStarmap();
    m.activeJourneys![0].mode = 'jump';
    m.activeJourneys![0].outcome = 'strand';
    m.activeJourneys![0].endedAtSec = '600';   // 60% along
    const p = constructDisplayPlacement(m, 'ship1', 5000) as any;
    expect(p.kind).toBe('adrift');
    expect(p.x).toBeCloseTo(60);               // stationary — no drift
  });
  it('outcome=strand: a momentum drive (torch) coasts on past the strand point', () => {
    const m = makeStarmap();                   // torch mode, 100 units over 1000 s → 0.1 u/s
    m.activeJourneys![0].outcome = 'strand';
    m.activeJourneys![0].endedAtSec = '600';   // strands at x=60
    const p = constructDisplayPlacement(m, 'ship1', 1600) as any;   // +1000 s
    expect(p.kind).toBe('adrift');
    expect(p.x).toBeCloseTo(160);              // drifted another 100 units along the heading
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
