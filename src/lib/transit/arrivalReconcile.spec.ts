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
import { reconcileConstructArrival, resolveConstructCurrentHostId } from './scheduler';
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
