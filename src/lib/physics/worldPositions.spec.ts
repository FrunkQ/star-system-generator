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

// C9. A regular satellite's elements are quoted in its PARENT'S EQUATOR, not in the system plane —
// see `system/satelliteFrame.ts` for the physics. That correction used to live only in the holo
// renderer, so anything else reading the propagator (the eclipse search first) got the wrong plane
// for any satellite of a tilted host. It is applied here now, so these are its pins.
describe('computeWorldPositions3D — the satellite reference frame', () => {
  const tilted = (tiltDeg: number, moonFrame?: string) => {
    const sys = makeSystem(0);
    sys.nodes[1].axial_tilt_deg = tiltDeg;
    if (moonFrame) sys.nodes[2].orbit.frame = moonFrame;
    return sys;
  };
  /** The moon's offset from its planet — which is what the frame acts on. */
  const rel = (sys: any, t: number) => {
    const p = computeWorldPositions3D(sys, t);
    const m = p.get('moon')!, h = p.get('planet')!;
    return { x: m.x - h.x, y: m.y - h.y, z: m.z - h.z };
  };

  it("rotates a moon into a leaning parent's equator", () => {
    const t = 5e8;
    const flat = rel(makeSystem(0), t);
    const leaning = rel(tilted(40), t);
    // The moon's own orbit is i_deg 0, so with an upright parent it stays in the reference plane and
    // with a parent leaning 40 deg it leans 40 deg with it.
    const tiltOf = (r: { x: number; y: number; z: number }) =>
      Math.asin(Math.abs(r.z) / Math.hypot(r.x, r.y, r.z)) * 180 / Math.PI;
    expect(tiltOf(flat)).toBeCloseTo(0, 9);
    // One sample is a point on the orbit, not the whole plane, so it only reaches 40 deg where the
    // orbit crosses the tilt axis — but it must have LEFT the plane, and by a lot.
    expect(tiltOf(leaning)).toBeGreaterThan(5);
    // A rotation moves a point; it does not stretch it. The distance to the parent is untouched.
    expect(Math.hypot(leaning.x, leaning.y, leaning.z)).toBeCloseTo(Math.hypot(flat.x, flat.y, flat.z), 12);
  });

  it("honours `orbit.frame: 'ecliptic'` — a distant moon follows the system plane, not the equator", () => {
    // Beyond roughly the Laplace radius the star's tide beats the parent's bulge, which is why Luna's
    // 5.145 deg is quoted to the ecliptic. Such an orbit declares itself and must not be rotated.
    const t = 5e8;
    const a = rel(tilted(40, 'ecliptic'), t);
    const b = rel(makeSystem(0), t);
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(1e-15);
  });

  it('never rotates a PLANET, however much its star leans', () => {
    // A planet's inclination is already system-framed. The gate is the parent, not the child.
    const t = 5e8;
    const sys = makeSystem(35);
    sys.nodes[0].axial_tilt_deg = 60;
    const withTilt = computeWorldPositions3D(sys, t).get('planet')!;
    const oracle = propagateState3D(sys.nodes[1], t).r;
    expect(withTilt.x).toBeCloseTo(oracle.x, 12);
    expect(withTilt.y).toBeCloseTo(oracle.y, 12);
    expect(withTilt.z).toBeCloseTo(oracle.z, 12);
  });

  it('leaves the flat (2D) orrery walk alone — it is the plan view, with no axis to tilt into', () => {
    const t = 5e8;
    const a = computeWorldPositions(tilted(40), t).get('moon')!;
    const b = computeWorldPositions(makeSystem(0), t).get('moon')!;
    expect(a).toEqual(b);
  });
});

