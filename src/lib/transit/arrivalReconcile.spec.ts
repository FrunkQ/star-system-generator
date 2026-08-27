// HEALING AN ARRIVED SHIP IS THE ONE FIX FOR FOUR SYMPTOMS.
//
// `reconcileConstructArrival` rewrites a construct's `parentId` and `orbit` to the host its journey
// actually reached. What this spec pins is the CONSEQUENCE, which is bigger than it looks: once healed,
// a parked ship is an ordinary Keplerian orbiter, and a player holding nothing but the node can place
// it correctly AT ANY CLOCK - a year adrift included. No journeys, no stamped vector, no compact
// parked descriptor needed.
//
// Owner, 2026-08-27, arriving at this himself: *"That fix may also fix the ship appearing to orbit
// Earth once done... letting the players have their clock back."* It does, and this measures it.
//
// THE FOUR SYMPTOMS, all from one stale node:
//   1. the ship is frozen on a player view ([[B96]])
//   2. the panel says host Earth beside an orbital period of 5.33 YEARS - the old Sol orbit
//   3. the body picker says 'orbits Sol' while the panel says 'Earth: Far Orbit'
//   4. players must be locked to the GM's clock for a ship to look right
//
// AND WHY IT USED TO BE THE NORMAL STATE RATHER THAN AN EDGE CASE: reconcile keyed off ACTUAL time
// (`masterTimeSec`), which is written ONLY by the Settings time-shift control. Playing or scrubbing
// the clock moves `displayTimeSec` and never touches it - so in ordinary play the heal never fired.
// SETTLED by the owner on 2026-08-27: *"Display Time is our main 't' for player/GM visualisation."*
// The heal now reads the display clock, and the second half of this file is the gate on that - each
// fault measured by reinstating it, so the assertions cannot pass for the wrong reason.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { reconcileConstructArrival, resolveConstructCurrentHostId, getJourneyBounds,
  sampleJourneyKinematicsAtTime, needsStampedPosition } from './scheduler';
import { getGlobalState } from './physics';
import { routeOf, routeStateAt } from '../constructs/shipRoute';
import { computeWorldPositions3D } from '../physics/worldPositions';
import { compactRoute } from '../constructs/shipRoute';

const AU_KM = 1.495978707e8;
const base = JSON.parse(fs.readFileSync(path.resolve('static/examples/Sol_Expanse-System.json'), 'utf-8'));

const ROCI: any = {
  kind: 'construct', roleHint: 'ship', id: 'sol-rocinante', parentId: 'solar-system-sun',
  name: 'Rocinante', tags: [],
  orbit: {
    hostId: 'solar-system-sun', hostMu: 132751826999999990000, t0: 1762339146908,
    elements: { a_AU: 3.05, e: 0.08, i_deg: 0, omega_deg: 24.9, Omega_deg: 83.2, M0_rad: 0.3157 }
  },
  scheduled_journeys: [{
    id: 'j', createdAtSec: '1767250575', status: 'completed',
    plans: [{
      id: 'p', originId: 'sol-rocinante', targetId: 'solar-system-earth',
      startTime: 1767250575000, mode: 'Economy', arrivalPlacement: 'lo',
      interceptSpeed_ms: 0, totalTime_days: 242.97, isValid: true,
      segments: [
        { id: 'a', type: 'Accel', startTime: 1767250575000, endTime: 1767252127873,
          startState: { r: { x: -2.2236, y: 1.7679, z: 0 }, v: { x: 0, y: 0 } },
          endState: { r: { x: -2.2236, y: 1.7678, z: 0 }, v: { x: 0, y: 0 } },
          hostId: 'solar-system-sun',
          pathPoints: [{ x: -2.2236, y: 1.7679, z: 0 }, { x: -2.2236, y: 1.7678, z: 0 }],
          pathTimes: [1767250575000, 1767252127873], warnings: [], fuelUsed_kg: 0 },
        { id: 'b', type: 'Brake', startTime: 1788241008413, endTime: 1788243433537,
          startState: { r: { x: -0.96357, y: 0.32333, z: 0 }, v: { x: 0, y: 0 } },
          endState: { r: { x: -0.96312, y: 0.32302, z: 0 }, v: { x: 0, y: 0 } },
          hostId: 'solar-system-sun',
          pathPoints: [{ x: -0.96357, y: 0.32333, z: 0 }, { x: -0.96312, y: 0.32302, z: 0 }],
          pathTimes: [1788241008413, 1788243433537], warnings: [], fuelUsed_kg: 0 }
      ]
    }]
  }],
  vector_position_au: { x: 0.2623539745752312, y: 0.9600935794339746 },
  vector_velocity_ms: { x: -36409.7, y: 9793.3 },
  vector_epoch_ms: 1843648394000,
  flight_state: 'Orbiting'
};

const ARRIVAL = 1788243433537;
const AFTER = 1843648394000;   // the owner's display time, well past the arrival
const km = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)) * AU_KM;

