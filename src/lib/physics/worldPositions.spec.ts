import { describe, it, expect } from 'vitest';
import { computeWorldPositions, computeWorldPositions3D } from './worldPositions';
import { propagateState, propagateState3D } from './orbits';

const HOST_MU = 1.32712440018e20;

// Build a tiny system: root star, one planet, one moon of that planet. Optional inclination on
// the planet so we can exercise the 3D lift.
function makeSystem(planetIncDeg = 0) {
  const star = { id: 'star', kind: 'body', parentId: null, orbit: null, physical_parameters: {} };
  const planet = {
    id: 'planet', kind: 'body', parentId: 'star', physical_parameters: {},
    orbit: { hostId: 'star', hostMu: HOST_MU, t0: 0, elements: { a_AU: 1, e: 0.1, i_deg: planetIncDeg, Omega_deg: 0, omega_deg: 20, M0_rad: 0.5 } }
  };
  const moon = {
    id: 'moon', kind: 'body', parentId: 'planet', physical_parameters: {},
    orbit: { hostId: 'planet', hostMu: 5e12, t0: 0, elements: { a_AU: 0.002, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 1.2 } }
  };
  return { nodes: [star, planet, moon] } as any;
}

describe('computeWorldPositions (2D)', () => {
  it('places the root star at the origin', () => {
    const pos = computeWorldPositions(makeSystem(), 3e8);
    expect(pos.get('star')).toEqual({ x: 0, y: 0 });
  });

  it('accumulates a moon = parent planet position + its own propagated offset', () => {
    const sys = makeSystem();
    const t = 4.2e8;
    const pos = computeWorldPositions(sys, t);
    const planet = sys.nodes[1];
    const moon = sys.nodes[2];
    // Oracle: same maths, done by hand from the propagator.
    const planetR = propagateState(planet, t).r;
    const moonRel = propagateState(moon, t).r;
    const p = pos.get('planet')!;
    const m = pos.get('moon')!;
    expect(p.x).toBeCloseTo(planetR.x, 12);
    expect(p.y).toBeCloseTo(planetR.y, 12);
    expect(m.x).toBeCloseTo(planetR.x + moonRel.x, 12);
    expect(m.y).toBeCloseTo(planetR.y + moonRel.y, 12);
  });

  it('uses the injected construct sampler for a scheduled construct (absolute placement)', () => {
    const sys = {
      nodes: [
        { id: 'star', kind: 'body', parentId: null, orbit: null, physical_parameters: {} },
        { id: 'ship', kind: 'construct', parentId: 'star', physical_parameters: { massKg: 1000 }, scheduled_journeys: [{ plans: [] }] }
      ]
    } as any;
    const sampler = () => ({ position_au: { x: 3.5, y: -1.25 } });
    const pos = computeWorldPositions(sys, 1e9, sampler);
    expect(pos.get('ship')).toEqual({ x: 3.5, y: -1.25 });
  });
});

describe('computeWorldPositions3D', () => {
  it('matches the 2D positions with z=0 for a coplanar system', () => {
    const sys = makeSystem(0);
    const t = 7e8;
    const p2 = computeWorldPositions(sys, t);
    const p3 = computeWorldPositions3D(sys, t);
    for (const id of ['star', 'planet', 'moon']) {
      const a = p2.get(id)!;
      const b = p3.get(id)!;
      expect(b.x).toBeCloseTo(a.x, 12);
      expect(b.y).toBeCloseTo(a.y, 12);
      expect(b.z).toBeCloseTo(0, 12);
    }
  });

  it('lifts an inclined planet out of the reference plane (z != 0)', () => {
    const sys = makeSystem(35);
    const t = 6e8;
    const p3 = computeWorldPositions3D(sys, t);
    const planet = p3.get('planet')!;
    const oracle = propagateState3D(sys.nodes[1], t).r;
    expect(planet.z).toBeCloseTo(oracle.z, 12);
    expect(Math.abs(planet.z)).toBeGreaterThan(1e-3);
    // The moon inherits its parent's out-of-plane offset (parent z + in-plane moon has z ~ parent z).
    const moon = p3.get('moon')!;
    expect(moon.z).toBeCloseTo(oracle.z, 4);
  });
});