// A construct under way is placed by the GM's STAMPED VECTOR, not by the orbit it left. The guard
// used to require `scheduled_journeys`, which `slimNode` deletes from every player snapshot - so on
// a player the vector was unreachable and a ship in transit drew at its parked position while the
// GM showed it out in space. These pin the redaction shape, not just the maths: the player fixture
// is deliberately the one with no journeys.
describe('a construct with a stamped vector position', () => {
  const parked = {
    id: 'ship', kind: 'construct', parentId: 'planet', physical_parameters: { massKg: 1e6 },
    orbit: { hostId: 'planet', hostMu: 5e12, t0: 0, elements: { a_AU: 0.001, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0 } }
  };
  const withShip = (extra: any) => {
    const sys = makeSystem();
    sys.nodes.push({ ...parked, ...extra });
    return sys;
  };

  it('uses the vector on a PLAYER snapshot, where the journeys have been stripped', () => {
    const t = 4.2e8;
    const sys = withShip({ vector_position_au: { x: 7, y: -3 } });
    const p = computeWorldPositions3D(sys, t).get('ship')!;
    expect(p).toEqual({ x: 7, y: -3, z: 0 });
    // ...and emphatically NOT its parked orbit, which is what it fell back to before.
    const orbital = computeWorldPositions3D(withShip({}), t).get('ship')!;
    expect(Math.hypot(p.x - orbital.x, p.y - orbital.y)).toBeGreaterThan(1);
  });

  it('uses it on the GM too, where the journeys are present but no sampler is passed', () => {
    // This is exactly how the holo calls it: computeWorldPositions3D(system, timeMs), no sampler.
    const sys = withShip({ vector_position_au: { x: 7, y: -3 }, scheduled_journeys: [{ plans: [] }] });
    expect(computeWorldPositions3D(sys, 4.2e8).get('ship')!).toEqual({ x: 7, y: -3, z: 0 });
  });

  it('falls back to its orbit once the vector is cleared, so a parked ship parks', () => {
    const t = 4.2e8;
    const sys = withShip({});
    const p = computeWorldPositions3D(sys, t).get('ship')!;
    const planet = computeWorldPositions3D(sys, t).get('planet')!;
    expect(Math.hypot(p.x - planet.x, p.y - planet.y)).toBeCloseTo(0.001, 6);
  });

  it('keeps the flat orrery walk in step with the 3D one', () => {
    const sys = withShip({ vector_position_au: { x: 7, y: -3 } });
    expect(computeWorldPositions(sys, 4.2e8).get('ship')!).toEqual({ x: 7, y: -3 });
  });
});

// The sampler gate (P3c follow-GM). The sampler is consulted when the node carries EITHER
// description of its course - the GM's journeys or a player's compact route - and which sampler (or
// none) is the CALLER'S policy. These pin the gate itself; the route sampler's maths is pinned in
// shipRoute.spec.ts (routeStateAt).
describe('the construct sampler gate', () => {
  const routeNode = {
    id: 'ship', kind: 'construct', parentId: 'planet', physical_parameters: { massKg: 1e6 },
    route: { s: 0, e: 1000, p: [{ t: 0, x: 3, y: 0, z: 0 }, { t: 1000, x: 4, y: 0, z: 0 }] },
    vector_position_au: { x: 3.5, y: 0 }
  };
  const withNode = (n: any) => {
    const sys = makeSystem();
    sys.nodes.push(n);
    return sys;
  };

  it('consults the sampler for a route-only node - the player case the journeys gate starved', () => {
    const sys = withNode(routeNode);
    const p = computeWorldPositions3D(sys, 500, () => ({ position_au: { x: 9, y: 9 } })).get('ship')!;
    expect(p).toEqual({ x: 9, y: 9, z: 0 });
  });

  it('falls back to the stamped vector when NO sampler is passed - the free-scrub case', () => {
    const sys = withNode(routeNode);
    expect(computeWorldPositions3D(sys, 500).get('ship')!).toEqual({ x: 3.5, y: 0, z: 0 });
  });

  it('falls back to the stamped vector when the sampler answers null (outside the window)', () => {
    const sys = withNode(routeNode);
    expect(computeWorldPositions3D(sys, 500, () => null).get('ship')!).toEqual({ x: 3.5, y: 0, z: 0 });
  });

  it('never consults the sampler for a construct with neither journeys nor route', () => {
    let asked = 0;
    const sys = withNode({ id: 'ship', kind: 'construct', parentId: 'planet', physical_parameters: { massKg: 1e6 }, vector_position_au: { x: 7, y: -3 } });
    computeWorldPositions3D(sys, 500, () => { asked++; return { position_au: { x: 9, y: 9 } }; });
    expect(asked).toBe(0);
  });
});