function sys() {
  const s = JSON.parse(JSON.stringify(base));
  s.nodes = s.nodes.filter((n: any) => n.kind !== 'construct');
  s.nodes.push(JSON.parse(JSON.stringify(ROCI)));
  return s;
}
/** slimNode, for a player. */
function slim(n: any) {
  const o = JSON.parse(JSON.stringify(n));
  const r = compactRoute(o);
  if (r) o.route = r;
  delete o.scheduled_journeys;
  return o;
}

describe('a healed arrival is an ordinary orbiter, and the player can follow it on any clock', () => {
  it('reconcile re-parents, re-orbits, and frees the clock', () => {
    const s = sys();
    const roci = s.nodes.find((n: any) => n.id === 'sol-rocinante');

    console.log('--- BEFORE (as saved) ---');
    console.log('parentId        :', roci.parentId);
    console.log('orbit.hostId    :', roci.orbit.hostId, ' a_AU:', roci.orbit.elements.a_AU);
    console.log('panel resolver  :', resolveConstructCurrentHostId(roci, AFTER));

    // Does reconcile fire once ACTUAL time is past the arrival?
    const healed = reconcileConstructArrival(s, roci, AFTER);
    console.log('--- AFTER reconcile at actual time past arrival ---');
    console.log('changed?        :', healed !== roci);
    console.log('parentId        :', healed.parentId);
    console.log('orbit.hostId    :', healed.orbit?.hostId, ' a_AU:', healed.orbit?.elements?.a_AU);
    const aKm = (healed.orbit?.elements?.a_AU ?? 0) * AU_KM;
    console.log('orbit radius    :', aKm.toFixed(0), 'km');
    const n = healed.orbit?.n_rad_per_s;
    if (n) console.log('period          :', (2 * Math.PI / n / 3600).toFixed(2), 'hours');
    console.log('placement       :', (healed as any).placement);

    // Now: does a PLAYER — node only, no journeys — see it orbiting Earth, and MOVING?
    const ps = sys();
    const i = ps.nodes.findIndex((n2: any) => n2.id === 'sol-rocinante');
    ps.nodes[i] = slim(healed);
    delete ps.nodes[i].vector_position_au;   // reconcile's companion clears this when a ship parks
    delete ps.nodes[i].vector_epoch_ms;

    const p0 = computeWorldPositions3D(ps, AFTER)!.get('sol-rocinante')!;
    const p1 = computeWorldPositions3D(ps, AFTER + 3600_000)!.get('sol-rocinante')!;
    const e0 = computeWorldPositions3D(ps, AFTER)!.get('solar-system-earth')!;
    const e1 = computeWorldPositions3D(ps, AFTER + 3600_000)!.get('solar-system-earth')!;
    console.log('--- PLAYER, reading the healed node only ---');
    console.log('moved in an hour:', km(p0, p1).toFixed(0), 'km');
    console.log('dist to Earth t0:', km(p0, e0).toFixed(0), 'km');
    console.log('dist to Earth t1:', km(p1, e1).toFixed(0), 'km');

    // ...and on a FREE clock, a year adrift — the mess-about mode.
    const F = AFTER + 365 * 86400000;
    const pf = computeWorldPositions3D(ps, F)!.get('sol-rocinante')!;
    const ef = computeWorldPositions3D(ps, F)!.get('solar-system-earth')!;
    console.log('free clock +1yr, dist to Earth:', km(pf, ef).toFixed(0), 'km');

    // --- THE HEAL ITSELF
    expect(healed).not.toBe(roci);
    expect(healed.parentId).toBe('solar-system-earth');
    expect(healed.orbit?.hostId).toBe('solar-system-earth');
    // A real low Earth orbit, not the 3.05 AU heliocentric one it was saved with. The panel's
    // '5.33 y' beside 'Earth: Far Orbit' was that stale figure showing through.
    expect(aKm).toBeGreaterThan(6000);
    expect(aKm).toBeLessThan(20000);
    const hours = n ? (2 * Math.PI) / n / 3600 : 0;
    expect(hours).toBeGreaterThan(1);
    expect(hours).toBeLessThan(6);

    // --- WHAT IT BUYS THE PLAYER, which is the point
    // It MOVES, from the node alone - no journeys, no stamped vector.
    expect(km(p0, p1)).toBeGreaterThan(10_000);
    // ...and it stays in its orbit rather than drifting away from the world.
    expect(km(p0, e0)).toBeLessThan(20_000);
    expect(km(p1, e1)).toBeLessThan(20_000);
    // THE ONE THAT MATTERS: a free clock a YEAR adrift still finds it in orbit. A Keplerian orbiter
    // is correct at any time, so the clock lock stops being a matter of correctness at all.
    expect(km(pf, ef)).toBeLessThan(20_000);
  });
});

// ============================================================================================
// THE GATE. Everything above measures what healing BUYS. What follows measures that it actually
// HAPPENS in ordinary play, and each check is paired with the fault deliberately put back - because
// an assertion that passes whether or not the fix is present is not a gate.
// ============================================================================================

// The two clocks, as they stood in the owner's own save. `masterTimeSec` had never been advanced past
// the arrival, because only one control in Settings ever writes it.
const ACTUAL_STUCK = ARRIVAL - 30 * 86400000;   // where the campaign checkpoint was left
const MID_FLIGHT = ARRIVAL - 60 * 86400000;     // still under way, on any clock

describe('the heal is judged on the clock everyone is looking at', () => {
  it('fires at a DISPLAY time past the arrival', () => {
    const s = sys();
    const roci = s.nodes.find((n: any) => n.id === 'sol-rocinante');
    expect(reconcileConstructArrival(s, roci, AFTER).parentId).toBe('solar-system-earth');
  });

  it('...and REINSTATING THE FAULT - the actual clock, stuck where Settings left it - heals nothing', () => {
    // This is the old behaviour, verbatim, and it is the whole of [[B97]]: the repair existed and
    // never ran. If this ever starts healing, the test above has stopped proving anything.
    const s = sys();
    const roci = s.nodes.find((n: any) => n.id === 'sol-rocinante');
    const notHealed = reconcileConstructArrival(s, roci, ACTUAL_STUCK);
    expect(notHealed).toBe(roci);
    expect(notHealed.parentId).toBe('solar-system-sun');
    expect(notHealed.orbit.elements.a_AU).toBe(3.05);
  });

  it('and it still refuses to re-park a ship that has not got there yet', () => {
    // The guard that keeps display time from becoming a licence to rewrite anything: mid-flight is
    // mid-flight on whichever clock you ask.
    const s = sys();
    const roci = s.nodes.find((n: any) => n.id === 'sol-rocinante');
    expect(reconcileConstructArrival(s, roci, MID_FLIGHT)).toBe(roci);
  });
});

describe('the repair counts itself, and the count is the diagnostic', () => {
  it('an untouched ship carries no counter at all', () => {
    const roci = sys().nodes.find((n: any) => n.id === 'sol-rocinante');
    expect(roci.placementHealCount).toBeUndefined();
  });

  it('one repair reads 1, and repeating it does NOT climb', () => {
    // Idempotence is what makes the number mean something. If the heal counted every tick it would
    // read in the thousands within a minute and say nothing about whether the fault is still live.
    const s = sys();
    const roci = s.nodes.find((n: any) => n.id === 'sol-rocinante');
    const once = reconcileConstructArrival(s, roci, AFTER);
    expect(once.placementHealCount).toBe(1);

    const s2 = sys();
    s2.nodes[s2.nodes.findIndex((n: any) => n.id === 'sol-rocinante')] = once;
    expect(reconcileConstructArrival(s2, once, AFTER)).toBe(once);
    expect(reconcileConstructArrival(s2, once, AFTER).placementHealCount).toBe(1);
  });

  it('and a ship BROKEN AGAIN reads 2 - which is the signal we are watching for', () => {
    // Owner: "if it happens loads of times we still have outstanding issues". This is that case in
    // miniature - something upstream put the heliocentric orbit back, and the count says so.
    const s = sys();
    const roci = s.nodes.find((n: any) => n.id === 'sol-rocinante');
    const once = reconcileConstructArrival(s, roci, AFTER);
    const rebroken = {
      ...once,
      parentId: 'solar-system-sun',
      orbit: { ...once.orbit, hostId: 'solar-system-sun', elements: { ...once.orbit.elements, a_AU: 3.05 } }
    };
    const twice = reconcileConstructArrival(s, rebroken as any, AFTER);
    expect(twice.placementHealCount).toBe(2);
  });
});

describe('a healed ship is not left pinned by the vector that outranks its orbit', () => {
  it('the heal drops the stamped vector, and the ship MOVES for a player holding only the node', () => {
    const s = sys();
    const roci = s.nodes.find((n: any) => n.id === 'sol-rocinante');
    const healed: any = reconcileConstructArrival(s, roci, AFTER);
    expect(healed.vector_position_au).toBeUndefined();
    expect(healed.vector_epoch_ms).toBeUndefined();

    const ps = sys();
    ps.nodes[ps.nodes.findIndex((n: any) => n.id === 'sol-rocinante')] = slim(healed);
    const p0 = computeWorldPositions3D(ps, AFTER)!.get('sol-rocinante')!;
    const p1 = computeWorldPositions3D(ps, AFTER + 3600_000)!.get('sol-rocinante')!;
    expect(km(p0, p1)).toBeGreaterThan(10_000);
  });

  it('...and REINSTATING THE FAULT - the vector left behind - freezes it solid again', () => {
    // The visible half of [[B96]], measured: `computeWorldPositions3D` prefers a stamped vector over
    // the orbit, so re-parenting alone left the ship hanging at the point it stopped. Exactly 0 km.
    const s = sys();
    const roci = s.nodes.find((n: any) => n.id === 'sol-rocinante');
    const healed: any = reconcileConstructArrival(s, roci, AFTER);
    const pinned = { ...healed, vector_position_au: roci.vector_position_au, vector_epoch_ms: roci.vector_epoch_ms };

    const ps = sys();
    ps.nodes[ps.nodes.findIndex((n: any) => n.id === 'sol-rocinante')] = slim(pinned);
    const p0 = computeWorldPositions3D(ps, AFTER)!.get('sol-rocinante')!;
    const p1 = computeWorldPositions3D(ps, AFTER + 3600_000)!.get('sol-rocinante')!;
    console.log('vector left behind, movement in an hour:', km(p0, p1).toFixed(1), 'km');
    expect(km(p0, p1)).toBe(0);
  });

  it('but a DRIFTER keeps its vector, because for a drifter the vector is the true answer', () => {
    // The guard that stops the heal from snapping an adrift ship back into an orbit it abandoned.
    const s = sys();
    const roci = s.nodes.find((n: any) => n.id === 'sol-rocinante');
    const adrift: any = reconcileConstructArrival(s, { ...roci, flight_state: 'Deep Space' } as any, AFTER);
    expect(adrift.parentId).toBe('solar-system-earth');
    expect(adrift.vector_position_au).toEqual(roci.vector_position_au);
    expect(adrift.flight_state).toBe('Deep Space');
  });
});

// ================================================================================================
// AN ORBIT CHANGE IS AN ARRIVAL TOO, AND THE HEAL WAS BLIND TO IT.
//
// Owner, 2026-08-27, from a live campaign: a high-orbit-to-low-orbit transfer completed, and the ship
// kept the HIGH orbit. His panel read "Earth: High Orbit" and his map drew no orbit line - because
// the line was still the 768,000 km one, a hundred times off the side of a view scaled to 5,000 km.
//
// THE CAUSE, one line: the heal's idempotence check asked only whether the ship was already pointing
// at the right HOST. An orbit change ends at the host it started from, so that check returned "already
// healed" and the radius, the placement and the epoch were never touched.
//
// His node, verbatim from the save - the numbers are the tell: `orbit.elements.a_AU` is EXACTLY the
// transfer's `fromRadius_au`, and `orbit.t0` is EXACTLY the end of the PREVIOUS journey, which is the
// last time the heal was allowed to write anything.
// ================================================================================================

const OC_ARRIVAL = 1942954527278.8787;     // end of the orbit-change journey
const OC_NOW = 1943118007000;              // his display time, ~45 hours later
const HIGH_A_AU = 0.005133390906332513;    // where it was: 768,000 km
const LOW_A_AU = 0.00004369338721265446;   // where the transfer put it: 6,536 km

// THE ARRIVAL GEOMETRY IS BUILT FROM THE FIXTURE'S OWN EARTH, not pasted from his save. His numbers
// are heliocentric and his Earth is not this Earth, so pasting them would put the ship a million km
// from the planet it is supposed to be orbiting and the phase check would be measuring nothing. What
// matters is the SHAPE: a path that ends on a circle of the parking radius, moving perpendicular to
// the radius - which is what `resolveDesiredArrivalRelative` aims the arrival burn at.
//
// Deliberately OUT OF THE REFERENCE PLANE. A parking orbit derived only from a radius comes out flat,
// and a flat orbit happens to agree with a flat arrival - so an in-plane fixture would let a heal
// that drops the inclination pass.
function arrivalGeometry() {
  const s0 = JSON.parse(JSON.stringify(base));
  s0.nodes = s0.nodes.filter((n: any) => n.kind !== 'construct');
  const earth = s0.nodes.find((n: any) => n.id === 'solar-system-earth');
  const host = getGlobalState(s0, earth, OC_ARRIVAL);
  const norm = (v: any) => { const m = Math.hypot(v.x, v.y, v.z); return { x: v.x / m, y: v.y / m, z: v.z / m }; };
  const u = norm({ x: 0.3, y: -0.9, z: 0.32 });          // arrival bearing, tilted out of the plane
  const w = norm({ x: 0.9, y: 0.3, z: 0.0 });            // direction of travel; made perpendicular below
  const radial = w.x * u.x + w.y * u.y + w.z * u.z;
  const wPerp = norm({ x: w.x - u.x * radial, y: w.y - u.y * radial, z: w.z - u.z * radial });
  const muEarth = 398589196000000;
  const aM = LOW_A_AU * AU_KM * 1000;
  const nRad = Math.sqrt(muEarth / (aM * aM * aM));
  const vTanAuSec = nRad * LOW_A_AU;                     // tangential speed, AU/s
  return {
    r: { x: host.r.x + LOW_A_AU * u.x, y: host.r.y + LOW_A_AU * u.y, z: (host.r.z ?? 0) + LOW_A_AU * u.z },
    v: { x: host.v.x + vTanAuSec * wPerp.x, y: host.v.y + vTanAuSec * wPerp.y, z: (host.v.z ?? 0) + vTanAuSec * wPerp.z }
  };
}

/** The owner's Rocinante after two journeys: Sol -> Earth (high orbit), then high -> low. */
function rociAfterOrbitChange(): any {
  const arr = arrivalGeometry();
  const leg = (id: string, type: string, t0: number, t1: number, extra: any = {}) => ({
    id, type, startTime: t0, endTime: t1,
    startState: { r: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0 } },
    endState: { r: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0 } },
    hostId: 'solar-system-earth',
    pathPoints: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }],
    pathTimes: [t0, t1], warnings: [], fuelUsed_kg: 0, ...extra
  });
  /** The circularisation burn: the only leg whose end geometry the heal reads. */
  const arrivalLeg = (id: string, t0: number, t1: number) => leg(id, 'Brake', t0, t1, {
    startState: { r: arr.r, v: arr.v },
    endState: { r: arr.r, v: arr.v },
    pathPoints: [arr.r, arr.r],
    pathTimes: [t0, t1]
  });
  return {
    kind: 'construct', roleHint: 'ship', id: 'sol-rocinante', parentId: 'solar-system-earth',
    name: 'Rocinante', tags: [],
    placement: 'High Orbit',
    flight_state: 'Orbiting',
    placementHealCount: 1,
    // HIS REAL MASS, AND IT IS LOAD-BEARING. `computeWorldPositions3D` treats a MASSLESS construct
    // as stationary and propagates it at its epoch forever - so a fixture that leaves this out has a
    // ship that never moves, and every phase check passes for the wrong reason.
    physical_parameters: { massKg: 250000 },                       // the FIRST journey healed it, correctly, to 'ho'
    orbit: {
      hostId: 'solar-system-earth', hostMu: 398589196000000,
      t0: 1788246714318.8115,                    // = the end of journey ONE, not journey two
      elements: { a_AU: HIGH_A_AU, e: 0, i_deg: 0, omega_deg: 24.9, Omega_deg: 83.2, M0_rad: 0.3157 },
      n_rad_per_s: 9.381410461193532e-7
    },
    vector_position_au: { x: -0.6368037981005495, y: 0.7843740243257308 },
    vector_velocity_ms: { x: -21466.379073151118, y: -10648.149487147086 },
    vector_epoch_ms: OC_NOW,
    scheduled_journeys: [
      {
        id: 'j1', createdAtSec: '2798649795', status: 'completed',
        plans: [{
          id: 'p1', originId: 'sol-rocinante', targetId: 'solar-system-earth',
          startTime: 1767250575000, mode: 'Economy', arrivalPlacement: 'ho',
          // `getJourneyBounds` derives the end from `totalTime_days`, NOT from the last segment - so
          // both are his real figures, and 1767250575000 + 243.01087174550347 d lands exactly on the
          // `orbit.t0` in his save. That is the proof this journey is what last wrote his record.
          totalTime_days: 243.01087174550347,
          interceptSpeed_ms: 0, isValid: true,
          segments: [leg('a', 'Accel', 1767250575000, 1767252128116),
                     arrivalLeg('b', 1788243587754, 1788246714318.8115)]
        }]
      },
      {
        id: 'j2', createdAtSec: '1941755031', status: 'completed',
        plans: [{
          id: 'p2', originId: 'sol-rocinante', targetId: 'solar-system-earth',
          startTime: 1941755031000, mode: 'Economy', arrivalPlacement: 'lo',
          totalTime_days: 13.883058783318344,   // lands exactly on OC_ARRIVAL
          interceptSpeed_ms: 0, isValid: true,
          tags: ['ORBIT CHANGE', 'LOWERING ORBIT', 'HOHMANN'], name: 'Lower Orbit',
          orbitChange: {
            hostId: 'solar-system-earth', fromRadius_au: HIGH_A_AU, toRadius_au: LOW_A_AU,
            u: { x: -0.9383587441416655, y: 0.34566293884776866, z: 0 },
            w: { x: 0.34566293884776866, y: 0.9383587441416655, z: 0 },
            burn1Time: 1941755031000, burn2Time: 1942954202317.7559
          },
          segments: [leg('c', 'Accel', 1941755031000, 1941755094898),
                     leg('d', 'Coast', 1941755094898, 1942954202317.7559),
                     arrivalLeg('e', 1942954202317.7559, OC_ARRIVAL)]
        }]
      }
    ]
  };
}

function sysWith(node: any) {
  const s = JSON.parse(JSON.stringify(base));
  s.nodes = s.nodes.filter((n: any) => n.kind !== 'construct');
  s.nodes.push(node);
  return s;
}

describe('a transfer that ends at the SAME host still has to land', () => {
  it('the fixture really does end when his save says it does', () => {
    // Guard on the fixture itself. `getJourneyBounds` reads `totalTime_days`, so a plan without one
    // has an end of NaN and is silently never the latest arrival - which is how this spec first went
    // green against the WRONG journey.
    const node = rociAfterOrbitChange();
    const [j1, j2] = node.scheduled_journeys;
    expect(getJourneyBounds(j1.plans)!.endMs).toBeCloseTo(1788246714318.8115, 0);
    expect(getJourneyBounds(j2.plans)!.endMs).toBeCloseTo(OC_ARRIVAL, 0);
    // ...and the first journey's end is EXACTLY the epoch stored on his orbit, which is how we know
    // that record was last written by journey one and never touched by journey two.
    expect(node.orbit.t0).toBeCloseTo(getJourneyBounds(j1.plans)!.endMs, 0);
  });

  it('the high-to-low transfer moves the stored orbit down to where the ship actually is', () => {
    const node = rociAfterOrbitChange();
    const s = sysWith(node);
    const healed: any = reconcileConstructArrival(s, node, OC_NOW);

    const kmOf = (a: number) => (a * AU_KM).toFixed(0);
    console.log('stored before :', kmOf(node.orbit.elements.a_AU), 'km  placement:', node.placement);
    console.log('transfer says :', kmOf(LOW_A_AU), 'km  arrivalPlacement: lo');
    console.log('stored after  :', kmOf(healed.orbit.elements.a_AU), 'km  placement:', healed.placement);

    expect(healed).not.toBe(node);
    expect(healed.orbit.elements.a_AU).toBeCloseTo(LOW_A_AU, 12);
    expect(healed.placement).toBe('Low Orbit');
    // The epoch moves to THIS arrival, so the ship's phase is measured from where it actually parked.
    expect(healed.orbit.t0).toBe(OC_ARRIVAL);
    // And the counter says it needed a second repair, which is exactly the diagnostic asked for.
    expect(healed.placementHealCount).toBe(2);
  });

  it('...and the orbit LINE is then drawn at the radius the ship is at, not a hundred times out', () => {
    // Why the map showed no line: the stored orbit was 768,000 km while the view was scaled to 5,000
    // km, so the line was off the side of the screen. This is that ratio, measured.
    const node = rociAfterOrbitChange();
    const before = node.orbit.elements.a_AU / LOW_A_AU;
    const healed: any = reconcileConstructArrival(sysWith(node), node, OC_NOW);
    const after = healed.orbit.elements.a_AU / LOW_A_AU;
    console.log('stored orbit / true orbit  before:', before.toFixed(1) + 'x', ' after:', after.toFixed(3) + 'x');
    expect(before).toBeGreaterThan(100);
    expect(after).toBeCloseTo(1, 6);
  });

  it('and the stamped vector goes, so a player is not left holding a frozen point', () => {
    const node = rociAfterOrbitChange();
    const healed: any = reconcileConstructArrival(sysWith(node), node, OC_NOW);
    expect(healed.vector_position_au).toBeUndefined();
    expect(healed.vector_epoch_ms).toBeUndefined();
  });

  it('healing twice changes nothing the second time', () => {
    const node = rociAfterOrbitChange();
    const once: any = reconcileConstructArrival(sysWith(node), node, OC_NOW);
    const twice = reconcileConstructArrival(sysWith(once), once, OC_NOW);
    expect(twice).toBe(once);
    expect(twice.placementHealCount).toBe(2);
  });

  it('mid-transfer the NEW orbit is not applied early - the ship has not got there yet', () => {
    const node = rociAfterOrbitChange();
    const midway = 1942000000000;   // after the first burn, before the circularisation
    const r: any = reconcileConstructArrival(sysWith(node), node, midway);
    // Still the high orbit it set out from, to within the parking radius the previous arrival derives.
    expect(r.orbit.elements.a_AU).toBeCloseTo(HIGH_A_AU, 9);
    expect(r.orbit.elements.a_AU).not.toBeCloseTo(LOW_A_AU, 9);
    expect(r.placement).toBe('High Orbit');
  });

  it('A GM WHO PLACED THE SHIP BY HAND SINCE outranks a journey that finished before they did', () => {
    // The guard that keeps "heal on sight" from becoming "overwrite on sight". An orbit whose epoch is
    // LATER than the arrival was written after it, by someone who knew what they wanted; a finished
    // journey does not get to undo that. Without this the heal would fight a GM edit every tick and
    // send placementHealCount climbing, which is meant to mean something quite different.
    const node = rociAfterOrbitChange();
    const handPlaced = {
      ...node,
      orbit: { ...node.orbit, t0: OC_ARRIVAL + 86400000, elements: { ...node.orbit.elements, a_AU: 0.002 } }
    };
    const r: any = reconcileConstructArrival(sysWith(handPlaced), handPlaced as any, OC_NOW + 200 * 86400000);
    expect(r).toBe(handPlaced);
    expect(r.orbit.elements.a_AU).toBe(0.002);
  });
});

// ================================================================================================
// THE STORED ORBIT MUST REPRODUCE THE SAMPLER, NOT MERELY AGREE ABOUT THE CIRCLE.
//
// The GM draws a parked ship from `samplePostJourneyState`, which builds the parking circle on axes
// taken from the arrival itself. A player has only the elements on the node. Storing a RADIUS without
// a PHASE gives the right circle and the wrong point on it - up to a DIAMETER apart, which for a
// 6,536 km orbit is 13,000 km. It stayed hidden while a stamped vector overrode the orbit on both
// sides, and would have appeared the instant that vector was dropped.
//
// This measures the gap directly, and the fault is reinstated below by discarding the phase.
// ================================================================================================

describe('a healed ship sits where the sampler says it sits, and keeps sitting there', () => {
  const posOf = (sys: any, id: string, t: number) => computeWorldPositions3D(sys, t)!.get(id)!;

  it('the orbit the player reads reproduces the GM sampler at the arrival instant', () => {
    const node = rociAfterOrbitChange();
    const healed: any = reconcileConstructArrival(sysWith(node), node, OC_NOW);
    const s = sysWith(healed);

    const gm = sampleJourneyKinematicsAtTime(s, healed, OC_ARRIVAL)!;
    const player = posOf(s, 'sol-rocinante', OC_ARRIVAL);
    const gap = km(gm.position_au, player);
    console.log('at arrival    - GM vs player:', gap.toFixed(1), 'km  (orbit radius 6,536 km)');
    expect(gap).toBeLessThan(1);
  });

  it('...and an hour later, and a day later, and a year later', () => {
    // The phase is only right at t0 if the RATE is right too. A drift here is a mean-motion error,
    // which a single-instant check cannot see.
    const node = rociAfterOrbitChange();
    const healed: any = reconcileConstructArrival(sysWith(node), node, OC_NOW);
    const s = sysWith(healed);
    for (const [label, dt] of [['+1 h', 3600_000], ['+1 d', 86400_000], ['+1 yr', 365 * 86400_000]] as const) {
      const t = OC_ARRIVAL + dt;
      const gap = km(sampleJourneyKinematicsAtTime(s, healed, t)!.position_au, posOf(s, 'sol-rocinante', t));
      console.log(`at ${label.padEnd(6)} - GM vs player: ${gap.toFixed(1)} km`);
      expect(gap).toBeLessThan(1);
    }
  });

  it('REINSTATING THE FAULT: keeping the authored phase puts it on the far side of its own orbit', () => {
    // What the heal used to store - the new radius, the OLD M0/i/Omega. The ship is in the right
    // orbit and in the wrong place in it, which is the shape [[B92]] taught us to measure.
    const node = rociAfterOrbitChange();
    const healed: any = reconcileConstructArrival(sysWith(node), node, OC_NOW);
    const stale = {
      ...healed,
      orbit: {
        ...healed.orbit,
        elements: {
          ...healed.orbit.elements,
          M0_rad: node.orbit.elements.M0_rad,
          i_deg: node.orbit.elements.i_deg,
          Omega_deg: node.orbit.elements.Omega_deg,
          omega_deg: node.orbit.elements.omega_deg
        }
      }
    };
    const s = sysWith(stale);
    const gap = km(sampleJourneyKinematicsAtTime(s, stale as any, OC_ARRIVAL)!.position_au, posOf(s, 'sol-rocinante', OC_ARRIVAL));
    console.log('authored phase kept - GM vs player:', gap.toFixed(0), 'km');
    expect(gap).toBeGreaterThan(1000);
  });

  it('and the ship still orbits at the radius it was left at', () => {
    // The guard against "fixed the phase, lost the orbit": it must still be a 6,536 km circle round
    // Earth at every moment, not merely at the one we phased it to.
    const node = rociAfterOrbitChange();
    const healed: any = reconcileConstructArrival(sysWith(node), node, OC_NOW);
    const s = sysWith(healed);
    for (const dt of [0, 3600_000, 86400_000, 365 * 86400_000]) {
      const t = OC_ARRIVAL + dt;
      const r = km(posOf(s, 'sol-rocinante', t), posOf(s, 'solar-system-earth', t));
      expect(r).toBeGreaterThan(6400);
      expect(r).toBeLessThan(6700);
    }
  });
});

// ================================================================================================
// A PARKED SHIP MUST STOP REWRITING ITSELF.
//
// The sampler answers forever - past the last arrival it returns a LIVE PARKING ORBIT, which moves.
// The GM tick stamped that onto the node, so every ship that had ever arrived anywhere rewrote its
// own record several times a second for the rest of the campaign. A changed node is a changed
// broadcast snapshot, and a player's 3D scene rebuilds on every one: `setSystem` bumps `buildGen`,
// which discards any ship-model load still in flight and re-frames the camera.
//
// That is ONE cause behind three things the owner reported: the ship's model never appeared on the
// player view, the camera reset itself every few seconds while following a ship, and the ship sat at
// a GM instant instead of orbiting on the player's own clock.
//
// This pins the tick as a FIXED POINT: run it repeatedly and after the first pass nothing changes.
// ================================================================================================

/** The GM tick's treatment of one construct, in the order SystemView runs it. */
function tick(sys: any, node: any, timeMs: number): any {
  let next = node;
  const sampled = sampleJourneyKinematicsAtTime(sys, next, timeMs);
  if (sampled && needsStampedPosition(sampled.state)) {
    next = {
      ...next,
      vector_position_au: { x: sampled.position_au.x, y: sampled.position_au.y },
      vector_velocity_ms: { x: sampled.velocity_ms.x, y: sampled.velocity_ms.y },
      vector_epoch_ms: timeMs,
      flight_state: sampled.state
    };
  } else if (sampled) {
    if (next.vector_position_au || next.vector_epoch_ms !== undefined || next.flight_state !== sampled.state) {
      next = { ...next, vector_position_au: undefined, vector_epoch_ms: undefined, flight_state: sampled.state };
    }
  }
  return reconcileConstructArrival(sys, next, timeMs);
}

describe('the tick settles, and a settled ship is the whole reason the player view can hold still', () => {
  it('a parked ship is rewritten ONCE and then left alone, however long the clock runs', () => {
    const node = rociAfterOrbitChange();
    const s = sysWith(node);

    // First pass: the repair. After that, ticking at a new time every 150 ms - the real throttle -
    // must change nothing at all, even though the ship is moving the whole while.
    const settled = tick(s, node, OC_NOW);
    expect(settled).not.toBe(node);

    const s2 = sysWith(settled);
    let cur = settled;
    let rewrites = 0;
    for (let i = 1; i <= 200; i++) {
      const next = tick(s2, cur, OC_NOW + i * 150);
      if (next !== cur) rewrites++;
      cur = next;
    }
    console.log('rewrites over 200 ticks (30 s of wall clock):', rewrites);
    expect(rewrites).toBe(0);
    // ...and it is still the healed ship, not a frozen one.
    expect(cur.vector_position_au).toBeUndefined();
    expect(cur.placementHealCount).toBe(2);
  });

  it('REINSTATING THE FAULT: stamping a parked ship rewrites the node on EVERY tick, forever', () => {
    // The old rule - "the sampler answered, so stamp it". This is the churn, counted.
    const alwaysStamp = (sys: any, node: any, timeMs: number) => {
      const sampled = sampleJourneyKinematicsAtTime(sys, node, timeMs);
      if (!sampled) return node;
      return { ...node, vector_position_au: { x: sampled.position_au.x, y: sampled.position_au.y }, vector_epoch_ms: timeMs };
    };
    const node = rociAfterOrbitChange();
    const s = sysWith(node);
    let cur: any = node;
    let rewrites = 0;
    for (let i = 1; i <= 200; i++) {
      const next = alwaysStamp(s, cur, OC_NOW + i * 150);
      if (next.vector_position_au.x !== cur.vector_position_au?.x) rewrites++;
      cur = next;
    }
    console.log('rewrites with the old rule, same 200 ticks:', rewrites);
    expect(rewrites).toBe(200);
  });

  it('a ship IN TRANSIT still gets its stamped position - that is what the stamp is for', () => {
    const node = rociAfterOrbitChange();
    const midway = 1942000000000;
    const sampled = sampleJourneyKinematicsAtTime(sysWith(node), node, midway)!;
    expect(sampled.state).toBe('Transit');
    expect(needsStampedPosition(sampled.state)).toBe(true);
  });

  it('and the states are named, not guessed', () => {
    expect(needsStampedPosition('Transit')).toBe(true);
    expect(needsStampedPosition('Deep Space')).toBe(true);
    expect(needsStampedPosition('Orbiting')).toBe(false);
    expect(needsStampedPosition('Landed')).toBe(false);
    expect(needsStampedPosition('Docked')).toBe(false);
    expect(needsStampedPosition(null)).toBe(false);
  });
});

// ================================================================================================
// A ROUTE OUTLIVES THE JOURNEY THAT MADE IT, AND THE ORBIT LINE PAID FOR IT.
//
// Owner, 2026-08-27: *"Roci is parked in low orbit but does not have an orbital line."* The scene
// omitted a construct's orbit ring for any ship that HAD a route - decided once, when the scene was
// built. But `routeOf` packs the path whether or not the ship is still on it, so a ship that had
// finished a course drew no orbit for the rest of the campaign.
//
// The ring is now built whenever there is an orbit, and hidden per FRAME only while the ship is
// genuinely under way - which is precisely the question `routeStateAt` already answers. This pins
// that question, because it is the whole of the rule the scene now asks.
// ================================================================================================

describe('a route says WHEN it is being flown, not merely that it exists', () => {
  it('the completed orbit change still yields a route - which is why the old test was fooled', () => {
    const node = rociAfterOrbitChange();
    const route = routeOf(node);
    expect(route).not.toBeNull();
    console.log('route window:', new Date(route!.s).toISOString(), '->', new Date(route!.e).toISOString());
  });

  it('...but the ship is NOT on it once the journey has ended', () => {
    // The fault, stated: "has a route" was read as "is flying", and it is not.
    const node = rociAfterOrbitChange();
    const route = routeOf(node)!;
    expect(routeStateAt(route, OC_NOW)).toBeNull();
    expect(routeStateAt(route, route.e + 1)).toBeNull();
  });

  it('and IS on it while the journey is under way, so the orbit line still stands down then', () => {
    // The other half: the suppression must survive. A ship in transit is not on its stored orbit and
    // must not draw one, which is what the build-time rule got right.
    const node = rociAfterOrbitChange();
    const route = routeOf(node)!;
    const midway = (route.s + route.e) / 2;
    expect(routeStateAt(route, midway)).not.toBeNull();
  });

  it('a ship that has not departed yet is also not on its route', () => {
    const node = rociAfterOrbitChange();
    const route = routeOf(node)!;
    expect(routeStateAt(route, route.s - 1)).toBeNull();
  });
});
